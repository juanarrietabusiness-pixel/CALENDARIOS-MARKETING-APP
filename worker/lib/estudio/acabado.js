// ============================================================
// Terminar una pieza del Estudio SIN pantalla: el texto de la plantilla y el logo estampado, en el Container
//
// Un encargo del servidor (lote, carrusel, director por MCP) deja en cada paso lo que necesita LIENZO (`navegador`):
// el texto de la plantilla encima y el logo estampado. Hasta ahora lo ponía la pantalla al volver a ver la pieza
// (`terminarPaso` en src/lib/encargosApi.js), así que lo pedido desde el teléfono o desde claude.ai se quedaba crudo
// hasta que alguien abría la aplicación. El Container del video animado ya tiene lienzo: aquí se le pide el MISMO
// dibujo (src/lib/acabadoLienzo.js) y la pieza nueva se sube a la galería igual que la sube la pantalla (con
// `origenId` y su `plantilla`, así recuerda su cruda y «Otra versión» sigue sabiendo repetirla).
//
// Si no hay Container (en local) o falla, devuelve null y todo sigue como antes: lo pone la pantalla.
// No gasta IA: es cómputo del Container.
// ============================================================

import { alContenedor, aBase64 } from "./cuadros.js";
import { subirArchivo } from "./galeria.js";
import { kitDe } from "./kit.js";
import { coloresPlantilla } from "../../../src/lib/carrusel.js";

/** Más que esto no se lee de R2 para dibujarle encima (una pieza de 4K en PNG ronda los 20 MB; no es lo normal). */
const TOPE_LEER = 24 * 1024 * 1024;

async function bytesDe(env, clave) {
  if (!clave) return null;
  const obj = await env.MEDIA.get(clave).catch(() => null);
  if (!obj || obj.size > TOPE_LEER) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

/** Lo que devuelve el Container → los bytes y su tipo. */
async function dibujar(env, cuerpo) {
  const r = await alContenedor(env, "/acabado", cuerpo);
  const j = await r.json();
  if (!j?.datos) throw new Error("El Container no devolvió la imagen.");
  const bin = atob(j.datos);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: j.mime === "image/png" ? "image/png" : "image/jpeg" };
}

const comoArchivo = (bytes, nombre, mime) => new File([bytes], `${nombre}.${mime === "image/png" ? "png" : "jpg"}`, { type: mime });

/**
 * Pone en UNA imagen de la galería (`crudo`, la fila) lo que pide `navegador`: { plantilla: { texto, plantilla, nombre },
 * logo }. Sube cada paso como una pieza nueva (como la pantalla: primero la del texto, después la del logo sobre ella).
 * → la ficha final (pública), o null si no hay Container o algo falló (lo pondrá la pantalla).
 */
export async function acabarPieza(env, acceso, cliente, crudo, navegador, { carpetaId = null } = {}) {
  if (!env?.VIDEO || !env?.MEDIA || !crudo || crudo.tipo === "video") return null;
  const nav = navegador ?? {};
  const kit = kitDe(cliente);
  if (!nav.plantilla && !(nav.logo && kit.logo)) return null;
  try {
    let actual = { id: crudo.id, clave: crudo.clave, mime: crudo.mime };
    let final = null;
    if (nav.plantilla) {
      const imagen = await bytesDe(env, actual.clave);
      if (!imagen) return null;
      const fuente = kit.fuente?.clave ? await bytesDe(env, kit.fuente.clave) : null;
      const { bytes, mime } = await dibujar(env, {
        imagen: aBase64(imagen), mime: "image/jpeg",
        texto: {
          texto: String(nav.plantilla.texto ?? ""), plantilla: nav.plantilla.plantilla ?? "banda", colores: coloresPlantilla(kit),
          familia: kit.tipografia ?? "", ...(fuente ? { fuente: { datos: aBase64(fuente) } } : {}),
        },
      });
      final = await subirArchivo(env, acceso, cliente, comoArchivo(bytes, nav.plantilla.nombre || "pieza", mime), {
        carpetaId, origenId: actual.id, plantilla: { texto: String(nav.plantilla.texto ?? ""), plantilla: nav.plantilla.plantilla ?? "banda" },
      });
      actual = { id: final.id, clave: final.clave, mime: final.mime };
    }
    // `logo` lo pide el servidor también cuando Muse dejó fuera el logo, aunque el kit diga «lo pone el modelo».
    if (nav.logo && kit.logo) {
      const [imagen, logo] = await Promise.all([bytesDe(env, actual.clave), bytesDe(env, kit.logo)]);
      if (imagen && logo) {
        const { bytes, mime } = await dibujar(env, {
          imagen: aBase64(imagen), mime: actual.mime === "image/png" ? "image/png" : "image/jpeg",
          logo: { datos: aBase64(logo), posicion: kit.logoPosicion ?? {} },
        });
        final = await subirArchivo(env, acceso, cliente, comoArchivo(bytes, "con-logo", mime), {
          carpetaId, origenId: actual.id, plantilla: { texto: "", plantilla: "logo" },
        });
      }
    }
    return final;
  } catch (e) {
    console.error("acabado en el Container:", e?.message ?? e);
    return null;
  }
}
