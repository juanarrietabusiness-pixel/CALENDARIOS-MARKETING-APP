// ============================================================
// El estratega de campañas (puro)
//
// Lo que hacía el bot de Felipe, con lo que la aplicación ya sabe del
// cliente: su ADN y su cerebro, el catálogo (precios), el estudio de
// mercado (los 7 elementos, los ganchos) y el kit. También para un
// producto que no está en el catálogo o para alguien que no es cliente:
// entonces se le da lo que haya y, si se pide, saca él las 7 maletas.
//
// Las CUENTAS las hace el código, no la IA: con el precio, la ganancia por
// venta y cuántas conversaciones acaban en venta sale el costo máximo que
// aguanta cada resultado; la IA sólo estima cuánto suele costar un
// resultado en ese rubro y país (un rango), y con eso salen tres
// escenarios. Así un número del plan nunca contradice a otro.
//
// El plan vuelve como JSON y se puede llevar a «Nueva campaña» (se crea en
// pausa, como todo). Los intereses llegan como palabras: se buscan en Meta
// al abrir la campaña. El «Manual de campañas de la agencia» (Ajustes)
// va siempre delante.
// ============================================================

import { ELEMENTOS_MERCADO } from "./estudioMercado.js";
import { OBJETIVOS, DESTINOS, TIPOS_CONJUNTO, MAX_CONJUNTOS, MAX_ANUNCIOS, MAX_TARJETAS, EDAD_MIN, EDAD_MAX, MAX_TEXTO, MAX_TITULO } from "./anuncios.js";

/** Las mejoras de oferta que la agencia propone (como sugerencia: la decide el cliente). */
export const TIPOS_OFERTA = Object.freeze({
  gratis: "Gratis (algo de regalo o sin costo)",
  garantia: "Garantía",
  pago_facil: "Pago fácil (cuotas, contra entrega)",
  urgencia: "Tiempo o cupos limitados",
  bono: "Bono o regalo con la compra",
});

/** Las etapas del embudo. */
export const ETAPAS_EMBUDO = Object.freeze({
  frio: "Frío: no te conocen",
  tibio: "Tibio: ya te vieron o te siguen",
  caliente: "Caliente: escribieron, visitaron o compraron",
});

/** Cómo se llama cada cosa en Meta, si el manual no dice otra. `{…}` se rellena. */
export const NOMENCLATURA_POR_DEFECTO = Object.freeze({
  campana: "{cliente} · {objetivo} · {producto} · {mes}",
  conjunto: "{tipo} · {edad} · {lugar}",
  anuncio: "{numero} · {formato} · {angulo}",
});

export const MAX_MANUAL = 6000;
export const TASA_CIERRE_POR_DEFECTO = 20; // de cada 100 conversaciones, cuántas compran
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r/g, "").trim().slice(0, n);
const redondeo = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------
// El manual de la agencia
// ------------------------------------------------------------

/** El manual guardado, limpio: { reglas, nomenclatura, tasaCierre }. Pura. */
export function limpiarManual(m = {}) {
  const n = m?.nomenclatura ?? {};
  const tasa = num(m?.tasaCierre);
  return {
    reglas: largo(m?.reglas, MAX_MANUAL),
    nomenclatura: Object.fromEntries(Object.entries(NOMENCLATURA_POR_DEFECTO).map(([k, def]) => [k, corto(n[k], 160) || def])),
    tasaCierre: tasa > 0 && tasa <= 100 ? tasa : TASA_CIERRE_POR_DEFECTO,
  };
}

/** Rellena una plantilla de nombre («{cliente} · {mes}»): lo que no se sabe se quita con su separador. Pura. */
export function nombreConPlantilla(plantilla, datos = {}) {
  const lleno = String(plantilla ?? "").replace(/\{(\w+)\}/g, (_, k) => corto(datos[k], 60));
  // Los separadores van entre espacios («Cliente · Ventas»): así «18-65» no se parte.
  const partes = lleno.split(/(?<=\s|^)([·|/–—-])(?=\s|$)/);
  let salida = "";
  let sep = "·";
  for (const [i, parte] of partes.entries()) {
    if (i % 2 === 1) { sep = parte; continue; }
    const t = parte.trim();
    if (t) salida = salida ? `${salida} ${sep} ${t}` : t;
  }
  return salida.slice(0, 200);
}

