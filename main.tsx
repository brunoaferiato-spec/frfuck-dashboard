import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Elemento #root não encontrado');
}

ReactDOM.createRoot(rootElement).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App)
  )
);
