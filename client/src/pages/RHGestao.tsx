import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import RHEpiAlertas from "@/components/RHEpiAlertas";
import RHFeriasAlertas from "@/components/RHFeriasAlertas";
import RHExperienciaDashboard from "@/components/RHExperienciaDashboard";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ClipboardCheck,
  Download,
  FileWarning,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODULOS = [
  {
    titulo: "Conferência de Ponto",
    descricao: "Histórico diário das quatro conferências e ocorrências por funcionário.",
    icon: ClipboardCheck,
    ativo: true,
  },
  {
    titulo: "Conferência de Caixa",
    descricao: "Fechamentos, divergências justificadas e histórico por loja/data.",
    icon: WalletCards,
    ativo: true,
  },
  {
    titulo: "Documentos RH",
    descricao: "Advertências avulsas, adiantamentos, folhas de pagamento e cartões-ponto assinados.",
    icon: Archive,
    ativo: true,
  },
  {
    titulo: "Entrega de EPIs",
    descricao: "Historico de entregas, tamanhos, quantidades e termos assinados por colaborador.",
    icon: Archive,
    ativo: true,
  },
  {
    titulo: "Rescisões",
    descricao: "Checklist, prazos, documentos, contabilidade e conclusão da rescisão.",
    icon: FileWarning,
    ativo: false,
  },
  {
    titulo: "Férias",
    descricao: "Ciclos, avisos, pagamento, saída, retorno e conclusão.",
    icon: CalendarDays,
    ativo: true,
  },
  {
    titulo: "Dashboard RH",
    descricao: "Será construído no final, consumindo os dados reais de todos os módulos.",
    icon: LayoutDashboard,
    ativo: false,
  },
];

const NOMES_PERIODO: Record<string, string> = {
  entrada: "10:00 • Entrada",
  saida_almoco: "12:30 • Saída almoço",
  retorno_almoco: "14:30 • Retorno almoço",
  saida: "17:45 • Saída",
};

const PERIODOS_DASHBOARD = [
  { periodo: "entrada", horario: "10:00", titulo: "Entrada" },
  { periodo: "saida_almoco", horario: "12:30", titulo: "Saída almoço" },
  { periodo: "retorno_almoco", horario: "14:30", titulo: "Retorno almoço" },
  { periodo: "saida", horario: "17:45", titulo: "Saída" },
] as const;

const LOJAS_RH = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

const LOJAS_COM_CAIXA = LOJAS_RH.filter((loja) => loja.id !== 5);

function horarioEmMinutos(horario: string) {
  const [hora, minuto] = String(horario || "00:00").split(":").map(Number);
  return Number(hora || 0) * 60 + Number(minuto || 0);
}

function statusOperacaoLoja(loja: any) {
  const conferenciasAtrasadas = (loja.periodos || []).filter(
    (periodo: any) => periodo.atrasado
  ).length;

  if (conferenciasAtrasadas > 0) {
    return {
      tipo: "atrasada",
      label: `${conferenciasAtrasadas} conferência${conferenciasAtrasadas === 1 ? "" : "s"} atrasada${conferenciasAtrasadas === 1 ? "" : "s"}`,
      badge: "border-rose-400/25 bg-rose-400/[0.08] text-rose-300",
      borda: "border-rose-400/25",
    };
  }

  if ((loja.pendenciasHoje || []).length > 0) {
    return {
      tipo: "pendencia_hoje",
      label: `${loja.pendenciasHoje.length} pendência${loja.pendenciasHoje.length === 1 ? "" : "s"} hoje`,
      badge: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
      borda: "border-amber-400/25",
    };
  }

  if ((loja.pendenciasAbertas || []).length > 0) {
    return {
      tipo: "pendencia_anterior",
      label: `${loja.pendenciasAbertas.length} aberta${loja.pendenciasAbertas.length === 1 ? "" : "s"}`,
      badge: "border-rose-400/20 bg-rose-400/[0.06] text-rose-300",
      borda: "border-rose-400/15",
    };
  }

  const conferidas = (loja.periodos || []).filter(
    (periodo: any) => Boolean(periodo.conferencia)
  ).length;

  if (conferidas === PERIODOS_DASHBOARD.length) {
    return {
      tipo: "em_dia",
      label: "Em dia",
      badge: "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300",
      borda: "border-emerald-400/15",
    };
  }

  return {
    tipo: conferidas > 0 ? "em_andamento" : "aguardando",
    label: conferidas > 0 ? "Em andamento" : "Aguardando",
    badge: "border-white/10 bg-white/[0.025] text-gray-400",
    borda: "border-white/10",
  };
}

function diaSemanaDataCivilGestao(dataCivil: string) {
  const [ano, mes, dia] = String(dataCivil || "").split("-").map(Number);
  if (!ano || !mes || !dia) return -1;
  return new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
}

function nomePeriodoGestao(periodo: string, dataCivil?: string | null) {
  if (dataCivil && diaSemanaDataCivilGestao(dataCivil) === 6) {
    if (periodo === "entrada") return "10:00 • Entrada";
    if (periodo === "saida") return "13:00 • Saída";
  }

  return NOMES_PERIODO[periodo] || periodo;
}

function labelTipoOcorrencia(ocorrencia: any) {
  const tipo = String(ocorrencia?.tipoOcorrencia || "");
  if (tipo === "atraso") return `${Number(ocorrencia?.minutosAtraso || 0)} min atraso`;
  if (tipo === "atraso_registrado") return `${Number(ocorrencia?.minutosAtraso || 0)} min atraso registrado`;
  if (tipo === "almoco_excedido") return `${Number(ocorrencia?.minutosAtraso || 0)} min almoço excedido`;
  if (tipo === "sem_batida" || tipo === "ausente_relatorio") return "Sem batida";
  if (tipo === "falta") return "Falta";
  if (tipo === "saida_antecipada") return "Saída antecipada";
  if (Number(ocorrencia?.minutosAtraso || 0) > 0) {
    return `${Number(ocorrencia.minutosAtraso)} min atraso`;
  }
  return "Ocorrência";
}

function classeTipoOcorrencia(ocorrencia: any) {
  const tipo = String(ocorrencia?.tipoOcorrencia || "");
  if (["atraso", "almoco_excedido", "falta", "sem_batida", "ausente_relatorio"].includes(tipo)) {
    return "border border-rose-400/15 bg-rose-400/[0.05] text-rose-300";
  }
  if (tipo === "atraso_registrado") {
    return "border border-amber-400/15 bg-amber-400/[0.05] text-amber-300";
  }
  if (tipo === "saida_antecipada" || tipo === "intervalo_inferior") {
    return "border border-orange-400/15 bg-orange-400/[0.05] text-orange-300";
  }
  return "border border-white/[0.08] bg-white/[0.03] text-gray-400";
}

