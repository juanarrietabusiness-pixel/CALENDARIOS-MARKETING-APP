// ============================================================
// Las notas del cerebro de un cliente
//
// Todo puro. Qué es una nota, de qué tipo, cuánto pesa en una búsqueda,
// y cómo se parte un archivo del repositorio en notas.
//
// UNA NOTA ES UNA IDEA, NO UN ARCHIVO. El ADN de un cliente son ocho o
// diez archivos de 5 000 a 26 000 caracteres. Como notas enteras, la
// búsqueda sólo podría decir «trae el manual de marca» y no «trae lo que
// dice sobre el WhatsApp». Partido por secciones, cada nota es corta,
// tiene su título y se puede leer, corregir, ocultar de los textos o
// borrar sola. La partición es MECÁNICA —por encabezados—: no pasa por un
// modelo, así que no puede resumir mal ni perder una regla.
//
// LOS TIPOS
//
//   ficha        La tarjeta técnica del cliente. Va SIEMPRE en el contexto.
//   cifras       Precios, plazos, teléfonos vigentes. Va SIEMPRE, aparte:
//                un precio no puede depender de que la búsqueda lo encuentre.
//   marca        El canon: tono, personas, límites, SEO.
//   maquetacion  Plantillas, escala, bloque de estilo, negativos: lo que
//                sólo sirve para pedirle las piezas a Meta AI.
//   documento    Lo que se subió o se importó y no es canon.
//   nota         Escrita a mano.
//   decision     Lo que el cliente aprobó o rechazó, con su motivo.
//   borrador     Lo que produjo otro sistema (informes del agente diario,
//                prompts semanales ya enviados). Pesa poco y es interno.
//
// `interna` es aparte del tipo: una nota interna la ve el equipo y el
// asistente, pero NUNCA entra en lo que se escribe para publicar. El ADN
// de Baby Caleb lleva costos y márgenes marcados «no se dicen al
// cliente»; una IA que no los ve no puede filtrarlos.
// ============================================================

import { SECCION_DE_MAQUETACION, CLAVES_DE_TEXTO_DE_LA_RECETA } from "../../../src/lib/contextoADN.js";
import { fold } from "./conocimiento.js";
import { summary } from "./memoria.js";

export const TIPOS = Object.freeze(["ficha", "cifras", "marca", "maquetacion", "documento", "nota", "decision", "borrador"]);
export const ORIGENES = Object.freeze(["repositorio", "documento", "manual", "ia", "app"]);

/** Los tipos que entran SIEMPRE en el contexto, sin competir en la búsqueda. */
export const SIEMPRE = Object.freeze(["ficha", "cifras"]);

/**
 * Cuánto pesa cada tipo en una búsqueda: el canon gana a un documento
 * suelto, y un informe de otro sistema casi nunca gana a nada. Sin esto,
 * una pregunta por precios podía citar un borrador antes que la fuente.
 */
export const AUTORIDAD = Object.freeze({ marca: 1.15, decision: 1.05, documento: 1, nota: 1, maquetacion: 0.9, borrador: 0.4 });

export const MAX_TEXTO = 200_000;
export const MAX_TITULO = 140;
export const MAX_NOTAS_POR_CLIENTE = 400;

