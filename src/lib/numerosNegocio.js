// ============================================================
// Los NÚMEROS DEL NEGOCIO de un cliente y sus tres calculadoras (puro)
//
// Las cuentas son EXACTAMENTE las que ya usa la agencia (decisión de la agencia: «siempre y cuando sea el mismo
// sistema»), escritas con palabras propias:
//
//   · objetivo()   — la «Calculadora de presupuesto» del curso: con la meta de ventas, el ticket y el % de cada venta
//                    que se está dispuesto a invertir salen las ventas necesarias, el costo por compra objetivo, la
//                    inversión del mes, el ROAS objetivo y, con la tasa de cierre, el costo por conversación objetivo.
//                    Es el NÚMERO MÁGICO: cuánto se está dispuesto a pagar.
//   · equilibrio() — la calculadora de rentabilidad de deeplook, en sus dos modos («todo el negocio» y «sólo la
//                    plataforma»): margen bruto, margen efectivo, piso, ROAS, CAC y costo por conversación de
//                    equilibrio, la utilidad a un ROAS dado y la tabla presupuesto × ROAS. Es el LÍMITE: a partir de
//                    qué número se pierde dinero.
//   · simular()    — el «Simulador de campañas» (5 modos) y sus tres escenarios.
//
// Dos diferencias con las copias de la agencia, a propósito (arreglan dos errores): el % a invertir es SIEMPRE un
// porcentaje (en la hoja de interacción estaba «16» y no «16 %») y los clientes potenciales en la web se cuentan
// sobre las VISITAS (la copia los contaba sobre los clics salientes).
//
// Cada dato guarda de dónde sale (`origen`): lo dio el cliente, lo decidió la agencia, lo propuso la IA sin
// confirmar («estimado»), lo leyó la app de Meta o lo midió el enlace de ventas. La IA nunca escribe un dato como si
// fuera real: lo suyo queda «estimado» hasta que una persona lo confirma.
//
// Todos los porcentajes van de 0 a 100 (5 = 5 %); el dinero, en la moneda de la cuenta del cliente.
// ============================================================

import { ETAPAS_CICLO, TIPOS_NEGOCIO, DESTINOS_NEGOCIO, CUENTA_NEGOCIO } from "./cicloVentas.js";

/** De cada 100 conversaciones, cuántas compran mientras no se mida la del cliente (decisión 4: lo dice el curso). */
export const TASA_CIERRE_DEFECTO = 5;
/** El ITBMS de Panamá; 0 si el cliente está exento. */
export const ITBMS_DEFECTO = 7;
export const MAX_COSTOS = 6;

/** De dónde sale cada dato. `defecto` no se guarda: es lo que vale mientras nadie escriba nada. */
export const ORIGENES_DATO = Object.freeze({
  cliente: "Del cliente",
  agencia: "De la agencia",
  estimado: "Estimado por la IA · confirmar",
  meta: "De Meta",
  medida: "Medida",
  defecto: "Por defecto",
});
const GUARDABLES = new Set(["cliente", "agencia", "estimado", "meta", "medida"]);

/** Los dos modos del equilibrio. Por defecto, WhatsApp mide todo el negocio y la web sólo la pauta (decisión 13). */
export const MODOS_EQUILIBRIO = Object.freeze([
  { id: "negocio", nombre: "Todo el negocio", ayuda: "Las ventas de todo el negocio ÷ la pauta. Meta no ve las ventas cerradas por WhatsApp, así que se cuentan todas." },
  { id: "plataforma", nombre: "Sólo la pauta", ayuda: "El ROAS que registra Meta. Las ventas de otros canales, si se dan, ayudan a pagar los costos fijos." },
]);

/** Los números, uno a uno: qué es y cómo sacarlo, en una línea. */
export const CAMPOS_NEGOCIO = Object.freeze([
  { id: "ticket", nombre: "Ticket promedio", unidad: "dinero", ayuda: "Lo que deja de media cada venta.", como: "Las ventas del mes ÷ los pedidos del mes. Si cobra ITBMS, con el ITBMS: así lo cuenta Meta." },
  { id: "itbms", nombre: "ITBMS", unidad: "%", defecto: ITBMS_DEFECTO, ayuda: "El impuesto que cobra sobre sus ventas. No es un costo: convierte el margen a la venta con impuesto, que es como la mide Meta.", como: "7 en Panamá; 0 si está exento." },
  { id: "devoluciones", nombre: "Devoluciones", unidad: "%", ayuda: "De cada 100 vendidos, cuánto se devuelve, se reembolsa o no se cobra.", como: "Lo devuelto en el mes ÷ lo vendido en el mes. 0 si no tiene." },
  { id: "fijos", nombre: "Costos fijos del mes", unidad: "dinero", ayuda: "Lo que paga cada mes aunque no venda: alquiler, sueldos, programas, el fee de la agencia. Sin la pauta.", como: "Sólo lo de los canales cuyas ventas se cuentan. Déjalo en 0 para ver el piso." },
  { id: "otrosCanales", nombre: "Ventas de otros canales", unidad: "dinero", ayuda: "Lo que vende al mes sin los anuncios: tienda, recompra, recomendados. Sólo cuenta al medir «sólo la pauta».", como: "Las ventas del mes menos las que vienen de los anuncios." },
  { id: "presupuesto", nombre: "Presupuesto de pauta del mes", unidad: "dinero", ayuda: "Lo que se invierte al mes en anuncios (sólo lo que cobra Meta; el fee va en los fijos).", como: "Si tiene cuenta publicitaria, la app lo lee de Meta (lo gastado en 30 días)." },
  { id: "metaVentas", nombre: "Meta de ventas del mes", unidad: "dinero", ayuda: "Cuánto quiere vender en el mes con los anuncios.", como: "La deciden la agencia y el cliente." },
  { id: "invertir", nombre: "% de la venta que se invierte", unidad: "%", ayuda: "Qué parte de cada venta se está dispuesto a pagar por conseguir un cliente. No es todo el margen: lo que sobra es la ganancia.", como: "Margen de 35 % y quiere ganar al menos 15 % → invierte 20 %." },
  { id: "tasaCierre", nombre: "Tasa de cierre", unidad: "%", defecto: TASA_CIERRE_DEFECTO, ayuda: "De cada 100 conversaciones (o clientes potenciales), cuántas acaban en venta.", como: "Ventas ÷ conversaciones del mismo periodo. 5 % mientras no se mida; luego, la medida." },
]);
const CAMPO = Object.fromEntries(CAMPOS_NEGOCIO.map((c) => [c.id, c]));