// ------------------------------------------------------------
// Las cuentas
// ------------------------------------------------------------

/**
 * Cuánto aguanta un resultado. `margen` es lo que se gana por venta, en % del precio (`margenTipo: "%"`) o en dinero;
 * `tasaCierre`, de cada 100 resultados (conversaciones, clientes potenciales) cuántos compran. Pura.
 * → { precio, ganancia, tasaCierre, costoMaxVenta, costoMaxResultado, costoObjetivo } o null si falta el precio o el margen.
 */
export function economia({ precio, margen, margenTipo = "%", tasaCierre = TASA_CIERRE_POR_DEFECTO } = {}) {
  const p = num(precio);
  const m = num(margen);
  const tasa = Math.min(100, Math.max(0.1, num(tasaCierre) || TASA_CIERRE_POR_DEFECTO));
  if (!(p > 0) || !(m > 0)) return null;
  const ganancia = margenTipo === "%" ? p * Math.min(m, 100) / 100 : Math.min(m, p);
  const costoMaxResultado = ganancia * tasa / 100;
  return {
    precio: redondeo(p), ganancia: redondeo(ganancia), tasaCierre: tasa,
    // Lo máximo que se puede pagar por una venta sin perder: la ganancia entera.
    costoMaxVenta: redondeo(ganancia),
    // Por resultado (conversación), al punto de equilibrio…
    costoMaxResultado: redondeo(costoMaxResultado),
    // …y el que deja ganar: la mitad (cada dólar en anuncios devuelve dos de ganancia).
    costoObjetivo: redondeo(costoMaxResultado / 2),
  };
}

/**
 * Tres escenarios con un presupuesto y lo que suele costar un resultado. `costos` son los de la IA (conservador,
 * esperado, optimista); sin ellos, se estiman del costo máximo. Pura.
 * → [{ id, nombre, costoResultado, resultados, ventas, ingreso, ganancia, retorno }]
 */
export function escenarios({ diario, dias, costos = {}, eco }) {
  const inversion = num(diario) * Math.max(1, Math.round(num(dias)) || 30);
  if (!(inversion > 0)) return [];
  const base = eco?.costoMaxResultado || 0;
  const c = {
    conservador: num(costos.conservador) || (base ? base * 0.9 : 0),
    esperado: num(costos.esperado) || (base ? base * 0.5 : 0),
    optimista: num(costos.optimista) || (base ? base * 0.3 : 0),
  };
  return [["conservador", "Conservador"], ["esperado", "Esperado"], ["optimista", "Optimista"]]
    .filter(([id]) => c[id] > 0)
    .map(([id, nombre]) => {
      const resultados = Math.floor(inversion / c[id]);
      const ventas = eco ? Math.floor(resultados * eco.tasaCierre / 100) : null;
      const ingreso = eco ? redondeo(ventas * eco.precio) : null;
      const ganancia = eco ? redondeo(ventas * eco.ganancia - inversion) : null;
      return {
        id, nombre, inversion: redondeo(inversion), costoResultado: redondeo(c[id]), resultados,
        ventas, ingreso, ganancia, retorno: eco && inversion ? Math.round((ingreso / inversion) * 10) / 10 : null,
      };
    });
}

// ------------------------------------------------------------
// Lo que se le pide a la IA
// ------------------------------------------------------------

const ESQUEMA = `{"resumen":"…","embudo":[{"etapa":"frio|tibio|caliente","objetivo":"…","idea":"…"}],"costos":{"conservador":0,"esperado":0,"optimista":0,"porque":"…"},"tasaCierre":0,"presupuesto":{"diario":0,"dias":30,"porque":"…"},"ofertas":[{"tipo":"gratis|garantia|pago_facil|urgencia|bono","texto":"…"}],"maletas":{${ELEMENTOS_MERCADO.map((e) => `"${e.clave}":"…"`).join(",")}},"campana":{"objetivo":"OUTCOME_SALES","destino":"whatsapp|web","conjuntos":[{"tipo":"intereses|advantage|similares|abierto","presupuestoDiario":0,"edadMin":18,"edadMax":65,"sexo":"todos|mujeres|hombres","intereses":["…"],"lugar":"…","porque":"…"}],"anuncios":[{"formato":"unico|carrusel","angulo":"…","pieza":"qué imagen o video usar","texto":"…","titulo":"…","descripcion":"…","tarjetas":[{"titulo":"…","descripcion":"…"}]}]},"pasos":["…"],"riesgos":["…"]}`;

