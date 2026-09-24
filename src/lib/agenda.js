// ============================================================
// La agenda de tareas: qué toca hoy, qué se pasó y qué viene
//
// Pura y compartida: la usa «Mi día» para ordenar y el Worker para
// reabrir las recurrentes al leer. Una sola copia a propósito: si el
// navegador y el servidor calcularan «qué semana es» cada uno a su
// manera, una tarea se vería atrasada en la pantalla y cerrada en la
// base, y el síntoma no apuntaría a ninguno de los dos.
//
// LAS FECHAS VAN COMO TEXTO «AAAA-MM-DD»
//
// Y se opera sobre ellas en UTC, donde no hay horario de verano ni
// medianoches que se corran. El «hoy» se saca en la zona de la agencia
// (Panamá) y nunca con toISOString(), que convierte a UTC y a partir de
// las siete de la tarde ya da el día siguiente.
// ============================================================

export const ZONA_AGENDA = "America/Panama";

const DIA_MS = 86_400_000;

/** «Hoy» en la zona de la agencia, como AAAA-MM-DD. */
export function fechaEnZona(momento = new Date(), zona = ZONA_AGENDA) {
  // en-CA escribe justo AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(momento);
}

const aUTC = (f) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
const dos = (n) => String(n).padStart(2, "0");
const deUTC = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
};

export const esFecha = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);

export function sumarDias(f, n) {
  return deUTC(aUTC(f) + n * DIA_MS);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function diasEntre(a, b) {
  return Math.round((aUTC(b) - aUTC(a)) / DIA_MS);
}

/** 0 = domingo … 6 = sábado, como Date#getDay. */
export function diaSemana(f) {
  return new Date(aUTC(f)).getUTCDay();
}

function ultimoDelMes(anio, mes0) {
  return deUTC(Date.UTC(anio, mes0 + 1, 0));
}

function ultimoDiaSemanaDelMes(anio, mes0, dia) {
  let f = ultimoDelMes(anio, mes0);
  while (diaSemana(f) !== dia) f = sumarDias(f, -1);
  return f;
}

/** La fecha del ancla mensual dentro de un mes concreto. */
function anclaDelMes(ancla, anio, mes0) {
  const fin = ultimoDelMes(anio, mes0);
  if (ancla === "last_monday") return ultimoDiaSemanaDelMes(anio, mes0, 1);
  if (ancla === "last_friday") return ultimoDiaSemanaDelMes(anio, mes0, 5);
  if (ancla === "week_before_end") return sumarDias(fin, -7);
  const n = Number(ancla);
  const dia = Number.isInteger(n) && n >= 1 ? Math.min(n, +fin.slice(8, 10)) : 1;
  return deUTC(Date.UTC(anio, mes0, dia));
}

const sinValor = (v) => v === null || v === undefined || v === "";

/**
 * El periodo vigente de una tarea recurrente.
 *
 * `inicio` es desde cuándo cuenta el cumplimiento —hecha antes de esa
 * fecha, vuelve a estar pendiente—; `vence` es el día en que toca. Casi
 * siempre coinciden. No coinciden cuando la tarea no tiene día fijo:
 * una semanal «cualquier día» empieza el lunes pero no está atrasada
 * hasta que se acaba la semana, que es lo que la persona entendió al
 * crearla así.
 *
 * Devuelve null para las que no se repiten.
 */
export function periodoVigente(tarea, hoy) {
  const r = tarea?.recurrence;
  if (!r || r === "none") return null;

  if (r === "daily") return { inicio: hoy, vence: hoy };

  if (r === "weekly") {
    const d = tarea.recurrence_day;
    if (sinValor(d)) {
      const lunes = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7));
      return { inicio: lunes, vence: sumarDias(lunes, 6) };
    }
    const atras = (diaSemana(hoy) - Number(d) + 7) % 7;
    const f = sumarDias(hoy, -atras);
    return { inicio: f, vence: f };
  }

  if (r === "monthly") {
    const anio = +hoy.slice(0, 4);
    const mes0 = +hoy.slice(5, 7) - 1;
    const ancla = tarea.recurrence_day;
    if (sinValor(ancla)) {
      return { inicio: deUTC(Date.UTC(anio, mes0, 1)), vence: ultimoDelMes(anio, mes0) };
    }
    let f = anclaDelMes(String(ancla), anio, mes0);
    if (f > hoy) f = anclaDelMes(String(ancla), mes0 === 0 ? anio - 1 : anio, (mes0 + 11) % 12);
    return { inicio: f, vence: f };
  }

  return null;
}

/**
 * ¿Una recurrente cerrada tiene que volver a estar pendiente?
 *
 * Sí cuando se cerró ANTES de que empezara el periodo vigente: la de
 * los lunes que se hizo el lunes pasado, la diaria de ayer.
 */
export function debeReabrirse(tarea, hoy, zona = ZONA_AGENDA) {
  if (tarea?.status !== "completed" || !tarea.completed_at) return false;
  const p = periodoVigente(tarea, hoy);
  if (!p) return false;
  const cerrada = Date.parse(tarea.completed_at);
  if (!Number.isFinite(cerrada)) return false;
  return fechaEnZona(new Date(cerrada), zona) < p.inicio;
}

