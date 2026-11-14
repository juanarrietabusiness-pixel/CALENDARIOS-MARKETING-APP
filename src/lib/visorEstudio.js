// ============================================================
// Lo que crea el VISOR de la galería: «Otra igual», «Otra versión distinta» y «Editar»
//
// Salían sin las reglas de lo demás: sin control de calidad, sin el logo
// estampado, sin la red de la proporción y repitiendo el kit que tenía la
// original (y cortando el pedido por el final). Ahora cada pieza va por el
// SERVIDOR como un encargo (lib/piezaServidor.js), igual que el lote:
//
//   · «Otra igual»: el MISMO pedido y el modelo de la pieza, con la marca de HOY
//     (lib/marcaDeHoy.js).
//   · «Versión distinta»: la diseña el DIRECTOR mirando la original —también
//     cuando la original no tenía ficha— con el mismo texto, y va con la marca de
//     hoy.
//   · «Editar»: la misma imagen con la indicación; el control compara el texto
//     que debe quedar (`textoTrasEditar`).
//
// Un video no tiene control ni logo: sigue pidiéndose como antes.
//
// Y el «Crear» del COMPOSITOR de la pestaña Estudio (`pedirDelCompositor`): se
// revisaba en el navegador, así que sólo había control (y logo estampado) si la
// pantalla seguía abierta. Ahora es un encargo de una pieza como los demás.
//
// Se carga aparte (import dinámico desde Estudio.jsx): el chunk del Estudio está
// en su tope.
// ============================================================

import * as api from "./estudio";
import { ajustesDe } from "./estudioCatalogo";
import { ideaDelPedido } from "./kitMarca";
import { textoDeLaFicha } from "./director";
import { textoDelPedido } from "./control";
import { conMarcaDeHoy } from "./marcaDeHoy";
import { pasoListo, lanzarEnServidor, esperarEnServidor } from "./piezaServidor";
import { carpetaDeVariaciones, EJES_VARIACION } from "./variacionesAnuncio";

const COMILLAS = /["“”«»]([^"“”«»]+)["“”«»]/g;

/**
 * El texto que tiene que quedar en una pieza después de EDITARLA: el de la original si la indicación no habla de texto
 * entre comillas; con «X» … «Y» (donde dice X, que diga Y), el de la original con ese cambio; si no se puede saber,
 * vacío (el control lo saca del pedido). Pura.
 */
export function textoTrasEditar(original = "", instruccion = "") {
  const citas = [...String(instruccion ?? "").matchAll(COMILLAS)].map((m) => m[1].trim()).filter(Boolean);
  const antes = String(original ?? "");
  if (!citas.length) return antes;
  if (citas.length === 2 && antes.includes(citas[0])) return antes.replace(citas[0], citas[1]);
  return "";
}

/** Lo que dice (o debía decir) una pieza de la galería: su ficha, su control o su pedido. Pura. */
export const textoDePieza = (a = {}) =>
  textoDeLaFicha(ideaDelPedido(a.prompt)) || String(a.ajustes?.control?.texto ?? "").trim() || textoDelPedido(a.prompt) || "";

/** El texto de la plantilla que lleva encima (del lote): la nueva sale cruda y la aplicación le pone el MISMO. */
const plantillaDe = (a) => (a?.ajustes?.plantilla?.texto ? { texto: a.ajustes.plantilla.texto, plantilla: a.ajustes.plantilla.plantilla, nombre: "version" } : null);

/** ¿Ya lleva el logo estampado? (su copia con el logo es otra pieza: `plantilla: "logo"`). Pura. */
const yaEstampada = (a) => a?.ajustes?.plantilla?.plantilla === "logo";

/**
 * Los pasos de las piezas nuevas a partir de la pieza `a`: una por escena (`escenas`: null = la misma). `p`: el pedido
 * de la pieza { modelo, medios, ajustes } (con el modelo escogido para esta vez). Pura salvo por los imports.
 */
export function pasosDeOtras(a, p, escenas, { kit = {}, uso = null, textos = [] } = {}) {
  const otros = Object.fromEntries(Object.entries(p.medios ?? {}).filter(([k, l]) => ["start", "end", "video"].includes(k) && Array.isArray(l) && l.length));
  return escenas.map((escena, i) => {
    const { prompt, reference } = conMarcaDeHoy({ prompt: a.prompt, escena, kit, modelo: p.modelo, claves: p.medios?.reference ?? [] });
    const medios = { ...otros, ...(reference.length ? { reference } : {}) };
    return pasoListo({
      id: `v${i + 1}`, titulo: escena == null ? "Otra igual" : `Versión ${i + 1}`, kit, plantilla: plantillaDe(a),
      texto: textos[i] ?? textoDePieza(a), estampar: null,
      pedido: { modelo: p.modelo.id, prompt, n: 1, ajustes: ajustesDe(p.modelo, p.ajustes ?? {}, medios), medios, ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}) },
    });
  });
}

