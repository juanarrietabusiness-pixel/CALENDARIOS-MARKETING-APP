// ============================================================
// La ficha técnica y las cifras vigentes de un cliente
//
// El botón «Preparar ficha con IA». Una sola llamada, con las notas de
// MARCA del cliente delante, que escribe dos notas nuevas:
//
//   ficha técnica     La tarjeta corta que va SIEMPRE en el contexto de
//                     lo que se escribe: quién es, qué vende, cómo habla,
//                     a quién, qué no se dice. Cita sus notas con
//                     `[[ruta]]`, y esos enlaces son las aristas del grafo
//                     que antes no existían.
//   cifras vigentes   Precios, plazos, teléfonos, garantías: lo que está
//                     ESCRITO. Va aparte de la ficha porque una cifra no
//                     puede depender de que la búsqueda la encuentre.
//
// QUÉ NO LEE LA IA: las notas internas (costos, márgenes, proveedores),
// la maquetación y el prompt maestro de Meta AI (`fueraDeUso`, como en todo
// lo demás), los informes de otros sistemas, las «decisiones» que la
// aplicación apunta sola con cada respuesta del cliente (son de UNA
// publicación, no de la marca) y su propia ficha anterior (se citaría a sí
// misma). Una ficha se escribe para lo que se PUBLICA: lo que la IA no ve, no
// lo puede filtrar. Va primero el canon de GitHub; las decisiones, al final.
//
// LOS PRECIOS LOS MANDA EL CATÁLOGO del estudio de mercado (la nota de
// cifras «Productos y servicios»). La IA lo recibe aparte y no los repite en
// las cifras: así «Cifras vigentes» no puede contradecirlo, y la primera
// línea de las cifras lo dice.
//
// LO QUE CORRIGE UNA PERSONA MANDA. Si alguien editó a mano la ficha, esta
// llamada no la pisa (`forzar` sí). Se reconoce por sus fechas: una nota
// que nadie tocó tiene `created_at` = `updated_at`, y por eso se REEMPLAZA
// borrando e insertando —`insertar` no toca las fechas—, no con `guardar`,
// que pone `updated_at` al día y la haría pasar por editada.
//
// Y LO QUE NO ES SUYO NO SE TOCA. Sólo se reemplaza una nota que la propia IA
// escribió (`origen: "ia"`). Una nota que alguien llamó «Ficha técnica» a
// mano, o una sección importada que se llama igual, tiene la misma ruta y no
// por eso es suya: la ficha nueva toma otra ruta libre (`ficha-tecnica-2`) y
// la de la persona sigue donde estaba.
// ============================================================

import { uuid } from "../ids.js";
import { ErrorIA, llamarIA } from "./ia.js";
import { parseBloques } from "../../../src/lib/parse.js";
import { leerNotas, reindexar, fueraDeUso } from "./cerebro.js";
import { derivados, rutaUnica, textoEditado } from "./notas.js";
import { sinIADeTexto } from "../configIA.js";
import { marcarFicha } from "./estadoSync.js";

const SALIDA = 6000;               // lo que se pide para escribir; el razonamiento va aparte
const PRESUPUESTO_NOTAS = 60_000;  // caracteres de notas que entran en la llamada
const MAX_POR_NOTA = 6000;

export const RUTA_FICHA = "ficha-tecnica";
export const RUTA_CIFRAS = "cifras-vigentes";
const MAX_FICHA = 6000;
const MAX_CIFRAS = 3000;

/** Un fallo de esta llamada que se le puede decir a la persona, con el estado que le toca. */
export const ErrorPreparar = ErrorIA;

/** El orden en que la IA lee las notas de las que sale la ficha: el canon primero, las decisiones al final. */
const ORDEN_FICHA = Object.freeze({ marca: 0, documento: 1, nota: 2, decision: 3 });

/** Las «decisiones» que la aplicación apunta sola con cada respuesta del cliente (aprender.js): son de una publicación. */
export const esDecisionAutomatica = (n) => n?.origen === "app" && String(n?.fuente ?? "").startsWith("respuesta:");

/**
 * ¿Esta nota alimenta la ficha técnica? La MISMA regla para escribirla y para decir que quedó vieja: si no, el aviso
 * saltaba con cosas que la ficha nunca lee (cada respuesta de un cliente dejaba una «decisión» que lo encendía). Pura.
 */
export function alimentaLaFicha(n) {
  return Boolean(n) && !n.interna && n.tipo in ORDEN_FICHA && !esDecisionAutomatica(n)
    && !fueraDeUso({ t: n.tipo, i: n.interna ? 1 : 0, ti: n.titulo }, "texto");
}

/** ¿Es la nota del catálogo (la escribe el estudio de mercado, tipo cifras)? Es la que manda en los precios. */
export const esNotaDelCatalogo = (n) => n?.tipo === "cifras" && n?.origen === "mercado";

