import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// IMPORTS DAS SUAS TELAS (ajuste se algum nome estiver diferente)
import AnaliseFuncionario from "./AnaliseFuncionario";
import FolhaPagamento from "./FolhaPagamento";
import GestaoFuncionarios from "./GestaoFuncionarios";
import GestaoMetas from "./GestaoMetas";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<GestaoFuncionarios />} />
        <Route path="/funcionarios" element={<GestaoFuncionarios />} />
        <Route path="/folha" element={<FolhaPagamento />} />
        <Route path="/metas" element={<GestaoMetas />} />
        <Route path="/analise" element={<AnaliseFuncionario />} />
      </Routes>
    </Router>
  );
}

export default App;
