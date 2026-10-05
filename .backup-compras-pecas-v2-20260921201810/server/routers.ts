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
  getRepassesFranklynByAnoMes,
  setRepasseFranklynPago,
  getFolhaFechamentoStatus,
  fecharCompetenciaFolha,
  reabrirCompetenciaFolha,
  trocarFuncaoFuncionario,
  getTrocasFuncaoByLojaCompetencia,
  getTrocasFuncaoByFuncionario,
  corrigirDataTrocaFuncao,
  upsertFolhaTransicaoFuncao,
  getFolhaSem5Status,
  ativarFolhaSem5,
  desativarFolhaSem5,
  getRhPontoDia,
  getRhPontoHistorico,
  analisarRhPontoImportacao,
  salvarRhPontoImportacao,
  salvarRhPontoConferencia,
  getRhPontoPendencias,
  vincularRhPontoNomeFuncionario,
  criarRhPontoTratativa,
  salvarDocumentoRhPontoTratativa,
  concluirRhPontoTratativa,
  getRhPontoTratativaDocumento,
  getRhCaixaDia,
  getRhCaixaHistorico,
  salvarRhCaixaFechamento,
  getRhCaixaRelatorioArquivo,
  excluirRhPontoJustificativa,
} from "./db";

import { signAuthToken, comparePassword, hashPassword } from "./auth";
import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { users } from "../drizzle/schema";
import { storageGet, storagePut } from "./storage";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

import { rhDocumentosRouter } from "./rhDocumentos";
import { rhEpisRouter } from "./rhEpis";
import { rhFeriasRouter } from "./rhFerias";
import { rhExperienciaRouter } from "./rhExperiencia";
import { rhRescisoesRouter } from "./rhRescisoes";
import { comprasPneusRouter } from "./comprasPneus";

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

const horarioJornadaSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    const horario = String(value).trim();
    return horario === "" ? null : horario;
  },
  z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horário inválido")
    .nullable()
    .optional()
);

const duracaoAlmocoSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return null;
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : value;
  },
  z
    .number()
    .int("Duração do almoço inválida")
    .min(15, "O intervalo deve ter pelo menos 15 minutos")
    .max(360, "O intervalo não pode ultrapassar 6 horas")
    .nullable()
    .optional()
);




const rhPontoPeriodoSchema = z.enum([
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
]);

const rhPontoBatidaPdfSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):([0-5]\d)|FALTA)$/)
  .nullable()
  .optional();

const rhPontoRegistroPdfSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nomePdf: z.string().trim().min(1).max(255),
  entrada1: rhPontoBatidaPdfSchema,
  saida1: rhPontoBatidaPdfSchema,
  entrada2: rhPontoBatidaPdfSchema,
  saida2: rhPontoBatidaPdfSchema,
});

function assertAcessoRhPonto(
  ctx: any,
  lojaId: number,
  modo: "operacional" | "consulta"
) {
  const role = String(ctx.user?.role || "");
  const usuarioLojaId = Number(ctx.user?.lojaId || 0);

  const adminOuGestor = role === "admin" || role === "gestor";
  const rh = role === "rh";
  const caixaLider = rh && usuarioLojaId > 0;
  const liderRh = rh && usuarioLojaId <= 0;

  if (modo === "consulta") {
    if (!liderRh && !adminOuGestor) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Histórico disponível somente para a Líder de RH.",
      });
    }

    return;
  }

  if (caixaLider) {
    if (usuarioLojaId !== Number(lojaId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "A Caixa Líder só pode conferir o ponto da própria loja.",
      });
    }

    return;
  }

  if (!adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente Caixa Líder, Admin ou Gestor podem realizar a conferência.",
    });
  }
}


function assertAcessoRhPontoPendencia(ctx: any, lojaId: number) {
  const role = String(ctx.user?.role || "");
  const usuarioLojaId = Number(ctx.user?.lojaId || 0);
  const adminOuGestor = role === "admin" || role === "gestor";
  const rh = role === "rh";
  const caixaLider = rh && usuarioLojaId > 0;
  const liderRh = rh && usuarioLojaId <= 0;

  if (adminOuGestor || liderRh) return;
  if (caixaLider && usuarioLojaId === Number(lojaId)) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Usuário sem acesso a esta pendência de ponto.",
  });
}

