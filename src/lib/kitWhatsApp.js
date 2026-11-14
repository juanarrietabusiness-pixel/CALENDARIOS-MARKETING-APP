// ============================================================
// El KIT DE WHATSAPP BUSINESS de un cliente (curso de campañas, entrega 8; puro)
//
// Un anuncio a WhatsApp no vende: trae a alguien que escribe. Lo que pasa DESPUÉS lo decide el WhatsApp Business del
// cliente, y casi nunca está preparado: no hay mensaje de bienvenida, cada vendedor contesta el precio a su manera,
// las objeciones se responden de memoria y nadie etiqueta en qué punto va cada conversación. Aquí, listo para copiar:
//
//   · el mensaje de BIENVENIDA (quien escribe por primera vez, casi siempre por un anuncio) y el de AUSENCIA;
//   · de 6 a 12 RESPUESTAS RÁPIDAS con su atajo («/precio», «/envio»…): las de siempre (precio, envío, horario,
//     ubicación, formas de pago) y una por cada objeción del estudio de mercado con su respuesta;
//   · las ETIQUETAS, cada una enlazada a su etapa del ciclo de ventas (cicloVentas.js): quien YA ESCRIBIÓ por WhatsApp
//     está en CONVERSIÓN (el público de esa etapa es justamente quien escribió), escriba por primera vez, pregunte o
//     cotice; quien compró, en ascensión. Presentación y evaluación son de quien todavía no escribe: no llevan
//     etiqueta de WhatsApp (antes «Nuevo» e «Interesado» iban a presentación y evaluación: corrección del 14-nov);
//   · un GUION DE VENTAS por producto: saludo, preguntas para calificar, la presentación con su diferencial, las
//     objeciones respondidas, el cierre con la oferta y el precio del catálogo, y el seguimiento si no contesta.
//
// LOS PRECIOS LOS PONE EL CÓDIGO, NO LA IA. Se le pide escribir «{precio}» (en el cierre de un guion) y «{precios}»
// (en la respuesta del precio) donde va la cifra, y `ponerPrecios` los cambia por los del catálogo, EXACTOS. Si aun así
// el texto trae una cifra de dinero que no está en el catálogo, `avisosDelKit` lo dice. Lo que la IA no sabe (el
// horario, la dirección, cómo se paga) lo deja como «[completar: …]» y la pantalla lo señala.
//
// La IA PROPONE y no guarda (worker/lib/whatsapp.js); una persona revisa, corrige y pulsa «Guardar». Cada bloque que
// se toca a mano queda `editado`, y «Volver a proponer» no lo pisa sin preguntar (`fundirKitWhatsApp`).
//
// Las ideas del curso (módulo 5: dejar las objeciones en plantillas de mensaje; módulo 6: aprovechar la bienvenida,
// las etiquetas y los horarios de WhatsApp Business), con palabras propias: la licencia del método no deja copiar su
// texto. Lo leen la pantalla (negocio/KitWhatsApp.jsx), el Worker y las herramientas del asistente y de Claude.
// ============================================================

import { ETAPAS_CICLO, idEtapaCiclo, nombreEtapaCiclo } from "./cicloVentas.js";
import { jsonDe, productosActivos, lineaDeProducto, limpiarEstudio, ELEMENTOS_MERCADO } from "./estudioMercado.js";

/** Lo que cabe en cada pieza. Los mensajes, cortos a propósito: en el teléfono se leen de un vistazo. */
export const LIMITES_KIT = Object.freeze({ mensaje: 700, atajo: 24, titulo: 60, respuesta: 900, etiqueta: 30, cuando: 180, linea: 700, pregunta: 220 });
export const MIN_RESPUESTAS = 6;
export const MAX_RESPUESTAS = 12;
export const MIN_ETIQUETAS = 4;
export const MAX_ETIQUETAS = 10;
export const MAX_GUIONES = 10;
export const MAX_PREGUNTAS_GUION = 4;
export const MAX_SEGUIMIENTO = 3;

