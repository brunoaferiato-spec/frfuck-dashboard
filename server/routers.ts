import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  getDb,
  getLojas,
  getLojaById,
  getFuncionariosByLoja,
  getFuncionarioById,
  getMetaByFuncaoLojaAnoMes,
  getMetasByLoja,
  getFolhaByFuncionarioAnoMes,
  getFolhaByLojaAnoMes,
  getPremiacoesByFuncionarioAnoMes,
  getValesByFuncionarioAnoMes,
  getDescontosByFuncionarioAnoMes,
  getObservacoesByFuncionarioAnoMes,
  getTarefasByUsuario,
  getTarefasByUsuarioStatus,
  getContasBancariasByLoja,
  getContaBancariaById,
  getComprasByLojaAnoMes,
  getLogsByUsuario,
  getComissaoFuncionario,
} from "./db";
import { lojas, funcionarios, metas, folhaPagamento, premiacoes, vales, descontos, observacoes, tarefas, compras, contasBancarias, comissaoFuncionario, auditoria } from "../drizzle/schema";

// ===== Middleware de Controle de Acesso =====
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const gestorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "gestor") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const rhProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "rh") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const comprasProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "compras") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

const financeiroProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "financeiro") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ===== Lojas =====
  lojas: router({
    list: protectedProcedure.query(async () => {
      return await getLojas();
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await getLojaById(input.id);
    }),
  }),

  // ===== Funcionários =====
  funcionarios: router({
    listByLoja: gestorProcedure.input(z.object({ lojaId: z.number() })).query(async ({ input }) => {
      return await getFuncionariosByLoja(input.lojaId);
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await getFuncionarioById(input.id);
    }),
    create: gestorProcedure
      .input(
        z.object({
          lojaId: z.number(),
          nome: z.string(),
          funcao: z.enum(["mecanico", "vendedor", "consultor_vendas", "alinhador", "recepcionista", "auxiliar_estoque", "lider_estoque", "auxiliar_caixa", "administrativo"]),
          dataAdmissao: z.date(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(funcionarios).values(input as any);
        return result;
      }),
  }),

  // ===== Metas =====
  metas: router({
    getByFuncaoLojaAnoMes: gestorProcedure
      .input(z.object({ lojaId: z.number(), funcao: z.string(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getMetaByFuncaoLojaAnoMes(input.lojaId, input.funcao, input.ano, input.mes);
      }),
    listByLojaAnoMes: gestorProcedure
      .input(z.object({ lojaId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getMetasByLoja(input.lojaId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          lojaId: z.number(),
          funcao: z.string(),
          ano: z.number(),
          mes: z.number(),
          faixas: z.array(z.object({ liquidezMinima: z.number(), percentualComissao: z.number() })),
          salarioFixo: z.number().optional(),
          aplicacaoEm: z.enum(["imediata", "mes_atual", "proximo_mes"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { faixas, salarioFixo, ...rest } = input;
        const result = await db.insert(metas).values({
          ...rest,
          salarioFixo: salarioFixo || null,
          faixas: JSON.stringify(faixas) as any,
        } as any);
        return result;
      }),
  }),

  // ===== Folha de Pagamento =====
  folhaPagamento: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getFolhaByFuncionarioAnoMes(input.funcionarioId, input.ano, input.mes);
      }),
    getByLojaAnoMes: gestorProcedure
      .input(z.object({ lojaId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getFolhaByLojaAnoMes(input.lojaId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          contaBancariaId: z.number().optional(),
          ano: z.number(),
          mes: z.number(),
          semana: z.number(),
          liquidez: z.number(),
          percentualComissao: z.number(),
          valorComissao: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { contaBancariaId, ...rest } = input;
        const result = await db.insert(folhaPagamento).values({
          ...rest,
          contaBancariaId: contaBancariaId || null,
        } as any);
        return result;
      }),
  }),

  // ===== Premiações =====
  premiacoes: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getPremiacoesByFuncionarioAnoMes(input.funcionarioId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          descricao: z.string(),
          valor: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(premiacoes).values(input as any);
        return result;
      }),
  }),

  // ===== Vales =====
  vales: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getValesByFuncionarioAnoMes(input.funcionarioId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          descricao: z.string(),
          valorTotal: z.number(),
          valorParcela: z.number(),
          parcelas: z.number(),
          ano: z.number(),
          mes: z.number(),
          mesOrigem: z.number(),
          tipo: z.enum(["simples", "parcelado"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(vales).values(input as any);
        return result;
      }),
  }),

  // ===== Descontos =====
  descontos: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getDescontosByFuncionarioAnoMes(input.funcionarioId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          tipo: z.enum(["aluguel", "inss", "adiantamento", "holerite"]),
          valor: z.number(),
          ano: z.number(),
          mes: z.number(),
          descricao: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(descontos).values(input as any);
        return result;
      }),
  }),

  // ===== Observações =====
  observacoes: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getObservacoesByFuncionarioAnoMes(input.funcionarioId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          texto: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(observacoes).values(input as any);
        return result;
      }),
  }),

  // ===== Tarefas =====
  tarefas: router({
    listByUsuario: protectedProcedure.query(async ({ ctx }) => {
      return await getTarefasByUsuario(ctx.user.id);
    }),
    listByUsuarioStatus: protectedProcedure
      .input(z.object({ status: z.enum(["pendente", "concluida", "cancelada"]) }))
      .query(async ({ ctx, input }) => {
        return await getTarefasByUsuarioStatus(ctx.user.id, input.status);
      }),
    create: protectedProcedure
      .input(
        z.object({
          titulo: z.string(),
          descricao: z.string().optional(),
          prioridade: z.enum(["vermelho", "amarelo", "verde"]),
          dataVencimento: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(tarefas).values({
          usuarioId: ctx.user.id,
          ...input,
        } as any);
        return result;
      }),
  }),

  // ===== Compras =====
  compras: router({
    getByLojaAnoMes: comprasProcedure
      .input(z.object({ lojaId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getComprasByLojaAnoMes(input.lojaId, input.ano, input.mes);
      }),
    create: comprasProcedure
      .input(
        z.object({
          lojaId: z.number(),
          fornecedor: z.string(),
          categoria: z.enum(["pneus", "insumos_estoque", "outros"]),
          descricao: z.string().optional(),
          valor: z.number(),
          ano: z.number(),
          mes: z.number(),
          data: z.date(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(compras).values({
          usuarioComprasId: ctx.user.id,
          ...input,
        } as any);
        return result;
      }),
  }),

  // ===== Contas Bancárias =====
  contasBancarias: router({
    listByLoja: gestorProcedure
      .input(z.object({ lojaId: z.number().nullable() }))
      .query(async ({ input }) => {
        return await getContasBancariasByLoja(input.lojaId);
      }),
    getById: gestorProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getContaBancariaById(input.id);
      }),
    create: gestorProcedure
      .input(
        z.object({
          lojaId: z.number().nullable(),
          banco: z.enum(["itau", "caixa", "santander"]),
          nomeConta: z.string(),
          agencia: z.string(),
          conta: z.string(),
          tipoConta: z.enum(["corrente", "poupanca"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const result = await db.insert(contasBancarias).values(input as any);
        return result;
      }),
  }),

  // ===== Comissão Personalizada =====
  // ===== Salvamento Automático Folha de Pagamento =====
  folhaPagamentoAuto: router({
    saveSemana: gestorProcedure
      .input(z.object({
        funcionarioId: z.number(),
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        semana: z.number(),
        liquidez: z.number(),
        percentualComissao: z.number(),
        valorComissao: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const existing = await db.query.folhaPagamento.findFirst({
          where: and(
            eq(folhaPagamento.funcionarioId, input.funcionarioId),
            eq(folhaPagamento.lojaId, input.lojaId),
            eq(folhaPagamento.ano, input.ano),
            eq(folhaPagamento.mes, input.mes),
            eq(folhaPagamento.semana, input.semana)
          ),
        });

        if (existing) {
          await db.update(folhaPagamento).set({
            liquidez: input.liquidez.toString() as any,
            percentualComissao: input.percentualComissao.toString() as any,
            valorComissao: input.valorComissao.toString() as any,
          }).where(eq(folhaPagamento.id, existing.id));
        } else {
          await db.insert(folhaPagamento).values({
            funcionarioId: input.funcionarioId,
            lojaId: input.lojaId,
            ano: input.ano,
            mes: input.mes,
            semana: input.semana,
            liquidez: input.liquidez.toString() as any,
            percentualComissao: input.percentualComissao.toString() as any,
            valorComissao: input.valorComissao.toString() as any,
          } as any);
        }
        return { success: true };
      }),
    savePremiacao: gestorProcedure
      .input(z.object({
        funcionarioId: z.number(),
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        descricao: z.string(),
        valor: z.number(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.insert(premiacoes).values({
          funcionarioId: input.funcionarioId,
          lojaId: input.lojaId,
          ano: input.ano,
          mes: input.mes,
          descricao: input.descricao,
          valor: input.valor.toString() as any,
        } as any);
        return { success: true };
      }),
    saveVale: gestorProcedure
      .input(z.object({
        funcionarioId: z.number(),
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        mesOrigem: z.number(),
        descricao: z.string(),
        valorTotal: z.number(),
        valorParcela: z.number(),
        parcelas: z.number(),
        tipo: z.enum(["simples", "parcelado"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.insert(vales).values({
          funcionarioId: input.funcionarioId,
          lojaId: input.lojaId,
          ano: input.ano,
          mes: input.mes,
          mesOrigem: input.mesOrigem,
          descricao: input.descricao,
          valorTotal: input.valorTotal.toString() as any,
          valorParcela: input.valorParcela.toString() as any,
          parcelas: input.parcelas,
          tipo: input.tipo,
        } as any);
        return { success: true };
      }),
    saveDesconto: gestorProcedure
      .input(z.object({
        funcionarioId: z.number(),
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        tipo: z.enum(["aluguel", "inss", "adiantamento", "holerite"]),
        valor: z.number(),
        descricao: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.insert(descontos).values({
          funcionarioId: input.funcionarioId,
          lojaId: input.lojaId,
          ano: input.ano,
          mes: input.mes,
          tipo: input.tipo,
          valor: input.valor.toString() as any,
          descricao: input.descricao || null,
        } as any);
        return { success: true };
      }),
    saveObservacao: gestorProcedure
      .input(z.object({
        funcionarioId: z.number(),
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        texto: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.insert(observacoes).values({
          funcionarioId: input.funcionarioId,
          lojaId: input.lojaId,
          ano: input.ano,
          mes: input.mes,
          texto: input.texto,
        } as any);
        return { success: true };
      }),
  }),

  // ===== Exportação Excel =====
  exportExcel: router({
    folhaPagamento: gestorProcedure
      .input(z.object({
        lojaId: z.number(),
        ano: z.number(),
        mes: z.number(),
        secao: z.enum(['comissao', 'recepcionista', 'fixo']),
        dados: z.array(z.object({
          funcionario: z.string(),
          funcao: z.string(),
          semana1: z.number().optional(),
          pct1: z.number().optional(),
          semana2: z.number().optional(),
          pct2: z.number().optional(),
          semana3: z.number().optional(),
          pct3: z.number().optional(),
          semana4: z.number().optional(),
          pct4: z.number().optional(),
          totalLiquidez: z.number().optional(),
          totalComissao: z.number().optional(),
          premiacao: z.number().optional(),
          vale: z.number().optional(),
          aluguel: z.number().optional(),
          inss: z.number().optional(),
          adiantamento: z.number().optional(),
          holerite: z.number().optional(),
          boleto: z.number().optional(),
          observacoes: z.string().optional(),
          carros: z.number().optional(),
          valorPorCarro: z.number().optional(),
          fixo: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { generateFolhaExcel } = await import('./exportExcel');
        const { lojas: lojasDb } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const loja = await db.query.lojas.findFirst({
          where: eq(lojasDb.id, input.lojaId),
        });

        if (!loja) throw new TRPCError({ code: "NOT_FOUND", message: "Loja não encontrada" });

        const buffer = generateFolhaExcel(
          input.dados,
          loja.nome,
          input.ano,
          input.mes,
          input.secao
        );

        return {
          success: true,
          filename: `Folha_Pagamento_${loja.nome}_${input.mes}_${input.ano}.xlsx`,
          buffer: buffer.toString('base64'),
        };
      }),
  }),

  comissaoFuncionario: router({
    getByFuncionarioAnoMes: gestorProcedure
      .input(z.object({ funcionarioId: z.number(), lojaId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getComissaoFuncionario(input.funcionarioId, input.lojaId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          faixas: z.array(z.object({ liquidezMinima: z.number(), percentualComissao: z.number() })),
          salarioFixo: z.number().optional(),
          aplicacaoEm: z.enum(["imediata", "mes_atual", "proximo_mes"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { faixas, salarioFixo, ...rest } = input;
        const result = await db.insert(comissaoFuncionario).values({
          ...rest,
          usuarioId: ctx.user.id,
          salarioFixo: salarioFixo || null,
          faixas: JSON.stringify(faixas) as any,
        } as any);
        return result;
      }),
  }),

  // ===== Auditoria Router =====
  auditoria: router({
    registrar: gestorProcedure
      .input(
        z.object({
          lojaId: z.number(),
          funcionarioId: z.number(),
          ano: z.number(),
          mes: z.number(),
          campo: z.string(),
          valorAnterior: z.string().optional(),
          valorNovo: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.insert(auditoria).values({
          ...input,
          usuarioId: ctx.user.id,
          usuarioNome: ctx.user.name || "Desconhecido",
          dataAlteracao: new Date(),
        } as any);
        
        return result;
      }),

    getUltimaAlteracao: gestorProcedure
      .input(
        z.object({
          lojaId: z.number(),
          funcionarioId: z.number(),
          ano: z.number(),
          mes: z.number(),
          campo: z.string(),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        
        const result = await db.query.auditoria.findFirst({
          where: and(
            eq(auditoria.lojaId, input.lojaId),
            eq(auditoria.funcionarioId, input.funcionarioId),
            eq(auditoria.ano, input.ano),
            eq(auditoria.mes, input.mes),
            eq(auditoria.campo, input.campo)
          ),
        });
        
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
