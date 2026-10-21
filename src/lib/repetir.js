// ============================================================
// «Post que se repite» (puro)
//
// Una publicación puede repetirse cada semana o cada mes. La regla vive EN la
// publicación de origen (`post.repetir`) y se lee de su propia fecha: «cada
// mes, el 2.º martes» es el martes del día en que está. Al mirar un mes, la
// vista calcula qué repeticiones le tocan y aún no están (`repeticionesPendientes`)
// y las OFRECE: el cajón del mes se crea al escribir, nunca al mirar, así que
// nada se crea solo.
//
// La copia lleva `repiteDe` (el id de la original) y `repeticion` (la fecha
// que le tocaba): así se sabe que ya está aunque después se mueva de día, y no
// lleva regla propia (si la llevara, cada copia sumaría otra serie).
// ============================================================

import { copiaDePublicacion } from "./subir.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ORDINAL = ["1.er", "2.º", "3.er", "4.º", "5.º"];

/** Las reglas que se entienden. Cualquier otro valor es «no se repite». */
export const REGLAS_REPETIR = ["semana", "mes-n", "mes-ultimo", "mes-dia"];

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f ?? ""));
const aFecha = (f) => new Date(`${f}T12:00:00`);
const dos = (n) => String(n).padStart(2, "0");
const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate(); // mes 1–12

/** El día de la semana (0 domingo) y su lugar en el mes (1.º, 2.º…; y si es el último). */
function anclaDe(fecha) {
  const d = aFecha(fecha);
  const dia = d.getDate();
  const total = diasDelMes(d.getFullYear(), d.getMonth() + 1);
  return { semana: d.getDay(), n: Math.ceil(dia / 7), ultimo: dia + 7 > total, dia };
}

/** Las opciones del selector para una publicación de esa fecha, con su frase. */
export function opcionesRepetir(fecha) {
  if (!fechaValida(fecha)) return [{ valor: "", etiqueta: "No se repite" }];
  const a = anclaDe(fecha);
  const nombre = DIAS[a.semana];
  const lista = [
    { valor: "", etiqueta: "No se repite" },
    { valor: "semana", etiqueta: `Cada semana, el ${nombre}` },
  ];
  // El 5.º martes no existe todos los meses: ahí sólo se ofrece «el último».
  if (a.n <= 4) lista.push({ valor: "mes-n", etiqueta: `Cada mes, el ${ORDINAL[a.n - 1]} ${nombre}` });
  if (a.ultimo) lista.push({ valor: "mes-ultimo", etiqueta: `Cada mes, el último ${nombre}` });
  lista.push({ valor: "mes-dia", etiqueta: `Cada mes, el día ${a.dia}` });
  return lista;
}

/** La frase de una regla («Cada mes, el 2.º martes»), o "" si no se repite. */
export function fraseRepetir(regla, fecha) {
  if (!REGLAS_REPETIR.includes(regla)) return "";
  return opcionesRepetir(fecha).find((o) => o.valor === regla)?.etiqueta ?? "";
}

/**
 * Las fechas del mes «AAAA-MM» en que toca la regla de una publicación de `origen`, SIEMPRE después del origen
 * (la original ya ocupa su día). Un «día 31» no existe en todos los meses: ese mes no toca.
 */
export function fechasDeRegla(regla, origen, mes) {
  if (!REGLAS_REPETIR.includes(regla) || !fechaValida(origen) || !/^\d{4}-\d{2}$/.test(String(mes ?? ""))) return [];
  const [anio, m] = mes.split("-").map(Number);
  const total = diasDelMes(anio, m);
  const a = anclaDe(origen);
  const delDia = (d) => `${mes}-${dos(d)}`;
  const mismosDias = [];
  for (let d = 1; d <= total; d++) if (new Date(anio, m - 1, d).getDay() === a.semana) mismosDias.push(d);
  let dias;
  if (regla === "semana") dias = mismosDias;
  else if (regla === "mes-n") dias = mismosDias[a.n - 1] ? [mismosDias[a.n - 1]] : [];
  else if (regla === "mes-ultimo") dias = [mismosDias[mismosDias.length - 1]];
  else dias = a.dia <= total ? [a.dia] : [];
  return dias.map(delDia).filter((f) => f > origen);
}