/** Las respuestas rápidas que todo negocio necesita, además de las de las objeciones. */
export const RESPUESTAS_BASE = Object.freeze([
  { atajo: "precio", titulo: "Precios", ayuda: "Cuánto cuesta: la lista del catálogo, tal cual." },
  { atajo: "envio", titulo: "Envíos y entregas", ayuda: "Si hay envío, a dónde, cuánto tarda y cuánto cuesta." },
  { atajo: "horario", titulo: "Horario de atención", ayuda: "Cuándo se atiende y cuándo se responde." },
  { atajo: "ubicacion", titulo: "Dónde estamos", ayuda: "La dirección o cómo llegar (o si es sólo en línea)." },
  { atajo: "pago", titulo: "Formas de pago", ayuda: "Cómo se paga: efectivo, transferencia, Yappy, tarjeta, cuotas." },
]);

/**
 * La etapa de una etiqueta de WhatsApp: quien tiene una conversación ya escribió, así que está en conversión (o en
 * ascensión si compró). Una etiqueta guardada o propuesta con presentación o evaluación se lee como conversión. Pura.
 */
export function etapaDeEtiqueta(x) {
  const e = idEtapaCiclo(x);
  return e === "presentacion" || e === "evaluacion" ? "conversion" : e;
}

/** Las etiquetas de partida, cada una con su etapa del ciclo (lo que la IA adapta al negocio). */
export const ETIQUETAS_BASE = Object.freeze([
  { nombre: "Nuevo", etapa: "conversion", cuando: "Escribió por primera vez (casi siempre por un anuncio)." },
  { nombre: "Interesado", etapa: "conversion", cuando: "Preguntó por un producto, cómo funciona o el precio." },
  { nombre: "Cotizó", etapa: "conversion", cuando: "Ya tiene el precio o la cotización y no ha comprado." },
  { nombre: "Pago pendiente", etapa: "conversion", cuando: "Dijo que compra y falta que pague." },
  { nombre: "Compró", etapa: "ascension", cuando: "Pagó: ya es cliente. Se le ofrece lo siguiente." },
  { nombre: "Recompra", etapa: "ascension", cuando: "Compró más de una vez, o toca ofrecerle que vuelva." },
]);

/** La marca de lo que la IA no sabe: «[completar: el horario]». La pantalla lo señala; quien copia lo rellena. */
export const MARCA_COMPLETAR = /\[completar:\s*([^\]]{1,120})\]/gi;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lista = (v) => (Array.isArray(v) ? v : []);

/** «/Envío gratis» → «enviogratis» (sin la barra: la pone la pantalla). Sólo letras y números: WhatsApp no admite más. Pura. */
export function limpiarAtajo(t) {
  return sinTildes(t).replace(/^\/+/, "").replace(/[^a-z0-9]+/g, "").slice(0, LIMITES_KIT.atajo);
}

/** Un bloque de texto (bienvenida o ausencia): { texto, editado }. Null si está vacío. Pura. */
function limpiarMensaje(m) {
  const texto = largo(typeof m === "string" ? m : m?.texto, LIMITES_KIT.mensaje);
  return texto ? { texto, ...(m?.editado === true ? { editado: true } : {}) } : null;
}

const limpiarObjeciones = (v, max = 6) => lista(v)
  .map((o) => ({ objecion: corto(o?.objecion, 200), respuesta: largo(o?.respuesta, 500) }))
  .filter((o) => o.objecion && o.respuesta)
  .slice(0, max);

/**
 * El kit, limpio: lo que llega de la IA o de la pantalla. Los atajos sin repetir (uno repetido toma un número), las
 * etapas que existen, los guiones de productos distintos. Las marcas `editado` sólo si son el booleano. Pura.
 */
