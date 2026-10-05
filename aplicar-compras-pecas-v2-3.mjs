import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const serverPath = path.join(raiz, "server", "comprasPecas.ts");
const componentPath = path.join(raiz, "client", "src", "components", "ComprasPecasCotacao.tsx");

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS V2.3: ${msg}`);
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
  return texto.replace(antigo, novo);
}

const serverInfo = ler(serverPath);
const componentInfo = ler(componentPath);
let server = serverInfo.texto;
let component = componentInfo.texto;

if (!server.includes("atualizarQuantidade: protectedProcedure")) {
  falhar("a V2.2 precisa estar aplicada antes desta etapa.");
}

if (server.includes("excluirPlanejamento: protectedProcedure") || component.includes("Cidade da compra")) {
  falhar("a V2.3 parece já estar aplicada.");
}

server = substituirUma(
  server,
  "  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_planejamentos (\n    id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n    status VARCHAR(30) NOT NULL DEFAULT 'planejamento',\n    arquivoNome VARCHAR(255) NULL,\n    criadoPorNome VARCHAR(160) NULL,\n    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n    PRIMARY KEY (id), KEY idx_cp_plan_created (createdAt)\n  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);\n",
  "  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_planejamentos (\n    id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n    lojaId INT UNSIGNED NULL,\n    lojaNome VARCHAR(120) NULL,\n    status VARCHAR(30) NOT NULL DEFAULT 'planejamento',\n    arquivoNome VARCHAR(255) NULL,\n    criadoPorNome VARCHAR(160) NULL,\n    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n    PRIMARY KEY (id), KEY idx_cp_plan_created (createdAt)\n  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);\n\n  try {\n    await p.query(\n      `ALTER TABLE compras_pecas_planejamentos\n       ADD COLUMN lojaId INT UNSIGNED NULL AFTER id`\n    );\n  } catch (error: any) {\n    if (error?.code !== \"ER_DUP_FIELDNAME\") throw error;\n  }\n\n  try {\n    await p.query(\n      `ALTER TABLE compras_pecas_planejamentos\n       ADD COLUMN lojaNome VARCHAR(120) NULL AFTER lojaId`\n    );\n  } catch (error: any) {\n    if (error?.code !== \"ER_DUP_FIELDNAME\") throw error;\n  }\n",
  "cidade na tabela de planejamentos"
);

server = substituirUma(
  server,
  "  criarPlanejamento: protectedProcedure.input(z.object({ arquivoNome: z.string().max(255).nullable().optional(), itens: z.array(itemSchema).min(1).max(5000) })).mutation(async ({ ctx, input }) => {\n    assertCompras(ctx); await ensure();\n    const buy = input.itens.filter((x) => x.quantidadeFinal > 0);\n    if (!buy.length) throw new TRPCError({ code: \"BAD_REQUEST\", message: \"Não há itens para cotação.\" });\n    const c = await db().getConnection();\n    try {\n      await c.beginTransaction();\n      const [r] = await c.query<any>(`INSERT INTO compras_pecas_planejamentos (status,arquivoNome,criadoPorNome) VALUES ('planejamento',?,?)`, [input.arquivoNome || null, String(ctx?.user?.name || \"Usuário\")]);\n      const id = Number(r.insertId);\n",
  "  criarPlanejamento: protectedProcedure.input(z.object({\n    lojaId: z.number().int().positive(),\n    lojaNome: z.string().trim().min(2).max(120),\n    arquivoNome: z.string().max(255).nullable().optional(),\n    itens: z.array(itemSchema).min(1).max(5000)\n  })).mutation(async ({ ctx, input }) => {\n    assertCompras(ctx); await ensure();\n    const buy = input.itens.filter((x) => x.quantidadeFinal > 0);\n    if (!buy.length) throw new TRPCError({ code: \"BAD_REQUEST\", message: \"Não há itens para cotação.\" });\n    const c = await db().getConnection();\n    try {\n      await c.beginTransaction();\n      const [r] = await c.query<any>(\n        `INSERT INTO compras_pecas_planejamentos\n           (lojaId,lojaNome,status,arquivoNome,criadoPorNome)\n         VALUES (?,?,'planejamento',?,?)`,\n        [\n          input.lojaId,\n          input.lojaNome,\n          input.arquivoNome || null,\n          String(ctx?.user?.name || \"Usuário\")\n        ]\n      );\n      const id = Number(r.insertId);\n",
  "cidade ao salvar planejamento"
);

server = substituirUma(
  server,
  "    const [rows] = await db().query<any[]>(`SELECT p.id,p.status,p.arquivoNome,p.createdAt,COUNT(i.id) totalItens,COALESCE(SUM(i.quantidadeFinal),0) totalQuantidade FROM compras_pecas_planejamentos p LEFT JOIN compras_pecas_itens i ON i.planejamentoId=p.id GROUP BY p.id ORDER BY p.createdAt DESC,p.id DESC LIMIT 100`);",
  "    const [rows] = await db().query<any[]>(`SELECT p.id,p.lojaId,p.lojaNome,p.status,p.arquivoNome,p.createdAt,COUNT(i.id) totalItens,COALESCE(SUM(i.quantidadeFinal),0) totalQuantidade FROM compras_pecas_planejamentos p LEFT JOIN compras_pecas_itens i ON i.planejamentoId=p.id GROUP BY p.id ORDER BY p.createdAt DESC,p.id DESC LIMIT 100`);",
  "cidade no histórico"
);

server = substituirUma(
  server,
  "  pedidos: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).query(async({ctx,input})=>{",
  "  excluirPedidosPlanejamento: protectedProcedure\n    .input(z.object({ planejamentoId: z.number().int().positive() }))\n    .mutation(async ({ ctx, input }) => {\n      assertCompras(ctx);\n      await ensure();\n      const c = await db().getConnection();\n\n      try {\n        await c.beginTransaction();\n\n        const [pedidos] = await c.query<any[]>(\n          `SELECT id\n           FROM compras_pecas_pedidos\n           WHERE planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE pi\n           FROM compras_pecas_pedido_itens pi\n           INNER JOIN compras_pecas_pedidos p ON p.id = pi.pedidoId\n           WHERE p.planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE FROM compras_pecas_pedidos\n           WHERE planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        const [cotacoes] = await c.query<any[]>(\n          `SELECT COUNT(*) AS total\n           FROM compras_pecas_cotacoes c\n           INNER JOIN compras_pecas_itens i ON i.id = c.itemId\n           WHERE i.planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        const novoStatus =\n          Number(cotacoes[0]?.total || 0) > 0 ? \"cotacao\" : \"planejamento\";\n\n        await c.query(\n          `UPDATE compras_pecas_planejamentos\n           SET status = ?\n           WHERE id = ?`,\n          [novoStatus, input.planejamentoId]\n        );\n\n        await c.commit();\n\n        return {\n          ok: true,\n          excluidos: pedidos.length,\n          planejamentoId: input.planejamentoId,\n          novoStatus,\n        };\n      } catch (error) {\n        await c.rollback();\n        throw error;\n      } finally {\n        c.release();\n      }\n    }),\n\n  excluirPlanejamento: protectedProcedure\n    .input(z.object({ planejamentoId: z.number().int().positive() }))\n    .mutation(async ({ ctx, input }) => {\n      assertCompras(ctx);\n      await ensure();\n      const c = await db().getConnection();\n\n      try {\n        await c.beginTransaction();\n\n        const [planos] = await c.query<any[]>(\n          `SELECT id\n           FROM compras_pecas_planejamentos\n           WHERE id = ?\n           LIMIT 1`,\n          [input.planejamentoId]\n        );\n\n        if (!planos.length) {\n          throw new TRPCError({\n            code: \"NOT_FOUND\",\n            message: \"Planejamento não encontrado.\",\n          });\n        }\n\n        await c.query(\n          `DELETE pi\n           FROM compras_pecas_pedido_itens pi\n           INNER JOIN compras_pecas_pedidos p ON p.id = pi.pedidoId\n           WHERE p.planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE FROM compras_pecas_pedidos\n           WHERE planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE c\n           FROM compras_pecas_cotacoes c\n           INNER JOIN compras_pecas_itens i ON i.id = c.itemId\n           WHERE i.planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE FROM compras_pecas_itens\n           WHERE planejamentoId = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.query(\n          `DELETE FROM compras_pecas_planejamentos\n           WHERE id = ?`,\n          [input.planejamentoId]\n        );\n\n        await c.commit();\n\n        return {\n          ok: true,\n          planejamentoId: input.planejamentoId,\n        };\n      } catch (error) {\n        await c.rollback();\n        throw error;\n      } finally {\n        c.release();\n      }\n    }),\n\n  pedidos: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).query(async({ctx,input})=>{",
  "rotas de exclusão"
);

component = substituirUma(
  component,
  "import { Check, Download, Save, Settings2, Upload, X } from \"lucide-react\";",
  "import { Check, Download, MapPin, Save, Settings2, Trash2, Upload, X } from \"lucide-react\";",
  "ícones"
);

component = substituirUma(
  component,
  "type Aba = \"cotacao\" | \"pedidos\" | \"historico\" | \"fornecedores\";\n",
  "type Aba = \"cotacao\" | \"pedidos\" | \"historico\" | \"fornecedores\";\n\nconst LOJAS_PECAS = [\n  { id: 1, nome: \"Joinville\" },\n  { id: 2, nome: \"Blumenau\" },\n  { id: 3, nome: \"São José\" },\n  { id: 4, nome: \"Florianópolis\" },\n  { id: 6, nome: \"São Leopoldo\" },\n  { id: 7, nome: \"Gravataí\" },\n] as const;\n",
  "lista de cidades"
);

component = substituirUma(
  component,
  "  const [quantidadeLocal, setQuantidadeLocal] = useState<Record<string, string>>({});\n  const [mensagem, setMensagem] = useState(\"\");\n",
  "  const [quantidadeLocal, setQuantidadeLocal] = useState<Record<string, string>>({});\n  const [lojaId, setLojaId] = useState(\"1\");\n  const [filtroLojaHistorico, setFiltroLojaHistorico] = useState(\"todas\");\n  const [mensagem, setMensagem] = useState(\"\");\n",
  "estados de cidade"
);

component = substituirUma(
  component,
  "  const fornecedoresQ = trpc.compras.pecas.fornecedores.useQuery();\n  const planosQ = trpc.compras.pecas.planejamentos.useQuery();\n",
  "  const lojasQ = trpc.lojas.list.useQuery(undefined, { retry: false });\n  const fornecedoresQ = trpc.compras.pecas.fornecedores.useQuery();\n  const planosQ = trpc.compras.pecas.planejamentos.useQuery();\n\n  const lojas = useMemo(() => {\n    const recebidas = (lojasQ.data || []) as Array<{ id: number; nome: string }>;\n    const porId = new Map(recebidas.map((loja) => [Number(loja.id), loja]));\n\n    return LOJAS_PECAS.map((loja) => {\n      const recebida = porId.get(loja.id);\n      return recebida\n        ? {\n            ...loja,\n            ...recebida,\n            id: Number(recebida.id),\n            nome: recebida.nome || loja.nome,\n          }\n        : { ...loja };\n    });\n  }, [lojasQ.data]);\n\n  const lojaSelecionada =\n    lojas.find((loja) => Number(loja.id) === Number(lojaId)) || lojas[0];\n\n  const planosHistorico = useMemo(\n    () =>\n      (planosQ.data || []).filter(\n        (plano: any) =>\n          filtroLojaHistorico === \"todas\" ||\n          Number(plano.lojaId || 0) === Number(filtroLojaHistorico)\n      ),\n    [planosQ.data, filtroLojaHistorico]\n  );\n",
  "queries e filtro de cidades"
);

component = substituirUma(
  component,
  "  const arquivoPedido = trpc.compras.pecas.arquivoPedido.useMutation({ onSuccess:(d)=>baixar(d.nome,d.mime,d.base64), onError:(e)=>setErro(e.message) });\n",
  "  const arquivoPedido = trpc.compras.pecas.arquivoPedido.useMutation({ onSuccess:(d)=>baixar(d.nome,d.mime,d.base64), onError:(e)=>setErro(e.message) });\n\n  const excluirPedidos = trpc.compras.pecas.excluirPedidosPlanejamento.useMutation({\n    onSuccess: async (data) => {\n      setMensagem(\n        `${data.excluidos || 0} pedido(s) excluído(s). A cotação foi reaberta.`\n      );\n      setErro(\"\");\n      await pedidosQ.refetch();\n      await detalheQ.refetch();\n      await planosQ.refetch();\n      setAba(\"cotacao\");\n    },\n    onError: (e) => setErro(e.message),\n  });\n\n  const excluirPlanejamento = trpc.compras.pecas.excluirPlanejamento.useMutation({\n    onSuccess: async (data) => {\n      setMensagem(`Planejamento #${data.planejamentoId} excluído.`);\n      setErro(\"\");\n      if (planejamentoId === Number(data.planejamentoId)) {\n        setPlanejamentoId(null);\n      }\n      await planosQ.refetch();\n      setAba(\"historico\");\n    },\n    onError: (e) => setErro(e.message),\n  });\n",
  "mutations de exclusão"
);

component = substituirUma(
  component,
  "  function salvarPlanejamento(){\n    criarPlano.mutate({ arquivoNome: arquivoNome || null, itens: itens.map((x)=>({ codigo:x.codigo,item:x.item,grupo:x.grupo,especificacao:x.motivoRevisao||null,vendaPeriodo:Number(x.vendaPeriodo||0),estoqueAtual:Number(x.estoqueAtual||0),necessidade:Number(x.necessidadeBruta||0),quantidadeFinal:Number(x.quantidadeCompra||0),lado:x.ladoIndividual||null })) });\n  }\n",
  "  function salvarPlanejamento(){\n    if (!lojaSelecionada) {\n      setErro(\"Selecione a cidade da compra.\");\n      return;\n    }\n\n    criarPlano.mutate({\n      lojaId: Number(lojaSelecionada.id),\n      lojaNome: lojaSelecionada.nome,\n      arquivoNome: arquivoNome || null,\n      itens: itens.map((x)=>({\n        codigo:x.codigo,\n        item:x.item,\n        grupo:x.grupo,\n        especificacao:x.motivoRevisao||null,\n        vendaPeriodo:Number(x.vendaPeriodo||0),\n        estoqueAtual:Number(x.estoqueAtual||0),\n        necessidade:Number(x.necessidadeBruta||0),\n        quantidadeFinal:Number(x.quantidadeCompra||0),\n        lado:x.ladoIndividual||null\n      }))\n    });\n  }\n",
  "salvar cidade no planejamento"
);

component = substituirUma(
  component,
  "    <div className=\"flex flex-wrap items-center justify-between gap-3\">\n      <div><p className=\"text-xs font-black uppercase tracking-[0.15em] text-[#D4AF37]/60\">COTAÇÃO E PEDIDOS</p><h2 className=\"mt-1 text-xl font-black\">Fluxo de fornecedores</h2><p className=\"mt-1 text-xs text-gray-600\">Quantidade de compra pode ser ajustada na coluna Qtd interna.</p></div>\n      {!planejamentoId && <button type=\"button\" onClick={salvarPlanejamento} disabled={criarPlano.isPending} className=\"h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50\"><Save className=\"mr-2 inline h-4 w-4\"/>Salvar planejamento</button>}\n    </div>\n",
  "    <div className=\"flex flex-wrap items-end justify-between gap-3\">\n      <div>\n        <p className=\"text-xs font-black uppercase tracking-[0.15em] text-[#D4AF37]/60\">COTAÇÃO E PEDIDOS</p>\n        <h2 className=\"mt-1 text-xl font-black\">Fluxo de fornecedores</h2>\n        <p className=\"mt-1 text-xs text-gray-600\">Quantidade de compra pode ser ajustada na coluna Qtd interna.</p>\n      </div>\n\n      <div className=\"flex flex-wrap items-end gap-2\">\n        <div>\n          <label className=\"mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600\">\n            Cidade da compra\n          </label>\n          <div className=\"relative\">\n            <MapPin className=\"pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#D4AF37]\" />\n            <select\n              value={lojaId}\n              disabled={Boolean(planejamentoId)}\n              onChange={(e) => setLojaId(e.target.value)}\n              className=\"h-11 min-w-[190px] rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm font-bold text-white disabled:opacity-60\"\n            >\n              {lojas.map((loja) => (\n                <option key={loja.id} value={String(loja.id)}>\n                  {loja.nome}\n                </option>\n              ))}\n            </select>\n          </div>\n        </div>\n\n        {!planejamentoId && (\n          <button\n            type=\"button\"\n            onClick={salvarPlanejamento}\n            disabled={criarPlano.isPending || !lojaSelecionada}\n            className=\"h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50\"\n          >\n            <Save className=\"mr-2 inline h-4 w-4\"/>\n            Salvar planejamento\n          </button>\n        )}\n\n        {planejamentoId && (\n          <div className=\"h-11 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-4 py-3 text-xs font-black text-[#F2D675]\">\n            {detalheQ.data?.planejamento?.lojaNome || lojaSelecionada?.nome || \"Cidade\"}\n          </div>\n        )}\n      </div>\n    </div>\n",
  "seletor de cidade"
);

component = substituirUma(
  component,
  "    {aba==='pedidos' && <div className=\"mt-5\">{!planejamentoId?<div className=\"text-gray-500\">Abra um planejamento pelo Histórico.</div>:(pedidosQ.data||[]).length===0?<div className=\"rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500\">Nenhum pedido salvo.</div>:<div className=\"grid gap-3 lg:grid-cols-3\">{(pedidosQ.data||[]).map((p:any)=><div key={p.id} className=\"rounded-2xl border border-white/[0.07] p-4\"><p className=\"text-xs text-gray-600\">Fornecedor</p><h3 className=\"mt-1 text-xl font-black\">{p.fornecedorNome}</h3><p className=\"mt-3 text-sm text-gray-500\">{p.totalItens} itens • {p.totalQuantidade} unidades</p><p className=\"mt-2 text-2xl font-black text-[#F2D675]\">{moeda(p.totalValor)}</p><button type=\"button\" onClick={()=>arquivoPedido.mutate({pedidoId:Number(p.id)})} className=\"mt-4 h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black\"><Download className=\"mr-2 inline h-4 w-4\"/>Baixar pedido</button></div>)}</div>}</div>}\n",
  "    {aba==='pedidos' && <div className=\"mt-5\">\n      {!planejamentoId ? (\n        <div className=\"text-gray-500\">Abra um planejamento pelo Histórico.</div>\n      ) : (pedidosQ.data||[]).length===0 ? (\n        <div className=\"rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500\">Nenhum pedido salvo.</div>\n      ) : (\n        <>\n          <div className=\"mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4\">\n            <div>\n              <p className=\"font-black text-white\">\n                {detalheQ.data?.planejamento?.lojaNome || \"Cidade não informada\"}\n              </p>\n              <p className=\"mt-1 text-xs text-gray-600\">\n                Se precisar corrigir quantidades ou fornecedores, exclua os pedidos e reabra a cotação.\n              </p>\n            </div>\n            <button\n              type=\"button\"\n              disabled={excluirPedidos.isPending}\n              onClick={() => {\n                if (\n                  window.confirm(\n                    `Excluir todos os pedidos do Planejamento #${planejamentoId}? A cotação será mantida e poderá ser refeita.`\n                  )\n                ) {\n                  excluirPedidos.mutate({ planejamentoId });\n                }\n              }}\n              className=\"h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 text-xs font-black text-rose-300 disabled:opacity-50\"\n            >\n              <Trash2 className=\"mr-2 inline h-4 w-4\"/>\n              Excluir pedidos e reabrir cotação\n            </button>\n          </div>\n\n          <div className=\"grid gap-3 lg:grid-cols-3\">\n            {(pedidosQ.data||[]).map((p:any)=><div key={p.id} className=\"rounded-2xl border border-white/[0.07] p-4\"><p className=\"text-xs text-gray-600\">Fornecedor</p><h3 className=\"mt-1 text-xl font-black\">{p.fornecedorNome}</h3><p className=\"mt-3 text-sm text-gray-500\">{p.totalItens} itens • {p.totalQuantidade} unidades</p><p className=\"mt-2 text-2xl font-black text-[#F2D675]\">{moeda(p.totalValor)}</p><button type=\"button\" onClick={()=>arquivoPedido.mutate({pedidoId:Number(p.id)})} className=\"mt-4 h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black\"><Download className=\"mr-2 inline h-4 w-4\"/>Baixar pedido</button></div>)}\n          </div>\n        </>\n      )}\n    </div>}\n",
  "exclusão de pedidos"
);

component = substituirUma(
  component,
  "    {aba==='historico' && <div className=\"mt-5 grid gap-3 lg:grid-cols-3\">{(planosQ.data||[]).map((p:any)=><button type=\"button\" key={p.id} onClick={()=>{setPlanejamentoId(Number(p.id));setAba(p.status==='pedido_salvo'?'pedidos':'cotacao');}} className=\"rounded-2xl border border-white/[0.07] p-4 text-left\"><p className=\"font-black\">Planejamento #{p.id}</p><p className=\"mt-2 text-xs text-gray-500\">{p.totalItens} itens • {p.totalQuantidade} unidades</p><p className=\"mt-2 text-[11px] font-bold text-[#F2D675]\">{p.status==='pedido_salvo'?'Pedido salvo':p.status==='cotacao'?'Em cotação':'Planejamento'}</p><p className=\"mt-2 text-[11px] text-gray-600\">{new Date(p.createdAt).toLocaleString('pt-BR')}</p></button>)}</div>}\n",
  "    {aba==='historico' && <div className=\"mt-5\">\n      <div className=\"mb-4 flex flex-wrap items-end justify-between gap-3\">\n        <div>\n          <p className=\"text-xs font-black uppercase tracking-[0.08em] text-gray-600\">\n            Filtrar por cidade\n          </p>\n          <select\n            value={filtroLojaHistorico}\n            onChange={(e) => setFiltroLojaHistorico(e.target.value)}\n            className=\"mt-1 h-10 min-w-[190px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white\"\n          >\n            <option value=\"todas\">Todas as cidades</option>\n            {lojas.map((loja) => (\n              <option key={loja.id} value={String(loja.id)}>\n                {loja.nome}\n              </option>\n            ))}\n          </select>\n        </div>\n      </div>\n\n      <div className=\"grid gap-3 lg:grid-cols-3\">\n        {planosHistorico.map((p:any)=><div key={p.id} className=\"rounded-2xl border border-white/[0.07] p-4\">\n          <button\n            type=\"button\"\n            onClick={()=>{\n              setPlanejamentoId(Number(p.id));\n              if (p.lojaId) setLojaId(String(p.lojaId));\n              setAba(p.status==='pedido_salvo'?'pedidos':'cotacao');\n            }}\n            className=\"block w-full text-left\"\n          >\n            <div className=\"flex items-start justify-between gap-3\">\n              <p className=\"font-black\">Planejamento #{p.id}</p>\n              <span className=\"rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-2 py-1 text-[9px] font-black text-[#F2D675]\">\n                {p.lojaNome || \"Sem cidade\"}\n              </span>\n            </div>\n            <p className=\"mt-2 text-xs text-gray-500\">{p.totalItens} itens • {p.totalQuantidade} unidades</p>\n            <p className=\"mt-2 text-[11px] font-bold text-[#F2D675]\">{p.status==='pedido_salvo'?'Pedido salvo':p.status==='cotacao'?'Em cotação':'Planejamento'}</p>\n            <p className=\"mt-2 text-[11px] text-gray-600\">{new Date(p.createdAt).toLocaleString('pt-BR')}</p>\n          </button>\n\n          <div className=\"mt-4 flex flex-wrap gap-2 border-t border-white/[0.05] pt-3\">\n            {p.status === 'pedido_salvo' && (\n              <button\n                type=\"button\"\n                disabled={excluirPedidos.isPending}\n                onClick={() => {\n                  if (\n                    window.confirm(\n                      `Excluir os pedidos do Planejamento #${p.id}? A cotação será mantida.`\n                    )\n                  ) {\n                    setPlanejamentoId(Number(p.id));\n                    if (p.lojaId) setLojaId(String(p.lojaId));\n                    excluirPedidos.mutate({ planejamentoId: Number(p.id) });\n                  }\n                }}\n                className=\"h-9 rounded-lg border border-rose-400/20 px-3 text-[11px] font-black text-rose-200 disabled:opacity-50\"\n              >\n                Excluir pedido(s)\n              </button>\n            )}\n\n            <button\n              type=\"button\"\n              disabled={excluirPlanejamento.isPending}\n              onClick={() => {\n                if (\n                  window.confirm(\n                    `Excluir o Planejamento #${p.id}? Isso também excluirá cotações e pedidos vinculados.`\n                  )\n                ) {\n                  excluirPlanejamento.mutate({\n                    planejamentoId: Number(p.id),\n                  });\n                }\n              }}\n              className=\"h-9 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 text-[11px] font-black text-rose-300 disabled:opacity-50\"\n            >\n              <Trash2 className=\"mr-1.5 inline h-3.5 w-3.5\"/>\n              Excluir planejamento\n            </button>\n          </div>\n        </div>)}\n      </div>\n    </div>}\n",
  "histórico com cidade e exclusões"
);

for (const marcador of [
  "lojaId INT UNSIGNED NULL",
  "excluirPedidosPlanejamento: protectedProcedure",
  "excluirPlanejamento: protectedProcedure",
]) {
  if (!server.includes(marcador)) falhar(`validação backend falhou: ${marcador}`);
}

for (const marcador of [
  "Cidade da compra",
  "Todas as cidades",
  "Excluir planejamento",
  "Excluir pedidos e reabrir cotação",
]) {
  if (!component.includes(marcador)) falhar(`validação frontend falhou: ${marcador}`);
}

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(raiz, `.backup-compras-pecas-v23-${carimbo}`);
for (const [relativo, origem] of [
  ["server/comprasPecas.ts", serverPath],
  ["client/src/components/ComprasPecasCotacao.tsx", componentPath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpServer = `${serverPath}.v23.tmp`;
const tmpComponent = `${componentPath}.v23.tmp`;

try {
  fs.writeFileSync(tmpServer, montar(serverInfo, server), "utf8");
  fs.writeFileSync(tmpComponent, montar(componentInfo, component), "utf8");
  fs.renameSync(tmpServer, serverPath);
  fs.renameSync(tmpComponent, componentPath);
} catch (error) {
  if (fs.existsSync(tmpServer)) fs.unlinkSync(tmpServer);
  if (fs.existsSync(tmpComponent)) fs.unlinkSync(tmpComponent);
  try {
    fs.copyFileSync(path.join(backupDir, "server/comprasPecas.ts"), serverPath);
    fs.copyFileSync(path.join(backupDir, "client/src/components/ComprasPecasCotacao.tsx"), componentPath);
  } catch {}
  throw error;
}

console.log("");
console.log("✅ Compras > Peças V2.3 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Incluído:");
console.log("   - seleção da cidade antes de salvar o planejamento");
console.log("   - cidades: Joinville, Blumenau, São José, Florianópolis, São Leopoldo e Gravataí");
console.log("   - cidade salva no planejamento e exibida no histórico");
console.log("   - filtro do histórico por cidade");
console.log("   - excluir pedidos e reabrir cotação");
console.log("   - excluir planejamento com cotações e pedidos vinculados");
console.log("   - confirmações antes das exclusões");
console.log("");
console.log("Planejamentos antigos ficam como Sem cidade; os novos passam a salvar a cidade.");
console.log("O patch NÃO fez commit.");