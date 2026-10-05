import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");
const componentPath = path.join(raiz, "client", "src", "components", "ComprasPecasCotacao.tsx");

function falhar(msg) { throw new Error(`PATCH COMPRAS PEÇAS PERFECT V3: ${msg}`); }
function ler(arquivo) {
  if (!fs.existsSync(arquivo)) falhar(`arquivo não encontrado: ${arquivo}`);
  const bruto = fs.readFileSync(arquivo, "utf8");
  const bom = bruto.startsWith("\uFEFF") ? "\uFEFF" : "";
  const corpo = bom ? bruto.slice(1) : bruto;
  const eol = corpo.includes("\r\n") ? "\r\n" : "\n";
  return { bom, eol, texto: corpo.replace(/\r\n/g, "\n") };
}
function montar(info, texto) { return info.bom + texto.replace(/\n/g, info.eol); }
function substituirUma(texto, antigo, novo, rotulo) {
  const total = texto.split(antigo).length - 1;
  if (total !== 1) falhar(`${rotulo}: esperava 1 ocorrência, encontrei ${total}. Nada foi gravado.`);
  return texto.replace(antigo, novo);
}

const serverInfo = ler(serverPath);
const pageInfo = ler(pagePath);
const componentInfo = ler(componentPath);
let server = serverInfo.texto;
let page = pageInfo.texto;
let component = componentInfo.texto;

if (!component.includes("Cidade da compra")) falhar("a V2.3.1 precisa estar aplicada.");
if (server.includes("consultarCatalogoPerfect: protectedProcedure")) falhar("a V3 Perfect parece já estar aplicada.");

server = substituirUma(
  server,
  "  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_pedido_itens (\n    id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n    pedidoId INT UNSIGNED NOT NULL,\n    codigo VARCHAR(100) NOT NULL,\n    item VARCHAR(500) NOT NULL,\n    quantidade INT NOT NULL,\n    valorUnitario DECIMAL(12,4) NOT NULL,\n    total DECIMAL(14,2) NOT NULL,\n    PRIMARY KEY (id), KEY idx_cp_pedido_item (pedidoId)\n  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);\n  ready = true;\n}",
  "  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_pedido_itens (\n    id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n    pedidoId INT UNSIGNED NOT NULL,\n    codigo VARCHAR(100) NOT NULL,\n    item VARCHAR(500) NOT NULL,\n    quantidade INT NOT NULL,\n    valorUnitario DECIMAL(12,4) NOT NULL,\n    total DECIMAL(14,2) NOT NULL,\n    PRIMARY KEY (id), KEY idx_cp_pedido_item (pedidoId)\n  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);\n\n  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_catalogo_cache (\n    id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n    codigo VARCHAR(100) NOT NULL,\n    fonte VARCHAR(40) NOT NULL,\n    status VARCHAR(30) NOT NULL,\n    descricao VARCHAR(500) NULL,\n    aplicacao TEXT NULL,\n    lado VARCHAR(10) NULL,\n    url TEXT NULL,\n    consultadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n    PRIMARY KEY (id),\n    UNIQUE KEY uq_cp_catalogo_codigo_fonte (codigo, fonte)\n  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);\n  ready = true;\n}",
  "tabela cache"
);

