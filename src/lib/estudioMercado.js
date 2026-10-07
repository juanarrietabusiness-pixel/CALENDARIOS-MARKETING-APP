// ============================================================
// El estudio de mercado de un cliente (puro)
//
// Lo que la agencia hacía a mano al recibir un cliente: organizar lo que
// sabe de él, estudiar su mercado y sacar los siete elementos con los que
// se escriben las campañas y los posts. Aquí, por cliente y en tres piezas:
//
//   · el CATÁLOGO: sus productos y servicios con precio, oferta, para quién
//     y beneficios. Un precio no se inventa: sale de aquí, y va al cerebro
//     como nota de cifras, que la IA lee siempre. Con el INVENTARIO encendido
//     (por cliente, apagado por defecto) cada uno lleva además disponibilidad,
//     hasta cuándo vale la oferta y su diferenciador; apagado, eso no existe
//     para nadie: ni la pantalla lo enseña ni la IA lo lee;
//   · el ESTUDIO: lo general del mercado (rubro, competencia, dos perfiles
//     de comprador, sus tres deseos principales, el nivel de consciencia) y,
//     por cada producto, los siete elementos, las objeciones con su
//     respuesta, un gancho por nivel de consciencia y los textos de anuncio;
//   · las REFERENCIAS: anuncios de la competencia que la agencia sube (la
//     captura) y la IA analiza.
//
// Los marcos son públicos: los cinco niveles de consciencia de Eugene
// Schwartz y los dieciséis deseos básicos de Steven Reiss. Lo usan la
// pantalla (EstudioMercado.jsx) y el Worker (worker/lib/mercado.js).
// ============================================================

import { MONTHS } from "../constants";
import { DESEOS_REISS, NIVELES_CONSCIENCIA, nombreDeNivel } from "./consciencia";

/** Los siete elementos del estudio («las 7 maletas»), por producto o servicio. */
export const ELEMENTOS_MERCADO = Object.freeze([
  { clave: "cliente", titulo: "Cliente ideal", ayuda: "Quién compra, en qué momento y qué lo empuja a buscar" },
  { clave: "dolor", titulo: "Dolor o problema", ayuda: "Lo que le duele o le frustra antes de comprar" },
  { clave: "deseo", titulo: "Deseo y resultado", ayuda: "Lo que quiere lograr y cómo se ve su vida después" },
  { clave: "objeciones", titulo: "Objeciones y miedos", ayuda: "Por qué duda, qué lo frena" },
  { clave: "alternativas", titulo: "Alternativas y competencia", ayuda: "Qué usa hoy o a quién le compra en su lugar" },
  { clave: "diferenciador", titulo: "Diferenciador", ayuda: "Por qué esta empresa y no otra" },
  { clave: "confianza", titulo: "Prueba y confianza", ayuda: "Garantías, testimonios y datos que lo respaldan" },
]);

export { DESEOS_REISS, NIVELES_CONSCIENCIA, nombreDeNivel };
const CLAVES_NIVEL = NIVELES_CONSCIENCIA.map((n) => n.clave);

/** Lo que admite Meta en un anuncio (lo que no se ve recortado en el feed). */
export const LIMITES_ANUNCIO = Object.freeze({ titulo: 40, textoPrincipal: 300, descripcion: 30 });

export const MAX_PRODUCTOS = 30;

/**
 * La disponibilidad de un producto (sólo con el inventario encendido). `peso`: cuántas publicaciones le tocan
 * frente a los demás en la rotación del mes; `alInicio`: sólo en la primera mitad del mes (se puede acabar).
 */
export const NIVELES_STOCK = Object.freeze([
  { id: "alto", nombre: "Mucho", ayuda: "Hay de sobra: más publicaciones y puede ir en cualquier semana", peso: 3 },
  { id: "medio", nombre: "Normal", ayuda: "Lo de siempre", peso: 2 },
  { id: "bajo", nombre: "Poco", ayuda: "Se puede acabar: va en la primera mitad del mes", peso: 2, alInicio: true },
  { id: "agotado", nombre: "Agotado", ayuda: "No se anuncia hasta que vuelva", peso: 0 },
]);
const STOCK_IDS = NIVELES_STOCK.map((n) => n.id);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_MATERIAL = 20_000;
export const MAX_REFERENCIAS = 60;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const lista = (v, n, max = 300) => (Array.isArray(v) ? v : []).map((x) => corto(x, max)).filter(Boolean).slice(0, n);

/** «Lavado de muebles» → «lavado-de-muebles». */
export function slugProducto(texto) {
  return String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "producto";
}

/** El JSON de una respuesta de la IA, aunque venga con texto o vallas alrededor. Null si no hay. */
export function jsonDe(texto) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}

// ------------------------------------------------------------
// El catálogo
// ------------------------------------------------------------

export const MAX_FOTOS_PRODUCTO = 4;

/** Un producto o servicio, limpio. Null si no tiene nombre. */
export function limpiarProducto(p) {
  const nombre = corto(p?.nombre, 80);
  if (!nombre) return null;
  return {
    id: /^[\w-]{1,60}$/.test(String(p?.id ?? "")) ? String(p.id) : `p-${slugProducto(nombre)}`,
    nombre,
    tipo: p?.tipo === "servicio" ? "servicio" : "producto",
    precio: corto(p?.precio, 60),
    oferta: corto(p?.oferta, 160),
    paraQuien: corto(p?.paraQuien, 240),
    beneficios: largo(p?.beneficios, 700),
    activo: p?.activo !== false,
    stock: STOCK_IDS.includes(p?.stock) ? p.stock : "",
    stockNota: corto(p?.stockNota, 120),
    ofertaHasta: FECHA.test(String(p?.ofertaHasta ?? "")) ? p.ofertaHasta : "",
    diferenciador: corto(p?.diferenciador, 240),
    // Fotos del producto (claves de R2 del cliente): el Estudio las usa de referencia para que salga el producto REAL.
    fotos: fotosDeProducto(p?.fotos),
  };
}

/** Las fotos de un producto: claves `clientes/<cliente>/…` sin `..`, sin repetir, hasta MAX_FOTOS_PRODUCTO. Pura. */
export function fotosDeProducto(fotos) {
  const salida = [];
  for (const f of Array.isArray(fotos) ? fotos : []) {
    const k = String(f ?? "");
    if (/^clientes\/[^/]+\/.+/.test(k) && !k.includes("..") && k.length <= 300 && !salida.includes(k)) salida.push(k);
    if (salida.length >= MAX_FOTOS_PRODUCTO) break;
  }
  return salida;
}

