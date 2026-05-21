// =========================
// TIPOS BÁSICOS
// =========================

export type TipoMeta = "meta1" | "meta2" | "";

export type Funcionario = {
  id: number;
  nome: string;
  cpf: string;
  pix?: string;
  dataNascimento: string;
  funcao: string;
  loja_id: number;
  dataAdmissao: string;
  dataExperiencia45?: string;
  dataExperiencia90?: string;
  status: "ativo" | "inativo" | "experiencia";
  tipoMeta?: TipoMeta;
  dataDemissao?: string;
  debitoPendente?: number;
  dataFeedbackProxima?: string;
  dataFeriasInicio?: string;
  dataFeriasFim?: string;
  dataFerias2Inicio?: string;
  dataFerias2Fim?: string;
};

export type Meta = {
  id?: string | number;
  cidade: string | number;
  funcao: string;
  tipoMeta?: TipoMeta | "padrao";
  funcionarioNome?: string;
  funcionario?: string;
  regra: string;
};

// =========================
// TIPOS DA FOLHA
// =========================

export type PremioManual = {
  id: string;
  descricao: string;
  valor: number;
};

export type ValeItem = {
  id: string;
  grupoId: string;
  descricao: string;
  valor: number;
  parcelaAtual: number;
  totalParcelas: number;
  anoOrigem: number;
  mesOrigem: number;
};

export type FolhaMensal = {
  id: string;
  ano: number;
  mes: number;
  loja_id: number;
  funcionarioId: number;
  nome: string;
  funcao: string;
  tipoMeta?: TipoMeta;
  regraMeta: string;

  sem1: number;
  perc1: number;
  com1: number;

  sem2: number;
  perc2: number;
  com2: number;

  sem3: number;
  perc3: number;
  com3: number;

  sem4: number;
  perc4: number;
  com4: number;
  percManual1?: number | null;
  percManual2?: number | null;
  percManual3?: number | null;
  percManual4?: number | null;

  motivoPercManual1?: string | null;
  motivoPercManual2?: string | null;
  motivoPercManual3?: string | null;
  motivoPercManual4?: string | null;

  totalLiquidez: number;
  totalComissao: number;

  premiacoesManuais: PremioManual[];
  premiacao: number;

  vales: ValeItem[];
  vale: number;

  aluguel: number;
  inss: number;
  adiant: number;
  holerite: number;

  observacoes: string[];

  boleto: number;
};

// =========================
// CONSTANTES
// =========================

export const SUPERVISOR_SALARIO_FIXO = 6000;
export const SUPERVISOR_RECORDE_GRUPO = 1780000;

// =========================
// KEYS
// =========================

const KEY_FUNCIONARIOS = "funcionarios";
const KEY_METAS = "metas";
const KEY_FOLHAS_MENSAIS = "folhas_mensais_v1";

// =========================
// STORAGE
// =========================

export function getFuncionarios(): Funcionario[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_FUNCIONARIOS) || "[]");
  } catch {
    return [];
  }
}

export function saveFuncionarios(funcionarios: Funcionario[]) {
  localStorage.setItem(KEY_FUNCIONARIOS, JSON.stringify(funcionarios));
}

export function getMetas(): Meta[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_METAS) || "[]");
  } catch {
    return [];
  }
}

export function saveMetas(metas: Meta[]) {
  localStorage.setItem(KEY_METAS, JSON.stringify(metas));
}

export function getFolhasMensais(): FolhaMensal[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_FOLHAS_MENSAIS) || "[]");
  } catch {
    return [];
  }
}

export function saveFolhasMensais(folhas: FolhaMensal[]) {
  localStorage.setItem(KEY_FOLHAS_MENSAIS, JSON.stringify(folhas));
}

// =========================
// HELPERS
// =========================

function sumPremiacoesManuais(items?: PremioManual[]) {
  return (items || []).reduce((acc, item) => acc + Number(item.valor || 0), 0);
}