function hojeCivil() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarData(dataCivil: string) {
  const match = String(dataCivil || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dataCivil;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatarHorarioData(valor: unknown) {
  if (!valor) return "";

  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarDataHora(valor: unknown) {
  if (!valor) return "";

  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarMoeda(valor: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function labelMotivoCaixa(valor: unknown) {
  const motivo = String(valor || "");

  if (motivo === "diferenca_caixa") return "Diferença de caixa";
  if (motivo === "uber_aberto") return "Uber em aberto";
  if (motivo === "pagamento_dinheiro_pix_aberto") {
    return "Pagamento em dinheiro ou PIX em aberto";
  }
  if (motivo === "outro") return "Outros";

  return motivo || "—";
}

function statusCaixa(fechamento: any) {
  const diferenca = Number(fechamento?.diferenca || 0);
  const diferencaAbsoluta = Math.abs(diferenca);

  if (diferencaAbsoluta < 0.005) {
    return {
      label: "Caixa correto",
      classe:
        "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300",
    };
  }

  if (diferencaAbsoluta <= 5) {
    return {
      label: "Diferença dentro da margem",
      classe: "border-amber-400/20 bg-amber-400/[0.05] text-amber-300",
    };
  }

  return {
    label: "Diferença fora da margem",
    classe: "border-rose-400/20 bg-rose-400/[0.05] text-rose-300",
  };
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function labelPendenciaRh(p: any) {
  if (p.fase === "cadastro") {
    return p.tipoCadastro === "jornada"
      ? "Jornada pendente de cadastro"
      : "Funcionário pendente de cadastro";
  }
  if (p.fase === "documento") {
    if (p.tratativaTipo === "atestado") return "Atestado informado • documento pendente";
    if (p.tratativaTipo === "justificativa") return "Justificativa • comprovante pendente";
    if (p.tratativaTipo === "falta") return "Falta • advertência assinada pendente";
    return "Advertência assinada pendente";
  }
  return "Tratativa pendente na loja";
}

function labelTratativaHistorico(tipo: unknown) {
  const valor = String(tipo || "");
  if (valor === "advertencia") return "Advertência";
  if (valor === "atestado") return "Atestado";
  if (valor === "justificativa") return "Justificativa";
  if (valor === "falta") return "Falta + advertência";
  return "Tratativa";
}

function statusDocumentoHistorico(status: unknown) {
  const valor = String(status || "");
  if (valor === "concluida") {
    return {
      label: "Documento anexado",
      classe: "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300",
    };
  }

  return {
    label: "Documento pendente",
    classe: "border-sky-400/15 bg-sky-400/[0.05] text-sky-300",
  };
}

export default function RHGestao() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const roleAtual = String(user?.role || "");
  const podeVoltarDashboardGeral =
    roleAtual === "admin" || roleAtual === "gestor";

  const hoje = hojeCivil();
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const [caixaDataFiltro, setCaixaDataFiltro] = useState(hoje);
  const [caixaLojaFiltro, setCaixaLojaFiltro] = useState("todas");
  const [caixaFiltroAplicado, setCaixaFiltroAplicado] = useState<{
    data: string;
    loja: string;
  } | null>(null);
  const [caixaErroRelatorio, setCaixaErroRelatorio] = useState("");
  const [caixaBaixandoId, setCaixaBaixandoId] = useState<number | null>(null);

  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [lojaFiltro, setLojaFiltro] = useState("todas");
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [dashboardLojaAbertaId, setDashboardLojaAbertaId] = useState<number | null>(null);
  const [dashboardCaixaAbertoLojaId, setDashboardCaixaAbertoLojaId] = useState<number | null>(null);

  const lojasQuery = trpc.lojas.list.useQuery(undefined, {
    retry: false,
  });

  const lojas = useMemo(() => {
    const recebidas = (lojasQuery.data || []) as Array<{ id: number; nome: string }>;
    const porId = new Map(recebidas.map((loja) => [Number(loja.id), loja]));
    const idsOficiais = new Set<number>(LOJAS_RH.map((loja) => loja.id));

    const oficiais = LOJAS_RH.map((loja) => {
      const recebida = porId.get(loja.id);
      return recebida
        ? { ...loja, ...recebida, id: Number(recebida.id), nome: recebida.nome || loja.nome }
        : { ...loja };
    });

    const extras = recebidas
      .filter((loja) => !idsOficiais.has(Number(loja.id)))
      .map((loja) => ({ id: Number(loja.id), nome: loja.nome }));

    return [...oficiais, ...extras];
  }, [lojasQuery.data]);

  const periodoValido = dataInicio <= dataFim;

  const historicoQuery = trpc.rhPonto.historico.useQuery(
    {
      dataInicio,
      dataFim,
      lojaId: lojaFiltro === "todas" ? null : Number(lojaFiltro),
    },
    {
      enabled: periodoValido,
      retry: false,
    }
  );

  const pendenciasQuery = trpc.rhPonto.pendencias.useQuery(
    { lojaId: lojaFiltro === "todas" ? null : Number(lojaFiltro) },
    { retry: false }
  );

  const dashboardHistoricoQuery = trpc.rhPonto.historico.useQuery(
    {
      dataInicio: hoje,
      dataFim: hoje,
      lojaId: null,
    },
    { retry: false }
  );

  const dashboardPendenciasQuery = trpc.rhPonto.pendencias.useQuery(
    { lojaId: null },
    { retry: false }
  );

  const dashboardCaixaQuery = trpc.rhCaixa.historico.useQuery(
    {
      dataInicio: hoje,
      dataFim: hoje,
      lojaId: null,
    },
    { retry: false }
  );

  const fechamentosCaixaQuery = trpc.rhCaixa.historico.useQuery(
    {
      dataInicio: caixaFiltroAplicado?.data || hoje,
      dataFim: caixaFiltroAplicado?.data || hoje,
      lojaId:
        caixaFiltroAplicado && caixaFiltroAplicado.loja !== "todas"
          ? Number(caixaFiltroAplicado.loja)
          : null,
    },
    {
      enabled: Boolean(caixaFiltroAplicado),
      retry: false,
    }
  );

  const historico = useMemo(
    () => ((historicoQuery.data || []) as any[]),
    [historicoQuery.data]
  );

  const pendencias = useMemo(
    () => ((pendenciasQuery.data || []) as any[]),
    [pendenciasQuery.data]
  );

  const dashboardHistorico = useMemo(
    () => ((dashboardHistoricoQuery.data || []) as any[]),
    [dashboardHistoricoQuery.data]
  );

  const dashboardPendencias = useMemo(
    () => ((dashboardPendenciasQuery.data || []) as any[]),
    [dashboardPendenciasQuery.data]
  );

  const dashboardCaixas = useMemo(
    () => ((dashboardCaixaQuery.data || []) as any[]),
    [dashboardCaixaQuery.data]
  );

  const dashboardPendenciasHoje = useMemo(
    () =>
      dashboardPendencias.filter(
        (pendencia: any) => String(pendencia.dataReferencia || "").slice(0, 10) === hoje
      ),
    [dashboardPendencias, hoje]
  );

  const dashboardLojas = useMemo(() => {
    // O Dashboard da Líder RH deve sempre exibir as 7 unidades oficiais,
    // mesmo quando alguma delas ainda não possui conferência ou fechamento no dia.
    return LOJAS_RH.map((loja) => {
      const conferenciasHoje = dashboardHistorico.filter(
        (conferencia: any) => Number(conferencia.lojaId) === Number(loja.id)
      );
      const pendenciasAbertas = dashboardPendencias.filter(
        (pendencia: any) => Number(pendencia.lojaId) === Number(loja.id)
      );
      const pendenciasHoje = dashboardPendenciasHoje.filter(
        (pendencia: any) => Number(pendencia.lojaId) === Number(loja.id)
      );

      const fechamentoCaixa =
        dashboardCaixas.find(
          (fechamento: any) => Number(fechamento.lojaId) === Number(loja.id)
        ) || null;

      return {
        ...loja,
        conferenciasHoje,
        pendenciasAbertas,
        pendenciasHoje,
        fechamentoCaixa,
        pendenciasAnteriores: Math.max(0, pendenciasAbertas.length - pendenciasHoje.length),
        periodos: PERIODOS_DASHBOARD.map((periodo) => {
          const conferencia = conferenciasHoje.find(
            (item: any) => String(item.periodo) === periodo.periodo
          );
          const pendencias = pendenciasHoje.filter(
            (pendencia: any) => String(pendencia.periodo) === periodo.periodo
          );
          const atrasado =
            !conferencia && minutosAgora > horarioEmMinutos(periodo.horario);

          return {
            ...periodo,
            conferencia,
            pendencias,
            atrasado,
            aguardando: !conferencia && !atrasado,
          };
        }),
      };
    });
  }, [
    dashboardHistorico,
    dashboardPendencias,
    dashboardPendenciasHoje,
    dashboardCaixas,
    minutosAgora,
  ]);

  const dashboardResumo = useMemo(() => {
    const lojasComAtencao = dashboardLojas.filter((loja: any) => {
      const temPendenciaAberta = loja.pendenciasAbertas.length > 0;
      const temConferenciaAtrasada = loja.periodos.some(
        (periodo: any) => periodo.atrasado
      );
      return temPendenciaAberta || temConferenciaAtrasada;
    }).length;

    const conferenciasAtrasadas = dashboardLojas.reduce(
      (total: number, loja: any) =>
        total + loja.periodos.filter((periodo: any) => periodo.atrasado).length,
      0
    );

    const idsComCaixa = new Set<number>(LOJAS_COM_CAIXA.map((loja) => loja.id));
    const caixasValidos = dashboardCaixas.filter((fechamento: any) =>
      idsComCaixa.has(Number(fechamento.lojaId))
    );

    const caixasComDiferenca = caixasValidos.filter(
      (fechamento: any) => Math.abs(Number(fechamento.diferenca || 0)) >= 0.005
    ).length;

    return {
      pendenciasAbertas: dashboardPendencias.length,
      pendenciasHoje: dashboardPendenciasHoje.length,
      lojasComAtencao,
      conferenciasAtrasadas,
      documentosPendentes: dashboardPendencias.filter(
        (pendencia: any) => pendencia.fase === "documento"
      ).length,
      cadastrosPendentes: dashboardPendencias.filter(
        (pendencia: any) => pendencia.fase === "cadastro"
      ).length,
      conferenciasHoje: dashboardHistorico.length,
      conferenciasPrevistas: LOJAS_RH.length * PERIODOS_DASHBOARD.length,
      caixasFechados: caixasValidos.length,
      caixasPrevistos: LOJAS_COM_CAIXA.length,
      caixasComDiferenca,
    };
  }, [
    dashboardPendencias,
    dashboardPendenciasHoje,
    dashboardHistorico,
    dashboardCaixas,
    dashboardLojas,
  ]);

  const fechamentosCaixa = useMemo(
    () => ((fechamentosCaixaQuery.data || []) as any[]),
    [fechamentosCaixaQuery.data]
  );

  const historicoFiltrado = useMemo(() => {
    const busca = normalizarTexto(buscaFuncionario);

    if (!busca) return historico;

    return historico
      .map((conferencia) => {
        const ocorrencias = (conferencia.ocorrencias || []).filter(
          (ocorrencia: any) =>
            normalizarTexto(ocorrencia.funcionarioNome).includes(busca)
        );

        if (ocorrencias.length === 0) return null;

        return {
          ...conferencia,
          ocorrencias,
        };
      })
      .filter(Boolean) as any[];
  }, [historico, buscaFuncionario]);

  const resumo = useMemo(() => {
    let atrasos = 0;

    for (const conferencia of historico) {
      for (const ocorrencia of conferencia.ocorrencias || []) {
        if (
          String(ocorrencia.tipoOcorrencia || "") === "atraso" ||
          String(ocorrencia.tipoOcorrencia || "") === "atraso_registrado" ||
          Number(ocorrencia.minutosAtraso || 0) > 0
        ) {
          atrasos += 1;
        }
      }
    }

    return {
      conferencias: historico.length,
      atrasos,
      pendenciasAbertas: pendencias.length,
      cadastrosPendentes: pendencias.filter((p) => p.fase === "cadastro").length,
      documentosPendentes: pendencias.filter((p) => p.fase === "documento").length,
    };
  }, [historico, pendencias]);

  function buscarFechamentosCaixa() {
    const proximoFiltro = {
      data: caixaDataFiltro,
      loja: caixaLojaFiltro,
    };

    setCaixaErroRelatorio("");

    const mesmoFiltro =
      caixaFiltroAplicado?.data === proximoFiltro.data &&
      caixaFiltroAplicado?.loja === proximoFiltro.loja;

    if (mesmoFiltro) {
      fechamentosCaixaQuery.refetch();
      return;
    }

    setCaixaFiltroAplicado(proximoFiltro);
  }

  async function baixarRelatorioCaixa(fechamento: any) {
    setCaixaErroRelatorio("");
    setCaixaBaixandoId(Number(fechamento.id));

    try {
      const resposta = await utils.rhCaixa.relatorioUrl.fetch({
        fechamentoId: Number(fechamento.id),
        lojaId: Number(fechamento.lojaId),
      });

      if (resposta.base64) {
        const binario = atob(resposta.base64);
        const bytes = new Uint8Array(binario.length);

        for (let i = 0; i < binario.length; i += 1) {
          bytes[i] = binario.charCodeAt(i);
        }

        const blob = new Blob([bytes], {
          type:
            resposta.mime ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = resposta.nome || "relatorio-caixa.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        return;
      }

      if (resposta.url) {
        window.open(resposta.url, "_blank", "noopener,noreferrer");
        return;
      }

      throw new Error("Relatório original não encontrado.");
    } catch (error: any) {
      setCaixaErroRelatorio(
        error?.message || "Não foi possível acessar o relatório original."
      );
    } finally {
      setCaixaBaixandoId(null);
    }
  }

  async function sair() {
    await logout();
    navigate("/");
  }

  function abrirHistoricoPonto() {
    document
      .getElementById("historico-ponto")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function abrirFechamentosCaixa() {
    document
      .getElementById("fechamentos-caixa")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function abrirCaixaDaLoja(lojaId: number) {
    const loja = String(lojaId);
    setCaixaLojaFiltro(loja);
    setCaixaDataFiltro(hoje);
    setCaixaFiltroAplicado({ data: hoje, loja });
    window.setTimeout(() => abrirFechamentosCaixa(), 50);
  }

  function abrirDetalheCaixaDashboard(lojaId: number) {
    if (Number(lojaId) === 5) return;

    setDashboardLojaAbertaId(null);
    setDashboardCaixaAbertoLojaId((atual) =>
      Number(atual) === Number(lojaId) ? null : Number(lojaId)
    );
    window.setTimeout(() => {
      document
        .getElementById("detalhe-caixa-dashboard")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="border-b border-[#D4AF37]/15 bg-[#080808]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex items-center gap-4">
            {podeVoltarDashboardGeral && (
              <Button
                variant="ghost"
                onClick={() => navigate("/")}
                className="h-10 w-10 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                title="Voltar ao Dashboard"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}

            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8f8a80]">
                Liderança de RH
              </p>
              <h1 className="mt-1 text-2xl font-black text-[#F2D675]">
                Gestão RH
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-4 py-2 text-sm sm:block">
              {user?.name || user?.email || "Líder RH"}
            </div>

            <Button
              variant="ghost"
              onClick={sair}
              className="text-gray-400 hover:bg-red-500/10 hover:text-rose-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <RHEpiAlertas />
        <RHFeriasAlertas />
        <RHExperienciaDashboard />
        <section>
          <div className="overflow-hidden rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#090909] to-[#050505]">
            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]/70">
                    Dashboard RH • Hoje
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    Visão geral da operação
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {formatarData(hoje)} • acompanhe ponto, pendências e documentos sem sair desta tela.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      dashboardHistoricoQuery.refetch();
                      dashboardPendenciasQuery.refetch();
                      dashboardCaixaQuery.refetch();
                    }}
                    className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => navigate("/funcionarios")}
                    className="bg-[#D4AF37] font-bold text-black hover:bg-[#E6C760]"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Funcionários
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-6">
              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Pendências abertas
                  </p>
                  <AlertTriangle className="h-4 w-4 text-rose-300" />
                </div>
                <p className="mt-2 text-3xl font-black text-rose-300">
                  {dashboardResumo.pendenciasAbertas}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {dashboardResumo.pendenciasHoje} gerada{dashboardResumo.pendenciasHoje === 1 ? "" : "s"} hoje
                </p>
              </div>

              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Lojas com atenção
                  </p>
                  <ShieldCheck className="h-4 w-4 text-amber-300" />
                </div>
                <p className="mt-2 text-3xl font-black text-amber-300">
                  {dashboardResumo.lojasComAtencao}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {dashboardResumo.conferenciasAtrasadas > 0
                    ? `${dashboardResumo.conferenciasAtrasadas} conferência${dashboardResumo.conferenciasAtrasadas === 1 ? "" : "s"} em atraso`
                    : `de ${LOJAS_RH.length} lojas monitoradas`}
                </p>
              </div>

              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Documentos pendentes
                  </p>
                  <Archive className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-2 text-3xl font-black text-sky-300">
                  {dashboardResumo.documentosPendentes}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {dashboardResumo.cadastrosPendentes} cadastro{dashboardResumo.cadastrosPendentes === 1 ? "" : "s"} RH pendente{dashboardResumo.cadastrosPendentes === 1 ? "" : "s"}
                </p>
              </div>

              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Conferências hoje
                  </p>
                  <ClipboardCheck className="h-4 w-4 text-emerald-300" />
                </div>
                <p className="mt-2 text-3xl font-black text-white">
                  {dashboardResumo.conferenciasHoje}
                  <span className="ml-1 text-sm font-bold text-gray-600">
                    / {dashboardResumo.conferenciasPrevistas}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  conferências realizadas
                </p>
              </div>

              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Caixas fechados
                  </p>
                  <WalletCards className="h-4 w-4 text-[#F2D675]" />
                </div>
                <p className="mt-2 text-3xl font-black text-white">
                  {dashboardResumo.caixasFechados}
                  <span className="ml-1 text-sm font-bold text-gray-600">
                    / {dashboardResumo.caixasPrevistos}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  fechamentos realizados hoje
                </p>
              </div>

              <div className="bg-[#090909] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">
                    Caixa com diferença
                  </p>
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                </div>
                <p className={`mt-2 text-3xl font-black ${dashboardResumo.caixasComDiferenca > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                  {dashboardResumo.caixasComDiferenca}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  fechamento{dashboardResumo.caixasComDiferenca === 1 ? "" : "s"} com divergência
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-black text-white">Operação por loja</p>
              <p className="mt-1 text-sm text-gray-500">
                7 unidades monitoradas • cada quadrante mostra os quatro horários do ponto, pendências e o fechamento de caixa de hoje.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={abrirHistoricoPonto}
              className="border-white/10 bg-white/[0.025] text-gray-300 hover:bg-white/[0.06] hover:text-white"
            >
              Ver histórico completo
            </Button>
          </div>

          {dashboardHistoricoQuery.error || dashboardPendenciasQuery.error || dashboardCaixaQuery.error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200">
              Não foi possível carregar o Dashboard RH. Atualize a tela e tente novamente.
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {dashboardLojas.map((loja) => {
                  const selecionadaPonto = dashboardLojaAbertaId === Number(loja.id);
                  const selecionadaCaixa = dashboardCaixaAbertoLojaId === Number(loja.id);
                  const selecionada = selecionadaPonto || selecionadaCaixa;
                  const fechamento = loja.fechamentoCaixa;
                  const diferencaCaixa = Math.abs(Number(fechamento?.diferenca || 0));
                  const caixaCorreto = Boolean(fechamento) && diferencaCaixa < 0.005;
                  const caixaDentroMargem =
                    Boolean(fechamento) && diferencaCaixa >= 0.005 && diferencaCaixa <= 5;
                  const caixaForaMargem = Boolean(fechamento) && diferencaCaixa > 5;
                  const statusLoja = statusOperacaoLoja(loja);

                  return (
                    <Card
                      key={loja.id}
                      className={`overflow-hidden bg-[#0b0b0b] transition ${
                        selecionada
                          ? "border-[#D4AF37]/55 ring-1 ring-[#D4AF37]/20"
                          : statusLoja.borda
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDashboardCaixaAbertoLojaId(null);
                          setDashboardLojaAbertaId(
                            selecionadaPonto ? null : Number(loja.id)
                          );
                        }}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.025]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-black text-white">
                              {loja.nome}
                            </h3>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusLoja.badge}`}
                            >
                              {statusLoja.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-600">
                            {loja.pendenciasHoje.length} de hoje
                            {loja.pendenciasAnteriores > 0
                              ? ` • ${loja.pendenciasAnteriores} anterior${
                                  loja.pendenciasAnteriores === 1 ? "" : "es"
                                }`
                              : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-[#F2D675]">
                          {selecionadaPonto
                            ? "Selecionada"
                            : selecionadaCaixa
                            ? "Caixa aberto"
                            : "Detalhes"}
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              selecionadaPonto ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.06]">
                        {loja.periodos.map((periodo: any) => {
                          const quantidade = periodo.pendencias.length;
                          const conferido = Boolean(periodo.conferencia);
                          const atrasado = Boolean(periodo.atrasado);

                          return (
                            <div
                              key={periodo.periodo}
                              className={`p-3 ${
                                quantidade > 0
                                  ? "bg-amber-400/[0.035]"
                                  : conferido
                                  ? "bg-emerald-400/[0.025]"
                                  : atrasado
                                  ? "bg-rose-400/[0.04]"
                                  : "bg-[#090909]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black text-[#F2D675]">
                                  {periodo.horario}
                                </span>
                                {quantidade > 0 ? (
                                  <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                                    {quantidade}
                                  </span>
                                ) : conferido ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                ) : atrasado ? (
                                  <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                                ) : (
                                  <Clock3 className="h-3.5 w-3.5 text-gray-700" />
                                )}
                              </div>
                              <p className="mt-1 truncate text-[10px] font-bold text-gray-500">
                                {periodo.titulo}
                              </p>
                              <p
                                className={`mt-0.5 text-[9px] ${
                                  quantidade > 0
                                    ? "text-amber-300/80"
                                    : conferido
                                    ? "text-emerald-300/70"
                                    : atrasado
                                    ? "text-rose-300/80"
                                    : "text-gray-700"
                                }`}
                              >
                                {quantidade > 0
                                  ? `${quantidade} pendência${quantidade === 1 ? "" : "s"}`
                                  : conferido
                                  ? "Conferido"
                                  : atrasado
                                  ? "Conferência atrasada"
                                  : "Aguardando horário"}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {Number(loja.id) === 5 ? (
                        <div className="flex w-full items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.015] px-3.5 py-3 text-left">
                          <div>
                            <p className="text-xs font-black text-gray-400">Administrativo</p>
                            <p className="mt-0.5 text-[10px] text-gray-600">
                              Conferência de caixa não se aplica
                            </p>
                          </div>
                          <ShieldCheck className="h-4 w-4 text-gray-700" />
                        </div>
                      ) : (
                      <button
                        type="button"
                        onClick={() => abrirDetalheCaixaDashboard(Number(loja.id))}
                        className={`flex w-full items-center justify-between gap-3 border-t border-white/[0.06] px-3.5 py-3 text-left transition hover:bg-white/[0.035] ${
                          selecionadaCaixa
                            ? "ring-1 ring-inset ring-[#D4AF37]/40 bg-[#D4AF37]/[0.055]"
                            :
                          caixaCorreto
                            ? "bg-emerald-400/[0.035]"
                            : caixaDentroMargem
                            ? "bg-amber-400/[0.035]"
                            : caixaForaMargem
                            ? "bg-rose-400/[0.035]"
                            : "bg-[#090909]"
                        }`}
                      >
                        <div>
                          <p className="text-xs font-black text-[#F2D675]">Caixa</p>
                          <p
                            className={`mt-0.5 text-[10px] ${
                              caixaCorreto
                                ? "text-emerald-300/80"
                                : caixaDentroMargem
                                ? "text-amber-300/80"
                                : caixaForaMargem
                                ? "text-rose-300/80"
                                : "text-gray-700"
                            }`}
                          >
                            {caixaCorreto
                              ? "Fechado • correto"
                              : caixaDentroMargem
                              ? `Diferença ${formatarMoeda(fechamento.diferenca)}`
                              : caixaForaMargem
                              ? `Diferença ${formatarMoeda(fechamento.diferenca)}`
                              : "Não fechado"}
                          </p>
                        </div>
                        {caixaCorreto ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : caixaDentroMargem ? (
                          <AlertTriangle className="h-4 w-4 text-amber-300" />
                        ) : caixaForaMargem ? (
                          <AlertTriangle className="h-4 w-4 text-rose-300" />
                        ) : (
                          <WalletCards className="h-4 w-4 text-gray-700" />
                        )}
                      </button>
                      )}
                    </Card>
                  );
                })}
              </div>

              {dashboardCaixaAbertoLojaId !== null &&
                (() => {
                  const loja = dashboardLojas.find(
                    (item: any) => Number(item.id) === Number(dashboardCaixaAbertoLojaId)
                  );

                  if (!loja) return null;

                  const fechamento = loja.fechamentoCaixa;
                  const status = fechamento ? statusCaixa(fechamento) : null;
                  const diferenca = Number(fechamento?.diferenca || 0);

                  return (
                    <Card
                      id="detalhe-caixa-dashboard"
                      className="mt-6 scroll-mt-6 overflow-hidden border-[#D4AF37]/30 bg-[#0b0b0b]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] p-5">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8f8a80]">
                            Detalhe do Caixa
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-black text-white">{loja.nome}</h3>
                            <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-2.5 py-1 text-[10px] font-black text-[#F2D675]">
                              {formatarData(hoje)}
                            </span>
                            {status && (
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${status.classe}`}
                              >
                                {status.label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-600">
                            Visão gerencial do fechamento diário sem sair do Dashboard.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => abrirCaixaDaLoja(Number(loja.id))}
                            className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                          >
                            Ver histórico do Caixa
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDashboardCaixaAbertoLojaId(null)}
                            className="border-white/10 bg-white/[0.025] text-gray-300 hover:bg-white/[0.06] hover:text-white"
                          >
                            Fechar detalhe
                          </Button>
                        </div>
                      </div>

                      <CardContent className="p-4 sm:p-5">
                        {!fechamento ? (
                          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                            <div className="flex items-start gap-3">
                              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5">
                                <WalletCards className="h-5 w-5 text-gray-600" />
                              </div>
                              <div>
                                <p className="font-black text-white">Caixa ainda não fechado</p>
                                <p className="mt-1 text-sm leading-6 text-gray-500">
                                  Ainda não existe fechamento de caixa para {loja.nome} em {formatarData(hoje)}.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Saldo Final esperado
                                </p>
                                <p className="mt-2 text-2xl font-black text-white">
                                  {formatarMoeda(fechamento.saldoFinal)}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Dinheiro contado
                                </p>
                                <p className="mt-2 text-2xl font-black text-white">
                                  {formatarMoeda(fechamento.totalFisico)}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Diferença
                                </p>
                                <p
                                  className={`mt-2 text-2xl font-black ${
                                    Math.abs(diferenca) < 0.005
                                      ? "text-emerald-300"
                                      : Math.abs(diferenca) <= 5
                                      ? "text-amber-300"
                                      : "text-rose-300"
                                  }`}
                                >
                                  {formatarMoeda(diferenca)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Motivo
                                </p>
                                <p className="mt-2 text-sm font-bold text-gray-200">
                                  {labelMotivoCaixa(fechamento.justificativaTipo)}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Observação
                                </p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                                  {fechamento.justificativaObservacao || "—"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Fechado por
                                </p>
                                <p className="mt-2 text-sm font-bold text-white">
                                  {fechamento.fechadoPorNome || "Usuário não informado"}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {fechamento.fechadoEm
                                    ? formatarDataHora(fechamento.fechadoEm)
                                    : "Horário não informado"}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  Relatório original
                                </p>
                                <p className="mt-2 truncate text-xs font-bold text-[#F2D675]/80">
                                  {fechamento.relatorioNome || "relatorio-caixa.xlsx"}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => baixarRelatorioCaixa(fechamento)}
                                  disabled={caixaBaixandoId === Number(fechamento.id)}
                                  className="mt-3 border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  {caixaBaixandoId === Number(fechamento.id)
                                    ? "Abrindo..."
                                    : "Baixar XLSX"}
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

              {dashboardLojaAbertaId !== null &&
                (() => {
                  const loja = dashboardLojas.find(
                    (item: any) => Number(item.id) === Number(dashboardLojaAbertaId)
                  );

                  if (!loja) return null;

                  const grupos = [
                    ...loja.periodos.map((periodo: any) => ({
                      chave: periodo.periodo,
                      titulo: `${periodo.horario} • ${periodo.titulo}`,
                      pendencias: periodo.pendencias,
                      anterior: false,
                    })),
                    ...(loja.pendenciasAnteriores > 0
                      ? [
                          {
                            chave: "anteriores",
                            titulo: "Pendências anteriores",
                            pendencias: loja.pendenciasAbertas.filter(
                              (pendencia: any) =>
                                String(pendencia.dataReferencia || "").slice(0, 10) !== hoje
                            ),
                            anterior: true,
                          },
                        ]
                      : []),
                  ];

                  return (
                    <Card className="mt-5 overflow-hidden border-[#D4AF37]/25 bg-[#0b0b0b]">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-5">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                            Detalhes da unidade
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-black text-white">{loja.nome}</h3>
                            <span className="rounded-full border border-rose-400/20 bg-rose-400/[0.05] px-2.5 py-1 text-[10px] font-black text-rose-300">
                              {loja.pendenciasAbertas.length} pendência{
                                loja.pendenciasAbertas.length === 1 ? "" : "s"
                              }
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-600">
                            Abra apenas o horário que deseja consultar. As outras lojas continuam visíveis acima.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDashboardLojaAbertaId(null)}
                          className="border-white/10 bg-white/[0.025] text-gray-300 hover:bg-white/[0.06] hover:text-white"
                        >
                          Fechar detalhes
                        </Button>
                      </div>

                      <CardContent className="p-4 sm:p-5">
                        {loja.pendenciasAbertas.length === 0 ? (
                          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 text-sm text-emerald-200">
                            Nenhuma pendência aberta nesta loja.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {grupos.map((grupo: any) => {
                              const quantidade = grupo.pendencias.length;

                              return (
                                <details
                                  key={grupo.chave}
                                  className={`group overflow-hidden rounded-xl border ${
                                    quantidade > 0
                                      ? grupo.anterior
                                        ? "border-amber-400/15 bg-amber-400/[0.025]"
                                        : "border-rose-400/15 bg-rose-400/[0.025]"
                                      : "border-emerald-400/10 bg-emerald-400/[0.02]"
                                  }`}
                                >
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div
                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                          quantidade > 0
                                            ? grupo.anterior
                                              ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-300"
                                              : "border-rose-400/20 bg-rose-400/[0.06] text-rose-300"
                                            : "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300"
                                        }`}
                                      >
                                        {quantidade > 0 ? (
                                          <Clock3 className="h-4 w-4" />
                                        ) : (
                                          <CheckCircle2 className="h-4 w-4" />
                                        )}
                                      </div>

                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-white">
                                          {grupo.titulo}
                                        </p>
                                        <p
                                          className={`mt-0.5 text-[11px] ${
                                            quantidade > 0
                                              ? grupo.anterior
                                                ? "text-amber-300/75"
                                                : "text-rose-300/75"
                                              : "text-emerald-300/70"
                                          }`}
                                        >
                                          {quantidade > 0
                                            ? "Clique para ver os funcionários"
                                            : "Nenhuma pendência"}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                                          quantidade > 0
                                            ? grupo.anterior
                                              ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-300"
                                              : "border-rose-400/20 bg-rose-400/[0.06] text-rose-300"
                                            : "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300"
                                        }`}
                                      >
                                        {quantidade > 0
                                          ? `${quantidade} pendência${quantidade === 1 ? "" : "s"}`
                                          : "Completo"}
                                      </span>
                                      <ChevronDown className="h-4 w-4 text-gray-600 transition-transform group-open:rotate-180" />
                                    </div>
                                  </summary>

                                  {quantidade > 0 && (
                                    <div className="grid gap-2 border-t border-white/[0.06] p-3 md:grid-cols-2">
                                      {grupo.pendencias.map((pendencia: any) => (
                                        <div
                                          key={`${pendencia.fase}-${pendencia.id}`}
                                          className="rounded-xl border border-white/[0.08] bg-black/30 p-3.5"
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-black text-white">
                                                {pendencia.funcionarioNome}
                                              </p>
                                              <p
                                                className={`mt-1 text-xs font-bold ${
                                                  pendencia.fase === "cadastro"
                                                    ? "text-amber-300"
                                                    : pendencia.fase === "documento"
                                                    ? "text-sky-300"
                                                    : "text-rose-200"
                                                }`}
                                              >
                                                {labelPendenciaRh(pendencia)}
                                              </p>
                                            </div>
                                            <span className="shrink-0 rounded-lg border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-2 py-1 text-[10px] font-black text-[#F2D675]">
                                              {formatarData(
                                                String(pendencia.dataReferencia || "").slice(0, 10)
                                              )}
                                            </span>
                                          </div>

                                          <div className="mt-3 flex flex-wrap gap-2">
                                            {pendencia.tratativaTipo ? (
                                              <span className="rounded-lg border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-2.5 py-1 text-[10px] font-bold text-[#F2D675]">
                                                Tratativa: {labelTratativaHistorico(pendencia.tratativaTipo)}
                                              </span>
                                            ) : pendencia.fase === "classificar" ? (
                                              <span className="rounded-lg border border-rose-400/15 bg-rose-400/[0.05] px-2.5 py-1 text-[10px] font-bold text-rose-300">
                                                Tratativa ainda não definida
                                              </span>
                                            ) : null}

                                            {pendencia.fase === "documento" && (
                                              <span
                                                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${
                                                  statusDocumentoHistorico(pendencia.documentoStatus).classe
                                                }`}
                                              >
                                                {statusDocumentoHistorico(pendencia.documentoStatus).label}
                                              </span>
                                            )}

                                            {pendencia.fase === "cadastro" && (
                                              <span className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-1 text-[10px] font-bold text-amber-300">
                                                Ação do RH: concluir cadastro
                                              </span>
                                            )}
                                          </div>

                                          {pendencia.mensagem && (
                                            <p className="mt-2 text-[11px] leading-5 text-gray-500">
                                              {pendencia.mensagem}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}
            </>
          )}
        </section>

        <section className="mt-7">
          <div className="mb-4">
            <p className="text-lg font-black text-white">Estrutura do RH</p>
            <p className="mt-1 text-sm text-gray-500">
              Vamos ativar um módulo por vez e validar com situações reais.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULOS.map((modulo) => {
              const Icon = modulo.icon;

              return (
                <Card
                  key={modulo.titulo}
                  onClick={
                    modulo.titulo === "Conferência de Ponto"
                      ? abrirHistoricoPonto
                      : modulo.titulo === "Conferência de Caixa"
                       ? abrirFechamentosCaixa
                       : modulo.titulo === "Documentos RH"
                       ? () => navigate("/rh/documentos")
                       : modulo.titulo === "Entrega de EPIs"
                       ? () => navigate("/rh/epis")
                       : modulo.titulo === "Férias"
                       ? () => navigate("/rh/ferias")
                       : undefined
                  }
                  className={`border-white/[0.08] bg-[#0b0b0b] transition hover:border-[#D4AF37]/25 ${
                    modulo.ativo ? "cursor-pointer border-emerald-400/15" : ""
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                        <Icon className="h-5 w-5 text-[#F2D675]" />
                      </div>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                          modulo.ativo
                            ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300"
                            : "border-white/[0.08] bg-white/[0.03] text-gray-500"
                        }`}
                      >
                        {modulo.ativo ? "Ativo" : "Em construção"}
                      </span>
                    </div>

                    <p className="mt-4 font-bold text-white">{modulo.titulo}</p>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      {modulo.descricao}
                    </p>

                    {modulo.ativo && (
                      <p className="mt-3 text-xs font-bold text-[#F2D675]">
                        {modulo.titulo === "Conferência de Caixa" || modulo.titulo === "Documentos RH"
                           ? "Abrir módulo →"
                           : "Ver histórico ↓"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section id="fechamentos-caixa" className="mt-8 scroll-mt-6">
          <div className="mb-4">
            <p className="text-xl font-black text-white">Fechamentos de Caixa</p>
            <p className="mt-1 text-sm text-gray-500">
              Consulte o fechamento realizado pela Caixa Líder por loja e data.
            </p>
          </div>

          <Card className="border-[#D4AF37]/15 bg-[#0b0b0b]">
            <CardContent className="p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Loja
                  </label>
                  <Select
                    value={caixaLojaFiltro}
                    onValueChange={setCaixaLojaFiltro}
                  >
                    <SelectTrigger className="h-11 w-full border-white/10 bg-black/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      <SelectItem value="todas">Todas as lojas</SelectItem>
                      {lojas
                        .filter((loja) => Number(loja.id) !== 5)
                        .map((loja) => (
                          <SelectItem key={loja.id} value={String(loja.id)}>
                            {loja.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Data
                  </label>
                  <input
                    type="date"
                    value={caixaDataFiltro}
                    onChange={(event) => setCaixaDataFiltro(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                  />
                </div>

                <Button
                  type="button"
                  onClick={buscarFechamentosCaixa}
                  disabled={!caixaDataFiltro || fechamentosCaixaQuery.isFetching}
                  className="h-11 bg-[#D4AF37] px-6 font-bold text-black hover:bg-[#E6C760]"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {fechamentosCaixaQuery.isFetching ? "Buscando..." : "Buscar"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {caixaErroRelatorio && (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200">
              {caixaErroRelatorio}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {!caixaFiltroAplicado && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                Selecione a loja e a data e clique em Buscar.
              </div>
            )}

            {caixaFiltroAplicado && fechamentosCaixaQuery.isLoading && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                Carregando fechamentos...
              </div>
            )}

            {caixaFiltroAplicado && fechamentosCaixaQuery.error && (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-5 text-sm text-rose-200">
                {fechamentosCaixaQuery.error.message}
              </div>
            )}

            {caixaFiltroAplicado &&
              !fechamentosCaixaQuery.isLoading &&
              !fechamentosCaixaQuery.error &&
              fechamentosCaixa.length === 0 && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                  Nenhum fechamento encontrado para a loja e data selecionadas.
                </div>
              )}

            {fechamentosCaixa.map((fechamento: any) => {
              const status = statusCaixa(fechamento);
              const diferenca = Number(fechamento.diferenca || 0);

              return (
                <Card
                  key={fechamento.id}
                  className="border-white/[0.08] bg-[#0b0b0b]"
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] px-2.5 py-1 text-xs font-black text-[#F2D675]">
                            {fechamento.lojaNome}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatarData(fechamento.dataReferencia)}
                          </span>
                        </div>

                        <p className="mt-3 text-lg font-black text-white">
                          {fechamento.contaNome || "CAIXA"}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Fechado por{" "}
                          <strong className="text-gray-300">
                            {fechamento.fechadoPorNome || "Usuário não informado"}
                          </strong>
                          {fechamento.fechadoEm
                            ? ` • ${formatarDataHora(fechamento.fechadoEm)}`
                            : ""}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1.5 text-xs font-black ${status.classe}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Saldo Final esperado
                        </p>
                        <p className="mt-1 text-lg font-black text-white">
                          {formatarMoeda(fechamento.saldoFinal)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Dinheiro contado
                        </p>
                        <p className="mt-1 text-lg font-black text-white">
                          {formatarMoeda(fechamento.totalFisico)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Diferença
                        </p>
                        <p
                          className={`mt-1 text-lg font-black ${
                            Math.abs(diferenca) < 0.005
                              ? "text-emerald-300"
                              : Math.abs(diferenca) <= 5
                              ? "text-amber-300"
                              : "text-rose-300"
                          }`}
                        >
                          {formatarMoeda(diferenca)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Motivo
                        </p>
                        <p className="mt-1 text-sm font-bold text-gray-200">
                          {labelMotivoCaixa(fechamento.justificativaTipo)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Observação
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                          {fechamento.justificativaObservacao || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                          Relatório original
                        </p>
                        <p className="mt-1 max-w-xl truncate text-xs text-[#F2D675]/70">
                          {fechamento.relatorioNome || "relatorio-caixa.xlsx"}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => baixarRelatorioCaixa(fechamento)}
                        disabled={caixaBaixandoId === Number(fechamento.id)}
                        className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {caixaBaixandoId === Number(fechamento.id)
                          ? "Abrindo..."
                          : "Baixar relatório XLSX"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-black text-white">Pendências do Ponto</p>
              <p className="mt-1 text-sm text-gray-500">
                Acompanhe todas as lojas. A pendência só sai quando a tratativa ou o documento for concluído.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => pendenciasQuery.refetch()}
              className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              Atualizar pendências
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-rose-400/15 bg-rose-400/[0.035]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">Total aberto</p>
                <p className="mt-1 text-2xl font-black text-rose-300">{resumo.pendenciasAbertas}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-400/15 bg-amber-400/[0.035]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">Cadastros RH</p>
                <p className="mt-1 text-2xl font-black text-amber-300">{resumo.cadastrosPendentes}</p>
              </CardContent>
            </Card>
            <Card className="border-sky-400/15 bg-sky-400/[0.035]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">Documentos pendentes</p>
                <p className="mt-1 text-2xl font-black text-sky-300">{resumo.documentosPendentes}</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 space-y-3">
            {pendenciasQuery.isLoading && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                Carregando pendências...
              </div>
            )}

            {!pendenciasQuery.isLoading && pendencias.length === 0 && (
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5 text-sm text-emerald-200">
                Nenhuma pendência aberta no ponto.
              </div>
            )}

            {pendencias.map((p: any) => (
              <Card key={p.id} className="border-white/[0.08] bg-[#0b0b0b]">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] px-2 py-1 text-[11px] font-black text-[#F2D675]">
                          {p.lojaNome}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatarData(p.dataReferencia)}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-base font-black text-white">{p.funcionarioNome}</p>
                      <p className={`mt-1 text-sm font-bold ${p.fase === "cadastro" ? "text-amber-300" : p.fase === "documento" ? "text-sky-300" : "text-rose-300"}`}>
                        {labelPendenciaRh(p)}
                      </p>
                      {p.mensagem && <p className="mt-2 text-xs leading-5 text-gray-500">{p.mensagem}</p>}
                      {p.tratativaTipo === "atestado" && p.dataFimAtestado && (
                        <p className="mt-2 text-xs text-sky-200">
                          Cobertura informada até {formatarData(p.dataFimAtestado)}
                        </p>
                      )}
                    </div>

                    {p.fase === "cadastro" && (
                      <Button
                        type="button"
                        onClick={() => navigate("/funcionarios")}
                        className="bg-[#D4AF37] font-bold text-black hover:bg-[#E6C760]"
                      >
                        Abrir cadastro
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="historico-ponto" className="mt-8 scroll-mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-black text-white">
                Histórico de Conferência de Ponto
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Consulta exclusiva da Liderança de RH.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => historicoQuery.refetch()}
              className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              Atualizar
            </Button>
          </div>

          <Card className="border-[#D4AF37]/15 bg-[#0b0b0b]">
            <CardContent className="p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    De
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(event) => setDataInicio(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Até
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(event) => setDataFim(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Loja
                  </label>
                  <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
                    <SelectTrigger className="h-11 w-full border-white/10 bg-black/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      <SelectItem value="todas">Todas as lojas</SelectItem>
                      {lojas.map((loja) => (
                        <SelectItem key={loja.id} value={String(loja.id)}>
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Funcionário
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text"
                      value={buscaFuncionario}
                      onChange={(event) =>
                        setBuscaFuncionario(event.target.value)
                      }
                      placeholder="Buscar pelo nome"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                    />
                  </div>
                </div>
              </div>

              {!periodoValido && (
                <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2.5 text-sm text-rose-200">
                  A data inicial não pode ser maior que a data final.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">
                  Conferências
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {resumo.conferencias}
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">
                  Atrasos registrados
                </p>
                <p className="mt-1 text-2xl font-black text-amber-300">
                  {resumo.atrasos}
                </p>
              </CardContent>
            </Card>

            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">
                  Pendências abertas
                </p>
                <p
                  className={`mt-1 text-2xl font-black ${
                    resumo.pendenciasAbertas > 0
                      ? "text-rose-300"
                      : "text-emerald-300"
                  }`}
                >
                  {resumo.pendenciasAbertas}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 space-y-3">
            {historicoQuery.isLoading && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                Carregando histórico...
              </div>
            )}

            {historicoQuery.error && (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-5 text-sm text-rose-200">
                {historicoQuery.error.message}
              </div>
            )}

            {!historicoQuery.isLoading &&
              !historicoQuery.error &&
              historicoFiltrado.length === 0 && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 text-sm text-gray-500">
                  Nenhuma conferência encontrada para os filtros selecionados.
                </div>
              )}

            {historicoFiltrado.map((conferencia: any) => (
              <Card
                key={conferencia.id}
                className="border-white/[0.08] bg-[#0b0b0b]"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] px-2.5 py-1 text-xs font-black text-[#F2D675]">
                          {formatarData(conferencia.dataReferencia)}
                        </span>

                        <span className="text-sm font-bold text-white">
                          {conferencia.lojaNome}
                        </span>
                      </div>

                      <p className="mt-3 text-lg font-black text-white">
                        {nomePeriodoGestao(
                          String(conferencia.periodo),
                          conferencia.dataReferencia
                        )}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Conferido por{" "}
                        <strong className="text-gray-300">
                          {conferencia.conferidoPorNome}
                        </strong>{" "}
                        às {formatarHorarioData(conferencia.conferidoEm)}
                      </p>

                      {conferencia.relatorioNome && (
                        <p className="mt-1 max-w-xl truncate text-[11px] text-[#F2D675]/60">
                          PDF: {conferencia.relatorioNome} • {Number(conferencia.relatorioTotalLinhas || 0)} linha(s) analisada(s)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs font-bold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Conferido
                    </div>
                  </div>

                  {conferencia.observacao && (
                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-sm text-gray-400">
                      {conferencia.observacao}
                    </div>
                  )}

                  {(conferencia.ocorrencias || []).length === 0 ? (
                    <div className="mt-4 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] px-3 py-3 text-sm text-emerald-200">
                      Tudo certo • nenhuma ocorrência registrada.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {(conferencia.ocorrencias || []).map(
                        (ocorrencia: any) => (
                          <div
                            key={ocorrencia.id}
                            className="rounded-xl border border-white/[0.08] bg-[#111111] p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#F2D675]" />
                                <div className="min-w-0">
                                  <p className="font-bold text-white">
                                    {ocorrencia.funcionarioNome}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Batida: {ocorrencia.horarioBatida} • Previsto:{" "}
                                    {ocorrencia.horarioPrevisto}
                                  </p>
                                  {ocorrencia.observacao && (
                                    <p className="mt-1 text-xs text-gray-400">
                                      {ocorrencia.observacao}
                                    </p>
                                  )}

                                  {ocorrencia.tratativaId && (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="rounded-lg border border-[#D4AF37]/15 bg-[#D4AF37]/[0.05] px-2.5 py-1 text-[11px] font-bold text-[#F2D675]">
                                        Tratativa: {labelTratativaHistorico(ocorrencia.tratativaTipo)}
                                      </span>
                                      <span
                                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${statusDocumentoHistorico(ocorrencia.documentoStatus).classe}`}
                                      >
                                        {statusDocumentoHistorico(ocorrencia.documentoStatus).label}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-lg px-2.5 py-1 text-xs font-black ${classeTipoOcorrencia(
                                    ocorrencia
                                  )}`}
                                >
                                  {labelTipoOcorrencia(ocorrencia)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] p-5">
            <p className="text-sm font-bold text-[#F2D675]">
              Próxima validação
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Validar a conferência de ponto com uma Caixa Líder: salvar uma
              conferência sem ocorrência e outra com atraso. Depois ativaremos
              o anexo da advertência assinada.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}