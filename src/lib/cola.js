// ============================================================
// La cola de publicación, vista desde el navegador (puro)
//
// Las filas llegan de /api/publicar: una por publicación y red. Aquí se
// resumen para la rejilla, la lista y el panel.
// ============================================================

import { fechaEnZona, sumarDias } from "./agenda.js";
import { revisarPublicacion, momentoPublicacion, REDES } from "./publicacion.js";

const ZONA = "America/Panama";

/** «vie, 5 oct, 10:00 a. m.», en la hora de Panamá. */
export const fechaHora = (iso) => new Date(iso).toLocaleString("es-PA", {
  timeZone: ZONA, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

/** «10:00 a. m.», en la hora de Panamá. */
export const horaDe = (iso) => new Date(iso).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });

export const TEXTO_ESTADO = {
  programada: "Programada",
  procesando: "Publicando…",
  publicada: "Publicada",
  error: "No se publicó",
};

/** La clave de una pieza: la red y, si es la historia que acompaña al post, «:historia». */
export const clavePieza = (red, variante = "post") => (variante === "historia" ? `${red}:historia` : red);

/** La fila más reciente por pieza (red y variante), sin las canceladas. */
export function colaDe(filas = [], postId) {
  const porPieza = {};
  for (const f of filas) {
    if (f.postId !== postId || f.estado === "cancelada") continue;
    porPieza[clavePieza(f.red, f.variante)] = f;
  }
  return porPieza;
}

/**
 * Una línea para la rejilla y la lista: si algo falló, eso; si falta por
 * salir, «programada»; si salió todo, «publicada». null si no hay cola.
 */
export function resumenCola(filas, postId) {
  const lista = Object.values(colaDe(filas, postId));
  if (!lista.length) return null;
  if (lista.some((f) => f.estado === "error")) return { estado: "error", icono: "alert", texto: "No se publicó" };
  if (lista.every((f) => f.estado === "publicada")) return { estado: "publicada", icono: "check", texto: "Publicada" };
  const proxima = lista.filter((f) => f.estado !== "publicada").map((f) => f.programadaPara).sort()[0];
  return { estado: "programada", icono: "clock", texto: `Programada · ${fechaHora(proxima)}` };
}


// ------------------------------------------------------------
// La página Programación: todo el espacio de un vistazo
// ------------------------------------------------------------

