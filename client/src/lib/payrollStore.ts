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
  return Number(String(text).replace(/\./g, "").replace(",", "."));
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
  liqJoinville: number;
  liqBlumenau: number;
  liqSaoJose: number;
  liqFlorianopolis: number;
  premiacoesManuais?: PremioManual[];
  vales?: ValeItem[];
  aluguel: number;
}) {
  const {
    liqJoinville,
    liqBlumenau,
    liqSaoJose,
    liqFlorianopolis,
    premiacoesManuais,
    vales,
    aluguel,
  } = args;

  let premioJoinville = 0;
  let premioBlumenau = 0;
  let premioSaoJose = 0;
  let premioFlorianopolis = 0;

  if (liqJoinville >= 560000) premioJoinville = 2000;
  else if (liqJoinville >= 520000) premioJoinville = 2000;
  else if (liqJoinville >= 480000) premioJoinville = 2000;
  else if (liqJoinville >= 440000) premioJoinville = 2000;
  else if (liqJoinville >= 400000) premioJoinville = 2000;
  else if (liqJoinville >= 360000) premioJoinville = 2000;
  else if (liqJoinville >= 300000) premioJoinville = 1000;

  if (liqBlumenau >= 560000) premioBlumenau = 3000;
  else if (liqBlumenau >= 520000) premioBlumenau = 3000;
  else if (liqBlumenau >= 480000) premioBlumenau = 3000;
  else if (liqBlumenau >= 440000) premioBlumenau = 3000;
  else if (liqBlumenau >= 400000) premioBlumenau = 3000;
  else if (liqBlumenau >= 360000) premioBlumenau = 2000;
  else if (liqBlumenau >= 300000) premioBlumenau = 1000;

  if (liqSaoJose >= 560000) premioSaoJose = 3000;
  else if (liqSaoJose >= 520000) premioSaoJose = 3000;
  else if (liqSaoJose >= 480000) premioSaoJose = 3000;
  else if (liqSaoJose >= 440000) premioSaoJose = 3000;
  else if (liqSaoJose >= 400000) premioSaoJose = 3000;
  else if (liqSaoJose >= 360000) premioSaoJose = 2000;
  else if (liqSaoJose >= 300000) premioSaoJose = 1000;

  if (liqFlorianopolis >= 560000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 520000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 480000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 440000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 400000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 360000) premioFlorianopolis = 1000;
  else if (liqFlorianopolis >= 300000) premioFlorianopolis = 1000;

  const totalLiquidez =
    liqJoinville + liqBlumenau + liqSaoJose + liqFlorianopolis;

  let premioGrupo = 0;
  if (totalLiquidez >= 1420000) premioGrupo += 1000;
  if (totalLiquidez >= 1540000) premioGrupo += 1000;
  if (totalLiquidez >= 1600000) premioGrupo += 1000;

  let premioRecorde = 0;
  if (totalLiquidez > SUPERVISOR_RECORDE_GRUPO) {
    premioRecorde = totalLiquidez * 0.001;
  }

  const premiacaoAutomatica =
    premioJoinville +
    premioBlumenau +
    premioSaoJose +
    premioFlorianopolis +
    premioGrupo +
    premioRecorde;

  const premiacaoManual = sumPremiacoesManuais(premiacoesManuais);
  const vale = sumVales(vales);

  const totalPremiacao = premiacaoAutomatica + premiacaoManual;

  const boleto =
    SUPERVISOR_SALARIO_FIXO +
    totalPremiacao -
    vale -
    aluguel;

  return {
    salarioFixo: SUPERVISOR_SALARIO_FIXO,
    premioJoinville,
    premioBlumenau,
    premioSaoJose,
    premioFlorianopolis,
    premioGrupo,
    premioRecorde,
    premiacaoAutomatica,
    premiacaoManual,
    totalPremiacao,
    totalLiquidez,
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

  const regra = String(meta.regra);
  const lines = regra
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of lines) {
    const nums = [...line.matchAll(/(\d[\d\.\,]*)/g)].map((m) =>
      parseMoneyText(m[1])
    );

    const percMatch = line.match(/(\d{1,2}(?:[\.,]\d+)?)%/);
    const perc = percMatch ? Number(percMatch[1].replace(",", ".")) : 0;

    const lower = line.toLowerCase();

    if (lower.includes("ou mais")) {
      if (valor >= (nums[0] || 0)) return perc;
    } else if (nums.length >= 2) {
      if (valor >= nums[0] && valor <= nums[1]) return perc;
    } else if (nums.length === 1) {
      if (valor <= nums[0]) return perc;
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
      liqJoinville: Number(sem1 || 0),
      liqBlumenau: Number(sem2 || 0),
      liqSaoJose: Number(sem3 || 0),
      liqFlorianopolis: Number(sem4 || 0),
      premiacoesManuais,
      vales,
      aluguel,
    });

    return {
      perc1: supervisor.premioJoinville,
      perc2: supervisor.premioBlumenau,
      perc3: supervisor.premioSaoJose,
      perc4: supervisor.premioFlorianopolis,
      com1: supervisor.premioJoinville,
      com2: supervisor.premioBlumenau,
      com3: supervisor.premioSaoJose,
      com4: supervisor.premioFlorianopolis,
      totalLiquidez: supervisor.totalLiquidez,
      totalComissao: supervisor.premiacaoAutomatica,
      premiacao: supervisor.totalPremiacao,
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

  const p1 = getPercentualFromRegra(meta, Number(sem1 || 0));
  const p2 = getPercentualFromRegra(meta, Number(sem2 || 0));
  const p3 = getPercentualFromRegra(meta, Number(sem3 || 0));
  const p4 = getPercentualFromRegra(meta, Number(sem4 || 0));

  const c1 = Number(sem1 || 0) * (p1 / 100);
  const c2 = Number(sem2 || 0) * (p2 / 100);
  const c3 = Number(sem3 || 0) * (p3 / 100);
  const c4 = Number(sem4 || 0) * (p4 / 100);

  const totalLiquidez =
    Number(sem1 || 0) +
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