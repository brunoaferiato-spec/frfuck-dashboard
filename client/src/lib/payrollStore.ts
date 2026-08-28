import {
  calcularPercentualVendedorMecanico,
  calcularPercentualAlinhador,
  calcularConsultorMeta1Semana,
  calcularConsultorMeta2Mensal,
  getRegrasConsultor,
} from "./regrasComissao";

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
  const regras = getRegrasConsultor({
    lojaId: args.cidade,
  });

  if (!regras) {
    return "Sem regra cadastrada";
  }

  if (args.tipoMeta === "meta2") {
    return `R$ ${regras.meta2.valorPorBloco.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} / ${regras.meta2.carrosPorBloco} carros`;
  }

  const carros = Number(args.carrosSemana || 0);
  let valorPorCarro = 0;

  for (const faixa of regras.meta1.faixas) {
    if (carros >= faixa.minimoCarros) {
      valorPorCarro = faixa.valorPorCarro;
    } else {
      break;
    }
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

  if (args.tipoMeta === "meta2") {
    const calculado = calcularConsultorMeta2Mensal({
      lojaId: args.cidade,
      carros: Number(args.sem1 || 0),
    });

    return {
      detalhes: calculado.detalhesPremiacao,
      total: calculado.premiacao,
    };
  }

  const semanas = [
    Number(args.sem1 || 0),
    Number(args.sem2 || 0),
    Number(args.sem3 || 0),
    Number(args.sem4 || 0),
  ];

  semanas.forEach((carros, index) => {
    const calculado = calcularConsultorMeta1Semana({
      lojaId: args.cidade,
      carros,
      semana: (index + 1) as 1 | 2 | 3 | 4,
    });

    if (calculado.premiacao > 0 && calculado.descricaoPremiacao) {
      detalhes.push({
        descricao: calculado.descricaoPremiacao,
        valor: calculado.premiacao,
      });
    }
  });

  const total = detalhes.reduce(
    (acc, item) => acc + Number(item.valor || 0),
    0
  );

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
const totalLiquidez = 
  Number(args.sem1 || 0) +
  Number(args.sem2 || 0) +
  Number(args.sem3 || 0) +
  Number(args.sem4 || 0);

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
  if (!meta?.regra || valor <= 0) return 0;

  const regras = String(meta.regra)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("|")
    .map((regra) => regra.trim())
    .filter(Boolean);

  for (const regra of regras) {
    const percentualEncontrado = regra.match(
      /=\s*(\d+(?:[.,]\d+)?)\s*%/
    );

    const percentual = percentualEncontrado
      ? Number(percentualEncontrado[1].replace(",", "."))
      : 0;

    const texto = regra.replace(
      /=\s*\d+(?:[.,]\d+)?\s*%/,
      ""
    );

    const numeros = [
      ...texto.matchAll(/\d[\d.,]*/g),
    ].map((resultado) =>
      Number(
        resultado[0]
          .replace(/\./g, "")
          .replace(",", ".")
      )
    );

    if (texto.includes("ou mais")) {
      const minimo = numeros[0] || 0;

      if (valor >= minimo) return percentual;
      continue;
    }

    // Faixas: "33.000 A 39.999" ou "40.000 ATÉ 46.999"
    if (
      numeros.length >= 2 &&
      (texto.includes(" a ") || texto.includes(" ate "))
    ) {
      const minimo = numeros[0] || 0;
      const maximo = numeros[1] || 0;

      if (valor >= minimo && valor <= maximo) {
        return percentual;
      }

      continue;
    }

    // Apenas "ATÉ 32.999"
    if (texto.includes("ate") && numeros.length === 1) {
      const maximo = numeros[0] || 0;

      if (valor <= maximo) return percentual;
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

const detalhesGrupo = supervisor.detalhesGrupo || [];

return {
  perc1: 0,
  perc2: 0,
  perc3: 0,
  perc4: 0,

  com1: 0,
  com2: 0,
  com3: 0,
  com4: 0,

  totalLiquidez:
  Number(sem1 || 0) +
  Number(sem2 || 0) +
  Number(sem3 || 0) +
  Number(sem4 || 0),

  totalComissao: supervisor.totalComissao,

  premiacao: supervisor.premiacaoManual,

  detalhesGrupo,

  vale: supervisor.vale,

  boleto: supervisor.boleto,
};


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

if (funcao === "gerente" && String(cidade) === "4") {
  const liquidezVenda = Number(sem1 || 0);
  const liquidezLoja = Number(sem2 || 0);

  const metas = getMetas();

  const metaVenda = metas.find((m) =>
    String(m.cidade) === String(cidade) &&
    String(m.funcao).toLowerCase() === "vendedor" &&
    !m.funcionarioNome &&
    !m.funcionario
  );

  const metaGerente = meta;

  const percentualVenda = getPercentualFromRegra(metaVenda || null, liquidezVenda);
  const percentualLoja = getPercentualFromRegra(metaGerente || null, liquidezLoja);

  const comVenda = liquidezVenda * (percentualVenda / 100);
  const comLoja = liquidezLoja * (percentualLoja / 100);

  const totalComissao = comVenda + comLoja;

  const boleto =
    totalComissao +
    premiacaoManual -
    vale -
    aluguel -
    inss -
    adiant -
    holerite;

  return {
    perc1: percentualVenda,
    perc2: percentualLoja,
    perc3: 0,
    perc4: 0,

    com1: comVenda,
    com2: comLoja,
    com3: 0,
    com4: 0,

    totalLiquidez: liquidezVenda + liquidezLoja,
    totalComissao,

    premiacao: premiacaoManual,
    vale,
    boleto,
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
    // ==================================================
    // META 2 - MENSAL
    // R$ 50 a cada 12 carros + bônus acumulativos
    // ==================================================
    if (tipoMeta === "meta2") {
      const totalCarros = Number(sem1 || 0);

      const calculadoMeta2 = calcularConsultorMeta2Mensal({
        lojaId: cidade,
        carros: totalCarros,
      });

      const totalComissao = Number(calculadoMeta2.comissao || 0);
      const premiacaoAutomatica = Number(calculadoMeta2.premiacao || 0);
      const premiacao = premiacaoAutomatica + premiacaoManual;

      const boleto =
        totalComissao +
        premiacao -
        vale;

      return {
        perc1: 0,
        perc2: 0,
        perc3: 0,
        perc4: 0,

        com1: totalComissao,
        com2: 0,
        com3: 0,
        com4: 0,

        totalLiquidez: totalCarros,
        totalComissao,

        premiacao,
        vale,
        boleto,
      };
    }

    // ==================================================
    // META 1 - SEMANAL
    // Faixa por quantidade de carros em cada semana
    // + R$ 200 quando atingir 65 carros na semana
    // ==================================================
    const resultados = [
      calcularConsultorMeta1Semana({
        lojaId: cidade,
        carros: Number(sem1 || 0),
        semana: 1,
      }),
      calcularConsultorMeta1Semana({
        lojaId: cidade,
        carros: Number(sem2 || 0),
        semana: 2,
      }),
      calcularConsultorMeta1Semana({
        lojaId: cidade,
        carros: Number(sem3 || 0),
        semana: 3,
      }),
      calcularConsultorMeta1Semana({
        lojaId: cidade,
        carros: Number(sem4 || 0),
        semana: 4,
      }),
    ];

    const [r1, r2, r3, r4] = resultados;

    const com1 = Number(r1.comissao || 0);
    const com2 = Number(r2.comissao || 0);
    const com3 = Number(r3.comissao || 0);
    const com4 = Number(r4.comissao || 0);

    const totalComissao = com1 + com2 + com3 + com4;

    const premiacaoAutomatica = resultados.reduce(
      (acc, item) => acc + Number(item.premiacao || 0),
      0
    );

    const premiacao = premiacaoAutomatica + premiacaoManual;

    const totalCarros =
      Number(sem1 || 0) +
      Number(sem2 || 0) +
      Number(sem3 || 0) +
      Number(sem4 || 0);

    const boleto =
      totalComissao +
      premiacao -
      vale;

    return {
      perc1: Number(r1.valorPorCarro || 0),
      perc2: Number(r2.valorPorCarro || 0),
      perc3: Number(r3.valorPorCarro || 0),
      perc4: Number(r4.valorPorCarro || 0),

      com1,
      com2,
      com3,
      com4,

      totalLiquidez: totalCarros,
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

function calcularPercentual(
  valor: number,
  percentualManual?: number | null
) {
  // Vendedor e mecânico: regra oficial isolada por cidade.
  const percentualVendedorMecanico = calcularPercentualVendedorMecanico({
    lojaId: cidadeNormalizada,
    funcao: funcaoNormalizada,
    valor,
  });

  if (percentualVendedorMecanico !== null) {
    return percentualVendedorMecanico;
  }

  // Demais funções continuam respeitando percentual manual válido.
  // Isso preserva o comportamento já validado do alinhador.
  if (Number(percentualManual || 0) > 0) {
    return Number(percentualManual);
  }

  // Alinhador: regra oficial por cidade/funcionário.
  // Em Blumenau, Milton recebe a regra especial; os demais usam a padrão.
  if (funcaoNormalizada === "alinhador") {
    const percentualAlinhador = calcularPercentualAlinhador({
      lojaId: cidadeNormalizada,
      funcionarioNome,
      valor,
    });

    if (percentualAlinhador !== null) {
      return percentualAlinhador;
    }
  }

  // Fallback legado para funções que ainda não foram migradas.
  return getPercentualFromRegra(metaUsada, valor);
}

const p1 = calcularPercentual(Number(sem1 || 0), percManual1);
const p2 = calcularPercentual(Number(sem2 || 0), percManual2);
const p3 = calcularPercentual(Number(sem3 || 0), percManual3);
const p4 = calcularPercentual(Number(sem4 || 0), percManual4);
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