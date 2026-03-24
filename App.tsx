import { useState } from "react";

import FolhaPagamento from "./FolhaPagamento";
import GestaoFuncionarios from "./GestaoFuncionarios";
import GestaoMetas from "./GestaoMetas";
import AnaliseFuncionario from "./AnaliseFuncionario";

function App() {
  const [page, setPage] = useState("folha");

  return (
    <div style={{ padding: 20, background: "#0f172a", minHeight: "100vh", color: "#fff" }}>
      <h1>FRFUCK Dashboard</h1>

      {/* Menu simples */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setPage("folha")}>Folha</button>
        <button onClick={() => setPage("funcionarios")}>Funcionários</button>
        <button onClick={() => setPage("metas")}>Metas</button>
        <button onClick={() => setPage("analise")}>Análise</button>
      </div>

      {/* Renderização das telas reais */}
      {page === "folha" && <FolhaPagamento />}
      {page === "funcionarios" && <GestaoFuncionarios />}
      {page === "metas" && <GestaoMetas />}
      {page === "analise" && <AnaliseFuncionario />}
    </div>
  );
}

export default App;