/** Lo que se le enseña a la IA, por orden: primero el canon. Lo que no cabe se nombra, no se manda. */
export function notasParaLaFicha(notas, { presupuesto = PRESUPUESTO_NOTAS, maxPorNota = MAX_POR_NOTA } = {}) {
  const validas = notas
    .filter(alimentaLaFicha)
    .sort((a, b) => ORDEN_FICHA[a.tipo] - ORDEN_FICHA[b.tipo] || a.ruta.localeCompare(b.ruta));
  const dentro = [];
  const fuera = [];
  let usado = 0;
  for (const n of validas) {
    const texto = n.texto.length > maxPorNota ? n.texto.slice(0, maxPorNota) + "\n[…recortada]" : n.texto;
    if (usado + texto.length > presupuesto) { fuera.push(n.titulo); continue; }
    dentro.push({ ruta: n.ruta, titulo: n.titulo, texto });
    usado += texto.length;
  }
  return { dentro, fuera };
}

/**
 * ¿La ficha o las cifras son de antes de la última nota de la que salen? `null` si están al día (o no hay).
 * Cuentan SÓLO las notas que la alimentan (`alimentaLaFicha`): ni las internas, ni el prompt maestro, ni las
 * decisiones que la aplicación apunta sola con cada respuesta del cliente. Puro: recibe las filas ligeras.
 * @returns {{ desde: string, cambiadas: string[], total: number } | null}
 */
export function fichaDesactualizada(notas) {
  const deLaIA = notas.filter((n) => n.origen === "ia" && (n.tipo === "ficha" || n.tipo === "cifras"));
  if (!deLaIA.length) return null;
  const desde = deLaIA.reduce((m, n) => (!m || n.updated_at < m ? n.updated_at : m), "");
  const cambiadas = notas.filter((n) => alimentaLaFicha(n) && String(n.updated_at) > String(desde));
  return cambiadas.length ? { desde, cambiadas: cambiadas.map((n) => n.titulo).slice(0, 12), total: cambiadas.length } : null;
}

/** La primera línea de las cifras cuando hay catálogo: quién manda en los precios. */
export const LINEA_PRECIOS = "- Precios de venta: los del catálogo «Productos y servicios» (si algo aquí no coincide, manda el catálogo).";

/** El prompt. Puro. */
export function promptDeLaFicha(cliente, { dentro, fuera }, { catalogo = "" } = {}) {
  const notas = dentro.map((n) => `--- ${n.titulo} [${n.ruta}] ---\n${n.texto}`).join("\n\n");
  const conCatalogo = Boolean(String(catalogo).trim());
  return `Eres el archivista de la agencia Juancito Ads. Vas a escribir la FICHA TÉCNICA y las CIFRAS VIGENTES de ${cliente.name}, a partir de SUS notas —que van al final— y de nada más.

REGLAS, que no se negocian:
· Sólo lo que está escrito en las notas. Si un dato no está, no se escribe: se pone en «Falta por definir». No inventes precios, plazos, teléfonos, ofertas ni testimonios.
· Esto se usará para escribir lo que se PUBLICA. No pongas costos, márgenes, ganancias, proveedores ni nada que las notas marquen como interno, aunque lo veas.
· Español de Panamá, con tildes y signos de apertura. Frases cortas.
· Cada dato importante termina con la nota de donde sale, entre corchetes dobles y con su ruta: [[ruta-de-la-nota]]. Sólo rutas que aparezcan abajo entre corchetes simples.

FICHA (hasta 3 500 caracteres), con estos apartados en este orden: «Quién es», «Qué vende», «Cómo habla» (y cómo NO habla), «A quién le habla», «Límites: lo que nunca se dice ni se hace», «Contacto y redes», «Falta por definir».

CIFRAS (hasta 1 500 caracteres): una lista, una cifra por línea, «- Nombre: valor [[ruta]]». ${conCatalogo ? "Plazos, garantías, horarios, teléfonos, medidas de las piezas, costos de envío: NO pongas precios de venta de productos o servicios, que los manda el CATÁLOGO de abajo." : "Precios de venta, plazos, garantías, horarios, teléfonos, medidas de las piezas."} Sólo las que están escritas y son públicas.
${conCatalogo ? "\nLOS PRECIOS MANDAN LOS DEL CATÁLOGO. Si una nota dice otro precio para un producto del catálogo, ese precio está viejo: no lo copies; en «Falta por definir» escribe «El precio de <producto> en [[ruta]] no coincide con el catálogo».\n" : ""}
Responde EXACTAMENTE con este formato, sin nada antes ni después:
FICHA:
(la ficha)
CIFRAS:
(la lista)

${conCatalogo ? `CATÁLOGO DE ${cliente.name.toUpperCase()} (manda en los precios; no se cita con corchetes):\n${String(catalogo).trim().slice(0, 6000)}\n\n` : ""}NOTAS DE ${cliente.name.toUpperCase()}:
${notas}${fuera.length ? `\n\n(No caben aquí, pero existen: ${fuera.slice(0, 20).join("; ")}. Si hace falta algo de ellas, ponlo en «Falta por definir».)` : ""}`;
}