/** El catálogo guardado, limpio: sin repetidos (el id manda; uno repetido toma otro) y con tope. Pura. */
export function limpiarCatalogo(entrada) {
  const usados = new Set();
  const salida = [];
  for (const p of Array.isArray(entrada) ? entrada : []) {
    const limpio = limpiarProducto(p);
    if (!limpio) continue;
    let id = limpio.id;
    for (let i = 2; usados.has(id); i++) id = `${limpio.id}-${i}`;
    usados.add(id);
    salida.push({ ...limpio, id });
    if (salida.length >= MAX_PRODUCTOS) break;
  }
  return salida;
}

export const productosActivos = (catalogo) => limpiarCatalogo(catalogo).filter((p) => p.activo);

/** Los productos activos que tienen fotos → [{ id, nombre, fotos }] (lo que el Estudio pone de referencia). Pura. */
export const fotosDelCatalogo = (catalogo) =>
  productosActivos(catalogo).filter((p) => p.fotos.length).map((p) => ({ id: p.id, nombre: p.nombre, fotos: p.fotos }));

/** Sin el inventario encendido, lo del inventario no existe: se borra de cada producto. Pura. */
const sinInventario = (p) => ({ ...p, stock: "", stockNota: "", ofertaHasta: "", diferenciador: "" });

/**
 * Los productos que pueden salir en el plan del mes: los activos y, con el inventario encendido, sin los agotados
 * (con su disponibilidad, que usa la rotación de `asignarMatriz`). Pura.
 */
export function productosParaPlan(catalogo, inventario = false) {
  const activos = productosActivos(catalogo);
  return inventario ? activos.filter((p) => p.stock !== "agotado") : activos.map(sinInventario);
}

