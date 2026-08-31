import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
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


const ROTA_GESTAO_FUNCIONARIOS = "/gestao-funcionarios";
const IMPORT_ALIAS_STORAGE_KEY = "folha-importacao-aliases-v1";
const IMPORT_PENDENTE_STORAGE_KEY = "folha-importacao-pendente-v1";
const IMPORT_ADIANT_PENDENTE_STORAGE_KEY = "folha-importacao-adiant-pendente-v1";
const IMPORT_HOLERITE_PENDENTE_STORAGE_KEY = "folha-importacao-holerite-pendente-v1";

type SemanaImportacao = 1 | 2 | 3 | 4;
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
  return (
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
    return (
      totalComissao +
      premiacao -
      vale -
      aluguel -
      inss -
      adiant -
      holerite
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

type LinhaComQuadrante = FolhaMensal & {
  quadrante: QuadranteKey;
};

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
  semana: 1 | 2 | 3 | 4 | 5 | null;
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
  // Na ACI existe somente Consultor de Vendas Meta 2 (mensal).
  if (lojaId === 5 || tipoMeta === "meta2") {
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
  const lines = rows.map((r) => {
    const cpf = String(r.cpf || "").replace(/\D/g, "");
    const nome = String(r.nome || "").trim();
    const valor = Number(r.valor || 0).toFixed(2);
    const pix = String(r.pix || cpf).trim();

    return `${cpf},${nome},${valor},,,,,${pix},`;
  });

  const csv = lines.join("\n");

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
  onOpenImportacaoSemana,
  onOpenImportacaoAdiantamento,
  onOpenImportacaoHolerite,
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
  onOpenRegraSemanaEditor: (
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4 | 5
  ) => void;
  onOpenImportacaoSemana: (semana: SemanaImportacao) => void;
  onOpenImportacaoAdiantamento: () => void;
  onOpenImportacaoHolerite: () => void;
}) {
  if (linhas.length === 0) return null;

  const isSalarioFixo = quadrante === "salario_fixo";
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

    return (
      <button
        type="button"
        onClick={() => onOpenCellEditor(linha, campo, label, mode)}
        className={`w-full flex items-center justify-end whitespace-nowrap rounded-md border border-primary/20 bg-gray-800 px-3 py-2 font-bold hover:border-primary/60 ${
  rawValue > 0
    ? ["sem1", "sem2", "sem3", "sem4", "premiacao"].includes(String(campo))
      ? "text-green-400"
      : ["vale", "aluguel", "inss", "adiant", "holerite"].includes(String(campo))
        ? "text-red-400"
        : "text-white"
    : "text-white"
}`}
      >
        {text}
      </button>
    );
  }

  function renderRegraButton(
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4
  ) {
   
   if (isConsultorMeta2) {
  return (
    <span className="text-yellow-300 font-semibold whitespace-nowrap">
      {getRegraConsultorTexto(linha, Number(linha.sem1 || 0))}
    </span>
  );
}
    const manualValue =
  semana === 1
    ? linha.percManual1
    : semana === 2
    ? linha.percManual2
    : semana === 3
    ? linha.percManual3
    : linha.percManual4;

const funcaoRegra =
  linha.funcao === "gerente" &&
  (linha.loja_id === 3 || linha.loja_id === 6)
    ? "vendedor"
    : linha.funcao;

const meta = findMetaForFuncionario({
  funcionarioNome: linha.nome,
  funcao: funcaoRegra,
  cidade: linha.loja_id.toString(),
  tipoMeta: linha.tipoMeta,
});

const calculadoOriginal = computeFolhaLinha({
  meta,
  funcao: funcaoRegra,
  cidade: linha.loja_id.toString(),
  funcionarioNome: linha.nome,
  tipoMeta: linha.tipoMeta,

  sem1: linha.sem1,
  sem2: linha.sem2,
  sem3: linha.sem3,
  sem4: linha.sem4,

  premiacoesManuais: [],
  vales: [],
  aluguel: 0,
  inss: 0,
  adiant: 0,
  holerite: 0,
});

const percentualAutomatico =
  semana === 1
    ? calculadoOriginal.perc1
    : semana === 2
    ? calculadoOriginal.perc2
    : semana === 3
    ? calculadoOriginal.perc3
    : calculadoOriginal.perc4;

 const manual =
  !(
    linha.funcao === "gerente" &&
    (linha.loja_id === 3 || linha.loja_id === 6)
  ) &&
  Number(manualValue || 0) > 0 &&
  Number(percentualAutomatico || 0) > 0 &&
  Math.abs(Number(manualValue) - Number(percentualAutomatico)) > 0.001;
const regraClassName = manual
  ? "text-orange-400 font-bold hover:underline underline-offset-4"
  : "text-yellow-300 font-semibold hover:underline underline-offset-4";
    if (isConsultor) {
      const carrosSemana =
        semana === 1
          ? linha.sem1
          : semana === 2
          ? linha.sem2
          : semana === 3
          ? linha.sem3
          : linha.sem4;

      const valorManual =
        semana === 1
          ? linha.perc1
          : semana === 2
          ? linha.perc2
          : semana === 3
          ? linha.perc3
          : linha.perc4;

  return (
  <button
    type="button"
    onClick={() => onOpenRegraSemanaEditor(linha, semana)}
    className={regraClassName}
  >
    {valorManual > 0
      ? `R$ ${money(valorManual)} / carro`
      : getRegraConsultorTexto(linha, carrosSemana)}
  </button>
    );
    }

    if (isRecepcao) {
      const config = getRecepcaoConfig(linha.nome, linha.loja_id.toString());
      const valor = semana === 1 ? config.valorVenda : config.valorEntrada;

      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semana)}
          className={regraClassName}
        >
          R$ {money(valor)}
        </button>
      );
    }

    if (isSupervisor) {
      const premio =
        semana === 1
          ? linha.com1
          : semana === 2
          ? linha.com2
          : semana === 3
          ? linha.com3
          : linha.com4;

      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semana)}
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
    : semana === 1
    ? linha.perc1
    : semana === 2
    ? linha.perc2
    : semana === 3
    ? linha.perc3
    : linha.perc4;

    return (
  <button
    type="button"
    onClick={() => onOpenRegraSemanaEditor(linha, semana)}
    className={regraClassName}
  >
    {percentual.toFixed(2)}%
  </button>
);
}

  return (
    <Card className="bg-gray-900 border-primary/30">
      <CardHeader>
        <CardTitle className="text-primary">{titulo}</CardTitle>
        <CardDescription className="text-gray-400">
          {descricao}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1900px] text-sm">
            <thead>
              <tr className="border-b border-primary/30 text-primary">
                <th className="text-left p-2 sticky left-0 z-20 bg-gray-900">Nome</th>
                <th className="text-left p-2">Função</th>
                {isSalarioFixo && (
  <th className="text-right p-2">Salário</th>
)}

                {!isSalarioFixo && !isRecepcao && !isPj && !isMensalUnico && !isConsultorMeta2 && !isGerente && (
                  <>
                    <th className="text-right p-2">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(1)}
                          className="font-bold text-primary hover:underline underline-offset-4"
                          title="Importar relatório da SEM1"
                        >
                          SEM1
                        </button>
                      ) : (
                        "SEM1"
                      )}
                    </th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(2)}
                          className="font-bold text-primary hover:underline underline-offset-4"
                          title="Importar relatório da SEM2"
                        >
                          SEM2
                        </button>
                      ) : (
                        "SEM2"
                      )}
                    </th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(3)}
                          className="font-bold text-primary hover:underline underline-offset-4"
                          title="Importar relatório da SEM3"
                        >
                          SEM3
                        </button>
                      ) : (
                        "SEM3"
                      )}
                    </th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">
                      {quadrante === "comissao_semanal" ? (
                        <button
                          type="button"
                          onClick={() => onOpenImportacaoSemana(4)}
                          className="font-bold text-primary hover:underline underline-offset-4"
                          title="Importar relatório da SEM4"
                        >
                          SEM4
                        </button>
                      ) : (
                        "SEM4"
                      )}
                    </th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                  </>
                )}
                

 
{isGerente && !isGerenteSaoJoseSemanal && (
  <>
    <th className="text-right p-2">Liquidez Venda</th>
    <th className="text-right p-2">% Venda</th>
    <th className="text-right p-2">Liquidez Loja</th>
    <th className="text-right p-2">% Loja</th>
    <th className="text-right p-2">Total Comissão</th>
  </>
)}

