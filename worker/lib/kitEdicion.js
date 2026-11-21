// ============================================================
// `kit_edicion`: el KIT DE EDICIÓN de videos grabados, para instalarlo en el chat de Claude con un comando
//
// El kit (kit-edicion/ + la lógica pura que usa) lo empaqueta el build en dist/api/_kit/kit-edicion-<versión>.zip
// (scripts/kit-edicion/empaquetar.mjs): va con el despliegue, así que la versión que dice esta herramienta y el ZIP que
// sirve la ruta son siempre los mismos. /api/* pasa por el Worker antes que por los archivos estáticos
// (`run_worker_first`), así que el ZIP sólo sale con un enlace firmado de 15 minutos: el mismo mecanismo que
// exportar_piezas y kit_descargable (otro uso del testigo: uno no abre el otro).
//
// No lleva nada de ningún cliente: la marca va aparte, con kit_descargable. No gasta IA.
// ============================================================

import { firmarCon, leerFirmado } from "./firmas.js";
import { secretoDeVista } from "./medioVista.js";
import { ErrorExportar, VIDA_ZIP_MS, RUTA_EXPORTAR } from "./exportarPiezas.js";
import { KIT_EDICION } from "../../src/lib/kitEdicionVersion.js";

const USO = "kit-edicion";
export const RUTA_KIT_EDICION = `${RUTA_EXPORTAR}kit-edicion/`;
/** Dónde deja el build el ZIP, dentro de los archivos estáticos del Worker. */
export const rutaDelZip = (version = KIT_EDICION.version) => `/api/_kit/kit-edicion-${version}.zip`;
const nombreZip = () => `kit-edicion-${KIT_EDICION.version}.zip`;

export const DEFINICION_KIT_EDICION = Object.freeze({
  name: "kit_edicion",
  description:
    "El KIT DE EDICIÓN de la agencia para editar un video GRABADO (clips de una persona hablando a cámara) en tu máquina: " +
    "transcribir por palabra, cortar con los silencios relativos a la voz, limpiar y nivelar la voz, cortar la música en " +
    "compases, mezclar con los efectos del catálogo a −14 LUFS, recortar a la persona, la cámara virtual, las piezas " +
    "gráficas con la marca (texto detrás de la persona, cinta, sello, lista, fichas, botón de WhatsApp, modo celular), " +
    "cuadros de muestra antes de renderizar y el render por tramos con su hoja de contactos. Devuelve " +
    "la versión, un enlace de 15 minutos (sin sesión) y el comando que lo instala todo de una vez (librerías y modelos). " +
    "Si ya tienes instalada esta misma versión, no hace falta repetir. La marca del cliente va aparte (kit_descargable). " +
    "Sólo lee: no gasta IA ni cambia nada.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true, openWorldHint: false },
});

/** La herramienta. `origen`: el del conector (para que el kit sepa de dónde bajar los efectos del catálogo). */
export function crearHerramientaKitEdicion({ env, usuario, origen = "" }) {
  return {
    async kit_edicion() {
      const secreto = await secretoDeVista(env).catch(() => null);
      if (!secreto) throw new ErrorExportar("No pude preparar el enlace de descarga ahora. Inténtalo otra vez.");
      const testigo = await firmarCon(secreto, USO, { o: usuario.ownerId ?? usuario.id, v: KIT_EDICION.version }, VIDA_ZIP_MS);
      const url = `${RUTA_KIT_EDICION}${testigo}/${nombreZip()}`;
      const dominio = origen ? `KIT_DOMINIO=${origen} ` : "";
      return [
        `Kit de edición v${KIT_EDICION.version} (huella ${KIT_EDICION.huella}).`,
        `Descarga (vale 15 minutos, sin iniciar sesión): ${url}`,
        "Instálalo con UN comando (idempotente: si se corta, se repite y sigue; la primera vez tarda unos minutos por los modelos):",
        `mkdir -p ~/kit && cd ~/kit && curl -fsSL "${url}" -o kit.zip && unzip -oq kit.zip && ${dominio}bash instalar.sh`,
        "Luego, desde la carpeta del proyecto: node ~/kit/kit.mjs preparar <clips> y node ~/kit/kit.mjs siguiente (LEEME.md lo explica).",
        "Si ya tienes ~/kit con esta versión (node ~/kit/kit.mjs version), no lo vuelvas a bajar.",
      ].join("\n");
    },
  };
}

/** GET /api/exportar/kit-edicion/<testigo>/<nombre>.zip — sin sesión, mientras el testigo no caduque. */
export async function rutaKitEdicion(req, env, partes) {
  const noHay = (texto = "Este enlace de descarga no existe o ya caducó (dura 15 minutos). Pídele a Claude otro.") =>
    new Response(texto, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const testigo = String(partes[2] ?? "");
  if (!testigo || testigo.length > 4000) return noHay();
  const secreto = await secretoDeVista(env).catch(() => null);
  const d = secreto ? await leerFirmado(secreto, USO, testigo) : null;
  if (!d?.o || !d?.v) return noHay();
  // Un enlace de una versión vieja (pedido antes de un despliegue) ya no tiene su ZIP: se dice, no se sirve otro.
  if (d.v !== KIT_EDICION.version) return noHay(`Este enlace es del kit v${d.v} y ya está la v${KIT_EDICION.version}. Pídele a Claude otro (kit_edicion).`);
  const res = env.ASSETS ? await env.ASSETS.fetch(new Request(new URL(rutaDelZip(), req.url))).catch(() => null) : null;
  if (!res?.ok) return noHay(`El kit v${KIT_EDICION.version} no está en este despliegue (el build no lo empaquetó).`);
  return new Response(res.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nombreZip()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