/**
 * Manda las piezas y las sigue SIN bloquear a quien llama (el visor se cierra; las piezas aparecen en la galería).
 * `alFallo(texto)` si alguna no sale. Un video va como antes: → { trabajos } para que la pantalla los siga.
 */
async function mandar({ clienteId, a, p, escenas, kit, uso, textos, seguir, alFallo, titulo }) {
  if (a.tipo === "video") {
    const trabajos = [];
    for (const escena of escenas) {
      const { prompt, reference } = conMarcaDeHoy({ prompt: a.prompt, escena, kit, modelo: p.modelo, claves: p.medios?.reference ?? [] });
      const medios = { ...p.medios, ...(reference.length ? { reference } : {}) };
      const { trabajo } = await api.pedirImagenes(clienteId, {
        modelo: p.modelo.id, prompt, n: 1, ajustes: p.ajustes, medios, confirmado: true,
        ...(p.carpetaId ? { carpetaId: p.carpetaId } : {}), ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}),
      });
      trabajos.push(trabajo);
    }
    return { trabajos };
  }
  const encargo = await lanzarEnServidor({ clienteId, pasos: pasosDeOtras(a, p, escenas, { kit, uso, textos }), titulo, carpetaId: p.carpetaId ?? null });
  void esperarEnServidor({ clienteId, encargo, kit, seguir })
    .then((r) => { const malo = r?.find((x) => x.error); if (malo) alFallo(`Una pieza nueva no salió: ${malo.error}`); })
    .catch((e) => alFallo(e.message));
  return { encargo, trabajos: [] };
}

/**
 * «Crear» del compositor (una imagen; un video sigue como antes): el pedido ya armado (`pedidoDePieza`) va como un
 * encargo de UNA pieza por el servidor: la proporción, el control con su corrección y el logo estampado si el kit lo
 * pide (`estampar`), aunque se cierre la pantalla. No bloquea: la pieza aparece en la galería; `alFallo` si no sale.
 */
export async function pedirDelCompositor({ clienteId, modelo, prompt, n = 1, ajustes = {}, medios = {}, kit = {}, estampar = null, uso = null, carpetaId = null, seguir = () => true, alFallo = () => {} }) {
  const paso = pasoListo({
    titulo: "Del compositor", kit, estampar, texto: "",
    pedido: { modelo, prompt, n, ajustes, medios, ...(uso ? { calendarId: uso.calendarId, postId: uso.postId } : {}) },
  });
  const encargo = await lanzarEnServidor({ clienteId, pasos: [paso], titulo: ideaDelPedido(prompt).slice(0, 80) || "Del compositor", carpetaId });
  void esperarEnServidor({ clienteId, encargo, kit, seguir })
    .then((r) => { const malo = r?.find((x) => x.error); if (malo) alFallo(`La pieza no salió: ${malo.error}`); })
    .catch((e) => alFallo(e.message));
  return encargo;
}

/** «Otra igual»: el mismo pedido otra vez (el motor no repite la imagen: sale otra con lo mismo). */
export async function pedirOtraIgual({ clienteId, a, p, kit = {}, uso = null, seguir = () => true, alFallo = () => {} }) {
  const r = await mandar({ clienteId, a, p, escenas: [null], kit, uso, seguir, alFallo, titulo: "Otra igual" });
  return { ...r, texto: `Pedida otra igual con ${p.modelo.nombre}: aparece en la galería en unos segundos, ya revisada.` };
}

/**
 * La carpeta donde quedan juntas las variaciones de una pieza maestra («Variaciones · <titular>»; si ya hay una con ese
 * nombre, « (2)»…). La maestra entra también si estaba suelta. Si no se puede crear (el tope de carpetas), null: las
 * piezas salen sueltas en la galería y el mensaje no nombra carpeta.
 */
async function carpetaParaVariaciones(clienteId, a) {
  const titulo = textoDePieza(a).split("\n")[0] || new Date().toLocaleDateString("es-PA", { day: "numeric", month: "short" });
  for (let i = 1; i <= 5; i++) {
    const nombre = carpetaDeVariaciones(titulo, i);
    try {
      const { carpeta } = await api.crearCarpeta(clienteId, nombre);
      if (!carpeta?.id) return null;
      if (!a.carpetaId) await api.cambiarArchivo(clienteId, a.id, { carpetaId: carpeta.id }).catch(() => null);
      return carpeta;
    } catch (e) {
      // Otra con el mismo nombre: la siguiente; el tope de carpetas u otro error: sin carpeta.
      if (!/ya hay una carpeta/i.test(e?.message ?? "")) return null;
    }
  }
  return null;
}

/**
 * «Variaciones para anuncios»: de la pieza MAESTRA, 3–5 fichas del director que conservan su ADN y cambian cada una una
 * cosa (src/lib/variacionesAnuncio.js); van juntas a una carpeta y por el servidor como las demás. No se ponen en la
 * publicación de la que se abrió el visor: son un conjunto de anuncios, cada una para lo suyo.
 */
