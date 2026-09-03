import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

const RUNTIME_USER_KEY = "manus-runtime-user-info";
const EXPLICIT_LOGOUT_KEY = "frfuck-explicit-logout";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  // A sessão oficial é sempre o cookie/JWT validado pelo backend.
  // Não usamos mais localStorage como fallback de autenticação porque ele
  // conseguia "ressuscitar" o usuário depois do logout.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  const explicitLogout =
    typeof window !== "undefined" &&
    localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "1";

  const logout = useCallback(async () => {
    // Primeiro força o navegador a considerar o usuário deslogado.
    // Assim, mesmo se existir um cookie legado que o backend não consiga
    // apagar naquele instante, a interface não volta sozinha ao Dashboard.
    try {
      localStorage.setItem(EXPLICIT_LOGOUT_KEY, "1");
      localStorage.removeItem(RUNTIME_USER_KEY);
    } catch {
      // Ignorar erro de localStorage.
    }

    // Atualiza imediatamente todas as instâncias de useAuth que usam o
    // mesmo cache tRPC.
    utils.auth.me.setData(undefined, null);

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        !(error instanceof TRPCClientError) ||
        error.data?.code !== "UNAUTHORIZED"
      ) {
        console.warn("Logout failed:", error);
      }
    }
  }, [logoutMutation, utils]);

  const userData = explicitLogout ? null : meQuery.data ?? null;

  // Mantém apenas uma cópia informativa do usuário atual. Ela não é mais
  // usada para autenticar nem como fallback de sessão.
  useEffect(() => {
    try {
      if (userData) {
        localStorage.setItem(RUNTIME_USER_KEY, JSON.stringify(userData));
      } else {
        localStorage.removeItem(RUNTIME_USER_KEY);
      }
    } catch {
      // Ignorar erro de localStorage.
    }
  }, [userData]);

  const state = useMemo(
    () => ({
      user: userData,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(userData),
    }),
    [
      userData,
      meQuery.error,
      meQuery.isLoading,
      logoutMutation.error,
      logoutMutation.isPending,
    ]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    if (!meQuery.error) {
      window.location.href = redirectPath;
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
    meQuery.error,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
