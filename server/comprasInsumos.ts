import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  assertCompras,
  assertSenhaExclusao,
  db,
  norm,
  orderBook,
  parseMoney,
  quoteBook,
} from "./comprasPecas";

// Compras de insumos (estoque da oficina e loja): lista fixa de produtos com estoque
// mínimo por cidade. O estoquista preenche o estoque atual numa planilha e o sistema
// calcula quanto pedir (mínimo - atual). Cotação, pedidos e histórico seguem o fluxo de peças.

type TipoInsumo = "estoque" | "loja";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE = 8 * 1024 * 1024;
let ready = false;

async function ensure() {
  if (ready) return;
  const p = db();
  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_produtos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo VARCHAR(20) NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    material VARCHAR(300) NOT NULL,
    ordem INT NOT NULL DEFAULT 0,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_ci_prod_tipo_codigo (tipo, codigo)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Produto entra na lista da cidade quando tem linha aqui (mesmo com mínimo 0).
  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_minimos (
    produtoId INT UNSIGNED NOT NULL,
    lojaId INT UNSIGNED NOT NULL,
    minimo INT NOT NULL DEFAULT 0,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (produtoId, lojaId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_fornecedores (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo VARCHAR(20) NOT NULL,
    nome VARCHAR(160) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_ci_forn_tipo_nome (tipo, nome)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_planejamentos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo VARCHAR(20) NOT NULL,
    lojaId INT UNSIGNED NULL,
    lojaNome VARCHAR(120) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'planejamento',
    arquivoNome VARCHAR(255) NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_ci_plan_tipo_created (tipo, createdAt)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_itens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    planejamentoId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    item VARCHAR(300) NOT NULL,
    estoqueAtual DECIMAL(12,2) NOT NULL DEFAULT 0,
    minimo INT NOT NULL DEFAULT 0,
    quantidadeFinal INT NOT NULL DEFAULT 0,
    fornecedorSelecionadoId INT UNSIGNED NULL,
    precoSelecionado DECIMAL(12,4) NULL,
    PRIMARY KEY (id), KEY idx_ci_item_plan (planejamentoId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_cotacoes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    itemId INT UNSIGNED NOT NULL,
    fornecedorId INT UNSIGNED NOT NULL,
    valor DECIMAL(12,4) NOT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_ci_cot_item_forn (itemId, fornecedorId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_pedidos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    planejamentoId INT UNSIGNED NOT NULL,
    fornecedorId INT UNSIGNED NOT NULL,
    fornecedorNome VARCHAR(160) NOT NULL,
    totalItens INT NOT NULL DEFAULT 0,
    totalQuantidade INT NOT NULL DEFAULT 0,
    totalValor DECIMAL(14,2) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_ci_ped_plan_forn (planejamentoId, fornecedorId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_insumos_pedido_itens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    pedidoId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    item VARCHAR(300) NOT NULL,
    quantidade INT NOT NULL,
    valorUnitario DECIMAL(12,4) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id), KEY idx_ci_ped_item (pedidoId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  ready = true;
}

// Lista inicial tirada das planilhas de insumos das lojas (outubro/2026).
// Só é gravada quando o usuário clica em "Carregar lista inicial".
const LISTA_INICIAL_ESTOQUE: Array<{ codigo: string; material: string; minimos: Record<number, number> }> = (() => {
  // lojaId: 2 Blumenau, 3 São José, 4 Florianópolis, 6 São Leopoldo
  const L = (bl: number | null, sj: number | null, fl: number | null, sl: number | null) => {
    const m: Record<number, number> = {};
    if (bl != null) m[2] = bl;
    if (sj != null) m[3] = sj;
    if (fl != null) m[4] = fl;
    if (sl != null) m[6] = sl;
    return m;
  };
  return [
    { codigo: "DESP3M", material: "CHUMBO COLANTE (cx c/ 100)", minimos: L(4, 4, 4, 4) },
    { codigo: "DESPGA05", material: "CHUMBO 05gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA10", material: "CHUMBO 10gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA15", material: "CHUMBO 15gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA20", material: "CHUMBO 20gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA25", material: "CHUMBO 25gr GB (pcte 100 und)", minimos: L(1, 1, 1, 2) },
    { codigo: "DESPGA30", material: "CHUMBO 30gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA35", material: "CHUMBO 35gr GB (pcte 100 und)", minimos: L(2, 1, 1, 2) },
    { codigo: "DESPGA40", material: "CHUMBO 40gr GB (pcte 100 und)", minimos: L(1, 1, 1, 1) },
    { codigo: "DESPGA45", material: "CHUMBO 45gr GB (pcte 100 und)", minimos: L(1, 1, 1, 1) },
    { codigo: "DESP36", material: "DESENGRIPANTE", minimos: L(24, 40, 24, 24) },
    { codigo: "DESP41", material: "DISCO DE CORTE", minimos: L(6, 6, 6, 6) },
    { codigo: "DESP1560", material: "DISCO FLAP", minimos: L(null, null, 4, null) },
    { codigo: "DESP40", material: "LIXA", minimos: L(null, null, 10, null) },
    { codigo: "DESP2040", material: "CALÇO DE CAMBAGEM FINO", minimos: L(50, 50, 50, 50) },
    { codigo: "DESP2042", material: "CALÇO DE CAMBAGEM EXTRAFINO", minimos: L(50, 50, 50, 50) },
    { codigo: "DESP1263", material: "TINTA CINZA/ALUMINIUM", minimos: L(null, 12, null, null) },
    { codigo: "DESP1665", material: "TINTA PRETO BRILHOSO", minimos: L(24, 40, 20, 24) },
    { codigo: "DESP29", material: "TINTA PRATA SPRAY", minimos: L(null, null, 12, null) },
    { codigo: "DESP763", material: "PASTA PRA MONTAR PNEU (VASELINA)", minimos: L(2, null, null, 2) },
    { codigo: "DESP95", material: "PASTA PRA MONTAR PNEU (VASELINA)", minimos: L(null, 2, 2, null) },
    { codigo: "11122", material: "VALVULA UNIDADE", minimos: L(500, 400, 500, 500) },
    { codigo: "DESP1925", material: "LUVA PU TAMANHO G", minimos: L(100, 14, 24, 30) },
    { codigo: "FL002", material: "FLUIDO DE FREIO (DOT4)", minimos: L(12, null, null, 12) },
    { codigo: "S009", material: "HIG AR CONDICIONADO", minimos: L(12, null, null, 12) },
    { codigo: "DESP45", material: "ESTOPA 20KG", minimos: L(4, 2, 1, 1) },
    { codigo: "DESP114", material: "ROLO PLASTICO VOLANTE (cx c/24und)", minimos: L(1, 1, 2, 1) },
    { codigo: "DESP787", material: "PRETINHO FLASH", minimos: L(0, 1, null, 1) },
    { codigo: "DESP1801", material: "CAPA BANCO (ROLO)", minimos: L(2, 2, 2, 1) },
  ];
})();

// Grava a lista inicial de insumos de estoque (só se ainda não houver produtos).
export async function carregarListaInicialEstoque() {
  await ensure();
  const [r] = await db().query<any[]>(`SELECT COUNT(*) n FROM compras_insumos_produtos WHERE tipo = 'estoque'`);
  if (Number(r[0]?.n || 0) > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A lista já foi carregada." });
  const c = await db().getConnection();
  try {
    await c.beginTransaction();
    let ordem = 0;
    for (const p of LISTA_INICIAL_ESTOQUE) {
      ordem += 10;
      const [ins] = await c.query<any>(
        `INSERT INTO compras_insumos_produtos (tipo,codigo,material,ordem,ativo) VALUES ('estoque',?,?,?,1)`,
        [p.codigo, p.material, ordem]
      );
      for (const [lojaId, minimo] of Object.entries(p.minimos)) {
        await c.query(`INSERT INTO compras_insumos_minimos (produtoId,lojaId,minimo) VALUES (?,?,?)`, [Number(ins.insertId), Number(lojaId), minimo]);
      }
    }
    await c.commit();
    return { ok: true, produtos: LISTA_INICIAL_ESTOQUE.length };
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}

function nomeArquivo(s: string) {
  return norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function listaDaLoja(tipo: TipoInsumo, lojaId: number) {
  const [rows] = await db().query<any[]>(
    `SELECT p.id, p.codigo, p.material, m.minimo
       FROM compras_insumos_produtos p
       JOIN compras_insumos_minimos m ON m.produtoId = p.id AND m.lojaId = ?
      WHERE p.tipo = ? AND p.ativo = 1
      ORDER BY p.ordem, p.id`,
    [lojaId, tipo]
  );
  return rows.map((x) => ({ id: Number(x.id), codigo: String(x.codigo), material: String(x.material), minimo: Number(x.minimo || 0) }));
}

// Planilha para o estoquista: só código, material e estoque atual (única coluna editável).
export async function contagemBook(lojaNome: string, tipo: TipoInsumo, itens: Array<{ codigo: string; material: string }>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contagem", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 48;
  ws.getColumn(3).width = 18;
  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = `${lojaNome.toUpperCase()} - INSUMOS DE ${tipo === "estoque" ? "ESTOQUE" : "LOJA"}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells("A2:C2");
  ws.getCell("A2").value = "Preencha somente a coluna ESTOQUE ATUAL e devolva este arquivo.";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  ws.getCell("A2").alignment = { horizontal: "center" };
  const header = ws.getRow(3);
  header.values = ["CÓDIGO", "MATERIAL", "ESTOQUE ATUAL"];
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  for (const x of itens) ws.addRow([x.codigo, x.material, null]);
  ws.eachRow((row, r) =>
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.protection = { locked: !(r > 3 && c === 3) };
      if (r > 3) cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    })
  );
  for (let r = 4; r < 4 + itens.length; r++) {
    ws.getCell(r, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8DC" } };
    ws.getCell(r, 3).alignment = { horizontal: "center" };
  }
  await ws.protect("fr-contagem-insumos", {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
  });
  return wb.xlsx.writeBuffer();
}

export function lerNumero(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const id = z.number().int().positive();

function criarRouterInsumos(tipo: TipoInsumo) {
  return router({
    // ---------- Produtos e mínimos ----------
    produtos: protectedProcedure.input(z.object({ lojaId: id })).query(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [rows] = await db().query<any[]>(
        `SELECT p.id, p.codigo, p.material, p.ativo, m.minimo, (m.produtoId IS NOT NULL) naLista
           FROM compras_insumos_produtos p
           LEFT JOIN compras_insumos_minimos m ON m.produtoId = p.id AND m.lojaId = ?
          WHERE p.tipo = ?
          ORDER BY p.ativo DESC, p.ordem, p.id`,
        [input.lojaId, tipo]
      );
      return rows.map((x) => ({
        id: Number(x.id), codigo: String(x.codigo), material: String(x.material), ativo: Boolean(x.ativo),
        naLista: Boolean(Number(x.naLista)), minimo: x.minimo == null ? null : Number(x.minimo),
      }));
    }),

    listaInicialDisponivel: protectedProcedure.query(async ({ ctx }) => {
      assertCompras(ctx); await ensure();
      const [r] = await db().query<any[]>(`SELECT COUNT(*) n FROM compras_insumos_produtos WHERE tipo = ?`, [tipo]);
      return { vazio: Number(r[0]?.n || 0) === 0, temLista: tipo === "estoque" };
    }),

    carregarListaInicial: protectedProcedure.mutation(async ({ ctx }) => {
      assertCompras(ctx);
      if (tipo !== "estoque") throw new TRPCError({ code: "BAD_REQUEST", message: "Não há lista inicial para este tipo." });
      return carregarListaInicialEstoque();
    }),

    salvarProduto: protectedProcedure
      .input(z.object({ id: id.optional(), codigo: z.string().trim().min(1).max(100), material: z.string().trim().min(2).max(300) }))
      .mutation(async ({ ctx, input }) => {
        assertCompras(ctx); await ensure();
        const codigo = input.codigo.toUpperCase().replace(/\s+/g, "");
        try {
          if (input.id) {
            await db().query(`UPDATE compras_insumos_produtos SET codigo=?, material=? WHERE id=? AND tipo=?`, [codigo, input.material, input.id, tipo]);
            return { ok: true, id: input.id };
          }
          const [m] = await db().query<any[]>(`SELECT COALESCE(MAX(ordem),0) m FROM compras_insumos_produtos WHERE tipo=?`, [tipo]);
          const [r] = await db().query<any>(
            `INSERT INTO compras_insumos_produtos (tipo,codigo,material,ordem,ativo) VALUES (?,?,?,?,1)`,
            [tipo, codigo, input.material, Number(m[0]?.m || 0) + 10]
          );
          return { ok: true, id: Number(r.insertId) };
        } catch (e: any) {
          if (e?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "BAD_REQUEST", message: `Já existe um produto com o código ${codigo}.` });
          throw e;
        }
      }),

    definirProdutoAtivo: protectedProcedure.input(z.object({ id, ativo: z.boolean() })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await db().query(`UPDATE compras_insumos_produtos SET ativo=? WHERE id=? AND tipo=?`, [input.ativo ? 1 : 0, input.id, tipo]);
      return { ok: true };
    }),

    // minimo null = tirar o produto da lista desta cidade
    salvarMinimo: protectedProcedure
      .input(z.object({ produtoId: id, lojaId: id, minimo: z.number().int().min(0).max(1000000).nullable() }))
      .mutation(async ({ ctx, input }) => {
        assertCompras(ctx); await ensure();
        if (input.minimo == null) {
          await db().query(`DELETE FROM compras_insumos_minimos WHERE produtoId=? AND lojaId=?`, [input.produtoId, input.lojaId]);
        } else {
          await db().query(
            `INSERT INTO compras_insumos_minimos (produtoId,lojaId,minimo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE minimo=VALUES(minimo)`,
            [input.produtoId, input.lojaId, input.minimo]
          );
        }
        return { ok: true };
      }),

    // ---------- Contagem do estoquista ----------
    planilhaContagem: protectedProcedure.input(z.object({ lojaId: id, lojaNome: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const itens = await listaDaLoja(tipo, input.lojaId);
      if (!itens.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cidade ainda não tem produtos na lista." });
      const buf = await contagemBook(input.lojaNome, tipo, itens);
      return { nome: `contagem-insumos-${tipo}-${nomeArquivo(input.lojaNome)}.xlsx`, mime: MIME_XLSX, base64: Buffer.from(buf as any).toString("base64") };
    }),

    lerContagem: protectedProcedure
      .input(z.object({ lojaId: id, arquivoNome: z.string().min(1).max(255), arquivoBase64: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        assertCompras(ctx); await ensure();
        const buffer = Buffer.from(input.arquivoBase64, "base64");
        if (!buffer.length || buffer.length > MAX_FILE) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido ou maior que 8 MB." });
        let linhas: any[][];
        try {
          const wb = XLSX.read(buffer, { type: "buffer", raw: false });
          linhas = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler a planilha." });
        }
        let hi = -1, ci = -1, ei = -1;
        for (let i = 0; i < Math.min(linhas.length, 15); i++) {
          const row = (linhas[i] || []).map(norm);
          const c = row.indexOf("CODIGO");
          const e = row.findIndex((v) => v === "ESTOQUE ATUAL" || v === "QUANTIDADE ATUAL");
          if (c >= 0 && e >= 0) { hi = i; ci = c; ei = e; break; }
        }
        if (hi < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha sem as colunas CÓDIGO e ESTOQUE ATUAL." });
        const lidos = new Map<string, number | null>();
        for (let i = hi + 1; i < linhas.length; i++) {
          const row = linhas[i] || [];
          const codigo = norm(row[ci]).replace(/\s+/g, "");
          if (!codigo) continue;
          lidos.set(codigo, lerNumero(row[ei]));
        }
        const lista = await listaDaLoja(tipo, input.lojaId);
        const daLista = new Set(lista.map((x) => norm(x.codigo)));
        const foraDaLista = [...lidos.keys()].filter((c) => !daLista.has(c));
        return {
          itens: lista.map((x) => {
            const atual = lidos.has(norm(x.codigo)) ? lidos.get(norm(x.codigo))! : null;
            return { ...x, estoqueAtual: atual, preenchido: atual != null };
          }),
          foraDaLista,
        };
      }),

    // ---------- Planejamento, cotação e pedidos (mesmo fluxo de peças) ----------
    fornecedores: protectedProcedure.query(async ({ ctx }) => {
      assertCompras(ctx); await ensure();
      const [rows] = await db().query<any[]>(`SELECT id,nome,ativo FROM compras_insumos_fornecedores WHERE tipo=? ORDER BY ativo DESC,nome ASC`, [tipo]);
      return rows.map((x) => ({ ...x, id: Number(x.id), ativo: Boolean(x.ativo) }));
    }),

    criarFornecedor: protectedProcedure.input(z.object({ nome: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await db().query(`INSERT INTO compras_insumos_fornecedores (tipo,nome,ativo) VALUES (?,?,1) ON DUPLICATE KEY UPDATE ativo=1,nome=VALUES(nome)`, [tipo, input.nome.trim()]);
      return { ok: true };
    }),

    definirFornecedorAtivo: protectedProcedure.input(z.object({ id, ativo: z.boolean() })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await db().query(`UPDATE compras_insumos_fornecedores SET ativo=? WHERE id=? AND tipo=?`, [input.ativo ? 1 : 0, input.id, tipo]);
      return { ok: true };
    }),

    criarPlanejamento: protectedProcedure.input(z.object({
      lojaId: id,
      lojaNome: z.string().trim().min(2).max(120),
      arquivoNome: z.string().max(255).nullable().optional(),
      itens: z.array(z.object({
        codigo: z.string().min(1).max(100),
        item: z.string().min(1).max(300),
        estoqueAtual: z.number().min(0),
        minimo: z.number().int().min(0),
        quantidadeFinal: z.number().int().min(0).max(1000000),
      })).min(1).max(2000),
    })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const buy = input.itens.filter((x) => x.quantidadeFinal > 0);
      if (!buy.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum item para comprar (todas as quantidades estão em 0)." });
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        const [r] = await c.query<any>(
          `INSERT INTO compras_insumos_planejamentos (tipo,lojaId,lojaNome,status,arquivoNome,criadoPorNome) VALUES (?,?,?,'planejamento',?,?)`,
          [tipo, input.lojaId, input.lojaNome, input.arquivoNome || null, String(ctx?.user?.name || "Usuário")]
        );
        const pid = Number(r.insertId);
        for (const x of buy) {
          await c.query(
            `INSERT INTO compras_insumos_itens (planejamentoId,codigo,item,estoqueAtual,minimo,quantidadeFinal) VALUES (?,?,?,?,?,?)`,
            [pid, x.codigo, x.item, x.estoqueAtual, x.minimo, x.quantidadeFinal]
          );
        }
        await c.commit();
        return { ok: true, planejamentoId: pid, totalItens: buy.length };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

    planejamentos: protectedProcedure.query(async ({ ctx }) => {
      assertCompras(ctx); await ensure();
      const [rows] = await db().query<any[]>(
        `SELECT p.id,p.lojaId,p.lojaNome,p.status,p.arquivoNome,p.createdAt,COUNT(i.id) totalItens,COALESCE(SUM(i.quantidadeFinal),0) totalQuantidade
           FROM compras_insumos_planejamentos p LEFT JOIN compras_insumos_itens i ON i.planejamentoId=p.id
          WHERE p.tipo=? GROUP BY p.id ORDER BY p.createdAt DESC,p.id DESC LIMIT 100`,
        [tipo]
      );
      return rows.map((x) => ({ ...x, id: Number(x.id), lojaId: x.lojaId == null ? null : Number(x.lojaId), totalItens: Number(x.totalItens || 0), totalQuantidade: Number(x.totalQuantidade || 0) }));
    }),

    detalhe: protectedProcedure.input(z.object({ planejamentoId: id })).query(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [pRows] = await db().query<any[]>(`SELECT * FROM compras_insumos_planejamentos WHERE id=? AND tipo=? LIMIT 1`, [input.planejamentoId, tipo]);
      if (!pRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Planejamento não encontrado." });
      const [items] = await db().query<any[]>(
        `SELECT i.*,f.nome fornecedorSelecionadoNome FROM compras_insumos_itens i LEFT JOIN compras_insumos_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? ORDER BY i.id`,
        [input.planejamentoId]
      );
      const ids = items.map((x) => Number(x.id));
      let quotes: any[] = [];
      if (ids.length) {
        const [q] = await db().query<any[]>(
          `SELECT c.itemId,c.fornecedorId,c.valor FROM compras_insumos_cotacoes c WHERE c.itemId IN (${ids.map(() => "?").join(",")})`,
          ids
        );
        quotes = q;
      }
      return {
        planejamento: { ...pRows[0], id: Number(pRows[0].id) },
        itens: items.map((x) => ({
          ...x, id: Number(x.id), estoqueAtual: Number(x.estoqueAtual || 0), minimo: Number(x.minimo || 0), quantidadeFinal: Number(x.quantidadeFinal || 0),
          fornecedorSelecionadoId: x.fornecedorSelecionadoId ? Number(x.fornecedorSelecionadoId) : null,
          precoSelecionado: x.precoSelecionado == null ? null : Number(x.precoSelecionado),
        })),
        cotacoes: quotes.map((x) => ({ itemId: Number(x.itemId), fornecedorId: Number(x.fornecedorId), valor: Number(x.valor || 0) })),
      };
    }),

    atualizarQuantidade: protectedProcedure.input(z.object({ itemId: id, quantidadeFinal: z.number().int().min(0).max(1000000) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [rows] = await db().query<any[]>(
        `SELECT p.status FROM compras_insumos_itens i JOIN compras_insumos_planejamentos p ON p.id=i.planejamentoId WHERE i.id=? AND p.tipo=? LIMIT 1`,
        [input.itemId, tipo]
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item do planejamento não encontrado." });
      if (String(rows[0].status) === "pedido_salvo") throw new TRPCError({ code: "BAD_REQUEST", message: "Esse planejamento já possui pedido salvo. Exclua os pedidos antes de alterar a quantidade." });
      await db().query(`UPDATE compras_insumos_itens SET quantidadeFinal=? WHERE id=?`, [input.quantidadeFinal, input.itemId]);
      return { ok: true, itemId: input.itemId, quantidadeFinal: input.quantidadeFinal };
    }),

    salvarCotacao: protectedProcedure.input(z.object({ itemId: id, fornecedorId: id, valor: z.number().positive() })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await db().query(`INSERT INTO compras_insumos_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`, [input.itemId, input.fornecedorId, input.valor]);
      await db().query(`UPDATE compras_insumos_planejamentos p JOIN compras_insumos_itens i ON i.planejamentoId=p.id SET p.status=CASE WHEN p.status='pedido_salvo' THEN p.status ELSE 'cotacao' END WHERE i.id=?`, [input.itemId]);
      return { ok: true };
    }),

    selecionarFornecedor: protectedProcedure.input(z.object({ itemId: id, fornecedorId: id })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [r] = await db().query<any[]>(`SELECT valor FROM compras_insumos_cotacoes WHERE itemId=? AND fornecedorId=? LIMIT 1`, [input.itemId, input.fornecedorId]);
      if (!r.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Fornecedor sem preço para esse item." });
      await db().query(`UPDATE compras_insumos_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`, [input.fornecedorId, Number(r[0].valor), input.itemId]);
      return { ok: true };
    }),

    selecionarMenores: protectedProcedure.input(z.object({ planejamentoId: id })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [items] = await db().query<any[]>(`SELECT id FROM compras_insumos_itens WHERE planejamentoId=? AND quantidadeFinal>0`, [input.planejamentoId]);
      let n = 0;
      for (const it of items) {
        const [q] = await db().query<any[]>(`SELECT fornecedorId,valor FROM compras_insumos_cotacoes WHERE itemId=? ORDER BY valor ASC LIMIT 1`, [it.id]);
        if (!q.length) continue;
        await db().query(`UPDATE compras_insumos_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`, [Number(q[0].fornecedorId), Number(q[0].valor), it.id]);
        n++;
      }
      return { ok: true, selecionados: n };
    }),

    arquivoCotacaoFornecedor: protectedProcedure.input(z.object({ planejamentoId: id, fornecedorId: id })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [f] = await db().query<any[]>(`SELECT id,nome FROM compras_insumos_fornecedores WHERE id=? AND tipo=? AND ativo=1 LIMIT 1`, [input.fornecedorId, tipo]);
      if (!f.length) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
      const [items] = await db().query<any[]>(`SELECT codigo,item FROM compras_insumos_itens WHERE planejamentoId=? AND quantidadeFinal>0 ORDER BY id`, [input.planejamentoId]);
      const [pl] = await db().query<any[]>(`SELECT lojaNome FROM compras_insumos_planejamentos WHERE id=? LIMIT 1`, [input.planejamentoId]);
      const cidade = String(pl[0]?.lojaNome || "");
      const titulo = `COTAÇÃO DE INSUMOS DE ${tipo === "estoque" ? "ESTOQUE" : "LOJA"} - ${cidade.toUpperCase() || "LOJA"}`;
      const buf = await quoteBook(String(f[0].nome), items.map((x) => ({ codigo: String(x.codigo), item: String(x.item) })), titulo);
      return { nome: `cotacao-insumos-${tipo}-${cidade ? `${nomeArquivo(cidade)}-` : ""}${nomeArquivo(f[0].nome)}-${input.planejamentoId}.xlsx`, mime: MIME_XLSX, base64: Buffer.from(buf as any).toString("base64") };
    }),

    importarCotacaoFornecedor: protectedProcedure.input(z.object({ planejamentoId: id, fornecedorId: id, arquivoNome: z.string().min(1), arquivoBase64: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [f] = await db().query<any[]>(`SELECT id,nome FROM compras_insumos_fornecedores WHERE id=? AND tipo=? AND ativo=1 LIMIT 1`, [input.fornecedorId, tipo]);
      if (!f.length) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
      const buffer = Buffer.from(input.arquivoBase64, "base64");
      if (!buffer.length || buffer.length > MAX_FILE) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido ou maior que 8 MB." });
      let lines: any[][];
      try {
        const wb = XLSX.read(buffer, { type: "buffer", raw: false });
        lines = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler a planilha." });
      }
      let hi = -1, ci = -1, pi = -1;
      const expected = norm(f[0].nome);
      for (let i = 0; i < Math.min(lines.length, 12); i++) {
        const row = (lines[i] || []).map(norm);
        const c = row.indexOf("CODIGO"), p = row.indexOf(expected);
        if (c >= 0 && p >= 0) { hi = i; ci = c; pi = p; break; }
      }
      if (hi < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha inválida ou de outro fornecedor." });
      const [items] = await db().query<any[]>(`SELECT id,codigo FROM compras_insumos_itens WHERE planejamentoId=?`, [input.planejamentoId]);
      const map = new Map(items.map((x) => [norm(x.codigo), Number(x.id)]));
      let imported = 0;
      for (let i = hi + 1; i < lines.length; i++) {
        const row = lines[i] || [];
        const itemId = map.get(norm(row[ci]));
        if (!itemId) continue;
        const val = parseMoney(row[pi]);
        if (val <= 0) continue;
        await db().query(`INSERT INTO compras_insumos_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`, [itemId, input.fornecedorId, val]);
        imported++;
      }
      if (!imported) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum preço válido encontrado." });
      await db().query(`UPDATE compras_insumos_planejamentos SET status=CASE WHEN status='pedido_salvo' THEN status ELSE 'cotacao' END WHERE id=?`, [input.planejamentoId]);
      return { ok: true, fornecedorId: input.fornecedorId, importados: imported };
    }),

    fecharPedidos: protectedProcedure.input(z.object({ planejamentoId: id })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [old] = await db().query<any[]>(`SELECT id FROM compras_insumos_pedidos WHERE planejamentoId=? LIMIT 1`, [input.planejamentoId]);
      if (old.length) return { ok: true, jaSalvo: true, pedidos: 0 };
      const [items] = await db().query<any[]>(
        `SELECT i.*,f.nome fornecedorNome FROM compras_insumos_itens i LEFT JOIN compras_insumos_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? AND i.quantidadeFinal>0 ORDER BY i.id`,
        [input.planejamentoId]
      );
      const missing = items.filter((x) => !x.fornecedorSelecionadoId || x.precoSelecionado == null || Number(x.precoSelecionado) <= 0);
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `${missing.length} item(ns) ainda sem fornecedor/preço selecionado.` });
      const groups = new Map<number, any[]>();
      for (const x of items) { const fid = Number(x.fornecedorSelecionadoId); groups.set(fid, [...(groups.get(fid) || []), x]); }
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        for (const [fid, list] of groups) {
          const qty = list.reduce((s, x) => s + Number(x.quantidadeFinal || 0), 0);
          const total = list.reduce((s, x) => s + Number(x.quantidadeFinal || 0) * Number(x.precoSelecionado || 0), 0);
          const [r] = await c.query<any>(
            `INSERT INTO compras_insumos_pedidos (planejamentoId,fornecedorId,fornecedorNome,totalItens,totalQuantidade,totalValor) VALUES (?,?,?,?,?,?)`,
            [input.planejamentoId, fid, String(list[0].fornecedorNome || "Fornecedor"), list.length, qty, total]
          );
          const pedidoId = Number(r.insertId);
          for (const x of list) {
            const q = Number(x.quantidadeFinal || 0), v = Number(x.precoSelecionado || 0);
            await c.query(
              `INSERT INTO compras_insumos_pedido_itens (pedidoId,codigo,item,quantidade,valorUnitario,total) VALUES (?,?,?,?,?,?)`,
              [pedidoId, x.codigo, x.item, q, v, Number((q * v).toFixed(2))]
            );
          }
        }
        await c.query(`UPDATE compras_insumos_planejamentos SET status='pedido_salvo' WHERE id=?`, [input.planejamentoId]);
        await c.commit();
        return { ok: true, jaSalvo: false, pedidos: groups.size };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

    excluirPedidosPlanejamento: protectedProcedure.input(z.object({ planejamentoId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      assertSenhaExclusao(input.senha);
      await ensure();
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        const [pedidos] = await c.query<any[]>(`SELECT id FROM compras_insumos_pedidos WHERE planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE pi FROM compras_insumos_pedido_itens pi JOIN compras_insumos_pedidos p ON p.id=pi.pedidoId WHERE p.planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE FROM compras_insumos_pedidos WHERE planejamentoId=?`, [input.planejamentoId]);
        const [cot] = await c.query<any[]>(`SELECT COUNT(*) total FROM compras_insumos_cotacoes c JOIN compras_insumos_itens i ON i.id=c.itemId WHERE i.planejamentoId=?`, [input.planejamentoId]);
        const novoStatus = Number(cot[0]?.total || 0) > 0 ? "cotacao" : "planejamento";
        await c.query(`UPDATE compras_insumos_planejamentos SET status=? WHERE id=? AND tipo=?`, [novoStatus, input.planejamentoId, tipo]);
        await c.commit();
        return { ok: true, excluidos: pedidos.length, planejamentoId: input.planejamentoId, novoStatus };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

    excluirPlanejamento: protectedProcedure.input(z.object({ planejamentoId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      assertSenhaExclusao(input.senha);
      await ensure();
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        const [planos] = await c.query<any[]>(`SELECT id FROM compras_insumos_planejamentos WHERE id=? AND tipo=? LIMIT 1`, [input.planejamentoId, tipo]);
        if (!planos.length) throw new TRPCError({ code: "NOT_FOUND", message: "Planejamento não encontrado." });
        await c.query(`DELETE pi FROM compras_insumos_pedido_itens pi JOIN compras_insumos_pedidos p ON p.id=pi.pedidoId WHERE p.planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE FROM compras_insumos_pedidos WHERE planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE c FROM compras_insumos_cotacoes c JOIN compras_insumos_itens i ON i.id=c.itemId WHERE i.planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE FROM compras_insumos_itens WHERE planejamentoId=?`, [input.planejamentoId]);
        await c.query(`DELETE FROM compras_insumos_planejamentos WHERE id=?`, [input.planejamentoId]);
        await c.commit();
        return { ok: true, planejamentoId: input.planejamentoId };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

    pedidos: protectedProcedure.input(z.object({ planejamentoId: id })).query(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [rows] = await db().query<any[]>(`SELECT * FROM compras_insumos_pedidos WHERE planejamentoId=? ORDER BY fornecedorNome`, [input.planejamentoId]);
      return rows.map((x) => ({ ...x, id: Number(x.id), totalItens: Number(x.totalItens || 0), totalQuantidade: Number(x.totalQuantidade || 0), totalValor: Number(x.totalValor || 0) }));
    }),

    arquivoPedido: protectedProcedure.input(z.object({ pedidoId: id })).mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const [p] = await db().query<any[]>(
        `SELECT pe.*,pl.lojaNome FROM compras_insumos_pedidos pe JOIN compras_insumos_planejamentos pl ON pl.id=pe.planejamentoId WHERE pe.id=? AND pl.tipo=? LIMIT 1`,
        [input.pedidoId, tipo]
      );
      if (!p.length) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      const [items] = await db().query<any[]>(`SELECT codigo,item,quantidade,valorUnitario,total FROM compras_insumos_pedido_itens WHERE pedidoId=? ORDER BY id`, [input.pedidoId]);
      const buf = await orderBook(items.map((x) => ({ codigo: x.codigo, item: x.item, quantidade: Number(x.quantidade), valorUnitario: Number(x.valorUnitario), total: Number(x.total) })));
      return {
        nome: `pedido-insumos-${tipo}-${nomeArquivo(p[0].lojaNome || "loja")}-${nomeArquivo(p[0].fornecedorNome)}-${input.pedidoId}.xlsx`,
        mime: MIME_XLSX,
        base64: Buffer.from(buf as any).toString("base64"),
      };
    }),
  });
}

export const comprasInsumosEstoqueRouter = criarRouterInsumos("estoque");
export const comprasInsumosLojaRouter = criarRouterInsumos("loja");
