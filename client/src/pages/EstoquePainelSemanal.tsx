import { CheckCircle2, FileText, Image as ImageIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { INICIO_CICLO, segundaDaSemana, semanaDoCiclo, somarDias } from "@shared/estoqueSemanal";
import { FotoFolha, STATUS_SEMANA, dataBr } from "./EstoqueSemanal";

// Painel do supervisor: contagem semanal das 6 lojas, com as fotos das folhas e as alterações para tratar.

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const qtd = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export default function EstoquePainelSemanal() {
  const semanas = useMemo(() => {
    const lista: string[] = [];
    for (let s = segundaDaSemana(hojeIso()); s >= INICIO_CICLO && lista.length < 16; s = somarDias(s, -7)) lista.push(s);
    return lista;
  }, []);
  const [semana, setSemana] = useState(semanas[0] || INICIO_CICLO);
  const [loja, setLoja] = useState<number | null>(null);
  const painelQ = trpc.estoque.semanal.painel.useQuery({ semanaInicio: semana });
  const pendenciasQ = trpc.estoque.semanal.pendencias.useQuery();
  const p = painelQ.data;

  return (
    <main className="mx-auto max-w-6xl p-3 pb-16 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • supervisor</p>
          <h1 className="mt-1 text-2xl font-black">Contagem semanal das lojas</h1>
          {p && <p className="mt-1 text-sm text-gray-500">Semana {p.numero}: {p.grupos.join(", ")}</p>}
        </div>
        <label className="w-full text-xs font-bold text-gray-400 sm:w-auto">Semana
          <select value={semana} onChange={(e) => { setSemana(e.target.value); setLoja(null); }} className="mt-1 block h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white">
            {semanas.map((s) => <option key={s} value={s}>Semana {semanaDoCiclo(s)} • {dataBr(s)} a {dataBr(somarDias(s, 5))}</option>)}
          </select>
        </label>
      </div>

      {painelQ.error && <p className="mt-4 text-sm text-rose-300">{painelQ.error.message}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(p?.lojas || []).map((l) => {
          const st = STATUS_SEMANA[l.status];
          return (
            <button key={l.lojaId} type="button" disabled={!l.iniciada} onClick={() => setLoja(l.lojaId)}
              className={`rounded-2xl border bg-[#0a0a0a] p-4 text-left transition enabled:hover:bg-white/[0.02] ${st.cor} ${loja === l.lojaId ? "ring-2 ring-[#D4AF37]/50" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-black text-white">{l.loja}</p>
                {l.pendentesTotal > 0 && <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-[10px] font-black text-rose-200">{l.pendentesTotal} pendente(s) no total</span>}
              </div>
              <p className="mt-2 text-sm font-bold">{st.texto}{!l.iniciada && l.status !== "atrasada" ? " • não começou" : ""}</p>
              {l.status.startsWith("entregue") && <p className="mt-1 text-xs text-gray-400">{l.ajustes ? `${l.ajustes} alteração(ões)${l.pendentes ? `, ${l.pendentes} para tratar` : ", todas tratadas"}` : "Sem alterações"} • {l.entreguePorNome}</p>}
            </button>
          );
        })}
      </div>

      {loja && <DetalheSemanal lojaId={loja} semanaInicio={semana} onFechar={() => setLoja(null)} />}

      {(pendenciasQ.data || []).length > 0 && (
        <section className="mt-6 rounded-3xl border border-rose-400/20 bg-[#0a0a0a] p-4">
          <p className="font-black">Alterações ainda sem tratar</p>
          <p className="text-xs text-gray-500">De qualquer semana, até alguém marcar como tratada.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(pendenciasQ.data || []).map((x) => (
              <button key={`${x.lojaId}-${x.semanaInicio}`} type="button" onClick={() => { setSemana(x.semanaInicio); setLoja(x.lojaId); }}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="text-sm"><b>{x.loja}</b> <span className="text-gray-500">• semana de {dataBr(x.semanaInicio)}</span></span>
                <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-xs font-black text-rose-200">{x.pendentes}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export function DetalheSemanal({ lojaId, semanaInicio, onFechar }: { lojaId: number; semanaInicio: string; onFechar: () => void }) {
  const utils = trpc.useUtils();
  const semanaQ = trpc.estoque.semanal.semana.useQuery({ lojaId, semanaInicio });
  const [verFoto, setVerFoto] = useState<number | null>(null);
  const [obs, setObs] = useState<Record<number, string>>({});
  const tratar = trpc.estoque.semanal.tratar.useMutation({
    onSuccess: async () => { await Promise.all([utils.estoque.semanal.semana.invalidate(), utils.estoque.semanal.painel.invalidate(), utils.estoque.semanal.pendencias.invalidate()]); },
  });
  const s = semanaQ.data;
  if (semanaQ.error) return <p className="mt-4 text-sm text-rose-300">{semanaQ.error.message}</p>;
  if (!s) return <p className="mt-4 text-sm text-gray-500">Carregando…</p>;
  const entregue = s.status.startsWith("entregue");

  return (
    <section className="mt-5 rounded-3xl border border-[#D4AF37]/25 bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">{s.loja} • semana {s.numero} ({dataBr(s.semanaInicio)} a {dataBr(s.semanaFim)})</p>
          <p className="text-xs text-gray-500">{STATUS_SEMANA[s.status].texto}{s.entreguePorNome ? ` por ${s.entreguePorNome}` : ""}</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-xl border border-white/10 p-2 text-gray-400"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-3 space-y-3">
        {s.grupos.map((g) => (
          <div key={g.grupo} className="rounded-2xl border border-white/[0.08] p-3">
            <p className="font-black">{g.nome}</p>
            <p className="mt-1 text-xs text-gray-400">
              <FileText className="mr-1 inline h-3.5 w-3.5" />{g.totalItens ? `${g.totalItens} itens • ${qtd(g.totalQtd)} peças no sistema` : "Sem relatório"}
              {g.semAlteracao && <span className="ml-2 font-bold text-emerald-300">• sem alteração</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.fotos.map((f, k) => (
                <button key={f.id} type="button" onClick={() => setVerFoto(f.id)} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-bold text-gray-300"><ImageIcon className="h-4 w-4" />Folha {k + 1}</button>
              ))}
              {!g.fotos.length && <span className="text-xs text-gray-600">Sem fotos.</span>}
            </div>
            {g.ajustes.map((a) => (
              <div key={a.id} className={`mt-2 rounded-xl border p-2.5 ${a.tratado ? "border-white/10" : "border-rose-400/25 bg-rose-500/[0.03]"}`}>
                <p className="text-sm"><b className="text-[#F2D675]">{a.codigo}</b> <span className="text-gray-400">{a.item}</span></p>
                <p className="text-xs text-gray-400">Sistema <b className="text-white">{qtd(a.qtdSistema)}</b> • Contado <b className="text-white">{qtd(a.qtdContada)}</b>{a.qtdSistema != null && <b className={a.qtdContada - a.qtdSistema > 0 ? " text-sky-300" : " text-rose-300"}> ({a.qtdContada - a.qtdSistema > 0 ? "+" : ""}{qtd(a.qtdContada - a.qtdSistema)})</b>}</p>
                {a.obs && <p className="text-xs text-gray-300">{a.obs}</p>}
                {entregue && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {a.tratado ? (
                      <>
                        <span className="text-xs text-emerald-300"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Tratado por {a.tratadoPorNome}{a.tratadoObs ? `: ${a.tratadoObs}` : ""}</span>
                        <button type="button" onClick={() => tratar.mutate({ ajusteId: a.id, tratado: false, obs: "" })} className="text-[11px] font-bold text-gray-500 underline">desfazer</button>
                      </>
                    ) : (
                      <>
                        <input value={obs[a.id] ?? ""} onChange={(e) => setObs({ ...obs, [a.id]: e.target.value })} placeholder="O que foi feito (ex.: estoque ajustado no sistema)"
                          className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none" />
                        <button type="button" disabled={tratar.isPending} onClick={() => tratar.mutate({ ajusteId: a.id, tratado: true, obs: obs[a.id] || "" })} className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black disabled:opacity-50">Marcar como tratado</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {verFoto && <FotoFolha fotoId={verFoto} onFechar={() => setVerFoto(null)} />}
    </section>
  );
}
