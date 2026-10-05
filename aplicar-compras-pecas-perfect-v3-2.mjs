import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS PERFECT V3.2: ${msg}`);
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

if (!server.includes("extrairUrlDuckDuckGoRapida")) {
  falhar("a V3.1 precisa estar aplicada antes desta correção.");
}
if (server.includes("localizarPerfectNoCatalogo")) {
  falhar("a V3.2 parece já estar aplicada.");
}

server = substituirUma(
  server,
  "async function localizarPerfectRapido(codigo: string) {\n  const q =\n    `site:catalogo.perfectautomotive.com/new/ \"${codigo}\" \"Perfect\"`;\n  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;\n\n  try {\n    const html = await fetchText(url, 3500);\n    return extrairUrlDuckDuckGoRapida(html);\n  } catch {\n    return null;\n  }\n}\n\n",
  "async function localizarPerfectRapido(codigo: string) {\n  const q =\n    `site:catalogo.perfectautomotive.com/new/ \"${codigo}\" \"Perfect\"`;\n  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;\n\n  try {\n    const html = await fetchText(url, 3500);\n    return extrairUrlDuckDuckGoRapida(html);\n  } catch {\n    return null;\n  }\n}\n\nconst perfectPaginasCache = new Map<number, Promise<string>>();\nlet perfectUltimaPaginaCache: number | null = null;\n\nfunction urlPaginaPerfect(pagina: number) {\n  return (\n    \"https://catalogo.perfectautomotive.com/new/produtos.asp\" +\n    \"?cw_ie_tp=0\" +\n    \"&cw_ordenacao=cw-ordena-numero-produto\" +\n    `&cw_pgAtual=${pagina}`\n  );\n}\n\nasync function paginaPerfect(pagina: number) {\n  const existente = perfectPaginasCache.get(pagina);\n  if (existente) return existente;\n\n  const promessa = fetchText(urlPaginaPerfect(pagina), 4500).catch((error) => {\n    perfectPaginasCache.delete(pagina);\n    throw error;\n  });\n\n  perfectPaginasCache.set(pagina, promessa);\n  return promessa;\n}\n\nfunction codigosProdutosPerfect(html: string) {\n  const texto = stripHtml(html).toUpperCase();\n  const codigos = Array.from(\n    texto.matchAll(\n      /\\b([A-Z]{2,8}[A-Z0-9/-]*\\d[A-Z0-9/-]*)\\s*\\(N[º°]?\\s*REF/gi\n    ),\n    (match) => String(match[1] || \"\").trim()\n  );\n\n  return Array.from(new Set(codigos));\n}\n\nfunction ultimaPaginaPerfect(html: string) {\n  if (perfectUltimaPaginaCache) return perfectUltimaPaginaCache;\n\n  const paginas = Array.from(\n    html.matchAll(/cw_pgAtual=(\\d+)/gi),\n    (match) => Number(match[1])\n  ).filter((numero) => Number.isFinite(numero) && numero > 0);\n\n  const maior = paginas.length ? Math.max(...paginas) : 1800;\n  perfectUltimaPaginaCache = Math.max(maior, 1800);\n  return perfectUltimaPaginaCache;\n}\n\nfunction detalhePerfectNoHtml(\n  html: string,\n  codigo: string,\n  pagina: number\n) {\n  const upper = html.toUpperCase();\n  const alvo = codigo.toUpperCase();\n\n  let indice = upper.indexOf(`>${alvo}<`);\n  if (indice < 0) indice = upper.indexOf(alvo);\n  if (indice < 0) return null;\n\n  const inicio = Math.max(0, indice - 6000);\n  const antes = html.slice(inicio, indice + alvo.length + 500);\n\n  const hrefs = Array.from(\n    antes.matchAll(/href=[\"']([^\"']*detalhes\\.asp[^\"']*)[\"']/gi)\n  ).map((match) => decodeHtml(match[1] || \"\"));\n\n  const relativo = hrefs[hrefs.length - 1];\n\n  if (relativo) {\n    try {\n      return new URL(\n        relativo,\n        \"https://catalogo.perfectautomotive.com/new/\"\n      ).toString();\n    } catch {}\n  }\n\n  // Mesmo se o link do detalhe mudar de formato, a página de produtos\n  // já contém código, descrição e aplicações principais.\n  return urlPaginaPerfect(pagina);\n}\n\nasync function localizarPerfectNoCatalogo(codigo: string) {\n  const alvo = codigo.toUpperCase();\n\n  let primeira: string;\n  try {\n    primeira = await paginaPerfect(1);\n  } catch {\n    return null;\n  }\n\n  let baixo = 1;\n  let alto = ultimaPaginaPerfect(primeira);\n\n  for (let tentativa = 0; tentativa < 13 && baixo <= alto; tentativa += 1) {\n    const pagina = Math.floor((baixo + alto) / 2);\n\n    let html: string;\n    try {\n      html = pagina === 1 ? primeira : await paginaPerfect(pagina);\n    } catch {\n      return null;\n    }\n\n    const codigos = codigosProdutosPerfect(html);\n    if (!codigos.length) return null;\n\n    if (codigos.includes(alvo)) {\n      return detalhePerfectNoHtml(html, alvo, pagina);\n    }\n\n    const primeiro = codigos[0];\n    const ultimo = codigos[codigos.length - 1];\n\n    if (alvo < primeiro) {\n      alto = pagina - 1;\n      continue;\n    }\n\n    if (alvo > ultimo) {\n      baixo = pagina + 1;\n      continue;\n    }\n\n    // Em caso de alguma irregularidade pontual na ordenação do catálogo,\n    // confere páginas vizinhas antes de desistir.\n    for (const vizinha of [pagina - 2, pagina - 1, pagina + 1, pagina + 2]) {\n      if (vizinha < 1) continue;\n\n      try {\n        const htmlVizinha = await paginaPerfect(vizinha);\n        const codigosVizinhos = codigosProdutosPerfect(htmlVizinha);\n\n        if (codigosVizinhos.includes(alvo)) {\n          return detalhePerfectNoHtml(htmlVizinha, alvo, vizinha);\n        }\n      } catch {}\n    }\n\n    return null;\n  }\n\n  return null;\n}\n\n",
  "busca direta no catálogo Perfect"
);