function sumVales(items?: ValeItem[]) {
  return (items || []).reduce((acc, item) => acc + Number(item.valor || 0), 0);
}

function normalizeName(text: string) {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function parseMoneyText(text: string) {
  const cleaned = String(text)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(cleaned);
}

// =========================
// META ESPECÍFICA > PADRÃO
// =========================

export function findMetaForFuncionario(args: {
  funcionarioNome: string;
  funcao: string;
  cidade: string;
  tipoMeta?: string;
}) {
  const metas = getMetas();
  const nomeNormalizado = (args.funcionarioNome || "").trim().toLowerCase();

  const metaEspecifica = metas.find((m) => {
    const nomeMeta = (m.funcionarioNome || m.funcionario || "")
      .trim()
      .toLowerCase();

    return (
      nomeMeta &&
      nomeMeta === nomeNormalizado &&
      String(m.cidade) === String(args.cidade) &&
      String(m.funcao) === String(args.funcao) &&
      (args.funcao !== "consultor_vendas" ||
        !m.tipoMeta ||
        m.tipoMeta === args.tipoMeta)
    );
  });

  if (metaEspecifica) return metaEspecifica;

  const metaPadrao = metas.find((m) => {
    const semFuncionario = !m.funcionarioNome && !m.funcionario;

    return (
      semFuncionario &&
      String(m.cidade) === String(args.cidade) &&
      String(m.funcao) === String(args.funcao) &&
      (args.funcao !== "consultor_vendas" ||
        !m.tipoMeta ||
        m.tipoMeta === args.tipoMeta ||
        m.tipoMeta === "padrao")
    );
  });

  return metaPadrao || null;
}

// =========================
// CONSULTOR
// =========================

export function getConsultorRegraTexto(args: {
  cidade: string;
  tipoMeta?: string;
  carrosSemana: number;
}) {
  const carros = Number(args.carrosSemana || 0);

  if (args.tipoMeta === "meta2") {
    return "R$ 100,00 / 25 carros";
  }

  let valorPorCarro = 0;

  if (["1", "3", "4"].includes(String(args.cidade))) {
    if (carros <= 49) valorPorCarro = 8;
    else if (carros <= 54) valorPorCarro = 9;
    else valorPorCarro = 10;
  } else if (String(args.cidade) === "2") {
    if (carros <= 74) valorPorCarro = 8;
    else if (carros <= 82) valorPorCarro = 9;
    else valorPorCarro = 10;
  }

  return `R$ ${valorPorCarro.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} / carro`;
}

export function getPremiacaoAutomaticaDetalhes(args: {
  funcao: string;
  cidade: string;
  tipoMeta?: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
}) {
  const detalhes: { descricao: string; valor: number }[] = [];

  if (args.funcao !== "consultor_vendas") {
    return { detalhes, total: 0 };
  }

  const semanas = [args.sem1, args.sem2, args.sem3, args.sem4];

  semanas.forEach((valor, index) => {
    const carros = Number(valor || 0);
    const semanaLabel = `Semana ${index + 1}`;

    if (args.tipoMeta === "meta2") {
      const blocos = Math.floor(carros / 25);
      if (blocos > 0) {
        detalhes.push({
          descricao: `${semanaLabel} - blocos de 25`,
          valor: blocos * 100,
        });
      }

      if (["1", "3", "4"].includes(String(args.cidade))) {
        if (carros >= 350) detalhes.push({ descricao: `${semanaLabel} - bônus 350`, valor: 350 });
        else if (carros >= 300) detalhes.push({ descricao: `${semanaLabel} - bônus 300`, valor: 300 });
        else if (carros >= 250) detalhes.push({ descricao: `${semanaLabel} - bônus 250`, valor: 250 });
        else if (carros >= 200) detalhes.push({ descricao: `${semanaLabel} - bônus 200`, valor: 200 });
      }

      if (String(args.cidade) === "2") {
        if (carros >= 450) detalhes.push({ descricao: `${semanaLabel} - bônus 450`, valor: 450 });
        else if (carros >= 400) detalhes.push({ descricao: `${semanaLabel} - bônus 400`, valor: 400 });
        else if (carros >= 350) detalhes.push({ descricao: `${semanaLabel} - bônus 350`, valor: 350 });
        else if (carros >= 300) detalhes.push({ descricao: `${semanaLabel} - bônus 300`, valor: 300 });
      }
    } else {
      if (["1", "3", "4"].includes(String(args.cidade))) {
        if (carros >= 65) detalhes.push({ descricao: semanaLabel, valor: 200 });
      }

      if (String(args.cidade) === "2") {
        if (carros >= 100) detalhes.push({ descricao: semanaLabel, valor: 200 });
      }
    }
  });

  const total = detalhes.reduce((acc, item) => acc + item.valor, 0);
  return { detalhes, total };
}

// =========================
// RECEPÇÃO
// =========================

export function getRecepcaoConfig(funcionarioNome: string, cidade: string) {
  const nome = normalizeName(funcionarioNome);

  if (cidade === "1" || cidade === "2") {
    return {
      valorVenda: 1.5,
      valorEntrada: 0,
    };
  }

  if (cidade === "3") {
    return {
      valorVenda: 5,
      valorEntrada: 0.5,
    };
  }

  if (cidade === "4") {
    if (nome.includes("IZABELA")) {
      return {
        valorVenda: 2,
        valorEntrada: 0.5,
      };
    }

    return {
      valorVenda: 3,
      valorEntrada: 0.5,
    };
  }

  return {
    valorVenda: 0,
    valorEntrada: 0,
  };
}

// =========================
// SUPERVISOR
// =========================

export function computeSupervisor(args: {
  cidade: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
  premiacoesManuais?: PremioManual[];
  vales?: ValeItem[];
  aluguel: number;
  adiant: number;
}) {
const totalLiquidez = Number(args.sem1 || 0);

  let premiacaoAutomatica = 0;

const regrasPorCidade: Record<string, Array<{ meta: number; premio: number }>> = {
  "1": [
    { meta: 300000, premio: 1000 },
    { meta: 360000, premio: 2000 },
    { meta: 400000, premio: 2000 },
    { meta: 440000, premio: 2000 },
    { meta: 480000, premio: 2000 },
    { meta: 520000, premio: 2000 },
    { meta: 560000, premio: 2000 },
  ],
  "2": [
    { meta: 300000, premio: 1000 },
    { meta: 360000, premio: 2000 },
    { meta: 400000, premio: 3000 },
    { meta: 440000, premio: 3000 },
    { meta: 480000, premio: 3000 },
    { meta: 520000, premio: 3000 },
    { meta: 560000, premio: 3000 },
  ],
  "3": [
    { meta: 300000, premio: 1000 },
    { meta: 360000, premio: 2000 },
    { meta: 400000, premio: 3000 },
    { meta: 440000, premio: 3000 },
    { meta: 480000, premio: 3000 },
    { meta: 520000, premio: 3000 },
    { meta: 560000, premio: 3000 },
  ],
  "4": [
    { meta: 300000, premio: 1000 },
    { meta: 360000, premio: 1000 },
    { meta: 400000, premio: 1000 },
    { meta: 440000, premio: 1000 },
    { meta: 480000, premio: 1000 },
    { meta: 520000, premio: 1000 },
    { meta: 560000, premio: 1000 },
  ],
};

const regras = regrasPorCidade[String(args.cidade)] || [];

for (const regra of regras) {
  if (totalLiquidez >= regra.meta) {
    premiacaoAutomatica += regra.premio;
  }
}

const premioGrupo =
  totalLiquidez >= 1600000
    ? 3000
    : totalLiquidez >= 1540000
    ? 2000
    : totalLiquidez >= 1420000
    ? 1000
    : 0;

const premioRecordeGrupo =
  totalLiquidez > SUPERVISOR_RECORDE_GRUPO
    ? totalLiquidez * 0.001
    : 0;

const premiacaoGrupo = (premioGrupo + premioRecordeGrupo) / 4;

  const salarioFixo = 1500;
  const premiacaoManual = sumPremiacoesManuais(args.premiacoesManuais);
  const vale = sumVales(args.vales);

  const totalPremiacao = premiacaoManual + premiacaoGrupo;
  
  const totalComissao = premiacaoAutomatica;

const total = salarioFixo + totalComissao;

const boleto =
  total +
  totalPremiacao -
  vale -
  args.aluguel -
  args.adiant;

  const detalhesGrupo = [];

if (totalLiquidez >= 1420000) {
  detalhesGrupo.push({
    descricao: "Meta Grupo R$ 1.420.000,00",
    valor: 250,
  });
}

if (totalLiquidez >= 1540000) {
  detalhesGrupo.push({
    descricao: "Meta Grupo R$ 1.540.000,00",
    valor: 250,
  });
}

if (totalLiquidez >= 1600000) {
  detalhesGrupo.push({
    descricao: "Meta Grupo R$ 1.600.000,00",
    valor: 250,
  });
}

if (premioRecordeGrupo > 0) {
  detalhesGrupo.push({
    descricao: "Recorde Grupo",
    valor: premioRecordeGrupo / 4,
  });
}

  return {
  salarioFixo,
  totalComissao,
  premiacaoAutomatica,
  premiacaoManual: totalPremiacao,
  detalhesGrupo,
  total,
  vale,
  boleto,
};
 }

// =========================
// VALE PARCELADO
// =========================

export function createParcelasVale(args: {
  descricao: string;
  valorTotal: number;
  parcelas: number;
  ano: number;
  mes: number;
}) {
  const grupoId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const totalParcelas = Math.max(1, Number(args.parcelas || 1));
  const valorBase = Number((args.valorTotal / totalParcelas).toFixed(2));
  const parcelasCriadas: Array<{ ano: number; mes: number; item: ValeItem }> = [];

  let soma = 0;

  for (let i = 0; i < totalParcelas; i++) {
    const data = new Date(args.ano, args.mes - 1 + i, 1);
    let valorParcela = valorBase;

    if (i === totalParcelas - 1) {
      valorParcela = Number((args.valorTotal - soma).toFixed(2));
    }

    soma += valorParcela;

    parcelasCriadas.push({
      ano: data.getFullYear(),
      mes: data.getMonth() + 1,
      item: {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}-${i}`,
        grupoId,
        descricao: args.descricao,
        valor: valorParcela,
        parcelaAtual: i + 1,
        totalParcelas,
        anoOrigem: args.ano,
        mesOrigem: args.mes,
      },
    });
  }

  return parcelasCriadas;
}

export function shouldRemoveValeFromHereForward(args: {
  vale: ValeItem;
  currentAno: number;
  currentMes: number;
  lineAno: number;
  lineMes: number;
}) {
  const atual = new Date(args.currentAno, args.currentMes - 1, 1).getTime();
  const linha = new Date(args.lineAno, args.lineMes - 1, 1).getTime();
  return linha >= atual;
}

// =========================
// PARSER META %
// =========================

function getPercentualFromRegra(meta: Meta | null, valor: number) {
  if (!meta || !meta.regra) return 0;
  if (valor <= 0) return 0;

  const regras = String(meta.regra)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("|")
    .map((r) => r.trim())
    .filter(Boolean);

  for (const regra of regras) {
    const percMatch = regra.match(/=\s*(\d+(?:[.,]\d+)?)\s*%/);
    const percentual = percMatch ? Number(percMatch[1].replace(",", ".")) : 0;

    const textoSemPercentual = regra.replace(/=\s*\d+(?:[.,]\d+)?\s*%/, "");

    const numeros = [...textoSemPercentual.matchAll(/\d[\d.,]*/g)].map((m) =>
      Number(m[0].replace(/\./g, "").replace(",", "."))
    );

    if (textoSemPercentual.includes("ou mais")) {
      const minimo = numeros[0] || 0;
      if (valor >= minimo) return percentual;
      continue;
    }

    if (textoSemPercentual.includes("ate")) {
      const maximo = numeros[0] || 0;
      if (valor <= maximo) return percentual;
      continue;
    }

    if (textoSemPercentual.includes(" a ") && numeros.length >= 2) {
      const minimo = numeros[0] || 0;
      const maximo = numeros[1] || 0;
      if (valor >= minimo && valor <= maximo) return percentual;
      continue;
    }
  }

  return 0;
}
// =========================
// CÁLCULO PRINCIPAL
// =========================

export function computeFolhaLinha(args: {
  meta: Meta | null;
  funcao: string;
  cidade: string;
  funcionarioNome?: string;
  tipoMeta?: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;

  percManual1?: number | null;
  percManual2?: number | null;
  percManual3?: number | null;
  percManual4?: number | null;

  premiacoesManuais?: PremioManual[];
  vales?: ValeItem[];
  aluguel: number;
  inss: number;
  adiant: number;
  holerite: number;
}) {

  const {
  meta,
  funcao,
  cidade,
  funcionarioNome,
  tipoMeta,
  sem1,
  sem2,
  sem3,
  sem4,
  percManual1,
  percManual2,
  percManual3,
  percManual4,
  premiacoesManuais,
  vales,
  aluguel,
  inss,
  adiant,
  holerite,
} = args;

  const premiacaoManual = sumPremiacoesManuais(premiacoesManuais);
  const vale = sumVales(vales);

  if (funcao === "supervisor") {
  const supervisor = computeSupervisor({
    cidade,
    sem1,
    sem2,
    sem3,
    sem4,
    premiacoesManuais,
    vales,
    aluguel,
    adiant,
  });

  return {
  perc1: 0,
  perc2: 0,
  perc3: 0,
  perc4: 0,

  com1: 0,
  com2: 0,
  com3: 0,
  com4: 0,

  totalLiquidez: Number(sem1 || 0),

totalComissao: supervisor.totalComissao,

premiacao: supervisor.premiacaoManual,

vale: supervisor.vale,

boleto: supervisor.boleto,
};
}

  if (funcao === "recepcionista") {
    const config = getRecepcaoConfig(funcionarioNome || "", cidade);

    const vendas = Number(sem1 || 0);
    const entradas = Number(sem2 || 0);

    const com1 = vendas * config.valorVenda;
    const com2 = entradas * config.valorEntrada;
    const totalComissao = com1 + com2;

    const boleto =
      totalComissao +
      premiacaoManual -
      vale -
      aluguel -
      inss -
      adiant -
      holerite;

    return {
      perc1: config.valorVenda,
      perc2: config.valorEntrada,
      perc3: 0,
      perc4: 0,

      com1,
      com2,
      com3: 0,
      com4: 0,

      totalLiquidez: 0,
      totalComissao,

      premiacao: premiacaoManual,
      vale,

      boleto,
    };
  }

  if (funcao === "consultor_vendas") {
    const semanas = [
      Number(sem1 || 0),
      Number(sem2 || 0),
      Number(sem3 || 0),
      Number(sem4 || 0),
    ];

    const calcularComissaoSemana = (carros: number) => {
      if (tipoMeta === "meta2") {
        const blocos = Math.floor(carros / 25);
        return blocos * 100;
      }

      if (["1", "3", "4"].includes(String(cidade))) {
        if (carros <= 49) return carros * 8;
        if (carros <= 54) return carros * 9;
        return carros * 10;
      }

      if (String(cidade) === "2") {
        if (carros <= 74) return carros * 8;
        if (carros <= 82) return carros * 9;
        return carros * 10;
      }

      return 0;
    };

    const com1 = calcularComissaoSemana(semanas[0]);
    const com2 = calcularComissaoSemana(semanas[1]);
    const com3 = calcularComissaoSemana(semanas[2]);
    const com4 = calcularComissaoSemana(semanas[3]);

    const totalComissao = com1 + com2 + com3 + com4;
    const premiacaoAutomatica = getPremiacaoAutomaticaDetalhes({
      funcao,
      cidade,
      tipoMeta,
      sem1,
      sem2,
      sem3,
      sem4,
    }).total;

    const premiacao = premiacaoAutomatica + premiacaoManual;
    const totalLiquidez = semanas.reduce((acc, item) => acc + item, 0);

    const boleto =
      totalComissao +
      premiacao -
      vale -
      aluguel -
      inss -
      adiant -
      holerite;

    return {
      perc1: 0,
      perc2: 0,
      perc3: 0,
      perc4: 0,
      com1,
      com2,
      com3,
      com4,
      totalLiquidez,
      totalComissao,
      premiacao,
      vale,
      boleto,
    };
  }

const funcaoNormalizada = String(funcao || "").trim().toLowerCase();
const cidadeNormalizada = String(cidade || "").trim();

const metaUsada =
  meta ||
  (funcaoNormalizada === "mecanico"
    ? {
        cidade,
        funcao,
        tipoMeta: "padrao",
        regra:
          "ATÉ 7.999,99 = 10% | 8.000 A 9.999,99 = 12% | 10.000 A 19.999,99 = 15% | 20.000 OU MAIS = 17%",
      }
    : null) ||
  (["1", "2"].includes(String(cidade)) && funcaoNormalizada === "vendedor"
    ? {
        cidade,
        funcao,
        tipoMeta: "padrao",
        regra:
          "ATÉ 32.999 = 5% | 33.000 A 39.999 = 6% | 40.000 ATÉ 46.999 = 7% | 47.000 OU MAIS = 8%",
      }
    : null);

  const p1 =
  percManual1 !== null && percManual1 !== undefined
    ? Number(percManual1)
    : getPercentualFromRegra(metaUsada, Number(sem1 || 0));

const p2 =
  percManual2 !== null && percManual2 !== undefined
    ? Number(percManual2)
    : getPercentualFromRegra(metaUsada, Number(sem2 || 0));

const p3 =
  percManual3 !== null && percManual3 !== undefined
    ? Number(percManual3)
    : getPercentualFromRegra(metaUsada, Number(sem3 || 0));

const p4 =
  percManual4 !== null && percManual4 !== undefined
    ? Number(percManual4)
    : getPercentualFromRegra(metaUsada, Number(sem4 || 0));

  const c1 = Number(sem1 || 0) * (p1 / 100);
  const c2 = Number(sem2 || 0) * (p2 / 100);
  const c3 = Number(sem3 || 0) * (p3 / 100);
  const c4 = Number(sem4 || 0) * (p4 / 100);

  const totalLiquidez =
  funcaoNormalizada === "alinhador" ||
  funcaoNormalizada === "aux_alinhador" ||
  funcaoNormalizada === "supervisor"
    ? Number(sem1 || 0)
    : Number(sem1 || 0) +
      Number(sem2 || 0) +
      Number(sem3 || 0) +
      Number(sem4 || 0);

  const totalComissao = c1 + c2 + c3 + c4;

  const boleto =
    totalComissao +
    premiacaoManual -
    vale -
    aluguel -
    inss -
    adiant -
    holerite;

  return {
    perc1: p1,
    perc2: p2,
    perc3: p3,
    perc4: p4,
    com1: c1,
    com2: c2,
    com3: c3,
    com4: c4,
    totalLiquidez,
    totalComissao,
    premiacao: premiacaoManual,
    vale,
    boleto,
  };
}