/**
 * El pedido al estratega. `contexto` es lo que se sabe de la marca (ficha, cerebro, catálogo, estudio); `producto`, lo
 * que se anuncia ({ nombre, precio, descripcion, elementos? }); `eco`, las cuentas ya hechas. Con `planPegado` (el
 * plan de otro bot), lo pasa a esta forma en vez de inventar otro. Con `anterior` y `cambio`, lo ajusta. Pura.
 */
export function pedidoEstratega({
  marca, rubro = "", contexto = "", producto = {}, objetivo = "", destino = "whatsapp", diario = 0, dias = 30,
  notas = "", manual = null, eco = null, conMaletas = false, conWeb = false, planPegado = "", anterior = null, cambio = "",
}) {
  const m = limpiarManual(manual ?? {});
  const tieneElementos = producto?.elementos && Object.keys(producto.elementos).length >= 3;
  return [
    `Eres el estratega de campañas de Meta Ads de una agencia en Panamá. Arma la campaña para ${marca}${rubro ? ` (${rubro})` : ""}.`,
    conWeb ? "Tienes búsqueda en internet: úsala con pocas búsquedas para ver cómo anuncia la competencia y qué cuesta un resultado en ese rubro y país." : "",
    "",
    m.reglas ? `EL MANUAL DE CAMPAÑAS DE LA AGENCIA (síguelo siempre; manda sobre lo demás):\n${m.reglas}\n` : "",
    "LO QUE SE ANUNCIA:",
    `${corto(producto.nombre, 120) || "(sin nombre)"}${producto.precio ? ` · precio: ${corto(producto.precio, 60)}` : ""}${producto.descripcion ? `\n${largo(producto.descripcion, 1500)}` : ""}`,
    tieneElementos ? `\nSUS 7 ELEMENTOS (del estudio de mercado; úsalos para los textos):\n${ELEMENTOS_MERCADO.filter((e) => producto.elementos[e.clave]).map((e) => `- ${e.titulo}: ${producto.elementos[e.clave]}`).join("\n")}` : "",
    "",
    "LO QUE SABEMOS DE LA MARCA:",
    contexto ? largo(contexto, 24000) : "(Casi nada: trabaja con lo de arriba y lo que sepas del rubro.)",
    "",
    eco
      ? `LAS CUENTAS (ya hechas; no las rehagas): precio ${eco.precio}, ganancia por venta ${eco.ganancia}, de cada 100 resultados compran ${eco.tasaCierre}. Costo máximo por resultado ${eco.costoMaxResultado} (punto de equilibrio); el que deja ganar, ${eco.costoObjetivo}.`
      : "No sabemos el precio o el margen: no inventes cuentas; di en «riesgos» qué dato falta.",
    objetivo ? `Objetivo que pide la agencia: ${OBJETIVOS[objetivo]?.nombre ?? objetivo}${destino === "whatsapp" ? ", a WhatsApp" : ", a la web"}.` : `Destino preferido: ${destino === "whatsapp" ? "WhatsApp (conversaciones)" : "la web"}.`,
    diario ? `Presupuesto: ${diario} al día durante ${dias} días.` : "Propón tú el presupuesto diario y los días, justificado con las cuentas.",
    notas ? `Notas de la agencia: ${largo(notas, 1500)}` : "",
    planPegado ? `\nEL PLAN QUE ESCRIBIÓ OTRO BOT (pásalo a esta forma: conserva sus públicos, textos y decisiones; corrige sólo lo que choque con el manual o con un precio del catálogo):\n${largo(planPegado, 12000)}` : "",
    anterior ? `\nEL PLAN ANTERIOR (devuélvelo entero con el cambio aplicado):\n${JSON.stringify(anterior).slice(0, 12000)}\nEL CAMBIO QUE PIDE LA AGENCIA: ${largo(cambio, 1500)}` : "",
    "",
    "Reglas:",
    "- Embudo: de 1 a 3 etapas; sólo las que el presupuesto aguante (con poco, sólo frío con objetivo de ventas o conversaciones).",
    `- Conjuntos: de 1 a ${MAX_CONJUNTOS}. Para ventas, lo habitual es uno por intereses (de 3 a 8 intereses concretos que existan en Meta, en español), uno Advantage+ y uno de similares si la cuenta tiene clientes o conversaciones. Edad entre ${EDAD_MIN} y ${EDAD_MAX}.`,
    `- Anuncios: de 4 a ${MAX_ANUNCIOS} con ángulos DISTINTOS (dolor, deseo, objeción, prueba, oferta, comparación). Texto principal que enganche en la primera línea (hasta ${MAX_TEXTO} caracteres, mejor 3 a 6 líneas), título hasta 40 caracteres, descripción corta. Un carrusel lleva de 2 a ${MAX_TARJETAS} tarjetas con título cada una. Cada precio, EXACTO del catálogo; nunca nombres a la competencia.`,
    "- «pieza»: qué imagen o video usar (foto del producto, reel de testimonio, antes y después…), para que la agencia la busque o la produzca.",
    "- «costos»: lo que suele costar UN resultado (conversación o cliente potencial) en ese rubro y país, en la moneda del precio: conservador (caro), esperado, optimista. Números, sin símbolo.",
    "- «ofertas»: de 1 a 3 mejoras de la oferta (gratis, garantía, pago fácil, urgencia, bono) como SUGERENCIA para hablar con el cliente: realistas para el negocio.",
    conMaletas || !tieneElementos ? `- «maletas»: los 7 elementos del producto, de 2 a 3 frases cada uno: ${ELEMENTOS_MERCADO.map((e) => `${e.clave} (${e.ayuda.toLowerCase()})`).join("; ")}.` : "- «maletas»: déjalo vacío (ya están arriba).",
    "- «pasos»: lo que hay que tener listo antes de activar (WhatsApp conectado a la página, píxel, piezas). «riesgos»: lo que puede salir mal o el dato que falta.",
    "- Español latino neutro, con «tú». Sin promesas que no se puedan cumplir.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    ESQUEMA,
  ].filter((l) => l !== "").join("\n");
}

