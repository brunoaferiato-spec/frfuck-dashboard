import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  History,
  LogOut,
  MapPin,
  RefreshCw,
  Scale,
  ShieldCheck,
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

type ChaveContagem =
  | "cedula200"
  | "cedula100"
  | "cedula50"
  | "cedula20"
  | "cedula10"
  | "cedula5"
  | "cedula2"
  | "moeda1"
  | "moeda050"
  | "moeda025"
  | "moeda010"
  | "moeda005"
  | "moeda001";

type ContagemCaixa = Record<ChaveContagem, number>;

type AnaliseRelatorio = {
  conta: string;
  dataReferencia: string;
  saldoInicial: number;
  totalCreditos: number;
  totalDebitos: number;
  saldoFinal: number;
  totalMovimentos: number;
  arquivoHash: string;
};

const DENOMINACOES: Array<{
  key: ChaveContagem;
  label: string;
  centavos: number;
  grupo: "Cédulas" | "Moedas";
}> = [
  { key: "cedula200", label: "R$ 200,00", centavos: 20000, grupo: "Cédulas" },
  { key: "cedula100", label: "R$ 100,00", centavos: 10000, grupo: "Cédulas" },
  { key: "cedula50", label: "R$ 50,00", centavos: 5000, grupo: "Cédulas" },
  { key: "cedula20", label: "R$ 20,00", centavos: 2000, grupo: "Cédulas" },
  { key: "cedula10", label: "R$ 10,00", centavos: 1000, grupo: "Cédulas" },
  { key: "cedula5", label: "R$ 5,00", centavos: 500, grupo: "Cédulas" },
  { key: "cedula2", label: "R$ 2,00", centavos: 200, grupo: "Cédulas" },
  { key: "moeda1", label: "R$ 1,00", centavos: 100, grupo: "Moedas" },
  { key: "moeda050", label: "R$ 0,50", centavos: 50, grupo: "Moedas" },
  { key: "moeda025", label: "R$ 0,25", centavos: 25, grupo: "Moedas" },
  { key: "moeda010", label: "R$ 0,10", centavos: 10, grupo: "Moedas" },
  { key: "moeda005", label: "R$ 0,05", centavos: 5, grupo: "Moedas" },
  { key: "moeda001", label: "R$ 0,01", centavos: 1, grupo: "Moedas" },
];

const JUSTIFICATIVAS = [
  { value: "diferenca_caixa", label: "Diferença de caixa" },
  { value: "uber_aberto", label: "Uber em aberto" },
  { value: "pagamento_dinheiro_pix_aberto", label: "Pagamento em dinheiro ou PIX em aberto" },
  { value: "outro", label: "Outros" },
];

const JUSTIFICATIVAS_FORA_MARGEM = JUSTIFICATIVAS.filter(
  (item) => item.value !== "diferenca_caixa"
);

function contagemZerada(): ContagemCaixa {
  return {
    cedula200: 0,
    cedula100: 0,
    cedula50: 0,
    cedula20: 0,
    cedula10: 0,
    cedula5: 0,
    cedula2: 0,
    moeda1: 0,
    moeda050: 0,
    moeda025: 0,
    moeda010: 0,
    moeda005: 0,
    moeda001: 0,
  };
}

