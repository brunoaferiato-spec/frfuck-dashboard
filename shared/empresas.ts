// Dados cadastrais de cada loja (razão social, CNPJ etc.), usados no termo de garantia
// e nos documentos de garantia dos fornecedores. Chave = id da loja no sistema.
export type Empresa = {
  lojaId: number;
  loja: string;
  razaoSocial: string;
  cnpj: string;
  ie: string;
  logradouro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string;
};

export const EMPRESAS: Empresa[] = [
  { lojaId: 1, loja: "Joinville", razaoSocial: "F. R. FUCK JOINVILLE - COMERCIO DE PECAS E PNEUS", cnpj: "42.273.159/0001-20", ie: "261125303", logradouro: "CORONEL PROCOPIO GOMES, 1008", cep: "89202300", cidade: "JOINVILLE", uf: "SC", telefone: "4788518608" },
  { lojaId: 2, loja: "Blumenau", razaoSocial: "F. R. FUCK BLUMENAU - COMERCIO DE PECAS E PNEUS LTDA", cnpj: "46.535.078/0001-01", ie: "261715380", logradouro: "RUA DOUTOR PEDRO ZIMMERMANN, 2788", cep: "89066002", cidade: "BLUMENAU", uf: "SC", telefone: "08001007575" },
  { lojaId: 3, loja: "São José", razaoSocial: "F. R. FUCK SAO JOSE - COMERCIO DE PECAS E PNEUS LTDA", cnpj: "55.270.038/0001-76", ie: "262952645", logradouro: "AV LEOBERTO LEAL COMERCIAL, 975", cep: "88110001", cidade: "SAO JOSE", uf: "SC", telefone: "08001007575" },
  { lojaId: 4, loja: "Florianópolis", razaoSocial: "F. R. FUCK FLORIANOPOLIS - COMERCIO DE PECAS E PNEUS LTDA", cnpj: "55.269.939/0001-48", ie: "262952629", logradouro: "JOSE CARLOS DAUX, 4529", cep: "88032005", cidade: "FLORIANOPOLIS", uf: "SC", telefone: "08001007575" },
  { lojaId: 6, loja: "São Leopoldo", razaoSocial: "F.R. FUCK SÃO LEOPOLDO - COMERCIO DE PECAS E PNEUS LTDA", cnpj: "68.247.965/0001-17", ie: "1240364099", logradouro: "AV IMPERATRIZ LEOPOLDINA, 1620", cep: "93042032", cidade: "SAO LEOPOLDO", uf: "RS", telefone: "08001007575" },
  { lojaId: 7, loja: "Gravataí", razaoSocial: "F.R FUCK GRAVATAI COMERCIO DE PECAS E PNEUS LTDA", cnpj: "68.964.305/0001-57", ie: "0570418909", logradouro: "AVENIDA DORIVAL CANDIDO LUZ DE OLIVEIRA, 4634", cep: "94050000", cidade: "GRAVATAI", uf: "RS", telefone: "51999999999" },
];

export function empresaDaLoja(lojaId: number | null | undefined) {
  return EMPRESAS.find((e) => e.lojaId === Number(lojaId)) || null;
}