// ------------------------------------------------------------
// Lo que vuelve
// ------------------------------------------------------------

function jsonDe(texto) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}
const lista = (v, max, n = 300) => (Array.isArray(v) ? v : []).map((x) => corto(x, n)).filter(Boolean).slice(0, max);
const entero = (v, min, max, def) => {
  const n = Math.round(num(v));
  return n >= min && n <= max ? n : def;
};

/** El plan de la IA, limpio. Null si no se puede leer. Pura. */
export function leerPlan(texto) {
  const d = typeof texto === "object" && texto ? texto : jsonDe(texto);
  if (!d || typeof d !== "object" || !d.campana) return null;
  const c = d.campana ?? {};
  const objetivo = OBJETIVOS[c.objetivo] ? c.objetivo : "OUTCOME_SALES";
  const conjuntos = (Array.isArray(c.conjuntos) ? c.conjuntos : []).slice(0, MAX_CONJUNTOS).map((x) => ({
    tipo: TIPOS_CONJUNTO[x?.tipo] ? x.tipo : "abierto",
    presupuestoDiario: Math.max(0, redondeo(num(x?.presupuestoDiario))),
    edadMin: entero(x?.edadMin, EDAD_MIN, EDAD_MAX, EDAD_MIN),
    edadMax: entero(x?.edadMax, EDAD_MIN, EDAD_MAX, EDAD_MAX),
    sexo: ["todos", "mujeres", "hombres"].includes(x?.sexo) ? x.sexo : "todos",
    intereses: lista(x?.intereses, 12, 60),
    lugar: corto(x?.lugar, 120),
    porque: corto(x?.porque, 300),
  }));
  const anuncios = (Array.isArray(c.anuncios) ? c.anuncios : []).slice(0, MAX_ANUNCIOS).map((x) => {
    const carrusel = x?.formato === "carrusel";
    return {
      formato: carrusel ? "carrusel" : "unico",
      angulo: corto(x?.angulo, 80), pieza: corto(x?.pieza, 300),
      texto: largo(x?.texto, MAX_TEXTO), titulo: corto(x?.titulo, MAX_TITULO), descripcion: corto(x?.descripcion, 120),
      tarjetas: carrusel ? (Array.isArray(x?.tarjetas) ? x.tarjetas : []).slice(0, MAX_TARJETAS).map((t) => ({ titulo: corto(t?.titulo, 80), descripcion: corto(t?.descripcion, 120) })) : [],
    };
  }).filter((a) => a.texto);
  if (!conjuntos.length || !anuncios.length) return null;
  const maletas = {};
  for (const e of ELEMENTOS_MERCADO) {
    const t = largo(d.maletas?.[e.clave], 800);
    if (t) maletas[e.clave] = t;
  }
  return {
    resumen: largo(d.resumen, 1500),
    embudo: (Array.isArray(d.embudo) ? d.embudo : []).slice(0, 3).map((x) => ({
      etapa: ETAPAS_EMBUDO[x?.etapa] ? x.etapa : "frio", objetivo: corto(x?.objetivo, 120), idea: corto(x?.idea, 400),
    })),
    costos: {
      conservador: Math.max(0, num(d.costos?.conservador)), esperado: Math.max(0, num(d.costos?.esperado)),
      optimista: Math.max(0, num(d.costos?.optimista)), porque: corto(d.costos?.porque, 400),
    },
    tasaCierre: num(d.tasaCierre) > 0 && num(d.tasaCierre) <= 100 ? num(d.tasaCierre) : null,
    presupuesto: { diario: Math.max(0, redondeo(num(d.presupuesto?.diario))), dias: entero(d.presupuesto?.dias, 1, 365, 30), porque: corto(d.presupuesto?.porque, 400) },
    ofertas: (Array.isArray(d.ofertas) ? d.ofertas : []).slice(0, 3)
      .map((x) => ({ tipo: TIPOS_OFERTA[x?.tipo] ? x.tipo : "bono", texto: corto(x?.texto, 300) })).filter((x) => x.texto),
    maletas,
    campana: { objetivo, destino: DESTINOS[c.destino] ? c.destino : "whatsapp", conjuntos, anuncios },
    pasos: lista(d.pasos, 8),
    riesgos: lista(d.riesgos, 6),
  };
}

