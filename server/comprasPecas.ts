import mysql from "mysql2/promise";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { consultarCatalogoPerfectLocal } from "./catalogoPerfectPecas";
import { APLICACOES_AMORTECEDORES } from "./amortecedoresAplicacoes";
import { protectedProcedure, router } from "./_core/trpc";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE = 8 * 1024 * 1024;
let pool: mysql.Pool | null = null;
const prontos = new Set<string>();

export function assertCompras(ctx: any) {
  const role = String(ctx?.user?.role || "");
  if (!["compras", "admin", "gestor"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado." });
  }
}

// Exclusão de compra (planejamento ou pedidos) exige senha, conferida aqui no servidor.
// A senha fica na variável de ambiente COMPRAS_SENHA_EXCLUSAO (nunca no código); sem ela, ninguém exclui.
export function assertSenhaExclusao(senha: string) {
  const esperada = String(process.env.COMPRAS_SENHA_EXCLUSAO || "").trim();
  if (!esperada) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Senha de exclusão não configurada no servidor." });
  }
  if (String(senha || "").trim() !== esperada) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Senha de exclusão incorreta." });
  }
}

export function db() {
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

// T = prefixo das tabelas: compras_pecas (peças) ou compras_amort (amortecedores).
async function ensure(T = "compras_pecas") {
  if (prontos.has(T)) return;
  const p = db();
  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_fornecedores (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(160) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_cp_fornecedor_nome (nome)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Conversão do nosso código para o código do fornecedor (hoje só NEW KITS usa).
  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_codigos_fornecedor (
    fornecedorId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    codigoFornecedor VARCHAR(100) NOT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (fornecedorId, codigo)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Lojas atendidas por cada fornecedor de peças. Sem nenhuma loja aqui = atende todas.
  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_fornecedor_lojas (
    fornecedorId INT UNSIGNED NOT NULL,
    lojaId INT UNSIGNED NOT NULL,
    PRIMARY KEY (fornecedorId, lojaId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_planejamentos (
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
      `ALTER TABLE ${T}_planejamentos
       ADD COLUMN lojaId INT UNSIGNED NULL AFTER id`
    );
  } catch (error: any) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await p.query(
      `ALTER TABLE ${T}_planejamentos
       ADD COLUMN lojaNome VARCHAR(120) NULL AFTER lojaId`
    );
  } catch (error: any) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_itens (
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

  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_cotacoes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    itemId INT UNSIGNED NOT NULL,
    fornecedorId INT UNSIGNED NOT NULL,
    valor DECIMAL(12,4) NOT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cp_cot_item_fornecedor (itemId, fornecedorId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_pedidos (
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

  await p.query(`CREATE TABLE IF NOT EXISTS ${T}_pedido_itens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    pedidoId INT UNSIGNED NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    item VARCHAR(500) NOT NULL,
    quantidade INT NOT NULL,
    valorUnitario DECIMAL(12,4) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (id), KEY idx_cp_pedido_item (pedidoId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  if (T === "compras_pecas") await p.query(`CREATE TABLE IF NOT EXISTS compras_pecas_catalogo_cache (
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
  // Lixeira: planejamento excluído fica guardado (com quem excluiu e quando) e pode ser restaurado.
  for (const coluna of ["ADD COLUMN excluidoEm TIMESTAMP NULL", "ADD COLUMN excluidoPorNome VARCHAR(160) NULL"]) {
    try {
      await p.query(`ALTER TABLE ${T}_planejamentos ${coluna}`);
    } catch (error: any) {
      if (error?.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  // Peça acima do limite de preço: 'aprovado' entra no pedido, 'negado' fica na cotação mas não é pedida.
  try {
    await p.query(`ALTER TABLE ${T}_itens ADD COLUMN aprovacaoValor VARCHAR(10) NULL`);
  } catch (error: any) {
    if (error?.code !== "ER_DUP_FIELDNAME") throw error;
  }

  // Amortecedores: aplicação (carros) de cada código, lida do Impacto Prime. Carga inicial só com a tabela vazia.
  if (T === "compras_amort") {
    await p.query(`CREATE TABLE IF NOT EXISTS compras_amort_aplicacoes (
      codigo VARCHAR(100) NOT NULL,
      aplicacao TEXT NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (codigo)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const [qtd] = await p.query<any[]>(`SELECT COUNT(*) total FROM compras_amort_aplicacoes`);
    if (!Number(qtd[0]?.total || 0)) {
      const lista = Object.entries(APLICACOES_AMORTECEDORES);
      for (let i = 0; i < lista.length; i += 200) {
        const lote = lista.slice(i, i + 200);
        await p.query(`INSERT IGNORE INTO compras_amort_aplicacoes (codigo, aplicacao) VALUES ${lote.map(() => "(?,?)").join(",")}`, lote.flat());
      }
    }
  }
  prontos.add(T);
}

export function norm(v: unknown) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

// Limite de preço para pedir OK antes de comprar: bucha acima de R$ 30, qualquer peça acima de R$ 100.
export const LIMITE_BUCHA = 30;
export const LIMITE_PECA = 100;
function acimaDoLimitePeca(grupo: unknown, preco: number) {
  if (!(preco > 0)) return false;
  return norm(grupo) === "BUCHA" ? preco > LIMITE_BUCHA : preco > LIMITE_PECA;
}

// Fornecedores que informam o próprio código na cotação e recebem o pedido com a conversão.
const FORNECEDORES_COM_CODIGO_PROPRIO = new Set(["NEW KITS"]);

function colunaCodigoDoFornecedor(nomeFornecedor: unknown) {
  const nome = norm(nomeFornecedor);
  return FORNECEDORES_COM_CODIGO_PROPRIO.has(nome) ? `CÓDIGO ${nome}` : undefined;
}

async function codigosDoFornecedor(T: string, fornecedorId: number, codigos: string[]) {
  const mapa = new Map<string, string>();
  if (!codigos.length) return mapa;
  const [rows] = await db().query<any[]>(
    `SELECT codigo, codigoFornecedor FROM ${T}_codigos_fornecedor WHERE fornecedorId=? AND codigo IN (${codigos.map(() => "?").join(",")})`,
    [fornecedorId, ...codigos.map((c) => norm(c))]
  );
  for (const r of rows) mapa.set(String(r.codigo), String(r.codigoFornecedor));
  return mapa;
}

// Lê preço vindo da planilha ou digitado: aceita "117,09", "117.09" (como o Excel entrega),
// "1.234,56", "1,234.56" e número puro. Texto como "falta" vira 0.
export function parseMoney(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    // O separador que vem por último é o decimal.
    s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgula >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (ponto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


async function consultarPerfect(codigoOriginal: string) {
  const codigo = norm(codigoOriginal).replace(/\s+/g, "");
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

// titulo (ex.: "COTAÇÃO DE PEÇAS - JOINVILLE") vai nas linhas 1-2; o cabeçalho fica na linha 3
// (a importação procura o cabeçalho nas 12 primeiras linhas).
// colunaCodigoFornecedor (ex.: "CÓDIGO NEW KITS"): coluna D liberada para o fornecedor informar o código dele;
// vem preenchida com as conversões já conhecidas (item.codigoFornecedor).
export async function quoteBook(
  name: string,
  items: Array<{ codigo: string; item: string; codigoFornecedor?: string | null }>,
  titulo?: string,
  colunaCodigoFornecedor?: string
) {
  const wb = new ExcelJS.Workbook();
  const H = 3;
  const ultima = colunaCodigoFornecedor ? "D" : "C";
  const ws = wb.addWorksheet("Cotação", { views: [{ state: "frozen", ySplit: H }] });
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 55;
  ws.getColumn(3).width = 20;
  if (colunaCodigoFornecedor) ws.getColumn(4).width = 24;
  ws.mergeCells(`A1:${ultima}1`);
  ws.getCell("A1").value = titulo || "COTAÇÃO";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells(`A2:${ultima}2`);
  ws.getCell("A2").value = colunaCodigoFornecedor
    ? `Fornecedor: ${name} • preencha o preço na coluna ${name} e o seu código na coluna ${colunaCodigoFornecedor}`
    : `Fornecedor: ${name} • preencha só a coluna com o seu nome`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getRow(H).values = colunaCodigoFornecedor ? ["CÓDIGO", "ITEM", name, colunaCodigoFornecedor] : ["CÓDIGO", "ITEM", name];
  items.forEach((x) => ws.addRow(colunaCodigoFornecedor ? [x.codigo, x.item, null, x.codigoFornecedor || null] : [x.codigo, x.item, null]));
  ws.getRow(H).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(H).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  for (let r = H + 1; r <= ws.rowCount; r++) ws.getCell(r, 3).numFmt = '"R$" #,##0.00';
  const editavel = (c: number) => c === 3 || (Boolean(colunaCodigoFornecedor) && c === 4);
  ws.eachRow((row, r) => row.eachCell({ includeEmpty: true }, (cell, c) => {
    cell.protection = { locked: r <= H || !editavel(c) };
  }));
  if (colunaCodigoFornecedor) {
    for (let r = H + 1; r <= ws.rowCount; r++) ws.getCell(r, 4).protection = { locked: false };
  }
  await ws.protect("fr-cotacao-pecas", {
    selectLockedCells: false, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
  });
  return wb.xlsx.writeBuffer();
}

// titulo (ex.: "PEDIDO DE PEÇAS - JOINVILLE") e subtitulo (fornecedor/entrega) nas linhas 1-2; cabeçalho na linha 3.
// colunaCodigoFornecedor (ex.: "CÓDIGO NEW KITS"): coluna extra ao lado do nosso código com a conversão do fornecedor.
export async function orderBook(items: Array<any>, titulo?: string, subtitulo?: string, colunaCodigoFornecedor?: string) {
  const wb = new ExcelJS.Workbook();
  const H = 3;
  const comCodigo = Boolean(colunaCodigoFornecedor);
  const ws = wb.addWorksheet("Pedido", { views: [{ state: "frozen", ySplit: H, showGridLines: false }] });
  (comCodigo ? [20, 22, 52, 16, 20, 20] : [20, 52, 16, 20, 20]).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const ultima = comCodigo ? "F" : "E";
  ws.mergeCells(`A1:${ultima}1`);
  ws.getCell("A1").value = titulo || "PEDIDO";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells(`A2:${ultima}2`);
  ws.getCell("A2").value = subtitulo || "";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getRow(H).values = comCodigo
    ? ["CÓDIGO", colunaCodigoFornecedor, "ITEM", "QUANTIDADE", "VALOR UNITÁRIO", "TOTAL"]
    : ["CÓDIGO", "ITEM", "QUANTIDADE", "VALOR UNITÁRIO", "TOTAL"];
  items.forEach((x) =>
    ws.addRow(
      comCodigo
        ? [x.codigo, x.codigoFornecedor || "", x.item, x.quantidade, x.valorUnitario, x.total]
        : [x.codigo, x.item, x.quantidade, x.valorUnitario, x.total]
    )
  );
  const total = items.reduce((s, x) => s + Number(x.total || 0), 0);
  const tr = ws.addRow(comCodigo ? ["TOTAL DO PEDIDO", null, null, null, null, Number(total.toFixed(2))] : ["TOTAL DO PEDIDO", null, null, null, Number(total.toFixed(2))]);
  ws.getRow(H).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(H).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  const cQtd = comCodigo ? 4 : 3;
  for (let r = H + 1; r <= ws.rowCount; r++) {
    ws.getCell(r, cQtd).numFmt = "0";
    ws.getCell(r, cQtd + 1).numFmt = '"R$" #,##0.00';
    ws.getCell(r, cQtd + 2).numFmt = '"R$" #,##0.00';
  }
  tr.font = { bold: true };
  tr.getCell(cQtd + 2).numFmt = '"R$" #,##0.00';
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

type ConfigCompras = {
  prefixo: "compras_pecas" | "compras_amort";
  rotulo: string; // título dos arquivos: "PEÇAS", "AMORTECEDORES"
  arquivo: string; // nome dos arquivos baixados: cotacao-<arquivo>-...
  limiteValor: boolean; // OK/Negar acima de R$ 30 (bucha) / R$ 100 (peça)
  aplicacaoNoItem: boolean; // cotação e pedido levam "item — aplicação"
  precoFixo?: { fornecedor: string; valor: number }; // fornecedor com preço único em todos os itens, todas as lojas
};

// Preenche o preço fixo do fornecedor em todos os itens do planejamento e já deixa ele escolhido.
// Não sobrescreve preço digitado/importado nem uma escolha já feita; pedido fechado não muda.
async function aplicarPrecoFixo(cfg: ConfigCompras, planejamentoId: number) {
  if (!cfg.precoFixo) return;
  const T = cfg.prefixo;
  const [p] = await db().query<any[]>(`SELECT status FROM ${T}_planejamentos WHERE id=? LIMIT 1`, [planejamentoId]);
  if (!p.length || String(p[0].status) === "pedido_salvo") return;
  await db().query(`INSERT IGNORE INTO ${T}_fornecedores (nome,ativo) VALUES (?,1)`, [cfg.precoFixo.fornecedor]);
  const [f] = await db().query<any[]>(`SELECT id FROM ${T}_fornecedores WHERE nome=? LIMIT 1`, [cfg.precoFixo.fornecedor]);
  const fid = Number(f[0]?.id || 0);
  if (!fid) return;
  await db().query(`INSERT IGNORE INTO ${T}_cotacoes (itemId,fornecedorId,valor) SELECT id,?,? FROM ${T}_itens WHERE planejamentoId=?`, [fid, cfg.precoFixo.valor, planejamentoId]);
  await db().query(
    `UPDATE ${T}_itens i JOIN ${T}_cotacoes c ON c.itemId=i.id AND c.fornecedorId=?
        SET i.fornecedorSelecionadoId=?, i.precoSelecionado=c.valor
      WHERE i.planejamentoId=? AND i.fornecedorSelecionadoId IS NULL`,
    [fid, fid, planejamentoId]
  );
}

function itemComAplicacao(cfg: ConfigCompras, item: unknown, especificacao: unknown) {
  const ap = String(especificacao ?? "").trim();
  return cfg.aplicacaoNoItem && ap ? `${String(item ?? "")} — ${ap}`.slice(0, 500) : String(item ?? "");
}

function criarRouterCompras(cfg: ConfigCompras) {
  const T = cfg.prefixo;
  return router({

  // Aplicação (carros) por código; só amortecedores têm essa base.
  buscarAplicacoes: protectedProcedure.input(z.object({ codigos: z.array(z.string().min(1).max(100)).max(5000) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    const codigos = Array.from(new Set(input.codigos.map((c) => norm(c))));
    if (T !== "compras_amort" || !codigos.length) return [] as Array<{ codigo: string; aplicacao: string }>;
    const [rows] = await db().query<any[]>(`SELECT codigo, aplicacao FROM compras_amort_aplicacoes WHERE codigo IN (${codigos.map(() => "?").join(",")})`, codigos);
    return rows.map((r) => ({ codigo: String(r.codigo), aplicacao: String(r.aplicacao) }));
  }),


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
      await ensure(T);

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
        // Sempre consulta a base local desta versão do catálogo.
        // Isso também substitui no cache resultados antigos vindos da web.
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
      const CONCORRENCIA = 5;

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
    assertCompras(ctx); await ensure(T);
    const [rows] = await db().query<any[]>(
      `SELECT f.id,f.nome,f.ativo,GROUP_CONCAT(fl.lojaId ORDER BY fl.lojaId) lojas
         FROM ${T}_fornecedores f
         LEFT JOIN ${T}_fornecedor_lojas fl ON fl.fornecedorId=f.id
        GROUP BY f.id ORDER BY f.ativo DESC,f.nome ASC`
    );
    // lojas vazio = atende todas as lojas
    return rows.map((x) => ({ id: Number(x.id), nome: String(x.nome), ativo: Boolean(x.ativo), lojas: String(x.lojas || "").split(",").filter(Boolean).map(Number) }));
  }),

  criarFornecedor: protectedProcedure.input(z.object({ nome: z.string().trim().min(2).max(160), lojas: z.array(z.number().int().positive()).max(20).optional() })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    await db().query(`INSERT INTO ${T}_fornecedores (nome,ativo) VALUES (?,1) ON DUPLICATE KEY UPDATE ativo=1,nome=VALUES(nome)`, [input.nome.trim()]);
    if (input.lojas?.length) {
      const [f] = await db().query<any[]>(`SELECT id FROM ${T}_fornecedores WHERE nome=? LIMIT 1`, [input.nome.trim()]);
      const fid = Number(f[0]?.id || 0);
      if (fid) for (const lojaId of new Set(input.lojas)) await db().query(`INSERT IGNORE INTO ${T}_fornecedor_lojas (fornecedorId,lojaId) VALUES (?,?)`, [fid, lojaId]);
    }
    return { ok: true };
  }),

  // Em quais lojas o fornecedor aparece na cotação (lista vazia = todas).
  definirLojasFornecedor: protectedProcedure.input(z.object({ id: z.number().int().positive(), lojas: z.array(z.number().int().positive()).max(20) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      await c.query(`DELETE FROM ${T}_fornecedor_lojas WHERE fornecedorId=?`, [input.id]);
      for (const lojaId of new Set(input.lojas)) await c.query(`INSERT INTO ${T}_fornecedor_lojas (fornecedorId,lojaId) VALUES (?,?)`, [input.id, lojaId]);
      await c.commit();
      return { ok: true };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),

  definirFornecedorAtivo: protectedProcedure.input(z.object({ id: z.number().int().positive(), ativo: z.boolean() })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    await db().query(`UPDATE ${T}_fornecedores SET ativo=? WHERE id=?`, [input.ativo ? 1 : 0, input.id]);
    return { ok: true };
  }),

  criarPlanejamento: protectedProcedure.input(z.object({
    lojaId: z.number().int().positive(),
    lojaNome: z.string().trim().min(2).max(120),
    arquivoNome: z.string().max(255).nullable().optional(),
    itens: z.array(itemSchema).min(1).max(5000)
  })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    const buy = input.itens.filter((x) => x.quantidadeFinal > 0);
    if (!buy.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Não há itens para cotação." });
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      const [r] = await c.query<any>(
        `INSERT INTO ${T}_planejamentos
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
        await c.query(`INSERT INTO ${T}_itens (planejamentoId,codigo,item,grupo,especificacao,vendaPeriodo,estoqueAtual,necessidade,quantidadeFinal,lado) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id,x.codigo,x.item,x.grupo,x.especificacao || null,x.vendaPeriodo,x.estoqueAtual,x.necessidade,x.quantidadeFinal,x.lado || null]);
      }
      await c.commit();
      await aplicarPrecoFixo(cfg, id);
      return { ok: true, planejamentoId: id, totalItens: buy.length };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),

  planejamentos: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx); await ensure(T);
    const [rows] = await db().query<any[]>(`SELECT p.id,p.lojaId,p.lojaNome,p.status,p.arquivoNome,p.createdAt,COUNT(i.id) totalItens,COALESCE(SUM(i.quantidadeFinal),0) totalQuantidade FROM ${T}_planejamentos p LEFT JOIN ${T}_itens i ON i.planejamentoId=p.id WHERE p.excluidoEm IS NULL GROUP BY p.id ORDER BY p.createdAt DESC,p.id DESC LIMIT 100`);
    return rows.map((x) => ({ ...x, id: Number(x.id), totalItens: Number(x.totalItens||0), totalQuantidade: Number(x.totalQuantidade||0) }));
  }),

  // Lixeira: planejamentos excluídos (com quem excluiu e quando), para restaurar.
  lixeira: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx); await ensure(T);
    const [rows] = await db().query<any[]>(`SELECT p.id,p.lojaId,p.lojaNome,p.status,p.createdAt,p.excluidoEm,p.excluidoPorNome,COUNT(i.id) totalItens FROM ${T}_planejamentos p LEFT JOIN ${T}_itens i ON i.planejamentoId=p.id WHERE p.excluidoEm IS NOT NULL GROUP BY p.id ORDER BY p.excluidoEm DESC LIMIT 100`);
    return rows.map((x) => ({ id: Number(x.id), lojaId: x.lojaId == null ? null : Number(x.lojaId), lojaNome: String(x.lojaNome || ""), status: String(x.status), totalItens: Number(x.totalItens || 0), createdAt: x.createdAt, excluidoEm: x.excluidoEm, excluidoPorNome: String(x.excluidoPorNome || "") }));
  }),

  restaurarPlanejamento: protectedProcedure.input(z.object({ planejamentoId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    await db().query(`UPDATE ${T}_planejamentos SET excluidoEm=NULL, excluidoPorNome=NULL WHERE id=?`, [input.planejamentoId]);
    return { ok: true, planejamentoId: input.planejamentoId };
  }),

  detalhe: protectedProcedure.input(z.object({ planejamentoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure(T);
    await aplicarPrecoFixo(cfg, input.planejamentoId); // cotações já abertas também recebem o preço fixo
    const [pRows] = await db().query<any[]>(`SELECT * FROM ${T}_planejamentos WHERE id=? LIMIT 1`, [input.planejamentoId]);
    if (!pRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Planejamento não encontrado." });
    const [items] = await db().query<any[]>(`SELECT i.*,f.nome fornecedorSelecionadoNome FROM ${T}_itens i LEFT JOIN ${T}_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? ORDER BY i.codigo`, [input.planejamentoId]);
    const ids = items.map((x) => Number(x.id));
    let quotes:any[]=[];
    if (ids.length) {
      const ph=ids.map(()=>"?").join(",");
      const [q] = await db().query<any[]>(`SELECT c.itemId,c.fornecedorId,c.valor,f.nome fornecedorNome FROM ${T}_cotacoes c JOIN ${T}_fornecedores f ON f.id=c.fornecedorId WHERE c.itemId IN (${ph})`, ids);
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
      await ensure(T);

      const [rows] = await db().query<any[]>(
        `SELECT i.id, p.status
         FROM ${T}_itens i
         INNER JOIN ${T}_planejamentos p
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
        `UPDATE ${T}_itens
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

  // OK ou Negar uma peça acima do limite de preço (null volta para "aguardando").
  definirAprovacao: protectedProcedure.input(z.object({ itemId:z.number().int().positive(), aprovacao:z.enum(["aprovado","negado"]).nullable() })).mutation(async ({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [rows]=await db().query<any[]>(`SELECT p.status FROM ${T}_itens i JOIN ${T}_planejamentos p ON p.id=i.planejamentoId WHERE i.id=? LIMIT 1`,[input.itemId]);
    if(!rows.length) throw new TRPCError({code:"NOT_FOUND",message:"Item não encontrado."});
    if(String(rows[0].status)==="pedido_salvo") throw new TRPCError({code:"BAD_REQUEST",message:"O pedido já foi fechado. Exclua os pedidos para mudar a aprovação."});
    await db().query(`UPDATE ${T}_itens SET aprovacaoValor=? WHERE id=?`,[input.aprovacao,input.itemId]);
    return {ok:true,itemId:input.itemId,aprovacao:input.aprovacao};
  }),

  salvarCotacao: protectedProcedure.input(z.object({ itemId:z.number().int().positive(), fornecedorId:z.number().int().positive(), valor:z.number().positive() })).mutation(async ({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    await db().query(`INSERT INTO ${T}_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`,[input.itemId,input.fornecedorId,input.valor]);
    await db().query(`UPDATE ${T}_itens SET precoSelecionado=? WHERE id=? AND fornecedorSelecionadoId=?`,[input.valor,input.itemId,input.fornecedorId]);
    await db().query(`UPDATE ${T}_planejamentos p JOIN ${T}_itens i ON i.planejamentoId=p.id SET p.status=CASE WHEN p.status='pedido_salvo' THEN p.status ELSE 'cotacao' END WHERE i.id=?`,[input.itemId]);
    return {ok:true};
  }),

  selecionarFornecedor: protectedProcedure.input(z.object({itemId:z.number().int().positive(),fornecedorId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [r]=await db().query<any[]>(`SELECT valor FROM ${T}_cotacoes WHERE itemId=? AND fornecedorId=? LIMIT 1`,[input.itemId,input.fornecedorId]);
    if(!r.length) throw new TRPCError({code:"BAD_REQUEST",message:"Fornecedor sem preço para esse item."});
    await db().query(`UPDATE ${T}_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`,[input.fornecedorId,Number(r[0].valor),input.itemId]);
    return {ok:true};
  }),

  selecionarMenores: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [items]=await db().query<any[]>(`SELECT id FROM ${T}_itens WHERE planejamentoId=? AND quantidadeFinal>0`,[input.planejamentoId]);
    let n=0;
    for(const it of items){
      const [q]=await db().query<any[]>(`SELECT fornecedorId,valor FROM ${T}_cotacoes WHERE itemId=? ORDER BY valor ASC LIMIT 1`,[it.id]);
      if(!q.length) continue;
      await db().query(`UPDATE ${T}_itens SET fornecedorSelecionadoId=?,precoSelecionado=? WHERE id=?`,[Number(q[0].fornecedorId),Number(q[0].valor),it.id]); n++;
    }
    return {ok:true,selecionados:n};
  }),

  arquivoCotacaoFornecedor: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive(),fornecedorId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [f]=await db().query<any[]>(`SELECT id,nome FROM ${T}_fornecedores WHERE id=? AND ativo=1 LIMIT 1`,[input.fornecedorId]);
    if(!f.length) throw new TRPCError({code:"NOT_FOUND",message:"Fornecedor não encontrado."});
    const [items]=await db().query<any[]>(`SELECT codigo,item,especificacao FROM ${T}_itens WHERE planejamentoId=? AND quantidadeFinal>0 ORDER BY codigo`,[input.planejamentoId]);
    const [pl]=await db().query<any[]>(`SELECT lojaNome FROM ${T}_planejamentos WHERE id=? LIMIT 1`,[input.planejamentoId]);
    const cidade=String(pl[0]?.lojaNome||"");
    const colunaCodigo=colunaCodigoDoFornecedor(f[0].nome);
    const conversoes=colunaCodigo?await codigosDoFornecedor(T,Number(f[0].id),items.map((x)=>String(x.codigo))):new Map<string,string>();
    const buf=await quoteBook(
      String(f[0].nome),
      items.map((x)=>({codigo:String(x.codigo),item:itemComAplicacao(cfg,x.item,x.especificacao),codigoFornecedor:conversoes.get(norm(x.codigo))||null})),
      `COTAÇÃO DE ${cfg.rotulo} - ${cidade.toUpperCase()||"LOJA"}`,
      colunaCodigo
    );
    const seg=(s:string)=>norm(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    return {nome:`cotacao-${cfg.arquivo}-${cidade?`${seg(cidade)}-`:""}${seg(f[0].nome)}-${input.planejamentoId}.xlsx`,mime:MIME_XLSX,base64:Buffer.from(buf as any).toString("base64")};
  }),

  importarCotacaoFornecedor: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive(),fornecedorId:z.number().int().positive(),arquivoNome:z.string().min(1),arquivoBase64:z.string().min(1)})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [f]=await db().query<any[]>(`SELECT id,nome FROM ${T}_fornecedores WHERE id=? AND ativo=1 LIMIT 1`,[input.fornecedorId]);
    if(!f.length) throw new TRPCError({code:"NOT_FOUND",message:"Fornecedor não encontrado."});
    const buffer=Buffer.from(input.arquivoBase64,"base64");
    if(!buffer.length || buffer.length>MAX_FILE) throw new TRPCError({code:"BAD_REQUEST",message:"Arquivo inválido ou maior que 8 MB."});
    let lines:any[][];
    try { const wb=XLSX.read(buffer,{type:"buffer",raw:false}); lines=XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:false}); } catch { throw new TRPCError({code:"BAD_REQUEST",message:"Não foi possível ler a planilha."}); }
    let hi=-1,ci=-1,pi=-1; const expected=norm(f[0].nome);
    for(let i=0;i<Math.min(lines.length,12);i++){ const row=(lines[i]||[]).map(norm); const c=row.indexOf("CODIGO"); const p=row.indexOf(expected); if(c>=0&&p>=0){hi=i;ci=c;pi=p;break;} }
    if(hi<0) throw new TRPCError({code:"BAD_REQUEST",message:"Planilha inválida ou de outro fornecedor."});
    const [items]=await db().query<any[]>(`SELECT id,codigo FROM ${T}_itens WHERE planejamentoId=?`,[input.planejamentoId]);
    const map=new Map(items.map((x)=>[norm(x.codigo),Number(x.id)])); let imported=0;
    // NEW KITS: a coluna "CÓDIGO NEW KITS" guarda a conversão (nosso código continua sendo o usado no sistema).
    const colunaCodigo=colunaCodigoDoFornecedor(f[0].nome);
    const idxCodigoFornecedor=colunaCodigo?(lines[hi]||[]).map(norm).indexOf(norm(colunaCodigo)):-1;
    let conversoes=0;
    for(let i=hi+1;i<lines.length;i++){
      const row=lines[i]||[]; const nosso=norm(row[ci]); const id=map.get(nosso); if(!id) continue;
      if(idxCodigoFornecedor>=0){
        const codigoFornecedor=String(row[idxCodigoFornecedor]??"").trim().slice(0,100);
        if(codigoFornecedor){ await db().query(`INSERT INTO ${T}_codigos_fornecedor (fornecedorId,codigo,codigoFornecedor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE codigoFornecedor=VALUES(codigoFornecedor)`,[input.fornecedorId,nosso,codigoFornecedor]); conversoes++; }
      }
      const val=parseMoney(row[pi]); if(val<=0) continue;
      await db().query(`INSERT INTO ${T}_cotacoes (itemId,fornecedorId,valor) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`,[id,input.fornecedorId,val]);
      // Se este fornecedor já é o escolhido do item, o pedido passa a usar o preço novo.
      await db().query(`UPDATE ${T}_itens SET precoSelecionado=? WHERE id=? AND fornecedorSelecionadoId=?`,[val,id,input.fornecedorId]);
      imported++;
    }
    if(!imported) throw new TRPCError({code:"BAD_REQUEST",message:conversoes?`${conversoes} código(s) do fornecedor salvos, mas nenhum preço válido encontrado.`:"Nenhum preço válido encontrado."});
    await db().query(`UPDATE ${T}_planejamentos SET status=CASE WHEN status='pedido_salvo' THEN status ELSE 'cotacao' END WHERE id=?`,[input.planejamentoId]);
    return {ok:true,fornecedorId:input.fornecedorId,importados:imported,conversoes};
  }),

  fecharPedidos: protectedProcedure.input(z.object({planejamentoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [old]=await db().query<any[]>(`SELECT id FROM ${T}_pedidos WHERE planejamentoId=? LIMIT 1`,[input.planejamentoId]);
    if(old.length) return {ok:true,jaSalvo:true,pedidos:0,semPreco:0};
    const [todos]=await db().query<any[]>(`SELECT i.*,f.nome fornecedorNome FROM ${T}_itens i LEFT JOIN ${T}_fornecedores f ON f.id=i.fornecedorSelecionadoId WHERE i.planejamentoId=? AND i.quantidadeFinal>0 ORDER BY i.codigo`,[input.planejamentoId]);
    // Peça acima do limite (bucha > R$30 ou qualquer peça > R$100) precisa de OK; negada não entra no pedido.
    const aguardando=todos.filter((x)=>cfg.limiteValor&&x.precoSelecionado!=null&&acimaDoLimitePeca(x.grupo,Number(x.precoSelecionado))&&!x.aprovacaoValor);
    if(aguardando.length) throw new TRPCError({code:"BAD_REQUEST",message:`${aguardando.length} peça(s) acima do limite aguardando OK ou Negar.`});
    // Peça que nenhum fornecedor cotou (sem preço em ninguém) fica fora do pedido em vez de travar o fechamento.
    const [cotadas]=todos.length?await db().query<any[]>(`SELECT DISTINCT itemId FROM ${T}_cotacoes WHERE valor>0 AND itemId IN (${todos.map(()=>"?").join(",")})`,todos.map((x)=>Number(x.id))):[[]as any[]];
    const comPreco=new Set(cotadas.map((r:any)=>Number(r.itemId)));
    const semPreco=todos.filter((x)=>x.aprovacaoValor!=="negado"&&!comPreco.has(Number(x.id))).length;
    const items=todos.filter((x)=>x.aprovacaoValor!=="negado"&&comPreco.has(Number(x.id)));
    if(!items.length) throw new TRPCError({code:"BAD_REQUEST",message:"Nenhuma peça com preço para pedir: não há pedido para fechar."});
    const missing=items.filter((x)=>!x.fornecedorSelecionadoId||x.precoSelecionado==null||Number(x.precoSelecionado)<=0);
    if(missing.length) throw new TRPCError({code:"BAD_REQUEST",message:`${missing.length} item(ns) com preço, mas sem fornecedor escolhido. Clique em Escolher ou em Selecionar menores preços.`});
    const groups=new Map<number,any[]>(); for(const x of items){const id=Number(x.fornecedorSelecionadoId);groups.set(id,[...(groups.get(id)||[]),x]);}
    const c=await db().getConnection();
    try{ await c.beginTransaction();
      for(const [fid,list] of groups){ const qty=list.reduce((s,x)=>s+Number(x.quantidadeFinal||0),0); const total=list.reduce((s,x)=>s+Number(x.quantidadeFinal||0)*Number(x.precoSelecionado||0),0); const [r]=await c.query<any>(`INSERT INTO ${T}_pedidos (planejamentoId,fornecedorId,fornecedorNome,totalItens,totalQuantidade,totalValor) VALUES (?,?,?,?,?,?)`,[input.planejamentoId,fid,String(list[0].fornecedorNome||"Fornecedor"),list.length,qty,total]); const pid=Number(r.insertId); for(const x of list){const q=Number(x.quantidadeFinal||0),v=Number(x.precoSelecionado||0),t=Number((q*v).toFixed(2)); await c.query(`INSERT INTO ${T}_pedido_itens (pedidoId,codigo,item,quantidade,valorUnitario,total) VALUES (?,?,?,?,?,?)`,[pid,x.codigo,itemComAplicacao(cfg,x.item,x.especificacao),q,v,t]);}}
      await c.query(`UPDATE ${T}_planejamentos SET status='pedido_salvo' WHERE id=?`,[input.planejamentoId]); await c.commit(); return {ok:true,jaSalvo:false,pedidos:groups.size,semPreco};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }),

  excluirPedidosPlanejamento: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive(), senha: z.string().max(50) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      assertSenhaExclusao(input.senha);
      await ensure(T);
      const c = await db().getConnection();

      try {
        await c.beginTransaction();

        const [pedidos] = await c.query<any[]>(
          `SELECT id
           FROM ${T}_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE pi
           FROM ${T}_pedido_itens pi
           INNER JOIN ${T}_pedidos p ON p.id = pi.pedidoId
           WHERE p.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await c.query(
          `DELETE FROM ${T}_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        const [cotacoes] = await c.query<any[]>(
          `SELECT COUNT(*) AS total
           FROM ${T}_cotacoes c
           INNER JOIN ${T}_itens i ON i.id = c.itemId
           WHERE i.planejamentoId = ?`,
          [input.planejamentoId]
        );

        const novoStatus =
          Number(cotacoes[0]?.total || 0) > 0 ? "cotacao" : "planejamento";

        await c.query(
          `UPDATE ${T}_planejamentos
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
    .input(z.object({ planejamentoId: z.number().int().positive(), senha: z.string().max(50) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      assertSenhaExclusao(input.senha);
      await ensure(T);
      const c = await db().getConnection();

      try {
        await c.beginTransaction();

        const [planos] = await c.query<any[]>(
          `SELECT id
           FROM ${T}_planejamentos
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

        // Vai para a lixeira: nada é apagado, só fica marcado com quem excluiu e quando.
        await c.query(
          `UPDATE ${T}_planejamentos SET excluidoEm=NOW(), excluidoPorNome=? WHERE id=?`,
          [String(ctx?.user?.name || "Usuário"), input.planejamentoId]
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
    assertCompras(ctx); await ensure(T);
    const [rows]=await db().query<any[]>(`SELECT * FROM ${T}_pedidos WHERE planejamentoId=? ORDER BY fornecedorNome`,[input.planejamentoId]);
    return rows.map((x)=>({...x,id:Number(x.id),planejamentoId:Number(x.planejamentoId),fornecedorId:Number(x.fornecedorId),totalItens:Number(x.totalItens||0),totalQuantidade:Number(x.totalQuantidade||0),totalValor:Number(x.totalValor||0)}));
  }),

  arquivoPedido: protectedProcedure.input(z.object({pedidoId:z.number().int().positive()})).mutation(async({ctx,input})=>{
    assertCompras(ctx); await ensure(T);
    const [p]=await db().query<any[]>(`SELECT * FROM ${T}_pedidos WHERE id=? LIMIT 1`,[input.pedidoId]); if(!p.length) throw new TRPCError({code:"NOT_FOUND",message:"Pedido não encontrado."});
    const [items]=await db().query<any[]>(`SELECT codigo,item,quantidade,valorUnitario,total FROM ${T}_pedido_itens WHERE pedidoId=? ORDER BY codigo`,[input.pedidoId]);
    const [pl]=await db().query<any[]>(`SELECT lojaNome FROM ${T}_planejamentos WHERE id=? LIMIT 1`,[p[0].planejamentoId]);
    const cidade=String(pl[0]?.lojaNome||"");
    // NEW KITS: o pedido leva a coluna com o código deles (conversão informada na cotação).
    const colunaCodigo=colunaCodigoDoFornecedor(p[0].fornecedorNome);
    const conversoes=colunaCodigo?await codigosDoFornecedor(T,Number(p[0].fornecedorId),items.map((x)=>String(x.codigo))):new Map<string,string>();
    const buf=await orderBook(
      items.map((x)=>({codigo:String(x.codigo),codigoFornecedor:conversoes.get(norm(x.codigo))||"",item:String(x.item),quantidade:Number(x.quantidade||0),valorUnitario:Number(x.valorUnitario||0),total:Number(x.total||0)})),
      `PEDIDO DE ${cfg.rotulo} - ${cidade.toUpperCase()||"LOJA"}`,
      `Fornecedor: ${p[0].fornecedorNome} • Entrega: ${cidade||"—"} • Pedido nº ${p[0].planejamentoId}`,
      colunaCodigo
    );
    const seg=(s:string)=>norm(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    return {nome:`pedido-${cfg.arquivo}-${cidade?`${seg(cidade)}-`:""}${seg(p[0].fornecedorNome)}-${p[0].planejamentoId}.xlsx`,mime:MIME_XLSX,base64:Buffer.from(buf as any).toString("base64")};
  }),
});
}

export const comprasPecasRouter = criarRouterCompras({ prefixo: "compras_pecas", rotulo: "PEÇAS", arquivo: "pecas", limiteValor: true, aplicacaoNoItem: false });
export const comprasAmortecedoresRouter = criarRouterCompras({ prefixo: "compras_amort", rotulo: "AMORTECEDORES", arquivo: "amortecedores", limiteValor: false, aplicacaoNoItem: true, precoFixo: { fornecedor: "NEW KITS", valor: 50 } });

