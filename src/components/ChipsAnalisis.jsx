import { chipsDeAnalisis } from "../lib/estudioMercado";
import "./ChipsAnalisis.css";

// ============================================================
// Las preguntas del curso sobre un anuncio de la competencia, en chips (curso de campañas, entrega 8)
//
// Qué problema ataca, a qué nivel de consciencia le habla, qué tipo de arte es, qué sesgo usa, qué oferta da y qué
// llamado hace (`chipsDeAnalisis`, src/lib/estudioMercado.js). Lo usan las referencias del estudio de mercado y la
// Biblioteca al analizar. Un análisis de antes, sin esas preguntas, enseña sólo lo que trae (o nada).
// ============================================================

export default function ChipsAnalisis({ analisis, etiqueta = "Lo que hace este anuncio" }) {
  const chips = chipsDeAnalisis(analisis);
  if (!chips.length) return null;
  return (
    <ul className="chips-analisis" aria-label={etiqueta}>
      {chips.map((c) => (
        <li key={c.clave} data-clave={c.clave}>
          <span className="chips-analisis-etiqueta">{c.etiqueta}:</span> {c.valor}
        </li>
      ))}
    </ul>
  );
}
