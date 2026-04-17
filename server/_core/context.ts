import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { verifyAuthToken } from "../auth";
import { COOKIE_NAME } from "@shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: {
    id: number;
    name: string | null;
    email: string | null;
    role: string;
    lojaId: number | null;
    isActive: boolean;
    openId?: string | null;
  } | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const authHeader = opts.req.headers.authorization;

  let token: string | null = null;

  // 🔥 1. tenta pegar do header
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "").trim();
  } 
  // 🔥 2. tenta pegar do cookie
  else {
    const cookieHeader = opts.req.headers.cookie ?? "";

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const [key, ...rest] = c.split("=");
          return [key, decodeURIComponent(rest.join("="))];
        })
    );

    token = cookies[COOKIE_NAME] ?? null;
  }

  // 🔥 3. valida token
  if (token) {
    try {
      const user = verifyAuthToken(token);

      return {
        req: opts.req,
        res: opts.res,
        user,
      };
    } catch (err) {
      console.error("❌ Token inválido:", err);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}