// ============================================================
// Las fechas especiales del calendario (puro)
//
// Un catálogo fijo —feriados de Panamá, fechas comerciales y días
// internacionales— que sale solo en el calendario de todos los clientes,
// y lo que cada cliente decide encima (`client.fechasEspeciales`):
//
//   { elegidas: [id…],   las del catálogo que le importan (se destacan y
//                        van a la IA al planificar),
//     ocultas:  [id…],   las que no quiere ver,
//     propias:  [{ id, dia: "MM-DD" | fecha: "AAAA-MM-DD", nombre, porque }],
//                        las suyas: su aniversario, días de su rubro…
//                        `dia` se repite cada año; `fecha`, una vez,
//     elegidasAt }       cuándo se eligieron con la IA.
//
// Sin elegir nada, se ven los feriados y las comerciales; los días
// internacionales sólo si se eligen (son muchos y casi todos no tocan).
//
// La búsqueda en internet de Anthropic está apagada en la cuenta: la IA
// elige del catálogo y propone días de su rubro con lo que sabe, y lo
// propuesto se marca «verifícala» hasta que una persona lo confirme.
// ============================================================

const dos = (n) => String(n).padStart(2, "0");
const iso = (a, m0, d) => `${a}-${dos(m0 + 1)}-${dos(d)}`;
const DIA_MS = 86_400_000;
const masDias = (f, n) => {
  const d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) + n * DIA_MS);
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Domingo de Pascua (algoritmo anónimo gregoriano). Pura. */
export function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes - 1, dia);
}

/** El n-ésimo `dow` (0 = domingo) de un mes. Pura. */
function enesimo(anio, m0, dow, n) {
  const primero = new Date(Date.UTC(anio, m0, 1)).getUTCDay();
  return iso(anio, m0, 1 + ((dow - primero + 7) % 7) + (n - 1) * 7);
}

const REGLAS = {
  sabadoCarnaval: (a) => masDias(pascua(a), -50),
  martesCarnaval: (a) => masDias(pascua(a), -47),
  ceniza: (a) => masDias(pascua(a), -46),
  juevesSanto: (a) => masDias(pascua(a), -3),
  viernesSanto: (a) => masDias(pascua(a), -2),
  pascua,
  diaDelPadre: (a) => enesimo(a, 5, 0, 3),
  blackFriday: (a) => masDias(enesimo(a, 10, 4, 4), 1),
  cyberMonday: (a) => masDias(enesimo(a, 10, 4, 4), 4),
};

/**
 * El catálogo. `tipo`: feriado (de Panamá, nacional o local), comercial
 * (mueve ventas) o internacional (días mundiales). `delicada`: un día de
 * duelo o de conmemoración seria; la IA no hace promociones ahí.
 */
