// ============================================================
// «Llevar al estudio»: lo que contestan los clientes de un cliente, a las maletas del estudio de mercado (puro)
//
// La IA lee las respuestas de «La voz de tus clientes» (src/lib/vozCliente.js) y PROPONE qué añadir a cada producto del
// estudio: el problema y los diferenciales con sus palabras, las objeciones que casi los frenaron (con la respuesta que
// puede dar la marca) y los testimonios. Una persona marca lo que se queda y va al BORRADOR del estudio, que se aprueba
// como siempre (worker/lib/whatsapp.js).
//
// Los testimonios no se los cree el código a la IA: cada uno nombra la respuesta de la que sale (`respuestaId`), y
// `limpiarPropuestaVoz` comprueba que esa persona dio permiso, pone su nombre de la fila y exige que la cita sean sus
// palabras (si no lo son, toma su respuesta tal cual). Se vuelve a comprobar al aceptar: la propuesta la manda el
// navegador.
//
// Aparte de vozCliente.js a propósito: importa el estudio de mercado, y la página pública de la encuesta no lo necesita.
// ============================================================

import { jsonDe, limpiarEstudio, ELEMENTOS_MERCADO } from "./estudioMercado.js";
import { respuestaDeFila, respuestaATexto, MAX_PARA_ESTUDIO } from "./vozCliente.js";

/** Las maletas que la voz de los clientes alimenta, y lo que se escribe delante de lo que se añade. */
export const MALETAS_VOZ = Object.freeze(["problema", "diferenciales", "testimonios", "objeciones"]);
const PREFIJO_VOZ = "En palabras de sus clientes:";

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const lista = (v) => (Array.isArray(v) ? v : []);
const plano = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

/**
 * Lo que se le pide a la IA. `respuestas`: las de la encuesta (filas); `productos`: los del estudio, cada uno con
 * { id, nombre, maletas } (lo que ya dicen sus maletas, para no repetirlo). Pura.
 */
export function pedidoVozAlEstudio({ marca = "la marca", respuestas = [], productos = [] } = {}) {
  const rs = lista(respuestas).map(respuestaDeFila).filter(Boolean).slice(0, MAX_PARA_ESTUDIO);
  const nombreDe = new Map(lista(productos).map((p) => [p.id, p.nombre]));
  return [
    `Estas son respuestas reales de clientes de ${marca} a una encuesta corta. Léelas como estratega de marketing y propón qué AÑADIR al estudio de mercado de cada producto: las maletas de problema, diferenciales, objeciones y testimonios.`,
    "",
    "LAS RESPUESTAS (cada una con su id entre corchetes; «PUEDE SER TESTIMONIO» si la persona dio permiso con su nombre):",
    ...rs.map((r) => [
      `[${r.id}]${r.permiso && r.nombre ? ` PUEDE SER TESTIMONIO (${r.nombre})` : ""}${r.producto && nombreDe.get(r.producto) ? ` · compró: ${nombreDe.get(r.producto)}` : ""}`,
      respuestaATexto(r).split("\n").map((l) => `  ${l}`).join("\n"),
    ].join("\n")),
    "",
    "LO QUE YA DICE EL ESTUDIO DE CADA PRODUCTO (no repitas lo que ya está):",
    ...lista(productos).map((p) => [
      `[${p.id}] ${p.nombre}`,
      ...MALETAS_VOZ.filter((m) => m !== "objeciones" && p.maletas?.[m]).map((m) => `  ${ELEMENTOS_MERCADO.find((e) => e.clave === m)?.titulo ?? m}: ${corto(p.maletas[m], 400)}`),
      ...lista(p.objeciones).slice(0, 8).map((o) => `  Objeción ya respondida: ${corto(o.objecion, 160)}`),
    ].join("\n")),
    "",
    "Reglas:",
    "- Sólo lo que dicen las respuestas: nada inventado. Usa SUS palabras (cortas, concretas), no frases de marketing.",
    "- «problema» y «diferenciales»: de 0 a 4 frases cada una, lo que se repite o lo que sorprende y el estudio aún no dice.",
    "- «objeciones»: lo que casi los frenó, con la «respuesta» que puede dar la marca (con lo que ya dice el estudio; si no se sabe, escribe [completar: la respuesta]). Sin repetir las ya respondidas.",
    "- «testimonios»: SÓLO de respuestas marcadas «PUEDE SER TESTIMONIO», con su «respuestaId» y una «cita» corta copiada TAL CUAL de lo que escribió esa persona.",
    "- Si una respuesta dice qué compró, va a ese producto; si no, al que encaje (o a todos si vale para todos).",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"productos":[{"productoId":"…","problema":["…"],"diferenciales":["…"],"objeciones":[{"objecion":"…","respuesta":"…"}],"testimonios":[{"respuestaId":"…","cita":"…"}]}],"resumen":"lo que más se repite, en 2 frases"}',
  ].join("\n");
}

/**
 * La propuesta, limpia y COMPROBADA: productos del estudio, como mucho 4 frases por maleta, objeciones sin repetir y
 * testimonios sólo de quien dio permiso, con el nombre de su fila y una cita que sean sus palabras. Pura.
 * @param respuestas  las filas de la encuesta que se le dieron a la IA
 * @param productos   los del estudio: [{ id, nombre }]
 */