/** Los costos variables de un negocio típico (con el nombre que se le pone en Panamá). */
export const COSTOS_SUGERIDOS = Object.freeze([
  "Producción o costo del producto",
  "Envíos",
  "Pasarela y comisiones (Tafi, tarjeta)",
]);

/** Para qué es la campaña: decide qué número es el mágico (el curso lo cambia según el tipo de campaña). */
export const OBJETIVOS_CAMPANA = Object.freeze([
  { id: "mensajes", nombre: "Mensajes (WhatsApp)", metrica: "Costo por conversación", unidad: "dinero", sentido: "menos" },
  { id: "trafico", nombre: "Tráfico", metrica: "Costo por clic único en el enlace", unidad: "dinero", sentido: "menos" },
  { id: "clientes", nombre: "Clientes potenciales", metrica: "Costo por cliente potencial", unidad: "dinero", sentido: "menos" },
  { id: "ventas", nombre: "Ventas en la web", metrica: "ROAS", unidad: "veces", sentido: "mas" },
  { id: "local", nombre: "Visitas al negocio", metrica: "CPM", unidad: "dinero", sentido: "historial" },
]);
const OBJETIVO_CAMPANA = Object.fromEntries(OBJETIVOS_CAMPANA.map((o) => [o.id, o]));

// ------------------------------------------------------------
// Limpiar
// ------------------------------------------------------------