async function pedirVariaciones({ clienteId, a, n, p, kit, seguir, alFallo }) {
  const { escena, cola } = api.partirEscena(ideaDelPedido(a.prompt));
  // Con el texto puesto por la plantilla encima, el motor no lo escribe: no hay gancho que cambiar.
  const sinTexto = Boolean(plantillaDe(a));
  const texto = sinTexto ? "" : textoDePieza(a);
  const r = await api.versionesDeIdea(clienteId, { idea: escena, n, tipo: "imagen", original: a.src, texto, sinTexto, para: "anuncios" });
  const carpeta = await carpetaParaVariaciones(clienteId, a);
  const escenas = r.versiones.map((v) => [v, cola].filter(Boolean).join(" "));
  const hecho = await mandar({
    clienteId, a, p: { ...p, carpetaId: carpeta?.id ?? p.carpetaId ?? null }, escenas, kit, uso: null,
    textos: r.versiones.map((v) => (sinTexto ? texto : textoDeLaFicha(v) || texto)), seguir, alFallo, titulo: "Variaciones para anuncios",
  });
  const cambian = (r.ejes ?? []).map((e) => EJES_VARIACION[e]?.nombre.toLowerCase()).filter(Boolean).join(", ");
  return {
    ...hecho, carpeta,
    texto: [
      `Pedidas ${escenas.length} variaciones para anuncios con ${p.modelo.nombre}${cambian ? ` (${cambian})` : ""}: ${carpeta ? `quedan juntas en la carpeta «${carpeta.nombre}»${a.carpetaId ? "" : ", con la maestra"}` : "aparecen en la galería"}, ya revisadas.`,
      r.aviso ?? "",
    ].filter(Boolean).join(" "),
  };
}

/**
 * «Otra versión distinta»: el DIRECTOR escribe 1–3 fichas nuevas mirando la original, con el mismo texto (también cuando
 * la original no tenía ficha); se quedan el tipo, el estilo y las referencias, y la marca va la de hoy. Con
 * `para: "anuncios"`, las variaciones de un conjunto de anuncios (`pedirVariaciones`).
 */
export async function pedirVersiones({ clienteId, a, n = 1, p, kit = {}, uso = null, para = "", seguir = () => true, alFallo = () => {} }) {
  if (para === "anuncios") return pedirVariaciones({ clienteId, a, n, p, kit, seguir, alFallo });
  const { escena, cola } = api.partirEscena(ideaDelPedido(a.prompt));
  const texto = a.tipo === "video" ? "" : textoDePieza(a);
  const r = await api.versionesDeIdea(clienteId, { idea: escena, n, tipo: a.tipo, original: a.src, texto });
  const escenas = r.versiones.map((v) => [v, cola].filter(Boolean).join(" "));
  const hecho = await mandar({ clienteId, a, p, escenas, kit, uso, textos: r.versiones.map((v) => textoDeLaFicha(v) || texto), seguir, alFallo, titulo: "Otra versión" });
  const cuantas = escenas.length === 1 ? "Pedida 1 versión distinta" : `Pedidas ${escenas.length} versiones distintas`;
  return { ...hecho, texto: [`${cuantas} con ${p.modelo.nombre}: aparecen en la galería, ya revisadas.`, r.aviso ?? ""].filter(Boolean).join(" ") };
}

/**
 * «Editar»: la imagen va de referencia a un modelo que edita (el escogido si edita; si no, el de editar; si no hace la
 * proporción, el que sí), con la indicación y la orden de no tocar lo demás. Los ejemplos de la galería, detrás.
 */
export async function pedirEdicion({ clienteId, a, instruccion, ejemplos = [], escogido = "", activos = {}, kit = {}, seguir = () => true, alFallo = () => {} }) {
  const proporcion = a.ajustes?.aspectRatio ?? api.proporcionDeMedidas(a.ancho, a.alto);
  const m = api.modeloDeEdicion(activos, escogido, proporcion);
  const { prompt, medios } = api.pedidoDeCorreccion({ clave: a.clave, instruccion, ejemplos, modelo: m });
  const paso = pasoListo({
    titulo: "Edición", kit, texto: textoTrasEditar(textoDePieza(a), instruccion),
    // Una edición conserva lo que ya tenía la imagen: si ya lleva el logo estampado, no se le pone otro.
    estampar: yaEstampada(a) ? false : null,
    pedido: { modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcion }, medios), medios },
  });
  const encargo = await lanzarEnServidor({ clienteId, pasos: [paso], titulo: "Edición", carpetaId: a.carpetaId ?? null });
  void esperarEnServidor({ clienteId, encargo, kit, seguir })
    .then((r) => { if (r?.[0]?.error) alFallo(`La edición no salió: ${r[0].error}`); })
    .catch((e) => alFallo(e.message));
  return { encargo, texto: `Editando con ${m.nombre}: sale como una imagen NUEVA, ya revisada, y la original no se toca.` };
}