const PAIS_POR_NOMBRE = { panama: "PA", "panamá": "PA", "costa rica": "CR", colombia: "CO", "méxico": "MX", mexico: "MX" };

/**
 * El plan como borrador de «Nueva campaña» (la forma de varios conjuntos y anuncios), sin medios: las piezas se
 * escogen allí. Los intereses van en `sugeridos` (palabras) para buscarlos en Meta; los nombres siguen el manual. Pura.
 */
export function planABorrador(plan, { hoy = "", cliente = "", producto = "", manual = null } = {}) {
  const m = limpiarManual(manual ?? {});
  const c = plan.campana;
  const [, mes] = /^\d{4}-(\d{2})/.exec(hoy) ?? [];
  const nombreObjetivo = `${OBJETIVOS[c.objetivo]?.nombre ?? ""}${c.destino === "whatsapp" ? " WhatsApp" : ""}`;
  const pais = (lugar) => PAIS_POR_NOMBRE[String(lugar ?? "").toLowerCase().trim()] ?? "PA";
  return {
    nombre: nombreConPlantilla(m.nomenclatura.campana, { cliente, objetivo: nombreObjetivo, producto, mes: mes ? `${MESES[Number(mes) - 1]} ${hoy.slice(0, 4)}` : "" }),
    objetivo: c.objetivo,
    destino: c.destino,
    categorias: [],
    paisCategoria: "PA",
    inicio: hoy,
    fin: "",
    pixelId: "",
    conjuntos: c.conjuntos.map((x) => ({
      nombre: nombreConPlantilla(m.nomenclatura.conjunto, {
        tipo: TIPOS_CONJUNTO[x.tipo]?.nombre, edad: `${x.edadMin}-${x.edadMax === EDAD_MAX ? `${EDAD_MAX}+` : x.edadMax}`, lugar: x.lugar,
      }),
      tipo: x.tipo,
      presupuesto: { tipo: "diario", monto: x.presupuestoDiario ? String(x.presupuestoDiario) : String(plan.presupuesto.diario ? Math.round(plan.presupuesto.diario / c.conjuntos.length * 100) / 100 : "") },
      publico: {
        paises: [pais(x.lugar)], ciudades: [], edadMin: x.edadMin, edadMax: x.edadMax, sexo: x.sexo, intereses: [], similares: [],
      },
      sugeridos: x.intereses,
    })),
    anuncios: c.anuncios.map((a, i) => ({
      nombre: nombreConPlantilla(m.nomenclatura.anuncio, { numero: String(i + 1), formato: a.formato === "carrusel" ? "Carrusel" : "Pieza", angulo: a.angulo }),
      formato: a.formato,
      medio: null,
      tarjetas: a.formato === "carrusel" ? a.tarjetas.map((t) => ({ medio: null, titulo: t.titulo, descripcion: t.descripcion, enlace: "" })) : [],
      texto: a.texto, titulo: a.titulo, descripcion: a.descripcion, enlace: "", boton: "LEARN_MORE",
      pieza: a.pieza,
    })),
  };
}