export const CATALOGO = Object.freeze([
  // Feriados y fechas patrias de Panamá
  { id: "anio-nuevo", dia: "01-01", nombre: "Año Nuevo", tipo: "feriado" },
  { id: "martires", dia: "01-09", nombre: "Día de los Mártires", tipo: "feriado", delicada: true },
  { id: "sabado-carnaval", regla: "sabadoCarnaval", nombre: "Inicio del Carnaval", tipo: "comercial" },
  { id: "martes-carnaval", regla: "martesCarnaval", nombre: "Martes de Carnaval", tipo: "feriado" },
  { id: "ceniza", regla: "ceniza", nombre: "Miércoles de Ceniza", tipo: "feriado", delicada: true },
  { id: "jueves-santo", regla: "juevesSanto", nombre: "Jueves Santo", tipo: "feriado", delicada: true },
  { id: "viernes-santo", regla: "viernesSanto", nombre: "Viernes Santo", tipo: "feriado", delicada: true },
  { id: "pascua", regla: "pascua", nombre: "Domingo de Resurrección", tipo: "feriado" },
  { id: "trabajo", dia: "05-01", nombre: "Día del Trabajo", tipo: "feriado" },
  { id: "panama-la-vieja", dia: "08-15", nombre: "Fundación de la ciudad de Panamá", tipo: "feriado" },
  { id: "separacion", dia: "11-03", nombre: "Separación de Panamá de Colombia", tipo: "feriado" },
  { id: "bandera", dia: "11-04", nombre: "Día de la Bandera", tipo: "feriado" },
  { id: "colon", dia: "11-05", nombre: "Consolidación de la Separación (Colón)", tipo: "feriado" },
  { id: "grito", dia: "11-10", nombre: "Primer Grito de Independencia", tipo: "feriado" },
  { id: "independencia", dia: "11-28", nombre: "Independencia de Panamá de España", tipo: "feriado" },
  { id: "madre", dia: "12-08", nombre: "Día de la Madre", tipo: "feriado" },
  { id: "duelo", dia: "12-20", nombre: "Día de Duelo Nacional", tipo: "feriado", delicada: true },
  { id: "navidad", dia: "12-25", nombre: "Navidad", tipo: "feriado" },
  // Comerciales
  { id: "san-valentin", dia: "02-14", nombre: "Día del Amor y la Amistad", tipo: "comercial" },
  { id: "padre", regla: "diaDelPadre", nombre: "Día del Padre", tipo: "comercial" },
  { id: "halloween", dia: "10-31", nombre: "Halloween", tipo: "comercial" },
  { id: "black-friday", regla: "blackFriday", nombre: "Black Friday", tipo: "comercial" },
  { id: "cyber-monday", regla: "cyberMonday", nombre: "Cyber Monday", tipo: "comercial" },
  { id: "nochebuena", dia: "12-24", nombre: "Nochebuena", tipo: "comercial" },
  { id: "fin-de-anio", dia: "12-31", nombre: "Fin de año", tipo: "comercial" },
  // Internacionales
  { id: "cancer", dia: "02-04", nombre: "Día Mundial contra el Cáncer", tipo: "internacional", delicada: true },
  { id: "mujer", dia: "03-08", nombre: "Día Internacional de la Mujer", tipo: "internacional" },
  { id: "consumidor", dia: "03-15", nombre: "Día Mundial de los Derechos del Consumidor", tipo: "internacional" },
  { id: "felicidad", dia: "03-20", nombre: "Día Internacional de la Felicidad", tipo: "internacional" },
  { id: "agua", dia: "03-22", nombre: "Día Mundial del Agua", tipo: "internacional" },
  { id: "salud", dia: "04-07", nombre: "Día Mundial de la Salud", tipo: "internacional" },
  { id: "tierra", dia: "04-22", nombre: "Día de la Tierra", tipo: "internacional" },
  { id: "libro", dia: "04-23", nombre: "Día del Libro", tipo: "internacional" },
  { id: "danza", dia: "04-29", nombre: "Día Internacional de la Danza", tipo: "internacional" },
  { id: "enfermeria", dia: "05-12", nombre: "Día Internacional de la Enfermería", tipo: "internacional" },
  { id: "familia", dia: "05-15", nombre: "Día Internacional de la Familia", tipo: "internacional" },
  { id: "leche", dia: "06-01", nombre: "Día Mundial de la Leche", tipo: "internacional" },
  { id: "ambiente", dia: "06-05", nombre: "Día Mundial del Medio Ambiente", tipo: "internacional" },
  { id: "yoga", dia: "06-21", nombre: "Día Internacional del Yoga", tipo: "internacional" },
  { id: "amistad", dia: "07-30", nombre: "Día Internacional de la Amistad", tipo: "internacional" },
  { id: "juventud", dia: "08-12", nombre: "Día Internacional de la Juventud", tipo: "internacional" },
  { id: "fotografia", dia: "08-19", nombre: "Día Mundial de la Fotografía", tipo: "internacional" },
  { id: "paz", dia: "09-21", nombre: "Día Internacional de la Paz", tipo: "internacional" },
  { id: "turismo", dia: "09-27", nombre: "Día Mundial del Turismo", tipo: "internacional" },
  { id: "cafe", dia: "10-01", nombre: "Día Internacional del Café", tipo: "internacional" },
  { id: "animales", dia: "10-04", nombre: "Día Mundial de los Animales", tipo: "internacional" },
  { id: "salud-mental", dia: "10-10", nombre: "Día Mundial de la Salud Mental", tipo: "internacional" },
  { id: "alimentacion", dia: "10-16", nombre: "Día Mundial de la Alimentación", tipo: "internacional" },
  { id: "cancer-mama", dia: "10-19", nombre: "Día Internacional contra el Cáncer de Mama", tipo: "internacional", delicada: true },
  { id: "diabetes", dia: "11-14", nombre: "Día Mundial de la Diabetes", tipo: "internacional" },
  { id: "hombre", dia: "11-19", nombre: "Día Internacional del Hombre", tipo: "internacional" },
  { id: "discapacidad", dia: "12-03", nombre: "Día Internacional de las Personas con Discapacidad", tipo: "internacional" },
]);

