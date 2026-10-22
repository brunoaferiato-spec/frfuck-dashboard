import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// O perfil Compras só enxerga o módulo de Compras (pneus, peças e insumos),
// além do login e da lista de lojas. Folha, RH, metas e demais áreas ficam bloqueadas.
const ROTAS_PERFIL_COMPRAS = [
  "compras.pneus.",
  "compras.pecas.",
  "compras.amortecedores.",
  "compras.insumosEstoque.",
  "compras.insumosLoja.",
  "compras.manutencao.",
];
// Do auth, só entrar/sair/sessão: cadastro de usuários fica fora do perfil Compras.
const ROTAS_EXATAS_PERFIL_COMPRAS = new Set(["lojas.list", "auth.me", "auth.login", "auth.logout"]);

function perfilComprasPodeAcessar(path: string) {
  return ROTAS_EXATAS_PERFIL_COMPRAS.has(path) || ROTAS_PERFIL_COMPRAS.some(prefixo => path.startsWith(prefixo));
}

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (String(ctx.user.role || "") === "compras" && !perfilComprasPodeAcessar(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O perfil Compras tem acesso somente ao módulo de Compras." });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
