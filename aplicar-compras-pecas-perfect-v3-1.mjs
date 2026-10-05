import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS PERFECT V3.1: ${msg}`);
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

const serverInfo = ler(serverPath);
const pageInfo = ler(pagePath);
let server = serverInfo.texto;
let page = pageInfo.texto;

if (!server.includes("consultarCatalogoPerfect: protectedProcedure")) {
  falhar("a V3 Perfect precisa estar aplicada antes desta correção.");
}

if (server.includes("extrairUrlDuckDuckGoRapida")) {
  falhar("a V3.1 parece já estar aplicada.");
}

const inicioHelpers = server.indexOf("function escapeRegex(v: string) {");
const fimHelpers = server.indexOf("function resumirAplicacaoPerfect", inicioHelpers);

if (inicioHelpers < 0 || fimHelpers < 0) {
  falhar("não consegui localizar as funções antigas de consulta Perfect.");
}

server =
  server.slice(0, inicioHelpers) +
  "function escapeRegex(v: string) {\n  return v.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");\n}\n\nasync function fetchText(url: string, timeoutMs = 3500) {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), timeoutMs);\n\n  try {\n    const response = await fetch(url, {\n      signal: controller.signal,\n      headers: {\n        \"user-agent\":\n          \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36\",\n        \"accept-language\": \"pt-BR,pt;q=0.9,en;q=0.7\",\n      },\n    });\n\n    if (!response.ok) {\n      throw new Error(`HTTP ${response.status}`);\n    }\n\n    return await response.text();\n  } finally {\n    clearTimeout(timer);\n  }\n}\n\nfunction extrairUrlDuckDuckGoRapida(html: string) {\n  const candidatos: string[] = [];\n\n  for (const match of html.matchAll(/href=[\"']([^\"']+)[\"']/gi)) {\n    let href = decodeHtml(match[1] || \"\");\n    if (!href) continue;\n\n    try {\n      if (href.startsWith(\"//\")) href = `https:${href}`;\n      const url = new URL(href, \"https://html.duckduckgo.com\");\n\n      if (url.hostname.includes(\"duckduckgo.com\")) {\n        const uddg = url.searchParams.get(\"uddg\");\n        if (uddg) href = decodeURIComponent(uddg);\n      }\n    } catch {}\n\n    if (\n      href.includes(\"catalogo.perfectautomotive.com/new/\") &&\n      (href.includes(\"detalhes.asp\") || href.includes(\"produtos.asp\"))\n    ) {\n      candidatos.push(href);\n    }\n  }\n\n  return (\n    candidatos.find((url) => url.includes(\"detalhes.asp\")) ||\n    candidatos.find((url) => url.includes(\"produtos.asp\")) ||\n    null\n  );\n}\n\nasync function localizarPerfectRapido(codigo: string) {\n  const q =\n    `site:catalogo.perfectautomotive.com/new/ \"${codigo}\" \"Perfect\"`;\n  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;\n\n  try {\n    const html = await fetchText(url, 3500);\n    return extrairUrlDuckDuckGoRapida(html);\n  } catch {\n    return null;\n  }\n}\n\nfunction dadosPerfectDaPagina(\n  html: string,\n  codigo: string,\n  url: string\n) {\n  const texto = stripHtml(html);\n  const alvo = codigo.toUpperCase();\n  const indice = texto.toUpperCase().indexOf(alvo);\n\n  if (indice < 0) {\n    return {\n      codigo,\n      fonte: \"PERFECT\",\n      status: \"nao_localizado\" as const,\n      descricao: null,\n      aplicacao: null,\n      lado: null,\n      url,\n    };\n  }\n\n  const trecho = texto.slice(indice, indice + 2400);\n\n  const reDescricao = new RegExp(\n    `^${escapeRegex(codigo)}\\\\s+(?:\\\\(N[º°]?\\\\s*Ref\\\\.[^)]*\\\\)\\\\s*)?(.+?)\\\\s+Unidade:`,\n    \"i\"\n  );\n\n  const descricao = (trecho.match(reDescricao)?.[1] || \"\")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .slice(0, 500);\n\n  const aplicacaoBruta =\n    trecho.match(/Fabricante:\\s*(.+?)\\s+Peso:/i)?.[1] || \"\";\n\n  const aplicacao = aplicacaoBruta\n    .replace(/\\bCOMPLEMENTO\\b/gi, \" \")\n    .replace(/\\bANO\\b/gi, \" \")\n    .replace(/\\+\\s*aplica[cç][oõ]es/gi, \" \")\n    .replace(/\\+\\s*montadoras/gi, \" \")\n    .replace(/(?:-\\s*){2,}/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .slice(0, 1400);\n\n  const descricaoNorm = norm(descricao);\n\n  const lado =\n    descricaoNorm.includes(\"LD/LE\") || descricaoNorm.includes(\"LE/LD\")\n      ? \"LD/LE\"\n      : /\\bLD\\b/.test(descricaoNorm) ||\n        descricaoNorm.includes(\"LADO DIREITO\")\n      ? \"LD\"\n      : /\\bLE\\b/.test(descricaoNorm) ||\n        descricaoNorm.includes(\"LADO ESQUERDO\")\n      ? \"LE\"\n      : null;\n\n  return {\n    codigo,\n    fonte: \"PERFECT\",\n    status: \"localizado\" as const,\n    descricao: descricao || null,\n    aplicacao: aplicacao || null,\n    lado,\n    url,\n  };\n}\n\n" +
  server.slice(fimHelpers);