/** «2026-10-15» → «15 de octubre de 2026». */
export function fechaLarga(iso) {
  if (!FECHA.test(String(iso ?? ""))) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${String(MONTHS[m - 1] ?? "").toLowerCase()} de ${a}`;
}

/** Una línea por producto, como la lee la IA. `inventario`: con disponibilidad, vigencia de la oferta y diferenciador. */
export function lineaDeProducto(p, { inventario = false } = {}) {
  const partes = [`${p.nombre} (${p.tipo})`];
  partes.push(p.precio ? `precio: ${p.precio}` : "precio: sin definir");
  if (p.oferta) {
    const hasta = inventario && fechaLarga(p.ofertaHasta);
    partes.push(hasta ? `oferta: ${p.oferta} (válida hasta el ${hasta}; en publicaciones posteriores NO se menciona)` : `oferta: ${p.oferta}`);
  }
  if (p.paraQuien) partes.push(`para: ${p.paraQuien}`);
  if (p.beneficios) partes.push(`beneficios: ${p.beneficios.replace(/\n+/g, "; ")}`);
  if (inventario && p.diferenciador) partes.push(`lo que lo hace distinto: ${p.diferenciador}`);
  // Sólo la escasez se le dice a la IA, y sin cifras: la nota del stock es de la agencia.
  if (inventario && p.stock === "bajo") partes.push("disponibilidad: poca (se puede decir «últimas unidades» o «cupos limitados», sin inventar cantidades)");
  return `- ${partes.join(" · ")}`;
}

/**
 * El catálogo como nota del cerebro (tipo cifras: la IA la lee SIEMPRE que escribe). Sólo lo activo; lo que no
 * está disponible no se nombra, para que nadie lo anuncie. Con el inventario encendido, lo agotado se nombra
 * aparte y con la orden de no anunciarlo: otra nota del cerebro puede hablar de él. Vacío si no hay nada. Pura.
 */
export function catalogoATexto(catalogo, { inventario = false } = {}) {
  const activos = productosActivos(catalogo);
  const vigentes = inventario ? activos.filter((p) => p.stock !== "agotado") : activos;
  const agotados = inventario ? activos.filter((p) => p.stock === "agotado") : [];
  if (!vigentes.length && !agotados.length) return "";
  return [
    "Productos y servicios vigentes. Los precios y ofertas son EXACTAMENTE estos: no se inventan otros ni se redondean.",
    "",
    ...vigentes.map((p) => lineaDeProducto(p, { inventario })),
    ...(agotados.length ? ["", `Agotados ahora (NO se anuncian ni se ofrecen hasta que vuelvan): ${agotados.map((p) => p.nombre).join(", ")}.`] : []),
  ].join("\n");
}

/**
 * El mensaje para pedirle al cliente lo que falta (WhatsApp): por producto, el precio que no está y, con el
 * inventario encendido, la disponibilidad y hasta cuándo va la oferta; luego lo que el estudio dejó por confirmar.
 * Pura.
 */
export function mensajePedirDatos({ marca = "", catalogo = [], inventario = false, estudio = null } = {}) {
  const activos = productosActivos(catalogo);
  const porProducto = [];
  for (const p of activos) {
    const falta = [];
    if (!p.precio) falta.push("precio");
    if (inventario && !p.stock) falta.push("¿cuánto hay disponible?");
    if (inventario && p.oferta && !p.ofertaHasta) falta.push(`¿la oferta «${p.oferta}» sigue? ¿hasta cuándo?`);
    if (falta.length) porProducto.push(`• ${p.nombre}: ${falta.join(" · ")}`);
  }
  const e = limpiarEstudio(estudio);
  const vistos = new Set();
  const pendientes = [...(e?.general?.faltan ?? []), ...Object.values(e?.productos ?? {}).flatMap((x) => x.faltan ?? [])]
    .filter((x) => { const k = x.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 8);
  return [
    `Hola${marca ? `, equipo de ${marca}` : ""}. Para preparar el contenido del mes necesitamos confirmar algunos datos:`,
    "",
    ...(porProducto.length ? ["*Productos y servicios*", ...porProducto, ""] : []),
    ...(pendientes.length ? ["*Para el contenido*", ...pendientes.map((x) => `• ${x}`), ""] : []),
    inventario
      ? "¿Hay productos nuevos, alguno agotado o promociones para este mes? Si hay alguno con mucho inventario que quieran mover, también nos sirve saberlo."
      : "¿Hay productos o servicios nuevos, o promociones para este mes?",
    "",
    "¡Gracias!",
  ].join("\n");
}

/** Lo que se le pide a la IA para proponer el catálogo desde el cerebro. Pura. */
export function pedidoDeCatalogo({ marca, rubro = "", contexto = "" }) {
  return [
    `Arma el catálogo de productos y servicios de ${marca}${rubro ? ` (${rubro})` : ""} a partir de lo que sabemos de la marca.`,
    "",
    "LO QUE SABEMOS:",
    contexto || "(Casi nada guardado todavía.)",
    "",
    "Reglas:",
    "- Sólo productos y servicios que aparezcan en lo que sabemos. No inventes ninguno.",
    "- El precio, EXACTAMENTE como está escrito (con su moneda). Si no aparece, déjalo vacío: no lo estimes.",
    "- La oferta, sólo si aparece una vigente.",
    "- «paraQuien»: a quién le sirve, en una frase. «beneficios»: los 2 a 4 principales, separados por punto y coma.",
    "- Si hay muchas variantes de lo mismo (tallas, colores), agrúpalas en un solo producto.",
    `- Como mucho ${MAX_PRODUCTOS}.`,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"productos":[{"nombre":"…","tipo":"producto|servicio","precio":"…","oferta":"…","paraQuien":"…","beneficios":"…"}]}',
  ].join("\n");
}

/** La respuesta de la IA → el catálogo propuesto. Null si no se puede leer. Pura. */
export function leerCatalogo(texto) {
  const d = jsonDe(texto);
  if (!d || !Array.isArray(d.productos)) return null;
  return limpiarCatalogo(d.productos.map((p) => ({ ...p, id: undefined, activo: true, fotos: [] })));
}

/** Junta lo propuesto con lo que había: lo que ya existía (mismo nombre) conserva su id y lo escrito a mano manda. Pura. */
export function fundirCatalogo(guardado, propuesto) {
  const antes = limpiarCatalogo(guardado);
  const porNombre = new Map(antes.map((p) => [slugProducto(p.nombre), p]));
  const nuevos = [];
  for (const p of limpiarCatalogo(propuesto)) {
    const previo = porNombre.get(slugProducto(p.nombre));
    if (previo) {
      // Lo que tenía escrito una persona gana; la IA sólo rellena lo vacío.
      const fundido = { ...previo };
      for (const k of ["precio", "oferta", "paraQuien", "beneficios", "diferenciador"]) if (!fundido[k] && p[k]) fundido[k] = p[k];
      porNombre.set(slugProducto(p.nombre), fundido);
    } else {
      nuevos.push(p);
    }
  }
  return limpiarCatalogo([...antes.map((p) => porNombre.get(slugProducto(p.nombre)) ?? p), ...nuevos]);
}

// ------------------------------------------------------------
// El estudio: lo general
// ------------------------------------------------------------

const REGLAS_COMUNES = [
  "- Español de Panamá, neutro, frases cortas y concretas. Nada de relleno ni frases de manual.",
  "- No inventes precios, ofertas, testimonios, cifras ni garantías de la marca: lo de la marca sale de LO QUE SABEMOS. Lo que no esté y haga falta, va en «faltan».",
  "- Lo que digas del mercado o de la competencia, que sea verificable. Si buscaste en internet, apunta las direcciones en «fuentes».",
  "- Nada interno de la agencia ni de la marca (costos, márgenes, proveedores).",
];

/** Lo que se le pide a la IA para el estudio general del mercado. Pura. */
export function pedidoGeneral({ marca, rubro = "", contexto = "", catalogo = [], material = "", conWeb = false, pais = "Panamá" }) {
  const activos = productosActivos(catalogo);
  return [
    `Eres estratega de marketing de una agencia en ${pais}. Haz el estudio de mercado de ${marca}${rubro ? ` (${rubro})` : ""}: su rubro, su competencia y a quién le vende, para escribir sus campañas, anuncios y posts.`,
    conWeb
      ? `Tienes búsqueda en internet: úsala para conocer el rubro en ${pais}, los competidores principales (nombre, qué ofrecen, cómo comunican) y lo que dicen los clientes (reseñas, foros). Haz pocas búsquedas y bien elegidas.`
      : "No tienes búsqueda en internet: trabaja con lo que sabemos y con tu conocimiento del rubro, y di en «faltan» lo que habría que verificar.",
    "",
    "LO QUE SABEMOS DE LA MARCA:",
    contexto || "(Casi nada guardado todavía.)",
    "",
    activos.length ? `SUS PRODUCTOS Y SERVICIOS:\n${activos.map(lineaDeProducto).join("\n")}` : "SUS PRODUCTOS Y SERVICIOS: (sin catálogo todavía)",
    ...(material ? ["", "MATERIAL QUE APORTA LA AGENCIA (reseñas, conversaciones, comentarios; es voz real del cliente, úsala):", largo(material, MAX_MATERIAL)] : []),
    "",
    "Reglas:",
    ...REGLAS_COMUNES,
    "- «perfiles»: exactamente DOS perfiles de comprador distintos (motivaciones o situaciones diferentes aunque compren lo mismo).",
    `- «deseos»: los TRES deseos que más mueven la compra, elegidos de esta lista (escritos igual): ${DESEOS_REISS.join(", ")}. Con el porqué en una frase.`,
    `- «nivel»: el nivel de consciencia dominante del mercado, uno de: ${CLAVES_NIVEL.join(", ")}.`,
    "- «competidores»: de 3 a 6, con lo que hacen bien y su punto débil.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"rubro":"…","resumen":"el panorama del mercado en 4 a 6 frases","competidores":[{"nombre":"…","queHacen":"…","fuerte":"…","debil":"…","enlace":"…"}],"perfiles":[{"nombre":"…","quien":"…","dolor":"…","aspiracion":"…"}],"deseos":[{"deseo":"…","porque":"…"}],"nivel":{"dominante":"…","porque":"…"},"propuestaValor":"…","diferenciadores":["…"],"tendencias":["…"],"oportunidades":["…"],"faltan":["…"],"fuentes":["https://…"]}',
  ].join("\n");
}

const enlaceValido = (u) => (/^https?:\/\/[^\s"<>]+$/i.test(String(u ?? "").trim()) ? String(u).trim().slice(0, 300) : "");

/** Lo general, limpio. Null si no trae lo mínimo (un resumen o un perfil). Pura. */
export function limpiarGeneral(d) {
  if (!d || typeof d !== "object") return null;
  const general = {
    rubro: corto(d.rubro, 120),
    resumen: largo(d.resumen, 1500),
    competidores: (Array.isArray(d.competidores) ? d.competidores : []).map((c) => ({
      nombre: corto(c?.nombre, 80), queHacen: corto(c?.queHacen, 300), fuerte: corto(c?.fuerte, 240), debil: corto(c?.debil, 240), enlace: enlaceValido(c?.enlace),
    })).filter((c) => c.nombre).slice(0, 8),
    perfiles: (Array.isArray(d.perfiles) ? d.perfiles : []).map((p) => ({
      nombre: corto(p?.nombre, 60), quien: corto(p?.quien, 300), dolor: corto(p?.dolor, 300), aspiracion: corto(p?.aspiracion, 300),
    })).filter((p) => p.nombre).slice(0, 2),
    deseos: (Array.isArray(d.deseos) ? d.deseos : []).map((x) => ({
      deseo: DESEOS_REISS.find((r) => r.toLowerCase() === String(x?.deseo ?? "").trim().toLowerCase()) ?? "", porque: corto(x?.porque, 300),
    })).filter((x) => x.deseo).filter((x, i, a) => a.findIndex((y) => y.deseo === x.deseo) === i).slice(0, 3),
    nivel: {
      dominante: CLAVES_NIVEL.includes(d.nivel?.dominante) ? d.nivel.dominante : "",
      porque: corto(d.nivel?.porque, 300),
    },
    propuestaValor: corto(d.propuestaValor, 400),
    diferenciadores: lista(d.diferenciadores, 6),
    tendencias: lista(d.tendencias, 6),
    oportunidades: lista(d.oportunidades, 6),
    faltan: lista(d.faltan, 8),
    fuentes: (Array.isArray(d.fuentes) ? d.fuentes : []).map(enlaceValido).filter(Boolean).filter((u, i, a) => a.indexOf(u) === i).slice(0, 15),
  };
  return general.resumen || general.perfiles.length ? general : null;
}

/** La respuesta de la IA → lo general. Null si no se puede leer. Pura. */
export const leerGeneral = (texto) => limpiarGeneral(jsonDe(texto));

/** Lo general en pocas líneas, para lo que se le pide después (cada producto, el kit, la referencia). Pura. */
export function resumenGeneral(general) {
  const g = limpiarGeneral(general);
  if (!g) return "";
  return [
    g.rubro && `Rubro: ${g.rubro}`,
    g.propuestaValor && `Propuesta de valor: ${g.propuestaValor}`,
    g.perfiles.length && `Perfiles de comprador: ${g.perfiles.map((p) => `${p.nombre} (${p.quien}; le duele: ${p.dolor}; quiere: ${p.aspiracion})`).join(" | ")}`,
    g.deseos.length && `Deseos que mueven la compra: ${g.deseos.map((d) => `${d.deseo} (${d.porque})`).join("; ")}`,
    g.nivel.dominante && `Nivel de consciencia dominante: ${nombreDeNivel(g.nivel.dominante)}`,
    g.diferenciadores.length && `Diferenciadores: ${g.diferenciadores.join("; ")}`,
    g.competidores.length && `Competencia: ${g.competidores.map((c) => c.nombre).join(", ")}`,
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// El estudio: cada producto o servicio
// ------------------------------------------------------------

/** Lo que se le pide a la IA para un producto o servicio. Pura. */
export function pedidoDeProducto({ marca, producto, general = null, contexto = "", material = "", conWeb = false }) {
  const p = limpiarProducto(producto);
  const resumen = resumenGeneral(general);
  return [
    `Eres estratega de marketing y copywriter de respuesta directa. Estudia ${p.tipo === "servicio" ? "el servicio" : "el producto"} «${p.nombre}» de ${marca} para escribir sus anuncios y sus posts.`,
    conWeb
      ? "Tienes búsqueda en internet: úsala, con pocas búsquedas, para ver cómo lo venden otros y qué objeciones y reseñas tiene este tipo de producto."
      : "No tienes búsqueda en internet: trabaja con lo que sabemos y con tu conocimiento del rubro.",
    "",
    `EL ${p.tipo === "servicio" ? "SERVICIO" : "PRODUCTO"}:`,
    lineaDeProducto(p),
    ...(resumen ? ["", "EL ESTUDIO GENERAL DEL MERCADO:", resumen] : []),
    "",
    "LO QUE SABEMOS DE LA MARCA:",
    contexto || "(Casi nada guardado todavía.)",
    ...(material ? ["", "MATERIAL QUE APORTA LA AGENCIA (voz real del cliente):", largo(material, MAX_MATERIAL)] : []),
    "",
    "Reglas:",
    ...REGLAS_COMUNES,
    `- «elementos»: los siete, de 2 a 4 frases cada uno: ${ELEMENTOS_MERCADO.map((e) => `${e.clave} (${e.ayuda.toLowerCase()})`).join("; ")}.`,
    "- «pruebas»: SOLO garantías, testimonios o datos que estén en lo que sabemos o en el material. Si no hay, vacío y dilo en «faltan».",
    "- «ganchos»: una frase de gancho para un anuncio por nivel de consciencia. Inconsciente y problema, por el DOLOR (lo que quiere evitar); solución, producto y decisión, por la GANANCIA (lo que logra). Empieza con un verbo o una pregunta, nunca con el nombre de la marca. Concretos.",
    `- «anuncio»: los textos de un anuncio de Meta: título (hasta ${LIMITES_ANUNCIO.titulo} caracteres), texto principal (hasta ${LIMITES_ANUNCIO.textoPrincipal}, que enganche en la primera línea) y descripción (hasta ${LIMITES_ANUNCIO.descripcion}). Con el precio sólo si está en el catálogo.`,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"elementos":{${ELEMENTOS_MERCADO.map((e) => `"${e.clave}":"…"`).join(",")}},"objeciones":[{"objecion":"…","respuesta":"…"}],"pruebas":["…"],"ganchos":{${CLAVES_NIVEL.map((c) => `"${c}":"…"`).join(",")}},"anuncio":{"titulo":"…","textoPrincipal":"…","descripcion":"…"},"faltan":["…"],"fuentes":["https://…"]}`,
  ].join("\n");
}

