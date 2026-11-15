// ============================================================
// El MOTOR DE TEXTOS como lo haría Claude en un chat (puro; lo usa el Worker)
//
// El motor (worker/lib/estudio/lote.js, src/lib/loteAnuncios.js y
// src/lib/camposTexto.js) estaba armado para «rellenar casillas»: el código
// decidía cada pieza por rotación, se escribían 6 piezas con 9 campos en una
// sola respuesta, nadie miraba el mes entero, no veía nada de lo que ya le
// había funcionado a la marca y nadie revisaba lo escrito. Aquí, lo puro de lo
// que lo acerca a como escribe Claude en una conversación:
//
//   · Los EJEMPLOS del propio cliente (`ejemplosDelCliente`): lo que aprobó y
//     lo que mejor le rindió, como referencia del TONO (no para copiar).
//   · El PLANIFICADOR del mes (`pedidoDelPlanificador`, `leerPlanificador`):
//     antes de escribir, una llamada mira TODAS las casillas del mes con la
//     estrategia y decide por casilla la idea en una línea, la táctica, la
//     forma del gancho y el ángulo (entre las opciones válidas del código),
//     el porqué y un arco del mes. Lo decidido se guarda en R2 por casilla
//     (`firmaDeCasilla`): las tandas siguientes lo reusan sin volver a pagar.
//   · La VARIEDAD (`choquesDeVariedad`): si dos vecinas escogieron la misma
//     forma, el mismo ángulo o la misma táctica, el código le da otra a la
//     segunda y el revisor reescribe su gancho con ella.
//   · El REVISOR (`pedidoDeCritica`, `leerCritica`): una pasada por tanda con
//     una guía corta que reescribe SÓLO lo flojo. Si falla, la tanda sale igual.
// ============================================================

import { formaDe } from "./formasGancho.js";
import { TACTICAS, lineaDePieza } from "./loteAnuncios.js";
import { rindesDePropias } from "./loMejor.js";
import { sumarDias } from "./agenda.js";

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

// ------------------------------------------------------------
// Los ejemplos del propio cliente
// ------------------------------------------------------------

/** Cuántos ejemplos como mucho: 3 aprobados por el cliente y 2 de los que más le rindieron. */
export const MAX_EJEMPLOS = 5;
const MAX_APROBADAS = 3;
const MAX_RINDIERON = 2;
/** Desde cuánto «rinde» una publicación para servir de ejemplo (contra la mediana de su cuenta). */
export const RINDE_EJEMPLO = 1.2;
/** Cuánto atrás se buscan las que rindieron (días). */
export const DIAS_EJEMPLOS = 180;
const MAX_TEXTO_EJEMPLO = 350;

const NOMBRE_FORMATO = Object.freeze({ post: "Post", carrusel: "Carrusel", reel: "Reel", historia: "Historia", live: "Directo" });
const clave = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim().slice(0, 60);

/**
 * 3–5 piezas REALES del cliente para el tono: las que aprobó (por `approvals` —`aprobadas`: Set «calendario|post»— o
 * por su estado), las más nuevas primero, y las que más le rindieron en redes (`metricas`: filas de
 * metricas_publicacion con su texto publicado; «rinde» contra la mediana de su cuenta, `rindesDePropias`). Sólo las
 * que tienen texto. → [{ origen: "aprobada" | "rindio", formato?, titulo?, texto, rinde? }]. Vacío si no hay. Pura.
 */
export function ejemplosDelCliente({ calendarios = [], aprobadas = new Set(), metricas = [], hoy = "" } = {}) {
  const fuera = [];
  const vistos = new Set();
  const poner = (e) => {
    const k = clave(e.texto);
    if (!k || k.length < 20 || vistos.has(k)) return false;
    vistos.add(k);
    fuera.push(e);
    return true;
  };
  // Lo aprobado: de lo más nuevo a lo más viejo (los calendarios llegan del más viejo al más nuevo).
  let aprob = 0;
  for (const cal of [...calendarios].reverse()) {
    for (const d of [...(cal?.days ?? [])].reverse()) {
      for (const p of d?.posts ?? []) {
        if (aprob >= MAX_APROBADAS) break;
        const ok = aprobadas.has(`${cal.id}|${p?.id}`) || p?.status === "approved" || p?.status === "published";
        const texto = corto(p?.descripcion || p?.script || "", MAX_TEXTO_EJEMPLO);
        if (!ok || texto.length < 40) continue;
        if (poner({ origen: "aprobada", formato: p.format ?? "", titulo: corto(p.title, 80), texto })) aprob += 1;
      }
    }
  }
  // Lo que más rindió (sólo con medida de su cuenta y desde RINDE_EJEMPLO).
  const desde = hoy ? sumarDias(hoy, -DIAS_EJEMPLOS) : "";
  const filas = (metricas ?? []).filter((f) => String(f?.texto ?? "").trim().length >= 40 && (!desde || String(f?.publicada_at ?? "").slice(0, 10) >= desde));
  const rindes = rindesDePropias(filas);
  const mejores = filas.map((f) => ({ f, r: rindes.get(f) })).filter((x) => x.r?.rinde != null && x.r.rinde >= RINDE_EJEMPLO)
    .sort((a, b) => (b.r.senal ?? 0) - (a.r.senal ?? 0));
  let rind = 0;
  for (const { f, r } of mejores) {
    if (rind >= MAX_RINDIERON || fuera.length >= MAX_EJEMPLOS) break;
    if (poner({ origen: "rindio", texto: corto(f.texto, MAX_TEXTO_EJEMPLO), rinde: r.rinde, red: f.red })) rind += 1;
  }
  return fuera.slice(0, MAX_EJEMPLOS);
}

