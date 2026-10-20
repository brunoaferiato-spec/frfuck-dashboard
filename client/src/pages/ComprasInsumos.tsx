import { useEffect, useMemo, useState } from "react";
import { Boxes, Check, Download, MapPin, Plus, Save, Settings2, Store, Trash2, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Compras de insumos: lista fixa de produtos com estoque mínimo (15 dias) por cidade.
// O estoquista preenche só o estoque atual; o sistema sugere Solicitar = mínimo - atual (nunca negativo).

type Tipo = "estoque" | "loja";
type Aba = "contagem" | "cotacao" | "pedidos" | "historico" | "fornecedores" | "produtos";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

type Linha = { codigo: string; material: string; minimo: number; estoqueAtual: string; solicitar: string | null };

function moeda(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function baixar(nome: string, mime: string, base64: string) {
  const s = atob(base64); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url);
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function numero(v: string) {
  const n = Number(String(v || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function sugerido(l: Linha) {
  if (l.estoqueAtual.trim() === "") return 0;
  return Math.max(0, Math.ceil(l.minimo - numero(l.estoqueAtual)));
}

function quantidade(l: Linha) {
  return l.solicitar !== null ? Math.max(0, Math.floor(numero(l.solicitar))) : sugerido(l);
}

export default function ComprasInsumos({ tipo }: { tipo: Tipo }) {
  const api = tipo === "estoque" ? trpc.compras.insumosEstoque : trpc.compras.insumosLoja;
  const titulo = tipo === "estoque" ? "Insumos de estoque" : "Insumos de loja";

  const [aba, setAba] = useState<Aba>("contagem");
  const [lojaId, setLojaId] = useState("1");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [avisoContagem, setAvisoContagem] = useState("");
  const [planejamentoId, setPlanejamentoId] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [fornecedorModal, setFornecedorModal] = useState<any | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [quantidadeLocal, setQuantidadeLocal] = useState<Record<string, string>>({});
  const [minimoLocal, setMinimoLocal] = useState<Record<string, string>>({});
  const [novoProduto, setNovoProduto] = useState({ codigo: "", material: "", minimo: "" });
  const [filtroLojaHistorico, setFiltroLojaHistorico] = useState("todas");
  const [exclusao, setExclusao] = useState<{ tipo: "pedidos" | "planejamento"; id: number; lojaId?: any; texto: string } | null>(null);
  const [senhaExclusao, setSenhaExclusao] = useState("");

  const loja = LOJAS.find((x) => String(x.id) === lojaId) || LOJAS[0];

  const produtosQ = api.produtos.useQuery({ lojaId: Number(lojaId) });
  const listaInicialQ = api.listaInicialDisponivel.useQuery();
  const fornecedoresQ = api.fornecedores.useQuery();
  const planosQ = api.planejamentos.useQuery();
  const detalheQ = api.detalhe.useQuery({ planejamentoId: planejamentoId || 0 }, { enabled: !!planejamentoId });
  const pedidosQ = api.pedidos.useQuery({ planejamentoId: planejamentoId || 0 }, { enabled: !!planejamentoId });

  const ok = (texto: string) => { setMensagem(texto); setErro(""); };
  const falha = (e: { message: string }) => setErro(e.message);

  // Lista da contagem: produtos desta cidade, com o estoque atual em branco.
  const listaDaLoja = useMemo(
    () => (produtosQ.data || []).filter((p) => p.ativo && p.naLista),
    [produtosQ.data]
  );
  useEffect(() => {
    if (planejamentoId) return;
    setLinhas(null);
    setArquivoNome(null);
    setAvisoContagem("");
  }, [lojaId, planejamentoId]);

  function iniciarNaTela() {
    setLinhas(listaDaLoja.map((p) => ({ codigo: p.codigo, material: p.material, minimo: Number(p.minimo || 0), estoqueAtual: "", solicitar: null })));
    setArquivoNome(null);
    setAvisoContagem("");
  }

  const planilhaContagem = api.planilhaContagem.useMutation({ onSuccess: (d) => baixar(d.nome, d.mime, d.base64), onError: falha });
  const lerContagem = api.lerContagem.useMutation({
    onSuccess: (d, vars) => {
      setLinhas(d.itens.map((x) => ({ codigo: x.codigo, material: x.material, minimo: x.minimo, estoqueAtual: x.estoqueAtual == null ? "" : String(x.estoqueAtual), solicitar: null })));
      setArquivoNome(vars.arquivoNome);
      const vazios = d.itens.filter((x) => !x.preenchido).length;
      const avisos = [];
      if (vazios) avisos.push(`${vazios} produto(s) sem estoque preenchido pelo estoquista (ficaram com pedido 0, confira).`);
      if (d.foraDaLista.length) avisos.push(`Código(s) na planilha que não estão na lista desta cidade: ${d.foraDaLista.join(", ")}.`);
      setAvisoContagem(avisos.join(" "));
      ok(`Planilha lida: ${d.itens.length} produto(s).`);
    },
    onError: falha,
  });

  const criarPlano = api.criarPlanejamento.useMutation({
    onSuccess: async (d) => { setPlanejamentoId(Number(d.planejamentoId)); ok(`Planejamento #${d.planejamentoId} salvo com ${d.totalItens} item(ns).`); await planosQ.refetch(); setAba("cotacao"); },
    onError: falha,
  });

  function salvarPlanejamento() {
    if (!linhas) return;
    criarPlano.mutate({
      lojaId: loja.id,
      lojaNome: loja.nome,
      arquivoNome,
      itens: linhas.map((l) => ({ codigo: l.codigo, item: l.material, estoqueAtual: Math.max(0, numero(l.estoqueAtual)), minimo: l.minimo, quantidadeFinal: quantidade(l) })),
    });
  }

  function novaContagem() {
    setPlanejamentoId(null);
    setLinhas(null);
    setArquivoNome(null);
    setAvisoContagem("");
    setMensagem("");
    setErro("");
    setAba("contagem");
  }

  // Produtos e mínimos
  const carregarLista = api.carregarListaInicial.useMutation({ onSuccess: async (d) => { ok(`Lista inicial carregada: ${d.produtos} produtos.`); await listaInicialQ.refetch(); await produtosQ.refetch(); }, onError: falha });
  const salvarProduto = api.salvarProduto.useMutation({ onError: falha });
  const salvarMinimo = api.salvarMinimo.useMutation({ onSuccess: async () => { await produtosQ.refetch(); }, onError: falha });
  const produtoAtivo = api.definirProdutoAtivo.useMutation({ onSuccess: async () => { await produtosQ.refetch(); }, onError: falha });

  async function adicionarProduto() {
    const codigo = novoProduto.codigo.trim();
    const material = novoProduto.material.trim();
    if (!codigo || material.length < 2) { setErro("Informe código e material."); return; }
    try {
      const r = await salvarProduto.mutateAsync({ codigo, material });
      await salvarMinimo.mutateAsync({ produtoId: r.id, lojaId: loja.id, minimo: Math.max(0, Math.floor(numero(novoProduto.minimo))) });
      setNovoProduto({ codigo: "", material: "", minimo: "" });
      ok(`Produto ${codigo.toUpperCase()} incluído na lista de ${loja.nome}.`);
      await listaInicialQ.refetch();
    } catch { /* erro já exibido */ }
  }

  // Cotação, pedidos e fornecedores
  const fornecedores = useMemo(() => (fornecedoresQ.data || []).filter((x: any) => x.ativo), [fornecedoresQ.data]);
  const criarFornecedor = api.criarFornecedor.useMutation({ onSuccess: async () => { setNovoFornecedor(""); await fornecedoresQ.refetch(); }, onError: falha });
  const toggleFornecedor = api.definirFornecedorAtivo.useMutation({ onSuccess: async () => { await fornecedoresQ.refetch(); }, onError: falha });
  const atualizarQuantidade = api.atualizarQuantidade.useMutation({
    onSuccess: async (d) => {
      setQuantidadeLocal((a) => { const n = { ...a }; delete n[String(d.itemId)]; return n; });
      ok(`Quantidade atualizada para ${d.quantidadeFinal}.`);
      await detalheQ.refetch(); await planosQ.refetch();
    },
    onError: falha,
  });
  const salvarCotacao = api.salvarCotacao.useMutation({ onSuccess: async () => { await detalheQ.refetch(); await planosQ.refetch(); }, onError: falha });
  const selecionar = api.selecionarFornecedor.useMutation({ onSuccess: async () => { await detalheQ.refetch(); }, onError: falha });
  const menores = api.selecionarMenores.useMutation({ onSuccess: async (d) => { ok(`${d.selecionados} item(ns) com menor preço selecionado.`); await detalheQ.refetch(); }, onError: falha });
  const arquivoCotacao = api.arquivoCotacaoFornecedor.useMutation({ onSuccess: (d) => baixar(d.nome, d.mime, d.base64), onError: falha });
  const importarCotacao = api.importarCotacaoFornecedor.useMutation({ onSuccess: async (d) => { setFornecedorModal(null); ok(`${d.importados} preço(s) importado(s).`); await detalheQ.refetch(); await planosQ.refetch(); }, onError: falha });
  const fechar = api.fecharPedidos.useMutation({ onSuccess: async (d) => { ok(d.jaSalvo ? "Pedidos já estavam salvos." : `${d.pedidos} pedido(s) salvo(s).`); await pedidosQ.refetch(); await planosQ.refetch(); setAba("pedidos"); }, onError: falha });
  const arquivoPedido = api.arquivoPedido.useMutation({ onSuccess: (d) => baixar(d.nome, d.mime, d.base64), onError: falha });
  const excluirPedidos = api.excluirPedidosPlanejamento.useMutation({
    onSuccess: async (d) => { ok(`${d.excluidos || 0} pedido(s) excluído(s). A cotação foi reaberta.`); setExclusao(null); setSenhaExclusao(""); await pedidosQ.refetch(); await detalheQ.refetch(); await planosQ.refetch(); setAba("cotacao"); },
    onError: falha,
  });
  const excluirPlanejamento = api.excluirPlanejamento.useMutation({
    onSuccess: async (d) => { ok(`Planejamento #${d.planejamentoId} excluído.`); setExclusao(null); setSenhaExclusao(""); if (planejamentoId === Number(d.planejamentoId)) novaContagem(); await planosQ.refetch(); setAba("historico"); },
    onError: falha,
  });

  const quoteMap = useMemo(() => { const m = new Map<string, number>(); for (const q of detalheQ.data?.cotacoes || []) m.set(`${q.itemId}-${q.fornecedorId}`, Number(q.valor || 0)); return m; }, [detalheQ.data?.cotacoes]);
  const countMap = useMemo(() => { const m = new Map<number, number>(); for (const q of detalheQ.data?.cotacoes || []) m.set(Number(q.fornecedorId), (m.get(Number(q.fornecedorId)) || 0) + 1); return m; }, [detalheQ.data?.cotacoes]);
  const planosHistorico = useMemo(() => (planosQ.data || []).filter((p: any) => filtroLojaHistorico === "todas" || Number(p.lojaId || 0) === Number(filtroLojaHistorico)), [planosQ.data, filtroLojaHistorico]);

  async function importarPrecos(file: File | null, fornecedorId: number) {
    if (!file || !planejamentoId) return;
    importarCotacao.mutate({ planejamentoId, fornecedorId, arquivoNome: file.name, arquivoBase64: await toBase64(file) });
  }

  async function anexarContagem(file: File | null) {
    if (!file) return;
    lerContagem.mutate({ lojaId: loja.id, arquivoNome: file.name, arquivoBase64: await toBase64(file) });
  }

  const totalPedir = (linhas || []).reduce((s, l) => s + (quantidade(l) > 0 ? 1 : 0), 0);
  const abas: Array<[Aba, string]> = [["contagem", "Contagem"], ["cotacao", "Cotação"], ["pedidos", "Pedidos"], ["historico", "Histórico"], ["fornecedores", "Fornecedores"], ["produtos", "Produtos e mínimos"]];
  const btn = "h-10 rounded-xl px-4 text-xs font-black disabled:opacity-50";

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">COMPRAS</p>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black">
              {tipo === "estoque" ? <Boxes className="h-7 w-7 text-[#F2D675]" /> : <Store className="h-7 w-7 text-[#F2D675]" />}
              {titulo}
            </h1>
            <p className="mt-2 text-sm text-gray-500">Estoque mínimo para 15 dias por cidade. O estoquista informa o estoque atual e o sistema calcula o pedido.</p>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">Cidade</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#D4AF37]" />
              <select value={lojaId} onChange={(e) => {
                const nova = e.target.value;
                setLojaId(nova);
                // Com um planejamento aberto, trocar a cidade fecha ele (fica salvo) e abre o histórico da nova cidade.
                if (planejamentoId) {
                  setPlanejamentoId(null);
                  setLinhas(null);
                  setFiltroLojaHistorico(nova);
                  setAba("historico");
                  ok("Planejamento anterior continua salvo. Escolha o planejamento desta cidade no Histórico.");
                }
              }} className="h-11 min-w-[200px] rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm font-bold text-white disabled:opacity-60">
                {LOJAS.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        {(mensagem || erro) && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${erro ? "border-rose-400/20 text-rose-200" : "border-emerald-400/20 text-emerald-200"}`}>{erro || mensagem}</div>}

        <div className="mt-5 flex flex-wrap gap-2">
          {abas.map(([v, l]) => <button key={v} type="button" onClick={() => setAba(v)} className={`rounded-xl px-4 py-2 text-xs font-black ${aba === v ? "bg-[#D4AF37] text-black" : "border border-white/10 text-gray-400"}`}>{l}</button>)}
        </div>

        <section className="mt-5 rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5">
          {/* ---------------- CONTAGEM ---------------- */}
          {aba === "contagem" && (planejamentoId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] p-5">
              <p className="text-sm text-gray-400">Planejamento #{planejamentoId} ({detalheQ.data?.planejamento?.lojaNome || loja.nome}) aberto. Continue nas abas Cotação e Pedidos.</p>
              <button type="button" onClick={novaContagem} className={`${btn} border border-[#D4AF37]/30 text-[#F2D675]`}>Nova contagem</button>
            </div>
          ) : listaDaLoja.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">
              {loja.nome} ainda não tem produtos na lista. Cadastre na aba <b>Produtos e mínimos</b>.
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={planilhaContagem.isPending} onClick={() => planilhaContagem.mutate({ lojaId: loja.id, lojaNome: loja.nome })} className={`${btn} bg-[#D4AF37] text-black`}><Download className="mr-2 inline h-4 w-4" />Baixar planilha para o estoquista</button>
                <label className={`${btn} flex cursor-pointer items-center border border-emerald-400/20 text-emerald-200`}>
                  <Upload className="mr-2 inline h-4 w-4" />{lerContagem.isPending ? "Lendo..." : "Anexar planilha preenchida"}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { void anexarContagem(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                </label>
                {!linhas && <button type="button" onClick={iniciarNaTela} className={`${btn} border border-white/10 text-gray-300`}>Preencher aqui na tela</button>}
              </div>
              <p className="mt-2 text-xs text-gray-600">A planilha do estoquista mostra só código, material e estoque atual ({listaDaLoja.length} produtos de {loja.nome}).</p>

              {avisoContagem && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 text-sm text-amber-200">{avisoContagem}</div>}

              {linhas && (
                <>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                      <thead className="bg-white/[0.025] text-[9px] uppercase text-gray-600">
                        <tr><th className="px-3 py-3 text-left">Código</th><th className="px-3 py-3 text-left">Material</th><th className="px-3 py-3 text-center">Estoque atual</th><th className="px-3 py-3 text-center">Mínimo (15 dias)</th><th className="px-3 py-3 text-center">Solicitar</th></tr>
                      </thead>
                      <tbody>
                        {linhas.map((l, i) => {
                          const q = quantidade(l);
                          return (
                            <tr key={l.codigo} className="border-t border-white/[0.05]">
                              <td className="px-3 py-2 font-black text-[#F2D675]">{l.codigo}</td>
                              <td className="px-3 py-2 font-bold">{l.material}</td>
                              <td className="px-3 py-2 text-center">
                                <input value={l.estoqueAtual} inputMode="decimal" placeholder="—" onChange={(e) => { const v = e.target.value.replace(/[^0-9.,]/g, ""); setLinhas((a) => a!.map((x, j) => (j === i ? { ...x, estoqueAtual: v } : x))); }} className="h-9 w-24 rounded-lg border border-white/10 bg-black/30 px-2 text-center font-bold text-white outline-none" />
                              </td>
                              <td className="px-3 py-2 text-center text-gray-400">{l.minimo}</td>
                              <td className="px-3 py-2 text-center">
                                <input value={l.solicitar !== null ? l.solicitar : String(sugerido(l))} inputMode="numeric" onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setLinhas((a) => a!.map((x, j) => (j === i ? { ...x, solicitar: v } : x))); }} className={`h-9 w-20 rounded-lg border px-2 text-center font-black outline-none ${q > 0 ? "border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] text-[#F2D675]" : "border-white/10 bg-black/30 text-gray-500"}`} title="Sugestão: mínimo - estoque atual. Pode ajustar." />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                    <span className="text-xs text-gray-500">{totalPedir} produto(s) para pedir</span>
                    <button type="button" onClick={() => { setLinhas(null); setArquivoNome(null); setAvisoContagem(""); }} className={`${btn} border border-white/10 text-gray-400`}>Descartar</button>
                    <button type="button" disabled={criarPlano.isPending || totalPedir === 0} onClick={salvarPlanejamento} className={`${btn} bg-[#D4AF37] text-black`}><Save className="mr-2 inline h-4 w-4" />Salvar planejamento</button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* ---------------- COTAÇÃO ---------------- */}
          {aba === "cotacao" && (!planejamentoId ? (
            <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Salve um planejamento na aba Contagem ou abra um pelo Histórico.</div>
          ) : fornecedores.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Cadastre fornecedores na aba Fornecedores.</div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-[#F2D675]">Planejamento #{planejamentoId} • {detalheQ.data?.planejamento?.lojaNome}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => menores.mutate({ planejamentoId })} className={`${btn} border border-emerald-400/20 text-emerald-200`}><Check className="mr-2 inline h-4 w-4" />Selecionar menores preços</button>
                  <button type="button" onClick={() => fechar.mutate({ planejamentoId })} className={`${btn} bg-[#D4AF37] text-black`}><Save className="mr-2 inline h-4 w-4" />Fechar cotação e salvar pedidos</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-xs">
                  <thead className="bg-white/[0.025] text-[9px] uppercase text-gray-600">
                    <tr>
                      <th className="px-3 py-3 text-left">Código</th><th className="px-3 py-3 text-left">Material</th><th className="px-3 py-3 text-right">Qtd</th>
                      {fornecedores.map((f: any) => <th key={f.id} className="px-3 py-3 text-center"><button type="button" onClick={() => setFornecedorModal(f)} className="font-black text-gray-300 hover:text-[#F2D675]">{f.nome}</button><span className="ml-2 rounded-full bg-white/[0.04] px-2 py-1">{countMap.get(Number(f.id)) || 0}/{detalheQ.data?.itens?.length || 0}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(detalheQ.data?.itens || []).map((it: any) => (
                      <tr key={it.id} className="border-t border-white/[0.05]">
                        <td className="px-3 py-3 font-black text-[#F2D675]">{it.codigo}</td>
                        <td className="px-3 py-3 font-bold">{it.item}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            inputMode="numeric"
                            disabled={atualizarQuantidade.isPending || detalheQ.data?.planejamento?.status === "pedido_salvo"}
                            value={quantidadeLocal[String(it.id)] !== undefined ? quantidadeLocal[String(it.id)] : String(it.quantidadeFinal ?? 0)}
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setQuantidadeLocal((a) => ({ ...a, [String(it.id)]: v })); }}
                            onBlur={() => {
                              const k = String(it.id);
                              const q = Math.max(0, Math.floor(Number(quantidadeLocal[k] ?? it.quantidadeFinal ?? 0)));
                              if (q !== Number(it.quantidadeFinal || 0)) atualizarQuantidade.mutate({ itemId: Number(it.id), quantidadeFinal: q });
                              else setQuantidadeLocal((a) => { const n = { ...a }; delete n[k]; return n; });
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            className="h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none disabled:opacity-50"
                          />
                        </td>
                        {fornecedores.map((f: any) => {
                          const key = `${it.id}-${f.id}`;
                          const saved = quoteMap.get(key);
                          const val = local[key] !== undefined ? local[key] : saved ? Number(saved).toFixed(2).replace(".", ",") : "";
                          const sel = Number(it.fornecedorSelecionadoId) === Number(f.id);
                          return (
                            <td key={f.id} className={`px-3 py-2 ${sel ? "bg-[#D4AF37]/[0.06]" : ""}`}>
                              <div className="flex min-w-[190px] gap-2">
                                <input value={val} placeholder="0,00" onChange={(e) => setLocal((a) => ({ ...a, [key]: e.target.value }))} onBlur={() => { const n = Number(String(val).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")); if (n > 0) salvarCotacao.mutate({ itemId: Number(it.id), fornecedorId: Number(f.id), valor: n }); }} className="h-10 min-w-0 flex-1 rounded-xl border border-emerald-400/20 bg-black/30 px-3 text-right text-emerald-200 outline-none" />
                                {saved && <button type="button" onClick={() => selecionar.mutate({ itemId: Number(it.id), fornecedorId: Number(f.id) })} className={`h-10 rounded-xl px-3 text-[10px] font-black ${sel ? "bg-[#D4AF37] text-black" : "border border-white/10 text-gray-400"}`}>{sel ? "OK" : "Escolher"}</button>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}

          {/* ---------------- PEDIDOS ---------------- */}
          {aba === "pedidos" && (!planejamentoId ? (
            <div className="text-gray-500">Abra um planejamento pelo Histórico.</div>
          ) : (pedidosQ.data || []).length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Nenhum pedido salvo.</div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div>
                  <p className="font-black text-white">{detalheQ.data?.planejamento?.lojaNome || "Cidade não informada"}</p>
                  <p className="mt-1 text-xs text-gray-600">Para corrigir quantidades ou fornecedores, exclua os pedidos e reabra a cotação.</p>
                </div>
                <button type="button" disabled={excluirPedidos.isPending} onClick={() => { setSenhaExclusao(""); excluirPlanejamento.reset(); excluirPedidos.reset(); setExclusao({ tipo: "pedidos", id: Number(planejamentoId), texto: `Excluir todos os pedidos do Planejamento #${planejamentoId}? A cotação será mantida e poderá ser refeita.` }); }} className="h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 text-xs font-black text-rose-300 disabled:opacity-50"><Trash2 className="mr-2 inline h-4 w-4" />Excluir pedidos e reabrir cotação</button>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {(pedidosQ.data || []).map((p: any) => (
                  <div key={p.id} className="rounded-2xl border border-white/[0.07] p-4">
                    <p className="text-xs text-gray-600">Fornecedor</p>
                    <h3 className="mt-1 text-xl font-black">{p.fornecedorNome}</h3>
                    <p className="mt-3 text-sm text-gray-500">{p.totalItens} itens • {p.totalQuantidade} unidades</p>
                    <p className="mt-2 text-2xl font-black text-[#F2D675]">{moeda(p.totalValor)}</p>
                    <button type="button" onClick={() => arquivoPedido.mutate({ pedidoId: Number(p.id) })} className="mt-4 h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black"><Download className="mr-2 inline h-4 w-4" />Baixar pedido</button>
                  </div>
                ))}
              </div>
            </>
          ))}

          {/* ---------------- HISTÓRICO ---------------- */}
          {aba === "historico" && (
            <div>
              <div className="mb-4">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-gray-600">Filtrar por cidade</p>
                <select value={filtroLojaHistorico} onChange={(e) => setFiltroLojaHistorico(e.target.value)} className="mt-1 h-10 min-w-[190px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white">
                  <option value="todas">Todas as cidades</option>
                  {LOJAS.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
                </select>
              </div>
              {planosHistorico.length === 0 ? <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Nenhum planejamento salvo.</div> : (
                <div className="grid gap-3 lg:grid-cols-3">
                  {planosHistorico.map((p: any) => (
                    <div key={p.id} className="rounded-2xl border border-white/[0.07] p-4">
                      <button type="button" onClick={() => { setPlanejamentoId(Number(p.id)); if (p.lojaId) setLojaId(String(p.lojaId)); setAba(p.status === "pedido_salvo" ? "pedidos" : "cotacao"); }} className="block w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-black">Planejamento #{p.id}</p>
                          <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-2 py-1 text-[9px] font-black text-[#F2D675]">{p.lojaNome || "Sem cidade"}</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">{p.totalItens} itens • {p.totalQuantidade} unidades</p>
                        <p className="mt-2 text-[11px] font-bold text-[#F2D675]">{p.status === "pedido_salvo" ? "Pedido salvo" : p.status === "cotacao" ? "Em cotação" : "Planejamento"}</p>
                        <p className="mt-2 text-[11px] text-gray-600">{new Date(p.createdAt).toLocaleString("pt-BR")}</p>
                      </button>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.05] pt-3">
                        {p.status === "pedido_salvo" && (
                          <button type="button" disabled={excluirPedidos.isPending} onClick={() => { setSenhaExclusao(""); excluirPlanejamento.reset(); excluirPedidos.reset(); setExclusao({ tipo: "pedidos", id: Number(p.id), lojaId: p.lojaId, texto: `Excluir os pedidos do Planejamento #${p.id}? A cotação será mantida.` }); }} className="h-9 rounded-lg border border-rose-400/20 px-3 text-[11px] font-black text-rose-200 disabled:opacity-50">Excluir pedido(s)</button>
                        )}
                        <button type="button" disabled={excluirPlanejamento.isPending} onClick={() => { setSenhaExclusao(""); excluirPlanejamento.reset(); excluirPedidos.reset(); setExclusao({ tipo: "planejamento", id: Number(p.id), texto: `Excluir o Planejamento #${p.id}? Isso também excluirá cotações e pedidos vinculados.` }); }} className="h-9 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 text-[11px] font-black text-rose-300 disabled:opacity-50"><Trash2 className="mr-1.5 inline h-3.5 w-3.5" />Excluir planejamento</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------- FORNECEDORES ---------------- */}
          {aba === "fornecedores" && (
            <div>
              <div className="flex gap-2">
                <input value={novoFornecedor} onChange={(e) => setNovoFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="h-11 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm" />
                <button type="button" onClick={() => novoFornecedor.trim() && criarFornecedor.mutate({ nome: novoFornecedor.trim() })} className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black"><Settings2 className="mr-2 inline h-4 w-4" />Adicionar</button>
              </div>
              <p className="mt-2 text-xs text-gray-600">Fornecedores de {titulo.toLowerCase()} (separados dos de peças).</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {(fornecedoresQ.data || []).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] px-4 py-3">
                    <span className={f.ativo ? "font-bold" : "text-gray-600"}>{f.nome}</span>
                    <button type="button" onClick={() => toggleFornecedor.mutate({ id: Number(f.id), ativo: !f.ativo })} className="text-xs font-black text-[#F2D675]">{f.ativo ? "Desativar" : "Ativar"}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------- PRODUTOS E MÍNIMOS ---------------- */}
          {aba === "produtos" && (
            <div>
              {listaInicialQ.data?.vazio && listaInicialQ.data?.temLista && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">
                  <p className="text-sm text-gray-300">Carregar a lista de insumos e os mínimos de Blumenau, São José, Florianópolis e São Leopoldo, tirados das planilhas atuais.</p>
                  <button type="button" disabled={carregarLista.isPending} onClick={() => carregarLista.mutate()} className={`${btn} bg-[#D4AF37] text-black`}>Carregar lista inicial</button>
                </div>
              )}

              <p className="text-xs font-black uppercase tracking-[0.08em] text-gray-600">Novo produto (entra na lista de {loja.nome})</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={novoProduto.codigo} onChange={(e) => setNovoProduto((a) => ({ ...a, codigo: e.target.value }))} placeholder="Código" className="h-11 w-36 rounded-xl border border-white/10 bg-black/40 px-3 text-sm" />
                <input value={novoProduto.material} onChange={(e) => setNovoProduto((a) => ({ ...a, material: e.target.value }))} placeholder="Material" className="h-11 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm" />
                <input value={novoProduto.minimo} inputMode="numeric" onChange={(e) => setNovoProduto((a) => ({ ...a, minimo: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="Mínimo" className="h-11 w-28 rounded-xl border border-white/10 bg-black/40 px-3 text-center text-sm" />
                <button type="button" disabled={salvarProduto.isPending} onClick={() => void adicionarProduto()} className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />Adicionar</button>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-white/[0.025] text-[9px] uppercase text-gray-600">
                    <tr><th className="px-3 py-3 text-left">Código</th><th className="px-3 py-3 text-left">Material</th><th className="px-3 py-3 text-center">Na lista de {loja.nome}</th><th className="px-3 py-3 text-center">Mínimo (15 dias)</th><th className="px-3 py-3 text-right">Produto</th></tr>
                  </thead>
                  <tbody>
                    {(produtosQ.data || []).map((p) => {
                      const k = String(p.id);
                      const valor = minimoLocal[k] !== undefined ? minimoLocal[k] : p.minimo == null ? "" : String(p.minimo);
                      return (
                        <tr key={p.id} className={`border-t border-white/[0.05] ${p.ativo ? "" : "opacity-40"}`}>
                          <td className="px-3 py-2 font-black text-[#F2D675]">{p.codigo}</td>
                          <td className="px-3 py-2 font-bold">{p.material}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" disabled={!p.ativo || salvarMinimo.isPending} checked={p.naLista} onChange={(e) => salvarMinimo.mutate({ produtoId: p.id, lojaId: loja.id, minimo: e.target.checked ? Number(p.minimo || 0) : null })} className="h-4 w-4 accent-[#D4AF37]" />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              value={valor}
                              disabled={!p.ativo || !p.naLista}
                              inputMode="numeric"
                              onChange={(e) => setMinimoLocal((a) => ({ ...a, [k]: e.target.value.replace(/[^0-9]/g, "") }))}
                              onBlur={() => {
                                if (minimoLocal[k] === undefined) return;
                                const n = Math.max(0, Math.floor(Number(minimoLocal[k] || 0)));
                                setMinimoLocal((a) => { const x = { ...a }; delete x[k]; return x; });
                                if (n !== Number(p.minimo || 0)) salvarMinimo.mutate({ produtoId: p.id, lojaId: loja.id, minimo: n });
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              className="h-9 w-24 rounded-lg border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => produtoAtivo.mutate({ id: p.id, ativo: !p.ativo })} className="text-xs font-black text-gray-400 hover:text-[#F2D675]">{p.ativo ? "Desativar" : "Reativar"}</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(produtosQ.data || []).length === 0 && <div className="mt-4 rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Nenhum produto cadastrado ainda.</div>}
              </div>
              <p className="mt-3 text-xs text-gray-600">Desmarcar "Na lista" tira o produto só desta cidade. "Desativar" tira de todas as cidades.</p>
            </div>
          )}
        </section>
      </div>

      {fornecedorModal && planejamentoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0a0a0a] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D4AF37]/60">COTAÇÃO DO FORNECEDOR</p>
                <h2 className="mt-1 text-2xl font-black">{fornecedorModal.nome}</h2>
                <p className="mt-2 text-xs text-gray-500">{countMap.get(Number(fornecedorModal.id)) || 0}/{detalheQ.data?.itens?.length || 0} preços recebidos</p>
              </div>
              <button type="button" onClick={() => setFornecedorModal(null)} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => arquivoCotacao.mutate({ planejamentoId, fornecedorId: Number(fornecedorModal.id) })} className="rounded-2xl border border-[#D4AF37]/20 p-5 text-left">
                <Download className="h-5 w-5 text-[#F2D675]" /><p className="mt-3 font-black">Baixar arquivo de cotação</p><p className="mt-1 text-xs text-gray-600">Código e item travados. Só o preço fica editável.</p>
              </button>
              <label className="cursor-pointer rounded-2xl border border-emerald-400/20 p-5">
                <Upload className="h-5 w-5 text-emerald-300" /><p className="mt-3 font-black">Anexar arquivo preenchido</p><p className="mt-1 text-xs text-gray-600">Os preços entram automaticamente.</p>
                <input type="file" accept=".xlsx" className="hidden" onChange={(e) => { void importarPrecos(e.target.files?.[0] || null, Number(fornecedorModal.id)); e.currentTarget.value = ""; }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {exclusao && (() => {
        const enviando = excluirPedidos.isPending || excluirPlanejamento.isPending;
        const confirmar = () => {
          if (!senhaExclusao.trim() || enviando) return;
          excluirPlanejamento.reset();
          excluirPedidos.reset();
          if (exclusao.tipo === "pedidos") {
            setPlanejamentoId(exclusao.id);
            if (exclusao.lojaId) setLojaId(String(exclusao.lojaId));
            excluirPedidos.mutate({ planejamentoId: exclusao.id, senha: senhaExclusao });
          } else {
            excluirPlanejamento.mutate({ planejamentoId: exclusao.id, senha: senhaExclusao });
          }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-[#0a0a0a] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-300/70">EXCLUSÃO PROTEGIDA</p>
                  <p className="mt-2 text-sm font-bold text-white">{exclusao.texto}</p>
                </div>
                <button type="button" onClick={() => { setExclusao(null); setSenhaExclusao(""); }} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4" /></button>
              </div>
              <input type="password" autoFocus value={senhaExclusao} onChange={(e) => setSenhaExclusao(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} placeholder="Senha de exclusão" className="mt-4 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white" />
              {(excluirPlanejamento.error || excluirPedidos.error) && !enviando && (
                <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-xs font-bold text-rose-200">
                  {(excluirPlanejamento.error || excluirPedidos.error)?.message}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setExclusao(null); setSenhaExclusao(""); }} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
                <button type="button" disabled={!senhaExclusao.trim() || enviando} onClick={confirmar} className="h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.12] px-4 text-xs font-black text-rose-200 disabled:opacity-50"><Trash2 className="mr-2 inline h-4 w-4" />{enviando ? "Excluindo..." : "Excluir"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