/** El estudio de un producto, limpio. Null si no trae los elementos. Pura. */
export function limpiarDeProducto(d, { nombre = "" } = {}) {
  if (!d || typeof d !== "object") return null;
  const elementos = {};
  for (const e of ELEMENTOS_MERCADO) {
    const t = largo(d.elementos?.[e.clave], 1200);
    if (t) elementos[e.clave] = t;
  }
  if (Object.keys(elementos).length < 3) return null;
  const ganchos = {};
  for (const c of CLAVES_NIVEL) {
    const t = corto(d.ganchos?.[c], 220);
    if (t) ganchos[c] = t;
  }
  return {
    nombre: corto(d.nombre || nombre, 80),
    elementos,
    objeciones: (Array.isArray(d.objeciones) ? d.objeciones : []).map((o) => ({ objecion: corto(o?.objecion, 200), respuesta: corto(o?.respuesta, 400) })).filter((o) => o.objecion && o.respuesta).slice(0, 8),
    pruebas: lista(d.pruebas, 8),
    ganchos,
    anuncio: {
      titulo: corto(d.anuncio?.titulo, LIMITES_ANUNCIO.titulo),
      textoPrincipal: largo(d.anuncio?.textoPrincipal, LIMITES_ANUNCIO.textoPrincipal),
      descripcion: corto(d.anuncio?.descripcion, LIMITES_ANUNCIO.descripcion),
    },
    faltan: lista(d.faltan, 8),
    fuentes: (Array.isArray(d.fuentes) ? d.fuentes : []).map(enlaceValido).filter(Boolean).slice(0, 10),
  };
}

