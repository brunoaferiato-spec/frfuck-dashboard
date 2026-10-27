import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { db } from "./comprasPecas";
import { EMPRESAS, empresaDaLoja } from "@shared/empresas";
import { GRUPOS_ESTOQUE, INICIO_CICLO, gruposDaSemana, segundaDaSemana, semanaDoCiclo, somarDias, type GrupoEstoque } from "@shared/estoqueSemanal";
import { conferirLojaDoRelatorio, exigirSupervisor, iso, nomeUsuario, perfil, podeVerLoja } from "./estoqueBase";

// Contagem semanal: ciclo de 4 semanas com grupos de peças. Sem dia certo, mas tem que entregar até sábado.
// Para cada grupo o estoquista anexa o PDF "ESTOQUE DE ITENS", as fotos das folhas contadas
// e as alterações/ajustes (ou marca que não teve alteração). O supervisor vê as 6 lojas e trata os ajustes.

const MAX_FOTO = 5 * 1024 * 1024;
const DIAS_GUARDAR_FOTOS = 90;
let ready = false;
let ultimaLimpeza = 0;

async function ensure() {
  if (!ready) {
    const p = db();
    await p.query(`CREATE TABLE IF NOT EXISTS estoque_semanal (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT UNSIGNED NOT NULL,
      semanaInicio DATE NOT NULL,
      numeroCiclo TINYINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'andamento',
      grupos MEDIUMTEXT NULL,
      criadoPorNome VARCHAR(160) NULL,
      entreguePorNome VARCHAR(160) NULL,
      entregueEm TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uq_est_sem_loja (lojaId, semanaInicio)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await p.query(`CREATE TABLE IF NOT EXISTS estoque_semanal_fotos (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      semanalId INT UNSIGNED NOT NULL,
      grupo VARCHAR(40) NOT NULL,
      mime VARCHAR(40) NOT NULL,
      foto MEDIUMBLOB NULL,
      enviadoPorNome VARCHAR(160) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), KEY idx_est_sem_foto (semanalId, grupo)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await p.query(`CREATE TABLE IF NOT EXISTS estoque_semanal_ajustes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      semanalId INT UNSIGNED NOT NULL,
      grupo VARCHAR(40) NOT NULL,
      codigo VARCHAR(60) NOT NULL,
      item VARCHAR(300) NULL,
      qtdSistema DECIMAL(12,2) NULL,
      qtdContada DECIMAL(12,2) NOT NULL,
      obs VARCHAR(1000) NULL,
      criadoPorNome VARCHAR(160) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tratado TINYINT(1) NOT NULL DEFAULT 0,
      tratadoObs VARCHAR(500) NULL,
      tratadoPorNome VARCHAR(160) NULL,
      tratadoEm TIMESTAMP NULL,
      PRIMARY KEY (id), KEY idx_est_sem_aj (semanalId, grupo)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    ready = true;
  }
  // Uma vez por dia apaga as fotos antigas das folhas (os ajustes ficam para sempre).
  if (Date.now() - ultimaLimpeza > 24 * 60 * 60 * 1000) {
    ultimaLimpeza = Date.now();
    await db().query(
      `UPDATE estoque_semanal_fotos f JOIN estoque_semanal s ON s.id=f.semanalId
          SET f.foto=NULL WHERE f.foto IS NOT NULL AND s.semanaInicio < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [DIAS_GUARDAR_FOTOS]
    );
  }
}

function hoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

type InfoGrupo = { arquivoNome: string; itens: Array<{ codigo: string; item: string; qtd: number }>; semAlteracao: boolean };
type Grupos = Partial<Record<GrupoEstoque, InfoGrupo>>;

function lerGrupos(v: unknown): Grupos {
  try { return JSON.parse(String(v || "{}")) || {}; } catch { return {}; }
}

// Situação da semana: pendente (ainda dá tempo), atrasada, entregue ou entregue com atraso.
function situacao(semanaInicio: string, reg: any) {
  const fim = somarDias(semanaInicio, 5);
  if (reg && String(reg.status) === "entregue") {
    const entregue = reg.entregueEm ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(reg.entregueEm)) : fim;
    return entregue > fim ? "entregue_atraso" : "entregue";
  }
  return hoje() > fim ? "atrasada" : "pendente";
}