/** «Hoy», «Mañana» o «lunes 6 de octubre», para una fecha AAAA-MM-DD. */
export function nombreDia(fecha, hoy) {
  if (fecha === hoy) return "Hoy";
  const manana = sumarDias(hoy, 1);
  if (fecha === manana) return "Mañana";
  if (fecha === sumarDias(hoy, -1)) return "Ayer";
  const texto = new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El día (en Panamá) en que sale o salió una fila. */
export const diaDeFila = (f) => fechaEnZona(new Date(f.estado === "publicada" && f.publicadaAt ? f.publicadaAt : f.programadaPara), ZONA);

/**
 * Las filas que pasan los filtros de la página. `rango` son los días
 * hacia delante que se miran («hoy» = 1); lo que falló se enseña
 * siempre, sea del día que sea: es lo que hay que arreglar.
 */
export function filtrarCola(filas = [], { cliente = "", red = "", estado = "", rango = 7 } = {}, hoy = fechaEnZona(new Date(), ZONA)) {
  const hasta = sumarDias(hoy, rango - 1);
  return filas.filter((f) => {
    if (f.estado === "cancelada") return false;
    if (cliente && f.clientId !== cliente) return false;
    if (red && f.red !== red) return false;
    if (estado && (estado === "pendiente" ? !["programada", "procesando"].includes(f.estado) : f.estado !== estado)) return false;
    if (f.estado === "error" || f.estado === "publicada") return true;
    return diaDeFila(f) <= hasta;
  });
}

/**
 * Lo que enseña la página, en tres bloques: lo que falló (arriba, con su
 * motivo), lo que va a salir, por días, y lo que ya salió, del más
 * reciente al más antiguo.
 */
export function ordenarProgramacion(filas = [], hoy = fechaEnZona(new Date(), ZONA)) {
  const fallidas = filas.filter((f) => f.estado === "error").sort((a, b) => (a.programadaPara < b.programadaPara ? 1 : -1));
  const porDia = (lista, desc) => {
    const grupos = new Map();
    for (const f of [...lista].sort((a, b) => {
      const x = a.publicadaAt ?? a.programadaPara;
      const y = b.publicadaAt ?? b.programadaPara;
      return desc ? (x < y ? 1 : -1) : (x < y ? -1 : 1);
    })) {
      const d = diaDeFila(f);
      if (!grupos.has(d)) grupos.set(d, []);
      grupos.get(d).push(f);
    }
    return [...grupos].map(([fecha, lista]) => ({ fecha, nombre: nombreDia(fecha, hoy), filas: lista }));
  };
  return {
    fallidas,
    proximas: porDia(filas.filter((f) => f.estado === "programada" || f.estado === "procesando"), false),
    publicadas: porDia(filas.filter((f) => f.estado === "publicada"), true),
  };
}

/**
 * «Programar todo lo aprobado»: las publicaciones que el cliente aprobó,
 * que no están en la cola (ni programadas, ni publicadas) y cuyo día no
 * ha pasado. Un directo no se programa: se hace en vivo.
 */
export function aprobadasSinProgramar(days = [], filas = [], hoy = fechaEnZona(new Date(), ZONA)) {
  const enCola = new Set(filas.filter((f) => f.estado !== "cancelada" && f.estado !== "error").map((f) => f.postId));
  const salida = [];
  for (const d of days) {
    if (!d?.date || d.date < hoy) continue;
    for (const p of d.posts ?? []) {
      if (p?.status === "approved" && p.format !== "live" && !p.asistida && !enCola.has(p.id)) salida.push({ post: p, fecha: d.date });
    }
  }
  return salida;
}

/**
 * Antes de programar lo aprobado de una vez: qué puede salir y qué no, y
 * por qué. Se revisa con las MISMAS reglas que el panel, contra las redes
 * que el cliente tiene de verdad (las demás las salta el servidor). Lo
 * que el navegador arregla solo —convertir a JPEG, adaptar a 4:5 o 9:16—
 * no bloquea: son avisos.
 */
export function revisarAprobadas(candidatas = [], redesDelCliente = [], ahora = Date.now()) {
  return candidatas.map(({ post, fecha }) => {
    const pedidas = Array.isArray(post.redes) && post.redes.length ? post.redes : ["instagram"];
    const redes = pedidas.filter((r) => redesDelCliente.includes(r));
    const errores = [];
    if (!redes.length) {
      errores.push(`El cliente no tiene cuenta de ${pedidas.map((r) => REDES[r]?.nombre ?? r).join(" ni de ")} asignada.`);
    } else {
      errores.push(...revisarPublicacion(post, redes, { navegador: true }).errores);
    }
    const cuando = momentoPublicacion(fecha, post.publishTime);
    if (cuando && Date.parse(cuando) < ahora - 60_000) errores.push("Su día y hora ya pasaron.");
    return { post, fecha, redes, cuando, errores, lista: errores.length === 0 };
  });
}

/**
 * Lo que se publica A MANO desde el teléfono (música, stickers, encuestas:
 * lo que la API no deja): las publicaciones marcadas `asistida` que aún
 * no se han publicado, de hoy a `dias` más, y las atrasadas. Van en orden
 * de hora, que es el orden en que hay que hacerlas.
 */
export function asistidasPendientes(clients = [], hoy = fechaEnZona(new Date(), ZONA), dias = 7) {
  const hasta = sumarDias(hoy, dias - 1);
  const salida = [];
  for (const c of clients) {
    for (const cal of c.calendars ?? []) {
      for (const d of cal.days ?? []) {
        if (!d?.date || d.date > hasta) continue;
        for (const p of d.posts ?? []) {
          if (!p?.asistida || p.status === "published") continue;
          const cuando = momentoPublicacion(d.date, p.publishTime);
          salida.push({ cliente: c, calendario: cal, fecha: d.date, post: p, cuando, atrasada: d.date < hoy });
        }
      }
    }
  }
  return salida.sort((a, b) => (a.cuando < b.cuando ? -1 : 1));
}
