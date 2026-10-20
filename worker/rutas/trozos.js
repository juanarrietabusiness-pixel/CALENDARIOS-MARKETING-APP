// ============================================================
// Subir un archivo grande por TROZOS (/api/media/trozos)
//
// `POST /api/media` lee el formulario entero (`formData()`) dentro del
// Worker: un reel de 80 MB se quedaba minutos sin decir nada y, pasado de
// 100 MB —el tope del cuerpo de una petición en Cloudflare—, no llegaba
// nunca. Esto lo parte: el navegador manda trozos de `TAMANO_TROZO` y R2
// los junta con su subida multiparte. Cada trozo es una petición corta, así
// que la pantalla sabe cuánto lleva y un trozo que falla se repite solo.
//
//   POST   /api/media/trozos            { clientId, carpeta, nombre, tipo } → { clave, id }
//   PUT    /api/media/trozos?clave&id&n  (el trozo n, crudo)               → { n, etag }
//   POST   /api/media/trozos/fin        { clave, id, partes: [{ n, etag }] } → { clave }
//   DELETE /api/media/trozos?clave&id                                      → { ok }
//
// La clave la inventa el servidor, como en la subida de siempre, y cada
// paso comprueba que sea de un cliente de este espacio: el navegador la
// devuelve en cada trozo y podría mandar otra.
// ============================================================

import { json, error, noEncontrado } from "../lib/respuesta.js";

/** Lo que mide cada trozo (menos el último). R2 pide al menos 5 MiB y que todos midan lo mismo. */
export const TAMANO_TROZO = 10 * 1024 * 1024;
/** Un trozo no puede pasar de esto: deja margen al tope de 100 MB por petición. */
const TROZO_MAX = 50 * 1024 * 1024;
/** R2 admite hasta 10.000 partes; con 10 MiB son casi 100 GB. Esto es un tope de cordura: 2 GB. */
const MAX_PARTES = 200;

const CLAVE = /^clientes\/([^/]+)\/[a-z]+\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

/** El tipo que se guarda: imagen o video; lo demás, como binario (se sirve como descarga). */
const tipoGuardado = (t) => (/^(image|video)\/[\w.+-]+$/.test(String(t ?? "")) ? String(t) : "application/octet-stream");

/** ¿La clave es de un cliente de este espacio? Devuelve el id del cliente o null. */
async function clienteDeLaClave(acceso, clave) {
  const m = CLAVE.exec(String(clave ?? ""));
  if (!m) return null;
  return (await acceso.leerUno("clients", { id: m[1] })) ? m[1] : null;
}

export async function rutasTrozos(req, env, { acceso, partes, metodo }) {
  const url = new URL(req.url);

  // Empezar: la clave nueva y el id de la subida de R2.
  if (partes.length === 2 && metodo === "POST") {
    const d = await req.json().catch(() => ({}));
    const clientId = String(d.clientId ?? "");
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    const carpeta = String(d.carpeta ?? "posts").replace(/[^a-z]/g, "") || "posts";
    const ext = (String(d.nombre ?? "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const clave = `clientes/${clientId}/${carpeta}/${crypto.randomUUID()}.${ext}`;
    const subida = await env.MEDIA.createMultipartUpload(clave, { httpMetadata: { contentType: tipoGuardado(d.tipo) } });
    return json({ clave, id: subida.uploadId, tamano: TAMANO_TROZO }, 201);
  }

  // Un trozo.
  if (partes.length === 2 && metodo === "PUT") {
    const clave = url.searchParams.get("clave");
    const id = url.searchParams.get("id") ?? "";
    const n = Number(url.searchParams.get("n"));
    if (!(await clienteDeLaClave(acceso, clave))) return noEncontrado("Archivo");
    if (!id || !Number.isInteger(n) || n < 1 || n > MAX_PARTES) return error("Trozo no válido.");
    const cuerpo = await req.arrayBuffer();
    if (!cuerpo.byteLength) return error("El trozo llegó vacío.");
    if (cuerpo.byteLength > TROZO_MAX) return error("El trozo es demasiado grande.", 413);
    const parte = await env.MEDIA.resumeMultipartUpload(clave, id).uploadPart(n, cuerpo);
    return json({ n: parte.partNumber, etag: parte.etag });
  }

  // Juntar los trozos: a partir de aquí el archivo existe.
  if (partes.length === 3 && partes[2] === "fin" && metodo === "POST") {
    const d = await req.json().catch(() => ({}));
    if (!(await clienteDeLaClave(acceso, d.clave))) return noEncontrado("Archivo");
    const lista = Array.isArray(d.partes) ? d.partes : [];
    if (!d.id || !lista.length || lista.length > MAX_PARTES) return error("Faltan los trozos.");
    const partesR2 = lista
      .map((p) => ({ partNumber: Number(p?.n), etag: String(p?.etag ?? "") }))
      .sort((a, b) => a.partNumber - b.partNumber);
    if (partesR2.some((p, i) => p.partNumber !== i + 1 || !p.etag)) return error("Los trozos no están completos.");
    await env.MEDIA.resumeMultipartUpload(d.clave, String(d.id)).complete(partesR2);
    return json({ clave: d.clave }, 201);
  }

  // Abandonar: R2 suelta lo subido (si no, lo borra solo a los 7 días).
  if (partes.length === 2 && metodo === "DELETE") {
    const clave = url.searchParams.get("clave");
    const id = url.searchParams.get("id") ?? "";
    if (!(await clienteDeLaClave(acceso, clave))) return noEncontrado("Archivo");
    if (id) await env.MEDIA.resumeMultipartUpload(clave, id).abort().catch(() => {});
    return json({ ok: true });
  }

  return error(`Método ${metodo} no permitido aquí`, 405);
}