const hecha = (t) => t?.status === "completed" || t?.status === "done";

/**
 * El día en que le toca a una tarea pendiente, o null si no tiene.
 *
 * Gana la fecha MÁS TEMPRANA de las que tenga: si vence mañana y la
 * marcaste para hoy, es de hoy; si vencía ayer, está atrasada aunque la
 * hayas marcado para hoy —que no deje de verse el retraso—.
 */
export function fechaObjetivo(tarea, hoy) {
  const candidatas = [];
  if (esFecha(tarea?.today_date)) candidatas.push(tarea.today_date);
  if (esFecha(tarea?.due_date)) candidatas.push(tarea.due_date);
  const p = periodoVigente(tarea, hoy);
  if (p) candidatas.push(p.vence);
  if (!candidatas.length) return null;
  return candidatas.sort()[0];
}

/**
 * Reparte las tareas en los bloques de «Mi día».
 *
 * `foco` es el cliente en el que trabaja hoy quien mira: sus tareas van
 * delante dentro de cada bloque. Las tareas sin cliente (las rápidas)
 * traen `client_id` vacío.
 */
export function clasificar(tareas, hoy, { foco = null, zona = ZONA_AGENDA } = {}) {
  const bloques = { atrasadas: [], hoy: [], proximas: [], sinFecha: [], hechasHoy: [] };

  for (const t of tareas ?? []) {
    if (hecha(t)) {
      const cuando = Date.parse(t.completed_at ?? "");
      if (Number.isFinite(cuando) && fechaEnZona(new Date(cuando), zona) === hoy) {
        bloques.hechasHoy.push({ tarea: t, fecha: hoy, atraso: 0 });
      }
      continue;
    }
    const fecha = fechaObjetivo(t, hoy);
    const item = { tarea: t, fecha, atraso: fecha ? Math.max(0, diasEntre(fecha, hoy)) : 0 };
    if (!fecha) bloques.sinFecha.push(item);
    else if (fecha < hoy) bloques.atrasadas.push(item);
    else if (fecha === hoy) bloques.hoy.push(item);
    else bloques.proximas.push(item);
  }

  const primeroFoco = (a, b) =>
    foco ? Number(b.tarea.client_id === foco) - Number(a.tarea.client_id === foco) : 0;
  const porFecha = (a, b) => primeroFoco(a, b) || String(a.fecha).localeCompare(String(b.fecha));
  const porPosicion = (a, b) => primeroFoco(a, b) || (a.tarea.position ?? 0) - (b.tarea.position ?? 0);

  bloques.atrasadas.sort(porFecha);
  bloques.proximas.sort(porFecha);
  bloques.hoy.sort(porPosicion);
  bloques.sinFecha.sort(porPosicion);
  return bloques;
}

/** Cuántas están atrasadas, para el contador de la cabecera. */
export function contarAtrasadas(tareas, hoy) {
  return clasificar(tareas, hoy).atrasadas.length;
}

export function textoAtraso(dias) {
  if (dias <= 0) return "";
  return dias === 1 ? "Atrasada 1 día" : `Atrasada ${dias} días`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «Hoy», «Mañana» o «26 sep». */
export function textoFecha(f, hoy) {
  if (!esFecha(f)) return "";
  if (f === hoy) return "Hoy";
  if (f === sumarDias(hoy, 1)) return "Mañana";
  return `${+f.slice(8, 10)} ${MESES_CORTOS[+f.slice(5, 7) - 1]}`;
}

/**
 * Lo que el asistente manda al crear una tarea, pasado a columnas.
 *
 * El modelo escribe la fecha como le viene; lo que no sea AAAA-MM-DD se
 * RECHAZA con un motivo en vez de guardarse, igual que la hora: una
 * fecha mal escrita se guardaba, el campo la mostraba vacía, y la IA
 * decía que la había puesto.
 */
export function tareaDesdeIA(input, hoy) {
  const rec = ["none", "daily", "weekly", "monthly"].includes(input?.recurrencia) ? input.recurrencia : "none";
  const limite = input?.fecha_limite;
  if (limite && !esFecha(limite)) {
    return { error: `No entendí la fecha «${limite}». Escríbela como AAAA-MM-DD.` };
  }
  return {
    recurrence: rec,
    due_date: limite || null,
    today_date: input?.para_hoy ? hoy : null,
  };
}

/** Las propiedades de fecha que se declaran en las dos herramientas crear_tarea. */
export const PROPIEDADES_FECHA_TAREA = Object.freeze({
  recurrencia: {
    type: "string",
    enum: ["none", "daily", "weekly", "monthly"],
    description: "Frecuencia: none (una vez, por defecto), daily (cada día, p. ej. subir las historias), weekly, monthly.",
  },
  fecha_limite: { type: "string", description: "Fecha límite en formato AAAA-MM-DD (opcional)." },
  para_hoy: { type: "boolean", description: "true para ponerla en «Mi día» de hoy (opcional)." },
});
