// ============================================================
// La cola de publicación, vista desde el navegador (puro)
//
// Las filas llegan de /api/publicar: una por publicación y red. Aquí se
// resumen para la rejilla, la lista y el panel.
// ============================================================

import { fechaEnZona, sumarDias } from "./agenda.js";
import { revisarPublicacion, momentoPublicacion, REDES, redesDe } from "./publicacion.js";
import { listaParaProgramar } from "./aprobacion.js";

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
 * «Programar todo lo aprobado»: las publicaciones que el cliente aprobó
 * COMO PIEZA FINAL (una idea aprobada está por producir, no por
 * programar), que no están en la cola (ni programadas, ni publicadas) y
 * cuyo día no ha pasado. Un directo no se programa: se hace en vivo.
 */
export function aprobadasSinProgramar(days = [], filas = [], hoy = fechaEnZona(new Date(), ZONA)) {
  const enCola = new Set(filas.filter((f) => f.estado !== "cancelada" && f.estado !== "error").map((f) => f.postId));
  const salida = [];
  for (const d of days) {
    if (!d?.date || d.date < hoy) continue;
    for (const p of d.posts ?? []) {
      if (listaParaProgramar(p) && !enCola.has(p.id)) salida.push({ post: p, fecha: d.date });
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
    const pedidas = redesDe(post, redesDelCliente);
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

// ------------------------------------------------------------
// La página Programación, como en Meta Business Suite: tres pestañas
// ------------------------------------------------------------

/** Las pestañas de la página: lo publicado, lo que va a salir y lo que no salió (lo que pide hacer algo). */
export const PESTANAS_PROGRAMACION = Object.freeze([
  ["publicadas", "Publicadas"],
  ["programadas", "Programadas"],
  ["no", "No publicadas"],
]);

/** Los formatos por los que se filtra (el de la fila: una historia automática es «historia»). */
export const FORMATOS_PROGRAMACION = Object.freeze([
  ["post", "Post"], ["carrusel", "Carrusel"], ["reel", "Reel"], ["historia", "Historia"],
]);

const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Las filas de cada pestaña con los filtros puestos, y cuántas hay en cada una. `dias` es lo publicado que se mira
 * hacia atrás (7, 30, 90); lo programado y lo que falló van enteros. Lo publicado, lo más reciente primero; lo
 * programado, lo más próximo primero. Pura.
 * @returns {{ publicadas: object[], programadas: object[], no: object[], cuentas: { publicadas, programadas, no } }}
 */
export function pestanasProgramacion(filas = [], { cliente = "", red = "", formato = "", texto = "", dias = 30 } = {}, hoy = fechaEnZona(new Date(), ZONA)) {
  const desde = sumarDias(hoy, -(dias - 1));
  const q = sinTildes(texto).trim();
  const pasa = (f) => (!cliente || f.clientId === cliente)
    && (!red || f.red === red)
    && (!formato || (f.formato ?? "post") === formato)
    && (!q || sinTildes(f.titulo).includes(q));
  const vivas = filas.filter((f) => f.estado !== "cancelada" && pasa(f));
  const momento = (f) => f.publicadaAt ?? f.programadaPara ?? "";
  const publicadas = vivas.filter((f) => f.estado === "publicada" && diaDeFila(f) >= desde).sort((a, b) => (momento(a) < momento(b) ? 1 : -1));
  const programadas = vivas.filter((f) => f.estado === "programada" || f.estado === "procesando").sort((a, b) => (a.programadaPara < b.programadaPara ? -1 : 1));
  const no = vivas.filter((f) => f.estado === "error").sort((a, b) => (a.programadaPara < b.programadaPara ? 1 : -1));
  return { publicadas, programadas, no, cuentas: { publicadas: publicadas.length, programadas: programadas.length, no: no.length } };
}

/** 2006 → «2006»; 12500 → «12,5 mil»; sin medir → «—». */
export function cifraCorta(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v < 10_000) return v.toLocaleString("es-PA");
  if (v < 1_000_000) return `${(Math.round(v / 100) / 10).toLocaleString("es-PA")} mil`;
  return `${(Math.round(v / 100_000) / 10).toLocaleString("es-PA")} M`;
}
