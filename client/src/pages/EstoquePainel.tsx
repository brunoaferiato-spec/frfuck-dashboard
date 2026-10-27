import { AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

// Painel do supervisor de estoque: as 6 lojas no dia, quem já conferiu, as diferenças com foto e o tratamento.

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
const qtd = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export default function EstoquePainel() {
  const [data, setData] = useState(ontemIso());
  const [aberta, setAberta] = useState<number | null>(null);
  const painelQ = trpc.estoque.painel.useQuery({ data });
  const pendenciasQ = trpc.estoque.pendencias.useQuery({ lojaId: null });

  return (
    <main className="mx-auto max-w-6xl p-3 pb-16 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • supervisor</p>
          <h1 className="mt-1 text-2xl font-black">Painel das lojas</h1>
          <p className="mt-1 text-sm text-gray-500">Conferência das vendas do dia escolhido (normalmente, ontem).</p>
        </div>
        <label className="text-xs font-bold text-gray-400">Vendas do dia
          <input type="date" value={data} onChange={(e) => { setData(e.target.value); setAberta(null); }} className="mt-1 block h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
      </div>

      {painelQ.error && <p className="mt-4 text-sm text-rose-300">{painelQ.error.message}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(painelQ.data || []).map((l) => {
          const c = l.conferencia;
          const cor = !c ? "border-white/10" : c.status === "andamento" ? "border-amber-400/30" : c.divergencias ? "border-rose-400/30" : "border-emerald-400/30";
          return (
            <button key={l.lojaId} type="button" disabled={!c} onClick={() => c && setAberta(c.id)}
              className={`rounded-2xl border bg-[#0a0a0a] p-4 text-left transition enabled:hover:bg-white/[0.02] ${cor} ${aberta === c?.id ? "ring-2 ring-[#D4AF37]/50" : ""}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-black">{l.loja}</p>
                {l.pendentesTotal > 0 && <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-[10px] font-black text-rose-200">{l.pendentesTotal} pendente(s) no total</span>}
              </div>
              {!c ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500"><Clock className="h-4 w-4" />Ainda não enviou a conferência</p>
              ) : c.status === "andamento" ? (
                <p className="mt-2 text-sm text-amber-200">Em andamento • {c.contados} de {c.totalItens} itens</p>
              ) : c.divergencias === 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Concluída • tudo bateu ({c.totalItens} itens)</p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />Concluída • {c.divergencias} diferença(s){c.pendentes ? `, ${c.pendentes} para tratar` : ", todas tratadas"}</p>
              )}
              {c && <p className="mt-1 text-[11px] text-gray-600">{c.criadoPorNome}{c.concluidaPorNome ? ` • concluída por ${c.concluidaPorNome}` : ""}</p>}
            </button>
          );
        })}
      </div>

      {aberta && <Detalhe conferenciaId={aberta} onFechar={() => setAberta(null)} />}

      {(pendenciasQ.data || []).length > 0 && (
        <section className="mt-6 rounded-3xl border border-rose-400/20 bg-[#0a0a0a] p-4">
          <p className="font-black">Diferenças ainda sem tratar</p>
          <p className="text-xs text-gray-500">De qualquer dia, até alguém marcar como tratada.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(pendenciasQ.data || []).map((p) => (
              <button key={p.id} type="button" onClick={() => setAberta(p.id)} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2.5 text-left hover:bg-white/[0.03]">
                <span className="text-sm"><b>{p.loja}</b> <span className="text-gray-500">• vendas de {dataBr(p.dataRelatorio)}</span></span>
                <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-xs font-black text-rose-200">{p.pendentes}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Detalhe({ conferenciaId, onFechar }: { conferenciaId: number; onFechar: () => void }) {
  const utils = trpc.useUtils();
  const detalheQ = trpc.estoque.detalhe.useQuery({ conferenciaId });
  const [soDiferencas, setSoDiferencas] = useState(true);
  const [fotoDe, setFotoDe] = useState<number | null>(null);
  const [obs, setObs] = useState<Record<number, string>>({});
  const tratar = trpc.estoque.tratar.useMutation({
    onSuccess: async () => { await Promise.all([utils.estoque.detalhe.invalidate(), utils.estoque.painel.invalidate(), utils.estoque.pendencias.invalidate()]); },
  });
  const d = detalheQ.data;
  const itens = useMemo(() => (d?.itens || []).filter((i) => !soDiferencas || (i.diferenca != null && i.diferenca !== 0)), [d, soDiferencas]);

  if (!d) return <p className="mt-4 text-sm text-gray-500">Carregando…</p>;
  const concluida = d.conferencia.status === "concluida";

  return (
    <section className="mt-5 rounded-3xl border border-[#D4AF37]/25 bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">{d.conferencia.loja} • vendas de {dataBr(d.conferencia.dataRelatorio)}</p>
          <p className="text-xs text-gray-500">{d.conferencia.totalItens} itens • {concluida ? `concluída por ${d.conferencia.concluidaPorNome}` : "em andamento"}</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-xl border border-white/10 p-2 text-gray-400"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setSoDiferencas(true)} className={`h-9 rounded-xl px-3 text-xs font-black ${soDiferencas ? "bg-[#D4AF37] text-black" : "border border-white/10 text-gray-400"}`}>Só diferenças</button>
        <button type="button" onClick={() => setSoDiferencas(false)} className={`h-9 rounded-xl px-3 text-xs font-black ${!soDiferencas ? "bg-[#D4AF37] text-black" : "border border-white/10 text-gray-400"}`}>Todos os itens</button>
      </div>

      {itens.length === 0 ? (
        <p className="mt-4 text-sm text-emerald-300">{soDiferencas ? "Nenhuma diferença nessa conferência." : "Sem itens."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {itens.map((i) => {
            const diverge = i.diferenca != null && i.diferenca !== 0;
            return (
              <div key={i.id} className={`rounded-2xl border p-3 ${diverge ? (i.tratado ? "border-white/10" : "border-rose-400/25 bg-rose-500/[0.03]") : "border-white/[0.06]"}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="min-w-0 flex-1"><b className="text-[#F2D675]">{i.codigo}</b> <span className="text-sm text-gray-300">{i.item}</span></p>
                  <span className="text-xs text-gray-500">Vendido <b className="text-gray-300">{qtd(i.qtdVendida)}</b></span>
                  <span className="text-xs text-gray-500">Sistema <b className="text-white">{qtd(i.estoqueSistema)}</b></span>
                  <span className="text-xs text-gray-500">Contado <b className="text-white">{qtd(i.quantidadeContada)}</b></span>
                  {diverge && <span className={`text-sm font-black ${Number(i.diferenca) > 0 ? "text-sky-300" : "text-rose-300"}`}>{Number(i.diferenca) > 0 ? "+" : ""}{qtd(i.diferenca)}</span>}
                  {i.temFoto && <button type="button" onClick={() => setFotoDe(fotoDe === i.id ? null : i.id)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-gray-300"><ImageIcon className="h-3.5 w-3.5" />Foto</button>}
                </div>
                {fotoDe === i.id && <Foto itemId={i.id} />}
                {diverge && concluida && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {i.tratado ? (
                      <>
                        <span className="text-xs text-emerald-300"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Tratado por {i.tratadoPorNome}{i.tratadoObs ? `: ${i.tratadoObs}` : ""}</span>
                        <button type="button" onClick={() => tratar.mutate({ itemId: i.id, tratado: false, obs: "" })} className="text-[11px] font-bold text-gray-500 underline">desfazer</button>
                      </>
                    ) : (
                      <>
                        <input value={obs[i.id] ?? ""} onChange={(e) => setObs({ ...obs, [i.id]: e.target.value })} placeholder="O que foi feito (ex.: estoque ajustado, peça achada em outra prateleira)"
                          className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none" />
                        <button type="button" disabled={tratar.isPending} onClick={() => tratar.mutate({ itemId: i.id, tratado: true, obs: obs[i.id] || "" })} className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black disabled:opacity-50">Marcar como tratado</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Foto({ itemId }: { itemId: number }) {
  const fotoQ = trpc.estoque.foto.useQuery({ itemId });
  if (fotoQ.isLoading) return <p className="mt-2 text-xs text-gray-500">Carregando foto…</p>;
  if (!fotoQ.data) return <p className="mt-2 text-xs text-gray-500">Foto não disponível (as fotos ficam guardadas por 30 dias).</p>;
  return <img src={`data:${fotoQ.data.mime};base64,${fotoQ.data.base64}`} alt="Foto da contagem" className="mt-2 max-h-96 rounded-xl border border-white/10 object-contain" />;
}
