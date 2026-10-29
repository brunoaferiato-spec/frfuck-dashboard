import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RotateCcw, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import ComprasPecasCotacao from "@/components/ComprasPecasCotacao";
import { trpc } from "@/lib/trpc";
import { combinarVendasSistemaAntigo, transicaoSistemaAtiva } from "@/lib/comprasTransicaoSistema";

// Compra de amortecedores: mesmo relatório e mesma conta de peças
// (venda ÷ dias analisados × dias projetados − estoque; abaixo de 0,75 sai; 1 peça sem lado completa o par).
// A aplicação (carros) vem da base lida do Impacto Prime e vai junto na cotação e no pedido.

type LinhaBruta = Record<string, unknown>;

type ItemAmortecedor = {
  id: string;
  codigo: string;
  item: string;
  grupo: string;
  vendaPeriodo: number;
  estoqueAtual: number;
  necessidadeBruta: number;
  quantidadeCompra: number;
  ladoIndividual: "LD" | "LE" | null;
  especificacao: string | null;
};

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function numeroBR(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const limpo = String(valor ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

function separarCSV(texto: string) {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || "";
  const separador = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];
    if (char === '"') {
      if (aspas && texto[i + 1] === '"') { campo += '"'; i += 1; } else aspas = !aspas;
      continue;
    }
    if (!aspas && char === separador) { linha.push(campo); campo = ""; continue; }
    if (!aspas && (char === "\n" || char === "\r")) {
      if (char === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo); campo = "";
      if (linha.some((v) => v.trim() !== "")) linhas.push(linha);
      linha = [];
      continue;
    }
    campo += char;
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); if (linha.some((v) => v.trim() !== "")) linhas.push(linha); }
  if (linhas.length < 2) return [];
  const cabecalhos = linhas[0].map((v) => v.replace(/^﻿/, "").trim());
  return linhas.slice(1).map((valores) => {
    const objeto: LinhaBruta = {};
    cabecalhos.forEach((c, i) => { objeto[c] = valores[i] ?? ""; });
    return objeto;
  });
}

function buscarCampo(linha: LinhaBruta, nomes: string[]) {
  const chave = (v: unknown) => normalizarTexto(v).replace(/[^A-Z0-9]+/g, " ").trim();
  const mapa = new Map(Object.keys(linha).map((k) => [chave(k), k]));
  for (const nome of nomes) { const real = mapa.get(chave(nome)); if (real) return linha[real]; }
  return "";
}

// Só amortecedor: coxim, suporte, batente e kit ficam de fora (são comprados em Peças).
function ehAmortecedor(itemOriginal: string) {
  const item = normalizarTexto(itemOriginal);
  return /AMOR(T|C)/.test(item) && !/COXIM|COXINM|SUPORTE|BATENTE|\bKIT\b|BUCHA|COIFA/.test(item);
}

function detectarLado(itemOriginal: string) {
  const item = normalizarTexto(itemOriginal).replace(/LD\s*\/\s*LE/g, "LD LE").replace(/LE\s*\/\s*LD/g, "LE LD");
  const temLD = /\bLD\b/.test(item);
  const temLE = /\bLE\b/.test(item);
  if (temLD && temLE) return null;
  return temLD ? ("LD" as const) : temLE ? ("LE" as const) : null;
}

// Mesmo arredondamento de peças: inteiro mais próximo; 1 amortecedor sem lado completa o par no estoque.
function arredondarCompra(necessidadeBruta: number, ladoIndividual: "LD" | "LE" | null, estoqueAtual: number) {
  if (necessidadeBruta <= 0) return 0;
  const inteiro = Math.max(1, Math.round(necessidadeBruta));
  if (inteiro === 1 && !ladoIndividual) {
    const estoque = Math.max(0, Math.round(Number(estoqueAtual) || 0));
    return (estoque + 1) % 2 === 0 ? 1 : 2;
  }
  return inteiro;
}

function numero(valor: number) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

async function lerLinhasArquivo(file: File) {
  let linhas: LinhaBruta[] = [];
  if (file.name.toLowerCase().endsWith(".csv")) {
    linhas = separarCSV(await file.text());
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
    linhas = XLSX.utils.sheet_to_json<LinhaBruta>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
  }
  if (!linhas.length) throw new Error("O relatório está vazio ou não pôde ser lido.");
  return linhas;
}