function hojeCivil() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasAtras(dataCivil: string, dias: number) {
  const [ano, mes, dia] = dataCivil.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia, 12, 0, 0);
  data.setDate(data.getDate() - dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate()
  ).padStart(2, "0")}`;
}

function formatarData(dataCivil: string) {
  const match = String(dataCivil || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dataCivil;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatarMoeda(valor: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function nomeJustificativa(valor?: string | null) {
  return JUSTIFICATIVAS.find((item) => item.value === valor)?.label || "Outro motivo";
}

function arquivoParaBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = String(reader.result || "");
      resolve(resultado.includes(",") ? resultado.split(",")[1] : resultado);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function statusFechamento(fechamento: any) {
  if (String(fechamento?.status || "") === "correto") return "Caixa correto";
  const diferencaCentavos = Math.round(Math.abs(Number(fechamento?.diferenca || 0)) * 100);
  return diferencaCentavos <= 500
    ? "Diferença de caixa • dentro da margem"
    : "Diferença fora da margem • justificada";
}

export default function RHCaixa() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const usuarioLojaId = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && usuarioLojaId > 0;
  const liderRh = role === "rh" && usuarioLojaId <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";
  const modoOperacional = caixaLider || adminOuGestor;
  const podeVerHistorico = liderRh || adminOuGestor;

  const hoje = hojeCivil();
  const [lojaTeste, setLojaTeste] = useState("");
  const [dataTeste, setDataTeste] = useState(hoje);
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoMime, setArquivoMime] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [analise, setAnalise] = useState<AnaliseRelatorio | null>(null);
  const [contagem, setContagem] = useState<ContagemCaixa>(contagemZerada());
  const [justificativaTipo, setJustificativaTipo] = useState("");
  const [justificativaObservacao, setJustificativaObservacao] = useState("");
  const [motivoNaoDeposito, setMotivoNaoDeposito] = useState("");

  const totalFisicoParaLimite = useMemo(
    () =>
      Number(contagem.cedula200 || 0) * 200 +
      Number(contagem.cedula100 || 0) * 100 +
      Number(contagem.cedula50 || 0) * 50 +
      Number(contagem.cedula20 || 0) * 20 +
      Number(contagem.cedula10 || 0) * 10 +
      Number(contagem.cedula5 || 0) * 5 +
      Number(contagem.cedula2 || 0) * 2 +
      Number(contagem.moeda1 || 0) * 1 +
      Number(contagem.moeda050 || 0) * 0.5 +
      Number(contagem.moeda025 || 0) * 0.25 +
      Number(contagem.moeda010 || 0) * 0.1 +
      Number(contagem.moeda005 || 0) * 0.05 +
      Number(contagem.moeda001 || 0) * 0.01,
    [contagem]
  );

  const exigeMotivoNaoDeposito = totalFisicoParaLimite > 2000;

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [processandoArquivo, setProcessandoArquivo] = useState(false);

  const [dataInicioHistorico, setDataInicioHistorico] = useState(diasAtras(hoje, 7));
  const [dataFimHistorico, setDataFimHistorico] = useState(hoje);
  const [lojaHistorico, setLojaHistorico] = useState("todas");

  // As seis lojas operacionais deste modulo sao fixas.
  // ACI Promocoes (ID 5) nao participa do fechamento de caixa do RH.
  const lojas = [
    { id: 1, nome: "Joinville" },
    { id: 2, nome: "Blumenau" },
    { id: 3, nome: "São José" },
    { id: 4, nome: "Florianópolis" },
    { id: 6, nome: "São Leopoldo" },
    { id: 7, nome: "Gravataí" },
  ] as const;

  // Mantem compatibilidade com o painel gerencial criado anteriormente.
  const lojasOperacionais = lojas;

  const lojaIdOperacional = caixaLider
    ? usuarioLojaId
    : lojaTeste
    ? Number(lojaTeste)
    : 0;
  const dataOperacional = caixaLider ? hoje : dataTeste;
  const lojaAtual = lojas.find((loja) => Number(loja.id) === Number(lojaIdOperacional));

  const fechamentoDiaQuery = trpc.rhCaixa.dia.useQuery(
    { lojaId: lojaIdOperacional, dataReferencia: dataOperacional },
    {
      enabled: modoOperacional && lojaIdOperacional > 0,
      retry: false,
    }
  );

  const historicoQuery = trpc.rhCaixa.historico.useQuery(
    {
      dataInicio: dataInicioHistorico,
      dataFim: dataFimHistorico,
      lojaId: lojaHistorico === "todas" ? null : Number(lojaHistorico),
    },
    {
      enabled: podeVerHistorico && dataInicioHistorico <= dataFimHistorico,
      retry: false,
    }
  );

  const analisarMutation = trpc.rhCaixa.analisarRelatorio.useMutation();
  const salvarMutation = trpc.rhCaixa.salvarFechamento.useMutation({
    onSuccess: async () => {
      setMensagem("Fechamento salvo com sucesso.");
      setErro("");
      await fechamentoDiaQuery.refetch();
      if (podeVerHistorico) await historicoQuery.refetch();
    },
    onError: (error) => {
      setErro(error.message || "Não foi possível salvar o fechamento.");
      setMensagem("");
    },
  });

  const totalFisicoCentavos = useMemo(() => {
    return DENOMINACOES.reduce((total, item) => {
      const quantidade = Math.max(0, Math.trunc(Number(contagem[item.key] || 0)));
      return total + quantidade * item.centavos;
    }, 0);
  }, [contagem]);

  const saldoFinalCentavos = Math.round(Number(analise?.saldoFinal || 0) * 100);
  const diferencaCentavos = analise ? totalFisicoCentavos - saldoFinalCentavos : 0;
  const totalFisico = totalFisicoCentavos / 100;
  const diferenca = diferencaCentavos / 100;
  const diferencaAbsolutaCentavos = Math.abs(diferencaCentavos);
  const diferencaDentroMargem =
    diferencaCentavos !== 0 && diferencaAbsolutaCentavos <= 500;
  const diferencaForaMargem = diferencaAbsolutaCentavos > 500;

  const historico = useMemo(
    () => ((historicoQuery.data || []) as any[]),
    [historicoQuery.data]
  );

  const resumoHistorico = useMemo(() => {
    const corretos = historico.filter((item) => item.status === "correto").length;
    const divergentes = historico.filter((item) => item.status !== "correto").length;
    const diferencaLiquida = historico.reduce(
      (total, item) => total + Number(item.diferenca || 0),
      0
    );
    return { corretos, divergentes, diferencaLiquida };
  }, [historico]);

  function limparImportacao() {
    setArquivoNome("");
    setArquivoMime("");
    setArquivoBase64("");
    setAnalise(null);
    setContagem(contagemZerada());
    setJustificativaTipo("");
    setJustificativaObservacao("");
    setMotivoNaoDeposito(""); // LIMITE_CAIXA_2000_RESET
    setMensagem("");
    setErro("");
  }

  async function importarRelatorio(file?: File | null) {
    if (!file) return;

    setMensagem("");
    setErro("");

    if (!lojaIdOperacional) {
      setErro("Selecione a loja antes de importar o relatório.");
      return;
    }

    const extensaoValida = /\.xlsx$/i.test(file.name);
    if (!extensaoValida) {
      setErro("Envie o relatório em formato .xlsx.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErro("O relatório deve ter no máximo 5 MB.");
      return;
    }

    setProcessandoArquivo(true);
    try {
      const base64 = await arquivoParaBase64(file);
      const resposta = (await analisarMutation.mutateAsync({
        lojaId: lojaIdOperacional,
        arquivoNome: file.name,
        arquivoMime:
          file.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        arquivoBase64: base64,
      })) as AnaliseRelatorio;

      if (resposta.dataReferencia !== dataOperacional) {
        throw new Error(
          `O relatório é de ${formatarData(resposta.dataReferencia)}, mas o fechamento selecionado é ${formatarData(
            dataOperacional
          )}.`
        );
      }

      setArquivoNome(file.name);
      setArquivoMime(
        file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      setArquivoBase64(base64);
      setAnalise(resposta);
      setContagem(contagemZerada());
      setJustificativaTipo("");
      setJustificativaObservacao("");
    setMotivoNaoDeposito(""); // LIMITE_CAIXA_2000_RESET
    } catch (error: any) {
      setErro(error?.message || "Não foi possível interpretar o relatório.");
      setArquivoNome("");
      setArquivoMime("");
      setArquivoBase64("");
      setAnalise(null);
    } finally {
      setProcessandoArquivo(false);
    }
  }

  async function salvarFechamento() {
    setMensagem("");
    setErro("");

    if (!lojaIdOperacional || !analise || !arquivoBase64) {
      setErro("Importe o relatório do caixa antes de salvar.");
      return;
    }

    if (diferencaCentavos !== 0) {
      if (diferencaForaMargem && !justificativaTipo) {
        setErro("Selecione o motivo da diferença.");
        return;
      }
      if (diferencaForaMargem && justificativaTipo === "diferenca_caixa") {
        setErro("Diferença de caixa é usada somente para valores de até R$ 5,00.");
        return;
      }
      if (justificativaObservacao.trim().length < 3) {
        setErro("A observação é obrigatória. Descreva o motivo da diferença.");
        return;
      }
    }

    const motivoFinal =
      diferencaCentavos === 0
        ? null
        : diferencaDentroMargem
        ? "diferenca_caixa"
        : justificativaTipo;

        if (
      exigeMotivoNaoDeposito &&
      motivoNaoDeposito.trim().length < 5
    ) {
      setErro(
        "O caixa esta acima de R$ 2.000,00. Informe por que o deposito nao foi realizado."
      );
      return;
    }

await salvarMutation.mutateAsync({
      lojaId: lojaIdOperacional,
      dataReferencia: dataOperacional,
      arquivoNome,
      arquivoMime,
      arquivoBase64,
      contagem,
      justificativaTipo: motivoFinal,
      justificativaObservacao:
        diferencaCentavos === 0 ? null : justificativaObservacao.trim(),
            motivoNaoDeposito: exigeMotivoNaoDeposito
          ? motivoNaoDeposito.trim()
          : null,
});
  }

  async function abrirRelatorio(fechamento: any) {
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
      setErro(error?.message || "Não foi possível abrir o relatório.");
    }
  }

  async function sair() {
    await logout();
    navigate("/");
  }

  const fechamentoSalvo = fechamentoDiaQuery.data as any;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(liderRh ? "/rh/gestao" : "/rh/meu-dia")}
              className="h-10 w-10 shrink-0 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8f8a80] sm:text-xs">
                RH • Controle diário
              </p>
              <h1 className="truncate text-xl font-black text-[#F2D675] sm:text-2xl">
                Fechamento de Caixa
              </h1>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={sair}
            className="h-10 shrink-0 px-3 text-gray-400 hover:bg-red-500/10 hover:text-rose-300"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span className="hidden text-sm sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        {modoOperacional && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#080808]">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8f8a80]">
                        Fechamento físico
                      </p>
                      <h2 className="mt-2 text-2xl font-black text-white">
                        {lojaAtual?.nome || (adminOuGestor ? "Selecione uma loja" : "Sua loja")}
                      </h2>
                      <p className="mt-2 text-sm text-gray-400">
                        O Saldo Final do relatório é o valor que precisa existir em dinheiro físico.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-3">
                      <Banknote className="h-6 w-6 text-[#F2D675]" />
                    </div>
                  </div>

                  {adminOuGestor ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                          Loja para teste
                        </label>
                        <Select
                          value={lojaTeste}
                          onValueChange={(value) => {
                            setLojaTeste(value);
                            limparImportacao();
                          }}
                        >
                          <SelectTrigger className="h-11 border-[#D4AF37]/25 bg-[#111111] text-white">
                            <SelectValue placeholder="Selecione a loja" />
                          </SelectTrigger>
                          <SelectContent className="border-[#D4AF37]/20 bg-[#111111] text-white">
                            {lojas.map((loja) => (
                              <SelectItem key={loja.id} value={String(loja.id)}>
                                {loja.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                          Data para teste
                        </label>
                        <input
                          type="date"
                          value={dataTeste}
                          onChange={(event) => {
                            setDataTeste(event.target.value || hoje);
                            limparImportacao();
                          }}
                          className="h-11 w-full rounded-xl border border-[#D4AF37]/25 bg-[#111111] px-3 text-sm text-white outline-none focus:border-[#D4AF37]/55"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] px-4 py-3 text-sm">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-[#F2D675]" />
                        {lojaAtual?.nome || "Loja vinculada"}
                      </span>
                      <strong className="text-[#F2D675]">{formatarData(hoje)}</strong>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[#D4AF37]/20 bg-[#0b0b0b]">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
                      {fechamentoSalvo ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                      ) : (
                        <Scale className="h-5 w-5 text-[#F2D675]" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-white">Status do dia</p>
                      <p className="text-xs text-gray-500">{formatarData(dataOperacional)}</p>
                    </div>
                  </div>

                  {fechamentoSalvo ? (
                    <div className="mt-4 space-y-3">
                      <div
                        className={`rounded-xl border p-3.5 ${
                          fechamentoSalvo.status === "correto"
                            ? "border-emerald-400/20 bg-emerald-400/[0.05]"
                            : "border-amber-400/20 bg-amber-400/[0.05]"
                        }`}
                      >
                        <p className="text-sm font-black text-white">
                          {statusFechamento(fechamentoSalvo)}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                          <span>Saldo final</span>
                          <strong className="text-right text-white">
                            {formatarMoeda(fechamentoSalvo.saldoFinal)}
                          </strong>
                          <span>Dinheiro contado</span>
                          <strong className="text-right text-white">
                            {formatarMoeda(fechamentoSalvo.totalFisico)}
                          </strong>
                          <span>Diferença</span>
                          <strong
                            className={`text-right ${
                              Number(fechamentoSalvo.diferenca || 0) === 0
                                ? "text-emerald-300"
                                : "text-amber-300"
                            }`}
                          >
                            {formatarMoeda(fechamentoSalvo.diferenca)}
                          </strong>
                        </div>
                      </div>

                      <p className="text-xs leading-5 text-gray-500">
                        Se precisar corrigir o fechamento, importe novamente o relatório e refaça a contagem.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-gray-400">
                      Ainda não existe fechamento salvo para esta loja e data.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
              <Card className="border-[#D4AF37]/20 bg-[#0b0b0b]">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                        Passo 1
                      </p>
                      <p className="mt-1 text-lg font-black text-white">Importar relatório</p>
                    </div>
                    <FileSpreadsheet className="h-6 w-6 text-[#F2D675]" />
                  </div>

                  <label
                    className={`mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition ${
                      lojaIdOperacional
                        ? "border-[#D4AF37]/30 bg-[#D4AF37]/[0.035] hover:bg-[#D4AF37]/[0.06]"
                        : "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50"
                    }`}
                  >
                    {processandoArquivo || analisarMutation.isPending ? (
                      <RefreshCw className="h-7 w-7 animate-spin text-[#F2D675]" />
                    ) : (
                      <FileUp className="h-7 w-7 text-[#F2D675]" />
                    )}
                    <p className="mt-3 text-sm font-black text-white">
                      {processandoArquivo || analisarMutation.isPending
                        ? "Lendo o relatório..."
                        : "Selecionar relatório .xlsx"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      O sistema localizará automaticamente Saldo Inicial, Créditos, Débitos e Saldo Final.
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      disabled={!lojaIdOperacional || processandoArquivo || analisarMutation.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        void importarRelatorio(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {erro && !analise && (
                    <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-sm text-rose-200">
                      {erro}
                    </div>
                  )}

                  {analise && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3.5">
                        <div className="flex items-center gap-2 text-sm font-black text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Relatório reconhecido
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-400">{arquivoNome}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <p className="text-gray-500">Saldo inicial</p>
                          <p className="mt-1 font-black text-white">{formatarMoeda(analise.saldoInicial)}</p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <p className="text-gray-500">Créditos</p>
                          <p className="mt-1 font-black text-emerald-300">{formatarMoeda(analise.totalCreditos)}</p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <p className="text-gray-500">Débitos</p>
                          <p className="mt-1 font-black text-rose-300">{formatarMoeda(analise.totalDebitos)}</p>
                        </div>
                        <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] p-3">
                          <p className="text-[#b9a46a]">Saldo final</p>
                          <p className="mt-1 text-lg font-black text-[#F2D675]">{formatarMoeda(analise.saldoFinal)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[#D4AF37]/20 bg-[#0b0b0b]">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                        Passo 2
                      </p>
                      <p className="mt-1 text-lg font-black text-white">Contagem física</p>
                    </div>
                    <Calculator className="h-6 w-6 text-[#F2D675]" />
                  </div>

                  {!analise ? (
                    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm leading-6 text-gray-500">
                      Importe primeiro o relatório para liberar a contagem do dinheiro.
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {DENOMINACOES.map((item) => {
                          const quantidade = Number(contagem[item.key] || 0);
                          const subtotal = (quantidade * item.centavos) / 100;
                          return (
                            <div
                              key={item.key}
                              className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-black text-white">{item.label}</p>
                                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-600">
                                    {item.grupo}
                                  </p>
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  value={quantidade || ""}
                                  placeholder="0"
                                  onChange={(event) => {
                                    const valor = Math.max(
                                      0,
                                      Math.trunc(Number(event.target.value || 0))
                                    );
                                    setContagem((atual) => ({
                                      ...atual,
                                      [item.key]: valor,
                                    }));
                                  }}
                                  className="h-10 w-20 rounded-lg border border-[#D4AF37]/20 bg-black/40 px-2 text-right text-sm font-bold text-white outline-none focus:border-[#D4AF37]/50"
                                />
                              </div>
                              <p className="mt-2 text-right text-xs font-bold text-[#F2D675]">
                                {formatarMoeda(subtotal)}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                          <p className="text-xs text-gray-500">Saldo esperado</p>
                          <p className="mt-1 text-lg font-black text-white">
                            {formatarMoeda(analise.saldoFinal)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                          <p className="text-xs text-gray-500">Dinheiro contado</p>
                          <p className="mt-1 text-lg font-black text-white">
                            {formatarMoeda(totalFisico)}
                          </p>
                        </div>
                        <div
                          className={`rounded-xl border p-4 ${
                            diferencaCentavos === 0
                              ? "border-emerald-400/20 bg-emerald-400/[0.05]"
                              : diferencaDentroMargem
                              ? "border-amber-400/20 bg-amber-400/[0.05]"
                              : "border-rose-400/20 bg-rose-400/[0.05]"
                          }`}
                        >
                          <p className="text-xs text-gray-400">Diferença</p>
                          <p
                            className={`mt-1 text-lg font-black ${
                              diferencaCentavos === 0
                                ? "text-emerald-300"
                                : diferencaDentroMargem
                                ? "text-amber-300"
                                : "text-rose-300"
                            }`}
                          >
                            {formatarMoeda(diferenca)}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {diferencaCentavos === 0
                              ? "Caixa confere."
                              : diferencaDentroMargem
                              ? `Diferença de caixa dentro da margem de R$ 5,00 • ${
                                  diferencaCentavos > 0 ? "sobra" : "falta"
                                }`
                              : diferencaCentavos > 0
                              ? "Sobra acima da margem de R$ 5,00."
                              : "Falta acima da margem de R$ 5,00."}
                          </p>
                        </div>
                      </div>

                      {diferencaCentavos !== 0 && (
                        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                            <div>
                              <p className="font-black text-white">
                                {diferencaDentroMargem
                                  ? "Diferença de caixa • observação obrigatória"
                                  : "Diferença fora da margem • motivo e observação obrigatórios"}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-gray-400">
                                A justificativa não altera o Saldo Final. Ela registra o motivo da diferença entre o relatório e o dinheiro físico.
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3">
                            {diferencaDentroMargem ? (
                              <div className="rounded-xl border border-amber-400/20 bg-black/30 px-3 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Motivo</p>
                                <p className="mt-1 text-sm font-black text-amber-200">Diferença de caixa</p>
                                <p className="mt-1 text-xs text-gray-500">Margem permitida: até R$ 5,00 para sobra ou falta.</p>
                              </div>
                            ) : (
                              <Select value={justificativaTipo} onValueChange={setJustificativaTipo}>
                                <SelectTrigger className="h-11 border-rose-400/20 bg-black/30 text-white">
                                  <SelectValue placeholder="Selecione o motivo" />
                                </SelectTrigger>
                                <SelectContent className="border-[#D4AF37]/20 bg-[#111111] text-white">
                                  {JUSTIFICATIVAS_FORA_MARGEM.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            <textarea
                              value={justificativaObservacao}
                              onChange={(event) => setJustificativaObservacao(event.target.value)}
                              placeholder="Observação obrigatória: descreva o que aconteceu e o motivo desta diferença..."
                              rows={4}
                              className="w-full resize-none rounded-xl border border-amber-400/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-400/45"
                            />
                          </div>
                        </div>
                      )}

                      {(erro || mensagem) && (
                        <div
                          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                            erro
                              ? "border-rose-400/20 bg-rose-400/[0.05] text-rose-200"
                              : "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200"
                          }`}
                        >
                          {erro || mensagem}
                        </div>
                      )}


              {exigeMotivoNaoDeposito && (
                <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] p-2 text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-black text-amber-200">
                        Caixa acima do limite de R$ 2.000,00
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-100/70">
                        Dinheiro físico contado: {formatarMoeda(totalFisicoParaLimite)}.
                        Informe por que o depósito não foi realizado.
                      </p>

                      <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.14em] text-amber-200/80">
                        Motivo do depósito não realizado
                      </label>
                      <textarea
                        value={motivoNaoDeposito}
                        onChange={(event) =>
                          setMotivoNaoDeposito(event.target.value)
                        }
                        maxLength={2000}
                        rows={3}
                        placeholder="Ex.: depósito não realizado porque..."
                        className="mt-1.5 w-full resize-y rounded-xl border border-amber-400/25 bg-[#111111] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400/60"
                      />
                    </div>
                  </div>
                </div>
              )}