export function limpiarKitWhatsApp(entrada) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const atajos = new Set();
  const respuestas = [];
  for (const r of lista(e.respuestas)) {
    const texto = largo(r?.texto, LIMITES_KIT.respuesta);
    let atajo = limpiarAtajo(r?.atajo || r?.titulo);
    if (!texto || !atajo) continue;
    for (let i = 2; atajos.has(atajo); i++) atajo = `${atajo.slice(0, LIMITES_KIT.atajo - 2)}${i}`;
    atajos.add(atajo);
    respuestas.push({
      atajo, titulo: corto(r?.titulo, LIMITES_KIT.titulo) || atajo, texto,
      ...(r?.objecion === true ? { objecion: true } : {}), ...(r?.editado === true ? { editado: true } : {}),
    });
    if (respuestas.length >= MAX_RESPUESTAS) break;
  }
  const nombres = new Set();
  const etiquetas = [];
  for (const t of lista(e.etiquetas)) {
    const nombre = corto(t?.nombre, LIMITES_KIT.etiqueta);
    const k = sinTildes(nombre);
    if (!nombre || nombres.has(k)) continue;
    nombres.add(k);
    etiquetas.push({ nombre, etapa: etapaDeEtiqueta(t?.etapa), cuando: corto(t?.cuando, LIMITES_KIT.cuando), ...(t?.editado === true ? { editado: true } : {}) });
    if (etiquetas.length >= MAX_ETIQUETAS) break;
  }
  const productos = new Set();
  const guiones = [];
  for (const g of lista(e.guiones)) {
    const productoId = /^[\w-]{1,60}$/.test(String(g?.productoId ?? "")) ? String(g.productoId) : "";
    const producto = corto(g?.producto, 80);
    const clave = productoId || sinTildes(producto);
    if (!clave || productos.has(clave)) continue;
    const guion = {
      productoId, producto,
      saludo: largo(g?.saludo, LIMITES_KIT.linea),
      preguntas: lista(g?.preguntas).map((p) => corto(p, LIMITES_KIT.pregunta)).filter(Boolean).slice(0, MAX_PREGUNTAS_GUION),
      presentacion: largo(g?.presentacion, LIMITES_KIT.linea),
      objeciones: limpiarObjeciones(g?.objeciones),
      cierre: largo(g?.cierre, LIMITES_KIT.linea),
      seguimiento: lista(g?.seguimiento).map((p) => largo(p, LIMITES_KIT.mensaje)).filter(Boolean).slice(0, MAX_SEGUIMIENTO),
      ...(g?.editado === true ? { editado: true } : {}),
    };
    if (!guion.saludo && !guion.presentacion && !guion.cierre) continue;
    productos.add(clave);
    guiones.push(guion);
    if (guiones.length >= MAX_GUIONES) break;
  }
  const fecha = (x) => (typeof x === "string" ? x.slice(0, 40) : null);
  return {
    bienvenida: limpiarMensaje(e.bienvenida),
    ausencia: limpiarMensaje(e.ausencia),
    respuestas,
    etiquetas,
    guiones,
    ...(fecha(e.propuestoAt) ? { propuestoAt: fecha(e.propuestoAt) } : {}),
    ...(fecha(e.actualizado) ? { actualizado: fecha(e.actualizado) } : {}),
    ...(corto(e.por, 80) ? { por: corto(e.por, 80) } : {}),
  };
}

/** ¿El kit no tiene nada todavía? Pura. */
export const kitVacio = (kit) => {
  const k = limpiarKitWhatsApp(kit);
  return !k.bienvenida && !k.ausencia && !k.respuestas.length && !k.etiquetas.length && !k.guiones.length;
};

// ------------------------------------------------------------
// Los precios, del catálogo
// ------------------------------------------------------------

/** Los productos activos del catálogo con lo que cuenta para el kit: { id, nombre, precio, oferta }. Pura. */
export const productosDelKit = (catalogo) =>
  productosActivos(catalogo).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, oferta: p.oferta }));

const conPrecio = (productos) => lista(productos).filter((p) => p?.precio);

/** La lista de precios del catálogo, una línea por producto (como mucho 12): lo que va en «{precios}». Pura. */
export function listaDePrecios(productos) {
  const ps = conPrecio(productos);
  if (!ps.length) return "[completar: los precios (el catálogo no tiene ninguno)]";
  const lineas = ps.slice(0, 12).map((p) => `• ${p.nombre}: ${p.precio}${p.oferta ? ` (${p.oferta})` : ""}`);
  if (ps.length > 12) lineas.push(`• …y ${ps.length - 12} más: pregúntanos por el que te interesa.`);
  return lineas.join("\n");
}

/**
 * Pone los precios EXACTOS del catálogo donde la IA dejó «{precio}», «{precios}» y «{oferta}». En un guion,
 * «{precio}» es el de su producto; en una respuesta rápida, el del único producto (si sólo hay uno) o la lista. Lo que
 * el catálogo no tiene queda «[completar: …]». Pura.
 */
