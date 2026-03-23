import React from "react";
import { Route, Switch } from "wouter";

import AnaliseFuncionario from "./AnaliseFuncionario";
import FolhaPagamento from "./FolhaPagamento";
import GestaoFuncionarios from "./GestaoFuncionarios";
import GestaoMetas from "./GestaoMetas";

function App() {
  return (
    <Switch>
      <Route path="/" component={GestaoFuncionarios} />
      <Route path="/funcionarios" component={GestaoFuncionarios} />
      <Route path="/folha" component={FolhaPagamento} />
      <Route path="/metas" component={GestaoMetas} />
      <Route path="/analise" component={AnaliseFuncionario} />
    </Switch>
  );
}

export default App;