const IDS = new Set(CATALOGO.map((f) => f.id));

export const TIPOS_FECHA = Object.freeze({
  feriado: "Feriado en Panamá",
  comercial: "Fecha comercial",
  internacional: "Día internacional",
  propia: "Del cliente",
});

const esDia = (d) => typeof d === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d);
const esFecha = (f) => typeof f === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(f);

/** Lo guardado en el cliente, limpio (lo que no se entiende se descarta). Pura. */
export function preferenciasFechas(guardado) {
  const g = guardado && typeof guardado === "object" ? guardado : {};
  const lista = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => IDS.has(x)))] : []);
  const propias = (Array.isArray(g.propias) ? g.propias : [])
    .filter((p) => p && typeof p.nombre === "string" && p.nombre.trim() && (esDia(p.dia) || esFecha(p.fecha)))
    .map((p) => ({
      id: String(p.id || `${p.dia || p.fecha}-${p.nombre}`).slice(0, 80),
      ...(esDia(p.dia) ? { dia: p.dia } : { fecha: p.fecha }),
      nombre: p.nombre.trim().slice(0, 120),
      porque: String(p.porque ?? "").slice(0, 300),
      ...(p.verificar ? { verificar: true } : {}),
    }));
  return { elegidas: lista(g.elegidas), ocultas: lista(g.ocultas), propias, ...(g.elegidasAt ? { elegidasAt: String(g.elegidasAt) } : {}) };
}

/** Las fechas del catálogo en un año, con su día. Pura. */
export function catalogoDelAnio(anio) {
  return CATALOGO.map((f) => ({ ...f, fecha: f.regla ? REGLAS[f.regla](anio) : `${anio}-${f.dia}` }));
}

/**
 * Las fechas especiales que se ven en un mes (`month` de 0 a 11), en orden.
 * Cada una: { id, fecha, nombre, tipo, destacada, delicada?, porque?, verificar? }.
 */
export function fechasDelMes(year, month, guardado) {
  const pref = preferenciasFechas(guardado);
  const elegidas = new Set(pref.elegidas);
  const ocultas = new Set(pref.ocultas);
  const prefijo = `${year}-${dos(month + 1)}`;
  const salida = [];
  for (const f of catalogoDelAnio(year)) {
    if (!f.fecha.startsWith(prefijo) || ocultas.has(f.id)) continue;
    const destacada = elegidas.has(f.id);
    if (f.tipo === "internacional" && !destacada) continue;
    salida.push({ id: f.id, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, destacada, ...(f.delicada ? { delicada: true } : {}) });
  }
  for (const p of pref.propias) {
    const fecha = p.dia ? `${year}-${p.dia}` : p.fecha;
    if (!fecha.startsWith(prefijo)) continue;
    salida.push({ id: p.id, fecha, nombre: p.nombre, tipo: "propia", destacada: true, porque: p.porque, ...(p.verificar ? { verificar: true } : {}) });
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : Number(b.destacada) - Number(a.destacada)));
}

