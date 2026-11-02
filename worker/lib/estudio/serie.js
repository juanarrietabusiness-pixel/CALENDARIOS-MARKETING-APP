// ============================================================
// «Las piezas juntas»: la IA mira la hoja del mes (todas las piezas numeradas) con el kit delante
//
// La hoja la arma el NAVEGADOR (el Worker no tiene lienzo) y llega como JPEG en base64: una sola imagen por mucho que
// lleve el mes, así cuesta lo mismo que revisar una. Sólo se acepta un JPEG de verdad (por sus primeros bytes) y de
// tamaño razonable. Lo puro, en src/lib/piezasJuntas.js.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { ErrorEstudio } from "./trabajos.js";
import { kitDe } from "./kit.js";
import { pedidoDeSerie, leerSerie, MAX_PIEZAS_SERIE } from "../../../src/lib/piezasJuntas.js";

const MAX_BASE64 = 4_000_000;
const ES_JPEG = /^\/9j\//; // FF D8 FF en base64

/** → { puntaje, resumen, comun, fuera, modelo }. `total`: cuántas piezas numeradas lleva la hoja. */
export async function revisarSerie(env, acceso, cliente, { imagen = "", total = 0 } = {}) {
  const datos = String(imagen ?? "").replace(/^data:image\/jpeg;base64,/, "");
  if (!datos || datos.length > MAX_BASE64 || !ES_JPEG.test(datos)) throw new ErrorEstudio("Falta la hoja de las piezas (un JPEG).", 400);
  const n = Math.floor(Number(total) || 0);
  if (n < 2 || n > MAX_PIEZAS_SERIE) throw new ErrorEstudio(`Hacen falta entre 2 y ${MAX_PIEZAS_SERIE} piezas para verlas juntas.`, 400);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: datos } },
      { type: "text", text: pedidoDeSerie({ marca: cliente.name, kit: kitDe(cliente), total: n }) },
    ],
    salida: 1600,
    funcion: "piezas juntas",
  });
  const serie = leerSerie(r.texto, n);
  if (!serie) throw new ErrorEstudio("La IA no devolvió una revisión que se pueda leer. Inténtalo otra vez.", 502);
  return { ...serie, modelo: r.modelo };
}
