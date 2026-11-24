// ============================================================
// Descargar un archivo de la galería, también desde el teléfono
//
// En el ordenador basta un `<a download>`. En el teléfono, no: con la app
// instalada en la pantalla de inicio (el manifiesto la abre «standalone») iOS
// no tiene a dónde descargar y el enlace no hace nada, y en Safari o Chrome lo
// descargado acaba en Archivos, no en Fotos. Ahí se usa la hoja de COMPARTIR
// con el archivo (Guardar imagen / Guardar video, WhatsApp, Instagram…), como
// en «Publicar a mano». Si el navegador no comparte archivos, se descarga lo ya
// bajado (un enlace a un blob, que sí respeta el nombre).
//
// iOS sólo deja compartir justo después de un toque: si bajar el archivo tardó
// (un reel de 80 MB), `share` falla con NotAllowedError. Entonces el archivo se
// guarda aquí y el aviso pide volver a tocar: el segundo toque comparte al
// momento, sin esperar a nada. Nada de esto se ha probado en un iPhone real
// (Chromium no tiene hoja de compartir): se dice al entregar.
// ============================================================

/** ¿Es un teléfono o una tableta? (dedo como puntero principal) */
export function esTactil() {
  try {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Los archivos ya bajados que esperan el segundo toque: clave → File[]. */
const listos = new Map();
const claveDe = (piezas) => piezas.map((p) => p.src).join("|");

/** Un enlace con `download` pulsado (y quitado). */
function pulsar(href, nombre) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function bajar({ src, nombre }) {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`No se pudo bajar «${nombre}» (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], nombre, { type: blob.type || "application/octet-stream" });
}

/**
 * Descarga una pieza o varias (`[{ src, nombre }]`). En el ordenador, cada una con su enlace. En el teléfono, la hoja de
 * compartir con todas a la vez. → { hecho: "compartido" | "descargado" | "cancelado" | "otra-vez", texto }.
 * `otra-vez`: el archivo ya está bajado y hace falta otro toque para compartirlo (lo dice `texto`).
 */
export async function descargarPiezas(piezas, { tactil = esTactil() } = {}) {
  const lista = piezas.filter((p) => p?.src);
  if (!lista.length) return { hecho: "cancelado", texto: "" };
  if (!tactil) {
    for (const p of lista) {
      pulsar(p.src, p.nombre);
      if (lista.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
    return { hecho: "descargado", texto: "" };
  }
  const clave = claveDe(lista);
  const archivos = listos.get(clave) ?? await Promise.all(lista.map(bajar));
  listos.delete(clave);
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: archivos })) {
    try {
      await navigator.share({ files: archivos });
      return { hecho: "compartido", texto: "" };
    } catch (e) {
      if (e?.name === "AbortError") return { hecho: "cancelado", texto: "" };
      if (e?.name === "NotAllowedError") {
        listos.set(clave, archivos);
        return { hecho: "otra-vez", texto: `${archivos.length > 1 ? "Ya están listos" : "Ya está listo"}: vuelve a tocar «Descargar» para guardar${archivos.length > 1 ? "los" : "lo"}.` };
      }
      // Cualquier otro fallo al compartir: se descarga, que es lo que se pidió.
    }
  }
  for (const f of archivos) {
    const url = URL.createObjectURL(f);
    pulsar(url, f.name);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (archivos.length > 1) await new Promise((r) => setTimeout(r, 400));
  }
  return { hecho: "descargado", texto: archivos.length > 1 ? `Se descargaron las ${archivos.length}.` : "" };
}
