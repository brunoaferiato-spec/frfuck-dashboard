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
  getMetaByFuncaoLojaAnoMes,
  getMetasByLoja,
  getFolhaByFuncionarioAnoMes,
  getFolhaByLojaAnoMes,
  getContasBancariasByLoja,
  getContaBancariaById,
  getComprasByLojaAnoMes,
  getComissaoFuncionario,
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
  "recepcionista",
  "auxiliar_estoque",
  "lider_estoque",
  "auxiliar_caixa",
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
          const user = await getUserByEmail(input.email);

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

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getFuncionarioById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          nome: z.string().min(2, "Nome muito curto"),
          cpf: z.string().nullable().optional(),
          pix: z.string().nullable().optional(),
          funcao: funcaoSchema,
          tipoMeta: z.enum(["meta1", "meta2"]).nullable().optional(),
          dataAdmissao: z.coerce.date(),
        })
      )
      .mutation(async ({ input }) => {
        const created = await createFuncionario({
          lojaId: input.lojaId,
          nome: input.nome,
          cpf: input.cpf ?? null,
          pix: input.pix ?? null,
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