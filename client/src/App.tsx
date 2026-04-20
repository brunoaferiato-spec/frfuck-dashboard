import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

import Home from "./pages/Home";
import FolhaPagamento from "./pages/FolhaPagamento";
import FolhaPagamentoMulti from "./pages/FolhaPagamentoMulti";
import GestaoFuncionarios from "./pages/GestaoFuncionarios";
import GestaoMetas from "./pages/GestaoMetas";
import AnaliseFuncionario from "./pages/AnaliseFuncionario";
import Usuarios from "./pages/Usuarios"; // ✅ IMPORTANTE

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/folha-pagamento" component={FolhaPagamento} />
      <Route path="/folha-multi" component={FolhaPagamentoMulti} />
      <Route path="/funcionarios" component={GestaoFuncionarios} />
      <Route path="/metas" component={GestaoMetas} />
      <Route path="/analise-funcionario" component={AnaliseFuncionario} />

      {/* ✅ ESSA LINHA QUE RESOLVE TUDO */}
      <Route path="/usuarios" component={Usuarios} />

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