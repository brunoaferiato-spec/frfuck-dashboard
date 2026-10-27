import { AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, List, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { EMPRESAS } from "@shared/empresas";
import { lerResumoVenda, type ResumoVenda, type TextoPdfItem } from "@shared/resumoVendaItens";

// Conferência diária do estoque: o estoquista manda o "Resumo geral venda de itens" do dia anterior e confere
// item por item, com foto obrigatória e a quantidade que tem na prateleira. Contagem às cegas: o estoque do
// sistema só aparece no resultado, depois de concluir.

function dataBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
const qtd = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

async function lerPdf(file: File): Promise<ResumoVenda> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas: TextoPdfItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    paginas.push((c.items as any[]).map((i) => ({ s: String(i.str || ""), x: i.transform[4], y: i.transform[5], w: i.width || 0 })));
  }
  return lerResumoVenda(paginas);
}

// Foto do celular: reduz para no máximo 1024 px em JPEG (fica leve e ainda dá para contar as peças).
async function prepararFoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível ler a foto."));
      i.src = url;
    });
    const escala = Math.min(1, 1024 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
    return { mime: "image/jpeg", base64: dataUrl.split(",")[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function EstoqueConferencia() {
  const utils = trpc.useUtils();
  const perfilQ = trpc.estoque.meuPerfil.useQuery();
  const [lojaEscolhida, setLojaEscolhida] = useState<number | null>(null);
  const lojaId = perfilQ.data?.supervisor ? lojaEscolhida : perfilQ.data?.lojaId ?? null;
  const atualQ = trpc.estoque.atual.useQuery({ lojaId }, { enabled: !!perfilQ.data && !!lojaId });
  const [erro, setErro] = useState("");

  const atual = atualQ.data;
  const emAndamento = atual?.conferencia.status === "andamento";

  if (perfilQ.isLoading) return <p className="p-6 text-sm text-gray-500">Carregando…</p>;
  if (perfilQ.error) return <p className="p-6 text-sm text-rose-300">{perfilQ.error.message}</p>;

  return (
    <main className="mx-auto max-w-3xl p-3 pb-24 sm:p-6">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • conferência diária</p>
        <h1 className="mt-1 text-2xl font-black">{perfilQ.data?.loja || "Conferência de estoque"}</h1>
      </div>

      {perfilQ.data?.supervisor && (
        <label className="mb-4 block text-xs font-bold text-gray-400">Loja
          <select value={lojaEscolhida ?? ""} onChange={(e) => setLojaEscolhida(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base text-white">
            <option value="">Escolha a loja</option>
            {EMPRESAS.map((e) => <option key={e.lojaId} value={e.lojaId}>{e.loja}</option>)}
          </select>
        </label>
      )}

      {erro && <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}

      {!lojaId ? null : atualQ.isLoading ? <p className="text-sm text-gray-500">Carregando…</p> : emAndamento ? (
        <Contagem atual={atual!} setErro={setErro} onAtualizar={() => utils.estoque.atual.invalidate()} />
      ) : (
        <>
          <NovaConferencia lojaId={lojaId} setErro={setErro} onIniciada={() => utils.estoque.atual.invalidate()} />
          {atual && <Resultado atual={atual} />}
        </>
      )}
    </main>
  );
}

function NovaConferencia({ lojaId, setErro, onIniciada }: { lojaId: number; setErro: (s: string) => void; onIniciada: () => void }) {
  const [lendo, setLendo] = useState(false);
  const [lido, setLido] = useState<{ arquivo: string; resumo: ResumoVenda } | null>(null);
  const iniciar = trpc.estoque.iniciar.useMutation({ onSuccess: () => { setLido(null); onIniciada(); }, onError: (e) => setErro(e.message) });

  async function escolher(file: File | null) {
    if (!file) return;
    setErro("");
    setLendo(true);
    try {
      const resumo = await lerPdf(file);
      if (!resumo.itens.length) throw new Error("Não encontrei itens nesse PDF. Confira se é o \"Resumo geral venda de itens\".");
      setLido({ arquivo: file.name, resumo });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível ler o PDF.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-4 sm:p-6">
      {!lido ? (
        <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.03] px-4 text-center">
          <FileText className="h-8 w-8 text-[#F2D675]" />
          <span className="mt-3 text-base font-black text-[#F2D675]">{lendo ? "Lendo o relatório…" : "Anexar o Resumo geral venda de itens"}</span>
          <span className="mt-1 text-xs text-gray-500">PDF das vendas de ontem, baixado hoje de manhã</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void escolher(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
        </label>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Relatório lido:</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Loja do relatório</p><p className="mt-1 font-black">{lido.resumo.loja || "—"}</p></div>
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Vendas do dia</p><p className="mt-1 font-black">{dataBr(lido.resumo.dataFim)}</p></div>
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Itens para conferir</p><p className="mt-1 font-black">{lido.resumo.itens.length}</p></div>
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Peças vendidas</p><p className="mt-1 font-black">{qtd(lido.resumo.itens.reduce((s, i) => s + i.qtdVendida, 0))}</p></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLido(null)} className="h-12 flex-1 rounded-xl border border-white/10 text-sm font-black text-gray-400">Trocar arquivo</button>
            <button type="button" disabled={iniciar.isPending || !lido.resumo.dataFim}
              onClick={() => iniciar.mutate({ lojaId, lojaRelatorio: lido.resumo.loja, dataRelatorio: lido.resumo.dataFim!, arquivoNome: lido.arquivo, itens: lido.resumo.itens })}
              className="h-12 flex-[2] rounded-xl bg-[#D4AF37] text-base font-black text-black disabled:opacity-50">
              {iniciar.isPending ? "Preparando…" : "Começar conferência"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

type Atual = NonNullable<inferRouterOutputs<AppRouter>["estoque"]["atual"]>;

function Contagem({ atual, setErro, onAtualizar }: { atual: Atual; setErro: (s: string) => void; onAtualizar: () => Promise<void> }) {
  const itens = atual.itens;
  const feitos = itens.filter((i) => i.quantidadeContada != null && i.temFoto).length;
  const primeiroPendente = Math.max(0, itens.findIndex((i) => i.quantidadeContada == null || !i.temFoto));
  const [indice, setIndice] = useState(primeiroPendente);
  const [verLista, setVerLista] = useState(false);
  const [foto, setFoto] = useState<{ mime: string; base64: string; preview: string } | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const item = itens[Math.min(indice, itens.length - 1)];

  useEffect(() => {
    setFoto(null);
    setQuantidade(item?.quantidadeContada != null ? String(item.quantidadeContada).replace(".", ",") : "");
  }, [item?.id]);

  const contar = trpc.estoque.contarItem.useMutation({ onError: (e) => setErro(e.message) });
  const concluir = trpc.estoque.concluir.useMutation({ onSuccess: () => void onAtualizar(), onError: (e) => setErro(e.message) });
  const fotoSalva = trpc.estoque.foto.useQuery({ itemId: item?.id || 0 }, { enabled: !!item?.temFoto && !foto });

  if (!item) return null;
  const n = Number(quantidade.replace(",", "."));
  const quantidadeValida = quantidade.trim() !== "" && Number.isFinite(n) && n >= 0;
  const temFoto = !!foto || item.temFoto;
  const tudoFeito = feitos === itens.length;

  async function tirarFoto(file: File | null) {
    if (!file) return;
    setPreparandoFoto(true);
    try {
      setFoto(await prepararFoto(file));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível usar essa foto.");
    } finally {
      setPreparandoFoto(false);
    }
  }

  async function salvar() {
    setErro("");
    await contar.mutateAsync({ itemId: item.id, quantidade: n, foto: foto ? { mime: foto.mime, base64: foto.base64 } : null });
    await onAtualizar();
    // Próximo item que ainda falta (depois deste); se não tiver, o primeiro que faltar.
    const depois = itens.findIndex((i, k) => k > indice && (i.quantidadeContada == null || !i.temFoto));
    const qualquer = itens.findIndex((i, k) => k !== indice && (i.quantidadeContada == null || !i.temFoto));
    setIndice(depois >= 0 ? depois : qualquer >= 0 ? qualquer : indice);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-3">
        <div className="flex items-center justify-between text-xs font-bold text-gray-400">
          <span>Vendas de {dataBr(atual.conferencia.dataRelatorio)}</span>
          <span>{feitos} de {itens.length} conferidos</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${(feitos / itens.length) * 100}%` }} /></div>
      </div>

      {verLista ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-3">
          <div className="mb-2 flex items-center justify-between"><p className="font-black">Todos os itens</p><button type="button" onClick={() => setVerLista(false)} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5" /></button></div>
          <div className="space-y-1">
            {itens.map((i, k) => {
              const ok = i.quantidadeContada != null && i.temFoto;
              return (
                <button key={i.id} type="button" onClick={() => { setIndice(k); setVerLista(false); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${k === indice ? "bg-[#D4AF37]/[0.08]" : "hover:bg-white/[0.03]"}`}>
                  {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white/20" />}
                  <span className="w-20 shrink-0 font-black text-[#F2D675]">{i.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{i.item}</span>
                  {ok && <span className="text-sm font-black">{qtd(i.quantidadeContada)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-[#D4AF37]/25 bg-[#0a0a0a] p-4">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Item {indice + 1} de {itens.length}</span>
            <button type="button" onClick={() => setVerLista(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[#F2D675]"><List className="h-4 w-4" />Ver todos</button>
          </div>
          <p className="mt-2 text-3xl font-black tracking-tight text-[#F2D675]">{item.codigo}</p>
          <p className="mt-1 text-lg font-bold leading-6">{item.item}</p>
          {item.aplicacao && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-gray-500">{item.aplicacao}</p>}
          <p className="mt-2 text-xs text-gray-500">Vendido ontem: <b className="text-gray-300">{qtd(item.qtdVendida)}</b></p>

          {/* Foto obrigatória */}
          <div className="mt-4">
            {foto ? (
              <img src={foto.preview} alt="Foto da peça" className="max-h-72 w-full rounded-2xl border border-white/10 object-contain" />
            ) : fotoSalva.data ? (
              <img src={`data:${fotoSalva.data.mime};base64,${fotoSalva.data.base64}`} alt="Foto salva" className="max-h-72 w-full rounded-2xl border border-emerald-400/20 object-contain" />
            ) : null}
            <label className={`mt-2 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl text-base font-black ${temFoto ? "border border-white/10 text-gray-300" : "bg-sky-500 text-black"}`}>
              <Camera className="h-5 w-5" />{preparandoFoto ? "Preparando foto…" : temFoto ? "Tirar outra foto" : "Tirar foto da peça"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void tirarFoto(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
            </label>
            {!temFoto && <p className="mt-1 text-center text-[11px] text-gray-500">Foto obrigatória: dê para ver a quantidade sempre que possível.</p>}
          </div>

          {/* Quantidade contada */}
          <p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-gray-500">Quantidade que tem no estoque</p>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => setQuantidade(String(Math.max(0, (quantidadeValida ? n : 0) - 1)))} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-300"><Minus className="h-6 w-6" /></button>
            <input value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/[^0-9,]/g, ""))} inputMode="decimal" placeholder="0"
              className="h-14 min-w-0 flex-1 rounded-2xl border border-[#D4AF37]/30 bg-black/40 text-center text-3xl font-black text-white outline-none focus:border-[#D4AF37]" />
            <button type="button" onClick={() => setQuantidade(String((quantidadeValida ? n : 0) + 1))} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-300"><Plus className="h-6 w-6" /></button>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={indice === 0} onClick={() => setIndice(indice - 1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-400 disabled:opacity-30"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" disabled={!temFoto || !quantidadeValida || contar.isPending} onClick={() => void salvar()}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] text-base font-black text-black disabled:opacity-40">
              <Check className="h-5 w-5" />{contar.isPending ? "Salvando…" : "Salvar e próximo"}
            </button>
            <button type="button" disabled={indice >= itens.length - 1} onClick={() => setIndice(indice + 1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-400 disabled:opacity-30"><ChevronRight className="h-6 w-6" /></button>
          </div>
        </section>
      )}

      {tudoFeito && (
        <button type="button" disabled={concluir.isPending}
          onClick={() => { if (window.confirm("Concluir a conferência? Depois de concluir não dá para mudar as quantidades.")) concluir.mutate({ conferenciaId: atual.conferencia.id }); }}
          className="h-14 w-full rounded-2xl bg-emerald-500 text-base font-black text-black disabled:opacity-50">
          {concluir.isPending ? "Concluindo…" : `Concluir conferência (${itens.length} itens)`}
        </button>
      )}
    </div>
  );
}

function Resultado({ atual }: { atual: Atual }) {
  const itens = atual.itens;
  const divergentes = useMemo(() => itens.filter((i) => i.diferenca != null && i.diferenca !== 0), [itens]);
  return (
    <section className="mt-4 rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-500">Última conferência • vendas de {dataBr(atual.conferencia.dataRelatorio)}</p>
      {divergentes.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-emerald-200">
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div><p className="text-lg font-black">Tudo bateu!</p><p className="text-sm">Os {itens.length} itens conferem com o estoque do sistema.</p></div>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-emerald-400/20 p-3 text-center"><p className="text-3xl font-black text-emerald-300">{itens.length - divergentes.length}</p><p className="text-xs text-gray-400">bateram</p></div>
            <div className="rounded-2xl border border-rose-400/25 p-3 text-center"><p className="text-3xl font-black text-rose-300">{divergentes.length}</p><p className="text-xs text-gray-400">não bateram</p></div>
          </div>
          <p className="mt-3 text-sm text-gray-400">Itens com diferença (o supervisor de estoque vai analisar):</p>
          <div className="mt-2 space-y-2">
            {divergentes.map((i) => (
              <div key={i.id} className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.04] p-3">
                <p className="font-black text-[#F2D675]">{i.codigo} <span className="font-bold text-gray-300">{i.item}</span></p>
                <div className="mt-1 flex gap-4 text-sm">
                  <span className="text-gray-400">Sistema <b className="text-white">{qtd(i.estoqueSistema)}</b></span>
                  <span className="text-gray-400">Contado <b className="text-white">{qtd(i.quantidadeContada)}</b></span>
                  <span className={`font-black ${Number(i.diferenca) > 0 ? "text-sky-300" : "text-rose-300"}`}>{Number(i.diferenca) > 0 ? "+" : ""}{qtd(i.diferenca)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
