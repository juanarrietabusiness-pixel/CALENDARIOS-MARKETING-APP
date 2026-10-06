// ============================================================
// Los tipos de contenido de la agencia y el ritmo semanal (puro)
//
// La agencia trabaja TODAS sus marcas con seis tipos de contenido, uno por
// día de la semana, para no pensar cada vez qué toca:
//
//   lunes Anuncio · martes Beneficios/Promociones · miércoles Servicios/
//   Productos · jueves Educativo · viernes Diferenciador · sábado 7 maletas
//   (garantía, testimonio, solución a un problema, respuesta a objeciones,
//   una por semana).
//
// El TIPO es la información que lleva el post; el ESTILO (el preset del kit
// de marca) es cómo se ve. Cada tipo dice qué datos necesita y cuál de los
// presets le va.
//
// El ritmo es de cada cliente (`clients.ritmo_contenido`) y por defecto el de
// la agencia. La temporada lo AJUSTA sin romperlo: `sugerenciasDeTemporada`
// propone como mucho dos cambios por semana, cada uno con su motivo, y una
// persona los acepta o no.
//
// Y la MATRIZ: cada publicación sale con su tipo, un producto del catálogo
// (rotando), un nivel de consciencia (según el tipo) y uno de los deseos y
// perfiles del estudio de mercado (rotando también), para que el mes no
// repita siempre lo mismo. Lo usan «Planificar mes», el panel de una
// publicación y los textos de la IA.
// ============================================================

import { MONTHS } from "../constants";
import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "./consciencia";

/** Los subtipos del sábado («7 maletas»): uno por semana, en este orden. */
export const SUBTIPOS_MALETAS = Object.freeze([
  { id: "garantia", nombre: "Garantía", nivel: "decision", regla: "La garantía REAL de la empresa (sólo si está escrita) y por qué le quita el riesgo a quien compra." },
  { id: "testimonio", nombre: "Testimonio", nivel: "producto", regla: "Un testimonio REAL que esté en el cerebro, con sus palabras. Si no hay ninguno, la idea es pedirle uno al cliente: nunca se inventa." },
  { id: "solucion", nombre: "Solución a un problema", nivel: "problema", regla: "Un problema concreto del cliente ideal y cómo lo resuelve el producto: el antes y el después." },
  { id: "objeciones", nombre: "Respuesta a objeciones", nivel: "producto", regla: "Una objeción del estudio de mercado y su respuesta, en tono cercano y sin ponerse a la defensiva." },
]);

/**
 * Los seis tipos. `niveles`: los niveles de consciencia a los que le habla (se van turnando); `producto`: si lleva
 * un producto del catálogo; `preset`: el estilo del kit que le va en el Estudio.
 */
export const PILARES = Object.freeze([
  { id: "anuncio", nombre: "Anuncio", niveles: ["decision", "producto"], producto: true, preset: "anuncio",
    datos: "producto, precio, beneficio principal y llamado a la acción",
    regla: "Pieza de venta directa de un producto o servicio: el beneficio principal, el precio EXACTO del catálogo y un llamado a la acción claro (WhatsApp)." },
  { id: "beneficios", nombre: "Beneficios / Promociones", niveles: ["decision"], producto: true, preset: "anuncio",
    datos: "oferta, precio, código y vigencia",
    regla: "La oferta del mes o del producto: qué gana, el precio (antes y después si lo hay), el código y hasta cuándo. Sin oferta escrita, un beneficio concreto: nunca se inventa un descuento." },
  { id: "servicios", nombre: "Servicios / Productos", niveles: ["producto", "solucion"], producto: true, preset: "producto",
    datos: "un producto del catálogo, sus beneficios y su precio",
    regla: "Presenta un producto o servicio del catálogo: qué es, para quién, sus beneficios y su precio." },
  { id: "educativo", nombre: "Educativo / Informativo", niveles: ["inconsciente", "problema"], producto: false, preset: "creativo",
    datos: "un problema del cliente ideal y el dato que lo explica",
    regla: "Enseña algo útil sobre un problema del cliente ideal (del estudio de mercado): un dato, un consejo, un error común. Venta suave al final, sin precio." },
  { id: "diferenciador", nombre: "Diferenciador", niveles: ["solucion", "producto"], producto: false, preset: "corporativo",
    datos: "lo que hace única a la empresa",
    regla: "Por qué esta empresa y no otra: lo que el estudio de mercado señala como único (proceso, garantía, equipo, experiencia). Sin nombrar a la competencia." },
  { id: "maletas", nombre: "7 maletas", niveles: [], producto: true, preset: "anuncio", subtipos: SUBTIPOS_MALETAS,
    datos: "garantía, testimonio, solución a un problema o respuesta a una objeción",
    regla: "Contenido de confianza: una de las maletas (garantía, testimonio, solución a un problema, respuesta a objeciones), con datos REALES." },
]);

