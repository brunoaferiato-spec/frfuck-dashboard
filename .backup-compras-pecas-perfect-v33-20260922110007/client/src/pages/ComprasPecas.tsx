import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import ComprasPecasCotacao from "@/components/ComprasPecasCotacao";
import { trpc } from "@/lib/trpc";

type LinhaBruta = Record<string, unknown>;

type ItemPeca = {
  id: string;
  codigo: string;
  item: string;
  grupo:
    | "Bieleta"
    | "Bucha"
    | "Coxim"
    | "Óleo / Fluido"
    | "Pastilha"
    | "Pivô"
    | "Terminal Axial"
    | "Terminal de Direção";
  vendaPeriodo: number;
  estoqueAtual: number;
  necessidadeBruta: number;
  quantidadeCompra: number;
  arredondamentoPar: boolean;
  ladoIndividual: "LD" | "LE" | null;
  especificacaoStatus: "pendente" | "confirmar_bandeja" | "confirmar_coxim";
  motivoRevisao: string | null;
  especificacao?: string | null;
  catalogoStatus?: "pendente" | "localizado" | "nao_localizado" | "erro";
  catalogoFonte?: string | null;
  catalogoUrl?: string | null;
};

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarCabecalho(valor: unknown) {
  return normalizarTexto(valor)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function numeroBR(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const texto = String(valor ?? "").trim();
  if (!texto) return 0;

  const limpo = texto
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

function separarCSV(texto: string) {
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] || "";
  const separador =
    (primeiraLinha.match(/;/g) || []).length >=
    (primeiraLinha.match(/,/g) || []).length
      ? ";"
      : ",";

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];

    if (char === '"') {
      if (aspas && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        aspas = !aspas;
      }
      continue;
    }

    if (!aspas && char === separador) {
      linha.push(campo);
      campo = "";
      continue;
    }

    if (!aspas && (char === "\n" || char === "\r")) {
      if (char === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo);
      campo = "";

      if (linha.some((valor) => valor.trim() !== "")) {
        linhas.push(linha);
      }

      linha = [];
      continue;
    }

    campo += char;
  }

  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    if (linha.some((valor) => valor.trim() !== "")) linhas.push(linha);
  }

  if (linhas.length < 2) return [];

  const cabecalhos = linhas[0].map((valor) =>
    valor.replace(/^\uFEFF/, "").trim()
  );

  return linhas.slice(1).map((valores) => {
    const objeto: LinhaBruta = {};
    for (let i = 0; i < cabecalhos.length; i += 1) {
      objeto[cabecalhos[i]] = valores[i] ?? "";
    }
    return objeto;
  });
}

function buscarCampo(linha: LinhaBruta, nomes: string[]) {
  const mapa = new Map(
    Object.keys(linha).map((chave) => [normalizarCabecalho(chave), chave])
  );

  for (const nome of nomes) {
    const real = mapa.get(normalizarCabecalho(nome));
    if (real) return linha[real];
  }

  return "";
}

