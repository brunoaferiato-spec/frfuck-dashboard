import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const componentPath = path.join(
  raiz,
  "client",
  "src",
  "components",
  "ComprasPecasCotacao.tsx"
);
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS V2.2: ${msg}`);
}

function ler(arquivo) {
  if (!fs.existsSync(arquivo)) {
    falhar(`arquivo não encontrado: ${arquivo}`);
  }
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
    falhar(`${rotulo}: esperava 1 ocorrência, encontrei ${total}.`);
  }
  return texto.replace(antigo, novo);
}

const serverInfo = ler(serverPath);
const componentInfo = ler(componentPath);
const pageInfo = ler(pagePath);

let server = serverInfo.texto;
let component = componentInfo.texto;
let page = pageInfo.texto;

if (!component.includes("Fluxo de fornecedores")) {
  falhar("não encontrei o fluxo de fornecedores da V2.");
}

// 1) Backend: permite alterar a quantidade já salva no planejamento.
if (!server.includes("atualizarQuantidade: protectedProcedure")) {
  const ancora = "  salvarCotacao: protectedProcedure";
  const pos = server.indexOf(ancora);
  if (pos < 0) falhar("não encontrei salvarCotacao no backend.");
  server =
    server.slice(0, pos) +
    "  atualizarQuantidade: protectedProcedure\n    .input(\n      z.object({\n        itemId: z.number().int().positive(),\n        quantidadeFinal: z.number().int().min(0).max(100000),\n      })\n    )\n    .mutation(async ({ ctx, input }) => {\n      assertCompras(ctx);\n      await ensure();\n\n      const [rows] = await db().query<any[]>(\n        `SELECT i.id, p.status\n         FROM compras_pecas_itens i\n         INNER JOIN compras_pecas_planejamentos p\n           ON p.id = i.planejamentoId\n         WHERE i.id = ?\n         LIMIT 1`,\n        [input.itemId]\n      );\n\n      if (!rows.length) {\n        throw new TRPCError({\n          code: \"NOT_FOUND\",\n          message: \"Item do planejamento não encontrado.\",\n        });\n      }\n\n      if (String(rows[0].status) === \"pedido_salvo\") {\n        throw new TRPCError({\n          code: \"BAD_REQUEST\",\n          message:\n            \"Esse planejamento já possui pedido salvo. Exclua/reabra o pedido antes de alterar a quantidade.\",\n        });\n      }\n\n      await db().query(\n        `UPDATE compras_pecas_itens\n         SET quantidadeFinal = ?\n         WHERE id = ?`,\n        [input.quantidadeFinal, input.itemId]\n      );\n\n      return {\n        ok: true,\n        itemId: input.itemId,\n        quantidadeFinal: input.quantidadeFinal,\n      };\n    }),\n\n" +
    server.slice(pos);
}

// 2) Cotação: campo editável em Qtd interna.
if (!component.includes("quantidadeLocal")) {
  component = substituirUma(
    component,
    "  const [local, setLocal] = useState<Record<string, string>>({});\n  const [mensagem, setMensagem] = useState(\"\");\n",
    "  const [local, setLocal] = useState<Record<string, string>>({});\n  const [quantidadeLocal, setQuantidadeLocal] = useState<Record<string, string>>({});\n  const [mensagem, setMensagem] = useState(\"\");\n",
    "estado quantidadeLocal"
  );
}

if (!component.includes("trpc.compras.pecas.atualizarQuantidade.useMutation")) {
  component = substituirUma(
    component,
    "  const salvarCotacao = trpc.compras.pecas.salvarCotacao.useMutation({ onSuccess:async()=>{await detalheQ.refetch();await planosQ.refetch();}, onError:(e)=>setErro(e.message) });\n",
    "  const atualizarQuantidade = trpc.compras.pecas.atualizarQuantidade.useMutation({\n    onSuccess: async (data) => {\n      setQuantidadeLocal((atual) => {\n        const novo = { ...atual };\n        delete novo[String(data.itemId)];\n        return novo;\n      });\n      setMensagem(`Quantidade atualizada para ${data.quantidadeFinal}.`);\n      setErro(\"\");\n      await detalheQ.refetch();\n      await planosQ.refetch();\n    },\n    onError: (e) => setErro(e.message),\n  });\n  const salvarCotacao = trpc.compras.pecas.salvarCotacao.useMutation({ onSuccess:async()=>{await detalheQ.refetch();await planosQ.refetch();}, onError:(e)=>setErro(e.message) });\n",
    "mutation atualizarQuantidade"
  );
}

if (!component.includes('title="Quantidade de compra editável"')) {
  component = substituirUma(
    component,
    "<td className=\"px-3 py-3 text-right font-black text-[#F2D675]\">{it.quantidadeFinal}</td>",
    "<td className=\"px-3 py-2 text-right\">\n  <input\n    type=\"number\"\n    min={0}\n    step={1}\n    inputMode=\"numeric\"\n    disabled={\n      atualizarQuantidade.isPending ||\n      detalheQ.data?.planejamento?.status === \"pedido_salvo\"\n    }\n    value={\n      quantidadeLocal[String(it.id)] !== undefined\n        ? quantidadeLocal[String(it.id)]\n        : String(it.quantidadeFinal ?? 0)\n    }\n    onChange={(e) => {\n      const valor = e.target.value.replace(/[^0-9]/g, \"\");\n      setQuantidadeLocal((atual) => ({\n        ...atual,\n        [String(it.id)]: valor,\n      }));\n    }}\n    onBlur={() => {\n      const chave = String(it.id);\n      const bruto =\n        quantidadeLocal[chave] !== undefined\n          ? quantidadeLocal[chave]\n          : String(it.quantidadeFinal ?? 0);\n      const quantidade = Math.max(0, Math.floor(Number(bruto || 0)));\n\n      if (quantidade !== Number(it.quantidadeFinal || 0)) {\n        atualizarQuantidade.mutate({\n          itemId: Number(it.id),\n          quantidadeFinal: quantidade,\n        });\n      } else {\n        setQuantidadeLocal((atual) => {\n          const novo = { ...atual };\n          delete novo[chave];\n          return novo;\n        });\n      }\n    }}\n    onKeyDown={(e) => {\n      if (e.key === \"Enter\") e.currentTarget.blur();\n    }}\n    className=\"h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none disabled:opacity-50\"\n    title=\"Quantidade de compra editável\"\n  />\n</td>",
    "Qtd interna editável"
  );
}

// 3) Análise inicial: quantidade também pode ser alterada ANTES de salvar.
if (!page.includes('title="Quantidade de compra editável"')) {
  page = substituirUma(
    page,
    "                        <td className=\"px-3 py-3 text-right\">\n                          <span\n                            className={`inline-flex min-w-[52px] justify-center rounded-lg px-2 py-1.5 font-black ${\n                              item.quantidadeCompra > 0\n                                ? \"bg-[#D4AF37]/10 text-[#F2D675]\"\n                                : \"bg-white/[0.03] text-gray-700\"\n                            }`}\n                          >\n                            {item.quantidadeCompra}\n                          </span>\n                        </td>",
    "                        <td className=\"px-3 py-2 text-right\">\n                          <input\n                            type=\"number\"\n                            min={0}\n                            step={1}\n                            inputMode=\"numeric\"\n                            value={item.quantidadeCompra}\n                            onChange={(event) => {\n                              const quantidade = Math.max(\n                                0,\n                                Math.floor(Number(event.target.value || 0))\n                              );\n\n                              setItens((atuais) =>\n                                atuais.map((atual) =>\n                                  atual.id === item.id\n                                    ? {\n                                        ...atual,\n                                        quantidadeCompra: quantidade,\n                                      }\n                                    : atual\n                                )\n                              );\n                            }}\n                            className=\"h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none\"\n                            title=\"Quantidade de compra editável\"\n                          />\n                        </td>",
    "Compra editável na análise"
  );
}

