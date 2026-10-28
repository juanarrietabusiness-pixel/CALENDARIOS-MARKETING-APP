// ============================================================
// Historias automáticas, desde el navegador (/api/historias-auto)
//
// El servidor pone cada día la historia en la cola; lo que necesita del
// navegador es la imagen, que se dibuja en un lienzo. `prepararPendientes`
// hace las que falten de un cliente: la llama la página de Programación y,
// sola, la aplicación al abrirse (una vez por sesión y cliente).
// ============================================================

import { pedir, subirImagenPublicacion } from "./db";
import { historiaDeRepost } from "./historiasRepost";
import { PREPARAR_DE_UNA_VEZ } from "./historiasAuto";

const ruta = (clientId, resto = "") => `/historias-auto/${encodeURIComponent(clientId)}${resto}`;

export const clientesConHistorias = async () => (await pedir("/historias-auto")).clientes ?? [];
export const leerHistorias = (clientId) => pedir(ruta(clientId));
export const guardarHistorias = (clientId, cambios) => pedir(ruta(clientId), { method: "PUT", body: JSON.stringify(cambios) });
export const quitarHistoria = (clientId, id) => pedir(ruta(clientId, `/piezas/${encodeURIComponent(id)}`), { method: "DELETE" });
/** «Que vuelva a salir»: la que se apartó con «Que no salga». */
export const devolverHistoria = (clientId, id) => pedir(ruta(clientId, `/piezas/${encodeURIComponent(id)}/volver`), { method: "POST" });

/**
 * Dibuja y sube las historias que le falten a un cliente (como mucho
 * `limite`). Una que falla (imagen borrada, sin red) se salta: las demás
 * siguen. → cuántas quedaron hechas.
 */
export async function prepararPendientes(clientId, { limite = PREPARAR_DE_UNA_VEZ, color } = {}) {
  const { pendientes = [] } = await pedir(ruta(clientId, "/pendientes"));
  let hechas = 0;
  for (const p of pendientes.slice(0, limite)) {
    try {
      const archivo = await historiaDeRepost(p.src, p.frase, { color });
      const src = await subirImagenPublicacion(clientId, archivo);
      await pedir(ruta(clientId, "/piezas"), { method: "POST", body: JSON.stringify({ filaId: p.filaId, src, frase: p.frase }) });
      hechas++;
    } catch (e) {
      console.warn("historia automática:", p.filaId, e?.message);
    }
  }
  return { hechas, faltan: Math.max(0, pendientes.length - hechas) };
}

const HECHO = "historias-preparadas";

/** Al abrir la aplicación: las de los clientes con historias encendidas, una vez por sesión. */
export async function prepararEnSegundoPlano() {
  try { if (sessionStorage.getItem(HECHO)) return; sessionStorage.setItem(HECHO, "1"); } catch { /* sin almacenamiento: se hace igual */ }
  for (const clientId of await clientesConHistorias()) {
    try { await prepararPendientes(clientId); } catch (e) { console.warn("historias automáticas:", e?.message); }
  }
}
