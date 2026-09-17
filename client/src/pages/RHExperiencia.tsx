import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileUp,
  FileSpreadsheet,
  Download,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  UserRound,
  XCircle,
} from "lucide-react";
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

type RegistroExperiencia = {
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  lojaId: number;
  lojaNome: string;
  dataAdmissao: string;
  fimPrimeiroPeriodo: string;
  inicioSegundoPeriodo: string;
  fimSegundoPeriodo: string;
  primeiraDecisao?: "prorrogar" | "encerrar" | null;
  primeiraDecisaoEm?: string | null;
  primeiraDecisaoPorNome?: string | null;
  primeiraObservacao?: string | null;
  segundaDecisao?: "efetivar" | "encerrar" | null;
  segundaDecisaoEm?: string | null;
  segundaDecisaoPorNome?: string | null;
  segundaObservacao?: string | null;
};

type FiltroStatus =
  | "todos"
  | "primeiro"
  | "segundo"
  | "atencao"
  | "concluidos";

async function arquivoExperienciaParaBase64(file: File) {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("O arquivo da contabilidade deve ter no maximo 8 MB.");
  }

  const extensao = file.name.toLowerCase().split(".").pop() || "";
  if (!["pdf", "xlsx", "xls", "csv"].includes(extensao)) {
    throw new Error("Envie o arquivo em PDF, XLSX, XLS ou CSV.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const bloco = 0x8000;

  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }

  return btoa(binario);
}

