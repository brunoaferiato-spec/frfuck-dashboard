export type PeriodicidadeComissao = "semanal" | "mensal";

export type FaixaPercentual = {
  minimo: number;
  percentual: number;
};

export type RegraPercentual = {
  periodicidade: PeriodicidadeComissao;
  faixas: FaixaPercentual[];
};

export type RegrasVendedorMecanico = {
  vendedor: RegraPercentual;
  mecanico: RegraPercentual;
};

export type RegraAlinhador = {
  periodicidade: "mensal";
  faixas: FaixaPercentual[];
  funcionarioEspecifico?: string;
};

// =========================
// CONSULTOR DE VENDAS
// =========================

export type FaixaConsultorMeta1 = {
  minimoCarros: number;
  valorPorCarro: number;
};

export type RegraConsultorMeta1 = {
  periodicidade: "semanal";
  faixas: FaixaConsultorMeta1[];
  carrosParaBonus: number;
  valorBonus: number;
};

export type BonusConsultorMeta2 = {
  carros: number;
  valor: number;
};

export type RegraConsultorMeta2 = {
  periodicidade: "mensal";
  carrosPorBloco: number;
  valorPorBloco: number;
  bonusAcumulativos: BonusConsultorMeta2[];
};

export type RegrasConsultor = {
  meta1: RegraConsultorMeta1;
  meta2: RegraConsultorMeta2;
};

// =========================
// RECEPÇÃO
// =========================

export type RegraRecepcaoFuncionario = {
  funcionarioNome?: string;
  valorVenda: number;
  valorEntrada: number;
};

export type RegrasRecepcao = {
  regraPadrao?: RegraRecepcaoFuncionario;
  regrasEspecificas?: RegraRecepcaoFuncionario[];
};

// =========================
// GERENTE
// =========================

export type RegraGerente = {
  periodicidade: "mensal";
  faixas: FaixaPercentual[];
};

// =========================
// SUPERVISOR
// =========================

export type MetaPremiacaoSupervisor = {
  meta: number;
  premio: number;
};

export type RegrasSupervisorPorLoja = {
  lojaId: number;
  nomeLoja: string;
  metas: MetaPremiacaoSupervisor[];
};

export type MetaGrupoSupervisor = {
  meta: number;
  premioTotalGrupo: number;
};

export type RegraSupervisor = {
  salarioFixo: number;

  lojas: RegrasSupervisorPorLoja[];

  metasGrupo: MetaGrupoSupervisor[];

  divisorPremiacaoGrupo: number;

  recordeGrupoAtual: number;

  percentualPremioRecorde: number;
};

// =========================
// PREMIAÇÕES ESPECIAIS
// =========================

export type RegraPremiacaoMecanicos = {
  valorPorMecanico: number;
  metaLiquidezMecanico: number;
  excluirProprioFuncionario?: boolean;
};

export type RegraPremiacaoAlinhador = {
  valorPremio: number;
  metaLiquidezAlinhador: number;
  funcionarioAlinhador?: string;
};

export type RegraPremiacaoEspecialFuncionario = {
  lojaId: number;
  funcionarioNome: string;

  funcaoBase: "vendedor" | "mecanico";

  premioFixo: number;

  premiacaoMecanicos?: RegraPremiacaoMecanicos;

  premiacaoAlinhador?: RegraPremiacaoAlinhador;
};