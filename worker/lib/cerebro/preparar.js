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
// la maquetación de Meta AI, los informes de otros sistemas y su propia
// ficha anterior (se citaría a sí misma). Una ficha se escribe para lo que
// se PUBLICA: lo que la IA no ve, no lo puede filtrar.
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
import { leerNotas, reindexar } from "./cerebro.js";
import { derivados, rutaUnica } from "./notas.js";

const SALIDA = 6000;               // lo que se pide para escribir; el razonamiento va aparte
const PRESUPUESTO_NOTAS = 60_000;  // caracteres de notas que entran en la llamada
const MAX_POR_NOTA = 6000;

export const RUTA_FICHA = "ficha-tecnica";
export const RUTA_CIFRAS = "cifras-vigentes";
const MAX_FICHA = 6000;
const MAX_CIFRAS = 3000;

/** Un fallo de esta llamada que se le puede decir a la persona, con el estado que le toca. */
export const ErrorPreparar = ErrorIA;

/** Lo que se le enseña a la IA, por orden: primero el canon. Lo que no cabe se nombra, no se manda. */
export function notasParaLaFicha(notas, { presupuesto = PRESUPUESTO_NOTAS, maxPorNota = MAX_POR_NOTA } = {}) {
  const orden = { marca: 0, decision: 1, documento: 2, nota: 3 };
  const validas = notas
    .filter((n) => !n.interna && n.tipo in orden)
    .sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.ruta.localeCompare(b.ruta));
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

/** El prompt. Puro. */
export function promptDeLaFicha(cliente, { dentro, fuera }) {
  const notas = dentro.map((n) => `--- ${n.titulo} [${n.ruta}] ---\n${n.texto}`).join("\n\n");
  return `Eres el archivista de la agencia Juancito Ads. Vas a escribir la FICHA TÉCNICA y las CIFRAS VIGENTES de ${cliente.name}, a partir de SUS notas —que van al final— y de nada más.

REGLAS, que no se negocian:
· Sólo lo que está escrito en las notas. Si un dato no está, no se escribe: se pone en «Falta por definir». No inventes precios, plazos, teléfonos, ofertas ni testimonios.
· Esto se usará para escribir lo que se PUBLICA. No pongas costos, márgenes, ganancias, proveedores ni nada que las notas marquen como interno, aunque lo veas.
· Español de Panamá, con tildes y signos de apertura. Frases cortas.
· Cada dato importante termina con la nota de donde sale, entre corchetes dobles y con su ruta: [[ruta-de-la-nota]]. Sólo rutas que aparezcan abajo entre corchetes simples.

FICHA (hasta 3 500 caracteres), con estos apartados en este orden: «Quién es», «Qué vende», «Cómo habla» (y cómo NO habla), «A quién le habla», «Límites: lo que nunca se dice ni se hace», «Contacto y redes», «Falta por definir».

CIFRAS (hasta 1 500 caracteres): una lista, una cifra por línea, «- Nombre: valor [[ruta]]». Precios de venta, plazos, garantías, horarios, teléfonos, medidas de las piezas. Sólo las que están escritas y son públicas.

Responde EXACTAMENTE con este formato, sin nada antes ni después:
FICHA:
(la ficha)
CIFRAS:
(la lista)

NOTAS DE ${cliente.name.toUpperCase()}:
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
  if (!env.ANTHROPIC_API_KEY) throw new ErrorPreparar("El servidor no tiene configurada la clave de Anthropic", 503);
  const notas = await leerNotas(acceso, cliente.id);
  const paraLaIA = notasParaLaFicha(notas);
  if (!paraLaIA.dentro.length) {
    throw new ErrorPreparar("Este cliente no tiene notas de marca de las que escribir la ficha. Llena el cerebro desde el repositorio o añade notas primero.", 400);
  }

  // La ficha y las cifras que escribió la IA antes, si las hay: lo único que esta llamada puede reemplazar.
  const propia = (tipo) => notas.find((n) => n.origen === "ia" && n.tipo === tipo) ?? null;
  const editada = (tipo) => {
    const n = propia(tipo);
    return n && n.updated_at !== n.created_at ? n : null;
  };
  const conservaFicha = !forzar && editada("ficha");
  const conservaCifras = !forzar && editada("cifras");
  if (conservaFicha && conservaCifras) {
    return { ficha: "conservada", cifras: "conservada", modelo: "", aviso: null, leidas: 0, fuera: [], segundos: 0 };
  }

  const { texto, modelo, aviso, segundos } = await llamarIA(env, acceso, cliente, { prompt: promptDeLaFicha(cliente, paraLaIA), salida: SALIDA });
  const respuesta = leerRespuesta(texto);
  if (!respuesta) throw new ErrorPreparar("La IA no devolvió la ficha con el formato esperado. Inténtalo otra vez.", 502);

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

  return {
    ficha, cifras, modelo, aviso,
    leidas: paraLaIA.dentro.length, fuera: paraLaIA.fuera,
    segundos,
  };
}