/** Todas las publicaciones de los calendarios del cliente, con su fecha. */
function* publicaciones(calendarios = []) {
  for (const cal of calendarios ?? []) {
    for (const d of cal?.days ?? []) for (const p of d?.posts ?? []) yield { post: p, fecha: d.date, cal };
  }
}

/** La clave de una repetición: qué original y qué fecha. */
export const claveRepeticion = (origenId, fecha) => `${origenId}|${fecha}`;

/**
 * Lo que le toca al mes «AAAA-MM» y aún no está: { origen, fechaOrigen, calOrigen, fecha, clave }, por fecha.
 * Sólo desde `hoy` (lo que ya pasó no se ofrece), sin las que ya tienen copia —en cualquier día: se pudo mover—
 * ni las que alguien dijo «Ahora no» (`omitidas`, claves de `claveRepeticion`).
 */
export function repeticionesPendientes(calendarios = [], mes, { hoy = "", omitidas = [] } = {}) {
  const hechas = new Set();
  const reglas = [];
  for (const { post, fecha, cal } of publicaciones(calendarios)) {
    if (post?.repiteDe && post?.repeticion) hechas.add(claveRepeticion(post.repiteDe, post.repeticion));
    // Una copia no repite: si alguien le pusiera regla, serían dos series de lo mismo.
    if (REGLAS_REPETIR.includes(post?.repetir) && !post?.repiteDe) reglas.push({ origen: post, fechaOrigen: fecha, calOrigen: cal });
  }
  const fuera = new Set(omitidas ?? []);
  const lista = [];
  for (const r of reglas) {
    for (const fecha of fechasDeRegla(r.origen.repetir, r.fechaOrigen, mes)) {
      const clave = claveRepeticion(r.origen.id, fecha);
      if (fecha < hoy || hechas.has(clave) || fuera.has(clave)) continue;
      lista.push({ ...r, fecha, clave });
    }
  }
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.clave.localeCompare(y.clave));
}

// Lo que la IA escribe de nuevo en cada repetición: lo que el público LEE y VE. La idea (el brief), el título, el
// tipo, el producto, el formato, la hora y las redes se quedan: son lo que hace que sea «la misma publicación».
const TEXTOS_NUEVOS = ["descripcion", "script", "textoPieza", "escena", "hashtagsFinales", "primerComentario", "altTexto", "guion", "textoFacebook"];
// Los archivos son de la original: la copia es una IDEA hasta que se diseñe la suya.
const ARCHIVOS = ["image", "medios", "adaptados", "historias", "portada", "portadaMs", "portadaEncuadre"];

/**
 * La repetición de `origen` para `fecha`: una idea pendiente con la misma información y sin archivos. Con
 * `textosNuevos`, sin los textos que se leen y se ven, para que la IA los escriba otra vez («Completar los textos
 * que faltan», «Producir el mes») y cada mes salga distinta. Pura.
 */
export function copiaRepetida(origen = {}, fecha, id, { textosNuevos = true } = {}) {
  const copia = copiaDePublicacion(origen, id);
  for (const k of ARCHIVOS) delete copia[k];
  if (textosNuevos) for (const k of TEXTOS_NUEVOS) delete copia[k];
  delete copia.repetir;
  return { ...copia, aprobacion: "idea", repiteDe: origen.id, repeticion: fecha };
}

/** El calendario con la regla de una publicación cambiada (o quitada con ""). Pura. */
export function conRegla(cal, postId, regla) {
  return {
    ...cal,
    days: (cal?.days ?? []).map((d) => ({
      ...d,
      posts: (d.posts ?? []).map((p) => {
        if (p.id !== postId) return p;
        const nuevo = { ...p };
        if (REGLAS_REPETIR.includes(regla)) nuevo.repetir = regla;
        else delete nuevo.repetir;
        return nuevo;
      }),
    })),
  };
}
