import { useState } from "react";

import FolhaPagamento from "./FolhaPagamento";
import GestaoFuncionarios from "./GestaoFuncionarios";
import GestaoMetas from "./GestaoMetas";
import AnaliseFuncionario from "./AnaliseFuncionario";

export default function App() {
  const [page, setPage] = useState("home");

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "20px" }}>
      {page === "home" && (
        <div>
          <h1 style={{ fontSize: "32px", color: "#fbbf24", marginBottom: "20px" }}>
            FRFUCK Dashboard
          </h1>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={() => setPage("folha")}>Folha de Pagamento</button>
            <button onClick={() => setPage("funcionarios")}>Funcionários</button>
            <button onClick={() => setPage("metas")}>Metas</button>
            <button onClick={() => setPage("analise")}>Análise</button>
          </div>
        </div>
      )}

      {page === "folha" && <FolhaPagamento />}
      {page === "funcionarios" && <GestaoFuncionarios />}
      {page === "metas" && <GestaoMetas />}
      {page === "analise" && <AnaliseFuncionario />}
    </div>
  );
} 
