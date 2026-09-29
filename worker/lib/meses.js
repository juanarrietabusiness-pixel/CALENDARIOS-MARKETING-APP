// ============================================================
// El calendario siempre activo, visto desde el servidor
//
// Para la agencia hay UN calendario por cliente; por dentro, las
// publicaciones siguen guardadas por meses (`calendars`, una fila por
// cliente y mes). El mes es un cajón: no se crea a mano ni se nombra.
// Aquí viven las dos cosas que eso necesita:
//
//   · obtenerOCrearMes: el cajón de un mes, que se crea al ESCRIBIR la
//     primera publicación, nunca al mirar. Un índice único (0023) impide
//     que haya dos del mismo mes; si dos personas lo crean a la vez, la
//     segunda recibe el de la primera.
//   · moverDeMes: sacar una publicación de un mes y meterla en otro, con
//     todo lo que la señala (aprobación, conversación, cola, tareas, hilo
//     e historial), todo o nada. Lo hace `acceso.trasladarPublicacion`.
//
// Lo usan la API (worker/rutas/datos.js) y el MCP: una sola regla.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { ponerEnDia } from "../../src/lib/subir.js";
import { momentoPublicacion } from "../../src/lib/publicacion.js";
import { MONTHS } from "../../src/constants.js";

/** Un error de lo pedido (400, 404, 409…), con un texto para enseñar tal cual. */
export class ErrorMes extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f ?? "")) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`));
const leer = (texto, respaldo) => { try { return JSON.parse(texto); } catch { return respaldo; } };

/** El nombre del cajón: el mes y el año, que es lo único que dice. */
export const nombreDelMes = (year, month) => `${MONTHS[month]} ${year}`;

/**
 * La fila del mes de ese cliente. Si no existe, la crea vacía. El cliente
 * tiene que ser del espacio (y, para un colaborador, de los suyos): lo
 * comprueba la capa al leerlo y al insertar.
 */
export async function obtenerOCrearMes(acceso, clientId, year, month) {
  const a = Number(year);
  const m = Number(month);
  if (!Number.isInteger(a) || a < 2000 || a > 2100 || !Number.isInteger(m) || m < 0 || m > 11) {
    throw new ErrorMes("Mes no válido.");
  }
  const where = { client_id: String(clientId), year: a, month: m };
  const existente = await acceso.leerUno("calendars", where);
  if (existente) return { fila: existente, creado: false };
  if (!(await acceso.leerUno("clients", { id: String(clientId) }))) throw new ErrorMes("Cliente no encontrado.", 404);
  const fila = {
    id: uuid(), client_id: String(clientId), name: nombreDelMes(a, m), month: m, year: a,
    days: "[]", week_concepts: "[]", created_at: ahora(), updated_at: ahora(),
  };
  try {
    await acceso.insertar("calendars", fila);
  } catch (e) {
    // Otra persona lo creó a la vez: el índice único rechaza el segundo,
    // y lo que vale es el suyo.
    const ganador = await acceso.leerUno("calendars", where);
    if (ganador) return { fila: ganador, creado: false };
    throw e;
  }
  return { fila: await acceso.leerUno("calendars", { id: fila.id }), creado: true };
}

/** Dónde está una publicación dentro de los días de un mes. */
function hallar(days, postId) {
  for (const d of days ?? []) {
    const post = (d?.posts ?? []).find((p) => p?.id === postId);
    if (post) return { dia: d, post };
  }
  return null;
}

/**
 * Lleva una publicación de su mes a una fecha de OTRO mes del mismo
 * cliente. Devuelve las dos filas ya escritas.
 *
 * No se mueve:
 *   · lo publicado, ni lo que se está publicando o ya salió en alguna red;
 *   · lo programado, a un momento que ya pasó;
 *   · a otro cliente (el destino se busca con el cliente del origen).
 */
export async function moverDeMes(acceso, { calId, postId, fecha, ahoraMs = Date.now() }) {
  if (!esFecha(fecha)) throw new ErrorMes("La fecha va como AAAA-MM-DD.");
  const origen = await acceso.leerUno("calendars", { id: String(calId) });
  if (!origen) throw new ErrorMes("Calendario no encontrado.", 404);
  const diasOrigen = leer(origen.days, []);
  const hallada = hallar(diasOrigen, String(postId));
  if (!hallada) throw new ErrorMes("Esa publicación ya no está en ese mes. Recarga y vuelve a intentarlo.", 409);
  const [a, m] = fecha.split("-").map(Number);
  if (a === origen.year && m - 1 === origen.month) throw new ErrorMes("Esa fecha es del mismo mes: se mueve sin cambiar de mes.");

  if (hallada.post.status === "published") throw new ErrorMes("Ya está publicada: no se mueve.");
  const cola = await acceso.leer("publicaciones_programadas", { calendar_id: origen.id, post_id: hallada.post.id });
  if (cola.some((f) => ["procesando", "publicada"].includes(f.estado))) {
    throw new ErrorMes("Ya se está publicando o salió en alguna red: no se mueve.");
  }
  if (cola.some((f) => f.estado === "programada")) {
    const cuando = momentoPublicacion(fecha, hallada.post.publishTime);
    if (!cuando || Date.parse(cuando) < ahoraMs + 60_000) {
      throw new ErrorMes("Está programada y ese momento ya pasó: elige un día y una hora futuros.");
    }
  }

  const { fila: destino } = await obtenerOCrearMes(acceso, origen.client_id, a, m - 1);
  const nuevosOrigen = diasOrigen.map((d) => (d === hallada.dia ? { ...d, posts: d.posts.filter((p) => p?.id !== hallada.post.id) } : d));
  const nuevosDestino = ponerEnDia({ days: leer(destino.days, []) }, fecha, hallada.post).days;
  // La marca tiene que ser distinta de lo que ya había: si coincidiera al
  // milisegundo con el `updated_at` leído, la condición no probaría nada.
  let marca = ahora();
  if (marca === origen.updated_at || marca === destino.updated_at) marca = new Date(Date.parse(marca) + 1).toISOString();

  const ok = await acceso.trasladarPublicacion({
    origen, destino, postId: hallada.post.id, diasOrigen: nuevosOrigen, diasDestino: nuevosDestino, marca,
  });
  if (!ok) throw new ErrorMes("Alguien acaba de cambiar uno de los dos meses. No se movió nada: vuelve a intentarlo.", 409);
  return {
    origen: await acceso.leerUno("calendars", { id: origen.id }),
    destino: await acceso.leerUno("calendars", { id: destino.id }),
    post: hallada.post,
  };
}