// 4) FORÇA o Fluxo de fornecedores para o topo.
// Remove todas as ocorrências atuais do componente na página.
const blocoCotacaoRegex =
  /\s*\{arquivoNome\s*&&\s*\(\s*<ComprasPecasCotacao\s+arquivoNome=\{arquivoNome\}\s+itens=\{itens\}\s*\/>\s*\)\}/g;

page = page.replace(blocoCotacaoRegex, "");

// Localiza a primeira seção principal da página (upload/planejamento).
const tituloPos = page.indexOf("Planejamento de peças");
if (tituloPos < 0) falhar("não encontrei Planejamento de peças.");

const secaoInicio = page.lastIndexOf("<section", tituloPos);
if (secaoInicio < 0) falhar("não encontrei a seção principal.");

const secaoFimTag = "</section>";
const secaoFim = page.indexOf(secaoFimTag, tituloPos);
if (secaoFim < 0) falhar("não encontrei o fim da seção principal.");

const inserirEm = secaoFim + secaoFimTag.length;

const blocoTopo = `

        {arquivoNome && (
          <ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />
        )}
`;

page = page.slice(0, inserirEm) + blocoTopo + page.slice(inserirEm);

// 5) Coloca uma indicação visual inequívoca no componente.
if (!component.includes("Quantidade de compra pode ser ajustada")) {
  component = component.replace(
    '<h2 className="mt-1 text-xl font-black">Fluxo de fornecedores</h2>',
    '<h2 className="mt-1 text-xl font-black">Fluxo de fornecedores</h2><p className="mt-1 text-xs text-gray-600">Quantidade de compra pode ser ajustada na coluna Qtd interna.</p>'
  );
}