export function ponerPrecios(kit, productos = []) {
  const k = limpiarKitWhatsApp(kit);
  const ps = lista(productos);
  const porId = new Map(ps.map((p) => [p.id, p]));
  const unico = conPrecio(ps).length === 1 ? conPrecio(ps)[0] : null;
  const precioDe = (p) => (p?.precio ? p.precio : `[completar: el precio de ${p?.nombre || "este producto"}]`);
  const sinOferta = (t) => t.replace(/\s*\(?\{oferta\}\)?[,.]?/g, "").replace(/ {2,}/g, " ");
  const enTexto = (t, p) => {
    let s = String(t ?? "");
    s = s.replace(/\{precios\}/g, listaDePrecios(ps));
    s = s.replace(/\{precio\}/g, p ? precioDe(p) : unico ? unico.precio : listaDePrecios(ps));
    s = p?.oferta ? s.replace(/\{oferta\}/g, p.oferta) : sinOferta(s);
    return s;
  };
  return {
    ...k,
    bienvenida: k.bienvenida ? { ...k.bienvenida, texto: enTexto(k.bienvenida.texto) } : null,
    ausencia: k.ausencia ? { ...k.ausencia, texto: enTexto(k.ausencia.texto) } : null,
    respuestas: k.respuestas.map((r) => ({ ...r, texto: enTexto(r.texto) })),
    guiones: k.guiones.map((g) => {
      const p = porId.get(g.productoId) ?? null;
      const f = (t) => enTexto(t, p ?? { nombre: g.producto });
      return {
        ...g,
        producto: p?.nombre || g.producto,
        saludo: f(g.saludo), presentacion: f(g.presentacion), cierre: f(g.cierre),
        objeciones: g.objeciones.map((o) => ({ objecion: o.objecion, respuesta: f(o.respuesta) })),
        seguimiento: g.seguimiento.map(f),
      };
    }),
  };
}

/** Los guiones de la IA casados con el catálogo: por su id o, si lo inventó, por el nombre (sin tildes). Pura. */
function casarProductos(guiones, productos) {
  const ps = lista(productos);
  return guiones.map((g) => {
    if (ps.some((p) => p.id === g.productoId)) return g;
    const n = sinTildes(g.producto);
    const p = n ? ps.find((x) => sinTildes(x.nombre) === n) ?? ps.find((x) => n.includes(sinTildes(x.nombre)) || sinTildes(x.nombre).includes(n)) : null;
    return p ? { ...g, productoId: p.id, producto: p.nombre } : { ...g, productoId: "" };
  }).filter((g) => g.productoId);
}

// ------------------------------------------------------------
// Lo que la IA propone
// ------------------------------------------------------------

/**
 * Lo que se le pide a la IA. `productos`: los del guion, cada uno con su línea del catálogo y lo que dice el estudio
 * de mercado (maletas y objeciones con su respuesta); `general`: el resumen del estudio general; `ficha`: la ficha
 * del cliente (contacto, sucursales, instrucciones: `textoDelCliente`); `contexto`: el cerebro para escribir (nunca lo
 * interno); `negocio`: { tipo, destino } con sus nombres. Pura.
 */
