import mysql from "mysql2/promise";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE = 8 * 1024 * 1024;
let pool: mysql.Pool | null = null;
let ready = false;

function assertCompras(ctx: any) {
  const role = String(ctx?.user?.role || "");
  if (!["compras", "admin", "gestor"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado." });
  }
}

function db() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco não configurado." });
  }
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }
  return pool;
}

async function ensure() {
  if (ready) return;
  const p = db();
  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_fornecedores (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(160) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_cp_fornecedor_nome (nome)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_planejamentos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lojaId INT UNSIGNED NULL,
    lojaNome VARCHAR(120) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'planejamento',
    arquivoNome VARCHAR(255) NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cp_plan_created (createdAt)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  try {
    await p.query(
      `ALTER TABLE compras_pecas_planejamentos
       ADD COLUMN lojaId INT UNSIGNED NULL AFTER id`
    );
  } catch (error: any) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await p.query(
      `ALTER TABLE compras_pecas_planejamentos
       ADD COLUMN lojaNome VARCHAR(120) NULL AFTER lojaId`
    );
  } catch (error: any) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_itens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    planejamentoId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    item VARCHAR(500) NOT NULL,
    grupo VARCHAR(80) NOT NULL,
    especificacao TEXT NULL,
    vendaPeriodo DECIMAL(12,2) NOT NULL DEFAULT 0,
    estoqueAtual DECIMAL(12,2) NOT NULL DEFAULT 0,
    necessidade DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantidadeFinal INT NOT NULL DEFAULT 0,
    lado VARCHAR(10) NULL,
    fornecedorSelecionadoId INT UNSIGNED NULL,
    precoSelecionado DECIMAL(12,4) NULL,
    PRIMARY KEY (id),
    KEY idx_cp_item_plan (planejamentoId),
    KEY idx_cp_item_codigo (codigo)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_cotacoes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    itemId INT UNSIGNED NOT NULL,
    fornecedorId INT UNSIGNED NOT NULL,
    valor DECIMAL(12,4) NOT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cp_cot_item_fornecedor (itemId, fornecedorId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_pedidos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    planejamentoId INT UNSIGNED NOT NULL,
    fornecedorId INT UNSIGNED NOT NULL,
    fornecedorNome VARCHAR(160) NOT NULL,
    totalItens INT NOT NULL DEFAULT 0,
    totalQuantidade INT NOT NULL DEFAULT 0,
    totalValor DECIMAL(14,2) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cp_pedido_plan_fornecedor (planejamentoId, fornecedorId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_pedido_itens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    pedidoId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    item VARCHAR(500) NOT NULL,
    quantidade INT NOT NULL,
    valorUnitario DECIMAL(12,4) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id), KEY idx_cp_pedido_item (pedidoId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_catalogo_cache (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(100) NOT NULL,
    fonte VARCHAR(40) NOT NULL,
    status VARCHAR(30) NOT NULL,
    descricao VARCHAR(500) NULL,
    aplicacao TEXT NULL,
    lado VARCHAR(10) NULL,
    url TEXT NULL,
    consultadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cp_catalogo_codigo_fonte (codigo, fonte)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  ready = true;
}

function norm(v: unknown) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function parseMoney(v: unknown) {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


function decodeHtml(v: string) {
  return String(v || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x2F;/gi, "/");
}

function stripHtml(v: string) {
  return decodeHtml(
    String(v || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(td|th|tr|p|div|li|h1|h2|h3|h4)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchText(url: string, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extrairUrlDuckDuckGoRapida(html: string) {
  const candidatos: string[] = [];

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let href = decodeHtml(match[1] || "");
    if (!href) continue;

    try {
      if (href.startsWith("//")) href = `https:${href}`;
      const url = new URL(href, "https://html.duckduckgo.com");

      if (url.hostname.includes("duckduckgo.com")) {
        const uddg = url.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      }
    } catch {}

    if (
      href.includes("catalogo.perfectautomotive.com/new/") &&
      (href.includes("detalhes.asp") || href.includes("produtos.asp"))
    ) {
      candidatos.push(href);
    }
  }

  return (
    candidatos.find((url) => url.includes("detalhes.asp")) ||
    candidatos.find((url) => url.includes("produtos.asp")) ||
    null
  );
}

async function localizarPerfectRapido(codigo: string) {
  const q =
    `site:catalogo.perfectautomotive.com/new/ "${codigo}" "Perfect"`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

  try {
    const html = await fetchText(url, 3500);
    return extrairUrlDuckDuckGoRapida(html);
  } catch {
    return null;
  }
}

function dadosPerfectDaPagina(
  html: string,
  codigo: string,
  url: string
) {
  const texto = stripHtml(html);
  const alvo = codigo.toUpperCase();
  const indice = texto.toUpperCase().indexOf(alvo);

  if (indice < 0) {
    return {
      codigo,
      fonte: "PERFECT",
      status: "nao_localizado" as const,
      descricao: null,
      aplicacao: null,
      lado: null,
      url,
    };
  }

  const trecho = texto.slice(indice, indice + 2400);

  const reDescricao = new RegExp(
    `^${escapeRegex(codigo)}\\s+(?:\\(N[º°]?\\s*Ref\\.[^)]*\\)\\s*)?(.+?)\\s+Unidade:`,
    "i"
  );

  const descricao = (trecho.match(reDescricao)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const aplicacaoBruta =
    trecho.match(/Fabricante:\s*(.+?)\s+Peso:/i)?.[1] || "";

  const aplicacao = aplicacaoBruta
    .replace(/\bCOMPLEMENTO\b/gi, " ")
    .replace(/\bANO\b/gi, " ")
    .replace(/\+\s*aplica[cç][oõ]es/gi, " ")
    .replace(/\+\s*montadoras/gi, " ")
    .replace(/(?:-\s*){2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1400);

  const descricaoNorm = norm(descricao);

  const lado =
    descricaoNorm.includes("LD/LE") || descricaoNorm.includes("LE/LD")
      ? "LD/LE"
      : /\bLD\b/.test(descricaoNorm) ||
        descricaoNorm.includes("LADO DIREITO")
      ? "LD"
      : /\bLE\b/.test(descricaoNorm) ||
        descricaoNorm.includes("LADO ESQUERDO")
      ? "LE"
      : null;

  return {
    codigo,
    fonte: "PERFECT",
    status: "localizado" as const,
    descricao: descricao || null,
    aplicacao: aplicacao || null,
    lado,
    url,
  };
}

function resumirAplicacaoPerfect(texto: string) {
  const normal = texto.replace(/\s+/g, " ");
  const inicio = normal.toUpperCase().indexOf("MODELO");

  if (inicio < 0) return "";

  const depois = normal.slice(inicio + "MODELO".length);
  const fimConversao = depois.toUpperCase().search(
    /N[º°]?\s*CONVERS[AÃ]O|SUGEST[AÃ]O DE PRODUTOS/
  );

  const bruto =
    fimConversao >= 0 ? depois.slice(0, fimConversao) : depois.slice(0, 1800);

  return bruto
    .replace(/\bCOMPLEMENTO\b/gi, " ")
    .replace(/\bANO\b/gi, " ")
    .replace(/\bOBS\b/gi, " ")
    .replace(/\bDATA INCLUS[AÃ]O\b/gi, " ")
    .replace(/\+\s*aplica[cç][oõ]es/gi, " ")
    .replace(/\+\s*montadoras/gi, " ")
    .replace(/(?:-\s*){2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

async function consultarPerfect(codigoOriginal: string) {
  const codigo = norm(codigoOriginal).replace(/\s+/g, "");

  const consulta = (async () => {
    const url = await localizarPerfectRapido(codigo);

    if (!url) {
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

    try {
      const html = await fetchText(url, 3500);
      return dadosPerfectDaPagina(html, codigo, url);
    } catch {
      return {
        codigo,
        fonte: "PERFECT",
        status: "erro" as const,
        descricao: null,
        aplicacao: null,
        lado: null,
        url,
      };
    }
  })();

  const limite = new Promise<any>((resolve) => {
    setTimeout(() => {
      resolve({
        codigo,
        fonte: "PERFECT",
        status: "erro",
        descricao: null,
        aplicacao: null,
        lado: null,
        url: null,
        erro: "Tempo limite da consulta atingido.",
      });
    }, 8000);
  });

  return Promise.race([consulta, limite]);
}

async function quoteBook(name: string, items: Array<{ codigo: string; item: string }>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cotação", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "CÓDIGO", key: "codigo", width: 20 },
    { header: "ITEM", key: "item", width: 55 },
    { header: name, key: "valor", width: 20 },
  ];
  items.forEach((x) => ws.addRow({ ...x, valor: null }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  ws.getColumn(3).numFmt = '"R$" #,##0.00';
  ws.eachRow((row, r) => row.eachCell({ includeEmpty: true }, (cell, c) => {
    cell.protection = { locked: r === 1 || c !== 3 };
  }));
  await ws.protect("fr-cotacao-pecas", {
    selectLockedCells: false, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
  });
  return wb.xlsx.writeBuffer();
}

async function orderBook(items: Array<any>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedido", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  ws.columns = [
    { header: "CÓDIGO", key: "codigo", width: 20 },
    { header: "ITEM", key: "item", width: 52 },
    { header: "QUANTIDADE", key: "quantidade", width: 16 },
    { header: "VALOR UNITÁRIO", key: "valorUnitario", width: 20 },
    { header: "TOTAL", key: "total", width: 20 },
  ];
  items.forEach((x) => ws.addRow(x));
  const total = items.reduce((s, x) => s + Number(x.total || 0), 0);
  const tr = ws.addRow({ codigo: "TOTAL DO PEDIDO", total: Number(total.toFixed(2)) });
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  ws.getColumn(3).numFmt = "0";
  ws.getColumn(4).numFmt = '"R$" #,##0.00';
  ws.getColumn(5).numFmt = '"R$" #,##0.00';
  tr.font = { bold: true };
  tr.getCell(5).numFmt = '"R$" #,##0.00';
  ws.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => { cell.protection = { locked: true }; }));
  await ws.protect("fr-pedido-pecas", {
    selectLockedCells: true, selectUnlockedCells: false,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
  });
  return wb.xlsx.writeBuffer();
}

const itemSchema = z.object({
  codigo: z.string().min(1).max(100),
  item: z.string().min(1).max(500),
  grupo: z.string().min(1).max(80),
  especificacao: z.string().max(3000).nullable().optional(),
  vendaPeriodo: z.number().min(0),
  estoqueAtual: z.number().min(0),
  necessidade: z.number(),
  quantidadeFinal: z.number().int().min(0).max(100000),
  lado: z.string().max(10).nullable().optional(),
});

export const comprasPecasRouter = router({

  consultarCatalogoPerfect: protectedProcedure
    .input(
      z.object({
        itens: z
          .array(
            z.object({
              codigo: z.string().min(1).max(100),
              grupo: z.string().min(1).max(80),
            })
          )
          .min(1)
          .max(120),
        forcar: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensure();

      const permitidos = new Set([
        "PIVÔ",
        "PIVO",
        "TERMINAL AXIAL",
        "TERMINAL DE DIREÇÃO",
        "TERMINAL DE DIRECAO",
      ]);

      const unicos = Array.from(
        new Map(
          input.itens
            .filter((item) => permitidos.has(norm(item.grupo)))
            .map((item) => [
              norm(item.codigo).replace(/\s+/g, ""),
              {
                codigo: norm(item.codigo).replace(/\s+/g, ""),
                grupo: item.grupo,
              },
            ])
        ).values()
      );

      const resultados: any[] = [];

      async function processarItem(item: any) {
        if (!input.forcar) {
          const [cache] = await db().query<any[]>(
            `SELECT codigo, fonte, status, descricao, aplicacao, lado, url,
                    consultadoEm, updatedAt
             FROM compras_pecas_catalogo_cache
             WHERE codigo = ? AND fonte = 'PERFECT'
             LIMIT 1`,
            [item.codigo]
          );

          if (
            cache.length &&
            ["localizado", "nao_localizado"].includes(
              String(cache[0].status)
            )
          ) {
            return {
              ...cache[0],
              codigo: String(cache[0].codigo),
              fonte: "PERFECT",
            };
          }
        }

        let resultado: any;

        try {
          resultado = await consultarPerfect(item.codigo);
        } catch (error: any) {
          resultado = {
            codigo: item.codigo,
            fonte: "PERFECT",
            status: "erro",
            descricao: null,
            aplicacao: null,
            lado: null,
            url: null,
            erro: error?.message || "Falha na consulta",
          };
        }

        await db().query(
          `INSERT INTO compras_pecas_catalogo_cache
             (codigo, fonte, status, descricao, aplicacao, lado, url, consultadoEm)
           VALUES (?, 'PERFECT', ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             descricao = VALUES(descricao),
             aplicacao = VALUES(aplicacao),
             lado = VALUES(lado),
             url = VALUES(url),
             consultadoEm = NOW()`,
          [
            resultado.codigo,
            resultado.status,
            resultado.descricao,
            resultado.aplicacao,
            resultado.lado,
            resultado.url,
          ]
        );

        return resultado;
      }

      // Consulta em pequenos lotes paralelos para não deixar a tela presa
      // nem sobrecarregar o catálogo.
      const CONCORRENCIA = 8;

      for (let inicio = 0; inicio < unicos.length; inicio += CONCORRENCIA) {
        const lote = unicos.slice(inicio, inicio + CONCORRENCIA);
        const respostas = await Promise.all(lote.map(processarItem));
        resultados.push(...respostas);
      }

      return {
        ok: true,
        fonte: "PERFECT",
        total: unicos.length,
        localizados: resultados.filter(
          (item) => item.status === "localizado"
        ).length,
        resultados,
      };
    }),


  fornecedores: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx); await ensure();
    const [rows] = await db().query<any[]>(`SELECT id,nome,ativo FROM compras_pecas_fornecedores ORDER BY ativo DESC,nome ASC`);
    return rows.map((x) => ({ ...x, id: Number(x.id), ativo: Boolean(x.ativo) }));
  }),

  criarFornecedor: protectedProcedure.input(z.object({ nome: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    await db().query(`INSERT INTO compras_pecas_fornecedores (nome,ativo) VALUES (?,1) ON DUPLICATE KEY UPDATE ativo=1,nome=VALUES(nome)`, [input.nome.trim()]);
    return { ok: true };
  }),

  definirFornecedorAtivo: protectedProcedure.input(z.object({ id: z.number().int().positive(), ativo: z.boolean() })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    await db().query(`UPDATE compras_pecas_fornecedores SET ativo=? WHERE id=?`, [input.ativo ? 1 : 0, input.id]);
    return { ok: true };
  }),

  criarPlanejamento: protectedProcedure.input(z.object({
    lojaId: z.number().int().positive(),
    lojaNome: z.string().trim().min(2).max(120),
    arquivoNome: z.string().max(255).nullable().optional(),
    itens: z.array(itemSchema).min(1).max(5000)
  })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const buy = input.itens.filter((x) => x.quantidadeFinal > 0);
    if (!buy.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Não há itens para cotação." });
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      const [r] = await c.query<any>(
        `INSERT INTO compras_pecas_planejamentos
           (lojaId,lojaNome,status,arquivoNome,criadoPorNome)
         VALUES (?,?,'planejamento',?,?)`,
        [
          input.lojaId,
          input.lojaNome,
          input.arquivoNome || null,
          String(ctx?.user?.name || "Usuário")
        ]
      );
      const id = Number(r.insertId);
      for (const x of buy) {
        await c.query(`INSERT INTO compras_pecas_itens (planejamentoId,codigo,item,grupo,especificacao,vendaPeriodo,estoqueAtual,necessidade,quantidadeFinal,lado) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id,x.codigo,x.item,x.grupo,x.especificacao || null,x.vendaPeriodo,x.estoqueAtual,x.necessidade,x.quantidadeFinal,x.lado || null]);
      }
      await c.commit();
      return { ok: true, planejamentoId: id, totalItens: buy.length };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),

  planejamentos: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx); await ensure();
    const [rows] = await db().query<any[]>(`SELECT p.id,p.lojaId,p.lojaNome,p.status,p.arquivoNome,p.createdAt,COUNT(i.id) totalItens,COALESCE(SUM(i.quantidadeFinal),0) totalQuantidade FROM compras_pecas_planejamentos p LEFT JOIN compras_pecas_itens i ON i.planejamentoId=p.id GROUP BY p.id ORDER BY p.createdAt DESC,p.id DESC LIMIT 100`);
    return rows.map((x) => ({ ...x, id: Number(x.id), totalItens: Number(x.totalItens||0), totalQuantidade: Number(x.totalQuantidade||0) }));
  }),

  detalhe: protectedProcedure.input(z.object({ planejamentoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const [pRows] = await db().query<any[]>(`SELECT * FROM compras_pecas_planejamentos WHERE id=? LIMIT 1`, [input.planejamentoId]);
    if (!pRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Planejamento não encontrado." });
    const [items] = await db().query<any[]>(`SELECT i.*,f.nome fornecedorSelecionadoNome FROM compras_pecas_itens i LEFT JOIN compras_pecas_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? ORDER BY i.codigo`, [input.planejamentoId]);
    const ids = items.map((x) => Number(x.id));
    let quotes:any[]=[];
    if (ids.length) {
      const ph=ids.map(()=>"?").join(",");
      const [q] = await db().query<any[]>(`SELECT c.itemId,c.fornecedorId,c.valor,f.nome fornecedorNome FROM compras_pecas_cotacoes c JOIN compras_pecas_fornecedores f ON f.id=c.fornecedorId WHERE c.itemId IN (${ph})`, ids);
      quotes=q;
    }
    return {
      planejamento: { ...pRows[0], id:Number(pRows[0].id) },
      itens: items.map((x)=>({ ...x,id:Number(x.id),planejamentoId:Number(x.planejamentoId),vendaPeriodo:Number(x.vendaPeriodo||0),estoqueAtual:Number(x.estoqueAtual||0),necessidade:Number(x.necessidade||0),quantidadeFinal:Number(x.quantidadeFinal||0),fornecedorSelecionadoId:x.fornecedorSelecionadoId?Number(x.fornecedorSelecionadoId):null,precoSelecionado:x.precoSelecionado==null?null:Number(x.precoSelecionado) })),
      cotacoes: quotes.map((x)=>({ ...x,itemId:Number(x.itemId),fornecedorId:Number(x.fornecedorId),valor:Number(x.valor||0) })),
    };
  }),

  atualizarQuantidade: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        quantidadeFinal: z.number().int().min(0).max(100000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensure();

      const [rows] = await db().query<any[]>(
        `SELECT i.id, p.status
         FROM compras_pecas_itens i
         INNER JOIN compras_pecas_planejamentos p
           ON p.id = i.planejamentoId
         WHERE i.id = ?
         LIMIT 1`,
        [input.itemId]
      );

      if (!rows.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Item do planejamento não encontrado.",
        });
      }

      if (String(rows[0].status) === "pedido_salvo") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Esse planejamento já possui pedido salvo. Exclua/reabra o pedido antes de alterar a quantidade.",
        });
      }

      await db().query(
        `UPDATE compras_pecas_itens
         SET quantidadeFinal = ?
         WHERE id = ?`,
        [input.quantidadeFinal, input.itemId]
      );

      return {
        ok: true,
        itemId: input.itemId,
        quantidadeFinal: input.quantidadeFinal,
      };
    }),

  salvarCotacao: protectedProcedure.input(z.object({ itemId:z.number().int().positive(), fornecedorId:z.number().int().positive(), valor:z.number().positive() })).mutation(async ({ctx,input})=>{
    assertCompras(ctx); await ensure();
    await db().query(`INSERT INTO compras_pecas_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`,[input.itemId,input.fornecedorId,input.valor]);
    await db().query(`UPDATE compras_pecas_planejamentos p JOIN compras_pecas_itens i ON i.planejamentoId=p.id SET p.status=CASE WHEN p.status='pedido_salvo' THEN p.status ELSE 'cotacao' END WHERE i.id=?`,[input.itemId]);
    return {ok:true};
  }),

  selecionarFornecedor: protectedProcedure.input(z.object({itemId:z.number().int().positive(),fornecedorId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [r]=await db().query<any[]>(`SELECT valor FROM compras_pecas_cotacoes WHERE itemId=? AND fornecedorId=? LIMIT 1`,[input.itemId,input.fornecedorId]);
    if(!r.length) throw new TRPCError({code:"BAD_REQUEST",message:"Fornecedor sem preço para esse item."});
    await db().query(`UPDATE compras_pecas_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`,[input.fornecedorId,Number(r[0].valor),input.itemId]);
    return {ok:true};
  }),

  selecionarMenores: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [items]=await db().query<any[]>(`SELECT id FROM compras_pecas_itens WHERE planejamentoId=? AND quantidadeFinal>0`,[input.planejamentoId]);
    let n=0;
    for(const it of items){
      const [q]=await db().query<any[]>(`SELECT fornecedorId,valor FROM compras_pecas_cotacoes WHERE itemId=? ORDER BY valor ASC LIMIT 1`,[it.id]);
      if(!q.length) continue;
      await db().query(`UPDATE compras_pecas_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`,[Number(q[0].fornecedorId),Number(q[0].valor),it.id]); n++;
    }
    return {ok:true,selecionados:n};
  }),

  arquivoCotacaoFornecedor: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive(),fornecedorId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [f]=await db().query<any[]>(`SELECT id,nome FROM compras_pecas_fornecedores WHERE id=? AND ativo=1 LIMIT 1`,[input.fornecedorId]);
    if(!f.length) throw new TRPCError({code:"NOT_FOUND",message:"Fornecedor não encontrado."});
    const [items]=await db().query<any[]>(`SELECT codigo,item FROM compras_pecas_itens WHERE planejamentoId=? AND quantidadeFinal>0 ORDER BY codigo`,[input.planejamentoId]);
    const buf=await quoteBook(String(f[0].nome),items.map((x)=>({codigo:String(x.codigo),item:String(x.item)})));
    return {nome:`cotacao-pecas-${norm(f[0].nome).toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${input.planejamentoId}.xlsx`,mime:MIME_XLSX,base64:Buffer.from(buf as any).toString("base64")};
  }),

  importarCotacaoFornecedor: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive(),fornecedorId:z.number().int().positive(),arquivoNome:z.string().min(1),arquivoBase64:z.string().min(1)})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [f]=await db().query<any[]>(`SELECT id,nome FROM compras_pecas_fornecedores WHERE id=? AND ativo=1 LIMIT 1`,[input.fornecedorId]);
    if(!f.length) throw new TRPCError({code:"NOT_FOUND",message:"Fornecedor não encontrado."});
    const buffer=Buffer.from(input.arquivoBase64,"base64");
    if(!buffer.length || buffer.length>MAX_FILE) throw new TRPCError({code:"BAD_REQUEST",message:"Arquivo inválido ou maior que 8 MB."});
    let lines:any[][];
    try { const wb=XLSX.read(buffer,{type:"buffer",raw:false}); lines=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:false}); } catch { throw new TRPCError({code:"BAD_REQUEST",message:"Não foi possível ler a planilha."}); }
    let hi=-1,ci=-1,pi=-1; const expected=norm(f[0].nome);
    for(let i=0;i<Math.min(lines.length,12);i++){ const row=(lines[i]||[]).map(norm); const c=row.indexOf("CODIGO"); const p=row.indexOf(expected); if(c>=0&&p>=0){hi=i;ci=c;pi=p;break;} }
    if(hi<0) throw new TRPCError({code:"BAD_REQUEST",message:"Planilha inválida ou de outro fornecedor."});
    const [items]=await db().query<any[]>(`SELECT id,codigo FROM compras_pecas_itens WHERE planejamentoId=?`,[input.planejamentoId]);
    const map=new Map(items.map((x)=>[norm(x.codigo),Number(x.id)])); let imported=0;
    for(let i=hi+1;i<lines.length;i++){ const row=lines[i]||[]; const id=map.get(norm(row[ci])); if(!id) continue; const val=parseMoney(row[pi]); if(val<=0) continue; await db().query(`INSERT INTO compras_pecas_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`,[id,input.fornecedorId,val]); imported++; }
    if(!imported) throw new TRPCError({code:"BAD_REQUEST",message:"Nenhum preço válido encontrado."});
    await db().query(`UPDATE compras_pecas_planejamentos SET status=CASE WHEN status='pedido_salvo' THEN status ELSE 'cotacao' END WHERE id=?`,[input.planejamentoId]);
    return {ok:true,fornecedorId:input.fornecedorId,importados:imported};
  }),

  fecharPedidos: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [old]=await db().query<any[]>(`SELECT id FROM compras_pecas_pedidos WHERE planejamentoId=? LIMIT 1`,[input.planejamentoId]);
    if(old.length) return {ok:true,jaSalvo:true,pedidos:0};
    const [items]=await db().query<any[]>(`SELECT i.*,f.nome fornecedorNome FROM compras_pecas_itens i LEFT JOIN compras_pecas_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? AND i.quantidadeFinal>0 ORDER BY i.codigo`,[input.planejamentoId]);
    const missing=items.filter((x)=>!x.fornecedorSelecionadoId||x.precoSelecionado==null||Number(x.precoSelecionado)<=0);
    if(missing.length) throw new TRPCError({code:"BAD_REQUEST",message:`${missing.length} item(ns) ainda sem fornecedor/preço selecionado.`});
    const groups=new Map<number,any[]>(); for(const x of items){const id=Number(x.fornecedorSelecionadoId);groups.set(id,[...(groups.get(id)||[]),x]);}
    const c=await db().getConnection();
    try{ await c.beginTransaction();
      for(const [fid,list] of groups){ const qty=list.reduce((s,x)=>s+Number(x.quantidadeFinal||0),0); const total=list.reduce((s,x)=>s+Number(x.quantidadeFinal||0)*Number(x.precoSelecionado||0),0); const [r]=await c.query<any>(`INSERT INTO compras_pecas_pedidos (planejamentoId,fornecedorId,fornecedorNome,totalItens,totalQuantidade,totalValor) VALUES (?,?,?,?,?,?)`,[input.planejamentoId,fid,String(list[0].fornecedorNome||"Fornecedor"),list.length,qty,total]); const pid=Number(r.insertId); for(const x of list){const q=Number(x.quantidadeFinal||0),v=Number(x.precoSelecionado||0),t=Number((q*v).toFixed(2)); await c.query(`INSERT INTO compras_pecas_pedido_itens (pedidoId,codigo,item,quantidade,valorUnitario,total) VALUES (?,?,?,?,?,?)`,[pid,x.codigo,x.item,q,v,t]);}}
      await c.query(`UPDATE compras_pecas_planejamentos SET status='pedido_salvo' WHERE id=?`,[input.planejamentoId]); await c.commit(); return {ok:true,jaSalvo:false,pedidos:groups.size};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }),

  excluirPedidosPlanejamento: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensure();
      const c = await db().getConnection();

      try {
        await c.beginTransaction();

        const [pedidos] = await c.query<any[]>(
          `SELECT id
           FROM compras_pecas_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE pi
           FROM compras_pecas_pedido_itens pi
           INNER JOIN compras_pecas_pedidos p ON p.id = pi.pedidoId
           WHERE p.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE FROM compras_pecas_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        const [cotacoes] = await c.query<any[]>(
          `SELECT COUNT(*) AS total
           FROM compras_pecas_cotacoes c
           INNER JOIN compras_pecas_itens i ON i.id = c.itemId
           WHERE i.planejamentoId = ?`,
          [input.planejamentoId]
        );

        const novoStatus =
          Number(cotacoes[0]?.total || 0) > 0 ? "cotacao" : "planejamento";

        await c.query(
          `UPDATE compras_pecas_planejamentos
           SET status = ?
           WHERE id = ?`,
          [novoStatus, input.planejamentoId]
        );

        await c.commit();

        return {
          ok: true,
          excluidos: pedidos.length,
          planejamentoId: input.planejamentoId,
          novoStatus,
        };
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    }),

  excluirPlanejamento: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensure();
      const c = await db().getConnection();

      try {
        await c.beginTransaction();

        const [planos] = await c.query<any[]>(
          `SELECT id
           FROM compras_pecas_planejamentos
           WHERE id = ?
           LIMIT 1`,
          [input.planejamentoId]
        );

        if (!planos.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Planejamento não encontrado.",
          });
        }

        await c.query(
          `DELETE pi
           FROM compras_pecas_pedido_itens pi
           INNER JOIN compras_pecas_pedidos p ON p.id = pi.pedidoId
           WHERE p.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE FROM compras_pecas_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE c
           FROM compras_pecas_cotacoes c
           INNER JOIN compras_pecas_itens i ON i.id = c.itemId
           WHERE i.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE FROM compras_pecas_itens
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE FROM compras_pecas_planejamentos
           WHERE id = ?`,
          [input.planejamentoId]
        );

        await c.commit();

        return {
          ok: true,
          planejamentoId: input.planejamentoId,
        };
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    }),

  pedidos: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).query(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [rows]=await db().query<any[]>(`SELECT * FROM compras_pecas_pedidos WHERE planejamentoId=? ORDER BY fornecedorNome`,[input.planejamentoId]);
    return rows.map((x)=>({...x,id:Number(x.id),planejamentoId:Number(x.planejamentoId),fornecedorId:Number(x.fornecedorId),totalItens:Number(x.totalItens||0),totalQuantidade:Number(x.totalQuantidade||0),totalValor:Number(x.totalValor||0)}));
  }),

  arquivoPedido: protectedProcedure.input(z.object({pedidoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure();
    const [p]=await db().query<any[]>(`SELECT * FROM compras_pecas_pedidos WHERE id=? LIMIT 1`,[input.pedidoId]); if(!p.length) throw new TRPCError({code:"NOT_FOUND",message:"Pedido não encontrado."});
    const [items]=await db().query<any[]>(`SELECT codigo,item,quantidade,valorUnitario,total FROM compras_pecas_pedido_itens WHERE pedidoId=? ORDER BY codigo`,[input.pedidoId]);
    const buf=await orderBook(items.map((x)=>({codigo:String(x.codigo),item:String(x.item),quantidade:Number(x.quantidade||0),valorUnitario:Number(x.valorUnitario||0),total:Number(x.total||0)})));
    return {nome:`pedido-pecas-${norm(p[0].fornecedorNome).toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${p[0].planejamentoId}.xlsx`,mime:MIME_XLSX,base64:Buffer.from(buf as any).toString("base64")};
  }),
});
