import FolhaPagamento from "./FolhaPagamento";
import GestaoFuncionarios from "./GestaoFuncionarios";
import GestaoMetas from "./GestaoMetas";
import AnaliseFuncionario from "./AnaliseFuncionario";

function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";

  if (path === "/folha-pagamento") {
    return <FolhaPagamento />;
  }

  if (path === "/funcionarios") {
    return <GestaoFuncionarios />;
  }

  if (path === "/metas") {
    return <GestaoMetas />;
  }

  if (path === "/analisar-funcionario") {
    return <AnaliseFuncionario />;
  }

  return <FolhaPagamento />;
}

export default App;
