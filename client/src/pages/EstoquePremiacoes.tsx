import { AlertTriangle, ArrowLeft, Check, ChevronRight, Clock, Minus, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { INICIO_CICLO, segundaDaSemana, somarDias } from "@shared/estoqueSemanal";
import { DetalheComprasOS } from "./EstoquePainelComprasOS";
import { dataBr } from "./EstoqueSemanal";

// Premiações dos estoquistas: na segunda, quem entregou tudo no prazo na semana que passou ganha a bonificação.
// Card de cada cidade com o resultado e o quadro da semana; clicando, os erros do Compras x OS dia a dia.

type Semana = inferRouterOutputs<AppRouter>["estoque"]["premiacoes"]["semana"];
type Loja = Semana["lojas"][number];
type Sit = Loja["semanal"];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SIT: Record<Sit, { cor: string; texto: string }> = {
  ok: { cor: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25", texto: "No prazo" },
  atrasado: { cor: "bg-amber-400/15 text-amber-200 border-amber-400/30", texto: "Atrasado" },
  falta: { cor: "bg-rose-500/15 text-rose-300 border-rose-400/30", texto: "Não entregou" },
  andamento: { cor: "bg-sky-400/10 text-sky-300 border-sky-400/20", texto: "Em andamento" },
  aguardando: { cor: "bg-white/[0.03] text-gray-500 border-white/10", texto: "Ainda no prazo" },
};

function IconeSit({ s }: { s: Sit }) {
  if (s === "ok") return <Check className="h-4 w-4" />;
  if (s === "falta") return <X className="h-4 w-4" />;
  if (s === "atrasado") return <Clock className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
}

function Celula({ s, erros, titulo }: { s: Sit; erros?: number; titulo: string }) {
  return (
    <div title={`${titulo}: ${SIT[s].texto}`} className={`relative flex h-9 items-center justify-center rounded-lg border ${SIT[s].cor}`}>
      <IconeSit s={s} />
      {!!erros && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{erros}</span>}
    </div>
  );
}

export default function EstoquePremiacoes() {
  const semanas = useMemo(() => {
    const lista: string[] = [];
    for (let s = segundaDaSemana(hojeIso()); s >= INICIO_CICLO && lista.length < 16; s = somarDias(s, -7)) lista.push(s);
    return lista;
  }, []);
  // Abre na semana que passou (a que é paga nesta segunda).
  const [semana, setSemana] = useState(semanas[1] || semanas[0] || INICIO_CICLO);
  const [lojaAberta, setLojaAberta] = useState<number | null>(null);
  const q = trpc.estoque.premiacoes.semana.useQuery({ semanaInicio: semana });
  const lojas = q.data?.lojas || [];
  const ganharam = lojas.filter((l) => l.resultado === "ganhou").length;
  const aberta = lojas.find((l) => l.lojaId === lojaAberta) || null;

  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • supervisor</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Premiações</h1>
          <p className="mt-1 text-sm text-gray-500">Ganha quem entregou tudo no prazo de segunda a sábado. A bonificação é paga na segunda seguinte.</p>
        </div>
        <label className="w-full text-xs font-bold text-gray-400 sm:w-auto">Semana
          <select value={semana} onChange={(e) => { setSemana(e.target.value); setLojaAberta(null); }}
            className="mt-1 block h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white">
            {semanas.map((s, k) => <option key={s} value={s}>{dataBr(s)} a {dataBr(somarDias(s, 5))}{k === 0 ? " (atual)" : k === 1 ? " (semana passada)" : ""}</option>)}
          </select>
        </label>
      </div>

      {q.error && <p className="mt-4 text-sm text-rose-300">{q.error.message}</p>}

      {q.data && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-r from-[#D4AF37]/[0.08] to-transparent p-4">
          <Trophy className="h-8 w-8 text-[#F2D675]" />
          <div className="flex-1">
            <p className="text-2xl font-black">{ganharam} de 6 lojas ganharam</p>
            <p className="text-xs text-gray-400">Regras: Compras x OS no mesmo dia • Resumo de vendas até o dia seguinte (o de sábado até segunda) • Contagem semanal até sábado.</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lojas.map((l) => <CardLoja key={l.lojaId} l={l} onAbrir={() => setLojaAberta(l.lojaId)} />)}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-[11px] text-gray-500">
        {(Object.keys(SIT) as Sit[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded border ${SIT[s].cor}`}><IconeSit s={s} /></span>{SIT[s].texto}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">2</span>Erros no Compras x OS</span>
      </div>

      {aberta && <ErrosDaLoja l={aberta} onFechar={() => setLojaAberta(null)} />}
    </main>
  );
}

function CardLoja({ l, onAbrir }: { l: Loja; onAbrir: () => void }) {
  const selo = l.resultado === "ganhou"
    ? <span className="flex items-center gap-1.5 rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-black text-black"><Trophy className="h-3.5 w-3.5" />Ganhou</span>
    : l.resultado === "nao_ganhou"
      ? <span className="rounded-full bg-rose-500/[0.15] px-3 py-1 text-xs font-black text-rose-200">Não ganhou</span>
      : <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-gray-400">Semana em aberto</span>;
  return (
    <button type="button" onClick={onAbrir}
      className={`rounded-3xl border bg-[#0a0a0a] p-4 text-left transition hover:bg-white/[0.02] ${l.resultado === "ganhou" ? "border-[#D4AF37]/40 shadow-[0_0_40px_-20px_rgba(212,175,55,0.7)]" : l.resultado === "nao_ganhou" ? "border-rose-400/20" : "border-white/[0.08]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-black">{l.loja}</p>
          <p className="truncate text-xs text-gray-500">{l.estoquistas.length ? l.estoquistas.join(", ") : "Sem estoquista cadastrado"}</p>
        </div>
        {selo}
      </div>

      <div className="mt-4 grid grid-cols-[88px_repeat(6,1fr)] items-center gap-1.5 text-center">
        <span />
        {l.dias.map((d) => <span key={d.data} className="text-[10px] font-black uppercase text-gray-500">{d.nome}<br /><span className="font-bold text-gray-600">{d.data.slice(8, 10)}</span></span>)}
        <span className="text-left text-[11px] font-bold text-gray-400">Resumo vendas</span>
        {l.dias.map((d) => <Celula key={d.data} s={d.resumo} titulo="Resumo de vendas" />)}
        <span className="text-left text-[11px] font-bold text-gray-400">Compras x OS</span>
        {l.dias.map((d) => <Celula key={d.data} s={d.compras} erros={d.erros} titulo="Compras x OS" />)}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2">
        <span className="text-[11px] font-bold text-gray-400">Contagem semanal</span>
        <span className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${SIT[l.semanal].cor}`}><IconeSit s={l.semanal} />{SIT[l.semanal].texto}</span>
      </div>

      {l.motivos.length > 0 && (
        <div className="mt-3 space-y-1">
          {l.motivos.slice(0, 3).map((m) => <p key={m} className="flex items-start gap-1.5 text-xs text-rose-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{m}</p>)}
          {l.motivos.length > 3 && <p className="text-xs text-rose-200/70">+ {l.motivos.length - 3} outro(s)</p>}
        </div>
      )}
      <p className="mt-3 flex items-center justify-between text-xs font-bold text-[#F2D675]">
        {l.totalErros ? `${l.totalErros} erro(s) no Compras x OS` : "Nenhum erro no Compras x OS"}
        <ChevronRight className="h-4 w-4" />
      </p>
    </button>
  );
}

// Erros do Compras x OS da loja na semana: dia a dia; clicando no dia abre os erros daquele dia.
function ErrosDaLoja({ l, onFechar }: { l: Loja; onFechar: () => void }) {
  const [dia, setDia] = useState<number | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6" onClick={onFechar}>
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-[#050505] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-5" onClick={(e) => e.stopPropagation()}>
        {dia ? (
          <>
            <button type="button" onClick={() => setDia(null)} className="mb-1 flex items-center gap-1 text-sm font-bold text-[#F2D675]"><ArrowLeft className="h-4 w-4" />Voltar para os dias</button>
            <DetalheComprasOS comprasOsId={dia} onFechar={onFechar} />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black">{l.loja} • Compras x OS</p>
                <p className="text-xs text-gray-500">{l.totalErros} erro(s) na semana. Clique no dia para ver.</p>
              </div>
              <button type="button" onClick={onFechar} className="rounded-xl border border-white/10 p-2 text-gray-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-2">
              {l.dias.map((d) => {
                const podeAbrir = !!d.comprasId && d.erros > 0;
                const texto = !d.comprasId ? SIT[d.compras].texto : d.semCompra ? "Sem compras no dia" : d.erros ? `${d.erros} erro(s) de ${d.comprados} comprados` : `Tudo certo • ${d.comprados} comprados`;
                return (
                  <button key={d.data} type="button" disabled={!podeAbrir} onClick={() => setDia(d.comprasId)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition enabled:hover:bg-white/[0.03] ${d.erros ? "border-rose-400/25 bg-rose-500/[0.03]" : "border-white/[0.06]"}`}>
                    <span className="w-16 shrink-0"><span className="block text-sm font-black">{d.nome}</span><span className="text-xs text-gray-500">{dataBr(d.data).slice(0, 5)}</span></span>
                    <span className={`flex-1 text-sm font-bold ${d.erros ? "text-rose-200" : d.compras === "ok" ? "text-emerald-300" : "text-gray-400"}`}>{texto}</span>
                    {d.compras !== "ok" && d.comprasId && <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black ${SIT[d.compras].cor}`}>{SIT[d.compras].texto}</span>}
                    {d.erros > 0 && <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-black text-white">{d.erros}</span>}
                    {podeAbrir && <ChevronRight className="h-4 w-4 text-gray-600" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