/** El plan como texto, para copiarlo o mandarlo (también a alguien que no es cliente). Pura. */
export function planATexto(plan, { marca = "", eco = null, filas = [] } = {}) {
  const c = plan.campana;
  const l = [];
  l.push(`PLAN DE CAMPAÑA${marca ? ` · ${marca}` : ""}`, "");
  if (plan.resumen) l.push(plan.resumen, "");
  if (plan.embudo.length) l.push("EMBUDO", ...plan.embudo.map((e) => `- ${ETAPAS_EMBUDO[e.etapa]}: ${e.objetivo}. ${e.idea}`), "");
  if (eco) l.push("CUENTAS", `- Ganancia por venta: ${eco.ganancia} · de cada 100 resultados compran ${eco.tasaCierre}`, `- Costo máximo por resultado: ${eco.costoMaxResultado} (para ganar: ${eco.costoObjetivo})`, "");
  if (filas.length) l.push("ESCENARIOS", ...filas.map((f) => `- ${f.nombre}: ${f.resultados} resultados a ${f.costoResultado}${f.ventas != null ? ` → ${f.ventas} ventas, ganancia ${f.ganancia}` : ""}`), "");
  l.push(`CAMPAÑA: ${OBJETIVOS[c.objetivo]?.nombre}${c.destino === "whatsapp" ? " a WhatsApp" : ""}`);
  c.conjuntos.forEach((x, i) => l.push(`Conjunto ${i + 1} · ${TIPOS_CONJUNTO[x.tipo]?.nombre} · ${x.presupuestoDiario || "?"} al día · ${x.edadMin}-${x.edadMax} · ${x.lugar}${x.intereses.length ? ` · ${x.intereses.join(", ")}` : ""}`));
  l.push("");
  c.anuncios.forEach((a, i) => {
    l.push(`ANUNCIO ${i + 1}${a.angulo ? ` · ${a.angulo}` : ""}${a.formato === "carrusel" ? " · carrusel" : ""}`);
    if (a.pieza) l.push(`Pieza: ${a.pieza}`);
    l.push(a.texto);
    if (a.titulo) l.push(`Título: ${a.titulo}`);
    if (a.descripcion) l.push(`Descripción: ${a.descripcion}`);
    a.tarjetas.forEach((t, j) => l.push(`  Tarjeta ${j + 1}: ${t.titulo}${t.descripcion ? ` — ${t.descripcion}` : ""}`));
    l.push("");
  });
  if (plan.ofertas.length) l.push("MEJORAS DE OFERTA (sugerencia)", ...plan.ofertas.map((o) => `- ${TIPOS_OFERTA[o.tipo]}: ${o.texto}`), "");
  const maletas = ELEMENTOS_MERCADO.filter((e) => plan.maletas[e.clave]);
  if (maletas.length) l.push("LAS 7 MALETAS", ...maletas.map((e) => `- ${e.titulo}: ${plan.maletas[e.clave]}`), "");
  if (plan.pasos.length) l.push("ANTES DE ACTIVAR", ...plan.pasos.map((p) => `- ${p}`), "");
  if (plan.riesgos.length) l.push("RIESGOS", ...plan.riesgos.map((p) => `- ${p}`));
  return l.join("\n").trim();
}