const IDS_PILAR = PILARES.map((p) => p.id);
export const pilarDe = (id) => PILARES.find((p) => p.id === id) ?? null;
const subtipoDe = (id) => SUBTIPOS_MALETAS.find((s) => s.id === id) ?? null;

/** «7 maletas · Testimonio». Vacío si no hay tipo. */
export function nombreDePilar(id, sub = "") {
  const p = pilarDe(id);
  if (!p) return "";
  const s = p.id === "maletas" ? subtipoDe(sub) : null;
  return s ? `${p.nombre} · ${s.nombre}` : p.nombre;
}

/** El preset del kit de marca que le va a un tipo (para «Crear con IA»). */
export const presetDePilar = (id) => pilarDe(id)?.preset ?? "";

/** El ritmo de la agencia: día de la semana (0 = domingo) → tipo. El domingo, libre. */
export const RITMO_POR_DEFECTO = Object.freeze({ 0: "", 1: "anuncio", 2: "beneficios", 3: "servicios", 4: "educativo", 5: "diferenciador", 6: "maletas" });

/** El ritmo guardado de un cliente, limpio; sin guardar, el de la agencia. Pura. */
export function limpiarRitmo(guardado) {
  const g = guardado && typeof guardado === "object" ? guardado : null;
  const salida = {};
  for (let dow = 0; dow < 7; dow++) {
    const v = g ? g[dow] ?? g[String(dow)] : RITMO_POR_DEFECTO[dow];
    salida[dow] = IDS_PILAR.includes(v) ? v : "";
  }
  return salida;
}

// ------------------------------------------------------------
// La temporada
// ------------------------------------------------------------

const dos = (n) => String(n).padStart(2, "0");
const iso = (a, m0, d) => `${a}-${dos(m0 + 1)}-${dos(d)}`;
const diaDeSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
// Fechas como texto «AAAA-MM-DD» calculadas en UTC al mediodía: el día no se corre con la zona horaria.
const textoUTC = (d) => iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const restarDia = (fecha) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return textoUTC(d); };
/** Lunes de la semana de `fecha` (la semana va de lunes a domingo, como la rejilla). */
const lunesDe = (fecha) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return textoUTC(d); };

const VENDE = new Set(["anuncio", "beneficios"]);
export const MAX_CAMBIOS_POR_SEMANA = 2;

/**
 * Lo que la temporada sugiere cambiar del ritmo en un mes → [{ id, fecha, de, a, motivo }]. Como mucho
 * MAX_CAMBIOS_POR_SEMANA por semana; los delicados primero (sin promociones en un día de duelo); después, las
 * fechas que venden (comerciales y las propias del cliente): ese día y el anterior pasan a promoción. Pura.
 * @param fechas  las fechas especiales del mes (`fechasDelMes`).
 */
