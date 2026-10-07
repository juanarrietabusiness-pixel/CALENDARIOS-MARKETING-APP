// ============================================================
// Guardar una publicación en Drive, por mes y semana (lo que llama al Worker)
//
// Lo usan la casilla al programar y el botón de cada publicación
// (calendario/copiaDrive.jsx, calendario/botonGuardarDrive.jsx) y
// «Guardar el mes en Drive». Lo que se sube y con qué nombre lo decide
// `planDrive` (lib/drive.js); aquí se manda por tandas, porque cada
// invocación del Worker tiene un tope de llamadas a Google.
// ============================================================

import { guardarEnDrive } from "./db";
import { planDrive, guardadoTras, carpetasDeFecha } from "./drive";

const PIEZAS_POR_TANDA = 4;
const QUITAR_POR_TANDA = 3;

/**
 * Guarda en Drive lo que le falta a una publicación de un día, por tandas. No lanza salvo que Drive no esté
 * conectado o el servidor diga que no: lo que falle se cuenta en `fallos`.
 * → { guardadoDrive, guardados, fallos, quitados, total }
 */
export async function guardarPublicacionEnDrive(clienteId, post, fecha) {
  const plan = planDrive(post, fecha);
  const guardados = [];
  const fallos = [];
  const quitados = [];
  const quitar = [...plan.quitar];
  for (let i = 0; i < plan.subir.length || quitar.length;) {
    const piezas = plan.subir.slice(i, i + PIEZAS_POR_TANDA);
    i += piezas.length;
    const r = await guardarEnDrive(clienteId, { piezas, quitar: quitar.splice(0, QUITAR_POR_TANDA) });
    guardados.push(...(r.guardados ?? []));
    fallos.push(...(r.fallos ?? []));
    quitados.push(...(r.quitados ?? []));
  }
  return { guardadoDrive: guardadoTras(post, fecha, guardados), guardados, fallos, quitados, total: plan.total };
}

/** La frase de cómo quedó. */
export const fraseDeGuardado = ({ guardados, fallos }, fecha) => {
  const donde = carpetasDeFecha(fecha).join(" / ");
  if (fallos.length) return `En Drive: ${guardados.length} de ${guardados.length + fallos.length}. No se guardó ${fallos.join(", ")}.`;
  return guardados.length ? `Guardado en Drive: ${donde} (${guardados.length === 1 ? "1 archivo" : `${guardados.length} archivos`}).` : "";
};

