import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Clock, RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { segundaDaSemana } from "@shared/estoqueSemanal";
import { DetalheResumoVendas } from "./EstoquePainel";
import { DetalheComprasOS } from "./EstoquePainelComprasOS";
import { DetalheSemanal } from "./EstoquePainelSemanal";
import { dataBr } from "./EstoqueSemanal";

// Painel único do supervisor de estoque (no modelo da Gestão RH): as 6 lojas numa tela só,
// com Resumo geral de vendas de itens, Compras x OS e Contagem semanal. Onde tiver algo, clica e abre.

function ontemIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Aberto =
  | { tipo: "resumo"; id: number }
  | { tipo: "compras"; id: number }
  | { tipo: "semanal"; lojaId: number; semanaInicio: string };

type Tom = "ok" | "alerta" | "erro" | "neutro" | "andamento";
const TOM: Record<Tom, string> = {
  ok: "text-emerald-300",
  alerta: "text-amber-200",
  andamento: "text-amber-200",
  erro: "text-rose-300",
  neutro: "text-gray-500",
};
const PONTO: Record<Tom, string> = {
  ok: "bg-emerald-400",
  alerta: "bg-amber-400",
  andamento: "bg-amber-400",
  erro: "bg-rose-400",
  neutro: "bg-white/20",
};

