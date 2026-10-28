// ============================================================
// La bomba del Estudio: lo que sigue sin nadie mirando
//
// La llama la ALARMA del Durable Object de cada espacio (worker/hub.js), que se
// pone al pedir un trabajo o un encargo (`despertar`) y se vuelve a poner sola
// mientras quede algo vivo. Cada vuelta es una invocación con sus propios
// límites (peticiones de salida y consultas a D1), así que da POCOS pasos y
// pide la siguiente en segundos: antes, sin la pestaña abierta, sólo el cron
// avanzaba UN trabajo por minuto, y lo que orquestaba el navegador no seguía.
//
// Los trabajos los avanza `avanzarTrabajo` y los encargos `avanzarEncargo`, las
// mismas funciones que llama la pantalla: el permiso de cada fila hace que dos
// no den el mismo paso.
// ============================================================

import { crearAcceso, estudioVivoDe, encargosPendientes } from "../acceso.js";
import { despertar } from "../despertar.js";
import { avanzarTrabajo, esperaDe } from "./trabajos.js";
import { avanzarEncargo } from "./encargos.js";

/** Pasos caros por vuelta (cada uno, hasta ~8 consultas y un par de peticiones de salida). */
export const PASOS_POR_VUELTA = 3;
/** Lo que se deja correr una vuelta antes de pedir la siguiente. */
export const PRESUPUESTO_MS = 25_000;

/**
 * Una vuelta para el espacio `ownerId`. → ms hasta la siguiente, o null si ya no queda nada vivo (la alarma no se
 * vuelve a poner hasta que alguien pida otra cosa).
 */
export async function bombear(env, ownerId, { pasos = PASOS_POR_VUELTA, presupuestoMs = PRESUPUESTO_MS } = {}) {
  const inicio = Date.now();
  const { trabajos, encargos } = await estudioVivoDe(env.DB, ownerId);
  if (!trabajos.length && !encargos.length) return null;
  const acceso = crearAcceso(env.DB, ownerId);
  const queda = () => Date.now() - inicio < presupuestoMs;
  let dados = 0;
  let espera = Infinity;

  for (const t of trabajos) {
    if (dados >= pasos || !queda()) break;
    // Lo que alguien está avanzando ahora (la pantalla) no se pisa; un video en cola, a su hora.
    const bloqueo = Date.parse(t.bloqueado_hasta || "") || 0;
    if (bloqueo > Date.now()) { espera = Math.min(espera, 3000); continue; }
    const e = esperaDe(t);
    if (e > 0) { espera = Math.min(espera, e); continue; }
    try {
      const r = await avanzarTrabajo(env, acceso, t.id);
      dados++;
      if (r?.espera) espera = Math.min(espera, r.espera);
    } catch (err) {
      console.error("bomba: trabajo", t.id, err?.message);
    }
  }
  for (const e of encargos) {
    if (dados >= pasos || !queda()) break;
    if ((Date.parse(e.bloqueado_hasta || "") || 0) > Date.now()) { espera = Math.min(espera, 3000); continue; }
    try {
      const r = await avanzarEncargo(env, acceso, e.id);
      if (r?.hizo) dados++;
    } catch (err) {
      console.error("bomba: encargo", e.id, err?.message);
    }
  }
  // Si algo se movió, la siguiente enseguida; si todo espera (un video, una imagen que el motor hace), a su hora.
  if (dados) return 1500;
  return Math.max(1500, Math.min(espera === Infinity ? 4000 : espera, 30_000));
}

/**
 * Del cron, el respaldo: un encargo que nadie avanza (la bomba se durmió o falló) da un paso, y se despierta a la bomba
 * de su espacio. → 1 si hizo algo.
 */
export async function encargosDelCron(env, ahora = new Date()) {
  const antesDe = new Date(ahora.getTime() - 15_000).toISOString();
  const [encargo] = await encargosPendientes(env.DB, ahora.toISOString(), antesDe, 1);
  if (!encargo) return 0;
  try {
    await avanzarEncargo(env, crearAcceso(env.DB, encargo.owner_id), encargo.id);
  } catch (e) {
    console.error("cron encargo:", encargo.id, e?.message);
  }
  await despertar(env, encargo.owner_id);
  return 1;
}
