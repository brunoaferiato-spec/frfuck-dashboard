import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");
const catalogoPath = path.join(raiz, "server", "catalogoPerfectPecas.ts");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS PERFECT V3.4: ${msg}`);
}

function ler(arquivo) {
  if (!fs.existsSync(arquivo)) falhar(`arquivo não encontrado: ${arquivo}`);
  const bruto = fs.readFileSync(arquivo, "utf8");
  const bom = bruto.startsWith("\uFEFF") ? "\uFEFF" : "";
  const corpo = bom ? bruto.slice(1) : bruto;
  const eol = corpo.includes("\r\n") ? "\r\n" : "\n";
  return { bom, eol, texto: corpo.replace(/\r\n/g, "\n") };
}

function montar(info, texto) {
  return info.bom + texto.replace(/\n/g, info.eol);
}

function substituirUma(texto, antigo, novo, rotulo) {
  const total = texto.split(antigo).length - 1;
  if (total !== 1) {
    falhar(`${rotulo}: esperava 1 ocorrência, encontrei ${total}. Nada foi gravado.`);
  }
  return texto.replace(antigo, () => novo);
}

if (fs.existsSync(catalogoPath)) {
  falhar("server/catalogoPerfectPecas.ts já existe. Nada foi gravado.");
}

const serverInfo = ler(serverPath);
const pageInfo = ler(pagePath);
let server = serverInfo.texto;
let page = pageInfo.texto;

if (!server.includes("consultarCatalogoPerfect: protectedProcedure")) {
  falhar("a integração Perfect V3 não foi encontrada no backend.");
}

if (!server.includes("localizarPerfectNoCatalogo")) {
  falhar("a Perfect V3.2 precisa estar aplicada no backend.");
}

if (!page.includes("consultarPerfectProgressivo")) {
  falhar("a Perfect V3.3 precisa estar aplicada no frontend.");
}

if (!page.includes("Os resultados aparecem um por um conforme cada código termina.")) {
  falhar("não encontrei o texto esperado da Perfect V3.3.");
}

// ------------------------------------------------------------------
// 1) Backend: importa a base local oficial
// ------------------------------------------------------------------

server = substituirUma(
  server,
  'import { z } from "zod";',
  'import { z } from "zod";\nimport { consultarCatalogoPerfectLocal } from "./catalogoPerfectPecas";',
  "import do catálogo local"
);

// Remove toda a lógica de consulta web/DuckDuckGo/paginação Perfect.
// Mantém apenas consultarPerfect(), agora consultando o catálogo local.
const inicioHelpers = server.indexOf("function decodeHtml(v: string) {");
const inicioQuoteBook = server.indexOf(
  "async function quoteBook(",
  inicioHelpers
);

if (inicioHelpers < 0 || inicioQuoteBook < 0 || inicioQuoteBook <= inicioHelpers) {
  falhar("não consegui delimitar os helpers antigos da consulta web Perfect.");
}

const consultaLocal = `async function consultarPerfect(codigoOriginal: string) {
  const codigo = norm(codigoOriginal).replace(/\\s+/g, "");
  const item = consultarCatalogoPerfectLocal(codigo);

  if (!item) {
    return {
      codigo,
      fonte: "PERFECT",
      status: "nao_localizado" as const,
      descricao: null,
      aplicacao: null,
      lado: null,
      url: null,
    };
  }

  return {
    codigo,
    fonte: "PERFECT",
    status: "localizado" as const,
    descricao: item.descricao,
    aplicacao: item.aplicacao,
    lado: item.lado,
    url: null,
  };
}

`;

server =
  server.slice(0, inicioHelpers) +
  consultaLocal +
  server.slice(inicioQuoteBook);

// A base local é instantânea e autoritativa para esta versão.
// Portanto, não reutiliza resultados antigos da consulta web.
const inicioProcessar = server.indexOf(
  "      async function processarItem(item: any) {"
);
const inicioResultado = server.indexOf(
  "        let resultado: any;",
  inicioProcessar
);

if (
  inicioProcessar < 0 ||
  inicioResultado < 0 ||
  inicioResultado <= inicioProcessar
) {
  falhar("não consegui localizar processarItem() no backend.");
}

const fimCabecalhoProcessar =
  inicioProcessar +
  "      async function processarItem(item: any) {".length;

server =
  server.slice(0, fimCabecalhoProcessar) +
  `
        // Sempre consulta a base local desta versão do catálogo.
        // Isso também substitui no cache resultados antigos vindos da web.
