// ============================================================
// ¿Sigue sirviendo esta historia? La VIGENCIA de lo que vuelve como historia automática
//
// Decisión de la agencia (noviembre de 2026): en noviembre salían historias que decían «octubre», promociones del mes
// anterior y felicitaciones («Feliz Día del Niño», «Feliz día de la patria») de días que ya pasaron. «Eso no puede
// pasar, por nada del mundo.» Así que NINGUNA pieza sale sin tener una vigencia que llegue a su día:
//
//   · «siempre»: no caduca (un educativo, un producto sin promoción).
//   · «hasta»: sirve hasta `hasta` (AAAA-MM-DD) inclusive (una promoción, algo que nombra un mes o una fecha).
//   · «nunca»: no se reutiliza (una felicitación, un día especial, un evento).
//   · «sin_revisar»: aún no se sabe → NO SALE. Si la IA no puede mirarla, tampoco.
//
// Dos capas: las REGLAS de aquí (gratis, leen el texto de la publicación, su día y la oferta del mes) y la IA, que MIRA
// la imagen (el texto dentro del diseño no está en ningún campo). Gana la más restrictiva. Una persona puede corregirlo
// («Sí puede salir» / «Que no salga»). Puro: lo usan el Worker (worker/lib/historiasAuto.js) y la pantalla.
// ============================================================