/** fecha → [fechas especiales de ese día]. Pura. */
export function fechasPorDia(lista) {
  const m = new Map();
  for (const f of lista) {
    if (!m.has(f.fecha)) m.set(f.fecha, []);
    m.get(f.fecha).push(f);
  }
  return m;
}

/** Todas las del catálogo de un mes, también las internacionales y las ocultas (para escoger). Pura. */
export function catalogoDelMes(year, month) {
  const prefijo = `${year}-${dos(month + 1)}`;
  return catalogoDelAnio(year).filter((f) => f.fecha.startsWith(prefijo)).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/** Las fechas del mes como texto para la IA (planificar, asistente). Pura. */
export function fechasParaLaIA(lista) {
  return lista
    .filter((f) => f.destacada || f.tipo !== "internacional")
    .map((f) => `${f.fecha}: ${f.nombre}${f.destacada ? " (importante para este cliente)" : ""}${f.delicada ? " (fecha delicada: sin promociones ni tono festivo)" : ""}`)
    .join("\n");
}

/** Lo que se le pide a la IA para escoger las fechas de un cliente. Pura. */
export function pedidoDeFechas(contextoCliente, anio) {
  const lista = catalogoDelAnio(anio).map((f) => `${f.id} | ${f.fecha.slice(5)} | ${f.nombre} | ${f.tipo}`).join("\n");
  return [
    contextoCliente,
    "",
    `Eres estratega de contenido de una agencia en Panamá. Escoge las fechas especiales de ${anio} que de verdad le sirven a ESTA marca para su contenido en redes.`,
    "",
    "1) Del CATÁLOGO, los ids de las que le importan (no todas: sólo las que tienen relación con su rubro, su público o su oferta).",
    "2) Hasta 6 fechas PROPIAS de su rubro que no estén en el catálogo (días mundiales o nacionales bien establecidos, por ejemplo «Día Mundial del Café» para una cafetería). Sólo fechas que existan de verdad y de día fijo; si no estás seguro, no la pongas.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"elegidas":["id",...],"propias":[{"dia":"MM-DD","nombre":"…","porque":"una frase"}]}',
    "",
    "CATÁLOGO (id | MM-DD | nombre | tipo):",
    lista,
  ].join("\n");
}

/**
 * La respuesta de la IA → { elegidas, propias }. Ids que no están en el
 * catálogo y días mal escritos se descartan; las propias quedan marcadas
 * `verificar` (la IA no pudo buscar en internet). Pura.
 */
export function leerFechasDeIA(texto) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const elegidas = (Array.isArray(d.elegidas) ? d.elegidas : []).filter((x) => IDS.has(x));
  const propias = (Array.isArray(d.propias) ? d.propias : [])
    .filter((p) => p && esDia(p.dia) && typeof p.nombre === "string" && p.nombre.trim())
    .slice(0, 6)
    .map((p) => ({ id: `ia-${p.dia}-${p.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, dia: p.dia, nombre: p.nombre.trim().slice(0, 120), porque: String(p.porque ?? "").slice(0, 300), verificar: true }));
  return { elegidas: [...new Set(elegidas)], propias };
}

/**
 * Junta lo elegido por la IA con lo que ya había: lo que una persona ocultó
 * sigue oculto, y sus fechas propias (las no marcadas `verificar`) se quedan.
 * Pura.
 */
export function fundirEleccion(guardado, deIA, ahora = new Date().toISOString()) {
  const pref = preferenciasFechas(guardado);
  const ocultas = new Set(pref.ocultas);
  const confirmadas = pref.propias.filter((p) => !p.verificar);
  const nombres = new Set(confirmadas.map((p) => p.nombre.toLowerCase()));
  return preferenciasFechas({
    elegidas: [...new Set([...pref.elegidas, ...deIA.elegidas])].filter((id) => !ocultas.has(id)),
    ocultas: pref.ocultas,
    propias: [...confirmadas, ...deIA.propias.filter((p) => !nombres.has(p.nombre.toLowerCase()))],
    elegidasAt: ahora,
  });
}