export function sugerenciasDeTemporada({ year, month, ritmo, fechas = [] }) {
  const r = limpiarRitmo(ritmo);
  const delMes = (f) => f.startsWith(`${year}-${dos(month + 1)}`);
  const candidatas = [];
  const ya = new Set();
  const proponer = (fecha, a, motivo, prioridad) => {
    if (!delMes(fecha) || ya.has(fecha)) return;
    const de = r[diaDeSemana(fecha)];
    if (!de || de === a) return;
    ya.add(fecha);
    candidatas.push({ id: `${fecha}:${a}`, fecha, de, a, motivo, prioridad });
  };
  for (const f of fechas.filter((x) => x.delicada)) {
    if (VENDE.has(r[diaDeSemana(f.fecha)])) proponer(f.fecha, "educativo", `${f.nombre}: fecha delicada, sin promociones`, 0);
  }
  for (const f of fechas.filter((x) => !x.delicada && (x.tipo === "comercial" || (x.tipo === "propia" && x.destacada)))) {
    for (const fecha of [f.fecha, restarDia(f.fecha)]) {
      if (!VENDE.has(r[diaDeSemana(fecha)])) proponer(fecha, "beneficios", `${f.nombre}: día de promoción`, 1);
    }
  }
  candidatas.sort((a, b) => a.prioridad - b.prioridad || (a.fecha < b.fecha ? -1 : 1));
  const porSemana = new Map();
  const salida = [];
  for (const c of candidatas) {
    const s = lunesDe(c.fecha);
    const n = porSemana.get(s) ?? 0;
    if (n >= MAX_CAMBIOS_POR_SEMANA) continue;
    porSemana.set(s, n + 1);
    const { prioridad: _p, ...limpio } = c;
    salida.push(limpio);
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** fecha → tipo de cada día del mes, con los cambios aceptados aplicados. Pura. */
export function ritmoDelMes(year, month, ritmo, aceptadas = []) {
  const r = limpiarRitmo(ritmo);
  const cambios = new Map(aceptadas.map((c) => [c.fecha, c.a]));
  const ultimo = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const salida = {};
  for (let d = 1; d <= ultimo; d++) {
    const fecha = iso(year, month, d);
    salida[fecha] = cambios.get(fecha) ?? r[diaDeSemana(fecha)];
  }
  return salida;
}

// ------------------------------------------------------------
// La matriz
// ------------------------------------------------------------

/**
 * A cada publicación (en orden de fecha) su tipo, subtipo, producto, nivel, deseo y perfil. Los productos rotan
 * entre los activos del catálogo; los niveles, dentro de los del tipo; los subtipos de «7 maletas», uno por vez;
 * los deseos y perfiles del estudio, cruzados (3 × 2 = 6 combinaciones antes de repetir). Lo que ya trae una
 * publicación (elegido a mano) se respeta. Pura.
 * @param publicaciones [{ fecha, pilar, ...lo que ya tenga }]
 * @param productos  los productos ACTIVOS del catálogo ({ id, nombre }), ya limpios (`productosActivos`).
 * @param deseos     los del estudio aprobado ({ deseo }); `perfiles`, ({ nombre }).
 */
export function asignarMatriz(publicaciones, { productos = [], deseos = [], perfiles = [] } = {}) {
  let iProducto = 0;
  let iMaleta = 0;
  let iCruce = 0;
  const vecesPilar = {};
  return publicaciones.map((p) => {
    const pilar = pilarDe(p.pilar);
    if (!pilar) return { ...p, pilar: "" };
    const n = vecesPilar[pilar.id] = (vecesPilar[pilar.id] ?? -1) + 1;
    const pilarSub = pilar.id === "maletas" ? (subtipoDe(p.pilarSub)?.id ?? SUBTIPOS_MALETAS[iMaleta++ % SUBTIPOS_MALETAS.length].id) : "";
    const nivel = CLAVES_NIVEL.includes(p.nivel) ? p.nivel
      : pilar.id === "maletas" ? subtipoDe(pilarSub).nivel
        : pilar.niveles[n % pilar.niveles.length];
    let productoId = p.productoId ?? "";
    let producto = p.producto ?? "";
    if (pilar.producto && productos.length && !productos.some((x) => x.id === productoId)) {
      const elegido = productos[iProducto++ % productos.length];
      productoId = elegido.id;
      producto = elegido.nombre;
    }
    const k = iCruce++;
    return {
      ...p,
      pilar: pilar.id,
      pilarSub,
      nivel,
      productoId: pilar.producto ? productoId : (p.productoId ?? ""),
      producto: pilar.producto ? producto : (p.producto ?? ""),
      deseo: p.deseo || (deseos.length ? deseos[k % deseos.length].deseo : ""),
      perfil: p.perfil || (perfiles.length ? perfiles[Math.floor(k / Math.max(deseos.length, 1)) % perfiles.length].nombre : ""),
    };
  });
}
/** Los campos de la matriz de una publicación, para copiar de una a otra. */
export const CAMPOS_MATRIZ = Object.freeze(["pilar", "pilarSub", "productoId", "producto", "nivel", "deseo", "perfil"]);

/**
 * Lo que la IA tiene que saber de una publicación por su tipo: qué información lleva, qué producto, a qué nivel de
 * consciencia le habla y a quién. Vacío si no tiene tipo. Va en las ideas, los guiones y las descripciones. Pura.
 */
export function lineasDeContenido(post = {}) {
  const pilar = pilarDe(post.pilar);
  if (!pilar) return "";
  const sub = pilar.id === "maletas" ? subtipoDe(post.pilarSub) : null;
  const nivel = NIVELES_CONSCIENCIA.find((n) => n.clave === post.nivel);
  return [
    `TIPO DE CONTENIDO: ${nombreDePilar(pilar.id, post.pilarSub)} — ${sub?.regla ?? pilar.regla}`,
    post.producto ? `PRODUCTO: ${post.producto} (su precio y oferta, EXACTAMENTE los del catálogo de productos y servicios)` : "",
    nivel ? `NIVEL DE CONSCIENCIA: ${nivel.nombre} (${nivel.ayuda.toLowerCase()}) — gancho por ${nivel.angulo === "dolor" ? "el DOLOR: lo que quiere evitar" : "la GANANCIA: lo que logra"}` : "",
    post.deseo || post.perfil ? `A QUIÉN Y QUÉ LO MUEVE: ${[post.perfil && `perfil «${post.perfil}»`, post.deseo && `deseo de ${post.deseo.toLowerCase()}`].filter(Boolean).join(", ")} (del estudio de mercado)` : "",
  ].filter(Boolean).join("\n");
}

/** Las reglas de los tipos, una vez por pedido (para «Planificar mes»). Pura. */
export function reglasDeLosTipos() {
  return [
    "TIPOS DE CONTENIDO (cada publicación dice el suyo; la idea tiene que cumplirlo):",
    ...PILARES.map((p) => `- ${p.nombre}: ${p.regla}`),
    ...SUBTIPOS_MALETAS.map((s) => `  · 7 maletas, ${s.nombre}: ${s.regla}`),
    "Si el tipo lleva precio u oferta, la idea los menciona EXACTOS (del catálogo). Nunca inventes precios, descuentos, garantías ni testimonios.",
  ].join("\n");
}

/** Cuántas publicaciones de cada tipo hay → [{ id, nombre, n }] (los que tienen alguna). Pura. */
export function mezclaDeTipos(posts = []) {
  const cuenta = {};
  for (const p of posts) if (pilarDe(p?.pilar)) cuenta[p.pilar] = (cuenta[p.pilar] ?? 0) + 1;
  return PILARES.filter((p) => cuenta[p.id]).map((p) => ({ id: p.id, nombre: p.nombre, n: cuenta[p.id] }));
}

/** «Lunes: Anuncio · Martes: …» para enseñar un ritmo en una línea. Pura. */
export function resumenRitmo(ritmo) {
  const r = limpiarRitmo(ritmo);
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => r[d]).map((d) => `${DIAS[d]}: ${pilarDe(r[d]).nombre}`).join(" · ");
}

/** «Del 24 de noviembre»: la fecha corta de una sugerencia. */
export const fechaCorta = (fecha) => `${+fecha.slice(8, 10)} de ${MONTHS[+fecha.slice(5, 7) - 1].toLowerCase()}`;

export { nombreDeNivel };
