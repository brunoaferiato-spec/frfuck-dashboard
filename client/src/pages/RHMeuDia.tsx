import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import RHEpiAlertas from "@/components/RHEpiAlertas";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileUp,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import RHFeriasCaixaPendencias from "@/components/RHFeriasCaixaPendencias";
import RHRescisaoCaixa from "@/components/RHRescisaoCaixa";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PeriodoPonto =
  | "entrada"
  | "saida_almoco"
  | "retorno_almoco"
  | "saida";

type RegistroPontoPdf = {
  data: string;
  nomePdf: string;
  entrada1: string | null;
  saida1: string | null;
  entrada2: string | null;
  saida2: string | null;
};

type AnaliseItem = {
  status: string;
  bloqueiaFinalizacao: boolean;
  nomePdf?: string | null;
  funcionarioId?: number | null;
  funcionarioNome?: string | null;
  funcionarioFuncao?: string | null;
  horarioPrevisto?: string | null;
  horarioBatida?: string | null;
  minutosAtraso?: number;
  minutosAntecipados?: number;
  advertenciaObrigatoria?: boolean;
  tratativaObrigatoria?: boolean;
  mensagem?: string;
};

type AnalisePonto = {
  lojaId: number;
  lojaNome: string;
  dataReferencia: string;
  periodo: PeriodoPonto;
  horarioConferencia: string;
  totalRegistrosPdf: number;
  totalFuncionariosCadastro: number;
  bloqueios: number;
  podeFinalizar: boolean;
  totais: {
    ok: number;
    atrasosRegistrados: number;
    atrasos: number;
    almocosExcedidos: number;
    intervalosInferiores: number;
    semBatida: number;
    faltas: number;
    faltasTratadas: number;
    saidasAntecipadas: number;
    jornadaNaoCadastrada: number;
    naoIdentificados: number;
    duplicadosRelatorio: number;
    ausentesRelatorio: number;
    aguardandoHorario: number;
    atestados: number;
  };
  itens: AnaliseItem[];
};

const HORARIOS: Array<{
  periodo: PeriodoPonto;
  horario: string;
  titulo: string;
  descricao: string;
}> = [
  {
    periodo: "entrada",
    horario: "10:00",
    titulo: "Entrada",
    descricao: "Importe o Ponto Diário e confira a primeira entrada.",
  },
  {
    periodo: "saida_almoco",
    horario: "12:30",
    titulo: "Saída almoço",
    descricao: "Importe o relatório atualizado e registre o início do intervalo.",
  },
  {
    periodo: "retorno_almoco",
    horario: "14:30",
    titulo: "Retorno almoço",
    descricao: "Importe o relatório atualizado e confira a duração real do almoço.",
  },
  {
    periodo: "saida",
    horario: "17:45",
    titulo: "Saída",
    descricao: "Importe o relatório atualizado e confira as saídas já exigíveis.",
  },
 ];

const HORARIOS_SABADO: Array<{
  periodo: PeriodoPonto;
  horario: string;
  titulo: string;
  descricao: string;
}> = [
  {
    periodo: "entrada",
    horario: "10:00",
    titulo: "Entrada",
    descricao:
      "Confira as entradas de sábado: 07:30 para a jornada padrão e 09:00 para auxiliares.",
  },
  {
    periodo: "saida",
    horario: "13:00",
    titulo: "Saída",
    descricao:
      "Confira as saídas de sábado: 11:30 para a jornada padrão e 13:00 para auxiliares.",
  },
];

const NOMES_PERIODO_PENDENCIA: Record<string, string> = {
  entrada: "10:00 • Entrada",
  saida_almoco: "12:30 • Saída almoço",
  retorno_almoco: "14:30 • Retorno almoço",
  saida: "17:45 • Saída",
};

function diaSemanaDataCivilTela(dataCivil: string) {
  const [ano, mes, dia] = String(dataCivil || "").split("-").map(Number);
  if (!ano || !mes || !dia) return -1;
  return new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
}

function horariosParaData(dataCivil: string) {
  const diaSemana = diaSemanaDataCivilTela(dataCivil);
  if (diaSemana === 0) return [];
  if (diaSemana === 6) return HORARIOS_SABADO;
  return HORARIOS;
}

function nomePeriodoPendencia(periodo: string, dataCivil?: string | null) {
  if (dataCivil && diaSemanaDataCivilTela(dataCivil) === 6) {
    if (periodo === "entrada") return "10:00 • Entrada";
    if (periodo === "saida") return "13:00 • Saída";
  }

  return NOMES_PERIODO_PENDENCIA[periodo] || periodo;
}

function dataHojeCivil() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataExtenso(dataCivil: string) {
  const [ano, mes, dia] = dataCivil.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia, 12, 0, 0);

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(data);
}

function horarioAgora() {
  const agora = new Date();
  return `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes()
  ).padStart(2, "0")}`;
}