export function limpiarPropuestaVoz(d, { respuestas = [], productos = [] } = {}) {
  if (!d || typeof d !== "object") return null;
  const porId = new Map(lista(respuestas).map(respuestaDeFila).filter(Boolean).map((r) => [r.id, r]));
  const validos = new Map(lista(productos).map((p) => [p.id, p]));
  const frases = (v) => [...new Set(lista(v).map((x) => corto(x, 300)).filter(Boolean))].slice(0, 4);
  const salida = [];
  for (const p of lista(d.productos)) {
    const prod = validos.get(String(p?.productoId ?? ""));
    if (!prod || salida.some((x) => x.productoId === prod.id)) continue;
    const vistas = new Set();
    const objeciones = lista(p.objeciones).map((o) => ({ objecion: corto(o?.objecion, 200), respuesta: corto(o?.respuesta, 400) }))
      .filter((o) => o.objecion && o.respuesta && !vistas.has(plano(o.objecion)) && vistas.add(plano(o.objecion)))
      .slice(0, 5);
    const usadas = new Set();
    const testimonios = [];
    for (const t of lista(p.testimonios)) {
      const r = porId.get(String(t?.respuestaId ?? ""));
      if (!r || !r.permiso || !r.nombre || usadas.has(r.id)) continue;
      usadas.add(r.id);
      // La cita tiene que ser SUS palabras: si la IA la reescribió, se toma lo que la persona escribió.
      const suyas = Object.values(r.respuestas);
      const cita = corto(t?.cita, 300);
      const esSuya = cita && suyas.some((x) => plano(x).includes(plano(cita)));
      const respaldo = r.respuestas.sorpresa || r.respuestas.amigo || r.respuestas.porque || suyas[0] || "";
      testimonios.push({ respuestaId: r.id, nombre: r.nombre, cita: esSuya ? cita : corto(respaldo, 300) });
      if (testimonios.length >= 4) break;
    }
    const item = { productoId: prod.id, producto: prod.nombre, problema: frases(p.problema), diferenciales: frases(p.diferenciales), objeciones, testimonios };
    if (item.problema.length || item.diferenciales.length || objeciones.length || testimonios.length) salida.push(item);
  }
  return { productos: salida, resumen: corto(d.resumen, 400) };
}

/** La respuesta de la IA → la propuesta comprobada. Null si no se puede leer. Pura. */
export const leerPropuestaVoz = (texto, contexto) => limpiarPropuestaVoz(jsonDe(texto), contexto);

/** ¿La propuesta trae algo? Pura. */
export const propuestaVacia = (p) => !lista(p?.productos).length;

/** Añade frases a una maleta escrita, detrás de lo que había y sin repetir lo que ya dice. */
function anadir(texto, nuevas) {
  const antes = String(texto ?? "").trim();
  const ya = plano(antes);
  const faltan = nuevas.filter((f) => !ya.includes(plano(f)));
  if (!faltan.length) return antes;
  const bloque = `${PREFIJO_VOZ} ${faltan.map((f) => `«${f.replace(/[«»]/g, "")}»`).join(" · ")}`;
  return antes ? `${antes}\n${bloque}` : bloque;
}

/**
 * Pone lo aceptado en el estudio (el BORRADOR que se aprobará): frases detrás de lo que ya dicen el problema y los
 * diferenciales, los testimonios con su nombre, las objeciones nuevas (sin repetir, hasta 8). Sólo en productos que
 * ya tienen su estudio. → { estudio, cambios } (cuántas cosas entraron). Pura.
 */
export function aplicarPropuestaVoz(estudio, propuesta) {
  const e = limpiarEstudio(estudio);
  if (!e) return { estudio: null, cambios: 0 };
  let cambios = 0;
  const productos = { ...e.productos };
  for (const p of lista(propuesta?.productos)) {
    const actual = productos[p.productoId];
    if (!actual) continue;
    const elementos = { ...actual.elementos };
    for (const m of ["problema", "diferenciales"]) {
      const nuevo = anadir(elementos[m], lista(p[m]));
      if (nuevo !== String(elementos[m] ?? "").trim()) { elementos[m] = nuevo; cambios += 1; }
    }
    const testimonios = lista(p.testimonios).filter((t) => t?.cita && t?.nombre);
    if (testimonios.length) {
      const antes = String(elementos.testimonios ?? "").trim();
      const nuevos = testimonios.filter((t) => !plano(antes).includes(plano(t.cita))).map((t) => `«${t.cita.replace(/[«»]/g, "")}» — ${t.nombre}`);
      if (nuevos.length) { elementos.testimonios = [antes, ...nuevos].filter(Boolean).join("\n"); cambios += nuevos.length; }
    }
    const vistas = new Set(actual.objeciones.map((o) => plano(o.objecion)));
    const objeciones = [...actual.objeciones];
    for (const o of lista(p.objeciones)) {
      if (!o?.objecion || !o?.respuesta || vistas.has(plano(o.objecion)) || objeciones.length >= 8) continue;
      vistas.add(plano(o.objecion));
      objeciones.push({ objecion: o.objecion, respuesta: o.respuesta });
      cambios += 1;
    }
    productos[p.productoId] = { ...actual, elementos, objeciones };
  }
  return { estudio: limpiarEstudio({ ...e, productos }), cambios };
}