{isGerenteSaoJoseSemanal && (
  <>
    <th className="text-right p-2">SEM1</th>
    <th className="text-right p-2">% SEM1</th>
    <th className="text-right p-2">SEM2</th>
    <th className="text-right p-2">% SEM2</th>
    <th className="text-right p-2">SEM3</th>
    <th className="text-right p-2">% SEM3</th>
    <th className="text-right p-2">SEM4</th>
    <th className="text-right p-2">% SEM4</th>
    <th className="text-right p-2">Liquidez Loja</th>
    <th className="text-right p-2">% Loja</th>
    <th className="text-right p-2">Total Comissão</th>
  </>
)}
                 
                {isConsultorMeta2 && (
  <>
    <th className="text-right p-2">Quant. Carro</th>
    <th className="text-right p-2">Regra</th>
    <th className="text-right p-2">Total Carros</th>
    <th className="text-right p-2">Total Comissão</th>
  </>
)}

{!isSalarioFixo &&
  !isRecepcao &&
  !isPj &&
  isMensalUnico &&
  !isConsultorMeta2 &&
  !isGerente && (
    <>
      <th className="text-right p-2">
        {quadrante === "comissao_mensal" && linhas[0]?.loja_id === 4 ? (
          <button
            type="button"
            onClick={() => onOpenImportacaoSemana(1)}
            className="font-bold text-primary hover:underline underline-offset-4"
            title="Importar relatório mensal de VENDA/MECÂNICA"
          >
            Liquidez Venda
          </button>
        ) : (
          "Liquidez"
        )}
      </th>
      <th className="text-right p-2">%</th>
    </>
)}

                {isRecepcao && (
                  <>
                    <th className="text-right p-2">Vendas fechadas</th>
                    <th className="text-right p-2">Valor</th>
                    {recepcaoCompleta && (
                      <>
                        <th className="text-right p-2">Entradas</th>
                        <th className="text-right p-2">Valor</th>
                      </>
                    )}
                  </>
                )}

                {isSupervisor && (
                  <>
                   <th className="text-right p-2">Salário</th>
                   <th className="text-right p-2">Liquidez</th>
                   <th className="text-right p-2">Total comissão</th>
                   <th className="text-right p-2">Total</th>
                 </>
                )}

                {isSupervisoraAci && (
                  <>
                    <th className="text-right p-2">Salário Fixo</th>
                    <th className="text-right p-2">Joinville</th>
                    <th className="text-right p-2">Blumenau</th>
                    <th className="text-right p-2">São José</th>
                    <th className="text-right p-2">Florianópolis</th>
                    <th className="text-right p-2">Gravataí</th>
                    <th className="text-right p-2">São Leopoldo</th>
                    <th className="text-right p-2">Total Carros</th>
                    <th className="text-right p-2">Valor / Carro</th>
                    <th className="text-right p-2">Comissão</th>
                    <th className="text-right p-2">Total</th>
                  </>
                )}

                {!isSalarioFixo && !isRecepcao && !isPj && !isConsultorMeta2 && !isGerente && (
  <>
    <th className="text-right p-2">
      {isConsultor ? "Total Carros" : "Total Liquidez"}
    </th>
    <th className="text-right p-2">Total Comissão</th>
  </>
)}

                {isRecepcao && <th className="text-right p-2">Total Comissão</th>}

                <th className="text-right p-2">Premiação</th>
                <th className="text-right p-2">Vale</th>
                <th className="text-right p-2">Aluguel</th>
                {!isPj && <th className="text-right p-2">INSS</th>}
                {isSupervisoraAci ? (
                  <th className="text-right p-2">Adiant.</th>
                ) : (
                  <th className="text-right p-2">
                    <button
                      type="button"
                      onClick={onOpenImportacaoAdiantamento}
                      className="inline-flex items-center gap-1 text-primary hover:text-yellow-300 hover:underline underline-offset-4"
                      title="Importar PDF de adiantamento"
                    >
                      Adiant.
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}
                {!isPj && (
                  <th className="text-right p-2">
                    <button
                      type="button"
                      onClick={onOpenImportacaoHolerite}
                      className="inline-flex items-center gap-1 text-primary hover:text-yellow-300 hover:underline underline-offset-4"
                      title="Importar PDF da folha mensal"
                    >
                      Holerite
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}
                <th className="text-right p-2">Boleto</th>
                <th className="text-right p-2">Observação</th>
              </tr>
            </thead>

            <tbody>
             {linhas.map((linha: LinhaComQuadrante) => (
                <tr
                  key={linha.id}
                  className="border-b border-primary/10 hover:bg-gray-800"
                >
                  <td className="p-2 text-white font-semibold sticky left-0 z-10 bg-gray-900 min-w-[260px]">
                    <button
                      type="button"
                      onClick={() => onOpenFuncionarioDetalhe(linha)}
                      className="text-left text-white font-semibold hover:text-primary hover:underline underline-offset-4 transition-colors"
                      title="Ver dados do funcionário"
                    >
                      {linha.nome}
                    </button>
                  </td>
                  <td className="p-2 text-gray-300">
                    {isSupervisoraAci
                      ? "Supervisora de Consultor de Vendas - PJ"
                      : linha.funcao}
                  </td>
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
    <td className="p-2">
      {renderEditButton(
        linha,
        "sem1",
        "Quant. Carro",
        "number"
      )}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
  {getRegraConsultorTexto(linha, Number(linha.sem1 || 0))}
</td>

    <td className="p-2 text-right text-white font-semibold whitespace-nowrap">
      {Number(linha.sem1 || 0).toLocaleString("pt-BR")}
    </td>

    <td className="p-2 text-right text-yellow-300 font-semibold whitespace-nowrap">
      R$ {money(linha.totalComissao)}
    </td>
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
  className="w-full flex items-center justify-end whitespace-nowrap rounded-md border border-primary/20 bg-gray-800 px-3 py-2 font-bold hover:border-primary/60 text-white"
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
                      className={`w-full flex items-center justify-end whitespace-nowrap rounded-md border border-primary/20 bg-gray-800 px-3 py-2 hover:border-primary/60 font-bold ${
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
                      className={`w-full flex items-center justify-end whitespace-nowrap rounded-md border border-primary/20 bg-gray-800 px-3 py-2 hover:border-primary/60 font-bold ${
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
                          : "rounded-md border border-primary/20 bg-gray-800 px-3 py-2 text-white hover:border-primary/60"
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

const usuarioLogado = meQuery.data?.name || meQuery.data?.email || "Usuário";

const upsertFolhaBaseMutation = trpc.folhaPagamento.upsertBaseItem.useMutation({
  onSuccess: () => {
    void folhaBaseQuery.refetch();
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
      funcao: funcionarioEdicaoForm.funcao,
      tipoMeta:
        funcionarioEdicaoForm.funcao === "consultor_vendas"
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

  (item as any).ultimaAlteracaoPor4 = (row as any).ultimaAlteracaoPor || null;
  (item as any).ultimaAlteracaoEm4 = (row as any).ultimaAlteracaoEm || null;
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
    Number(folhaFuncionario?.sem4 || 0);

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

      const funcaoMetaCalculo =
  func.funcao === "gerente" && (lojaId === 3 || lojaId === 6)
    ? "vendedor"
    : func.funcao;

      const isGerenteSaoJose =
  func.funcao === "gerente" && (lojaId === 3 || lojaId === 6);

const tipoMetaEfetivo =
  func.funcao === "consultor_vendas" && lojaId === 5
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
    Number(calculadoAjustado.com4 || 0);
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
  boletoOriginal: calculadoAjustado.boleto,
});

return {
  ...base,
  tipoMeta: tipoMetaEfetivo,
  regraMeta: meta?.regra || "Sem meta cadastrada",
  quadrante,
  ...calculadoAjustado,
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

  function openImportacaoSemana(semana: SemanaImportacao) {
    if (!garantirCompetenciaAberta()) return;

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

        const porAlias = aliasId
          ? candidatosFuncao.find((f: any) => Number(f.id) === Number(aliasId))
          : null;

        const nomeCanonico = normalizarNomeImportacao(item.nomeRelatorio);
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

        const candidatosOrdenados = candidatosFuncao
          .map((funcionario: any) => ({
            funcionario,
            score: scoreNomesImportacao(item.nomeRelatorio, funcionario.nome),
          }))
          .sort((a, b) => b.score - a.score);

        const melhor = candidatosOrdenados[0];
        const ehPossivel = !!melhor && melhor.score >= 0.55;

        return {
          id: `${item.funcaoRelatorio}-${index}-${normalizarTextoImportacao(item.nomeRelatorio)}`,
          nomeRelatorio: item.nomeRelatorio,
          funcaoRelatorio: item.funcaoRelatorio,
          valor: item.valor,
          funcionarioId: null,
          funcionarioNome: null,
          status: ehPossivel ? "possivel" : "nao_cadastrado",
          candidatoId: ehPossivel ? Number(melhor.funcionario.id) : null,
          candidatoNome: ehPossivel ? melhor.funcionario.nome : null,
          scoreCandidato: ehPossivel ? melhor.score : 0,
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

  function irParaCadastrarFuncionario(item: ItemRelatorioImportacao) {
    if (typeof window !== "undefined") {
      salvarImportacaoPendente();
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
    }

    setLocation(ROTA_GESTAO_FUNCIONARIOS);
  }

  async function confirmarImportacaoSemana() {
    if (!garantirCompetenciaAberta()) return;

    const itensValidos = importacaoSemana.itens.filter(
      (item) => item.status === "ok" && item.funcionarioId
    );

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
    const campoSemana = `sem${semana}` as "sem1" | "sem2" | "sem3" | "sem4";

    try {
      const atualizacoes = itensValidos.map((item) => {
        const currentLine = linhas.find(
          (linha) => Number(linha.funcionarioId) === Number(item.funcionarioId)
        );

        if (!currentLine) {
          throw new Error(`Funcionário ${item.funcionarioNome || item.nomeRelatorio} não encontrado na folha.`);
        }

        const updatedLine = {
          ...currentLine,
          [campoSemana]: Number(item.valor || 0),
        } as LinhaComQuadrante;

        const metaAtualizacao = findMetaForFuncionario({
          funcionarioNome: updatedLine.nome,
          funcao: updatedLine.funcao,
          cidade: selectedLoja,
          tipoMeta: updatedLine.tipoMeta,
        });

        const recalculado = computeFolhaLinha({
          meta: metaAtualizacao,
          funcao: updatedLine.funcao,
          cidade: selectedLoja,
          funcionarioNome: updatedLine.nome,
          tipoMeta: updatedLine.tipoMeta,
          sem1: Number(updatedLine.sem1 || 0),
          sem2: Number(updatedLine.sem2 || 0),
          sem3: Number(updatedLine.sem3 || 0),
          sem4: Number(updatedLine.sem4 || 0),
          percManual1: null,
          percManual2: null,
          percManual3: null,
          percManual4: null,
          premiacoesManuais: updatedLine.premiacoesManuais || [],
          vales: updatedLine.vales || [],
          aluguel: Number(updatedLine.aluguel || 0),
          inss: Number(updatedLine.inss || 0),
          adiant: Number(updatedLine.adiant || 0),
          holerite: Number(updatedLine.holerite || 0),
        });

        const mergedLine = {
          ...updatedLine,
          ...recalculado,
        } as LinhaComQuadrante;

        const percentual =
          semana === 1
            ? mergedLine.perc1
            : semana === 2
            ? mergedLine.perc2
            : semana === 3
            ? mergedLine.perc3
            : mergedLine.perc4;

        const comissao =
          semana === 1
            ? mergedLine.com1
            : semana === 2
            ? mergedLine.com2
            : semana === 3
            ? mergedLine.com3
            : mergedLine.com4;

        return {
          mergedLine,
          payload: {
            funcionarioId: Number(item.funcionarioId),
            lojaId,
            ano,
            mes,
            semana,
            liquidez: Number(item.valor || 0),
            percentualComissao: Number(percentual || 0),
            valorComissao: Number(comissao || 0),
            ultimaAlteracaoPor: usuarioLogado,
            ultimaAlteracaoEm: new Date(),
          },
        };
      });

      // Atualiza a tela imediatamente.
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

          if (index >= 0) {
            next[index] = linha;
          } else {
            next.push(linha);
          }
        }

        return next;
      });

      await Promise.all(
        atualizacoes.map((atualizacao) =>
          importFolhaBaseMutation.mutateAsync(atualizacao.payload)
        )
      );

      void folhaBaseQuery.refetch();
      void resumoSupervisorQuery.refetch();

      setImportacaoSemana((prev) => ({
        ...prev,
        etapa: "sucesso",
        mensagem:
          lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
            ? `${itensValidos.length} valor(es) importado(s) para a Liquidez mensal de Florianópolis.`
            : `${itensValidos.length} valor(es) importado(s) para a SEM${semana}.`,
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

        if (item.emprestimos.length > 0) {
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

      const totalEmprestimos = itensValidos.reduce(
        (acc, item) => acc + item.emprestimos.length,
        0
      );

      setImportacaoHolerite((prev) => ({
        ...prev,
        etapa: "sucesso",
        mensagem:
          `${itensValidos.length} holerite(s) importado(s). ` +
          `INSS e Valor Líquido atualizados; ${totalEmprestimos} empréstimo(s) CLT lançado(s) no Vale. ` +
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
      .filter((linha) => linha.boleto > 0)
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
  semana: 1 | 2 | 3 | 4 | 5
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
  const funcao = String(linha.funcao || "")
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
    semana >= 1 &&
    semana <= 4;

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
      semana === 1
        ? linha.sem1
        : semana === 2
        ? linha.sem2
        : semana === 3
        ? linha.sem3
        : linha.sem4;
    const percentual =
      semana === 1
        ? linha.perc1
        : semana === 2
        ? linha.perc2
        : semana === 3
        ? linha.perc3
        : linha.perc4;
    const comissao =
      semana === 1
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
        ((linha.loja_id === 3 || linha.loja_id === 6) && semana >= 1 && semana <= 4) ||
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
  fechamentoQuery.isLoading
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
  fechamentoQuery.error
) {

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <p className="text-red-400">
        {funcionariosQuery.error?.message ||
  folhaBaseQuery.error?.message ||
  folhaExtrasQuery.error?.message ||
  fechamentoQuery.error?.message}
      </p>
    </div>
  );
}
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6 text-white">
      <div className="max-w-[1900px] mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                className="text-primary hover:bg-primary/20"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold text-primary">
                Folha de Pagamento
              </h1>
            </div>
            <p className="text-gray-400">
              Quadrantes organizados por tipo de remuneração
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div
                className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                  mesFechado
                    ? "border-red-500/40 bg-red-950/30 text-red-300"
                    : "border-green-500/30 bg-green-950/20 text-green-300"
                }`}
              >
                {mesFechado ? "🔒 MÊS FECHADO" : "🟢 MÊS ABERTO"}
              </div>

              {podeGerenciarFechamento && !mesFechado && (
                <Button
                  variant="outline"
                  className="border-red-500/40 text-red-300 hover:bg-red-950/30"
                  disabled={fecharMesMutation.isPending}
                  onClick={fecharMesAtual}
                >
                  {fecharMesMutation.isPending ? "Fechando..." : "Fechar mês"}
                </Button>
              )}

              {podeGerenciarFechamento && mesFechado && (
                <Button
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/10"
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
                className="bg-primary text-black hover:bg-yellow-300 font-semibold"
                onClick={exportarBoletos}
              >
                Exportar boletos
              </Button>
            </div>

            {mesFechado && fechamentoQuery.data?.fechadoPorNome && (
              <p className="text-xs text-gray-500">
                Fechado por {fechamentoQuery.data.fechadoPorNome}
                {fechamentoQuery.data.fechadoEm
                  ? ` • ${new Date(fechamentoQuery.data.fechadoEm).toLocaleString("pt-BR")}`
                  : ""}
              </p>
            )}

            {erroFechamento && !reabrirMesOpen && (
              <p className="text-xs text-red-400 max-w-xl text-right">{erroFechamento}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Liquidez
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ {money(totalLiquidezGeral)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Comissão + Premiação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-300">
                R$ {money(totalComissaoGeral)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Boleto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  totalBoletoGeral < 0 ? "text-red-500" : "text-green-400"
                }`}
              >
                R$ {money(totalBoletoGeral)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-primary/30">
  <CardHeader>
    <CardTitle className="text-primary text-sm">
      Total Folha
    </CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-2xl font-bold text-green-400">
      R$ {money(totalFolhaGeral)}
    </p>

    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
  <button
    type="button"
    onClick={() =>
      setFolhaFiltros((prev) => ({ ...prev, inss: !prev.inss }))
    }
    className={`rounded-md px-2 py-1 text-center ${
      folhaFiltros.inss ? "bg-gray-700" : "bg-gray-900 opacity-50"
    }`}
  >
    <span className="block text-gray-400">INSS</span>
    
  </button>

  <button
    type="button"
    onClick={() =>
      setFolhaFiltros((prev) => ({ ...prev, adiant: !prev.adiant }))
    }
    className={`rounded-md px-2 py-1 text-center ${
      folhaFiltros.adiant ? "bg-gray-700" : "bg-gray-900 opacity-50"
    }`}
  >
    <span className="block text-gray-400">Adiant.</span>
    
  </button>

  <button
    type="button"
    onClick={() =>
      setFolhaFiltros((prev) => ({
        ...prev,
        holerite: !prev.holerite,
      }))
    }
    className={`rounded-md px-2 py-1 text-center ${
      folhaFiltros.holerite
        ? "bg-gray-700"
        : "bg-gray-900 opacity-50"
    }`}
    >
    <span className="block text-gray-400">Holerite</span>
     
  </button>
</div>

</CardContent>
</Card>

</div>

<Card className="bg-gray-900 border-primary/30 py-1">
  <CardContent className="py-3 px-4">
    <div className="grid grid-cols-12 items-center gap-4">
      <div className="col-span-12 md:col-span-1">
        <p className="text-primary font-semibold">Filtros</p>
      </div>

      <div className="col-span-12 md:col-span-2">
        <div className="flex items-center gap-3">
          <Label className="text-gray-300 whitespace-nowrap">Cidade</Label>
          <Select value={selectedLoja} onValueChange={setSelectedLoja}>
            <SelectTrigger className="bg-gray-800 border-primary/30 text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-primary/30">
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
            className="bg-gray-800 border-primary/30 text-white h-9"
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
            <SelectTrigger className="bg-gray-800 border-primary/30 text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-primary/30">
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
          <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-5 py-4">
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

        {linhas.length === 0 ? (
          <Card className="bg-gray-900 border-primary/30">
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
              onOpenImportacaoSemana={openImportacaoSemana}
              onOpenImportacaoAdiantamento={openImportacaoAdiantamento}
              onOpenImportacaoHolerite={openImportacaoHolerite}
            />
          ))
        )}
      </div>

      <Dialog
        open={importacaoSemana.open}
        onOpenChange={(open) => {
          if (!open && importacaoSemana.etapa !== "importando") {
            fecharImportacaoSemana();
          }
        }}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary text-xl">
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
              <div className="rounded-md border border-primary/20 bg-gray-900 p-5">
                <Label className="text-gray-300 block mb-3">Arquivo Excel (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="bg-gray-800 border-primary/30 text-white"
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

            const prontos = importacaoSemana.itens.filter((item) => item.status === "ok");
            const divergencias = importacaoSemana.itens.filter(
              (item) => item.status === "possivel" || item.status === "nao_cadastrado"
            );
            const ignorados = importacaoSemana.itens.filter((item) => item.status === "ignorado");
            const campoSemana = `sem${importacaoSemana.semana}` as keyof LinhaComQuadrante;
            const existentesComValor = prontos.filter((item) => {
              const linha = linhas.find(
                (l) => Number(l.funcionarioId) === Number(item.funcionarioId)
              );
              return Number(linha?.[campoSemana] || 0) > 0;
            });

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoSemana.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Período</p>
                    <p className="font-semibold">{importacaoSemana.periodo || "Não identificado"}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Loja do relatório</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoSemana.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Prontos</p>
                    <p className="font-semibold text-green-400">{prontos.length}</p>
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

                <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-primary">Funcionários encontrados</p>
                    <span className="text-xs text-gray-400">LIQ. S/ PNEUS</span>
                  </div>
                  <div className="space-y-2">
                    {prontos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum funcionário pronto ainda.</p>
                    ) : (
                      prontos.map((item) => (
                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center border-b border-primary/10 pb-2">
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
                  <div className="rounded-md border border-yellow-500/30 bg-gray-900 p-4">
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
                                  Possível correspondência: <strong>{item.candidatoNome}</strong>
                                </p>
                              )}
                              {item.status === "nao_cadastrado" && (
                                <p className="text-sm text-yellow-200 mt-1">Não encontrei este funcionário no cadastro da loja.</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.status === "possivel" && item.candidatoId && (
                                <Button
                                  type="button"
                                  className="bg-primary text-black hover:bg-yellow-300"
                                  onClick={() => vincularItemImportacao(item.id, Number(item.candidatoId))}
                                >
                                  Sim, vincular
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                className="border-primary/30 text-primary"
                                onClick={() => irParaCadastrarFuncionario(item)}
                              >
                                Cadastrar funcionário
                              </Button>
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
                  <div className="rounded-md border border-orange-500/30 bg-gray-900 p-4">
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
                    className="bg-primary text-black hover:bg-yellow-300"
                    disabled={
                      cidadeDiferente ||
                      prontos.length === 0 ||
                      importacaoSemana.etapa === "importando"
                    }
                    onClick={confirmarImportacaoSemana}
                  >
                    {importacaoSemana.etapa === "importando"
                      ? "Importando..."
                      : lojaId === 4 && usaMetaMensal(lojaId, ano, mes)
                        ? `Importar Liquidez (${prontos.length})`
                        : `Importar SEM${importacaoSemana.semana} (${prontos.length})`}
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
                  className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary text-xl">
              Importar adiantamentos — PDF
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              O sistema usa o Valor Líquido do recibo de adiantamento — exatamente o valor que o funcionário recebeu. Esta importação altera somente a coluna Adiant.
            </DialogDescription>
          </DialogHeader>

          {importacaoAdiantamento.etapa === "arquivo" && (
            <div className="space-y-4">
              <div className="rounded-md border border-primary/20 bg-gray-900 p-5">
                <Label className="text-gray-300 block mb-3">Arquivo de adiantamento (.pdf)</Label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="bg-gray-800 border-primary/30 text-white"
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
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoAdiantamento.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Competência</p>
                    <p className={competenciaDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoAdiantamento.competencia || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Loja do PDF</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoAdiantamento.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
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

                <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-primary">Valores encontrados</p>
                    <span className="text-xs text-gray-400">Valor Líquido recebido</span>
                  </div>
                  <div className="space-y-2">
                    {prontos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum funcionário pronto ainda.</p>
                    ) : (
                      prontos.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center border-b border-primary/10 pb-2"
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
                  <div className="rounded-md border border-yellow-500/30 bg-gray-900 p-4">
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
                                  className="bg-primary text-black hover:bg-yellow-300"
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
                                <SelectTrigger className="w-[220px] bg-gray-800 border-primary/30 text-white">
                                  <SelectValue placeholder="Escolher funcionário" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 border-primary/30 max-h-72">
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
                                className="border-primary/30 text-primary"
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
                  <div className="rounded-md border border-orange-500/30 bg-gray-900 p-4">
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
                    className="bg-primary text-black hover:bg-yellow-300"
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
                  className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary text-xl">
              Importar Folha Mensal — PDF
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Preenche INSS e Holerite pelo PDF e lança os descontos reais de Empréstimo CLT no Vale. O Adiant. do dia 20 nunca é alterado por esta importação.
            </DialogDescription>
          </DialogHeader>

          {importacaoHolerite.etapa === "arquivo" && (
            <div className="space-y-4">
              <div className="rounded-md border border-primary/20 bg-gray-900 p-5">
                <Label className="text-gray-300 block mb-3">Folha Mensal (.pdf)</Label>
                <Input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="bg-gray-800 border-primary/30 text-white"
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
            const totalEmprestimos = prontos.reduce(
              (acc, item) => acc + item.emprestimos.length,
              0
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
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Arquivo</p>
                    <p className="font-semibold break-all">{importacaoHolerite.arquivoNome}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Competência</p>
                    <p className={competenciaDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoHolerite.competencia || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Loja do PDF</p>
                    <p className={cidadeDiferente ? "font-semibold text-red-400" : "font-semibold text-green-400"}>
                      {importacaoHolerite.cidadeRelatorio || "Não identificada"}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Funcionários prontos</p>
                    <p className="font-semibold text-green-400">{prontos.length}</p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-gray-900 p-3">
                    <p className="text-xs text-gray-400">Empréstimos CLT</p>
                    <p className="font-semibold text-yellow-300">{totalEmprestimos}</p>
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

                <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-primary">Valores encontrados</p>
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
                                  <p className="font-bold text-yellow-300">
                                    {item.emprestimos.length} • {formatarMoeda(totalEmprestimoItem)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {item.emprestimos.length > 0 && (
                              <div className="mt-3 rounded border border-yellow-500/20 bg-yellow-950/10 p-3">
                                <p className="text-xs font-semibold text-yellow-300 mb-2">
                                  Discriminação dos empréstimos
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
                                  className="bg-primary text-black hover:bg-yellow-300"
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
                                <SelectTrigger className="w-[220px] border-primary/30 bg-gray-800 text-white">
                                  <SelectValue placeholder="Escolher funcionário" />
                                </SelectTrigger>
                                <SelectContent className="border-primary/30 bg-gray-900">
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
                    className="bg-primary text-black hover:bg-yellow-300"
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
                  className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary text-xl">
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
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-white font-semibold break-words">{valor}</p>
              </div>
            );

            const classeCampo = (invalido: boolean) =>
              `bg-gray-900 text-white ${
                tentouSalvarFuncionarioDetalhe && invalido
                  ? "border-red-500 focus-visible:ring-red-500/30"
                  : "border-primary/30"
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
                      <select
                        className={`h-10 w-full rounded-md border px-3 py-2 text-sm ${classeCampo(
                          funcionarioEdicaoCamposInvalidos.funcao
                        )}`}
                        value={funcionarioEdicaoForm.funcao}
                        onChange={(e) =>
                          setFuncionarioEdicaoForm((prev) => ({
                            ...prev,
                            funcao: e.target.value as FuncaoFuncionarioId,
                            tipoMeta:
                              e.target.value === "consultor_vendas"
                                ? Number(
                                    funcionario.lojaId ?? funcionario.loja_id ?? lojaId
                                  ) === 5
                                  ? "meta2"
                                  : prev.tipoMeta
                                : "",
                          }))
                        }
                      >
                        {FUNCOES_FUNCIONARIO
                          .filter((item) => {
                            const lojaFuncionario = Number(
                              funcionario.lojaId ?? funcionario.loja_id ?? lojaId
                            );

                            if (lojaFuncionario !== 5) return true;

                            return [
                              "administrativo",
                              "consultor_vendas",
                              "supervisor",
                            ].includes(item.id);
                          })
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {Number(
                                funcionario.lojaId ?? funcionario.loja_id ?? lojaId
                              ) === 5 && item.id === "supervisor"
                                ? "Supervisora de Consultor de Vendas - PJ"
                                : Number(
                                    funcionario.lojaId ?? funcionario.loja_id ?? lojaId
                                  ) === 5 && item.id === "consultor_vendas"
                                ? "Consultor de Vendas - Meta 2"
                                : item.nome}
                            </option>
                          ))}
                      </select>
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
                <div className="rounded-md border border-primary/30 bg-gray-900 p-4">
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
                  className="bg-primary text-black hover:bg-yellow-300"
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
                  className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary">Reabrir competência</DialogTitle>
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
                className="mt-2 bg-gray-800 border-primary/30 text-white"
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
              className="bg-primary text-black hover:bg-yellow-300"
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
            <Button className="bg-primary text-black" onClick={() => setBloqueioAvisoOpen(false)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cellEditor.open}
        onOpenChange={(open) => setCellEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
  <DialogHeader>
    <DialogTitle className="text-primary">
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
  className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Premiação</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(
  premioAutomaticoAtual.detalhes.length > 0 ||
  linhaPremioAtual?.funcao === "consultor_vendas" ||
  linhaPremioAtual?.funcao === "supervisor"
) && (
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                <p className="mb-3 text-sm font-semibold text-primary">
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
  <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
    <p className="font-semibold text-primary">
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

    <div className="flex items-center justify-between border-t border-primary/20 pt-2">
      <span className="text-gray-300 font-semibold">Total</span>
      <span className="text-yellow-300 font-bold">
        R$ {money(total)}
      </span>
    </div>
  </div>
);
})()}

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
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
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
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

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">
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
                  className="bg-gray-800 border-primary/30 text-white"
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
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <Button
                className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">Vale</DialogTitle>
  {(linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoPor || "Sistema"}{" "}
  •{" "}
  {(linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoEm
    ? new Date(
        (linhaValeAtual?.vales?.[0] as any)?.ultimaAlteracaoEm
      ).toLocaleString("pt-BR")
    : "Sem alterações"}
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-primary/20 bg-gray-900 p-4 max-h-[300px] overflow-y-auto">
              <p className="mb-3 text-sm font-semibold text-primary">
                Vales do mês atual
              </p>

              {!linhaValeAtual?.vales || linhaValeAtual.vales.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum vale cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {linhaValeAtual.vales.map((vale) => (
                    <div
                      key={vale.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
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

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">Adicionar vale</p>

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
                  className="bg-gray-800 border-primary/30 text-white"
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
                  className="bg-gray-800 border-primary/30 text-white"
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
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <Button
                className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Observações</DialogTitle>
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
                className="bg-gray-800 border-primary/30 text-white"
                placeholder="Digite a observação"
              />
              <Button
                className="bg-primary text-black hover:bg-yellow-300"
                onClick={addObservacao}
              >
                Adicionar
              </Button>
            </div>

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
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
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Boleto negativo</DialogTitle>
            <DialogDescription className="text-gray-400">
              Deseja lançar esse valor como vale no próximo mês?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
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
              className="bg-primary text-black hover:bg-yellow-300"
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
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
  <DialogTitle className="text-primary">
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
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
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

              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
                <p className="font-semibold text-primary">
                  {detalheSemanaAtual.metaTitulo}
                </p>

                {detalheSemanaAtual.isSupervisor ? (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-3 font-semibold text-primary">
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

                      <div className="mt-3 border-t border-primary/20 pt-3 flex items-center justify-between">
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

                    <div className="border-t border-primary/20 pt-4">
                      <p className="mb-3 font-semibold text-primary">
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

                      <div className="mt-3 border-t border-primary/20 pt-3 flex items-center justify-between">
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
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3 text-sm">
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
                </div>

                <div className="flex items-center justify-between border-t border-primary/20 pt-3">
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