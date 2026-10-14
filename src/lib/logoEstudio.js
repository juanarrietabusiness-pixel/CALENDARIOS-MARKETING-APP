// ============================================================
// El logo estampado, llevado a la galería
//
// Lo de dibujar está en logoEncima.js (que también importa el kit, y por él
// el Worker); esto SUBE la pieza estampada como una nueva que recuerda su
// original (`origenId`). Vive aparte porque llama a la API del navegador.
// ============================================================

import * as api from "./estudio";
import { limpiarKit } from "./kitMarca";
import { estamparLogo } from "./logoEncima";

/** ¿El kit pide que la aplicación estampe el logo (y lo tiene)? */
export function estampaSola(kit) {
  const k = limpiarKit(kit);
  return k.logoModo === "estampado" && Boolean(k.logo);
}

/** Estampa el logo del kit sobre una imagen de la galería y sube la nueva. → el archivo nuevo. */
export async function estamparEnGaleria({ clienteId, archivo, kit, carpetaId }) {
  const k = limpiarKit(kit);
  if (!k.logo) throw new Error("El kit no tiene logo: abre una imagen de la galería y pulsa «Usar como logo».");
  if (archivo?.tipo === "video") throw new Error("El logo se estampa en imágenes, no en videos.");
  const blob = await estamparLogo({ src: archivo.src, logoSrc: `/api/media/${k.logo}`, posicion: k.logoPosicion, mime: archivo.mime });
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const { archivo: nuevo } = await api.subirImagen(clienteId, new File([blob], `con-logo.${ext}`, { type: blob.type }), {
    carpetaId: carpetaId === undefined ? archivo.carpetaId ?? null : carpetaId,
    origenId: archivo.id, plantilla: { texto: "", plantilla: "logo" },
  });
  return nuevo;
}

/** Con el logo estampado en el kit, la pieza con su logo; si no toca (o falla el dibujo), la misma. */
export async function conLogoSiToca({ clienteId, archivo, kit, carpetaId }) {
  if (!archivo || archivo.tipo === "video" || !estampaSola(kit)) return archivo;
  try {
    return await estamparEnGaleria({ clienteId, archivo, kit, carpetaId });
  } catch {
    return archivo;
  }
}

/**
 * Al terminar un trabajo del compositor pedido con el logo estampado: cada imagen sale otra vez con el logo encima (la
 * cruda se queda). → true si estampó alguna.
 */
export async function estamparTrabajo({ clienteId, trabajo, kit }) {
  if (!trabajo?.archivos?.length || trabajo.tipo === "video") return false;
  const g = await api.leerEstudio(clienteId).catch(() => null);
  let hechas = 0;
  for (const id of trabajo.archivos) {
    const a = g?.archivos?.find((x) => x.id === id);
    if (a && (await conLogoSiToca({ clienteId, archivo: a, kit })) !== a) hechas += 1;
  }
  return hechas > 0;
}
