import {
  regrasJoinville,
  regraAlinhadorJoinville,
  regrasConsultorJoinville,
  regrasRecepcaoJoinville,
} from "./joinville";

import {
  regrasBlumenau,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
  regrasConsultorBlumenau,
  regrasRecepcaoBlumenau,
} from "./blumenau";

import {
  regrasSaoJose,
  regraAlinhadorSaoJose,
  regrasConsultorSaoJose,
  regrasRecepcaoSaoJose,
  regraGerenteSaoJose,
} from "./saoJose";

import {
  regrasFlorianopolis,
  regraAlinhadorFlorianopolis,
  regrasConsultorFlorianopolis,
  regrasRecepcaoFlorianopolis,
  regraGerenteFlorianopolis,
} from "./florianopolis";

import type {
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,
  RegrasConsultor,
  RegrasRecepcao,
  RegraRecepcaoFuncionario,
  RegraGerente,
} from "./types";

// ======================================================
// MAPAS POR LOJA
// ======================================================

const REGRAS_POR_LOJA: Record<number, RegrasVendedorMecanico> = {
  1: regrasJoinville,
  2: regrasBlumenau,
  3: regrasSaoJose,
  4: regrasFlorianopolis,
};

const REGRAS_CONSULTOR_POR_LOJA: Record<number, RegrasConsultor> = {
  1: regrasConsultorJoinville,
  2: regrasConsultorBlumenau,
  3: regrasConsultorSaoJose,
  4: regrasConsultorFlorianopolis,
};

const REGRAS_RECEPCAO_POR_LOJA: Record<number, RegrasRecepcao> = {
  1: regrasRecepcaoJoinville,
  2: regrasRecepcaoBlumenau,
  3: regrasRecepcaoSaoJose,
  4: regrasRecepcaoFlorianopolis,
};

// ======================================================
// HELPERS
// ======================================================

function calcularPercentualPorFaixas(
  regra: RegraPercentual | RegraAlinhador | RegraGerente,
  valorBruto: number
): number {
  const valor = Number(valorBruto || 0);

  if (valor <= 0) {
    return 0;
  }

  let percentual = 0;

  for (const faixa of regra.faixas) {
    if (valor >= faixa.minimo) {
      percentual = faixa.percentual;
    } else {
      break;
    }
  }

  return percentual;
}

function normalizarNome(nome: string) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

// ======================================================
// VENDEDOR E MECÂNICO
// ======================================================

export function getRegraVendedorMecanico(args: {
  lojaId: number | string;
  funcao: string;
}): RegraPercentual | null {
  const lojaId = Number(args.lojaId);
  const funcao = String(args.funcao || "").trim().toLowerCase();

  const regrasLoja = REGRAS_POR_LOJA[lojaId];

  if (!regrasLoja) {
    return null;
  }

  if (funcao === "vendedor") {
    return regrasLoja.vendedor;
  }

  if (funcao === "mecanico") {
    return regrasLoja.mecanico;
  }

  return null;
}