const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Un número de lo que escriba una persona o la IA: «12,5», «$1.200», 7. NaN si no hay número. Pura. */
export function numero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v ?? "").trim();
  if (!t) return NaN;
  const m = /-?\d[\d.,]*/.exec(t.replace(/\s/g, ""));
  if (!m) return NaN;
  let s = m[0];
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    // Los dos: el último es el decimal.
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma >= 0) {
    // «1,200» son miles; «12,5» o «0,125», decimales.
    s = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (punto >= 0 && /^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(s)) {
    // Sólo «1.200.000» son miles: en Panamá «1.200» es uno con dos décimas, como en dólares.
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const tope = (unidad) => (unidad === "%" ? 100 : 1e10);

/** Un dato: { valor, origen, nota? } o null. Un número suelto vale como dato de la agencia. Pura. */
function limpiarDato(entrada, campo) {
  if (entrada === null || entrada === undefined || entrada === "") return null;
  const d = esObjeto(entrada) ? entrada : { valor: entrada };
  const n = numero(d.valor);
  if (!Number.isFinite(n)) return null;
  const valor = Math.min(tope(campo.unidad), Math.max(0, n));
  const salida = { valor, origen: GUARDABLES.has(d.origen) ? d.origen : "agencia" };
  const nota = corto(d.nota, 300);
  if (nota) salida.nota = nota;
  return salida;
}

/** Los costos variables: hasta seis, cada uno en % de la venta neta. Los que no tienen número no cuentan. Pura. */
export function limpiarCostos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((c) => {
      const d = esObjeto(c) ? c : {};
      const n = numero(d.pct);
      if (!Number.isFinite(n)) return null;
      const salida = { nombre: corto(d.nombre, 40) || "Otro costo", pct: Math.min(100, Math.max(0, n)), origen: GUARDABLES.has(d.origen) ? d.origen : "agencia" };
      const nota = corto(d.nota, 300);
      if (nota) salida.nota = nota;
      return salida;
    })
    .filter(Boolean)
    .slice(0, MAX_COSTOS);
}

/**
 * Los números del negocio, limpios: el perfil (tipo, destino, cuenta), el modo del equilibrio, cada número con su
 * origen y los costos variables. Lo que no se entiende se quita en vez de guardarse mal. Pura.
 */
export function limpiarNegocio(x) {
  const e = esObjeto(x) ? x : {};
  const salida = {
    v: 1,
    tipo: TIPOS_NEGOCIO.some((t) => t.id === e.tipo) ? e.tipo : "",
    destino: DESTINOS_NEGOCIO.some((d) => d.id === e.destino) ? e.destino : "",
    cuenta: CUENTA_NEGOCIO.some((c) => c.id === e.cuenta) ? e.cuenta : "",
    modo: MODOS_EQUILIBRIO.some((m) => m.id === e.modo) ? e.modo : "",
  };
  for (const c of CAMPOS_NEGOCIO) {
    const d = limpiarDato(e[c.id], c);
    if (d) salida[c.id] = d;
  }
  salida.costos = limpiarCostos(e.costos);
  if (typeof e.actualizado === "string" && /^\d{4}-\d{2}-\d{2}T/.test(e.actualizado)) salida.actualizado = e.actualizado.slice(0, 30);
  const por = corto(e.por, 80);
  if (por) salida.por = por;
  return salida;
}

/** ¿Hay algún número escrito? (sin contar el perfil). Pura. */
export const tieneNumeros = (x) => {
  const n = limpiarNegocio(x);
  return n.costos.length > 0 || CAMPOS_NEGOCIO.some((c) => n[c.id]);
};

/** El modo del equilibrio: el escogido o, si no, el de su destino (WhatsApp → todo el negocio; web → sólo la pauta). */
export const modoDe = (x) => {
  const n = esObjeto(x) && x.v === 1 ? x : limpiarNegocio(x);
  return n.modo || (n.destino === "web" ? "plataforma" : "negocio");
};

/** Para qué campaña es el número mágico si no se dice: WhatsApp → mensajes; web → ventas. */
export const objetivoCampanaDe = (destino) => (destino === "web" ? "ventas" : "mensajes");

/** El modo del simulador que toca a cada destino. */
export const modoSimuladorDe = (destino) => (destino === "web" ? "compras" : "conversaciones");

/** De dónde sale un número tal como se va a usar: el guardado o, si no hay, «defecto» (ITBMS y tasa) o null. Pura. */
export function origenDe(x, id) {
  const n = limpiarNegocio(x);
  if (n[id]) return n[id].origen;
  return CAMPO[id]?.defecto !== undefined ? "defecto" : null;
}

/**
 * Los números como se usan en las cuentas, con lo que vale por defecto. `tasaDefecto`: la del Manual de campañas
 * (si no, la del curso). Pura.
 */
export function valoresDe(x, { tasaDefecto } = {}) {
  const n = limpiarNegocio(x);
  const v = (id) => n[id]?.valor ?? null;
  const tasaD = Number.isFinite(numero(tasaDefecto)) && numero(tasaDefecto) > 0 ? Math.min(100, numero(tasaDefecto)) : TASA_CIERRE_DEFECTO;
  return {
    negocio: n,
    destino: n.destino,
    modo: modoDe(n),
    ticket: v("ticket"),
    costos: n.costos.reduce((s, c) => s + c.pct, 0),
    itbms: v("itbms") ?? ITBMS_DEFECTO,
    devoluciones: v("devoluciones") ?? 0,
    fijos: v("fijos") ?? 0,
    otrosCanales: v("otrosCanales") ?? 0,
    presupuesto: v("presupuesto"),
    metaVentas: v("metaVentas"),
    invertir: v("invertir"),
    tasaCierre: v("tasaCierre") ?? tasaD,
  };
}

// ------------------------------------------------------------
// El objetivo: la Calculadora de presupuesto del curso
// ------------------------------------------------------------

/**
 * Cuánto se está dispuesto a pagar. Lo que no se puede calcular sale null y su dato va en `faltan`.
 * → { ventasNecesarias, costoCompra, inversion, roas, costoConversacion, tasaCierre, invertir, faltan, avisos }. Pura.
 */
export function objetivo(x, opciones = {}) {
  const v = valoresDe(x, opciones);
  const pct = v.invertir > 0 ? v.invertir / 100 : null;
  const tasa = v.tasaCierre / 100;
  const ventasNecesarias = v.metaVentas > 0 && v.ticket > 0 ? v.metaVentas / v.ticket : null;
  const costoCompra = v.ticket > 0 && pct ? v.ticket * pct : null;
  const inversion = v.metaVentas > 0 && pct ? v.metaVentas * pct : null;
  // ROAS objetivo = meta ÷ inversión, que es 1 ÷ el %: con el % basta.
  const roas = inversion > 0 ? v.metaVentas / inversion : pct ? 1 / pct : null;
  const costoConversacion = costoCompra !== null ? costoCompra * tasa : null;
  const faltan = [
    !(v.ticket > 0) && "ticket",
    !pct && "invertir",
    !(v.metaVentas > 0) && "metaVentas",
  ].filter(Boolean);
  const avisos = [];
  const e = margenes(v);
  if (pct && e.valido && v.negocio.costos.length && pct >= e.m) {
    avisos.push({
      codigo: "invierteElMargen",
      texto: `Se invierte el ${redondear(v.invertir, 1)} % de cada venta y después de costos, ITBMS y devoluciones sólo queda el ${redondear(e.m * 100, 1)} %: no queda ganancia. Baja el % a invertir.`,
    });
  }
  return { ventasNecesarias, costoCompra, inversion, roas, costoConversacion, tasaCierre: v.tasaCierre, invertir: v.invertir, faltan, avisos };
}

/**
 * La inversión del mes repartida por etapa del ciclo de ventas, con el reparto por defecto (60/20/10/10). Una
 * cuenta nueva arranca con presentación y evaluación (decisión 3): el mismo peso entre las dos (75/25). El plan de
 * campañas puede cambiarlo; esto es la cuenta de partida. Pura.
 */
export function repartoPorEtapas(inversion, { cuenta = "" } = {}) {
  const total = numero(inversion);
  if (!(total > 0)) return [];
  const etapas = cuenta === "nueva" ? ETAPAS_CICLO.filter((e) => e.id === "presentacion" || e.id === "evaluacion") : ETAPAS_CICLO;
  const suma = etapas.reduce((s, e) => s + e.reparto, 0);
  return etapas.map((e) => ({ id: e.id, nombre: e.nombre, pct: (e.reparto / suma) * 100, monto: (total * e.reparto) / suma }));
}

// ------------------------------------------------------------
// El equilibrio: la calculadora de deeplook
// ------------------------------------------------------------

const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const clampPct = (v) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

/** El margen bruto (sobre la venta neta) y el efectivo (sobre la venta con ITBMS y sin devoluciones). */
function margenes(v) {
  // Igual que deeplook: la suma de costos y el margen se redondean a dos decimales.
  const costosVariables = Math.round(v.costos * 100) / 100;
  const margenBruto = Math.round((100 - costosVariables) * 100) / 100;
  const ivaF = clampPct(v.itbms) / 100;
  const devF = Math.min(clampPct(v.devoluciones), 99.9) / 100;
  const factorNeto = (1 - devF) / (1 + ivaF);
  const m = Math.max(margenBruto / 100, 0.001) * factorNeto;
  return { costosVariables, margenBruto, factorNeto, m, valido: margenBruto > 0 };
}

/** Todo lo de deeplook a la vez (lo usan equilibrio, la utilidad y la tabla). */
function base(x, opciones = {}) {
  const v = valoresDe(x, opciones);
  const mg = margenes(v);
  const plataforma = v.modo === "plataforma";
  const otros = plataforma ? Math.max(0, v.otrosCanales) : 0;
  const aporteOtros = otros * mg.m;
  // El presupuesto: el escrito (o el leído de Meta); si no, la inversión que pide la meta del mes.
  let presupuesto = v.presupuesto;
  let presupuestoDe = presupuesto > 0 ? "negocio" : null;
  if (Number.isFinite(numero(opciones.presupuesto)) && numero(opciones.presupuesto) > 0) {
    presupuesto = numero(opciones.presupuesto);
    presupuestoDe = "simulado";
  } else if (!(presupuesto > 0)) {
    const o = objetivo(x, opciones);
    if (o.inversion > 0) { presupuesto = o.inversion; presupuestoDe = "objetivo"; }
  }
  const spend = presupuesto > 0 ? presupuesto : 0;
  const fijos = Math.max(0, v.fijos);
  const valido = mg.valido && spend > 0;
  const piso = mg.valido ? 1 / mg.m : null;
  const total = valido ? (fijos + spend - aporteOtros) / (spend * mg.m) : null;
  // Si los otros canales ya pagan los fijos, el total cae bajo el piso: ahí manda el piso (apagar la pauta saldría mejor).
  const pisoManda = valido && total < piso;
  const roas = valido ? (pisoManda ? piso : total) : null;
  const aov = v.ticket > 0 ? v.ticket : 0;
  const cierre = Math.min(1, Math.max(0, v.tasaCierre / 100));
  const cac = roas > 0 && aov > 0 ? aov / roas : null;
  const utilidad = (r, s = spend) => aporteOtros + r * s * mg.m - fijos - s;
  return { v, mg, plataforma, otros, aporteOtros, spend, presupuestoDe, fijos, valido, piso, roas, aov, cierre, cac, pisoManda, utilidad };
}

/**
 * El LÍMITE: a partir de qué número se pierde dinero, en el modo del negocio («negocio» o «plataforma»).
 * `opciones.presupuesto` simula otro presupuesto (con los fijos dentro, el equilibrio DEPENDE del presupuesto). Pura.
 * → { modo, costosVariables, margenBruto, margenEfectivo, piso, roas, cac, costoConversacion, pisoManda, presupuesto,
 *     presupuestoDe, fijos, aporteOtros, cargaTodosLosFijos, sinMargen, faltan }
 */
export function equilibrio(x, opciones = {}) {
  const b = base(x, opciones);
  const faltan = [
    (!b.mg.valido || !b.v.negocio.costos.length) && "costos",
    !(b.spend > 0) && "presupuesto",
    !(b.aov > 0) && "ticket",
  ].filter(Boolean);
  return {
    modo: b.v.modo,
    costosVariables: b.mg.costosVariables,
    margenBruto: b.mg.margenBruto,
    margenEfectivo: b.mg.valido ? b.mg.m * 100 : null,
    piso: b.piso,
    roas: b.roas,
    cac: b.cac,
    costoConversacion: b.cac !== null ? b.cac * b.cierre : null,
    tasaCierre: b.v.tasaCierre,
    pisoManda: Boolean(b.pisoManda),
    presupuesto: b.spend || null,
    presupuestoDe: b.presupuestoDe,
    fijos: b.fijos,
    aporteOtros: b.aporteOtros,
    // La cuenta es la misma; sólo se avisa: la pauta carga sola todos los fijos (el caso más exigente).
    cargaTodosLosFijos: b.plataforma && b.fijos > 0 && !(b.v.otrosCanales > 0),
    sinMargen: b.mg.costosVariables >= 100,
    faltan,
  };
}

/** La utilidad del mes si se logra ese ROAS (con ese presupuesto, o el del negocio). null si no se puede calcular. Pura. */
export function utilidadA(x, roas, opciones = {}) {
  const b = base(x, opciones);
  const r = numero(roas);
  if (!b.valido || !Number.isFinite(r)) return null;
  return b.utilidad(r);
}

/** De un costo por conversación al ROAS que implica: ticket × tasa de cierre ÷ costo. Pura. */
export function roasDeCosto(x, costo, opciones = {}) {
  const b = base(x, opciones);
  const c = numero(costo);
  return b.aov > 0 && b.cierre > 0 && c > 0 ? (b.aov * b.cierre) / c : null;
}

/**
 * Lo que pasaría a ese ROAS (el «escenario» de deeplook): utilidad, ventas por pauta, clientes, lo que cuesta cada
 * cliente, cada conversación y cuántas conversaciones hacen falta. Pura.
 */
export function aUnRoas(x, roas, opciones = {}) {
  const b = base(x, opciones);
  const t = numero(roas);
  if (!b.valido || !(t > 0)) return null;
  const clientes = b.aov > 0 ? (t * b.spend) / b.aov : null;
  const cac = b.aov > 0 ? b.aov / t : null;
  return {
    roas: t,
    utilidad: b.utilidad(t),
    ventas: t * b.spend,
    clientes,
    cac,
    costoConversacion: cac !== null ? cac * b.cierre : null,
    conversaciones: clientes !== null && b.cierre > 0 ? clientes / b.cierre : null,
  };
}

const repartir = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/** Marca como «actual» la fila más cercana a `meta` si cae en el rango, como deeplook. */
function marcarCercana(filas, meta, lo, hi) {
  if (!Number.isFinite(meta) || meta < Math.min(lo, hi) || meta > Math.max(lo, hi)) return;
  let mejor = -1;
  let dist = Infinity;
  filas.forEach((f, i) => {
    const d = Math.abs(f.valor - meta);
    if (d < dist) { dist = d; mejor = i; }
  });
  if (mejor >= 0) filas[mejor].actual = true;
}

/**
 * La tabla presupuesto × ROAS (o × costo por conversación en WhatsApp y clientes potenciales), con la utilidad de
 * cada celda. Las columnas, diez presupuestos de 0,4× a 3,1× el actual (el actual en la quinta); las filas, diez
 * ROAS (o costos) alrededor del equilibrio y del objetivo. Los rangos son los de deeplook. null sin datos. Pura.
 * `opciones.roas`: el ROAS objetivo; `opciones.costo`: el costo por conversación objetivo; `opciones.eje`: "roas" o "costo".
 */
export function tablaUtilidad(x, opciones = {}) {
  const b = base(x, opciones);
  if (!b.valido) return null;
  const columnas = Array.from({ length: 10 }, (_, k) => ({ presupuesto: b.spend * 2.5 ** ((k - 4) / 4), actual: k === 4 }));
  const celdas = (r) => columnas.map((c) => b.utilidad(r, c.presupuesto));
  const eje = opciones.eje ?? (b.v.destino === "web" ? "roas" : "costo");
  const beCpl = b.cac !== null ? b.cac * b.cierre : null;
  if (eje === "costo" && beCpl > 0) {
    const pedido = numero(opciones.costo);
    const costo = pedido > 0 ? pedido : Math.round(beCpl * 0.8 * 100) / 100;
    const arriba = Math.max(0.01, Math.min(beCpl, costo) * 0.5);
    let abajo = Math.max(beCpl, costo) * 1.5;
    if (abajo <= arriba) abajo = arriba + 1;
    const filas = repartir(arriba, abajo, 10).map((c) => {
      const r = (b.aov * b.cierre) / c;
      return { valor: c, roas: r, actual: false, celdas: celdas(r) };
    });
    marcarCercana(filas, costo, arriba, abajo);
    return { eje: "costo", objetivo: costo, equilibrio: beCpl, columnas, filas };
  }
  const pedido = numero(opciones.roas);
  const t = pedido > 0 ? pedido : b.roas;
  let alto = Math.max(b.roas, t) * 1.3;
  const bajo = Math.max(0.5, Math.min(b.roas, b.piso) * 0.85);
  if (alto <= bajo) alto = bajo + 1;
  const filas = repartir(alto, bajo, 10).map((r) => ({ valor: r, roas: r, actual: false, celdas: celdas(r) }));
  marcarCercana(filas, t, bajo, alto);
  return { eje: "roas", objetivo: t, equilibrio: b.roas, columnas, filas };
}

// ------------------------------------------------------------
// El número mágico: el objetivo frente al equilibrio
// ------------------------------------------------------------

/**
 * El número que se vigila según para qué es la campaña (mensajes, tráfico, clientes potenciales, ventas en la web o
 * visitas al negocio), con su objetivo y su equilibrio, lo real de Meta si llega y la ALARMA: si el objetivo pasa del
 * equilibrio, con esa meta se pierde dinero. `opciones.objetivoCampana` (si no, el del destino) y `opciones.lectura`
 * (lo de Meta en 30 días: también da el % que pasa de clic a conversación en tráfico). Pura.
 */
export function numeroMagico(x, opciones = {}) {
  const n = limpiarNegocio(x);
  const id = OBJETIVO_CAMPANA[opciones.objetivoCampana] ? opciones.objetivoCampana : objetivoCampanaDe(n.destino);
  const def = OBJETIVO_CAMPANA[id];
  const o = objetivo(n, opciones);
  const e = equilibrio(n, opciones);
  const l = esObjeto(opciones.lectura) ? opciones.lectura : null;
  let obj = null;
  let eq = null;
  let real = null;
  let alterna = null;
  let nota = "";
  if (id === "mensajes" || id === "clientes") {
    obj = o.costoConversacion;
    eq = e.costoConversacion;
    real = id === "mensajes" ? l?.costoConversacion ?? null : l?.costoCliente ?? null;
  } else if (id === "ventas") {
    obj = o.roas;
    eq = e.roas;
    real = l?.roas ?? null;
    alterna = { metrica: "Costo por compra", objetivo: o.costoCompra, equilibrio: e.cac, real: l?.costoCompra ?? null };
  } else if (id === "trafico") {
    // De clic a resultado: en WhatsApp, el % de mensajes; en la web, visitas × compras.
    const web = n.destino === "web";
    const paso = web
      ? (l?.pctVisitas > 0 && l?.pctCompras > 0 ? (l.pctVisitas / 100) * (l.pctCompras / 100) : null)
      : (l?.pctMensajes > 0 ? l.pctMensajes / 100 : null);
    const ref = web ? { obj: o.costoCompra, eq: e.cac } : { obj: o.costoConversacion, eq: e.costoConversacion };
    obj = paso && ref.obj !== null ? ref.obj * paso : null;
    eq = paso && ref.eq !== null ? ref.eq * paso : null;
    real = l?.costoClicUnico ?? null;
    if (!paso) nota = web ? "Falta saber cuántos clics acaban en compra (visitas y compras de Meta)." : "Falta saber cuántos clics acaban en conversación (el % de mensajes de Meta).";
  } else {
    real = l?.cpm ?? null;
    nota = "El CPM no sale de las ventas: se compara con su propio historial.";
  }
  const alarma = obj !== null && eq !== null && (def.sentido === "mas" ? obj < eq : obj > eq);
  return {
    objetivoCampana: id,
    nombre: def.nombre,
    metrica: def.metrica,
    unidad: def.unidad,
    sentido: def.sentido,
    objetivo: obj,
    equilibrio: eq,
    real,
    alterna,
    alarma,
    textoAlarma: alarma
      ? def.sentido === "mas"
        ? "El ROAS objetivo queda por debajo del de equilibrio: con esa meta se pierde dinero."
        : "El objetivo pasa del equilibrio: con esa meta se pierde dinero. Baja el % a invertir o mejora el margen."
      : "",
    nota,
    faltan: [...new Set([...o.faltan, ...e.faltan])],
    tasaCierre: o.tasaCierre,
  };
}

/**
 * Lo aceptable por resultado para el diagnóstico de las campañas: en la web, el costo por compra objetivo; en
 * WhatsApp, el costo por conversación objetivo. Sin objetivo, el de equilibrio. null si no se puede calcular. Pura.
 */
export function costoAceptable(x, opciones = {}) {
  const n = limpiarNegocio(x);
  const o = objetivo(n, opciones);
  const e = equilibrio(n, opciones);
  const web = n.destino === "web";
  const valor = web ? o.costoCompra ?? e.cac : o.costoConversacion ?? e.costoConversacion;
  if (!(valor > 0)) return null;
  const deObjetivo = web ? o.costoCompra !== null : o.costoConversacion !== null;
  return { valor: redondear(valor), metrica: web ? "Costo por compra" : "Costo por conversación", de: deObjetivo ? "objetivo" : "equilibrio" };
}

// ------------------------------------------------------------
// Lo que llega de fuera: Meta y el enlace de ventas
// ------------------------------------------------------------

/**
 * El presupuesto del mes desde Meta si nadie lo escribió: lo gastado en los últimos 30 días, con origen «meta».
 * No pisa nada escrito. Pura.
 */
export function conLecturaMeta(x, lectura) {
  const n = limpiarNegocio(x);
  if (!esObjeto(lectura) || n.presupuesto || !(numero(lectura.gasto) > 0)) return n;
  return { ...n, presupuesto: { valor: redondear(numero(lectura.gasto)), origen: "meta", nota: "Lo gastado en los últimos 30 días en su cuenta publicitaria." } };
}

/**
 * La tasa de cierre MEDIDA por el enlace de ventas (entrega del enlace: `{ tasa, ventas?, conversaciones?, desde? }`,
 * la tasa en %). La medida es la real y manda sobre la escrita o la estimada (el curso: 5 % hasta medirla; luego, la
 * real). Sin una tasa válida, nada cambia. Pura.
 */
export function conTasaMedida(x, medida) {
  const n = limpiarNegocio(x);
  if (!esObjeto(medida)) return n;
  const tasa = numero(medida.tasa);
  if (!(tasa > 0) || tasa > 100) return n;
  const partes = [];
  if (numero(medida.ventas) >= 0 && numero(medida.conversaciones) > 0) partes.push(`${numero(medida.ventas)} ventas de ${numero(medida.conversaciones)} conversaciones`);
  if (typeof medida.desde === "string" && medida.desde) partes.push(`desde el ${medida.desde.slice(0, 10)}`);
  return { ...n, tasaCierre: { valor: redondear(tasa, 2), origen: "medida", ...(partes.length ? { nota: `Medida por el enlace de ventas: ${partes.join(", ")}.` } : {}) } };
}

// ------------------------------------------------------------
// El simulador de campañas (5 modos)
// ------------------------------------------------------------

/** Las entradas del simulador: qué son y en qué unidad. */
export const CAMPOS_SIMULADOR = Object.freeze({
  gasto: { nombre: "Lo que se gasta", unidad: "dinero" },
  cpm: { nombre: "CPM (costo por mil impresiones)", unidad: "dinero" },
  frecuencia: { nombre: "Frecuencia", unidad: "veces" },
  ctrUnico: { nombre: "CTR único en el enlace", unidad: "%" },
  ctrSaliente: { nombre: "% de clics salientes", unidad: "%" },
  pctConversion: { nombre: "% de conversión", unidad: "%" },
  pctVisitas: { nombre: "% de visitas (de los clics que llegan a la página)", unidad: "%" },
  pctCompras: { nombre: "% de compras (de las visitas)", unidad: "%" },
  valorPromedio: { nombre: "Valor promedio de una compra", unidad: "dinero" },
  costoMil: { nombre: "Costo por mil personas alcanzadas", unidad: "dinero" },
  costoThruplay: { nombre: "Costo por ThruPlay", unidad: "dinero" },
});

/** Los cinco modos. `ctr` y `conversion` son lo que mueven los escenarios. */
export const MODOS_SIMULADOR = Object.freeze([
  { id: "conversaciones", nombre: "Conversaciones (WhatsApp)", campos: ["gasto", "cpm", "frecuencia", "ctrUnico", "pctConversion"], ctr: "ctrUnico", conversion: "pctConversion", principal: "costoConversacion" },
  { id: "compras", nombre: "Compras en la web", campos: ["gasto", "cpm", "frecuencia", "ctrSaliente", "pctVisitas", "pctCompras", "valorPromedio"], ctr: "ctrSaliente", conversion: "pctCompras", principal: "roas" },
  { id: "clientes-meta", nombre: "Clientes potenciales (formulario de Meta)", campos: ["gasto", "cpm", "frecuencia", "ctrUnico", "pctConversion"], ctr: "ctrUnico", conversion: "pctConversion", principal: "costoCliente" },
  { id: "clientes-web", nombre: "Clientes potenciales en la web", campos: ["gasto", "cpm", "frecuencia", "ctrSaliente", "pctVisitas", "pctConversion"], ctr: "ctrSaliente", conversion: "pctConversion", principal: "costoCliente" },
  { id: "alcance", nombre: "Alcance y ThruPlays", campos: ["gasto", "costoMil", "costoThruplay", "frecuencia"], ctr: null, conversion: null, principal: "alcance" },
]);
const MODO_SIMULADOR = Object.fromEntries(MODOS_SIMULADOR.map((m) => [m.id, m]));

const div = (a, b) => (b > 0 ? a / b : null);

/**
 * Lo que da un presupuesto con esas métricas. `entradas` en las unidades de CAMPOS_SIMULADOR (los % de 0 a 100).
 * → { modo, filas: [{ id, nombre, valor, unidad }], …cada resultado por su id }. Pura.
 */
export function simular(modo, entradas = {}) {
  const def = MODO_SIMULADOR[modo] ?? MODO_SIMULADOR.conversaciones;
  const e = {};
  for (const c of def.campos) {
    const n = numero(entradas[c]);
    e[c] = Number.isFinite(n) && n > 0 ? (CAMPOS_SIMULADOR[c].unidad === "%" ? Math.min(100, n) : n) : 0;
  }
  const pct = (c) => e[c] / 100;
  const r = { modo: def.id };
  if (def.id === "alcance") {
    r.alcance = e.costoMil > 0 ? (e.gasto / e.costoMil) * 1000 : 0;
    r.impresiones = r.alcance * e.frecuencia;
    r.thruplays = e.costoThruplay > 0 ? e.gasto / e.costoThruplay : 0;
    r.filas = [
      { id: "alcance", nombre: "Alcance", valor: r.alcance, unidad: "numero" },
      { id: "impresiones", nombre: "Impresiones", valor: r.impresiones, unidad: "numero" },
      { id: "thruplays", nombre: "ThruPlays", valor: r.thruplays, unidad: "numero" },
    ];
    return r;
  }
  r.impresiones = e.cpm > 0 ? (e.gasto / e.cpm) * 1000 : 0;
  r.alcance = e.frecuencia > 0 ? r.impresiones / e.frecuencia : 0;
  const filas = [
    { id: "impresiones", nombre: "Impresiones", valor: r.impresiones, unidad: "numero" },
    { id: "alcance", nombre: "Alcance", valor: r.alcance, unidad: "numero" },
  ];
  if (def.id === "conversaciones" || def.id === "clientes-meta") {
    r.clics = r.impresiones * pct("ctrUnico");
    const resultados = r.clics * pct("pctConversion");
    filas.push({ id: "clics", nombre: "Clics únicos en el enlace", valor: r.clics, unidad: "numero" });
    if (def.id === "conversaciones") {
      r.conversaciones = resultados;
      r.costoConversacion = div(e.gasto, resultados);
      filas.push({ id: "conversaciones", nombre: "Conversaciones", valor: r.conversaciones, unidad: "numero" });
      filas.push({ id: "costoConversacion", nombre: "Costo por conversación", valor: r.costoConversacion, unidad: "dinero" });
    } else {
      r.clientes = resultados;
      r.costoCliente = div(e.gasto, resultados);
      filas.push({ id: "clientes", nombre: "Clientes potenciales", valor: r.clientes, unidad: "numero" });
      filas.push({ id: "costoCliente", nombre: "Costo por cliente potencial", valor: r.costoCliente, unidad: "dinero" });
    }
  } else {
    r.clicsSalientes = r.impresiones * pct("ctrSaliente");
    r.visitas = r.clicsSalientes * pct("pctVisitas");
    filas.push({ id: "clicsSalientes", nombre: "Clics salientes", valor: r.clicsSalientes, unidad: "numero" });
    filas.push({ id: "visitas", nombre: "Visitas a la página", valor: r.visitas, unidad: "numero" });
    if (def.id === "compras") {
      r.compras = r.visitas * pct("pctCompras");
      r.costoCompra = div(e.gasto, r.compras);
      r.valor = e.valorPromedio * r.compras;
      r.roas = div(r.valor, e.gasto);
      filas.push({ id: "compras", nombre: "Compras", valor: r.compras, unidad: "numero" });
      filas.push({ id: "costoCompra", nombre: "Costo por compra", valor: r.costoCompra, unidad: "dinero" });
      filas.push({ id: "valor", nombre: "Valor de las compras", valor: r.valor, unidad: "dinero" });
      filas.push({ id: "roas", nombre: "ROAS", valor: r.roas, unidad: "veces" });
    } else {
      // La copia de la agencia los contaba sobre los clics salientes: se cuentan sobre las visitas.
      r.clientes = r.visitas * pct("pctConversion");
      r.costoCliente = div(e.gasto, r.clientes);
      filas.push({ id: "clientes", nombre: "Clientes potenciales", valor: r.clientes, unidad: "numero" });
      filas.push({ id: "costoCliente", nombre: "Costo por cliente potencial", valor: r.costoCliente, unidad: "dinero" });
    }
  }
  r.filas = filas;
  return r;
}

/**
 * Tres escenarios con las métricas de la cuenta: el esperado tal cual, y el conservador y el optimista moviendo el
 * CTR y el % de conversión un 25 % (abajo y arriba). En alcance no hay CTR: se mueven los costos (un 25 % más caros
 * o más baratos). Cada uno dice cómo se movió. Pura.
 */
export function escenarios(modo, entradas = {}) {
  const def = MODO_SIMULADOR[modo] ?? MODO_SIMULADOR.conversaciones;
  const mover = (factor) => {
    const e = { ...entradas };
    if (def.id === "alcance") {
      // Más caro es peor: el conservador sube los costos.
      for (const c of ["costoMil", "costoThruplay"]) if (numero(e[c]) > 0) e[c] = numero(e[c]) * (2 - factor);
    } else {
      for (const c of [def.ctr, def.conversion]) if (numero(e[c]) > 0) e[c] = Math.min(100, numero(e[c]) * factor);
    }
    return e;
  };
  const como = def.id === "alcance"
    ? { conservador: "Costos un 25 % más caros", optimista: "Costos un 25 % más baratos" }
    : { conservador: "CTR y % de conversión un 25 % más bajos", optimista: "CTR y % de conversión un 25 % más altos" };
  return [
    { id: "conservador", nombre: "Conservador", como: como.conservador, ...simular(def.id, mover(0.75)) },
    { id: "esperado", nombre: "Esperado", como: "Con las métricas tal cual", ...simular(def.id, entradas) },
    { id: "optimista", nombre: "Optimista", como: como.optimista, ...simular(def.id, mover(1.25)) },
  ];
}

/**
 * Las entradas del simulador prellenadas con lo que la cuenta hizo en 30 días (`lectura`) y el negocio. Cada una con
 * su origen («meta» o «negocio»); lo que no se sabe, vacío. Pura.
 * → { valores: { campo: número }, origen: { campo: "meta"|"negocio" } }
 */
export function entradasDelSimulador(modo, lectura, x) {
  const def = MODO_SIMULADOR[modo] ?? MODO_SIMULADOR.conversaciones;
  const l = esObjeto(lectura) ? lectura : {};
  const v = valoresDe(x);
  const valores = {};
  const origen = {};
  const poner = (c, valor, de) => {
    if (!def.campos.includes(c) || valores[c] !== undefined) return;
    const n = numero(valor);
    if (Number.isFinite(n) && n > 0) { valores[c] = redondear(n, 4); origen[c] = de; }
  };
  poner("gasto", v.presupuesto, "negocio");
  poner("gasto", l.gasto, "meta");
  poner("cpm", l.cpm, "meta");
  poner("frecuencia", l.frecuencia, "meta");
  // El simulador cuenta los clics únicos sobre las IMPRESIONES (como el Excel); el CTR único de Meta va sobre el
  // alcance. Con los clics y las impresiones de la cuenta, el «esperado» reproduce lo que pasó de verdad.
  poner("ctrUnico", l.clicsUnicos > 0 && l.impresiones > 0 ? (l.clicsUnicos / l.impresiones) * 100 : null, "meta");
  poner("ctrUnico", l.ctrUnico, "meta");
  poner("ctrSaliente", l.ctrSaliente, "meta");
  poner("pctVisitas", l.pctVisitas, "meta");
  poner("pctCompras", l.pctCompras, "meta");
  poner("pctConversion", def.id === "conversaciones" ? l.pctMensajes : def.id === "clientes-meta" ? l.pctClientes : l.pctClientesWeb, "meta");
  poner("valorPromedio", l.compras > 0 ? l.valorCompras / l.compras : null, "meta");
  poner("valorPromedio", v.ticket, "negocio");
  poner("costoMil", l.alcance > 0 ? (l.gasto / l.alcance) * 1000 : null, "meta");
  poner("costoThruplay", l.costoThruplay, "meta");
  return { valores, origen };
}

// ------------------------------------------------------------
// La IA propone lo que falta (no guarda nada)
// ------------------------------------------------------------

/** Lo que la IA puede proponer: el ticket, los costos variables, las devoluciones y el % a invertir. */
export const PROPONIBLES = Object.freeze(["ticket", "costos", "devoluciones", "invertir"]);

/** Un precio de catálogo («Desde $45», «B/. 1.200», «$12,50») como número, o null. Pura. */
export function precioDe(texto) {
  const n = numero(texto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** El ticket que sale del catálogo: el promedio de los precios de lo activo. null sin precios. Pura. */
export function ticketDelCatalogo(productos = []) {
  const precios = (Array.isArray(productos) ? productos : []).filter((p) => p && p.activo !== false).map((p) => precioDe(p.precio)).filter((p) => p !== null);
  if (!precios.length) return null;
  return { valor: redondear(precios.reduce((s, p) => s + p, 0) / precios.length), precios: precios.length };
}

/** ¿Este dato le falta (o sólo lo tiene estimado)? Lo confirmado no se le vuelve a pedir a la IA. */
const leFalta = (n, id) => (id === "costos" ? !n.costos.some((c) => c.origen !== "estimado") : !n[id] || n[id].origen === "estimado");

/** Lo que la IA aún puede proponer (lo que falta o sólo está estimado). Vacío: no hace falta llamarla. Pura. */
export const queFaltaProponer = (x) => {
  const n = limpiarNegocio(x);
  return PROPONIBLES.filter((id) => leFalta(n, id));
};

/**
 * El pedido a la IA: propone sólo lo que falta, cada cosa con su explicación y de dónde la sacó, sin presentarla como
 * dato. Las cifras del cerebro (también las internas: esto sólo lo ve la agencia) valen como fuente. Pura.
 */
export function pedidoPropuesta({ marca = "", rubro = "", negocio, catalogo = "", ticketCatalogo = null, contexto = "", moneda = "USD" }) {
  const n = limpiarNegocio(negocio);
  const faltan = PROPONIBLES.filter((id) => leFalta(n, id));
  const tipo = TIPOS_NEGOCIO.find((t) => t.id === n.tipo)?.nombre ?? "";
  const destino = DESTINOS_NEGOCIO.find((d) => d.id === n.destino)?.nombre ?? "";
  const ya = CAMPOS_NEGOCIO.filter((c) => n[c.id] && n[c.id].origen !== "estimado").map((c) => `- ${c.nombre}: ${n[c.id].valor}${c.unidad === "%" ? " %" : ""}`);
  const costosYa = n.costos.filter((c) => c.origen !== "estimado").map((c) => `- ${c.nombre}: ${c.pct} %`);
  return [
    `Eres el analista de números de una agencia de Meta Ads en Panamá. Ayuda a llenar los números del negocio de ${marca || "un cliente"}${rubro ? ` (${rubro})` : ""}${tipo ? `, que vende ${tipo.toLowerCase()}` : ""}${destino ? ` y cierra por ${destino}` : ""}.`,
    "Lo que propongas se marcará «estimado» hasta que una persona lo confirme. Nunca inventes un dato como si fuera real: si sale de una nota o del catálogo, dilo; si es un rango habitual del rubro, dilo así.",
    "",
    `TE TOCA PROPONER (sólo esto): ${faltan.length ? faltan.map((id) => (id === "costos" ? "los costos variables" : CAMPO[id].nombre.toLowerCase())).join(", ") : "nada"}.`,
    "",
    "LO QUE YA ESTÁ (no lo cambies; úsalo para que lo tuyo cuadre):",
    ...(ya.length || costosYa.length ? [...ya, ...costosYa] : ["(nada todavía)"]),
    "",
    catalogo ? `EL CATÁLOGO (precios exactos, en ${moneda}):\n${catalogo}` : "No hay catálogo con precios.",
    ticketCatalogo ? `Promedio de los precios del catálogo: ${ticketCatalogo.valor} (${ticketCatalogo.precios} precios). Úsalo como base del ticket, ajustado a lo que suele comprar un cliente (una unidad, un combo).` : "",
    "",
    contexto ? `LO QUE SE SABE DE LA MARCA (puede traer costos, márgenes o comisiones; si lo dice, úsalo y di de dónde):\n${contexto}` : "",
    "",
    "Reglas:",
    "- Costos variables en % de la venta neta (sin ITBMS ni devoluciones): el costo del producto o de entregar el servicio, los envíos que paga el negocio, la pasarela o comisiones (Tafi, tarjeta, plataforma) y otros que suban con cada venta. De 1 a 4, sin repetir.",
    "- Devoluciones en % de lo vendido (0 si en ese rubro casi no hay).",
    "- El % a invertir por venta siempre por DEBAJO del margen que queda tras los costos, para que quede ganancia.",
    "- Números sin símbolo. Explicación de una línea, en español latino neutro, con «tú».",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"ticket":{"valor":0,"explicacion":"…"},"costos":[{"nombre":"…","pct":0,"explicacion":"…"}],"devoluciones":{"valor":0,"explicacion":"…"},"invertir":{"valor":0,"explicacion":"…"},"avisos":["…"]}',
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

function jsonDe(texto) {
  if (esObjeto(texto)) return texto;
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}

/**
 * Lo que propuso la IA, limpio y SÓLO lo que falta: cada número con origen «estimado» y su explicación en la nota.
 * Lo ya confirmado no se toca aunque la IA lo devuelva. null si no se puede leer. Pura.
 * → { datos: { ticket?, devoluciones?, invertir? }, costos: [...], avisos: [] }
 */
export function leerPropuesta(texto, negocio) {
  const d = jsonDe(texto);
  if (!d) return null;
  const n = limpiarNegocio(negocio);
  const datos = {};
  for (const id of ["ticket", "devoluciones", "invertir"]) {
    if (!leFalta(n, id) || !esObjeto(d[id])) continue;
    const dato = limpiarDato({ valor: d[id].valor, origen: "estimado", nota: d[id].explicacion }, CAMPO[id]);
    if (dato && !(id === "ticket" && dato.valor === 0)) datos[id] = dato;
  }
  // El % a invertir no puede comerse el margen: con los costos de ahora (o los propuestos), se descarta si lo pasa.
  const costos = leFalta(n, "costos")
    ? limpiarCostos((Array.isArray(d.costos) ? d.costos : []).map((c) => ({ nombre: c?.nombre, pct: c?.pct, origen: "estimado", nota: c?.explicacion }))).slice(0, 4)
    : [];
  if (datos.invertir) {
    const mg = margenes(valoresDe({ ...n, ...datos, costos: costos.length ? [...n.costos.filter((c) => c.origen !== "estimado"), ...costos] : n.costos }));
    if (!mg.valido || datos.invertir.valor / 100 >= mg.m) delete datos.invertir;
  }
  const avisos = (Array.isArray(d.avisos) ? d.avisos : []).map((a) => corto(a, 300)).filter(Boolean).slice(0, 4);
  return { datos, costos, avisos };
}

/**
 * Pone lo propuesto en el negocio (sin guardar): los datos que faltan y, si se aceptan, los costos (sustituyen a los
 * estimados de antes; los confirmados se quedan). `solo`: la lista de ids aceptados («costos» para los costos). Pura.
 */
export function aplicarPropuesta(x, propuesta, solo = null) {
  const n = limpiarNegocio(x);
  if (!propuesta) return n;
  const acepta = (id) => !solo || solo.includes(id);
  const salida = { ...n };
  for (const [id, dato] of Object.entries(propuesta.datos ?? {})) if (acepta(id) && leFalta(n, id)) salida[id] = dato;
  if (acepta("costos") && propuesta.costos?.length && leFalta(n, "costos")) {
    salida.costos = [...n.costos.filter((c) => c.origen !== "estimado"), ...propuesta.costos].slice(0, MAX_COSTOS);
  }
  return limpiarNegocio(salida);
}

/** Confirmar un dato estimado: pasa a ser de quien lo confirma («cliente» o «agencia»). Pura. */
export function confirmarDato(x, id, origen = "agencia") {
  const n = limpiarNegocio(x);
  const o = origen === "cliente" ? "cliente" : "agencia";
  if (id === "costos") return { ...n, costos: n.costos.map((c) => (c.origen === "estimado" ? { ...c, origen: o } : c)) };
  if (!n[id]) return n;
  return { ...n, [id]: { ...n[id], origen: o } };
}