` +
  server.slice(inicioResultado);

// ------------------------------------------------------------------
// 2) Frontend: uma única consulta em lote, sem 77 chamadas progressivas
// ------------------------------------------------------------------

const inicioConsultaFront = page.indexOf("  function marcarErroPerfect(");
const marcadorImportacao = page.indexOf(
  "      setArquivoNome(file.name);",
  inicioConsultaFront
);
const inicioProximaFuncao = page.lastIndexOf(
  "\n  async function ",
  marcadorImportacao
);

if (
  inicioConsultaFront < 0 ||
  marcadorImportacao < 0 ||
  inicioProximaFuncao <= inicioConsultaFront
) {
  falhar("não consegui delimitar a consulta progressiva no frontend.");
}

const consultaLote = `  async function consultarPerfectProgressivo(
    lista: ItemPeca[],
    forcar: boolean
  ) {
    const permitidos = new Set([
      "Pivô",
      "Terminal Axial",
      "Terminal de Direção",
    ]);

    const unicos = Array.from(
      new Map(
        lista
          .filter(
            (item) =>
              item.quantidadeCompra > 0 &&
              permitidos.has(item.grupo)
          )
          .map((item) => [
            normalizarTexto(item.codigo).replace(/\\s+/g, ""),
            item,
          ])
      ).values()
    );

    if (!unicos.length) {
      setMensagemCatalogo("Nenhum item da Perfect para consultar.");
      return;
    }

    setErro("");
    setCatalogoProgresso({
      ativo: true,
      concluidos: 0,
      total: unicos.length,
    });
    setMensagemCatalogo(
      \`Perfect local: consultando \${unicos.length} código(s)...\`
    );

    try {
      const data = await consultarPerfectMutation.mutateAsync({
        itens: unicos.map((item) => ({
          codigo: item.codigo,
          grupo: item.grupo,
        })),
        forcar,
      });

      setCatalogoProgresso({
        ativo: false,
        concluidos: unicos.length,
        total: unicos.length,
      });

      setMensagemCatalogo(
        \`Perfect local: \${data.localizados}/\${data.total} código(s) localizado(s) • catálogo 24/09/2026\`
      );
    } catch (error: any) {
      setCatalogoProgresso({
        ativo: false,
        concluidos: unicos.length,
        total: unicos.length,
      });

      setErro(
        error?.message ||
          "Não foi possível consultar a base local da Perfect."
      );
    }
  }

`;

page =
  page.slice(0, inicioConsultaFront) +
  consultaLote +
  page.slice(inicioProximaFuncao + 1);

page = substituirUma(
  page,
  "                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção. Os resultados aparecem um por um conforme cada código termina.",
  "                    Perfect usa a base local extraída do catálogo oficial de 24/09/2026 para pivô, terminal axial e terminal de direção. Sem consulta web.",
  "descrição do catálogo local"
);

page = page.replace(
  "Código não localizado no Perfect",
  "Não consta no catálogo Perfect 24/09/2026"
);

// ------------------------------------------------------------------
// 3) Validações antes de gravar
// ------------------------------------------------------------------

for (const marcador of [
  'import { consultarCatalogoPerfectLocal } from "./catalogoPerfectPecas";',
  "const item = consultarCatalogoPerfectLocal(codigo);",
  'status: "nao_localizado" as const',
  'status: "localizado" as const',
]) {
  if (!server.includes(marcador)) {
    falhar(`validação backend falhou: ${marcador}`);
  }
}

for (const marcador of [
  "Perfect local: consultando",
  "catálogo 24/09/2026",
  "Sem consulta web.",
]) {
  if (!page.includes(marcador)) {
    falhar(`validação frontend falhou: ${marcador}`);
  }
}

if (
  server.includes("localizarPerfectViaBusca") ||
  server.includes("localizarPerfectNoCatalogo") ||
  server.includes("perfectPaginasCache")
) {
  falhar("a lógica antiga de consulta web Perfect ainda permaneceu no backend.");
}

const catalogo = "export type CatalogoPerfectPeca = {\n  codigo: string;\n  grupo: \"Pivô\" | \"Terminal Axial\" | \"Terminal de Direção\";\n  descricao: string;\n  aplicacao: string;\n  lado: \"LD\" | \"LE\" | \"LD/LE\" | null;\n};\n\nexport const CATALOGO_PERFECT_VERSAO = \"24/09/2026 20:41\";\n\nconst ITENS_PERFECT: CatalogoPerfectPeca[] = [\n  { codigo: \"PVI1400\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"AUDI • A6 2019/2021 | A7 2019/2021 | Q5 2.0 16V 2018/2021\", lado: \"LD/LE\" },\n  { codigo: \"PVI7622\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"BYD • YUAN 2024/2025\", lado: \"LD/LE\" },\n  { codigo: \"PVS7610\", grupo: \"Pivô\", descricao: \"PIVÔ SUPERIOR LD/LE • PINO: 17,5MM\", aplicacao: \"BYD • SEAL 2023/2025\", lado: \"LD/LE\" },\n  { codigo: \"PVI0914\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"CITROEN • BASALT 2024/2025\", lado: \"LD/LE\" },\n  { codigo: \"PVI0915\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LE\", aplicacao: \"CITROEN • AIRCROSS 2023/2025\", lado: \"LE\" },\n  { codigo: \"PVI0916\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD\", aplicacao: \"CITROEN • AIRCROSS 2023/2025\", lado: \"LD\" },\n  { codigo: \"PVI0191\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE • PINO: 13,6MM\", aplicacao: \"FIAT • PALIO 1999/2000 | SIENA 2000/2000\", lado: \"LD/LE\" },\n  { codigo: \"PVI0236\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD • PINO Ø16,5\", aplicacao: \"FORD • TERRITORY 2019/2023\", lado: \"LD\" },\n  { codigo: \"PVI0237\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LE • PINO Ø16,5\", aplicacao: \"FORD • TERRITORY 2019/2023\", lado: \"LE\" },\n  { codigo: \"PVI6302\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE • PINO: 16,7MM\", aplicacao: \"GWM • ORA 03 2023/2025\", lado: \"LD/LE\" },\n  { codigo: \"PVI0419\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"HONDA • ACCORD 2003/2007\", lado: \"LD/LE\" },\n  { codigo: \"PVI0423\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE • PINO Ø17,8\", aplicacao: \"HONDA • CR-V 2023/2025 | ZR-V 2023/2025\", lado: \"LD/LE\" },\n  { codigo: \"PVS0404\", grupo: \"Pivô\", descricao: \"PIVÔ SUPERIOR LD/LE\", aplicacao: \"HONDA • ACCORD 2008/2009\", lado: \"LD/LE\" },\n  { codigo: \"PVI2189\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"HYUNDAI • SANTA FÉ 2.7 V6 2006/2011\", lado: \"LD/LE\" },\n  { codigo: \"PVI4105\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE • PINO Ø13,4\", aplicacao: \"JAC MOTORS • T40 1.5 JET FLEX MT 2017/2021\", lado: \"LD/LE\" },\n  { codigo: \"PVI2418\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"JEEP • GRAND CHEROKEE 2011/2017\", lado: \"LD/LE\" },\n  { codigo: \"PVI2718\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"LAND ROVER • RANGE ROVER EVOQUE 2012/2019\", lado: \"LD/LE\" },\n  { codigo: \"PVI3187\", grupo: \"Pivô\", descricao: \"PIVÔ TRASEIRO LD/LE • PINO: 19MM\", aplicacao: \"MITSUBISHI • PAJERO 2006/2017\", lado: \"LD/LE\" },\n  { codigo: \"PVI3189\", grupo: \"Pivô\", descricao: \"PIVÔ TRASEIRO LD/LE • PINO Ø17 - CORPO Ø39,8\", aplicacao: \"MITSUBISHI • PAJERO FULL 2006/2017\", lado: \"LD/LE\" },\n  { codigo: \"PVI3320\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"NISSAN • KICKS 2025/2025 | RENAULT • BOREAL 2026/2026\", lado: \"LD/LE\" },\n  { codigo: \"PVI3904\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD • PINO Ø21 - FURO Ø12,2\", aplicacao: \"VOLVO • C40 RECHARGER 2022/2023 | XC40 RECHARGER 2021/2023\", lado: \"LD\" },\n  { codigo: \"PVI3905\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LE • PINO Ø21 - FURO Ø12,2\", aplicacao: \"VOLVO • C40 RECHARGER 2022/2023 | XC40 RECHARGER 2021/2023\", lado: \"LE\" },\n  { codigo: \"PVI3906\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE • PINO Ø18\", aplicacao: \"VOLVO • S80 2007/2015 | V70 2007/2015\", lado: \"LD/LE\" },\n  { codigo: \"PVI3912\", grupo: \"Pivô\", descricao: \"PIVÔ INFERIOR LD/LE\", aplicacao: \"VOLVO • EX30 2023/2025\", lado: \"LD/LE\" },\n  { codigo: \"BRD1409\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 237MM - M16X1,5\", aplicacao: \"AUDI • A6 2012/2024 | A7 2010/2024 | A8 2010/2017 | E-TRON 2018/2023 | Q5 2009/2024 • PORSCHE • CAYENNE 9Y 2019/2024 | MACAN 2014/2024\", lado: null },\n  { codigo: \"BRD1509\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 253,5MM - M14X1,5\", aplicacao: \"BMW • 320I G20 2019/2025\", lado: null },\n  { codigo: \"BRD7601\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 265MM - M14X1,5\", aplicacao: \"BYD • DOLPHIN 2024/2026\", lado: null },\n  { codigo: \"BRD7603\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 310MM - M14X1,5\", aplicacao: \"BYD • DOLPHIN MINI 2024/2025\", lado: null },\n  { codigo: \"BRD7604\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 342,5MM - M14X1,5\", aplicacao: \"BYD • SONG PLUS DMI 2023/2025\", lado: null },\n  { codigo: \"BRD1725\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 355MM - M14X1,5\", aplicacao: \"CHERY • TIGGO 3X 2021/2022\", lado: null },\n  { codigo: \"BRD1727\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 270MM - M14X1,5\", aplicacao: \"CHERY • TIGGO 8 2021/2025\", lado: null },\n  { codigo: \"BRD1729\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 264MM - M14X1,5\", aplicacao: \"CHERY • TIGGO 7 2022/2026\", lado: null },\n  { codigo: \"BRD0967\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 221MM - M14X1,5\", aplicacao: \"CITROEN • C4 PICASSO GRAND PICASSO 2016/2019 | C4 PICASSO 2016/2019 • PEUGEOT • 3008 2018/2025 | 5008 2018/2020\", lado: null },\n  { codigo: \"BRD0108\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 267MM - M14X1,5\", aplicacao: \"FIAT • PALIO CREMALHEIRA M16X1.5 2010/2013 | PALIO WEEKEND 2010/2020 | SIENA 2010/2016\", lado: null },\n  { codigo: \"BRD0204\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 272MM - M16X1,5\", aplicacao: \"FORD • TERRITORY 2021/2023\", lado: null },\n  { codigo: \"BRD0213\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 X 284,5MM X M16X1,5\", aplicacao: \"FORD • BRONCO 2021/2023\", lado: null },\n  { codigo: \"BRD0227\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 288,5MM - M16X1,5\", aplicacao: \"FORD • FOCUS 2014/2019 • VOLVO • C30 2007/2012 | S40 2004/2012 | V40 2012/2019 | V50 2004/2012\", lado: null },\n  { codigo: \"BRD6302\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 278MM - M14X1,5\", aplicacao: \"GWM • ORA 03 2023/2025\", lado: null },\n  { codigo: \"BRD2113\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO (EM BREVE) • M16X1,5 - 304MM - M16X1,5\", aplicacao: \"HYUNDAI • ELANTRA 2017/2018 • KIA • CERATO 2020/2022\", lado: null },\n  { codigo: \"BRD4103\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 252,5MM - M14X1,5\", aplicacao: \"JAC MOTORS • T40 2014/2021\", lado: null },\n  { codigo: \"BRD3017\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 202,5MM - M14X1,5\", aplicacao: \"MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026\", lado: null },\n  { codigo: \"BRD3018\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M16X1,5 - 297,5MM - M16X1,5\", aplicacao: \"MERCEDES-BENZ • C-CLASS / T-MODEL (diversas versões) 2021/2026\", lado: null },\n  { codigo: \"BRD4701\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 191MM - M14X1,5\", aplicacao: \"MINI • COOPER HATCH / CABRIO 2014/2023\", lado: null },\n  { codigo: \"BRD4702\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO (EM BREVE) • M14X1,5 - 196MM - M14X1,5\", aplicacao: \"MINI • CLUBMAN DIREÇÃO HIDRÁULICA 2008/2014 | COOPER CABRIO / COUPÉ 2010/2015\", lado: null },\n  { codigo: \"BRD0600\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO • M14X1,5 - 206,5MM - M14X1,5\", aplicacao: \"RENAULT • KARDIAN 2023/2025\", lado: null },\n  { codigo: \"BRD3709\", grupo: \"Terminal Axial\", descricao: \"AXIAL DE DIREÇÃO (EM BREVE) • M18X1,5 - 321MM - M14X1,5\", aplicacao: \"SUZUKI • S-CROSS 2015/2021\", lado: null },\n  { codigo: \"TDI7622\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø12,5 • COMPR 163MM • ROSCA M14X1,5\", aplicacao: \"BYD • YUAN PLUS 2022/2025\", lado: \"LD\" },\n  { codigo: \"TDI7623\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø12,5 • COMPR 163MM • ROSCA M14X1,5\", aplicacao: \"BYD • YUAN PLUS 2022/2025\", lado: \"LE\" },\n  { codigo: \"TDI1718\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø13,3 • COMPR 89MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 3X 2021/2022\", lado: \"LD\" },\n  { codigo: \"TDI1719\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø13,3 • COMPR 89MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 3X 2021/2022\", lado: \"LE\" },\n  { codigo: \"TDI1720\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø13,2 • COMPR 206MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 8 2020/2023\", lado: \"LD\" },\n  { codigo: \"TDI1721\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø13,2 • COMPR 206MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 8 2020/2023\", lado: \"LE\" },\n  { codigo: \"TDI1722\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø13,3 • COMPR 180,5MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 7 2022/2025\", lado: \"LD\" },\n  { codigo: \"TDI1723\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø13,3 • COMPR 180,5MM • ROSCA M14X1,5\", aplicacao: \"CHERY • TIGGO 7 2022/2025\", lado: \"LE\" },\n  { codigo: \"TDI0213\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø12,4 • COMPR 122,5MM • ROSCA M16X1,5\", aplicacao: \"FORD • BRONCO 2021/2023\", lado: \"LE\" },\n  { codigo: \"TDI0214\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø12,4 • COMPR 122,5MM • ROSCA M16X1,5\", aplicacao: \"FORD • BRONCO 2021/2023\", lado: \"LD\" },\n  { codigo: \"TDI6300\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD/LE • PINO Ø14,7 • COMPR 103MM • ROSCA M16X1,5\", aplicacao: \"GWM • HAVAL H6 2023/2024\", lado: \"LD/LE\" },\n  { codigo: \"TDI6301\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø13,2 • COMPR 186MM • ROSCA M14X1,5\", aplicacao: \"GWM • ORA 03 2023/2025\", lado: \"LE\" },\n  { codigo: \"TDI6302\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø13,2 • COMPR 186MM • ROSCA M14X1,5\", aplicacao: \"GWM • ORA 03 2023/2025\", lado: \"LD\" },\n  { codigo: \"TDI0430\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø14,3 • COMPR 165MM • ROSCA M14X1,5\", aplicacao: \"HONDA • HR-V 2022/2026\", lado: \"LD\" },\n  { codigo: \"TDI0431\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø14,3 • COMPR 165MM • ROSCA M14X1,5\", aplicacao: \"HONDA • HR-V 2022/2026\", lado: \"LE\" },\n  { codigo: \"TDI0432\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø12,2 • COMPR 169MM • ROSCA M14X1,5\", aplicacao: \"HONDA • CITY 2022/2026\", lado: \"LD\" },\n  { codigo: \"TDI0433\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø12,2 • COMPR 169MM • ROSCA M14X1,5\", aplicacao: \"HONDA • CITY 2022/2026\", lado: \"LE\" },\n  { codigo: \"TDI2506\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø13,4 • COMPR 203MM • ROSCA M16X1,5\", aplicacao: \"KIA • CERATO 2013/2019\", lado: \"LD\" },\n  { codigo: \"TDI2507\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø13,4 • COMPR 203MM • ROSCA M16X1,5\", aplicacao: \"KIA • CERATO 2013/2019\", lado: \"LE\" },\n  { codigo: \"TDI3020\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø14,9 • COMPR 222MM • ROSCA M14X1,5\", aplicacao: \"MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026\", lado: \"LD\" },\n  { codigo: \"TDI3021\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø14,9 • COMPR 222MM • ROSCA M14X1,5\", aplicacao: \"MERCEDES-BENZ • A-CLASS (diversas versões) 2018/2026\", lado: \"LE\" },\n  { codigo: \"TDI0656\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø12 • COMPR 208MM • ROSCA M14X1,5\", aplicacao: \"RENAULT • CAPTUR 2022/2026 | DUSTER 2021/2026\", lado: \"LD\" },\n  { codigo: \"TDI0657\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø12 • COMPR 208MM • ROSCA M14X1,5\", aplicacao: \"RENAULT • CAPTUR 2022/2026 | DUSTER 2021/2026\", lado: \"LE\" },\n  { codigo: \"TDI0658\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LD • PINO Ø11,9 • COMPR 207MM • ROSCA M14X1,5\", aplicacao: \"RENAULT • KARDIAN 2022/2026 | LOGAN 2020/2026 | SANDERO 2020/2026 | TALIANT 2020/2026\", lado: \"LD\" },\n  { codigo: \"TDI0659\", grupo: \"Terminal de Direção\", descricao: \"TERMINAL DE DIREÇÃO LE • PINO Ø11,9 • COMPR 207MM • ROSCA M14X1,5\", aplicacao: \"RENAULT • KARDIAN 2022/2026 | LOGAN 2020/2026 | SANDERO 2020/2026 | TALIANT 2020/2026\", lado: \"LE\" },\n];\n\nfunction normalizarCodigo(codigo: string) {\n  return String(codigo || \"\")\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .toUpperCase()\n    .replace(/\\s+/g, \"\")\n    .trim();\n}\n\nconst POR_CODIGO = new Map(\n  ITENS_PERFECT.map((item) => [normalizarCodigo(item.codigo), item] as const)\n);\n\nexport function consultarCatalogoPerfectLocal(codigo: string) {\n  return POR_CODIGO.get(normalizarCodigo(codigo)) || null;\n}\n\nexport function totalCatalogoPerfectLocal() {\n  return ITENS_PERFECT.length;\n}\n";

// ------------------------------------------------------------------
// 4) Backup + gravação segura
// ------------------------------------------------------------------

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(
  raiz,
  `.backup-compras-pecas-perfect-v34-${carimbo}`
);

for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/pages/ComprasPecas.tsx", pagePath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.perfect-v34.tmp`;
const tmpPage = `${pagePath}.perfect-v34.tmp`;
const tmpCatalogo = `${catalogoPath}.perfect-v34.tmp`;

let catalogoCriado = false;

try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");
  fs.writeFileSync(tmpCatalogo, catalogo, "utf8");

  fs.renameSync(tmpCatalogo, catalogoPath);
  catalogoCriado = true;

  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpPage, pagePath);
} catch (error) {
  for (const tmp of [tmpServer, tmpPage, tmpCatalogo]) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }

  if (catalogoCriado && fs.existsSync(catalogoPath)) {
    try {
      fs.unlinkSync(catalogoPath);
    } catch {}
  }

  try {
    fs.copyFileSync(
      path.join(backupDir, "server/comprasPecas.ts"),
      serverPath
    );
    fs.copyFileSync(
      path.join(backupDir, "client/src/pages/ComprasPecas.tsx"),
      pagePath
    );
  } catch {}

  throw error;
}

console.log("");
console.log("✅ Compras > Peças • Perfect V3.4 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Perfect agora:");
console.log("   - usa base LOCAL do catálogo oficial de 24/09/2026");
console.log("   - 71 códigos de Pivô, Axial e Terminal cadastrados");
console.log("   - não acessa DuckDuckGo nem catálogo web");
console.log("   - consulta todos os códigos do relatório em um único lote");
console.log("   - códigos fora deste catálogo ficam identificados para revisão/exclusão");
console.log("");
console.log("O patch NÃO fez commit.");
