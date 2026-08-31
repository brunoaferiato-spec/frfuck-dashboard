import {
  getDb,
  getUserByEmail,
  getUsers,
  updateUserById,
  deleteUserById,
  getLojas,
  getLojaById,
  getFuncionariosByLoja,
  getFuncionarioById,
  createFuncionario,
  updateFuncionario,
  inativarFuncionarioById,
  reativarFuncionarioById,
  deleteFuncionarioById,
  getMetaByFuncaoLojaAnoMes,
  getMetasByLoja,
  getFolhaByFuncionarioAnoMes,
  getFolhaByLojaAnoMes,
  getContasBancariasByLoja,
  getContaBancariaById,
  getComprasByLojaAnoMes,
  getComissaoFuncionario,
  getFolhaExtrasByLojaAnoMes,
  getFolhaBaseByLojaAnoMes,
  getResumoSupervisorMensal,
  upsertFolhaBaseItem,
  createPremiacao,
  deletePremiacaoById,
  createObservacao,
  deleteObservacaoByTexto,
  upsertDesconto,
  createValesBatch,
  cancelValesByGrupoFromCurrentForward,
  getFolhaFechamentoStatus,
  fecharCompetenciaFolha,
  reabrirCompetenciaFolha,
  trocarFuncaoFuncionario,
  getTrocasFuncaoByLojaCompetencia,
  upsertFolhaTransicaoFuncao,
} from "./db";

import { signAuthToken, comparePassword, hashPassword } from "./auth";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { users } from "../drizzle/schema";