/** «Tono y voz» → «tono-y-voz». Sin tildes, en minúsculas, hasta 60 caracteres. */
export function slug(texto) {
  return fold(texto).replace(/[^a-z0-9ñ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "nota";
}

/** Un slug que no esté en `usadas`: «tono», «tono-2», «tono-3»… */
export function rutaUnica(base, usadas) {
  if (!usadas.has(base)) return base;
  for (let i = 2; ; i++) {
    const c = `${base.slice(0, 56)}-${i}`;
    if (!usadas.has(c)) return c;
  }
}

/**
 * Lo que se calcula al ESCRIBIR una nota y se guarda aparte (`resumen`, `caracteres`): la lista del cerebro y su
 * estado los leen sin traer el texto entero de cada una, que en un cliente con 400 notas de 200 000 caracteres
 * no cabe en una respuesta de D1. Todo lugar que escriba una nota los calcula con esto.
 */
export function derivados(texto) {
  const t = String(texto ?? "");
  return { resumen: summary(t, 200), caracteres: t.length };
}

/** Lo que llega del navegador, validado. Devuelve `{ error }` si no vale. */
export function limpiarNota(entrada = {}) {
  const titulo = String(entrada.titulo ?? "").trim().slice(0, MAX_TITULO);
  const texto = String(entrada.texto ?? "").replace(/\r\n?/g, "\n");
  if (!titulo) return { error: "La nota necesita un título." };
  if (!texto.trim()) return { error: "La nota está vacía." };
  if (texto.length > MAX_TEXTO) return { error: `La nota pasa de ${MAX_TEXTO.toLocaleString("es")} caracteres: pártela en dos.` };
  const tipo = TIPOS.includes(entrada.tipo) ? entrada.tipo : "nota";
  return {
    nota: {
      titulo,
      texto,
      tipo,
      interna: entrada.interna ? 1 : 0,
      fuente: String(entrada.fuente ?? "").slice(0, 300),
      origen: ORIGENES.includes(entrada.origen) ? entrada.origen : "manual",
    },
  };
}

// ------------------------------------------------------------
// De un archivo del repositorio a notas
// ------------------------------------------------------------

/**
 * Encabezados de sección donde está lo que la agencia no cuenta al cliente. Sólo para avisar.
 *
 * Es ESTRECHA a propósito. Una nota marcada interna sale de todo lo que se escribe para publicar, y ocultar de más
 * es un fallo mudo: «Costo de envío» o «Horario operativo» son datos públicos, y una IA que no los ve no los puede
 * decir. Por eso sólo entran las expresiones que casi siempre son del negocio por dentro —economía unitaria,
 * márgenes, proveedores, «landed cost», roadmap, inversionistas, «reglas operativas», lo llamado «interno»—; una
 * palabra suelta como «costo», «importación» u «operativo» no basta. Lo demás que huela a interno lo dice
 * `MENCION_INTERNA` en el cuerpo, y sólo AVISA (`revisar`): la persona decide.
 */
const SECCION_INTERNA = /econom[ií]a unitaria|\bm[aá]rgen(?:es)?\b|proveedor(?:es)?|\blanded\b|roadmap|inversionista|reglas operativas|\bintern[oa]s?\b/i;
const MENCION_INTERNA = /nunca se dicen? al cliente|uso interno|solo interno|sólo interno|confidencial|memoria interna|landed cost/i;

/**
 * Qué es un archivo del repositorio del cliente, por dónde está y cómo
 * se llama. Los nombres son los del estándar de la agencia.
 */
export function clasificarArchivo(ruta) {
  const r = String(ruta);
  if (/(^|\/)Instagram_TikTok\/.*prompt_maestro.*\.md$/i.test(r)) return { tipo: "borrador", interna: 1, forma: "texto" };
  if (/(^|\/)Auditorias\/.+\.md$/i.test(r)) return { tipo: "borrador", interna: 1, forma: "texto" };
  if (/(^|\/)05_receta\.json$/i.test(r)) return { tipo: "maquetacion", interna: 0, forma: "receta" };
  if (/(^|\/)05_prompt_maestro_meta_ai\.md$/i.test(r)) return { tipo: "marca", interna: 0, forma: "prompt-maestro" };
  if (/(^|\/)(01_brand_guidelines\.md|02_buyer_personas\.md|03_diccionario_seo\.json)$/i.test(r)) return { tipo: "marca", interna: 0, forma: "texto" };
  return { tipo: "documento", interna: 0, forma: "texto" };
}

/**
 * En qué «lóbulo» del cerebro cae una nota: lo que las notas de un mismo archivo comparten. En el mapa 3D cada lóbulo
 * es una región propia; el color, en cambio, sale del tipo. La ficha y las cifras van juntas: son el centro.
 */
export function grupoDe(nota) {
  if (nota.tipo === "ficha" || nota.tipo === "cifras") return "Ficha y cifras";
  // Los informes de otros sistemas se llaman por su fecha («2026-09.md»): un lóbulo por cada uno sería un lóbulo de una nota.
  if (nota.tipo === "borrador") return "Informes de otros sistemas";
  if (nota.fuente) return tituloDeArchivo(nota.fuente);
  return nota.origen === "ia" ? "Escritas por la IA" : "Escritas a mano";
}

/** El nombre de un archivo como título: `01_brand_guidelines.md` → «Brand guidelines». */
export function tituloDeArchivo(ruta) {
  const nombre = String(ruta).split("/").pop().replace(/\.[a-z]+$/i, "").replace(/^\d+[_-]/, "").replace(/[_-]+/g, " ").trim();
  return nombre ? nombre[0].toUpperCase() + nombre.slice(1) : "Documento";
}

/** Un texto en trozos que empiezan en un encabezado de nivel `nivel`; lo que va antes del primero es el primero. */
function partirPorEncabezado(texto, nivel) {
  return texto.split(new RegExp(`^(?=${"#".repeat(nivel)} )`, "m")).filter((t) => t.trim());
}

/** El título de un trozo: el primer encabezado que lleve, sin las almohadillas ni el «3 ·» de la numeración. */
const encabezadoDe = (trozo) => (/^#{1,4}\s+(.+)$/m.exec(trozo)?.[1] ?? "").trim().replace(/^\d+\s*[·.)-]\s*/, "");

/**
 * Un archivo de texto en secciones de hasta `max` caracteres: por
 * encabezado «##» y, si una sigue siendo enorme, por «###». Lo que va
 * antes del primer «##» es la introducción. Cada sección lleva su título
 * con su jerarquía («Tono › Voz de marca»), que es lo que hace que dos
 * secciones no se llamen igual.
 * → [{ titulo, texto, intro }]
 */
export function seccionesDe(texto, max = 6000) {
  const t = String(texto).replace(/\r\n?/g, "\n");
  const salida = [];
  for (const s2 of partirPorEncabezado(t, 2)) {
    const intro = !/^##\s/.test(s2);
    const titulo2 = intro ? "" : encabezadoDe(s2);
    const hijas = s2.length > max && !intro ? partirPorEncabezado(s2, 3) : [];
    // Sin «###» dentro no hay por dónde cortar: se queda entera, y la
    // búsqueda ya la trocea en pasajes.
    if (hijas.length < 2) { salida.push({ titulo: titulo2, texto: s2, intro }); continue; }
    hijas.forEach((h) => {
      const propia = /^###\s/.test(h);
      salida.push({ titulo: propia ? `${titulo2} › ${encabezadoDe(h)}` : titulo2, texto: h, intro: false });
    });
  }
  return salida;
}

/**
 * Un archivo del repositorio → sus notas: [{ ruta, titulo, texto, tipo,
 * interna, fuente, origen, revisar? }]. `usadas` son las rutas que ya hay
 * en el cliente (se completa con las nuevas, para que no choquen).
 * `revisar` avisa de una nota que menciona algo interno y que la agencia
 * debe mirar: no se marca sola porque un precio de venta puede vivir en
 * la misma sección que un costo, y ocultarla dejaría al modelo sin precio.
 */
export function dividirEnNotas(fuente, texto, usadas = new Set()) {
  const { tipo: tipoBase, interna: internaBase, forma } = clasificarArchivo(fuente);
  const archivo = tituloDeArchivo(fuente);
  const notas = [];
  const crear = (titulo, cuerpo, extra = {}) => {
    const ruta = rutaUnica(slug(titulo), usadas);
    usadas.add(ruta);
    const nota = { ruta, titulo: titulo.slice(0, MAX_TITULO), texto: cuerpo.trim(), tipo: tipoBase, interna: internaBase, fuente, origen: "repositorio", ...extra };
    if (!nota.interna) {
      // Por lo que dice el TÍTULO se marca sola (una sección llamada
      // «Economía unitaria» no es para un caption); por lo que dice el
      // cuerpo sólo se avisa: un precio de venta puede vivir en la misma
      // sección que un costo, y ocultarla dejaría al modelo sin precio.
      if (SECCION_INTERNA.test(titulo)) nota.interna = 1;
      else if (MENCION_INTERNA.test(cuerpo)) nota.revisar = true;
    }
    notas.push(nota);
  };

  if (forma === "receta") {
    let receta = null;
    try { receta = JSON.parse(texto); } catch { /* recortada o rota: entra entera como maquetación */ }
    if (receta && typeof receta === "object" && !Array.isArray(receta)) {
      const copia = Object.fromEntries(CLAVES_DE_TEXTO_DE_LA_RECETA.filter((k) => k in receta).map((k) => [k, receta[k]]));
      const resto = Object.fromEntries(Object.entries(receta).filter(([k]) => !CLAVES_DE_TEXTO_DE_LA_RECETA.includes(k)));
      if (Object.keys(copia).length) crear(`${archivo}: reglas de texto`, JSON.stringify(copia, null, 2), { tipo: "marca" });
      if (Object.keys(resto).length) crear(`${archivo}: medidas y colores`, JSON.stringify(resto, null, 2));
      return notas;
    }
    crear(archivo, String(texto));
    return notas;
  }

  if (/\.json$/i.test(fuente)) {
    crear(archivo, String(texto));
    return notas;
  }

  // Un informe de otro sistema no se parte: son decenas de notas casi
  // vacías que no le dicen nada a nadie por separado.
  const secciones = tipoBase === "borrador" ? [] : seccionesDe(texto);
  if (secciones.length <= 1) {
    crear(encabezadoDe(String(texto)) || archivo, String(texto));
    return notas;
  }
  const h1 = /^#\s+(.+)$/m.exec(String(texto))?.[1]?.trim() || archivo;
  for (const { titulo, texto: cuerpo, intro } of secciones) {
    const nombre = intro || !titulo ? h1 : `${archivo} — ${titulo}`;
    // Una sección de la capa de maquetación del prompt maestro no es marca.
    const extra = forma === "prompt-maestro" && (intro || SECCION_DE_MAQUETACION.test(titulo)) ? { tipo: "maquetacion" } : {};
    crear(nombre, cuerpo, extra);
  }
  return notas;
}