// Validações antes da gravação.
const posFluxo = page.indexOf("<ComprasPecasCotacao");
const posAnalise = page.indexOf("Análise da compra");

if (posFluxo < 0 || posAnalise < 0 || posFluxo > posAnalise) {
  falhar("o Fluxo de fornecedores ainda não ficou acima da Análise da compra.");
}

const totalComponentes =
  (page.match(/<ComprasPecasCotacao\b/g) || []).length;

if (totalComponentes !== 1) {
  falhar(`esperava 1 ComprasPecasCotacao na página, encontrei ${totalComponentes}.`);
}

for (const marcador of [
  "atualizarQuantidade: protectedProcedure",
  "quantidadeLocal",
  "Quantidade de compra pode ser ajustada",
]) {
  if (!(server + component).includes(marcador)) {
    falhar(`validação falhou: ${marcador}`);
  }
}

if (!page.includes('title="Quantidade de compra editável"')) {
  falhar("a quantidade editável não entrou na Análise da compra.");
}

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(raiz, `.backup-compras-pecas-v22-${carimbo}`);

for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/components/ComprasPecasCotacao.tsx", componentPath],
  ["client/src/pages/ComprasPecas.tsx", pagePath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.v22.tmp`;
const tmpComponent = `${componentPath}.v22.tmp`;
const tmpPage = `${pagePath}.v22.tmp`;

try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpComponent, montar(componentInfo, component), "utf8");
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");

  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpComponent, componentPath);
  fs.renameSync(tmpPage, pagePath);
} catch (error) {
  for (const tmp of [tmpServer, tmpComponent, tmpPage]) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }

  try {
    fs.copyFileSync(
      path.join(backupDir, "server/comprasPecas.ts"),
      serverPath
    );
    fs.copyFileSync(
      path.join(
        backupDir,
        "client/src/components/ComprasPecasCotacao.tsx"
      ),
      componentPath
    );
    fs.copyFileSync(
      path.join(backupDir, "client/src/pages/ComprasPecas.tsx"),
      pagePath
    );
  } catch {}

  throw error;
}

console.log("");
console.log("✅ Compras > Peças V2.2 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Agora:");
console.log("   - Fluxo de fornecedores fica logo abaixo do cabeçalho/importação");
console.log("   - não existe segunda cópia do fluxo no fim da página");
console.log("   - Compra é editável na análise, antes de salvar");
console.log("   - Qtd interna é editável na cotação, depois de salvar");
console.log("   - alteração na cotação persiste no banco");
console.log("   - pedido já fechado continua protegido");
console.log("");
console.log("O patch NÃO fez commit.");