<Button
                        type="button"
                        onClick={salvarFechamento}
                        disabled={salvarMutation.isPending}
                        className="mt-5 h-12 w-full bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                      >
                        {salvarMutation.isPending
                          ? "Salvando fechamento..."
                          : fechamentoSalvo
                          ? "Atualizar fechamento"
                          : "Concluir fechamento"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {podeVerHistorico && (
          <section className={`${modoOperacional ? "mt-8" : ""}`}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8f8a80]">
                  Gestão RH
                </p>
                <h2 className="mt-1 text-xl font-black text-white">Histórico de fechamentos</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Todas as lojas, diferenças justificadas e relatório original.
                </p>
              </div>
              <History className="h-6 w-6 text-[#F2D675]" />
            </div>

            <Card className="border-[#D4AF37]/20 bg-[#0b0b0b]">
              <CardContent className="p-4 sm:p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                      Data inicial
                    </label>
                    <input
                      type="date"
                      value={dataInicioHistorico}
                      onChange={(event) => setDataInicioHistorico(event.target.value || hoje)}
                      className="h-11 w-full rounded-xl border border-[#D4AF37]/20 bg-[#111111] px-3 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                      Data final
                    </label>
                    <input
                      type="date"
                      value={dataFimHistorico}
                      onChange={(event) => setDataFimHistorico(event.target.value || hoje)}
                      className="h-11 w-full rounded-xl border border-[#D4AF37]/20 bg-[#111111] px-3 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                      Loja
                    </label>
                    <Select value={lojaHistorico} onValueChange={setLojaHistorico}>
                      <SelectTrigger className="h-11 border-[#D4AF37]/20 bg-[#111111] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[#D4AF37]/20 bg-[#111111] text-white">
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

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3.5">
                    <p className="text-xs text-gray-500">Corretos</p>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{resumoHistorico.corretos}</p>
                  </div>
                  <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3.5">
                    <p className="text-xs text-gray-500">Com diferença</p>
                    <p className="mt-1 text-2xl font-black text-amber-300">{resumoHistorico.divergentes}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-xs text-gray-500">Diferença líquida</p>
                    <p className="mt-1 text-xl font-black text-white">
                      {formatarMoeda(resumoHistorico.diferencaLiquida)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4 space-y-3">
              {historicoQuery.isLoading ? (
                <Card className="border-white/[0.07] bg-[#0b0b0b]">
                  <CardContent className="flex items-center gap-3 p-5 text-sm text-gray-400">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Carregando fechamentos...
                  </CardContent>
                </Card>
              ) : historico.length === 0 ? (
                <Card className="border-white/[0.07] bg-[#0b0b0b]">
                  <CardContent className="p-5 text-sm text-gray-500">
                    Nenhum fechamento encontrado neste período.
                  </CardContent>
                </Card>
              ) : (
                historico.map((fechamento) => {
                  const dif = Number(fechamento.diferenca || 0);
                  const correto = dif === 0;
                  return (
                    <Card key={fechamento.id} className="border-white/[0.07] bg-[#0b0b0b]">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-white">{fechamento.lojaNome}</p>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  correto
                                    ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300"
                                    : "border-amber-400/20 bg-amber-400/[0.05] text-amber-300"
                                }`}
                              >
                                {correto ? "Correto" : "Diferença justificada"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {formatarData(fechamento.dataReferencia)} • {fechamento.fechadoPorNome}
                            </p>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void abrirRelatorio(fechamento)}
                            className="h-9 border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] text-xs font-bold text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                          >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Abrir relatório
                          </Button>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="text-xs text-gray-500">Saldo final</p>
                            <p className="mt-1 font-black text-white">{formatarMoeda(fechamento.saldoFinal)}</p>
                          </div>
                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="text-xs text-gray-500">Dinheiro físico</p>
                            <p className="mt-1 font-black text-white">{formatarMoeda(fechamento.totalFisico)}</p>
                          </div>
                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <p className="text-xs text-gray-500">Diferença</p>
                            <p className={`mt-1 font-black ${correto ? "text-emerald-300" : "text-amber-300"}`}>
                              {formatarMoeda(dif)}
                            </p>
                          </div>
                        </div>

                        {!correto && (
                          <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.035] p-3 text-sm text-gray-300">
                            <strong className="text-amber-300">{nomeJustificativa(fechamento.justificativaTipo)}:</strong>{" "}
                            {fechamento.justificativaObservacao || "Sem observação."}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </section>
        )}

        {!modoOperacional && !podeVerHistorico && (
          <Card className="border-rose-400/20 bg-rose-400/[0.04]">
            <CardContent className="p-6 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-rose-300" />
              <p className="mt-3 font-black text-white">Acesso restrito</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