function minutosHorario(horario: string) {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
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

function converterDataBrParaIso(dataBr: string) {
  const match = String(dataBr || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizarBatidaPdf(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "FALTA") return "FALTA";
  const match = raw.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1]}:${match[2]}` : "";
}

type LinhaPdf = {
  y: number;
  itens: Array<{ texto: string; x: number }>;
};

function agruparItensPdf(items: any[]): LinhaPdf[] {
  const palavras = items
    .filter((item: any) => item && typeof item.str === "string" && item.str.trim())
    .map((item: any) => ({
      texto: String(item.str).trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .sort((a: any, b: any) => {
      const diferencaY = b.y - a.y;
      return Math.abs(diferencaY) > 2.5 ? diferencaY : a.x - b.x;
    });

  const grupos: Array<{
    y: number;
    itens: Array<{ texto: string; x: number }>;
  }> = [];

  for (const palavra of palavras) {
    let grupo = grupos.find((item) => Math.abs(item.y - palavra.y) <= 2.5);

    if (!grupo) {
      grupo = { y: palavra.y, itens: [] };
      grupos.push(grupo);
    }

    grupo.itens.push({ texto: palavra.texto, x: palavra.x });
  }

  return grupos
    .sort((a, b) => b.y - a.y)
    .map((grupo) => ({
      y: grupo.y,
      itens: grupo.itens.sort((a, b) => a.x - b.x),
    }));
}

function textoLinha(linha: LinhaPdf) {
  return linha.itens
    .map((item) => item.texto)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function primeiroValorFaixa(
  linha: LinhaPdf,
  inicio: number,
  fim: number
): string | null {
  const texto = linha.itens
    .filter((item) => item.x >= inicio && item.x < fim)
    .map((item) => item.texto)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const batida = normalizarBatidaPdf(texto);
  return batida || null;
}

function identificarColunasPdf(linhas: LinhaPdf[]) {
  // O Ponto Diário atual do Secullum não possui uma coluna DATA em cada linha.
  // O cabeçalho é: Nº FOLHA | NOME | ENT. 1 | SAÍ. 1 | ENT. 2 | SAÍ. 2 ...
  const cabecalho = linhas.find((linha) => {
    const texto = textoLinha(linha)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    return (
      texto.includes("NOME") &&
      texto.includes("ENT") &&
      texto.includes("SAI") &&
      texto.includes("CARGA")
    );
  });

  if (!cabecalho) {
    return {
      nomeX: 103,
      ent1X: 307,
      sai1X: 344,
      ent2X: 381,
      sai2X: 418,
      normaisX: 528,
    };
  }

  const itens = cabecalho.itens;
  const nomeItem = itens.find((item) => item.texto.toUpperCase().includes("NOME"));
  const entItens = itens.filter((item) =>
    item.texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .startsWith("ENT")
  );
  const saiItens = itens.filter((item) =>
    item.texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .startsWith("SAI")
  );
  const normaisItem = itens.find((item) =>
    item.texto.toUpperCase().includes("NORMAIS")
  );

  const entOrdenados = [...entItens].sort((a, b) => a.x - b.x);
  const saiOrdenados = [...saiItens].sort((a, b) => a.x - b.x);

  return {
    nomeX: Number(nomeItem?.x || 103),
    ent1X: Number(entOrdenados[0]?.x || 307),
    sai1X: Number(saiOrdenados[0]?.x || 344),
    ent2X: Number(entOrdenados[1]?.x || 381),
    sai2X: Number(saiOrdenados[1]?.x || 418),
    normaisX: Number(normaisItem?.x || 528),
  };
}

function identificarDataRelatorioPdf(linhas: LinhaPdf[]) {
  // Prioridade para a data oficial exibida no topo: "Dia: 09/09/2026".
  for (const linha of linhas) {
    const texto = textoLinha(linha);
    if (!/\bDIA\s*:/i.test(texto)) continue;

    const match = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!match) continue;

    const data = converterDataBrParaIso(match[1]);
    if (data) return data;
  }

  return "";
}

function extrairRegistrosPagina(
  linhas: LinhaPdf[],
  dataRelatorio: string
): RegistroPontoPdf[] {
  const colunas = identificarColunasPdf(linhas);
  const registros: RegistroPontoPdf[] = [];

  for (const linha of linhas) {
    const texto = textoLinha(linha);

    // Compatibilidade com versões antigas que eventualmente tragam a data em cada linha.
    const dataLinhaMatch = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    const dataLinha = dataLinhaMatch
      ? converterDataBrParaIso(dataLinhaMatch[1])
      : "";
    const data = dataLinha || dataRelatorio;
    if (!data) continue;

    // Uma linha de funcionário sempre possui o Nº FOLHA à esquerda do campo NOME.
    const numeroFolha = linha.itens
      .filter((item) => item.x < colunas.nomeX - 20)
      .map((item) => item.texto)
      .join("")
      .trim();

    if (!/^\d+$/.test(numeroFolha)) continue;

    const nome = linha.itens
      .filter(
        (item) => item.x >= colunas.nomeX - 12 && item.x < colunas.ent1X - 8
      )
      .map((item) => item.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!nome) continue;

    // "ADM LOJA" é uma linha administrativa do relatório e não representa
    // um funcionário que deva participar da conferência/advertência.
    const nomeNormalizado = nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();

    if (nomeNormalizado === "ADM LOJA") continue;

    registros.push({
      data,
      nomePdf: nome,
      entrada1: primeiroValorFaixa(
        linha,
        colunas.ent1X - 8,
        colunas.sai1X - 5
      ),
      saida1: primeiroValorFaixa(
        linha,
        colunas.sai1X - 5,
        colunas.ent2X - 5
      ),
      entrada2: primeiroValorFaixa(
        linha,
        colunas.ent2X - 5,
        colunas.sai2X - 5
      ),
      saida2: primeiroValorFaixa(
        linha,
        colunas.sai2X - 5,
        colunas.normaisX - 5
      ),
    });
  }

  return registros;
}

async function hashArquivo(buffer: ArrayBuffer) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function lerPdfPontoDiario(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await hashArquivo(buffer);
  const bytes = new Uint8Array(buffer);
  const documento = await pdfjs.getDocument({ data: bytes }).promise;

  const registros: RegistroPontoPdf[] = [];
  let encontrouPontoDiario = false;
  let dataRelatorio = "";

  for (let paginaNumero = 1; paginaNumero <= documento.numPages; paginaNumero += 1) {
    const pagina = await documento.getPage(paginaNumero);
    const conteudo = await pagina.getTextContent();
    const linhas = agruparItensPdf(conteudo.items as any[]);
    const textoPagina = linhas.map(textoLinha).join("\n").toUpperCase();

    if (textoPagina.includes("PONTO DIÁRIO") || textoPagina.includes("PONTO DIARIO")) {
      encontrouPontoDiario = true;
    }

    const dataPagina = identificarDataRelatorioPdf(linhas);
    if (dataPagina) dataRelatorio = dataPagina;

    registros.push(...extrairRegistrosPagina(linhas, dataPagina || dataRelatorio));
  }

  if (!encontrouPontoDiario) {
    throw new Error(
      "Este arquivo não foi reconhecido como o relatório PONTO DIÁRIO do Secullum."
    );
  }

  if (registros.length === 0) {
    throw new Error("Não encontrei funcionários no relatório enviado.");
  }

  const unicos = new Map<string, RegistroPontoPdf>();
  for (const registro of registros) {
    const chave = `${registro.data}|${registro.nomePdf.toUpperCase()}`;
    if (!unicos.has(chave)) unicos.set(chave, registro);
  }

  return {
    registros: Array.from(unicos.values()),
    hash,
  };
}

function nomeStatus(status: string) {
  const mapa: Record<string, string> = {
    ok: "Correto",
    atraso_registrado: "Atraso registrado",
    atraso: "Atraso +15 min",
    almoco_excedido: "Almoço excedido",
    intervalo_inferior: "Intervalo inferior",
    sem_batida: "Sem batida",
    falta: "Falta",
    falta_tratada: "Falta já registrada",
    saida_antecipada: "Saída antecipada",
    jornada_nao_cadastrada: "Jornada não cadastrada",
    nao_identificado: "Não identificado",
    duplicado_relatorio: "Duplicado no relatório",
    ausente_relatorio: "Ausente do relatório",
    aguardando_horario: "Aguardando horário",
    atestado: "Atestado",
  };

  return mapa[status] || status;
}

function classeStatus(status: string) {
  if (status === "atraso" || status === "almoco_excedido" || status === "falta") {
    return "border-rose-400/20 bg-rose-400/[0.055] text-rose-200";
  }

  if (status === "atraso_registrado") {
    return "border-amber-400/20 bg-amber-400/[0.055] text-amber-100";
  }

  if (status === "atestado" || status === "falta_tratada") {
    return "border-sky-400/15 bg-sky-400/[0.04] text-sky-200";
  }

  if (
    status === "sem_batida" ||
    status === "jornada_nao_cadastrada" ||
    status === "nao_identificado" ||
    status === "duplicado_relatorio" ||
    status === "ausente_relatorio"
  ) {
    return "border-amber-400/20 bg-amber-400/[0.055] text-amber-100";
  }

  if (status === "saida_antecipada" || status === "intervalo_inferior") {
    return "border-orange-400/20 bg-orange-400/[0.055] text-orange-100";
  }

  if (status === "aguardando_horario") {
    return "border-sky-400/15 bg-sky-400/[0.04] text-sky-200";
  }

  return "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200";
}


type PendenciaPonto = {
  id: string;
  fase: "classificar" | "documento" | "cadastro";
  ocorrenciaId?: number;
  conferenciaId?: number;
  cadastroPendenteId?: number;
  lojaId: number;
  lojaNome?: string;
  funcionarioId?: number | null;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  dataReferencia: string;
  periodo: string;
  tipoOcorrencia?: string | null;
  tipoCadastro?: string | null;
  horarioPrevisto?: string | null;
  horarioBatida?: string | null;
  minutosAtraso?: number;
  mensagem?: string | null;
  tratativaId?: number | null;
  tratativaTipo?: "advertencia" | "atestado" | "justificativa" | "falta" | null;
  tratativaObservacao?: string | null;
  diasAtestado?: number | null;
  dataInicioAtestado?: string | null;
  dataFimAtestado?: string | null;
  documentoStatus?: string | null;
};

function labelTratativa(tipo?: string | null) {
  if (tipo === "atestado") return "Atestado";
  if (tipo === "justificativa") return "Justificativa";
  if (tipo === "falta") return "Falta / advertência";
  return "Advertência";
}

function labelDocumentoPendente(tipo?: string | null) {
  if (tipo === "atestado") return "Anexar atestado";
  if (tipo === "justificativa") return "Anexar justificativa / comprovante";
  return "Anexar advertência assinada";
}

async function arquivoParaBase64(file: File) {
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("O documento deve ter no máximo 6 MB.");
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

export default function RHMeuDia() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const ehAdminTeste = role === "admin" || role === "gestor";
  const lojaUsuario = Number(user?.lojaId || 0);
  const hoje = dataHojeCivil();

  const [lojaTeste, setLojaTeste] = useState("1");
  const [dataTeste, setDataTeste] = useState(hoje);
  const dataReferencia = ehAdminTeste ? dataTeste : hoje;
  const diaSemanaReferencia = diaSemanaDataCivilTela(dataReferencia);
  const domingoFechado = diaSemanaReferencia === 0;
  const sabadoOperacao = diaSemanaReferencia === 6;
  const horariosDoDia = horariosParaData(dataReferencia);

  const lojasQuery = trpc.lojas.list.useQuery(undefined, {
    retry: false,
  });

  const lojas = useMemo(
    () => ((lojasQuery.data || []) as Array<{ id: number; nome: string }>),
    [lojasQuery.data]
  );

  const lojaIdAtual = ehAdminTeste ? Number(lojaTeste) : lojaUsuario;
  const lojaAtual = lojas.find((loja) => Number(loja.id) === lojaIdAtual);

  const pontoDiaQuery = trpc.rhPonto.dia.useQuery(
    {
      lojaId: lojaIdAtual,
      dataReferencia,
    },
    {
      enabled: lojaIdAtual > 0,
      retry: false,
    }
  );

  const pendenciasQuery = trpc.rhPonto.pendencias.useQuery(
    { lojaId: lojaIdAtual > 0 ? lojaIdAtual : null },
    { enabled: lojaIdAtual > 0, retry: false }
  );

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: lojaIdAtual },
    { enabled: lojaIdAtual > 0, retry: false }
  );

  const funcionariosVinculaveis = useMemo(
    () =>
      ((funcionariosQuery.data || []) as any[])
        .filter((funcionario) => {
          const status = String(funcionario.status || "");
          return (status === "ativo" || status === "experiencia") && !Boolean(funcionario.cargoConfianca);
        })
        .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")),
    [funcionariosQuery.data]
  );

  const conferencias = useMemo(
    () => ((pontoDiaQuery.data || []) as any[]),
    [pontoDiaQuery.data]
  );

  const pendencias = useMemo(
    () => ((pendenciasQuery.data || []) as PendenciaPonto[]),
    [pendenciasQuery.data]
  );

  const conferenciaPorPeriodo = useMemo(() => {
    const mapa = new Map<string, any>();

    for (const conferencia of conferencias) {
      mapa.set(String(conferencia.periodo), conferencia);
    }

    return mapa;
  }, [conferencias]);

  const [periodoAberto, setPeriodoAberto] = useState<PeriodoPonto | null>(null);
  const [registrosImportados, setRegistrosImportados] = useState<
    RegistroPontoPdf[]
  >([]);
  const [analise, setAnalise] = useState<AnalisePonto | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoHash, setArquivoHash] = useState<string | null>(null);
  const [observacaoConferencia, setObservacaoConferencia] = useState("");
  const [mensagemModal, setMensagemModal] = useState("");
  const [processandoPdf, setProcessandoPdf] = useState(false);
  const [tratativaAlvo, setTratativaAlvo] = useState<PendenciaPonto | null>(null);
  const [tipoTratativa, setTipoTratativa] = useState<
    "advertencia" | "atestado" | "justificativa" | "falta"
  >("advertencia");
  const [observacaoTratativa, setObservacaoTratativa] = useState("");
  const [diasAtestado, setDiasAtestado] = useState("1");
  const [mensagemTratativa, setMensagemTratativa] = useState("");
  const [arquivoTratativa, setArquivoTratativa] = useState<File | null>(null);
  const [enviandoDocumentoId, setEnviandoDocumentoId] = useState<number | null>(null);
  const [funcionarioVinculoPorNome, setFuncionarioVinculoPorNome] = useState<Record<string, string>>({});
  const [vinculandoNomePdf, setVinculandoNomePdf] = useState<string | null>(null);
  const [grupoPendenciaAberto, setGrupoPendenciaAberto] = useState<PeriodoPonto | null>(null);

  const analisarMutation = trpc.rhPonto.analisarImportacao.useMutation();
  const vincularNomeFuncionarioMutation = trpc.rhPonto.vincularNomeFuncionario.useMutation();

  const salvarImportacaoMutation = trpc.rhPonto.salvarImportacao.useMutation({
    onSuccess: async () => {
      setMensagemModal("");
      setPeriodoAberto(null);
      setRegistrosImportados([]);
      setAnalise(null);
      setArquivoNome("");
      setArquivoHash(null);
      setObservacaoConferencia("");
      await Promise.all([pontoDiaQuery.refetch(), pendenciasQuery.refetch()]);
    },
    onError: (error) => {
      setMensagemModal(error.message || "Erro ao finalizar a conferência.");
    },
  });

  const criarTratativaMutation = trpc.rhPonto.criarTratativa.useMutation();

  const anexarDocumentoMutation = trpc.rhPonto.anexarDocumentoTratativa.useMutation({
    onSuccess: async () => {
      setEnviandoDocumentoId(null);
      await Promise.all([pendenciasQuery.refetch(), pontoDiaQuery.refetch()]);
    },
    onError: (error) => {
      setEnviandoDocumentoId(null);
      window.alert(error.message || "Não foi possível anexar o documento.");
    },
  });

  const horarioConfigAberto = horariosDoDia.find(
    (item) => item.periodo === periodoAberto
  );

  const agoraMinutos = minutosHorario(horarioAgora());

  const conferenciasPendentesAgora = horariosDoDia.filter((item) => {
    if (dataReferencia !== hoje) return false;
    if (conferenciaPorPeriodo.has(item.periodo)) return false;
    return agoraMinutos >= minutosHorario(item.horario);
  });

  const pendenciasDaLoja = useMemo(
    () => pendencias.filter((item) => Number(item.lojaId) === lojaIdAtual),
    [pendencias, lojaIdAtual]
  );

  const gruposPendencias = useMemo(
    () =>
      HORARIOS.map((horario) => ({
        ...horario,
        pendencias: pendenciasDaLoja.filter(
          (pendencia) => String(pendencia.periodo) === horario.periodo
        ),
      })).filter((grupo) => grupo.pendencias.length > 0),
    [pendenciasDaLoja]
  );

  const itensResultado = useMemo(() => {
    if (!analise) return [];
    return analise.itens.filter((item) => item.status !== "aguardando_horario");
  }, [analise]);

  async function sair() {
    await logout();
    navigate("/");
  }

  function resetarImportacao() {
    setRegistrosImportados([]);
    setAnalise(null);
    setArquivoNome("");
    setArquivoHash(null);
    setMensagemModal("");
    setFuncionarioVinculoPorNome({});
    setVinculandoNomePdf(null);
  }

  function abrirConferencia(periodo: PeriodoPonto) {
    const existente = conferenciaPorPeriodo.get(periodo);

    setPeriodoAberto(periodo);
    resetarImportacao();
    setObservacaoConferencia(existente?.observacao || "");
  }

  async function importarPdf(file?: File | null) {
    if (!file || !periodoAberto) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMensagemModal("Selecione o PDF do relatório Ponto Diário.");
      return;
    }

    setProcessandoPdf(true);
    setMensagemModal("");
    setAnalise(null);

    try {
      const leitura = await lerPdfPontoDiario(file);
      const resposta = await analisarMutation.mutateAsync({
        lojaId: lojaIdAtual,
        dataReferencia,
        periodo: periodoAberto,
        registros: leitura.registros,
      });

      setRegistrosImportados(leitura.registros);
      setArquivoNome(file.name);
      setArquivoHash(leitura.hash);
      setAnalise(resposta as AnalisePonto);
    } catch (error: any) {
      console.error(error);
      setRegistrosImportados([]);
      setArquivoNome("");
      setArquivoHash(null);
      setAnalise(null);
      setMensagemModal(
        error?.message || "Não foi possível analisar o relatório de ponto."
      );
    } finally {
      setProcessandoPdf(false);
    }
  }

  async function vincularFuncionarioDoPdf(item: AnaliseItem) {
    if (!periodoAberto || registrosImportados.length === 0) return;

    const nomePdf = String(item.nomePdf || "").trim();
    const funcionarioId = Number(funcionarioVinculoPorNome[nomePdf] || 0);

    if (!nomePdf) {
      setMensagemModal("Não foi possível identificar o nome vindo do PDF.");
      return;
    }

    if (!funcionarioId) {
      setMensagemModal("Selecione o funcionário correto antes de vincular.");
      return;
    }

    setVinculandoNomePdf(nomePdf);
    setMensagemModal("");

    try {
      await vincularNomeFuncionarioMutation.mutateAsync({
        lojaId: lojaIdAtual,
        nomePdf,
        funcionarioId,
      });

      const resposta = await analisarMutation.mutateAsync({
        lojaId: lojaIdAtual,
        dataReferencia,
        periodo: periodoAberto,
        registros: registrosImportados,
      });

      setAnalise(resposta as AnalisePonto);
      await pendenciasQuery.refetch();
      setFuncionarioVinculoPorNome((atual) => {
        const proximo = { ...atual };
        delete proximo[nomePdf];
        return proximo;
      });
    } catch (error: any) {
      setMensagemModal(error?.message || "Não foi possível vincular o funcionário.");
    } finally {
      setVinculandoNomePdf(null);
    }
  }

  function finalizarConferencia() {
    if (!periodoAberto || !analise || registrosImportados.length === 0) return;

    if (!analise.podeFinalizar) {
      setMensagemModal(
        "Existe um problema estrutural no relatório que impede a finalização. Revise os itens marcados como bloqueio."
      );
      return;
    }

    salvarImportacaoMutation.mutate({
      lojaId: lojaIdAtual,
      dataReferencia,
      periodo: periodoAberto,
      arquivoNome,
      arquivoHash,
      observacao: observacaoConferencia.trim() || null,
      registros: registrosImportados,
    });
  }


  function abrirTratativa(pendencia: PendenciaPonto) {
    setTratativaAlvo(pendencia);
    setMensagemTratativa("");
    setObservacaoTratativa("");
    setDiasAtestado("1");
    setArquivoTratativa(null);
    setTipoTratativa(
      pendencia.tipoOcorrencia === "falta" || pendencia.tipoOcorrencia === "ausente_relatorio"
        ? "falta"
        : "advertencia"
    );
  }

  function documentoPermitido(file: File) {
    const permitidos = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);
    return permitidos.has(file.type);
  }

  async function salvarTratativa() {
    if (!tratativaAlvo?.ocorrenciaId) return;

    setMensagemTratativa("");

    if (tipoTratativa === "justificativa" && observacaoTratativa.trim().length < 3) {
      setMensagemTratativa("Informe a justificativa.");
      return;
    }

    if (arquivoTratativa && !documentoPermitido(arquivoTratativa)) {
      setMensagemTratativa("Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.");
      return;
    }

    try {
      const resposta = await criarTratativaMutation.mutateAsync({
        ocorrenciaId: tratativaAlvo.ocorrenciaId,
        lojaId: tratativaAlvo.lojaId,
        tipo: tipoTratativa,
        observacao: observacaoTratativa.trim() || null,
        diasAtestado: tipoTratativa === "atestado" ? Number(diasAtestado || 1) : null,
      });

      const tratativaId = Number((resposta as any)?.tratativaId || 0);

      if (arquivoTratativa) {
        if (!tratativaId) {
          throw new Error("A tratativa foi registrada, mas não foi possível identificar o documento para anexar.");
        }

        const arquivoBase64 = await arquivoParaBase64(arquivoTratativa);
        await anexarDocumentoMutation.mutateAsync({
          tratativaId,
          lojaId: tratativaAlvo.lojaId,
          arquivoNome: arquivoTratativa.name,
          arquivoMime: arquivoTratativa.type,
          arquivoTamanho: arquivoTratativa.size,
          arquivoBase64,
        });
      }

      setTratativaAlvo(null);
      setMensagemTratativa("");
      setObservacaoTratativa("");
      setDiasAtestado("1");
      setArquivoTratativa(null);
      await Promise.all([pendenciasQuery.refetch(), pontoDiaQuery.refetch()]);
    } catch (error: any) {
      setMensagemTratativa(
        error?.message ||
          (arquivoTratativa
            ? "Não foi possível registrar a tratativa e anexar o documento."
            : "Erro ao registrar tratativa.")
      );
    }
  }

  async function anexarDocumento(pendencia: PendenciaPonto, file?: File | null) {
    if (!file || !pendencia.tratativaId) return;

    if (!documentoPermitido(file)) {
      window.alert("Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.");
      return;
    }

    try {
      setEnviandoDocumentoId(pendencia.tratativaId);
      const arquivoBase64 = await arquivoParaBase64(file);
      anexarDocumentoMutation.mutate({
        tratativaId: pendencia.tratativaId,
        lojaId: pendencia.lojaId,
        arquivoNome: file.name,
        arquivoMime: file.type,
        arquivoTamanho: file.size,
        arquivoBase64,
      });
    } catch (error: any) {
      setEnviandoDocumentoId(null);
      window.alert(error?.message || "Não foi possível preparar o documento.");
    }
  }

  function resumoPendencia(pendencia: PendenciaPonto) {
    if (pendencia.fase === "cadastro") {
      return pendencia.tipoCadastro === "jornada"
        ? "Jornada pendente de cadastro pelo RH"
        : "Funcionário pendente de cadastro pelo RH";
    }
    if (pendencia.fase === "documento") {
      if (pendencia.tratativaTipo === "atestado" && pendencia.dataFimAtestado) {
        return `Atestado informado até ${pendencia.dataFimAtestado.split("-").reverse().join("/")} • documento pendente`;
      }
      return `${labelTratativa(pendencia.tratativaTipo)} • documento pendente`;
    }
    return "Tratativa pendente: escolha atestado, justificativa ou advertência";
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8f8a80] sm:text-xs">
              RH Operacional
            </p>
            <h1 className="mt-0.5 text-xl font-black text-[#F2D675] sm:text-2xl">
              Meu Dia
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/rh/caixa")}
              className="h-10 border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <Banknote className="mr-2 h-4 w-4" />
              <span className="hidden text-sm sm:inline">Fechar Caixa</span>
              <span className="text-sm sm:hidden">Caixa</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/rh/documentos")}
              className="h-10 border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <FileCheck2 className="mr-2 h-4 w-4" />
              <span className="hidden text-sm sm:inline">Documentos</span>
              <span className="text-sm sm:hidden">Docs</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/rh/epis")}
              className="h-10 border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-3 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <span className="text-sm">EPIs</span>
            </Button>

            <Button
              variant="ghost"
              onClick={sair}
              className="h-10 px-3 text-gray-400 hover:bg-red-500/10 hover:text-rose-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden text-sm sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-5 sm:py-6 lg:px-8">
        <RHFeriasCaixaPendencias />
        <RHRescisaoCaixa
          lojaIdOverride={lojaIdAtual}
          modoTeste={ehAdminTeste}
        />
        <RHEpiAlertas />
        <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr] lg:gap-4">
          <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#080808]">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8f8a80] sm:text-xs">
                    Rotina da Caixa Líder
                  </p>

                  <h2 className="mt-1.5 truncate text-2xl font-black text-white sm:text-3xl">
                    {lojaAtual?.nome || (ehAdminTeste ? "Selecione uma loja" : "Sua loja")}
                  </h2>

                  <p className="mt-1.5 capitalize text-xs text-gray-400 sm:text-sm">
                    {formatarDataExtenso(dataReferencia)}
                  </p>
                </div>

                <div className="shrink-0 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-2.5 sm:rounded-2xl sm:p-3">
                  <CalendarDays className="h-5 w-5 text-[#F2D675] sm:h-6 sm:w-6" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {ehAdminTeste ? (
                  <>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                        Loja para teste
                      </label>
                      <Select
                        value={lojaTeste}
                        onValueChange={(valor) => {
                          setLojaTeste(valor);
                          setPeriodoAberto(null);
                        }}
                      >
                        <SelectTrigger className="h-11 w-full border-[#D4AF37]/25 bg-[#111111] text-base text-white">
                          <SelectValue placeholder="Loja para teste" />
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
                          setPeriodoAberto(null);
                        }}
                        className="h-11 w-full rounded-xl border border-[#D4AF37]/25 bg-[#111111] px-3 text-sm text-white outline-none focus:border-[#D4AF37]/55"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-3 py-2.5 text-sm sm:col-span-2">
                    <MapPin className="h-4 w-4 shrink-0 text-[#F2D675]" />
                    <span className="truncate font-semibold">
                      {lojaAtual?.nome || "Loja vinculada"}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-[#D4AF37]/15 bg-black/25 p-3.5 text-xs leading-5 text-gray-400 sm:p-4 sm:text-sm sm:leading-6">
                A conferência é feita pelo PDF do Secullum. Até 10 minutos de atraso fica dentro da tolerância; de 11 a 15 minutos o atraso é apenas registrado; acima de 15 minutos exige tratativa.
              </div>
            </CardContent>
          </Card>

          <Card
            className={
              conferenciasPendentesAgora.length > 0
                ? "border-amber-400/25 bg-amber-500/[0.05]"
                : "border-[#D4AF37]/20 bg-[#0b0b0b]"
            }
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  {conferenciasPendentesAgora.length > 0 ? (
                    <AlertTriangle className="h-5 w-5 text-amber-300" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-[#F2D675]" />
                  )}
                </div>

                <div>
                  <p className="font-bold text-white">Pendências agora</p>
                  <p className="mt-0.5 text-xs text-gray-500">Caixa Líder</p>
                </div>
              </div>

              {conferenciasPendentesAgora.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {conferenciasPendentesAgora.map((item) => (
                    <div
                      key={item.periodo}
                      className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2.5 text-sm text-amber-100"
                    >
                      Conferência das <strong>{item.horario}</strong> ainda não realizada.
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-gray-400 sm:text-sm sm:leading-6">
                  Nenhuma conferência vencida neste momento.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mt-5 sm:mt-6">
          <div className="mb-3">
            <p className="text-lg font-black text-white sm:text-xl">
              Conferência de ponto
            </p>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              {domingoFechado
                ? "Domingo • loja fechada • sem conferência de ponto."
                : sabadoOperacao
                ? "Sábado: somente Entrada e Saída. Sem conferência de almoço."
                : "Baixe o Ponto Diário atualizado em cada horário e importe o PDF."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {horariosDoDia.map((item) => {
              const existente = conferenciaPorPeriodo.get(item.periodo);
              const horarioLiberado =
                ehAdminTeste ||
                dataReferencia < hoje ||
                (dataReferencia === hoje &&
                  agoraMinutos >= minutosHorario(item.horario));
              const totalOcorrencias = Number(existente?.ocorrencias?.length || 0);
              return (
                <Card
                  key={item.periodo}
                  className={
                    existente
                      ? "border-emerald-400/20 bg-emerald-500/[0.035]"
                      : horarioLiberado
                      ? "border-amber-400/20 bg-[#0b0b0b]"
                      : "border-white/[0.08] bg-[#0b0b0b]"
                  }
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-2xl font-black text-[#F2D675] sm:text-3xl">
                        {item.horario}
                      </span>
                      {existente ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <Clock3 className="h-5 w-5 text-gray-600" />
                      )}
                    </div>

                    <p className="mt-3 text-base font-bold text-white sm:text-lg">
                      {item.titulo}
                    </p>

                    <p className="mt-1.5 text-xs leading-5 text-gray-500 sm:min-h-[58px] sm:text-sm">
                      {item.descricao}
                    </p>

                    {existente ? (
                      <div className="mt-4 space-y-2">
                        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2.5 text-xs text-emerald-200">
                          Conferido às{" "}
                          <strong>{formatarHorarioData(existente.conferidoEm)}</strong>
                          {totalOcorrencias > 0
                            ? ` • ${totalOcorrencias} ocorrência${
                                totalOcorrencias === 1 ? "" : "s"
                              }`
                            : " • Tudo certo"}
                        </div>

                        {existente.relatorioNome && (
                          <div className="truncate rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-gray-500">
                            PDF: {existente.relatorioNome}
                          </div>
                        )}

                        <div className="rounded-lg border border-[#D4AF37]/10 bg-[#D4AF37]/[0.035] px-3 py-2 text-[11px] leading-4 text-[#b9aa7a]">
                          Ocorrências que exigem ação ficam concentradas em <strong className="text-[#F2D675]">Pendências abertas</strong>.
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => abrirConferencia(item.periodo)}
                          className="h-11 w-full border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reimportar / corrigir
                        </Button>
                      </div>
                    ) : horarioLiberado ? (
                      <Button
                        type="button"
                        onClick={() => abrirConferencia(item.periodo)}
                        className="mt-4 h-12 w-full bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                      >
                        <FileUp className="mr-2 h-4 w-4" />
                        Importar PDF
                      </Button>
                    ) : (
                      <div className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-xs text-gray-500">
                        <Clock3 className="h-4 w-4 shrink-0" />
                        <span>Aguardando {item.horario}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2">
          <Card className="border-white/[0.08] bg-[#0b0b0b]">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  <WalletCards className="h-5 w-5 text-[#F2D675]" />
                </div>
                <p className="font-bold text-white">Conferência de caixa</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500 sm:text-sm sm:leading-6">
                Será ativada depois que validarmos a conferência automática de ponto.
              </p>
            </CardContent>
          </Card>

          <Card
            className={
              pendenciasDaLoja.length > 0
                ? "border-rose-400/20 bg-rose-500/[0.035]"
                : "border-white/[0.08] bg-[#0b0b0b]"
            }
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  <ShieldCheck className="h-5 w-5 text-[#F2D675]" />
                </div>
                <div>
                  <p className="font-bold text-white">Pendências abertas</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {pendenciasDaLoja.length} pendência{pendenciasDaLoja.length === 1 ? "" : "s"} aguardando ação
                  </p>
                </div>
              </div>

              {pendenciasDaLoja.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {gruposPendencias.map((grupo) => {
                    const aberto = grupoPendenciaAberto === grupo.periodo;

                    return (
                      <div
                        key={grupo.periodo}
                        className="overflow-hidden rounded-xl border border-rose-400/15 bg-rose-400/[0.035]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setGrupoPendenciaAberto((atual) =>
                              atual === grupo.periodo ? null : grupo.periodo
                            )
                          }
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-rose-400/[0.05]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06]">
                              <Clock3 className="h-4 w-4 text-[#F2D675]" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">
                                {grupo.horario} • {grupo.titulo}
                              </p>
                              <p className="mt-0.5 text-[11px] text-gray-500">
                                Clique para ver os funcionários
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-2.5 py-1 text-[11px] font-black text-rose-200">
                              {grupo.pendencias.length} pendência{grupo.pendencias.length === 1 ? "" : "s"}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 text-gray-500 transition-transform ${
                                aberto ? "rotate-180" : ""
                              }`}
                            />
                          </div>
                        </button>

                        {aberto && (
                          <div className="border-t border-rose-400/10 p-2">
                            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                              {grupo.pendencias.map((pendencia) => (
                                <div
                                  key={pendencia.id}
                                  className="rounded-xl border border-rose-400/15 bg-black/20 p-3"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-white">
                                        {pendencia.funcionarioNome}
                                      </p>
                                      <p className="mt-1 text-xs text-rose-200">
                                        {resumoPendencia(pendencia)}
                                      </p>
                                      <p className="mt-1 text-[11px] text-gray-500">
                                        {pendencia.dataReferencia?.split("-").reverse().join("/")}
                                      </p>
                                    </div>
                                  </div>

                                  {pendencia.fase === "classificar" && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => abrirTratativa(pendencia)}
                                      className="mt-3 h-9 bg-rose-400 text-xs font-black text-black hover:bg-rose-300"
                                    >
                                      Definir tratativa
                                    </Button>
                                  )}

                                  {pendencia.fase === "documento" && pendencia.tratativaId && (
                                    <label className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-md bg-[#D4AF37] px-3 text-xs font-black text-black hover:bg-[#E6C760]">
                                      {enviandoDocumentoId === pendencia.tratativaId
                                        ? "Enviando..."
                                        : labelDocumentoPendente(pendencia.tratativaTipo)}
                                      <input
                                        type="file"
                                        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                                        className="hidden"
                                        disabled={enviandoDocumentoId === pendencia.tratativaId}
                                        onChange={(event) => {
                                          const file = event.target.files?.[0] || null;
                                          void anexarDocumento(pendencia, file);
                                          event.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  )}

                                  {pendencia.fase === "cadastro" && (
                                    <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200">
                                      Aguardando a Líder de RH concluir o cadastro.
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-gray-500 sm:text-sm sm:leading-6">
                  Nenhuma tratativa ou documento pendente para esta loja.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      {periodoAberto && horarioConfigAberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4">
          <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-3xl border border-[#D4AF37]/20 bg-[#090909] shadow-2xl sm:max-w-3xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#090909]/95 px-4 py-4 backdrop-blur sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                  Conferência automática
                </p>
                <h3 className="mt-1 text-xl font-black text-[#F2D675]">
                  {horarioConfigAberto.horario} • {horarioConfigAberto.titulo}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {lojaAtual?.nome} • {dataReferencia.split("-").reverse().join("/")}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriodoAberto(null)}
                className="h-10 w-10 rounded-xl p-0 text-gray-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-[#F2D675]" />
                  <div>
                    <p className="text-sm font-bold text-white">
                      Importe o Ponto Diário do Secullum
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">
                      O sistema lê os funcionários e compara esta batida com a jornada individual cadastrada. Na entrada, até 10 minutos está dentro da tolerância; a partir do 11º minuto a advertência é obrigatória.
                    </p>
                  </div>
                </div>
              </div>

              <label className="block cursor-pointer rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.035] p-5 text-center transition hover:bg-[#D4AF37]/[0.07]">
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  disabled={processandoPdf || analisarMutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void importarPdf(file);
                    event.currentTarget.value = "";
                  }}
                />

                {processandoPdf || analisarMutation.isPending ? (
                  <>
                    <RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#F2D675]" />
                    <p className="mt-3 font-bold text-white">Lendo e conferindo o PDF...</p>
                  </>
                ) : (
                  <>
                    <FileUp className="mx-auto h-7 w-7 text-[#F2D675]" />
                    <p className="mt-3 font-bold text-white">
                      {arquivoNome ? "Importar outro PDF" : "Selecionar PDF do ponto"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Toque aqui para escolher o relatório baixado do Secullum.
                    </p>
                  </>
                )}
              </label>

              {arquivoNome && (
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
                  <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{arquivoNome}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {registrosImportados.length} linha(s) de funcionário lidas
                    </p>
                  </div>
                </div>
              )}

              {analise && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300/70">
                        Corretos
                      </p>
                      <p className="mt-1 text-2xl font-black text-emerald-300">
                        {analise.totais.ok}
                      </p>
                    </div>

                    <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-300/70">
                        Tratativas
                      </p>
                      <p className="mt-1 text-2xl font-black text-rose-300">
                        {analise.itens.filter((item) => item.tratativaObrigatoria).length}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-300/70">
                        11–15 min
                      </p>
                      <p className="mt-1 text-2xl font-black text-amber-300">
                        {analise.totais.atrasosRegistrados}
                      </p>
                    </div>

                    <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-sky-300/70">
                        Aguardando
                      </p>
                      <p className="mt-1 text-2xl font-black text-sky-300">
                        {analise.totais.aguardandoHorario}
                      </p>
                    </div>
                  </div>

                  {analise.totais.duplicadosRelatorio > 0 && (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
                      <p className="font-bold text-amber-100">Relatório precisa de revisão</p>
                      <p className="mt-1 text-xs leading-5 text-amber-200/70">
                        Há nome duplicado no PDF. Este é o único tipo de ocorrência que bloqueia a finalização.
                      </p>
                    </div>
                  )}

                  {(analise.itens.filter((item) => item.tratativaObrigatoria).length > 0 ||
                    analise.totais.jornadaNaoCadastrada > 0 ||
                    analise.totais.naoIdentificados > 0) && (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                      <p className="font-bold text-rose-100">Pendências serão criadas ao finalizar</p>
                      <p className="mt-1 text-xs leading-5 text-rose-200/70">
                        Batidas ausentes e atrasos acima de 15 minutos ficarão aguardando tratativa. Funcionário ou jornada sem cadastro ficará pendente para a Líder de RH.
                      </p>
                    </div>
                  )}

                  {analise.itens.filter((item) => item.tratativaObrigatoria).length > 0 && (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                      <p className="font-bold text-rose-100">
                        {analise.itens.filter((item) => item.tratativaObrigatoria).length} ocorrência
                        {analise.itens.filter((item) => item.tratativaObrigatoria).length === 1 ? "" : "s"} exigirá
                        {analise.itens.filter((item) => item.tratativaObrigatoria).length === 1 ? "" : "ão"} tratativa
                      </p>
                      <p className="mt-1 text-xs leading-5 text-rose-200/70">
                        Depois de finalizar, escolha Atestado, Justificativa, Advertência ou Falta. A pendência permanece até o documento ser anexado.
                      </p>
                    </div>
                  )}

                  {itensResultado.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-black text-white">
                        Resultado da conferência
                      </p>
                      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                        {itensResultado.map((item, index) => (
                          <div
                            key={`${item.status}-${item.funcionarioId || item.nomePdf || index}-${index}`}
                            className={`rounded-xl border p-3 ${classeStatus(item.status)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <UserRound className="h-4 w-4 shrink-0" />
                                  <p className="truncate text-sm font-black">
                                    {item.funcionarioNome || item.nomePdf || "Funcionário"}
                                  </p>
                                </div>

                                <p className="mt-1 text-xs opacity-75">
                                  {item.mensagem || nomeStatus(item.status)}
                                </p>

                                {(item.horarioPrevisto || item.horarioBatida) && (
                                  <p className="mt-1 text-[11px] opacity-60">
                                    Previsto: {item.horarioPrevisto || "—"} • Realizado: {item.horarioBatida || "—"}
                                  </p>
                                )}

                                {item.status === "nao_identificado" && item.nomePdf && (
                                  <div className="mt-3 rounded-xl border border-[#D4AF37]/20 bg-black/20 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#F2D675]">
                                      Nome recebido do Secullum
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-white">{item.nomePdf}</p>

                                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                                      <Select
                                        value={funcionarioVinculoPorNome[item.nomePdf] || ""}
                                        onValueChange={(valor) =>
                                          setFuncionarioVinculoPorNome((atual) => ({
                                            ...atual,
                                            [item.nomePdf as string]: valor,
                                          }))
                                        }
                                      >
                                        <SelectTrigger className="h-10 border-[#D4AF37]/25 bg-[#111111] text-xs text-white">
                                          <SelectValue placeholder="Selecionar funcionário correto" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72 border-[#D4AF37]/20 bg-[#111111] text-white">
                                          {funcionariosVinculaveis.map((funcionario) => (
                                            <SelectItem key={funcionario.id} value={String(funcionario.id)}>
                                              {funcionario.nome}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>

                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                          !funcionarioVinculoPorNome[item.nomePdf] ||
                                          vinculandoNomePdf === item.nomePdf ||
                                          vincularNomeFuncionarioMutation.isPending ||
                                          analisarMutation.isPending
                                        }
                                        onClick={() => void vincularFuncionarioDoPdf(item)}
                                        className="h-10 bg-[#D4AF37] px-4 text-xs font-black text-black hover:bg-[#E6C760] disabled:opacity-40"
                                      >
                                        {vinculandoNomePdf === item.nomePdf ? "Vinculando..." : "Vincular funcionário"}
                                      </Button>
                                    </div>

                                    <p className="mt-2 text-[10px] leading-4 text-gray-500">
                                      O vínculo fica salvo para os próximos relatórios desta loja. Depois de vincular, esta conferência será recalculada automaticamente.
                                    </p>
                                  </div>
                                )}
                              </div>

                              <span className="shrink-0 rounded-lg border border-current/15 bg-black/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide">
                                {nomeStatus(item.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {itensResultado.length === 0 && (
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4 text-sm text-emerald-200">
                      <CheckCircle2 className="mr-2 inline h-4 w-4" />
                      Todos os registros analisados estão corretos.
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-400">
                  Observação geral da conferência
                </label>
                <textarea
                  rows={2}
                  value={observacaoConferencia}
                  onChange={(event) => setObservacaoConferencia(event.target.value)}
                  placeholder="Opcional"
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                />
              </div>

              {mensagemModal && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-3 text-sm text-rose-200">
                  {mensagemModal}
                </div>
              )}

              <Button
                type="button"
                onClick={finalizarConferencia}
                disabled={
                  !analise ||
                  !analise.podeFinalizar ||
                  salvarImportacaoMutation.isPending ||
                  processandoPdf
                }
                className="h-12 w-full bg-[#D4AF37] py-3.5 text-base font-black text-black hover:bg-[#E6C760] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {salvarImportacaoMutation.isPending
                  ? "Finalizando..."
                  : analise?.podeFinalizar
                  ? "Finalizar e criar pendências"
                  : analise
                  ? "Revise o bloqueio para finalizar"
                  : "Importe o PDF para continuar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tratativaAlvo && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/85 p-0 sm:items-center sm:p-4">
          <div className="max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D4AF37]/20 bg-[#090909] p-5 shadow-2xl sm:max-h-[92vh] sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">Definir tratativa</p>
                <h3 className="mt-1 text-xl font-black text-[#F2D675]">{tratativaAlvo.funcionarioNome}</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {tratativaAlvo.dataReferencia?.split("-").reverse().join("/")} • {nomePeriodoPendencia(
    String(tratativaAlvo.periodo),
    tratativaAlvo.dataReferencia
  )}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTratativaAlvo(null)}
                className="h-10 w-10 rounded-xl p-0 text-gray-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-3 text-xs leading-5 text-rose-100">
                {tratativaAlvo.mensagem || nomeStatus(String(tratativaAlvo.tipoOcorrencia || ""))}
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-gray-400">Como será tratada?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["advertencia", "Advertência"],
                    ["atestado", "Atestado"],
                    ["justificativa", "Justificativa"],
                    ["falta", "Falta + advertência"],
                  ].map(([valor, label]) => {
                    const ativo = tipoTratativa === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => {
                          setTipoTratativa(valor as typeof tipoTratativa);
                          setMensagemTratativa("");
                        }}
                        className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
                          ativo
                            ? "border-[#D4AF37]/70 bg-[#D4AF37]/15 text-[#F2D675]"
                            : "border-white/10 bg-black/40 text-gray-300 hover:border-[#D4AF37]/30"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {tipoTratativa === "atestado" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Quantos dias de atestado?</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={diasAtestado}
                    onChange={(event) => setDiasAtestado(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                  />
                  <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
                    Se informar mais de 1 dia, os próximos dias já serão tratados como atestado, mesmo enquanto o documento estiver pendente.
                  </p>
                </div>
              )}

              {(tipoTratativa === "justificativa" || tipoTratativa === "atestado") && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    {tipoTratativa === "justificativa" ? "Justificativa" : "Observação (opcional)"}
                  </label>
                  <textarea
                    rows={3}
                    value={observacaoTratativa}
                    onChange={(event) => setObservacaoTratativa(event.target.value)}
                    placeholder={tipoTratativa === "justificativa" ? "Ex.: consulta médica, problema no transporte..." : "Opcional"}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-400">
                  {tipoTratativa === "advertencia" || tipoTratativa === "falta"
                    ? "Advertência assinada (PDF ou foto)"
                    : tipoTratativa === "atestado"
                    ? "Atestado (PDF ou foto)"
                    : "Comprovante / documento (PDF ou foto)"}
                </label>

                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.035] px-4 py-3 text-sm transition hover:bg-[#D4AF37]/[0.07]">
                  <span className={arquivoTratativa ? "truncate font-bold text-[#F2D675]" : "text-gray-400"}>
                    {arquivoTratativa ? arquivoTratativa.name : "Selecionar PDF ou foto"}
                  </span>
                  <FileUp className="h-4 w-4 shrink-0 text-[#F2D675]" />
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      if (file && !documentoPermitido(file)) {
                        setMensagemTratativa("Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.");
                        setArquivoTratativa(null);
                      } else {
                        setMensagemTratativa("");
                        setArquivoTratativa(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                {arquivoTratativa && (
                  <button
                    type="button"
                    onClick={() => setArquivoTratativa(null)}
                    className="mt-1.5 text-[11px] font-bold text-rose-300 hover:text-rose-200"
                  >
                    Remover arquivo
                  </button>
                )}

                <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
                  Você pode anexar agora ou deixar o documento pendente para anexar depois em Pendências abertas.
                </p>
              </div>

              <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[11px] leading-5 text-amber-100/80">
                Se registrar sem arquivo, a pendência continuará visível até o documento ser anexado.
              </div>

              {mensagemTratativa && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200">
                  {mensagemTratativa}
                </div>
              )}

              <Button
                type="button"
                onClick={() => void salvarTratativa()}
                disabled={criarTratativaMutation.isPending || anexarDocumentoMutation.isPending}
                className="h-12 w-full bg-[#D4AF37] text-base font-black text-black hover:bg-[#E6C760]"
              >
                {criarTratativaMutation.isPending || anexarDocumentoMutation.isPending
                  ? "Salvando..."
                  : arquivoTratativa
                  ? "Registrar tratativa e anexar documento"
                  : "Registrar e manter documento pendente"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