export default function EstoquePainelGeral() {
  const [dia, setDia] = useState(ontemIso());
  const semana = segundaDaSemana(dia);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const resumoQ = trpc.estoque.painel.useQuery({ data: dia });
  const comprasQ = trpc.estoque.comprasOS.painel.useQuery({ data: dia });
  const semanalQ = trpc.estoque.semanal.painel.useQuery({ semanaInicio: semana });
  const pendResumoQ = trpc.estoque.pendencias.useQuery({ lojaId: null });
  const pendComprasQ = trpc.estoque.comprasOS.pendencias.useQuery();
  const pendSemanalQ = trpc.estoque.semanal.pendencias.useQuery();

  // Fecha o detalhe com Esc.
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setAberto(null);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberto]);

  const resumo = resumoQ.data || [];
  const compras = comprasQ.data || [];
  const semanal = semanalQ.data;
  const erro = resumoQ.error || comprasQ.error || semanalQ.error;

  const enviadosResumo = resumo.filter((l) => l.conferencia?.status === "concluida").length;
  const enviadosCompras = compras.filter((l) => l.conferencia?.status === "concluida").length;
  const entreguesSemana = (semanal?.lojas || []).filter((l) => l.status.startsWith("entregue")).length;
  const atrasadasSemana = (semanal?.lojas || []).filter((l) => l.status === "atrasada").length;
  const tratarResumo = resumo.reduce((s, l) => s + l.pendentesTotal, 0);
  const tratarCompras = compras.reduce((s, l) => s + l.pendentesTotal, 0);
  const tratarSemanal = (semanal?.lojas || []).reduce((s, l) => s + l.pendentesTotal, 0);

  const pendencias = [
    ...(pendResumoQ.data || []).map((p) => ({ chave: `r${p.id}`, loja: p.loja, tipo: "Resumo de vendas", quando: `vendas de ${dataBr(p.dataRelatorio)}`, n: p.pendentes, abrir: { tipo: "resumo", id: p.id } as Aberto })),
    ...(pendComprasQ.data || []).map((p) => ({ chave: `c${p.id}`, loja: p.loja, tipo: "Compras x OS", quando: `compras de ${dataBr(p.dataRelatorio)}`, n: p.pendentes, abrir: { tipo: "compras", id: p.id } as Aberto })),
    ...(pendSemanalQ.data || []).map((p) => ({ chave: `s${p.lojaId}-${p.semanaInicio}`, loja: p.loja, tipo: "Contagem semanal", quando: `semana de ${dataBr(p.semanaInicio)}`, n: p.pendentes, abrir: { tipo: "semanal", lojaId: p.lojaId, semanaInicio: p.semanaInicio } as Aberto })),
  ];

  function atualizar() {
    void Promise.all([resumoQ.refetch(), comprasQ.refetch(), semanalQ.refetch(), pendResumoQ.refetch(), pendComprasQ.refetch(), pendSemanalQ.refetch()]);
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • supervisor</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Painel das lojas</h1>
          <p className="mt-1 text-sm text-gray-500">Tudo das 6 lojas numa tela. Clique onde tiver algo para abrir.</p>
        </div>
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <label className="flex-1 text-xs font-bold text-gray-400 sm:flex-none">Dia
            <input type="date" value={dia} onChange={(e) => { if (e.target.value) setDia(e.target.value); setAberto(null); }}
              className="mt-1 block h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" />
          </label>
          <button type="button" onClick={atualizar} aria-label="Atualizar" className="flex h-11 items-center gap-2 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] px-3 text-sm font-bold text-[#F2D675] hover:bg-[#D4AF37]/10">
            <RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {erro && <p className="mt-4 text-sm text-rose-300">{erro.message}</p>}

      {/* Resumo no topo */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Indicador icon={ClipboardCheck} titulo="Resumo geral de vendas" valor={`${enviadosResumo}/6`} legenda={`lojas conferiram as vendas de ${dataBr(dia)}`} tratar={tratarResumo} />
        <Indicador icon={ShoppingCart} titulo="Compras x OS" valor={`${enviadosCompras}/6`} legenda={`lojas enviaram as compras de ${dataBr(dia)}`} tratar={tratarCompras} />
        <Indicador icon={CalendarDays} titulo={semanal?.numero ? `Contagem semanal • semana ${semanal.numero}` : "Contagem semanal"} valor={`${entreguesSemana}/6`}
          legenda={atrasadasSemana ? `entregues • ${atrasadasSemana} atrasada(s)` : "lojas entregaram a semana"} tratar={tratarSemanal} alerta={atrasadasSemana > 0} />
      </div>

      {/* As 6 lojas */}
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {resumo.map((r) => {
          const c = compras.find((x) => x.lojaId === r.lojaId);
          const s = semanal?.lojas.find((x) => x.lojaId === r.lojaId);
          const pendLoja = r.pendentesTotal + (c?.pendentesTotal || 0) + (s?.pendentesTotal || 0);

          const rc = r.conferencia;
          const resumoLinha = !rc
            ? { tom: "neutro" as Tom, texto: "Não enviou" }
            : rc.status === "andamento"
              ? { tom: "andamento" as Tom, texto: `Contando • ${rc.contados} de ${rc.totalItens}` }
              : rc.divergencias
                ? { tom: (rc.pendentes ? "erro" : "ok") as Tom, texto: `${rc.divergencias} diferença(s)${rc.pendentes ? `, ${rc.pendentes} para tratar` : " • tratadas"}` }
                : { tom: "ok" as Tom, texto: `Tudo bateu • ${rc.totalItens} itens` };

          const cc = c?.conferencia;
          const comprasLinha = !cc
            ? { tom: "neutro" as Tom, texto: "Não enviou" }
            : cc.status === "andamento"
              ? { tom: "andamento" as Tom, texto: `Justificando • ${cc.justificados} de ${cc.totalErrados}` }
              : cc.totalErrados
                ? { tom: (cc.pendentes ? "erro" : "ok") as Tom, texto: `${cc.totalErrados} errado(s)${cc.pendentes ? `, ${cc.pendentes} para tratar` : " • tratados"}` }
                : { tom: "ok" as Tom, texto: `Tudo certo • ${cc.totalComprados} comprados${cc.notasReposicao.length ? " • teve reposição" : ""}` };

          const semanalLinha = !s || !semanal?.numero
            ? { tom: "neutro" as Tom, texto: "—" }
            : s.status === "atrasada"
              ? { tom: "erro" as Tom, texto: s.iniciada ? "Atrasada • começou mas não entregou" : "Atrasada • não começou" }
              : s.status === "pendente"
                ? { tom: (s.iniciada ? "andamento" : "neutro") as Tom, texto: s.iniciada ? "Em andamento" : "Não começou" }
                : { tom: (s.pendentes ? "erro" : "ok") as Tom, texto: `${s.status === "entregue_atraso" ? "Entregue com atraso" : "Entregue"}${s.ajustes ? ` • ${s.ajustes} alteração(ões)${s.pendentes ? `, ${s.pendentes} para tratar` : ""}` : " • sem alterações"}` };

          return (
            <section key={r.lojaId} className={`overflow-hidden rounded-3xl border bg-[#0a0a0a] ${pendLoja ? "border-rose-400/25" : "border-white/[0.08]"}`}>
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <p className="text-lg font-black">{r.loja}</p>
                {pendLoja > 0
                  ? <span className="rounded-full bg-rose-500/[0.15] px-2.5 py-1 text-[11px] font-black text-rose-200">{pendLoja} para tratar</span>
                  : <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300/80"><CheckCircle2 className="h-3.5 w-3.5" />Em dia</span>}
              </div>
              <Linha icon={ClipboardCheck} titulo="Resumo de vendas" {...resumoLinha} onClick={rc ? () => setAberto({ tipo: "resumo", id: rc.id }) : undefined} />
              <Linha icon={ShoppingCart} titulo="Compras x OS" {...comprasLinha} onClick={cc && (cc.totalErrados || cc.notasReposicao.length) ? () => setAberto({ tipo: "compras", id: cc.id }) : undefined} />
              <Linha icon={CalendarDays} titulo="Contagem semanal" {...semanalLinha} onClick={s?.iniciada ? () => setAberto({ tipo: "semanal", lojaId: r.lojaId, semanaInicio: semana }) : undefined} />
            </section>
          );
        })}
      </div>

      {/* Tudo que ainda falta tratar, de qualquer dia */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xl font-black">Para tratar</p>
            <p className="text-sm text-gray-500">De qualquer dia, até alguém marcar como tratado.</p>
          </div>
          {pendencias.length > 0 && <span className="rounded-full bg-rose-500/[0.15] px-3 py-1 text-sm font-black text-rose-200">{pendencias.reduce((s, p) => s + p.n, 0)}</span>}
        </div>
        {pendencias.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5 text-sm text-emerald-200">Nada para tratar. Tudo em dia.</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {pendencias.map((p) => (
              <button key={p.chave} type="button" onClick={() => setAberto(p.abrir)}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0a0a] px-4 py-3 text-left transition hover:border-[#D4AF37]/30 hover:bg-white/[0.02]">
                <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] px-2 py-1 text-[11px] font-black text-[#F2D675]">{p.loja}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p.tipo}</span>
                  <span className="block text-xs text-gray-500">{p.quando}</span>
                </span>
                <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-xs font-black text-rose-200">{p.n}</span>
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Detalhe por cima da tela */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setAberto(null)}>
          <div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-[#050505] p-2 pb-[env(safe-area-inset-bottom)] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            {aberto.tipo === "resumo" && <DetalheResumoVendas conferenciaId={aberto.id} onFechar={() => setAberto(null)} />}
            {aberto.tipo === "compras" && <DetalheComprasOS comprasOsId={aberto.id} onFechar={() => setAberto(null)} />}
            {aberto.tipo === "semanal" && <DetalheSemanal lojaId={aberto.lojaId} semanaInicio={aberto.semanaInicio} onFechar={() => setAberto(null)} />}
          </div>
        </div>
      )}
    </main>
  );
}

function Indicador({ icon: Icon, titulo, valor, legenda, tratar, alerta }: { icon: typeof Clock; titulo: string; valor: string; legenda: string; tratar: number; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a] p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500"><Icon className="h-4 w-4 text-[#F2D675]" />{titulo}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className={`text-3xl font-black ${alerta ? "text-rose-300" : "text-white"}`}>{valor}</p>
          <p className="text-xs text-gray-500">{legenda}</p>
        </div>
        {tratar > 0
          ? <span className="flex items-center gap-1 rounded-full bg-rose-500/[0.15] px-2.5 py-1 text-xs font-black text-rose-200"><AlertTriangle className="h-3.5 w-3.5" />{tratar} para tratar</span>
          : <span className="text-xs font-bold text-emerald-300/80">nada para tratar</span>}
      </div>
    </div>
  );
}

function Linha({ icon: Icon, titulo, tom, texto, onClick }: { icon: typeof Clock; titulo: string; tom: Tom; texto: ReactNode; onClick?: () => void }) {
  const conteudo = (
    <>
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[tom]}`} />
      <Icon className="h-4 w-4 shrink-0 text-gray-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-black uppercase tracking-wider text-gray-500">{titulo}</span>
        <span className={`block truncate text-sm font-bold ${TOM[tom]}`}>{texto}</span>
      </span>
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition last:border-0 hover:bg-white/[0.03]">{conteudo}</button>
  ) : (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0">{conteudo}</div>
  );
}
