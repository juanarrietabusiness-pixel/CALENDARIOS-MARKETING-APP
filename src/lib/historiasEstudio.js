// ============================================================
// Las 3 historias que COMPLEMENTAN un post, por el camino del Estudio
//
// Salían casi siempre con faltas de ortografía, y no era mala suerte:
//   · el motor de imagen INVENTABA el texto («una pregunta corta»): un
//     generador de imágenes escribiendo español por su cuenta;
//   · siempre con el primer Nano Banana, no con el modelo del cliente;
//   · sin el control de calidad, la tipografía, las fotos del producto ni
//     el logo del kit.
//
// Ahora, como cualquier pieza del Estudio:
//   1. El director de arte (worker/lib/estudio/fichas.js) diseña las tres de
//      una vez y ESCRIBE su texto exacto —una IA de texto, que no tiene faltas—
//      dentro de cada ficha.
//   2. Cada historia sale con el modelo del cliente, su kit, la tipografía, las
//      fotos de su producto y la imagen del post de referencia (su producto y su
//      estilo, nunca de base), en 9:16.
//   3. El control mira cada una y, si una letra salió mal, edita esa misma
//      imagen. Y el logo estampado, si el kit lo pide. Lo hace el SERVIDOR (un
//      encargo de tres piezas: lib/piezaServidor.js), aunque se cierre la pantalla.
//
// Cuestan: el panel enseña lo que valen las tres ANTES de crear, y crearlas es la
// confirmación (antes salían con `confirmado: true` sin enseñar nada). «¿Qué
// quieres?» del post manda también aquí.
//
// Se carga aparte: arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { apoyosDePieza, pedidoDePieza } from "./pieza";
import { pasoListo, lanzarEnServidor, esperarEnServidor } from "./piezaServidor";
import { lineaDeIndicacion } from "./otraVersion";
import { presetDePilar, productosDelPost } from "./pilares";
import { nombreDePreset, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { textoDeLaFicha, modeloFinal } from "./disenoChat";
import { modeloPorId, MODELOS, porPrecio, etiquetaDeCosto, estimar, ajustesDe } from "./estudioCatalogo";

/** Las tres, con lo que cuenta cada una (los mismos ids que VARIANTES_HISTORIA de worker/rutas/imagen.js). */
export const VARIANTES = Object.freeze([
  { id: "pregunta", nombre: "Pregunta", pedido: "Una historia que ABRE la conversación sobre el tema del post: una escena nueva del mismo mundo (el producto o el servicio en un momento cotidiano de quien lo usa) y, en la mitad de arriba, una pregunta corta (7 palabras como mucho) que toque el problema o el deseo que resuelve. Deja libre el tercio de abajo del centro para el sticker de encuesta o de pregunta." },
  { id: "beneficio", nombre: "Beneficio o detalle", pedido: "Una historia que enseña UN beneficio o detalle concreto que la imagen del post no enseña: el producto en uso, de cerca o en su contexto real, con otra composición y otro encuadre. Una sola línea de texto corta (6 palabras como mucho) que nombre ese beneficio." },
  { id: "accion", nombre: "Llamado a la acción", pedido: "Una historia que CIERRA: el producto o servicio del post como protagonista, con la oferta o el dato clave del post (sólo si aparece en la información; un precio, copiado EXACTO) y un llamado a la acción corto («Escríbenos», «Pide el tuyo», «Toca el enlace»). Deja libre la parte de abajo del centro para el sticker de enlace." },
]);

/** Las zonas que tapa Instagram en una historia. */
const ZONAS = "Zonas seguras de historia: nada de texto ni nada importante en el 14 % de arriba (el nombre de la cuenta) ni en el 20 % de abajo (la barra de respuesta).";

/** Lo que dice el post, en pocas líneas: la información que cada historia cuenta de otra forma. Pura. */
export function informacionDelPost(p = {}) {
  const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  return [
    corto(p.title, 120) && `Título: ${corto(p.title, 120)}`,
    corto(p.producto, 80) && `Producto: ${corto(p.producto, 80)}`,
    corto(p.textoPieza, 300) && `Texto de la pieza del post: «${corto(p.textoPieza, 300)}»`,
    corto(p.idea, 400) && `Idea del post: ${corto(p.idea, 400)}`,
    corto(p.descripcion || p.script, 600) && `Descripción del post: ${corto(p.descripcion || p.script, 600)}`,
  ].filter(Boolean).join("\n");
}

/** Puede hacer las historias: un modelo de imagen con llave que admite la imagen del post de referencia. Pura. */
const sirveParaHistorias = (m, activos) => Boolean(m) && m.tipo === "imagen" && m.referencias > 0 && (m.motor === "prueba" || activos[m.motor]);

/**
 * El modelo de las historias: el FIJADO para las historias del cliente (`kit.modelos.historias`, se escoge junto a
 * «Crear 3 con IA») si sigue teniendo llave; si no, el del cliente si admite referencias (va la imagen del post); si no,
 * el mejor que sí. Pura.
 */
export function modeloDeHistorias(activos, kit) {
  const fijado = modeloPorId(kit.modelos?.historias);
  if (sirveParaHistorias(fijado, activos)) return fijado;
  const m = api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  if (m?.referencias > 0) return m;
  for (const id of ["nano-banana-2-kie", "nano-banana-2", "nano-banana", "muse-image"]) {
    const x = modeloPorId(id);
    if (x && activos[x.motor]) return x;
  }
  return modeloFinal(activos) ?? m;
}

/** Los que se pueden escoger para las historias, del más barato al más caro: [{ id, nombre, costo }]. Pura. */
export function opcionesParaHistorias(activos) {
  return porPrecio(MODELOS.filter((m) => m.motor !== "prueba" && sirveParaHistorias(m, activos)), activos)
    .map((m) => ({ id: m.id, nombre: m.nombre, costo: etiquetaDeCosto(m) }));
}

/**
 * Lo que pinta el selector del panel: las opciones, la fijada («» = la de siempre), cuál sale sin fijar y lo que cuestan
 * las tres con cada una (`costos`: id → $; «» = la de siempre).
 */
export async function modelosParaHistorias(clienteId) {
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
  const kit = g?.kit ?? {};
  const fijado = sirveParaHistorias(modeloPorId(kit.modelos?.historias), activos) ? kit.modelos.historias : "";
  const deSiempre = modeloDeHistorias(activos, { ...kit, modelos: { ...(kit.modelos ?? {}), historias: "" } });
  const opciones = opcionesParaHistorias(activos);
  const costos = Object.fromEntries([["", costoDeHistorias(deSiempre)], ...opciones.map((o) => [o.id, costoDeHistorias(modeloPorId(o.id))])]);
  return { opciones, fijado, porDefecto: deSiempre?.nombre ?? "", costos };
}

/**
 * Fija (o suelta, con «») el modelo de las historias de ESTE cliente: va en su kit, así lo comparte el equipo. Lee el kit
 * guardado justo antes, para no pisar lo que otra persona cambió en el Estudio.
 */
export async function fijarModeloHistorias(clienteId, id) {
  const g = await api.leerEstudio(clienteId);
  const kit = g?.kit ?? {};
  const modelos = { ...(kit.modelos ?? {}) };
  if (id) modelos.historias = id; else delete modelos.historias;
  await api.guardarKit(clienteId, { ...kit, modelos });
}

/**
 * Lo que cuestan las TRES con un modelo (aproximado: el pedido real puede ir con el relevo si el modelo no hace 9:16 con
 * las referencias). Lo enseña el panel ANTES de crear, y es la confirmación. Pura.
 */
export function costoDeHistorias(modelo) {
  if (!modelo) return 0;
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  const ajustes = ajustesDe(modelo, valores.includes("9:16") ? { aspectRatio: "9:16", imageSize: "2K" } : {}, { reference: ["post"] });
  return Math.round(estimar(modelo, 1, ajustes) * VARIANTES.length * 1000) / 1000;
}

/**
 * Crea las tres. `base`: la ruta de la imagen del post (de ESTE cliente); `indicacion`: lo que pidió la persona en «¿Qué
 * quieres?» (manda en las tres). `alAvanzar(id, { cargando, paso } | { archivo } | { error })`. Van por el SERVIDOR (lib/
 * piezaServidor.js) en un solo encargo de tres piezas: la proporción, el control con su corrección y el logo estampado,
 * aunque se cierre la pantalla. → [{ id, nombre, archivo | error }].
 */
export async function crearHistorias({ client, post, base, indicacion = "", alAvanzar = () => {}, seguir = () => true }) {
  const clienteId = client.dbId || client.id;
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
  const kit = g?.kit ?? {};
  const modelo = modeloDeHistorias(activos, kit);
  if (!modelo) throw new Error("No hay ningún modelo de imagen con llave (Ajustes → IA).");
  const imagenDelPost = api.archivoDesdeSrc(base, clienteId);
  if (!imagenDelPost) throw new Error("La imagen del post no está en el almacén de este cliente.");
  const preset = presetDePilar(post.pilar, post.pilarSub);
  const info = informacionDelPost(post);
  VARIANTES.forEach((v) => alAvanzar(v.id, { cargando: true, paso: "Diseñando…" }));

  // 1. El director de arte diseña las tres y escribe su texto exacto (con lo que pidió la agencia delante).
  let fichas = {};
  try {
    const r = await api.fichasDeDiseno(clienteId, {
      concepto: "Tres historias de Instagram que acompañan a un post: otra forma de contar la misma información, cada una con su papel (abrir la conversación, enseñar un beneficio, cerrar con la acción). Mismo sistema visual que el post.",
      piezas: VARIANTES.map((v, i) => ({
        n: i + 1, formato: "historia", proporcion: "9:16", tipo: preset ? nombreDePreset(preset, kit) : "",
        idea: `${v.pedido}\nLO QUE DICE EL POST (usa sólo estos datos; no inventes precios, descuentos, fechas ni promesas):\n${info}`,
        productoId: post.productoId ?? "", productoIds: productosDelPost(post), indicacion,
      })),
    });
    fichas = r?.fichas ?? {};
  } catch { /* sin director: con el pedido de cada variante, como antes */ }

  // 2. Cada historia por el camino de UNA pieza; 3. las tres al servidor, que las crea, las revisa y les pone el logo.
  const fotos = api.fotosDelPost(g?.productos ?? [], post);
  const delPost = { clave: imagenDelPost.clave, src: imagenDelPost.src, toma: ["producto", "estilo"], nota: "es la imagen del POST que esta historia acompaña: toma de ella el producto, los colores y el estilo; NO la repitas ni la encojas, esta historia es otra pieza con otra composición" };
  const pasos = VARIANTES.map((v, i) => {
    const ficha = fichas[i + 1]?.ficha || [lineaDeIndicacion(indicacion), v.pedido, info ? `LO QUE DICE EL POST (sólo estos datos):\n${info}` : "", "Todo texto, en español y sin errores."].filter(Boolean).join("\n");
    // Si el director escogió una plantilla de historia del kit, su imagen va de referencia (por su diseño).
    const idPlantilla = fichas[i + 1]?.plantilla ?? "";
    const plantilla = idPlantilla ? referenciaDePlantilla(kit, idPlantilla, g?.archivos ?? []) : null;
    const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos, manuales: [delPost, ...(plantilla ? [plantilla] : [])], modelo });
    const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
    const pedido = pedidoDePieza({
      kit, idea: ficha, preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
      aspectRatio: valores.includes("9:16") ? "9:16" : "", proporcion: "9:16", activos, extra: [ZONAS, plantilla ? lineaDePlantillaEnPedido(kit, idPlantilla) : ""].filter(Boolean).join(" "),
    });
    return pasoListo({ id: v.id, titulo: `Historia: ${v.nombre}`, pedido, texto: textoDeLaFicha(ficha), kit });
  });
  VARIANTES.forEach((v) => alAvanzar(v.id, { cargando: true, paso: "Creando…" }));
  const encargo = await lanzarEnServidor({ clienteId, pasos, titulo: `Historias de «${String(post.title || post.idea || "la publicación").slice(0, 60)}»` });
  const r = await esperarEnServidor({
    clienteId, encargo, kit, seguir,
    alPaso: (id, x) => { if (x?.cargando) alAvanzar(id, { cargando: true, paso: x.paso || "Creando…" }); },
  });
  return VARIANTES.map((v) => {
    const x = r?.find((y) => y.id === v.id);
    if (x?.archivo) { alAvanzar(v.id, { archivo: x.archivo }); return { id: v.id, nombre: v.nombre, archivo: x.archivo }; }
    const error = x?.error || "No salió.";
    alAvanzar(v.id, { error });
    return { id: v.id, nombre: v.nombre, error };
  });
}
