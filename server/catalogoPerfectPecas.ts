export type CatalogoPerfectPeca = {
  codigo: string;
  grupo: "Pivô" | "Terminal Axial" | "Terminal de Direção";
  descricao: string;
  aplicacao: string;
  lado: "LD" | "LE" | "LD/LE" | null;
};

export const CATALOGO_PERFECT_VERSAO = "24/09/2026 20:41";

const ITENS_PERFECT: CatalogoPerfectPeca[] = [
  { codigo: "PVI1400", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "AUDI • A6 2019/2021 | A7 2019/2021 | Q5 2.0 16V 2018/2021", lado: "LD/LE" },
  { codigo: "PVI7622", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "BYD • YUAN 2024/2025", lado: "LD/LE" },
  { codigo: "PVS7610", grupo: "Pivô", descricao: "PIVÔ SUPERIOR LD/LE • PINO: 17,5MM", aplicacao: "BYD • SEAL 2023/2025", lado: "LD/LE" },
  { codigo: "PVI0914", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "CITROEN • BASALT 2024/2025", lado: "LD/LE" },
  { codigo: "PVI0915", grupo: "Pivô", descricao: "PIVÔ INFERIOR LE", aplicacao: "CITROEN • AIRCROSS 2023/2025", lado: "LE" },
  { codigo: "PVI0916", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD", aplicacao: "CITROEN • AIRCROSS 2023/2025", lado: "LD" },
  { codigo: "PVI0191", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE • PINO: 13,6MM", aplicacao: "FIAT • PALIO 1999/2000 | SIENA 2000/2000", lado: "LD/LE" },
  { codigo: "PVI0236", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD • PINO Ø16,5", aplicacao: "FORD • TERRITORY 2019/2023", lado: "LD" },
  { codigo: "PVI0237", grupo: "Pivô", descricao: "PIVÔ INFERIOR LE • PINO Ø16,5", aplicacao: "FORD • TERRITORY 2019/2023", lado: "LE" },
  { codigo: "PVI6302", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE • PINO: 16,7MM", aplicacao: "GWM • ORA 03 2023/2025", lado: "LD/LE" },
  { codigo: "PVI0419", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "HONDA • ACCORD 2003/2007", lado: "LD/LE" },
  { codigo: "PVI0423", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE • PINO Ø17,8", aplicacao: "HONDA • CR-V 2023/2025 | ZR-V 2023/2025", lado: "LD/LE" },
  { codigo: "PVS0404", grupo: "Pivô", descricao: "PIVÔ SUPERIOR LD/LE", aplicacao: "HONDA • ACCORD 2008/2009", lado: "LD/LE" },
  { codigo: "PVI2189", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "HYUNDAI • SANTA FÉ 2.7 V6 2006/2011", lado: "LD/LE" },
  { codigo: "PVI4105", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE • PINO Ø13,4", aplicacao: "JAC MOTORS • T40 1.5 JET FLEX MT 2017/2021", lado: "LD/LE" },
  { codigo: "PVI2418", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "JEEP • GRAND CHEROKEE 2011/2017", lado: "LD/LE" },
  { codigo: "PVI2718", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "LAND ROVER • RANGE ROVER EVOQUE 2012/2019", lado: "LD/LE" },
  { codigo: "PVI3187", grupo: "Pivô", descricao: "PIVÔ TRASEIRO LD/LE • PINO: 19MM", aplicacao: "MITSUBISHI • PAJERO 2006/2017", lado: "LD/LE" },
  { codigo: "PVI3189", grupo: "Pivô", descricao: "PIVÔ TRASEIRO LD/LE • PINO Ø17 - CORPO Ø39,8", aplicacao: "MITSUBISHI • PAJERO FULL 2006/2017", lado: "LD/LE" },
  { codigo: "PVI3320", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "NISSAN • KICKS 2025/2025 | RENAULT • BOREAL 2026/2026", lado: "LD/LE" },
  { codigo: "PVI3904", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD • PINO Ø21 - FURO Ø12,2", aplicacao: "VOLVO • C40 RECHARGER 2022/2023 | XC40 RECHARGER 2021/2023", lado: "LD" },
  { codigo: "PVI3905", grupo: "Pivô", descricao: "PIVÔ INFERIOR LE • PINO Ø21 - FURO Ø12,2", aplicacao: "VOLVO • C40 RECHARGER 2022/2023 | XC40 RECHARGER 2021/2023", lado: "LE" },
  { codigo: "PVI3906", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE • PINO Ø18", aplicacao: "VOLVO • S80 2007/2015 | V70 2007/2015", lado: "LD/LE" },
  { codigo: "PVI3912", grupo: "Pivô", descricao: "PIVÔ INFERIOR LD/LE", aplicacao: "VOLVO • EX30 2023/2025", lado: "LD/LE" },
  { codigo: "BRD1409", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 237MM - M16X1,5", aplicacao: "AUDI • A6 2012/2024 | A7 2010/2024 | A8 2010/2017 | E-TRON 2018/2023 | Q5 2009/2024 • PORSCHE • CAYENNE 9Y 2019/2024 | MACAN 2014/2024", lado: null },
  { codigo: "BRD1509", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 253,5MM - M14X1,5", aplicacao: "BMW • 320I G20 2019/2025", lado: null },
  { codigo: "BRD7601", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 265MM - M14X1,5", aplicacao: "BYD • DOLPHIN 2024/2026", lado: null },
  { codigo: "BRD7603", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 310MM - M14X1,5", aplicacao: "BYD • DOLPHIN MINI 2024/2025", lado: null },
  { codigo: "BRD7604", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 342,5MM - M14X1,5", aplicacao: "BYD • SONG PLUS DMI 2023/2025", lado: null },
  { codigo: "BRD1725", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 355MM - M14X1,5", aplicacao: "CHERY • TIGGO 3X 2021/2022", lado: null },
  { codigo: "BRD1727", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 270MM - M14X1,5", aplicacao: "CHERY • TIGGO 8 2021/2025", lado: null },
  { codigo: "BRD1729", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 264MM - M14X1,5", aplicacao: "CHERY • TIGGO 7 2022/2026", lado: null },
  { codigo: "BRD0967", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 221MM - M14X1,5", aplicacao: "CITROEN • C4 PICASSO GRAND PICASSO 2016/2019 | C4 PICASSO 2016/2019 • PEUGEOT • 3008 2018/2025 | 5008 2018/2020", lado: null },
  { codigo: "BRD0108", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 267MM - M14X1,5", aplicacao: "FIAT • PALIO CREMALHEIRA M16X1.5 2010/2013 | PALIO WEEKEND 2010/2020 | SIENA 2010/2016", lado: null },
  { codigo: "BRD0204", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 272MM - M16X1,5", aplicacao: "FORD • TERRITORY 2021/2023", lado: null },
  { codigo: "BRD0213", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 X 284,5MM X M16X1,5", aplicacao: "FORD • BRONCO 2021/2023", lado: null },
  { codigo: "BRD0227", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 288,5MM - M16X1,5", aplicacao: "FORD • FOCUS 2014/2019 • VOLVO • C30 2007/2012 | S40 2004/2012 | V40 2012/2019 | V50 2004/2012", lado: null },
  { codigo: "BRD6302", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 278MM - M14X1,5", aplicacao: "GWM • ORA 03 2023/2025", lado: null },
  { codigo: "BRD2113", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 304MM - M16X1,5", aplicacao: "HYUNDAI • ELANTRA 2017/2018 • KIA • CERATO 2020/2022", lado: null },
  { codigo: "BRD4103", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 252,5MM - M14X1,5", aplicacao: "JAC MOTORS • T40 2014/2021", lado: null },
  { codigo: "BRD3017", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 202,5MM - M14X1,5", aplicacao: "MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026", lado: null },
  { codigo: "BRD3018", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M16X1,5 - 297,5MM - M16X1,5", aplicacao: "MERCEDES-BENZ • C-CLASS / T-MODEL (diversas versões) 2021/2026", lado: null },
  { codigo: "BRD4701", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 191MM - M14X1,5", aplicacao: "MINI • COOPER HATCH / CABRIO 2014/2023", lado: null },
  { codigo: "BRD4702", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO (EM BREVE) • M14X1,5 - 196MM - M14X1,5", aplicacao: "MINI • CLUBMAN DIREÇÃO HIDRÁULICA 2008/2014 | COOPER CABRIO / COUPÉ 2010/2015", lado: null },
  { codigo: "BRD0600", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO • M14X1,5 - 206,5MM - M14X1,5", aplicacao: "RENAULT • KARDIAN 2023/2025", lado: null },
  { codigo: "BRD3709", grupo: "Terminal Axial", descricao: "AXIAL DE DIREÇÃO (EM BREVE) • M18X1,5 - 321MM - M14X1,5", aplicacao: "SUZUKI • S-CROSS 2015/2021", lado: null },
  { codigo: "TDI7622", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø12,5 • COMPR 163MM • ROSCA M14X1,5", aplicacao: "BYD • YUAN PLUS 2022/2025", lado: "LD" },
  { codigo: "TDI7623", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø12,5 • COMPR 163MM • ROSCA M14X1,5", aplicacao: "BYD • YUAN PLUS 2022/2025", lado: "LE" },
  { codigo: "TDI1718", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø13,3 • COMPR 89MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 3X 2021/2022", lado: "LD" },
  { codigo: "TDI1719", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø13,3 • COMPR 89MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 3X 2021/2022", lado: "LE" },
  { codigo: "TDI1720", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø13,2 • COMPR 206MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 8 2020/2023", lado: "LD" },
  { codigo: "TDI1721", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø13,2 • COMPR 206MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 8 2020/2023", lado: "LE" },
  { codigo: "TDI1722", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø13,3 • COMPR 180,5MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 7 2022/2025", lado: "LD" },
  { codigo: "TDI1723", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø13,3 • COMPR 180,5MM • ROSCA M14X1,5", aplicacao: "CHERY • TIGGO 7 2022/2025", lado: "LE" },
  { codigo: "TDI0213", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø12,4 • COMPR 122,5MM • ROSCA M16X1,5", aplicacao: "FORD • BRONCO 2021/2023", lado: "LE" },
  { codigo: "TDI0214", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø12,4 • COMPR 122,5MM • ROSCA M16X1,5", aplicacao: "FORD • BRONCO 2021/2023", lado: "LD" },
  { codigo: "TDI6300", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD/LE • PINO Ø14,7 • COMPR 103MM • ROSCA M16X1,5", aplicacao: "GWM • HAVAL H6 2023/2024", lado: "LD/LE" },
  { codigo: "TDI6301", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø13,2 • COMPR 186MM • ROSCA M14X1,5", aplicacao: "GWM • ORA 03 2023/2025", lado: "LE" },
  { codigo: "TDI6302", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø13,2 • COMPR 186MM • ROSCA M14X1,5", aplicacao: "GWM • ORA 03 2023/2025", lado: "LD" },
  { codigo: "TDI0430", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø14,3 • COMPR 165MM • ROSCA M14X1,5", aplicacao: "HONDA • HR-V 2022/2026", lado: "LD" },
  { codigo: "TDI0431", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø14,3 • COMPR 165MM • ROSCA M14X1,5", aplicacao: "HONDA • HR-V 2022/2026", lado: "LE" },
  { codigo: "TDI0432", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø12,2 • COMPR 169MM • ROSCA M14X1,5", aplicacao: "HONDA • CITY 2022/2026", lado: "LD" },
  { codigo: "TDI0433", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø12,2 • COMPR 169MM • ROSCA M14X1,5", aplicacao: "HONDA • CITY 2022/2026", lado: "LE" },
  { codigo: "TDI2506", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø13,4 • COMPR 203MM • ROSCA M16X1,5", aplicacao: "KIA • CERATO 2013/2019", lado: "LD" },
  { codigo: "TDI2507", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø13,4 • COMPR 203MM • ROSCA M16X1,5", aplicacao: "KIA • CERATO 2013/2019", lado: "LE" },
  { codigo: "TDI3020", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø14,9 • COMPR 222MM • ROSCA M14X1,5", aplicacao: "MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026", lado: "LD" },
  { codigo: "TDI3021", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø14,9 • COMPR 222MM • ROSCA M14X1,5", aplicacao: "MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026", lado: "LE" },
  { codigo: "TDI0656", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø12 • COMPR 208MM • ROSCA M14X1,5", aplicacao: "RENAULT • CAPTUR 2022/2026 | DUSTER 2021/2026", lado: "LD" },
  { codigo: "TDI0657", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø12 • COMPR 208MM • ROSCA M14X1,5", aplicacao: "RENAULT • CAPTUR 2022/2026 | DUSTER 2021/2026", lado: "LE" },
  { codigo: "TDI0658", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LD • PINO Ø11,9 • COMPR 207MM • ROSCA M14X1,5", aplicacao: "RENAULT • KARDIAN 2022/2026 | LOGAN 2020/2026 | SANDERO 2020/2026 | TALIANT 2020/2026", lado: "LD" },
  { codigo: "TDI0659", grupo: "Terminal de Direção", descricao: "TERMINAL DE DIREÇÃO LE • PINO Ø11,9 • COMPR 207MM • ROSCA M14X1,5", aplicacao: "RENAULT • KARDIAN 2022/2026 | LOGAN 2020/2026 | SANDERO 2020/2026 | TALIANT 2020/2026", lado: "LE" },
];

function normalizarCodigo(codigo: string) {
  return String(codigo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

const POR_CODIGO = new Map(
  ITENS_PERFECT.map((item) => [normalizarCodigo(item.codigo), item] as const)
);

export function consultarCatalogoPerfectLocal(codigo: string) {
  return POR_CODIGO.get(normalizarCodigo(codigo)) || null;
}

export function totalCatalogoPerfectLocal() {
  return ITENS_PERFECT.length;
}