/** La respuesta de la IA → el estudio de un producto. Null si no se puede leer. Pura. */
export const leerDeProducto = (texto, opciones) => limpiarDeProducto(jsonDe(texto), opciones);

// ------------------------------------------------------------
// El estudio entero: guardar, revisar, convertirlo en notas y en documento
// ------------------------------------------------------------

/** El estudio (aprobado o borrador), limpio. Pura. */
export function limpiarEstudio(e) {
  if (!e || typeof e !== "object") return null;
  const productos = {};
  for (const [id, p] of Object.entries(e.productos ?? {})) {
    if (!/^[\w-]{1,60}$/.test(id)) continue;
    const limpio = limpiarDeProducto(p, { nombre: p?.nombre });
    if (limpio) productos[id] = limpio;
  }
  const general = limpiarGeneral(e.general);
  if (!general && !Object.keys(productos).length) return null;
  return {
    general,
    productos,
    conWeb: Boolean(e.conWeb),
    hechoAt: typeof e.hechoAt === "string" ? e.hechoAt.slice(0, 40) : null,
    ...(typeof e.aprobadoAt === "string" ? { aprobadoAt: e.aprobadoAt.slice(0, 40) } : {}),
  };
}

/** Qué falta para tener el estudio completo: lo general y un estudio por cada producto activo. Pura. */
export function pasosDelEstudio(catalogo, borrador) {
  const b = limpiarEstudio(borrador);
  const pasos = [{ clave: "general", nombre: "El mercado en general", hecho: Boolean(b?.general) }];
  for (const p of productosActivos(catalogo)) pasos.push({ clave: p.id, nombre: p.nombre, hecho: Boolean(b?.productos?.[p.id]) });
  return pasos;
}

const parrafos = (titulo, items) => (items?.length ? [`## ${titulo}`, ...items.map((x) => `- ${x}`), ""] : []);

/** Lo general como nota del cerebro (markdown). Pura. */
export function notaGeneral(general, { marca = "" } = {}) {
  const g = limpiarGeneral(general);
  if (!g) return "";
  return [
    `# Estudio de mercado${marca ? ` de ${marca}` : ""}`,
    "",
    ...(g.rubro ? [`Rubro: ${g.rubro}`, ""] : []),
    ...(g.resumen ? ["## Panorama", g.resumen, ""] : []),
    ...(g.propuestaValor ? ["## Propuesta de valor", g.propuestaValor, ""] : []),
    ...(g.perfiles.length ? ["## Perfiles de comprador", ...g.perfiles.map((p) => `- **${p.nombre}**: ${p.quien}. Le duele: ${p.dolor}. Quiere: ${p.aspiracion}.`), ""] : []),
    ...(g.deseos.length ? ["## Deseos que mueven la compra", ...g.deseos.map((d) => `- **${d.deseo}**: ${d.porque}`), ""] : []),
    ...(g.nivel.dominante ? ["## Nivel de consciencia dominante", `${nombreDeNivel(g.nivel.dominante)}${g.nivel.porque ? `: ${g.nivel.porque}` : ""}`, ""] : []),
    ...parrafos("Diferenciadores", g.diferenciadores),
    ...parrafos("Tendencias", g.tendencias),
    ...parrafos("Oportunidades", g.oportunidades),
    ...parrafos("Falta por confirmar", g.faltan),
  ].join("\n").trim();
}

/**
 * La competencia, en su propia nota. Va aparte e INTERNA a propósito: la ve el equipo y el asistente, pero no entra
 * en lo que se escribe para publicar, donde nombrar a la competencia sería un error. Pura.
 */
export function notaCompetencia(general) {
  const g = limpiarGeneral(general);
  if (!g?.competidores.length) return "";
  return [
    "# Competencia",
    "",
    ...g.competidores.map((c) => `- **${c.nombre}**: ${c.queHacen}${c.fuerte ? ` Fuerte: ${c.fuerte}.` : ""}${c.debil ? ` Débil: ${c.debil}.` : ""}${c.enlace ? ` (${c.enlace})` : ""}`),
  ].join("\n").trim();
}