function nomeArquivoSeguroRhPonto(nome: string) {
  const limpo = String(nome || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);
  return limpo || "documento";
}


const rhCaixaContagemSchema = z.object({
  cedula200: z.number().int().min(0).max(100000),
  cedula100: z.number().int().min(0).max(100000),
  cedula50: z.number().int().min(0).max(100000),
  cedula20: z.number().int().min(0).max(100000),
  cedula10: z.number().int().min(0).max(100000),
  cedula5: z.number().int().min(0).max(100000),
  cedula2: z.number().int().min(0).max(100000),
  moeda1: z.number().int().min(0).max(100000),
  moeda050: z.number().int().min(0).max(100000),
  moeda025: z.number().int().min(0).max(100000),
  moeda010: z.number().int().min(0).max(100000),
  moeda005: z.number().int().min(0).max(100000),
  moeda001: z.number().int().min(0).max(100000),
});

function assertAcessoRhCaixa(
  ctx: any,
  lojaId: number,
  modo: "operacional" | "consulta"
) {
  const role = String(ctx.user?.role || "");
  const usuarioLojaId = Number(ctx.user?.lojaId || 0);
  const adminOuGestor = role === "admin" || role === "gestor";
  const caixaLider = role === "rh" && usuarioLojaId > 0;
  const liderRh = role === "rh" && usuarioLojaId <= 0;

  if (modo === "consulta") {
    if (!liderRh && !adminOuGestor) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Histórico de caixa disponível somente para a Líder de RH, Admin ou Gestor.",
      });
    }
    return;
  }

  if (caixaLider) {
    if (usuarioLojaId !== Number(lojaId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "A Caixa Líder só pode fechar o caixa da própria loja.",
      });
    }
    return;
  }

  if (!adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente Caixa Líder, Admin ou Gestor podem realizar o fechamento de caixa.",
    });
  }
}

function assertAcessoRhCaixaArquivo(ctx: any, lojaId: number) {
  const role = String(ctx.user?.role || "");
  const usuarioLojaId = Number(ctx.user?.lojaId || 0);
  const adminOuGestor = role === "admin" || role === "gestor";
  const liderRh = role === "rh" && usuarioLojaId <= 0;
  const caixaLider = role === "rh" && usuarioLojaId > 0;

  if (adminOuGestor || liderRh) return;
  if (caixaLider && usuarioLojaId === Number(lojaId)) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Usuário sem acesso a este relatório de caixa.",
  });
}

function nomeArquivoSeguroRhCaixa(nome: string) {
  const limpo = String(nome || "relatorio.xlsx")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-120);
  return limpo || "relatorio.xlsx";
}

function dataBrParaIsoRhCaixa(valor: string) {
  const match = String(valor || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error("Data inválida no relatório de caixa");
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizarRotuloRhCaixa(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numeroRhCaixa(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (valor === null || valor === undefined) return null;

  let texto = String(valor).trim();
  if (!texto) return null;
  texto = texto.replace(/R\$/gi, "").replace(/\s+/g, "");

  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(texto) || /^-?\d+,\d+$/.test(texto)) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else {
    texto = texto.replace(/[^0-9.-]/g, "");
  }

  if (!texto || texto === "-" || texto === ".") return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function bufferRhCaixaBase64(base64: string) {
  const limpo = String(base64 || "").includes(",")
    ? String(base64).split(",").pop() || ""
    : String(base64 || "");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(limpo, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo do caixa inválido." });
  }

  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O relatório de caixa deve ter no máximo 5 MB.",
    });
  }

  return buffer;
}

