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