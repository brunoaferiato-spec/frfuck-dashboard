import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  HardHat,
  Hourglass,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LOJAS_COM_CAIXA = 6;

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function competenciaAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

function parseData(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function diasAte(valor?: string | null) {
  const alvo = parseData(valor);
  if (!alvo) return null;

  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function numeroData(valor?: string | null) {
  return Number(String(valor || "").slice(0, 10).replace(/-/g, "")) || 0;
}

type CardResumo = {
  id: string;
  titulo: string;
  valor: string | number;
  detalhe: string;
  prioridade: number;
  rota?: string;
  acao?: () => void;
  icon: any;
};

export default function RHDashboardGeral() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);
  const podeVer =
    (role === "rh" && lojaId <= 0) || role === "admin" || role === "gestor";

  const hoje = hojeCivil();
  const competencia = competenciaAtual();

  const pontoQuery = trpc.rhPonto.pendencias.useQuery(
    { lojaId: null },
    {
      enabled: podeVer,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const caixaQuery = trpc.rhCaixa.historico.useQuery(
    {
      dataInicio: hoje,
      dataFim: hoje,
      lojaId: null,
    },
    {
      enabled: podeVer,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const documentosQuery = trpc.rhDocumentos.listar.useQuery(
    {
      lojaId: null,
      funcionarioId: null,
      tipo: null,
      competencia: null,
      dataInicio: null,
      dataFim: null,
    },
    {
      enabled: podeVer,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const episQuery = trpc.rhEpis.listar.useQuery(
    {
      lojaId: null,
      funcionarioId: null,
      item: null,
      dataInicio: null,
      dataFim: null,
    },
    {
      enabled: podeVer,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const feriasQuery = trpc.rhFerias.vencimentos.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const experienciaQuery = trpc.rhExperiencia.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const rescisoesQuery = trpc.rhRescisoes.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const resumo = useMemo(() => {
    const ponto = (pontoQuery.data || []) as Array<any>;
    const caixas = (caixaQuery.data || []) as Array<any>;
    const documentos = (documentosQuery.data || []) as Array<any>;
    const entregasEpi = (episQuery.data || []) as Array<any>;
    const ferias = (feriasQuery.data || []) as Array<any>;
    const experiencias = (experienciaQuery.data || []) as Array<any>;
    const rescisoes = (rescisoesQuery.data || []) as Array<any>;

    const epiMaisRecente = new Map<string, any>();

    for (const entrega of entregasEpi) {
      if (!entrega.proximaTroca) continue;

      const chave = `${entrega.lojaId}:${entrega.funcionarioId}:${entrega.item}`;
      const atual = epiMaisRecente.get(chave);

      if (
        !atual ||
        numeroData(entrega.dataEntrega) > numeroData(atual.dataEntrega) ||
        (numeroData(entrega.dataEntrega) === numeroData(atual.dataEntrega) &&
          Number(entrega.id) > Number(atual.id))
      ) {
        epiMaisRecente.set(chave, entrega);
      }
    }

    const episPrazos = Array.from(epiMaisRecente.values())
      .map((entrega) => diasAte(entrega.proximaTroca))
      .filter((dias): dias is number => dias !== null && dias <= 30);

    const episVencidos = episPrazos.filter((dias) => dias <= -1).length;
    const episAte7 = episPrazos.filter((dias) => dias >= 0 && dias <= 7).length;
    const episAte15 = episPrazos.filter((dias) => dias >= 8 && dias <= 15).length;
    const episAte30 = episPrazos.filter((dias) => dias >= 16 && dias <= 30).length;
    const episAlertas = episVencidos + episAte7 + episAte15 + episAte30;

    const feriasCriticas = ferias.filter((item) => {
      const diasLimite = Number(item.diasAteLimiteRetorno);
      const diasInicioSeguro = Number(item.diasAteUltimoInicio30);

      return (
        Number.isFinite(diasLimite) &&
        Number.isFinite(diasInicioSeguro) &&
        (diasLimite < 0 || diasInicioSeguro <= 60)
      );
    }).length;

    const experienciasPendentes = experiencias.filter((item) => {
      if (item.primeiraDecisao === "encerrar" || item.segundaDecisao) return false;

      const segundoPeriodo = item.primeiraDecisao === "prorrogar";
      const prazo = segundoPeriodo ? item.fimSegundoPeriodo : item.fimPrimeiroPeriodo;
      const dias = diasAte(prazo);

      if (dias === null) return false;
      return segundoPeriodo ? dias <= 15 : dias <= 10;
    }).length;

    const rescisoesAbertas = rescisoes.filter((item) =>
      ["aguardando_rh", "em_andamento"].includes(String(item.status || ""))
    ).length;

    const documentosMes = documentos.filter((item) =>
      String(item.dataDocumento || "").startsWith(competencia)
    ).length;

    const caixasValidos = caixas.filter((item) => Number(item.lojaId) !== 5);
    const caixasComDiferenca = caixasValidos.filter(
      (item) => Math.abs(Number(item.diferenca || 0)) >= 0.005
    ).length;

    return {
      pontoPendencias: ponto.length,
      caixasFechados: caixasValidos.length,
      caixasComDiferenca,
      documentosMes,
      episVencidos,
      episAte7,
      episAte15,
      episAte30,
      episAlertas,
      feriasCriticas,
      experienciasPendentes,
      rescisoesAbertas,
    };
  }, [
    pontoQuery.data,
    caixaQuery.data,
    documentosQuery.data,
    episQuery.data,
    feriasQuery.data,
    experienciaQuery.data,
    rescisoesQuery.data,
    competencia,
  ]);

  const cards = useMemo<CardResumo[]>(
    () => [
      {
        id: "ponto",
        titulo: "Ponto",
        valor: resumo.pontoPendencias,
        detalhe:
          resumo.pontoPendencias === 1
            ? "pendência aberta"
            : "pendências abertas",
        prioridade: resumo.pontoPendencias > 0 ? 2 : 0,
        acao: () =>
          document
            .getElementById("historico-ponto")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        icon: ClipboardCheck,
      },
      {
        id: "caixa",
        titulo: "Caixa",
        valor: `${resumo.caixasFechados}/${LOJAS_COM_CAIXA}`,
        detalhe:
          resumo.caixasComDiferenca > 0
            ? `${resumo.caixasComDiferenca} com divergência`
            : "fechamentos de hoje",
        prioridade: resumo.caixasComDiferenca > 0 ? 2 : 0,
        acao: () =>
          document
            .getElementById("fechamentos-caixa")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        icon: WalletCards,
      },
      {
        id: "documentos",
        titulo: "Documentos RH",
        valor: resumo.documentosMes,
        detalhe: "arquivados no mês",
        prioridade: 0,
        rota: "/rh/documentos",
        icon: Archive,
      },
      {
        id: "epis",
        titulo: "EPIs",
        valor: resumo.episAlertas,
        detalhe:
          resumo.episAlertas > 0
            ? `${resumo.episVencidos} venc. • ${resumo.episAte7} até 7d • ${resumo.episAte15} 8–15d • ${resumo.episAte30} 16–30d`
            : "sem trocas nos próximos 30 dias",
        prioridade:
          resumo.episVencidos > 0
            ? 3
            : resumo.episAte7 > 0
            ? 2
            : resumo.episAlertas > 0
            ? 1
            : 0,
        rota: "/rh/epis",
        icon: HardHat,
      },
      {
        id: "ferias",
        titulo: "Férias",
        valor: resumo.feriasCriticas,
        detalhe: "prazos prioritários",
        prioridade: resumo.feriasCriticas > 0 ? 3 : 0,
        rota: "/rh/ferias",
        icon: CalendarDays,
      },
      {
        id: "experiencia",
        titulo: "Experiência",
        valor: resumo.experienciasPendentes,
        detalhe: "decisões próximas/atrasadas",
        prioridade: resumo.experienciasPendentes > 0 ? 3 : 0,
        rota: "/rh/experiencia",
        icon: Hourglass,
      },
      {
        id: "rescisoes",
        titulo: "Rescisões",
        valor: resumo.rescisoesAbertas,
        detalhe:
          resumo.rescisoesAbertas === 1
            ? "processo aberto"
            : "processos abertos",
        prioridade: resumo.rescisoesAbertas > 0 ? 3 : 0,
        rota: "/rh/rescisoes",
        icon: FileWarning,
      },
    ],
    [resumo]
  );

  const prioridades = cards
    .filter((card) => card.prioridade > 0)
    .sort((a, b) => b.prioridade - a.prioridade);

  const carregando = [
    pontoQuery,
    caixaQuery,
    documentosQuery,
    episQuery,
    feriasQuery,
    experienciaQuery,
    rescisoesQuery,
  ].some((query) => query.isLoading);

  const erro = [
    pontoQuery.error,
    caixaQuery.error,
    documentosQuery.error,
    episQuery.error,
    feriasQuery.error,
    experienciaQuery.error,
    rescisoesQuery.error,
  ].find(Boolean);

  function abrir(card: CardResumo) {
    if (card.acao) {
      card.acao();
      return;
    }

    if (card.rota) navigate(card.rota);
  }

  function atualizarTudo() {
    pontoQuery.refetch();
    caixaQuery.refetch();
    documentosQuery.refetch();
    episQuery.refetch();
    feriasQuery.refetch();
    experienciaQuery.refetch();
    rescisoesQuery.refetch();
  }

  if (!podeVer) return null;

  return (
    <section className="mb-6">
      <Card className="overflow-hidden border-[#D4AF37]/25 bg-gradient-to-br from-[#111111] via-[#090909] to-[#050505]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]/70">
                Dashboard Geral RH
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                O que precisa da sua atenção
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Ponto, caixa, documentos, EPIs, férias, experiências e rescisões em uma única visão.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={atualizarTudo}
              className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar tudo
            </Button>
          </div>

          {erro && (
            <div className="border-b border-rose-400/15 bg-rose-400/[0.05] px-5 py-3 text-xs text-rose-200">
              Um dos módulos não respondeu corretamente: {erro.message}
            </div>
          )}

          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {cards.map((card) => {
              const Icon = card.icon;
              const atencao = card.prioridade > 0;

              return (
                <button
                  type="button"
                  key={card.id}
                  onClick={() => abrir(card)}
                  className={`min-h-[150px] bg-[#090909] p-4 text-left transition hover:bg-[#101010] ${
                    atencao ? "hover:bg-rose-950/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`rounded-xl border p-2 ${
                        atencao
                          ? "border-rose-400/20 bg-rose-400/[0.06]"
                          : "border-[#D4AF37]/15 bg-[#D4AF37]/[0.04]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          atencao ? "text-rose-300" : "text-[#F2D675]"
                        }`}
                      />
                    </div>

                    {atencao ? (
                      <AlertTriangle className="h-4 w-4 text-rose-300" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>

                  <p
                    className={`mt-4 text-2xl font-black ${
                      atencao ? "text-rose-200" : "text-white"
                    }`}
                  >
                    {carregando ? "..." : card.valor}
                  </p>
                  <p className="mt-1 text-xs font-black text-white">{card.titulo}</p>
                  <p className="mt-1 text-[11px] leading-4 text-gray-600">
                    {card.detalhe}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] p-5">
            <div className="flex items-center gap-2">
              {prioridades.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-rose-300" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
              <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">
                Prioridades agora
              </p>
            </div>

            {prioridades.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {prioridades.map((card) => (
                  <button
                    type="button"
                    key={`prioridade-${card.id}`}
                    onClick={() => abrir(card)}
                    className="rounded-xl border border-rose-400/20 bg-rose-400/[0.055] px-3 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-400/[0.10]"
                  >
                    {card.titulo}: {card.valor} • abrir →
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-emerald-300">
                Nenhuma prioridade crítica identificada nos módulos do RH neste momento.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