function parsearRelatorioRhCaixa(buffer: Buffer) {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível abrir o arquivo Excel. Exporte novamente o relatório em .xlsx.",
    });
  }

  const linhas: any[][] = [];
  for (const nomeAba of workbook.SheetNames) {
    const aba = workbook.Sheets[nomeAba];
    const dados = XLSX.utils.sheet_to_json<any[]>(aba, {
      header: 1,
      raw: true,
      defval: null,
    });
    linhas.push(...dados);
  }

  if (!linhas.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O relatório está vazio." });
  }

  let conta = "";
  let dataInicio = "";
  let dataFim = "";

  for (const linha of linhas) {
    for (const celula of linha || []) {
      const texto = String(celula ?? "").trim();
      if (!texto) continue;

      if (!conta && /EXTRATO\s+CONTA\s*:/i.test(texto)) {
        conta = texto.split(":").slice(1).join(":").trim();
      }

      if (!dataInicio) {
        const periodo = texto.match(
          /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/
        );
        if (periodo) {
          dataInicio = dataBrParaIsoRhCaixa(periodo[1]);
          dataFim = dataBrParaIsoRhCaixa(periodo[2]);
        }
      }
    }
  }

  if (!conta || !normalizarRotuloRhCaixa(conta).includes("CAIXA")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O arquivo não foi reconhecido como EXTRATO CONTA: CAIXA.",
    });
  }

  if (!dataInicio || !dataFim) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível identificar a data do relatório.",
    });
  }

  if (dataInicio !== dataFim) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Para o fechamento diário, exporte o relatório de apenas um dia.",
    });
  }

  const valoresDoRotulo = (rotulo: string) => {
    const alvo = normalizarRotuloRhCaixa(rotulo);
    const valores: number[] = [];

    for (const linha of linhas) {
      for (let coluna = 0; coluna < (linha || []).length; coluna += 1) {
        if (normalizarRotuloRhCaixa(linha[coluna]) !== alvo) continue;

        for (let seguinte = coluna + 1; seguinte < linha.length; seguinte += 1) {
          const numero = numeroRhCaixa(linha[seguinte]);
          if (numero !== null) {
            valores.push(numero);
            break;
          }
        }
      }
    }

    return valores;
  };

  const valorUnico = (rotulo: string) => {
    const valores = valoresDoRotulo(rotulo);
    if (!valores.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Não foi possível localizar ${rotulo} no relatório.`,
      });
    }

    const referencia = valores[valores.length - 1];
    const divergente = valores.some(
      (valor) => Math.abs(Math.round(valor * 100) - Math.round(referencia * 100)) > 1
    );
    if (divergente) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `O relatório possui valores divergentes para ${rotulo}.`,
      });
    }

    return referencia;
  };

  const saldoInicial = valorUnico("SALDO INICIAL");
  const totalCreditos = valorUnico("TOTAL CREDITOS");
  const totalDebitos = valorUnico("TOTAL DEBITOS");
  const saldoFinal = valorUnico("SALDO FINAL");

  const calculadoCentavos = Math.round(
    (saldoInicial + totalCreditos + totalDebitos) * 100
  );
  const saldoFinalCentavos = Math.round(saldoFinal * 100);
  if (Math.abs(calculadoCentavos - saldoFinalCentavos) > 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Os totais do relatório não fecham com o Saldo Final. Gere o arquivo novamente.",
    });
  }

  let totalMovimentos = 0;
  for (const linha of linhas) {
    const primeira = String(linha?.[0] ?? "").trim();
    const tipo = String(linha?.[2] ?? "").trim().toUpperCase();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(primeira) && tipo && tipo !== "10") {
      totalMovimentos += 1;
    }
  }

  return {
    conta: conta || "CAIXA",
    dataReferencia: dataInicio,
    saldoInicial: Number(saldoInicial.toFixed(2)),
    totalCreditos: Number(totalCreditos.toFixed(2)),
    totalDebitos: Number(totalDebitos.toFixed(2)),
    saldoFinal: Number(saldoFinal.toFixed(2)),
    totalMovimentos,
    arquivoHash: createHash("sha256").update(buffer).digest("hex"),
  };
}

export const appRouter = router({
  system: systemRouter,
  rhDocumentos: rhDocumentosRouter,
  rhEpis: rhEpisRouter,
  rhFerias: rhFeriasRouter,
  rhExperiencia: rhExperienciaRouter,
  rhRescisoes: rhRescisoesRouter,

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

          ctx.res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 365 * 24 * 60 * 60 * 1000,
          });

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
      ctx.res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
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
          cargoConfianca: z.boolean().optional(),
          horarioEntrada1: horarioJornadaSchema,
          duracaoAlmocoMinutos: duracaoAlmocoSchema,
          horarioSaida1: horarioJornadaSchema,
          horarioEntrada2: horarioJornadaSchema,
          horarioSaida2: horarioJornadaSchema,
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
          cargoConfianca: Boolean(input.cargoConfianca),
          horarioEntrada1: input.horarioEntrada1 ?? null,
          duracaoAlmocoMinutos: input.duracaoAlmocoMinutos ?? null,
          horarioSaida1: input.horarioSaida1 ?? null,
          horarioEntrada2: input.horarioEntrada2 ?? null,
          horarioSaida2: input.horarioSaida2 ?? null,
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

    trocasByFuncionario: protectedProcedure
      .input(
        z.object({
          funcionarioId: z.number(),
          lojaId: z.number(),
        })
      )
      .query(({ input }) =>
        getTrocasFuncaoByFuncionario(input.funcionarioId, input.lojaId)
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

    corrigirDataTroca: protectedProcedure
      .input(
        z.object({
          trocaFuncaoId: z.number(),
          funcionarioId: z.number(),
          lojaId: z.number(),
          novaData: z.coerce.date(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return corrigirDataTrocaFuncao({
          trocaFuncaoId: input.trocaFuncaoId,
          funcionarioId: input.funcionarioId,
          lojaId: input.lojaId,
          novaData: input.novaData,
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
          cargoConfianca: z.boolean().optional(),
          horarioEntrada1: horarioJornadaSchema,
          duracaoAlmocoMinutos: duracaoAlmocoSchema,
          horarioSaida1: horarioJornadaSchema,
          horarioEntrada2: horarioJornadaSchema,
          horarioSaida2: horarioJornadaSchema,
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
          cargoConfianca: Boolean(input.cargoConfianca),
          horarioEntrada1: input.horarioEntrada1 ?? null,
          duracaoAlmocoMinutos: input.duracaoAlmocoMinutos ?? null,
          horarioSaida1: input.horarioSaida1 ?? null,
          horarioEntrada2: input.horarioEntrada2 ?? null,
          horarioSaida2: input.horarioSaida2 ?? null,
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

    getSem5Status: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number().min(1).max(12),
        })
      )
      .query(({ input }) =>
        getFolhaSem5Status(input.lojaId, input.ano, input.mes)
      ),

    ativarSem5: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number().min(1).max(12),
        })
      )
      .mutation(({ input, ctx }) =>
        ativarFolhaSem5({
          ...input,
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        })
      ),

    desativarSem5: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          ano: z.number(),
          mes: z.number().min(1).max(12),
        })
      )
      .mutation(({ input, ctx }) =>
        desativarFolhaSem5({
          ...input,
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        })
      ),

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

    getRepassesFranklyn: protectedProcedure
      .input(
        z.object({
          ano: z.number(),
          mes: z.number().min(1).max(12),
        })
      )
      .query(({ input }) => getRepassesFranklynByAnoMes(input.ano, input.mes)),

    setRepasseFranklynPago: protectedProcedure
      .input(
        z.object({
          valeId: z.number(),
          pago: z.boolean(),
        })
      )
      .mutation(({ input, ctx }) =>
        setRepasseFranklynPago({
          ...input,
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        })
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
          dataVale: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          repasseBeneficiario: z.enum(["Franklyn"]).nullable().optional(),
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


  rhPonto: router({
    dia: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .query(async ({ input, ctx }) => {
        const role = String(ctx.user.role || "");
        const usuarioLojaId = Number(ctx.user.lojaId || 0);

        if (role === "rh" && usuarioLojaId > 0 && usuarioLojaId !== input.lojaId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A Caixa Líder só pode visualizar o dia da própria loja.",
          });
        }

        if (
          role !== "rh" &&
          role !== "admin" &&
          role !== "gestor"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Usuário sem acesso ao RH.",
          });
        }

        return getRhPontoDia(input.lojaId, input.dataReferencia);
      }),

    analisarImportacao: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          periodo: rhPontoPeriodoSchema,
          registros: z.array(rhPontoRegistroPdfSchema).min(1).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPonto(ctx, input.lojaId, "operacional");

        return analisarRhPontoImportacao({
          lojaId: input.lojaId,
          dataReferencia: input.dataReferencia,
          periodo: input.periodo,
          registros: input.registros,
        });
      }),

    salvarImportacao: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          periodo: rhPontoPeriodoSchema,
          arquivoNome: z.string().trim().min(1).max(255),
          arquivoHash: z.string().max(128).nullable().optional(),
          observacao: z.string().max(1000).nullable().optional(),
          registros: z.array(rhPontoRegistroPdfSchema).min(1).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPonto(ctx, input.lojaId, "operacional");

        return salvarRhPontoImportacao({
          lojaId: input.lojaId,
          dataReferencia: input.dataReferencia,
          periodo: input.periodo,
          arquivoNome: input.arquivoNome,
          arquivoHash: input.arquivoHash ?? null,
          observacao: input.observacao ?? null,
          registros: input.registros,
          usuarioId: Number(ctx.user.id),
          usuarioNome:
            ctx.user.name ||
            ctx.user.email ||
            `Usuário ${ctx.user.id}`,
        });
      }),

    salvarConferencia: protectedProcedure
      .input(
        z.object({
          lojaId: z.number(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          periodo: rhPontoPeriodoSchema,
          observacao: z.string().max(1000).nullable().optional(),
          ocorrencias: z.array(
            z.object({
              funcionarioId: z.number(),
              horarioBatida: z
                .string()
                .regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
              observacao: z.string().max(1000).nullable().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPonto(ctx, input.lojaId, "operacional");

        return salvarRhPontoConferencia({
          lojaId: input.lojaId,
          dataReferencia: input.dataReferencia,
          periodo: input.periodo,
          observacao: input.observacao ?? null,
          ocorrencias: input.ocorrencias,
          usuarioId: Number(ctx.user.id),
          usuarioNome:
            ctx.user.name ||
            ctx.user.email ||
            `Usuário ${ctx.user.id}`,
        });
      }),


    pendencias: protectedProcedure
      .input(
        z.object({
          lojaId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const role = String(ctx.user.role || "");
        const usuarioLojaId = Number(ctx.user.lojaId || 0);
        const adminOuGestor = role === "admin" || role === "gestor";
        const liderRh = role === "rh" && usuarioLojaId <= 0;
        const caixaLider = role === "rh" && usuarioLojaId > 0;

        if (!adminOuGestor && !liderRh && !caixaLider) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao RH." });
        }

        const lojaId = caixaLider
          ? usuarioLojaId
          : input.lojaId === null || input.lojaId === undefined
          ? null
          : Number(input.lojaId);

        const pendencias = await getRhPontoPendencias({ lojaId });

        // Caixa Lider nao deve receber pendencias de cadastro/jornada.
        // Essas pendencias pertencem somente a Lider de RH/Admin/Gestor.
        if (caixaLider) {
          return (pendencias || []).filter(
            (pendencia: any) => String(pendencia.fase || "") !== "cadastro"
          );
        }

        return pendencias;
      }),

    vincularNomeFuncionario: protectedProcedure
      .input(
        z.object({
          lojaId: z.number().int().positive(),
          nomePdf: z.string().trim().min(1).max(255),
          funcionarioId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPontoPendencia(ctx, input.lojaId);

        return vincularRhPontoNomeFuncionario({
          lojaId: input.lojaId,
          nomePdf: input.nomePdf,
          funcionarioId: input.funcionarioId,
          usuarioId: Number(ctx.user.id),
          usuarioNome:
            ctx.user.name ||
            ctx.user.email ||
            `Usuário ${ctx.user.id}`,
        });
      }),

    criarTratativa: protectedProcedure
      .input(
        z.object({
          ocorrenciaId: z.number().int().positive(),
          lojaId: z.number().int().positive(),
          tipo: z.enum(["advertencia", "atestado", "justificativa", "falta"]),
          observacao: z.string().trim().max(1500).nullable().optional(),
          diasAtestado: z.number().int().min(1).max(60).nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPontoPendencia(ctx, input.lojaId);

        return criarRhPontoTratativa({
          ocorrenciaId: input.ocorrenciaId,
          lojaId: input.lojaId,
          tipo: input.tipo,
          observacao: input.observacao ?? null,
          diasAtestado: input.diasAtestado ?? null,
          usuarioId: Number(ctx.user.id),
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        });
      }),

    anexarDocumentoTratativa: protectedProcedure
      .input(
        z.object({
          tratativaId: z.number().int().positive(),
          lojaId: z.number().int().positive(),
          arquivoNome: z.string().trim().min(1).max(255),
          arquivoMime: z.string().trim().min(1).max(120),
          arquivoTamanho: z.number().int().positive().max(6 * 1024 * 1024),
          arquivoBase64: z.string().min(1).max(9_000_000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPontoPendencia(ctx, input.lojaId);

        const permitidos = new Set([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ]);
        if (!permitidos.has(input.arquivoMime)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.",
          });
        }

        let buffer: Buffer;
        try {
          buffer = Buffer.from(input.arquivoBase64, "base64");
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido." });
        }

        if (!buffer.length || buffer.length > 6 * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O documento deve ter no máximo 6 MB.",
          });
        }

        const nomeSeguro = nomeArquivoSeguroRhPonto(input.arquivoNome);
        const chave = `rh/ponto/${input.lojaId}/tratativa-${input.tratativaId}/${Date.now()}-${nomeSeguro}`;
        const salvo = await storagePut(chave, buffer, input.arquivoMime);

        await salvarDocumentoRhPontoTratativa({
          tratativaId: input.tratativaId,
          lojaId: input.lojaId,
          documentoKey: salvo.key,
          documentoNome: input.arquivoNome,
          documentoMime: input.arquivoMime,
          documentoTamanho: buffer.length,
          usuarioId: Number(ctx.user.id),
          usuarioNome: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
        });

        return { success: true };
      }),

    excluirJustificativa: protectedProcedure
      .input(
        z.object({
          tratativaId: z.number().int().positive(),
          motivo: z.string().trim().min(5).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const role = String(ctx.user.role || "");
        const usuarioLojaId = Number(ctx.user.lojaId || 0);
        const liderRh = role === "rh" && usuarioLojaId <= 0;
        const adminOuGestor = role === "admin" || role === "gestor";

        if (!liderRh && !adminOuGestor) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Somente a Lider de RH pode excluir justificativas.",
          });
        }

        return excluirRhPontoJustificativa({
          tratativaId: input.tratativaId,
          motivo: input.motivo,
          usuarioId: Number(ctx.user.id),
          usuarioNome:
            ctx.user.name ||
            ctx.user.email ||
            `Usuario ${ctx.user.id}`,
        });
      }),

    concluirTratativa: protectedProcedure
      .input(
        z.object({
          tratativaId: z.number().int().positive(),
          lojaId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhPontoPendencia(ctx, input.lojaId);

        return concluirRhPontoTratativa({
          tratativaId: input.tratativaId,
          lojaId: input.lojaId,
        });
      }),

    documentoTratativaUrl: protectedProcedure
      .input(
        z.object({
          tratativaId: z.number().int().positive(),
          lojaId: z.number().int().positive(),
        })
      )
      .query(async ({ input, ctx }) => {
        assertAcessoRhPontoPendencia(ctx, input.lojaId);
        const documento = await getRhPontoTratativaDocumento(
          input.tratativaId,
          input.lojaId
        );
        if (!documento?.documentoKey) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Documento não anexado." });
        }

        const arquivo = await storageGet(documento.documentoKey);
        return {
          url: arquivo.url,
          nome: documento.documentoNome || "documento",
          mime: documento.documentoMime || "application/octet-stream",
        };
      }),

    historico: protectedProcedure
      .input(
        z.object({
          dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          lojaId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        assertAcessoRhPonto(
          ctx,
          Number(input.lojaId || 0),
          "consulta"
        );

        return getRhPontoHistorico({
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          lojaId: input.lojaId ?? null,
        });
      }),
  }),

  rhCaixa: router({
    dia: protectedProcedure
      .input(
        z.object({
          lojaId: z.number().int().positive(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .query(async ({ input, ctx }) => {
        assertAcessoRhCaixa(ctx, input.lojaId, "operacional");
        return getRhCaixaDia(input.lojaId, input.dataReferencia);
      }),

    analisarRelatorio: protectedProcedure
      .input(
        z.object({
          lojaId: z.number().int().positive(),
          arquivoNome: z.string().trim().min(1).max(255),
          arquivoMime: z.string().trim().max(150).optional().default(""),
          arquivoBase64: z.string().min(1).max(7_500_000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhCaixa(ctx, input.lojaId, "operacional");

        if (!/\.xlsx$/i.test(input.arquivoNome)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Envie o relatório em formato .xlsx.",
          });
        }

        const buffer = bufferRhCaixaBase64(input.arquivoBase64);
        return parsearRelatorioRhCaixa(buffer);
      }),

    salvarFechamento: protectedProcedure
      .input(
        z.object({
          lojaId: z.number().int().positive(),
          dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          arquivoNome: z.string().trim().min(1).max(255),
          arquivoMime: z.string().trim().max(150).optional().default(""),
          arquivoBase64: z.string().min(1).max(7_500_000),
          contagem: rhCaixaContagemSchema,
          justificativaTipo: z.string().trim().max(60).nullable().optional(),
          justificativaObservacao: z.string().trim().max(2000).nullable().optional(),
          motivoNaoDeposito: z.string().trim().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertAcessoRhCaixa(ctx, input.lojaId, "operacional");

        if (!/\.xlsx$/i.test(input.arquivoNome)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Envie o relatório em formato .xlsx.",
          });
        }

        const buffer = bufferRhCaixaBase64(input.arquivoBase64);
        const relatorio = parsearRelatorioRhCaixa(buffer);

        if (relatorio.dataReferencia !== input.dataReferencia) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A data do relatório é diferente da data selecionada para o fechamento.",
          });
        }

        const mime =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        return salvarRhCaixaFechamento({
          lojaId: input.lojaId,
          dataReferencia: input.dataReferencia,
          contaNome: relatorio.conta,
          relatorioNome: input.arquivoNome,
          relatorioHash: relatorio.arquivoHash,
          relatorioKey: null,
          relatorioBase64: input.arquivoBase64,
          relatorioMime: mime,
          relatorioTamanho: buffer.length,
          relatorioTotalMovimentos: relatorio.totalMovimentos,
          saldoInicial: relatorio.saldoInicial,
          totalCreditos: relatorio.totalCreditos,
          totalDebitos: relatorio.totalDebitos,
          saldoFinal: relatorio.saldoFinal,
          contagem: input.contagem,
          justificativaTipo: input.justificativaTipo ?? null,
          justificativaObservacao: input.justificativaObservacao ?? null,
          motivoNaoDeposito: input.motivoNaoDeposito ?? null,
          usuarioId: Number(ctx.user.id),
          usuarioNome:
            ctx.user.name ||
            ctx.user.email ||
            `Usuário ${ctx.user.id}`,
        });
      }),

    historico: protectedProcedure
      .input(
        z.object({
          dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          lojaId: z.number().int().positive().nullable().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        assertAcessoRhCaixa(ctx, Number(input.lojaId || 0), "consulta");
        return getRhCaixaHistorico({
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          lojaId: input.lojaId ?? null,
        });
      }),

    relatorioUrl: protectedProcedure
      .input(
        z.object({
          fechamentoId: z.number().int().positive(),
          lojaId: z.number().int().positive(),
        })
      )
      .query(async ({ input, ctx }) => {
        assertAcessoRhCaixaArquivo(ctx, input.lojaId);

        const fechamento = await getRhCaixaRelatorioArquivo(
          input.fechamentoId,
          input.lojaId
        );
        if (fechamento?.relatorioBase64) {
          return {
            url: null as string | null,
            base64: String(fechamento.relatorioBase64),
            nome: fechamento.relatorioNome || "relatorio-caixa.xlsx",
            mime:
              fechamento.relatorioMime ||
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
        }

        if (fechamento?.relatorioKey) {
          const arquivo = await storageGet(fechamento.relatorioKey);
          return {
            url: arquivo.url,
            base64: null as string | null,
            nome: fechamento.relatorioNome || "relatorio-caixa.xlsx",
            mime:
              fechamento.relatorioMime ||
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Relatório original não encontrado.",
        });
      }),
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
    pneus: comprasPneusRouter,
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