server = substituirUma(
  server,
  "async function quoteBook(name: string, items: Array<{ codigo: string; item: string }>) {",
  "\nfunction decodeHtml(v: string) {\n  return String(v || \"\")\n    .replace(/&amp;/gi, \"&\")\n    .replace(/&quot;/gi, '\"')\n    .replace(/&#39;/gi, \"'\")\n    .replace(/&lt;/gi, \"<\")\n    .replace(/&gt;/gi, \">\")\n    .replace(/&nbsp;/gi, \" \")\n    .replace(/&#x2F;/gi, \"/\");\n}\n\nfunction stripHtml(v: string) {\n  return decodeHtml(\n    String(v || \"\")\n      .replace(/<script[\\s\\S]*?<\\/script>/gi, \" \")\n      .replace(/<style[\\s\\S]*?<\\/style>/gi, \" \")\n      .replace(/<br\\s*\\/?>/gi, \" \")\n      .replace(/<\\/(td|th|tr|p|div|li|h1|h2|h3|h4)>/gi, \" \")\n      .replace(/<[^>]+>/g, \" \")\n  )\n    .replace(/\\s+/g, \" \")\n    .trim();\n}\n\nfunction escapeRegex(v: string) {\n  return v.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");\n}\n\nasync function fetchText(url: string, timeoutMs = 9000) {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), timeoutMs);\n\n  try {\n    const response = await fetch(url, {\n      signal: controller.signal,\n      headers: {\n        \"user-agent\":\n          \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36\",\n        \"accept-language\": \"pt-BR,pt;q=0.9,en;q=0.7\",\n      },\n    });\n\n    if (!response.ok) throw new Error(`HTTP ${response.status}`);\n    return await response.text();\n  } finally {\n    clearTimeout(timer);\n  }\n}\n\nfunction extrairUrlDuckDuckGo(html: string, dominio: string, trecho: string) {\n  const candidatos: string[] = [];\n\n  for (const match of html.matchAll(/href=[\"']([^\"']+)[\"']/gi)) {\n    let href = decodeHtml(match[1] || \"\");\n    if (!href) continue;\n\n    try {\n      if (href.startsWith(\"//\")) href = `https:${href}`;\n      const url = new URL(href, \"https://html.duckduckgo.com\");\n\n      if (url.hostname.includes(\"duckduckgo.com\")) {\n        const uddg = url.searchParams.get(\"uddg\");\n        if (uddg) href = decodeURIComponent(uddg);\n      }\n    } catch {}\n\n    if (\n      href.includes(dominio) &&\n      href.toLowerCase().includes(trecho.toLowerCase())\n    ) {\n      candidatos.push(href);\n    }\n  }\n\n  return candidatos[0] || null;\n}\n\nasync function localizarPerfectViaBusca(codigo: string) {\n  const q = `site:catalogo.perfectautomotive.com/new/detalhes.asp \"${codigo}\"`;\n  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;\n\n  try {\n    const html = await fetchText(url, 8000);\n    return extrairUrlDuckDuckGo(\n      html,\n      \"catalogo.perfectautomotive.com\",\n      \"/new/detalhes.asp\"\n    );\n  } catch {\n    return null;\n  }\n}\n\nfunction codigosPerfectNaPagina(html: string) {\n  const texto = stripHtml(html).toUpperCase();\n  const encontrados =\n    texto.match(/\\b[A-Z]{2,6}[A-Z0-9/-]*\\d[A-Z0-9/-]*\\b/g) || [];\n\n  return Array.from(\n    new Set(\n      encontrados\n        .map((x) => x.trim())\n        .filter(\n          (x) =>\n            x.length >= 5 &&\n            x.length <= 18 &&\n            !x.startsWith(\"HTTP\") &&\n            !x.startsWith(\"HTML\")\n        )\n    )\n  ).sort();\n}\n\nfunction detalhePerfectNaPagina(html: string, codigo: string) {\n  const alvo = codigo.toUpperCase();\n  const upper = html.toUpperCase();\n  const indice = upper.indexOf(alvo);\n\n  if (indice < 0) return null;\n\n  const inicio = Math.max(0, indice - 2600);\n  const fim = Math.min(html.length, indice + 2600);\n  const trecho = html.slice(inicio, fim);\n\n  const hrefs = Array.from(\n    trecho.matchAll(/href=[\"']([^\"']*detalhes\\.asp[^\"']*)[\"']/gi)\n  ).map((m) => decodeHtml(m[1] || \"\"));\n\n  if (!hrefs.length) return null;\n\n  const relativo = hrefs[hrefs.length - 1];\n\n  try {\n    return new URL(\n      relativo,\n      \"https://catalogo.perfectautomotive.com/new/\"\n    ).toString();\n  } catch {\n    return null;\n  }\n}\n\nasync function localizarPerfectViaCatalogo(codigo: string) {\n  const base =\n    \"https://catalogo.perfectautomotive.com/new/produtos.asp\" +\n    \"?cw_ie_tp=0&cw_ordenacao=cw-ordena-numero-produto&cw_pgAtual=\";\n\n  let primeira: string;\n\n  try {\n    primeira = await fetchText(`${base}1`);\n  } catch {\n    return null;\n  }\n\n  const paginas = Array.from(\n    primeira.matchAll(/cw_pgAtual=(\\d+)/gi),\n    (m) => Number(m[1])\n  ).filter((n) => Number.isFinite(n) && n > 0);\n\n  let baixo = 1;\n  let alto = paginas.length ? Math.max(...paginas) : 1800;\n  const alvo = codigo.toUpperCase();\n\n  for (let tentativa = 0; tentativa < 13 && baixo <= alto; tentativa += 1) {\n    const pagina = Math.floor((baixo + alto) / 2);\n\n    let html: string;\n    try {\n      html = pagina === 1 ? primeira : await fetchText(`${base}${pagina}`);\n    } catch {\n      return null;\n    }\n\n    const codigos = codigosPerfectNaPagina(html);\n    if (!codigos.length) return null;\n\n    if (codigos.includes(alvo)) {\n      return detalhePerfectNaPagina(html, alvo);\n    }\n\n    const primeiro = codigos[0];\n    const ultimo = codigos[codigos.length - 1];\n\n    if (alvo.localeCompare(primeiro) < 0) {\n      alto = pagina - 1;\n    } else if (alvo.localeCompare(ultimo) > 0) {\n      baixo = pagina + 1;\n    } else {\n      const direto = detalhePerfectNaPagina(html, alvo);\n      if (direto) return direto;\n      return null;\n    }\n  }\n\n  return null;\n}\n\nfunction resumirAplicacaoPerfect(texto: string) {\n  const normal = texto.replace(/\\s+/g, \" \");\n  const inicio = normal.toUpperCase().indexOf(\"MODELO\");\n\n  if (inicio < 0) return \"\";\n\n  const depois = normal.slice(inicio + \"MODELO\".length);\n  const fimConversao = depois.toUpperCase().search(\n    /N[º°]?\\s*CONVERS[AÃ]O|SUGEST[AÃ]O DE PRODUTOS/\n  );\n\n  const bruto =\n    fimConversao >= 0 ? depois.slice(0, fimConversao) : depois.slice(0, 1800);\n\n  return bruto\n    .replace(/\\bCOMPLEMENTO\\b/gi, \" \")\n    .replace(/\\bANO\\b/gi, \" \")\n    .replace(/\\bOBS\\b/gi, \" \")\n    .replace(/\\bDATA INCLUS[AÃ]O\\b/gi, \" \")\n    .replace(/\\+\\s*aplica[cç][oõ]es/gi, \" \")\n    .replace(/\\+\\s*montadoras/gi, \" \")\n    .replace(/(?:-\\s*){2,}/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .slice(0, 1200);\n}\n\nasync function consultarPerfect(codigoOriginal: string) {\n  const codigo = norm(codigoOriginal).replace(/\\s+/g, \"\");\n\n  let url = await localizarPerfectViaBusca(codigo);\n  if (!url) url = await localizarPerfectViaCatalogo(codigo);\n\n  if (!url) {\n    return {\n      codigo,\n      fonte: \"PERFECT\",\n      status: \"nao_localizado\" as const,\n      descricao: null,\n      aplicacao: null,\n      lado: null,\n      url: null,\n    };\n  }\n\n  let html: string;\n\n  try {\n    html = await fetchText(url, 10000);\n  } catch {\n    return {\n      codigo,\n      fonte: \"PERFECT\",\n      status: \"erro\" as const,\n      descricao: null,\n      aplicacao: null,\n      lado: null,\n      url,\n    };\n  }\n\n  const texto = stripHtml(html);\n  const reDescricao = new RegExp(\n    `${escapeRegex(codigo)}\\\\s+(.+?)\\\\s+C[oó]d\\\\.?\\\\s*Barras`,\n    \"i\"\n  );\n\n  const descricao = (texto.match(reDescricao)?.[1] || \"\")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .slice(0, 500);\n\n  if (!texto.toUpperCase().includes(codigo)) {\n    return {\n      codigo,\n      fonte: \"PERFECT\",\n      status: \"nao_localizado\" as const,\n      descricao: null,\n      aplicacao: null,\n      lado: null,\n      url,\n    };\n  }\n\n  const aplicacao = resumirAplicacaoPerfect(texto);\n  const descricaoNorm = norm(descricao);\n\n  const lado =\n    descricaoNorm.includes(\"LD/LE\") || descricaoNorm.includes(\"LE/LD\")\n      ? \"LD/LE\"\n      : /\\bLD\\b/.test(descricaoNorm) ||\n        descricaoNorm.includes(\"LADO DIREITO\")\n      ? \"LD\"\n      : /\\bLE\\b/.test(descricaoNorm) ||\n        descricaoNorm.includes(\"LADO ESQUERDO\")\n      ? \"LE\"\n      : null;\n\n  return {\n    codigo,\n    fonte: \"PERFECT\",\n    status: \"localizado\" as const,\n    descricao: descricao || null,\n    aplicacao: aplicacao || null,\n    lado,\n    url,\n  };\n}\n\nasync function quoteBook(name: string, items: Array<{ codigo: string; item: string }>) {",
  "helpers Perfect"
);

server = substituirUma(
  server,
  "  fornecedores: protectedProcedure.query(async ({ ctx }) => {",
  "\n  consultarCatalogoPerfect: protectedProcedure\n    .input(\n      z.object({\n        itens: z\n          .array(\n            z.object({\n              codigo: z.string().min(1).max(100),\n              grupo: z.string().min(1).max(80),\n            })\n          )\n          .min(1)\n          .max(120),\n        forcar: z.boolean().optional().default(false),\n      })\n    )\n    .mutation(async ({ ctx, input }) => {\n      assertCompras(ctx);\n      await ensure();\n\n      const permitidos = new Set([\n        \"PIVÔ\",\n        \"PIVO\",\n        \"TERMINAL AXIAL\",\n        \"TERMINAL DE DIREÇÃO\",\n        \"TERMINAL DE DIRECAO\",\n      ]);\n\n      const unicos = Array.from(\n        new Map(\n          input.itens\n            .filter((item) => permitidos.has(norm(item.grupo)))\n            .map((item) => [\n              norm(item.codigo).replace(/\\s+/g, \"\"),\n              {\n                codigo: norm(item.codigo).replace(/\\s+/g, \"\"),\n                grupo: item.grupo,\n              },\n            ])\n        ).values()\n      );\n\n      const resultados: any[] = [];\n\n      for (const item of unicos) {\n        if (!input.forcar) {\n          const [cache] = await db().query<any[]>(\n            `SELECT codigo, fonte, status, descricao, aplicacao, lado, url,\n                    consultadoEm, updatedAt\n             FROM compras_pecas_catalogo_cache\n             WHERE codigo = ? AND fonte = 'PERFECT'\n             LIMIT 1`,\n            [item.codigo]\n          );\n\n          if (cache.length && String(cache[0].status) === \"localizado\") {\n            resultados.push({\n              ...cache[0],\n              codigo: String(cache[0].codigo),\n              fonte: \"PERFECT\",\n            });\n            continue;\n          }\n        }\n\n        let resultado: any;\n\n        try {\n          resultado = await consultarPerfect(item.codigo);\n        } catch (error: any) {\n          resultado = {\n            codigo: item.codigo,\n            fonte: \"PERFECT\",\n            status: \"erro\",\n            descricao: null,\n            aplicacao: null,\n            lado: null,\n            url: null,\n            erro: error?.message || \"Falha na consulta\",\n          };\n        }\n\n        await db().query(\n          `INSERT INTO compras_pecas_catalogo_cache\n             (codigo, fonte, status, descricao, aplicacao, lado, url, consultadoEm)\n           VALUES (?, 'PERFECT', ?, ?, ?, ?, ?, NOW())\n           ON DUPLICATE KEY UPDATE\n             status = VALUES(status),\n             descricao = VALUES(descricao),\n             aplicacao = VALUES(aplicacao),\n             lado = VALUES(lado),\n             url = VALUES(url),\n             consultadoEm = NOW()`,\n          [\n            resultado.codigo,\n            resultado.status,\n            resultado.descricao,\n            resultado.aplicacao,\n            resultado.lado,\n            resultado.url,\n          ]\n        );\n\n        resultados.push(resultado);\n      }\n\n      return {\n        ok: true,\n        fonte: \"PERFECT\",\n        total: unicos.length,\n        localizados: resultados.filter(\n          (item) => item.status === \"localizado\"\n        ).length,\n        resultados,\n      };\n    }),\n\n\n  fornecedores: protectedProcedure.query(async ({ ctx }) => {",
  "rota Perfect"
);

page = substituirUma(
  page,
  "import * as XLSX from \"xlsx\";\nimport ComprasPecasCotacao from \"@/components/ComprasPecasCotacao\";",
  "import * as XLSX from \"xlsx\";\nimport ComprasPecasCotacao from \"@/components/ComprasPecasCotacao\";\nimport { trpc } from \"@/lib/trpc\";",
  "import trpc"
);

page = substituirUma(
  page,
  "  especificacaoStatus: \"pendente\" | \"confirmar_bandeja\" | \"confirmar_coxim\";\n  motivoRevisao: string | null;\n};",
  "  especificacaoStatus: \"pendente\" | \"confirmar_bandeja\" | \"confirmar_coxim\";\n  motivoRevisao: string | null;\n  especificacao?: string | null;\n  catalogoStatus?: \"pendente\" | \"localizado\" | \"nao_localizado\" | \"erro\";\n  catalogoFonte?: string | null;\n  catalogoUrl?: string | null;\n};",
  "tipo ItemPeca"
);

page = substituirUma(
  page,
  "export default function ComprasPecas() {\n  const [arquivoNome, setArquivoNome] = useState(\"\");\n  const [itens, setItens] = useState<ItemPeca[]>([]);\n  const [excluidos, setExcluidos] = useState<ItemPeca[]>([]);\n  const [erro, setErro] = useState(\"\");\n  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);\n",
  "export default function ComprasPecas() {\n  const [arquivoNome, setArquivoNome] = useState(\"\");\n  const [itens, setItens] = useState<ItemPeca[]>([]);\n  const [excluidos, setExcluidos] = useState<ItemPeca[]>([]);\n  const [erro, setErro] = useState(\"\");\n  const [mensagemCatalogo, setMensagemCatalogo] = useState(\"\");\n  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);\n\n  const consultarPerfectMutation =\n    trpc.compras.pecas.consultarCatalogoPerfect.useMutation({\n      onSuccess: (data) => {\n        const porCodigo = new Map(\n          (data.resultados || []).map((resultado: any) => [\n            normalizarTexto(resultado.codigo).replace(/\\s+/g, \"\"),\n            resultado,\n          ])\n        );\n\n        setItens((atuais) =>\n          atuais.map((item) => {\n            const resultado = porCodigo.get(\n              normalizarTexto(item.codigo).replace(/\\s+/g, \"\")\n            ) as any;\n\n            if (!resultado) return item;\n\n            const especificacao = [\n              resultado.descricao,\n              resultado.aplicacao,\n            ]\n              .filter(Boolean)\n              .join(\" • \");\n\n            return {\n              ...item,\n              especificacao: especificacao || null,\n              catalogoStatus: resultado.status,\n              catalogoFonte: resultado.fonte || \"PERFECT\",\n              catalogoUrl: resultado.url || null,\n              ladoIndividual:\n                resultado.lado === \"LD\" || resultado.lado === \"LE\"\n                  ? resultado.lado\n                  : item.ladoIndividual,\n            };\n          })\n        );\n\n        setMensagemCatalogo(\n          `Perfect: ${data.localizados}/${data.total} código(s) localizado(s).`\n        );\n      },\n      onError: (error) => {\n        setErro(\n          error.message ||\n            \"Não foi possível consultar o catálogo Perfect.\"\n        );\n      },\n    });\n",
  "mutation Perfect"
);

page = substituirUma(
  page,
  "      setArquivoNome(file.name);\n      setItens(encontrados);\n      setExcluidos([]);\n",
  "      setArquivoNome(file.name);\n      setItens(encontrados);\n      setExcluidos([]);\n      setMensagemCatalogo(\"\");\n\n      const itensPerfect = encontrados.filter((item) =>\n        [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(item.grupo)\n      );\n\n      if (itensPerfect.length) {\n        consultarPerfectMutation.mutate({\n          itens: itensPerfect.map((item) => ({\n            codigo: item.codigo,\n            grupo: item.grupo,\n          })),\n          forcar: false,\n        });\n      }\n",
  "auto consulta"
);

page = substituirUma(
  page,
  "              <div className=\"flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between\">\n                <div>\n                  <h2 className=\"font-black\">Análise da compra</h2>\n                  <p className=\"mt-1 text-xs text-gray-600\">\n                    A especificação pelo catálogo entra na próxima etapa.\n                  </p>\n                </div>\n\n                <label className=\"flex items-center gap-2 text-xs font-bold text-gray-400\">\n                  <input\n                    type=\"checkbox\"\n                    checked={mostrarSemCompra}\n                    onChange={(event) => setMostrarSemCompra(event.target.checked)}\n                  />\n                  Mostrar itens sem compra\n                </label>\n              </div>\n",
  "              <div className=\"flex flex-col gap-3 border-b border-white/[0.06] p-4 xl:flex-row xl:items-center xl:justify-between\">\n                <div>\n                  <h2 className=\"font-black\">Análise da compra</h2>\n                  <p className=\"mt-1 text-xs text-gray-600\">\n                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção.\n                  </p>\n                  {mensagemCatalogo && (\n                    <p className=\"mt-2 text-xs font-bold text-emerald-300\">\n                      {mensagemCatalogo}\n                    </p>\n                  )}\n                </div>\n\n                <div className=\"flex flex-wrap items-center gap-3\">\n                  <button\n                    type=\"button\"\n                    disabled={consultarPerfectMutation.isPending}\n                    onClick={() => {\n                      const itensPerfect = itens.filter((item) =>\n                        [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                          item.grupo\n                        )\n                      );\n\n                      if (itensPerfect.length) {\n                        consultarPerfectMutation.mutate({\n                          itens: itensPerfect.map((item) => ({\n                            codigo: item.codigo,\n                            grupo: item.grupo,\n                          })),\n                          forcar: true,\n                        });\n                      }\n                    }}\n                    className=\"h-9 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 text-[11px] font-black text-sky-200 disabled:opacity-50\"\n                  >\n                    {consultarPerfectMutation.isPending\n                      ? \"Consultando Perfect...\"\n                      : \"Consultar Perfect novamente\"}\n                  </button>\n\n                  <label className=\"flex items-center gap-2 text-xs font-bold text-gray-400\">\n                    <input\n                      type=\"checkbox\"\n                      checked={mostrarSemCompra}\n                      onChange={(event) =>\n                        setMostrarSemCompra(event.target.checked)\n                      }\n                    />\n                    Mostrar itens sem compra\n                  </label>\n                </div>\n              </div>\n",
  "cabeçalho análise"
);

page = substituirUma(
  page,
  "                        <td className=\"px-3 py-3\">\n                          {item.especificacaoStatus === \"pendente\" ? (\n                            <span className=\"text-gray-600\">Aguardando catálogo</span>\n                          ) : (\n                            <span className=\"inline-flex rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-black text-amber-200\">\n                              {item.motivoRevisao}\n                            </span>\n                          )}\n                        </td>",
  "                        <td className=\"px-3 py-3\">\n                          {item.catalogoStatus === \"localizado\" ? (\n                            <div className=\"max-w-[430px]\">\n                              <p className=\"font-bold leading-5 text-gray-200\">\n                                {item.especificacao}\n                              </p>\n                              <p className=\"mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-300\">\n                                {item.catalogoFonte}\n                              </p>\n                            </div>\n                          ) : item.catalogoStatus === \"nao_localizado\" ? (\n                            <span className=\"inline-flex rounded-full border border-rose-400/20 bg-rose-400/[0.05] px-2 py-1 font-black text-rose-200\">\n                              Código não localizado no Perfect\n                            </span>\n                          ) : item.catalogoStatus === \"erro\" ? (\n                            <span className=\"inline-flex rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-black text-amber-200\">\n                              Falha na consulta — tente novamente\n                            </span>\n                          ) : item.especificacaoStatus === \"pendente\" ? (\n                            <span className=\"text-gray-600\">\n                              {[\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                                item.grupo\n                              )\n                                ? \"Consultando Perfect...\"\n                                : \"Aguardando Sampel / Fras-le\"}\n                            </span>\n                          ) : (\n                            <span className=\"inline-flex rounded-full border border-amber-400/20 bg-amber-400/[0.05] px-2 py-1 font-black text-amber-200\">\n                              {item.motivoRevisao}\n                            </span>\n                          )}\n                        </td>",
  "célula especificação"
);

component = substituirUma(
  component,
  "        especificacao:x.motivoRevisao||null,",
  "        especificacao:x.especificacao||x.motivoRevisao||null,",
  "persistência da especificação"
);

for (const marcador of [
  "compras_pecas_catalogo_cache",
  "consultarCatalogoPerfect: protectedProcedure",
  "localizarPerfectViaBusca",
  "localizarPerfectViaCatalogo",
]) if (!server.includes(marcador)) falhar(`validação server falhou: ${marcador}`);

for (const marcador of [
  "consultarCatalogoPerfect.useMutation",
  "Consultar Perfect novamente",
  "Código não localizado no Perfect",
]) if (!page.includes(marcador)) falhar(`validação page falhou: ${marcador}`);

if (!component.includes("x.especificacao||x.motivoRevisao||null")) falhar("especificação não será persistida.");

const agora = new Date();
const carimbo = String(agora.getFullYear()) + String(agora.getMonth()+1).padStart(2,"0") + String(agora.getDate()).padStart(2,"0") + String(agora.getHours()).padStart(2,"0") + String(agora.getMinutes()).padStart(2,"0") + String(agora.getSeconds()).padStart(2,"0");
const backupDir = path.join(raiz, `.backup-compras-pecas-perfect-v3-${carimbo}`);
for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/pages/ComprasPecas.tsx", pagePath],
  ["client/src/components/ComprasPecasCotacao.tsx", componentPath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.perfect-v3.tmp`;
const tmpPage = `${pagePath}.perfect-v3.tmp`;
const tmpComponent = `${componentPath}.perfect-v3.tmp`;
try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");
  fs.writeFileSync(tmpComponent, montar(componentInfo, component), "utf8");
  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpPage, pagePath);
  fs.renameSync(tmpComponent, componentPath);
} catch (error) {
  for (const tmp of [tmpServer,tmpPage,tmpComponent]) if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  try {
    fs.copyFileSync(path.join(backupDir,"server/comprasPecas.ts"), serverPath);
    fs.copyFileSync(path.join(backupDir,"client/src/pages/ComprasPecas.tsx"), pagePath);
    fs.copyFileSync(path.join(backupDir,"client/src/components/ComprasPecasCotacao.tsx"), componentPath);
  } catch {}
  throw error;
}

console.log("");
console.log("✅ Compras > Peças • Catálogo Perfect V3 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("✅ Pivô, Terminal Axial e Terminal de Direção são consultados automaticamente.");
console.log("✅ Resultado fica em cache para não pesquisar o mesmo código toda vez.");
console.log("✅ Código não localizado fica identificado para exclusão/revisão.");
console.log("✅ Especificação localizada será salva junto com o planejamento.");
console.log("O patch NÃO fez commit.");