export default function ComprasAmortecedores() {
  const [arquivoNome, setArquivoNome] = useState("");
  // Gravataí até 19/12: relatório do sistema antigo só para somar a venda do período.
  const [lojaCotacao, setLojaCotacao] = useState("1");
  const [relatorioAntigo, setRelatorioAntigo] = useState<{ nome: string; linhas: LinhaBruta[] } | null>(null);
  const [ultimoArquivoNovo, setUltimoArquivoNovo] = useState<File | null>(null);
  const [avisoTransicao, setAvisoTransicao] = useState("");
  const transicaoSistema = transicaoSistemaAtiva(lojaCotacao);
  const [diasAnalise, setDiasAnalise] = useState("120");
  const [diasProjecao, setDiasProjecao] = useState("30");
  const [diasDoRelatorio, setDiasDoRelatorio] = useState(120);
  const [abaixoDoMinimo, setAbaixoDoMinimo] = useState(0);
  const [itens, setItens] = useState<ItemAmortecedor[]>([]);
  const [excluidos, setExcluidos] = useState<ItemAmortecedor[]>([]);
  const [erro, setErro] = useState("");
  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);
  const buscarAplicacoes = trpc.compras.amortecedores.buscarAplicacoes.useMutation();

  async function importarAntigo(file: File | null) {
    if (!file) return;
    setErro("");
    try {
      const antigo = { nome: file.name, linhas: await lerLinhasArquivo(file) };
      setRelatorioAntigo(antigo);
      if (ultimoArquivoNovo) await importarArquivo(ultimoArquivoNovo, antigo);
    } catch (error: any) {
      setRelatorioAntigo(null);
      setErro(error?.message || "Não foi possível ler o relatório do sistema antigo.");
    }
  }

  async function importarArquivo(file: File | null, antigo: { nome: string; linhas: LinhaBruta[] } | null = relatorioAntigo) {
    if (!file) return;
    setErro("");
    try {
      let linhas = await lerLinhasArquivo(file);

      let aviso = "";
      if (antigo && transicaoSistema) {
        const combinado = combinarVendasSistemaAntigo(linhas, antigo.linhas);
        linhas = combinado.linhas;
        aviso =
          `${combinado.vendasSomadas.toLocaleString("pt-BR")} vendas do sistema antigo somadas.` +
          (combinado.soNoAntigo.length
            ? ` ${combinado.soNoAntigo.length} código(s) só tinham venda no sistema antigo e entram com estoque 0: ${combinado.soNoAntigo.slice(0, 15).join(", ")}${combinado.soNoAntigo.length > 15 ? "…" : ""}. Confira se não mudaram de código.`
            : "");
      }

      const dias = Math.max(1, Number(diasAnalise) || 120);
      const projecao = Math.max(1, Number(diasProjecao) || 30);
      const encontrados: ItemAmortecedor[] = [];
      let descartadosAbaixo = 0;

      linhas.forEach((linha, indice) => {
        const codigo = String(buscarCampo(linha, ["CÓDIGO", "CODIGO", "COD"])).trim();
        const item = String(buscarCampo(linha, ["ITEM", "DESCRIÇÃO", "DESCRICAO"])).trim();
        if (!codigo || !item || !ehAmortecedor(item)) return;
        const vendaPeriodo = numeroBR(buscarCampo(linha, ["VENDA PERIODO", "VENDA PERÍODO"]));
        const estoqueAtual = numeroBR(buscarCampo(linha, ["ESTOQUE ATUAL", "ESTOQUE"]));
        const ladoIndividual = detectarLado(item);
        const necessidadeBruta = Number(((vendaPeriodo / dias) * projecao - estoqueAtual).toFixed(2));
        if (necessidadeBruta < 0.75) { descartadosAbaixo += 1; return; }
        encontrados.push({
          id: `${codigo}-${indice}`,
          codigo,
          item,
          grupo: "Amortecedor",
          vendaPeriodo,
          estoqueAtual,
          necessidadeBruta,
          quantidadeCompra: arredondarCompra(necessidadeBruta, ladoIndividual, estoqueAtual),
          ladoIndividual,
          especificacao: null,
        });
      });

      // Aplicação de cada código (base do Impacto Prime, igual para todas as lojas).
      const aplicacoes = encontrados.length
        ? await buscarAplicacoes.mutateAsync({ codigos: encontrados.map((x) => x.codigo) })
        : [];
      const porCodigo = new Map(aplicacoes.map((a) => [normalizarTexto(a.codigo), a.aplicacao]));

      setArquivoNome(antigo && transicaoSistema ? `${file.name} + antigo ${antigo.nome}` : file.name);
      setUltimoArquivoNovo(file);
      setAvisoTransicao(aviso);
      setAbaixoDoMinimo(descartadosAbaixo);
      setDiasDoRelatorio(dias);
      setItens(encontrados.map((x) => ({ ...x, especificacao: porCodigo.get(normalizarTexto(x.codigo)) || null })));
      setExcluidos([]);
    } catch (error: any) {
      setArquivoNome("");
      setItens([]);
      setExcluidos([]);
      setErro(error?.message || "Não foi possível ler o relatório.");
    }
  }

  // Troca de cidade na cotação: o relatório importado era da cidade anterior e sai da tela.
  function limparRelatorio() {
    setArquivoNome("");
    setRelatorioAntigo(null);
    setUltimoArquivoNovo(null);
    setAvisoTransicao("");
    setItens([]);
    setExcluidos([]);
    setAbaixoDoMinimo(0);
    setErro("");
  }

  const itensVisiveis = useMemo(() => (mostrarSemCompra ? itens : itens.filter((x) => x.quantidadeCompra > 0)), [itens, mostrarSemCompra]);

  const resumo = useMemo(() => {
    const comCompra = itens.filter((x) => x.quantidadeCompra > 0);
    return {
      total: itens.length,
      comCompra: comCompra.length,
      unidades: comCompra.reduce((t, x) => t + x.quantidadeCompra, 0),
      semAplicacao: itens.filter((x) => !x.especificacao).length,
    };
  }, [itens]);

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">COMPRAS • AMORTECEDORES</p>
          <h1 className="mt-2 text-3xl font-black">Planejamento de amortecedores</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-500">
            Relatório dos últimos {Number(diasAnalise) || 120} dias → compra projetada para {Number(diasProjecao) || 30} dias.
            Regra: venda do período ÷ {Number(diasAnalise) || 120} × {Number(diasProjecao) || 30} − estoque atual. Necessidade abaixo de 0,75 sai da relação.
            A aplicação de cada código aparece na tela, na cotação e no pedido.
          </p>

          <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">Dias analisados (relatório)</span>
              <input value={diasAnalise} inputMode="numeric" onChange={(e) => setDiasAnalise(e.target.value.replace(/[^0-9]/g, ""))} className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none focus:border-[#D4AF37]/50" />
              <span className="mt-1 block text-[10px] text-gray-600">Normalmente 120 dias.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">Dias para projetar (compra)</span>
              <input value={diasProjecao} inputMode="numeric" onChange={(e) => setDiasProjecao(e.target.value.replace(/[^0-9]/g, ""))} className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white outline-none focus:border-[#D4AF37]/50" />
              <span className="mt-1 block text-[10px] text-gray-600">Normalmente 30 dias. Ajuste antes de importar o relatório.</span>
            </label>
          </div>

          <div className={`mt-6 grid gap-4 ${transicaoSistema ? "lg:grid-cols-2" : ""}`}>
            {transicaoSistema && (
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sky-400/25 bg-sky-400/[0.03] px-4 text-center hover:border-sky-400/45">
                <FileSpreadsheet className="h-7 w-7 text-sky-300" />
                <span className="mt-3 font-black text-sky-300">{relatorioAntigo ? relatorioAntigo.nome : "Vendas do sistema antigo (Gravataí)"}</span>
                <span className="mt-1 text-xs text-gray-600">Mesmo relatório, mesmos dias, tirado do sistema antigo. Só a Venda Período é usada (somada à do novo). Até 19/12.</span>
                {relatorioAntigo && (
                  <button
                    type="button"
                    onClick={(event) => { event.preventDefault(); setRelatorioAntigo(null); if (ultimoArquivoNovo) void importarArquivo(ultimoArquivoNovo, null); }}
                    className="mt-2 text-[11px] font-bold text-gray-400 underline hover:text-white"
                  >
                    Remover
                  </button>
                )}
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { void importarAntigo(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
              </label>
            )}
            <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/25 bg-[#D4AF37]/[0.025] px-4 text-center hover:border-[#D4AF37]/45">
              <Upload className="h-7 w-7 text-[#F2D675]" />
              <span className="mt-3 font-black text-[#F2D675]">{buscarAplicacoes.isPending ? "Buscando aplicações..." : transicaoSistema ? "Relatório do sistema novo (.csv ou .xlsx)" : "Selecionar relatório .csv ou .xlsx"}</span>
              <span className="mt-1 text-xs text-gray-600">Mesmo relatório de compra de peças: Código, Item, Venda Período e Estoque Atual</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { void importarArquivo(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
            </label>
          </div>

          {avisoTransicao && (
            <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-3 text-xs font-bold text-sky-200">{avisoTransicao}</div>
          )}

          {arquivoNome && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {arquivoNome}
              {abaixoDoMinimo > 0 && <span className="font-bold text-gray-500">• {abaixoDoMinimo} item(ns) com necessidade abaixo de 0,75 tirados da relação</span>}
            </div>
          )}

          {erro && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}
        </section>

        <ComprasPecasCotacao tipo="amortecedores" arquivoNome={arquivoNome} itens={itens} onTrocarCidade={limparRelatorio} onLojaChange={setLojaCotacao} />

        {arquivoNome && (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Amortecedores analisados", resumo.total],
                ["Com compra", resumo.comCompra],
                ["Unidades sugeridas", resumo.unidades],
                ["Sem aplicação cadastrada", resumo.semAplicacao],
              ].map(([label, valor]) => (
                <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">{label}</p>
                  <p className="mt-2 text-2xl font-black text-white">{valor}</p>
                </div>
              ))}
            </section>

            <section className="mt-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090909]">
              <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="font-black">Análise da compra</h2>
                  <p className="mt-1 text-xs text-gray-600">Aplicação lida do Impacto Prime em 21/10/2026 (vale para todas as lojas).</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-400">
                  <input type="checkbox" checked={mostrarSemCompra} onChange={(e) => setMostrarSemCompra(e.target.checked)} />
                  Mostrar itens sem compra
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="bg-white/[0.025] text-left text-[9px] uppercase tracking-[0.06em] text-gray-600">
                    <tr>
                      <th className="px-3 py-3">Código</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3">Aplicação</th>
                      <th className="px-3 py-3 text-right">Venda {diasDoRelatorio}d</th>
                      <th className="px-3 py-3 text-right">Estoque</th>
                      <th className="px-3 py-3 text-right">Necessidade</th>
                      <th className="px-3 py-3 text-right">Compra</th>
                      <th className="px-3 py-3">Regra</th>
                      <th className="px-3 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensVisiveis.map((item) => (
                      <tr key={item.id} className="border-t border-white/[0.05]">
                        <td className="px-3 py-3 font-black text-[#F2D675]">{item.codigo}</td>
                        <td className="px-3 py-3 font-bold text-white">{item.item}</td>
                        <td className="px-3 py-3">
                          {item.especificacao ? (
                            <p className="max-w-[430px] font-bold leading-5 text-gray-200">{item.especificacao}</p>
                          ) : (
                            <span className="inline-flex rounded-full border border-rose-400/20 bg-rose-400/[0.05] px-2 py-1 font-black text-rose-200">Sem aplicação cadastrada</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-300">{numero(item.vendaPeriodo)}</td>
                        <td className="px-3 py-3 text-right text-gray-300">{numero(item.estoqueAtual)}</td>
                        <td className="px-3 py-3 text-right font-bold text-[#F2D675]">{numero(item.necessidadeBruta)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={item.quantidadeCompra}
                            onChange={(event) => {
                              const quantidade = Math.max(0, Math.floor(Number(event.target.value || 0)));
                              setItens((atuais) => atuais.map((a) => (a.id === item.id ? { ...a, quantidadeCompra: quantidade } : a)));
                            }}
                            className="h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none"
                            title="Quantidade de compra editável"
                          />
                        </td>
                        <td className="px-3 py-3">
                          {item.ladoIndividual ? (
                            <div>
                              <span className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/[0.05] px-2 py-1 font-black text-sky-200">Lado {item.ladoIndividual}</span>
                              <p className="mt-1 text-[10px] font-bold text-sky-300/70">Conferir lado oposto</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">1 peça: completa o par no estoque</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => { setItens((a) => a.filter((x) => x.id !== item.id)); setExcluidos((a) => [...a, item]); }}
                            className="inline-flex h-9 items-center rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 font-black text-rose-300"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {excluidos.length > 0 && (
              <section className="mt-5 rounded-3xl border border-white/[0.08] bg-[#090909] p-5">
                <h2 className="font-black">Excluídos desta análise</h2>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {excluidos.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-3">
                      <div className="min-w-0">
                        <p className="font-black text-gray-300">{item.codigo}</p>
                        <p className="truncate text-xs text-gray-600">{item.especificacao || item.item}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setExcluidos((a) => a.filter((x) => x.id !== item.id)); setItens((a) => [...a, item]); }}
                        className="inline-flex h-8 shrink-0 items-center rounded-lg border border-white/10 px-2 text-[10px] font-black text-gray-300"
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="mt-8 border-t border-white/[0.05] py-5 text-center text-[11px] text-gray-700">Compras de Amortecedores</footer>
      </div>
    </main>
  );
}
