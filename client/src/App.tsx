import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import type { ReactNode } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";

import Home from "./pages/Home";
import FolhaPagamento from "./pages/FolhaPagamento";
import FolhaPagamentoMulti from "./pages/FolhaPagamentoMulti";
import GestaoFuncionarios from "./pages/GestaoFuncionarios";
import GestaoMetas from "./pages/GestaoMetas";
import AnaliseFuncionario from "./pages/AnaliseFuncionario";
import Usuarios from "./pages/Usuarios";
import RHMeuDia from "./pages/RHMeuDia";
import RHGestao from "./pages/RHGestao";
import RHCaixa from "./pages/RHCaixa";
import RHDocumentos from "./pages/RHDocumentos";
import RHEpis from "./pages/RHEpis";

function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-[#F2D675]">
      Carregando acesso...
    </div>
  );
}

function AcessoNegado({
  titulo = "Acesso restrito",
  descricao,
  destino = "/",
}: {
  titulo?: string;
  descricao: string;
  destino?: string;
}) {
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
      <div className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/20 bg-[#0b0b0b] p-7 text-center">
        <div className="text-xl font-black text-[#F2D675]">{titulo}</div>
        <p className="mt-3 text-sm leading-6 text-gray-400">{descricao}</p>
        <button
          type="button"
          onClick={() => navigate(destino)}
          className="mt-6 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-5 py-3 text-sm font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/15"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}

function perfilAtual(user: any) {
  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);

  return {
    role,
    lojaId,
    caixaLider: role === "rh" && lojaId > 0,
    liderRh: role === "rh" && lojaId <= 0,
    adminOuGestor: role === "admin" || role === "gestor",
  };
}

function RotaSemCaixaLider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Home />;

  const perfil = perfilAtual(user);

  if (perfil.caixaLider) {
    return (
      <AcessoNegado
        descricao="O perfil Caixa Líder possui acesso somente à área operacional Meu Dia da própria loja."
        destino="/rh/meu-dia"
      />
    );
  }

  return <>{children}</>;
}

function RotaUsuarios({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Home />;

  const perfil = perfilAtual(user);

  if (!perfil.adminOuGestor) {
    return (
      <AcessoNegado
        descricao="Somente Admin ou Gestor podem administrar usuários e permissões do sistema."
        destino={perfil.liderRh ? "/rh/gestao" : "/"}
      />
    );
  }

  return <>{children}</>;
}

function RotaMeuDia({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Home />;

  const perfil = perfilAtual(user);

  if (!perfil.caixaLider && !perfil.adminOuGestor) {
    return (
      <AcessoNegado
        descricao="Esta é a área operacional das Caixas Líderes. A Líder de RH possui uma área gerencial separada."
        destino={perfil.liderRh ? "/rh/gestao" : "/"}
      />
    );
  }

  return <>{children}</>;
}

function RotaCaixaRh({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Home />;

  const perfil = perfilAtual(user);

  if (!perfil.caixaLider && !perfil.liderRh && !perfil.adminOuGestor) {
    return (
      <AcessoNegado
        descricao="O Fechamento de Caixa é exclusivo da Caixa Líder, Líder de RH, Admin e Gestor."
        destino="/"
      />
    );
  }

  return <>{children}</>;
}

function RotaGestaoRh({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Home />;

  const perfil = perfilAtual(user);

  if (!perfil.liderRh && !perfil.adminOuGestor) {
    return (
      <AcessoNegado
        descricao="A visão gerencial do RH é exclusiva da Líder de RH, Admin e Gestor."
        destino={perfil.caixaLider ? "/rh/meu-dia" : "/"}
      />
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />

      <Route path="/rh/meu-dia">
        <RotaMeuDia>
          <RHMeuDia />
        </RotaMeuDia>
      </Route>

      <Route path="/rh/gestao">
        <RotaGestaoRh>
          <RHGestao />
        </RotaGestaoRh>
      </Route>

      <Route path="/rh/caixa">
        <RotaCaixaRh>
          <RHCaixa />
        </RotaCaixaRh>
      </Route>

      <Route path="/rh/documentos">
        <RotaCaixaRh>
          <RHDocumentos />
        </RotaCaixaRh>
      </Route>

      <Route path="/rh/epis">
        <RotaCaixaRh>
          <RHEpis />
        </RotaCaixaRh>
      </Route>

      <Route path="/folha-pagamento">
        <RotaSemCaixaLider>
          <FolhaPagamento />
        </RotaSemCaixaLider>
      </Route>

      <Route path="/folha-multi">
        <RotaSemCaixaLider>
          <FolhaPagamentoMulti />
        </RotaSemCaixaLider>
      </Route>

      <Route path="/funcionarios">
        <RotaSemCaixaLider>
          <GestaoFuncionarios />
        </RotaSemCaixaLider>
      </Route>

      <Route path="/metas">
        <RotaSemCaixaLider>
          <GestaoMetas />
        </RotaSemCaixaLider>
      </Route>

      <Route path="/analise-funcionario">
        <RotaSemCaixaLider>
          <AnaliseFuncionario />
        </RotaSemCaixaLider>
      </Route>

      <Route path="/usuarios">
        <RotaUsuarios>
          <Usuarios />
        </RotaUsuarios>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
