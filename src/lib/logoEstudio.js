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
