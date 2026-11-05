import { lazy, Suspense, useId } from "react";
import BarraPestanas from "../BarraPestanas";
import { idDePestana, idDelPanel } from "../../lib/pestanas";
import "./cliente.css";
// Las referencias analizadas usan los avisos del cerebro (cerebro-aviso, cerebro-error).
import "../Cerebro.css";

// ============================================================
// La pestaña «Referencias» de un cliente (fase 7)
//
// Lo que se guarda y se mira de fuera para hacer lo propio, que antes eran tres sitios: el banco de ideas (la
// pestaña Ideas), «Lo mejor» de este cliente (la pestaña Inspiración, que ya era esa vista filtrada) y la competencia
// del estudio de mercado (que estaba dentro de un diálogo de la pestaña Cerebro). Cada una es una sub-sección con su
// dirección: `/cliente/x/referencias/ideas`, `…/inspiracion` (con el `?pieza=` de los avisos «rinde 3×», que lee
// Inspiración al montarse) y `…/competencia`. Las de antes (`/ideas`, `/inspiracion`) llevan aquí.
// ============================================================

const IdeasBank = lazy(() => import("../IdeasBank"));
const Inspiracion = lazy(() => import("../Inspiracion"));
const CompetenciaDeMercado = lazy(() => import("../EstudioMercado").then((m) => ({ default: m.CompetenciaDeMercado })));

const SUBPESTANAS_REFERENCIAS = Object.freeze([
  ["ideas", "Banco de ideas", "bulb"],
  ["inspiracion", "Lo mejor", "trending"],
  ["competencia", "Competencia", "users"],
]);

export default function Referencias({ client, clientes = [], seccion = null, pulso = 0, lectura = false, onIr, onPersistClient, onLlevar }) {
  const ids = useId();
  const actual = seccion ?? "ideas";
  return (
    <div className="subseccion">
      <BarraPestanas
        etiqueta={`Referencias de ${client.name}`}
        pestanas={SUBPESTANAS_REFERENCIAS}
        actual={actual}
        base={ids}
        clase="subpestanas"
        claseItem="subpestana"
        onElegir={(id) => onIr("referencias", id)}
      />
      <div role="tabpanel" id={idDelPanel(ids)} aria-labelledby={idDePestana(ids, actual)} className="subseccion-panel">
        <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
          {actual === "ideas" && <IdeasBank client={client} clientes={clientes} pulso={pulso} />}
          {actual === "inspiracion" && (
            <Inspiracion client={client} clientes={clientes} modo="pestana" lectura={lectura} onPersistClient={onPersistClient} onLlevar={onLlevar} />
          )}
          {actual === "competencia" && <CompetenciaDeMercado client={client} lectura={lectura} />}
        </Suspense>
      </div>
    </div>
  );
}
