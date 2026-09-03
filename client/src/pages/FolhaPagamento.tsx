import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeDollarSign, ReceiptText, Sparkles, TrendingUp, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { readSheet } from "read-excel-file/browser";

import {
  calcularPremiacaoSupervisorGrupo,
  calcularPremiacaoSupervisorLoja,
  regraSupervisor,
  getSalarioFixoSupervisor,
  calcularPremiacaoEspecialFuncionario,
  getRegraVendedorMecanico,
  getRegraAlinhador,
  getRegraGerente,
} from "@/lib/regrasComissao";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeFolhaLinha,
  computeSupervisor,
  createParcelasVale,
  findMetaForFuncionario,
  getConsultorRegraTexto,
  getPremiacaoAutomaticaDetalhes,
  getRecepcaoConfig,
  SUPERVISOR_RECORDE_GRUPO,
  SUPERVISOR_SALARIO_FIXO,
  type FolhaMensal,
  type ValeItem,
} from "@/lib/payrollStore";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
];

const ACI_SUPERVISORA_SALARIO_FIXO = 2400;
const CONSULTOR_GRAVATAI_SALARIO_FIXO_PJ = 2000;

// ======================================================
// CONSULTOR DE VENDAS — SÃO LEOPOLDO / GRAVATAÍ
// Regra mensal exclusiva das lojas 6 e 7.
// - Base: R$ 7,00 por carro
// - 200 carros: + R$ 300,00
// - 250 carros: R$ 10,00 por carro + R$ 500,00 adicional
// - 300 carros: R$ 12,00 por carro + R$ 1.000,00 adicional
// As premiações são acumulativas.
// ======================================================
const LOJAS_CONSULTOR_SUL_MENSAL = new Set([6, 7]);

function ehConsultorSulMensal(lojaId: number | string) {
  return LOJAS_CONSULTOR_SUL_MENSAL.has(Number(lojaId));
}

function calcularConsultorSulMensal(totalCarrosBruto: number) {
  const totalCarros = Math.max(0, Number(totalCarrosBruto || 0));

  let valorPorCarro = 7;
  if (totalCarros >= 300) valorPorCarro = 12;
  else if (totalCarros >= 250) valorPorCarro = 10;

  const detalhesPremiacao: Array<{ descricao: string; valor: number }> = [];
  if (totalCarros >= 200) detalhesPremiacao.push({ descricao: "META 200 CARROS", valor: 300 });
  if (totalCarros >= 250) detalhesPremiacao.push({ descricao: "META 250 CARROS", valor: 500 });
  if (totalCarros >= 300) detalhesPremiacao.push({ descricao: "META 300 CARROS", valor: 1000 });

  const premiacao = detalhesPremiacao.reduce(
    (total, item) => total + Number(item.valor || 0),
    0
  );

  return {
    totalCarros,
    valorPorCarro,
    comissao: Number((totalCarros * valorPorCarro).toFixed(2)),
    premiacao,
    detalhesPremiacao,
  };
}

function getRegraConsultorSulTexto(totalCarrosBruto: number) {
  const calculado = calcularConsultorSulMensal(totalCarrosBruto);
  return `R$ ${calculado.valorPorCarro.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} / carro`;
}

function getValorPorCarroSupervisoraAci(totalCarrosBruto: number) {
  const totalCarros = Number(totalCarrosBruto || 0);

  if (totalCarros >= 4200) return 2;
  if (totalCarros >= 3200) return 1.5;
  if (totalCarros >= 3000) return 1.25;
  if (totalCarros >= 2700) return 1;
  if (totalCarros >= 2400) return 0.75;
  return 0.5;
}

function calcularSupervisoraAci(args: {
  joinville: number;
  blumenau: number;
  saoJose: number;
  florianopolis: number;
  gravatai: number;
  saoLeopoldo: number;
}) {
  const totalCarros =
    Number(args.joinville || 0) +
    Number(args.blumenau || 0) +
    Number(args.saoJose || 0) +
    Number(args.florianopolis || 0) +
    Number(args.gravatai || 0) +
    Number(args.saoLeopoldo || 0);

  const valorPorCarro = getValorPorCarroSupervisoraAci(totalCarros);
  const comissao = Number((totalCarros * valorPorCarro).toFixed(2));

  return {
    totalCarros,
    valorPorCarro,
    comissao,
    totalComFixo: Number((ACI_SUPERVISORA_SALARIO_FIXO + comissao).toFixed(2)),
  };
}

const FUNCOES_FUNCIONARIO = [
  { id: "mecanico", nome: "Mecânico" },
  { id: "vendedor", nome: "Vendedor" },
  { id: "consultor_vendas", nome: "Consultor de Vendas" },
  { id: "alinhador", nome: "Alinhador" },
  { id: "aux_alinhador", nome: "Aux. Alinhador" },
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "auxiliar_estoque", nome: "Auxiliar de Estoque" },
  { id: "lider_estoque", nome: "Líder de Estoque" },
  { id: "auxiliar_mecanico", nome: "Auxiliar de Mecânico" },
  { id: "auxiliar_limpeza", nome: "Auxiliar Limpeza" },
  { id: "caixa", nome: "Caixa" },
  { id: "caixa_lider", nome: "Caixa Líder" },
  { id: "administrativo", nome: "Administrativo" },
  { id: "gerente", nome: "Gerente" },
  { id: "supervisor", nome: "Supervisor" },
] as const;

type FuncaoFuncionarioId = (typeof FUNCOES_FUNCIONARIO)[number]["id"];
type TipoMetaFuncionario = "meta1" | "meta2" | "";

type FormEdicaoFuncionario = {
  nome: string;
  cpf: string;
  pix: string;
  dataNascimento: string;
  funcao: FuncaoFuncionarioId;
  tipoMeta: TipoMetaFuncionario;
  dataAdmissao: string;
};

function criarFormEdicaoFuncionarioVazio(): FormEdicaoFuncionario {
  return {
    nome: "",
    cpf: "",
    pix: "",
    dataNascimento: "",
    funcao: "mecanico",
    tipoMeta: "",
    dataAdmissao: "",
  };
}

function formatarDataInputFuncionario(value: unknown) {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const data = new Date(raw);
  if (Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}

function dataFuncionarioParaApi(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function labelFuncaoFuncionario(value: unknown, lojaId?: number) {
  const funcao = String(value || "");

  if (Number(lojaId) === 5 && funcao === "supervisor") {
    return "Supervisora de Consultor de Vendas - PJ";
  }

  return (
    FUNCOES_FUNCIONARIO.find((item) => item.id === funcao)?.nome ||
    textoOuNaoInformado(funcao)
  );
}


const ROTA_GESTAO_FUNCIONARIOS = "/funcionarios";
const IMPORT_ALIAS_STORAGE_KEY = "folha-importacao-aliases-v1";
const IMPORT_PENDENTE_STORAGE_KEY = "folha-importacao-pendente-v1";
const IMPORT_ADIANT_PENDENTE_STORAGE_KEY = "folha-importacao-adiant-pendente-v1";
const IMPORT_HOLERITE_PENDENTE_STORAGE_KEY = "folha-importacao-holerite-pendente-v1";
const CADASTRO_RETORNO_FOLHA_STORAGE_KEY = "folha-cadastro-retorno-v1";
const CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY = "folha-cadastro-concluido-v1";

type SemanaImportacao = 1 | 2 | 3 | 4 | 5;
type FuncaoImportacao = "vendedor" | "mecanico";
type StatusItemImportacao =
  | "ok"
  | "possivel"
  | "nao_cadastrado"
  | "ignorado";

type ItemRelatorioImportacao = {
  id: string;
  nomeRelatorio: string;
  funcaoRelatorio: FuncaoImportacao;
  valor: number;
  funcionarioId: number | null;
  funcionarioNome: string | null;
  status: StatusItemImportacao;
  candidatoId: number | null;
  candidatoNome: string | null;
  scoreCandidato: number;
};

type ImportacaoSemanaState = {
  open: boolean;
  semana: SemanaImportacao;
  etapa: "arquivo" | "lendo" | "conferencia" | "importando" | "sucesso";
  arquivoNome: string;
  periodo: string;
  cidadeRelatorio: string;
  itens: ItemRelatorioImportacao[];
  mensagem: string;
  erro: string;
};

function criarImportacaoInicial(semana: SemanaImportacao): ImportacaoSemanaState {
  return {
    open: true,
    semana,
    etapa: "arquivo",
    arquivoNome: "",
    periodo: "",
    cidadeRelatorio: "",
    itens: [],
    mensagem: "",
    erro: "",
  };
}


type StatusItemAdiantamento = "ok" | "possivel" | "nao_cadastrado" | "ignorado";

type ItemAdiantamentoPdf = {
  id: string;
  pagina: number;
  nomePdf: string;
  valorLiquido: number;
  funcionarioId: number | null;
  funcionarioNome: string | null;
  status: StatusItemAdiantamento;
  candidatoId: number | null;
  candidatoNome: string | null;
  scoreCandidato: number;
};

type ImportacaoAdiantamentoState = {
  open: boolean;
  etapa: "arquivo" | "lendo" | "conferencia" | "importando" | "sucesso";
  arquivoNome: string;
  competencia: string;
  competenciaMes: number | null;
  competenciaAno: number | null;
  cidadeRelatorio: string;
  itens: ItemAdiantamentoPdf[];
  mensagem: string;
  erro: string;
};

function criarImportacaoAdiantamentoInicial(): ImportacaoAdiantamentoState {
  return {
    open: true,
    etapa: "arquivo",
    arquivoNome: "",
    competencia: "",
    competenciaMes: null,
    competenciaAno: null,
    cidadeRelatorio: "",
    itens: [],
    mensagem: "",
    erro: "",
  };
}


type EmprestimoCltPdf = {
  contrato: string;
  valor: number;
  descricaoOriginal: string;
};

type ItemHoleritePdf = {
  id: string;
  pagina: number;
  nomePdf: string;
  inss: number;
  valorLiquido: number;
  emprestimos: EmprestimoCltPdf[];
  funcionarioId: number | null;
  funcionarioNome: string | null;
  status: StatusItemAdiantamento;
  candidatoId: number | null;
  candidatoNome: string | null;
  scoreCandidato: number;
};

type ImportacaoHoleriteState = {
  open: boolean;
  etapa: "arquivo" | "lendo" | "conferencia" | "importando" | "sucesso";
  arquivoNome: string;
  competencia: string;
  competenciaMes: number | null;
  competenciaAno: number | null;
  cidadeRelatorio: string;
  itens: ItemHoleritePdf[];
  mensagem: string;
  erro: string;
};

function criarImportacaoHoleriteInicial(): ImportacaoHoleriteState {
  return {
    open: true,
    etapa: "arquivo",
    arquivoNome: "",
    competencia: "",
    competenciaMes: null,
    competenciaAno: null,
    cidadeRelatorio: "",
    itens: [],
    mensagem: "",
    erro: "",
  };
}

const MESES_PDF: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function identificarCidadePdf(texto: string) {
  const normalizado = normalizarTextoImportacao(texto);

  if (normalizado.includes("SAO JOSE")) return "São José";
  if (normalizado.includes("JOINVILLE")) return "Joinville";
  if (normalizado.includes("BLUMENAU")) return "Blumenau";
  if (normalizado.includes("FLORIANOPOLIS")) return "Florianópolis";
  if (normalizado.includes("ACI PROMOCAO") || normalizado.includes("ACI PROMOCOES")) {
    return "ACI Promoções";
  }
  if (normalizado.includes("SAO LEOPOLDO")) return "São Leopoldo";
  if (normalizado.includes("GRAVATAI")) return "Gravataí";

  return "";
}

function identificarCompetenciaPdf(texto: string) {
  const normalizado = normalizarTextoImportacao(texto);
  const match = normalizado.match(
    /\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})\b/
  );

  if (!match) {
    return { label: "", mes: null as number | null, ano: null as number | null };
  }

  const mes = MESES_PDF[match[1]] || null;
  const ano = Number(match[2]) || null;
  const nomeMes = match[1].charAt(0) + match[1].slice(1).toLowerCase();

  return {
    label: `${nomeMes} de ${match[2]}`,
    mes,
    ano,
  };
}

function extrairValoresDinheiroLinha(linha: string) {
  return (linha.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [])
    .map((valor) => parseValorBR(valor))
    .filter((valor) => Number.isFinite(valor));
}

function encontrarNomeFuncionarioPdf(linhas: string[]) {
  for (const linha of linhas) {
    const match = linha.match(/^\s*\d+\s+(.+?)\s+\d{6}\s+\d+\s+\d+\s*$/);
    if (match?.[1]) {
      const nome = match[1].trim();
      if (nome && !/NOME DO FUNCIONARIO/i.test(nome)) return nome;
    }
  }

  const indiceCabecalho = linhas.findIndex((linha) =>
    normalizarTextoImportacao(linha).includes("NOME DO FUNCIONARIO")
  );

  if (indiceCabecalho >= 0) {
    for (let i = indiceCabecalho + 1; i <= indiceCabecalho + 4 && i < linhas.length; i += 1) {
      const match = linhas[i].match(/^\s*\d+\s+(.+?)\s+\d{6}(?:\s+.*)?$/);
      if (match?.[1]) return match[1].trim();
    }
  }

  return "";
}

function encontrarValorLiquidoPdf(linhas: string[]) {
  for (let i = 0; i < linhas.length; i += 1) {
    if (!normalizarTextoImportacao(linhas[i]).includes("VALOR LIQUIDO")) continue;

    for (let j = i; j <= i + 3 && j < linhas.length; j += 1) {
      const valores = extrairValoresDinheiroLinha(linhas[j]);
      if (valores.length > 0) {
        // Na linha do Valor Líquido o valor pago aparece à direita.
        return Number(valores[valores.length - 1] || 0);
      }
    }
  }

  // Fallback: Total de Vencimentos - Total de Descontos.
  for (let i = 0; i < linhas.length; i += 1) {
    const normalizada = normalizarTextoImportacao(linhas[i]);
    if (
      !normalizada.includes("TOTAL DE VENCIMENTOS") ||
      !normalizada.includes("TOTAL DE DESCONTOS")
    ) {
      continue;
    }

    for (let j = i + 1; j <= i + 3 && j < linhas.length; j += 1) {
      const valores = extrairValoresDinheiroLinha(linhas[j]);
      if (valores.length >= 2) {
        return Math.max(0, Number(valores[0] || 0) - Number(valores[1] || 0));
      }
    }
  }

  return null;
}

function agruparItensTextoPdf(items: any[]) {
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

  const grupos: Array<{ y: number; palavras: Array<{ texto: string; x: number }> }> = [];

  for (const palavra of palavras) {
    let grupo = grupos.find((item) => Math.abs(item.y - palavra.y) <= 2.5);

    if (!grupo) {
      grupo = { y: palavra.y, palavras: [] };
      grupos.push(grupo);
    }

    grupo.palavras.push({ texto: palavra.texto, x: palavra.x });
  }

  return grupos
    .sort((a, b) => b.y - a.y)
    .map((grupo) =>
      grupo.palavras
        .sort((a, b) => a.x - b.x)
        .map((palavra) => palavra.texto)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

async function lerPdfAdiantamento(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const documento = await pdfjs.getDocument({ data: bytes }).promise;

  const itensBrutos: Array<{
    pagina: number;
    nomePdf: string;
    valorLiquido: number;
  }> = [];

  let cidadeRelatorio = "";
  let competencia = "";
  let competenciaMes: number | null = null;
  let competenciaAno: number | null = null;
  let encontrouTipoAdiantamento = false;

  for (let paginaNumero = 1; paginaNumero <= documento.numPages; paginaNumero += 1) {
    const pagina = await documento.getPage(paginaNumero);
    const conteudo = await pagina.getTextContent();
    const linhas = agruparItensTextoPdf(conteudo.items as any[]);
    const textoPagina = linhas.join("\n");
    const textoPaginaNormalizado = normalizarTextoImportacao(textoPagina);
    if (textoPaginaNormalizado.includes("ADIANTAMENTO")) {
      encontrouTipoAdiantamento = true;
    }

    if (!cidadeRelatorio) cidadeRelatorio = identificarCidadePdf(textoPagina);

    if (!competencia) {
      const encontrada = identificarCompetenciaPdf(textoPagina);
      competencia = encontrada.label;
      competenciaMes = encontrada.mes;
      competenciaAno = encontrada.ano;
    }

    const nomePdf = encontrarNomeFuncionarioPdf(linhas);
    const valorLiquido = encontrarValorLiquidoPdf(linhas);

    if (nomePdf && valorLiquido !== null && Number.isFinite(valorLiquido)) {
      itensBrutos.push({
        pagina: paginaNumero,
        nomePdf,
        valorLiquido: Number(valorLiquido || 0),
      });
    }
  }

  if (!encontrouTipoAdiantamento) {
    throw new Error("Este PDF não parece ser um recibo de adiantamento.");
  }

  // Algumas folhas podem trazer a mesma pessoa mais de uma vez. Mantemos uma só.
  const unicos = new Map<string, (typeof itensBrutos)[number]>();
  for (const item of itensBrutos) {
    const chave = normalizarNomeImportacao(item.nomePdf);
    if (!unicos.has(chave)) unicos.set(chave, item);
  }

  return {
    cidadeRelatorio,
    competencia,
    competenciaMes,
    competenciaAno,
    itens: Array.from(unicos.values()),
  };
}


function encontrarInssHoleritePdf(linhas: string[]) {
  for (const linha of linhas) {
    const normalizada = normalizarTextoImportacao(linha);

    // O INSS principal do holerite usa o código 998.
    // Não somamos "INSS DIFERENÇA 13o SALARIO" nem outras rubricas.
    if (!/^\s*998\b/.test(normalizada)) continue;
    if (!normalizada.includes("I.N.S.S") && !normalizada.includes("INSS")) continue;

    const valores = extrairValoresDinheiroLinha(linha);
    if (valores.length > 0) {
      return Number(valores[valores.length - 1] || 0);
    }
  }

  return 0;
}

function encontrarEmprestimosCltPdf(linhas: string[]): EmprestimoCltPdf[] {
  const encontrados: EmprestimoCltPdf[] = [];

  for (const linha of linhas) {
    const normalizada = normalizarTextoImportacao(linha)
      .replace(/[º°]/g, " ")
      .replace(/\s+/g, " ");

    // Importar SOMENTE o desconto real do empréstimo.
    // Ignorar PROVISAO e ESTORNO.
    if (!normalizada.includes("DESC")) continue;
    if (!normalizada.includes("EMP")) continue;
    if (!normalizada.includes("CRED")) continue;
    if (!normalizada.includes("TRAB")) continue;
    if (normalizada.includes("PROVISAO") || normalizada.includes("ESTORNO")) continue;

    const valores = extrairValoresDinheiroLinha(linha);
    if (valores.length === 0) continue;

    const valor = Number(valores[valores.length - 1] || 0);
    if (!(valor > 0)) continue;

    const depoisTrabalho = normalizada.split("TRAB").slice(1).join("TRAB").trim();
    const semPrefixoNumero = depoisTrabalho
      .replace(/^(?:N|NO|NUMERO)\b[\s.:#-]*/i, "")
      .trim();

    const contratoMatch = semPrefixoNumero.match(/\b[A-Z0-9]{5,}\b/);
    const contrato = contratoMatch?.[0] || `PAG${encontrados.length + 1}`;

    encontrados.push({
      contrato,
      valor,
      descricaoOriginal: linha,
    });
  }

  // Evita duplicidade caso duas vias apareçam no mesmo agrupamento.
  const unicos = new Map<string, EmprestimoCltPdf>();
  for (const item of encontrados) {
    const chave = `${item.contrato}:${item.valor.toFixed(2)}`;
    if (!unicos.has(chave)) unicos.set(chave, item);
  }

  return Array.from(unicos.values());
}

function grupoIdEmprestimoCltPdf(args: {
  lojaId: number;
  funcionarioId: number;
  ano: number;
  mes: number;
  contrato: string;
}) {
  const contratoSeguro = normalizarTextoImportacao(args.contrato)
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 40) || "SEMCONTRATO";

  return `emprestimo-clt-pdf-${args.lojaId}-${args.funcionarioId}-${args.ano}-${args.mes}-${contratoSeguro}`;
}

async function lerPdfHoleriteMensal(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const documento = await pdfjs.getDocument({ data: bytes }).promise;

  const itensBrutos: Array<{
    pagina: number;
    nomePdf: string;
    inss: number;
    valorLiquido: number;
    emprestimos: EmprestimoCltPdf[];
  }> = [];

  let cidadeRelatorio = "";
  let competencia = "";
  let competenciaMes: number | null = null;
  let competenciaAno: number | null = null;
  let encontrouFolhaMensal = false;

  for (let paginaNumero = 1; paginaNumero <= documento.numPages; paginaNumero += 1) {
    const pagina = await documento.getPage(paginaNumero);
    const conteudo = await pagina.getTextContent();
    const linhas = agruparItensTextoPdf(conteudo.items as any[]);
    const textoPagina = linhas.join("\n");
    const textoPaginaNormalizado = normalizarTextoImportacao(textoPagina);

    if (textoPaginaNormalizado.includes("FOLHA MENSAL")) {
      encontrouFolhaMensal = true;
    }

    if (!cidadeRelatorio) cidadeRelatorio = identificarCidadePdf(textoPagina);

    if (!competencia) {
      const encontrada = identificarCompetenciaPdf(textoPagina);
      competencia = encontrada.label;
      competenciaMes = encontrada.mes;
      competenciaAno = encontrada.ano;
    }

    const nomePdf = encontrarNomeFuncionarioPdf(linhas);
    const valorLiquido = encontrarValorLiquidoPdf(linhas);
    const inss = encontrarInssHoleritePdf(linhas);
    const emprestimos = encontrarEmprestimosCltPdf(linhas);

    if (nomePdf && valorLiquido !== null && Number.isFinite(valorLiquido)) {
      itensBrutos.push({
        pagina: paginaNumero,
        nomePdf,
        inss: Number(inss || 0),
        valorLiquido: Number(valorLiquido || 0),
        emprestimos,
      });
    }
  }

  if (!encontrouFolhaMensal) {
    throw new Error(
      "Este PDF não parece ser uma Folha Mensal. Se for o recibo do dia 20, use a coluna Adiant."
    );
  }

  const unicos = new Map<string, (typeof itensBrutos)[number]>();

  for (const item of itensBrutos) {
    const chave = normalizarNomeImportacao(item.nomePdf);

    if (!unicos.has(chave)) {
      unicos.set(chave, item);
      continue;
    }

    // Caso uma segunda via traga algum detalhe que a primeira não trouxe,
    // preservamos a versão mais completa sem somar valores duplicados.
    const atual = unicos.get(chave)!;
    unicos.set(chave, {
      ...atual,
      inss: atual.inss || item.inss,
      valorLiquido: atual.valorLiquido || item.valorLiquido,
      emprestimos:
        atual.emprestimos.length >= item.emprestimos.length
          ? atual.emprestimos
          : item.emprestimos,
    });
  }

  return {
    cidadeRelatorio,
    competencia,
    competenciaMes,
    competenciaAno,
    itens: Array.from(unicos.values()),
  };
}

function normalizarTextoImportacao(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function deveImportarEmprestimoClt(linha: {
  funcao?: string | null;
  nome?: string | null;
  loja_id?: number | string | null;
}) {
  const funcao = String(linha?.funcao || "");

  // Regra de negócio do Empréstimo CLT importado pela Folha Mensal:
  // - todos os vendedores;
  // - todos os mecânicos;
  // - todos os gerentes;
  // - alinhador: somente Milton de Blumenau.
  if (funcao === "vendedor" || funcao === "mecanico" || funcao === "gerente") return true;
  if (funcao !== "alinhador") return false;

  const nomeNormalizado = normalizarTextoImportacao(linha?.nome || "");
  return Number(linha?.loja_id || 0) === 2 && nomeNormalizado.includes("MILTON");
}

function normalizarNomeImportacao(value: unknown) {
  const ignorar = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

  return normalizarTextoImportacao(value)
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !ignorar.has(token))
    .join(" ");
}

function scoreNomesImportacao(a: string, b: string) {
  const aa = new Set(normalizarNomeImportacao(a).split(/\s+/).filter(Boolean));
  const bb = new Set(normalizarNomeImportacao(b).split(/\s+/).filter(Boolean));

  if (aa.size === 0 || bb.size === 0) return 0;

  let intersecao = 0;
  for (const token of aa) {
    if (bb.has(token)) intersecao += 1;
  }

  const uniao = new Set([...aa, ...bb]).size;
  return uniao > 0 ? intersecao / uniao : 0;
}

function lerAliasesImportacao(): Record<string, number> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(IMPORT_ALIAS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvarAliasImportacao(lojaId: number, nomeRelatorio: string, funcionarioId: number) {
  if (typeof window === "undefined") return;

  const aliases = lerAliasesImportacao();
  aliases[`${lojaId}:${normalizarTextoImportacao(nomeRelatorio)}`] = funcionarioId;
  window.localStorage.setItem(IMPORT_ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}

function extrairDadosRelatorioSemanal(rows: unknown[][]) {
  const itens: Array<{
    nomeRelatorio: string;
    funcaoRelatorio: FuncaoImportacao;
    valor: number;
  }> = [];

  let cidadeRelatorio = "";
  let periodo = "";

  for (const row of rows.slice(0, 10)) {
    for (const cell of row) {
      const texto = String(cell ?? "").trim();
      if (!texto) continue;

      if (!cidadeRelatorio && /METAS POR COLABORADOR/i.test(texto)) {
        const match = texto.match(/^F\.\s*(.*?)\s*-\s*METAS POR COLABORADOR/i);
        if (match?.[1]) cidadeRelatorio = match[1].trim();
      }

      if (!periodo && /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(texto)) {
        periodo = texto.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/)?.[0] || "";
      }
    }
  }

  let bloco: FuncaoImportacao | "ignorar" | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const textos = row.map((cell) => normalizarTextoImportacao(cell));
    const primeiroTexto = textos.find(Boolean) || "";

    if (primeiroTexto === "VENDA") {
      bloco = "vendedor";
      continue;
    }

    if (primeiroTexto === "MECANICA") {
      bloco = "mecanico";
      continue;
    }

    if (primeiroTexto === "ALINHAMENTO") {
      bloco = "ignorar";
      continue;
    }

    if (bloco !== "vendedor" && bloco !== "mecanico") continue;

    const indiceColaborador = textos.findIndex((texto) => texto === "COLABORADOR");
    const indiceLiquidezSemPneu = textos.findIndex((texto) => {
      const limpo = texto.replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
      return limpo === "LIQ S PNEUS" || limpo.includes("LIQ S PNEUS");
    });

    if (indiceColaborador < 0 || indiceLiquidezSemPneu < 0) continue;

    for (let j = i + 1; j < rows.length; j += 1) {
      const dataRow = rows[j] || [];
      const nome = String(dataRow[indiceColaborador] ?? "").trim();
      const nomeNormalizado = normalizarTextoImportacao(nome);

      if (!nomeNormalizado) break;
      if (nomeNormalizado.startsWith("TOTAIS")) break;
      if (["VENDA", "MECANICA", "ALINHAMENTO"].includes(nomeNormalizado)) break;

      const valorRaw = dataRow[indiceLiquidezSemPneu];
      const valor = typeof valorRaw === "number"
        ? valorRaw
        : parseValorBR(String(valorRaw ?? "0"));

      if (!nome || !Number.isFinite(Number(valor))) continue;

      itens.push({
        nomeRelatorio: nome,
        funcaoRelatorio: bloco,
        valor: Number(valor || 0),
      });
    }
  }

  return {
    cidadeRelatorio,
    periodo,
    itens,
  };
}

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarMoeda(value: number) {
  return `R$ ${money(Number(value || 0))}`;
}

function parseValorBR(value: string) {
  const raw = String(value || "").trim();

  if (!raw) return 0;

  const cleaned = raw.replace(/[R$\s]/g, "");

  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return Number(cleaned);
}

function formatarDataBR(value: unknown) {
  if (!value) return "Não informado";

  const raw = String(value).trim();
  if (!raw) return "Não informado";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  const data = new Date(raw);
  if (Number.isNaN(data.getTime())) return raw;

  return data.toLocaleDateString("pt-BR");
}

function formatarCpf(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return String(value || "Não informado");

  return digits.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4"
  );
}

function textoOuNaoInformado(value: unknown) {
  const texto = String(value ?? "").trim();
  return texto || "Não informado";
}

function calcularBoletoAjustado(args: {
  quadrante: QuadranteKey;
  funcao: string;
  lojaId: number;
  funcionarioNome: string;
  totalComissao: number;
  premiacao: number;
  vale: number;
  aluguel: number;
  inss: number;
  adiant: number;
  holerite: number;
  descontoFolhaProporcional?: number | null;
  boletoOriginal: number;
}) {
  const totalComissao = Number(args.totalComissao || 0);
  const premiacao = Number(args.premiacao || 0);
  const vale = Number(args.vale || 0);
  const aluguel = Number(args.aluguel || 0);
  const inss = Number(args.inss || 0);
  const adiant = Number(args.adiant || 0);
  const holerite = Number(args.holerite || 0);

  if (args.quadrante === "salario_fixo") {
  return premiacao - vale;
}

  if (args.quadrante === "recepcao") {
    // JOINVILLE:
    // Recepção vai para boleto somente com PREMIAÇÃO - VALE.
    // A comissão da recepção fica registrada na folha, mas não compõe o boleto.
    if (Number(args.lojaId) === 1) {
      return premiacao - vale;
    }

    // Demais lojas mantêm a regra já validada.
    return totalComissao + premiacao - vale;
  }

  if (args.quadrante === "consultor_vendas") {
    return totalComissao + premiacao - vale - aluguel;
  }

  if (args.quadrante === "alinhador") {
    const nomeNormalizado = String(args.funcionarioNome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

    const ehMiltonBlumenau =
      Number(args.lojaId) === 2 &&
      nomeNormalizado.includes("MILTON");

    // BLUMENAU - MILTON:
    // além de vale e aluguel, também desconta adiantamento.
    if (ehMiltonBlumenau) {
      return (
        totalComissao +
        premiacao -
        vale -
        aluguel -
        adiant
      );
    }

    return totalComissao + premiacao - vale - aluguel;
  }

if (
  args.quadrante === "consultor_vendas_mensal"
) {
  // GRAVATAÍ (loja 7): as consultoras são PJ e possuem fixo mensal de R$ 2.000,00.
  // São Leopoldo mantém a regra anterior, sem fixo adicional.
  const salarioFixoPj =
    Number(args.lojaId) === 7 ? CONSULTOR_GRAVATAI_SALARIO_FIXO_PJ : 0;

  return (
    salarioFixoPj +
    totalComissao +
    premiacao -
    vale -
    aluguel
  );
}

if (args.quadrante === "supervisora_consultores_pj") {
  return (
    ACI_SUPERVISORA_SALARIO_FIXO +
    totalComissao +
    premiacao -
    vale -
    aluguel -
    adiant
  );
}

if (args.quadrante === "supervisor_pj") {
  return (
    getSalarioFixoSupervisor() +
    totalComissao +
    premiacao -
    vale -
    aluguel -
    adiant
  );
}

  if (
    args.quadrante === "comissao_semanal" ||
    args.quadrante === "comissao_mensal" ||
    args.quadrante === "gerente"
  ) {
    const descontoFolha =
      args.descontoFolhaProporcional !== null &&
      args.descontoFolhaProporcional !== undefined
        ? Number(args.descontoFolhaProporcional || 0)
        : inss + adiant + holerite;

    return (
      totalComissao +
      premiacao -
      vale -
      aluguel -
      descontoFolha
    );
  }

  return Number(args.boletoOriginal || 0);
}

type QuadranteKey =
  | "gerente"
  | "comissao_semanal"
  | "consultor_vendas"
  | "consultor_vendas_mensal"
  | "comissao_mensal"
  | "alinhador"
  | "recepcao"
  | "supervisor_pj"
  | "supervisora_consultores_pj"
  | "salario_fixo";

type FuncaoSemanaComissao = "vendedor" | "mecanico";

type ComponenteFuncaoSemana = {
  funcao: FuncaoSemanaComissao;
  liquidez: number;
  percentual: number;
  comissao: number;
};

type TrocaFuncaoMes = {
  id: number;
  funcionarioId: number;
  lojaId: number;
  funcaoAnterior: string;
  funcaoNova: string;
  tipoMetaAnterior?: string | null;
  tipoMetaNovo?: string | null;
  dataMudanca: string | Date;
  quantidadeAnterior1: number;
  quantidadeAnterior2: number;
  valorFixoAnterior: number;
  usuarioNome?: string | null;
};

type SemanaComissaoVisual = 1 | 2 | 3 | 4 | 5;

type LinhaComQuadrante = FolhaMensal & {
  quadrante: QuadranteKey;
  funcaoSemana1?: FuncaoSemanaComissao | null;
  funcaoSemana2?: FuncaoSemanaComissao | null;
  funcaoSemana3?: FuncaoSemanaComissao | null;
  funcaoSemana4?: FuncaoSemanaComissao | null;
  funcaoSemana5?: FuncaoSemanaComissao | null;
  composicaoSemana1?: ComponenteFuncaoSemana[] | null;
  composicaoSemana2?: ComponenteFuncaoSemana[] | null;
  composicaoSemana3?: ComponenteFuncaoSemana[] | null;
  composicaoSemana4?: ComponenteFuncaoSemana[] | null;
  composicaoSemana5?: ComponenteFuncaoSemana[] | null;
  sem5Extra?: number;
  perc5Extra?: number;
  com5Extra?: number;
  percManual5Extra?: number | null;
  trocaFuncaoMes?: TrocaFuncaoMes | null;
  comissaoFuncaoAnterior?: number;
  descontoFolhaProporcional?: number | null;
  proporcaoNovaFuncao?: number | null;
  diasFuncaoAnterior?: number | null;
  diasFuncaoNova?: number | null;
};

function campoLiquidezSemanaVisual(semana: SemanaComissaoVisual) {
  return semana === 5 ? "sem5Extra" : `sem${semana}`;
}

function campoPercentualSemanaVisual(semana: SemanaComissaoVisual) {
  return semana === 5 ? "perc5Extra" : `perc${semana}`;
}

function campoComissaoSemanaVisual(semana: SemanaComissaoVisual) {
  return semana === 5 ? "com5Extra" : `com${semana}`;
}

function campoPercentualManualSemanaVisual(semana: SemanaComissaoVisual) {
  return semana === 5 ? "percManual5Extra" : `percManual${semana}`;
}

function semanaPersistenciaVisual(semana: SemanaComissaoVisual) {
  // semana=5 e semana=6 já são usadas internamente por gerente/ACI.
  // A quinta semana real da folha é persistida como semana=7.
  return semana === 5 ? 7 : semana;
}

function getComposicaoSemana(
  linha: LinhaComQuadrante | FolhaMensal,
  semana: SemanaComissaoVisual
): ComponenteFuncaoSemana[] {
  const raw = (linha as any)[`composicaoSemana${semana}`];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (item: any) =>
        (item?.funcao === "vendedor" || item?.funcao === "mecanico") &&
        Number(item?.liquidez || 0) >= 0
    );
  }

  const liquidez = Number((linha as any)[campoLiquidezSemanaVisual(semana)] || 0);
  const funcao = getFuncaoSemanaEfetiva(linha, semana);
  if (!funcao || liquidez <= 0) return [];

  return [{
    funcao,
    liquidez,
    percentual: Number((linha as any)[campoPercentualSemanaVisual(semana)] || 0),
    comissao: Number((linha as any)[campoComissaoSemanaVisual(semana)] || 0),
  }];
}

function getFuncaoSemanaEfetiva(
  linha: LinhaComQuadrante | FolhaMensal,
  semana: SemanaComissaoVisual
): FuncaoSemanaComissao | null {
  const historica = (linha as any)[`funcaoSemana${semana}`];
  if (historica === "vendedor" || historica === "mecanico") return historica;

  const atual = String((linha as any).funcao || "").toLowerCase();
  if (atual === "vendedor" || atual === "mecanico") {
    return atual as FuncaoSemanaComissao;
  }

  return null;
}

function getFuncoesComissaoAtivasNoMes(
  linha: LinhaComQuadrante
): FuncaoSemanaComissao[] {
  const funcoes = ([1, 2, 3, 4, 5] as const).flatMap((semana) =>
    getComposicaoSemana(linha, semana).map((item) => item.funcao)
  );

  return Array.from(new Set(funcoes));
}

function temMudancaFuncaoSemanalNoMes(linha: LinhaComQuadrante) {
  return getFuncoesComissaoAtivasNoMes(linha).length > 1;
}

function temMudancaFuncaoNoMes(linha: LinhaComQuadrante) {
  return Boolean(linha.trocaFuncaoMes) || temMudancaFuncaoSemanalNoMes(linha);
}

function labelFuncaoSemana(funcao: FuncaoSemanaComissao | null) {
  if (funcao === "mecanico") return "Mecânico";
  if (funcao === "vendedor") return "Vendedor";
  return "";
}

function getDescricaoFuncaoNoMes(linha: LinhaComQuadrante) {
  if (linha.trocaFuncaoMes) {
    return `${labelFuncaoFuncionario(
      linha.trocaFuncaoMes.funcaoAnterior,
      linha.loja_id
    )} → ${labelFuncaoFuncionario(
      linha.trocaFuncaoMes.funcaoNova,
      linha.loja_id
    )}`;
  }

  const diferentes = getFuncoesComissaoAtivasNoMes(linha);

  if (diferentes.length === 0) return labelFuncaoFuncionario(linha.funcao, linha.loja_id);
  if (diferentes.length === 1) return labelFuncaoSemana(diferentes[0]);

  return diferentes.map((funcao) => labelFuncaoSemana(funcao)).join(" + ");
}

function calcularProporcaoTrocaFuncao(
  dataMudanca: string | Date,
  ano: number,
  mes: number
) {
  const raw =
    dataMudanca instanceof Date
      ? dataMudanca.toISOString().slice(0, 10)
      : String(dataMudanca || "").slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const anoMudanca = Number(match[1]);
  const mesMudanca = Number(match[2]);
  const diaMudanca = Number(match[3]);
  if (anoMudanca !== ano || mesMudanca !== mes) return null;

  const totalDias = new Date(ano, mes, 0).getDate();
  const diaSeguro = Math.min(Math.max(1, diaMudanca), totalDias);
  const diasFuncaoAnterior = Math.max(0, diaSeguro - 1);
  const diasFuncaoNova = Math.max(0, totalDias - diaSeguro + 1);
  const proporcaoNovaFuncao = totalDias > 0 ? diasFuncaoNova / totalDias : 1;

  return {
    totalDias,
    diasFuncaoAnterior,
    diasFuncaoNova,
    proporcaoNovaFuncao,
  };
}

function funcaoAnteriorUsaFolhaFixa(funcao: string, lojaId: number, ano: number, mes: number) {
  const quadranteAnterior = getQuadrante(lojaId, funcao, ano, mes, null);
  return quadranteAnterior === "salario_fixo" || quadranteAnterior === "recepcao";
}

function quadranteDescontaFolhaCompleta(quadrante: QuadranteKey) {
  return (
    quadrante === "comissao_semanal" ||
    quadrante === "comissao_mensal" ||
    quadrante === "gerente"
  );
}


type CellEditorState = {
  open: boolean;
  funcionarioId: number | null;
  campo: keyof FolhaMensal | null;
  label: string;
  mode: "money" | "number";
  value: string;
};

type PremioEditorState = {
  open: boolean;
  funcionarioId: number | null;
  descricao: string;
  valor: string;
};

type ObsEditorState = {
  open: boolean;
  funcionarioId: number | null;
  novaObs: string;
};

type ValeEditorState = {
  open: boolean;
  funcionarioId: number | null;
  descricao: string;
  valor: string;
  parcelas: string;
};

type NegativoEditorState = {
  open: boolean;
  linha: LinhaComQuadrante | null;
};

type RegraSemanaEditorState = {
  open: boolean;
  linha: LinhaComQuadrante | null;
  semana: 1 | 2 | 3 | 4 | 5 | 7 | null;
};

type TransicaoFuncaoEditorState = {
  open: boolean;
  linha: LinhaComQuadrante | null;
  quantidadeAnterior1: string;
  quantidadeAnterior2: string;
  valorFixoAnterior: string;
  corrigindoData: boolean;
  novaDataMudanca: string;
};

function usaMetaSemanal(lojaId: number, ano: number, mes: number) {
  // Joinville, Blumenau, São Leopoldo e Gravataí sempre semanal
  if ([1, 2, 6, 7].includes(lojaId)) return true;

  // São José semanal a partir de maio/2026
  if (lojaId === 3) {
    if (ano > 2026) return true;
    if (ano === 2026 && mes >= 5) return true;
    return false;
  }

  // Florianópolis permanece mensal
  return false;
}

function usaMetaMensal(lojaId: number, ano: number, mes: number) {
  return !usaMetaSemanal(lojaId, ano, mes);
}

function getQuadrante(
  lojaId: number,
  funcao: string,
  ano: number,
  mes: number,
  tipoMeta?: string | null
): QuadranteKey {
  const semanal = usaMetaSemanal(lojaId, ano, mes);
  const mensal = usaMetaMensal(lojaId, ano, mes);

  if (funcao === "supervisor" && lojaId === 5) {
    return "supervisora_consultores_pj";
  }

  if (funcao === "supervisor") return "supervisor_pj";
  if (funcao === "gerente") {
  return "gerente";
}
  if (funcao === "consultor_vendas") {
  // ACI e as lojas 6/7 usam consultor mensal.
  if (lojaId === 5 || ehConsultorSulMensal(lojaId) || tipoMeta === "meta2") {
    return "consultor_vendas_mensal";
  }

  return "consultor_vendas";
}
  if (funcao === "alinhador" || funcao === "aux_alinhador") return "alinhador";
  if (funcao === "recepcionista") return "recepcao";

  if (semanal && (funcao === "vendedor" || funcao === "mecanico")) {
    return "comissao_semanal";
  }

  if (mensal && (funcao === "vendedor" || funcao === "mecanico")) {
    return "comissao_mensal";
  }

  return "salario_fixo";
}

function getQuadranteTitulo(key: QuadranteKey) {
  switch (key) {
    case "gerente":
      return "Gerente";
    case "comissao_semanal":
  return "Vendedor e Mecânico";
    case "consultor_vendas":
      return "Consultor de Vendas";
    case "comissao_mensal":
  return "Vendedor e Mecânico";
    case "alinhador":
      return "Alinhador";
    case "recepcao":
      return "Recepção";
      case "consultor_vendas_mensal":
  return "Consultor de Vendas Mensal";
    case "supervisor_pj":
      return "Supervisor - Contrato PJ";
    case "supervisora_consultores_pj":
      return "Supervisora de Consultor de Vendas - PJ";
    case "salario_fixo":
      return "Salário Fixo";
    default:
      return key;
  }
}

function getQuadranteDescricao(key: QuadranteKey) {
  switch (key) {
    case "gerente":
      return "Funções de gerência";
    case "comissao_semanal":
      return "Vendedores e mecânicos com cálculo semanal";
    case "consultor_vendas":
      return "Consultores por carros na semana";
    case "comissao_mensal":
  return "Vendedores e mecânicos com cálculo mensal";
    case "alinhador":
      return "Alinhador e auxiliar de alinhador com cálculo mensal";
    case "recepcao":
      return "Recepção";
      case "consultor_vendas_mensal":
  return "Consultores por meta mensal";
    case "supervisor_pj":
      return "Supervisor com cálculo por liquidez das 4 lojas";
    case "supervisora_consultores_pj":
      return "Fixo de R$ 2.400,00 + comissão pelo total de carros das 6 cidades";
    case "salario_fixo":
      return "Funções sem quadrante específico";
    default:
      return "";
  }
}

function buildEmptyLine(args: {
  ano: number;
  mes: number;
  loja_id: number;
  funcionarioId: number;
  nome: string;
  funcao: string;
  tipoMeta?: "meta1" | "meta2" | "";
  regraMeta: string;
}): FolhaMensal {
  return {
    id: `${args.ano}-${args.mes}-${args.loja_id}-${args.funcionarioId}`,
    ano: args.ano,
    mes: args.mes,
    loja_id: args.loja_id,
    funcionarioId: args.funcionarioId,
    nome: args.nome,
    funcao: args.funcao,
    tipoMeta: args.tipoMeta,
    regraMeta: args.regraMeta,

    sem1: 0,
    perc1: 0,
    com1: 0,

    sem2: 0,
    perc2: 0,
    com2: 0,

    sem3: 0,
    perc3: 0,
    com3: 0,

    sem4: 0,
    perc4: 0,
    com4: 0,

    totalLiquidez: 0,
    totalComissao: 0,

    premiacoesManuais: [],
    premiacao: 0,

    vales: [],
    vale: 0,

    aluguel: 0,
    inss: 0,
    adiant: 0,
    holerite: 0,

    observacoes: [],

    boleto: 0,
  };
}

function exportBoletosCsv(rows: Array<{
  nome: string;
  cpf: string;
  pix: string;
  valor: number;
}>) {
  const cabecalho = [
    "Documento",
    "Nome",
    "Valor",
    "Banco",
    "Agencia com digito",
    "Conta com digito",
    "Conta Poupanca",
    "Chave Pix",
    "Observacao",
  ];

  const formatarCelulaCsv = (valor: string) => {
    const texto = String(valor ?? "");
    if (/[",\r\n]/.test(texto)) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  };

  const lines = rows.map((r) => {
    const cpf = String(r.cpf || "").replace(/\D/g, "");
    const nome = String(r.nome || "").trim();

    const valorNumero = Math.round(Number(r.valor || 0) * 100) / 100;
    const valor = Number.isInteger(valorNumero)
      ? String(valorNumero)
      : valorNumero.toFixed(2);

    const pixOriginal = String(r.pix || cpf).trim();
    const pixSomenteNumeros = pixOriginal.replace(/\D/g, "");
    const pix =
      pixSomenteNumeros.length === 11 && /^[\d.\-\s]+$/.test(pixOriginal)
        ? pixSomenteNumeros
        : pixOriginal;

    // O arquivo bancário exige o valor sem aspas e com ponto decimal quando
    // houver centavos (ex.: 1544.44). Valores inteiros permanecem sem .00.
    // Por isso o campo Valor não passa pelo escape padrão de CSV.
    return [
      formatarCelulaCsv(cpf),
      formatarCelulaCsv(nome),
      valor,
      "",
      "",
      "",
      "",
      formatarCelulaCsv(pix),
      "",
    ].join(",");
  });

  const csv = [cabecalho.join(","), ...lines].join("\r\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boletos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function TabelaQuadrante({
  titulo,
  descricao,
  linhas,
  quadrante,
  onOpenCellEditor,
  onOpenPremioEditor,
  onOpenObsEditor,
  onOpenValeEditor,
  onOpenNegativoEditor,
  onOpenRegraSemanaEditor,
  onOpenFuncionarioDetalhe,
  onOpenTransicaoFuncao,
  onOpenImportacaoSemana,
  onOpenImportacaoAdiantamento,
  onOpenImportacaoHolerite,
  onUpdateComposicaoSemanaPercentual,
  sem5Ativa,
}: {
  titulo: string;
  descricao: string;
  linhas: LinhaComQuadrante[];
  quadrante: QuadranteKey;
  onOpenCellEditor: (
    linha: LinhaComQuadrante,
    campo: keyof FolhaMensal,
    label: string,
    mode: "money" | "number"
  ) => void;
  onOpenPremioEditor: (linha: LinhaComQuadrante) => void;
  onOpenObsEditor: (linha: LinhaComQuadrante) => void;
  onOpenValeEditor: (linha: LinhaComQuadrante) => void;
  onOpenNegativoEditor: (linha: LinhaComQuadrante) => void;
  onOpenFuncionarioDetalhe: (linha: LinhaComQuadrante) => void;
  onOpenTransicaoFuncao: (linha: LinhaComQuadrante) => void;
  onOpenRegraSemanaEditor: (
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4 | 5 | 7
  ) => void;
  onOpenImportacaoSemana: (semana: SemanaImportacao) => void;
  onOpenImportacaoAdiantamento: () => void;
  onOpenImportacaoHolerite: () => void;
  onUpdateComposicaoSemanaPercentual: (
    linha: LinhaComQuadrante,
    semana: SemanaComissaoVisual,
    funcao: FuncaoSemanaComissao,
    percentualManual: number | null
  ) => Promise<LinhaComQuadrante | null>;
  sem5Ativa: boolean;
}) {
  const [semanaMistaDetalhe, setSemanaMistaDetalhe] = useState<{
    linha: LinhaComQuadrante;
    semana: SemanaComissaoVisual;
  } | null>(null);
  const semanaMistaAbertaRef = useRef(false);

  function abrirSemanaMistaDetalhe(
    linha: LinhaComQuadrante,
    semana: SemanaComissaoVisual
  ) {
    semanaMistaAbertaRef.current = true;
    setSemanaMistaDetalhe({ linha, semana });
  }

  function fecharSemanaMistaDetalhe() {
    // Marca como fechada antes de limpar o state. Isso impede que um onBlur
    // assíncrono do campo de percentual reabra o modal depois do clique em Fechar.
    semanaMistaAbertaRef.current = false;
    setSemanaMistaDetalhe(null);
  }

  if (linhas.length === 0) return null;

  const isSalarioFixo = quadrante === "salario_fixo";
  const temTransicaoNoQuadrante = linhas.some((linha) => Boolean(linha.trocaFuncaoMes));
  const isRecepcao = quadrante === "recepcao";
  const isSupervisor = quadrante === "supervisor_pj";
  const isSupervisoraAci = quadrante === "supervisora_consultores_pj";
  const isPj = isSupervisor || isSupervisoraAci;
  const recepcaoCompleta =
    isRecepcao && (linhas[0]?.loja_id === 3 || linhas[0]?.loja_id === 4);

    const isConsultor =
  quadrante === "consultor_vendas" ||
  quadrante === "consultor_vendas_mensal";

const isConsultorMeta2 =
  quadrante === "consultor_vendas_mensal";

const isConsultorGravataiPj =
  isConsultorMeta2 && Number(linhas[0]?.loja_id) === 7;

  const isGerente =
  quadrante === "gerente";

const isGerenteSaoJoseSemanal =
  isGerente &&
  (linhas[0]?.loja_id === 3 || linhas[0]?.loja_id === 6);

const isMensalUnico =
  (quadrante === "comissao_mensal" && !isConsultorMeta2) ||
  quadrante === "alinhador" ||
  quadrante === "gerente";

  function getRegraConsultorTexto(linha: LinhaComQuadrante, carrosSemana: number) {
    if (ehConsultorSulMensal(linha.loja_id)) {
      return getRegraConsultorSulTexto(carrosSemana);
    }

    return getConsultorRegraTexto({
      cidade: linha.loja_id.toString(),
      tipoMeta: linha.tipoMeta,
      carrosSemana,
    });
  }

  function renderEditButton(
    linha: LinhaComQuadrante,
    campo: keyof FolhaMensal,
    label: string,
    mode: "money" | "number"
  ) {
    const rawValue = Number(linha[campo] || 0);
    const text =
      mode === "money" ? `R$ ${money(rawValue)}` : rawValue.toLocaleString("pt-BR");

    const campoTexto = String(campo);
    const campoSemanaMatch = campoTexto.match(/^sem([1-4])$/);
    const semanaCampo: SemanaComissaoVisual | null =
      campoTexto === "sem5Extra"
        ? 5
        : campoSemanaMatch
        ? (Number(campoSemanaMatch[1]) as 1 | 2 | 3 | 4)
        : null;
    const composicaoSemana = semanaCampo
      ? getComposicaoSemana(linha, semanaCampo)
      : [];
    const semanaMista = composicaoSemana.length > 1;
    const mudouFuncao = semanaCampo ? temMudancaFuncaoSemanalNoMes(linha) : false;
    const funcaoSemana = semanaCampo
      ? getFuncaoSemanaEfetiva(linha, semanaCampo)
      : null;

    const classeMudanca = semanaMista
      ? "border-orange-400/65 bg-orange-500/[0.12] shadow-[inset_0_0_24px_rgba(251,146,60,0.07)]"
      : mudouFuncao && funcaoSemana === "mecanico"
        ? "border-orange-400/55 bg-orange-500/[0.10] shadow-[inset_0_0_22px_rgba(251,146,60,0.05)]"
        : mudouFuncao && funcaoSemana === "vendedor"
        ? "border-[#D4AF37]/55 bg-[#D4AF37]/[0.09] shadow-[inset_0_0_22px_rgba(212,175,55,0.05)]"
        : "border-white/[0.07] bg-[#101010]";

    return (
      <button
        type="button"
        onClick={() =>
          semanaMista && semanaCampo
            ? abrirSemanaMistaDetalhe(linha, semanaCampo)
            : onOpenCellEditor(linha, campo, label, mode)
        }
        title={
          semanaMista
            ? `SEM${semanaCampo} com ${composicaoSemana.length} funções • clique para ver o detalhamento`
            : mudouFuncao && funcaoSemana
            ? `${labelFuncaoSemana(funcaoSemana)} nesta semana • houve mudança de função no mês`
            : undefined
        }
        className={`w-full flex min-h-[42px] flex-col items-end justify-center whitespace-nowrap rounded-xl border px-3 py-2 font-bold shadow-inner shadow-black/30 transition-all duration-200 hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/[0.045] hover:shadow-[0_0_20px_rgba(212,175,55,0.06)] ${classeMudanca} ${
  rawValue > 0
    ? ["sem1", "sem2", "sem3", "sem4", "sem5Extra", "premiacao"].includes(String(campo))
      ? "text-green-400"
      : ["vale", "aluguel", "inss", "adiant", "holerite"].includes(String(campo))
        ? "text-red-400"
        : "text-white"
    : "text-white"
}`}
      >
        <span>{text}</span>
        {semanaMista ? (
          <span className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.09em] text-orange-300">
            {composicaoSemana.length} funções
          </span>
        ) : mudouFuncao && funcaoSemana ? (
          <span
            className={`mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.09em] ${
              funcaoSemana === "mecanico" ? "text-orange-300" : "text-[#F2D675]"
            }`}
          >
            {labelFuncaoSemana(funcaoSemana)}
          </span>
        ) : null}
      </button>
    );
  }

  function renderRegraButton(
    linha: LinhaComQuadrante,
    semana: SemanaComissaoVisual
  ) {
    const composicaoSemana = getComposicaoSemana(linha, semana);
    if (composicaoSemana.length > 1) {
      return (
        <button
          type="button"
          onClick={() => abrirSemanaMistaDetalhe(linha, semana)}
          className="font-bold text-orange-300 hover:text-orange-200 hover:underline underline-offset-4 whitespace-nowrap"
          title="Clique para ver a comissão calculada separadamente por função"
        >
          {composicaoSemana.length} funções
        </button>
      );
    }

    if (isConsultorMeta2) {
      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, 1)}
          className="text-yellow-300 font-semibold whitespace-nowrap hover:underline underline-offset-4"
          title="Clique para visualizar a meta do consultor"
        >
          {getRegraConsultorTexto(linha, Number(linha.sem1 || 0))}
        </button>
      );
    }

    const manualValue = Number(
      (linha as any)[campoPercentualManualSemanaVisual(semana)] || 0
    );
    const funcaoHistoricaSemana = getFuncaoSemanaEfetiva(linha, semana);
    const funcaoRegra =
      funcaoHistoricaSemana ||
      (linha.funcao === "gerente" &&
      (linha.loja_id === 3 || linha.loja_id === 6)
        ? "vendedor"
        : linha.funcao);

    const meta = findMetaForFuncionario({
      funcionarioNome: linha.nome,
      funcao: funcaoRegra,
      cidade: linha.loja_id.toString(),
      tipoMeta: linha.tipoMeta,
    });

    const liquidezSemana = Number(
      (linha as any)[campoLiquidezSemanaVisual(semana)] || 0
    );

    const calculadoOriginal = computeFolhaLinha({
      meta,
      funcao: funcaoRegra,
      cidade: linha.loja_id.toString(),
      funcionarioNome: linha.nome,
      tipoMeta: linha.tipoMeta,
      sem1: semana === 5 ? liquidezSemana : linha.sem1,
      sem2: semana === 5 ? 0 : linha.sem2,
      sem3: semana === 5 ? 0 : linha.sem3,
      sem4: semana === 5 ? 0 : linha.sem4,
      premiacoesManuais: [],
      vales: [],
      aluguel: 0,
      inss: 0,
      adiant: 0,
      holerite: 0,
    });

    const percentualAutomatico = Number(
      semana === 5
        ? calculadoOriginal.perc1
        : semana === 1
        ? calculadoOriginal.perc1
        : semana === 2
        ? calculadoOriginal.perc2
        : semana === 3
        ? calculadoOriginal.perc3
        : calculadoOriginal.perc4
    );

    const manual =
      !(
        linha.funcao === "gerente" &&
        (linha.loja_id === 3 || linha.loja_id === 6)
      ) &&
      manualValue > 0 &&
      percentualAutomatico > 0 &&
      Math.abs(manualValue - percentualAutomatico) > 0.001;
    const regraClassName = manual
      ? "text-orange-400 font-bold hover:underline underline-offset-4"
      : "text-yellow-300 font-semibold hover:underline underline-offset-4";

    const semanaEditor = semana === 5 ? 7 : semana;

    if (isConsultor) {
      const valorAplicado = Number(
        (linha as any)[campoPercentualSemanaVisual(semana)] || 0
      );
      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semanaEditor)}
          className={regraClassName}
        >
          {valorAplicado > 0
            ? `R$ ${money(valorAplicado)} / carro`
            : getRegraConsultorTexto(linha, liquidezSemana)}
        </button>
      );
    }

    if (isRecepcao) {
      const config = getRecepcaoConfig(linha.nome, linha.loja_id.toString());
      const valor = semana === 1 ? config.valorVenda : config.valorEntrada;
      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semanaEditor)}
          className={regraClassName}
        >
          R$ {money(valor)}
        </button>
      );
    }

    if (isSupervisor) {
      const premio = Number((linha as any)[campoComissaoSemanaVisual(semana)] || 0);
      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semanaEditor)}
          className={regraClassName}
        >
          R$ {money(premio)}
        </button>
      );
    }

    const percentual =
      linha.funcao === "gerente" &&
      (linha.loja_id === 3 || linha.loja_id === 6)
        ? percentualAutomatico
        : Number((linha as any)[campoPercentualSemanaVisual(semana)] || 0);

    return (
      <button
        type="button"
        onClick={() => onOpenRegraSemanaEditor(linha, semanaEditor)}
        className={regraClassName}
      >
        {percentual.toFixed(2)}%
      </button>
    );
  }

  return (
    <Card className="group overflow-hidden rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#060606] shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
      <CardHeader className="border-b border-[#D4AF37]/10 bg-gradient-to-r from-[#D4AF37]/[0.055] via-transparent to-transparent px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold tracking-tight text-[#F2D675]">{titulo}</CardTitle>
            <CardDescription className="mt-1 text-gray-500">
              {descricao}
            </CardDescription>
          </div>
          <div className="mt-1 h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.55)]" />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className={`w-full ${sem5Ativa ? "min-w-[2150px]" : "min-w-[1900px]"} text-sm`}>
            <thead>
              <tr className="border-b border-[#D4AF37]/15 bg-[#D4AF37]/[0.025] text-[#D4AF37]">
                <th className="sticky left-0 z-20 bg-[#0b0b0b] p-3 text-left text-[11px] font-bold uppercase tracking-[0.08em]">Nome</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-[0.06em]">Função</th>
                {temTransicaoNoQuadrante && (
                  <th className="p-3 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-orange-300">
                    Transição
                  </th>
                )}
                {isSalarioFixo && (
  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Salário</th>
)}

                {!isSalarioFixo && !isRecepcao && !isPj && !isMensalUnico && !isConsultorMeta2 && !isGerente && (
                  <>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(1)}
                          className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                          title="Importar relatório da SEM1"
                        >
                          SEM1
                        </button>
                      ) : (
                        "SEM1"
                      )}
                    </th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">{isConsultor ? "Regra" : "%"}</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(2)}
                          className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                          title="Importar relatório da SEM2"
                        >
                          SEM2
                        </button>
                      ) : (
                        "SEM2"
                      )}
                    </th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">{isConsultor ? "Regra" : "%"}</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(3)}
                          className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                          title="Importar relatório da SEM3"
                        >
                          SEM3
                        </button>
                      ) : (
                        "SEM3"
                      )}
                    </th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">{isConsultor ? "Regra" : "%"}</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(4)}
                          className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                          title="Importar relatório da SEM4"
                        >
                          SEM4
                        </button>
                      ) : (
                        "SEM4"
                      )}
                    </th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">{isConsultor ? "Regra" : "%"}</th>
                    {sem5Ativa && (
                      <>
                        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                          {quadrante === "comissao_semanal" ? (
                            <button
                              type="button"
                              onClick={() => onOpenImportacaoSemana(5)}
                              className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                              title="Importar relatório da SEM5"
                            >
                              SEM5
                            </button>
                          ) : (
                            "SEM5"
                          )}
                        </th>
                        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">{isConsultor ? "Regra" : "%"}</th>
                      </>
                    )}
                  </>
                )}
                

 
{isGerente && !isGerenteSaoJoseSemanal && (
  <>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Liquidez Venda</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% Venda</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Liquidez Loja</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% Loja</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Comissão</th>
  </>
)}

{isGerenteSaoJoseSemanal && (
  <>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">SEM1</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% SEM1</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">SEM2</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% SEM2</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">SEM3</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% SEM3</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">SEM4</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% SEM4</th>
    {sem5Ativa && (
      <>
        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">SEM5</th>
        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% SEM5</th>
      </>
    )}
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Liquidez Loja</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">% Loja</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Comissão</th>
  </>
)}
                 
                {isConsultorMeta2 && (
  <>
    {isConsultorGravataiPj && (
      <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Salário Fixo</th>
    )}
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Quant. Carro</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Regra</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Carros</th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Comissão</th>
    {isConsultorGravataiPj && (
      <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total</th>
    )}
  </>
)}

{!isSalarioFixo &&
  !isRecepcao &&
  !isPj &&
  isMensalUnico &&
  !isConsultorMeta2 &&
  !isGerente && (
    <>
      <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
        {quadrante === "comissao_mensal" && linhas[0]?.loja_id === 4 ? (
          <button
            type="button"
            onClick={() => onOpenImportacaoSemana(1)}
            className="font-bold text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
            title="Importar relatório mensal de VENDA/MECÂNICA"
          >
            Liquidez Venda
          </button>
        ) : (
          "Liquidez"
        )}
      </th>
      <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">%</th>
    </>
)}

                {isRecepcao && (
                  <>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Vendas fechadas</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Valor</th>
                    {recepcaoCompleta && (
                      <>
                        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Entradas</th>
                        <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Valor</th>
                      </>
                    )}
                  </>
                )}

                {isSupervisor && (
                  <>
                   <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Salário</th>
                   <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Liquidez</th>
                   <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total comissão</th>
                   <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total</th>
                 </>
                )}

                {isSupervisoraAci && (
                  <>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Salário Fixo</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Joinville</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Blumenau</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">São José</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Florianópolis</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Gravataí</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">São Leopoldo</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Carros</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Valor / Carro</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Comissão</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total</th>
                  </>
                )}

                {!isSalarioFixo && !isRecepcao && !isPj && !isConsultorMeta2 && !isGerente && (
  <>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
      {isConsultor ? "Total Carros" : "Total Liquidez"}
    </th>
    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Comissão</th>
  </>
)}

                {isRecepcao && <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Total Comissão</th>}

                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Premiação</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Vale</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Aluguel</th>
                {!isPj && <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">INSS</th>}
                {isSupervisoraAci ? (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Adiant.</th>
                ) : (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoAdiantamento}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF de adiantamento"
                    >
                      Adiant.
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}
                {!isPj && (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoHolerite}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF da folha mensal"
                    >
                      Holerite
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Boleto</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Observação</th>
              </tr>
            </thead>

            <tbody>
             {linhas.map((linha: LinhaComQuadrante) => (
                <tr
                  key={linha.id}
                  className="border-b border-white/[0.045] transition-colors duration-200 hover:bg-[#D4AF37]/[0.028]"
                >
                  <td className="sticky left-0 z-10 min-w-[260px] bg-[#0b0b0b] p-3 font-semibold text-white">
                    <button
                      type="button"
                      onClick={() => onOpenFuncionarioDetalhe(linha)}
                      className="text-left font-semibold text-white transition-colors hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Ver dados do funcionário"
                    >
                      {linha.nome}
                    </button>
                    {temMudancaFuncaoNoMes(linha) && (
                      <span
                        className="ml-2 inline-flex items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-orange-300"
                        title="Este funcionário exerceu funções diferentes dentro desta competência"
                      >
                        Mudança de função
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-gray-300">
                    {isSupervisoraAci ? (
                      "Supervisora de Consultor de Vendas - PJ"
                    ) : temMudancaFuncaoNoMes(linha) ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-semibold text-[#F2D675]">
                          {getDescricaoFuncaoNoMes(linha)}
                        </span>
                        <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-orange-300">
                          mudança no mês
                        </span>
                      </div>
                    ) : (
                      getDescricaoFuncaoNoMes(linha)
                    )}
                  </td>
                  {temTransicaoNoQuadrante && (
                    <td className="min-w-[190px] p-2">
                      {linha.trocaFuncaoMes ? (
                        <button
                          type="button"
                          onClick={() => onOpenTransicaoFuncao(linha)}
                          className="w-full rounded-xl border border-orange-400/35 bg-orange-500/[0.08] px-3 py-2 text-left transition hover:border-orange-300/60 hover:bg-orange-500/[0.12]"
                          title="Ver e ajustar a transição de função desta competência"
                        >
                          <span className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-orange-300">
                            {formatarDataBR(linha.trocaFuncaoMes.dataMudanca)}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-white">
                            {labelFuncaoFuncionario(linha.trocaFuncaoMes.funcaoAnterior, linha.loja_id)} → {labelFuncaoFuncionario(linha.trocaFuncaoMes.funcaoNova, linha.loja_id)}
                          </span>
                          {linha.trocaFuncaoMes.funcaoAnterior === "recepcionista" && (
                            <span className="mt-1 block text-[10px] text-[#F2D675]">
                              Recepção: R$ {money(Number(linha.comissaoFuncaoAnterior || 0))}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  )}
                  {isSalarioFixo && (
  <td className="p-2">
    {renderEditButton(
      linha,
      "sem1",
      "Salário",
      "money"
    )}
  </td>
)}

                  {!isSalarioFixo && !isRecepcao && !isPj && !isMensalUnico && !isConsultorMeta2 && !isGerente && (
                    <>
                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem1", "Quantidade SEM1", "number")
                          : renderEditButton(linha, "sem1", "Liquidez SEM1", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem2", "Quantidade SEM2", "number")
                          : renderEditButton(linha, "sem2", "Liquidez SEM2", "money")}
                      
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem3", "Quantidade SEM3", "number")
                          : renderEditButton(linha, "sem3", "Liquidez SEM3", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 3)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem4", "Quantidade SEM4", "number")
                          : renderEditButton(linha, "sem4", "Liquidez SEM4", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 4)}</td>
                      {sem5Ativa && (
                        <>
                          <td className="p-2">
                            {isConsultor
                              ? renderEditButton(linha, "sem5Extra" as any, "Quantidade SEM5", "number")
                              : renderEditButton(linha, "sem5Extra" as any, "Liquidez SEM5", "money")}
                          </td>
                          <td className="p-2 text-right">{renderRegraButton(linha, 5)}</td>
                        </>
                      )}
                    </>
                  )}

                  {!isSalarioFixo && !isRecepcao && !isPj && isMensalUnico && !isConsultorMeta2 && !isGerente && (
  <>
    <td className="p-2">
      {renderEditButton(
        linha,
        "sem1",
        "Liquidez do mês",
        "money"
      )}
    </td>

    <td className="p-2 text-right">
  {renderRegraButton(linha, 1)}
</td>
  </>
)}

{isConsultorMeta2 && (
  <>
    {isConsultorGravataiPj && (
      <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
        R$ {money(CONSULTOR_GRAVATAI_SALARIO_FIXO_PJ)}
      </td>
    )}

    <td className="p-2">
      {renderEditButton(
        linha,
        "sem1",
        "Quant. Carro",
        "number"
      )}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
      <button
        type="button"
        onClick={() => onOpenRegraSemanaEditor(linha, 1)}
        className="text-yellow-300 font-semibold whitespace-nowrap hover:underline underline-offset-4 cursor-pointer"
        title="Clique para visualizar a meta do consultor"
      >
        {getRegraConsultorTexto(linha, Number(linha.sem1 || 0))}
      </button>
    </td>

    <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
      {Number(linha.sem1 || 0).toLocaleString("pt-BR")}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
      R$ {money(linha.totalComissao)}
    </td>

    {isConsultorGravataiPj && (
      <td className="p-2 text-right text-green-400 font-bold whitespace-nowrap">
        R$ {money(CONSULTOR_GRAVATAI_SALARIO_FIXO_PJ + Number(linha.totalComissao || 0))}
      </td>
    )}
  </>
)}

{isGerente && !isGerenteSaoJoseSemanal && (
  <>
    <td className="p-2">
      {renderEditButton(
        linha,
        "sem1",
        "Liquidez Venda",
        "money"
      )}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold">
      {renderRegraButton(linha, 1)}
    </td>

    <td className="p-2">
      {renderEditButton(
        linha,
        "sem2",
        "Liquidez Loja",
        "money"
      )}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold">
      {renderRegraButton(linha, 2)}
    </td>
    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
  R$ {money(linha.totalComissao)}
</td>

  </>
)}

{isGerenteSaoJoseSemanal && (
  <>
    <td className="p-2">{renderEditButton(linha, "sem1", "Liquidez SEM1", "money")}</td>
    <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

    <td className="p-2">{renderEditButton(linha, "sem2", "Liquidez SEM2", "money")}</td>
    <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>

    <td className="p-2">{renderEditButton(linha, "sem3", "Liquidez SEM3", "money")}</td>
    <td className="p-2 text-right">{renderRegraButton(linha, 3)}</td>

    <td className="p-2">{renderEditButton(linha, "sem4", "Liquidez SEM4", "money")}</td>
    <td className="p-2 text-right">{renderRegraButton(linha, 4)}</td>

    {sem5Ativa && (
      <>
        <td className="p-2">{renderEditButton(linha, "sem5Extra" as any, "Liquidez SEM5", "money")}</td>
        <td className="p-2 text-right">{renderRegraButton(linha, 5)}</td>
      </>
    )}

    <td className="p-2">
      <button
  type="button"
  onClick={() =>
    onOpenCellEditor(
      linha,
      "sem5" as any,
      "Liquidez Loja",
      "money"
    )
  }
  className="w-full flex items-center justify-end whitespace-nowrap rounded-xl border border-white/[0.07] bg-[#101010] px-3 py-2 font-bold text-white shadow-inner shadow-black/30 transition-all hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/[0.045]"
>
  R$ {money(Number((linha as any).liquidezLojaGerente || 0))}
</button>
    </td>

    <td className="p-2 text-right">
  <button
    type="button"
    onClick={() => onOpenRegraSemanaEditor(linha, 5)}
    className="text-yellow-300 font-semibold hover:underline underline-offset-4"
  >
    {Number((linha as any).percLojaGerente || 0).toFixed(2)}%
  </button>
</td>

    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
      R$ {money(linha.totalComissao)}
    </td>
  </>
)}
                  {isRecepcao && (
                    <>
                      <td className="p-2">
                        {renderEditButton(linha, "sem1", "Vendas fechadas", "number")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

                      {recepcaoCompleta && (
                        <>
                          <td className="p-2">
                            {renderEditButton(linha, "sem2", "Entradas", "number")}
                          </td>
                          <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>
                        </>
                      )}
                    </>
                  )}

                  {isSupervisor && (
                    <>
                      <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
                        R$ {money(getSalarioFixoSupervisor())}
                      </td>

                      <td className="p-2">
                        {renderEditButton(linha, "sem1", "Liquidez", "money")}
                       </td>

                      <td className="p-2 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenRegraSemanaEditor(linha, 1)}
                          className="whitespace-nowrap text-yellow-300 font-semibold hover:underline underline-offset-4"
                        >
                          R$ {money(linha.totalComissao)}
                        </button>
                      </td>

                      <td className="p-2 text-right">
                        <span className="whitespace-nowrap text-green-400 font-bold">
                          R$ {money(getSalarioFixoSupervisor() + linha.totalComissao)}
                        </span>
                      </td>
                  </>
                 )}

                  {isSupervisoraAci && (() => {
                    const calculoAci = calcularSupervisoraAci({
                      joinville: Number(linha.sem1 || 0),
                      blumenau: Number(linha.sem2 || 0),
                      saoJose: Number(linha.sem3 || 0),
                      florianopolis: Number(linha.sem4 || 0),
                      gravatai: Number((linha as any).sem5 || 0),
                      saoLeopoldo: Number((linha as any).sem6 || 0),
                    });

                    return (
                      <>
                        <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
                          R$ {money(ACI_SUPERVISORA_SALARIO_FIXO)}
                        </td>

                        <td className="p-2">{renderEditButton(linha, "sem1", "Carros Joinville", "number")}</td>
                        <td className="p-2">{renderEditButton(linha, "sem2", "Carros Blumenau", "number")}</td>
                        <td className="p-2">{renderEditButton(linha, "sem3", "Carros São José", "number")}</td>
                        <td className="p-2">{renderEditButton(linha, "sem4", "Carros Florianópolis", "number")}</td>
                        <td className="p-2">
                          {renderEditButton(linha, "sem5" as keyof FolhaMensal, "Carros Gravataí", "number")}
                        </td>
                        <td className="p-2">
                          {renderEditButton(linha, "sem6" as keyof FolhaMensal, "Carros São Leopoldo", "number")}
                        </td>

                        <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
                          {calculoAci.totalCarros.toLocaleString("pt-BR")}
                        </td>
                        <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
                          R$ {money(calculoAci.valorPorCarro)}
                        </td>
                        <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
                          R$ {money(calculoAci.comissao)}
                        </td>
                        <td className="p-2 text-right text-green-400 font-bold whitespace-nowrap">
                          R$ {money(calculoAci.totalComFixo)}
                        </td>
                      </>
                    );
                  })()}

                  {!isSalarioFixo && !isRecepcao && !isPj && !isConsultorMeta2 && !isGerente && (
                    <>
                      <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
                        {isConsultor
                          ? linha.totalLiquidez.toLocaleString("pt-BR")
                          : `R$ ${money(linha.totalLiquidez)}`}
                      </td>

                      <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
                        R$ {money(linha.totalComissao)}
                      </td>
                    </>
                  )}

                  {isRecepcao &&(
                    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
                      R$ {money(linha.totalComissao)}
                    </td>
                  )}

                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onOpenPremioEditor(linha)}
                      className={`w-full flex items-center justify-end whitespace-nowrap rounded-xl border border-white/[0.07] bg-[#101010] px-3 py-2 font-bold shadow-inner shadow-black/30 transition-all hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/[0.045] ${
                       (
  linha.premiacao +
  (((linha as any).detalhesGrupo || []).reduce(
    (acc: number, item: any) => acc + Number(item.valor || 0),
    0
  ))
) > 0
                      }`}
                    >
                      R$ {money(
  linha.premiacao +
  (((linha as any).detalhesGrupo || []).reduce(
    (acc: number, item: any) => acc + Number(item.valor || 0),
    0
  ))
)}
                    </button>
                  </td>

                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onOpenValeEditor(linha)}
                      className={`w-full flex items-center justify-end whitespace-nowrap rounded-xl border border-white/[0.07] bg-[#101010] px-3 py-2 font-bold shadow-inner shadow-black/30 transition-all hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/[0.045] ${
                        linha.vale > 0 ? "text-red-400" : "text-white"
                      }`}
                    >
                      R$ {money(linha.vale)}
                    </button>
                  </td>

                  <td className="p-2">
                    {renderEditButton(linha, "aluguel", "Aluguel", "money")}
                  </td>

                  {!isPj && (
                    <td className="p-2">
                      {renderEditButton(linha, "inss", "INSS", "money")}
                    </td>
                  )}

                  <td className="p-2">
                    {renderEditButton(linha, "adiant", "Adiantamento", "money")}
                  </td>

                  {!isPj && (
                    <td className="p-2">
                      {renderEditButton(linha, "holerite", "Holerite", "money")}
                    </td>
                  )}

                  <td className="p-2 text-right font-bold whitespace-nowrap min-w-[120px]">
  {linha.boleto < 0 ? (
    <button
      type="button"
      onClick={() => onOpenNegativoEditor(linha)}
      className="text-red-500 hover:text-red-400 underline underline-offset-4 whitespace-nowrap"
    >
      R$ {money(linha.boleto)}
    </button>
  ) : (
    <span className="text-green-400 whitespace-nowrap">
      R$ {money(linha.boleto)}
    </span>
  )}
</td>

                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenObsEditor(linha)}
                      className={
                        linha.observacoes && linha.observacoes.length > 0
                          ? "rounded-md bg-red-600 px-3 py-2 font-bold text-white hover:bg-red-500"
                          : "rounded-md border border-[#D4AF37]/15 bg-[#111111] px-3 py-2 text-white hover:border-[#D4AF37]/45"
                      }
                    >
                      {linha.observacoes && linha.observacoes.length > 0 ? "OBS" : "—"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog
        open={!!semanaMistaDetalhe}
        onOpenChange={(open) => {
          if (!open) fecharSemanaMistaDetalhe();
        }}
      >
        <DialogContent className="border border-orange-400/30 bg-[#090909] text-white sm:max-w-lg">
          {semanaMistaDetalhe && (() => {
            const { linha, semana } = semanaMistaDetalhe;
            const composicao = getComposicaoSemana(linha, semana);
            const totalLiquidez = composicao.reduce(
              (acc, item) => acc + Number(item.liquidez || 0),
              0
            );
            const totalComissao = composicao.reduce(
              (acc, item) => acc + Number(item.comissao || 0),
              0
            );

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-[#F2D675]">
                    SEM{semana} — Detalhamento por função
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    {linha.nome} trabalhou em mais de uma função nesta semana. Cada parte é calculada pela regra correspondente.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {composicao.map((item, index) => (
                    <div
                      key={`${item.funcao}-${index}`}
                      className={`rounded-xl border p-4 ${
                        item.funcao === "mecanico"
                          ? "border-orange-400/35 bg-orange-500/[0.07]"
                          : "border-[#D4AF37]/35 bg-[#D4AF37]/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-wide text-white">
                          {labelFuncaoSemana(item.funcao)}
                        </span>
                        <span className="font-bold text-green-400">
                          R$ {money(item.liquidez)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">% aplicado</p>
                          <Input
                            key={`${item.funcao}-${index}-${Number(item.percentual || 0).toFixed(2)}`}
                            type="number"
                            step="0.01"
                            defaultValue={Number(item.percentual || 0)}
                            className="mt-1 h-9 w-28 border-yellow-500/30 bg-black text-right font-semibold text-yellow-300"
                            title="Altere o percentual se necessário. Deixe vazio para voltar à regra automática."
                            onBlur={async (e) => {
                              const valorDigitado = e.target.value.trim();
                              const valor = valorDigitado === "" ? null : Number(valorDigitado);

                              if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
                                e.target.value = String(Number(item.percentual || 0));
                                return;
                              }

                              const linhaAtualizada = await onUpdateComposicaoSemanaPercentual(
                                linha,
                                semana,
                                item.funcao,
                                valor
                              );

                              // Se o usuário clicou em Fechar enquanto o onBlur estava salvando,
                              // não reabra o modal quando a mutation terminar.
                              if (linhaAtualizada && semanaMistaAbertaRef.current) {
                                setSemanaMistaDetalhe({
                                  linha: linhaAtualizada,
                                  semana,
                                });
                              }
                            }}
                          />
                          <p className="mt-1 text-[10px] text-gray-600">
                            vazio = regra automática
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500">Comissão</p>
                          <p className="font-semibold text-[#F2D675]">
                            R$ {money(item.comissao)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.055] p-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-gray-400">Liquidez total da semana</span>
                    <strong className="text-white">R$ {money(totalLiquidez)}</strong>
                  </div>
                  <div className="mt-2 flex justify-between gap-4">
                    <span className="font-semibold text-gray-300">Comissão total da semana</span>
                    <strong className="text-[#F2D675]">R$ {money(totalComissao)}</strong>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    className="bg-[#D4AF37] text-black hover:bg-[#F2D675]"
                    onMouseDown={() => {
                      // onMouseDown acontece antes do blur do input.
                      semanaMistaAbertaRef.current = false;
                    }}
                    onClick={fecharSemanaMistaDetalhe}
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function FolhaPagamento() {
  const [, setLocation] = useLocation();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const [selectedLoja, setSelectedLoja] = useState("1");
  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [folhas, setFolhas] = useState<FolhaMensal[]>([]);
  const [folhaFiltros, setFolhaFiltros] = useState({
  inss: true,
  adiant: true,
  holerite: true,
  });

  const [cellEditor, setCellEditor] = useState<CellEditorState>({
    open: false,
    funcionarioId: null,
    campo: null,
    label: "",
    mode: "money",
    value: "",
  });

  const [premioEditor, setPremioEditor] = useState<PremioEditorState>({
    open: false,
    funcionarioId: null,
    descricao: "",
    valor: "",
  });

  const [obsEditor, setObsEditor] = useState<ObsEditorState>({
    open: false,
    funcionarioId: null,
    novaObs: "",
  });

  const [valeEditor, setValeEditor] = useState<ValeEditorState>({
    open: false,
    funcionarioId: null,
    descricao: "",
    valor: "",
    parcelas: "1",
  });

  const [negativoEditor, setNegativoEditor] = useState<NegativoEditorState>({
    open: false,
    linha: null,
  });

  const [regraSemanaEditor, setRegraSemanaEditor] = useState<RegraSemanaEditorState>({
    open: false,
    linha: null,
    semana: null,
  });

  const [transicaoFuncaoEditor, setTransicaoFuncaoEditor] =
    useState<TransicaoFuncaoEditorState>({
      open: false,
      linha: null,
      quantidadeAnterior1: "",
      quantidadeAnterior2: "",
      valorFixoAnterior: "",
      corrigindoData: false,
      novaDataMudanca: "",
    });


  const [importacaoSemana, setImportacaoSemana] = useState<ImportacaoSemanaState>(
    { ...criarImportacaoInicial(1), open: false }
  );
  const [importacaoRestaurada, setImportacaoRestaurada] = useState(false);

  const [importacaoAdiantamento, setImportacaoAdiantamento] =
    useState<ImportacaoAdiantamentoState>({
      ...criarImportacaoAdiantamentoInicial(),
      open: false,
    });
  const [importacaoAdiantamentoRestaurada, setImportacaoAdiantamentoRestaurada] =
    useState(false);

  const [importacaoHolerite, setImportacaoHolerite] =
    useState<ImportacaoHoleriteState>({
      ...criarImportacaoHoleriteInicial(),
      open: false,
    });
  const [importacaoHoleriteRestaurada, setImportacaoHoleriteRestaurada] =
    useState(false);

  const [reabrirMesOpen, setReabrirMesOpen] = useState(false);
  const [senhaReabertura, setSenhaReabertura] = useState("");
  const [erroFechamento, setErroFechamento] = useState("");
  const [bloqueioAvisoOpen, setBloqueioAvisoOpen] = useState(false);

  const [funcionarioDetalheId, setFuncionarioDetalheId] = useState<number | null>(null);
  const [editandoFuncionarioDetalhe, setEditandoFuncionarioDetalhe] = useState(false);
  const [tentouSalvarFuncionarioDetalhe, setTentouSalvarFuncionarioDetalhe] = useState(false);
  const [funcionarioEdicaoForm, setFuncionarioEdicaoForm] =
    useState<FormEdicaoFuncionario>(criarFormEdicaoFuncionarioVazio());

  const lojaId = parseInt(selectedLoja, 10);

  const fechamentoQuery = trpc.folhaFechamento.getStatus.useQuery(
    { lojaId, ano, mes },
    {
      enabled: !!lojaId && !!ano && !!mes,
      retry: false,
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    }
  );

  const mesFechado = Boolean(fechamentoQuery.data?.fechado);
  const podeGerenciarFechamento = ["admin", "gestor"].includes(
    String(meQuery.data?.role || "")
  );

  const fecharMesMutation = trpc.folhaFechamento.fechar.useMutation({
    onSuccess: () => {
      setErroFechamento("");
      void fechamentoQuery.refetch();
    },
  });

  const reabrirMesMutation = trpc.folhaFechamento.reabrir.useMutation({
    onSuccess: () => {
      setErroFechamento("");
      setSenhaReabertura("");
      setReabrirMesOpen(false);
      void fechamentoQuery.refetch();
    },
  });

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(   
  { lojaId },
  {
    enabled: !!lojaId,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  }
);

const trocasFuncaoQuery = trpc.funcionarios.trocasByLojaCompetencia.useQuery(
  { lojaId, ano, mes },
  {
    enabled: !!lojaId && !!ano && !!mes,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  }
);

const updateFuncionarioDetalheMutation = trpc.funcionarios.update.useMutation({
  onSuccess: async () => {
    await funcionariosQuery.refetch();
    setEditandoFuncionarioDetalhe(false);
    setTentouSalvarFuncionarioDetalhe(false);
  },
});

const folhaBaseQuery = trpc.folhaPagamento.getBaseByLojaAnoMes.useQuery(
  { lojaId, ano, mes },
  {
    enabled: !!lojaId,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  }
);

const sem5StatusQuery = trpc.folhaPagamento.getSem5Status.useQuery(
  { lojaId, ano, mes },
  {
    enabled: !!lojaId && !!ano && !!mes,
    retry: false,
    refetchOnWindowFocus: true,
  }
);
const sem5Ativa = Boolean(sem5StatusQuery.data?.ativa);

const usuarioLogado = meQuery.data?.name || meQuery.data?.email || "Usuário";

const upsertFolhaBaseMutation = trpc.folhaPagamento.upsertBaseItem.useMutation({
  onSuccess: () => {
    void folhaBaseQuery.refetch();
  },
});

const ativarSem5Mutation = trpc.folhaPagamento.ativarSem5.useMutation({
  onSuccess: () => {
    void sem5StatusQuery.refetch();
  },
});

const desativarSem5Mutation = trpc.folhaPagamento.desativarSem5.useMutation({
  onSuccess: () => {
    void sem5StatusQuery.refetch();
    void folhaBaseQuery.refetch();
  },
});


const upsertTransicaoFuncaoMutation =
  trpc.folhaPagamento.upsertTransicaoFuncao.useMutation({
    onSuccess: () => {
      void trocasFuncaoQuery.refetch();
    },
  });

const corrigirDataTrocaMutation = trpc.funcionarios.corrigirDataTroca.useMutation({
  onSuccess: () => {
    void trocasFuncaoQuery.refetch();
  },
});

const importFolhaBaseMutation = trpc.folhaPagamento.upsertBaseItem.useMutation();
const importDescontoMutation = trpc.folhaExtras.saveDesconto.useMutation();

const folhaExtrasQuery = trpc.folhaExtras.getByLojaAnoMes.useQuery(
  { lojaId, ano, mes },
  {
    enabled: !!lojaId,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  }
);

const resumoSupervisorQuery =
  trpc.folhaPagamento.getResumoSupervisorMensal.useQuery(
    { ano, mes },
    {
      enabled: !!ano && !!mes,
      retry: false,
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    }
  );

const addPremiacaoMutation = trpc.folhaExtras.addPremiacao.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
  },
});

const removePremiacaoMutation = trpc.folhaExtras.removePremiacao.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
  },
});

const addObservacaoMutation = trpc.folhaExtras.addObservacao.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
  },
});

const removeObservacaoMutation = trpc.folhaExtras.removeObservacao.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
  },
});

const saveDescontoMutation = trpc.folhaExtras.saveDesconto.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
    void folhaBaseQuery.refetch();
  },
});

const addValesMutation = trpc.folhaExtras.addVales.useMutation({
  onSuccess: () => {
    void folhaExtrasQuery.refetch();
  },
});

const removeValesMutation =
  trpc.folhaExtras.removeValesFromCurrentForward.useMutation({
    onSuccess: () => {
      void folhaExtrasQuery.refetch();
    },
  });
  
const todosFuncionarios = useMemo(() => {
  const rows = (funcionariosQuery.data ?? []) as any[];

  return rows.map((f) => ({
    ...f,
    id: f.id,
    nome: f.nome,
    cpf: f.cpf || f.documento || "",
    pix: f.pix || f.chavePix || f.chave_pix || "",
    dataNascimento:
      f.dataNascimento || f.data_nascimento || f.nascimento || "",
    funcao: f.funcao,
    loja_id: f.loja_id ?? f.lojaId,
    dataAdmissao: f.dataAdmissao || f.data_admissao || "",
    dataDesligamento:
      f.dataDesligamento || f.data_desligamento || null,
    dataReativacao:
      f.dataReativacao || f.data_reativacao || null,
    dataExperiencia45:
      f.dataExperiencia45 || f.data_experiencia_45 || "",
    dataExperiencia90:
      f.dataExperiencia90 || f.data_experiencia_90 || "",
    status: (f.status || "ativo") as "ativo" | "inativo" | "experiencia",
    tipoMeta: (f.tipoMeta || f.tipo_meta || "") as "meta1" | "meta2" | "",
    dataDemissao: f.dataDemissao || f.data_demissao || "",
    debitoPendente: Number(f.debitoPendente || f.debito_pendente || 0),
    dataFeedbackProxima:
      f.dataFeedbackProxima || f.data_feedback_proxima || "",
    dataFeriasInicio: f.dataFeriasInicio || f.data_ferias_inicio || "",
    dataFeriasFim: f.dataFeriasFim || f.data_ferias_fim || "",
    dataFerias2Inicio: f.dataFerias2Inicio || f.data_ferias_2_inicio || "",
    dataFerias2Fim: f.dataFerias2Fim || f.data_ferias_2_fim || "",
    telefone: f.telefone || f.celular || f.whatsapp || "",
    email: f.email || "",
    rg: f.rg || "",
    pis: f.pis || f.pisPasep || f.pis_pasep || "",
    banco: f.banco || "",
    agencia: f.agencia || "",
    conta: f.conta || f.contaBancaria || f.conta_bancaria || "",
    tipoConta: f.tipoConta || f.tipo_conta || "",
    endereco: f.endereco || f.logradouro || "",
    numeroEndereco: f.numeroEndereco || f.numero_endereco || f.numero || "",
    complemento: f.complemento || "",
    bairro: f.bairro || "",
    cidade: f.cidade || "",
    estado: f.estado || f.uf || "",
    cep: f.cep || "",
  }));
}, [funcionariosQuery.data]);

const funcionarioDetalheAtual = useMemo(() => {
  if (!funcionarioDetalheId) return null;

  return (
    todosFuncionarios.find(
      (funcionario: any) => Number(funcionario.id) === Number(funcionarioDetalheId)
    ) || null
  );
}, [funcionarioDetalheId, todosFuncionarios]);

const funcionarioEdicaoCamposInvalidos = {
  nome: !funcionarioEdicaoForm.nome.trim(),
  cpf: !funcionarioEdicaoForm.cpf.trim(),
  pix: !funcionarioEdicaoForm.pix.trim(),
  dataNascimento: !funcionarioEdicaoForm.dataNascimento,
  funcao: !funcionarioEdicaoForm.funcao,
  tipoMeta:
    funcionarioEdicaoForm.funcao === "consultor_vendas" &&
    !funcionarioEdicaoForm.tipoMeta,
  dataAdmissao: !funcionarioEdicaoForm.dataAdmissao,
};

const funcionarioEdicaoValida = !Object.values(
  funcionarioEdicaoCamposInvalidos
).some(Boolean);

function abrirEdicaoFuncionarioDetalhe() {
  const funcionario = funcionarioDetalheAtual as any;
  if (!funcionario) return;

  setFuncionarioEdicaoForm({
    nome: String(funcionario.nome || ""),
    cpf: String(funcionario.cpf || ""),
    pix: String(
      funcionario.pix || funcionario.chavePix || funcionario.chave_pix || ""
    ),
    dataNascimento: formatarDataInputFuncionario(
      funcionario.dataNascimento ||
        funcionario.data_nascimento ||
        funcionario.nascimento
    ),
    funcao: String(funcionario.funcao || "mecanico") as FuncaoFuncionarioId,
    tipoMeta:
      Number(funcionario.lojaId ?? funcionario.loja_id ?? lojaId) === 5 &&
      String(funcionario.funcao || "") === "consultor_vendas"
        ? "meta2"
        : (String(
            funcionario.tipoMeta || funcionario.tipo_meta || ""
          ) as TipoMetaFuncionario),
    dataAdmissao: formatarDataInputFuncionario(
      funcionario.dataAdmissao || funcionario.data_admissao
    ),
  });
  setTentouSalvarFuncionarioDetalhe(false);
  setEditandoFuncionarioDetalhe(true);
}

async function salvarEdicaoFuncionarioDetalhe() {
  const funcionario = funcionarioDetalheAtual as any;
  if (!funcionario) return;

  setTentouSalvarFuncionarioDetalhe(true);

  if (!funcionarioEdicaoValida) {
    const faltando: string[] = [];
    if (funcionarioEdicaoCamposInvalidos.nome) faltando.push("Nome completo");
    if (funcionarioEdicaoCamposInvalidos.cpf) faltando.push("CPF");
    if (funcionarioEdicaoCamposInvalidos.pix) faltando.push("PIX");
    if (funcionarioEdicaoCamposInvalidos.dataNascimento)
      faltando.push("Data de aniversário");
    if (funcionarioEdicaoCamposInvalidos.funcao) faltando.push("Função");
    if (funcionarioEdicaoCamposInvalidos.tipoMeta)
      faltando.push("Tipo de meta / comissão");
    if (funcionarioEdicaoCamposInvalidos.dataAdmissao)
      faltando.push("Data de admissão");

    alert(
      `Preencha todos os campos obrigatórios antes de salvar:

- ${faltando.join(
        "\n- "
      )}`
    );
    return;
  }

  try {
    await updateFuncionarioDetalheMutation.mutateAsync({
      id: Number(funcionario.id),
      lojaId: Number(funcionario.loja_id ?? funcionario.lojaId ?? lojaId),
      nome: funcionarioEdicaoForm.nome.trim(),
      cpf: funcionarioEdicaoForm.cpf.trim(),
      pix: funcionarioEdicaoForm.pix.trim(),
      dataNascimento: dataFuncionarioParaApi(
        funcionarioEdicaoForm.dataNascimento
      ),
      funcao: String(funcionario.funcao || funcionarioEdicaoForm.funcao) as FuncaoFuncionarioId,
      tipoMeta:
        String(funcionario.funcao || funcionarioEdicaoForm.funcao) === "consultor_vendas"
          ? Number(funcionario.lojaId ?? funcionario.loja_id ?? lojaId) === 5
            ? "meta2"
            : (funcionarioEdicaoForm.tipoMeta as "meta1" | "meta2")
          : null,
      dataAdmissao: dataFuncionarioParaApi(funcionarioEdicaoForm.dataAdmissao),
    });
  } catch (error: any) {
    console.error(error);
    alert(error?.message ?? "Erro ao atualizar funcionário");
  }
}

const funcionariosDaCidade = useMemo(() => {
  const dataReferencia = new Date(ano, mes - 1, 1);

  return todosFuncionarios.filter((f: any) => {
    if (Number(f.loja_id ?? f.lojaId) !== Number(lojaId)) return false;

    const desligamento = f.dataDesligamento
      ? new Date(f.dataDesligamento)
      : null;

    const reativacao = f.dataReativacao
      ? new Date(f.dataReativacao)
      : null;

    if (f.status === "ativo") {
      if (!desligamento) return true;

      if (reativacao) {
        return (
          dataReferencia < desligamento ||
          dataReferencia >= reativacao
        );
      }

      return true;
    }

    if (f.status === "inativo") {
      if (!desligamento) return false;

      if (reativacao) {
        return (
          dataReferencia < desligamento ||
          dataReferencia >= reativacao
        );
      }

      return dataReferencia < desligamento;
    }

    return true;
  });
}, [lojaId, todosFuncionarios, ano, mes]);

function updateFolhas(next: FolhaMensal[]) {
  setFolhas(next);
}

function getFuncionarioById(funcionarioId: number) {
  return todosFuncionarios.find((f) => f.id === funcionarioId) || null;
}

useEffect(() => {
  const rows = (folhaBaseQuery.data ?? []) as any[];

  const agrupado = new Map<string, FolhaMensal>();

  for (const row of rows) {
    const key = `${row.funcionarioId}-${row.lojaId}-${row.ano}-${row.mes}`;

    if (!agrupado.has(key)) {
      agrupado.set(key, {
        id: key,
        ano: row.ano,
        mes: row.mes,
        loja_id: row.lojaId,
        funcionarioId: row.funcionarioId,
        nome: todosFuncionarios.find((f) => Number(f.id) === Number(row.funcionarioId))?.nome || "",
        funcao: todosFuncionarios.find((f) => Number(f.id) === Number(row.funcionarioId))?.funcao || "",
        tipoMeta: (todosFuncionarios.find((f) => Number(f.id) === Number(row.funcionarioId))?.tipoMeta || "") as any,
regraMeta: "",

        sem1: 0,
        perc1: 0,
        com1: 0,

        sem2: 0,
        perc2: 0,
        com2: 0,

        sem3: 0,
        perc3: 0,
        com3: 0,

        sem4: 0,
        perc4: 0,
        com4: 0,

        sem5Extra: 0,
        perc5Extra: 0,
        com5Extra: 0,
        percManual5Extra: null,

        totalLiquidez: 0,
        totalComissao: 0,

        premiacoesManuais: [],
        premiacao: 0,

        vales: [],
        vale: 0,

        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,

        observacoes: [],
        boleto: 0,

        ultimaAlteracaoPor: (row as any).ultimaAlteracaoPor || null,
        ultimaAlteracaoEm: (row as any).ultimaAlteracaoEm || null,
        } as any);
    }

    const item = agrupado.get(key)!;

    if (row.semana === 1) {
       item.sem1 = Number(row.liquidez || 0);
       item.percManual1 =
       row.percentualManual !== null && row.percentualManual !== undefined
       ? Number(row.percentualManual)
       : null;
       item.perc1 = Number(row.percentualComissao || 0);
       item.com1 = Number(row.valorComissao || 0);
       (item as any).funcaoSemana1 =
         row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
           ? row.funcaoSemana
           : null;
       try {
         const rawComposicao = (row as any).composicaoSemana;
         const composicao = Array.isArray(rawComposicao)
           ? rawComposicao
           : typeof rawComposicao === "string" && rawComposicao.trim()
           ? JSON.parse(rawComposicao)
           : null;
         (item as any).composicaoSemana1 = Array.isArray(composicao) ? composicao : null;
       } catch {
         (item as any).composicaoSemana1 = null;
       }

       (item as any).ultimaAlteracaoPor1 = (row as any).ultimaAlteracaoPor || null;
       (item as any).ultimaAlteracaoEm1 = (row as any).ultimaAlteracaoEm || null;
    }

    if (row.semana === 2) {
  item.sem2 = Number(row.liquidez || 0);
  item.percManual2 =
    row.percentualManual !== null && row.percentualManual !== undefined
      ? Number(row.percentualManual)
      : null;
  item.perc2 = Number(row.percentualComissao || 0);
  item.com2 = Number(row.valorComissao || 0);
  (item as any).funcaoSemana2 =
    row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
      ? row.funcaoSemana
      : null;
  try {
    const rawComposicao = (row as any).composicaoSemana;
    const composicao = Array.isArray(rawComposicao)
      ? rawComposicao
      : typeof rawComposicao === "string" && rawComposicao.trim()
      ? JSON.parse(rawComposicao)
      : null;
    (item as any).composicaoSemana2 = Array.isArray(composicao) ? composicao : null;
  } catch {
    (item as any).composicaoSemana2 = null;
  }

  (item as any).ultimaAlteracaoPor2 = (row as any).ultimaAlteracaoPor || null;
  (item as any).ultimaAlteracaoEm2 = (row as any).ultimaAlteracaoEm || null;
}

if (row.semana === 3) {
  item.sem3 = Number(row.liquidez || 0);
  item.percManual3 =
    row.percentualManual !== null && row.percentualManual !== undefined
      ? Number(row.percentualManual)
      : null;
  item.perc3 = Number(row.percentualComissao || 0);
  item.com3 = Number(row.valorComissao || 0);
  (item as any).funcaoSemana3 =
    row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
      ? row.funcaoSemana
      : null;
  try {
    const rawComposicao = (row as any).composicaoSemana;
    const composicao = Array.isArray(rawComposicao)
      ? rawComposicao
      : typeof rawComposicao === "string" && rawComposicao.trim()
      ? JSON.parse(rawComposicao)
      : null;
    (item as any).composicaoSemana3 = Array.isArray(composicao) ? composicao : null;
  } catch {
    (item as any).composicaoSemana3 = null;
  }

  (item as any).ultimaAlteracaoPor3 = (row as any).ultimaAlteracaoPor || null;
  (item as any).ultimaAlteracaoEm3 = (row as any).ultimaAlteracaoEm || null;
}

if (row.semana === 4) {
  item.sem4 = Number(row.liquidez || 0);
  item.percManual4 =
    row.percentualManual !== null && row.percentualManual !== undefined
      ? Number(row.percentualManual)
      : null;
  item.perc4 = Number(row.percentualComissao || 0);
  item.com4 = Number(row.valorComissao || 0);
  (item as any).funcaoSemana4 =
    row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
      ? row.funcaoSemana
      : null;
  try {
    const rawComposicao = (row as any).composicaoSemana;
    const composicao = Array.isArray(rawComposicao)
      ? rawComposicao
      : typeof rawComposicao === "string" && rawComposicao.trim()
      ? JSON.parse(rawComposicao)
      : null;
    (item as any).composicaoSemana4 = Array.isArray(composicao) ? composicao : null;
  } catch {
    (item as any).composicaoSemana4 = null;
  }

  (item as any).ultimaAlteracaoPor4 = (row as any).ultimaAlteracaoPor || null;
  (item as any).ultimaAlteracaoEm4 = (row as any).ultimaAlteracaoEm || null;
}

if (row.semana === 7) {
  (item as any).sem5Extra = Number(row.liquidez || 0);
  (item as any).percManual5Extra =
    row.percentualManual !== null && row.percentualManual !== undefined
      ? Number(row.percentualManual)
      : null;
  (item as any).perc5Extra = Number(row.percentualComissao || 0);
  (item as any).com5Extra = Number(row.valorComissao || 0);
  (item as any).funcaoSemana5 =
    row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
      ? row.funcaoSemana
      : null;
  try {
    const rawComposicao = (row as any).composicaoSemana;
    const composicao = Array.isArray(rawComposicao)
      ? rawComposicao
      : typeof rawComposicao === "string" && rawComposicao.trim()
      ? JSON.parse(rawComposicao)
      : null;
    (item as any).composicaoSemana5 = Array.isArray(composicao) ? composicao : null;
  } catch {
    (item as any).composicaoSemana5 = null;
  }
  (item as any).ultimaAlteracaoPor5 = (row as any).ultimaAlteracaoPor || null;
  (item as any).ultimaAlteracaoEm5 = (row as any).ultimaAlteracaoEm || null;
}

if (row.semana === 5) {
  const funcionarioLinha = todosFuncionarios.find(
    (f) => Number(f.id) === Number(row.funcionarioId)
  );
  const ehSupervisoraAci =
    Number(row.lojaId) === 5 && funcionarioLinha?.funcao === "supervisor";

  if (ehSupervisoraAci) {
    (item as any).sem5 = Number(row.liquidez || 0);
  } else {
    (item as any).liquidezLojaGerente = Number(row.liquidez || 0);
    (item as any).percLojaGerente = Number(row.percentualComissao || 0);
    (item as any).comLojaGerente = Number(row.valorComissao || 0);
  }
}

if (row.semana === 6) {
  (item as any).sem6 = Number(row.liquidez || 0);
}
}
setFolhas(Array.from(agrupado.values()));
}, [folhaBaseQuery.data, todosFuncionarios]);
  const trocasFuncaoCompetencia = useMemo(() => {
    return ((trocasFuncaoQuery.data ?? []) as any[]).map((item) => ({
      ...item,
      id: Number(item.id),
      funcionarioId: Number(item.funcionarioId),
      lojaId: Number(item.lojaId),
      quantidadeAnterior1: Number(item.quantidadeAnterior1 || 0),
      quantidadeAnterior2: Number(item.quantidadeAnterior2 || 0),
      valorFixoAnterior: Number(item.valorFixoAnterior || 0),
    })) as TrocaFuncaoMes[];
  }, [trocasFuncaoQuery.data]);

  const trocaFuncaoPorFuncionario = useMemo(() => {
    const map = new Map<number, TrocaFuncaoMes>();
    for (const troca of trocasFuncaoCompetencia) {
      if (!map.has(Number(troca.funcionarioId))) {
        map.set(Number(troca.funcionarioId), troca);
      }
    }
    return map;
  }, [trocasFuncaoCompetencia]);

  const linhas = useMemo<LinhaComQuadrante[]>(() => {
    const resumoFuncionariosLoja = funcionariosDaCidade.map((funcionario) => {
  const folhaFuncionario = folhas.find(
    (f) =>
      f.loja_id === lojaId &&
      f.ano === ano &&
      f.mes === mes &&
      f.funcionarioId === funcionario.id
  );

  const totalLiquidez =
    Number(folhaFuncionario?.sem1 || 0) +
    Number(folhaFuncionario?.sem2 || 0) +
    Number(folhaFuncionario?.sem3 || 0) +
    Number(folhaFuncionario?.sem4 || 0) +
    Number((folhaFuncionario as any)?.sem5Extra || 0);

  return {
    nome: funcionario.nome,
    funcao: funcionario.funcao,
    totalLiquidez,
  };
});
    return [...funcionariosDaCidade]
  .sort((a, b) => {
    const ordemFuncao: Record<string, number> = {
      vendedor: 1,
      mecanico: 2,
      auxiliar_mecanico: 3,
    };

    const ordemA = ordemFuncao[a.funcao] ?? 99;
    const ordemB = ordemFuncao[b.funcao] ?? 99;

    if (ordemA !== ordemB) return ordemA - ordemB;

    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  })
  .map((func) => {
      const existente = folhas.find(
        (f) =>
          f.loja_id === lojaId &&
          f.ano === ano &&
          f.mes === mes &&
          f.funcionarioId === func.id
      );

      const trocaFuncaoMes =
        trocaFuncaoPorFuncionario.get(Number(func.id)) || null;

      const funcaoMetaCalculo =
  func.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
    ? "vendedor"
    : func.funcao;

      const isGerenteSaoJose =
  func.funcao === "gerente" && (lojaId === 3 || lojaId === 6);

const tipoMetaEfetivo =
  func.funcao === "consultor_vendas" && (lojaId === 5 || ehConsultorSulMensal(lojaId))
    ? "meta2"
    : func.tipoMeta;

const meta = findMetaForFuncionario({
  funcionarioNome: func.nome,
  funcao: isGerenteSaoJose ? "vendedor" : func.funcao,
  cidade: selectedLoja,
  tipoMeta: tipoMetaEfetivo,
});

      const baseLocal =
        existente ||
        buildEmptyLine({
          ano,
          mes,
          loja_id: lojaId,
          funcionarioId: func.id,
          nome: func.nome,
          funcao: func.funcao,
          tipoMeta: tipoMetaEfetivo,
          regraMeta: meta?.regra || "Sem meta cadastrada",
        });

      const extras = folhaExtrasQuery.data;

      const descontosFuncionario =
        extras?.descontosByFuncionario?.[func.id] || {
          aluguel: 0,
          inss: 0,
          adiant: 0,
          holerite: 0,
        };

      const base = {
        ...baseLocal,
        premiacoesManuais: extras?.premiacoesByFuncionario?.[func.id] || [],
        vales: extras?.valesByFuncionario?.[func.id] || [],
        observacoes: extras?.observacoesByFuncionario?.[func.id] || [],
        aluguel: descontosFuncionario.aluguel,
        inss: descontosFuncionario.inss,
        adiant: descontosFuncionario.adiant,
        holerite: descontosFuncionario.holerite,
      };

     const calculado = computeFolhaLinha({
  meta,
  funcao: funcaoMetaCalculo,
  cidade: selectedLoja,
  funcionarioNome: func.nome,
  tipoMeta: tipoMetaEfetivo,
  sem1: base.sem1,
  sem2: base.sem2,
  sem3: base.sem3,
  sem4: base.sem4,
  percManual1:
  func.funcao === "vendedor" || func.funcao === "mecanico"
    ? null
    : base.percManual1,

percManual2:
  func.funcao === "vendedor" || func.funcao === "mecanico"
    ? null
    : base.percManual2,

percManual3:
  func.funcao === "vendedor" || func.funcao === "mecanico"
    ? null
    : base.percManual3,

percManual4:
  func.funcao === "vendedor" || func.funcao === "mecanico"
    ? null
    : base.percManual4,
  premiacoesManuais: base.premiacoesManuais || [],
  vales: base.vales || [],
  aluguel: base.aluguel,
  inss: base.inss,
  adiant: base.adiant,
  holerite: base.holerite,
});

const calculadoAjustado = { ...calculado };

// Quando a função exercida foi registrada por semana, o percentual e a comissão
// daquela semana são históricos e prevalecem sobre a função atual do cadastro.
// Assim uma mudança Mecânico -> Vendedor no meio do mês não reescreve o passado.
([1, 2, 3, 4] as const).forEach((semana) => {
  const funcaoSemana = (base as any)[`funcaoSemana${semana}`];
  const composicaoSemana = getComposicaoSemana(base as any, semana);
  const possuiHistorico =
    funcaoSemana === "vendedor" ||
    funcaoSemana === "mecanico" ||
    composicaoSemana.length > 0;

  if (!possuiHistorico) return;

  (calculadoAjustado as any)[`perc${semana}`] = Number(
    (base as any)[`perc${semana}`] || 0
  );
  (calculadoAjustado as any)[`com${semana}`] = Number(
    (base as any)[`com${semana}`] || 0
  );
});

// A quinta semana real usa semana=7 no banco para não conflitar com os
// registros internos 5/6 já usados por gerente e ACI.
const sem5Extra = Number((base as any).sem5Extra || 0);
let perc5Extra = Number((base as any).perc5Extra || 0);
let com5Extra = Number((base as any).com5Extra || 0);
const composicaoSem5 = getComposicaoSemana(base as any, 5);
const possuiHistoricoSem5 =
  (base as any).funcaoSemana5 === "vendedor" ||
  (base as any).funcaoSemana5 === "mecanico" ||
  composicaoSem5.length > 0;

if (sem5Extra > 0 && !possuiHistoricoSem5) {
  const funcaoSem5Calculo =
    func.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
      ? "vendedor"
      : func.funcao;
  const metaSem5 = findMetaForFuncionario({
    funcionarioNome: func.nome,
    funcao: funcaoSem5Calculo,
    cidade: selectedLoja,
    tipoMeta: tipoMetaEfetivo,
  });
  const calculoSem5 = computeFolhaLinha({
    meta: metaSem5,
    funcao: funcaoSem5Calculo,
    cidade: selectedLoja,
    funcionarioNome: func.nome,
    tipoMeta: tipoMetaEfetivo,
    sem1: sem5Extra,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    percManual1: Number((base as any).percManual5Extra || 0) > 0
      ? Number((base as any).percManual5Extra)
      : null,
    percManual2: null,
    percManual3: null,
    percManual4: null,
    premiacoesManuais: [],
    vales: [],
    aluguel: 0,
    inss: 0,
    adiant: 0,
    holerite: 0,
  });
  perc5Extra = Number(calculoSem5.perc1 || 0);
  com5Extra = Number(calculoSem5.com1 || 0);
}

(calculadoAjustado as any).sem5Extra = sem5Extra;
(calculadoAjustado as any).perc5Extra = perc5Extra;
(calculadoAjustado as any).com5Extra = com5Extra;

if (
  Number(base.percManual1 || 0) > 0 &&
  base.funcao !== "vendedor" &&
  base.funcao !== "mecanico" &&
  !(base.funcao === "gerente" && (lojaId === 3 || lojaId === 6))
) {
  calculadoAjustado.perc1 = Number(base.percManual1);

  calculadoAjustado.com1 = Number(
    (
      base.funcao === "consultor_vendas"
        ? Number(base.sem1 || 0) * Number(base.percManual1)
        : Number(base.sem1 || 0) * (Number(base.percManual1) / 100)
    ).toFixed(2)
  );
}

if (
  Number(base.percManual2 || 0) > 0 &&
  base.funcao !== "vendedor" &&
  base.funcao !== "mecanico" &&
  !(base.funcao === "gerente" && (lojaId === 3 || lojaId === 6))
) {
  calculadoAjustado.perc2 = Number(base.percManual2);

  calculadoAjustado.com2 = Number(
    (
      base.funcao === "consultor_vendas"
        ? Number(base.sem2 || 0) * Number(base.percManual2)
        : Number(base.sem2 || 0) * (Number(base.percManual2) / 100)
    ).toFixed(2)
  );
}

if (
  Number(base.percManual3 || 0) > 0 &&
  base.funcao !== "vendedor" &&
  base.funcao !== "mecanico" &&
  !(base.funcao === "gerente" && (lojaId === 3 || lojaId === 6))
) {
  calculadoAjustado.perc3 = Number(base.percManual3);

  calculadoAjustado.com3 = Number(
    (
      base.funcao === "consultor_vendas"
        ? Number(base.sem3 || 0) * Number(base.percManual3)
        : Number(base.sem3 || 0) * (Number(base.percManual3) / 100)
    ).toFixed(2)
  );
}

if (
  Number(base.percManual4 || 0) > 0 &&
  base.funcao !== "vendedor" &&
  base.funcao !== "mecanico" &&
  !(base.funcao === "gerente" && (lojaId === 3 || lojaId === 6))
) {
  calculadoAjustado.perc4 = Number(base.percManual4);

  calculadoAjustado.com4 = Number(
    (
      base.funcao === "consultor_vendas"
        ? Number(base.sem4 || 0) * Number(base.percManual4)
        : Number(base.sem4 || 0) * (Number(base.percManual4) / 100)
    ).toFixed(2)
  );
}

if (func.funcao !== "supervisor") {
  calculadoAjustado.totalComissao =
    Number(calculadoAjustado.com1 || 0) +
    Number(calculadoAjustado.com2 || 0) +
    Number(calculadoAjustado.com3 || 0) +
    Number(calculadoAjustado.com4 || 0) +
    Number((calculadoAjustado as any).com5Extra || 0);

  calculadoAjustado.totalLiquidez =
    Number(calculadoAjustado.totalLiquidez || 0) + sem5Extra;
}

// Regra exclusiva mensal dos Consultores de São Leopoldo (6) e Gravataí (7).
// SEM1 representa o Total de Carros do mês.
if (func.funcao === "consultor_vendas" && ehConsultorSulMensal(lojaId)) {
  const calculoConsultorSul = calcularConsultorSulMensal(Number(base.sem1 || 0));
  const premiacaoManualConsultorSul = (base.premiacoesManuais || []).reduce(
    (total: number, item: any) => total + Number(item?.valor || 0),
    0
  );

  calculadoAjustado.perc1 = calculoConsultorSul.valorPorCarro;
  calculadoAjustado.perc2 = 0;
  calculadoAjustado.perc3 = 0;
  calculadoAjustado.perc4 = 0;
  calculadoAjustado.com1 = calculoConsultorSul.comissao;
  calculadoAjustado.com2 = 0;
  calculadoAjustado.com3 = 0;
  calculadoAjustado.com4 = 0;
  (calculadoAjustado as any).com5Extra = 0;
  (calculadoAjustado as any).perc5Extra = 0;
  calculadoAjustado.totalLiquidez = calculoConsultorSul.totalCarros;
  calculadoAjustado.totalComissao = calculoConsultorSul.comissao;
  calculadoAjustado.premiacao = calculoConsultorSul.premiacao + premiacaoManualConsultorSul;
  (calculadoAjustado as any).detalhesPremiacaoConsultorSul = calculoConsultorSul.detalhesPremiacao;
}
const quadrante = getQuadrante(
  lojaId,
  func.funcao,
  ano,
  mes,
  tipoMetaEfetivo
);

if (func.funcao === "supervisor" && lojaId !== 5) {
  const resumo = resumoSupervisorQuery.data as any;

  const totalGrupo =
    Number(resumo?.joinville || 0) +
    Number(resumo?.blumenau || 0) +
    Number(resumo?.saoJose || 0) +
    Number(resumo?.florianopolis || 0);

  const calculoGrupoSupervisor =
  calcularPremiacaoSupervisorGrupo({
    liquidezTotalGrupo: totalGrupo,
  });

calculadoAjustado.premiacao =
  Number(calculadoAjustado.premiacao || 0) +
  Number(calculoGrupoSupervisor.totalPorLoja || 0);
}

if (func.funcao === "supervisor" && lojaId === 5) {
  const calculoAci = calcularSupervisoraAci({
    joinville: Number(base.sem1 || 0),
    blumenau: Number(base.sem2 || 0),
    saoJose: Number(base.sem3 || 0),
    florianopolis: Number(base.sem4 || 0),
    gravatai: Number((base as any).sem5 || 0),
    saoLeopoldo: Number((base as any).sem6 || 0),
  });

  calculadoAjustado.com1 = 0;
  calculadoAjustado.com2 = 0;
  calculadoAjustado.com3 = 0;
  calculadoAjustado.com4 = 0;
  calculadoAjustado.totalLiquidez = calculoAci.totalCarros;
  calculadoAjustado.totalComissao = calculoAci.comissao;

  (calculadoAjustado as any).aciTotalCarros = calculoAci.totalCarros;
  (calculadoAjustado as any).aciValorPorCarro = calculoAci.valorPorCarro;
  (calculadoAjustado as any).aciTotalComFixo = calculoAci.totalComFixo;
}

if (
  func.funcao === "gerente" &&
  (lojaId === 3 || lojaId === 6)
) {
  const liquidezLoja = Number((base as any).liquidezLojaGerente || 0);

  const metaGerente = findMetaForFuncionario({
    funcionarioNome: func.nome,
    funcao: "gerente",
    cidade: selectedLoja,
    tipoMeta: func.tipoMeta,
  });

  const calculoLoja = computeFolhaLinha({
    meta: metaGerente,
    funcao: "gerente",
    cidade: selectedLoja,
    funcionarioNome: func.nome,
    tipoMeta: func.tipoMeta,
    sem1: liquidezLoja,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    premiacoesManuais: [],
    vales: [],
    aluguel: 0,
    inss: 0,
    adiant: 0,
    holerite: 0,
  });

  (calculadoAjustado as any).percLojaGerente = calculoLoja.perc1;
  (calculadoAjustado as any).comLojaGerente = calculoLoja.com1;

  calculadoAjustado.totalComissao =
    Number(calculadoAjustado.com1 || 0) +
    Number(calculadoAjustado.com2 || 0) +
    Number(calculadoAjustado.com3 || 0) +
    Number(calculadoAjustado.com4 || 0) +
    Number((calculadoAjustado as any).com5Extra || 0) +
    Number(calculoLoja.com1 || 0);
}

const premiacaoEspecial =
  calcularPremiacaoEspecialFuncionario({
    lojaId,
    funcionarioNome: func.nome,
    funcionariosDaLoja: resumoFuncionariosLoja,
  });

if (premiacaoEspecial.total > 0) {
  calculadoAjustado.premiacao =
    Number(calculadoAjustado.premiacao || 0) +
    Number(premiacaoEspecial.total || 0);

  (calculadoAjustado as any).detalhesPremiacaoEspecial =
    premiacaoEspecial.detalhes;
}

let comissaoFuncaoAnterior = 0;
let descontoFolhaProporcional: number | null = null;
let proporcaoNovaFuncao: number | null = null;
let diasFuncaoAnterior: number | null = null;
let diasFuncaoNova: number | null = null;

if (trocaFuncaoMes) {
  if (trocaFuncaoMes.funcaoAnterior === "recepcionista") {
    const configRecepcaoAnterior = getRecepcaoConfig(func.nome, selectedLoja);
    const quantidadeVendas = Number(trocaFuncaoMes.quantidadeAnterior1 || 0);
    const quantidadeEntradas = Number(trocaFuncaoMes.quantidadeAnterior2 || 0);
    const usaEntradas = lojaId === 3 || lojaId === 4;

    comissaoFuncaoAnterior = Number(
      (
        quantidadeVendas * Number(configRecepcaoAnterior.valorVenda || 0) +
        (usaEntradas
          ? quantidadeEntradas * Number(configRecepcaoAnterior.valorEntrada || 0)
          : 0)
      ).toFixed(2)
    );

    calculadoAjustado.totalComissao = Number(
      (Number(calculadoAjustado.totalComissao || 0) + comissaoFuncaoAnterior).toFixed(2)
    );
  }

  const proporcao = calcularProporcaoTrocaFuncao(
    trocaFuncaoMes.dataMudanca,
    ano,
    mes
  );

  if (proporcao) {
    proporcaoNovaFuncao = proporcao.proporcaoNovaFuncao;
    diasFuncaoAnterior = proporcao.diasFuncaoAnterior;
    diasFuncaoNova = proporcao.diasFuncaoNova;

    if (
      funcaoAnteriorUsaFolhaFixa(
        trocaFuncaoMes.funcaoAnterior,
        lojaId,
        ano,
        mes
      ) &&
      quadranteDescontaFolhaCompleta(quadrante)
    ) {
      descontoFolhaProporcional = Number(
        (
          (Number(base.inss || 0) +
            Number(base.adiant || 0) +
            Number(base.holerite || 0)) *
          proporcao.proporcaoNovaFuncao
        ).toFixed(2)
      );
    }
  }
}

const boletoAjustado = calcularBoletoAjustado({
  quadrante,
  funcao: func.funcao,
  lojaId,
  funcionarioNome: func.nome,
  totalComissao: calculadoAjustado.totalComissao,
  premiacao: calculadoAjustado.premiacao,
  vale: calculadoAjustado.vale,
  aluguel: base.aluguel,
  inss: base.inss,
  adiant: base.adiant,
  holerite: base.holerite,
  descontoFolhaProporcional,
  boletoOriginal: calculadoAjustado.boleto,
});

return {
  ...base,
  tipoMeta: tipoMetaEfetivo,
  regraMeta: meta?.regra || "Sem meta cadastrada",
  quadrante,
  ...calculadoAjustado,
  trocaFuncaoMes,
  comissaoFuncaoAnterior,
  descontoFolhaProporcional,
  proporcaoNovaFuncao,
  diasFuncaoAnterior,
  diasFuncaoNova,
  boleto: boletoAjustado,
};

}).filter(Boolean) as LinhaComQuadrante[];
   }, [
  funcionariosDaCidade,
  folhas,
  lojaId,
  ano,
  mes,
  selectedLoja,
  folhaExtrasQuery.data,
  resumoSupervisorQuery.data,
  trocaFuncaoPorFuncionario,
]);

  const funcionariosImportaveis = useMemo(() => {
    return funcionariosDaCidade.filter((funcionario: any) => {
      if (funcionario.funcao === "vendedor" || funcionario.funcao === "mecanico") {
        return true;
      }

      // O gerente de São José, Florianópolis e São Leopoldo também participa do bloco VENDA
      // para preencher a liquidez de venda.
      if (
        funcionario.funcao === "gerente" &&
        (Number(lojaId) === 3 || Number(lojaId) === 4 || Number(lojaId) === 6)
      ) {
        return true;
      }

      return false;
    });
  }, [funcionariosDaCidade, lojaId]);

  // Ao voltar do cadastro de funcionários durante uma importação, a lista da loja
  // é carregada novamente. Se o funcionário acabou de ser cadastrado com o mesmo
  // nome e função do relatório, promovemos automaticamente a divergência para OK.
  // Assim ele deixa de aparecer como “Cadastrar funcionário” sem precisar reabrir
  // ou reenviar o arquivo.
  useEffect(() => {
    if (importacaoSemana.etapa !== "conferencia") return;
    if (funcionariosDaCidade.length === 0) return;

    setImportacaoSemana((prev) => {
      if (prev.etapa !== "conferencia") return prev;

      let mudou = false;
      const itens = prev.itens.map((item) => {
        if (item.status === "ok" || item.status === "ignorado") return item;

        const candidatoPersistido = item.candidatoId
          ? funcionariosDaCidade.find(
              (funcionario: any) =>
                Number(funcionario.id) === Number(item.candidatoId)
            )
          : null;

        // Ao voltar da tela de cadastro/troca de função, preservamos o candidato
        // que já havia sido identificado antes de navegar. Se a troca foi confirmada
        // e a função agora é compatível com o bloco do relatório, promovemos para OK
        // mesmo que o nome no relatório tenha uma pequena diferença de sobrenome.
        if (candidatoPersistido) {
          const funcaoCompativelCandidato =
            item.funcaoRelatorio === "mecanico"
              ? candidatoPersistido.funcao === "mecanico"
              : candidatoPersistido.funcao === "vendedor" ||
                (candidatoPersistido.funcao === "gerente" &&
                  (Number(lojaId) === 3 ||
                    Number(lojaId) === 4 ||
                    Number(lojaId) === 6));

          if (funcaoCompativelCandidato) {
            mudou = true;
            return {
              ...item,
              funcionarioId: Number(candidatoPersistido.id),
              funcionarioNome: candidatoPersistido.nome,
              status: "ok" as const,
              candidatoId: null,
              candidatoNome: null,
              scoreCandidato: 1,
            };
          }
        }

        const nomeCanonico = normalizarNomeImportacao(item.nomeRelatorio);
        const correspondenciasMesmoNome = funcionariosDaCidade.filter(
          (funcionario: any) =>
            normalizarNomeImportacao(funcionario.nome) === nomeCanonico
        );

        // Nome exato e único na loja: nunca tratamos como novo funcionário.
        // Se a função/bloco também bater, vinculamos automaticamente. Se o bloco
        // do relatório divergir, deixamos uma confirmação manual para não alterar
        // regra financeira silenciosamente.
        if (correspondenciasMesmoNome.length !== 1) return item;

        const funcionario = correspondenciasMesmoNome[0];
        const funcaoCompativel =
          item.funcaoRelatorio === "mecanico"
            ? funcionario.funcao === "mecanico"
            : funcionario.funcao === "vendedor" ||
              (funcionario.funcao === "gerente" &&
                (Number(lojaId) === 3 ||
                  Number(lojaId) === 4 ||
                  Number(lojaId) === 6));

        mudou = true;

        if (!funcaoCompativel) {
          return {
            ...item,
            funcionarioId: null,
            funcionarioNome: null,
            status: "possivel" as const,
            candidatoId: Number(funcionario.id),
            candidatoNome: funcionario.nome,
            scoreCandidato: 1,
          };
        }

        return {
          ...item,
          funcionarioId: Number(funcionario.id),
          funcionarioNome: funcionario.nome,
          status: "ok" as const,
          candidatoId: null,
          candidatoNome: null,
          scoreCandidato: 1,
        };
      });

      return mudou ? { ...prev, itens } : prev;
    });
  }, [
    importacaoSemana.etapa,
    funcionariosDaCidade,
    funcionariosImportaveis,
    lojaId,
  ]);

  // Retorno explícito após cadastrar um funcionário a partir da conferência semanal.
  // O vínculo usa o item original da importação + o ID retornado pelo cadastro,
  // então não depende de o nome digitado ficar 100% idêntico ao nome do relatório.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (importacaoSemana.etapa !== "conferencia") return;
    if (funcionariosDaCidade.length === 0) return;

    const raw = window.sessionStorage.getItem(CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY);
    if (!raw) return;

    try {
      const concluido = JSON.parse(raw);
      if (concluido?.origem !== "importacao-semanal") return;
      if (Number(concluido?.lojaId || 0) !== Number(lojaId)) return;

      const funcionarioId = Number(concluido?.funcionarioId || 0);
      if (!funcionarioId) return;

      const funcionario = funcionariosDaCidade.find(
        (item: any) => Number(item.id) === funcionarioId
      );
      if (!funcionario) return;

      const itemAlvo = importacaoSemana.itens.find((item) => {
        if (concluido?.itemId && item.id === concluido.itemId) return true;
        return (
          item.status !== "ok" &&
          item.status !== "ignorado" &&
          normalizarNomeImportacao(item.nomeRelatorio) ===
            normalizarNomeImportacao(String(concluido?.nomeRelatorio || ""))
        );
      });
      if (!itemAlvo) return;

      const funcaoCompativel =
        itemAlvo.funcaoRelatorio === "mecanico"
          ? funcionario.funcao === "mecanico"
          : funcionario.funcao === "vendedor" ||
            (funcionario.funcao === "gerente" &&
              (Number(lojaId) === 3 ||
                Number(lojaId) === 4 ||
                Number(lojaId) === 6));

      setImportacaoSemana((prev) => ({
        ...prev,
        itens: prev.itens.map((item) => {
          const mesmoItem = concluido?.itemId
            ? item.id === concluido.itemId
            : item.id === itemAlvo.id;
          if (!mesmoItem) return item;

          if (!funcaoCompativel) {
            return {
              ...item,
              funcionarioId: null,
              funcionarioNome: null,
              status: "possivel" as const,
              candidatoId: funcionarioId,
              candidatoNome: funcionario.nome,
              scoreCandidato: 1,
            };
          }

          return {
            ...item,
            funcionarioId,
            funcionarioNome: funcionario.nome,
            status: "ok" as const,
            candidatoId: null,
            candidatoNome: null,
            scoreCandidato: 1,
          };
        }),
      }));

      if (funcaoCompativel) {
        salvarAliasImportacao(lojaId, itemAlvo.nomeRelatorio, funcionarioId);
      }

      window.sessionStorage.removeItem(CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY);
      window.sessionStorage.removeItem(CADASTRO_RETORNO_FOLHA_STORAGE_KEY);
    } catch (error) {
      console.error("Erro ao concluir retorno do cadastro para a importação:", error);
      window.sessionStorage.removeItem(CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY);
    }
  }, [
    importacaoSemana.etapa,
    importacaoSemana.itens,
    funcionariosDaCidade,
    lojaId,
  ]);

  const funcionariosAusentesNoRelatorio = useMemo(() => {
    if (importacaoSemana.etapa !== "conferencia") return [] as any[];

    const idsEncontrados = new Set(
      importacaoSemana.itens
        .filter((item) => item.status === "ok" && item.funcionarioId)
        .map((item) => Number(item.funcionarioId))
    );

    return funcionariosImportaveis.filter(
      (funcionario: any) => !idsEncontrados.has(Number(funcionario.id))
    );
  }, [importacaoSemana.etapa, importacaoSemana.itens, funcionariosImportaveis]);

  const funcionariosAusentesNoPdfAdiantamento = useMemo(() => {
    if (importacaoAdiantamento.etapa !== "conferencia") return [] as LinhaComQuadrante[];

    const idsEncontrados = new Set(
      importacaoAdiantamento.itens
        .filter((item) => item.status === "ok" && item.funcionarioId)
        .map((item) => Number(item.funcionarioId))
    );

    // Supervisor já é um quadrante explicitamente PJ e não deve gerar alerta
    // por não constar no recibo de adiantamento. Demais casos PJ podem ser
    // simplesmente mantidos como estão até adicionarmos o campo CLT/PJ no cadastro.
    return linhas.filter(
      (linha) =>
        linha.quadrante !== "supervisor_pj" &&
        linha.quadrante !== "supervisora_consultores_pj" &&
        !idsEncontrados.has(Number(linha.funcionarioId))
    );
  }, [
    importacaoAdiantamento.etapa,
    importacaoAdiantamento.itens,
    linhas,
  ]);


  const funcionariosAusentesNoPdfHolerite = useMemo(() => {
    if (importacaoHolerite.etapa !== "conferencia") return [] as LinhaComQuadrante[];

    const idsEncontrados = new Set(
      importacaoHolerite.itens
        .filter((item) => item.status === "ok" && item.funcionarioId)
        .map((item) => Number(item.funcionarioId))
    );

    // Supervisor PJ não recebe folha CLT. Demais vínculos PJ podem ser mantidos
    // sem alteração até adicionarmos o campo CLT/PJ no cadastro.
    return linhas.filter(
      (linha) =>
        linha.quadrante !== "supervisor_pj" &&
        linha.quadrante !== "supervisora_consultores_pj" &&
        !idsEncontrados.has(Number(linha.funcionarioId))
    );
  }, [
    importacaoHolerite.etapa,
    importacaoHolerite.itens,
    linhas,
  ]);

  useEffect(() => {
    if (importacaoRestaurada || typeof window === "undefined") return;

    setImportacaoRestaurada(true);

    try {
      const raw = window.sessionStorage.getItem(IMPORT_PENDENTE_STORAGE_KEY);
      if (!raw) return;

      const pendente = JSON.parse(raw);
      window.sessionStorage.removeItem(IMPORT_PENDENTE_STORAGE_KEY);

      if (pendente?.selectedLoja) setSelectedLoja(String(pendente.selectedLoja));
      if (pendente?.ano) setAno(Number(pendente.ano));
      if (pendente?.mes) setMes(Number(pendente.mes));
      if (pendente?.importacao) {
        setImportacaoSemana({
          ...pendente.importacao,
          open: true,
          etapa: "conferencia",
        });
      }
    } catch (err) {
      console.error("Erro ao restaurar importação pendente:", err);
    }
  }, [importacaoRestaurada]);

  useEffect(() => {
    if (importacaoAdiantamentoRestaurada || typeof window === "undefined") return;

    setImportacaoAdiantamentoRestaurada(true);

    try {
      const raw = window.sessionStorage.getItem(
        IMPORT_ADIANT_PENDENTE_STORAGE_KEY
      );
      if (!raw) return;

      const pendente = JSON.parse(raw);
      window.sessionStorage.removeItem(IMPORT_ADIANT_PENDENTE_STORAGE_KEY);

      if (pendente?.selectedLoja) setSelectedLoja(String(pendente.selectedLoja));
      if (pendente?.ano) setAno(Number(pendente.ano));
      if (pendente?.mes) setMes(Number(pendente.mes));
      if (pendente?.importacao) {
        setImportacaoAdiantamento({
          ...pendente.importacao,
          open: true,
          etapa: "conferencia",
        });
      }
    } catch (err) {
      console.error("Erro ao restaurar importação de adiantamento:", err);
    }
  }, [importacaoAdiantamentoRestaurada]);

  useEffect(() => {
    if (importacaoHoleriteRestaurada || typeof window === "undefined") return;

    setImportacaoHoleriteRestaurada(true);

    try {
      const raw = window.sessionStorage.getItem(
        IMPORT_HOLERITE_PENDENTE_STORAGE_KEY
      );
      if (!raw) return;

      const pendente = JSON.parse(raw);
      window.sessionStorage.removeItem(IMPORT_HOLERITE_PENDENTE_STORAGE_KEY);

      if (pendente?.selectedLoja) setSelectedLoja(String(pendente.selectedLoja));
      if (pendente?.ano) setAno(Number(pendente.ano));
      if (pendente?.mes) setMes(Number(pendente.mes));
      if (pendente?.importacao) {
        setImportacaoHolerite({
          ...pendente.importacao,
          open: true,
          etapa: "conferencia",
        });
      }
    } catch (err) {
      console.error("Erro ao restaurar importação de holerite:", err);
    }
  }, [importacaoHoleriteRestaurada]);

  // Mantém a conferência do Holerite sincronizada com o cadastro de funcionários.
  // 1) Se o cadastro acabou de nascer a partir desta tela, usa o ID retornado pelo RH.
  // 2) Se o funcionário já foi cadastrado e o nome bate exatamente, resolve a
  //    divergência automaticamente. Isso também corrige conferências que ficaram
  //    abertas antes desta melhoria.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (importacaoHolerite.etapa !== "conferencia") return;

    const candidatos = linhas.filter(
      (linha) =>
        linha.quadrante !== "supervisor_pj" &&
        linha.quadrante !== "supervisora_consultores_pj"
    );

    if (candidatos.length === 0) return;

    const rawConcluido = window.sessionStorage.getItem(
      CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY
    );

    if (rawConcluido) {
      try {
        const concluido = JSON.parse(rawConcluido);

        if (
          concluido?.origem === "importacao-holerite" &&
          Number(concluido?.lojaId || 0) === Number(lojaId)
        ) {
          const funcionarioId = Number(concluido?.funcionarioId || 0);
          const funcionario = candidatos.find(
            (linha) => Number(linha.funcionarioId) === funcionarioId
          );

          const itemAlvo = importacaoHolerite.itens.find((item) => {
            if (concluido?.itemId && item.id === concluido.itemId) return true;
            return (
              item.status !== "ok" &&
              item.status !== "ignorado" &&
              normalizarNomeImportacao(item.nomePdf) ===
                normalizarNomeImportacao(String(concluido?.nomePdf || ""))
            );
          });

          if (funcionarioId && funcionario && itemAlvo) {
            setImportacaoHolerite((prev) => ({
              ...prev,
              itens: prev.itens.map((item) =>
                item.id === itemAlvo.id
                  ? {
                      ...item,
                      status: "ok" as const,
                      funcionarioId,
                      funcionarioNome: funcionario.nome,
                      candidatoId: null,
                      candidatoNome: null,
                      scoreCandidato: 1,
                    }
                  : item
              ),
            }));

            salvarAliasImportacao(lojaId, itemAlvo.nomePdf, funcionarioId);
            window.sessionStorage.removeItem(CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY);
            window.sessionStorage.removeItem(CADASTRO_RETORNO_FOLHA_STORAGE_KEY);
            return;
          }
        }
      } catch (error) {
        console.error("Erro ao concluir retorno do cadastro para o Holerite:", error);
        window.sessionStorage.removeItem(CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY);
      }
    }

    // Também resolve automaticamente nomes exatos que já foram cadastrados enquanto
    // esta conferência estava aberta. Só aceita nome canônico único (ou alias já salvo),
    // evitando vincular silenciosamente pessoas parecidas.
    const aliases = lerAliasesImportacao();
    const resolucoes = new Map<string, LinhaComQuadrante>();

    for (const item of importacaoHolerite.itens) {
      if (item.status === "ok" || item.status === "ignorado") continue;

      const chaveAlias = `${lojaId}:${normalizarTextoImportacao(item.nomePdf)}`;
      const aliasId = aliases[chaveAlias];
      const porAlias = aliasId
        ? candidatos.find(
            (linha) => Number(linha.funcionarioId) === Number(aliasId)
          )
        : null;

      const nomeCanonico = normalizarNomeImportacao(item.nomePdf);
      const exatos = candidatos.filter(
        (linha) => normalizarNomeImportacao(linha.nome) === nomeCanonico
      );
      const exatoUnico = exatos.length === 1 ? exatos[0] : null;
      const escolhido = porAlias || exatoUnico;

      if (escolhido) {
        resolucoes.set(item.id, escolhido);
      }
    }

    if (resolucoes.size === 0) return;

    setImportacaoHolerite((prev) => ({
      ...prev,
      itens: prev.itens.map((item) => {
        const funcionario = resolucoes.get(item.id);
        if (!funcionario) return item;

        return {
          ...item,
          status: "ok" as const,
          funcionarioId: Number(funcionario.funcionarioId),
          funcionarioNome: funcionario.nome,
          candidatoId: null,
          candidatoNome: null,
          scoreCandidato: 1,
        };
      }),
    }));

    for (const [itemId, funcionario] of resolucoes.entries()) {
      const item = importacaoHolerite.itens.find((row) => row.id === itemId);
      if (item) {
        salvarAliasImportacao(
          lojaId,
          item.nomePdf,
          Number(funcionario.funcionarioId)
        );
      }
    }
  }, [importacaoHolerite.etapa, importacaoHolerite.itens, linhas, lojaId]);

  function garantirCompetenciaAberta() {
    if (!mesFechado) return true;
    setBloqueioAvisoOpen(true);
    return false;
  }

  async function fecharMesAtual() {
    if (!podeGerenciarFechamento || mesFechado) return;

    const nomeLoja = LOJAS.find((loja) => loja.id === lojaId)?.nome || `Loja ${lojaId}`;
    const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const confirmar = window.confirm(
      `Fechar ${nomeMes} de ${nomeLoja}?\n\nDepois do fechamento, valores, premiações, vales, observações e importações ficarão bloqueados até a competência ser reaberta com senha.`
    );

    if (!confirmar) return;

    try {
      setErroFechamento("");
      await fecharMesMutation.mutateAsync({ lojaId, ano, mes });
      setCellEditor((prev) => ({ ...prev, open: false }));
      setPremioEditor((prev) => ({ ...prev, open: false }));
      setObsEditor((prev) => ({ ...prev, open: false }));
      setValeEditor((prev) => ({ ...prev, open: false }));
      setNegativoEditor({ open: false, linha: null });
      setRegraSemanaEditor({ open: false, linha: null, semana: null });
      setImportacaoSemana((prev) => ({ ...prev, open: false }));
      setImportacaoAdiantamento((prev) => ({ ...prev, open: false }));
      setImportacaoHolerite((prev) => ({ ...prev, open: false }));
    } catch (err: any) {
      setErroFechamento(err?.message || "Não foi possível fechar a competência.");
    }
  }

  async function confirmarReaberturaMes() {
    if (!senhaReabertura.trim()) {
      setErroFechamento("Informe sua senha para reabrir a competência.");
      return;
    }

    try {
      setErroFechamento("");
      await reabrirMesMutation.mutateAsync({
        lojaId,
        ano,
        mes,
        password: senhaReabertura,
      });
    } catch (err: any) {
      setErroFechamento(
        err?.message || "Senha inválida ou não foi possível reabrir a competência."
      );
    }
  }

  async function ativarSem5Competencia() {
    if (!garantirCompetenciaAberta()) return;
    if (!usaMetaSemanal(lojaId, ano, mes) || sem5Ativa) return;

    const confirmar = window.confirm(
      `Adicionar a SEM5 em ${String(mes).padStart(2, "0")}/${ano}?\n\nEla ficará disponível somente nesta competência e poderá receber o quinto relatório semanal.`
    );
    if (!confirmar) return;

    try {
      await ativarSem5Mutation.mutateAsync({ lojaId, ano, mes });
    } catch (error: any) {
      console.error("Erro ao ativar SEM5:", error);
      alert(error?.message || "Não foi possível adicionar a SEM5.");
    }
  }

  async function desativarSem5Competencia() {
    if (!garantirCompetenciaAberta()) return;
    if (!usaMetaSemanal(lojaId, ano, mes) || !sem5Ativa) return;

    const confirmar = window.confirm(
      `Remover a SEM5 de ${String(mes).padStart(2, "0")}/${ano}?

A remoção só será permitida se a quinta semana estiver sem lançamentos.`
    );
    if (!confirmar) return;

    try {
      await desativarSem5Mutation.mutateAsync({ lojaId, ano, mes });
    } catch (error: any) {
      console.error("Erro ao desativar SEM5:", error);
      alert(
        error?.message ||
          "Não foi possível remover a SEM5. Verifique se existem lançamentos na quinta semana."
      );
    }
  }

  function openImportacaoSemana(semana: SemanaImportacao) {
    if (!garantirCompetenciaAberta()) return;
    if (semana === 5 && !sem5Ativa) return;

    const importacaoSemanalPermitida = usaMetaSemanal(lojaId, ano, mes);
    const importacaoMensalFlorianopolis = lojaId === 4 && usaMetaMensal(lojaId, ano, mes);

    if (!importacaoSemanalPermitida && !importacaoMensalFlorianopolis) return;

    // Florianópolis usa um único campo mensal. Internamente ele continua
    // armazenado em sem1, então a importação mensal grava nesse campo.
    setImportacaoSemana(
      criarImportacaoInicial(importacaoMensalFlorianopolis ? 1 : semana)
    );
  }

  function fecharImportacaoSemana() {
    setImportacaoSemana((prev) => ({ ...prev, open: false }));
  }

  async function processarArquivoImportacao(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportacaoSemana((prev) => ({
        ...prev,
        erro: "Selecione um arquivo Excel no formato .xlsx.",
      }));
      return;
    }

    setImportacaoSemana((prev) => ({
      ...prev,
      etapa: "lendo",
      arquivoNome: file.name,
      erro: "",
      mensagem: "",
    }));

    try {
      const rows = (await readSheet(file)) as unknown[][];
      const extraido = extrairDadosRelatorioSemanal(rows);

      if (extraido.itens.length === 0) {
        throw new Error(
          "Não encontrei os blocos VENDA/MECÂNICA com a coluna LIQ. S/ PNEUS."
        );
      }

      const aliases = lerAliasesImportacao();
      const itens: ItemRelatorioImportacao[] = extraido.itens.map((item, index) => {
        const chaveAlias = `${lojaId}:${normalizarTextoImportacao(item.nomeRelatorio)}`;
        const aliasId = aliases[chaveAlias];

        const candidatosFuncao = funcionariosImportaveis.filter(
          (funcionario: any) => {
            if (item.funcaoRelatorio === "mecanico") {
              return funcionario.funcao === "mecanico";
            }

            if (item.funcaoRelatorio === "vendedor") {
              if (funcionario.funcao === "vendedor") return true;

              // No relatório, gerente aparece dentro do bloco VENDA.
              if (
                funcionario.funcao === "gerente" &&
                (Number(lojaId) === 3 || Number(lojaId) === 4 || Number(lojaId) === 6)
              ) {
                return true;
              }
            }

            return false;
          }
        );

        // Alias já confirmado pelo usuário deve continuar valendo mesmo se o
        // funcionário aparecer em outro bloco do relatório (VENDA/MECÂNICA).
        const porAlias = aliasId
          ? funcionariosImportaveis.find((f: any) => Number(f.id) === Number(aliasId))
          : null;

        const nomeCanonico = normalizarNomeImportacao(item.nomeRelatorio);
        const exatosMesmoNome = funcionariosDaCidade.filter(
          (funcionario: any) =>
            normalizarNomeImportacao(funcionario.nome) === nomeCanonico
        );
        const exatoQualquerFuncao =
          exatosMesmoNome.length === 1 ? exatosMesmoNome[0] : null;

        const exato = candidatosFuncao.find(
          (funcionario: any) =>
            normalizarNomeImportacao(funcionario.nome) === nomeCanonico
        );

        const escolhido = porAlias || exato;

        if (escolhido) {
          return {
            id: `${item.funcaoRelatorio}-${index}-${normalizarTextoImportacao(item.nomeRelatorio)}`,
            nomeRelatorio: item.nomeRelatorio,
            funcaoRelatorio: item.funcaoRelatorio,
            valor: item.valor,
            funcionarioId: Number(escolhido.id),
            funcionarioNome: escolhido.nome,
            status: "ok" as const,
            candidatoId: null,
            candidatoNome: null,
            scoreCandidato: 1,
          };
        }

        // Se o nome é exatamente o mesmo na mesma cidade, nunca oferecemos
        // cadastrar outra pessoa. Se ele já é Vendedor/Mecânico, podemos apenas
        // vincular o bloco semanal. Se vem de Recepção/Salário Fixo, a conferência
        // direciona para “Trocar função” antes de permitir a importação.
        if (exatoQualquerFuncao) {
          return {
            id: `${item.funcaoRelatorio}-${index}-${normalizarTextoImportacao(item.nomeRelatorio)}`,
            nomeRelatorio: item.nomeRelatorio,
            funcaoRelatorio: item.funcaoRelatorio,
            valor: item.valor,
            funcionarioId: null,
            funcionarioNome: null,
            status: "possivel" as const,
            candidatoId: Number(exatoQualquerFuncao.id),
            candidatoNome: exatoQualquerFuncao.nome,
            scoreCandidato: 1,
          };
        }

        const candidatosOrdenados = candidatosFuncao
          .map((funcionario: any) => ({
            funcionario,
            score: scoreNomesImportacao(item.nomeRelatorio, funcionario.nome),
          }))
          .sort((a, b) => b.score - a.score);

        const candidatosQualquerFuncaoOrdenados = funcionariosDaCidade
          .map((funcionario: any) => ({
            funcionario,
            score: scoreNomesImportacao(item.nomeRelatorio, funcionario.nome),
          }))
          .sort((a, b) => b.score - a.score);

        const melhorCompativel = candidatosOrdenados[0];
        const melhorQualquerFuncao = candidatosQualquerFuncaoOrdenados[0];
        const segundoQualquerFuncao = candidatosQualquerFuncaoOrdenados[1];

        // Para troca de função, aceitamos também nomes em que o relatório acrescentou
        // ou retirou um sobrenome (ex.: "LEONARDO APOLINARIO" x
        // "LEONARDO APOLINARIO COSTA"). Nunca vinculamos automaticamente: mostramos
        // o cadastro encontrado para o usuário confirmar a troca. A diferença mínima
        // para o segundo candidato evita sugerir uma pessoa quando o nome é ambíguo.
        const melhorQualquerFuncaoSeguro =
          melhorQualquerFuncao &&
          melhorQualquerFuncao.score >= 0.6 &&
          (!segundoQualquerFuncao ||
            melhorQualquerFuncao.score - segundoQualquerFuncao.score >= 0.15)
            ? melhorQualquerFuncao
            : null;

        const melhor =
          melhorCompativel && melhorCompativel.score >= 0.55
            ? melhorCompativel
            : melhorQualquerFuncaoSeguro;
        const ehPossivel = !!melhor;

        return {
          id: `${item.funcaoRelatorio}-${index}-${normalizarTextoImportacao(item.nomeRelatorio)}`,
          nomeRelatorio: item.nomeRelatorio,
          funcaoRelatorio: item.funcaoRelatorio,
          valor: item.valor,
          funcionarioId: null,
          funcionarioNome: null,
          status: ehPossivel ? "possivel" : "nao_cadastrado",
          candidatoId: ehPossivel ? Number(melhor?.funcionario.id) : null,
          candidatoNome: ehPossivel ? melhor?.funcionario.nome ?? null : null,
          scoreCandidato: ehPossivel ? Number(melhor?.score || 0) : 0,
        };
      });

      setImportacaoSemana((prev) => ({
        ...prev,
        etapa: "conferencia",
        periodo: extraido.periodo,
        cidadeRelatorio: extraido.cidadeRelatorio,
        itens,
        erro: "",
      }));
    } catch (err: any) {
      setImportacaoSemana((prev) => ({
        ...prev,
        etapa: "arquivo",
        erro: err?.message || "Não foi possível ler o relatório.",
      }));
    }
  }

  function funcionariosSelecionaveisParaItem(item: ItemRelatorioImportacao) {
    return funcionariosImportaveis
      .filter((funcionario: any) => {
        if (item.funcaoRelatorio === "mecanico") {
          return funcionario.funcao === "mecanico";
        }

        if (item.funcaoRelatorio === "vendedor") {
          if (funcionario.funcao === "vendedor") return true;

          return (
            funcionario.funcao === "gerente" &&
            (Number(lojaId) === 3 || Number(lojaId) === 4 || Number(lojaId) === 6)
          );
        }

        return false;
      })
      .slice()
      .sort((a: any, b: any) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
      );
  }

  function vincularItemImportacao(itemId: string, funcionarioId: number) {
    const funcionario = funcionariosImportaveis.find(
      (f: any) => Number(f.id) === Number(funcionarioId)
    );
    if (!funcionario) return;

    setImportacaoSemana((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "ok",
              funcionarioId: Number(funcionario.id),
              funcionarioNome: funcionario.nome,
              candidatoId: null,
              candidatoNome: null,
              scoreCandidato: 1,
            }
          : item
      ),
    }));

    const item = importacaoSemana.itens.find((row) => row.id === itemId);
    if (item) {
      salvarAliasImportacao(lojaId, item.nomeRelatorio, Number(funcionario.id));
    }
  }

  function resolverConflitoFuncaoImportacao(
    funcionarioId: number,
    funcaoEscolhida: FuncaoImportacao
  ) {
    const funcionario = funcionariosImportaveis.find(
      (f: any) => Number(f.id) === Number(funcionarioId)
    );
    if (!funcionario) return;

    setImportacaoSemana((prev) => ({
      ...prev,
      erro: "",
      itens: prev.itens.map((item) => {
        const idEfetivo = Number(item.funcionarioId || item.candidatoId || 0);
        if (idEfetivo !== Number(funcionarioId)) return item;

        if (item.funcaoRelatorio === funcaoEscolhida) {
          return {
            ...item,
            status: "ok" as const,
            funcionarioId: Number(funcionario.id),
            funcionarioNome: funcionario.nome,
            candidatoId: null,
            candidatoNome: null,
            scoreCandidato: 1,
          };
        }

        return {
          ...item,
          status: "ignorado" as const,
          funcionarioId: null,
          funcionarioNome: null,
          candidatoId: null,
          candidatoNome: null,
        };
      }),
    }));

    const itemEscolhido = importacaoSemana.itens.find((item) => {
      const idEfetivo = Number(item.funcionarioId || item.candidatoId || 0);
      return (
        idEfetivo === Number(funcionarioId) &&
        item.funcaoRelatorio === funcaoEscolhida
      );
    });

    if (itemEscolhido) {
      salvarAliasImportacao(lojaId, itemEscolhido.nomeRelatorio, Number(funcionario.id));
    }
  }

  function ignorarItemImportacao(itemId: string) {
    setImportacaoSemana((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "ignorado",
              funcionarioId: null,
              funcionarioNome: null,
            }
          : item
      ),
    }));
  }

  function salvarImportacaoPendente() {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      IMPORT_PENDENTE_STORAGE_KEY,
      JSON.stringify({
        selectedLoja,
        ano,
        mes,
        importacao: importacaoSemana,
      })
    );
  }

  function candidatoImportacaoPorId(item: ItemRelatorioImportacao) {
    if (!item.candidatoId) return null;
    return (
      funcionariosDaCidade.find(
        (funcionario: any) => Number(funcionario.id) === Number(item.candidatoId)
      ) || null
    );
  }

  function itemExigeTrocaFuncao(item: ItemRelatorioImportacao) {
    if (item.status !== "possivel" || !item.candidatoId) return false;
    const candidato = candidatoImportacaoPorId(item);
    if (!candidato) return false;

    return !funcionariosImportaveis.some(
      (funcionario: any) => Number(funcionario.id) === Number(candidato.id)
    );
  }

  function irParaTrocarFuncaoExistente(item: ItemRelatorioImportacao) {
    const funcionario = candidatoImportacaoPorId(item);
    if (!funcionario || typeof window === "undefined") return;

    salvarImportacaoPendente();
    window.sessionStorage.setItem(
      "folha-funcionario-abrir-id",
      String(funcionario.id)
    );
    window.sessionStorage.setItem(
      "folha-funcionario-abrir-loja-id",
      String(lojaId)
    );
    window.sessionStorage.setItem(
      "folha-troca-funcao-sugerida-v1",
      JSON.stringify({
        novaFuncao: item.funcaoRelatorio,
        funcionarioId: Number(funcionario.id),
        lojaId,
        ano,
        mes,
      })
    );

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  function irParaCadastrarFuncionario(item: ItemRelatorioImportacao) {
    if (typeof window !== "undefined") {
      salvarImportacaoPendente();

      window.sessionStorage.setItem(
        CADASTRO_RETORNO_FOLHA_STORAGE_KEY,
        JSON.stringify({
          origem: "importacao-semanal",
          itemId: item.id,
          nomeRelatorio: item.nomeRelatorio,
          funcaoRelatorio: item.funcaoRelatorio,
          lojaId,
          ano,
          mes,
          semana: importacaoSemana.semana,
        })
      );

      window.sessionStorage.setItem(
        "folha-cadastro-sugerido",
        JSON.stringify({
          nome: item.nomeRelatorio,
          funcao: item.funcaoRelatorio,
          lojaId,
        })
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  function irParaCadastroExistente(funcionario: any) {
    if (typeof window !== "undefined") {
      salvarImportacaoPendente();
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-id",
        String(funcionario.id)
      );
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-loja-id",
        String(lojaId)
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  async function confirmarImportacaoSemana() {
    if (!garantirCompetenciaAberta()) return;

    const itensValidos = importacaoSemana.itens
      .map((item) => {
        const funcionarioIdEfetivo = Number(
          item.funcionarioId ||
            (item.status === "possivel" && Number(item.scoreCandidato) === 1
              ? item.candidatoId
              : 0)
        );

        if (item.status === "ignorado" || !funcionarioIdEfetivo) return null;
        if (item.status !== "ok" && !(item.status === "possivel" && Number(item.scoreCandidato) === 1)) {
          return null;
        }

        const funcionario = funcionariosImportaveis.find(
          (f: any) => Number(f.id) === funcionarioIdEfetivo
        );
        if (!funcionario) return null;

        return {
          ...item,
          funcionarioId: funcionarioIdEfetivo,
          funcionarioNome: funcionario.nome,
        };
      })
      .filter(Boolean) as Array<ItemRelatorioImportacao & { funcionarioId: number }>;

    if (itensValidos.length === 0) {
      setImportacaoSemana((prev) => ({
        ...prev,
        erro: "Nenhum funcionário está pronto para importar.",
      }));
      return;
    }

    setImportacaoSemana((prev) => ({
      ...prev,
      etapa: "importando",
      erro: "",
    }));

    const semana = importacaoSemana.semana;
    const semanaPersistida = semanaPersistenciaVisual(semana);
    const campoSemana = campoLiquidezSemanaVisual(semana);
    const campoPercentualSemana = campoPercentualSemanaVisual(semana);
    const campoComissaoSemana = campoComissaoSemanaVisual(semana);
    const campoFuncaoSemana = `funcaoSemana${semana}`;
    const campoComposicaoSemana = `composicaoSemana${semana}`;

    const gruposPorFuncionario = new Map<number, typeof itensValidos>();
    for (const item of itensValidos) {
      const grupo = gruposPorFuncionario.get(Number(item.funcionarioId)) || [];
      grupo.push(item);
      gruposPorFuncionario.set(Number(item.funcionarioId), grupo);
    }

    try {
      const atualizacoes = Array.from(gruposPorFuncionario.entries()).map(
        ([funcionarioId, itensFuncionario]) => {
          const currentLine = linhas.find(
            (linha) => Number(linha.funcionarioId) === Number(funcionarioId)
          );

          if (!currentLine) {
            throw new Error(
              `Funcionário ${itensFuncionario[0]?.funcionarioNome || itensFuncionario[0]?.nomeRelatorio || funcionarioId} não encontrado na folha.`
            );
          }

          // Protege semanas antigas que ainda não tinham histórico explícito de função.
          const funcaoAtualCadastro =
            currentLine.funcao === "vendedor" || currentLine.funcao === "mecanico"
              ? (currentLine.funcao as FuncaoSemanaComissao)
              : null;

          const backfillFuncoes = funcaoAtualCadastro
            ? ([1, 2, 3, 4] as const)
                .filter(
                  (semanaAnterior) =>
                    semanaAnterior < semana &&
                    Number((currentLine as any)[`sem${semanaAnterior}`] || 0) > 0 &&
                    !(currentLine as any)[`funcaoSemana${semanaAnterior}`] &&
                    getComposicaoSemana(currentLine, semanaAnterior).length <= 1
                )
                .map((semanaAnterior) => ({
                  funcionarioId,
                  lojaId,
                  ano,
                  mes,
                  semana: semanaAnterior,
                  funcaoSemana: funcaoAtualCadastro,
                  composicaoSemana: [
                    {
                      funcao: funcaoAtualCadastro,
                      liquidez: Number((currentLine as any)[`sem${semanaAnterior}`] || 0),
                      percentual: Number((currentLine as any)[`perc${semanaAnterior}`] || 0),
                      comissao: Number((currentLine as any)[`com${semanaAnterior}`] || 0),
                    },
                  ],
                  liquidez: Number((currentLine as any)[`sem${semanaAnterior}`] || 0),
                  percentualComissao: Number(
                    (currentLine as any)[`perc${semanaAnterior}`] || 0
                  ),
                  valorComissao: Number(
                    (currentLine as any)[`com${semanaAnterior}`] || 0
                  ),
                  ultimaAlteracaoPor: usuarioLogado,
                  ultimaAlteracaoEm: new Date(),
                }))
            : [];

          // O mesmo funcionário pode aparecer em VENDA e MECÂNICA na mesma semana.
          // Cada parcela é calculada isoladamente pela regra da própria função e só
          // depois somamos liquidez e comissão para exibir uma única célula semanal.
          const componentes: ComponenteFuncaoSemana[] = itensFuncionario.map((item) => {
            const funcaoComponente = item.funcaoRelatorio as FuncaoSemanaComissao;
            const liquidezComponente = Number(item.valor || 0);
            const metaComponente = findMetaForFuncionario({
              funcionarioNome: currentLine.nome,
              funcao: funcaoComponente,
              cidade: selectedLoja,
              tipoMeta: currentLine.tipoMeta,
            });

            const calculoComponente = computeFolhaLinha({
              meta: metaComponente,
              funcao: funcaoComponente,
              cidade: selectedLoja,
              funcionarioNome: currentLine.nome,
              tipoMeta: currentLine.tipoMeta,
              sem1: semana === 1 || semana === 5 ? liquidezComponente : 0,
              sem2: semana === 2 ? liquidezComponente : 0,
              sem3: semana === 3 ? liquidezComponente : 0,
              sem4: semana === 4 ? liquidezComponente : 0,
              percManual1: null,
              percManual2: null,
              percManual3: null,
              percManual4: null,
              premiacoesManuais: [],
              vales: [],
              aluguel: 0,
              inss: 0,
              adiant: 0,
              holerite: 0,
            });

            const percentual = Number(
              semana === 1 || semana === 5
                ? calculoComponente.perc1
                : semana === 2
                ? calculoComponente.perc2
                : semana === 3
                ? calculoComponente.perc3
                : calculoComponente.perc4
            );

            const comissao = Number(
              semana === 1 || semana === 5
                ? calculoComponente.com1
                : semana === 2
                ? calculoComponente.com2
                : semana === 3
                ? calculoComponente.com3
                : calculoComponente.com4
            );

            return {
              funcao: funcaoComponente,
              liquidez: liquidezComponente,
              percentual,
              comissao,
            };
          });

          const componentesOrdenados = [...componentes].sort((a, b) => {
            const ordem: Record<FuncaoSemanaComissao, number> = {
              mecanico: 1,
              vendedor: 2,
            };
            return ordem[a.funcao] - ordem[b.funcao];
          });

          const totalLiquidezSemana = Number(
            componentesOrdenados
              .reduce((acc, item) => acc + Number(item.liquidez || 0), 0)
              .toFixed(2)
          );
          const totalComissaoSemana = Number(
            componentesOrdenados
              .reduce((acc, item) => acc + Number(item.comissao || 0), 0)
              .toFixed(2)
          );
          const funcoesUnicas = Array.from(
            new Set(componentesOrdenados.map((item) => item.funcao))
          );
          const funcaoSemanaPersistida =
            funcoesUnicas.length === 1 ? funcoesUnicas[0] : null;
          const percentualSemanaPersistido =
            componentesOrdenados.length === 1
              ? Number(componentesOrdenados[0].percentual || 0)
              : 0;

          const updatedLine = {
            ...currentLine,
            [campoSemana]: totalLiquidezSemana,
            [campoFuncaoSemana]: funcaoSemanaPersistida,
            [campoComposicaoSemana]: componentesOrdenados,
            [campoPercentualSemana]: percentualSemanaPersistido,
            [campoComissaoSemana]: totalComissaoSemana,
          } as LinhaComQuadrante;

          for (const historico of backfillFuncoes) {
            (updatedLine as any)[`funcaoSemana${historico.semana}`] = historico.funcaoSemana;
            (updatedLine as any)[`composicaoSemana${historico.semana}`] =
              historico.composicaoSemana;
          }

          updatedLine.totalLiquidez =
            Number(updatedLine.sem1 || 0) +
            Number(updatedLine.sem2 || 0) +
            Number(updatedLine.sem3 || 0) +
            Number(updatedLine.sem4 || 0) +
            Number((updatedLine as any).sem5Extra || 0);

          updatedLine.totalComissao =
            Number(updatedLine.com1 || 0) +
            Number(updatedLine.com2 || 0) +
            Number(updatedLine.com3 || 0) +
            Number(updatedLine.com4 || 0) +
            Number((updatedLine as any).com5Extra || 0);

          const boleto = calcularBoletoAjustado({
            quadrante: updatedLine.quadrante,
            funcao: updatedLine.funcao,
            lojaId,
            funcionarioNome: updatedLine.nome,
            totalComissao: Number(updatedLine.totalComissao || 0),
            premiacao: Number(updatedLine.premiacao || 0),
            vale: Number(updatedLine.vale || 0),
            aluguel: Number(updatedLine.aluguel || 0),
            inss: Number(updatedLine.inss || 0),
            adiant: Number(updatedLine.adiant || 0),
            holerite: Number(updatedLine.holerite || 0),
            descontoFolhaProporcional:
              updatedLine.descontoFolhaProporcional ?? null,
            boletoOriginal: Number(updatedLine.boleto || 0),
          });

          const mergedLine = {
            ...updatedLine,
            boleto,
          } as LinhaComQuadrante;

          // Nome exato na mesma loja passa a apontar sempre para o mesmo cadastro.
          for (const item of itensFuncionario) {
            salvarAliasImportacao(lojaId, item.nomeRelatorio, funcionarioId);
          }

          return {
            mergedLine,
            backfillFuncoes,
            payload: {
              funcionarioId,
              lojaId,
              ano,
              mes,
              semana: semanaPersistida,
              funcaoSemana: funcaoSemanaPersistida,
              composicaoSemana: componentesOrdenados,
              liquidez: totalLiquidezSemana,
              percentualComissao: percentualSemanaPersistido,
              valorComissao: totalComissaoSemana,
              ultimaAlteracaoPor: usuarioLogado,
              ultimaAlteracaoEm: new Date(),
            },
          };
        }
      );

      setFolhas((prev) => {
        let next = [...prev];

        for (const atualizacao of atualizacoes) {
          const linha = atualizacao.mergedLine;
          const index = next.findIndex(
            (f) =>
              Number(f.funcionarioId) === Number(linha.funcionarioId) &&
              Number(f.loja_id) === Number(lojaId) &&
              Number(f.ano) === Number(ano) &&
              Number(f.mes) === Number(mes)
          );

          if (index >= 0) next[index] = linha;
          else next.push(linha);
        }

        return next;
      });

      await Promise.all(
        atualizacoes.flatMap((atualizacao) => [
          ...atualizacao.backfillFuncoes.map((payloadHistorico) =>
            importFolhaBaseMutation.mutateAsync(payloadHistorico)
          ),
          importFolhaBaseMutation.mutateAsync(atualizacao.payload),
        ])
      );

      await folhaBaseQuery.refetch();
      void resumoSupervisorQuery.refetch();

      setImportacaoSemana((prev) => ({
        ...prev,
        etapa: "sucesso",
        mensagem:
          lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
            ? `${atualizacoes.length} funcionário(s) importado(s) para a Liquidez mensal de Florianópolis.`
            : `${atualizacoes.length} funcionário(s) importado(s) para a SEM${semana}.`,
      }));
    } catch (err: any) {
      console.error("Erro ao importar relatório semanal:", err);
      setImportacaoSemana((prev) => ({
        ...prev,
        etapa: "conferencia",
        erro: err?.message || "Erro ao salvar a importação.",
      }));
    }
  }


  function openImportacaoAdiantamento() {
    if (!garantirCompetenciaAberta()) return;
    setImportacaoAdiantamento(criarImportacaoAdiantamentoInicial());
  }

  function fecharImportacaoAdiantamento() {
    setImportacaoAdiantamento((prev) => ({ ...prev, open: false }));
  }

  async function processarPdfAdiantamento(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportacaoAdiantamento((prev) => ({
        ...prev,
        erro: "Selecione um arquivo PDF.",
      }));
      return;
    }

    setImportacaoAdiantamento((prev) => ({
      ...prev,
      etapa: "lendo",
      arquivoNome: file.name,
      erro: "",
      mensagem: "",
    }));

    try {
      const extraido = await lerPdfAdiantamento(file);

      if (extraido.itens.length === 0) {
        throw new Error(
          "Não encontrei funcionários com Valor Líquido no PDF de adiantamento."
        );
      }

      const aliases = lerAliasesImportacao();
      const candidatos = linhas.map((linha) => ({
        id: Number(linha.funcionarioId),
        nome: linha.nome,
      }));

      const itens: ItemAdiantamentoPdf[] = extraido.itens.map((item, index) => {
        const chaveAlias = `${lojaId}:${normalizarTextoImportacao(item.nomePdf)}`;
        const aliasId = aliases[chaveAlias];

        const porAlias = aliasId
          ? candidatos.find((funcionario) => Number(funcionario.id) === Number(aliasId))
          : null;

        const nomeCanonico = normalizarNomeImportacao(item.nomePdf);
        const exato = candidatos.find(
          (funcionario) => normalizarNomeImportacao(funcionario.nome) === nomeCanonico
        );

        const escolhido = porAlias || exato;

        if (escolhido) {
          return {
            id: `adiant-${index}-${normalizarTextoImportacao(item.nomePdf)}`,
            pagina: item.pagina,
            nomePdf: item.nomePdf,
            valorLiquido: item.valorLiquido,
            funcionarioId: Number(escolhido.id),
            funcionarioNome: escolhido.nome,
            status: "ok" as const,
            candidatoId: null,
            candidatoNome: null,
            scoreCandidato: 1,
          };
        }

        const candidatosOrdenados = candidatos
          .map((funcionario) => ({
            funcionario,
            score: scoreNomesImportacao(item.nomePdf, funcionario.nome),
          }))
          .sort((a, b) => b.score - a.score);

        const melhor = candidatosOrdenados[0];
        const ehPossivel = !!melhor && melhor.score >= 0.55;

        return {
          id: `adiant-${index}-${normalizarTextoImportacao(item.nomePdf)}`,
          pagina: item.pagina,
          nomePdf: item.nomePdf,
          valorLiquido: item.valorLiquido,
          funcionarioId: null,
          funcionarioNome: null,
          status: ehPossivel ? "possivel" : "nao_cadastrado",
          candidatoId: ehPossivel ? Number(melhor.funcionario.id) : null,
          candidatoNome: ehPossivel ? melhor.funcionario.nome : null,
          scoreCandidato: ehPossivel ? melhor.score : 0,
        };
      });

      setImportacaoAdiantamento((prev) => ({
        ...prev,
        etapa: "conferencia",
        competencia: extraido.competencia,
        competenciaMes: extraido.competenciaMes,
        competenciaAno: extraido.competenciaAno,
        cidadeRelatorio: extraido.cidadeRelatorio,
        itens,
        erro: "",
      }));
    } catch (err: any) {
      console.error("Erro ao ler PDF de adiantamento:", err);
      setImportacaoAdiantamento((prev) => ({
        ...prev,
        etapa: "arquivo",
        erro: err?.message || "Não foi possível ler o PDF de adiantamento.",
      }));
    }
  }

  function vincularItemAdiantamento(itemId: string, funcionarioId: number) {
    const funcionario = linhas.find(
      (linha) => Number(linha.funcionarioId) === Number(funcionarioId)
    );
    if (!funcionario) return;

    setImportacaoAdiantamento((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "ok",
              funcionarioId: Number(funcionario.funcionarioId),
              funcionarioNome: funcionario.nome,
              candidatoId: null,
              candidatoNome: null,
              scoreCandidato: 1,
            }
          : item
      ),
    }));

    const item = importacaoAdiantamento.itens.find((row) => row.id === itemId);
    if (item) {
      salvarAliasImportacao(lojaId, item.nomePdf, Number(funcionario.funcionarioId));
    }
  }

  function ignorarItemAdiantamento(itemId: string) {
    setImportacaoAdiantamento((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId ? { ...item, status: "ignorado" } : item
      ),
    }));
  }

  function salvarImportacaoAdiantamentoPendente() {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      IMPORT_ADIANT_PENDENTE_STORAGE_KEY,
      JSON.stringify({
        selectedLoja,
        ano,
        mes,
        importacao: importacaoAdiantamento,
      })
    );
  }

  function irParaCadastrarFuncionarioAdiantamento(item: ItemAdiantamentoPdf) {
    if (typeof window !== "undefined") {
      salvarImportacaoAdiantamentoPendente();
      window.sessionStorage.setItem(
        "folha-cadastro-sugerido",
        JSON.stringify({
          nome: item.nomePdf,
          lojaId,
        })
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  function irParaCadastroExistenteAdiantamento(funcionario: LinhaComQuadrante) {
    if (typeof window !== "undefined") {
      salvarImportacaoAdiantamentoPendente();
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-id",
        String(funcionario.funcionarioId)
      );
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-loja-id",
        String(lojaId)
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  async function confirmarImportacaoAdiantamento() {
    if (!garantirCompetenciaAberta()) return;

    const itensValidos = importacaoAdiantamento.itens.filter(
      (item) => item.status === "ok" && item.funcionarioId
    );

    if (itensValidos.length === 0) {
      setImportacaoAdiantamento((prev) => ({
        ...prev,
        erro: "Nenhum funcionário está pronto para importar.",
      }));
      return;
    }

    setImportacaoAdiantamento((prev) => ({
      ...prev,
      etapa: "importando",
      erro: "",
    }));

    try {
      const atualizacoes = itensValidos.map((item) => {
        const currentLine = linhas.find(
          (linha) => Number(linha.funcionarioId) === Number(item.funcionarioId)
        );

        if (!currentLine) {
          throw new Error(`Funcionário ${item.funcionarioNome || item.nomePdf} não encontrado na folha.`);
        }

        const updatedLine = {
          ...currentLine,
          adiant: Number(item.valorLiquido || 0),
        } as LinhaComQuadrante;

        const funcaoMetaAtualizacao =
          updatedLine.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
            ? "vendedor"
            : updatedLine.funcao;

        const ignorarPercentualManual =
          updatedLine.funcao === "vendedor" ||
          updatedLine.funcao === "mecanico" ||
          (updatedLine.funcao === "gerente" && (lojaId === 3 || lojaId === 6));

        const metaAtualizacao = findMetaForFuncionario({
          funcionarioNome: updatedLine.nome,
          funcao: funcaoMetaAtualizacao,
          cidade: selectedLoja,
          tipoMeta: updatedLine.tipoMeta,
        });

        const recalculado = computeFolhaLinha({
          meta: metaAtualizacao,
          funcao: funcaoMetaAtualizacao,
          cidade: selectedLoja,
          funcionarioNome: updatedLine.nome,
          tipoMeta: updatedLine.tipoMeta,
          sem1: Number(updatedLine.sem1 || 0),
          sem2: Number(updatedLine.sem2 || 0),
          sem3: Number(updatedLine.sem3 || 0),
          sem4: Number(updatedLine.sem4 || 0),
          percManual1: ignorarPercentualManual ? null : updatedLine.percManual1,
          percManual2: ignorarPercentualManual ? null : updatedLine.percManual2,
          percManual3: ignorarPercentualManual ? null : updatedLine.percManual3,
          percManual4: ignorarPercentualManual ? null : updatedLine.percManual4,
          premiacoesManuais: updatedLine.premiacoesManuais || [],
          vales: updatedLine.vales || [],
          aluguel: Number(updatedLine.aluguel || 0),
          inss: Number(updatedLine.inss || 0),
          adiant: Number(item.valorLiquido || 0),
          holerite: Number(updatedLine.holerite || 0),
        });

        const boleto = calcularBoletoAjustado({
          quadrante: updatedLine.quadrante,
          funcao: updatedLine.funcao,
          lojaId,
          funcionarioNome: updatedLine.nome,
          totalComissao: Number(recalculado.totalComissao || 0),
          premiacao: Number(recalculado.premiacao || 0),
          vale: Number(recalculado.vale || updatedLine.vale || 0),
          aluguel: Number(updatedLine.aluguel || 0),
          inss: Number(updatedLine.inss || 0),
          adiant: Number(item.valorLiquido || 0),
          holerite: Number(updatedLine.holerite || 0),
          descontoFolhaProporcional:
            updatedLine.descontoFolhaProporcional ?? null,
          boletoOriginal: Number(recalculado.boleto || 0),
        });

        return {
          mergedLine: {
            ...updatedLine,
            ...recalculado,
            adiant: Number(item.valorLiquido || 0),
            boleto,
          } as LinhaComQuadrante,
          payload: {
            funcionarioId: Number(item.funcionarioId),
            lojaId,
            ano,
            mes,
            tipo: "adiantamento" as const,
            valor: Number(item.valorLiquido || 0),
            ultimaAlteracaoPor: usuarioLogado,
            ultimaAlteracaoEm: new Date(),
          },
        };
      });

      // Atualiza a tela imediatamente; o banco é salvo em paralelo.
      setFolhas((prev) => {
        let next = [...prev];

        for (const atualizacao of atualizacoes) {
          const linha = atualizacao.mergedLine;
          const index = next.findIndex(
            (f) =>
              Number(f.funcionarioId) === Number(linha.funcionarioId) &&
              Number(f.loja_id) === Number(lojaId) &&
              Number(f.ano) === Number(ano) &&
              Number(f.mes) === Number(mes)
          );

          if (index >= 0) next[index] = linha;
          else next.push(linha);
        }

        return next;
      });

      await Promise.all(
        atualizacoes.map((atualizacao) =>
          importDescontoMutation.mutateAsync(atualizacao.payload)
        )
      );

      void folhaExtrasQuery.refetch();
      void folhaBaseQuery.refetch();

      setImportacaoAdiantamento((prev) => ({
        ...prev,
        etapa: "sucesso",
        mensagem: `${itensValidos.length} adiantamento(s) importado(s) pelo Valor Líquido do PDF.`,
      }));
    } catch (err: any) {
      console.error("Erro ao importar adiantamentos:", err);
      setImportacaoAdiantamento((prev) => ({
        ...prev,
        etapa: "conferencia",
        erro: err?.message || "Erro ao salvar os adiantamentos.",
      }));
    }
  }


  function openImportacaoHolerite() {
    if (!garantirCompetenciaAberta()) return;
    setImportacaoHolerite(criarImportacaoHoleriteInicial());
  }

  function fecharImportacaoHolerite() {
    setImportacaoHolerite((prev) => ({ ...prev, open: false }));
  }

  async function processarPdfHolerite(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportacaoHolerite((prev) => ({
        ...prev,
        erro: "Selecione um arquivo PDF.",
      }));
      return;
    }

    setImportacaoHolerite((prev) => ({
      ...prev,
      etapa: "lendo",
      arquivoNome: file.name,
      erro: "",
      mensagem: "",
    }));

    try {
      const extraido = await lerPdfHoleriteMensal(file);

      if (extraido.itens.length === 0) {
        throw new Error(
          "Não encontrei funcionários com Valor Líquido no PDF da Folha Mensal."
        );
      }

      const aliases = lerAliasesImportacao();
      const candidatos = linhas
        .filter(
          (linha) =>
            linha.quadrante !== "supervisor_pj" &&
            linha.quadrante !== "supervisora_consultores_pj"
        )
        .map((linha) => ({
          id: Number(linha.funcionarioId),
          nome: linha.nome,
        }));

      const itens: ItemHoleritePdf[] = extraido.itens.map((item, index) => {
        const chaveAlias = `${lojaId}:${normalizarTextoImportacao(item.nomePdf)}`;
        const aliasId = aliases[chaveAlias];

        const porAlias = aliasId
          ? candidatos.find((funcionario) => Number(funcionario.id) === Number(aliasId))
          : null;

        const nomeCanonico = normalizarNomeImportacao(item.nomePdf);
        const exato = candidatos.find(
          (funcionario) => normalizarNomeImportacao(funcionario.nome) === nomeCanonico
        );

        const escolhido = porAlias || exato;

        if (escolhido) {
          return {
            id: `holerite-${index}-${normalizarTextoImportacao(item.nomePdf)}`,
            pagina: item.pagina,
            nomePdf: item.nomePdf,
            inss: item.inss,
            valorLiquido: item.valorLiquido,
            emprestimos: item.emprestimos,
            funcionarioId: Number(escolhido.id),
            funcionarioNome: escolhido.nome,
            status: "ok" as const,
            candidatoId: null,
            candidatoNome: null,
            scoreCandidato: 1,
          };
        }

        const candidatosOrdenados = candidatos
          .map((funcionario) => ({
            funcionario,
            score: scoreNomesImportacao(item.nomePdf, funcionario.nome),
          }))
          .sort((a, b) => b.score - a.score);

        const melhor = candidatosOrdenados[0];
        const ehPossivel = !!melhor && melhor.score >= 0.55;

        return {
          id: `holerite-${index}-${normalizarTextoImportacao(item.nomePdf)}`,
          pagina: item.pagina,
          nomePdf: item.nomePdf,
          inss: item.inss,
          valorLiquido: item.valorLiquido,
          emprestimos: item.emprestimos,
          funcionarioId: null,
          funcionarioNome: null,
          status: ehPossivel ? "possivel" : "nao_cadastrado",
          candidatoId: ehPossivel ? Number(melhor.funcionario.id) : null,
          candidatoNome: ehPossivel ? melhor.funcionario.nome : null,
          scoreCandidato: ehPossivel ? melhor.score : 0,
        };
      });

      setImportacaoHolerite((prev) => ({
        ...prev,
        etapa: "conferencia",
        competencia: extraido.competencia,
        competenciaMes: extraido.competenciaMes,
        competenciaAno: extraido.competenciaAno,
        cidadeRelatorio: extraido.cidadeRelatorio,
        itens,
        erro: "",
      }));
    } catch (err: any) {
      console.error("Erro ao ler PDF da Folha Mensal:", err);
      setImportacaoHolerite((prev) => ({
        ...prev,
        etapa: "arquivo",
        erro: err?.message || "Não foi possível ler o PDF da Folha Mensal.",
      }));
    }
  }

  function vincularItemHolerite(itemId: string, funcionarioId: number) {
    const funcionario = linhas.find(
      (linha) => Number(linha.funcionarioId) === Number(funcionarioId)
    );
    if (
      !funcionario ||
      funcionario.quadrante === "supervisor_pj" ||
      funcionario.quadrante === "supervisora_consultores_pj"
    )
      return;

    setImportacaoHolerite((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "ok",
              funcionarioId: Number(funcionario.funcionarioId),
              funcionarioNome: funcionario.nome,
              candidatoId: null,
              candidatoNome: null,
              scoreCandidato: 1,
            }
          : item
      ),
    }));

    const item = importacaoHolerite.itens.find((row) => row.id === itemId);
    if (item) {
      salvarAliasImportacao(lojaId, item.nomePdf, Number(funcionario.funcionarioId));
    }
  }

  function ignorarItemHolerite(itemId: string) {
    setImportacaoHolerite((prev) => ({
      ...prev,
      itens: prev.itens.map((item) =>
        item.id === itemId ? { ...item, status: "ignorado" } : item
      ),
    }));
  }

  function salvarImportacaoHoleritePendente() {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      IMPORT_HOLERITE_PENDENTE_STORAGE_KEY,
      JSON.stringify({
        selectedLoja,
        ano,
        mes,
        importacao: importacaoHolerite,
      })
    );
  }

  function irParaCadastrarFuncionarioHolerite(item: ItemHoleritePdf) {
    if (typeof window !== "undefined") {
      salvarImportacaoHoleritePendente();

      // Guarda exatamente qual linha do PDF originou o cadastro. Assim, ao salvar
      // o funcionário no RH, a Folha consegue voltar para esta mesma conferência
      // e vincular o cadastro recém-criado pelo ID, sem depender apenas do nome.
      window.sessionStorage.setItem(
        CADASTRO_RETORNO_FOLHA_STORAGE_KEY,
        JSON.stringify({
          origem: "importacao-holerite",
          itemId: item.id,
          nomePdf: item.nomePdf,
          lojaId,
          ano,
          mes,
        })
      );

      window.sessionStorage.setItem(
        "folha-cadastro-sugerido",
        JSON.stringify({
          nome: item.nomePdf,
          lojaId,
        })
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  function irParaCadastroExistenteHolerite(funcionario: LinhaComQuadrante) {
    if (typeof window !== "undefined") {
      salvarImportacaoHoleritePendente();
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-id",
        String(funcionario.funcionarioId)
      );
      window.sessionStorage.setItem(
        "folha-funcionario-abrir-loja-id",
        String(lojaId)
      );
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  async function confirmarImportacaoHolerite() {
    if (!garantirCompetenciaAberta()) return;

    const itensValidos = importacaoHolerite.itens.filter(
      (item) => item.status === "ok" && item.funcionarioId
    );

    if (itensValidos.length === 0) {
      setImportacaoHolerite((prev) => ({
        ...prev,
        erro: "Nenhum funcionário está pronto para importar.",
      }));
      return;
    }

    setImportacaoHolerite((prev) => ({
      ...prev,
      etapa: "importando",
      erro: "",
    }));

    try {
      for (const item of itensValidos) {
        const funcionarioId = Number(item.funcionarioId);
        const currentLine = linhas.find(
          (linha) => Number(linha.funcionarioId) === funcionarioId
        );

        if (!currentLine) {
          throw new Error(
            `Funcionário ${item.funcionarioNome || item.nomePdf} não encontrado na folha.`
          );
        }

        // IMPORTANTE:
        // A Folha Mensal atualiza somente INSS, HOLERITE e Empréstimos CLT.
        // O ADIANTAMENTO permanece exatamente como veio do PDF do dia 20.
        await Promise.all([
          importDescontoMutation.mutateAsync({
            funcionarioId,
            lojaId,
            ano,
            mes,
            tipo: "inss" as const,
            valor: Number(item.inss || 0),
            ultimaAlteracaoPor: usuarioLogado,
            ultimaAlteracaoEm: new Date(),
          }),
          importDescontoMutation.mutateAsync({
            funcionarioId,
            lojaId,
            ano,
            mes,
            tipo: "holerite" as const,
            valor: Number(item.valorLiquido || 0),
            ultimaAlteracaoPor: usuarioLogado,
            ultimaAlteracaoEm: new Date(),
          }),
        ]);

        const prefixoGrupo = `emprestimo-clt-pdf-${lojaId}-${funcionarioId}-${ano}-${mes}-`;

        // Remove/cancela somente empréstimos que foram criados por importação de PDF
        // nesta competência. Vales manuais são preservados.
        const gruposImportadosExistentes = Array.from(
          new Set(
            (currentLine.vales || [])
              .map((vale: any) => String(vale?.grupoId || ""))
              .filter((grupoId: string) => grupoId.startsWith(prefixoGrupo))
          )
        );

        for (const grupoId of gruposImportadosExistentes) {
          await removeValesMutation.mutateAsync({
            funcionarioId,
            lojaId,
            grupoId,
            ano,
            mes,
          });
        }

        const deveLancarEmprestimoClt = deveImportarEmprestimoClt(currentLine);

        if (deveLancarEmprestimoClt && item.emprestimos.length > 0) {
          await addValesMutation.mutateAsync({
            funcionarioId,
            lojaId,
            items: item.emprestimos.map((emprestimo) => ({
              grupoId: grupoIdEmprestimoCltPdf({
                lojaId,
                funcionarioId,
                ano,
                mes,
                contrato: emprestimo.contrato,
              }),
              descricao: `Empréstimo CLT • ${emprestimo.contrato}`,
              valorTotal: Number(emprestimo.valor || 0),
              valorParcela: Number(emprestimo.valor || 0),
              parcelas: 1,
              parcelaAtual: 1,
              ano,
              mes,
              mesOrigem: mes,
              tipo: "simples" as const,
            })),
            ultimaAlteracaoPor: usuarioLogado,
            ultimaAlteracaoEm: new Date(),
          });
        }
      }

      // Atualiza INSS e Holerite na tela imediatamente.
      setFolhas((prev) => {
        let next = [...prev];

        for (const item of itensValidos) {
          const funcionarioId = Number(item.funcionarioId);
          const currentLine = linhas.find(
            (linha) => Number(linha.funcionarioId) === funcionarioId
          );
          if (!currentLine) continue;

          const updatedLine = {
            ...currentLine,
            inss: Number(item.inss || 0),
            holerite: Number(item.valorLiquido || 0),
            // adiant NÃO é alterado.
          } as LinhaComQuadrante;

          const index = next.findIndex(
            (f) =>
              Number(f.funcionarioId) === funcionarioId &&
              Number(f.loja_id) === Number(lojaId) &&
              Number(f.ano) === Number(ano) &&
              Number(f.mes) === Number(mes)
          );

          if (index >= 0) next[index] = updatedLine;
          else next.push(updatedLine);
        }

        return next;
      });

      await folhaExtrasQuery.refetch();
      void folhaBaseQuery.refetch();
      void resumoSupervisorQuery.refetch();

      const totalEmprestimosDetectados = itensValidos.reduce(
        (acc, item) => acc + item.emprestimos.length,
        0
      );
      const totalEmprestimos = itensValidos.reduce((acc, item) => {
        const linha = linhas.find(
          (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
        );
        return acc + (linha && deveImportarEmprestimoClt(linha) ? item.emprestimos.length : 0);
      }, 0);
      const totalEmprestimosIgnorados = Math.max(
        0,
        totalEmprestimosDetectados - totalEmprestimos
      );

      setImportacaoHolerite((prev) => ({
        ...prev,
        etapa: "sucesso",
        mensagem:
          `${itensValidos.length} holerite(s) importado(s). ` +
          `INSS e Valor Líquido atualizados; ${totalEmprestimos} empréstimo(s) CLT lançado(s) no Vale. ` +
          (totalEmprestimosIgnorados > 0
            ? `${totalEmprestimosIgnorados} empréstimo(s) CLT ignorado(s) pela função do funcionário. `
            : "") +
          `Adiantamento preservado.`,
      }));
    } catch (err: any) {
      console.error("Erro ao importar Folha Mensal:", err);
      setImportacaoHolerite((prev) => ({
        ...prev,
        etapa: "conferencia",
        erro: err?.message || "Erro ao salvar a Folha Mensal.",
      }));
    }
  }

  async function updateComposicaoSemanaPercentual(
    linha: LinhaComQuadrante,
    semana: SemanaComissaoVisual,
    funcaoComponente: FuncaoSemanaComissao,
    percentualManual: number | null
  ): Promise<LinhaComQuadrante | null> {
    if (!garantirCompetenciaAberta()) return null;

    const composicaoAtual = getComposicaoSemana(linha, semana);
    if (composicaoAtual.length <= 1) return null;

    const componenteAtual = composicaoAtual.find(
      (item) => item.funcao === funcaoComponente
    );
    if (!componenteAtual) return null;

    const liquidezComponente = Number(componenteAtual.liquidez || 0);

    // Campo vazio restaura a regra automática da função naquela semana.
    let percentualFinal = percentualManual;
    if (percentualFinal === null) {
      const metaComponente = findMetaForFuncionario({
        funcionarioNome: linha.nome,
        funcao: funcaoComponente,
        cidade: selectedLoja,
        tipoMeta: linha.tipoMeta,
      });

      const calculoAutomatico = computeFolhaLinha({
        meta: metaComponente,
        funcao: funcaoComponente,
        cidade: selectedLoja,
        funcionarioNome: linha.nome,
        tipoMeta: linha.tipoMeta,
        sem1: semana === 1 || semana === 5 ? liquidezComponente : 0,
        sem2: semana === 2 ? liquidezComponente : 0,
        sem3: semana === 3 ? liquidezComponente : 0,
        sem4: semana === 4 ? liquidezComponente : 0,
        percManual1: null,
        percManual2: null,
        percManual3: null,
        percManual4: null,
        premiacoesManuais: [],
        vales: [],
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      });

      percentualFinal = Number(
        semana === 1 || semana === 5
          ? calculoAutomatico.perc1
          : semana === 2
          ? calculoAutomatico.perc2
          : semana === 3
          ? calculoAutomatico.perc3
          : calculoAutomatico.perc4
      );
    }

    if (!Number.isFinite(Number(percentualFinal)) || Number(percentualFinal) < 0) {
      return null;
    }

    const percentualAplicado = Number(percentualFinal);
    const novaComissaoComponente = Number(
      (liquidezComponente * (percentualAplicado / 100)).toFixed(2)
    );

    const novaComposicao = composicaoAtual.map((item) =>
      item.funcao === funcaoComponente
        ? {
            ...item,
            percentual: percentualAplicado,
            comissao: novaComissaoComponente,
          }
        : { ...item }
    );

    const totalLiquidezSemana = Number(
      novaComposicao
        .reduce((acc, item) => acc + Number(item.liquidez || 0), 0)
        .toFixed(2)
    );
    const totalComissaoSemana = Number(
      novaComposicao
        .reduce((acc, item) => acc + Number(item.comissao || 0), 0)
        .toFixed(2)
    );

    const linhaAtualizada = {
      ...linha,
      [campoLiquidezSemanaVisual(semana)]: totalLiquidezSemana,
      [campoPercentualSemanaVisual(semana)]: 0,
      [campoComissaoSemanaVisual(semana)]: totalComissaoSemana,
      [`funcaoSemana${semana}`]: null,
      [`composicaoSemana${semana}`]: novaComposicao,
      ultimaAlteracaoPor: usuarioLogado,
      ultimaAlteracaoEm: new Date(),
    } as LinhaComQuadrante;

    linhaAtualizada.totalLiquidez =
      Number(linhaAtualizada.sem1 || 0) +
      Number(linhaAtualizada.sem2 || 0) +
      Number(linhaAtualizada.sem3 || 0) +
      Number(linhaAtualizada.sem4 || 0) +
      Number((linhaAtualizada as any).sem5Extra || 0);

    linhaAtualizada.totalComissao =
      Number(linhaAtualizada.com1 || 0) +
      Number(linhaAtualizada.com2 || 0) +
      Number(linhaAtualizada.com3 || 0) +
      Number(linhaAtualizada.com4 || 0) +
      Number((linhaAtualizada as any).com5Extra || 0);

    linhaAtualizada.boleto = calcularBoletoAjustado({
      quadrante: linhaAtualizada.quadrante,
      funcao: linhaAtualizada.funcao,
      lojaId,
      funcionarioNome: linhaAtualizada.nome,
      totalComissao: Number(linhaAtualizada.totalComissao || 0),
      premiacao: Number(linhaAtualizada.premiacao || 0),
      vale: Number(linhaAtualizada.vale || 0),
      aluguel: Number(linhaAtualizada.aluguel || 0),
      inss: Number(linhaAtualizada.inss || 0),
      adiant: Number(linhaAtualizada.adiant || 0),
      holerite: Number(linhaAtualizada.holerite || 0),
      descontoFolhaProporcional:
        linhaAtualizada.descontoFolhaProporcional ?? null,
      boletoOriginal: Number(linhaAtualizada.boleto || 0),
    });

    setFolhas((prev) =>
      prev.map((f) =>
        Number(f.funcionarioId) === Number(linha.funcionarioId) &&
        Number(f.loja_id) === Number(lojaId) &&
        Number(f.ano) === Number(ano) &&
        Number(f.mes) === Number(mes)
          ? linhaAtualizada
          : f
      )
    );

    try {
      await upsertFolhaBaseMutation.mutateAsync({
        funcionarioId: Number(linha.funcionarioId),
        lojaId,
        ano,
        mes,
        semana: semanaPersistenciaVisual(semana),
        funcaoSemana: null,
        composicaoSemana: novaComposicao,
        liquidez: totalLiquidezSemana,
        percentualComissao: 0,
        percentualManual: null,
        valorComissao: totalComissaoSemana,
        ultimaAlteracaoPor: usuarioLogado,
        ultimaAlteracaoEm: new Date(),
      });

      void folhaBaseQuery.refetch();
      return linhaAtualizada;
    } catch (err) {
      console.error("Erro ao ajustar percentual da semana com duas funções:", err);
      void folhaBaseQuery.refetch();
      return null;
    }
  }

  async function updateLinha(
  funcionarioId: number,
  campo: keyof FolhaMensal,
  valor: any
) {
  if (!garantirCompetenciaAberta()) return;

  const currentLine = linhas.find((l) => l.funcionarioId === funcionarioId);
  if (!currentLine) return;

  const updatedLine = {
    ...currentLine,
    [campo]: valor,
  };

  const funcaoMetaAtualizacao =
  updatedLine.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
    ? "vendedor"
    : updatedLine.funcao;

const ignorarPercentualManual =
  updatedLine.funcao === "vendedor" ||
  updatedLine.funcao === "mecanico" ||
  (updatedLine.funcao === "gerente" && (lojaId === 3 || lojaId === 6));

const metaAtualizacao = findMetaForFuncionario({
  funcionarioNome: updatedLine.nome,
  funcao: funcaoMetaAtualizacao,
  cidade: selectedLoja,
  tipoMeta: updatedLine.tipoMeta,
});

const recalculado = computeFolhaLinha({
  meta: metaAtualizacao,
  funcao: funcaoMetaAtualizacao,
  cidade: selectedLoja,
  funcionarioNome: updatedLine.nome,
  tipoMeta: updatedLine.tipoMeta,

  sem1: Number(updatedLine.sem1 || 0),
  sem2: Number(updatedLine.sem2 || 0),
  sem3: Number(updatedLine.sem3 || 0),
  sem4: Number(updatedLine.sem4 || 0),

  percManual1: ignorarPercentualManual
    ? null
    : updatedLine.percManual1,

  percManual2: ignorarPercentualManual
    ? null
    : updatedLine.percManual2,

  percManual3: ignorarPercentualManual
    ? null
    : updatedLine.percManual3,

  percManual4: ignorarPercentualManual
    ? null
    : updatedLine.percManual4,

  premiacoesManuais: updatedLine.premiacoesManuais || [],
  vales: updatedLine.vales || [],
  aluguel: Number(updatedLine.aluguel || 0),
  inss: Number(updatedLine.inss || 0),
  adiant: Number(updatedLine.adiant || 0),
  holerite: Number(updatedLine.holerite || 0),
});

  const mergedLine: FolhaMensal = {
    ...updatedLine,
    ...recalculado,
  };

  if (updatedLine.funcao === "supervisor" && lojaId === 5) {
    const calculoAci = calcularSupervisoraAci({
      joinville: Number(updatedLine.sem1 || 0),
      blumenau: Number(updatedLine.sem2 || 0),
      saoJose: Number(updatedLine.sem3 || 0),
      florianopolis: Number(updatedLine.sem4 || 0),
      gravatai: Number((updatedLine as any).sem5 || 0),
      saoLeopoldo: Number((updatedLine as any).sem6 || 0),
    });

    (mergedLine as any).sem5 = Number((updatedLine as any).sem5 || 0);
    (mergedLine as any).sem6 = Number((updatedLine as any).sem6 || 0);
    mergedLine.totalLiquidez = calculoAci.totalCarros;
    mergedLine.totalComissao = calculoAci.comissao;
  }

  setFolhas((prev) => {
    const exists = prev.some(
      (f) =>
        f.funcionarioId === funcionarioId &&
        f.loja_id === lojaId &&
        f.ano === ano &&
        f.mes === mes
    );

    if (exists) {
      return prev.map((f) =>
        f.funcionarioId === funcionarioId &&
        f.loja_id === lojaId &&
        f.ano === ano &&
        f.mes === mes
          ? mergedLine
          : f
      );
    }

    return [...prev, mergedLine];
  });
const camposBase = ["sem1", "sem2", "sem3", "sem4"] as const;
const camposDesconto = ["aluguel", "inss", "adiant", "holerite"] as const;

if (String(campo) === "sem5Extra") {
  const liquidez = Number(valor || 0);
  const funcaoSem5 =
    updatedLine.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
      ? "vendedor"
      : updatedLine.funcao;
  const metaSem5 = findMetaForFuncionario({
    funcionarioNome: updatedLine.nome,
    funcao: funcaoSem5,
    cidade: selectedLoja,
    tipoMeta: updatedLine.tipoMeta,
  });
  const calcSem5 = computeFolhaLinha({
    meta: metaSem5,
    funcao: funcaoSem5,
    cidade: selectedLoja,
    funcionarioNome: updatedLine.nome,
    tipoMeta: updatedLine.tipoMeta,
    sem1: liquidez,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    percManual1: null,
    percManual2: null,
    percManual3: null,
    percManual4: null,
    premiacoesManuais: [],
    vales: [],
    aluguel: 0,
    inss: 0,
    adiant: 0,
    holerite: 0,
  });
  const percentual = Number(calcSem5.perc1 || 0);
  const comissao = Number(calcSem5.com1 || 0);

  setFolhas((prev) =>
    prev.map((f) =>
      f.funcionarioId === funcionarioId &&
      f.loja_id === lojaId &&
      f.ano === ano &&
      f.mes === mes
        ? {
            ...f,
            sem5Extra: liquidez,
            perc5Extra: percentual,
            com5Extra: comissao,
          } as any
        : f
    )
  );

  await upsertFolhaBaseMutation.mutateAsync({
    funcionarioId,
    lojaId,
    ano,
    mes,
    semana: 7,
    funcaoSemana:
      funcaoSem5 === "vendedor" || funcaoSem5 === "mecanico"
        ? (funcaoSem5 as FuncaoSemanaComissao)
        : undefined,
    composicaoSemana:
      funcaoSem5 === "vendedor" || funcaoSem5 === "mecanico"
        ? [{ funcao: funcaoSem5 as FuncaoSemanaComissao, liquidez, percentual, comissao }]
        : undefined,
    liquidez,
    percentualComissao: percentual,
    valorComissao: comissao,
    ultimaAlteracaoPor: usuarioLogado,
    ultimaAlteracaoEm: new Date(),
  });
  return;
}

if (String(campo) === "sem5" || String(campo) === "sem6") {
  const semanaEspecial = String(campo) === "sem5" ? 5 : 6;

  await upsertFolhaBaseMutation.mutateAsync({
    funcionarioId,
    lojaId,
    ano,
    mes,
    semana: semanaEspecial,
    liquidez: Number(valor || 0),
    percentualComissao: 0,
    valorComissao: 0,
    ultimaAlteracaoPor: usuarioLogado,
    ultimaAlteracaoEm: new Date(),
  });

  return;
}

if (camposBase.includes(campo as (typeof camposBase)[number])) {
    const semanaAlterada =
      campo === "sem1"
        ? 1
        : campo === "sem2"
        ? 2
        : campo === "sem3"
        ? 3
        : 4;

    const liquidez =
      semanaAlterada === 1
        ? mergedLine.sem1
        : semanaAlterada === 2
        ? mergedLine.sem2
        : semanaAlterada === 3
        ? mergedLine.sem3
        : mergedLine.sem4;

    const percentual =
      semanaAlterada === 1
        ? mergedLine.perc1
        : semanaAlterada === 2
        ? mergedLine.perc2
        : semanaAlterada === 3
        ? mergedLine.perc3
        : mergedLine.perc4;

    const comissao =
      semanaAlterada === 1
        ? mergedLine.com1
        : semanaAlterada === 2
        ? mergedLine.com2
        : semanaAlterada === 3
        ? mergedLine.com3
        : mergedLine.com4;

    await upsertFolhaBaseMutation.mutateAsync({
      funcionarioId,
      lojaId,
      ano,
      mes,
      semana: semanaAlterada,
      liquidez: Number(liquidez || 0),
      percentualComissao: Number(percentual || 0),
      valorComissao: Number(comissao || 0),

      ultimaAlteracaoPor: usuarioLogado,
      ultimaAlteracaoEm: new Date(),
    });
  }

  if (camposDesconto.includes(campo as (typeof camposDesconto)[number])) {
    const tipoMap: Record<string, "aluguel" | "inss" | "adiantamento" | "holerite"> = {
      aluguel: "aluguel",
      inss: "inss",
      adiant: "adiantamento",
      holerite: "holerite",
    };

    await saveDescontoMutation.mutateAsync({
      funcionarioId,
      lojaId,
      ano,
      mes,
      tipo: tipoMap[String(campo)],
      valor: Number(valor || 0),

      ultimaAlteracaoPor: usuarioLogado,
      ultimaAlteracaoEm: new Date(),
    });

  }
}

function openTransicaoFuncaoEditor(linha: LinhaComQuadrante) {
  if (!linha.trocaFuncaoMes) return;

  setTransicaoFuncaoEditor({
    open: true,
    linha,
    quantidadeAnterior1: String(Number(linha.trocaFuncaoMes.quantidadeAnterior1 || 0)),
    quantidadeAnterior2: String(Number(linha.trocaFuncaoMes.quantidadeAnterior2 || 0)),
    valorFixoAnterior: String(Number(linha.trocaFuncaoMes.valorFixoAnterior || 0)),
    corrigindoData: false,
    novaDataMudanca: formatarDataInputFuncionario(linha.trocaFuncaoMes.dataMudanca),
  });
}

async function salvarTransicaoFuncaoEditor() {
  const linha = transicaoFuncaoEditor.linha;
  const troca = linha?.trocaFuncaoMes;
  if (!linha || !troca) return;
  if (!garantirCompetenciaAberta()) return;

  const quantidadeAnterior1 = Math.max(
    0,
    Number(transicaoFuncaoEditor.quantidadeAnterior1 || 0)
  );
  const quantidadeAnterior2 = Math.max(
    0,
    Number(transicaoFuncaoEditor.quantidadeAnterior2 || 0)
  );
  const valorFixoAnterior = Math.max(
    0,
    parseValorBR(transicaoFuncaoEditor.valorFixoAnterior)
  );

  try {
    await upsertTransicaoFuncaoMutation.mutateAsync({
      trocaFuncaoId: Number(troca.id),
      funcionarioId: Number(linha.funcionarioId),
      lojaId,
      ano,
      mes,
      quantidadeAnterior1,
      quantidadeAnterior2,
      valorFixoAnterior,
      ultimaAlteracaoPor: usuarioLogado,
      ultimaAlteracaoEm: new Date(),
    });

    await trocasFuncaoQuery.refetch();
    setTransicaoFuncaoEditor({
      open: false,
      linha: null,
      quantidadeAnterior1: "",
      quantidadeAnterior2: "",
      valorFixoAnterior: "",
      corrigindoData: false,
      novaDataMudanca: "",
    });
  } catch (error: any) {
    console.error("Erro ao salvar transição de função:", error);
    alert(error?.message || "Não foi possível salvar a transição de função.");
  }
}

async function salvarCorrecaoDataTrocaEditor() {
  const linha = transicaoFuncaoEditor.linha;
  const troca = linha?.trocaFuncaoMes;
  const novaData = transicaoFuncaoEditor.novaDataMudanca;

  if (!linha || !troca) return;
  if (!novaData) {
    alert("Informe a nova data efetiva da troca.");
    return;
  }
  if (!garantirCompetenciaAberta()) return;

  const dataAtual = formatarDataInputFuncionario(troca.dataMudanca);
  if (dataAtual === novaData) {
    setTransicaoFuncaoEditor((prev) => ({ ...prev, corrigindoData: false }));
    return;
  }

  const confirmar = window.confirm(
    `Corrigir a data efetiva da troca de função?\n\n` +
      `${linha.nome}\n` +
      `${labelFuncaoFuncionario(troca.funcaoAnterior, lojaId)} → ${labelFuncaoFuncionario(troca.funcaoNova, lojaId)}\n` +
      `De: ${formatarDataBR(dataAtual)}\n` +
      `Para: ${formatarDataBR(novaData)}\n\n` +
      `A função não será alterada novamente. Somente a data do histórico será corrigida.`
  );

  if (!confirmar) return;

  try {
    const resultado = await corrigirDataTrocaMutation.mutateAsync({
      trocaFuncaoId: Number(troca.id),
      funcionarioId: Number(linha.funcionarioId),
      lojaId,
      novaData: dataFuncionarioParaApi(novaData),
    });

    const dataCorrigida = String((resultado as any)?.dataNova || novaData).slice(0, 10);

    setTransicaoFuncaoEditor((prev) => ({
      ...prev,
      corrigindoData: false,
      novaDataMudanca: dataCorrigida,
      linha: prev.linha
        ? {
            ...prev.linha,
            trocaFuncaoMes: prev.linha.trocaFuncaoMes
              ? { ...prev.linha.trocaFuncaoMes, dataMudanca: dataCorrigida }
              : prev.linha.trocaFuncaoMes,
          }
        : null,
    }));

    await trocasFuncaoQuery.refetch();
  } catch (error: any) {
    console.error("Erro ao corrigir data da troca de função:", error);
    alert(error?.message || "Não foi possível corrigir a data da troca de função.");
  }
}

function openCellEditor(
  linha: LinhaComQuadrante,
  campo: keyof FolhaMensal,
  label: string,
  mode: "money" | "number"
) {
  if (!garantirCompetenciaAberta()) return;
  setCellEditor({
    open: true,
    funcionarioId: linha.funcionarioId,
    campo,
    label,
    mode,
    value: String(Number(linha[campo] || 0)),
  });
}

async function saveCellEditor() {
  if (!cellEditor.funcionarioId || !cellEditor.campo) return;

  const funcionarioId = cellEditor.funcionarioId;
  const campo = cellEditor.campo;
  const valor =
    cellEditor.mode === "money"
      ? parseValorBR(cellEditor.value)
      : Number(cellEditor.value || 0);

  // Fecha imediatamente para a interface responder sem esperar a rede.
  setCellEditor({
    open: false,
    funcionarioId: null,
    campo: null,
    label: "",
    mode: "money",
    value: "",
  });

  try {
    await updateLinha(funcionarioId, campo, valor);
  } catch (err) {
    console.error("Erro ao salvar campo da folha:", err);
  }
}

async function clearCellEditor() {
  if (!cellEditor.funcionarioId || !cellEditor.campo) return;

  const funcionarioId = cellEditor.funcionarioId;
  const campo = cellEditor.campo;

  // Fecha imediatamente para a interface responder sem esperar a rede.
  setCellEditor({
    open: false,
    funcionarioId: null,
    campo: null,
    label: "",
    mode: "money",
    value: "",
  });

  try {
    await updateLinha(funcionarioId, campo, 0);
  } catch (err) {
    console.error("Erro ao limpar campo da folha:", err);
  }
}

function openPremioEditor(linha: LinhaComQuadrante) {
  if (!garantirCompetenciaAberta()) return;
  setPremioEditor({
    open: true,
    funcionarioId: Number(linha.funcionarioId),
    descricao: "",
    valor: "",
  });
}

async function addPremiacaoManual() {
  if (!garantirCompetenciaAberta()) return;
  if (!premioEditor.funcionarioId) return;

  const descricao = premioEditor.descricao.trim();
  const valor = parseValorBR(premioEditor.valor);

  if (!descricao || valor <= 0) return;

  await addPremiacaoMutation.mutateAsync({
  funcionarioId: Number(premioEditor.funcionarioId),
  lojaId: Number(lojaId),
  ano: Number(ano),
  mes: Number(mes),
  descricao,
  valor: Number(valor),

  ultimaAlteracaoPor: usuarioLogado,
  ultimaAlteracaoEm: new Date(),
});

  setPremioEditor((prev) => ({
    ...prev,
    descricao: "",
    valor: "",
  }));
}

async function removePremiacaoManual(id: string) {
  if (!garantirCompetenciaAberta()) return;
  await removePremiacaoMutation.mutateAsync({ id: Number(id) });
}

function openObsEditor(linha: LinhaComQuadrante) {
  if (!garantirCompetenciaAberta()) return;
  setObsEditor({
    open: true,
    funcionarioId: linha.funcionarioId,
    novaObs: "",
  });
}

async function addObservacao() {
  if (!garantirCompetenciaAberta()) return;
  if (!obsEditor.funcionarioId || !obsEditor.novaObs.trim()) return;

  await addObservacaoMutation.mutateAsync({
    funcionarioId: obsEditor.funcionarioId,
    lojaId,
    ano,
    mes,
    texto: obsEditor.novaObs.trim(),
  });

  setObsEditor((prev) => ({ ...prev, novaObs: "" }));
}

async function removeObservacao(index: number) {
  if (!garantirCompetenciaAberta()) return;
  if (!obsEditor.funcionarioId) return;

  const linhaAtual = linhas.find((l) => l.funcionarioId === obsEditor.funcionarioId);
  const texto = linhaAtual?.observacoes?.[index];
  if (!texto) return;

  await removeObservacaoMutation.mutateAsync({
    funcionarioId: obsEditor.funcionarioId,
    lojaId,
    ano,
    mes,
    texto,
  });
}

function openValeEditor(linha: LinhaComQuadrante) {
  if (!garantirCompetenciaAberta()) return;
  setValeEditor({
    open: true,
    funcionarioId: linha.funcionarioId,
    descricao: "",
    valor: "",
    parcelas: "1",
  });
}

async function addVale() {
  if (!garantirCompetenciaAberta()) return;
  if (!valeEditor.funcionarioId) return;

  const descricao = valeEditor.descricao.trim();
  const valorTotal = parseValorBR(valeEditor.valor);
  const parcelas = Math.max(1, Math.floor(Number(valeEditor.parcelas || 1)));

  if (!descricao || valorTotal <= 0) return;

  const parcelasCriadas = createParcelasVale({
    descricao,
    valorTotal,
    parcelas,
    ano,
    mes,
  });

  await addValesMutation.mutateAsync({
  funcionarioId: Number(valeEditor.funcionarioId),
  lojaId,

  items: parcelasCriadas.map(
    ({ ano: anoParcela, mes: mesParcela, item }: any) => ({
      grupoId: item.grupoId,
      descricao: item.descricao,
      valorTotal,
      valorParcela: item.valor,
      parcelas: item.totalParcelas,
      parcelaAtual: item.parcelaAtual,
      ano: anoParcela,
      mes: mesParcela,
      mesOrigem: item.mesOrigem,
      tipo: item.totalParcelas > 1 ? "parcelado" as const : "simples" as const,
    })
  ),

      ultimaAlteracaoPor: usuarioLogado,
      ultimaAlteracaoEm: new Date()
});

  setValeEditor((prev) => ({
    ...prev,
    descricao: "",
    valor: "",
    parcelas: "1",
  }));
}

async function removeVale(vale: ValeItem) {
  if (!garantirCompetenciaAberta()) return;
  if (!valeEditor.funcionarioId) return;

  await removeValesMutation.mutateAsync({
    funcionarioId: valeEditor.funcionarioId,
    lojaId,
    grupoId: (vale as any).grupoId,
    valeId: Number((vale as any).id),
    ano,
    mes,
  });

  await folhaExtrasQuery.refetch();
}

function openNegativoEditor(linha: LinhaComQuadrante) {
  if (!garantirCompetenciaAberta()) return;
  if (linha.boleto >= 0) return;
  setNegativoEditor({
    open: true,
    linha,
  });
}

async function lançarNegativoNoPróximoMês() {
  if (!garantirCompetenciaAberta()) return;
  const linha = negativoEditor.linha;
  if (!linha) return;

  const valor = Math.abs(linha.boleto);
  if (valor <= 0) return;

  const currentDate = new Date(ano, mes - 1, 1);
  const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  const proximoAno = nextDate.getFullYear();
  const proximoMes = nextDate.getMonth() + 1;

  const nomeMesAtual = currentDate.toLocaleDateString("pt-BR", {
    month: "long",
  });

  const descricao = `Negativo do mês ${nomeMesAtual}/${ano}`;

  const parcelasCriadas = createParcelasVale({
    descricao,
    valorTotal: valor,
    parcelas: 1,
    ano: proximoAno,
    mes: proximoMes,
  });

  await addValesMutation.mutateAsync({
  funcionarioId: Number(valeEditor.funcionarioId),
  lojaId,

  items: parcelasCriadas.map(
    ({ ano: anoParcela, mes: mesParcela, item }: any) => ({
      grupoId: item.grupoId,
      descricao: item.descricao,
      valorTotal:valor,
      valorParcela: item.valor,
      parcelas: item.totalParcelas,
      parcelaAtual: item.parcelaAtual,
      ano: anoParcela,
      mes: mesParcela,
      mesOrigem: item.mesOrigem,
      tipo: item.totalParcelas > 1 ? "parcelado" as const : "simples" as const,
    })
  ),

  ultimaAlteracaoPor: usuarioLogado,
  ultimaAlteracaoEm: new Date(),
});

  await folhaExtrasQuery.refetch();

  setNegativoEditor({ open: false, linha: null });
}

  function exportarBoletos() {
    const rows = linhas
      .filter((linha) => linha.boleto > 0 && linha.quadrante !== "recepcao")
      .map((linha) => {
        const funcionario = getFuncionarioById(linha.funcionarioId) as any;
        return {
          nome: linha.nome,
          cpf: funcionario?.cpf || "",
          pix: funcionario?.pix || "",
          valor: linha.boleto,
        };
      });

    exportBoletosCsv(rows);
  }

  function openRegraSemanaEditor(
  linha: LinhaComQuadrante,
  semana: 1 | 2 | 3 | 4 | 5 | 7
  ) {
    if (!garantirCompetenciaAberta()) return;
    setRegraSemanaEditor({
      open: true,
      linha,
      semana,
    });
  }

  const linhaPremioAtual = useMemo(() => {
  if (!premioEditor.funcionarioId) return null;

  return linhas.find((l) => {
    return Number(l.funcionarioId) === Number(premioEditor.funcionarioId);
  }) || null;
}, [premioEditor.funcionarioId, linhas]);

  const premioAutomaticoAtual = useMemo(() => {
    if (!linhaPremioAtual) return { detalhes: [], total: 0 };

    // Consultores de São Leopoldo e Gravataí usam a regra mensal exclusiva
    // definida nesta tela. A discriminação precisa usar o mesmo detalhamento
    // que gerou a premiação da linha, e não a Meta 2 antiga do payrollStore.
    if (
      linhaPremioAtual.funcao === "consultor_vendas" &&
      ehConsultorSulMensal(linhaPremioAtual.loja_id)
    ) {
      const detalhesConsultorSul =
        ((linhaPremioAtual as any).detalhesPremiacaoConsultorSul || []) as Array<{
          descricao: string;
          valor: number;
        }>;

      return {
        detalhes: detalhesConsultorSul,
        total: detalhesConsultorSul.reduce(
          (acc, item) => acc + Number(item.valor || 0),
          0
        ),
      };
    }

    const detalhesPremiacaoEspecial =
  ((linhaPremioAtual as any).detalhesPremiacaoEspecial || []) as Array<{
    descricao: string;
    valor: number;
  }>;

if (detalhesPremiacaoEspecial.length > 0) {
  return {
    detalhes: detalhesPremiacaoEspecial,
    total: detalhesPremiacaoEspecial.reduce(
      (acc, item) => acc + Number(item.valor || 0),
      0
    ),
  };
}

  if (linhaPremioAtual.funcao === "supervisor") {
  const resumo = resumoSupervisorQuery.data as any;

  const totalGrupo =
    Number(resumo?.joinville || 0) +
    Number(resumo?.blumenau || 0) +
    Number(resumo?.saoJose || 0) +
    Number(resumo?.florianopolis || 0);

  const detalhes = [];

  if (totalGrupo >= 1420000) {
    detalhes.push({ descricao: "Meta Grupo R$ 1.420.000,00", valor: 250 });
  }

  if (totalGrupo >= 1540000) {
    detalhes.push({ descricao: "Meta Grupo R$ 1.540.000,00", valor: 250 });
  }

  if (totalGrupo >= 1600000) {
    detalhes.push({ descricao: "Meta Grupo R$ 1.600.000,00", valor: 250 });
  }

  if (totalGrupo > SUPERVISOR_RECORDE_GRUPO) {
    detalhes.push({
      descricao: "Recorde Grupo",
      valor: (totalGrupo * 0.001) / 4,
    });
  }

  return {
    detalhes,
    total: detalhes.reduce((acc, item) => acc + Number(item.valor || 0), 0),
  };
}
   return getPremiacaoAutomaticaDetalhes({
  funcao: linhaPremioAtual.funcao,
  cidade: linhaPremioAtual.loja_id.toString(),
  tipoMeta:
    linhaPremioAtual.funcao === "consultor_vendas" &&
   linhaPremioAtual.quadrante === "consultor_vendas_mensal"
      ? "meta2"
      : linhaPremioAtual.tipoMeta,
  sem1: linhaPremioAtual.sem1,
  sem2: linhaPremioAtual.sem2,
  sem3: linhaPremioAtual.sem3,
  sem4: linhaPremioAtual.sem4,
});

  }, [linhaPremioAtual]);

  const linhaObsAtual = useMemo(() => {
    if (!obsEditor.funcionarioId) return null;
    return linhas.find((l) => l.funcionarioId === obsEditor.funcionarioId) || null;
  }, [obsEditor.funcionarioId, linhas]);

  const linhaValeAtual = useMemo(() => {
    if (!valeEditor.funcionarioId) return null;
    return linhas.find((l) => l.funcionarioId === valeEditor.funcionarioId) || null;
  }, [valeEditor.funcionarioId, linhas]);

  function formatarFaixasMeta(
  faixas: Array<{
    minimo: number;
    percentual: number;
  }>
) {
  return faixas
    .map((faixa, index) => {
      const proximaFaixa = faixas[index + 1];

      const percentual = Number(faixa.percentual || 0)
        .toFixed(2)
        .replace(".", ",");

      if (index === 0 && proximaFaixa) {
        const limite =
          Number(proximaFaixa.minimo || 0) - 0.01;

        return `Até R$ ${money(limite)} = ${percentual}%`;
      }

      if (proximaFaixa) {
        const limite =
          Number(proximaFaixa.minimo || 0) - 0.01;

        return `R$ ${money(faixa.minimo)} até R$ ${money(
          limite
        )} = ${percentual}%`;
      }

      return `R$ ${money(
        faixa.minimo
      )} ou mais = ${percentual}%`;
    })
    .join("\n");
}

function getMetaFuncaoTexto(
  linha: LinhaComQuadrante,
  semana: number
) {
  const semanaVisual: SemanaComissaoVisual = semana === 7 ? 5 : (semana as SemanaComissaoVisual);
  const funcao = String(
    getFuncaoSemanaEfetiva(linha, semanaVisual) || linha.funcao || ""
  )
    .trim()
    .toLowerCase();

  // VENDEDOR E MECÂNICO
  if (
    funcao === "vendedor" ||
    funcao === "mecanico"
  ) {
    const regra = getRegraVendedorMecanico({
      lojaId: linha.loja_id,
      funcao,
    });

    if (regra) {
      return formatarFaixasMeta(regra.faixas);
    }
  }

  // ALINHADOR
  if (funcao === "alinhador") {
    const regra = getRegraAlinhador({
      lojaId: linha.loja_id,
      funcionarioNome: linha.nome,
    });

    if (regra) {
      return formatarFaixasMeta(regra.faixas);
    }
  }

  // GERENTE
if (funcao === "gerente") {
  // São José e São Leopoldo:
  // SEM1 a SEM4 = comissão normal de vendedor
  // SEM5 = comissão de gerente sobre a loja
  const gerenteSaoJoseVenda =
    (linha.loja_id === 3 || linha.loja_id === 6) &&
    ((semana >= 1 && semana <= 4) || semana === 7);

  // Florianópolis:
  // SEM1 = liquidez de venda
  // SEM2 = liquidez da loja
  const gerenteFlorianopolisVenda =
    linha.loja_id === 4 &&
    semana === 1;

  if (
    gerenteSaoJoseVenda ||
    gerenteFlorianopolisVenda
  ) {
    const regraVendedor =
      getRegraVendedorMecanico({
        lojaId: linha.loja_id,
        funcao: "vendedor",
      });

    if (regraVendedor) {
      return formatarFaixasMeta(
        regraVendedor.faixas
      );
    }
  }

  const regraGerente = getRegraGerente({
    lojaId: linha.loja_id,
  });

  if (regraGerente) {
    return formatarFaixasMeta(
      regraGerente.faixas
    );
  }
}

  return linha.regraMeta || "Sem meta cadastrada";
}

  const detalheSemanaAtual = useMemo(() => {
    const linha = regraSemanaEditor.linha;
    const semana = regraSemanaEditor.semana;
    if (!linha || !semana) return null;

    const isConsultor = linha.funcao === "consultor_vendas";
    const isRecepcao = linha.funcao === "recepcionista";
    const isSupervisor = linha.funcao === "supervisor";
    const isConsultorSulMensal =
      isConsultor && ehConsultorSulMensal(linha.loja_id);

    if (isConsultorSulMensal) {
      const calculo = calcularConsultorSulMensal(Number(linha.sem1 || 0));
      const metasConsultorSul = [
        {
          minimo: 0,
          maximo: 199,
          faixa: "Até 199 carros",
          valorPorCarro: 7,
          premioAdicional: 0,
          premioAcumulado: 0,
        },
        {
          minimo: 200,
          maximo: 249,
          faixa: "200 a 249 carros",
          valorPorCarro: 7,
          premioAdicional: 300,
          premioAcumulado: 300,
        },
        {
          minimo: 250,
          maximo: 299,
          faixa: "250 a 299 carros",
          valorPorCarro: 10,
          premioAdicional: 500,
          premioAcumulado: 800,
        },
        {
          minimo: 300,
          maximo: null,
          faixa: "300 carros ou mais",
          valorPorCarro: 12,
          premioAdicional: 1000,
          premioAcumulado: 1800,
        },
      ];

      return {
        linha,
        semana,
        isConsultor: true,
        isRecepcao: false,
        isSupervisor: false,
        isConsultorSulMensal: true,
        base: calculo.totalCarros,
        percentual: calculo.valorPorCarro,
        comissao: calculo.comissao,
        regraTexto: getRegraConsultorSulTexto(calculo.totalCarros),
        metaTitulo: "Meta - Consultor de Vendas Mensal",
        metaDescricao: "Premiações acumulativas.",
        baseLabel: "Total de carros",
        extra: "",
        metasConsultorSul,
        premiacaoConsultorSul: calculo.premiacao,
      };
    }

    if (isSupervisor) {
      const lojaIdSupervisor = Number(linha.loja_id);

      const regraLoja = regraSupervisor.lojas.find(
        (loja) => loja.lojaId === lojaIdSupervisor
      );

      const liquidezLoja = Number(linha.sem1 || 0);

      const calculoLoja = calcularPremiacaoSupervisorLoja({
        lojaId: lojaIdSupervisor,
        liquidezLoja,
      });

      const resumo = resumoSupervisorQuery.data as any;

      const totalGrupo =
        Number(resumo?.joinville || 0) +
        Number(resumo?.blumenau || 0) +
        Number(resumo?.saoJose || 0) +
        Number(resumo?.florianopolis || 0);

      const calculoGrupo = calcularPremiacaoSupervisorGrupo({
        liquidezTotalGrupo: totalGrupo,
      });

      return {
        linha,
        semana,
        isConsultor: false,
        isRecepcao: false,
        isSupervisor: true,

        base: liquidezLoja,
        percentual: 0,
        comissao: Number(linha.totalComissao || 0),
        regraTexto: "",

        metaTitulo: `Metas do Supervisor - ${
          regraLoja?.nomeLoja || "Loja"
        }`,
        baseLabel: "Liquidez da loja",
        extra: "",

        supervisorMetasLoja: regraLoja?.metas || [],
        supervisorMetasGrupo: regraSupervisor.metasGrupo || [],
        supervisorLiquidezLoja: liquidezLoja,
        supervisorTotalGrupo: totalGrupo,
        supervisorTotalPremioLoja: Number(calculoLoja.total || 0),
        supervisorTotalPremioGrupo: Number(calculoGrupo.totalPorLoja || 0),
        supervisorRecorde: Number(regraSupervisor.recordeGrupoAtual || 0),
        supervisorPercentualRecorde: Number(
          regraSupervisor.percentualPremioRecorde || 0
        ),
      };
    }

    if (
      linha.funcao === "gerente" &&
      (linha.loja_id === 3 || linha.loja_id === 6)
    ) {

  // resto do código continua igual...
  const base =
  semana === 5
    ? Number((linha as any).liquidezLojaGerente || 0)
    : semana === 7
    ? Number((linha as any).sem5Extra || 0)
    : semana === 1
    ? linha.sem1
    : semana === 2
    ? linha.sem2
    : semana === 3
    ? linha.sem3
    : linha.sem4;

  const percentual =
  semana === 5
    ? Number((linha as any).percLojaGerente || 0)
    : semana === 7
    ? Number((linha as any).perc5Extra || 0)
    : semana === 1
    ? linha.perc1
    : semana === 2
    ? linha.perc2
    : semana === 3
    ? linha.perc3
    : linha.perc4;

  const comissao =
  semana === 5
    ? Number((linha as any).comLojaGerente || 0)
    : semana === 7
    ? Number((linha as any).com5Extra || 0)
    : semana === 1
    ? linha.com1
    : semana === 2
    ? linha.com2
    : semana === 3
    ? linha.com3
    : linha.com4;

return {
  linha,
  semana,
  isConsultor: false,
  isRecepcao: false,
  isSupervisor: false,
  base,
  percentual,
  comissao,
  regraTexto: `${percentual.toFixed(2)}%`,
  metaTitulo:
    semana === 5
      ? "Meta - Gerente"
      : "Meta - Vendedor",
  metaDescricao: getMetaFuncaoTexto(linha, semana),
  baseLabel:
    semana === 5
      ? "Liquidez Loja"
      : semana === 7
      ? "Liquidez SEM5"
      : `Liquidez SEM${semana}`,
  extra: "",
};

}

    if (isRecepcao) {
      const config = getRecepcaoConfig(linha.nome, linha.loja_id.toString());

      if (semana === 1) {
        return {
          linha,
          semana,
          isConsultor: false,
          isRecepcao: true,
          isSupervisor: false,
          base: linha.sem1,
          regraTexto: `R$ ${money(config.valorVenda)}`,
          comissao: linha.sem1 * config.valorVenda,
          metaTitulo: "Regra da recepção",
          baseLabel: "Vendas fechadas",
          extra: "",
        };
      }

      return {
        linha,
        semana,
        isConsultor: false,
        isRecepcao: true,
        isSupervisor: false,
        base: linha.sem2,
        regraTexto: `R$ ${money(config.valorEntrada)}`,
        comissao: linha.sem2 * config.valorEntrada,
        metaTitulo: "Regra da recepção",
        baseLabel: "Entradas",
        extra: "",
      };
    }

    const base =
      semana === 7
        ? Number((linha as any).sem5Extra || 0)
        : semana === 1
        ? linha.sem1
        : semana === 2
        ? linha.sem2
        : semana === 3
        ? linha.sem3
        : linha.sem4;
    const percentual =
      semana === 7
        ? Number((linha as any).perc5Extra || 0)
        : semana === 1
        ? linha.perc1
        : semana === 2
        ? linha.perc2
        : semana === 3
        ? linha.perc3
        : linha.perc4;
    const comissao =
      semana === 7
        ? Number((linha as any).com5Extra || 0)
        : semana === 1
        ? linha.com1
        : semana === 2
        ? linha.com2
        : semana === 3
        ? linha.com3
        : linha.com4;

    return {
  linha,
  semana,
  isConsultor,
  isRecepcao: false,
  isSupervisor: false,
  base,
  percentual,
  comissao,

  regraTexto: isConsultor
    ? getConsultorRegraTexto({
        cidade: linha.loja_id.toString(),
        tipoMeta: linha.tipoMeta,
        carrosSemana: base,
      })
    : `${percentual.toFixed(2)}%`,

  metaTitulo: isConsultor
    ? linha.tipoMeta === "meta2"
      ? "Meta 2"
      : "Meta 1"
    : linha.funcao === "gerente"
    ? (
        ((linha.loja_id === 3 || linha.loja_id === 6) && ((semana >= 1 && semana <= 4) || semana === 7)) ||
        (linha.loja_id === 4 && semana === 1)
      )
      ? "Meta - Vendedor"
      : "Meta - Gerente"
    : `Meta - ${
        linha.funcao === "mecanico"
          ? "Mecânico"
          : linha.funcao === "vendedor"
          ? "Vendedor"
          : linha.funcao === "alinhador"
          ? "Alinhador"
          : linha.funcao
      }`,

  metaDescricao: isConsultor
    ? linha.regraMeta || ""
    : getMetaFuncaoTexto(linha, semana),

  baseLabel: isConsultor
    ? "Quantidade lançada"
    : "Liquidez lançada",

  extra: "",
};
  }, [regraSemanaEditor, resumoSupervisorQuery.data]);

  const supervisorAtual = linhas.find((l) => l.funcao === "supervisor");

const totalLiquidezGeral = Number(supervisorAtual?.sem1 || 0);

const totalComissaoGeral = linhas.reduce(
  (sum, l) => sum + Number(l.totalComissao || 0) + Number(l.premiacao || 0),
  0
);

const totalBoletoGeral = linhas.reduce((sum, l) => sum + Number(l.boleto || 0), 0);

const totalINSS = linhas.reduce((sum, l) => sum + Number(l.inss || 0), 0);
const totalAdiant = linhas.reduce((sum, l) => sum + Number(l.adiant || 0), 0);
const totalHolerite = linhas.reduce((sum, l) => sum + Number(l.holerite || 0), 0);
const totalFolhaGeral =
  (folhaFiltros.inss ? totalINSS : 0) +
  (folhaFiltros.adiant ? totalAdiant : 0) +
  (folhaFiltros.holerite ? totalHolerite : 0);
  const ordemQuadrantes: QuadranteKey[] = [
  "gerente",
  "comissao_semanal",
  "comissao_mensal",
  "alinhador",
  "recepcao",
  "consultor_vendas",
  "consultor_vendas_mensal",
  "supervisora_consultores_pj",
  "supervisor_pj",
  "salario_fixo",
];

  const linhasPorQuadrante = useMemo(() => {
  return ordemQuadrantes.map((key) => {
    let linhasQuadrante = linhas.filter((l) => l.quadrante === key);

    // Ordenação especial para salário fixo
    if (key === "salario_fixo") {
      linhasQuadrante = [...linhasQuadrante].sort((a, b) => {
        const funcaoCompare = a.funcao.localeCompare(b.funcao);

        if (funcaoCompare !== 0) {
          return funcaoCompare;
        }

        return a.nome.localeCompare(b.nome);
      });
    }

    return {
      key,
      titulo: getQuadranteTitulo(key),
      descricao: getQuadranteDescricao(key),
      linhas: linhasQuadrante,
    };
  });
}, [linhas]);
  useEffect(() => {
  if (!meQuery.isLoading && !meQuery.data) {
    setLocation("/");
  }
}, [meQuery.isLoading, meQuery.data, setLocation]);

if (
  meQuery.isLoading ||
  funcionariosQuery.isLoading ||
  folhaBaseQuery.isLoading ||
  folhaExtrasQuery.isLoading ||
  fechamentoQuery.isLoading ||
  trocasFuncaoQuery.isLoading
) {

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </div>
  );
}

if (!meQuery.data) {
  return null;
}

if (
  funcionariosQuery.error ||
  folhaBaseQuery.error ||
  folhaExtrasQuery.error ||
  fechamentoQuery.error ||
  trocasFuncaoQuery.error
) {

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-red-400">
        {funcionariosQuery.error?.message ||
  folhaBaseQuery.error?.message ||
  folhaExtrasQuery.error?.message ||
  fechamentoQuery.error?.message ||
  trocasFuncaoQuery.error?.message}
      </p>
    </div>
  );
}
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] p-4 text-white md:p-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(212,175,55,0.11),transparent_27%),radial-gradient(circle_at_92%_8%,rgba(212,175,55,0.06),transparent_24%)]" />
      <div className="relative mx-auto max-w-[1900px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#121212] via-[#090909] to-[#050505] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] md:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#D4AF37]/[0.08] blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/")}
                  className="h-10 w-10 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.045] p-0 text-[#D4AF37] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.055] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8C078]">
                  <Sparkles className="h-3 w-3" /> Gestão financeira
                </span>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                Folha de <span className="text-[#D4AF37]">Pagamento</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-500">
                Conferência de liquidez, comissões, descontos, boletos e fechamento por competência.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 xl:items-end">
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <div
                  className={`rounded-xl border px-3 py-2 text-xs font-bold tracking-wide ${
                    mesFechado
                      ? "border-red-500/30 bg-red-950/25 text-red-300"
                      : "border-emerald-500/25 bg-emerald-950/20 text-emerald-300"
                  }`}
                >
                  {mesFechado ? "🔒 MÊS FECHADO" : "● MÊS ABERTO"}
                </div>

                {podeGerenciarFechamento && !mesFechado && (
                  <Button
                    variant="outline"
                    className="rounded-xl border-red-500/30 bg-black/20 text-red-300 hover:bg-red-950/30 hover:text-red-200"
                    disabled={fecharMesMutation.isPending}
                    onClick={fecharMesAtual}
                  >
                    {fecharMesMutation.isPending ? "Fechando..." : "Fechar mês"}
                  </Button>
                )}

                {podeGerenciarFechamento && mesFechado && (
                  <Button
                    variant="outline"
                    className="rounded-xl border-[#D4AF37]/30 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F7E5A7]"
                    onClick={() => {
                      setSenhaReabertura("");
                      setErroFechamento("");
                      setReabrirMesOpen(true);
                    }}
                  >
                    Reabrir mês
                  </Button>
                )}

                <Button
                  className="rounded-xl bg-gradient-to-r from-[#C79C2C] via-[#D4AF37] to-[#E2C45F] font-bold text-black shadow-[0_10px_30px_rgba(212,175,55,0.16)] transition hover:brightness-110"
                  onClick={exportarBoletos}
                >
                  <ReceiptText className="mr-2 h-4 w-4" />
                  Exportar boletos
                </Button>
              </div>

              {mesFechado && fechamentoQuery.data?.fechadoPorNome && (
                <p className="text-xs text-gray-600">
                  Fechado por {fechamentoQuery.data.fechadoPorNome}
                  {fechamentoQuery.data.fechadoEm
                    ? ` • ${new Date(fechamentoQuery.data.fechadoEm).toLocaleString("pt-BR")}`
                    : ""}
                </p>
              )}

              {erroFechamento && !reabrirMesOpen && (
                <p className="max-w-xl text-right text-xs text-red-400">{erroFechamento}</p>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <Card className="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#121212] via-[#0b0b0b] to-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/45 hover:shadow-[0_22px_65px_rgba(212,175,55,0.10)]">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#D4AF37]/10 blur-3xl" />
            <CardContent className="relative p-5">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">Total Liquidez</p>
                  <div className="mt-2 h-px w-8 bg-gradient-to-r from-[#D4AF37] to-transparent" />
                </div>
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  <TrendingUp className="h-4 w-4 text-[#D4AF37]" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight text-white md:text-3xl">R$ {money(totalLiquidezGeral)}</p>
              <p className="mt-2 text-xs text-gray-600">Liquidez consolidada da competência</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#121212] via-[#0b0b0b] to-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/45 hover:shadow-[0_22px_65px_rgba(212,175,55,0.10)]">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#D4AF37]/10 blur-3xl" />
            <CardContent className="relative p-5">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">Comissão + Premiação</p>
                  <div className="mt-2 h-px w-8 bg-gradient-to-r from-[#D4AF37] to-transparent" />
                </div>
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  <BadgeDollarSign className="h-4 w-4 text-[#D4AF37]" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight text-[#F2D675] md:text-3xl">R$ {money(totalComissaoGeral)}</p>
              <p className="mt-2 text-xs text-gray-600">Custo variável calculado na folha</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-[#101311] via-[#0b0b0b] to-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/30">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-emerald-500/[0.07] blur-3xl" />
            <CardContent className="relative p-5">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">Total Boleto</p>
                  <div className="mt-2 h-px w-8 bg-gradient-to-r from-emerald-400/70 to-transparent" />
                </div>
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] p-2.5">
                  <ReceiptText className="h-4 w-4 text-emerald-400" />
                </div>
              </div>
              <p className={`text-2xl font-black tracking-tight md:text-3xl ${totalBoletoGeral < 0 ? "text-red-400" : "text-emerald-400"}`}>
                R$ {money(totalBoletoGeral)}
              </p>
              <p className="mt-2 text-xs text-gray-600">Total previsto para exportação</p>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#121212] via-[#0b0b0b] to-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.36)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/45 hover:shadow-[0_22px_65px_rgba(212,175,55,0.10)]">
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#D4AF37]/10 blur-3xl" />
            <CardContent className="relative p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600">Total Folha</p>
                  <div className="mt-2 h-px w-8 bg-gradient-to-r from-[#D4AF37] to-transparent" />
                </div>
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5">
                  <WalletCards className="h-4 w-4 text-[#D4AF37]" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight text-emerald-400 md:text-3xl">R$ {money(totalFolhaGeral)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <button type="button" onClick={() => setFolhaFiltros((prev) => ({ ...prev, inss: !prev.inss }))} className={`rounded-lg border px-2 py-1.5 transition ${folhaFiltros.inss ? "border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#F2D675]" : "border-white/[0.05] bg-white/[0.02] text-gray-700"}`}>INSS</button>
                <button type="button" onClick={() => setFolhaFiltros((prev) => ({ ...prev, adiant: !prev.adiant }))} className={`rounded-lg border px-2 py-1.5 transition ${folhaFiltros.adiant ? "border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#F2D675]" : "border-white/[0.05] bg-white/[0.02] text-gray-700"}`}>Adiant.</button>
                <button type="button" onClick={() => setFolhaFiltros((prev) => ({ ...prev, holerite: !prev.holerite }))} className={`rounded-lg border px-2 py-1.5 transition ${folhaFiltros.holerite ? "border-[#D4AF37]/25 bg-[#D4AF37]/10 text-[#F2D675]" : "border-white/[0.05] bg-white/[0.02] text-gray-700"}`}>Holerite</button>
              </div>
            </CardContent>
          </Card>
        </div>

<Card className="overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#070707] shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
  <CardContent className="px-5 py-4">
    <div className="grid grid-cols-12 items-center gap-4">
      <div className="col-span-12 md:col-span-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#D4AF37]">Filtros</p>
      </div>

      <div className="col-span-12 md:col-span-2">
        <div className="flex items-center gap-3">
          <Label className="text-gray-300 whitespace-nowrap">Cidade</Label>
          <Select value={selectedLoja} onValueChange={setSelectedLoja}>
            <SelectTrigger className="h-10 rounded-xl border-[#D4AF37]/20 bg-[#0d0d0d] text-white shadow-inner shadow-black/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#D4AF37]/20 bg-[#0b0b0b] text-white">
              {LOJAS.map((loja) => (
                <SelectItem
                  key={loja.id}
                  value={loja.id.toString()}
                  className="text-white"
                >
                  {loja.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="col-span-12 md:col-span-2">
        <div className="flex items-center gap-3">
          <Label className="text-gray-300 whitespace-nowrap">Ano</Label>
          <Input
            type="number"
            value={ano}
            onChange={(e) => setAno(parseInt(e.target.value, 10) || 2026)}
            className="h-10 rounded-xl border-[#D4AF37]/20 bg-[#0d0d0d] text-white shadow-inner shadow-black/30"
          />
        </div>
      </div>

      <div className="col-span-12 md:col-span-2">
        <div className="flex items-center gap-3">
          <Label className="text-gray-300 whitespace-nowrap">Mês</Label>
          <Select
            value={mes.toString()}
            onValueChange={(value) => setMes(parseInt(value, 10))}
          >
            <SelectTrigger className="h-10 rounded-xl border-[#D4AF37]/20 bg-[#0d0d0d] text-white shadow-inner shadow-black/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#D4AF37]/20 bg-[#0b0b0b] text-white">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem
                  key={m}
                  value={m.toString()}
                  className="text-white"
                >
                  {new Date(2026, m - 1).toLocaleDateString("pt-BR", {
                    month: "long",
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  </CardContent>
</Card>

        {mesFechado && (
          <div className="rounded-2xl border border-red-500/25 bg-gradient-to-r from-red-950/25 via-red-950/10 to-transparent px-5 py-4 shadow-[0_16px_45px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="font-bold text-red-300">🔒 Competência bloqueada para alterações</p>
                <p className="text-sm text-gray-400 mt-1">
                  A folha continua disponível para consulta e exportação, mas nenhum valor, premiação, vale, observação ou importação pode ser alterado enquanto o mês estiver fechado.
                </p>
              </div>
              <div className="text-xs text-gray-500 md:text-right">
                <p>{String(mes).padStart(2, "0")}/{ano} • {LOJAS.find((loja) => loja.id === lojaId)?.nome}</p>
              </div>
            </div>
          </div>
        )}

        {usaMetaSemanal(lojaId, ano, mes) && (
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-r from-[#111111] via-[#0b0b0b] to-[#080808] px-5 py-4 shadow-[0_16px_45px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-[#F2D675]">Semanas da competência</p>
                <p className="mt-1 text-sm text-gray-500">
                  SEM1 a SEM4 ficam disponíveis normalmente. Abra a SEM5 somente nos meses que tiverem uma quinta semana de produção.
                </p>
              </div>
              {sem5Ativa ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="inline-flex items-center justify-center rounded-xl border border-green-500/25 bg-green-500/[0.08] px-4 py-2 text-sm font-bold text-green-300">
                    ✓ SEM5 ATIVA
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={desativarSem5Competencia}
                    disabled={mesFechado || desativarSem5Mutation.isPending}
                    className="border-red-500/30 bg-red-500/[0.04] text-red-300 hover:border-red-400/50 hover:bg-red-500/[0.10] hover:text-red-200 disabled:opacity-50"
                  >
                    {desativarSem5Mutation.isPending ? "Removendo..." : "Remover SEM5"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={ativarSem5Competencia}
                  disabled={mesFechado || ativarSem5Mutation.isPending}
                  className="bg-[#D4AF37] text-black hover:bg-[#F2D675] disabled:opacity-50"
                >
                  {ativarSem5Mutation.isPending ? "Adicionando..." : "+ Adicionar SEM5"}
                </Button>
              )}
            </div>
          </div>
        )}

        {linhas.length === 0 ? (
          <Card className="rounded-2xl border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] to-[#080808] text-white shadow-[0_16px_45px_rgba(0,0,0,0.25)]">
            <CardContent className="py-10 text-center text-gray-400">
              Nenhum funcionário ativo cadastrado para esta cidade.
            </CardContent>
          </Card>
        ) : (
          linhasPorQuadrante.map((grupo) => (
            <TabelaQuadrante
              key={grupo.key}
              titulo={grupo.titulo}
              descricao={grupo.descricao}
              linhas={grupo.linhas}
              quadrante={grupo.key}
              onOpenCellEditor={openCellEditor}
              onOpenPremioEditor={openPremioEditor}
              onOpenObsEditor={openObsEditor}
              onOpenValeEditor={openValeEditor}
              onOpenNegativoEditor={(linha) => setNegativoEditor({ open: true, linha })}
              onOpenRegraSemanaEditor={openRegraSemanaEditor}
              onOpenFuncionarioDetalhe={(linha) =>
                setFuncionarioDetalheId(Number(linha.funcionarioId))
              }
              onOpenTransicaoFuncao={openTransicaoFuncaoEditor}
              onOpenImportacaoSemana={openImportacaoSemana}
              onOpenImportacaoAdiantamento={openImportacaoAdiantamento}
              onOpenImportacaoHolerite={openImportacaoHolerite}
              onUpdateComposicaoSemanaPercentual={updateComposicaoSemanaPercentual}
              sem5Ativa={sem5Ativa}
            />
          ))
        )}
      </div>

      <Dialog
        open={transicaoFuncaoEditor.open}
        onOpenChange={(open) => {
          if (
            !open &&
            !upsertTransicaoFuncaoMutation.isPending &&
            !corrigirDataTrocaMutation.isPending
          ) {
            setTransicaoFuncaoEditor({
              open: false,
              linha: null,
              quantidadeAnterior1: "",
              quantidadeAnterior2: "",
              valorFixoAnterior: "",
              corrigindoData: false,
              novaDataMudanca: "",
            });
          }
        }}
      >
        <DialogContent className="border border-orange-400/30 bg-[#090909] text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {transicaoFuncaoEditor.linha?.trocaFuncaoMes && (() => {
            const linha = transicaoFuncaoEditor.linha as LinhaComQuadrante;
            const troca = linha.trocaFuncaoMes as TrocaFuncaoMes;
            const proporcao = calcularProporcaoTrocaFuncao(troca.dataMudanca, ano, mes);
            const totalFolha =
              Number(linha.inss || 0) +
              Number(linha.adiant || 0) +
              Number(linha.holerite || 0);
            const descontoNovaFuncao =
              proporcao &&
              funcaoAnteriorUsaFolhaFixa(troca.funcaoAnterior, lojaId, ano, mes) &&
              quadranteDescontaFolhaCompleta(linha.quadrante)
                ? Number((totalFolha * proporcao.proporcaoNovaFuncao).toFixed(2))
                : totalFolha;
            const parcelaFuncaoAnterior = Math.max(0, totalFolha - descontoNovaFuncao);
            const configRecepcao = getRecepcaoConfig(linha.nome, String(lojaId));
            const quantidadeAnterior1 = Math.max(
              0,
              Number(transicaoFuncaoEditor.quantidadeAnterior1 || 0)
            );
            const quantidadeAnterior2 = Math.max(
              0,
              Number(transicaoFuncaoEditor.quantidadeAnterior2 || 0)
            );
            const comissaoAnteriorPreview =
              troca.funcaoAnterior === "recepcionista"
                ? Number(
                    (
                      quantidadeAnterior1 * Number(configRecepcao.valorVenda || 0) +
                      ([3, 4].includes(lojaId)
                        ? quantidadeAnterior2 * Number(configRecepcao.valorEntrada || 0)
                        : 0)
                    ).toFixed(2)
                  )
                : 0;
            const comissaoNovaFuncao = Math.max(
              0,
              Number(linha.totalComissao || 0) - Number(linha.comissaoFuncaoAnterior || 0)
            );
            const totalComissaoPreview = Number(
              (comissaoNovaFuncao + comissaoAnteriorPreview).toFixed(2)
            );

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-[#F2D675]">Transição de função</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    {linha.nome} • {labelFuncaoFuncionario(troca.funcaoAnterior, lojaId)} → {labelFuncaoFuncionario(troca.funcaoNova, lojaId)} • {formatarDataBR(troca.dataMudanca)}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Função anterior</p>
                      <p className="mt-1 font-semibold text-orange-300">
                        {labelFuncaoFuncionario(troca.funcaoAnterior, lojaId)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Nova função</p>
                      <p className="mt-1 font-semibold text-[#F2D675]">
                        {labelFuncaoFuncionario(troca.funcaoNova, lojaId)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Data efetiva</p>

                      {!transicaoFuncaoEditor.corrigindoData ? (
                        <>
                          <p className="mt-1 font-semibold text-white">
                            {formatarDataBR(troca.dataMudanca)}
                          </p>
                          {!mesFechado && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="mt-2 h-8 px-2 text-xs text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                              disabled={
                                upsertTransicaoFuncaoMutation.isPending ||
                                corrigirDataTrocaMutation.isPending
                              }
                              onClick={() =>
                                setTransicaoFuncaoEditor((prev) => ({
                                  ...prev,
                                  corrigindoData: true,
                                  novaDataMudanca: formatarDataInputFuncionario(troca.dataMudanca),
                                }))
                              }
                            >
                              Corrigir data
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <Input
                            type="date"
                            value={transicaoFuncaoEditor.novaDataMudanca}
                            onChange={(e) =>
                              setTransicaoFuncaoEditor((prev) => ({
                                ...prev,
                                novaDataMudanca: e.target.value,
                              }))
                            }
                            disabled={corrigirDataTrocaMutation.isPending}
                            className="h-9 border-[#D4AF37]/30 bg-black text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              className="h-8 flex-1 bg-[#D4AF37] px-2 text-xs font-semibold text-black hover:bg-[#F2D675]"
                              disabled={corrigirDataTrocaMutation.isPending}
                              onClick={salvarCorrecaoDataTrocaEditor}
                            >
                              {corrigirDataTrocaMutation.isPending ? "Salvando..." : "Salvar data"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-gray-400"
                              disabled={corrigirDataTrocaMutation.isPending}
                              onClick={() =>
                                setTransicaoFuncaoEditor((prev) => ({
                                  ...prev,
                                  corrigindoData: false,
                                  novaDataMudanca: formatarDataInputFuncionario(troca.dataMudanca),
                                }))
                              }
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {troca.funcaoAnterior === "recepcionista" && (
                    <div className="rounded-xl border border-orange-400/25 bg-orange-500/[0.055] p-4">
                      <p className="font-semibold text-orange-200">Produção da Recepção antes da troca</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Esta produção pertence à função anterior e é somada à comissão do mês sem criar um segundo cadastro.
                      </p>
                      <div className={`mt-4 grid grid-cols-1 gap-4 ${[3, 4].includes(lojaId) ? "sm:grid-cols-2" : ""}`}>
                        <div>
                          <Label className="text-gray-300">Vendas fechadas</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            disabled={mesFechado}
                            value={transicaoFuncaoEditor.quantidadeAnterior1}
                            onChange={(e) =>
                              setTransicaoFuncaoEditor((prev) => ({
                                ...prev,
                                quantidadeAnterior1: e.target.value,
                              }))
                            }
                            className="mt-1 border-orange-400/25 bg-black"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            R$ {money(configRecepcao.valorVenda)} por venda
                          </p>
                        </div>

                        {[3, 4].includes(lojaId) && (
                          <div>
                            <Label className="text-gray-300">Entradas</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              disabled={mesFechado}
                              value={transicaoFuncaoEditor.quantidadeAnterior2}
                              onChange={(e) =>
                                setTransicaoFuncaoEditor((prev) => ({
                                  ...prev,
                                  quantidadeAnterior2: e.target.value,
                                }))
                              }
                              className="mt-1 border-orange-400/25 bg-black"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              R$ {money(configRecepcao.valorEntrada)} por entrada
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-orange-400/15 pt-3">
                        <span className="text-sm text-gray-300">Comissão da função anterior</span>
                        <strong className="text-orange-300">R$ {money(comissaoAnteriorPreview)}</strong>
                      </div>
                    </div>
                  )}

                  {funcaoAnteriorUsaFolhaFixa(troca.funcaoAnterior, lojaId, ano, mes) && (
                    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">
                      <p className="font-semibold text-[#F2D675]">Proporção da folha na mudança</p>
                      <p className="mt-1 text-xs text-gray-400">
                        O Holerite oficial não é recalculado. A proporção define apenas quanto de INSS + Adiantamento + Holerite será compensado na comissão da nova função.
                      </p>

                      {proporcao && (
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-black/35 p-3">
                            <p className="text-[10px] uppercase text-gray-500">Função anterior</p>
                            <p className="mt-1 font-semibold text-white">{proporcao.diasFuncaoAnterior} dia(s)</p>
                          </div>
                          <div className="rounded-lg bg-black/35 p-3">
                            <p className="text-[10px] uppercase text-gray-500">Nova função</p>
                            <p className="mt-1 font-semibold text-white">{proporcao.diasFuncaoNova} dia(s)</p>
                          </div>
                          <div className="rounded-lg bg-black/35 p-3">
                            <p className="text-[10px] uppercase text-gray-500">% nova função</p>
                            <p className="mt-1 font-semibold text-[#F2D675]">{(proporcao.proporcaoNovaFuncao * 100).toFixed(2)}%</p>
                          </div>
                          <div className="rounded-lg bg-black/35 p-3">
                            <p className="text-[10px] uppercase text-gray-500">Folha total</p>
                            <p className="mt-1 font-semibold text-white">R$ {money(totalFolha)}</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 space-y-2 border-t border-[#D4AF37]/15 pt-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-400">Parcela vinculada à função anterior</span>
                          <strong className="text-white">R$ {money(parcelaFuncaoAnterior)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-300">Desconto aplicado na comissão da nova função</span>
                          <strong className="text-[#F2D675]">R$ {money(descontoNovaFuncao)}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-400">Comissão da nova função</span>
                      <strong className="text-white">R$ {money(comissaoNovaFuncao)}</strong>
                    </div>
                    {troca.funcaoAnterior === "recepcionista" && (
                      <div className="mt-2 flex justify-between gap-4 text-sm">
                        <span className="text-gray-400">Comissão da Recepção</span>
                        <strong className="text-orange-300">R$ {money(comissaoAnteriorPreview)}</strong>
                      </div>
                    )}
                    <div className="mt-3 flex justify-between gap-4 border-t border-white/10 pt-3">
                      <span className="font-semibold text-gray-300">Total comissão do mês</span>
                      <strong className="text-[#F2D675]">R$ {money(totalComissaoPreview)}</strong>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      upsertTransicaoFuncaoMutation.isPending ||
                      corrigirDataTrocaMutation.isPending
                    }
                    onClick={() =>
                      setTransicaoFuncaoEditor({
                        open: false,
                        linha: null,
                        quantidadeAnterior1: "",
                        quantidadeAnterior2: "",
                        valorFixoAnterior: "",
                        corrigindoData: false,
                        novaDataMudanca: "",
                      })
                    }
                  >
                    Fechar
                  </Button>
                  {!mesFechado && (
                    <Button
                      type="button"
                      className="bg-[#D4AF37] text-black hover:bg-[#F2D675]"
                      disabled={
                        upsertTransicaoFuncaoMutation.isPending ||
                        corrigirDataTrocaMutation.isPending ||
                        transicaoFuncaoEditor.corrigindoData
                      }
                      onClick={salvarTransicaoFuncaoEditor}
                    >
                      {upsertTransicaoFuncaoMutation.isPending ? "Salvando..." : "Salvar transição"}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={importacaoSemana.open}
        onOpenChange={(open) => {
          if (!open && importacaoSemana.etapa !== "importando") {
            fecharImportacaoSemana();
          }
        }}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#F2D675]">
              {lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
                ? "Importar relatório — Liquidez Venda"
                : `Importar relatório — SEM${importacaoSemana.semana}`}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              O sistema importa VENDA e MECÂNICA usando a coluna LIQ. S/ PNEUS. Em São José, Florianópolis e São Leopoldo, se o gerente estiver no bloco VENDA, a Liquidez Venda dele também é preenchida. Alinhamento continua manual.
              {lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
                ? " Em Florianópolis, o valor é gravado na liquidez mensal."
                : ""}
            </DialogDescription>
          </DialogHeader>

          {importacaoSemana.etapa === "arquivo" && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-5">
                <Label className="text-gray-300 block mb-3">Arquivo Excel (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                  onChange={(e) => processarArquivoImportacao(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-gray-500 mt-3">
                  {lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
                    ? "Se a liquidez mensal já tiver valores, a confirmação substituirá somente os funcionários encontrados no relatório."
                    : "Se a semana já tiver valores, a confirmação substituirá somente os funcionários encontrados no relatório."}
                </p>
              </div>

              {importacaoSemana.erro && (
                <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                  {importacaoSemana.erro}
                </div>
              )}
            </div>
          )}

          {importacaoSemana.etapa === "lendo" && (
            <div className="py-10 text-center text-gray-300">
              Lendo e conferindo o relatório...
            </div>
          )}

          {(importacaoSemana.etapa === "conferencia" || importacaoSemana.etapa === "importando") && (() => {
            const cidadeSelecionada = LOJAS.find((loja) => loja.id === lojaId)?.nome || "";
            const cidadeRelatorioNormalizada = normalizarTextoImportacao(importacaoSemana.cidadeRelatorio);
            const cidadeSelecionadaNormalizada = normalizarTextoImportacao(cidadeSelecionada);
            const cidadeDiferente =
              !!cidadeRelatorioNormalizada &&
              !cidadeSelecionadaNormalizada.includes(cidadeRelatorioNormalizada) &&
              !cidadeRelatorioNormalizada.includes(cidadeSelecionadaNormalizada);

            const gruposPorFuncionario = new Map<number, ItemRelatorioImportacao[]>();
            for (const item of importacaoSemana.itens) {
              if (item.status === "ignorado") continue;
              const idEfetivo = Number(
                item.funcionarioId ||
                  (item.status === "possivel" && Number(item.scoreCandidato) === 1
                    ? item.candidatoId
                    : 0)
              );
              if (!idEfetivo) continue;
              const grupo = gruposPorFuncionario.get(idEfetivo) || [];
              grupo.push(item);
              gruposPorFuncionario.set(idEfetivo, grupo);
            }

            const conflitosFuncao = Array.from(gruposPorFuncionario.entries())
              .map(([funcionarioId, itens]) => {
                const venda = itens.find((item) => item.funcaoRelatorio === "vendedor");
                const mecanica = itens.find((item) => item.funcaoRelatorio === "mecanico");
                if (!venda || !mecanica) return null;
                const funcionario = funcionariosImportaveis.find(
                  (f: any) => Number(f.id) === Number(funcionarioId)
                );
                return { funcionarioId, funcionario, venda, mecanica };
              })
              .filter(Boolean) as Array<{
                funcionarioId: number;
                funcionario: any;
                venda: ItemRelatorioImportacao;
                mecanica: ItemRelatorioImportacao;
              }>;

            const idsComConflito = new Set(
              conflitosFuncao.map((conflito) => Number(conflito.funcionarioId))
            );

            const prontos = importacaoSemana.itens.filter((item) => {
              const idEfetivo = Number(item.funcionarioId || item.candidatoId || 0);
              return item.status === "ok" && !idsComConflito.has(idEfetivo);
            });
            const quantidadeProntos = new Set([
              ...prontos.map((item) => Number(item.funcionarioId)),
              ...conflitosFuncao.map((conflito) => Number(conflito.funcionarioId)),
            ]).size;

            const divergencias = importacaoSemana.itens.filter((item) => {
              const idEfetivo = Number(item.funcionarioId || item.candidatoId || 0);
              return (
                (item.status === "possivel" || item.status === "nao_cadastrado") &&
                !idsComConflito.has(idEfetivo)
              );
            });
            const ignorados = importacaoSemana.itens.filter((item) => item.status === "ignorado");
            const campoSemana = campoLiquidezSemanaVisual(importacaoSemana.semana) as keyof LinhaComQuadrante;
            const existentesComValor = prontos.filter((item) => {
              const linha = linhas.find(
                (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
              );
              return Number(linha?.[campoSemana] || 0) > 0;
            });

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoSemana.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Período</p>
                    <p className="font-semibold">{importacaoSemana.periodo || "Não identificado"}</p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Loja do relatório</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoSemana.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Prontos</p>
                    <p className="font-semibold text-green-400">{quantidadeProntos}</p>
                  </div>
                </div>

                {cidadeDiferente && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-4 text-red-300">
                    Atenção: o relatório parece ser de <strong>{importacaoSemana.cidadeRelatorio}</strong>, mas a folha aberta é <strong>{cidadeSelecionada}</strong>. A importação fica bloqueada para evitar lançamento na loja errada.
                  </div>
                )}

                {existentesComValor.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-950/20 p-4 text-yellow-200">
                    {existentesComValor.length} funcionário(s) já possuem valor {lojaId === 4 && usaMetaMensal(lojaId, ano, mes) ? "na liquidez mensal" : `na SEM${importacaoSemana.semana}`}. Ao confirmar, somente esses valores encontrados no relatório serão substituídos.
                  </div>
                )}

                {conflitosFuncao.length > 0 && (
                  <div className="rounded-md border border-orange-400/40 bg-orange-950/15 p-4">
                    <div className="mb-3">
                      <p className="font-semibold text-orange-300">Mais de uma função na mesma semana</p>
                      <p className="mt-1 text-sm text-gray-400">
                        O mesmo funcionário apareceu em VENDA e MECÂNICA. O sistema vai somar as duas liquidações na mesma célula e calcular cada comissão separadamente pela regra da função.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {conflitosFuncao.map((conflito) => {
                        const total = Number(conflito.venda.valor || 0) + Number(conflito.mecanica.valor || 0);
                        return (
                          <div
                            key={`conflito-${conflito.funcionarioId}`}
                            className="rounded-md border border-orange-400/20 bg-[#090909] p-3"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold text-white">
                                  {conflito.funcionario?.nome || conflito.venda.nomeRelatorio}
                                </p>
                                <div className="mt-2 space-y-1 text-sm">
                                  <p className="text-[#F2D675]">VENDA • R$ {money(conflito.venda.valor)}</p>
                                  <p className="text-orange-300">MECÂNICA • R$ {money(conflito.mecanica.valor)}</p>
                                </div>
                              </div>
                              <div className="rounded-lg border border-orange-400/25 bg-orange-500/[0.06] px-4 py-3 text-right">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500">Total na célula</p>
                                <p className="font-bold text-green-400">R$ {money(total)}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-orange-300">2 funções</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-[#D4AF37]">Funcionários encontrados</p>
                    <span className="text-xs text-gray-400">LIQ. S/ PNEUS</span>
                  </div>
                  <div className="space-y-2">
                    {prontos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum funcionário pronto ainda.</p>
                    ) : (
                      prontos.map((item) => (
                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center border-b border-[#D4AF37]/10 pb-2">
                          <div>
                            <p className="font-semibold text-white">{item.funcionarioNome}</p>
                            {normalizarTextoImportacao(item.nomeRelatorio) !== normalizarTextoImportacao(item.funcionarioNome) && (
                              <p className="text-xs text-gray-500">Relatório: {item.nomeRelatorio}</p>
                            )}
                          </div>
                          <span className="text-xs uppercase text-gray-400">
                            {linhas.find(
                              (linha) =>
                                Number(linha.funcionarioId) === Number(item.funcionarioId)
                            )?.funcao === "gerente"
                              ? "gerente • VENDA"
                              : item.funcaoRelatorio}
                          </span>
                          <span className="font-bold text-green-400">R$ {money(item.valor)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {divergencias.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-[#0b0b0b] p-4">
                    <p className="font-semibold text-yellow-300 mb-3">Divergências do relatório</p>
                    <div className="space-y-3">
                      {divergencias.map((item) => (
                        <div key={item.id} className="rounded-md border border-yellow-500/20 bg-gray-950 p-3">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{item.nomeRelatorio}</p>
                              <p className="text-xs text-gray-400">
                                {item.funcaoRelatorio === "vendedor" ? "VENDA" : "MECÂNICA"} • R$ {money(item.valor)}
                              </p>
                              {item.status === "possivel" && item.candidatoNome && (
                                <p className="text-sm text-yellow-200 mt-1">
                                  {Number(item.scoreCandidato) === 1 ? (
                                    itemExigeTrocaFuncao(item) ? (
                                      <>
                                        Já existe este funcionário no cadastro: <strong>{item.candidatoNome}</strong>. A função atual é <strong>{labelFuncaoFuncionario(candidatoImportacaoPorId(item)?.funcao, lojaId)}</strong>. Confirme a troca para {item.funcaoRelatorio === "vendedor" ? "Vendedor" : "Mecânico"} antes de importar.
                                      </>
                                    ) : (
                                      <>Já existe este funcionário no cadastro: <strong>{item.candidatoNome}</strong>. O bloco do relatório está diferente; confirme o vínculo desta semana.</>
                                    )
                                  ) : (
                                    <>Possível correspondência: <strong>{item.candidatoNome}</strong></>
                                  )}
                                </p>
                              )}
                              {item.status === "nao_cadastrado" && (
                                <p className="text-sm text-yellow-200 mt-1">Não encontrei este funcionário no cadastro da loja.</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.status === "possivel" && item.candidatoId && (
                                itemExigeTrocaFuncao(item) ? (
                                  <Button
                                    type="button"
                                    className="bg-orange-400 text-black hover:bg-orange-300"
                                    onClick={() => irParaTrocarFuncaoExistente(item)}
                                  >
                                    Abrir cadastro / trocar função
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                                    onClick={() => vincularItemImportacao(item.id, Number(item.candidatoId))}
                                  >
                                    {Number(item.scoreCandidato) === 1 ? "Usar cadastro existente" : "Sim, vincular"}
                                  </Button>
                                )
                              )}
                              {!itemExigeTrocaFuncao(item) && (
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    const funcionarioId = Number(e.target.value);
                                    if (!funcionarioId) return;
                                    vincularItemImportacao(item.id, funcionarioId);
                                  }}
                                  className="h-10 min-w-[260px] rounded-md border border-[#D4AF37]/30 bg-[#111111] px-3 text-sm text-white outline-none focus:border-[#D4AF37]/60 focus:ring-2 focus:ring-[#D4AF37]/10"
                                >
                                  <option value="">Selecionar funcionário cadastrado</option>
                                  {funcionariosSelecionaveisParaItem(item).map((funcionario: any) => (
                                    <option key={funcionario.id} value={funcionario.id}>
                                      {funcionario.nome}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {!itemExigeTrocaFuncao(item) &&
                                !(item.status === "possivel" && Number(item.scoreCandidato) === 1 && item.candidatoId) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="border-[#D4AF37]/20 text-[#D4AF37]"
                                  onClick={() => irParaCadastrarFuncionario(item)}
                                >
                                  Cadastrar funcionário
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => ignorarItemImportacao(item.id)}
                              >
                                Ignorar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {funcionariosAusentesNoRelatorio.length > 0 && (
                  <div className="rounded-md border border-orange-500/30 bg-[#0b0b0b] p-4">
                    <p className="font-semibold text-orange-300 mb-2">Cadastrados que não aparecem no relatório</p>
                    <p className="text-xs text-gray-400 mb-3">
                      Eles continuarão com R$ 0,00 {lojaId === 4 && usaMetaMensal(lojaId, ano, mes) ? "na liquidez mensal" : "nesta semana"} se você prosseguir. Se alguém não deveria mais estar ativo, abra o cadastro para revisar/inativar.
                    </p>
                    <div className="space-y-2">
                      {funcionariosAusentesNoRelatorio.map((funcionario: any) => (
                        <div key={funcionario.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-orange-500/10 pb-2">
                          <div>
                            <p className="font-semibold">{funcionario.nome}</p>
                            <p className="text-xs text-gray-400">{funcionario.funcao}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Manter R$ 0,00</span>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-orange-500/30 text-orange-300"
                              onClick={() => irParaCadastroExistente(funcionario)}
                            >
                              Ver cadastro / inativar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ignorados.length > 0 && (
                  <div className="text-xs text-gray-500">
                    {ignorados.length} linha(s) do relatório serão ignoradas nesta importação.
                  </div>
                )}

                {importacaoSemana.erro && (
                  <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                    {importacaoSemana.erro}
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={importacaoSemana.etapa === "importando"}
                    onClick={() => setImportacaoSemana(criarImportacaoInicial(importacaoSemana.semana))}
                  >
                    Escolher outro arquivo
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                    disabled={
                      cidadeDiferente ||
                      quantidadeProntos === 0 ||
                      divergencias.length > 0 ||
                      importacaoSemana.etapa === "importando"
                    }
                    onClick={confirmarImportacaoSemana}
                  >
                    {importacaoSemana.etapa === "importando"
                      ? "Importando..."
                      : lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
                        ? `Importar Liquidez (${quantidadeProntos})`
                        : `Importar SEM${importacaoSemana.semana} (${quantidadeProntos})`}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}

          {importacaoSemana.etapa === "sucesso" && (
            <div className="space-y-5">
              <div className="rounded-md border border-green-500/30 bg-green-950/20 p-6 text-center">
                <p className="text-green-400 font-bold text-lg">Importação concluída</p>
                <p className="text-gray-300 mt-2">{importacaoSemana.mensagem}</p>
                <p className="text-xs text-gray-500 mt-3">
                  Vendedores e mecânicos foram recalculados automaticamente. Alinhadores permanecem com lançamento mensal manual.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                  onClick={fecharImportacaoSemana}
                >
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={importacaoAdiantamento.open}
        onOpenChange={(open) => {
          if (!open && importacaoAdiantamento.etapa !== "importando") {
            fecharImportacaoAdiantamento();
          }
        }}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#F2D675]">
              Importar adiantamentos — PDF
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              O sistema usa o Valor Líquido do recibo de adiantamento — exatamente o valor que o funcionário recebeu. Esta importação altera somente a coluna Adiant.
            </DialogDescription>
          </DialogHeader>

          {importacaoAdiantamento.etapa === "arquivo" && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-5">
                <Label className="text-gray-300 block mb-3">Arquivo de adiantamento (.pdf)</Label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                  onChange={(e) => processarPdfAdiantamento(e.target.files?.[0] || null)}
                />
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>• Usa o Valor Líquido do recibo, não o adiantamento bruto.</p>
                  <p>• Provisão de empréstimo CLT já fica refletida no líquido recebido.</p>
                  <p>• INSS, Holerite e Vale não são alterados por esta importação.</p>
                  <p>• Funcionários que não estiverem no PDF permanecem como estão e serão mostrados para conferência.</p>
                  <p>• Funcionário encontrado no PDF e não cadastrado poderá ser enviado direto para o cadastro.</p>
                </div>
              </div>

              {importacaoAdiantamento.erro && (
                <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                  {importacaoAdiantamento.erro}
                </div>
              )}
            </div>
          )}

          {importacaoAdiantamento.etapa === "lendo" && (
            <div className="py-10 text-center text-gray-300">
              Lendo o PDF e localizando os valores líquidos...
            </div>
          )}

          {(importacaoAdiantamento.etapa === "conferencia" ||
            importacaoAdiantamento.etapa === "importando") && (() => {
            const cidadeSelecionada = LOJAS.find((loja) => loja.id === lojaId)?.nome || "";
            const cidadeRelatorioNormalizada = normalizarTextoImportacao(
              importacaoAdiantamento.cidadeRelatorio
            );
            const cidadeSelecionadaNormalizada = normalizarTextoImportacao(cidadeSelecionada);
            const cidadeDiferente =
              !!cidadeRelatorioNormalizada &&
              !cidadeSelecionadaNormalizada.includes(cidadeRelatorioNormalizada) &&
              !cidadeRelatorioNormalizada.includes(cidadeSelecionadaNormalizada);

            const competenciaDiferente =
              (importacaoAdiantamento.competenciaMes !== null &&
                Number(importacaoAdiantamento.competenciaMes) !== Number(mes)) ||
              (importacaoAdiantamento.competenciaAno !== null &&
                Number(importacaoAdiantamento.competenciaAno) !== Number(ano));

            const prontos = importacaoAdiantamento.itens.filter(
              (item) => item.status === "ok"
            );
            const divergencias = importacaoAdiantamento.itens.filter(
              (item) => item.status === "possivel" || item.status === "nao_cadastrado"
            );
            const ignorados = importacaoAdiantamento.itens.filter(
              (item) => item.status === "ignorado"
            );
            const existentesComValor = prontos.filter((item) => {
              const linha = linhas.find(
                (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
              );
              return Number(linha?.adiant || 0) > 0;
            });

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoAdiantamento.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Competência</p>
                    <p className={competenciaDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoAdiantamento.competencia || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Loja do PDF</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoAdiantamento.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Prontos</p>
                    <p className="font-semibold text-green-400">{prontos.length}</p>
                  </div>
                </div>

                {cidadeDiferente && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-4 text-red-300">
                    O PDF parece ser de <strong>{importacaoAdiantamento.cidadeRelatorio}</strong>, mas a folha aberta é <strong>{cidadeSelecionada}</strong>. A importação foi bloqueada para evitar lançamento na loja errada.
                  </div>
                )}

                {competenciaDiferente && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-4 text-red-300">
                    O PDF é da competência <strong>{importacaoAdiantamento.competencia}</strong>, mas a folha aberta está em <strong>{String(mes).padStart(2, "0")}/{ano}</strong>. A importação foi bloqueada.
                  </div>
                )}

                {existentesComValor.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-950/20 p-4 text-yellow-200">
                    {existentesComValor.length} funcionário(s) já possuem Adiant. preenchido. Ao confirmar, somente os funcionários encontrados no PDF terão esse campo substituído.
                  </div>
                )}

                <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-[#D4AF37]">Valores encontrados</p>
                    <span className="text-xs text-gray-400">Valor Líquido recebido</span>
                  </div>
                  <div className="space-y-2">
                    {prontos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum funcionário pronto ainda.</p>
                    ) : (
                      prontos.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center border-b border-[#D4AF37]/10 pb-2"
                        >
                          <div>
                            <p className="font-semibold text-white">{item.funcionarioNome}</p>
                            {normalizarTextoImportacao(item.nomePdf) !==
                              normalizarTextoImportacao(item.funcionarioNome) && (
                              <p className="text-xs text-gray-500">PDF: {item.nomePdf}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">pág. {item.pagina}</span>
                          <span className="font-bold text-green-400">R$ {money(item.valorLiquido)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {divergencias.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-[#0b0b0b] p-4">
                    <p className="font-semibold text-yellow-300 mb-3">Divergências de nomes</p>
                    <div className="space-y-4">
                      {divergencias.map((item) => (
                        <div key={item.id} className="rounded-md border border-yellow-500/20 bg-gray-950 p-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{item.nomePdf}</p>
                              <p className="text-sm text-green-400">R$ {money(item.valorLiquido)}</p>
                              {item.status === "possivel" && item.candidatoNome ? (
                                <p className="text-xs text-yellow-200 mt-1">
                                  Possível correspondência: {item.candidatoNome}
                                </p>
                              ) : (
                                <p className="text-xs text-red-300 mt-1">Não encontrado na folha atual.</p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {item.candidatoId && (
                                <Button
                                  type="button"
                                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                                  onClick={() => vincularItemAdiantamento(item.id, Number(item.candidatoId))}
                                >
                                  Vincular a {item.candidatoNome}
                                </Button>
                              )}

                              <Select
                                onValueChange={(value) =>
                                  vincularItemAdiantamento(item.id, Number(value))
                                }
                              >
                                <SelectTrigger className="w-[220px] bg-[#111111] border-[#D4AF37]/20 text-white">
                                  <SelectValue placeholder="Escolher funcionário" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#0b0b0b] border-[#D4AF37]/20 max-h-72">
                                  {linhas.map((linha) => (
                                    <SelectItem
                                      key={linha.funcionarioId}
                                      value={String(linha.funcionarioId)}
                                      className="text-white"
                                    >
                                      {linha.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Button
                                type="button"
                                variant="outline"
                                className="border-[#D4AF37]/20 text-[#D4AF37]"
                                onClick={() => irParaCadastrarFuncionarioAdiantamento(item)}
                              >
                                Cadastrar funcionário
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => ignorarItemAdiantamento(item.id)}
                              >
                                Ignorar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {funcionariosAusentesNoPdfAdiantamento.length > 0 && (
                  <div className="rounded-md border border-orange-500/30 bg-[#0b0b0b] p-4">
                    <p className="font-semibold text-orange-300 mb-2">
                      Cadastrados que não aparecem no PDF de adiantamento
                    </p>
                    <p className="text-xs text-gray-400 mb-3">
                      Nenhum valor será alterado para essas pessoas. Se for funcionário PJ, pode
                      continuar normalmente. Se for CLT e deveria estar no arquivo, revise o cadastro
                      ou confirme se o PDF está completo.
                    </p>

                    <div className="space-y-2">
                      {funcionariosAusentesNoPdfAdiantamento.map((funcionario) => (
                        <div
                          key={funcionario.funcionarioId}
                          className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-orange-500/10 pb-2"
                        >
                          <div>
                            <p className="font-semibold">{funcionario.nome}</p>
                            <p className="text-xs text-gray-400">{funcionario.funcao}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">
                              Manter como está
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-orange-500/30 text-orange-300"
                              onClick={() =>
                                irParaCadastroExistenteAdiantamento(funcionario)
                              }
                            >
                              Ver cadastro / inativar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ignorados.length > 0 && (
                  <div className="text-xs text-gray-500">
                    {ignorados.length} funcionário(s) do PDF serão ignorados nesta importação.
                  </div>
                )}

                {importacaoAdiantamento.erro && (
                  <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                    {importacaoAdiantamento.erro}
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={importacaoAdiantamento.etapa === "importando"}
                    onClick={() => setImportacaoAdiantamento(criarImportacaoAdiantamentoInicial())}
                  >
                    Escolher outro PDF
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                    disabled={
                      cidadeDiferente ||
                      competenciaDiferente ||
                      prontos.length === 0 ||
                      importacaoAdiantamento.etapa === "importando"
                    }
                    onClick={confirmarImportacaoAdiantamento}
                  >
                    {importacaoAdiantamento.etapa === "importando"
                      ? "Importando..."
                      : `Importar Adiant. (${prontos.length})`}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}

          {importacaoAdiantamento.etapa === "sucesso" && (
            <div className="space-y-5">
              <div className="rounded-md border border-green-500/30 bg-green-950/20 p-6 text-center">
                <p className="text-green-400 font-bold text-lg">Adiantamentos importados</p>
                <p className="text-gray-300 mt-2">{importacaoAdiantamento.mensagem}</p>
                <p className="text-xs text-gray-500 mt-3">
                  Somente a coluna Adiant. foi alterada. Uma futura importação da folha mensal não deverá sobrescrever esses valores.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                  onClick={fecharImportacaoAdiantamento}
                >
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={importacaoHolerite.open}
        onOpenChange={(open) => {
          if (!open && importacaoHolerite.etapa !== "importando") {
            fecharImportacaoHolerite();
          }
        }}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#F2D675]">
              Importar Folha Mensal — PDF
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Preenche INSS e Holerite pelo PDF. Empréstimo CLT vai para o Vale somente para Vendedor, Mecânico e para o alinhador Milton de Blumenau. Nas demais funções, o empréstimo é ignorado. O Adiant. do dia 20 nunca é alterado por esta importação.
            </DialogDescription>
          </DialogHeader>

          {importacaoHolerite.etapa === "arquivo" && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-5">
                <Label className="text-gray-300 block mb-3">Folha Mensal (.pdf)</Label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                  onChange={(e) => processarPdfHolerite(e.target.files?.[0] || null)}
                />
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p>• INSS: usa somente a rubrica principal código 998 — I.N.S.S.</p>
                  <p>• Holerite: usa o Valor Líquido efetivamente recebido.</p>
                  <p>• Vale: importa somente DESC. EMP. CRED. TRAB Nº ...</p>
                  <p>• PROVISÃO e ESTORNO de empréstimo são ignorados.</p>
                  <p>• DESC.ADIANT.SALARIAL é ignorado: o Adiant. já veio do recibo do dia 20.</p>
                  <p>• Reimportar o mesmo mês substitui apenas empréstimos criados pelo PDF; vales manuais permanecem.</p>
                </div>
              </div>

              {importacaoHolerite.erro && (
                <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                  {importacaoHolerite.erro}
                </div>
              )}
            </div>
          )}

          {importacaoHolerite.etapa === "lendo" && (
            <div className="py-10 text-center text-gray-300">
              Lendo a Folha Mensal e conferindo INSS, líquido e empréstimos CLT...
            </div>
          )}

          {(importacaoHolerite.etapa === "conferencia" ||
            importacaoHolerite.etapa === "importando") && (() => {
            const cidadeSelecionada = LOJAS.find((loja) => loja.id === lojaId)?.nome || "";
            const cidadeRelatorioNormalizada = normalizarTextoImportacao(
              importacaoHolerite.cidadeRelatorio
            );
            const cidadeSelecionadaNormalizada = normalizarTextoImportacao(cidadeSelecionada);
            const cidadeDiferente =
              !!cidadeRelatorioNormalizada &&
              !cidadeSelecionadaNormalizada.includes(cidadeRelatorioNormalizada) &&
              !cidadeRelatorioNormalizada.includes(cidadeSelecionadaNormalizada);

            const competenciaDiferente =
              (importacaoHolerite.competenciaMes !== null &&
                Number(importacaoHolerite.competenciaMes) !== Number(mes)) ||
              (importacaoHolerite.competenciaAno !== null &&
                Number(importacaoHolerite.competenciaAno) !== Number(ano));

            const prontos = importacaoHolerite.itens.filter(
              (item) => item.status === "ok"
            );
            const divergencias = importacaoHolerite.itens.filter(
              (item) => item.status === "possivel" || item.status === "nao_cadastrado"
            );
            const ignorados = importacaoHolerite.itens.filter(
              (item) => item.status === "ignorado"
            );
            const totalEmprestimosDetectados = prontos.reduce(
              (acc, item) => acc + item.emprestimos.length,
              0
            );
            const totalEmprestimos = prontos.reduce((acc, item) => {
              const linha = linhas.find(
                (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
              );
              return acc + (linha && deveImportarEmprestimoClt(linha) ? item.emprestimos.length : 0);
            }, 0);
            const totalEmprestimosIgnorados = Math.max(
              0,
              totalEmprestimosDetectados - totalEmprestimos
            );
            const existentesComValor = prontos.filter((item) => {
              const linha = linhas.find(
                (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
              );
              return Number(linha?.inss || 0) > 0 || Number(linha?.holerite || 0) > 0;
            });

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoHolerite.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Competência</p>
                    <p className={competenciaDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoHolerite.competencia || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Loja do PDF</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoHolerite.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Funcionários prontos</p>
                    <p className="font-semibold text-green-400">{prontos.length}</p>
                  </div>
                  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-3">
                    <p className="text-xs text-gray-400">Empréstimos CLT a lançar</p>
                    <p className="font-semibold text-yellow-300">{totalEmprestimos}</p>
                    {totalEmprestimosIgnorados > 0 && (
                      <p className="mt-1 text-[10px] text-gray-500">
                        {totalEmprestimosIgnorados} ignorado(s) pela função
                      </p>
                    )}
                  </div>
                </div>

                {cidadeDiferente && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-4 text-red-300">
                    O PDF parece ser de <strong>{importacaoHolerite.cidadeRelatorio}</strong>, mas a folha aberta é <strong>{cidadeSelecionada}</strong>. A importação foi bloqueada.
                  </div>
                )}

                {competenciaDiferente && (
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 p-4 text-red-300">
                    O PDF é da competência <strong>{importacaoHolerite.competencia}</strong>, mas a folha aberta está em <strong>{String(mes).padStart(2, "0")}/{ano}</strong>. A importação foi bloqueada.
                  </div>
                )}

                {existentesComValor.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-950/20 p-4 text-yellow-200">
                    {existentesComValor.length} funcionário(s) já possuem INSS ou Holerite preenchido. Ao confirmar, esses dois campos serão atualizados pelo PDF. O Adiant. não será tocado.
                  </div>
                )}

                <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-[#D4AF37]">Valores encontrados</p>
                    <span className="text-xs text-gray-400">
                      INSS + Valor Líquido + Empréstimos CLT
                    </span>
                  </div>

                  <div className="space-y-2">
                    {prontos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum funcionário pronto ainda.</p>
                    ) : (
                      prontos.map((item) => {
                        const totalEmprestimoItem = item.emprestimos.reduce(
                          (acc, emprestimo) => acc + Number(emprestimo.valor || 0),
                          0
                        );
                        const linhaFuncionario = linhas.find(
                          (linha) => Number(linha.funcionarioId) === Number(item.funcionarioId)
                        );
                        const importaEmprestimoClt = !!linhaFuncionario &&
                          deveImportarEmprestimoClt(linhaFuncionario);

                        return (
                          <div
                            key={item.id}
                            className="rounded border border-green-500/20 bg-green-950/10 p-3"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                              <div>
                                <p className="font-semibold text-white">
                                  {item.funcionarioNome}
                                </p>
                                {normalizarNomeImportacao(item.nomePdf) !==
                                  normalizarNomeImportacao(item.funcionarioNome || "") && (
                                  <p className="text-xs text-gray-500">
                                    PDF: {item.nomePdf}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500">
                                  Página {item.pagina}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm min-w-[420px]">
                                <div className="rounded bg-gray-950/60 px-3 py-2">
                                  <p className="text-xs text-gray-500">INSS</p>
                                  <p className="font-bold text-red-300">
                                    {formatarMoeda(item.inss)}
                                  </p>
                                </div>
                                <div className="rounded bg-gray-950/60 px-3 py-2">
                                  <p className="text-xs text-gray-500">Holerite líquido</p>
                                  <p className="font-bold text-green-400">
                                    {formatarMoeda(item.valorLiquido)}
                                  </p>
                                </div>
                                <div className="rounded bg-gray-950/60 px-3 py-2">
                                  <p className="text-xs text-gray-500">Empréstimo CLT</p>
                                  {item.emprestimos.length === 0 ? (
                                    <p className="font-bold text-gray-400">0 • {formatarMoeda(0)}</p>
                                  ) : importaEmprestimoClt ? (
                                    <p className="font-bold text-yellow-300">
                                      {item.emprestimos.length} • {formatarMoeda(totalEmprestimoItem)}
                                    </p>
                                  ) : (
                                    <div>
                                      <p className="font-bold text-gray-400">
                                        {item.emprestimos.length} • {formatarMoeda(totalEmprestimoItem)}
                                      </p>
                                      <p className="text-[10px] font-semibold text-gray-500">
                                        Ignorado pela função
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {item.emprestimos.length > 0 && (
                              <div
                                className={`mt-3 rounded border p-3 ${
                                  importaEmprestimoClt
                                    ? "border-yellow-500/20 bg-yellow-950/10"
                                    : "border-gray-700/40 bg-gray-950/30"
                                }`}
                              >
                                <p
                                  className={`text-xs font-semibold mb-2 ${
                                    importaEmprestimoClt ? "text-yellow-300" : "text-gray-400"
                                  }`}
                                >
                                  Discriminação dos empréstimos
                                  {!importaEmprestimoClt && " • não será lançado no Vale"}
                                </p>
                                <div className="space-y-1">
                                  {item.emprestimos.map((emprestimo, index) => (
                                    <div
                                      key={`${item.id}-${emprestimo.contrato}-${index}`}
                                      className="flex items-center justify-between gap-3 text-xs"
                                    >
                                      <span className="text-gray-300">
                                        Empréstimo CLT • {emprestimo.contrato}
                                      </span>
                                      <span className="font-semibold text-yellow-200">
                                        {formatarMoeda(emprestimo.valor)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {divergencias.length > 0 && (
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-950/10 p-4">
                    <p className="font-semibold text-yellow-300 mb-3">
                      Funcionários do PDF que precisam de conferência ({divergencias.length})
                    </p>

                    <div className="space-y-3">
                      {divergencias.map((item) => (
                        <div
                          key={item.id}
                          className="rounded border border-yellow-500/20 bg-gray-950/50 p-3"
                        >
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{item.nomePdf}</p>
                              <p className="text-xs text-gray-400">
                                INSS {formatarMoeda(item.inss)} • Holerite {formatarMoeda(item.valorLiquido)}
                              </p>
                              {item.status === "possivel" && item.candidatoNome ? (
                                <p className="text-xs text-yellow-300 mt-1">
                                  Possível cadastro: {item.candidatoNome}
                                </p>
                              ) : (
                                <p className="text-xs text-red-300 mt-1">
                                  Não encontrei este funcionário no cadastro da folha.
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {item.status === "possivel" && item.candidatoId && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                                  onClick={() =>
                                    vincularItemHolerite(item.id, Number(item.candidatoId))
                                  }
                                >
                                  Sim, vincular
                                </Button>
                              )}

                              <Select
                                onValueChange={(value) =>
                                  vincularItemHolerite(item.id, Number(value))
                                }
                              >
                                <SelectTrigger className="w-[220px] border-[#D4AF37]/20 bg-[#111111] text-white">
                                  <SelectValue placeholder="Escolher funcionário" />
                                </SelectTrigger>
                                <SelectContent className="border-[#D4AF37]/20 bg-[#0b0b0b]">
                                  {linhas
                                    .filter(
          (linha) =>
            linha.quadrante !== "supervisor_pj" &&
            linha.quadrante !== "supervisora_consultores_pj"
        )
                                    .map((linha) => (
                                      <SelectItem
                                        key={linha.funcionarioId}
                                        value={String(linha.funcionarioId)}
                                        className="text-white"
                                      >
                                        {linha.nome}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => irParaCadastrarFuncionarioHolerite(item)}
                              >
                                Cadastrar funcionário
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => ignorarItemHolerite(item.id)}
                              >
                                Ignorar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {funcionariosAusentesNoPdfHolerite.length > 0 && (
                  <div className="rounded-md border border-orange-500/30 bg-orange-950/10 p-4">
                    <p className="font-semibold text-orange-300 mb-2">
                      Cadastrados que não aparecem na Folha Mensal ({funcionariosAusentesNoPdfHolerite.length})
                    </p>
                    <p className="text-xs text-gray-400 mb-3">
                      Nada será zerado automaticamente. Pode ser PJ, admissão/saída no período ou PDF incompleto.
                    </p>

                    <div className="space-y-2">
                      {funcionariosAusentesNoPdfHolerite.map((funcionario) => (
                        <div
                          key={funcionario.funcionarioId}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded border border-orange-500/20 bg-gray-950/50 p-3"
                        >
                          <div>
                            <p className="font-semibold text-white">{funcionario.nome}</p>
                            <p className="text-xs text-gray-500">{funcionario.funcao}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="ghost" size="sm">
                              Manter como está
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                irParaCadastroExistenteHolerite(funcionario)
                              }
                            >
                              Ver cadastro / inativar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ignorados.length > 0 && (
                  <div className="text-xs text-gray-500">
                    {ignorados.length} funcionário(s) do PDF serão ignorados nesta importação.
                  </div>
                )}

                <div className="rounded-md border border-green-500/20 bg-green-950/10 p-4 text-sm">
                  <p className="font-semibold text-green-300">Proteção do Adiantamento</p>
                  <p className="text-gray-300 mt-1">
                    Esta importação não grava nem recalcula a coluna Adiant. O valor líquido importado anteriormente pelo recibo do dia 20 permanece intacto.
                  </p>
                </div>

                {importacaoHolerite.erro && (
                  <div className="rounded-md border border-red-500/30 bg-red-950/30 p-4 text-red-300">
                    {importacaoHolerite.erro}
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={importacaoHolerite.etapa === "importando"}
                    onClick={() => setImportacaoHolerite(criarImportacaoHoleriteInicial())}
                  >
                    Escolher outro arquivo
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                    disabled={
                      cidadeDiferente ||
                      competenciaDiferente ||
                      prontos.length === 0 ||
                      importacaoHolerite.etapa === "importando"
                    }
                    onClick={confirmarImportacaoHolerite}
                  >
                    {importacaoHolerite.etapa === "importando"
                      ? "Importando..."
                      : `Importar Folha (${prontos.length})`}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}

          {importacaoHolerite.etapa === "sucesso" && (
            <div className="space-y-5">
              <div className="rounded-md border border-green-500/30 bg-green-950/20 p-6 text-center">
                <p className="text-green-400 font-bold text-lg">
                  Folha Mensal importada
                </p>
                <p className="text-gray-300 mt-2">{importacaoHolerite.mensagem}</p>
                <p className="text-xs text-gray-500 mt-3">
                  INSS e Holerite foram atualizados; empréstimos CLT foram lançados no Vale. Adiantamento preservado.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                  onClick={fecharImportacaoHolerite}
                >
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>


      </Dialog>

      <Dialog
        open={!!funcionarioDetalheAtual}
        onOpenChange={(open) => {
          if (!open) {
            setFuncionarioDetalheId(null);
            setEditandoFuncionarioDetalhe(false);
            setTentouSalvarFuncionarioDetalhe(false);
            setFuncionarioEdicaoForm(criarFormEdicaoFuncionarioVazio());
          }
        }}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#F2D675]">
              {editandoFuncionarioDetalhe
                ? "Editar funcionário"
                : "Dados do funcionário"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {editandoFuncionarioDetalhe
                ? "Todos os campos marcados com * são obrigatórios."
                : "Informações cadastradas no sistema."}
            </DialogDescription>
          </DialogHeader>

          {funcionarioDetalheAtual && (() => {
            const funcionario = funcionarioDetalheAtual as any;

            const Campo = ({ label, valor }: { label: string; valor: any }) => (
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-white font-semibold break-words">{valor}</p>
              </div>
            );

            const classeCampo = (invalido: boolean) =>
              `bg-[#0b0b0b] text-white ${
                tentouSalvarFuncionarioDetalhe && invalido
                  ? "border-red-500 focus-visible:ring-red-500/30"
                  : "border-[#D4AF37]/20"
              }`;

            if (editandoFuncionarioDetalhe) {
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-300">
                        Nome completo <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        className={classeCampo(funcionarioEdicaoCamposInvalidos.nome)}
                        value={funcionarioEdicaoForm.nome}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            nome: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300">
                        CPF <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        className={classeCampo(funcionarioEdicaoCamposInvalidos.cpf)}
                        value={funcionarioEdicaoForm.cpf}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            cpf: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300">
                        PIX <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        className={classeCampo(funcionarioEdicaoCamposInvalidos.pix)}
                        value={funcionarioEdicaoForm.pix}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            pix: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300">
                        Data de aniversário <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        type="date"
                        className={classeCampo(
                          funcionarioEdicaoCamposInvalidos.dataNascimento
                        )}
                        value={funcionarioEdicaoForm.dataNascimento}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            dataNascimento: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300">
                        Função <span className="text-red-400">*</span>
                      </Label>
                      <div className="h-10 w-full rounded-md border border-[#D4AF37]/20 bg-[#0b0b0b] px-3 py-2 text-sm text-white">
                        {labelFuncaoFuncionario(
                          funcionario.funcao,
                          Number(funcionario.lojaId ?? funcionario.loja_id ?? lojaId)
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 w-full border-orange-400/30 bg-orange-500/[0.05] text-orange-300 hover:bg-orange-500/[0.10]"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.sessionStorage.setItem(
                              "folha-funcionario-abrir-id",
                              String(funcionario.id)
                            );
                            window.sessionStorage.setItem(
                              "folha-funcionario-abrir-loja-id",
                              String(funcionario.lojaId ?? funcionario.loja_id ?? lojaId)
                            );
                          }
                          setLocation(ROTA_GESTAO_FUNCIONARIOS);
                        }}
                      >
                        Trocar função com histórico
                      </Button>
                    </div>

                    {funcionarioEdicaoForm.funcao === "consultor_vendas" && (
                      <div>
                        <Label className="text-gray-300">
                          Tipo de meta <span className="text-red-400">*</span>
                        </Label>
                        <select
                          className={`h-10 w-full rounded-md border px-3 py-2 text-sm ${classeCampo(
                            funcionarioEdicaoCamposInvalidos.tipoMeta
                          )}`}
                          value={funcionarioEdicaoForm.tipoMeta}
                          onChange={(e) =>
                            setFuncionarioEdicaoForm((prev) => ({
                              ...prev,
                              tipoMeta: e.target.value as TipoMetaFuncionario,
                            }))
                          }
                        >
                          {Number(
                            funcionario.lojaId ?? funcionario.loja_id ?? lojaId
                          ) === 5 ? (
                            <option value="meta2">Meta 2 - Mensal</option>
                          ) : (
                            <>
                              <option value="">Selecione</option>
                              <option value="meta1">Meta 1</option>
                              <option value="meta2">Meta 2</option>
                            </>
                          )}
                        </select>
                      </div>
                    )}

                    <div>
                      <Label className="text-gray-300">
                        Data de admissão <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        type="date"
                        className={classeCampo(
                          funcionarioEdicaoCamposInvalidos.dataAdmissao
                        )}
                        value={funcionarioEdicaoForm.dataAdmissao}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            dataAdmissao: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {tentouSalvarFuncionarioDetalhe && !funcionarioEdicaoValida && (
                    <div className="rounded-md border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
                      Preencha todos os campos obrigatórios destacados antes de salvar.
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-4">
                <div className="rounded-md border border-[#D4AF37]/20 bg-[#0b0b0b] p-4">
                  <p className="text-lg font-bold text-white">
                    {funcionario.nome}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Campo
                    label="Nome completo"
                    valor={textoOuNaoInformado(funcionario.nome)}
                  />

                  <Campo
                    label="CPF"
                    valor={formatarCpf(funcionario.cpf)}
                  />

                  <Campo
                    label="PIX"
                    valor={textoOuNaoInformado(
                      funcionario.pix ||
                        funcionario.chavePix ||
                        funcionario.chave_pix
                    )}
                  />

                  <Campo
                    label="Data de aniversário"
                    valor={formatarDataBR(
                      funcionario.dataNascimento ||
                        funcionario.data_nascimento ||
                        funcionario.nascimento
                    )}
                  />

                  <Campo
                    label="Função"
                    valor={labelFuncaoFuncionario(
                      funcionario.funcao,
                      Number(funcionario.lojaId ?? funcionario.loja_id ?? lojaId)
                    )}
                  />

                  {String(funcionario.funcao || "") === "consultor_vendas" && (
                    <Campo
                      label="Tipo de meta"
                      valor={
                        String(funcionario.tipoMeta || funcionario.tipo_meta || "") ===
                        "meta1"
                          ? "Meta 1"
                          : String(
                              funcionario.tipoMeta || funcionario.tipo_meta || ""
                            ) === "meta2"
                          ? "Meta 2"
                          : "Não informado"
                      }
                    />
                  )}

                  <Campo
                    label="Data de admissão"
                    valor={formatarDataBR(
                      funcionario.dataAdmissao || funcionario.data_admissao
                    )}
                  />
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            {editandoFuncionarioDetalhe ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditandoFuncionarioDetalhe(false);
                    setTentouSalvarFuncionarioDetalhe(false);
                  }}
                  disabled={updateFuncionarioDetalheMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                  onClick={salvarEdicaoFuncionarioDetalhe}
                  disabled={updateFuncionarioDetalheMutation.isPending}
                >
                  {updateFuncionarioDetalheMutation.isPending
                    ? "Salvando..."
                    : "Salvar alterações"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                  onClick={abrirEdicaoFuncionarioDetalhe}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setFuncionarioDetalheId(null)}
                >
                  Fechar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reabrirMesOpen} onOpenChange={setReabrirMesOpen}>
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Reabrir competência</DialogTitle>
            <DialogDescription className="text-gray-400">
              Informe a senha do seu usuário. Somente administrador ou gestor pode reabrir um mês fechado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border border-red-500/20 bg-red-950/20 p-3 text-sm text-gray-300">
              Você está reabrindo <strong>{String(mes).padStart(2, "0")}/{ano}</strong> de <strong>{LOJAS.find((loja) => loja.id === lojaId)?.nome}</strong>.
            </div>

            <div>
              <Label className="text-gray-300">Senha</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={senhaReabertura}
                onChange={(e) => setSenhaReabertura(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmarReaberturaMes();
                }}
                className="mt-2 bg-[#111111] border-[#D4AF37]/20 text-white"
                placeholder="Digite sua senha"
              />
            </div>

            {erroFechamento && (
              <div className="rounded-md border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
                {erroFechamento}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={reabrirMesMutation.isPending}
              onClick={() => {
                setReabrirMesOpen(false);
                setSenhaReabertura("");
                setErroFechamento("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
              disabled={reabrirMesMutation.isPending || !senhaReabertura.trim()}
              onClick={confirmarReaberturaMes}
            >
              {reabrirMesMutation.isPending ? "Validando..." : "Reabrir mês"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bloqueioAvisoOpen} onOpenChange={setBloqueioAvisoOpen}>
        <DialogContent className="bg-gray-950 border-red-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-300">🔒 Mês fechado</DialogTitle>
            <DialogDescription className="text-gray-400">
              Esta competência está protegida contra alterações.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-red-500/20 bg-red-950/20 p-4 text-sm text-gray-300">
            Para modificar qualquer valor de {String(mes).padStart(2, "0")}/{ano}, um administrador ou gestor precisa usar <strong>Reabrir mês</strong> e confirmar a própria senha.
          </div>
          <DialogFooter>
            <Button className="bg-[#D4AF37] text-black" onClick={() => setBloqueioAvisoOpen(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cellEditor.open}
        onOpenChange={(open) => setCellEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl">
  <DialogHeader>
    <DialogTitle className="text-[#D4AF37]">
      {cellEditor.label}
    </DialogTitle>

    <DialogDescription className="text-gray-400 text-xs">
      <>
        {(() => {
  const linha = linhas.find(
    (l) => l.funcionarioId === cellEditor.funcionarioId
  ) as any;

  const campo = cellEditor.campo;

  const por =
    campo === "sem1" ? linha?.ultimaAlteracaoPor1 :
    campo === "sem2" ? linha?.ultimaAlteracaoPor2 :
    campo === "sem3" ? linha?.ultimaAlteracaoPor3 :
    campo === "sem4" ? linha?.ultimaAlteracaoPor4 :
    linha?.ultimaAlteracaoPor;

  const em =
    campo === "sem1" ? linha?.ultimaAlteracaoEm1 :
    campo === "sem2" ? linha?.ultimaAlteracaoEm2 :
    campo === "sem3" ? linha?.ultimaAlteracaoEm3 :
    campo === "sem4" ? linha?.ultimaAlteracaoEm4 :
    linha?.ultimaAlteracaoEm;

  return (
    <>
      Última alteração: {por || "Sistema"} •{" "}
      {em
        ? new Date(em).toLocaleString("pt-BR")
        : "Sem alterações"}
    </>
  );
})()}
      </>
    </DialogDescription>
  </DialogHeader>
          <div className="space-y-2">
            <Label className="text-gray-300">
              {cellEditor.mode === "money" ? "Valor em R$" : "Quantidade"}
            </Label>
            <Input
             type="text"
             inputMode={cellEditor.mode === "money" ? "decimal" : "numeric"}
             value={cellEditor.value}
            onChange={(e) =>
           setCellEditor((prev) => ({ ...prev, value: e.target.value }))
          }
          />
          </div>

          <DialogFooter>
            <Button
  variant="ghost"
  onClick={() =>
    setCellEditor({
      open: false,
      funcionarioId: null,
      campo: null,
      label: "",
      mode: "money",
      value: "",
    })
  }
>
  Cancelar
</Button>

<Button
  className="bg-red-600 text-white hover:bg-red-500"
  onClick={clearCellEditor}
>
  Limpar
</Button>

<Button
  className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
  onClick={saveCellEditor}
>
  Salvar
</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={premioEditor.open}
        onOpenChange={(open) => setPremioEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Premiação</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(
  premioAutomaticoAtual.detalhes.length > 0 ||
  linhaPremioAtual?.funcao === "consultor_vendas" ||
  linhaPremioAtual?.funcao === "supervisor"
) && (
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
                <p className="mb-3 text-sm font-semibold text-[#D4AF37]">
                  Discriminação automática
                </p>

                {premioAutomaticoAtual.detalhes.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Nenhuma premiação automática.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {premioAutomaticoAtual.detalhes.map(
                     (item: { descricao: string; valor: number }, index: number) => (
                      <div
                        key={`${item.descricao}-${index}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-300">{item.descricao}</span>
                        <span className="text-yellow-300">
                          R$ {money(item.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {linhaPremioAtual?.funcao === "supervisor" && (() => {
  const resumoSupervisor = resumoSupervisorQuery.data;

    const premioJoinville = Number(resumoSupervisor?.joinville || 0);
    const premioBlumenau = Number(resumoSupervisor?.blumenau || 0);
    const premioSaoJose = Number(resumoSupervisor?.saoJose || 0);
    const premioFlorianopolis = Number(resumoSupervisor?.florianopolis || 0);
    const total =
    premioJoinville +
    premioBlumenau +
    premioSaoJose +
    premioFlorianopolis;

  return (
  <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-2 text-sm">
    <p className="font-semibold text-[#D4AF37]">
      Resumo automático do supervisor
    </p>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Joinville</span>
      <span className="text-yellow-300">
        R$ {money(premioJoinville)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Blumenau</span>
      <span className="text-yellow-300">
        R$ {money(premioBlumenau)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">São José</span>
      <span className="text-yellow-300">
        R$ {money(premioSaoJose)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Florianópolis</span>
      <span className="text-yellow-300">
        R$ {money(premioFlorianopolis)}
      </span>
    </div>

    <div className="flex items-center justify-between border-t border-[#D4AF37]/15 pt-2">
      <span className="text-gray-300 font-semibold">Total</span>
      <span className="text-yellow-300 font-bold">
        R$ {money(total)}
      </span>
    </div>
  </div>
);
})()}

            <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
              <p className="mb-3 text-sm font-semibold text-[#D4AF37]">
                Discriminação manual
              </p>

              {!linhaPremioAtual?.premiacoesManuais ||
              linhaPremioAtual.premiacoesManuais.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma premiação manual.</p>
              ) : (
                <div className="space-y-2">
                  {linhaPremioAtual.premiacoesManuais.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-[#D4AF37]/10 p-2"
                    >
                      <div className="text-sm text-gray-300">
  <div>{item.descricao}</div>

  <div className="text-xs text-gray-500">
    Última alteração:
    {" "}
    {(item as any).ultimaAlteracaoPor || "Sistema"}
    {" • "}
    {(item as any).ultimaAlteracaoEm
      ? new Date(
          (item as any).ultimaAlteracaoEm
        ).toLocaleString("pt-BR")
      : "Sem alterações"}
  </div>
</div>
                      <div className="flex items-center gap-3">
                        <span className="text-yellow-300">
                          R$ {money(item.valor)}
                        </span>
                        <Button
                          className="bg-red-600 hover:bg-red-500 text-white"
                          size="sm"
                          onClick={() => removePremiacaoManual(item.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-3">
              <p className="text-sm font-semibold text-[#D4AF37]">
                Adicionar premiação manual
              </p>

              <div className="space-y-2">
                <Label className="text-gray-300">Descrição</Label>
                <Input
                  value={premioEditor.descricao}
                  onChange={(e) =>
                    setPremioEditor((prev) => ({
                      ...prev,
                      descricao: e.target.value,
                    }))
                  }
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                  placeholder="Ex.: bônus campanha"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Valor</Label>
                <Input
                  type="text"
                  value={premioEditor.valor}
                  onChange={(e) =>
                    setPremioEditor((prev) => ({
                      ...prev,
                      valor: e.target.value,
                    }))
                  }
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                />
              </div>

              <Button
                className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                onClick={addPremiacaoManual}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setPremioEditor({
                  open: false,
                  funcionarioId: null,
                  descricao: "",
                  valor: "",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={valeEditor.open}
        onOpenChange={(open) => setValeEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Vale</DialogTitle>
  {(linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoPor || "Sistema"}{" "}
  •{" "}
  {(linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoEm
    ? new Date(
        (linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoEm
      ).toLocaleString("pt-BR")
    : "Sem alterações"}
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 max-h-[300px] overflow-y-auto">
              <p className="mb-3 text-sm font-semibold text-[#D4AF37]">
                Vales do mês atual
              </p>

              {!linhaValeAtual?.vales || linhaValeAtual.vales.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum vale cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {linhaValeAtual.vales.map((vale) => (
                    <div
                      key={vale.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-[#D4AF37]/10 p-2"
                    >
                      <div className="text-sm text-gray-300">
  <div>{vale.descricao}</div>

  <div className="text-xs text-gray-500">
    Última alteração:
    {" "}
    {(vale as any).ultimaAlteracaoPor || "Sistema"}
    {" • "}
    {(vale as any).ultimaAlteracaoEm
      ? new Date(
          (vale as any).ultimaAlteracaoEm
        ).toLocaleString("pt-BR")
      : "Sem alterações"}
  </div>

  <div className="text-xs text-gray-500">
    Parcela {vale.parcelaAtual}/{vale.totalParcelas}
  </div>
</div>

                      <div className="flex items-center gap-3">
                        <span className="text-yellow-300">
                          R$ {money(vale.valor)}
                        </span>
                        <Button
                          className="bg-red-600 hover:bg-red-500 text-white"
                          size="sm"
                          onClick={() => removeVale(vale)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-3">
              <p className="text-sm font-semibold text-[#D4AF37]">Adicionar vale</p>

              <div className="space-y-2">
                <Label className="text-gray-300">Descrição</Label>
                <Input
                  value={valeEditor.descricao}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      descricao: e.target.value,
                    }))
                  }
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                  placeholder="Ex.: vale mercado"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Valor total</Label>
                <Input
                  type="text"
                  value={valeEditor.valor}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      valor: e.target.value,
                    }))
                  }
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={valeEditor.parcelas}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      parcelas: e.target.value,
                    }))
                  }
                  className="bg-[#111111] border-[#D4AF37]/20 text-white"
                />
              </div>

              <Button
                className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                onClick={addVale}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setValeEditor({
                  open: false,
                  funcionarioId: null,
                  descricao: "",
                  valor: "",
                  parcelas: "1",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={obsEditor.open}
        onOpenChange={(open) => setObsEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Observações</DialogTitle>
            <DialogDescription className="text-gray-400">
              Adicione observações e exclua a que desejar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={obsEditor.novaObs}
                onChange={(e) =>
                  setObsEditor((prev) => ({ ...prev, novaObs: e.target.value }))
                }
                className="bg-[#111111] border-[#D4AF37]/20 text-white"
                placeholder="Digite a observação"
              />
              <Button
                className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                onClick={addObservacao}
              >
                Adicionar
              </Button>
            </div>

            <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4">
              <p className="mb-3 text-sm font-semibold text-[#D4AF37]">
                Observações cadastradas
              </p>

              {!linhaObsAtual?.observacoes ||
              linhaObsAtual.observacoes.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nenhuma observação cadastrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {linhaObsAtual.observacoes.map((obs, index) => (
                    <div
                      key={`${obs}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-md border border-[#D4AF37]/10 p-2"
                    >
                      <span className="text-sm text-gray-300">{obs}</span>
                      <Button
                        className="bg-red-600 hover:bg-red-500 text-white"
                        size="sm"
                        onClick={() => removeObservacao(index)}
                      >
                        Excluir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setObsEditor({
                  open: false,
                  funcionarioId: null,
                  novaObs: "",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={negativoEditor.open}
        onOpenChange={(open) =>
          setNegativoEditor((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Boleto negativo</DialogTitle>
            <DialogDescription className="text-gray-400">
              Deseja lançar esse valor como vale no próximo mês?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Funcionário</span>
              <span className="text-white">
                {negativoEditor.linha?.nome || "-"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-300">Valor</span>
              <span className="text-red-500">
                R$ {money(negativoEditor.linha?.boleto || 0)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNegativoEditor({ open: false, linha: null })}
            >
              Cancelar
            </Button>
            <Button
              className="bg-[#D4AF37] text-black hover:bg-[#E6C760]"
              onClick={lançarNegativoNoPróximoMês}
            >
              Adicionar no próximo mês
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={regraSemanaEditor.open}
        onOpenChange={(open) =>
          setRegraSemanaEditor((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="border-[#D4AF37]/20 bg-[#080808]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.60)] backdrop-blur-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
  <DialogTitle className="text-[#D4AF37]">
    Detalhe da regra
  </DialogTitle>

  <DialogDescription className="text-gray-400 text-xs">
    {(() => {
      const semana = detalheSemanaAtual?.semana;
      const linha = detalheSemanaAtual?.linha as any;

      const por =
        semana === 1 ? linha?.ultimaAlteracaoPor1 :
        semana === 2 ? linha?.ultimaAlteracaoPor2 :
        semana === 3 ? linha?.ultimaAlteracaoPor3 :
        semana === 4 ? linha?.ultimaAlteracaoPor4 :
        null;

      const em =
        semana === 1 ? linha?.ultimaAlteracaoEm1 :
        semana === 2 ? linha?.ultimaAlteracaoEm2 :
        semana === 3 ? linha?.ultimaAlteracaoEm3 :
        semana === 4 ? linha?.ultimaAlteracaoEm4 :
        null;

      return (
        <>
          Última alteração: {por || "Sistema"} •{" "}
          {em
            ? new Date(em).toLocaleString("pt-BR")
            : "Sem alterações"}
        </>
      );
    })()}
  </DialogDescription>
</DialogHeader>

          {detalheSemanaAtual && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Funcionário</span>
                  <span className="text-white">
                    {detalheSemanaAtual.linha.nome}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Função</span>
                  <span className="text-white">
                    {detalheSemanaAtual.linha.funcao}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-2 text-sm">
                <p className="font-semibold text-[#D4AF37]">
                  {detalheSemanaAtual.metaTitulo}
                </p>

                {(detalheSemanaAtual as any).isConsultorSulMensal ? (
                  <div className="space-y-3">
                    {((detalheSemanaAtual as any).metasConsultorSul || []).map(
                      (
                        meta: {
                          minimo: number;
                          maximo: number | null;
                          faixa: string;
                          valorPorCarro: number;
                          premioAdicional: number;
                          premioAcumulado: number;
                        },
                        index: number
                      ) => {
                        const totalCarros = Number(detalheSemanaAtual.base || 0);
                        const faixaAtual =
                          totalCarros >= meta.minimo &&
                          (meta.maximo === null || totalCarros <= meta.maximo);

                        return (
                          <div
                            key={`meta-consultor-${index}`}
                            className={`rounded-lg border p-3 ${
                              faixaAtual
                                ? "border-green-500/40 bg-green-500/[0.06]"
                                : "border-white/[0.07] bg-black/20"
                            }`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p
                                  className={
                                    faixaAtual
                                      ? "font-semibold text-green-400"
                                      : "font-semibold text-white"
                                  }
                                >
                                  {meta.faixa}
                                  {faixaAtual ? " • faixa atual" : ""}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  R$ {money(meta.valorPorCarro)} por carro
                                </p>
                              </div>

                              <div className="text-left sm:text-right">
                                <p className="text-sm text-yellow-300">
                                  {meta.premioAdicional > 0
                                    ? `+ R$ ${money(meta.premioAdicional)}`
                                    : "Sem premiação"}
                                </p>
                                {meta.premioAcumulado > 0 && (
                                  <p className="mt-1 text-xs text-gray-400">
                                    Acumulado: R$ {money(meta.premioAcumulado)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}

                    <p className="pt-1 text-xs text-gray-400">
                      As premiações são acumulativas.
                    </p>
                  </div>
                ) : detalheSemanaAtual.isSupervisor ? (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-3 font-semibold text-[#D4AF37]">
                        Meta da loja
                      </p>

                      <div className="space-y-2">
                        {(
                          (detalheSemanaAtual as any)
                            .supervisorMetasLoja || []
                        ).map(
                          (
                            meta: {
                              meta: number;
                              premio: number;
                            },
                            index: number
                          ) => {
                            const atingida =
                              Number(
                                (detalheSemanaAtual as any)
                                  .supervisorLiquidezLoja || 0
                              ) >= meta.meta;

                            return (
                              <div
                                key={`loja-${index}`}
                                className="flex items-center justify-between"
                              >
                                <span
                                  className={
                                    atingida
                                      ? "text-green-400 font-semibold"
                                      : "text-gray-300"
                                  }
                                >
                                  R$ {money(meta.meta)}
                                </span>

                                <span className="text-yellow-300">
                                  + R$ {money(meta.premio)}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>

                      <div className="mt-3 border-t border-[#D4AF37]/15 pt-3 flex items-center justify-between">
                        <span className="text-gray-300">
                          Liquidez atual da loja
                        </span>

                        <span className="font-bold text-white">
                          R${" "}
                          {money(
                            (detalheSemanaAtual as any)
                              .supervisorLiquidezLoja || 0
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-gray-300">
                          Premiação acumulada da loja
                        </span>

                        <span className="font-bold text-green-400">
                          R${" "}
                          {money(
                            (detalheSemanaAtual as any)
                              .supervisorTotalPremioLoja || 0
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-[#D4AF37]/15 pt-4">
                      <p className="mb-3 font-semibold text-[#D4AF37]">
                        Meta do grupo
                      </p>

                      <div className="space-y-2">
                        {(
                          (detalheSemanaAtual as any)
                            .supervisorMetasGrupo || []
                        ).map(
                          (
                            meta: {
                              meta: number;
                              premioTotalGrupo: number;
                            },
                            index: number
                          ) => {
                            const atingida =
                              Number(
                                (detalheSemanaAtual as any)
                                  .supervisorTotalGrupo || 0
                              ) >= meta.meta;

                            return (
                              <div
                                key={`grupo-${index}`}
                                className="flex items-center justify-between"
                              >
                                <span
                                  className={
                                    atingida
                                      ? "text-green-400 font-semibold"
                                      : "text-gray-300"
                                  }
                                >
                                  R$ {money(meta.meta)}
                                </span>

                                <span className="text-yellow-300">
                                  + R$ {money(meta.premioTotalGrupo)}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-gray-300">
                          Recorde atual
                        </span>

                        <span className="text-yellow-300">
                          R${" "}
                          {money(
                            (detalheSemanaAtual as any)
                              .supervisorRecorde || 0
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-gray-300">
                          Prêmio ao superar o recorde
                        </span>

                        <span className="text-yellow-300">
                          0,1%
                        </span>
                      </div>

                      <div className="mt-3 border-t border-[#D4AF37]/15 pt-3 flex items-center justify-between">
                        <span className="text-gray-300">
                          Liquidez atual do grupo
                        </span>

                        <span className="font-bold text-white">
                          R${" "}
                          {money(
                            (detalheSemanaAtual as any)
                              .supervisorTotalGrupo || 0
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-gray-300">
                          Premiação do grupo por loja
                        </span>

                        <span className="font-bold text-green-400">
                          R${" "}
                          {money(
                            (detalheSemanaAtual as any)
                              .supervisorTotalPremioGrupo || 0
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-300 whitespace-pre-wrap break-words">
                    {(detalheSemanaAtual as any).metaDescricao ||
                      detalheSemanaAtual.linha.regraMeta ||
                      "Sem meta cadastrada"}
                  </p>
                )}
              </div>

              {!detalheSemanaAtual.isSupervisor && (
              <div className="rounded-md border border-[#D4AF37]/15 bg-[#0d0d0d] p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {detalheSemanaAtual.baseLabel}
                  </span>
                  <span className="text-white">
                    {detalheSemanaAtual.isConsultor ||
                    detalheSemanaAtual.isRecepcao
                      ? detalheSemanaAtual.base.toLocaleString("pt-BR")
                      : `R$ ${money(detalheSemanaAtual.base)}`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {detalheSemanaAtual.isConsultor ||
                    detalheSemanaAtual.isRecepcao ||
                    detalheSemanaAtual.isSupervisor
                      ? "Regra aplicada"
                      : "% aplicado"}
                  </span>
                  {(detalheSemanaAtual as any).isConsultorSulMensal ? (
                    <span className="font-semibold text-yellow-300">
                      R$ {money(detalheSemanaAtual.percentual || 0)} / carro
                    </span>
                  ) : (
                  <Input
  type="number"
  step="0.01"
  defaultValue={Number(detalheSemanaAtual.percentual || 0)}
  className="w-28 text-right border-yellow-500/30 bg-black text-yellow-300 font-semibold"
  onBlur={async (e) => {
    const valorDigitado = e.target.value.trim();
    const valor = valorDigitado === "" ? null : Number(valorDigitado);

    const semana = regraSemanaEditor.semana;
    const linha = regraSemanaEditor.linha;

    if (!linha || !semana) return;

if (semana === 7) {
  const liquidez = Number((linha as any).sem5Extra || 0);
  const percentualAutomatico = Number((linha as any).perc5Extra || 0);
  const percentualFinal = valor ?? percentualAutomatico;
  const valorComissao = Number(
    (linha.funcao === "consultor_vendas"
      ? liquidez * percentualFinal
      : liquidez * (percentualFinal / 100)
    ).toFixed(2)
  );
  const patch = {
    perc5Extra: percentualFinal,
    com5Extra: valorComissao,
    percManual5Extra: valor,
  };

  const linhaAtualizada = { ...linha, ...patch } as any;
  linhaAtualizada.totalComissao =
    Number(linhaAtualizada.com1 || 0) +
    Number(linhaAtualizada.com2 || 0) +
    Number(linhaAtualizada.com3 || 0) +
    Number(linhaAtualizada.com4 || 0) +
    Number(linhaAtualizada.com5Extra || 0) +
    Number(linhaAtualizada.comissaoFuncaoAnterior || 0);

  setRegraSemanaEditor((prev) => ({ ...prev, linha: linhaAtualizada }));
  setFolhas((prev) =>
    prev.map((f) =>
      f.funcionarioId === linha.funcionarioId &&
      f.loja_id === lojaId &&
      f.ano === ano &&
      f.mes === mes
        ? { ...f, ...patch }
        : f
    )
  );

  await upsertFolhaBaseMutation.mutateAsync({
    funcionarioId: linha.funcionarioId,
    lojaId,
    ano,
    mes,
    semana: 7,
    funcaoSemana: (linha as any).funcaoSemana5 ?? undefined,
    composicaoSemana: (linha as any).composicaoSemana5 ?? undefined,
    liquidez,
    percentualComissao: percentualFinal,
    percentualManual: valor,
    valorComissao,
    ultimaAlteracaoPor: usuarioLogado,
    ultimaAlteracaoEm: new Date(),
  });
  return;
}

if (
  linha.funcao === "gerente" &&
  (linha.loja_id === 3 || linha.loja_id === 6) &&
  semana === 5
) {
  const liquidez = Number((linha as any).liquidezLojaGerente || 0);

  const percentualFinal =
    valor ?? Number((linha as any).percLojaGerente || 0);

  const valorComissao = Number(
    (liquidez * (percentualFinal / 100)).toFixed(2)
  );

  const patch = {
    percLojaGerente: percentualFinal,
    comLojaGerente: valorComissao,
  };

  setFolhas((prev) =>
    prev.map((f) =>
      f.funcionarioId === linha.funcionarioId &&
      f.loja_id === lojaId &&
      f.ano === ano &&
      f.mes === mes
        ? { ...f, ...patch }
        : f
    )
  );

  await upsertFolhaBaseMutation.mutateAsync({
    funcionarioId: linha.funcionarioId,
    lojaId,
    ano,
    mes,
    semana: 5,
    liquidez,
    percentualComissao: percentualFinal,
    percentualManual: valor,
    valorComissao,
    ultimaAlteracaoPor: usuarioLogado,
    ultimaAlteracaoEm: new Date(),
  });

  return;
}

    const percentualAutomatico =
      semana === 1
        ? linha.perc1
        : semana === 2
        ? linha.perc2
        : semana === 3
        ? linha.perc3
        : linha.perc4;

    const percentualFinal = valor ?? percentualAutomatico;

    const liquidez =
      semana === 1
        ? Number(linha.sem1 || 0)
        : semana === 2
        ? Number(linha.sem2 || 0)
        : semana === 3
        ? Number(linha.sem3 || 0)
        : Number(linha.sem4 || 0);

    const valorComissao = Number(
      (
        linha.funcao === "consultor_vendas"
          ? liquidez * percentualFinal
          : liquidez * (percentualFinal / 100)
      ).toFixed(2)
    );

    const patch =
      semana === 1
        ? { perc1: percentualFinal, com1: valorComissao, percManual1: valor }
        : semana === 2
        ? { perc2: percentualFinal, com2: valorComissao, percManual2: valor }
        : semana === 3
        ? { perc3: percentualFinal, com3: valorComissao, percManual3: valor }
        : { perc4: percentualFinal, com4: valorComissao, percManual4: valor };

    const linhaAtualizada = {
         ...linha,
         ...patch,
         ultimaAlteracaoPor: usuarioLogado,
         ultimaAlteracaoEm: new Date(),
       } as any;

    setRegraSemanaEditor((prev) => ({
      ...prev,
      linha: linhaAtualizada as LinhaComQuadrante,
    }));

    setFolhas((prev) =>
      prev.map((f) =>
        f.funcionarioId === linha.funcionarioId &&
        f.loja_id === lojaId &&
        f.ano === ano &&
        f.mes === mes
          ? { ...f, ...patch }
          : f
      )
    );

    try {
      await upsertFolhaBaseMutation.mutateAsync({
        funcionarioId: linha.funcionarioId,
        lojaId,
        ano,
        mes,
        semana,
        liquidez,
        percentualComissao: percentualFinal,
        percentualManual: valor,
        valorComissao,

        ultimaAlteracaoPor: usuarioLogado,
        ultimaAlteracaoEm: new Date(),
      });

    } catch (err) {
      console.error(err);
    }
  }}
/>
                  )}
                </div>

                {(detalheSemanaAtual as any).isConsultorSulMensal && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Premiação acumulada</span>
                    <span className="font-semibold text-yellow-300">
                      R$ {money((detalheSemanaAtual as any).premiacaoConsultorSul || 0)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#D4AF37]/15 pt-3">
                  <span className="text-white font-semibold">
                    {detalheSemanaAtual.isSupervisor
                      ? "Premiação da loja"
                      : "Valor do período"}
                  </span>
                  <span className="text-green-400 font-bold">
                    R$ {money(detalheSemanaAtual.comissao)}
                  </span>
                </div>
              </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setRegraSemanaEditor({
                  open: false,
                  linha: null,
                  semana: null,
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}