server = substituirUma(
  server,
  "async function consultarPerfect(codigoOriginal: string) {\n  const codigo = norm(codigoOriginal).replace(/\\s+/g, \"\");\n\n  const consulta = (async () => {\n    const url = await localizarPerfectRapido(codigo);\n\n    if (!url) {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"nao_localizado\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n      };\n    }\n\n    try {\n      const html = await fetchText(url, 3500);\n      return dadosPerfectDaPagina(html, codigo, url);\n    } catch {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url,\n      };\n    }\n  })();\n\n  const limite = new Promise<any>((resolve) => {\n    setTimeout(() => {\n      resolve({\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\",\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n        erro: \"Tempo limite da consulta atingido.\",\n      });\n    }, 8000);\n  });\n\n  return Promise.race([consulta, limite]);\n}\n\n",
  "async function consultarPerfect(codigoOriginal: string) {\n  const codigo = norm(codigoOriginal).replace(/\\s+/g, \"\");\n\n  const consulta = (async () => {\n    // 1) Tentativa rápida via índice público.\n    let url = await localizarPerfectRapido(codigo);\n\n    // 2) Se o buscador externo não tiver indexado o código, pesquisa\n    // diretamente no catálogo Perfect ordenado por código.\n    if (!url) {\n      url = await localizarPerfectNoCatalogo(codigo);\n    }\n\n    if (!url) {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"nao_localizado\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n      };\n    }\n\n    try {\n      const html = await fetchText(url, 4500);\n      const resultado = dadosPerfectDaPagina(html, codigo, url);\n\n      // Se o buscador externo apontou para uma página genérica que não\n      // contém o código, faz uma segunda tentativa diretamente no catálogo.\n      if (resultado.status === \"nao_localizado\") {\n        const urlDireta = await localizarPerfectNoCatalogo(codigo);\n\n        if (urlDireta && urlDireta !== url) {\n          const htmlDireto = await fetchText(urlDireta, 4500);\n          return dadosPerfectDaPagina(htmlDireto, codigo, urlDireta);\n        }\n      }\n\n      return resultado;\n    } catch {\n      return {\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\" as const,\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url,\n      };\n    }\n  })();\n\n  const limite = new Promise<any>((resolve) => {\n    setTimeout(() => {\n      resolve({\n        codigo,\n        fonte: \"PERFECT\",\n        status: \"erro\",\n        descricao: null,\n        aplicacao: null,\n        lado: null,\n        url: null,\n        erro: \"Tempo limite da consulta atingido.\",\n      });\n    }, 22000);\n  });\n\n  return Promise.race([consulta, limite]);\n}\n\n",
  "consulta Perfect com fallback direto"
);

server = substituirUma(
  server,
  "          if (\n            cache.length &&\n            [\"localizado\", \"nao_localizado\"].includes(\n              String(cache[0].status)\n            )\n          ) {\n            return {\n              ...cache[0],\n              codigo: String(cache[0].codigo),\n              fonte: \"PERFECT\",\n            };\n          }",
  "          if (\n            cache.length &&\n            String(cache[0].status) === \"localizado\"\n          ) {\n            return {\n              ...cache[0],\n              codigo: String(cache[0].codigo),\n              fonte: \"PERFECT\",\n            };\n          }",
  "ignorar cache antigo de não localizado"
);

server = substituirUma(
  server,
  "      const CONCORRENCIA = 8;",
  "      const CONCORRENCIA = 5;",
  "concorrência controlada"
);

page = substituirUma(
  page,
  "                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção.",
  "                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção. Se o índice rápido não encontrar, o sistema pesquisa direto no catálogo por código.",
  "mensagem da consulta"
);

for (const marcador of [
  "localizarPerfectNoCatalogo",
  "codigosProdutosPerfect",
  "perfectPaginasCache",
  "22000",
  "String(cache[0].status) === \"localizado\"",
]) {
  if (!server.includes(marcador)) falhar(`validação backend falhou: ${marcador}`);
}

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(raiz, `.backup-compras-pecas-perfect-v32-${carimbo}`);
for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/pages/ComprasPecas.tsx", pagePath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.perfect-v32.tmp`;
const tmpPage = `${pagePath}.perfect-v32.tmp`;
try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");
  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpPage, pagePath);
} catch (error) {
  if (fs.existsSync(tmpServer)) fs.unlinkSync(tmpServer);
  if (fs.existsSync(tmpPage)) fs.unlinkSync(tmpPage);
  try {
    fs.copyFileSync(path.join(backupDir, "server/comprasPecas.ts"), serverPath);
    fs.copyFileSync(path.join(backupDir, "client/src/pages/ComprasPecas.tsx"), pagePath);
  } catch {}
  throw error;
}

console.log("");
console.log("✅ Compras > Peças • Perfect V3.2 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Correções:");
console.log("   - deixa de depender somente do buscador externo");
console.log("   - se o código não aparece no índice, pesquisa diretamente nas páginas ordenadas da Perfect");
console.log("   - páginas consultadas ficam em cache durante a sessão");
console.log("   - resultados antigos marcados como não localizado são pesquisados novamente");
console.log("   - mantém limite de tempo para não prender a tela");
console.log("O patch NÃO fez commit.");