import "./QueEs.css";
import { GLOSARIO, NOMBRE_TERMINO } from "../../lib/glosarioAnuncios";

/**
 * «¿Qué es…?»: la explicación corta de un término de los anuncios, JUNTO a donde aparece y que se despliega con un
 * toque (un `title` no se ve en el teléfono). `termino`: una clave de GLOSARIO (lib/glosarioAnuncios.js).
 */
export default function QueEs({ termino, texto = "" }) {
  const explicacion = texto || GLOSARIO[termino];
  if (!explicacion) return null;
  return (
    <details className="que-es">
      <summary>¿Qué es {NOMBRE_TERMINO[termino] ?? "esto"}?</summary>
      <p>{explicacion}</p>
    </details>
  );
}
