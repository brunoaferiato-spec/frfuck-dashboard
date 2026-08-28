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