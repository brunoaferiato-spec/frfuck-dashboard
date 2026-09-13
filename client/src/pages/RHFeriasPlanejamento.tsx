import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CalendarDays, LayoutGrid, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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

type ProcessoFerias = {
  id: number;
  lojaId: number;
  lojaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  dataInicio: string;
  dataRetorno: string;
  quantidadeDias: number;
  status: string;
  avisoPendente: boolean;
  pagamentoSolicitado: boolean;
  pagamentoPendente: boolean;
};

type Horizonte = "ano" | "6m" | "12m";

type VencimentoFerias = {
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  lojaId: number;
  lojaNome: string;
  dataAdmissao: string;
  periodoAquisitivoInicio: string;
  periodoAquisitivoFim: string;
  dataLimiteRetorno: string;
  ultimaDataSeguraInicio30: string;
  diasAteLimiteRetorno: number;
  diasAteUltimoInicio30: number;
  aquisitivoConcluido: boolean;
};

function parseData(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function dataCivil(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate()
  ).padStart(2, "0")}`;
}

function somarMeses(dataBase: Date, meses: number) {
  const data = new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate());
  data.setMonth(data.getMonth() + meses);
  return data;
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function diasAte(valor?: string | null) {
  const alvo = parseData(valor);
  if (!alvo) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function labelStatus(status: string) {
  if (status === "aguardando_aviso") return "Aguardando aviso";
  if (status === "aguardando_liberacao_pagamento") return "Aviso recebido";
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  if (status === "programada") return "Programada";
  if (status === "em_ferias") return "Em férias";
  if (status === "concluida") return "Concluída";
  return "Cancelada";
}

function classeStatus(status: string) {
  if (status === "aguardando_aviso") return "border-amber-400/20 bg-amber-400/[0.06] text-amber-200";
  if (status === "aguardando_liberacao_pagamento") return "border-sky-400/20 bg-sky-400/[0.06] text-sky-200";
  if (status === "aguardando_pagamento") return "border-orange-400/20 bg-orange-400/[0.06] text-orange-200";
  if (status === "programada") return "border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] text-[#F2D675]";
  if (status === "em_ferias") return "border-violet-400/20 bg-violet-400/[0.06] text-violet-200";
  if (status === "concluida") return "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200";
  return "border-white/10 bg-white/[0.03] text-gray-500";
}

function detectarSobreposicoes(processos: ProcessoFerias[]) {
  const ids = new Set<number>();
  const ativos = processos
    .filter((p) => p.status !== "cancelada")
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

  for (let i = 0; i < ativos.length; i += 1) {
    for (let j = i + 1; j < ativos.length; j += 1) {
      const a = ativos[i];
      const b = ativos[j];
      if (a.lojaId !== b.lojaId) continue;
      if (b.dataInicio >= a.dataRetorno) break;

      if (a.dataInicio < b.dataRetorno && b.dataInicio < a.dataRetorno) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }

  return ids;
}

export default function RHFeriasPlanejamento() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const podeGerenciar = (role === "rh" && lojaUsuario <= 0) || role === "admin" || role === "gestor";

  const [horizonte, setHorizonte] = useState<Horizonte>("6m");
  const [lojaFiltro, setLojaFiltro] = useState("todas");

  const lojasQuery = trpc.lojas.list.useQuery(undefined, { retry: false });
  const processosQuery = trpc.rhFerias.listar.useQuery(
    { lojaId: null, funcionarioId: null, status: null },
    { enabled: podeGerenciar, retry: false, refetchOnWindowFocus: true }
  );

  const vencimentosQuery = trpc.rhFerias.vencimentos.useQuery(undefined, {
    enabled: podeGerenciar,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const lojas = useMemo(() => {
    const recebidas = (lojasQuery.data || []) as Array<{ id: number; nome: string }>;
    const mapa = new Map(recebidas.map((loja) => [Number(loja.id), loja]));

    return LOJAS_RH.map((loja) => {
      const recebida = mapa.get(loja.id);
      return recebida
        ? { ...loja, ...recebida, id: Number(recebida.id), nome: recebida.nome || loja.nome }
        : { ...loja };
    });
  }, [lojasQuery.data]);

  const processos = useMemo(
    () => ((processosQuery.data || []) as ProcessoFerias[]),
    [processosQuery.data]
  );

  const vencimentos = useMemo(
    () => ((vencimentosQuery.data || []) as VencimentoFerias[]),
    [vencimentosQuery.data]
  );

  const vencimentosFiltrados = useMemo(
    () =>
      vencimentos
        .filter((item) => lojaFiltro === "todas" || item.lojaId === Number(lojaFiltro))
        .filter((item) => item.diasAteLimiteRetorno <= 365)
        .sort((a, b) => a.dataLimiteRetorno.localeCompare(b.dataLimiteRetorno)),
    [vencimentos, lojaFiltro]
  );

  const sobrepostos = useMemo(() => detectarSobreposicoes(processos), [processos]);

  const filtrados = useMemo(() => {
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicio = horizonte === "ano" ? new Date(agora.getFullYear(), 0, 1) : hoje;
    const fim =
      horizonte === "ano"
        ? new Date(agora.getFullYear() + 1, 0, 1)
        : somarMeses(hoje, horizonte === "6m" ? 6 : 12);

    const inicioTexto = dataCivil(inicio);
    const fimTexto = dataCivil(fim);

    return processos
      .filter((p) => p.status !== "cancelada")
      .filter((p) => lojaFiltro === "todas" || p.lojaId === Number(lojaFiltro))
      .filter((p) => p.dataInicio < fimTexto && p.dataRetorno >= inicioTexto)
      .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  }, [processos, horizonte, lojaFiltro]);

  const meses = useMemo(() => {
    const mapa = new Map<string, ProcessoFerias[]>();

    for (const processo of filtrados) {
      const data = parseData(processo.dataInicio);
      if (!data) continue;

      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      const grupo = mapa.get(chave) || [];
      grupo.push(processo);
      mapa.set(chave, grupo);
    }

    return Array.from(mapa.entries()).map(([chave, itens]) => {
      const [ano, mes] = chave.split("-").map(Number);
      const titulo = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(new Date(ano, mes - 1, 1));

      return {
        chave,
        titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
        itens,
      };
    });
  }, [filtrados]);

  const alertas = useMemo(() => {
    let aviso = 0;
    let pagamento = 0;
    let retorno = 0;

    for (const processo of processos) {
      if (processo.status === "cancelada" || processo.status === "concluida") continue;
      const inicio = diasAte(processo.dataInicio);
      const volta = diasAte(processo.dataRetorno);

      if (processo.avisoPendente && inicio !== null && inicio <= 30) aviso += 1;
      if (
        ((!processo.avisoPendente && !processo.pagamentoSolicitado && inicio !== null && inicio <= 5) ||
          (processo.pagamentoSolicitado && processo.pagamentoPendente && inicio !== null && inicio <= 2))
      ) {
        pagamento += 1;
      }
      if (processo.status === "em_ferias" && volta !== null && volta >= 0 && volta <= 1) retorno += 1;
    }

    return { aviso, pagamento, retorno };
  }, [processos]);

  if (!podeGerenciar) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <Card className="w-full max-w-lg border-rose-400/20 bg-[#0b0b0b]">
          <CardContent className="p-7 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-300" />
            <h1 className="mt-4 text-xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm text-gray-400">Planejamento de férias exclusivo da Líder de RH.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/rh/gestao")}
              className="h-10 w-10 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">Gestão de pessoas</p>
              <h1 className="text-2xl font-black text-[#F2D675]">Planejamento de férias</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#b9a46a] sm:flex">
            <ShieldCheck className="h-4 w-4 text-[#F2D675]" />
            Visão gerencial
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate("/rh/ferias")}
            className="min-h-11 rounded-xl border border-white/[0.08] bg-[#0b0b0b] px-4 text-sm font-black text-gray-500 hover:text-gray-300"
          >
            Programar férias / Histórico
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 text-sm font-black text-[#F2D675]"
          >
            Planejamento
          </button>
        </div>

        <Card className="mb-4 border-[#D4AF37]/20 bg-[#0b0b0b]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b9a46a]">
                  Visualizar por loja
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Selecione uma unidade para ver somente os colaboradores e férias daquela loja.
                </p>
              </div>

              <div className="w-full sm:w-[320px]">
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
                  <SelectTrigger className="h-11 border-[#D4AF37]/20 bg-black/30 text-white">
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
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-3">
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Avisos em atenção</p>
              <p className={`mt-2 text-2xl font-black ${alertas.aviso ? "text-rose-300" : "text-emerald-300"}`}>{alertas.aviso}</p>
              <p className="mt-1 text-[11px] text-gray-600">30 dias ou menos</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Pagamentos em atenção</p>
              <p className={`mt-2 text-2xl font-black ${alertas.pagamento ? "text-orange-300" : "text-emerald-300"}`}>{alertas.pagamento}</p>
              <p className="mt-1 text-[11px] text-gray-600">prazo próximo</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Retornos</p>
              <p className={`mt-2 text-2xl font-black ${alertas.retorno ? "text-sky-300" : "text-emerald-300"}`}>{alertas.retorno}</p>
              <p className="mt-1 text-[11px] text-gray-600">hoje ou amanhã</p>
            </div>
          </div>
        </Card>


        <Card className="mb-4 overflow-hidden border-rose-400/15 bg-[#0b0b0b]">
          <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b9a46a]">
                  Férias a programar
                </p>
                <h2 className="mt-1 text-xl font-black text-white">
                  Prazos calculados pela admissão
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Mostrando os períodos sem programação com limite de retorno nos próximos 12 meses.
                </p>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-black text-gray-400">
                {vencimentosFiltrados.length} colaborador{vencimentosFiltrados.length === 1 ? "" : "es"}
              </span>
            </div>
          </div>

          <CardContent className="p-3">
            {vencimentosQuery.isLoading ? (
              <p className="p-3 text-sm text-gray-500">Calculando vencimentos...</p>
            ) : vencimentosFiltrados.length === 0 ? (
              <p className="p-3 text-sm text-emerald-300">
                Nenhum período sem programação entra no limite dos próximos 12 meses.
              </p>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {vencimentosFiltrados.map((item) => {
                  const critico = item.diasAteUltimoInicio30 <= 30;
                  const atencao = item.diasAteUltimoInicio30 <= 90;

                  return (
                    <div
                      key={`${item.funcionarioId}-${item.periodoAquisitivoInicio}`}
                      className={`rounded-xl border p-3 ${
                        critico
                          ? "border-rose-400/25 bg-rose-400/[0.04]"
                          : atencao
                          ? "border-amber-400/20 bg-amber-400/[0.035]"
                          : "border-white/[0.07] bg-black/20"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {item.funcionarioNome}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.lojaNome} • admissão {formatarData(item.dataAdmissao)}
                          </p>
                          <p className="mt-2 text-xs text-gray-500">
                            Aquisitivo: {formatarData(item.periodoAquisitivoInicio)} a{" "}
                            {formatarData(item.periodoAquisitivoFim)}
                          </p>
                          <p className="mt-1 text-xs font-bold text-[#F2D675]">
                            Limite de retorno: {formatarData(item.dataLimiteRetorno)}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-600">
                            Para 30 dias, último início seguro:{" "}
                            {formatarData(item.ultimaDataSeguraInicio30)}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${
                            item.diasAteLimiteRetorno < 0
                              ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-200"
                              : item.diasAteUltimoInicio30 <= 30
                              ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"
                              : item.diasAteUltimoInicio30 <= 90
                              ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200"
                              : "border-sky-400/20 bg-sky-400/[0.05] text-sky-200"
                          }`}
                        >
                          {item.diasAteLimiteRetorno < 0
                            ? `${Math.abs(item.diasAteLimiteRetorno)} dias vencido`
                            : `${item.diasAteLimiteRetorno} dias até o limite`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4 border-[#D4AF37]/20 bg-[#0b0b0b]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b9a46a]">Mapa de férias</p>
                <h2 className="mt-1 text-2xl font-black text-white">Visão dos próximos meses</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Sobreposições dentro da mesma unidade são destacadas automaticamente.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ["ano", "Este ano"],
                  ["6m", "Próximos 6 meses"],
                  ["12m", "Próximos 12 meses"],
                ].map(([valor, texto]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setHorizonte(valor as Horizonte)}
                    className={`min-h-10 rounded-lg border px-3 text-xs font-black ${
                      horizonte === valor
                        ? "border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#F2D675]"
                        : "border-white/[0.08] bg-black/20 text-gray-500"
                    }`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {meses.length === 0 ? (
            <Card className="border-white/[0.08] bg-[#0b0b0b] xl:col-span-2">
              <CardContent className="p-8 text-center">
                <LayoutGrid className="mx-auto h-8 w-8 text-gray-700" />
                <p className="mt-3 font-bold text-gray-300">Nenhuma férias nesse período</p>
              </CardContent>
            </Card>
          ) : (
            meses.map((mes) => (
              <Card key={mes.chave} className="overflow-hidden border-white/[0.08] bg-[#0b0b0b]">
                <div className="border-b border-white/[0.06] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-white">{mes.titulo}</h3>
                    <span className="text-xs font-bold text-gray-600">{mes.itens.length} pessoa{mes.itens.length === 1 ? "" : "s"}</span>
                  </div>
                </div>

                <CardContent className="p-3">
                  <div className="space-y-2">
                    {mes.itens.map((processo) => {
                      const conflito = sobrepostos.has(processo.id);
                      return (
                        <div
                          key={processo.id}
                          className={`rounded-xl border p-3 ${
                            conflito
                              ? "border-amber-400/25 bg-amber-400/[0.04]"
                              : "border-white/[0.07] bg-black/20"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-black text-white">{processo.funcionarioNome}</p>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-gray-400">
                                  {processo.lojaNome}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                {formatarData(processo.dataInicio)} → {formatarData(processo.dataRetorno)} • {processo.quantidadeDias} dias
                              </p>
                              {processo.funcionarioFuncao && (
                                <p className="mt-1 text-[10px] text-gray-700">{processo.funcionarioFuncao}</p>
                              )}
                            </div>

                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${classeStatus(processo.status)}`}>
                              {labelStatus(processo.status)}
                            </span>
                          </div>

                          {conflito && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Sobreposição de férias nesta unidade.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