export function pedidoKitWhatsApp({ marca = "la marca", rubro = "", productos = [], general = "", ficha = "", contexto = "", negocio = "" } = {}) {
  const etapas = ETAPAS_CICLO.map((e) => `${e.id} (${e.nombre}: ${e.ayuda.replace(/\.$/, "").toLowerCase()})`).join("; ");
  const bloquesProducto = lista(productos).slice(0, MAX_GUIONES).map((p) => [
    `[${p.id}] ${lineaDeProducto(p).replace(/^- /, "")}`,
    ...Object.entries(p.maletas ?? {}).map(([k, v]) => `  ${ELEMENTOS_MERCADO.find((x) => x.clave === k)?.titulo ?? k}: ${corto(v, 500)}`),
    ...lista(p.objeciones).map((o) => `  Objeción: «${corto(o.objecion, 200)}» → ${corto(o.respuesta, 300)}`),
  ].join("\n"));
  return [
    `Eres quien atiende y cierra ventas por WhatsApp para ${marca}${rubro ? ` (${rubro})` : ""}. Prepara el kit de su WhatsApp Business: lo que el equipo pega tal cual en sus mensajes automáticos, respuestas rápidas y etiquetas, y un guion de ventas por producto.`,
    "La gente llega casi siempre por un anuncio: escribe con una duda concreta y compara con otras opciones. Cada mensaje tiene que conversar (terminar en una pregunta o en un paso fácil), anticipar la objeción y filtrar a quien sólo curiosea, sin sonar a robot.",
    ...(negocio ? ["", `EL NEGOCIO: ${negocio}`] : []),
    ...(ficha ? ["", ficha] : []),
    "",
    "LOS PRODUCTOS Y SERVICIOS (con el precio del catálogo y su estudio de mercado):",
    bloquesProducto.length ? bloquesProducto.join("\n\n") : "(El catálogo está vacío: escribe el kit sin guiones de producto.)",
    ...(general ? ["", "EL MERCADO EN GENERAL:", general] : []),
    "",
    "LO QUE SABEMOS DE LA MARCA (su voz y sus reglas para escribir):",
    contexto || "(Casi nada guardado todavía.)",
    "",
    "Reglas:",
    "- Español latino neutro, con la voz de la marca (si sus pautas tutean o tratan de usted, igual). Formato de WhatsApp: frases cortas, *negritas* con asteriscos sólo si ayudan, nada de títulos ni markdown, emojis sólo si la marca los usa.",
    "- PRECIOS: no escribas ninguna cifra de precio. En el cierre de cada guion escribe {precio} donde va el precio de ese producto y {oferta} donde va su oferta (si la tiene). En la respuesta rápida del precio escribe {precios} donde va la lista. La aplicación los pone con los del catálogo, exactos.",
    "- No inventes NADA que no esté arriba: ni garantías, ni testimonios, ni cifras, ni plazos de envío, ni horarios, ni direcciones, ni formas de pago, ni descuentos. Donde haga falta un dato que no está, escribe [completar: qué falta] (por ejemplo [completar: el horario de atención]).",
    "- «bienvenida»: para quien escribe por primera vez. Saluda, di quién atiende y pregunta qué busca. Como mucho 3 frases.",
    "- «ausencia»: fuera del horario. Cuándo se responde y qué puede ir mandando mientras (qué producto le interesa, su zona…).",
    `- «respuestas»: de ${MIN_RESPUESTAS} a ${MAX_RESPUESTAS} respuestas rápidas. Primero estas: ${RESPUESTAS_BASE.map((r) => `${r.atajo} (${r.ayuda.replace(/\.$/, "").toLowerCase()})`).join("; ")}. Después, una por cada objeción del estudio de mercado (sin repetir el mismo tema), con «objecion»: true. «atajo»: una palabra corta en minúsculas, sin tildes ni espacios (garantia, cuotas, tallas…). Cada una lista para pegar y terminada en una pregunta o un siguiente paso.`,
    `- «etiquetas»: de ${MIN_ETIQUETAS} a 8 etiquetas para ordenar las conversaciones, cada una con su «etapa» del ciclo de ventas (una de: ${etapas}) y «cuando» se pone. Quien ya escribió por WhatsApp está en «conversion» (aunque sea la primera vez); quien compró, en «ascension»: «presentacion» y «evaluacion» son de quien todavía no escribe y no llevan etiqueta. Parte de estas y adáptalas al negocio: ${ETIQUETAS_BASE.map((t) => `${t.nombre} (${t.etapa})`).join(", ")}.`,
    `- «guiones»: uno por cada producto de la lista (su «productoId» es el que va entre corchetes), con «saludo», de 2 a ${MAX_PREGUNTAS_GUION} «preguntas» para calificar (qué necesita, para cuándo, para quién: lo que separa a quien compra de quien curiosea), «presentacion» con su diferencial (una frase de beneficio, no una lista), «objeciones» (las del estudio de ese producto, con su respuesta), «cierre» con {oferta} y {precio} y un llamado concreto (apartarlo, agendar, pagar), y de 1 a ${MAX_SEGUIMIENTO} mensajes de «seguimiento» por si no contesta (el primero al día siguiente, el último a los 3 o 4 días, sin presionar).`,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"bienvenida":"…","ausencia":"…","respuestas":[{"atajo":"precio","titulo":"Precios","texto":"… {precios} …","objecion":false}],"etiquetas":[{"nombre":"Nuevo","etapa":"presentacion","cuando":"…"}],"guiones":[{"productoId":"…","saludo":"…","preguntas":["…"],"presentacion":"…","objeciones":[{"objecion":"…","respuesta":"…"}],"cierre":"… {oferta} … {precio} …","seguimiento":["…"]}]}',
  ].join("\n");
}

