// ============================================================
// Preparar el mes al enviárselo al cliente, con «Programar al aprobar»
//
// Cuando el cliente apruebe, el SERVIDOR programa la pieza solo, y él no
// puede convertir imágenes (JPEG, copias 4:5 / 9:16): eso lo hace el
// navegador. Se hace aquí, al abrir el envío, en segundo plano. Va aparte
// de CalendarView y en diferido: la carga inicial está en su tope.
// ============================================================

import { prepararParaRedes } from "./medios.js";
import { redesDe } from "./publicacion.js";
import { tipoAprobacion } from "./aprobacion.js";
import { subirImagenPublicacion } from "./db.js";
import { fmtDate } from "../utils.js";

const fechaDeHoy = () => fmtDate(new Date());

/** Las piezas del mes que saldrían solas al aprobarse: desde hoy, por aprobar como pieza, fuera de la cola. Pura. */
export function piezasParaPreparar(cal, cola = [], redesDelCliente = [], hoy = "") {
  const enCola = new Set(cola.filter((f) => f.estado !== "cancelada" && f.estado !== "error").map((f) => f.postId));
  const lista = [];
  for (const d of cal?.days ?? []) {
    if (!d?.date || (hoy && d.date < hoy)) continue;
    for (const p of d.posts ?? []) {
      if (enCola.has(p.id) || tipoAprobacion(p) !== "pieza" || p.asistida) continue;
      const redes = redesDe(p, redesDelCliente).filter((r) => redesDelCliente.includes(r));
      if (redes.length) lista.push({ post: p, redes });
    }
  }
  return lista;
}

/**
 * Las piezas, preparadas para sus redes como al programar. Devuelve las publicaciones que cambiaron (id → publicación)
 * y las que no se pudieron preparar, con su motivo. Las que fallan no paran a las demás.
 */
export async function prepararParaAprobar({ lista, clienteDb, colorMarca, avisar = () => {}, preparar = prepararParaRedes }) {
  const cambiadas = new Map();
  const fallidas = [];
  for (const [i, r] of lista.entries()) {
    avisar(`Preparando las piezas para que salgan solas al aprobarlas (${i + 1} de ${lista.length})…`);
    try {
      const { post, cambio } = await preparar(r.post, r.redes, { subir: (f) => subirImagenPublicacion(clienteDb, f), colorMarca });
      if (cambio) cambiadas.set(post.id, post);
    } catch (e) {
      fallidas.push({ postId: r.post.id, titulo: r.post.title || r.post.idea || "Publicación", motivo: e?.message || "error desconocido" });
    }
  }
  return { cambiadas, fallidas };
}

/**
 * Lo preparado, puesto sobre el calendario de AHORA (se pudo seguir editando mientras se preparaba): sólo en las
 * publicaciones cuyos archivos siguen siendo los mismos que se prepararon. Pura.
 */
export function conPreparadas(cal, antes, cambiadas) {
  const huella = (p) => JSON.stringify([p?.medios ?? null, p?.image ?? null, p?.historias ?? null, p?.portada ?? null]);
  const original = new Map();
  for (const d of antes?.days ?? []) for (const p of d.posts ?? []) original.set(p.id, huella(p));
  let n = 0;
  const days = (cal?.days ?? []).map((d) => ({
    ...d,
    posts: (d.posts ?? []).map((p) => {
      const nueva = cambiadas.get(p.id);
      if (!nueva || original.get(p.id) !== huella(p)) return p;
      n++;
      // La portada del reel también: al programar se pasa a JPEG (Instagram no lee otra en `cover_url`).
      return { ...p, medios: nueva.medios, image: nueva.image, historias: nueva.historias, adaptados: nueva.adaptados, ...(nueva.portada !== p.portada ? { portada: nueva.portada } : {}) };
    }),
  }));
  return { cal: { ...cal, days }, n };
}

/**
 * Todo el paso, para CalendarView (que sólo lo llama): qué preparar, prepararlo, ponerlo sobre el calendario de ahora
 * (`ahora()`) con `guardar` y la frase que se enseña. "" si no había nada que preparar.
 */
export async function prepararEnvioDelMes({ cal, ahora, cola, redesDelCliente, clienteDb, colorMarca, avisar, guardar, hoy = fechaDeHoy() }) {
  const lista = piezasParaPreparar(cal, cola, redesDelCliente, hoy);
  if (!lista.length) return "";
  const { cambiadas, fallidas } = await prepararParaAprobar({ lista, clienteDb, colorMarca, avisar });
  if (cambiadas.size) {
    const { cal: nuevo, n } = conPreparadas(ahora(), cal, cambiadas);
    if (n) guardar(nuevo);
  }
  return fallidas.length
    ? `Listas para salir solas al aprobarlas, salvo ${fallidas.length}: ${fallidas.map((f) => `«${f.titulo}» (${f.motivo})`).join("; ")}`
    : "Las piezas están listas para salir solas en cuanto el cliente las apruebe.";
}
