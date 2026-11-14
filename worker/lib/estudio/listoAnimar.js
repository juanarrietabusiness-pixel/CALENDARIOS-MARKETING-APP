// ============================================================
// «¿Listo para animar?» del storyboard: UNA mirada de la IA a todos los fotogramas antes de pagar el video
//
// Cuando el reel por planos se para a revisar el storyboard (encargoReel.js), la IA mira las copias pequeñas de los
// fotogramas (512 px, por el Container; sin él, la original si es ligera) numeradas en orden, con lo que hará cada
// plano, y dice por cada uno si el sujeto se separa del fondo, la luz casa, queda espacio para su movimiento y no hay
// artefactos ni texto. El veredicto lo pone el código (src/lib/listoAnimar.js). Es un AVISO: no bloquea nada.
// Función «fotograma listo para animar», hueco «análisis»; sin razonar (`esfuerzo: low`): es mirar, no pensar.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { miniaturaDe } from "./miniaturas.js";
import { pedidoDeListoAnimar, leerListoAnimar, MAX_FOTOGRAMAS_ANIMAR } from "../../../src/lib/listoAnimar.js";

/** Lado de las copias que se mandan: se ve la composición y el borde, y doce caben en una llamada barata. */
const LADO = 512;

/**
 * `fotogramas`: [{ n, plano, fila }] (la ficha de la galería del fotograma final de cada plano). → { porN: Map n →
 * { ok, motivos, nota }, revisados } o { porN: Map vacío, sinImagenes: true } si no hay ninguna imagen que mandar.
 * Lanza lo que lance la IA (sin llave, sin presupuesto): quien llama lo apunta y sigue.
 */
export async function revisarParaAnimar(env, acceso, cliente, fotogramas = []) {
  const conImagen = [];
  for (const f of fotogramas.slice(0, MAX_FOTOGRAMAS_ANIMAR)) {
    if (!f?.fila?.clave || !String(f.fila.mime ?? "").startsWith("image/")) continue;
    const m = await miniaturaDe(env, f.fila.clave, { mime: f.fila.mime, lado: LADO }).catch(() => null);
    if (m?.datos) conImagen.push({ ...f, imagen: m });
  }
  if (!conImagen.length) return { porN: new Map(), sinImagenes: true };
  const bloques = conImagen.flatMap((f) => [
    { type: "text", text: `Fotograma del plano ${f.n}:` },
    { type: "image", source: { type: "base64", media_type: f.imagen.mime || "image/jpeg", data: f.imagen.datos } },
  ]);
  bloques.push({ type: "text", text: pedidoDeListoAnimar({ planos: conImagen.map((f) => ({ n: f.n, escena: f.plano?.escena, camara: f.plano?.camara })) }) });
  const r = await llamarIA(env, acceso, cliente, { prompt: bloques, salida: 1400, funcion: "fotograma listo para animar", esfuerzo: "low" });
  const porN = leerListoAnimar(r.texto, conImagen.map((f) => f.n));
  if (!porN) throw Object.assign(new Error("La IA no devolvió una revisión que se pueda leer."), { estado: 502 });
  return { porN, revisados: conImagen.length };
}