function classificarGrupo(itemOriginal: string) {
  const item = normalizarTexto(itemOriginal);

  if (item.includes("PASTILHA")) {
    return {
      grupo: "Pastilha" as const,
      incluir: true,
      status: "pendente" as const,
      motivo: null,
    };
  }

  if (/\bPIVO\b/.test(item)) {
    return {
      grupo: "Pivô" as const,
      incluir: true,
      status: "pendente" as const,
      motivo: null,
    };
  }

  if (item.includes("BIELETA")) {
    return {
      grupo: "Bieleta" as const,
      incluir: true,
      status: "pendente" as const,
      motivo: null,
    };
  }

  if (
    item.includes("TERMINAL AXIAL") ||
    item.includes("AXIAL DE DIRECAO") ||
    item.includes("AXIAL DIRECAO")
  ) {
    return {
      grupo: "Terminal Axial" as const,
      incluir: true,
      status: "pendente" as const,
      motivo: null,
    };
  }

  if (item.includes("TERMINAL DE DIRECAO")) {
    return {
      grupo: "Terminal de Direção" as const,
      incluir: true,
      status: "pendente" as const,
      motivo: null,
    };
  }

  if (item.includes("BUCHA")) {
    if (item.includes("BANDEJA")) {
      return {
        grupo: "Bucha" as const,
        incluir: true,
        status: "pendente" as const,
        motivo: null,
      };
    }

    const claramenteFora =
      item.includes("BARRA ESTABILIZADORA") ||
      item.includes("DO EIXO") ||
      item.includes("CAIXA DE DIRECAO") ||
      item.includes("AMORTECEDOR");

    if (claramenteFora) {
      return {
        grupo: "Bucha" as const,
        incluir: false,
        status: "pendente" as const,
        motivo: "Bucha fora de bandeja",
      };
    }

    return {
      grupo: "Bucha" as const,
      incluir: true,
      status: "confirmar_bandeja" as const,
      motivo: "Confirmar no catálogo se é bucha de bandeja",
    };
  }

  if (item.includes("COXIM") || item.includes("COXINM")) {
    if (item.includes("AMORTECEDOR")) {
      return {
        grupo: "Coxim" as const,
        incluir: true,
        status: "pendente" as const,
        motivo: null,
      };
    }

    const claramenteFora =
      item.includes("CAMBIO") ||
      item.includes("MOTOR") ||
      item.includes("HIDRAULICO");

    if (claramenteFora) {
      return {
        grupo: "Coxim" as const,
        incluir: false,
        status: "pendente" as const,
        motivo: "Coxim fora de amortecedor",
      };
    }

    return {
      grupo: "Coxim" as const,
      incluir: true,
      status: "confirmar_coxim" as const,
      motivo: "Confirmar no catálogo se é coxim de amortecedor",
    };
  }

  if (
    item.includes("OLEO") ||
    item.includes("FLUIDO") ||
    item.includes("DOT")
  ) {
    const permitido =
      item.includes("5W30") ||
      item.includes("15W40") ||
      item.includes("DOT4") ||
      item.includes("DOT 4");

    return {
      grupo: "Óleo / Fluido" as const,
      incluir: permitido,
      status: "pendente" as const,
      motivo: permitido ? null : "Óleo/fluido fora de 5W30, 15W40 ou DOT4",
    };
  }

  return null;
}

function detectarLado(itemOriginal: string) {
  const item = normalizarTexto(itemOriginal)
    .replace(/LD\s*\/\s*LE/g, "LD LE")
    .replace(/LE\s*\/\s*LD/g, "LE LD");

  const temLD = /\bLD\b/.test(item);
  const temLE = /\bLE\b/.test(item);

  if (temLD && temLE) return null;
  if (temLD) return "LD" as const;
  if (temLE) return "LE" as const;
  return null;
}

function arredondarCompra(
  necessidadeBruta: number,
  grupo: ItemPeca["grupo"],
  ladoIndividual: "LD" | "LE" | null
) {
  if (necessidadeBruta <= 0) return 0;

  const inteiro = Math.ceil(necessidadeBruta);

  // Pastilha e peça com lado não recebem arredondamento para número par.
  if (grupo === "Pastilha" || ladoIndividual) {
    return inteiro;
  }

  // Demais peças sempre sobem para o próximo número par.
  return inteiro % 2 === 0 ? inteiro : inteiro + 1;
}

