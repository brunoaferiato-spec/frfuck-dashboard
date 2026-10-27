import { TRPCError } from "@trpc/server";
import { empresaDaLoja } from "@shared/empresas";

// Funções comuns das telas de estoque (contagem diária, compras x OS e contagem semanal).

export const PERFIL_ESTOQUE = "estoque"; // estoquista de uma loja (users.lojaId)
export const PERFIL_SUPERVISOR_ESTOQUE = "estoque_supervisor";
// Compras x OS marcado como "não teve compra nesse dia" (fica no nome do arquivo).
export const SEM_COMPRA = "SEM COMPRA NO DIA";

// Quem pode o quê: estoquista só a própria loja; supervisor, admin e gestor todas.
export function perfil(ctx: any) {
  const role = String(ctx?.user?.role || "");
  const lojaId = Number(ctx?.user?.lojaId || 0);
  if (role === PERFIL_ESTOQUE) {
    if (!lojaId) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário de estoque está sem loja. Peça para cadastrarem a loja no seu usuário." });
    return { supervisor: false, lojaId };
  }
  if ([PERFIL_SUPERVISOR_ESTOQUE, "admin", "gestor"].includes(role)) return { supervisor: true, lojaId: 0 };
  throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado ao estoque." });
}

export function exigirSupervisor(ctx: any) {
  const p = perfil(ctx);
  if (!p.supervisor) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o supervisor de estoque." });
  return p;
}

export function nomeUsuario(ctx: any) {
  return String(ctx?.user?.name || "Usuário");
}

export function semAcento(v: string) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

export function iso(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
}

// Datas no horário de Brasília (o servidor roda em UTC).
export function dataSP(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function podeVerLoja(p: { supervisor: boolean; lojaId: number }, lojaId: number) {
  if (!p.supervisor && Number(lojaId) !== p.lojaId) throw new TRPCError({ code: "FORBIDDEN", message: "Essa conferência é de outra loja." });
}

// O relatório precisa ser da loja (título "F. JOINVILLE - ...").
export function conferirLojaDoRelatorio(lojaId: number, lojaRelatorio: string) {
  const empresa = empresaDaLoja(lojaId);
  if (!empresa) throw new TRPCError({ code: "BAD_REQUEST", message: "Loja inválida." });
  const lojaPdf = semAcento(lojaRelatorio);
  const daLoja = !lojaPdf || [empresa.loja, empresa.cidade].some((n) => lojaPdf.includes(semAcento(n)) || semAcento(n).includes(lojaPdf));
  if (!daLoja) throw new TRPCError({ code: "BAD_REQUEST", message: `Esse relatório é de ${lojaRelatorio}, não de ${empresa.loja}.` });
}