/** Lo que devolvió el modelo, en dos textos. `null` si no vino la ficha. Puro. */
export function leerRespuesta(texto) {
  const c = parseBloques(String(texto ?? ""), ["FICHA", "CIFRAS"]);
  const ficha = (c.FICHA ?? "").trim().slice(0, MAX_FICHA);
  if (!ficha) return null;
  return { ficha, cifras: (c.CIFRAS ?? "").trim().slice(0, MAX_CIFRAS) };
}

/** Una nota escrita por la IA, sin fechas: las pone la base, iguales, y así consta que nadie la ha tocado. */
const filaIA = (clientId, ruta, titulo, tipo, texto) => ({
  id: uuid(), client_id: clientId, ruta, titulo, texto, ...derivados(texto), tipo, origen: "ia", fuente: "", fuente_sha: "", interna: 0,
});

/**
 * Escribe (o reescribe) la ficha y las cifras de un cliente.
 * @returns {{ ficha: "creada"|"reemplazada"|"conservada", cifras: "creada"|"reemplazada"|"conservada"|"vacia",
 *             modelo: string, aviso: string|null, leidas: number, fuera: string[], segundos: number }}
 */
export async function prepararFicha(env, acceso, cliente, { forzar = false } = {}) {
  if (sinIADeTexto(env)) throw new ErrorPreparar("El servidor no tiene configurada ninguna llave de IA de texto (Anthropic o Meta)", 503);
  const notas = await leerNotas(acceso, cliente.id);
  const paraLaIA = notasParaLaFicha(notas);
  if (!paraLaIA.dentro.length) {
    throw new ErrorPreparar("Este cliente no tiene notas de marca de las que escribir la ficha. Llena el cerebro desde el repositorio o añade notas primero.", 400);
  }

  // La ficha y las cifras que escribió la IA antes, si las hay: lo único que esta llamada puede reemplazar.
  const propia = (tipo) => notas.find((n) => n.origen === "ia" && n.tipo === tipo) ?? null;
  const editada = (tipo) => {
    const n = propia(tipo);
    return n && textoEditado(n) ? n : null;
  };
  const conservaFicha = !forzar && editada("ficha");
  const conservaCifras = !forzar && editada("cifras");
  if (conservaFicha && conservaCifras) {
    await marcarFicha(acceso, cliente.id, false);
    return { ficha: "conservada", cifras: "conservada", modelo: "", aviso: null, leidas: 0, fuera: [], segundos: 0 };
  }

  const catalogo = notas.find(esNotaDelCatalogo)?.texto ?? "";
  const { texto, modelo, aviso, segundos } = await llamarIA(env, acceso, cliente, { prompt: promptDeLaFicha(cliente, paraLaIA, { catalogo }), salida: SALIDA });
  const respuesta = leerRespuesta(texto);
  if (!respuesta) throw new ErrorPreparar("La IA no devolvió la ficha con el formato esperado. Inténtalo otra vez.", 502);
  // Con catálogo, las cifras lo dicen arriba: quien las lea (la IA que escribe, una persona) sabe quién manda.
  if (catalogo.trim() && respuesta.cifras && !respuesta.cifras.includes("catálogo «Productos y servicios»")) {
    respuesta.cifras = `${LINEA_PRECIOS}\n${respuesta.cifras}`.slice(0, MAX_CIFRAS);
  }

  const usadas = new Set(notas.map((n) => n.ruta));
  const reemplazar = async (rutaBase, titulo, tipo, texto, conserva) => {
    if (conserva) return "conservada";
    if (!texto) return "vacia";
    const previa = propia(tipo);
    if (previa) await acceso.borrar("cerebro_notas", { id: previa.id, client_id: cliente.id });
    // La ficha de antes conserva su ruta (los `[[enlaces]]` de otras notas dependen de ella); una nueva toma la
    // que esté libre, que no es la de una nota ajena que ya se llame igual.
    const ruta = previa?.ruta ?? rutaUnica(rutaBase, usadas);
    usadas.add(ruta);
    await acceso.insertar("cerebro_notas", filaIA(cliente.id, ruta, titulo, tipo, texto));
    return previa ? "reemplazada" : "creada";
  };
  const ficha = await reemplazar(RUTA_FICHA, "Ficha técnica", "ficha", respuesta.ficha, conservaFicha);
  const cifras = await reemplazar(RUTA_CIFRAS, "Cifras vigentes", "cifras", respuesta.cifras, conservaCifras);
  await reindexar(env, acceso, cliente.id);
  // Lo que traiga GitHub ya llegó a la ficha: la revisión del cron no tiene que renovarla otra vez.
  await marcarFicha(acceso, cliente.id, false);

  return {
    ficha, cifras, modelo, aviso,
    leidas: paraLaIA.dentro.length, fuera: paraLaIA.fuera,
    segundos,
  };
}
