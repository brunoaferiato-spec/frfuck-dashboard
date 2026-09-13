import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
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

const LOJAS_RH = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

type StatusFerias =
  | "aguardando_aviso"
  | "aguardando_liberacao_pagamento"
  | "aguardando_pagamento"
  | "programada"
  | "em_ferias"
  | "concluida"
  | "cancelada";

type ProcessoFerias = {
  id: number;
  lojaId: number;
  lojaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  periodoAquisitivoInicio: string;
  periodoAquisitivoFim: string;
  dataInicio: string;
  dataRetorno: string;
  quantidadeDias: number;
  observacao?: string | null;
  status: StatusFerias;
  avisoPendente: boolean;
  pagamentoSolicitado: boolean;
  contasAPagarLancado: boolean;
  contasAPagarPorNome?: string | null;
  contasAPagarEm?: string | null;
  pagamentoPendente: boolean;
  avisoNome?: string | null;
  avisoTamanho?: number | null;
  avisoAnexadoEm?: string | null;
  avisoPorNome?: string | null;
  pagamentoNome?: string | null;
  pagamentoTamanho?: number | null;
  pagamentoAnexadoEm?: string | null;
  pagamentoPorNome?: string | null;
  criadoPorNome?: string | null;
  criadoEm?: string | null;
  atualizadoEm?: string | null;
};

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function somarDias(dataCivil: string, dias: number) {
  if (!dataCivil || !Number.isFinite(dias)) return "";

  const [ano, mes, dia] = dataCivil.split("-").map(Number);
  if (!ano || !mes || !dia) return "";

  const data = new Date(ano, mes - 1, dia);
  data.setDate(data.getDate() + dias);

  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate()
  ).padStart(2, "0")}`;
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarTamanho(bytes?: number | null) {
  const valor = Number(bytes || 0);
  if (!valor) return "";
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(0)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function diasAte(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const alvo = new Date(ano, mes - 1, dia);

  return Math.round((alvo.getTime() - inicioHoje.getTime()) / 86_400_000);
}

function labelStatus(status: StatusFerias) {
  if (status === "aguardando_aviso") return "Aguardando aviso";
  if (status === "aguardando_liberacao_pagamento") return "Aviso recebido";
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  if (status === "programada") return "Programada";
  if (status === "em_ferias") return "Em férias";
  if (status === "concluida") return "Concluída";
  return "Cancelada";
}

function classeStatus(status: StatusFerias) {
  if (status === "aguardando_aviso") {
    return "border-amber-400/20 bg-amber-400/[0.06] text-amber-200";
  }

  if (status === "aguardando_liberacao_pagamento") {
    return "border-sky-400/20 bg-sky-400/[0.06] text-sky-200";
  }

  if (status === "aguardando_pagamento") {
    return "border-orange-400/20 bg-orange-400/[0.06] text-orange-200";
  }

  if (status === "programada") {
    return "border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] text-[#F2D675]";
  }

  if (status === "em_ferias") {
    return "border-violet-400/20 bg-violet-400/[0.06] text-violet-200";
  }

  if (status === "concluida") {
    return "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200";
  }

  return "border-white/10 bg-white/[0.03] text-gray-500";
}

export default function RHFerias() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaUsuario > 0;
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";
  const podeGerenciar = liderRh || adminOuGestor;

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [lojaForm, setLojaForm] = useState("");
  const [funcionarioForm, setFuncionarioForm] = useState("");
  const [aquisitivoInicio, setAquisitivoInicio] = useState("");
  const [aquisitivoFim, setAquisitivoFim] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [quantidadeDias, setQuantidadeDias] = useState("30");
  const [observacao, setObservacao] = useState("");

  const [lojaFiltro, setLojaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [abrindoArquivo, setAbrindoArquivo] = useState<string | null>(null);

  const lojasQuery = trpc.lojas.list.useQuery(undefined, { retry: false });

  const lojas = useMemo(() => {
    const recebidas = (lojasQuery.data || []) as Array<{ id: number; nome: string }>;
    const mapa = new Map(recebidas.map((loja) => [Number(loja.id), loja]));

    return LOJAS_RH.map((loja) => {
      const recebida = mapa.get(loja.id);
      return recebida
        ? {
            ...loja,
            ...recebida,
            id: Number(recebida.id),
            nome: recebida.nome || loja.nome,
          }
        : { ...loja };
    });
  }, [lojasQuery.data]);

  const lojaFormNumero = Number(lojaForm || 0);

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: lojaFormNumero },
    {
      enabled: lojaFormNumero > 0,
      retry: false,
    }
  );

  const funcionarios = useMemo(
    () => ((funcionariosQuery.data || []) as Array<any>),
    [funcionariosQuery.data]
  );

  const periodoQuery = trpc.rhFerias.periodoSugerido.useQuery(
    {
      lojaId: lojaFormNumero,
      funcionarioId: Number(funcionarioForm || 0),
      ignorarId: editandoId || null,
    },
    {
      enabled: lojaFormNumero > 0 && Number(funcionarioForm || 0) > 0,
      retry: false,
    }
  );

  const periodoAutomatico = periodoQuery.data as
    | {
        dataAdmissao: string;
        periodoAquisitivoInicio: string;
        periodoAquisitivoFim: string;
        dataLimiteRetorno: string;
        ultimaDataSeguraInicio30: string;
        diasAteLimiteRetorno: number;
        diasAteUltimoInicio30: number;
        aquisitivoConcluido: boolean;
      }
    | undefined;

  useEffect(() => {
    if (!periodoAutomatico) return;
    setAquisitivoInicio(periodoAutomatico.periodoAquisitivoInicio);
    setAquisitivoFim(periodoAutomatico.periodoAquisitivoFim);
  }, [periodoAutomatico]);

  const processosQuery = trpc.rhFerias.listar.useQuery(
    {
      lojaId: lojaFiltro === "todas" ? null : Number(lojaFiltro),
      funcionarioId: null,
      status: statusFiltro === "todos" ? null : (statusFiltro as StatusFerias),
    },
    {
      enabled: podeGerenciar,
      retry: false,
    }
  );

  const processos = useMemo(
    () => ((processosQuery.data || []) as ProcessoFerias[]),
    [processosQuery.data]
  );

  const processosFiltrados = useMemo(() => {
    const alvo = normalizarTexto(busca);
    if (!alvo) return processos;

    return processos.filter((processo) =>
      [
        processo.funcionarioNome,
        processo.lojaNome,
        processo.funcionarioFuncao,
        labelStatus(processo.status),
        processo.observacao,
      ].some((valor) => normalizarTexto(valor).includes(alvo))
    );
  }, [processos, busca]);

  const resumo = useMemo(() => {
    let aguardandoAviso = 0;
    let aguardandoPagamento = 0;
    let programadas = 0;
    let emFerias = 0;
    let retornos7Dias = 0;

    for (const processo of processos) {
      if (processo.status === "aguardando_aviso") aguardandoAviso += 1;
      if (processo.status === "aguardando_pagamento") aguardandoPagamento += 1;
      if (
        processo.status === "programada" ||
        processo.status === "aguardando_liberacao_pagamento"
      ) {
        programadas += 1;
      }
      if (processo.status === "em_ferias") emFerias += 1;

      const diasRetorno = diasAte(processo.dataRetorno);
      if (
        processo.status !== "cancelada" &&
        diasRetorno !== null &&
        diasRetorno >= 0 &&
        diasRetorno <= 7
      ) {
        retornos7Dias += 1;
      }
    }

    return {
      total: processos.length,
      aguardandoAviso,
      aguardandoPagamento,
      programadas,
      emFerias,
      retornos7Dias,
    };
  }, [processos]);

  const dataRetorno = useMemo(
    () => somarDias(dataInicio, Number(quantidadeDias || 0)),
    [dataInicio, quantidadeDias]
  );

  const ultimaDataSeguraInicio = useMemo(() => {
    if (!periodoAutomatico?.dataLimiteRetorno) return "";
    const dias = Number(quantidadeDias || 0);
    if (!Number.isInteger(dias) || dias <= 0) return "";
    return somarDias(periodoAutomatico.dataLimiteRetorno, -dias);
  }, [periodoAutomatico, quantidadeDias]);

  const ultrapassaLimite =
    Boolean(dataRetorno) &&
    Boolean(periodoAutomatico?.dataLimiteRetorno) &&
    dataRetorno > String(periodoAutomatico?.dataLimiteRetorno);

  const limparFormulario = () => {
    setEditandoId(null);
    setLojaForm("");
    setFuncionarioForm("");
    setAquisitivoInicio("");
    setAquisitivoFim("");
    setDataInicio("");
    setQuantidadeDias("30");
    setObservacao("");
  };

  const salvarMutation = trpc.rhFerias.salvar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Férias programadas com sucesso. A Caixa da loja receberá a pendência do aviso.");
      limparFormulario();
      await utils.rhFerias.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível programar as férias.");
    },
  });

  const atualizarMutation = trpc.rhFerias.atualizar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Processo de férias atualizado com sucesso.");
      limparFormulario();
      await utils.rhFerias.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível atualizar o processo.");
    },
  });

  const cancelarMutation = trpc.rhFerias.cancelar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Processo de férias cancelado.");
      await utils.rhFerias.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível cancelar o processo.");
    },
  });

  function validarFormulario() {
    const lojaId = Number(lojaForm || 0);
    const funcionarioId = Number(funcionarioForm || 0);
    const dias = Number(quantidadeDias || 0);

    if (!lojaId) return "Selecione a loja.";
    if (!funcionarioId) return "Selecione o funcionário.";
    if (periodoQuery.isLoading) return "Aguarde o cálculo do período de férias.";
    if (periodoQuery.error) return periodoQuery.error.message;
    if (!aquisitivoInicio || !aquisitivoFim) return "Não foi possível calcular o período aquisitivo.";
    if (aquisitivoInicio > aquisitivoFim) return "O início do período aquisitivo não pode ser posterior ao fim.";
    if (!dataInicio) return "Informe a data de início das férias.";
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) {
      return "A quantidade de dias deve ficar entre 1 e 30.";
    }
    if (!dataRetorno) return "Não foi possível calcular a data de retorno.";
    if (ultrapassaLimite) {
      return `O retorno precisa acontecer até ${formatarData(
        periodoAutomatico?.dataLimiteRetorno
      )}.`;
    }

    return "";
  }

  function salvarProcesso() {
    setErro("");
    setMensagem("");

    const validacao = validarFormulario();
    if (validacao) {
      setErro(validacao);
      return;
    }

    const payload = {
      lojaId: Number(lojaForm),
      funcionarioId: Number(funcionarioForm),
      periodoAquisitivoInicio: aquisitivoInicio,
      periodoAquisitivoFim: aquisitivoFim,
      dataInicio,
      dataRetorno,
      quantidadeDias: Number(quantidadeDias),
      observacao: observacao.trim() || null,
    };

    if (editandoId) {
      atualizarMutation.mutate({
        id: editandoId,
        ...payload,
      });
      return;
    }

    salvarMutation.mutate(payload);
  }

  function editarProcesso(processo: ProcessoFerias) {
    setErro("");
    setMensagem("");
    setEditandoId(processo.id);
    setLojaForm(String(processo.lojaId));
    setFuncionarioForm(String(processo.funcionarioId));
    setAquisitivoInicio(processo.periodoAquisitivoInicio);
    setAquisitivoFim(processo.periodoAquisitivoFim);
    setDataInicio(processo.dataInicio);
    setQuantidadeDias(String(processo.quantidadeDias));
    setObservacao(processo.observacao || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function abrirDocumento(processo: ProcessoFerias, tipo: "aviso" | "pagamento") {
    const chave = `${processo.id}-${tipo}`;
    setAbrindoArquivo(chave);
    setErro("");

    try {
      const resposta = await utils.rhFerias.arquivo.fetch({
        id: processo.id,
        tipo,
      });

      const binario = atob(resposta.arquivoBase64);
      const bytes = new Uint8Array(binario.length);

      for (let i = 0; i < binario.length; i += 1) {
        bytes[i] = binario.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: resposta.arquivoMime });
      const url = URL.createObjectURL(blob);
      const novaAba = window.open(url, "_blank", "noopener,noreferrer");

      if (!novaAba) {
        const link = document.createElement("a");
        link.href = url;
        link.download = resposta.arquivoNome;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      setErro(error?.message || "Não foi possível abrir o documento.");
    } finally {
      setAbrindoArquivo(null);
    }
  }

  if (caixaLider || !podeGerenciar) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <Card className="w-full max-w-lg border-rose-400/20 bg-[#0b0b0b]">
          <CardContent className="p-7 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-300" />
            <h1 className="mt-4 text-xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              O módulo de Férias é exclusivo da Líder de RH. A Caixa recebe apenas as pendências de documentos da própria loja.
            </p>
            <Button
              type="button"
              onClick={() => navigate(caixaLider ? "/rh/meu-dia" : "/rh/gestao")}
              className="mt-5 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/rh/gestao")}
              className="h-10 w-10 shrink-0 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8f8a80] sm:text-xs">
                Gestão de pessoas
              </p>
              <h1 className="truncate text-xl font-black text-[#F2D675] sm:text-2xl">
                Férias
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#b9a46a] sm:flex">
            <ShieldCheck className="h-4 w-4 text-[#F2D675]" />
            Gestão da Líder de RH
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 text-sm font-black text-[#F2D675]"
          >
            Programar férias / Histórico
          </button>
          <button
            type="button"
            onClick={() => navigate("/rh/ferias/planejamento")}
            className="min-h-11 rounded-xl border border-white/[0.08] bg-[#0b0b0b] px-4 text-sm font-black text-gray-500 hover:text-gray-300"
          >
            Planejamento
          </button>
        </div>
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.55fr]">
          <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#080808]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                    {editandoId ? "Editar processo" : "Novo processo"}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    {editandoId ? "Alterar férias" : "Programar férias"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    A Líder de RH define todo o processo. A Caixa apenas receberá as solicitações de documentos da própria loja.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-3">
                  <CalendarDays className="h-6 w-6 text-[#F2D675]" />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                  <Select
                    value={lojaForm}
                    onValueChange={(valor) => {
                      setLojaForm(valor);
                      setFuncionarioForm("");
                    }}
                  >
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue placeholder="Selecione a loja" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      {lojas.map((loja) => (
                        <SelectItem key={loja.id} value={String(loja.id)}>
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Funcionário</label>
                  <Select
                    value={funcionarioForm}
                    onValueChange={setFuncionarioForm}
                    disabled={!lojaFormNumero || funcionariosQuery.isLoading}
                  >
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue
                        placeholder={
                          lojaFormNumero
                            ? funcionariosQuery.isLoading
                              ? "Carregando funcionários..."
                              : "Selecione o funcionário"
                            : "Selecione primeiro a loja"
                        }
                      />
                    </SelectTrigger>

                    <SelectContent className="max-h-72 border-white/10 bg-[#111111] text-white">
                      {funcionarios.map((funcionario: any) => (
                        <SelectItem key={funcionario.id} value={String(funcionario.id)}>
                          {funcionario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#b9a46a]">
                    Período calculado automaticamente
                  </p>

                  {!funcionarioForm ? (
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-4 text-sm text-gray-600">
                      Selecione o funcionário para calcular as férias pela data de admissão.
                    </div>
                  ) : periodoQuery.isLoading ? (
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-4 text-sm text-gray-500">
                      Calculando período aquisitivo...
                    </div>
                  ) : periodoQuery.error ? (
                    <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-4 text-sm text-rose-200">
                      {periodoQuery.error.message}
                    </div>
                  ) : periodoAutomatico ? (
                    <div className="space-y-3 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600">
                            Data de admissão
                          </p>
                          <p className="mt-1 text-sm font-black text-white">
                            {formatarData(periodoAutomatico.dataAdmissao)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600">
                            Período aquisitivo
                          </p>
                          <p className="mt-1 text-sm font-black text-white">
                            {formatarData(periodoAutomatico.periodoAquisitivoInicio)} a{" "}
                            {formatarData(periodoAutomatico.periodoAquisitivoFim)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600">
                            Limite interno para retorno
                          </p>
                          <p className={`mt-1 text-sm font-black ${
                            periodoAutomatico.diasAteLimiteRetorno <= 45
                              ? "text-rose-300"
                              : periodoAutomatico.diasAteLimiteRetorno <= 90
                              ? "text-amber-300"
                              : "text-[#F2D675]"
                          }`}>
                            {formatarData(periodoAutomatico.dataLimiteRetorno)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600">
                            Último início seguro
                          </p>
                          <p className="mt-1 text-sm font-black text-[#F2D675]">
                            {ultimaDataSeguraInicio
                              ? `${formatarData(ultimaDataSeguraInicio)} para ${quantidadeDias || 0} dias`
                              : "Informe a quantidade de dias"}
                          </p>
                        </div>
                      </div>

                      <p className="text-xs leading-5 text-gray-500">
                        Pela regra interna, o colaborador deve concluir as férias e retornar antes do vencimento do período seguinte.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#b9a46a]">
                    Período das férias
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-gray-400">Início das férias</label>
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={(event) => setDataInicio(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-gray-400">Quantidade de dias</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={quantidadeDias}
                        onChange={(event) => setQuantidadeDias(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                      />
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.035] px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-600">
                      Retorno calculado
                    </p>
                    <p className="mt-1 font-black text-[#F2D675]">
                      {dataRetorno ? formatarData(dataRetorno) : "Informe início e quantidade de dias"}
                    </p>
                  </div>

                  {ultrapassaLimite && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-3 text-xs leading-5 text-rose-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      Essa programação ultrapassa o limite interno. O retorno precisa acontecer até{" "}
                      {formatarData(periodoAutomatico?.dataLimiteRetorno)}.
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Observação</label>
                  <textarea
                    value={observacao}
                    onChange={(event) => setObservacao(event.target.value)}
                    rows={3}
                    placeholder="Opcional"
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                  />
                </div>

                {erro && (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-200">
                    {erro}
                  </div>
                )}

                {mensagem && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-sm text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {mensagem}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={salvarProcesso}
                    disabled={salvarMutation.isPending || atualizarMutation.isPending}
                    className="h-12 flex-1 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                  >
                    {editandoId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                    {editandoId
                      ? atualizarMutation.isPending
                        ? "Salvando..."
                        : "Salvar alterações"
                      : salvarMutation.isPending
                      ? "Programando..."
                      : "Programar férias"}
                  </Button>

                  {editandoId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={limparFormulario}
                      className="h-12 border-white/10 bg-white/[0.02] text-gray-300 hover:bg-white/[0.05] hover:text-white"
                    >
                      Cancelar edição
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-3">
                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Aguardando aviso</p>
                  <p className={`mt-2 text-2xl font-black ${resumo.aguardandoAviso ? "text-amber-300" : "text-emerald-300"}`}>{resumo.aguardandoAviso}</p>
                  <p className="mt-1 text-[11px] text-gray-600">pendência da Caixa</p>
                </div>

                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Pagamento pendente</p>
                  <p className={`mt-2 text-2xl font-black ${resumo.aguardandoPagamento ? "text-orange-300" : "text-emerald-300"}`}>{resumo.aguardandoPagamento}</p>
                  <p className="mt-1 text-[11px] text-gray-600">liberado para Caixa</p>
                </div>

                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Programadas</p>
                  <p className="mt-2 text-2xl font-black text-[#F2D675]">{resumo.programadas}</p>
                  <p className="mt-1 text-[11px] text-gray-600">fora do período atual</p>
                </div>

                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Em férias</p>
                  <p className="mt-2 text-2xl font-black text-violet-200">{resumo.emFerias}</p>
                  <p className="mt-1 text-[11px] text-gray-600">colaboradores afastados</p>
                </div>

                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Retornos em 7 dias</p>
                  <p className={`mt-2 text-2xl font-black ${resumo.retornos7Dias ? "text-sky-300" : "text-emerald-300"}`}>{resumo.retornos7Dias}</p>
                  <p className="mt-1 text-[11px] text-gray-600">atenção ao retorno</p>
                </div>

                <div className="bg-[#090909] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Processos</p>
                  <p className="mt-2 text-2xl font-black text-white">{resumo.total}</p>
                  <p className="mt-1 text-[11px] text-gray-600">no filtro atual</p>
                </div>
              </div>
            </Card>

            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                    <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
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

                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Status</label>
                    <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        <SelectItem value="todos">Todos os status</SelectItem>
                        <SelectItem value="aguardando_aviso">Aguardando aviso</SelectItem>
                        <SelectItem value="aguardando_liberacao_pagamento">Aviso recebido</SelectItem>
                        <SelectItem value="aguardando_pagamento">Aguardando pagamento</SelectItem>
                        <SelectItem value="programada">Programada</SelectItem>
                        <SelectItem value="em_ferias">Em férias</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative min-w-[240px] flex-[1.3]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      value={busca}
                      onChange={(event) => setBusca(event.target.value)}
                      placeholder="Buscar funcionário ou loja"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">Processos de férias</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {processosFiltrados.length} processo{processosFiltrados.length === 1 ? "" : "s"} encontrado{processosFiltrados.length === 1 ? "" : "s"}.
                </p>
              </div>
              <CalendarClock className="h-6 w-6 text-[#F2D675]" />
            </div>

            {processosQuery.isLoading ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]">
                <CardContent className="p-6 text-sm text-gray-500">Carregando férias...</CardContent>
              </Card>
            ) : processosQuery.error ? (
              <Card className="border-rose-400/20 bg-rose-400/[0.04]">
                <CardContent className="p-6 text-sm text-rose-200">
                  Não foi possível carregar as férias. {processosQuery.error.message}
                </CardContent>
              </Card>
            ) : processosFiltrados.length === 0 ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]">
                <CardContent className="p-8 text-center">
                  <CalendarDays className="mx-auto h-8 w-8 text-gray-700" />
                  <p className="mt-3 font-bold text-gray-300">Nenhum processo de férias encontrado</p>
                  <p className="mt-1 text-sm text-gray-600">Os processos programados aparecerão aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {processosFiltrados.map((processo) => (
                  <Card key={processo.id} className="border-white/[0.08] bg-[#0b0b0b] transition hover:border-[#D4AF37]/20">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <UserRound className="h-4 w-4 text-[#F2D675]" />
                              <p className="font-black text-white">{processo.funcionarioNome}</p>
                              <span className="rounded-full border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-2 py-0.5 text-[10px] font-black text-[#F2D675]">
                                {processo.lojaNome}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${classeStatus(processo.status)}`}>
                                {labelStatus(processo.status)}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-x-5 gap-y-2 text-xs text-gray-500 sm:grid-cols-2">
                              <span>
                                Aquisitivo: {formatarData(processo.periodoAquisitivoInicio)} a {formatarData(processo.periodoAquisitivoFim)}
                              </span>
                              <span>
                                Férias: {formatarData(processo.dataInicio)} → retorno {formatarData(processo.dataRetorno)}
                              </span>
                              <span>{processo.quantidadeDias} dia{processo.quantidadeDias === 1 ? "" : "s"}</span>
                              <span>Criado por {processo.criadoPorNome || "Usuário"} • {formatarDataHora(processo.criadoEm)}</span>
                            </div>

                            {processo.observacao && (
                              <p className="mt-2 text-xs leading-5 text-gray-500">{processo.observacao}</p>
                            )}
                          </div>

                          {processo.status !== "cancelada" && (
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {processo.avisoPendente && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => editarProcesso(processo)}
                                  className="border-white/10 bg-white/[0.02] text-gray-300 hover:bg-white/[0.06] hover:text-white"
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </Button>
                              )}

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  if (window.confirm(`Cancelar as férias de ${processo.funcionarioNome}?`)) {
                                    cancelarMutation.mutate({ id: processo.id });
                                  }
                                }}
                                disabled={cancelarMutation.isPending}
                                className="border-rose-400/20 bg-rose-400/[0.04] text-rose-200 hover:bg-rose-400/[0.08] hover:text-rose-100"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancelar
                              </Button>
                            </div>
                          )}
                        </div>

                        {processo.status !== "cancelada" && (
                          <div className="grid gap-3 border-t border-white/[0.06] pt-4 md:grid-cols-2">
                            <div className={`rounded-xl border p-3 ${processo.avisoPendente ? "border-amber-400/20 bg-amber-400/[0.035]" : "border-emerald-400/15 bg-emerald-400/[0.03]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black text-white">Aviso de férias</p>
                                  <p className={`mt-1 text-xs ${processo.avisoPendente ? "text-amber-200" : "text-emerald-200"}`}>
                                    {processo.avisoPendente ? "Aguardando a Caixa anexar o aviso." : "Documento recebido."}
                                  </p>

                                  {!processo.avisoPendente && processo.avisoNome && (
                                    <p className="mt-1 text-[10px] text-gray-600">
                                      {processo.avisoNome}
                                      {processo.avisoTamanho ? ` • ${formatarTamanho(processo.avisoTamanho)}` : ""}
                                    </p>
                                  )}
                                </div>

                                {!processo.avisoPendente && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void abrirDocumento(processo, "aviso")}
                                    disabled={abrindoArquivo === `${processo.id}-aviso`}
                                    className="border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200 hover:bg-emerald-400/[0.08]"
                                  >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Abrir
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className={`rounded-xl border p-3 ${
                              !processo.pagamentoSolicitado
                                ? "border-white/10 bg-white/[0.02]"
                                : processo.pagamentoPendente
                                ? "border-orange-400/20 bg-orange-400/[0.035]"
                                : "border-emerald-400/15 bg-emerald-400/[0.03]"
                            }`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black text-white">Pagamento das férias</p>
                                  <p className={`mt-1 text-xs ${
                                    !processo.pagamentoSolicitado
                                      ? "text-gray-500"
                                      : processo.pagamentoPendente
                                      ? "text-orange-200"
                                      : "text-emerald-200"
                                  }`}>
                                    {!processo.pagamentoSolicitado
                                      ? "A etapa financeira abre automaticamente após o aviso assinado."
                                      : !processo.contasAPagarLancado
                                      ? "Aguardando a Caixa confirmar o lançamento no Contas a Pagar."
                                      : processo.pagamentoPendente
                                      ? "Contas a Pagar confirmado. Aguardando o documento assinado."
                                      : "Contas a Pagar confirmado e documento recebido."}
                                  </p>

                                  {processo.contasAPagarLancado && (
                                    <p className="mt-1 text-[10px] font-bold text-emerald-300">
                                      ✓ Lançado no Contas a Pagar
                                      {processo.contasAPagarPorNome ? ` por ${processo.contasAPagarPorNome}` : ""}
                                    </p>
                                  )}

                                  {!processo.pagamentoPendente && processo.pagamentoNome && (
                                    <p className="mt-1 text-[10px] text-gray-600">
                                      {processo.pagamentoNome}
                                      {processo.pagamentoTamanho ? ` • ${formatarTamanho(processo.pagamentoTamanho)}` : ""}
                                    </p>
                                  )}
                                </div>

                                {processo.pagamentoSolicitado && !processo.pagamentoPendente ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void abrirDocumento(processo, "pagamento")}
                                    disabled={abrindoArquivo === `${processo.id}-pagamento`}
                                    className="border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200 hover:bg-emerald-400/[0.08]"
                                  >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Abrir
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
