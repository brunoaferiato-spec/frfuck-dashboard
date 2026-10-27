import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { db } from "./comprasPecas";
import { EMPRESAS, empresaDaLoja } from "@shared/empresas";

// Conferência diária de estoque: o estoquista de cada loja manda o "Resumo geral venda de itens" do dia anterior
// e confere item por item (foto obrigatória + quantidade contada). A contagem é às cegas: o estoque do sistema
// só aparece depois de concluir. O supervisor de estoque vê o painel das 6 lojas e trata as diferenças.

export const PERFIL_ESTOQUE = "estoque"; // estoquista de uma loja (users.lojaId)
export const PERFIL_SUPERVISOR_ESTOQUE = "estoque_supervisor";
const MAX_FOTO = 4 * 1024 * 1024;
const DIAS_GUARDAR_FOTOS = 30; // fotos mais antigas são apagadas; as contagens ficam para sempre
let ready = false;
let ultimaLimpeza = 0;

async function ensure() {
  if (!ready) {
    const p = db();
    await p.query(`CREATE TABLE IF NOT EXISTS estoque_conferencias (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT UNSIGNED NOT NULL,
      dataRelatorio DATE NOT NULL,
      arquivoNome VARCHAR(255) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'andamento',
      totalItens INT NOT NULL DEFAULT 0,
      criadoPorNome VARCHAR(160) NULL,
      concluidaPorNome VARCHAR(160) NULL,
      concluidaEm TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uq_est_conf_loja_data (lojaId, dataRelatorio)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await p.query(`CREATE TABLE IF NOT EXISTS estoque_conferencia_itens (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      conferenciaId INT UNSIGNED NOT NULL,
      ordem INT NOT NULL,
      codigo VARCHAR(60) NOT NULL,
      item VARCHAR(300) NOT NULL,
      aplicacao TEXT NULL,
      qtdVendida DECIMAL(12,2) NOT NULL DEFAULT 0,
      estoqueSistema DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantidadeContada DECIMAL(12,2) NULL,
      fotoMime VARCHAR(40) NULL,
      foto MEDIUMBLOB NULL,
      contadoPorNome VARCHAR(160) NULL,
      contadoEm TIMESTAMP NULL,
      tratado TINYINT(1) NOT NULL DEFAULT 0,
      tratadoObs VARCHAR(500) NULL,
      tratadoPorNome VARCHAR(160) NULL,
      tratadoEm TIMESTAMP NULL,
      PRIMARY KEY (id), KEY idx_est_item_conf (conferenciaId, ordem)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    ready = true;
  }
  // Uma vez por dia apaga as fotos antigas para não lotar o banco.
  if (Date.now() - ultimaLimpeza > 24 * 60 * 60 * 1000) {
    ultimaLimpeza = Date.now();
    await db().query(
      `UPDATE estoque_conferencia_itens i JOIN estoque_conferencias c ON c.id=i.conferenciaId
          SET i.foto=NULL WHERE i.foto IS NOT NULL AND c.dataRelatorio < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [DIAS_GUARDAR_FOTOS]
    );
  }
}

// Quem pode o quê: estoquista só a própria loja; supervisor, admin e gestor todas.
function perfil(ctx: any) {
  const role = String(ctx?.user?.role || "");
  const lojaId = Number(ctx?.user?.lojaId || 0);
  if (role === PERFIL_ESTOQUE) {
    if (!lojaId) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário de estoque está sem loja. Peça para cadastrarem a loja no seu usuário." });
    return { supervisor: false, lojaId };
  }
  if ([PERFIL_SUPERVISOR_ESTOQUE, "admin", "gestor"].includes(role)) return { supervisor: true, lojaId: 0 };
  throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado ao estoque." });
}

function exigirSupervisor(ctx: any) {
  const p = perfil(ctx);
  if (!p.supervisor) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o supervisor de estoque." });
  return p;
}

function nomeUsuario(ctx: any) {
  return String(ctx?.user?.name || "Usuário");
}

function semAcento(v: string) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function iso(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
}

async function carregarConferencia(id: number) {
  const [r] = await db().query<any[]>(`SELECT * FROM estoque_conferencias WHERE id=? LIMIT 1`, [id]);
  if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Conferência não encontrada." });
  return r[0];
}

function podeVerLoja(p: { supervisor: boolean; lojaId: number }, lojaId: number) {
  if (!p.supervisor && Number(lojaId) !== p.lojaId) throw new TRPCError({ code: "FORBIDDEN", message: "Essa conferência é de outra loja." });
}

// Itens da conferência. Às cegas: com a conferência em andamento, o estoquista não recebe o estoque do sistema.
async function itensDa(conf: any, mostrarSistema: boolean) {
  const [rows] = await db().query<any[]>(
    `SELECT id, ordem, codigo, item, aplicacao, qtdVendida, estoqueSistema, quantidadeContada, (foto IS NOT NULL) temFoto, fotoMime,
            contadoPorNome, contadoEm, tratado, tratadoObs, tratadoPorNome
       FROM estoque_conferencia_itens WHERE conferenciaId=? ORDER BY ordem`,
    [conf.id]
  );
  return rows.map((x) => {
    const contada = x.quantidadeContada == null ? null : Number(x.quantidadeContada);
    const sistema = Number(x.estoqueSistema);
    return {
      id: Number(x.id), ordem: Number(x.ordem), codigo: String(x.codigo), item: String(x.item), aplicacao: x.aplicacao ? String(x.aplicacao) : "",
      qtdVendida: Number(x.qtdVendida), quantidadeContada: contada, temFoto: !!Number(x.temFoto),
      contadoPorNome: x.contadoPorNome ? String(x.contadoPorNome) : "",
      estoqueSistema: mostrarSistema ? sistema : null,
      diferenca: mostrarSistema && contada != null ? Number((contada - sistema).toFixed(2)) : null,
      tratado: !!Number(x.tratado), tratadoObs: x.tratadoObs ? String(x.tratadoObs) : "", tratadoPorNome: x.tratadoPorNome ? String(x.tratadoPorNome) : "",
    };
  });
}

function resumoConferencia(conf: any) {
  return {
    id: Number(conf.id), lojaId: Number(conf.lojaId), loja: empresaDaLoja(Number(conf.lojaId))?.loja || `Loja ${conf.lojaId}`,
    dataRelatorio: iso(conf.dataRelatorio)!, status: String(conf.status) as "andamento" | "concluida", totalItens: Number(conf.totalItens),
    arquivoNome: conf.arquivoNome ? String(conf.arquivoNome) : "", criadoPorNome: conf.criadoPorNome ? String(conf.criadoPorNome) : "",
    concluidaPorNome: conf.concluidaPorNome ? String(conf.concluidaPorNome) : "", concluidaEm: conf.concluidaEm ? String(conf.concluidaEm) : null,
  };
}

const id = z.number().int().positive();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const estoqueRouter = router({
  // Perfil de quem está usando (o estoquista já tem a loja fixa).
  meuPerfil: protectedProcedure.query(({ ctx }) => {
    const p = perfil(ctx);
    return { supervisor: p.supervisor, lojaId: p.lojaId || null, loja: p.lojaId ? empresaDaLoja(p.lojaId)?.loja || "" : "" };
  }),

  // Conferência aberta (ou a última) da loja.
  atual: protectedProcedure.input(z.object({ lojaId: id.nullable() })).query(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const lojaId = p.supervisor ? Number(input.lojaId || 0) : p.lojaId;
    if (!lojaId) return null;
    const [r] = await db().query<any[]>(
      `SELECT * FROM estoque_conferencias WHERE lojaId=? ORDER BY (status='andamento') DESC, dataRelatorio DESC, id DESC LIMIT 1`,
      [lojaId]
    );
    if (!r.length) return null;
    const conf = r[0];
    const concluida = String(conf.status) === "concluida";
    return { conferencia: resumoConferencia(conf), itens: await itensDa(conf, concluida || p.supervisor) };
  }),

  // Começa a conferência com os itens lidos do relatório (a leitura do PDF é feita na tela).
  iniciar: protectedProcedure
    .input(z.object({
      lojaId: id,
      lojaRelatorio: z.string().max(120),
      dataRelatorio: dataIso,
      arquivoNome: z.string().max(255),
      itens: z.array(z.object({
        codigo: z.string().trim().min(1).max(60),
        item: z.string().trim().max(300),
        aplicacao: z.string().max(5000),
        qtdVendida: z.number().min(0).max(1000000),
        estoqueSistema: z.number().min(-1000000).max(1000000),
      })).min(1, "O relatório não tem itens.").max(3000),
    }))
    .mutation(async ({ ctx, input }) => {
      const p = perfil(ctx);
      await ensure();
      const lojaId = p.supervisor ? input.lojaId : p.lojaId;
      const empresa = empresaDaLoja(lojaId);
      if (!empresa) throw new TRPCError({ code: "BAD_REQUEST", message: "Loja inválida." });
      // O relatório precisa ser da loja (título "F. JOINVILLE - ...").
      const lojaPdf = semAcento(input.lojaRelatorio);
      const daLoja = !lojaPdf || [empresa.loja, empresa.cidade].some((n) => lojaPdf.includes(semAcento(n)) || semAcento(n).includes(lojaPdf));
      if (!daLoja) throw new TRPCError({ code: "BAD_REQUEST", message: `Esse relatório é de ${input.lojaRelatorio}, não de ${empresa.loja}.` });

      const [existe] = await db().query<any[]>(`SELECT * FROM estoque_conferencias WHERE lojaId=? AND dataRelatorio=? LIMIT 1`, [lojaId, input.dataRelatorio]);
      if (existe.length) {
        if (String(existe[0].status) === "concluida") throw new TRPCError({ code: "BAD_REQUEST", message: "O relatório desse dia já foi conferido nessa loja." });
        return { ok: true, conferenciaId: Number(existe[0].id), retomada: true };
      }
      const c = await db().getConnection();
      try {
        await c.beginTransaction();
        const [r] = await c.query<any>(
          `INSERT INTO estoque_conferencias (lojaId, dataRelatorio, arquivoNome, totalItens, criadoPorNome) VALUES (?,?,?,?,?)`,
          [lojaId, input.dataRelatorio, input.arquivoNome || null, input.itens.length, nomeUsuario(ctx)]
        );
        const confId = Number(r.insertId);
        for (let i = 0; i < input.itens.length; i += 200) {
          const lote = input.itens.slice(i, i + 200);
          await c.query(
            `INSERT INTO estoque_conferencia_itens (conferenciaId, ordem, codigo, item, aplicacao, qtdVendida, estoqueSistema) VALUES ${lote.map(() => "(?,?,?,?,?,?,?)").join(",")}`,
            lote.flatMap((x, j) => [confId, i + j + 1, x.codigo, x.item || x.codigo, x.aplicacao || null, x.qtdVendida, x.estoqueSistema])
          );
        }
        await c.commit();
        return { ok: true, conferenciaId: confId, retomada: false };
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }),

  // Salva a contagem de um item: foto obrigatória (a primeira vez) e quantidade.
  contarItem: protectedProcedure
    .input(z.object({ itemId: id, quantidade: z.number().min(0).max(1000000), foto: z.object({ mime: z.string().max(40), base64: z.string().min(1) }).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const p = perfil(ctx);
      await ensure();
      const [r] = await db().query<any[]>(
        `SELECT i.id, (i.foto IS NOT NULL) temFoto, c.id conferenciaId, c.lojaId, c.status FROM estoque_conferencia_itens i
           JOIN estoque_conferencias c ON c.id=i.conferenciaId WHERE i.id=? LIMIT 1`,
        [input.itemId]
      );
      if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
      podeVerLoja(p, Number(r[0].lojaId));
      if (String(r[0].status) !== "andamento") throw new TRPCError({ code: "BAD_REQUEST", message: "Essa conferência já foi concluída." });
      let foto: Buffer | null = null;
      if (input.foto) {
        if (!/^image\/(jpeg|png|webp)$/.test(input.foto.mime)) throw new TRPCError({ code: "BAD_REQUEST", message: "A foto precisa ser JPG ou PNG." });
        foto = Buffer.from(input.foto.base64, "base64");
        if (!foto.length || foto.length > MAX_FOTO) throw new TRPCError({ code: "BAD_REQUEST", message: "Foto vazia ou grande demais." });
      }
      if (!foto && !Number(r[0].temFoto)) throw new TRPCError({ code: "BAD_REQUEST", message: "Tire a foto da peça antes de salvar." });
      if (foto) {
        await db().query(
          `UPDATE estoque_conferencia_itens SET quantidadeContada=?, foto=?, fotoMime=?, contadoPorNome=?, contadoEm=NOW() WHERE id=?`,
          [input.quantidade, foto, input.foto!.mime, nomeUsuario(ctx), input.itemId]
        );
      } else {
        await db().query(`UPDATE estoque_conferencia_itens SET quantidadeContada=?, contadoPorNome=?, contadoEm=NOW() WHERE id=?`, [input.quantidade, nomeUsuario(ctx), input.itemId]);
      }
      return { ok: true };
    }),

  foto: protectedProcedure.input(z.object({ itemId: id })).query(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const [r] = await db().query<any[]>(
      `SELECT i.foto, i.fotoMime, c.lojaId FROM estoque_conferencia_itens i JOIN estoque_conferencias c ON c.id=i.conferenciaId WHERE i.id=? LIMIT 1`,
      [input.itemId]
    );
    if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
    podeVerLoja(p, Number(r[0].lojaId));
    if (!r[0].foto) return null;
    const buf = Buffer.isBuffer(r[0].foto) ? r[0].foto : Buffer.from(r[0].foto);
    return { mime: String(r[0].fotoMime || "image/jpeg"), base64: buf.toString("base64") };
  }),

  // Conclui: todos os itens contados e com foto. Só então o estoque do sistema aparece.
  concluir: protectedProcedure.input(z.object({ conferenciaId: id })).mutation(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const conf = await carregarConferencia(input.conferenciaId);
    podeVerLoja(p, Number(conf.lojaId));
    if (String(conf.status) === "concluida") return { ok: true };
    const [f] = await db().query<any[]>(
      `SELECT COUNT(*) n FROM estoque_conferencia_itens WHERE conferenciaId=? AND (quantidadeContada IS NULL OR foto IS NULL)`,
      [input.conferenciaId]
    );
    if (Number(f[0].n)) throw new TRPCError({ code: "BAD_REQUEST", message: `Ainda faltam ${f[0].n} item(ns) com foto e quantidade.` });
    await db().query(`UPDATE estoque_conferencias SET status='concluida', concluidaPorNome=?, concluidaEm=NOW() WHERE id=?`, [nomeUsuario(ctx), input.conferenciaId]);
    return { ok: true };
  }),

  // Painel do supervisor: as 6 lojas num dia.
  painel: protectedProcedure.input(z.object({ data: dataIso })).query(async ({ ctx, input }) => {
    exigirSupervisor(ctx);
    await ensure();
    const [confs] = await db().query<any[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM estoque_conferencia_itens i WHERE i.conferenciaId=c.id AND i.quantidadeContada IS NOT NULL AND i.foto IS NOT NULL) contados,
              (SELECT COUNT(*) FROM estoque_conferencia_itens i WHERE i.conferenciaId=c.id AND i.quantidadeContada IS NOT NULL AND i.quantidadeContada<>i.estoqueSistema) divergencias,
              (SELECT COUNT(*) FROM estoque_conferencia_itens i WHERE i.conferenciaId=c.id AND i.quantidadeContada IS NOT NULL AND i.quantidadeContada<>i.estoqueSistema AND i.tratado=0) pendentes
         FROM estoque_conferencias c WHERE c.dataRelatorio=?`,
      [input.data]
    );
    // Diferenças ainda sem tratar de qualquer dia (para nada ficar esquecido).
    const [abertas] = await db().query<any[]>(
      `SELECT c.lojaId, COUNT(*) n FROM estoque_conferencia_itens i JOIN estoque_conferencias c ON c.id=i.conferenciaId
        WHERE c.status='concluida' AND i.quantidadeContada<>i.estoqueSistema AND i.tratado=0 GROUP BY c.lojaId`
    );
    return EMPRESAS.map((e) => {
      const c = confs.find((x) => Number(x.lojaId) === e.lojaId);
      return {
        lojaId: e.lojaId, loja: e.loja,
        conferencia: c ? { ...resumoConferencia(c), contados: Number(c.contados), divergencias: Number(c.divergencias), pendentes: Number(c.pendentes) } : null,
        pendentesTotal: Number(abertas.find((a) => Number(a.lojaId) === e.lojaId)?.n || 0),
      };
    });
  }),

  detalhe: protectedProcedure.input(z.object({ conferenciaId: id })).query(async ({ ctx, input }) => {
    exigirSupervisor(ctx);
    await ensure();
    const conf = await carregarConferencia(input.conferenciaId);
    return { conferencia: resumoConferencia(conf), itens: await itensDa(conf, true) };
  }),

  // Conferências com diferenças ainda sem tratar, de qualquer dia.
  pendencias: protectedProcedure.input(z.object({ lojaId: id.nullable() })).query(async ({ ctx, input }) => {
    exigirSupervisor(ctx);
    await ensure();
    const [rows] = await db().query<any[]>(
      `SELECT c.*, COUNT(*) pendentes FROM estoque_conferencia_itens i JOIN estoque_conferencias c ON c.id=i.conferenciaId
        WHERE c.status='concluida' AND i.quantidadeContada<>i.estoqueSistema AND i.tratado=0 ${input.lojaId ? "AND c.lojaId=?" : ""}
        GROUP BY c.id ORDER BY c.dataRelatorio DESC LIMIT 60`,
      input.lojaId ? [input.lojaId] : []
    );
    return rows.map((c) => ({ ...resumoConferencia(c), pendentes: Number(c.pendentes) }));
  }),

  // Supervisor marca a diferença como tratada, com o que foi feito.
  tratar: protectedProcedure
    .input(z.object({ itemId: id, tratado: z.boolean(), obs: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      exigirSupervisor(ctx);
      await ensure();
      await db().query(
        `UPDATE estoque_conferencia_itens SET tratado=?, tratadoObs=?, tratadoPorNome=?, tratadoEm=${input.tratado ? "NOW()" : "NULL"} WHERE id=?`,
        [input.tratado ? 1 : 0, input.obs || null, input.tratado ? nomeUsuario(ctx) : null, input.itemId]
      );
      return { ok: true };
    }),
});
