import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import FolhaPagamento from "./pages/FolhaPagamento";
import GestaoFuncionarios from "./pages/GestaoFuncionarios";
import GestaoMetas from "./pages/GestaoMetas";
import AnaliseFuncionario from "./pages/AnaliseFuncionario";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/folha-pagamento"} component={FolhaPagamento} />
      <Route path={"/funcionarios"} component={GestaoFuncionarios} />
      <Route path={"/metas"} component={GestaoMetas} />
      <Route path={"/analise-funcionario"} component={AnaliseFuncionario} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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

export default App;