/** Los ejemplos en el pedido, con su regla: el TONO, nunca copiar. Vacío sin ejemplos. Pura. */
export function bloqueDeEjemplos(ejemplos = []) {
  if (!ejemplos?.length) return "";
  const linea = (e) => (e.origen === "rindio"
    ? `- Le rindió ${String(e.rinde).replace(".", ",")}× su promedio${e.red ? ` en ${e.red === "instagram" ? "Instagram" : e.red === "facebook" ? "Facebook" : e.red}` : ""}: «${e.texto}»`
    : `- Aprobada por el cliente${NOMBRE_FORMATO[e.formato] ? ` · ${NOMBRE_FORMATO[e.formato]}` : ""}${e.titulo ? ` · «${e.titulo}»` : ""}: «${e.texto}»`);
  return [
    "EJEMPLOS DE ESTA MARCA (lo que el cliente aprobó y lo que mejor le funcionó): úsalos SÓLO como referencia del TONO y la voz; no copies sus frases, sus temas ni su estructura, y no repitas sus ganchos.",
    ...ejemplos.map(linea),
  ].join("\n");
}

// ------------------------------------------------------------
// El planificador del mes
// ------------------------------------------------------------

/** Desde cuántas piezas se planifica (un mes); menos, el redactor escoge solo. */
export const MIN_PLANIFICAR = 4;
/** Cuántas casillas planifica una llamada como mucho (lo que no entra se planifica en la tanda que llegue a ellas). */
export const MAX_PLANIFICAR = 40;
/** Cuánto vale lo planificado guardado (horas): pasado eso, se vuelve a planificar. */
export const HORAS_PLAN = 12;
const MAX_IDEA_PLAN = 300;
const MAX_PORQUE_PLAN = 200;

/**
 * La clave de una casilla para guardar lo planificado: la suya (el plan, «campos») o, en el modo «mes» (sus casillas no
 * traen clave), la fecha y su número en el plan entero (que no cambia entre tandas: el plan sale igual con la semilla). Pura.
 */
export const claveDeCasilla = (r = {}) => (r.clave ? String(r.clave) : `${r.fecha ?? ""}|${r.n ?? ""}`);

/** Lo que tiene que seguir igual para reusar lo planificado de una casilla: su formato, su tipo, su producto, su nivel y su fecha. Pura. */
export const firmaDeCasilla = (r = {}) => [r.formato ?? "", r.tipo ?? r.pilar ?? "", r.pilarSub ?? "", r.productoId ?? "", r.nivel ?? "", r.fecha ?? ""].join("|");

/** ¿Se planifica? El mes (o el plan con `planificar`), con MIN_PLANIFICAR piezas o más, y sin `planificar: false`. Pura. */
export function sePlanifica(modo, datos = {}, total = 0) {
  if (datos?.planificar === false) return false;
  return total >= MIN_PLANIFICAR && (modo === "mes" || (modo === "plan" && datos?.planificar === true));
}

/**
 * El pedido del planificador: el papel, todo lo de la marca (`contexto`: las líneas de lo que se sabe, ya repartido), la
 * ficha del cliente, la estrategia, las fechas, cada casilla con sus opciones (`lineas`) y, si ya se planificaron otras
 * del mes, cuáles (`planificadas`, una línea cada una, para no repetirlas y seguir el arco). Pura.
 */