export const VIGENCIAS = Object.freeze(["sin_revisar", "siempre", "hasta", "nunca"]);

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const NOMBRE_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const dos = (n) => String(n).padStart(2, "0");
const fechaDe = (a, m, d) => `${a}-${dos(m + 1)}-${dos(d)}`;
const finDeMes = (a, m) => fechaDe(a, m, new Date(Date.UTC(a, m + 1, 0)).getUTCDate());
const sumarDias = (fecha, n) => {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + n));
  return fechaDe(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const indiceMes = (palabra) => (palabra === "setiembre" ? 8 : MESES.indexOf(palabra));

/** Sin tildes ni mayúsculas, con los espacios juntos: así casan «Día», «dia» y «DÍA». */
export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

/** Lo que dice una publicación (lo que se lee y lo que se escribió de ella), en una cadena normalizada. */
export function textoDelPost(post = {}) {
  const p = post && typeof post === "object" ? post : {};
  return normalizar([p.title, p.idea, p.textoPieza, p.descripcion, p.script, p.guion, p.hashtagsFinales].filter((x) => typeof x === "string").join(" \n "));
}

/** Felicitar un día concreto: nunca vuelve. */
const FELICITACION = /\b(feliz|felices)\s+(dia|navidad|ano|anos|aniversario|cumple\w*|fiestas|halloween|pascua|carnaval\w*|fin de semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|independencia|semana santa|black|regreso|inicio|mes)\b|\bfelicidades\b|\bfelicitamos\b|\bfelicitaciones\b|\bte deseamos un\b|\bles deseamos un\b/;

/** Lo que es una PROMOCIÓN (caduca, como tarde, al acabar el mes en que se publicó). */
const PROMOCION = /\b\d{1,2}\s?%\s?(de\s)?(descuento|dcto|off|menos)\b|-\s?\d{1,2}\s?%|\bdescuentos?\b|\brebajas?\b|\bliquidacion\b|\b[23]\s?x\s?[12]\b|\bcodigo\b|\bcupon\b|\bpromo(cion|ciones)?\b|\bofertas?\b|\bprecio especial\b|\bsolo (por )?(hoy|esta semana|este mes|este fin)|\bhasta agotar\b|\bpor tiempo limitado\b|\bultim[oa]s? (dias|unidades|horas|cupos)\b|\bvalid[oa]s? (hasta|del|por|solo)\b|\baprovecha\b|\benvio gratis\b/;

/**
 * Los días especiales que se nombran: { patron, cuando(año) → AAAA-MM-DD }. Los del catálogo con su fecha; los que no
 * tienen fecha fija aquí (Día del Niño) con `null`: caducan al acabar el mes en que se publicaron.
 */
const pascua = (anio) => {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1, dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes, dia));
};
const desdePascua = (n) => (anio) => { const d = pascua(anio); d.setUTCDate(d.getUTCDate() + n); return fechaDe(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const fija = (mm, dd) => (anio) => `${anio}-${mm}-${dd}`;
const nesimo = (mes, diaSemana, n) => (anio) => {
  const d = new Date(Date.UTC(anio, mes, 1));
  const primero = (diaSemana - d.getUTCDay() + 7) % 7;
  return fechaDe(anio, mes, 1 + primero + 7 * (n - 1));
};
const blackFriday = (anio) => nesimo(10, 5, 4)(anio);
export const EVENTOS = Object.freeze([
  { nombre: "Navidad", patron: /\bnavidad|\bnavidena?s?\b|\bnavidenos?\b|\bnochebuena\b|\bfiestas decembrinas\b/, cuando: fija("12", "25") },
  { nombre: "Fin de año", patron: /\bano nuevo\b|\bfin de ano\b|\bnochevieja\b|\bano que termina\b/, cuando: fija("12", "31") },
  { nombre: "Black Friday", patron: /\bblack (friday|week|weekend)\b|\bviernes negro\b/, cuando: blackFriday },
  { nombre: "Cyber Monday", patron: /\bcyber ?monday\b/, cuando: (a) => sumarDias(blackFriday(a), 3) },
  { nombre: "Halloween", patron: /\bhalloween\b|\bnoche de brujas\b/, cuando: fija("10", "31") },
  { nombre: "San Valentín", patron: /\bsan valentin\b|\bdia del amor\b|\bamor y (la )?amistad\b/, cuando: fija("02", "14") },
  { nombre: "Día de la Madre", patron: /\bdia de (la|las) madres?\b|\bmama en su dia\b/, cuando: fija("12", "08") },
  { nombre: "Día del Padre", patron: /\bdia del padre\b|\bpapa en su dia\b/, cuando: nesimo(5, 0, 3) },
  { nombre: "Carnaval", patron: /\bcarnaval(es)?\b|\bcarnestolendas\b/, cuando: desdePascua(-47) },
  { nombre: "Semana Santa", patron: /\bsemana santa\b|\bviernes santo\b|\bjueves santo\b/, cuando: desdePascua(-2) },
  { nombre: "Fiestas patrias", patron: /\bpatria\b|\bpatrias\b|\bfiestas patrias\b|\bindependencia\b|\bdia de la bandera\b|\bseparacion de panama\b|\bgrito de independencia\b/, cuando: fija("11", "28") },
  { nombre: "Día del Trabajo", patron: /\bdia del trabajo\b|\bdia del trabajador\b/, cuando: fija("05", "01") },
  { nombre: "Regreso a clases", patron: /\bregreso a (clases|la escuela|el cole)\b|\bvuelta a (clases|la escuela)\b/, cuando: fija("03", "31") },
  { nombre: "Día del Niño", patron: /\bdia del nino\b|\bdia de los ninos\b|\bdia de la nina\b/, cuando: null },
  // Cualquier otro «Día del…», «Día de la…», «Día Mundial / Internacional de…»: un día concreto, sin fecha fija aquí.
  { nombre: "un día especial", patron: /\bdia (mundial|internacional|nacional)\b|\bdia (del|de la|de los|de las) (?!hoy\b|semana\b|entrega\b|pago\b|cita\b|evento\b|mes\b|ano\b)[a-z]{4,}/, cuando: null },
]);

/** La fecha de un evento en el año que le toca a una publicación del día `publicada` (a su alrededor, no un año después). */
function cuandoDelEvento(evento, publicada) {
  const anio = +publicada.slice(0, 4);
  if (!evento.cuando) return finDeMes(anio, +publicada.slice(5, 7) - 1);
  const candidatas = [anio - 1, anio, anio + 1].map((a) => evento.cuando(a));
  // La que cae desde 60 días antes de publicar en adelante, la más cercana: «Feliz Navidad» del 26-dic es la de ayer;
  // «Ya viene Black Friday» del 10-nov es la de este mes.
  return candidatas.filter((f) => f >= sumarDias(publicada, -60)).sort()[0] ?? candidatas[1];
}

/** El año de un mes nombrado sin año: el que queda a menos de seis meses de cuando se publicó. */
function anioDelMes(mes, publicada) {
  const anio = +publicada.slice(0, 4);
  const pub = +publicada.slice(5, 7) - 1;
  if (mes - pub > 6) return anio - 1;
  if (pub - mes > 6) return anio + 1;
  return anio;
}

/**
 * Lo que dicen las REGLAS de una publicación, sin la IA.
 *   post: la publicación (lo que va en la carga de la cola).
 *   publicada: el día en que salió (AAAA-MM-DD, Panamá).
 *   fechasDelDia: las fechas especiales del cliente ese día ([{ nombre, tipo }]).
 *   oferta: { offers, promoCode } del mes de su calendario.
 * → { vigencia: "nunca" | "hasta" | null, hasta?, motivo }. null = las reglas no ven nada que caduque (decide la IA).
 */
export function vigenciaPorReglas({ post = {}, publicada = "", fechasDelDia = [], oferta = {} } = {}) {
  const texto = textoDelPost(post);
  if (!FECHA.test(String(publicada))) return { vigencia: null, motivo: "" };
  const anio = +publicada.slice(0, 4);
  const mesPub = +publicada.slice(5, 7) - 1;

  if (FELICITACION.test(texto)) return { vigencia: "nunca", motivo: "Es una felicitación de un día concreto." };
  // Publicada en un día especial del cliente y lo nombra: era la publicación de ese día.
  for (const f of fechasDelDia ?? []) {
    const palabras = normalizar(f?.nombre).split(/[^a-z]+/).filter((p) => p.length >= 5 && !["mundial", "internacional", "nacional", "contra"].includes(p));
    if (palabras.some((p) => texto.includes(p))) return { vigencia: "nunca", motivo: `Es de ${f.nombre} (${diaCorto(publicada)}).` };
  }

  const fechas = []; // fechas explícitas: la publicación sirve hasta la ÚLTIMA que nombra
  const motivos = [];
  for (const ev of EVENTOS) {
    if (!ev.patron.test(texto)) continue;
    const f = cuandoDelEvento(ev, publicada);
    fechas.push(f);
    motivos.push(`Habla de ${ev.nombre}`);
    break; // un evento basta (el más concreto va primero)
  }

  // «15 de noviembre», «del 1 al 30 de noviembre», «noviembre de 2026».
  const conDia = new RegExp(`\\b(\\d{1,2})\\s+de\\s+${MES}(\\s+(de\\s+|del\\s+)?(20\\d\\d))?`, "g");
  const vistos = new Set();
  for (const m of texto.matchAll(conDia)) {
    const mes = indiceMes(m[2]);
    const dia = Math.min(+m[1], 31);
    if (dia < 1) continue;
    const a = m[5] ? +m[5] : anioDelMes(mes, publicada);
    fechas.push(fechaDe(a, mes, Math.min(dia, +finDeMes(a, mes).slice(8))));
    vistos.add(m.index + m[0].indexOf(m[2]));
    motivos.push(`Nombra el ${dia} de ${m[2]}`);
  }
  for (const m of texto.matchAll(new RegExp(`\\b${MES}(\\s+(de\\s+|del\\s+)?(20\\d\\d))?\\b`, "g"))) {
    if (vistos.has(m.index)) continue;
    const mes = indiceMes(m[1]);
    const a = m[4] ? +m[4] : anioDelMes(mes, publicada);
    fechas.push(finDeMes(a, mes));
    motivos.push(`Nombra ${m[1]}`);
  }
  // Un año pasado suelto («lo mejor de 2025»).
  for (const m of texto.matchAll(/\b(20\d\d)\b/g)) {
    if (+m[1] < anio) { fechas.push(`${m[1]}-12-31`); motivos.push(`Nombra ${m[1]}`); }
  }

  const relativas = [];
  if (/\bsolo (por )?hoy\b|\bhoy (ultimo|unico) dia\b/.test(texto)) relativas.push([publicada, "Dice «solo hoy»"]);
  if (/\beste fin( de semana)?\b|\beste finde\b|\beste (viernes|sabado|domingo)\b/.test(texto)) relativas.push([sumarDias(publicada, 3), "Habla de este fin de semana"]);
  if (/\besta semana\b/.test(texto)) relativas.push([sumarDias(publicada, 6), "Habla de esta semana"]);
  if (/\beste mes\b|\bel mes de\b/.test(texto)) relativas.push([finDeMes(anio, mesPub), "Habla de este mes"]);
  const hastaDia = /\bhasta (el )?(\d{1,2})\b(?!\s*(%|de\b|horas|h\b|am|pm|unidades|personas|anos|meses|cuotas))/.exec(texto);
  if (hastaDia) {
    const d = +hastaDia[2];
    if (d >= 1 && d <= 31) {
      const mismoMes = d >= +publicada.slice(8, 10);
      const m = mismoMes ? mesPub : (mesPub + 1) % 12;
      const a = mismoMes || mesPub < 11 ? anio : anio + 1;
      relativas.push([fechaDe(a, m, Math.min(d, +finDeMes(a, m).slice(8))), `Dice «hasta el ${d}»`]);
    }
  }
  const codigo = normalizar(oferta?.promoCode).trim();
  const esPromocion = PROMOCION.test(texto) || (codigo.length >= 3 && texto.includes(codigo));
  if (esPromocion) relativas.push([finDeMes(anio, mesPub), "Es una promoción"]);

  let hasta = fechas.length ? [...fechas].sort().at(-1) : null;
  if (relativas.length) {
    const corta = relativas.map(([f]) => f).sort()[0];
    const soloPromocion = relativas.every(([, m]) => m === "Es una promoción");
    // Una fecha explícita manda sobre «es una promoción» (que sólo pone el fin de mes cuando no dice hasta cuándo);
    // lo relativo («esta semana», «solo hoy», «hasta el 15») acota: lo más corto.
    if (!hasta) hasta = corta;
    else if (!soloPromocion && corta < hasta) hasta = corta;
  }
  if (!hasta) return { vigencia: null, motivo: "" };
  const todos = [...motivos, ...relativas.map(([, m]) => m)];
  return { vigencia: "hasta", hasta, motivo: `${todos[0]}${todos.length > 1 ? ` (y ${todos.length - 1} más)` : ""}.` };
}

/** De dos vigencias, la más RESTRICTIVA: nunca > hasta (la fecha más temprana) > siempre > sin revisar. */
export function combinarVigencia(a, b) {
  const x = a?.vigencia ? a : null;
  const y = b?.vigencia ? b : null;
  if (!x) return y ?? { vigencia: null, motivo: "" };
  if (!y) return x;
  if (x.vigencia === "nunca") return x;
  if (y.vigencia === "nunca") return y;
  if (x.vigencia === "hasta" && y.vigencia === "hasta") return x.hasta <= y.hasta ? x : y;
  if (x.vigencia === "hasta") return x;
  if (y.vigencia === "hasta") return y;
  return x.vigencia === "siempre" ? x : y;
}

/** ¿Puede salir esta pieza el día `fecha` (AAAA-MM-DD)? Sin revisar, NO. Pura. */
export function estaVigente(pieza, fecha) {
  if (!pieza || pieza.excluida === 1 || pieza.excluida === true) return false;
  if (pieza.vigencia === "siempre") return true;
  if (pieza.vigencia === "hasta") return FECHA.test(String(pieza.vigente_hasta ?? "")) && FECHA.test(String(fecha)) && pieza.vigente_hasta >= fecha;
  return false;
}

/** ¿Ya no va a servir nunca (para no prepararla ni revisarla)? Pura. */
export const yaCaducada = (v, hoy) => v?.vigencia === "nunca" || (v?.vigencia === "hasta" && FECHA.test(String(v.hasta ?? "")) && v.hasta < hoy);

const diaCorto = (f) => (FECHA.test(String(f)) ? `${+f.slice(8, 10)} ${NOMBRE_MES[+f.slice(5, 7) - 1]}${f.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${f.slice(0, 4)}` : ""}` : "");

/** Lo que dice la tarjeta de una pieza: «Siempre vigente», «Vence el 30 nov», «Venció el 31 oct», «No se reutiliza: …». */
export function etiquetaVigencia(p, hoy) {
  const v = p?.vigencia ?? "sin_revisar";
  if (v === "siempre") return { tono: "ok", texto: "Siempre vigente" };
  if (v === "hasta") return p.vigente_hasta >= hoy ? { tono: "aviso", texto: `Vence el ${diaCorto(p.vigente_hasta)}` } : { tono: "no", texto: `Venció el ${diaCorto(p.vigente_hasta)}` };
  if (v === "nunca") return { tono: "no", texto: "No se reutiliza" };
  return { tono: "aviso", texto: "Sin revisar: no sale todavía" };
}

/**
 * El pedido a la IA: mira cada publicación (su historia ya dibujada, con la imagen del post dentro) y dice si se puede
 * volver a sacar como historia a partir de HOY. `items`: [{ publicada, texto, fechasDelDia, oferta, reglas }].
 */
export function pedidoDeVigencia(items, hoy) {
  const lineas = items.map((it, i) => [
    `PUBLICACIÓN ${i + 1} (imagen ${i + 1}):`,
    `- Se publicó el ${it.publicada}.`,
    it.fechasDelDia?.length ? `- Ese día era: ${it.fechasDelDia.map((f) => f.nombre).join(", ")}.` : "",
    it.oferta?.offers ? `- La oferta de ese mes era: ${String(it.oferta.offers).slice(0, 300)}${it.oferta.promoCode ? ` (código ${it.oferta.promoCode})` : ""}.` : "",
    it.reglas?.vigencia ? `- Las reglas ya vieron: ${it.reglas.motivo} → ${it.reglas.vigencia === "nunca" ? "no se reutiliza" : `sirve hasta ${it.reglas.hasta}`}.` : "",
    `- Lo que dice la publicación: ${String(it.texto ?? "").slice(0, 900) || "(sin texto)"}`,
  ].filter(Boolean).join("\n"));
  return `Eres quien revisa las HISTORIAS AUTOMÁTICAS de una agencia de redes sociales. Cada día se vuelve a sacar como historia de Instagram algo que la marca ya publicó. Tu trabajo es que NUNCA vuelva a salir algo que ya no sirve. Hoy es ${hoy}.

Para cada publicación, MIRA SU IMAGEN (el texto escrito dentro del diseño cuenta tanto como el caption) y decide:
- "nunca": no se puede volver a sacar. Felicitaciones o saludos de un día concreto («Feliz Día del Niño», «Feliz día de la patria», «Felices fiestas»), fechas especiales, aniversarios, eventos, avisos de horario de un día, lanzamientos ya pasados, sorteos, cualquier cosa atada a un momento que no se repite.
- "hasta": sirve sólo hasta una fecha (pon "hasta": "AAAA-MM-DD"). Promociones, descuentos, códigos, precios especiales, ofertas «de temporada»: hasta el día que digan o, si no dicen, hasta el ÚLTIMO día del mes en que se publicaron. Algo que nombra un mes, una fecha o «esta semana»: hasta esa fecha.
- "siempre": no caduca: educa, muestra un producto o un servicio sin promoción ni fecha, un testimonio, la marca.

Reglas: si nombra un mes o una fecha (en la imagen o en el texto), NO es "siempre". Si dudas entre "siempre" y otra, escoge la otra. Si las reglas ya vieron algo, no puedes ser menos estricto que ellas.

${lineas.join("\n\n")}

Responde SÓLO con JSON, un objeto por publicación y en el mismo orden:
[{"n": 1, "vigencia": "siempre" | "hasta" | "nunca", "hasta": "AAAA-MM-DD" o null, "motivo": "una frase corta en español"}]`;
}

/** Lee la respuesta de la IA → { n: { vigencia, hasta?, motivo } }. Lo que no se entiende, no está. Pura. */
export function leerVigencia(texto, n) {
  const salida = {};
  const t = String(texto ?? "");
  const inicio = t.indexOf("[");
  const fin = t.lastIndexOf("]");
  if (inicio < 0 || fin <= inicio) return salida;
  let lista;
  try { lista = JSON.parse(t.slice(inicio, fin + 1)); } catch { return salida; }
  if (!Array.isArray(lista)) return salida;
  lista.forEach((x, i) => {
    const k = Number.isInteger(x?.n) && x.n >= 1 && x.n <= n ? x.n : i + 1;
    if (k > n || !["siempre", "hasta", "nunca"].includes(x?.vigencia)) return;
    const motivo = String(x.motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (x.vigencia === "hasta") {
      if (!FECHA.test(String(x.hasta ?? ""))) return; // un «hasta» sin fecha no se entiende: queda sin revisar
      salida[k] = { vigencia: "hasta", hasta: x.hasta, motivo };
    } else salida[k] = { vigencia: x.vigencia, motivo };
  });
  return salida;
}
