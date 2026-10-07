// ============================================================
// Guardar las piezas en Drive, por mes y semana
//
// Lo subido desde el equipo, lo creado en el Estudio o lo generado con IA
// vive en la aplicación (R2), y la agencia lo quiere en la carpeta de
// Drive del cliente, ordenado: `Octubre 2026 / Semana 2 / Martes 6 -
// Semana 2 - 8 am.jpg` (lib/drive.js → planDrive). Dos formas:
//   · el botón «Guardar en Drive» de cada publicación (y «Guardar el mes
//     en Drive», que hace lo mismo con todas);
//   · la casilla al programar, en «¿Cuándo sale?» y en «Subir».
// La copia la hace el Worker de R2 a Drive (`/api/drive/clientes/<id>/
// guardar`), por tandas, y nunca tumba lo que la provoca.
// ============================================================

import { useId, useState } from "react";
import { planDrive } from "../../lib/drive";
import { guardarPublicacionEnDrive, fraseDeGuardado } from "../../lib/guardarDrive";

const CLAVE = "copia-drive";
const recordada = () => { try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; } };

/**
 * La casilla «Guardar en Drive» al programar. `copiar(post, fecha)` no lanza nunca: devuelve null (no tocaba) o
 * `{ guardadoDrive, texto }`.
 * @param clientId    el id del cliente en la base
 * @param disponible  el cliente tiene carpeta de Drive
 */
export function useCopiaDrive(clientId, disponible) {
  const ids = useId();
  const [marcada, setMarcada] = useState(recordada);
  const cambiar = (v) => {
    setMarcada(v);
    try { localStorage.setItem(CLAVE, v ? "1" : "0"); } catch { /* sin almacenamiento: sólo esta vez */ }
  };

  const copiar = async (post, fecha) => {
    if (!disponible || !marcada || !clientId) return null;
    const plan = planDrive(post, fecha);
    if (!plan.subir.length && !plan.quitar.length) return null;
    try {
      const r = await guardarPublicacionEnDrive(clientId, post, fecha);
      return { guardadoDrive: r.guardadoDrive, texto: fraseDeGuardado(r, fecha) };
    } catch (e) {
      return { guardadoDrive: null, texto: `No se guardó en Drive: ${e.message}` };
    }
  };

  const casilla = disponible ? (
    <label className="casilla copia-drive" htmlFor={`${ids}-drive`}>
      <input id={`${ids}-drive`} type="checkbox" checked={marcada} onChange={(e) => cambiar(e.target.checked)} />
      <span>Guardar en la carpeta de Drive del cliente (por mes y semana)</span>
    </label>
  ) : null;

  return { casilla, copiar };
}