export function calcularPercentualVendedorMecanico(args: {
  lojaId: number | string;
  funcao: string;
  valor: number;
}): number | null {
  const regra = getRegraVendedorMecanico({
    lojaId: args.lojaId,
    funcao: args.funcao,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(regra, args.valor);
}

// ======================================================
// ALINHADOR
// ======================================================

export function getRegraAlinhador(args: {
  lojaId: number | string;
  funcionarioNome?: string;
}): RegraAlinhador | null {
  const lojaId = Number(args.lojaId);
  const nome = normalizarNome(args.funcionarioNome || "");

  if (lojaId === 1) {
    return regraAlinhadorJoinville;
  }

  if (lojaId === 2) {
    if (nome.includes("MILTON")) {
      return regraAlinhadorMiltonBlumenau;
    }

    return regraAlinhadorPadraoBlumenau;
  }

  if (lojaId === 3) {
    return regraAlinhadorSaoJose;
  }

  if (lojaId === 4) {
    return regraAlinhadorFlorianopolis;
  }

  return null;
}

export function calcularPercentualAlinhador(args: {
  lojaId: number | string;
  funcionarioNome?: string;
  valor: number;
}): number | null {
  const regra = getRegraAlinhador({
    lojaId: args.lojaId,
    funcionarioNome: args.funcionarioNome,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(regra, args.valor);
}

// ======================================================
// CONSULTOR DE VENDAS
// ======================================================

export function getRegrasConsultor(args: {
  lojaId: number | string;
}): RegrasConsultor | null {
  const lojaId = Number(args.lojaId);

  return REGRAS_CONSULTOR_POR_LOJA[lojaId] || null;
}

// ======================================================
// CONSULTOR META 1 - SEMANAL
// ======================================================

export function calcularConsultorMeta1Semana(args: {
  lojaId: number | string;
  carros: number;
  semana: 1 | 2 | 3 | 4;
}) {
  const regras = getRegrasConsultor({
    lojaId: args.lojaId,
  });

  const carros = Number(args.carros || 0);

  if (!regras || carros <= 0) {
    return {
      carros,
      valorPorCarro: 0,
      comissao: 0,
      premiacao: 0,
      descricaoPremiacao: null as string | null,
    };
  }

  let valorPorCarro = 0;

  for (const faixa of regras.meta1.faixas) {
    if (carros >= faixa.minimoCarros) {
      valorPorCarro = faixa.valorPorCarro;
    } else {
      break;
    }
  }

  const comissao = carros * valorPorCarro;

  const bateuBonus =
    carros >= regras.meta1.carrosParaBonus;

  const premiacao = bateuBonus
    ? regras.meta1.valorBonus
    : 0;

  const descricaoPremiacao = bateuBonus
    ? `PREMIAÇÃO SEMANA ${args.semana}`
    : null;

  return {
    carros,
    valorPorCarro,
    comissao,
    premiacao,
    descricaoPremiacao,
  };
}

// ======================================================
// CONSULTOR META 2 - MENSAL
// ======================================================

export function calcularConsultorMeta2Mensal(args: {
  lojaId: number | string;
  carros: number;
}) {
  const regras = getRegrasConsultor({
    lojaId: args.lojaId,
  });

  const carros = Number(args.carros || 0);

  if (!regras || carros <= 0) {
    return {
      carros,
      blocosCompletos: 0,
      comissao: 0,
      premiacao: 0,
      detalhesPremiacao: [] as Array<{
        descricao: string;
        valor: number;
      }>,
    };
  }

  const blocosCompletos = Math.floor(
    carros / regras.meta2.carrosPorBloco
  );

  const comissao =
    blocosCompletos * regras.meta2.valorPorBloco;

  const detalhesPremiacao = regras.meta2.bonusAcumulativos
    .filter((bonus) => carros >= bonus.carros)
    .map((bonus) => ({
      descricao: `META ${bonus.carros} CARROS`,
      valor: bonus.valor,
    }));

  const premiacao = detalhesPremiacao.reduce(
    (total, item) => total + Number(item.valor || 0),
    0
  );

  return {
    carros,
    blocosCompletos,
    comissao,
    premiacao,
    detalhesPremiacao,
  };
}

// ======================================================
// RECEPÇÃO
// ======================================================

export function getRegraRecepcao(args: {
  lojaId: number | string;
  funcionarioNome?: string;
}): RegraRecepcaoFuncionario | null {
  const lojaId = Number(args.lojaId);
  const nomeFuncionario = normalizarNome(
    args.funcionarioNome || ""
  );

  const regrasLoja =
    REGRAS_RECEPCAO_POR_LOJA[lojaId];

  if (!regrasLoja) {
    return null;
  }

  const regraEspecifica =
    regrasLoja.regrasEspecificas?.find((regra) => {
      const nomeRegra = normalizarNome(
        regra.funcionarioNome || ""
      );

      if (!nomeRegra || !nomeFuncionario) {
        return false;
      }

      return (
        nomeFuncionario === nomeRegra ||
        nomeFuncionario.includes(nomeRegra) ||
        nomeRegra.includes(nomeFuncionario)
      );
    });

  if (regraEspecifica) {
    return regraEspecifica;
  }

  if (regrasLoja.regraPadrao) {
    return regrasLoja.regraPadrao;
  }

  return null;
}

export function calcularRecepcao(args: {
  lojaId: number | string;
  funcionarioNome?: string;
  vendas: number;
  entradas: number;
}) {
  const regra = getRegraRecepcao({
    lojaId: args.lojaId,
    funcionarioNome: args.funcionarioNome,
  });

  const vendas = Number(args.vendas || 0);
  const entradas = Number(args.entradas || 0);

  if (!regra) {
    return {
      valorVenda: 0,
      valorEntrada: 0,
      comissaoVenda: 0,
      comissaoEntrada: 0,
      totalComissao: 0,
    };
  }

  const comissaoVenda =
    vendas * Number(regra.valorVenda || 0);

  const comissaoEntrada =
    entradas * Number(regra.valorEntrada || 0);

  return {
    valorVenda: Number(regra.valorVenda || 0),
    valorEntrada: Number(regra.valorEntrada || 0),
    comissaoVenda,
    comissaoEntrada,
    totalComissao:
      comissaoVenda + comissaoEntrada,
  };
}

// ======================================================
// GERENTE
// ======================================================

export function getRegraGerente(args: {
  lojaId: number | string;
}): RegraGerente | null {
  const lojaId = Number(args.lojaId);

  if (lojaId === 3) {
    return regraGerenteSaoJose;
  }

  if (lojaId === 4) {
    return regraGerenteFlorianopolis;
  }

  return null;
}

export function calcularPercentualGerente(args: {
  lojaId: number | string;
  liquidezLoja: number;
}): number | null {
  const regra = getRegraGerente({
    lojaId: args.lojaId,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(
    regra,
    Number(args.liquidezLoja || 0)
  );
}

// ======================================================
// EXPORTS
// ======================================================

export {
  regrasJoinville,
  regrasBlumenau,
  regrasSaoJose,
  regrasFlorianopolis,

  regraAlinhadorJoinville,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
  regraAlinhadorSaoJose,
  regraAlinhadorFlorianopolis,

  regrasConsultorJoinville,
  regrasConsultorBlumenau,
  regrasConsultorSaoJose,
  regrasConsultorFlorianopolis,

  regrasRecepcaoJoinville,
  regrasRecepcaoBlumenau,
  regrasRecepcaoSaoJose,
  regrasRecepcaoFlorianopolis,

  regraGerenteSaoJose,
  regraGerenteFlorianopolis,
};

export type {
  PeriodicidadeComissao,
  FaixaPercentual,
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,

  FaixaConsultorMeta1,
  RegraConsultorMeta1,
  BonusConsultorMeta2,
  RegraConsultorMeta2,
  RegrasConsultor,

  RegraRecepcaoFuncionario,
  RegrasRecepcao,

  RegraGerente,
} from "./types";