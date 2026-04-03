export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Gera a URL de login em runtime, sem depender de rota /app-auth
export const getLoginUrl = () => {
  const oauthPortalUrl =
    import.meta.env.VITE_OAUTH_PORTAL_URL || window.location.origin;
  const appId = import.meta.env.VITE_APP_ID || "frifuck-dashboard-local";
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(oauthPortalUrl);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};