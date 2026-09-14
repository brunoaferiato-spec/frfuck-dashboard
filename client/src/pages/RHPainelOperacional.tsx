import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

const PERIODOS_SEMANA = [
  { periodo: "entrada", hora: "10:00", curto: "Entrada" },
  { periodo: "saida_almoco", hora: "12:30", curto: "Saída almoço" },
  { periodo: "retorno_almoco", hora: "14:30", curto: "Retorno" },
  { periodo: "saida", hora: "17:45", curto: "Saída" },
] as const;

const PERIODOS_SABADO = [
  { periodo: "entrada", hora: "10:00", curto: "Entrada" },
  { periodo: "saida", hora: "13:00", curto: "Saída" },
] as const;

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function formatarDataCabecalho() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function minutosAgora() {
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes();
}

function minutosHorario(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function numeroData(valor?: string | null) {
  return Number(String(valor || "").slice(0, 10).replace(/-/g, "")) || 0;
}

function dataLocal(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function diasAte(valor?: string | null) {
  const alvo = dataLocal(valor);
  if (!alvo) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

type Atencao = {
  id: string;
  label: string;
  quantidade: number;
  rota: string;
  critica?: boolean;
};

export default function RHPainelOperacional() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const hoje = hojeCivil();
  const diaSemana = new Date().getDay();
  const domingo = diaSemana === 0;
  const sabado = diaSemana === 6;
  const periodos = sabado ? PERIODOS_SABADO : PERIODOS_SEMANA;

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const podeVer =
    (role === "rh" && lojaUsuario <= 0) || role === "admin" || role === "gestor";

  const pontoQuery = trpc.rhPonto.historico.useQuery(
    { dataInicio: hoje, dataFim: hoje, lojaId: null },
    { enabled: podeVer && !domingo, retry: false, refetchOnWindowFocus: true }
  );

  const pendenciasQuery = trpc.rhPonto.pendencias.useQuery(
    { lojaId: null },
    { enabled: podeVer, retry: false, refetchOnWindowFocus: true }
  );

  const caixaQuery = trpc.rhCaixa.historico.useQuery(
    { dataInicio: hoje, dataFim: hoje, lojaId: null },
    { enabled: podeVer && !domingo, retry: false, refetchOnWindowFocus: true }
  );

  const episQuery = trpc.rhEpis.listar.useQuery(
    {
      lojaId: null,
      funcionarioId: null,
      item: null,
      dataInicio: null,
      dataFim: null,
    },
    { enabled: podeVer, retry: false, refetchOnWindowFocus: true }
  );

  const feriasQuery = trpc.rhFerias.vencimentos.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const experienciasQuery = trpc.rhExperiencia.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const rescisoesQuery = trpc.rhRescisoes.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const dadosPorLoja = useMemo(() => {
    const historico = (pontoQuery.data || []) as any[];
    const pendencias = (pendenciasQuery.data || []) as any[];
    const caixas = (caixaQuery.data || []) as any[];
    const epis = (episQuery.data || []) as any[];
    const ferias = (feriasQuery.data || []) as any[];
    const experiencias = (experienciasQuery.data || []) as any[];
    const rescisoes = (rescisoesQuery.data || []) as any[];

    const ultimoEpi = new Map<string, any>();
    for (const entrega of epis) {
      if (!entrega.proximaTroca) continue;
      const chave = `${entrega.lojaId}:${entrega.funcionarioId}:${entrega.item}`;
      const atual = ultimoEpi.get(chave);
      if (
        !atual ||
        numeroData(entrega.dataEntrega) > numeroData(atual.dataEntrega) ||
        (numeroData(entrega.dataEntrega) === numeroData(atual.dataEntrega) &&
          Number(entrega.id) > Number(atual.id))
      ) {
        ultimoEpi.set(chave, entrega);
      }
    }

    return LOJAS.map((loja) => {
      const conferenciasLoja = historico.filter(
        (item) => Number(item.lojaId) === loja.id
      );
      const pendenciasLoja = pendencias.filter(
        (item) => Number(item.lojaId) === loja.id
      );
      const caixa = caixas.find((item) => Number(item.lojaId) === loja.id) || null;

      const ponto = periodos.map((periodo) => {
        const conferencia = conferenciasLoja.find(
          (item) => String(item.periodo) === periodo.periodo
        );

        const pendenciasPeriodo = pendenciasLoja.filter(
          (item) => String(item.periodo) === periodo.periodo
        ).length;

        const passouHorario = minutosAgora() >= minutosHorario(periodo.hora);

        return {
          ...periodo,
          ok: Boolean(conferencia),
          pendencias: pendenciasPeriodo,
          atrasado: !conferencia && passouHorario,
        };
      });

      const documentosPendentes = pendenciasLoja.filter(
        (item) => item.fase === "documento"
      ).length;

      const episVencidos = Array.from(ultimoEpi.values()).filter((item) => {
        if (Number(item.lojaId) !== loja.id) return false;
        const dias = diasAte(item.proximaTroca);
        return dias !== null && dias <= -1;
      }).length;

      const feriasAtencao = ferias.filter((item) => {
        if (Number(item.lojaId) !== loja.id) return false;
        const diasLimite = Number(item.diasAteLimiteRetorno);
        const diasInicioSeguro = Number(item.diasAteUltimoInicio30);

        if (!Number.isFinite(diasLimite) || !Number.isFinite(diasInicioSeguro)) {
          return false;
        }

        return diasLimite < 0 || diasInicioSeguro <= 60;
      }).length;

      const experienciasAtencao = experiencias.filter((item) => {
        if (Number(item.lojaId) !== loja.id) return false;
        if (item.primeiraDecisao === "encerrar" || item.segundaDecisao) return false;

        const segundo = item.primeiraDecisao === "prorrogar";
        const prazo = segundo ? item.fimSegundoPeriodo : item.fimPrimeiroPeriodo;
        const dias = diasAte(prazo);

        if (dias === null) return false;
        return segundo ? dias <= 15 : dias <= 10;
      }).length;

      const rescisoesAbertas = rescisoes.filter(
        (item) =>
          Number(item.lojaId) === loja.id &&
          ["aguardando_rh", "em_andamento"].includes(String(item.status || ""))
      ).length;

      const atencoes: Atencao[] = [
        {
          id: "documentos",
          label: "Documentos",
          quantidade: documentosPendentes,
          rota: "/rh/gestao/detalhes",
          critica: documentosPendentes > 0,
        },
        {
          id: "epis",
          label: "EPIs",
          quantidade: episVencidos,
          rota: "/rh/epis",
          critica: episVencidos > 0,
        },
        {
          id: "ferias",
          label: "Férias",
          quantidade: feriasAtencao,
          rota: "/rh/ferias",
        },
        {
          id: "experiencia",
          label: "Experiência",
          quantidade: experienciasAtencao,
          rota: "/rh/experiencia",
        },
        {
          id: "rescisoes",
          label: "Rescisões",
          quantidade: rescisoesAbertas,
          rota: "/rh/rescisoes",
        },
      ].filter((item) => item.quantidade > 0);

      const pontoPendente = pendenciasLoja.length;
      const pontoAtrasado = ponto.some((item) => item.atrasado);
      const caixaDiferenca = caixa ? Math.abs(Number(caixa.diferenca || 0)) >= 0.005 : false;

      const critico =
        pontoPendente > 0 ||
        pontoAtrasado ||
        documentosPendentes > 0 ||
        episVencidos > 0;

      const atencao =
        !critico &&
        (caixaDiferenca ||
          feriasAtencao > 0 ||
          experienciasAtencao > 0 ||
          rescisoesAbertas > 0);

      return {
        ...loja,
        ponto,
        pontoPendente,
        caixa,
        caixaDiferenca,
        atencoes,
        critico,
        atencao,
        emDia: !critico && !atencao,
      };
    });
  }, [
    pontoQuery.data,
    pendenciasQuery.data,
    caixaQuery.data,
    episQuery.data,
    feriasQuery.data,
    experienciasQuery.data,
    rescisoesQuery.data,
    periodos,
  ]);

  const resumo = useMemo(() => {
    const criticas = dadosPorLoja.filter((loja) => loja.critico).length;
    const atencao = dadosPorLoja.filter((loja) => loja.atencao).length;
    const emDia = dadosPorLoja.filter((loja) => loja.emDia).length;

    const totalPendencias = dadosPorLoja.reduce(
      (total, loja) =>
        total +
        loja.pontoPendente +
        loja.atencoes.reduce((soma, item) => soma + item.quantidade, 0),
      0
    );

    return { criticas, atencao, emDia, totalPendencias };
  }, [dadosPorLoja]);

  const carregando = [
    pontoQuery,
    pendenciasQuery,
    caixaQuery,
    episQuery,
    feriasQuery,
    experienciasQuery,
    rescisoesQuery,
  ].some((query) => query.isLoading);

  function atualizar() {
    pontoQuery.refetch();
    pendenciasQuery.refetch();
    caixaQuery.refetch();
    episQuery.refetch();
    feriasQuery.refetch();
    experienciasQuery.refetch();
    rescisoesQuery.refetch();
  }

  if (!podeVer) return null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#050505] text-white">
      

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#080808]/95 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-lg font-black text-white">Visão Geral das Lojas</h2>
              {!carregando && (
                <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300 xl:inline">
                  dados atualizados
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-600">
              <span>6 lojas</span>
              <span className="text-emerald-400">{resumo.emDia} em dia</span>
              <span className="text-amber-300">{resumo.atencao} atenção</span>
              <span className="text-rose-300">{resumo.criticas} críticas</span>
              <span>{resumo.totalPendencias} pendências</span>
            </div>
          </div>

          <button
            type="button"
            onClick={atualizar}
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-3 text-[11px] font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-2 p-2">
          {dadosPorLoja.map((loja) => {
            const borda = loja.critico
              ? "border-rose-400/30"
              : loja.atencao
              ? "border-[#D4AF37]/35"
              : "border-emerald-400/20";

            return (
              <article
                key={loja.id}
                className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[#0b0b0b] ${borda}`}
              >
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        loja.critico
                          ? "bg-rose-400"
                          : loja.atencao
                          ? "bg-[#D4AF37]"
                          : "bg-emerald-400"
                      }`}
                    />
                    <h3 className="truncate text-sm font-black uppercase tracking-wide text-white">
                      {loja.nome}
                    </h3>
                  </div>

                  <span
                    className={`shrink-0 text-[9px] font-black uppercase ${
                      loja.critico
                        ? "text-rose-300"
                        : loja.atencao
                        ? "text-[#F2D675]"
                        : "text-emerald-300"
                    }`}
                  >
                    {loja.critico ? "Ação" : loja.atencao ? "Atenção" : "Em dia"}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                  <div className="shrink-0">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">
                        Ponto
                      </p>
                      {loja.pontoPendente > 0 && (
                        <button
                          type="button"
                          onClick={() => navigate("/rh/gestao/detalhes")}
                          className="text-[9px] font-black text-rose-300 hover:text-rose-200"
                        >
                          {loja.pontoPendente} pend.
                        </button>
                      )}
                    </div>

                    {domingo ? (
                      <div className="flex h-8 items-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] px-2.5 text-[10px] text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        Domingo • loja fechada
                      </div>
                    ) : (
                      <div className={`grid gap-1 ${sabado ? "grid-cols-2" : "grid-cols-4"}`}>
                        {loja.ponto.map((item) => (
                          <div
                            key={item.periodo}
                            className={`rounded-lg border px-1.5 py-1.5 ${
                              item.ok
                                ? item.pendencias > 0
                                  ? "border-amber-400/20 bg-amber-400/[0.05]"
                                  : "border-emerald-400/15 bg-emerald-400/[0.04]"
                                : item.atrasado
                                ? "border-rose-400/20 bg-rose-400/[0.05]"
                                : "border-white/[0.06] bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-[8px] font-black uppercase text-gray-500">
                                {item.hora}
                              </span>

                              {item.ok ? (
                                <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                              ) : item.atrasado ? (
                                <CircleAlert className="h-3 w-3 shrink-0 text-rose-300" />
                              ) : (
                                <Clock3 className="h-3 w-3 shrink-0 text-gray-600" />
                              )}
                            </div>

                            <p
                              className={`mt-0.5 truncate text-[9px] font-bold ${
                                item.ok
                                  ? "text-white"
                                  : item.atrasado
                                  ? "text-rose-200"
                                  : "text-gray-600"
                              }`}
                            >
                              {item.ok ? "OK" : item.atrasado ? "Pendente" : "Aguarda"}
                            </p>

                            {item.pendencias > 0 && (
                              <p className="truncate text-[8px] font-bold text-amber-300">
                                {item.pendencias} pend.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">
                      Caixa
                    </p>

                    {domingo ? (
                      <div className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[10px] text-gray-500">
                        <CircleDot className="h-3.5 w-3.5" />
                        Loja fechada
                      </div>
                    ) : loja.caixa ? (
                      <button
                        type="button"
                        onClick={() => navigate("/rh/caixa")}
                        className={`flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-[10px] font-bold ${
                          loja.caixaDiferenca
                            ? "border-amber-400/20 bg-amber-400/[0.05] text-amber-200"
                            : "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-300"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5" />
                          Fechado
                        </span>
                        {loja.caixaDiferenca && (
                          <span>dif. R$ {Math.abs(Number(loja.caixa.diferenca || 0)).toFixed(2)}</span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate("/rh/caixa")}
                        className="flex h-8 w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-left text-[10px] font-bold text-gray-500"
                      >
                        <Clock3 className="h-3.5 w-3.5" />
                        Aguardando fechamento
                      </button>
                    )}
                  </div>

                  <div className="min-h-0 flex-1">
                    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-gray-600">
                      Atenções da loja
                    </p>

                    {loja.atencoes.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1">
                        {loja.atencoes.slice(0, 6).map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => navigate(item.rota)}
                            className={`flex h-7 items-center justify-between gap-1 rounded-lg border px-2 text-[9px] font-bold transition ${
                              item.critica
                                ? "border-rose-400/15 bg-rose-400/[0.04] text-rose-200 hover:bg-rose-400/[0.08]"
                                : "border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] text-[#e8d394] hover:bg-[#D4AF37]/[0.07]"
                            }`}
                          >
                            <span className="truncate">{item.label}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {item.quantidade}
                              <ChevronRight className="h-3 w-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-8 items-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] px-2.5 text-[10px] font-bold text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        Demais rotinas do RH em dia
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