export function pedidoDelPlanificador({
  marca = "la marca", lineas = [], contexto = [], cliente = "", estrategia = "", fechas = [], perfiles = [], planificadas = [], arco = "", usados = [],
} = {}) {
  return [
    `Eres el PLANIFICADOR de contenido de la agencia para ${marca}: antes de que el redactor escriba, decides el mes ENTERO mirando todas sus piezas a la vez, como lo haría el director de la cuenta.`,
    "Para cada pieza decides: la IDEA en una línea (qué cuenta y qué se ve, concreta y de ESTA marca: nada que sirva para cualquier otra), la táctica del gancho, la forma del gancho y el ángulo de venta —SIEMPRE una de las opciones de su pieza (entre corchetes, su id)— y por qué funciona en su nivel de consciencia.",
    "Que el mes tenga un ARCO: siga la estrategia y la etapa de cada semana, que una pieza prepare la siguiente, que el producto foco tenga su peso y que las fechas especiales caigan en su día (las delicadas, sin vender). Ni dos ideas parecidas, ni la misma forma o el mismo ángulo en dos piezas seguidas.",
    "Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS. No inventes testimonios, reseñas ni datos.",
    "",
    cliente ? String(cliente).slice(0, 3000) : "",
    estrategia || "",
    perfiles.length ? `Los perfiles:\n${perfiles.join("\n")}` : "",
    fechas.length ? `Fechas especiales:\n${fechas.map((f) => `- ${f}`).join("\n")}` : "",
    "",
    ...contexto,
    planificadas.length ? `YA PLANIFICADAS en este mes (no las repitas; sigue su arco${arco ? `: ${corto(arco, 400)}` : ""}):\n${planificadas.slice(0, 60).map((l) => `- ${corto(l, 200)}`).join("\n")}\n` : "",
    usados.length ? `Ya escritas en el mes (no repitas su idea):\n${usados.slice(0, 30).map((u) => `- ${corto(u, 80)}`).join("\n")}\n` : "",
    `LAS PIEZAS DEL MES (${lineas.length}):`,
    ...lineas,
    "",
    'Responde SOLO con JSON: {"arco":"cómo avanza el mes, en 2 o 3 frases","piezas":[{"n":1,"idea":"…","tactica":"id","forma":"id","angulo":"id","porque":"…"}]} — una por número; "tactica", "forma" y "angulo" sólo donde su pieza trae opciones.',
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * La respuesta del planificador → { arco, piezas: Map n → { idea, porque, tactica?, forma?, angulo? } }: sólo una idea
 * que traiga texto y sólo lo escogido que esté entre las opciones de su pieza. Null si no hay JSON. Pura.
 */
export function leerPlanificador(texto, plan = []) {
  const d = deJSON(texto);
  if (!d || typeof d !== "object") return null;
  const lista = Array.isArray(d.piezas) ? d.piezas : [];
  const piezas = new Map();
  for (const x of lista) {
    const r = plan.find((p) => p.n === Number(x?.n));
    const idea = corto(x?.idea, MAX_IDEA_PLAN);
    if (!r || !idea || piezas.has(r.n)) continue;
    const op = r.opciones ?? {};
    piezas.set(r.n, {
      idea,
      ...(corto(x?.porque, MAX_PORQUE_PLAN) ? { porque: corto(x.porque, MAX_PORQUE_PLAN) } : {}),
      ...(op.tacticas?.includes(x?.tactica) ? { tactica: x.tactica } : {}),
      ...(op.formas?.includes(x?.forma) ? { forma: x.forma } : {}),
      ...(op.angulos?.some((a) => a.id === x?.angulo) ? { angulo: x.angulo } : {}),
    });
  }
  return { arco: corto(d.arco, 600), piezas };
}

/**
 * Una casilla con lo que decidió el planificador: la idea y su porqué (`planificada`) y, en vez de sus opciones, lo
 * escogido (lo que no esté entre las opciones de AHORA se queda en la sugerida). Pura.
 */
export function conPlanificado(r = {}, p = null) {
  if (!p?.idea) return r;
  const op = r.opciones ?? {};
  const ang = op.angulos?.find((a) => a.id === p.angulo);
  const { opciones: _o, ...resto } = r;
  return {
    ...resto,
    planificada: { idea: p.idea, ...(p.porque ? { porque: p.porque } : {}) },
    ...(op.tacticas?.includes(p.tactica) ? { tactica: p.tactica } : {}),
    ...(op.formas?.includes(p.forma) ? { formaGancho: p.forma } : {}),
    ...(ang ? { angulo: ang.id, anguloNombre: ang.nombre, anguloLinea: ang.linea } : {}),
  };
}

/** Lo planificado de una casilla, como se guarda (con su firma). Pura. */
export const planificadoParaGuardar = (r = {}, p = {}) => ({ firma: firmaDeCasilla(r), ...p });

/**
 * Lo guardado (`{ at, arco, piezas: { clave → { firma, idea, … } } }`) → lo que vale para este plan: sólo lo de menos de
 * HORAS_PLAN y cuya casilla sigue siendo la misma (su firma). → { arco, porClave: Map clave → planificado }. Pura.
 */
export function planificadoVigente(guardado = null, plan = [], ahora = Date.now()) {
  const vacio = { arco: "", porClave: new Map() };
  if (!guardado || typeof guardado !== "object" || !guardado.piezas) return vacio;
  if (!(ahora - Date.parse(guardado.at ?? "") < HORAS_PLAN * 3600_000)) return vacio;
  const porClave = new Map();
  for (const r of plan) {
    const p = guardado.piezas[claveDeCasilla(r)];
    if (p?.idea && p.firma === firmaDeCasilla(r)) porClave.set(claveDeCasilla(r), p);
  }
  return { arco: corto(guardado.arco, 600), porClave };
}

/** Una casilla ya planificada dicha en una línea (para que la siguiente llamada del planificador no la repita). Pura. */
export const lineaPlanificada = (r = {}, p = {}) => `${r.fecha ?? ""} [${r.formato ?? ""}] ${corto(p.idea, 160)}${formaDe(p.forma ?? r.formaGancho) ? ` · forma «${formaDe(p.forma ?? r.formaGancho).nombre}»` : ""}`;

// ------------------------------------------------------------
// La variedad y el revisor
// ------------------------------------------------------------

/**
 * Las vecinas que escogieron lo mismo: la misma forma del gancho, el mismo ángulo (del mismo producto) o la misma táctica
 * que la pieza anterior. A la segunda se le da otra de SUS opciones (ni la de la anterior ni la de la siguiente). Sólo
 * donde la pieza trae opciones (lo que ya venía puesto no se toca). `ideas`: lo leído, en el orden del plan;
 * `plan`: las casillas (con sus `opciones`). → [{ n, formaGancho?, angulo?, tactica?, linea }]. Pura.
 */
export function choquesDeVariedad(ideas = [], plan = []) {
  const porN = new Map(plan.map((r) => [r.n, r]));
  const orden = [...ideas].sort((a, b) => a.n - b.n);
  const fuera = [];
  for (let i = 1; i < orden.length; i++) {
    const a = orden[i - 1];
    const b = orden[i];
    const sig = orden[i + 1];
    if (b.n !== a.n + 1) continue;
    const op = porN.get(b.n)?.opciones ?? {};
    const cambio = {};
    const otra = (lista, ya, siguiente) => (lista ?? []).find((x) => x !== ya && x !== siguiente) ?? "";
    if (b.formaGancho && b.formaGancho === a.formaGancho && op.formas) {
      const f = otra(op.formas, a.formaGancho, sig?.formaGancho);
      if (f) cambio.formaGancho = f;
    }
    if (b.angulo && b.angulo === a.angulo && b.productoId === a.productoId && op.angulos) {
      const x = otra(op.angulos.map((y) => y.id), a.angulo, sig?.angulo);
      if (x) cambio.angulo = x;
    }
    if (b.tactica && b.tactica === a.tactica && op.tacticas) {
      const t = otra(op.tacticas, a.tactica, sig?.tactica);
      if (t) cambio.tactica = t;
    }
    if (!Object.keys(cambio).length) continue;
    const dicho = [
      cambio.formaGancho ? `forma del gancho «${formaDe(cambio.formaGancho)?.nombre}» — ${formaDe(cambio.formaGancho)?.como}` : "",
      cambio.angulo ? `ángulo «${op.angulos.find((y) => y.id === cambio.angulo)?.nombre}»` : "",
      cambio.tactica ? `táctica ${TACTICAS.find(([x]) => x === cambio.tactica)?.[1] ?? cambio.tactica}` : "",
    ].filter(Boolean).join("; ");
    fuera.push({ n: b.n, ...cambio, linea: `- n.º ${b.n}: repite con la anterior; reescribe su gancho (y lo que dependa de él) con: ${dicho}.` });
  }
  return fuera;
}

/** Los campos que el revisor puede reescribir, por modo (la forma, el ángulo y la táctica no: eso lo decide el código). */
const REESCRIBIBLES_IDEAS = Object.freeze(["titulo", "brief", "porque", "titular", "apoyo", "escena", "descripcion", "hashtags", "guion", "ganchos", "anuncio"]);

/** Desde cuántas piezas se revisa una tanda (una sola —el botón «IA» de un campo— va sin revisor: ya la está mirando una persona). */
export const MIN_REVISAR = 2;

/**
 * El pedido del REVISOR, lo que va DETRÁS de lo fijo del redactor (así lee la caché): la guía corta, las piezas tal como
 * se escribieron (cada una con su línea: tipo, nivel, gancho, ángulo, pauta) y las que repiten con su vecina. `modo`:
 * "ideas" o "campos" (sólo los campos que se pidieron). `piezas`: [{ r (la casilla), escrito (lo que escribió) }]. Pura.
 */
export function pedidoDeCritica({ modo = "ideas", piezas = [], productos = {}, formato = "post", variedad = [] } = {}) {
  const campos = (r) => (modo === "campos" ? [...(r.campos ?? []), ...(r.campos?.includes("guion") && r.rostro ? ["ganchos"] : [])] : REESCRIBIBLES_IDEAS);
  const escrito = (r, x) => Object.entries(x ?? {})
    .filter(([k, v]) => campos(r).includes(k) && v && (typeof v === "string" ? v.trim() : true))
    .map(([k, v]) => `     ${k}: ${typeof v === "string" ? `«${corto(v, 1500)}»` : JSON.stringify(v).slice(0, 1500)}`);
  return [
    "AHORA ERES EL EDITOR JEFE de la agencia: revisa lo que acaba de escribir el redactor (abajo) antes de que lo vea el cliente. Una pieza PASA si cumple las seis:",
    "1. Es de ESTA marca: si le cambias el nombre y sirve igual para otra, no pasa (usa lo concreto: su producto, su gente, su lugar, las palabras de sus clientes).",
    "2. El gancho detiene el pulgar en un segundo: concreto y con la forma que dice su pieza; nada genérico («Descubre…», «Te presentamos…», «¿Sabías que…?» sin el dato).",
    "3. Encaja con su nivel de consciencia: a quien no conoce el problema no se le vende el producto; a quien está listo, se le da el empujón.",
    "4. No se repite con otra de la lista: ni el gancho, ni la idea, ni el llamado, ni la escena.",
    "5. Lleva un llamado a la acción claro donde su tipo lo pide, con el contacto de la ficha.",
    "6. Si va a pauta, cumple LO QUE VA A PAUTA.",
    "Y siempre: precios sólo los del catálogo y EXACTOS, nada de testimonios ni cifras inventadas, las fechas delicadas sin vender y los hashtags aparte (nunca dentro del caption).",
    "Reescribe SÓLO las que no pasan y, en ellas, SÓLO los campos flojos: lo que está bien se queda tal cual. Conserva su formato, su forma del gancho y su ángulo.",
    variedad.length ? `\nADEMÁS, estas piezas repiten con su vecina: el código les dio otra opción y tienes que reescribirlas con ella:\n${variedad.map((v) => v.linea).join("\n")}` : "",
    "",
    "LO QUE ESCRIBIÓ EL REDACTOR:",
    ...piezas.map(({ r, escrito: x }) => [lineaDePieza({ ...r, opciones: null, antes: "" }, productos, formato), ...escrito(r, x)].join("\n")),
    "",
    `Responde SOLO con JSON: {"revisadas":[{"n":1,"motivo":"qué no pasaba, en una línea","titular":"…"}]} — sólo las que reescribes y sólo con los campos que cambian (los mismos nombres de arriba${modo === "ideas" ? "" : ", sólo los que pedía cada una"}). Si todas pasan: {"revisadas":[]}.`,
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n");
}

/**
 * La respuesta del revisor → Map n → { cambios, motivo }: sólo números del plan y sólo los campos que puede reescribir
 * en su modo. Vacío si no hay JSON o si todas pasan. Pura.
 */
export function leerCritica(texto, plan = [], modo = "ideas") {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.revisadas) ? d.revisadas : [];
  const fuera = new Map();
  for (const x of lista) {
    const r = plan.find((p) => p.n === Number(x?.n));
    if (!r || fuera.has(r.n)) continue;
    const permitidos = modo === "campos" ? [...(r.campos ?? []), ...(r.campos?.includes("guion") && r.rostro ? ["ganchos"] : [])] : REESCRIBIBLES_IDEAS;
    const cambios = Object.fromEntries(Object.entries(x).filter(([k, v]) => permitidos.includes(k) && v != null && (typeof v !== "string" || v.trim())));
    if (Object.keys(cambios).length) fuera.set(r.n, { cambios, motivo: corto(x.motivo, 200) });
  }
  return fuera;
}