function validarSemana(semanaInicio: string) {
  if (segundaDaSemana(semanaInicio) !== semanaInicio || !semanaDoCiclo(semanaInicio)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Semana inválida." });
  }
  if (semanaInicio > segundaDaSemana(hoje())) throw new TRPCError({ code: "BAD_REQUEST", message: "Essa semana ainda não começou." });
}

async function buscar(lojaId: number, semanaInicio: string) {
  const [r] = await db().query<any[]>(`SELECT * FROM estoque_semanal WHERE lojaId=? AND semanaInicio=? LIMIT 1`, [lojaId, semanaInicio]);
  return r[0] || null;
}

// Pega (ou cria) a contagem da semana para o estoquista mexer; só enquanto não foi entregue.
async function paraEditar(ctx: any, lojaIdInput: number, semanaInicio: string, grupo?: GrupoEstoque) {
  const p = perfil(ctx);
  await ensure();
  const lojaId = p.supervisor ? lojaIdInput : p.lojaId;
  if (!empresaDaLoja(lojaId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Loja inválida." });
  validarSemana(semanaInicio);
  if (grupo && !gruposDaSemana(semanaInicio).includes(grupo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Esse grupo não é dessa semana." });
  let reg = await buscar(lojaId, semanaInicio);
  if (!reg) {
    await db().query(
      `INSERT IGNORE INTO estoque_semanal (lojaId, semanaInicio, numeroCiclo, grupos, criadoPorNome) VALUES (?,?,?,?,?)`,
      [lojaId, semanaInicio, semanaDoCiclo(semanaInicio), "{}", nomeUsuario(ctx)]
    );
    reg = await buscar(lojaId, semanaInicio);
  }
  if (String(reg.status) === "entregue") throw new TRPCError({ code: "BAD_REQUEST", message: "Essa contagem já foi entregue." });
  return { reg, lojaId };
}

async function regDaFotoOuAjuste(tabela: "estoque_semanal_fotos" | "estoque_semanal_ajustes", itemId: number) {
  const [r] = await db().query<any[]>(`SELECT s.* , x.id itemId FROM ${tabela} x JOIN estoque_semanal s ON s.id=x.semanalId WHERE x.id=? LIMIT 1`, [itemId]);
  if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Não encontrado." });
  return r[0];
}

async function montarSemana(lojaId: number, semanaInicio: string) {
  const reg = await buscar(lojaId, semanaInicio);
  const grupos = lerGrupos(reg?.grupos);
  const [fotos] = reg
    ? await db().query<any[]>(`SELECT id, grupo, enviadoPorNome, (foto IS NOT NULL) temFoto FROM estoque_semanal_fotos WHERE semanalId=? ORDER BY id`, [reg.id])
    : [[] as any[]];
  const [ajustes] = reg
    ? await db().query<any[]>(`SELECT * FROM estoque_semanal_ajustes WHERE semanalId=? ORDER BY id`, [reg.id])
    : [[] as any[]];
  return {
    id: reg ? Number(reg.id) : null,
    lojaId, loja: empresaDaLoja(lojaId)?.loja || `Loja ${lojaId}`,
    semanaInicio, semanaFim: somarDias(semanaInicio, 5), numero: semanaDoCiclo(semanaInicio),
    status: situacao(semanaInicio, reg),
    entreguePorNome: reg?.entreguePorNome ? String(reg.entreguePorNome) : "",
    grupos: gruposDaSemana(semanaInicio).map((g) => {
      const info = grupos[g];
      return {
        grupo: g, nome: GRUPOS_ESTOQUE[g],
        arquivoNome: info?.arquivoNome || "",
        totalItens: info?.itens.length || 0,
        totalQtd: info?.itens.reduce((s, i) => s + i.qtd, 0) || 0,
        itens: info?.itens || [],
        semAlteracao: !!info?.semAlteracao,
        fotos: fotos.filter((f) => f.grupo === g).map((f) => ({ id: Number(f.id), enviadoPorNome: String(f.enviadoPorNome || ""), disponivel: !!Number(f.temFoto) })),
        ajustes: ajustes.filter((a) => a.grupo === g).map((a) => ({
          id: Number(a.id), codigo: String(a.codigo), item: a.item ? String(a.item) : "",
          qtdSistema: a.qtdSistema == null ? null : Number(a.qtdSistema), qtdContada: Number(a.qtdContada), obs: a.obs ? String(a.obs) : "",
          criadoPorNome: String(a.criadoPorNome || ""),
          tratado: !!Number(a.tratado), tratadoObs: a.tratadoObs ? String(a.tratadoObs) : "", tratadoPorNome: a.tratadoPorNome ? String(a.tratadoPorNome) : "",
        })),
      };
    }),
  };
}

const id = z.number().int().positive();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grupoInput = z.enum(Object.keys(GRUPOS_ESTOQUE) as [GrupoEstoque, ...GrupoEstoque[]]);

export const semanalRouter = router({
  // Semanas da loja: a atual e as anteriores (até 8), com a situação de cada uma.
  semanas: protectedProcedure.input(z.object({ lojaId: id.nullable() })).query(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const lojaId = p.supervisor ? Number(input.lojaId || 0) : p.lojaId;
    const atual = segundaDaSemana(hoje());
    const base = { hoje: hoje(), semanaAtual: atual, inicioCiclo: INICIO_CICLO };
    if (!lojaId) return { ...base, semanas: [] };
    const [regs] = await db().query<any[]>(`SELECT * FROM estoque_semanal WHERE lojaId=? AND semanaInicio>=?`, [lojaId, INICIO_CICLO]);
    const semanas = [];
    for (let s = atual, n = 0; s >= INICIO_CICLO && n < 8; s = somarDias(s, -7), n++) {
      const reg = regs.find((r) => iso(r.semanaInicio) === s);
      semanas.push({
        semanaInicio: s, semanaFim: somarDias(s, 5), numero: semanaDoCiclo(s),
        grupos: gruposDaSemana(s).map((g) => GRUPOS_ESTOQUE[g]), status: situacao(s, reg),
      });
    }
    return { ...base, semanas };
  }),

  semana: protectedProcedure.input(z.object({ lojaId: id.nullable(), semanaInicio: dataIso })).query(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const lojaId = p.supervisor ? Number(input.lojaId || 0) : p.lojaId;
    if (!lojaId) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha a loja." });
    validarSemana(input.semanaInicio);
    return montarSemana(lojaId, input.semanaInicio);
  }),

  // PDF "ESTOQUE DE ITENS" do grupo (lido na tela): guarda os itens e quantidades do sistema.
  anexarRelatorio: protectedProcedure
    .input(z.object({
      lojaId: id, semanaInicio: dataIso, grupo: grupoInput,
      lojaRelatorio: z.string().max(120), arquivoNome: z.string().max(255),
      itens: z.array(z.object({ codigo: z.string().trim().min(1).max(60), item: z.string().trim().max(300), qtd: z.number().min(-1000000).max(1000000) })).min(1, "O relatório não tem itens.").max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const p = perfil(ctx);
      conferirLojaDoRelatorio(p.supervisor ? input.lojaId : p.lojaId, input.lojaRelatorio);
      const { reg } = await paraEditar(ctx, input.lojaId, input.semanaInicio, input.grupo);
      const grupos = lerGrupos(reg.grupos);
      grupos[input.grupo] = { arquivoNome: input.arquivoNome, itens: input.itens, semAlteracao: !!grupos[input.grupo]?.semAlteracao };
      await db().query(`UPDATE estoque_semanal SET grupos=? WHERE id=?`, [JSON.stringify(grupos), reg.id]);
      return { ok: true };
    }),

  enviarFoto: protectedProcedure
    .input(z.object({ lojaId: id, semanaInicio: dataIso, grupo: grupoInput, mime: z.string().max(40), base64: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { reg } = await paraEditar(ctx, input.lojaId, input.semanaInicio, input.grupo);
      if (!/^image\/(jpeg|png|webp)$/.test(input.mime)) throw new TRPCError({ code: "BAD_REQUEST", message: "A foto precisa ser JPG ou PNG." });
      const foto = Buffer.from(input.base64, "base64");
      if (!foto.length || foto.length > MAX_FOTO) throw new TRPCError({ code: "BAD_REQUEST", message: "Foto vazia ou grande demais." });
      await db().query(`INSERT INTO estoque_semanal_fotos (semanalId, grupo, mime, foto, enviadoPorNome) VALUES (?,?,?,?,?)`, [reg.id, input.grupo, input.mime, foto, nomeUsuario(ctx)]);
      return { ok: true };
    }),

  apagarFoto: protectedProcedure.input(z.object({ fotoId: id })).mutation(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const reg = await regDaFotoOuAjuste("estoque_semanal_fotos", input.fotoId);
    podeVerLoja(p, Number(reg.lojaId));
    if (String(reg.status) === "entregue") throw new TRPCError({ code: "BAD_REQUEST", message: "Essa contagem já foi entregue." });
    await db().query(`DELETE FROM estoque_semanal_fotos WHERE id=?`, [input.fotoId]);
    return { ok: true };
  }),

  foto: protectedProcedure.input(z.object({ fotoId: id })).query(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const [r] = await db().query<any[]>(
      `SELECT f.foto, f.mime, s.lojaId FROM estoque_semanal_fotos f JOIN estoque_semanal s ON s.id=f.semanalId WHERE f.id=? LIMIT 1`,
      [input.fotoId]
    );
    if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Foto não encontrada." });
    podeVerLoja(p, Number(r[0].lojaId));
    if (!r[0].foto) return null;
    const buf = Buffer.isBuffer(r[0].foto) ? r[0].foto : Buffer.from(r[0].foto);
    return { mime: String(r[0].mime || "image/jpeg"), base64: buf.toString("base64") };
  }),

  // Alteração/ajuste encontrado na contagem.
  salvarAjuste: protectedProcedure
    .input(z.object({
      lojaId: id, semanaInicio: dataIso, grupo: grupoInput,
      codigo: z.string().trim().min(1, "Informe o código.").max(60), item: z.string().trim().max(300),
      qtdSistema: z.number().min(-1000000).max(1000000).nullable(), qtdContada: z.number().min(0).max(1000000),
      obs: z.string().trim().max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { reg } = await paraEditar(ctx, input.lojaId, input.semanaInicio, input.grupo);
      await db().query(
        `INSERT INTO estoque_semanal_ajustes (semanalId, grupo, codigo, item, qtdSistema, qtdContada, obs, criadoPorNome) VALUES (?,?,?,?,?,?,?,?)`,
        [reg.id, input.grupo, input.codigo, input.item || null, input.qtdSistema, input.qtdContada, input.obs || null, nomeUsuario(ctx)]
      );
      // Com alteração lançada o grupo deixa de ser "sem alteração".
      const grupos = lerGrupos(reg.grupos);
      if (grupos[input.grupo]?.semAlteracao) {
        grupos[input.grupo]!.semAlteracao = false;
        await db().query(`UPDATE estoque_semanal SET grupos=? WHERE id=?`, [JSON.stringify(grupos), reg.id]);
      }
      return { ok: true };
    }),

  apagarAjuste: protectedProcedure.input(z.object({ ajusteId: id })).mutation(async ({ ctx, input }) => {
    const p = perfil(ctx);
    await ensure();
    const reg = await regDaFotoOuAjuste("estoque_semanal_ajustes", input.ajusteId);
    podeVerLoja(p, Number(reg.lojaId));
    if (String(reg.status) === "entregue") throw new TRPCError({ code: "BAD_REQUEST", message: "Essa contagem já foi entregue." });
    await db().query(`DELETE FROM estoque_semanal_ajustes WHERE id=?`, [input.ajusteId]);
    return { ok: true };
  }),

  semAlteracao: protectedProcedure
    .input(z.object({ lojaId: id, semanaInicio: dataIso, grupo: grupoInput, valor: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { reg } = await paraEditar(ctx, input.lojaId, input.semanaInicio, input.grupo);
      if (input.valor) {
        const [a] = await db().query<any[]>(`SELECT COUNT(*) n FROM estoque_semanal_ajustes WHERE semanalId=? AND grupo=?`, [reg.id, input.grupo]);
        if (Number(a[0].n)) throw new TRPCError({ code: "BAD_REQUEST", message: "Esse grupo tem alterações lançadas. Apague-as antes." });
      }
      const grupos = lerGrupos(reg.grupos);
      grupos[input.grupo] = { arquivoNome: grupos[input.grupo]?.arquivoNome || "", itens: grupos[input.grupo]?.itens || [], semAlteracao: input.valor };
      await db().query(`UPDATE estoque_semanal SET grupos=? WHERE id=?`, [JSON.stringify(grupos), reg.id]);
      return { ok: true };
    }),

  // Entrega: cada grupo com o relatório, pelo menos uma foto da folha e as alterações (ou "sem alteração").
  entregar: protectedProcedure.input(z.object({ lojaId: id, semanaInicio: dataIso })).mutation(async ({ ctx, input }) => {
    const { reg, lojaId } = await paraEditar(ctx, input.lojaId, input.semanaInicio);
    const s = await montarSemana(lojaId, input.semanaInicio);
    const faltas: string[] = [];
    for (const g of s.grupos) {
      const f: string[] = [];
      if (!g.totalItens) f.push("relatório");
      if (!g.fotos.length) f.push("foto da folha");
      if (!g.ajustes.length && !g.semAlteracao) f.push("alterações ou \"sem alteração\"");
      if (f.length) faltas.push(`${g.nome}: ${f.join(", ")}`);
    }
    if (faltas.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Falta: ${faltas.join(" • ")}` });
    await db().query(`UPDATE estoque_semanal SET status='entregue', entreguePorNome=?, entregueEm=NOW() WHERE id=?`, [nomeUsuario(ctx), reg.id]);
    return { ok: true };
  }),

  // Painel do supervisor: as 6 lojas numa semana.
  painel: protectedProcedure.input(z.object({ semanaInicio: dataIso })).query(async ({ ctx, input }) => {
    exigirSupervisor(ctx);
    await ensure();
    const semana = segundaDaSemana(input.semanaInicio);
    const [regs] = await db().query<any[]>(
      `SELECT s.*,
              (SELECT COUNT(*) FROM estoque_semanal_ajustes a WHERE a.semanalId=s.id) ajustes,
              (SELECT COUNT(*) FROM estoque_semanal_ajustes a WHERE a.semanalId=s.id AND a.tratado=0) pendentes
         FROM estoque_semanal s WHERE s.semanaInicio=?`,
      [semana]
    );
    const [abertas] = await db().query<any[]>(
      `SELECT s.lojaId, COUNT(*) n FROM estoque_semanal_ajustes a JOIN estoque_semanal s ON s.id=a.semanalId
        WHERE s.status='entregue' AND a.tratado=0 GROUP BY s.lojaId`
    );
    return {
      semanaInicio: semana, semanaFim: somarDias(semana, 5), numero: semanaDoCiclo(semana),
      grupos: gruposDaSemana(semana).map((g) => GRUPOS_ESTOQUE[g]),
      lojas: EMPRESAS.map((e) => {
        const r = regs.find((x) => Number(x.lojaId) === e.lojaId);
        return {
          lojaId: e.lojaId, loja: e.loja, status: semanaDoCiclo(semana) ? situacao(semana, r) : "pendente",
          iniciada: !!r, entreguePorNome: r?.entreguePorNome ? String(r.entreguePorNome) : "",
          ajustes: Number(r?.ajustes || 0), pendentes: Number(r?.pendentes || 0),
          pendentesTotal: Number(abertas.find((a) => Number(a.lojaId) === e.lojaId)?.n || 0),
        };
      }),
    };
  }),

  // Semanas entregues com ajustes ainda sem tratar.
  pendencias: protectedProcedure.query(async ({ ctx }) => {
    exigirSupervisor(ctx);
    await ensure();
    const [rows] = await db().query<any[]>(
      `SELECT s.lojaId, s.semanaInicio, COUNT(*) pendentes FROM estoque_semanal_ajustes a JOIN estoque_semanal s ON s.id=a.semanalId
        WHERE s.status='entregue' AND a.tratado=0 GROUP BY s.id ORDER BY s.semanaInicio DESC LIMIT 60`
    );
    return rows.map((r) => ({ lojaId: Number(r.lojaId), loja: empresaDaLoja(Number(r.lojaId))?.loja || "", semanaInicio: iso(r.semanaInicio)!, pendentes: Number(r.pendentes) }));
  }),

  tratar: protectedProcedure
    .input(z.object({ ajusteId: id, tratado: z.boolean(), obs: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      exigirSupervisor(ctx);
      await ensure();
      await db().query(
        `UPDATE estoque_semanal_ajustes SET tratado=?, tratadoObs=?, tratadoPorNome=?, tratadoEm=${input.tratado ? "NOW()" : "NULL"} WHERE id=?`,
        [input.tratado ? 1 : 0, input.obs || null, input.tratado ? nomeUsuario(ctx) : null, input.ajusteId]
      );
      return { ok: true };
    }),
});
