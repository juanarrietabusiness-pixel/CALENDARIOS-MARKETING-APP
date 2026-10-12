// ============================================================
// Lo que el kit aprende de los «Me gusta» y de la papelera del Estudio
//
// Lo puro (qué se le pide a la IA, cómo se lee, las guardas) está en
// src/lib/aprendizajeVisual.js. Aquí: leer qué imágenes gustaron y cuáles se
// descartaron, bajarlas de R2 y que la IA las MIRE. Devuelve una PROPUESTA:
// no guarda nada. Una persona acepta las reglas que quiera y entonces van al
// kit (`kit.aprendido`, con PUT /kit).
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { ErrorEstudio } from "./trabajos.js";
import { aBase64 } from "./gemini.js";
import { kitDe } from "./kit.js";
import {
  MAX_GUSTAN, MAX_DESCARTADAS, faltaParaAprender, pedidoDeAprendizaje, leerAprendizaje,
} from "../../../src/lib/aprendizajeVisual.js";

/** Lo que Anthropic admite por imagen (5 MB en base64), con margen, y lo que se manda en total. */
const MAX_BYTES_IMAGEN = 3_600_000;
const MAX_BYTES_TOTAL = 18_000_000;
const MIMES = /^image\/(png|jpeg|webp|gif)$/;

const sirve = (f) => f.tipo === "imagen" && MIMES.test(f.mime ?? "") && (!f.bytes || f.bytes <= MAX_BYTES_IMAGEN);

/** Las imágenes que gustan (las últimas) y las descartadas del Estudio (no las subidas: esas no las hizo el motor). */
export async function senalesVisuales(acceso, clienteId) {
  const filas = await acceso.leerColumnas(
    "estudio_archivos", ["id", "clave", "mime", "tipo", "prompt", "favorito", "borrado_at", "subido", "bytes", "created_at"],
    { client_id: clienteId }, "created_at desc",
  );
  const gustan = filas.filter((f) => f.favorito && !f.borrado_at && sirve(f));
  const descartadas = filas.filter((f) => f.borrado_at && !f.favorito && !f.subido && sirve(f));
  return { gustan, descartadas };
}

/** La IA mira lo que gustó y lo descartado, y PROPONE reglas visuales para el kit. No guarda nada. */
export async function aprenderDeLoVisual(env, acceso, cliente) {
  const todas = await senalesVisuales(acceso, cliente.id);
  const falta = faltaParaAprender({ gustan: todas.gustan.length });
  if (falta) throw new ErrorEstudio(falta, 409);

  // Se bajan en orden y se paran al llegar al total: lo que gusta, primero.
  let total = 0;
  const bajar = async (lista, max) => {
    const fuera = [];
    for (const f of lista) {
      if (fuera.length >= max) break;
      const obj = await env.MEDIA.get(f.clave);
      if (!obj) continue; // el archivo ya no está: no cuenta
      const bytes = new Uint8Array(await obj.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES_IMAGEN || total + bytes.byteLength > MAX_BYTES_TOTAL) continue;
      total += bytes.byteLength;
      fuera.push({ ...f, datos: aBase64(bytes) });
    }
    return fuera;
  };
  const gustan = await bajar(todas.gustan, MAX_GUSTAN);
  const descartadas = await bajar(todas.descartadas, MAX_DESCARTADAS);
  const falta2 = faltaParaAprender({ gustan: gustan.length });
  if (falta2) throw new ErrorEstudio(falta2, 409);

  const kit = kitDe(cliente);
  const imagen = (f, etiqueta) => [
    { type: "text", text: etiqueta },
    { type: "image", source: { type: "base64", media_type: f.mime, data: f.datos } },
  ];
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      ...gustan.flatMap((f, i) => imagen(f, `G${i + 1}`)),
      ...descartadas.flatMap((f, i) => imagen(f, `D${i + 1}`)),
      { type: "text", text: pedidoDeAprendizaje({ marca: cliente.name, kit, gustan, descartadas }) },
    ],
    salida: 1500,
    funcion: "aprendizaje visual",
  });
  const reglas = leerAprendizaje(r.texto, { gustan: gustan.length, descartadas: descartadas.length, kit });
  return { reglas, vistas: { gustan: gustan.length, descartadas: descartadas.length }, modelo: r.modelo, aviso: r.aviso ?? null };
}
