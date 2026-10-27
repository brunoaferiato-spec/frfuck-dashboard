import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, List, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { EMPRESAS } from "@shared/empresas";
import type { TextoPdfItem } from "@shared/resumoVendaItens";
import { conferirCompraOS, lerComprasOS, type RelatorioCompraOS } from "@shared/comprasOS";

// Compras x OS: o estoquista só compra peça para carro que está na loja, então toda compra tem que sair no mesmo dia.
// Ele anexa o relatório do dia, o sistema mostra só o que está errado e ele justifica um por um.

function dataBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const qtd = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

async function lerPdf(file: File): Promise<RelatorioCompraOS> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas: TextoPdfItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    paginas.push((c.items as any[]).map((i) => ({ s: String(i.str || ""), x: i.transform[4], y: i.transform[5], w: i.width || 0 })));
  }
  return lerComprasOS(paginas);
}

type Atual = NonNullable<inferRouterOutputs<AppRouter>["estoque"]["comprasOS"]["atual"]>;
type ItemErrado = Atual["itens"][number];

const corMovimento: Record<string, string> = {
  COMPRA: "text-sky-300",
  VENDA: "text-emerald-300",
  GARANTIA: "text-emerald-300",
  AJUSTE: "text-amber-300",
};

export function MovimentosDoDia({ item }: { item: Pick<ItemErrado, "movimentos"> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.06]">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase text-gray-500">
        <span>Movimento</span><span className="text-right">Antes</span><span className="text-right">Mov.</span><span className="text-right">Depois</span>
      </div>
      {item.movimentos.map((m, k) => (
        <div key={k} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-t border-white/[0.04] px-3 py-2 text-sm">
          <span className={`font-black ${corMovimento[m.tipo] || "text-gray-300"}`}>{m.tipo}{m.documento ? <span className="ml-1 text-[11px] font-bold text-gray-600">{m.documento}</span> : null}</span>
          <span className="w-10 text-right text-gray-400">{qtd(m.qtdAnterior)}</span>
          <span className="w-10 text-right font-bold">{m.tipo === "AJUSTE" ? `=${qtd(m.qtdMovimento)}` : `${m.qtdMovimento > 0 ? "+" : ""}${qtd(m.qtdMovimento)}`}</span>
          <span className="w-10 text-right font-black">{qtd(m.qtdFinal)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EstoqueComprasOS() {
  const utils = trpc.useUtils();
  const perfilQ = trpc.estoque.meuPerfil.useQuery();
  const [lojaEscolhida, setLojaEscolhida] = useState<number | null>(null);
  const lojaId = perfilQ.data?.supervisor ? lojaEscolhida : perfilQ.data?.lojaId ?? null;
  const atualQ = trpc.estoque.comprasOS.atual.useQuery({ lojaId }, { enabled: !!perfilQ.data && !!lojaId });
  const [erro, setErro] = useState("");

  const atual = atualQ.data;
  const emAndamento = atual?.conferencia.status === "andamento";

  if (perfilQ.isLoading) return <p className="p-6 text-sm text-gray-500">Carregando…</p>;
  if (perfilQ.error) return <p className="p-6 text-sm text-rose-300">{perfilQ.error.message}</p>;

  return (
    <main className="mx-auto max-w-3xl p-3 pb-24 sm:p-6">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • compras x OS</p>
        <h1 className="mt-1 text-2xl font-black">{perfilQ.data?.loja || "Compras x OS"}</h1>
        <p className="mt-1 text-sm text-gray-500">Toda peça comprada tem que sair no mesmo dia, e não pode comprar o que já tem no estoque. Envie todo dia, ao fechar a loja.</p>
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
        <Justificativas atual={atual!} setErro={setErro} onAtualizar={() => utils.estoque.comprasOS.atual.invalidate()} />
      ) : (
        <>
          <NovoRelatorio lojaId={lojaId} setErro={setErro} onIniciado={() => utils.estoque.comprasOS.atual.invalidate()} />
          {atual && <Resultado atual={atual} />}
        </>
      )}
    </main>
  );
}

function NovoRelatorio({ lojaId, setErro, onIniciado }: { lojaId: number; setErro: (s: string) => void; onIniciado: () => void }) {
  const [lendo, setLendo] = useState(false);
  const [lido, setLido] = useState<{ arquivo: string; relatorio: RelatorioCompraOS } | null>(null);
  const iniciar = trpc.estoque.comprasOS.iniciar.useMutation({ onSuccess: () => { setLido(null); onIniciado(); }, onError: (e) => setErro(e.message) });
  const semCompra = trpc.estoque.comprasOS.semCompra.useMutation({ onSuccess: () => onIniciado(), onError: (e) => setErro(e.message) });
  const [diaSemCompra, setDiaSemCompra] = useState(hojeIso());

  async function escolher(file: File | null) {
    if (!file) return;
    setErro("");
    setLendo(true);
    try {
      const relatorio = await lerPdf(file);
      if (!relatorio.produtos.length) throw new Error("Não encontrei produtos nesse PDF. Confira se é o \"Compras x OS\".");
      setLido({ arquivo: file.name, relatorio });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível ler o PDF.");
    } finally {
      setLendo(false);
    }
  }

  const r = lido?.relatorio;
  const conferencia = r ? conferirCompraOS(r.produtos) : null;
  const errados = conferencia?.errados.length || 0;
  const comprados = conferencia?.comprados || 0;

  return (
    <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-4 sm:p-6">
      {!lido || !r ? (
        <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.03] px-4 text-center">
          <FileText className="h-8 w-8 text-[#F2D675]" />
          <span className="mt-3 text-base font-black text-[#F2D675]">{lendo ? "Lendo o relatório…" : "Anexar o Compras x OS"}</span>
          <span className="mt-1 text-xs text-gray-500">PDF do relatório do dia</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void escolher(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
        </label>
      ) : null}
      {!lido && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] p-3">
          <p className="w-full text-xs font-bold text-gray-400">A loja não comprou nada no dia? Marque aqui em vez de anexar o relatório.</p>
          <input type="date" value={diaSemCompra} max={hojeIso()} onChange={(e) => setDiaSemCompra(e.target.value)}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" />
          <button type="button" disabled={semCompra.isPending || !diaSemCompra}
            onClick={() => { setErro(""); if (window.confirm(`Confirmar que a loja não teve nenhuma compra em ${dataBr(diaSemCompra)}?`)) semCompra.mutate({ lojaId, data: diaSemCompra }); }}
            className="h-11 flex-1 rounded-xl border border-white/15 px-3 text-sm font-black text-gray-200 disabled:opacity-50">
            {semCompra.isPending ? "Salvando…" : "Não teve compra nesse dia"}
          </button>
        </div>
      )}
      {lido && r ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Relatório lido:</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Loja do relatório</p><p className="mt-1 font-black">{r.loja || "—"}</p></div>
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Dia</p><p className="mt-1 font-black">{dataBr(r.dataFim)}</p></div>
            <div className="rounded-xl border border-white/[0.06] p-3"><p className="text-[10px] font-black uppercase text-gray-500">Produtos comprados</p><p className="mt-1 font-black">{comprados}</p></div>
            <div className={`rounded-xl border p-3 ${errados ? "border-rose-400/25" : "border-emerald-400/25"}`}><p className="text-[10px] font-black uppercase text-gray-500">Para justificar</p><p className={`mt-1 font-black ${errados ? "text-rose-300" : "text-emerald-300"}`}>{errados}</p></div>
          </div>
          {!!conferencia?.notas.length && (
            <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-3 text-xs text-sky-100">
              <p className="font-black">Compra de reposição desconsiderada</p>
              {conferencia.notas.map((n) => <p key={n.documento} className="mt-0.5">Nota {n.documento}: {n.produtos} produtos, {n.pecas.toLocaleString("pt-BR")} peças</p>)}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setLido(null)} className="h-12 flex-1 rounded-xl border border-white/10 text-sm font-black text-gray-400">Trocar arquivo</button>
            <button type="button" disabled={iniciar.isPending || !r.dataFim}
              onClick={() => iniciar.mutate({ lojaId, lojaRelatorio: r.loja, dataRelatorio: r.dataFim!, arquivoNome: lido.arquivo, produtos: r.produtos })}
              className="h-12 flex-[2] rounded-xl bg-[#D4AF37] text-base font-black text-black disabled:opacity-50">
              {iniciar.isPending ? "Enviando…" : errados ? "Começar justificativas" : "Enviar (tudo certo)"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Justificativas({ atual, setErro, onAtualizar }: { atual: Atual; setErro: (s: string) => void; onAtualizar: () => Promise<void> }) {
  const itens = atual.itens;
  const feitos = itens.filter((i) => i.justificativa).length;
  const [indice, setIndice] = useState(Math.max(0, itens.findIndex((i) => !i.justificativa)));
  const [verLista, setVerLista] = useState(false);
  const [texto, setTexto] = useState("");
  const item = itens[Math.min(indice, itens.length - 1)];

  useEffect(() => { setTexto(item?.justificativa || ""); }, [item?.id]);

  const justificar = trpc.estoque.comprasOS.justificar.useMutation({ onError: (e) => setErro(e.message) });
  const concluir = trpc.estoque.comprasOS.concluir.useMutation({ onSuccess: () => void onAtualizar(), onError: (e) => setErro(e.message) });

  if (!item) return null;
  const valido = texto.trim().length >= 5;
  const tudoFeito = feitos === itens.length;

  async function salvar() {
    setErro("");
    await justificar.mutateAsync({ itemId: item.id, justificativa: texto.trim() });
    await onAtualizar();
    const depois = itens.findIndex((i, k) => k > indice && !i.justificativa);
    const qualquer = itens.findIndex((i, k) => k !== indice && !i.justificativa);
    setIndice(depois >= 0 ? depois : qualquer >= 0 ? qualquer : indice);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-3">
        <div className="flex items-center justify-between text-xs font-bold text-gray-400">
          <span>Compras de {dataBr(atual.conferencia.dataRelatorio)}</span>
          <span>{feitos} de {itens.length} justificados</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${(feitos / itens.length) * 100}%` }} /></div>
      </div>

      {verLista ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-3">
          <div className="mb-2 flex items-center justify-between"><p className="font-black">Itens para justificar</p><button type="button" onClick={() => setVerLista(false)} className="rounded-lg p-2 text-gray-400"><X className="h-5 w-5" /></button></div>
          <div className="space-y-1">
            {itens.map((i, k) => (
              <button key={i.id} type="button" onClick={() => { setIndice(k); setVerLista(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${k === indice ? "bg-[#D4AF37]/[0.08]" : "hover:bg-white/[0.03]"}`}>
                {i.justificativa ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white/20" />}
                <span className="w-20 shrink-0 font-black text-[#F2D675]">{i.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{i.item}</span>
              </button>
            ))}
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
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-3 text-sm font-bold text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{item.motivo}
          </div>
          <MovimentosDoDia item={item} />

          <p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-gray-500">Justificativa (obrigatória)</p>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1000}
            placeholder="Explique por que comprou (ex.: a peça do estoque estava com defeito, o carro voltou amanhã, comprou a mais por engano…)"
            className="mt-1 w-full rounded-2xl border border-[#D4AF37]/30 bg-black/40 p-3 text-base text-white outline-none focus:border-[#D4AF37]" />

          <div className="mt-3 flex gap-2">
            <button type="button" disabled={indice === 0} onClick={() => setIndice(indice - 1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-400 disabled:opacity-30"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" disabled={!valido || justificar.isPending} onClick={() => void salvar()}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] text-base font-black text-black disabled:opacity-40">
              <Check className="h-5 w-5" />{justificar.isPending ? "Salvando…" : "Salvar e próximo"}
            </button>
            <button type="button" disabled={indice >= itens.length - 1} onClick={() => setIndice(indice + 1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-gray-400 disabled:opacity-30"><ChevronRight className="h-6 w-6" /></button>
          </div>
        </section>
      )}

      {tudoFeito && (
        <button type="button" disabled={concluir.isPending}
          onClick={() => { if (window.confirm("Concluir? Depois de concluir não dá para mudar as justificativas.")) concluir.mutate({ comprasOsId: atual.conferencia.id }); }}
          className="h-14 w-full rounded-2xl bg-emerald-500 text-base font-black text-black disabled:opacity-50">
          {concluir.isPending ? "Concluindo…" : `Concluir (${itens.length} justificados)`}
        </button>
      )}
    </div>
  );
}

function Resultado({ atual }: { atual: Atual }) {
  const c = atual.conferencia;
  return (
    <section className="mt-4 rounded-3xl border border-white/[0.08] bg-[#0a0a0a] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-500">Último enviado • compras de {dataBr(c.dataRelatorio)}</p>
      {c.totalErrados === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-emerald-200">
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div><p className="text-lg font-black">Tudo certo!</p><p className="text-sm">{c.totalComprados ? `As compras de ${c.totalComprados} produto(s) saíram no mesmo dia.` : "Dia sem compras registrado."}</p></div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-gray-400">{c.totalErrados} item(ns) justificado(s). O supervisor de estoque vai analisar.</p>
          <div className="mt-2 space-y-2">
            {atual.itens.map((i) => (
              <div key={i.id} className="rounded-2xl border border-white/[0.06] p-3">
                <p className="font-black text-[#F2D675]">{i.codigo} <span className="font-bold text-gray-300">{i.item}</span></p>
                <p className="mt-1 text-xs text-rose-200">{i.motivo}</p>
                <p className="mt-1 text-sm text-gray-300">“{i.justificativa}”</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
