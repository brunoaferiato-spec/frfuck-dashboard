import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS PERFECT V3.3: ${msg}`);
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

const pageInfo = ler(pagePath);
let page = pageInfo.texto;

if (!page.includes("Se o índice rápido não encontrar")) {
  falhar("a V3.2 precisa estar aplicada antes desta correção.");
}
if (page.includes("consultarPerfectProgressivo")) {
  falhar("a V3.3 parece já estar aplicada.");
}

page = substituirUma(
  page,
  "  const [mensagemCatalogo, setMensagemCatalogo] = useState(\"\");\n  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);\n",
  "  const [mensagemCatalogo, setMensagemCatalogo] = useState(\"\");\n  const [catalogoProgresso, setCatalogoProgresso] = useState({\n    ativo: false,\n    concluidos: 0,\n    total: 0,\n  });\n  const [mostrarSemCompra, setMostrarSemCompra] = useState(true);\n",
  "estado de progresso"
);

page = substituirUma(
  page,
  "  const consultarPerfectMutation =\n    trpc.compras.pecas.consultarCatalogoPerfect.useMutation({\n      onSuccess: (data) => {\n        const porCodigo = new Map(\n          (data.resultados || []).map((resultado: any) => [\n            normalizarTexto(resultado.codigo).replace(/\\s+/g, \"\"),\n            resultado,\n          ])\n        );\n\n        setItens((atuais) =>\n          atuais.map((item) => {\n            const resultado = porCodigo.get(\n              normalizarTexto(item.codigo).replace(/\\s+/g, \"\")\n            ) as any;\n\n            if (!resultado) return item;\n\n            const especificacao = [\n              resultado.descricao,\n              resultado.aplicacao,\n            ]\n              .filter(Boolean)\n              .join(\" • \");\n\n            return {\n              ...item,\n              especificacao: especificacao || null,\n              catalogoStatus: resultado.status,\n              catalogoFonte: resultado.fonte || \"PERFECT\",\n              catalogoUrl: resultado.url || null,\n              ladoIndividual:\n                resultado.lado === \"LD\" || resultado.lado === \"LE\"\n                  ? resultado.lado\n                  : item.ladoIndividual,\n            };\n          })\n        );\n\n        setMensagemCatalogo(\n          `Perfect: ${data.localizados}/${data.total} código(s) localizado(s).`\n        );\n      },\n      onError: (error) => {\n        setErro(\n          error.message ||\n            \"Não foi possível consultar o catálogo Perfect.\"\n        );\n      },\n    });\n",
  "  const consultarPerfectMutation =\n    trpc.compras.pecas.consultarCatalogoPerfect.useMutation({\n      onSuccess: (data) => {\n        const porCodigo = new Map(\n          (data.resultados || []).map((resultado: any) => [\n            normalizarTexto(resultado.codigo).replace(/\\s+/g, \"\"),\n            resultado,\n          ])\n        );\n\n        setItens((atuais) =>\n          atuais.map((item) => {\n            const resultado = porCodigo.get(\n              normalizarTexto(item.codigo).replace(/\\s+/g, \"\")\n            ) as any;\n\n            if (!resultado) return item;\n\n            const especificacao = [\n              resultado.descricao,\n              resultado.aplicacao,\n            ]\n              .filter(Boolean)\n              .join(\" • \");\n\n            return {\n              ...item,\n              especificacao: especificacao || null,\n              catalogoStatus: resultado.status,\n              catalogoFonte: resultado.fonte || \"PERFECT\",\n              catalogoUrl: resultado.url || null,\n              ladoIndividual:\n                resultado.lado === \"LD\" || resultado.lado === \"LE\"\n                  ? resultado.lado\n                  : item.ladoIndividual,\n            };\n          })\n        );\n      },\n    });\n\n  function marcarErroPerfect(codigo: string) {\n    const chave = normalizarTexto(codigo).replace(/\\s+/g, \"\");\n\n    setItens((atuais) =>\n      atuais.map((item) =>\n        normalizarTexto(item.codigo).replace(/\\s+/g, \"\") === chave\n          ? {\n              ...item,\n              catalogoStatus: \"erro\",\n              catalogoFonte: \"PERFECT\",\n            }\n          : item\n      )\n    );\n  }\n\n  async function consultarPerfectProgressivo(\n    lista: ItemPeca[],\n    forcar: boolean\n  ) {\n    const permitidos = new Set([\n      \"Pivô\",\n      \"Terminal Axial\",\n      \"Terminal de Direção\",\n    ]);\n\n    const unicos = Array.from(\n      new Map(\n        lista\n          .filter(\n            (item) =>\n              item.quantidadeCompra > 0 &&\n              permitidos.has(item.grupo)\n          )\n          .map((item) => [\n            normalizarTexto(item.codigo).replace(/\\s+/g, \"\"),\n            item,\n          ])\n      ).values()\n    );\n\n    if (!unicos.length) {\n      setMensagemCatalogo(\"Nenhum item da Perfect para consultar.\");\n      return;\n    }\n\n    setErro(\"\");\n    setCatalogoProgresso({\n      ativo: true,\n      concluidos: 0,\n      total: unicos.length,\n    });\n    setMensagemCatalogo(\n      `Perfect: 0/${unicos.length} código(s) consultados.`\n    );\n\n    let cursor = 0;\n    let concluidos = 0;\n    let localizados = 0;\n    let erros = 0;\n\n    async function worker() {\n      while (true) {\n        const indice = cursor;\n        cursor += 1;\n\n        if (indice >= unicos.length) return;\n\n        const item = unicos[indice];\n\n        try {\n          const data = await consultarPerfectMutation.mutateAsync({\n            itens: [\n              {\n                codigo: item.codigo,\n                grupo: item.grupo,\n              },\n            ],\n            forcar,\n          });\n\n          localizados += Number(data.localizados || 0);\n\n          if (\n            (data.resultados || []).some(\n              (resultado: any) => resultado.status === \"erro\"\n            )\n          ) {\n            erros += 1;\n          }\n        } catch {\n          erros += 1;\n          marcarErroPerfect(item.codigo);\n        } finally {\n          concluidos += 1;\n\n          setCatalogoProgresso({\n            ativo: concluidos < unicos.length,\n            concluidos,\n            total: unicos.length,\n          });\n\n          setMensagemCatalogo(\n            `Perfect: ${concluidos}/${unicos.length} consultados • ${localizados} localizado(s)` +\n              (erros ? ` • ${erros} com falha` : \"\")\n          );\n        }\n      }\n    }\n\n    // Cada código termina e aparece na tela individualmente.\n    // Seis consultas simultâneas mantêm bom desempenho sem prender a interface.\n    const trabalhadores = Array.from(\n      { length: Math.min(6, unicos.length) },\n      () => worker()\n    );\n\n    await Promise.all(trabalhadores);\n\n    setCatalogoProgresso({\n      ativo: false,\n      concluidos: unicos.length,\n      total: unicos.length,\n    });\n  }\n",
  "consulta progressiva"
);

page = substituirUma(
  page,
  "      if (itensPerfect.length) {\n        consultarPerfectMutation.mutate({\n          itens: itensPerfect.map((item) => ({\n            codigo: item.codigo,\n            grupo: item.grupo,\n          })),\n          forcar: false,\n        });\n      }\n",
  "      if (itensPerfect.length) {\n        void consultarPerfectProgressivo(itensPerfect, false);\n      }\n",
  "consulta automática progressiva"
);

page = substituirUma(
  page,
  "                  <button\n                    type=\"button\"\n                    disabled={consultarPerfectMutation.isPending}\n                    onClick={() => {\n                      const itensPerfect = itens.filter(\n                        (item) =>\n                          item.quantidadeCompra > 0 &&\n                          [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                            item.grupo\n                          )\n                      );\n\n                      if (itensPerfect.length) {\n                        consultarPerfectMutation.mutate({\n                          itens: itensPerfect.map((item) => ({\n                            codigo: item.codigo,\n                            grupo: item.grupo,\n                          })),\n                          forcar: true,\n                        });\n                      }\n                    }}\n                    className=\"h-9 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 text-[11px] font-black text-sky-200 disabled:opacity-50\"\n                  >\n                    {consultarPerfectMutation.isPending\n                      ? \"Consultando Perfect...\"\n                      : \"Consultar Perfect novamente\"}\n                  </button>\n",
  "                  <button\n                    type=\"button\"\n                    disabled={catalogoProgresso.ativo}\n                    onClick={() => {\n                      const itensPerfect = itens.filter(\n                        (item) =>\n                          item.quantidadeCompra > 0 &&\n                          [\"Pivô\", \"Terminal Axial\", \"Terminal de Direção\"].includes(\n                            item.grupo\n                          )\n                      );\n\n                      if (itensPerfect.length) {\n                        void consultarPerfectProgressivo(itensPerfect, true);\n                      }\n                    }}\n                    className=\"h-9 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] px-3 text-[11px] font-black text-sky-200 disabled:opacity-50\"\n                  >\n                    {catalogoProgresso.ativo\n                      ? `Consultando Perfect... ${catalogoProgresso.concluidos}/${catalogoProgresso.total}`\n                      : \"Consultar Perfect novamente\"}\n                  </button>\n",
  "botão progressivo"
);

page = substituirUma(
  page,
  "                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção. Se o índice rápido não encontrar, o sistema pesquisa direto no catálogo por código.",
  "                    Perfect é consultado automaticamente para pivô, terminal axial e terminal de direção. Os resultados aparecem um por um conforme cada código termina.",
  "descrição do catálogo"
);

for (const marcador of [
  "consultarPerfectProgressivo",
  "catalogoProgresso",
  "Perfect: ${concluidos}/${unicos.length} consultados",
  "Math.min(6, unicos.length)",
]) {
  if (!page.includes(marcador)) falhar(`validação falhou: ${marcador}`);
}

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(raiz, `.backup-compras-pecas-perfect-v33-${carimbo}`);
const backup = path.join(backupDir, "client", "src", "pages", "ComprasPecas.tsx");
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(pagePath, backup);

const temporario = `${pagePath}.perfect-v33.tmp`;

try {
  fs.writeFileSync(temporario, montar(pageInfo, page), "utf8");
  fs.renameSync(temporario, pagePath);
} catch (error) {
  if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
  try { fs.copyFileSync(backup, pagePath); } catch {}
  throw error;
}

console.log("");
console.log("✅ Compras > Peças • Perfect V3.3 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Agora a consulta é progressiva:");
console.log("   - cada código é consultado separadamente");
console.log("   - os resultados aparecem linha por linha");
console.log("   - mostra progresso X/Y no botão");
console.log("   - uma falha não prende os demais códigos");
console.log("   - até 6 códigos são processados simultaneamente");
console.log("O patch NÃO fez commit.");