function dinheiroNumero(valor: number) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export default function ComprasPecas() {
  const [arquivoNome, setArquivoNome] = useState("");
  const [itens, setItens] = useState<ItemPeca[]>([]);
  const [excluidos, setExcluidos] = useState<ItemPeca[]>([]);
  const [erro, setErro] = useState("");
  const [mensagemCatalogo, setMensagemCatalogo] = useState("");
  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);

  const consultarPerfectMutation =
    trpc.compras.pecas.consultarCatalogoPerfect.useMutation({
      onSuccess: (data) => {
        const porCodigo = new Map(
          (data.resultados || []).map((resultado: any) => [
            normalizarTexto(resultado.codigo).replace(/\s+/g, ""),
            resultado,
          ])
        );

        setItens((atuais) =>
          atuais.map((item) => {
            const resultado = porCodigo.get(
              normalizarTexto(item.codigo).replace(/\s+/g, "")
            ) as any;

            if (!resultado) return item;

            const especificacao = [
              resultado.descricao,
              resultado.aplicacao,
            ]
              .filter(Boolean)
              .join(" • ");

            return {
              ...item,
              especificacao: especificacao || null,
              catalogoStatus: resultado.status,
              catalogoFonte: resultado.fonte || "PERFECT",
              catalogoUrl: resultado.url || null,
              ladoIndividual:
                resultado.lado === "LD" || resultado.lado === "LE"
                  ? resultado.lado
                  : item.ladoIndividual,
            };
          })
        );

        setMensagemCatalogo(
          `Perfect: ${data.localizados}/${data.total} código(s) localizado(s).`
        );
      },
      onError: (error) => {
        setErro(
          error.message ||
            "Não foi possível consultar o catálogo Perfect."
        );
      },
    });

  async function importarArquivo(file: File | null) {
    if (!file) return;

    setErro("");

    try {
      let linhas: LinhaBruta[] = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const texto = await file.text();
        linhas = separarCSV(texto);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: "array",
          cellDates: false,
          raw: false,
        });
        const primeira = workbook.SheetNames[0];
        const sheet = workbook.Sheets[primeira];
        linhas = XLSX.utils.sheet_to_json<LinhaBruta>(sheet, {
          defval: "",
          raw: false,
        });
      }

      if (!linhas.length) {
        throw new Error("O relatório está vazio ou não pôde ser lido.");
      }

      const encontrados: ItemPeca[] = [];

      for (let indice = 0; indice < linhas.length; indice += 1) {
        const linha = linhas[indice];

        const codigo = String(
          buscarCampo(linha, ["CÓDIGO", "CODIGO", "COD"])
        ).trim();

        const item = String(buscarCampo(linha, ["ITEM", "DESCRIÇÃO", "DESCRICAO"])).trim();

        const vendaPeriodo = numeroBR(
          buscarCampo(linha, ["VENDA PERIODO", "VENDA PERÍODO"])
        );

        const estoqueAtual = numeroBR(
          buscarCampo(linha, ["ESTOQUE ATUAL", "ESTOQUE"])
        );

        if (!codigo || !item) continue;

        const classificacao = classificarGrupo(item);
        if (!classificacao || !classificacao.incluir) continue;

        const ladoIndividual = detectarLado(item);

        // Regra: venda dos últimos 60 dias / 2 - estoque atual.
        const necessidadeBruta = Number(
          (vendaPeriodo / 2 - estoqueAtual).toFixed(2)
        );

        const quantidadeCompra = arredondarCompra(
          necessidadeBruta,
          classificacao.grupo,
          ladoIndividual
        );

        encontrados.push({
          id: `${codigo}-${indice}`,
          codigo,
          item,
          grupo: classificacao.grupo,
          vendaPeriodo,
          estoqueAtual,
          necessidadeBruta,
          quantidadeCompra,
          arredondamentoPar:
            classificacao.grupo !== "Pastilha" && !ladoIndividual,
          ladoIndividual,
          especificacaoStatus: classificacao.status,
          motivoRevisao: classificacao.motivo,
        });
      }

      setArquivoNome(file.name);
      setItens(encontrados);
      setExcluidos([]);
      setMensagemCatalogo("");

      const itensPerfect = encontrados.filter(
        (item) =>
          item.quantidadeCompra > 0 &&
          ["Pivô", "Terminal Axial", "Terminal de Direção"].includes(item.grupo)
      );

      if (itensPerfect.length) {
        consultarPerfectMutation.mutate({
          itens: itensPerfect.map((item) => ({
            codigo: item.codigo,
            grupo: item.grupo,
          })),
          forcar: false,
        });
      }
    } catch (error: any) {
      setArquivoNome("");
      setItens([]);
      setExcluidos([]);
      setErro(error?.message || "Não foi possível ler o relatório.");
    }
  }

  const itensVisiveis = useMemo(
    () =>
      mostrarSemCompra
        ? itens
        : itens.filter((item) => item.quantidadeCompra > 0),
    [itens, mostrarSemCompra]
  );

  const resumo = useMemo(() => {
    const comCompra = itens.filter((item) => item.quantidadeCompra > 0);
    const laterais = itens.filter((item) => item.ladoIndividual);
    const revisarCatalogo = itens.filter(
      (item) => item.especificacaoStatus !== "pendente"
    );

    return {
      total: itens.length,
      comCompra: comCompra.length,
      unidades: comCompra.reduce(
        (total, item) => total + item.quantidadeCompra,
        0
      ),
      laterais: laterais.length,
      revisarCatalogo: revisarCatalogo.length,
    };
  }, [itens]);

  function excluirItem(item: ItemPeca) {
    setItens((atuais) => atuais.filter((atual) => atual.id !== item.id));
    setExcluidos((atuais) => [...atuais, item]);
  }

  function restaurarItem(item: ItemPeca) {
    setExcluidos((atuais) => atuais.filter((atual) => atual.id !== item.id));
    setItens((atuais) => [...atuais, item]);
  }

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
            COMPRAS • PEÇAS
          </p>
          <h1 className="mt-2 text-3xl font-black">Planejamento de peças</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-500">
            Relatório dos últimos 60 dias → compra projetada para 30 dias.
            Regra base: venda do período ÷ 2 − estoque atual.
          </p>

          <label className="mt-6 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/25 bg-[#D4AF37]/[0.025] px-4 text-center hover:border-[#D4AF37]/45">
            <Upload className="h-7 w-7 text-[#F2D675]" />
            <span className="mt-3 font-black text-[#F2D675]">
              Selecionar relatório .csv ou .xlsx
            </span>
            <span className="mt-1 text-xs text-gray-600">
              Usaremos somente Código, Item, Venda Período e Estoque Atual
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => importarArquivo(event.target.files?.[0] || null)}
            />
          </label>

          {arquivoNome && (
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {arquivoNome}
            </div>
          )}

          {erro && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}
        </section>

        <ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />


        {arquivoNome && (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Peças analisadas", resumo.total],
                ["Com compra", resumo.comCompra],
                ["Unidades sugeridas", resumo.unidades],
                ["Com lado para conferir", resumo.laterais],
                ["Revisar catálogo", resumo.revisarCatalogo],
              ].map(([label, valor]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-white/[0.07] bg-[#090909] p-4"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{valor}</p>
                </div>
              ))}
            </section>

            <section className="mt-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090909]">
              <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="font-black">Análise da compra</h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção. Se o índice rápido não encontrar, o sistema pesquisa direto no catálogo por código.
                  </p>
                  {mensagemCatalogo && (
                    <p className="mt-2 text-xs font-bold text-emerald-300">
                      {mensagemCatalogo}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={consultarPerfectMutation.isPending}
                    onClick={() => {
                      const itensPerfect = itens.filter(
                        (item) =>
                          item.quantidadeCompra > 0 &&
                          ["Pivô", "Terminal Axial", "Terminal de Direção"].includes(
                            item.grupo
                          )
                      );

                      if (itensPerfect.length) {
                        consultarPerfectMutation.mutate({
                          itens: itensPerfect.map((item) => ({
                            codigo: item.codigo,
                            grupo: item.grupo,
                          })),
                          forcar: true,
                        });
                      }
                    }}
                    className="h-9 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 text-[11px] font-black text-sky-200 disabled:opacity-50"
                  >
                    {consultarPerfectMutation.isPending
                      ? "Consultando Perfect..."
                      : "Consultar Perfect novamente"}
                  </button>

                  <label className="flex items-center gap-2 text-xs font-bold text-gray-400">
                    <input
                      type="checkbox"
                      checked={mostrarSemCompra}
                      onChange={(event) =>
                        setMostrarSemCompra(event.target.checked)
                      }
                    />
                    Mostrar itens sem compra
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1250px] w-full text-xs">
                  <thead className="bg-white/[0.025] text-left text-[9px] uppercase tracking-[0.06em] text-gray-600">
                    <tr>
                      <th className="px-3 py-3">Código</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3">Grupo</th>
                      <th className="px-3 py-3">Especificação / aplicação</th>
                      <th className="px-3 py-3 text-right">Venda 60d</th>
                      <th className="px-3 py-3 text-right">Estoque</th>
                      <th className="px-3 py-3 text-right">Necessidade</th>
                      <th className="px-3 py-3 text-right">Compra</th>
                      <th className="px-3 py-3">Regra</th>
                      <th className="px-3 py-3 text-right">Ação</th>
                    </tr>
                  </thead>

                  <tbody>
                    {itensVisiveis.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-white/[0.05]"
                      >
                        <td className="px-3 py-3 font-black text-[#F2D675]">
                          {item.codigo}
                        </td>
                        <td className="px-3 py-3 font-bold text-white">
                          {item.item}
                        </td>
                        <td className="px-3 py-3 text-gray-400">{item.grupo}</td>
                        <td className="px-3 py-3">
                          {item.catalogoStatus === "localizado" ? (
                            <div className="max-w-[430px]">
                              <p className="font-bold leading-5 text-gray-200">
                                {item.especificacao}
                              </p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-300">
                                {item.catalogoFonte}
                              </p>
                            </div>
                          ) : item.catalogoStatus === "nao_localizado" ? (
                            <span className="inline-flex rounded-full border border-rose-400/20 bg-rose-400/[0.05] px-2 py-1 font-black text-rose-200">
                              Código não localizado no Perfect
                            </span>
                          ) : item.catalogoStatus === "erro" ? (
                            <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-black text-amber-200">
                              Falha na consulta — tente novamente
                            </span>
                          ) : item.especificacaoStatus === "pendente" ? (
                            <span className="text-gray-600">
                              {["Pivô", "Terminal Axial", "Terminal de Direção"].includes(
                                item.grupo
                              )
                                ? "Consultando Perfect..."
                                : "Aguardando Sampel / Fras-le"}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-black text-amber-200">
                              {item.motivoRevisao}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-300">
                          {dinheiroNumero(item.vendaPeriodo)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-300">
                          {dinheiroNumero(item.estoqueAtual)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-bold ${
                            item.necessidadeBruta > 0
                              ? "text-[#F2D675]"
                              : "text-gray-700"
                          }`}
                        >
                          {dinheiroNumero(item.necessidadeBruta)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={item.quantidadeCompra}
                            onChange={(event) => {
                              const quantidade = Math.max(
                                0,
                                Math.floor(Number(event.target.value || 0))
                              );

                              setItens((atuais) =>
                                atuais.map((atual) =>
                                  atual.id === item.id
                                    ? {
                                        ...atual,
                                        quantidadeCompra: quantidade,
                                      }
                                    : atual
                                )
                              );
                            }}
                            className="h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none"
                            title="Quantidade de compra editável"
                          />
                        </td>
                        <td className="px-3 py-3">
                          {item.ladoIndividual ? (
                            <div>
                              <span className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/[0.05] px-2 py-1 font-black text-sky-200">
                                Lado {item.ladoIndividual}
                              </span>
                              <p className="mt-1 text-[10px] font-bold text-sky-300/70">
                                Conferir lado oposto
                              </p>
                            </div>
                          ) : item.grupo === "Pastilha" ? (
                            <span className="text-gray-500">
                              Sem arredondar para par
                            </span>
                          ) : (
                            <span className="text-gray-500">
                              Arredonda para par
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => excluirItem(item)}
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
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-gray-500" />
                  <h2 className="font-black">Excluídos desta análise</h2>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {excluidos.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-gray-300">{item.codigo}</p>
                        <p className="truncate text-xs text-gray-600">
                          {item.item}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => restaurarItem(item)}
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

        <footer className="mt-8 border-t border-white/[0.05] py-5 text-center text-[11px] text-gray-700">
          Compras de Peças
        </footer>
      </div>
    </main>
  );
}
