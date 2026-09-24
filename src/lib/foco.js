// ============================================================
// La empresa en foco: en cuál trabaja hoy cada persona
//
// Se guarda en el navegador, por persona y CON LA FECHA: es una decisión
// del día. Mañana se empieza sin foco, porque arrastrar el de ayer haría
// que el equipo viera a alguien «en Baby Caleb» cuando ya está en otra
// cosa y nadie se acordó de cambiarlo.
//
// El resto del equipo lo recibe por la presencia (vivo.enfocar), no por
// la base: vale mientras la persona está conectada, que es cuando dice
// algo cierto.
// ============================================================

import { lsGet, lsSet } from "../utils";

const clave = (userId) => `foco:${userId}`;

export function leerFoco(userId, hoy) {
  if (!userId) return null;
  try {
    const f = JSON.parse(lsGet(clave(userId)) ?? "null");
    return f?.fecha === hoy && typeof f.clienteId === "string" ? f.clienteId : null;
  } catch {
    return null;
  }
}

export function guardarFoco(userId, hoy, clienteId) {
  if (!userId) return;
  lsSet(clave(userId), JSON.stringify({ fecha: hoy, clienteId: clienteId || null }));
}
