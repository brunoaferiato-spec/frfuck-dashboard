import React from "react";

function App() {
  return React.createElement(
    "div",
    {
      style: {
        background: "#0f172a",
        color: "#ffffff",
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "Arial, sans-serif"
      }
    },
    React.createElement("h1", null, "FRFUCK Dashboard"),
    React.createElement("p", null, "Aplicação carregada com sucesso.")
  );
}

export default App;