/**
 * La respuesta de la IA → el kit, limpio, con los guiones casados con el catálogo y los PRECIOS puestos. Sin
 * etiquetas, las de partida. Null si no se puede leer o no trae nada. Pura.
 */
export function leerKitWhatsApp(texto, { productos = [] } = {}) {
  const d = jsonDe(texto);
  if (!d || typeof d !== "object") return null;
  const k = limpiarKitWhatsApp(d);
  if (!k.bienvenida && !k.respuestas.length && !k.guiones.length) return null;
  const conGuiones = { ...k, guiones: casarProductos(k.guiones, productos) };
  if (!conGuiones.etiquetas.length) conGuiones.etiquetas = ETIQUETAS_BASE.map((t) => ({ ...t }));
  return ponerPrecios(conGuiones, productos);
}

// ------------------------------------------------------------
// Lo que se revisa antes de copiar
// ------------------------------------------------------------

/** Cada texto del kit con su sitio («Bienvenida», «/precio», «Guion de Sofá · cierre»). Pura. */
export function textosDelKit(kit) {
  const k = limpiarKitWhatsApp(kit);
  const t = [];
  if (k.bienvenida) t.push({ donde: "Bienvenida", texto: k.bienvenida.texto });
  if (k.ausencia) t.push({ donde: "Ausencia", texto: k.ausencia.texto });
  for (const r of k.respuestas) t.push({ donde: `/${r.atajo}`, texto: r.texto });
  for (const g of k.guiones) {
    const de = `Guion de ${g.producto || "un producto"}`;
    for (const [campo, nombre] of [["saludo", "saludo"], ["presentacion", "presentación"], ["cierre", "cierre"]]) if (g[campo]) t.push({ donde: `${de} · ${nombre}`, texto: g[campo] });
    g.preguntas.forEach((p, i) => t.push({ donde: `${de} · pregunta ${i + 1}`, texto: p }));
    g.objeciones.forEach((o) => t.push({ donde: `${de} · objeción «${o.objecion}»`, texto: o.respuesta }));
    g.seguimiento.forEach((s, i) => t.push({ donde: `${de} · seguimiento ${i + 1}`, texto: s }));
  }
  return t;
}