/** El estudio de un producto como nota del cerebro (markdown). Pura. */
export function notaDeProducto(estudioProducto, producto) {
  const e = limpiarDeProducto(estudioProducto, { nombre: producto?.nombre });
  if (!e) return "";
  const p = limpiarProducto(producto) ?? { nombre: e.nombre, tipo: "producto" };
  return [
    `# Estudio: ${p.nombre}`,
    "",
    lineaDeProducto(p).slice(2),
    "",
    ...ELEMENTOS_MERCADO.filter((x) => e.elementos[x.clave]).flatMap((x) => [`## ${x.titulo}`, e.elementos[x.clave], ""]),
    ...(e.objeciones.length ? ["## Objeciones y cómo responderlas", ...e.objeciones.map((o) => `- «${o.objecion}» → ${o.respuesta}`), ""] : []),
    ...parrafos("Pruebas reales", e.pruebas),
    ...(Object.keys(e.ganchos).length ? ["## Ganchos por nivel de consciencia", ...NIVELES_CONSCIENCIA.filter((n) => e.ganchos[n.clave]).map((n) => `- ${n.nombre}: ${e.ganchos[n.clave]}`), ""] : []),
    ...(e.anuncio.titulo || e.anuncio.textoPrincipal ? [
      "## Textos de anuncio",
      ...[["Título", e.anuncio.titulo], ["Texto principal", e.anuncio.textoPrincipal], ["Descripción", e.anuncio.descripcion]]
        .filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`),
      "",
    ] : []),
    ...parrafos("Falta por confirmar", e.faltan),
  ].join("\n").trim();
}

/**
 * Las notas del cerebro de un estudio: una general, la competencia (interna) y una por producto (el catálogo da los
 * nombres y precios). Pura.
 */
export function notasDelEstudio(estudio, catalogo, { marca = "" } = {}) {
  const e = limpiarEstudio(estudio);
  if (!e) return [];
  const notas = [];
  const general = notaGeneral(e.general, { marca });
  if (general) notas.push({ ruta: "estudio-de-mercado", titulo: "Estudio de mercado", texto: general, interna: false });
  const competencia = notaCompetencia(e.general);
  if (competencia) notas.push({ ruta: "estudio-competencia", titulo: "Estudio de mercado: competencia", texto: competencia, interna: true });
  const porId = new Map(limpiarCatalogo(catalogo).map((p) => [p.id, p]));
  for (const [id, est] of Object.entries(e.productos)) {
    const producto = porId.get(id) ?? { nombre: est.nombre, tipo: "producto" };
    const texto = notaDeProducto(est, producto);
    if (texto) notas.push({ ruta: `estudio-${slugProducto(producto.nombre)}`, titulo: `Estudio: ${producto.nombre}`, texto, interna: false });
  }
  return notas;
}

const escapar = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown sencillo (##, -, **) → HTML, para el documento de Drive. Pura. */
function markdownAHtml(md) {
  const salida = [];
  let enLista = false;
  const cerrar = () => { if (enLista) { salida.push("</ul>"); enLista = false; } };
  const enLinea = (t) => escapar(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const linea of String(md ?? "").split("\n")) {
    if (/^# /.test(linea)) { cerrar(); salida.push(`<h1>${enLinea(linea.slice(2))}</h1>`); }
    else if (/^## /.test(linea)) { cerrar(); salida.push(`<h2>${enLinea(linea.slice(3))}</h2>`); }
    else if (/^- /.test(linea)) { if (!enLista) { salida.push("<ul>"); enLista = true; } salida.push(`<li>${enLinea(linea.slice(2))}</li>`); }
    else if (linea.trim()) { cerrar(); salida.push(`<p>${enLinea(linea)}</p>`); }
    else cerrar();
  }
  cerrar();
  return salida.join("\n");
}

/** El estudio entero como HTML, que Drive convierte en un documento de Google. Pura. */
export function estudioADocumento(estudio, catalogo, { marca = "", fecha = new Date() } = {}) {
  const e = limpiarEstudio(estudio);
  const f = new Date(fecha);
  const cuando = `${f.getDate()} de ${MONTHS[f.getMonth()].toLowerCase()} de ${f.getFullYear()}`;
  const notas = notasDelEstudio(e, catalogo, { marca });
  const catalogoTexto = catalogoATexto(catalogo);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapar(`Estudio de mercado — ${marca}`)}</title></head><body>
<p><em>Juancito Ads · ${escapar(cuando)}${e?.conWeb ? " · con búsqueda en internet" : ""}</em></p>
${notas.map((n) => markdownAHtml(n.texto)).join("\n<hr>\n")}
${catalogoTexto ? `<hr>\n<h2>Catálogo</h2>\n${markdownAHtml(catalogoTexto)}` : ""}
${e?.general?.fuentes?.length ? `<h2>Fuentes</h2><ul>${e.general.fuentes.map((u) => `<li><a href="${escapar(u)}">${escapar(u)}</a></li>`).join("")}</ul>` : ""}
</body></html>`;
}

// ------------------------------------------------------------
// Del estudio al Estudio (imágenes) y al kit de marca
// ------------------------------------------------------------

/**
 * Los ángulos de anuncio que salen del estudio, para escoger en el Estudio: uno por producto y nivel con gancho.
 * → [{ id, productoId, producto, precio, oferta, nivel, nombreNivel, gancho }]. Pura.
 */
export function angulosDeAnuncio(estudio, catalogo) {
  const e = limpiarEstudio(estudio);
  if (!e) return [];
  const salida = [];
  for (const p of productosActivos(catalogo)) {
    const est = e.productos[p.id];
    if (!est) continue;
    for (const n of NIVELES_CONSCIENCIA) {
      const gancho = est.ganchos[n.clave];
      if (gancho) salida.push({ id: `${p.id}:${n.clave}`, productoId: p.id, producto: p.nombre, precio: p.precio, oferta: p.oferta, nivel: n.clave, nombreNivel: n.nombre, gancho });
    }
  }
  return salida;
}

/** La idea para el Estudio a partir de un ángulo: el gancho como texto de la pieza y el precio tal cual. Pura. */
export function ideaDesdeAngulo(angulo) {
  if (!angulo) return "";
  const partes = [`Anuncio de ${angulo.producto}.`, `Texto principal en la pieza: «${angulo.gancho}».`];
  if (angulo.precio) partes.push(`Precio visible, escrito exactamente así: ${angulo.precio}.`);
  if (angulo.oferta) partes.push(`Oferta: ${angulo.oferta}.`);
  return partes.join(" ");
}

/** Lo que el kit de marca necesita saber del estudio para escribir el preset de anuncio. Pura. */
export function estudioParaElKit(estudio) {
  const e = limpiarEstudio(estudio);
  if (!e?.general) return "";
  return `ESTUDIO DE MERCADO (para el tono y el mensaje de los anuncios):\n${resumenGeneral(e.general)}`;
}

// ------------------------------------------------------------
// Las referencias de la competencia
// ------------------------------------------------------------

/** Cuántos días lleva activo un anuncio (desde `desde`, AAAA-MM-DD). Null si no se sabe. Pura. */
export function diasActivo(desde, hoy = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde ?? ""))) return null;
  const d = Math.floor((new Date(hoy).getTime() - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
  return d >= 0 ? d : null;
}

/** «Lleva 3 meses activo»: cuanto más tiempo, más probable que le esté funcionando a quien lo paga. Pura. */
export function fraseActivo(desde, hoy = new Date()) {
  const d = diasActivo(desde, hoy);
  if (d === null) return "";
  if (d < 14) return `Lleva ${d === 1 ? "1 día" : `${d} días`} activo: aún no dice mucho.`;
  if (d < 60) return `Lleva ${Math.round(d / 7)} semanas activo.`;
  return `Lleva ${Math.round(d / 30)} meses activo: es probable que le esté funcionando.`;
}

/** Lo que se le pide a la IA al mirar el anuncio de un competidor (la imagen va aparte). Pura. */
export function pedidoDeReferencia({ marca, competidor = "", desde = "", nota = "", estudio = null }) {
  const resumen = resumenGeneral(limpiarEstudio(estudio)?.general);
  return [
    `Esta imagen es un anuncio de la competencia${competidor ? ` (${competidor})` : ""} de ${marca}. Analízalo como estratega de respuesta directa, para aprender de él sin copiarlo.`,
    desde ? `Está activo desde ${desde}. ${fraseActivo(desde)}` : "",
    nota ? `Nota de la agencia: ${corto(nota, 400)}` : "",
    ...(resumen ? ["", `LO QUE SABEMOS DEL MERCADO DE ${marca.toUpperCase()}:`, resumen] : []),
    "",
    `Responde SOLO con JSON, sin texto alrededor. «nivel» es uno de: ${CLAVES_NIVEL.join(", ")}. «deseo», uno de: ${DESEOS_REISS.join(", ")}.`,
    '{"gancho":"el gancho, tal cual o resumido","angulo":"el ángulo (dolor, ganancia, prueba social, urgencia…)","oferta":"la oferta o el llamado a la acción","formato":"cómo está hecho (foto, gráfico, texto encima, antes/después…)","nivel":"…","deseo":"…","porQueFunciona":"en 2 o 3 frases","ideaParaNosotros":"cómo adaptar lo que funciona para ' + marca.replace(/"/g, "") + ', sin copiar, en 2 o 3 frases"}',
  ].filter((x) => x !== "").join("\n");
}

/**
 * Lo que se le pide a Gemini al VER un video de la competencia (anuncio u orgánico): lo mismo que a una captura
 * y además su ESTRUCTURA, tramo a tramo, que es lo que se reutiliza para escribir guiones con la misma forma. Pura.
 */
export function pedidoDeReferenciaVideo({ marca, competidor = "", desde = "", nota = "", estudio = null, origen = "anuncio" }) {
  const base = pedidoDeReferencia({ marca, competidor, desde, nota, estudio })
    .replace(/^Esta imagen es un anuncio de la competencia/, `Este video es ${origen === "organico" ? "contenido orgánico (no pagado)" : "un anuncio"} de la competencia`);
  return [
    base.replace(/\{"gancho"[\s\S]*$/, "").trimEnd(),
    "Mira el video ENTERO (imagen y audio). Además de lo anterior, saca su ESTRUCTURA tramo a tramo con los segundos reales: qué se ve y qué se dice o se lee en cada momento. Sé fiel a lo que hay: no inventes nada que no se vea o no se oiga. Responde en español.",
    '{"gancho":"…","angulo":"…","oferta":"…","formato":"…","nivel":"…","deseo":"…","porQueFunciona":"…","ideaParaNosotros":"…","estructura":{"duracion":12,"tramos":[{"desde":0,"hasta":2,"que":"qué pasa (el gancho)"}],"textoPantalla":"los textos que aparecen","sonido":"voz, música o sonido","camara":"planos y movimientos","ritmo":"cortes por segundo, lento o rápido"}}',
  ].join("\n");
}

/** La estructura de un video de referencia, limpia. Null si no trae tramos. Pura. */
export function limpiarEstructura(e) {
  if (!e || typeof e !== "object") return null;
  const num = (v, max = 600) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, max) : null; };
  const tramos = (Array.isArray(e.tramos) ? e.tramos : [])
    .map((t) => ({ desde: num(t?.desde), hasta: num(t?.hasta), que: corto(t?.que, 300) }))
    .filter((t) => t.que && t.desde !== null && t.hasta !== null && t.hasta >= t.desde)
    .slice(0, 12);
  if (!tramos.length) return null;
  return {
    duracion: num(e.duracion) ?? tramos.at(-1).hasta,
    tramos,
    textoPantalla: corto(e.textoPantalla, 300),
    sonido: corto(e.sonido, 200),
    camara: corto(e.camara, 200),
    ritmo: corto(e.ritmo, 120),
  };
}

/** «0–2 s: … · 2–6 s: …» y lo demás, corto: lo que viaja a un guion para que siga la misma forma. Pura. */
export function estructuraATexto(estructura, max = 900) {
  const e = limpiarEstructura(estructura);
  if (!e) return "";
  return [
    `${e.duracion ? `Dura ${e.duracion} s. ` : ""}${e.tramos.map((t) => `${t.desde}–${t.hasta} s: ${t.que}`).join(" · ")}`,
    e.camara && `Cámara: ${e.camara}`,
    e.ritmo && `Ritmo: ${e.ritmo}`,
    e.textoPantalla && `Texto en pantalla: ${e.textoPantalla}`,
    e.sonido && `Sonido: ${e.sonido}`,
  ].filter(Boolean).join(". ").slice(0, max);
}

/** El análisis de una referencia, limpio. Null si no se puede leer. Pura. */
export function leerReferencia(texto) {
  const d = jsonDe(texto);
  if (!d || typeof d !== "object") return null;
  const estructura = limpiarEstructura(d.estructura);
  const r = {
    gancho: corto(d.gancho, 240),
    angulo: corto(d.angulo, 160),
    oferta: corto(d.oferta, 200),
    formato: corto(d.formato, 200),
    nivel: CLAVES_NIVEL.includes(d.nivel) ? d.nivel : "",
    deseo: DESEOS_REISS.find((x) => x.toLowerCase() === String(d.deseo ?? "").trim().toLowerCase()) ?? "",
    porQueFunciona: corto(d.porQueFunciona, 600),
    ideaParaNosotros: corto(d.ideaParaNosotros, 600),
    ...(estructura ? { estructura } : {}),
  };
  return r.gancho || r.porQueFunciona ? r : null;
}

/** Una referencia guardada, limpia. Pura. */
export function limpiarReferencia(r) {
  if (!r || typeof r !== "object" || !/^[\w-]{1,60}$/.test(String(r.id ?? ""))) return null;
  return {
    id: String(r.id),
    archivoId: /^[\w-]{1,80}$/.test(String(r.archivoId ?? "")) ? String(r.archivoId) : "",
    clave: typeof r.clave === "string" && /^clientes\/[^/]+\/.+/.test(r.clave) && !r.clave.includes("..") ? r.clave : "",
    competidor: corto(r.competidor, 80),
    // Un video (anuncio u orgánico de TikTok, Reels…) o una captura; anuncio u orgánico; para qué tipo de contenido sirve.
    medio: r.medio === "video" ? "video" : "imagen",
    origen: r.origen === "organico" ? "organico" : "anuncio",
    pilar: /^[a-z]{1,20}$/.test(String(r.pilar ?? "")) ? r.pilar : "",
    enlace: enlaceValido(r.enlace),
    desde: /^\d{4}-\d{2}-\d{2}$/.test(String(r.desde ?? "")) ? r.desde : "",
    nota: corto(r.nota, 400),
    analisis: r.analisis ? (leerReferencia(JSON.stringify(r.analisis)) ?? null) : null,
    notaId: /^[\w-]{1,80}$/.test(String(r.notaId ?? "")) ? String(r.notaId) : "",
    creadaAt: typeof r.creadaAt === "string" ? r.creadaAt.slice(0, 40) : "",
  };
}

export const limpiarReferencias = (lista) =>
  (Array.isArray(lista) ? lista : []).map(limpiarReferencia).filter(Boolean).slice(0, MAX_REFERENCIAS);

/** Una referencia como nota del cerebro. Pura. */
export function notaDeReferencia(referencia) {
  const r = limpiarReferencia(referencia);
  if (!r) return "";
  const a = r.analisis;
  return [
    `# Referencia de la competencia${r.competidor ? `: ${r.competidor}` : ""}`,
    "",
    `${r.medio === "video" ? "Video" : "Imagen"} · ${r.origen === "organico" ? "contenido orgánico" : "anuncio"}`,
    r.desde ? `Activo desde ${r.desde}. ${fraseActivo(r.desde)}` : "",
    r.enlace ? `Enlace: ${r.enlace}` : "",
    r.nota ? `Nota: ${r.nota}` : "",
    ...(a ? [
      "",
      a.gancho && `- Gancho: ${a.gancho}`,
      a.angulo && `- Ángulo: ${a.angulo}`,
      a.oferta && `- Oferta: ${a.oferta}`,
      a.formato && `- Formato: ${a.formato}`,
      a.nivel && `- Nivel de consciencia: ${nombreDeNivel(a.nivel)}`,
      a.deseo && `- Deseo: ${a.deseo}`,
      "",
      a.porQueFunciona && `## Por qué funciona\n${a.porQueFunciona}`,
      a.ideaParaNosotros && `\n## Cómo adaptarlo\n${a.ideaParaNosotros}`,
      a.estructura && `\n## Estructura del video\n${estructuraATexto(a.estructura, 1500)}`,
    ] : ["", "(Sin analizar todavía.)"]),
  ].filter((x) => x !== false && x !== undefined && x !== "").join("\n").trim();
}

// ------------------------------------------------------------
// De una referencia a algo nuestro
// ------------------------------------------------------------

/**
 * «Adaptar a la marca»: un guion con la MISMA estructura que la referencia (sus tramos, su ritmo, su tipo de
 * gancho) para un producto de la marca, con lo del estudio de mercado. Pura.
 * @param productoLinea  el producto con su precio exacto (`lineaDeProducto`), o vacío.
 */
export function pedidoDeAdaptacion({ marca, referencia, productoLinea = "", formato = "reel", contexto = "", kit = "" }) {
  const r = limpiarReferencia(referencia);
  const a = r?.analisis ?? {};
  const estructura = estructuraATexto(a.estructura, 1500);
  return [
    `Eres director creativo de una agencia en Panamá. Escribe ${formato === "carrusel" ? "un carrusel" : formato === "post" ? "un post" : "un video corto (reel)"} para ${marca} con la MISMA estructura que esta referencia de la competencia: misma forma, mismo tipo de gancho y mismo ritmo; el contenido es de ${marca}. Nunca copies sus frases, su marca ni sus datos.`,
    "",
    "LA REFERENCIA:",
    a.gancho && `- Gancho: ${a.gancho}`,
    a.angulo && `- Ángulo: ${a.angulo}`,
    a.formato && `- Cómo está hecha: ${a.formato}`,
    a.porQueFunciona && `- Por qué funciona: ${a.porQueFunciona}`,
    estructura && `- Estructura: ${estructura}`,
    a.ideaParaNosotros && `- Cómo adaptarla (lo que ya pensamos): ${a.ideaParaNosotros}`,
    "",
    productoLinea ? `EL PRODUCTO (precio y oferta EXACTOS): ${productoLinea}` : "EL PRODUCTO: el que mejor encaje con lo que sabemos de la marca (sin inventar precios).",
    kit && `\nEL ESTILO DE LA MARCA:\n${corto(kit, 1200)}`,
    contexto && `\nLO QUE SABEMOS DE LA MARCA:\n${largo(contexto, 5000)}`,
    "",
    "Reglas: español latino neutro; nada de precios, garantías ni testimonios inventados; la competencia no se nombra.",
    formato === "carrusel"
      ? "En «guion», el texto de cada lámina separado por ---."
      : formato === "post" ? "En «guion», qué se ve en la pieza y el texto que lleva encima." : "En «guion», escena por escena con sus segundos (como los tramos de la referencia).",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"titulo":"…","idea":"la idea en 1-2 frases","guion":"…","textoPantalla":"lo que se lee en pantalla (corto)","descripcion":"el caption, con llamada a la acción y hashtags al final"}',
  ].filter((x) => x !== "" && x !== false && x !== undefined).join("\n");
}

