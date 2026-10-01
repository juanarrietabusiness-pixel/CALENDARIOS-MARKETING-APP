// ============================================================
// «Guardar copia en Drive» al programar
//
// Lo subido desde el equipo, lo creado en el Estudio o lo generado con IA
// vive en la aplicación (R2), y la agencia lo quiere también en la carpeta
// de Drive del cliente. La casilla sale sólo si el cliente tiene carpeta;
// se recuerda en este navegador. La copia la hace el Worker de R2 a Drive
// (`/api/drive/clientes/<id>/desde-publicacion`) y nunca tumba lo que la
// provoca: la publicación ya está programada cuando se copia.
//
// Lo usan «¿Cuándo sale?» del panel y «Subir».
// ============================================================

import { useId, useState } from "react";
import { copiarADrive } from "../../lib/db";
import { mediosParaCopiar } from "../../lib/drive";

const CLAVE = "copia-drive";
const recordada = () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; } };

/** El nombre de la copia: el día y el título, para encontrarla en Drive. */
export const prefijoCopia = (fecha, post) => [fecha, String(post?.title || post?.idea || "").slice(0, 60)].filter(Boolean).join(" ");

/**
 * @param clientId    el id del cliente en la base
 * @param disponible  el cliente tiene carpeta de Drive
 * @returns { casilla, copiar(post, prefijo) } — `copiar` no lanza nunca:
 *          devuelve null (no tocaba) o `{ copias, texto }`.
 */
export function useCopiaDrive(clientId, disponible) {
  const ids = useId();
  const [marcada, setMarcada] = useState(recordada);
  const cambiar = (v) => {
    setMarcada(v);
    try { localStorage.setItem(CLAVE, v ? "1" : "0"); } catch { /* sin almacenamiento: sólo esta vez */ }
  };

  const copiar = async (post, prefijo = "") => {
    if (!disponible || !marcada || !clientId) return null;
    const medios = mediosParaCopiar(post);
    if (!medios.length) return null;
    try {
      const { copiados = [], fallos = [] } = await copiarADrive(clientId, medios, prefijo);
      const copias = Object.fromEntries(copiados.map((c) => [c.src, c.id]));
      const texto = fallos.length
        ? `Copia en Drive: ${copiados.length} de ${medios.length}. No se copió ${fallos.join(", ")}.`
        : `Copia guardada en Drive (${copiados.length === 1 ? "1 archivo" : `${copiados.length} archivos`}).`;
      return { copias, texto };
    } catch (e) {
      return { copias: {}, texto: `No se guardó la copia en Drive: ${e.message}` };
    }
  };

  const casilla = disponible ? (
    <label className="casilla copia-drive" htmlFor={`${ids}-drive`}>
      <input id={`${ids}-drive`} type="checkbox" checked={marcada} onChange={(e) => cambiar(e.target.checked)} />
      <span>Guardar copia en la carpeta de Drive del cliente</span>
    </label>
  ) : null;

  return { casilla, copiar };
}