/** Lo que falta rellenar a mano (los «[completar: …]»), sin repetir: [{ donde, que }]. Pura. */
export function pendientesDelKit(kit) {
  const vistos = new Set();
  const salida = [];
  for (const { donde, texto } of textosDelKit(kit)) {
    for (const m of String(texto).matchAll(MARCA_COMPLETAR)) {
      const que = corto(m[1], 120);
      const k = `${donde}|${sinTildes(que)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      salida.push({ donde, que });
    }
  }
  return salida;
}

/**
 * Las cifras de dinero de un texto («$45», «B/. 1.200», «30 dólares») y los descuentos («20 % de descuento»),
 * normalizadas a número. Un «100 % algodón» no es dinero y no cuenta. Pura.
 */
export function cifrasDeDinero(texto) {
  const t = String(texto ?? "");
  const salida = [];
  const num = (s) => Number(String(s).replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
  for (const m of t.matchAll(/(?:\$|B\/\.?|USD|US\$)\s?(\d[\d.,]*\d|\d)/gi)) salida.push({ cifra: m[0].trim(), valor: num(m[1]) });
  for (const m of t.matchAll(/(\d[\d.,]*\d|\d)\s?(?:dólares|dolares|balboas)\b/gi)) salida.push({ cifra: m[0].trim(), valor: num(m[1]) });
  for (const m of t.matchAll(/(\d{1,3})\s?%\s*(?:de\s+)?(?:descuento|dcto|off|menos|de\s+rebaja|rebaja)/gi)) salida.push({ cifra: m[0].trim(), valor: Number(m[1]), pct: true });
  return salida.filter((c) => Number.isFinite(c.valor));
}

/**
 * Lo que hay que revisar antes de copiar el kit: cifras de dinero que no están en el catálogo, una garantía que el
 * estudio no tiene, menos respuestas de las que conviene y lo que falta rellenar. `productos`: los del catálogo
 * (`productosDelKit`); `hayGarantia`: si algún producto del estudio aprobado tiene su maleta de garantía. Pura.
 */
export function avisosDelKit(kit, { productos = [], hayGarantia = false } = {}) {
  const k = limpiarKitWhatsApp(kit);
  const avisos = [];
  const delCatalogo = new Set(lista(productos).flatMap((p) => cifrasDeDinero(`${p.precio ?? ""} ${p.oferta ?? ""}`).map((c) => `${c.pct ? "%" : "$"}${c.valor}`)));
  // Los números sueltos de un precio o una oferta del catálogo («45» en «45 la unidad», «20» en «20% en efectivo»)
  // también valen, como dinero o como descuento.
  for (const p of lista(productos)) {
    for (const m of String(`${p.precio ?? ""} ${p.oferta ?? ""}`).matchAll(/\d[\d.,]*\d|\d/g)) {
      const n = Number(m[0].replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
      delCatalogo.add(`$${n}`);
      delCatalogo.add(`%${n}`);
    }
  }
  const inventadas = [];
  for (const { donde, texto } of textosDelKit(k)) {
    for (const c of cifrasDeDinero(texto)) if (!delCatalogo.has(`${c.pct ? "%" : "$"}${c.valor}`)) inventadas.push(`${c.cifra} (${donde})`);
  }
  if (inventadas.length) avisos.push(`Estas cifras no están en el catálogo: ${[...new Set(inventadas)].slice(0, 5).join(", ")}. Confírmalas o quítalas.`);
  if (!hayGarantia && textosDelKit(k).some(({ texto }) => /garant[ií]/i.test(texto))) {
    avisos.push("El kit habla de una garantía y el estudio de mercado no tiene ninguna: confírmala con el cliente o quítala.");
  }
  if (k.respuestas.length && k.respuestas.length < MIN_RESPUESTAS) avisos.push(`Sólo ${k.respuestas.length} respuestas rápidas: conviene tener al menos ${MIN_RESPUESTAS}.`);
  const pend = pendientesDelKit(k);
  if (pend.length) avisos.push(`Faltan ${pend.length === 1 ? "un dato" : `${pend.length} datos`} por rellenar (lo marcado «[completar: …]»).`);
  return avisos;
}

// ------------------------------------------------------------
// Volver a proponer sin pisar lo editado
// ------------------------------------------------------------

/** Cuántos bloques se editaron a mano (bienvenida, ausencia, cada respuesta, etiqueta y guion). Pura. */
export function bloquesEditados(kit) {
  const k = limpiarKitWhatsApp(kit);
  return [k.bienvenida, k.ausencia, ...k.respuestas, ...k.etiquetas, ...k.guiones].filter((b) => b?.editado).length;
}

/** Una lista con la propuesta nueva, conservando las piezas editadas de la de antes (por su clave). */
function fundirLista(actual, propuesta, clave, max, pisar) {
  if (pisar) return propuesta.slice(0, max);
  const editadas = new Map(actual.filter((x) => x.editado).map((x) => [clave(x), x]));
  const salida = propuesta.map((x) => editadas.get(clave(x)) ?? x);
  const usadas = new Set(salida.map(clave));
  for (const [k, x] of editadas) if (!usadas.has(k)) salida.push(x);
  // Si no cabe, se van primero las de la propuesta (nunca lo editado).
  while (salida.length > max) {
    const i = salida.map((x) => Boolean(x.editado)).lastIndexOf(false);
    if (i < 0) break;
    salida.splice(i, 1);
  }
  return salida.slice(0, max);
}

/**
 * «Volver a proponer»: la propuesta nueva, salvo lo editado a mano, que se queda (`pisarEditado`: también se
 * reemplaza; la pantalla lo pregunta antes). Las fechas y quién guardó son las del kit de antes. Pura.
 */
export function fundirKitWhatsApp(actual, propuesta, { pisarEditado = false } = {}) {
  const a = limpiarKitWhatsApp(actual);
  const p = limpiarKitWhatsApp(propuesta);
  const uno = (x, y) => (!pisarEditado && x?.editado ? x : y ?? (pisarEditado ? null : x));
  return {
    ...p,
    bienvenida: uno(a.bienvenida, p.bienvenida),
    ausencia: uno(a.ausencia, p.ausencia),
    respuestas: fundirLista(a.respuestas, p.respuestas, (r) => r.atajo, MAX_RESPUESTAS, pisarEditado),
    etiquetas: fundirLista(a.etiquetas, p.etiquetas, (t) => sinTildes(t.nombre), MAX_ETIQUETAS, pisarEditado),
    guiones: fundirLista(a.guiones, p.guiones, (g) => g.productoId || sinTildes(g.producto), MAX_GUIONES, pisarEditado),
    ...(a.actualizado ? { actualizado: a.actualizado } : {}),
    ...(a.por ? { por: a.por } : {}),
  };
}

// ------------------------------------------------------------
// Para copiar
// ------------------------------------------------------------

/** Una respuesta rápida como se pega: «/precio — Precios» y el texto. Pura. */
export const respuestaATexto = (r) => `/${r.atajo} — ${r.titulo}\n${r.texto}`;

/** Una etiqueta en una línea: «Cotizó (Conversión): ya tiene el precio…». Pura. */
export const etiquetaATexto = (t) => `${t.nombre}${t.etapa ? ` (${nombreEtapaCiclo(t.etapa)})` : ""}${t.cuando ? `: ${t.cuando}` : ""}`;

/** Un guion de ventas entero, en orden, para leerlo o copiarlo. Pura. */
export function guionATexto(g) {
  if (!g) return "";
  return [
    `GUION DE VENTAS · ${g.producto || "producto"}`,
    g.saludo && `1. Saludo\n${g.saludo}`,
    g.preguntas?.length && `2. Para saber qué necesita\n${g.preguntas.map((p) => `• ${p}`).join("\n")}`,
    g.presentacion && `3. Presentación\n${g.presentacion}`,
    g.objeciones?.length && `4. Si pone un «pero»\n${g.objeciones.map((o) => `• «${o.objecion}»\n  ${o.respuesta}`).join("\n")}`,
    g.cierre && `5. Cierre\n${g.cierre}`,
    g.seguimiento?.length && `6. Si no contesta\n${g.seguimiento.map((s, i) => `• ${i === 0 ? "Al día siguiente" : i === g.seguimiento.length - 1 ? "Unos días después" : "Después"}: ${s}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

/** Todo el kit en un texto ordenado («Copiar todo»; también lo que lee el asistente). Pura. */
export function kitATexto(kit, { marca = "" } = {}) {
  const k = limpiarKitWhatsApp(kit);
  if (kitVacio(k)) return "";
  return [
    `KIT DE WHATSAPP BUSINESS${marca ? ` · ${marca}` : ""}`,
    k.bienvenida && `MENSAJE DE BIENVENIDA\n${k.bienvenida.texto}`,
    k.ausencia && `MENSAJE DE AUSENCIA\n${k.ausencia.texto}`,
    k.respuestas.length && `RESPUESTAS RÁPIDAS\n\n${k.respuestas.map(respuestaATexto).join("\n\n")}`,
    k.etiquetas.length && `ETIQUETAS\n${k.etiquetas.map((t) => `• ${etiquetaATexto(t)}`).join("\n")}`,
    ...k.guiones.map(guionATexto),
  ].filter(Boolean).join("\n\n────────\n\n");
}

/** ¿Algún producto del estudio (aprobado o en borrador) tiene su maleta de garantía escrita? Pura. */
export function estudioTieneGarantia(estudio) {
  const e = limpiarEstudio(estudio);
  return Object.values(e?.productos ?? {}).some((p) => String(p.elementos?.garantia ?? "").trim().length > 0);
}