/** La adaptación de la IA, limpia. Null si no se puede leer. Pura. */
export function leerAdaptacion(texto) {
  const d = jsonDe(texto);
  if (!d || typeof d !== "object") return null;
  const r = {
    titulo: corto(d.titulo, 120),
    idea: corto(d.idea, 400),
    guion: largo(d.guion, 3000),
    textoPantalla: corto(d.textoPantalla, 200),
    descripcion: largo(d.descripcion, 2200),
  };
  return r.guion || r.idea ? r : null;
}

/**
 * «Recrear con mi marca»: el pedido para el Estudio a partir de una captura de la competencia. La captura va de
 * imagen de referencia; el texto pide su composición con el producto y los colores de la marca, sin su texto ni su
 * logo. Sin IA: se puede pulir con «Mejorar idea» antes de crear. Pura.
 */
export function ideaParaRecrear(referencia, producto = null) {
  const r = limpiarReferencia(referencia);
  const a = r?.analisis ?? {};
  return [
    "Crea una pieza nueva con la misma composición y el mismo tipo de imagen que la de referencia",
    a.formato ? ` (${a.formato.replace(/\.$/, "")})` : "",
    producto ? `, con ${producto.nombre}` : ", con nuestro producto",
    ", en los colores de nuestra marca. No copies su texto, su logo ni su marca.",
    a.gancho ? ` El mensaje, con nuestras palabras: ${a.gancho.replace(/\.$/, "")}.` : "",
    producto?.precio ? ` Precio exacto: ${producto.precio}.` : "",
  ].join("").replace(/\s+/g, " ").trim().slice(0, 1500);
}

/** «Seguir este video con mi marca»: el pedido para un modelo que sigue un video de referencia (Kling Omni). Pura. */
export function ideaParaSeguirVideo(referencia, producto = null) {
  const r = limpiarReferencia(referencia);
  const a = r?.analisis ?? {};
  const estructura = estructuraATexto(a.estructura, 600);
  return [
    "Sigue los planos, el ritmo y el movimiento del video de referencia",
    producto ? `, con ${producto.nombre}` : ", con nuestro producto",
    " y los colores de nuestra marca. Sin su texto, su logo ni su marca; sin texto largo en pantalla.",
    estructura ? ` Estructura: ${estructura}` : "",
  ].join("").replace(/\s+/g, " ").trim().slice(0, 1500);
}
