// ============================================================
// Las plantillas de plan del espacio, leídas de D1 (las de arranque con lo cambiado y las propias)
//
// Lo puro (las de arranque, limpiar, juntar) está en src/lib/plantillasPlan.js. Lo leen la ruta
// /api/plantillas-plan (worker/rutas/plantillas.js) y el conector de Claude (preparar_mes, en
// worker/lib/herramientasTextos.js), que necesita resolver la plantilla de la empresa como la pantalla.
// ============================================================

import { plantillasDisponibles } from "../../src/lib/plantillasPlan.js";

/** Una fila de `plantillas_plan` → la plantilla (con su id de plantilla, no el de la fila). */
const deFila = (f) => {
  let d = {};
  try { d = JSON.parse(f.datos); } catch { /* fila rota: se queda sin datos y la limpieza la descarta */ }
  return { ...d, id: f.plantilla_id };
};

/** Las plantillas de plan del espacio: las de arranque (con lo que se cambió) y las propias, limpias. */
export async function plantillasDelEspacio(acceso) {
  return plantillasDisponibles((await acceso.leer("plantillas_plan", {})).map(deFila));
}