function baixarArquivoBase64(
  arquivoNome: string,
  arquivoMime: string,
  arquivoBase64: string
) {
  const binario = atob(arquivoBase64);
  const bytes = new Uint8Array(binario.length);

  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: arquivoMime || "application/octet-stream",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivoNome || "arquivo-experiencia";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseDataCivil(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
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

function diasAte(valor?: string | null) {
  const alvo = parseDataCivil(valor);
  if (!alvo) return null;

  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function normalizar(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function concluido(item: RegistroExperiencia) {
  return item.primeiraDecisao === "encerrar" || Boolean(item.segundaDecisao);
}

function faseAtual(item: RegistroExperiencia) {
  if (item.primeiraDecisao === "encerrar") return "encerrado_primeiro";
  if (item.segundaDecisao === "efetivar") return "efetivado";
  if (item.segundaDecisao === "encerrar") return "encerrado_segundo";
  if (item.primeiraDecisao === "prorrogar") return "segundo";
  return "primeiro";
}

function prazoAtual(item: RegistroExperiencia) {
  return faseAtual(item) === "segundo"
    ? item.fimSegundoPeriodo
    : item.fimPrimeiroPeriodo;
}

// Regularizacao historica disponivel
function podeEfetivarHistorico(item: RegistroExperiencia) {
  if (concluido(item)) return false;
  if (item.primeiraDecisao || item.segundaDecisao) return false;

  const dias90 = diasAte(item.fimSegundoPeriodo);
  return dias90 !== null && dias90 <= 0;
}

function textoPrazo(item: RegistroExperiencia) {
  if (concluido(item)) {
    if (item.primeiraDecisao === "encerrar") return "Decisão registrada no 1º período";
    if (item.segundaDecisao === "efetivar") return "Efetivação registrada";
    return "Encerramento registrado";
  }

  if (podeEfetivarHistorico(item)) {
    return "Regularização pendente";
  }

  const dias = diasAte(prazoAtual(item));
  if (dias === null) return "Prazo indisponível";
  if (dias < 0) return `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} em atraso`;
  if (dias === 0) return "Decisão vence hoje";
  if (dias === 1) return "Decisão vence amanhã";
  return `${dias} dias para decisão`;
}

function classePrazo(item: RegistroExperiencia) {
  if (concluido(item)) {
    return "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200";
  }

  const fase = faseAtual(item);
  const dias = diasAte(prazoAtual(item));

  if (dias === null) return "border-white/10 bg-white/[0.03] text-gray-500";
  if (dias <= 2) return "border-rose-400/25 bg-rose-400/[0.07] text-rose-200";
  if ((fase === "primeiro" && dias <= 10) || (fase === "segundo" && dias <= 15)) {
    return "border-amber-400/20 bg-amber-400/[0.06] text-amber-200";
  }

  return "border-sky-400/20 bg-sky-400/[0.05] text-sky-200";
}

export default function RHExperiencia() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaUsuario > 0;
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";
  const podeGerenciar = liderRh || adminOuGestor;

  const [lojaFiltro, setLojaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const lojasQuery = trpc.lojas.list.useQuery(undefined, { retry: false });
  const listaQuery = trpc.rhExperiencia.listar.useQuery(undefined, {
    enabled: podeGerenciar,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const arquivosContabilidadeQuery =
    trpc.rhExperiencia.listarArquivosContabilidade.useQuery(undefined, {
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
        ? {
            ...loja,
            ...recebida,
            id: Number(recebida.id),
            nome: recebida.nome || loja.nome,
          }
        : { ...loja };
    });
  }, [lojasQuery.data]);

  const registros = useMemo(
    () => ((listaQuery.data || []) as RegistroExperiencia[]),
    [listaQuery.data]
  );

  const filtrados = useMemo(() => {
    const alvo = normalizar(busca);

    return registros
      .filter((item) => lojaFiltro === "todas" || item.lojaId === Number(lojaFiltro))
      .filter((item) => {
        const fase = faseAtual(item);
        const dias = diasAte(prazoAtual(item));

        if (statusFiltro === "todos") return true;
        if (statusFiltro === "concluidos") return concluido(item);
        if (statusFiltro === "primeiro") return fase === "primeiro" && !concluido(item);
        if (statusFiltro === "segundo") return fase === "segundo" && !concluido(item);
        if (statusFiltro === "atencao") {
          if (concluido(item) || dias === null) return false;
          return fase === "primeiro" ? dias <= 10 : dias <= 15;
        }
        return true;
      })
      .filter((item) => {
        if (!alvo) return true;
        return [item.funcionarioNome, item.funcionarioFuncao, item.lojaNome].some((valor) =>
          normalizar(valor).includes(alvo)
        );
      })
      .sort((a, b) => {
        if (concluido(a) !== concluido(b)) return concluido(a) ? 1 : -1;
        return prazoAtual(a).localeCompare(prazoAtual(b));
      });
  }, [registros, lojaFiltro, statusFiltro, busca]);

  const resumo = useMemo(() => {
    let primeiro = 0;
    let segundo = 0;
    let atencao = 0;
    let hoje = 0;
    let atrasados = 0;
    let concluidos = 0;

    for (const item of registros) {
      if (concluido(item)) {
        concluidos += 1;
        continue;
      }

      const fase = faseAtual(item);
      const dias = diasAte(prazoAtual(item));

      if (fase === "primeiro") primeiro += 1;
      if (fase === "segundo") segundo += 1;

      if (dias !== null) {
        if (dias < 0) atrasados += 1;
        if (dias === 0) hoje += 1;
        if (fase === "primeiro" ? dias <= 10 : dias <= 15) atencao += 1;
      }
    }

    return { primeiro, segundo, atencao, hoje, atrasados, concluidos };
  }, [registros]);

  const anexarArquivoContabilidadeMutation =
    trpc.rhExperiencia.anexarArquivoContabilidade.useMutation({
      onSuccess: async () => {
        setErro("");
        setMensagem("Arquivo de vencimentos da contabilidade arquivado com sucesso.");
        await utils.rhExperiencia.listarArquivosContabilidade.invalidate();
      },
      onError: (error) => {
        setMensagem("");
        setErro(error.message || "Nao foi possivel arquivar o arquivo da contabilidade.");
      },
    });

  const baixarArquivoContabilidadeMutation =
    trpc.rhExperiencia.baixarArquivoContabilidade.useMutation({
      onSuccess: (arquivo) => {
        setErro("");
        baixarArquivoBase64(
          arquivo.arquivoNome,
          arquivo.arquivoMime,
          arquivo.arquivoBase64
        );
      },
      onError: (error) => {
        setMensagem("");
        setErro(error.message || "Nao foi possivel baixar o arquivo da contabilidade.");
      },
    });

  async function anexarArquivoContabilidade(file: File | null) {
    if (!file) return;

    setErro("");
    setMensagem("");

    try {
      const arquivoBase64 = await arquivoExperienciaParaBase64(file);

      anexarArquivoContabilidadeMutation.mutate({
        arquivoNome: file.name,
        arquivoMime: file.type || "application/octet-stream",
        arquivoBase64,
      });
    } catch (error: any) {
      setErro(error?.message || "Nao foi possivel preparar o arquivo.");
    }
  }

  const efetivarHistoricoMutation =
    trpc.rhExperiencia.efetivarHistorico.useMutation({
      onSuccess: async (_, variables) => {
        setErro("");
        setMensagem("Funcionario antigo efetivado e regularizado no historico.");
        setObservacoes((atual) => ({
          ...atual,
          [variables.funcionarioId]: "",
        }));
        await utils.rhExperiencia.listar.invalidate();
        await listaQuery.refetch(); // REFRESH_EXPERIENCIA_HISTORICO
      await listaQuery.refetch(); // REFRESH_EXPERIENCIA_DECISAO
      },
      onError: (error) => {
        setMensagem("");
        setErro(
          error.message ||
            "Nao foi possivel efetivar este funcionario antigo."
        );
      },
    });

  const decisaoMutation = trpc.rhExperiencia.registrarDecisao.useMutation({
    onSuccess: async (_, variables) => {
      setErro("");
      setMensagem(
        variables.etapa === 1
          ? variables.decisao === "prorrogar"
            ? "Prorrogação para o 2º período registrada."
            : "Decisão de encerrar no fim do 1º período registrada."
          : variables.decisao === "efetivar"
          ? "Efetivação registrada."
          : "Decisão de encerrar no fim da experiência registrada."
      );
      setObservacoes((atual) => ({ ...atual, [variables.funcionarioId]: "" }));
      await utils.rhExperiencia.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível registrar a decisão.");
    },
  });

  function efetivarFuncionarioHistorico(item: RegistroExperiencia) {
    setErro("");
    setMensagem("");

    if (
      !window.confirm(
        `Confirma a efetivacao de ${item.funcionarioNome}?\n\nEste registro sera tratado como regularizacao historica, pois o 90o dia ja passou e nao havia decisao cadastrada no sistema.`
      )
    ) {
      return;
    }

    efetivarHistoricoMutation.mutate({
      funcionarioId: item.funcionarioId,
      observacao: observacoes[item.funcionarioId]?.trim() || null,
    });
  }

  function registrar(
    item: RegistroExperiencia,
    etapa: 1 | 2,
    decisao: "prorrogar" | "efetivar" | "encerrar"
  ) {
    setErro("");
    setMensagem("");

    const descricao =
      decisao === "prorrogar"
        ? `prorrogar a experiência de ${item.funcionarioNome} por mais 45 dias`
        : decisao === "efetivar"
        ? `efetivar ${item.funcionarioNome}`
        : `registrar a decisão de encerrar o contrato de experiência de ${item.funcionarioNome}`;

    if (!window.confirm(`Confirma a decisão de ${descricao}?`)) return;

    decisaoMutation.mutate({
      funcionarioId: item.funcionarioId,
      etapa,
      decisao,
      observacao: observacoes[item.funcionarioId]?.trim() || null,
    });
  }

  if (caixaLider || !podeGerenciar) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <Card className="w-full max-w-lg border-rose-400/20 bg-[#0b0b0b]">
          <CardContent className="p-7 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-300" />
            <h1 className="mt-4 text-xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              O acompanhamento de experiência é exclusivo da Líder de RH.
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

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                Gestão de pessoas
              </p>
              <h1 className="text-2xl font-black text-[#F2D675]">Experiência</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#b9a46a] sm:flex">
            <ShieldCheck className="h-4 w-4 text-[#F2D675]" />
            45 dias + 45 dias
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <Card className="mb-4 overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-6">
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">1º período</p>
              <p className="mt-2 text-2xl font-black text-white">{resumo.primeiro}</p>
              <p className="mt-1 text-[11px] text-gray-600">até 45 dias</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">2º período</p>
              <p className="mt-2 text-2xl font-black text-[#F2D675]">{resumo.segundo}</p>
              <p className="mt-1 text-[11px] text-gray-600">até 90 dias</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Em atenção</p>
              <p className={`mt-2 text-2xl font-black ${resumo.atencao ? "text-amber-300" : "text-emerald-300"}`}>{resumo.atencao}</p>
              <p className="mt-1 text-[11px] text-gray-600">decisão próxima</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Decisão hoje</p>
              <p className={`mt-2 text-2xl font-black ${resumo.hoje ? "text-rose-300" : "text-emerald-300"}`}>{resumo.hoje}</p>
              <p className="mt-1 text-[11px] text-gray-600">vence hoje</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Atrasados</p>
              <p className={`mt-2 text-2xl font-black ${resumo.atrasados ? "text-rose-300" : "text-emerald-300"}`}>{resumo.atrasados}</p>
              <p className="mt-1 text-[11px] text-gray-600">validar imediatamente</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Concluídos</p>
              <p className="mt-2 text-2xl font-black text-emerald-300">{resumo.concluidos}</p>
              <p className="mt-1 text-[11px] text-gray-600">decisão registrada</p>
            </div>
          </div>
        </Card>

        <Card className="mb-4 border-white/[0.08] bg-[#0b0b0b]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[190px] flex-1">
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

              <div className="min-w-[210px] flex-1">
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Situação</label>
                <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as FiltroStatus)}>
                  <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#111111] text-white">
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="primeiro">1º período</SelectItem>
                    <SelectItem value="segundo">2º período</SelectItem>
                    <SelectItem value="atencao">Precisam de atenção</SelectItem>
                    <SelectItem value="concluidos">Decisão concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative min-w-[250px] flex-[1.4]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar funcionário, função ou loja"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {mensagem && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Contratos de experiência</h2>
            <p className="mt-1 text-sm text-gray-500">
              {filtrados.length} colaborador{filtrados.length === 1 ? "" : "es"} no filtro atual.
            </p>
          </div>
          <Clock3 className="h-5 w-5 text-[#F2D675]" />
        </div>

        {listaQuery.isLoading ? (
          <Card className="border-white/[0.08] bg-[#0b0b0b]">
            <CardContent className="p-6 text-sm text-gray-500">Calculando experiências...</CardContent>
          </Card>
        ) : listaQuery.error ? (
          <Card className="border-rose-400/20 bg-rose-400/[0.04]">
            <CardContent className="p-6 text-sm text-rose-200">
              Não foi possível carregar as experiências. {listaQuery.error.message}
            </CardContent>
          </Card>
        ) : filtrados.length === 0 ? (
          <Card className="border-white/[0.08] bg-[#0b0b0b]">
            <CardContent className="p-8 text-center">
              <UserCheck className="mx-auto h-8 w-8 text-gray-700" />
              <p className="mt-3 font-bold text-gray-300">Nenhum contrato de experiência encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filtrados.map((item) => {
              const fase = faseAtual(item);
              const dias = diasAte(prazoAtual(item));
              const emAtraso = !concluido(item) && dias !== null && dias < 0;

              return (
                <Card
                  key={`${item.funcionarioId}-${item.dataAdmissao}`}
                  className={`border bg-[#0b0b0b] ${
                    emAtraso ? "border-rose-400/25" : "border-white/[0.08]"
                  }`}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserRound className="h-4 w-4 text-[#F2D675]" />
                            <p className="font-black text-white">{item.funcionarioNome}</p>
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-gray-400">
                              {item.lojaNome}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-600">
                            {item.funcionarioFuncao || "Função não informada"}
                          </p>
                        </div>

                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${classePrazo(item)}`}>
                          {textoPrazo(item)}
                        </span>
                      </div>

                      <div className="grid gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-700">Admissão</p>
                          <p className="mt-1 text-xs font-bold text-gray-300">{formatarData(item.dataAdmissao)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-700">45º dia</p>
                          <p className="mt-1 text-xs font-bold text-[#F2D675]">{formatarData(item.fimPrimeiroPeriodo)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-700">90º dia</p>
                          <p className="mt-1 text-xs font-bold text-[#F2D675]">{formatarData(item.fimSegundoPeriodo)}</p>
                        </div>
                      </div>

                      {concluido(item) ? (
                        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-3">
                          <p className="text-xs font-black text-emerald-200">
                            {item.primeiraDecisao === "encerrar"
                              ? "Encerramento ao fim do 1º período"
                              : item.segundaDecisao === "efetivar"
                              ? "Funcionário efetivado"
                              : "Encerramento ao fim do contrato de experiência"}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {item.primeiraDecisao === "encerrar"
                              ? `${item.primeiraDecisaoPorNome || "RH"} • ${formatarDataHora(item.primeiraDecisaoEm)}`
                              : `${item.segundaDecisaoPorNome || "RH"} • ${formatarDataHora(item.segundaDecisaoEm)}`}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className={`rounded-xl border p-3 ${
                            fase === "primeiro"
                              ? "border-sky-400/15 bg-sky-400/[0.025]"
                              : "border-[#D4AF37]/15 bg-[#D4AF37]/[0.025]"
                          }`}>
                            <p className="text-xs font-black text-white">
                              {fase === "primeiro"
                                ? "Decisão do 1º período"
                                : "Decisão final da experiência"}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-gray-500">
                              {fase === "primeiro"
                                ? podeEfetivarHistorico(item)
                                  ? `O 90º dia foi em ${formatarData(item.fimSegundoPeriodo)}. Regularização histórica disponível: você pode efetivar diretamente sem inventar uma decisão do 45º dia.`
                                  : `Até ${formatarData(item.fimPrimeiroPeriodo)}: prorrogar por mais 45 dias ou encerrar ao término do primeiro período.`
                                : `Até ${formatarData(item.fimSegundoPeriodo)}: efetivar ou encerrar ao término da experiência.`}
                            </p>
                          </div>

                          <textarea
                            value={observacoes[item.funcionarioId] || ""}
                            onChange={(event) =>
                              setObservacoes((atual) => ({
                                ...atual,
                                [item.funcionarioId]: event.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Observação da decisão (opcional)"
                            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                          />

                          {fase === "primeiro" ? (
                            <div className="space-y-2">
                              {podeEfetivarHistorico(item) && (
                                <Button
                                  type="button"
                                  onClick={() => efetivarFuncionarioHistorico(item)}
                                  disabled={
                                    decisaoMutation.isPending ||
                                    efetivarHistoricoMutation.isPending
                                  }
                                  className="h-12 w-full bg-emerald-300 font-black text-black hover:bg-emerald-200"
                                >
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Efetivar funcionário
                                </Button>
                              )}

                              {podeEfetivarHistorico(item) && (
                                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2.5 text-[11px] leading-5 text-emerald-200/80">
                                  Regularizar como efetivado encerra esta pendência sem registrar uma prorrogação fictícia no 45º dia.
                                </div>
                              )}

                              <div className="grid gap-2 sm:grid-cols-2">
                                <Button
                                  type="button"
                                  onClick={() => registrar(item, 1, "prorrogar")}
                                  disabled={
                                    decisaoMutation.isPending ||
                                    efetivarHistoricoMutation.isPending
                                  }
                                  className="h-12 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                                >
                                  <Clock3 className="mr-2 h-4 w-4" />
                                  Prorrogar +45 dias
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => registrar(item, 1, "encerrar")}
                                  disabled={
                                    decisaoMutation.isPending ||
                                    efetivarHistoricoMutation.isPending
                                  }
                                  className="h-12 border-rose-300/20 bg-transparent font-black text-rose-200 hover:bg-rose-300/[0.06]"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Encerrar no 45º dia
                                </Button>
                              </div>
                            </div>
                          ) : fase === "segundo" ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-black text-emerald-200">
                                      1º período prorrogado por +45 dias
                                    </p>
                                    <p className="mt-1 text-[11px] leading-5 text-gray-500">
                                      Agora a decisão final deve ser registrada até {formatarData(item.fimSegundoPeriodo)}.
                                    </p>
                                  </div>

                                  <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-1 text-[10px] font-black text-emerald-200">
                                    90º dia
                                  </span>
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <Button
                                  type="button"
                                  onClick={() => registrar(item, 2, "efetivar")}
                                  disabled={decisaoMutation.isPending}
                                  className="h-12 bg-emerald-300 font-black text-black hover:bg-emerald-200"
                                >
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Efetivar funcionário
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => registrar(item, 2, "encerrar")}
                                  disabled={decisaoMutation.isPending}
                                  className="h-12 border-rose-300/20 bg-transparent font-black text-rose-200 hover:bg-rose-300/[0.06]"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Encerrar no 90º dia
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {emAtraso && (
                            <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              O prazo calculado já passou sem decisão registrada. Valide a situação com o DP antes de executar qualquer desligamento.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-gray-600">
          <Store className="mr-2 inline h-3.5 w-3.5" />
          Esta tela registra a decisão gerencial. Ela não executa rescisão nem calcula verbas trabalhistas.
        </div>
      </main>
    </div>
  );
}