const funcaoSchema = z.enum([
  "mecanico",
  "vendedor",
  "consultor_vendas",
  "alinhador",
  "aux_alinhador",
  "auxiliar_limpeza",
  "caixa",
  "caixa_lider",
  "recepcionista",
  "auxiliar_estoque",
  "lider_estoque",
  "auxiliar_mecanico",
  "administrativo",
  "gerente",
  "supervisor",
]);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      return ctx.user ?? null;
    }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await getUserByEmail(input.email.trim().toLowerCase());

          if (!user) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Usuário não encontrado",
            });
          }

          if (!user.isActive) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Usuário inativo",
            });
          }

          const senhaValida = await comparePassword(
            input.password,
            user.passwordHash ?? null
          );

          if (!senhaValida) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Senha inválida",
            });
          }

          const token = signAuthToken({
            id: user.id,
            openId: user.openId ?? null,
            name: user.name ?? null,
            email: user.email ?? null,
            role: user.role,
            lojaId: user.lojaId ?? null,
            isActive: Boolean(user.isActive),
          });

          ctx.res.cookie(
            COOKIE_NAME,
            token,
            getSessionCookieOptions(ctx.req)
          );

          return {
            success: true,
            token,
            user: {
              id: user.id,
              openId: user.openId ?? null,
              name: user.name ?? null,
              email: user.email ?? null,
              role: user.role,
              lojaId: user.lojaId ?? null,
              isActive: Boolean(user.isActive),
            },
          };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Erro no login",
          });
        }
      }),

    register: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2, "Nome muito curto"),
          email: z.string().email("Email inválido"),
          password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
          role: z.enum(["admin", "gestor", "rh", "compras", "financeiro"]),
          lojaId: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const existingUser = await getUserByEmail(input.email);

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um usuário com esse email",
          });
        }

        const db = await getDb();

        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco não conectado",
          });
        }

        const passwordHash = await hashPassword(input.password);
        const openId = `user_${Date.now()}`;

        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "email",
          passwordHash,
          role: input.role,
          lojaId: input.lojaId ?? null,
          isActive: true,
          lastSignedIn: new Date(),
        } as any);

        return {
          success: true,
          message: "Usuário criado com sucesso",
        };
      }),

    listUsers: protectedProcedure.query(async () => {
      return await getUsers();
    }),

    updateUser: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(2, "Nome muito curto"),
          email: z.string().email("Email inválido"),
          password: z.string().optional(),
          role: z.enum(["admin", "gestor", "rh", "compras", "financeiro"]),
          lojaId: z.number().nullable().optional(),
          isActive: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        const existingUser = await getUserByEmail(input.email);

        if (existingUser && existingUser.id !== input.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe outro usuário com esse email",
          });
        }

        let passwordHash: string | undefined = undefined;

        if (input.password && input.password.trim().length > 0) {
          if (input.password.trim().length < 6) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A senha deve ter pelo menos 6 caracteres",
            });
          }
          passwordHash = await hashPassword(input.password.trim());
        }

        const updated = await updateUserById(input.id, {
          name: input.name,
          email: input.email,
          role: input.role,
          lojaId: input.lojaId ?? null,
          isActive: input.isActive,
          passwordHash,
        });

        return {
          success: true,
          message: "Usuário atualizado com sucesso",
          user: updated,
        };
      }),

    deleteUser: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.id === input.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Você não pode excluir o próprio usuário",
          });
        }

        await deleteUserById(input.id);

        return {
          success: true,
          message: "Usuário excluído com sucesso",
        };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);

      ctx.res.clearCookie(COOKIE_NAME, {
        ...cookieOptions,
        maxAge: -1,
      });

      return { success: true };
    }),
  }),

  lojas: router({
    list: protectedProcedure.query(() => getLojas()),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getLojaById(input.id)),
  }),

  funcionarios: router({
    listByLoja: protectedProcedure
      .input(z.object({ lojaId: z.number() }))
      .query(({ input }) => getFuncionariosByLoja(input.lojaId)),

        inativar: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          dataDesligamento: z.coerce.date(),
        })
      )
      .mutation(({ input }) =>
        inativarFuncionarioById(input.id, input.dataDesligamento)
      ),

    reativar: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          dataReativacao: z.coerce.date(),
        })
      )
      .mutation(({ input }) =>
        reativarFuncionarioById(input.id, input.dataReativacao)
      ),

      excluir: protectedProcedure
       .input(
       z.object({
       id: z.number(),
      })
    )
  .mutation(async ({ input }) => {
    return deleteFuncionarioById(input.id);
  }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getFuncionarioById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          nome: z.string().min(2, "Nome muito curto"),
          cpf: z.string().trim().min(1, "CPF é obrigatório"),
          pix: z.string().trim().min(1, "PIX é obrigatório"),
          dataNascimento: z.coerce.date(),
          funcao: funcaoSchema,
          tipoMeta: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(["meta1", "meta2"]).nullable().optional()
          ),
          dataAdmissao: z.coerce.date(),
        })
      )
      .mutation(async ({ input }) => {
        const created = await createFuncionario({
          lojaId: input.lojaId,
          nome: input.nome,
          cpf: input.cpf,
          pix: input.pix,
          dataNascimento: input.dataNascimento,
          funcao: input.funcao,
          tipoMeta: input.tipoMeta ?? null,
          dataAdmissao: input.dataAdmissao,
        });

        return {
          success: true,
          message: "Funcionário criado com sucesso",
          funcionario: created,
        };
      }),

    trocasByLojaCompetencia: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number().min(1).max(12),
        })
      )
      .query(({ input }) =>
        getTrocasFuncaoByLojaCompetencia(input.lojaId, input.ano, input.mes)
      ),

    trocarFuncao: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          lojaId: z.number(),
          novaFuncao: funcaoSchema,
          novoTipoMeta: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(["meta1", "meta2"]).nullable().optional()
          ),
          dataMudanca: z.coerce.date(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return trocarFuncaoFuncionario({
          id: input.id,
          lojaId: input.lojaId,
          novaFuncao: input.novaFuncao,
          novoTipoMeta: input.novoTipoMeta ?? null,
          dataMudanca: input.dataMudanca,
          usuarioId: Number(ctx.user.id),
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          lojaId: z.number(),
          nome: z.string().min(2, "Nome muito curto"),
          cpf: z.string().trim().min(1, "CPF é obrigatório"),
          pix: z.string().trim().min(1, "PIX é obrigatório"),
          dataNascimento: z.coerce.date(),
          funcao: funcaoSchema,
          tipoMeta: z.preprocess(
            (val) => (val === "" ? null : val),
            z.enum(["meta1", "meta2"]).nullable().optional()
          ),
          dataAdmissao: z.coerce.date(),
        })
      )
      .mutation(async ({ input }) => {
        const updated = await updateFuncionario({
          id: input.id,
          lojaId: input.lojaId,
          nome: input.nome,
          cpf: input.cpf,
          pix: input.pix,
          dataNascimento: input.dataNascimento,
          funcao: input.funcao,
          tipoMeta: input.tipoMeta ?? null,
          dataAdmissao: input.dataAdmissao,
        });

        return {
          success: true,
          message: "Funcionário atualizado com sucesso",
          funcionario: updated,
        };
      }),
  }),

  metas: router({
    getByFuncaoLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          funcao: z.string(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getMetaByFuncaoLojaAnoMes(
          input.lojaId,
          input.funcao,
          input.ano,
          input.mes
        )
      ),

    listByLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getMetasByLoja(input.lojaId, input.ano, input.mes)
      ),
  }),

  folhaPagamento: router({
    getByFuncionarioAnoMes: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getFolhaByFuncionarioAnoMes(
          input.funcionarioId,
          input.ano,
          input.mes
        )
      ),

    getByLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getFolhaByLojaAnoMes(input.lojaId, input.ano, input.mes)
      ),

    getBaseByLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getFolhaBaseByLojaAnoMes(input.lojaId, input.ano, input.mes)
      ),

    getResumoSupervisorMensal: protectedProcedure
      .input(
        z.object({
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(async ({ input }) => {
        const result = await getResumoSupervisorMensal(input.ano, input.mes);
        const rows = Array.isArray(result) ? result[0] ?? result : [];

        const getValor = (lojaId: number) =>
          Number(
            (rows as any[]).find((r: any) => Number(r.lojaId) === lojaId)
              ?.liquidez || 0
          );

        const joinville = getValor(1);
        const blumenau = getValor(2);
        const saoJose = getValor(3);
        const florianopolis = getValor(4);

        return {
          joinville,
          blumenau,
          saoJose,
          florianopolis,
          total: joinville + blumenau + saoJose + florianopolis,
        };
      }),

    upsertBaseItem: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          semana: z.number(),
          funcaoSemana: z.enum(["vendedor", "mecanico"]).nullable().optional(),
          composicaoSemana: z
            .array(
              z.object({
                funcao: z.enum(["vendedor", "mecanico"]),
                liquidez: z.number(),
                percentual: z.number(),
                comissao: z.number(),
              })
            )
            .nullable()
            .optional(),
          liquidez: z.number(),
          percentualComissao: z.number(),
          valorComissao: z.number(),
          percentualManual: z.number().nullable().optional(),
          motivoPercentualManual: z.string().nullable().optional(),
          ultimaAlteracaoPor: z.string().nullable().optional(),
          ultimaAlteracaoEm: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(({ input }) => upsertFolhaBaseItem(input)),

    upsertTransicaoFuncao: protectedProcedure
      .input(
        z.object({
          trocaFuncaoId: z.number(),
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number().min(1).max(12),
          quantidadeAnterior1: z.number().min(0),
          quantidadeAnterior2: z.number().min(0).optional(),
          valorFixoAnterior: z.number().min(0).optional(),
          ultimaAlteracaoPor: z.string().nullable().optional(),
          ultimaAlteracaoEm: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(({ input }) => upsertFolhaTransicaoFuncao(input)),
  }),

  folhaFechamento: router({
    getStatus: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getFolhaFechamentoStatus(input.lojaId, input.ano, input.mes)
      ),

    fechar: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "gestor"].includes(String(ctx.user.role))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Somente administrador ou gestor pode fechar a folha.",
          });
        }

        return await fecharCompetenciaFolha({
          ...input,
          usuarioId: Number(ctx.user.id),
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        });
      }),

    reabrir: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          password: z.string().min(1, "Informe sua senha"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "gestor"].includes(String(ctx.user.role))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Somente administrador ou gestor pode reabrir a folha.",
          });
        }

        if (!ctx.user.email) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O usuário atual não possui e-mail para validar a senha.",
          });
        }

        const user = await getUserByEmail(String(ctx.user.email).trim().toLowerCase());
        if (!user || !user.isActive) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário inválido ou inativo.",
          });
        }

        const senhaValida = await comparePassword(
          input.password,
          user.passwordHash ?? null
        );

        if (!senhaValida) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Senha inválida. A competência continua fechada.",
          });
        }

        return await reabrirCompetenciaFolha({
          lojaId: input.lojaId,
          ano: input.ano,
          mes: input.mes,
          usuarioId: Number(ctx.user.id),
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        });
      }),
  }),

  folhaExtras: router({
    getByLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getFolhaExtrasByLojaAnoMes(input.lojaId, input.ano, input.mes)
      ),

    addPremiacao: protectedProcedure
  .input(
    z.object({
      funcionarioId: z.number(),
      lojaId: z.number(),
      ano: z.number(),
      mes: z.number(),
      descricao: z.string().min(1),
      valor: z.number().positive(),

      ultimaAlteracaoPor: z.string().nullable().optional(),
      ultimaAlteracaoEm: z.coerce.date().nullable().optional(),
    })
  )
  .mutation(({ input }) => createPremiacao(input)),

    removePremiacao: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePremiacaoById(input.id)),

    addObservacao: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          texto: z.string().min(1),
        })
      )
      .mutation(({ input }) => createObservacao(input)),

    removeObservacao: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          texto: z.string().min(1),
        })
      )
      .mutation(({ input }) => deleteObservacaoByTexto(input)),

    saveDesconto: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
          tipo: z.enum(["aluguel", "inss", "adiantamento", "holerite"]),
          valor: z.number().min(0),

          ultimaAlteracaoPor: z.string().nullable().optional(),
          ultimaAlteracaoEm: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(({ input }) => upsertDesconto(input)),

    addVales: protectedProcedure
  .input(
    z.object({
      funcionarioId: z.number(),
      lojaId: z.number(),

      items: z.array(
        z.object({
          grupoId: z.string(),
          descricao: z.string(),
          valorTotal: z.number(),
          valorParcela: z.number(),
          parcelas: z.number(),
          parcelaAtual: z.number(),
          ano: z.number(),
          mes: z.number(),
          mesOrigem: z.number(),
          tipo: z.enum(["simples", "parcelado"]),
        })
      ),

      ultimaAlteracaoPor: z.string().nullable().optional(),
      ultimaAlteracaoEm: z.coerce.date().nullable().optional(),
    })
  )
  .mutation(({ input }) => createValesBatch(input)),

    removeValesFromCurrentForward: protectedProcedure
  .input(
    z.object({
      funcionarioId: z.number(),
      lojaId: z.number(),
      grupoId: z.string(),
      valeId: z.number().optional(),
      ano: z.number(),
      mes: z.number(),
    })
  )
  .mutation(({ input }) => cancelValesByGrupoFromCurrentForward(input)),
  }),

  comissaoFuncionario: router({
    getByFuncionarioAnoMes: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getComissaoFuncionario(
          input.funcionarioId,
          input.lojaId,
          input.ano,
          input.mes
        )
      ),
  }),

  compras: router({
    getByLojaAnoMes: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number(),
        })
      )
      .query(({ input }) =>
        getComprasByLojaAnoMes(input.lojaId, input.ano, input.mes)
      ),
  }),

  contasBancarias: router({
    listByLoja: protectedProcedure
      .input(z.object({ lojaId: z.number().nullable() }))
      .query(({ input }) => getContasBancariasByLoja(input.lojaId)),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getContaBancariaById(input.id)),
  }),
});

export type AppRouter = typeof appRouter;