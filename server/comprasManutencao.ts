import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { assertCompras, assertSenhaExclusao, db } from "./comprasPecas";

// Manutenção dos equipamentos de cada loja (elevadores, desmontadoras, balanceadoras,
// rampas de alinhamento e compressores): histórico de serviços, garantia e nota fiscal anexada.

export const TIPOS_EQUIPAMENTO = ["elevador", "desmontadora", "balanceadora", "rampa", "compressor"] as const;
const tipoEquipamento = z.enum(TIPOS_EQUIPAMENTO);
const TIPOS_SERVICO = ["preventiva", "corretiva", "instalacao"] as const;
const MAX_ANEXO = 8 * 1024 * 1024;
const MIMES_ANEXO = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
let ready = false;

async function ensure() {
  if (ready) return;
  const p = db();
  await p.query(`CREATE TABLE IF NOT EXISTS compras_manut_equipamentos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lojaId INT UNSIGNED NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    numero INT NOT NULL,
    descricao VARCHAR(300) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_cm_eq_loja_tipo_num (lojaId, tipo, numero)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_manut_servicos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    equipamentoId INT UNSIGNED NOT NULL,
    data DATE NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    descricao TEXT NULL,
    fornecedor VARCHAR(160) NULL,
    valor DECIMAL(12,2) NULL,
    garantiaAte DATE NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cm_serv_eq (equipamentoId, data)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_manut_anexos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    servicoId INT UNSIGNED NOT NULL,
    nome VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    tamanho INT UNSIGNED NOT NULL,
    conteudo LONGBLOB NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cm_anexo_serv (servicoId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  ready = true;
}

const id = z.number().int().positive();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const anexoSchema = z.object({ nome: z.string().trim().min(1).max(255), mime: z.string().max(100), base64: z.string().min(1) });

function iso(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
}

function bufferAnexo(a: z.infer<typeof anexoSchema>) {
  const mime = a.mime.toLowerCase();
  if (!MIMES_ANEXO.includes(mime)) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo deve ser PDF ou imagem (JPG, PNG, WEBP)." });
  const buf = Buffer.from(a.base64, "base64");
  if (!buf.length || buf.length > MAX_ANEXO) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo vazio ou maior que 8 MB." });
  return { mime, buf };
}

export const comprasManutencaoRouter = router({
  equipamentos: protectedProcedure.input(z.object({ lojaId: id })).query(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const [rows] = await db().query<any[]>(
      `SELECT e.id, e.tipo, e.numero, e.descricao,
              (SELECT MAX(s.data) FROM compras_manut_servicos s WHERE s.equipamentoId=e.id) ultimaData,
              (SELECT MAX(s.garantiaAte) FROM compras_manut_servicos s WHERE s.equipamentoId=e.id) garantiaAte,
              (SELECT COUNT(*) FROM compras_manut_servicos s WHERE s.equipamentoId=e.id) servicos
         FROM compras_manut_equipamentos e
        WHERE e.lojaId=? AND e.ativo=1
        ORDER BY FIELD(e.tipo,'elevador','desmontadora','balanceadora','rampa','compressor'), e.numero`,
      [input.lojaId]
    );
    return rows.map((x) => ({
      id: Number(x.id), tipo: String(x.tipo), numero: Number(x.numero), descricao: x.descricao ? String(x.descricao) : "",
      ultimaData: iso(x.ultimaData), garantiaAte: iso(x.garantiaAte), servicos: Number(x.servicos || 0),
    }));
  }),

  // Ajusta quantos equipamentos de um tipo a loja tem. Reduzir só esconde os de número maior (histórico fica guardado).
  definirQuantidade: protectedProcedure
    .input(z.object({ lojaId: id, tipo: tipoEquipamento, quantidade: z.number().int().min(0).max(50) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      for (let n = 1; n <= input.quantidade; n++) {
        await db().query(
          `INSERT INTO compras_manut_equipamentos (lojaId,tipo,numero,ativo) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE ativo=1`,
          [input.lojaId, input.tipo, n]
        );
      }
      await db().query(`UPDATE compras_manut_equipamentos SET ativo=0 WHERE lojaId=? AND tipo=? AND numero>?`, [input.lojaId, input.tipo, input.quantidade]);
      return { ok: true };
    }),

  salvarEquipamento: protectedProcedure.input(z.object({ id, descricao: z.string().trim().max(300) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    await db().query(`UPDATE compras_manut_equipamentos SET descricao=? WHERE id=?`, [input.descricao || null, input.id]);
    return { ok: true };
  }),

  servicos: protectedProcedure.input(z.object({ equipamentoId: id })).query(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const [eq] = await db().query<any[]>(`SELECT id,lojaId,tipo,numero,descricao FROM compras_manut_equipamentos WHERE id=? LIMIT 1`, [input.equipamentoId]);
    if (!eq.length) throw new TRPCError({ code: "NOT_FOUND", message: "Equipamento não encontrado." });
    const [rows] = await db().query<any[]>(
      `SELECT id,data,tipo,descricao,fornecedor,valor,garantiaAte,criadoPorNome,createdAt FROM compras_manut_servicos WHERE equipamentoId=? ORDER BY data DESC, id DESC`,
      [input.equipamentoId]
    );
    const ids = rows.map((x) => Number(x.id));
    let anexos: any[] = [];
    if (ids.length) {
      const [a] = await db().query<any[]>(
        `SELECT id,servicoId,nome,mime,tamanho FROM compras_manut_anexos WHERE servicoId IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
        ids
      );
      anexos = a;
    }
    return {
      equipamento: { id: Number(eq[0].id), lojaId: Number(eq[0].lojaId), tipo: String(eq[0].tipo), numero: Number(eq[0].numero), descricao: eq[0].descricao ? String(eq[0].descricao) : "" },
      servicos: rows.map((x) => ({
        id: Number(x.id), data: iso(x.data), tipo: String(x.tipo), descricao: x.descricao ? String(x.descricao) : "",
        fornecedor: x.fornecedor ? String(x.fornecedor) : "", valor: x.valor == null ? null : Number(x.valor),
        garantiaAte: iso(x.garantiaAte), criadoPorNome: x.criadoPorNome ? String(x.criadoPorNome) : "",
        anexos: anexos.filter((a) => Number(a.servicoId) === Number(x.id)).map((a) => ({ id: Number(a.id), nome: String(a.nome), mime: String(a.mime), tamanho: Number(a.tamanho) })),
      })),
    };
  }),

  salvarServico: protectedProcedure
    .input(z.object({
      id: id.optional(),
      equipamentoId: id,
      data: dataIso,
      tipo: z.enum(TIPOS_SERVICO),
      descricao: z.string().trim().max(5000),
      fornecedor: z.string().trim().max(160),
      valor: z.number().min(0).max(10000000).nullable(),
      garantiaAte: dataIso.nullable(),
      anexo: anexoSchema.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const anexo = input.anexo ? bufferAnexo(input.anexo) : null;
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        let servicoId = input.id || 0;
        if (input.id) {
          await c.query(
            `UPDATE compras_manut_servicos SET data=?,tipo=?,descricao=?,fornecedor=?,valor=?,garantiaAte=? WHERE id=? AND equipamentoId=?`,
            [input.data, input.tipo, input.descricao || null, input.fornecedor || null, input.valor, input.garantiaAte, input.id, input.equipamentoId]
          );
        } else {
          const [r] = await c.query<any>(
            `INSERT INTO compras_manut_servicos (equipamentoId,data,tipo,descricao,fornecedor,valor,garantiaAte,criadoPorNome) VALUES (?,?,?,?,?,?,?,?)`,
            [input.equipamentoId, input.data, input.tipo, input.descricao || null, input.fornecedor || null, input.valor, input.garantiaAte, String(ctx?.user?.name || "Usuário")]
          );
          servicoId = Number(r.insertId);
        }
        if (anexo && input.anexo) {
          await c.query(`INSERT INTO compras_manut_anexos (servicoId,nome,mime,tamanho,conteudo) VALUES (?,?,?,?,?)`, [servicoId, input.anexo.nome, anexo.mime, anexo.buf.length, anexo.buf]);
        }
        await c.commit();
        return { ok: true, servicoId };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

  adicionarAnexo: protectedProcedure.input(z.object({ servicoId: id, anexo: anexoSchema })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const { mime, buf } = bufferAnexo(input.anexo);
    await db().query(`INSERT INTO compras_manut_anexos (servicoId,nome,mime,tamanho,conteudo) VALUES (?,?,?,?,?)`, [input.servicoId, input.anexo.nome, mime, buf.length, buf]);
    return { ok: true };
  }),

  baixarAnexo: protectedProcedure.input(z.object({ anexoId: id })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const [r] = await db().query<any[]>(`SELECT nome,mime,conteudo FROM compras_manut_anexos WHERE id=? LIMIT 1`, [input.anexoId]);
    if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado." });
    const conteudo = Buffer.isBuffer(r[0].conteudo) ? r[0].conteudo : Buffer.from(r[0].conteudo);
    return { nome: String(r[0].nome), mime: String(r[0].mime), base64: conteudo.toString("base64") };
  }),

  excluirAnexo: protectedProcedure.input(z.object({ anexoId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx);
    assertSenhaExclusao(input.senha);
    await ensure();
    await db().query(`DELETE FROM compras_manut_anexos WHERE id=?`, [input.anexoId]);
    return { ok: true };
  }),

  excluirServico: protectedProcedure.input(z.object({ servicoId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx);
    assertSenhaExclusao(input.senha);
    await ensure();
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      await c.query(`DELETE FROM compras_manut_anexos WHERE servicoId=?`, [input.servicoId]);
      await c.query(`DELETE FROM compras_manut_servicos WHERE id=?`, [input.servicoId]);
      await c.commit();
      return { ok: true };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),
});
