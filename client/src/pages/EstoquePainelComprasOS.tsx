import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { MovimentosDoDia } from "./EstoqueComprasOS";

// Painel do supervisor: Compras x OS das 6 lojas no dia, as justificativas dos estoquistas e o tratamento.

function ontemIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function EstoquePainelComprasOS() {
  const [data, setData] = useState(ontemIso());
  const [aberta, setAberta] = useState<number | null>(null);
  const painelQ = trpc.estoque.comprasOS.painel.useQuery({ data });
  const pendenciasQ = trpc.estoque.comprasOS.pendencias.useQuery();

  return (
    <main className="mx-auto max-w-6xl p-3 pb-16 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • supervisor</p>
          <h1 className="mt-1 text-2xl font-black">Compras x OS das lojas</h1>
          <p className="mt-1 text-sm text-gray-500">Compras que não saíram no mesmo dia ou feitas com a peça no estoque, com a justificativa do estoquista.</p>
        </div>
        <label className="w-full text-xs font-bold text-gray-400 sm:w-auto">Compras do dia
          <input type="date" value={data} onChange={(e) => { setData(e.target.value); setAberta(null); }} className="mt-1 block h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
      </div>

      {painelQ.error && <p className="mt-4 text-sm text-rose-300">{painelQ.error.message}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(painelQ.data || []).map((l) => {
          const c = l.conferencia;
          const cor = !c ? "border-white/10" : c.status === "andamento" ? "border-amber-400/30" : c.totalErrados ? "border-rose-400/30" : "border-emerald-400/30";
          return (
            <button key={l.lojaId} type="button" disabled={!c || !c.totalErrados} onClick={() => c && setAberta(c.id)}
              className={`rounded-2xl border bg-[#0a0a0a] p-4 text-left transition enabled:hover:bg-white/[0.02] ${cor} ${aberta === c?.id ? "ring-2 ring-[#D4AF37]/50" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-black">{l.loja}</p>
                {l.pendentesTotal > 0 && <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-[10px] font-black text-rose-200">{l.pendentesTotal} pendente(s) no total</span>}
              </div>
              {!c ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Clock className="h-4 w-4" />Ainda não enviou</p>
              ) : c.status === "andamento" ? (
                <p className="mt-2 text-sm text-amber-200">Justificando • {c.justificados} de {c.totalErrados} itens</p>
              ) : c.totalErrados === 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Tudo certo ({c.totalComprados} produtos comprados)</p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />{c.totalErrados} de {c.totalComprados} comprados errados{c.pendentes ? `, ${c.pendentes} para tratar` : ", todos tratados"}</p>
              )}
              {c && <p className="mt-1 text-[11px] text-gray-600">{c.criadoPorNome}{c.concluidaPorNome ? ` • concluído por ${c.concluidaPorNome}` : ""}</p>}
            </button>
          );
        })}
      </div>

      {aberta && <DetalheComprasOS comprasOsId={aberta} onFechar={() => setAberta(null)} />}

      {(pendenciasQ.data || []).length > 0 && (
        <section className="mt-6 rounded-3xl border border-rose-400/20 bg-[#0a0a0a] p-4">
          <p className="font-black">Itens ainda sem tratar</p>
          <p className="text-xs text-gray-500">De qualquer dia, até alguém marcar como tratado.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(pendenciasQ.data || []).map((p) => (
              <button key={p.id} type="button" onClick={() => setAberta(p.id)} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="text-sm"><b>{p.loja}</b> <span className="text-gray-500">• compras de {dataBr(p.dataRelatorio)}</span></span>
                <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-xs font-black text-rose-200">{p.pendentes}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export function DetalheComprasOS({ comprasOsId, onFechar }: { comprasOsId: number; onFechar: () => void }) {
  const utils = trpc.useUtils();
  const detalheQ = trpc.estoque.comprasOS.detalhe.useQuery({ comprasOsId });
  const [obs, setObs] = useState<Record<number, string>>({});
  const [verMov, setVerMov] = useState<number | null>(null);
  const tratar = trpc.estoque.comprasOS.tratar.useMutation({
    onSuccess: async () => { await Promise.all([utils.estoque.comprasOS.detalhe.invalidate(), utils.estoque.comprasOS.painel.invalidate(), utils.estoque.comprasOS.pendencias.invalidate()]); },
  });
  const d = detalheQ.data;
  if (!d) return <p className="mt-4 text-sm text-gray-500">Carregando…</p>;
  const concluida = d.conferencia.status === "concluida";

  return (
    <section className="mt-5 rounded-3xl border border-[#D4AF37]/25 bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">{d.conferencia.loja} • compras de {dataBr(d.conferencia.dataRelatorio)}</p>
          <p className="text-xs text-gray-500">{d.conferencia.totalErrados} errado(s) de {d.conferencia.totalComprados} comprados • {concluida ? `concluído por ${d.conferencia.concluidaPorNome}` : "estoquista ainda justificando"}</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-xl border border-white/10 p-2 text-gray-400"><X className="h-4 w-4" /></button>
      </div>

      {d.conferencia.notasReposicao.length > 0 && (
        <div className="mt-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-3 text-xs text-sky-100">
          <p className="font-black">Notas tratadas como compra de reposição (desconsideradas)</p>
          {d.conferencia.notasReposicao.map((n) => <p key={n.documento} className="mt-0.5">Nota {n.documento}: {n.produtos} produtos, {n.pecas.toLocaleString("pt-BR")} peças</p>)}
        </div>
      )}
      {d.itens.length === 0 && <p className="mt-3 text-sm text-emerald-300">Nenhum item errado nesse dia.</p>}

      <div className="mt-3 space-y-2">
        {d.itens.map((i) => (
          <div key={i.id} className={`rounded-2xl border p-3 ${i.tratado ? "border-white/10" : "border-rose-400/25 bg-rose-500/[0.03]"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1"><b className="text-[#F2D675]">{i.codigo}</b> <span className="text-sm text-gray-300">{i.item}</span></p>
              <button type="button" onClick={() => setVerMov(verMov === i.id ? null : i.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-gray-300">Movimentos</button>
            </div>
            <p className="mt-1 text-xs font-bold text-rose-200">{i.motivo}</p>
            {verMov === i.id && <MovimentosDoDia item={i} />}
            <p className="mt-2 text-sm">
              {i.justificativa ? <><span className="text-gray-500">Justificativa ({i.justificadoPorNome}): </span><span className="text-white">{i.justificativa}</span></> : <span className="text-gray-500">Sem justificativa ainda.</span>}
            </p>
            {concluida && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {i.tratado ? (
                  <>
                    <span className="text-xs text-emerald-300"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Tratado por {i.tratadoPorNome}{i.tratadoObs ? `: ${i.tratadoObs}` : ""}</span>
                    <button type="button" onClick={() => tratar.mutate({ itemId: i.id, tratado: false, obs: "" })} className="text-[11px] font-bold text-gray-500 underline">desfazer</button>
                  </>
                ) : (
                  <>
                    <input value={obs[i.id] ?? ""} onChange={(e) => setObs({ ...obs, [i.id]: e.target.value })} placeholder="O que foi feito (ex.: justificativa aceita, conversado com o estoquista)"
                      className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none" />
                    <button type="button" disabled={tratar.isPending} onClick={() => tratar.mutate({ itemId: i.id, tratado: true, obs: obs[i.id] || "" })} className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black disabled:opacity-50">Marcar como tratado</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