const inicioConsulta = server.indexOf("async function consultarPerfect(codigoOriginal: string) {");
const fimConsulta = server.indexOf("async function quoteBook", inicioConsulta);

if (inicioConsulta < 0 || fimConsulta < 0) {
  falhar("não consegui localizar consultarPerfect.");
}

server =
  server.slice(0, inicioConsulta) +
  "async function consultarPerfect(codigoOriginal: string) {\n  const codigo = norm(codigoOriginal).replace(/\\s+/g, \"\");\n\n  const consulta = (async () => {\n    const url = await localizarPerfectRapido(codigo);\n\n    if (!url) {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"nao_localizado\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n      };\n    }\n\n    try {\n      const html = await fetchText(url, 3500);\n      return dadosPerfectDaPagina(html, codigo, url);\n    } catch {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url,\n      };\n    }\n  })();\n\n  const limite = new Promise<any>((resolve) => {\n    setTimeout(() => {\n      resolve({\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\",\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n        erro: \"Tempo limite da consulta atingido.\",\n      });\n    }, 8000);\n  });\n\n  return Promise.race([consulta, limite]);\n}\n\n" +
  server.slice(fimConsulta);

server = substituirUma(
  server,
  "      const resultados: any[] = [];\n\n      for (const item of unicos) {\n        if (!input.forcar) {\n          const [cache] = await db().query<any[]>(\n            `SELECT codigo, fonte, status, descricao, aplicacao, lado, url,\n                    consultadoEm, updatedAt\n             FROM compras_pecas_catalogo_cache\n             WHERE codigo = ? AND fonte = 'PERFECT'\n             LIMIT 1`,\n            [item.codigo]\n          );\n\n          if (cache.length && String(cache[0].status) === \"localizado\") {\n            resultados.push({\n              ...cache[0],\n              codigo: String(cache[0].codigo),\n              fonte: \"PERFECT\",\n            });\n            continue;\n          }\n        }\n\n        let resultado: any;\n\n        try {\n          resultado = await consultarPerfect(item.codigo);\n        } catch (error: any) {\n          resultado = {\n            codigo: item.codigo,\n            fonte: \"PERFECT\",\n            status: \"erro\",\n            descricao: null,\n            aplicacao: null,\n            lado: null,\n            url: null,\n            erro: error?.message || \"Falha na consulta\",\n          };\n        }\n\n        await db().query(\n          `INSERT INTO compras_pecas_catalogo_cache\n             (codigo, fonte, status, descricao, aplicacao, lado, url, consultadoEm)\n           VALUES (?, 'PERFECT', ?, ?, ?, ?, ?, NOW())\n           ON DUPLICATE KEY UPDATE\n             status = VALUES(status),\n             descricao = VALUES(descricao),\n             aplicacao = VALUES(aplicacao),\n             lado = VALUES(lado),\n             url = VALUES(url),\n             consultadoEm = NOW()`,\n          [\n            resultado.codigo,\n            resultado.status,\n            resultado.descricao,\n            resultado.aplicacao,\n            resultado.lado,\n            resultado.url,\n          ]\n        );\n\n        resultados.push(resultado);\n      }\n\n",
  "      const resultados: any[] = [];\n\n      async function processarItem(item: any) {\n        if (!input.forcar) {\n          const [cache] = await db().query<any[]>(\n            `SELECT codigo, fonte, status, descricao, aplicacao, lado, url,\n                    consultadoEm, updatedAt\n             FROM compras_pecas_catalogo_cache\n             WHERE codigo = ? AND fonte = 'PERFECT'\n             LIMIT 1`,\n            [item.codigo]\n          );\n\n          if (\n            cache.length &&\n            [\"localizado\", \"nao_localizado\"].includes(\n              String(cache[0].status)\n            )\n          ) {\n            return {\n              ...cache[0],\n              codigo: String(cache[0].codigo),\n              fonte: \"PERFECT\",\n            };\n          }\n        }\n\n        let resultado: any;\n\n        try {\n          resultado = await consultarPerfect(item.codigo);\n        } catch (error: any) {\n          resultado = {\n            codigo: item.codigo,\n            fonte: \"PERFECT\",\n            status: \"erro\",\n            descricao: null,\n            aplicacao: null,\n            lado: null,\n            url: null,\n            erro: error?.message || \"Falha na consulta\",\n          };\n        }\n\n        await db().query(\n          `INSERT INTO compras_pecas_catalogo_cache\n             (codigo, fonte, status, descricao, aplicacao, lado, url, consultadoEm)\n           VALUES (?, 'PERFECT', ?, ?, ?, ?, ?, NOW())\n           ON DUPLICATE KEY UPDATE\n             status = VALUES(status),\n             descricao = VALUES(descricao),\n             aplicacao = VALUES(aplicacao),\n             lado = VALUES(lado),\n             url = VALUES(url),\n             consultadoEm = NOW()`,\n          [\n            resultado.codigo,\n            resultado.status,\n            resultado.descricao,\n            resultado.aplicacao,\n            resultado.lado,\n            resultado.url,\n          ]\n        );\n\n        return resultado;\n      }\n\n      // Consulta em pequenos lotes paralelos para não deixar a tela presa\n      // nem sobrecarregar o catálogo.\n      const CONCORRENCIA = 8;\n\n      for (let inicio = 0; inicio < unicos.length; inicio += CONCORRENCIA) {\n        const lote = unicos.slice(inicio, inicio + CONCORRENCIA);\n        const respostas = await Promise.all(lote.map(processarItem));\n        resultados.push(...respostas);\n      }\n\n",
  "processamento paralelo da Perfect"
);

page = substituirUma(
  page,
  "      const itensPerfect = encontrados.filter((item) =>\n        [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(item.grupo)\n      );",
  "      const itensPerfect = encontrados.filter(\n        (item) =>\n          item.quantidadeCompra > 0 &&\n          [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(item.grupo)\n      );",
  "consulta automática somente itens com compra"
);

page = substituirUma(
  page,
  "                      const itensPerfect = itens.filter((item) =>\n                        [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                          item.grupo\n                        )\n                      );",
  "                      const itensPerfect = itens.filter(\n                        (item) =>\n                          item.quantidadeCompra > 0 &&\n                          [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                            item.grupo\n                          )\n                      );",
  "consulta manual somente itens com compra"
);

for (const marcador of [
  "extrairUrlDuckDuckGoRapida",
  "Tempo limite da consulta atingido.",
  "const CONCORRENCIA = 8;",
  'return v.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");',
]) {
  if (!server.includes(marcador)) {
    falhar(`validação do backend falhou: ${marcador}`);
  }
}

if (!page.includes("item.quantidadeCompra > 0")) {
  falhar("validação do frontend falhou.");
}

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
  `.backup-compras-pecas-perfect-v31-${carimbo}`
);

for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/pages/ComprasPecas.tsx", pagePath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.perfect-v31.tmp`;
const tmpPage = `${pagePath}.perfect-v31.tmp`;

try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");
  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpPage, pagePath);
} catch (error) {
  if (fs.existsSync(tmpServer)) fs.unlinkSync(tmpServer);
  if (fs.existsSync(tmpPage)) fs.unlinkSync(tmpPage);

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
console.log("✅ Compras > Peças • Perfect V3.1 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Correções:");
console.log("   - remove a varredura demorada de centenas de páginas do catálogo");
console.log("   - cada código tem limite de tempo");
console.log("   - consultas rodam em lotes paralelos");
console.log("   - só consulta peças que realmente possuem quantidade de compra");
console.log("   - corrige a função de leitura do código/descrição");
console.log("   - a tela sempre termina a consulta, mesmo se um código falhar");
console.log("");
console.log("O patch NÃO fez commit.");
