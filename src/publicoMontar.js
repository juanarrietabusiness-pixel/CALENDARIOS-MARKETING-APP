import { StrictMode, Suspense, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import BarreraErrores from "./components/BarreraErrores.jsx";

/**
 * Pinta una página del cliente final (src/publico.js) con lo mínimo: React, los estilos base y una barrera de errores.
 * Sin JSX a propósito: un .jsx que exporta algo que no es un componente da un aviso de oxlint.
 */
export function montar(Pagina) {
  createRoot(document.getElementById("root")).render(
    h(StrictMode, null, h(BarreraErrores, { completa: true }, h(Suspense, { fallback: null }, h(Pagina)))),
  );
}
