// ============================================================
// El asistente como DIRECTOR CREATIVO: sus herramientas de diseño
//
// Lo que hace que el asistente diseñe en lote sin cortarse y sin trabajar a
// ciegas (las fichas y el manual viven en src/lib/director.js):
//
//   · disenar_piezas: de 1 a 12 fichas. `planDePiezas` arma el pedido de cada
//     una por el camino de UNA pieza (pieza.js: el kit, las fotos del producto
//     que nombre, la plantilla escogida, el logo) y su costo; la persona lo
//     aprueba con un botón (esa es la confirmación, como en el lote) y
//     `crearPlan` las pide de tres en tres, con el control de calidad y el
//     logo estampado como cualquier pieza del Estudio.
//   · Cada imagen VUELVE AL MODELO (`paraElModelo`, una copia pequeña en
//     JPEG): antes sólo recibía «Imagen creada» y diseñaba a ciegas.
//   · corregir_pieza edita la misma imagen; version_final la repite con el
//     otro modelo con llave, sólo si se pide (lo del modelo del cliente ya es final).
//   · ver_lo_que_funciona le enseña las plantillas y los «Me gusta».
//
// Se carga aparte (import dinámico desde ChatPanel): arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { estimar, ajustesDe, modeloPorId, modeloQueRespeta } from "./estudioCatalogo";
import { apoyosDePieza, pedidoDePieza } from "./pieza";
import { productosNombrados } from "./referencias";
import { esperarArchivos, crearCarrusel } from "./carruselEstudio";
import { referenciaDePlantilla, lineaDePlantillaEnPedido, limpiarKit, kitVacio, estiloDeMarca, referenciaDeTipografia } from "./kitMarca";
import { coloresPlantilla } from "./carrusel";
import { controlEncendido, controlarYCorregir, modeloParaCorregir } from "./controlEstudio";
import { conLogoSiToca, estampaSola } from "./logoEstudio";
import { imagenParaModelo } from "./medios";
import { limpiarFicha, textoDeLaFicha, MAX_FICHAS } from "./director";

/** Del tamaño que dice el asistente a la proporción del motor. */
export const PROPORCION = Object.freeze({ square: "1:1", vertical: "4:5", story: "9:16", horizontal: "16:9" });
/** Con qué se hace la versión FINAL, en este orden: el primero con llave. */
export const MODELOS_FINALES = Object.freeze(["nano-banana-pro-kie", "nano-banana-pro", "gpt-image-2-kie", "nano-banana-2-kie", "nano-banana-2", "nano-banana-2-1-kie"]);
/** Cuántas piezas se piden a la vez. */
const PARALELO = 3;
/** El lado de la copia que ve el modelo: bastan para leer el texto y ver la composición, y no inflan la conversación. */
const LADO_PARA_EL_MODELO = 768;

const activosDe = (m) => Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));

/** El Estudio del cliente y qué motores tienen llave, de una vez. */
export async function leerContexto(cliente) {
  const clienteId = cliente.dbId || cliente.id;
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  return { clienteId, cliente, g, activos: activosDe(m), kit: g?.kit ?? {} };
}

/** El modelo de la versión final: el primero de MODELOS_FINALES con llave, o null. Pura. */
export function modeloFinal(activos = {}) {
  for (const id of MODELOS_FINALES) {
    const m = modeloPorId(id);
    if (m && activos[m.motor]) return m;
  }
  return null;
}

/** Una pieza que llega del asistente, limpia. Pura. */
export function limpiarPieza(p = {}, i = 0) {
  return {
    n: i + 1,
    titulo: String(p.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || `Pieza ${i + 1}`,
    ficha: limpiarFicha(p.ficha ?? p.prompt),
    formato: PROPORCION[p.formato] ? p.formato : "vertical",
    estilo: String(p.estilo ?? "").slice(0, 40),
    postId: String(p.post_id ?? p.postId ?? "").slice(0, 80),
    plantilla: /^plantilla-[a-z0-9-]{1,40}$/.test(String(p.plantilla_id ?? p.plantilla ?? "")) ? String(p.plantilla_id ?? p.plantilla) : "",
    texto: String(p.texto ?? "").slice(0, 400),
    // Los ids del catálogo de lo que enseña la pieza: sus fotos reales van de referencia.
    productos: [...new Set((Array.isArray(p.productos) ? p.productos : []).map((x) => String(x ?? "").slice(0, 80)).filter(Boolean))].slice(0, 6),
  };
}

/**
 * Las fotos REALES de una pieza del director: las de los productos que pasó (`productos`, ids del catálogo) y las de
 * los que nombra la ficha, una de cada uno antes que la segunda de ninguno. Un id que no está en el catálogo no trae
 * nada. Pura salvo por los imports.
 */
export function fotosDeLaPiezaDelChat(productos = [], pieza = {}, huecos = 8) {
  const ids = [...(pieza.productos ?? []), ...productosNombrados(productos, pieza.ficha ?? "").map((y) => y.id)];
  return ids.length ? api.fotosDeVariosProductos(productos, ids, huecos) : [];
}

/**
 * El pedido de cada pieza y su costo, sin crear nada. `calidad`: «borrador» (el modelo del cliente) o «final» (el
 * mejor con llave). → [{ ...pieza, modelo, costo, pedido }] (una sin ficha va con `error`). Pura salvo por los imports.
 */
export function planDePiezas(ctx, piezas = [], { calidad = "borrador" } = {}) {
  const { g, activos, kit, cliente } = ctx;
  const preferido = api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  const final = modeloFinal(activos);
  const modelo = calidad === "final" && final ? final : preferido;
  const productos = g?.productos ?? [];
  return piezas.slice(0, MAX_FICHAS).map((x, i) => {
    const p = limpiarPieza(x, i);
    if (!p.ficha) return { ...p, error: "Falta la ficha de esta pieza." };
    if (!modelo) return { ...p, error: "No hay ningún modelo de imagen con llave (Ajustes → IA)." };
    const plantilla = p.plantilla ? referenciaDePlantilla(kit, p.plantilla, g?.archivos ?? []) : null;
    const fotos = fotosDeLaPiezaDelChat(productos, p, modelo.referencias || 0);
    const apoyos = apoyosDePieza({ kit, preset: p.estilo, archivos: g?.archivos ?? [], fotos, manuales: plantilla ? [plantilla] : [], modelo });
    // La proporción TIENE que salir: si el modelo no la respeta con estas referencias, el pedido va con otro.
    const pedido = pedidoDePieza({
      kit, idea: p.ficha, preset: p.estilo, apoyos, modelo, marca: cliente.name, rubro: cliente.industry ?? "",
      proporcion: PROPORCION[p.formato], activos,
      extra: plantilla ? lineaDePlantillaEnPedido(kit, p.plantilla) : "",
    });
    const usado = modeloPorId(pedido.modelo) ?? modelo;
    return { ...p, modelo: usado, costo: estimar(usado, 1, pedido.ajustes), pedido };
  });
}

/** El costo total de un plan. Pura. */
export const costoDelPlan = (plan = []) => plan.reduce((t, p) => t + (p.error ? 0 : p.costo || 0), 0);

/** El texto exacto que debe tener una pieza (para el control): lo que va entre «» en la línea de texto de su ficha. */
export { textoDeLaFicha };

/**
 * Crea el plan, de tres en tres. `alAvanzar(n, estado)` con { cargando } | { archivo } | { error }. Cada pieza pasa por
 * el control de calidad (si está encendido: corrige sola una letra mal escrita) y el logo estampado (si el kit lo
 * pide). → [{ n, archivo | error }] en el orden del plan. `seguir()` false para parar.
 */
export async function crearPlan(ctx, plan, { alAvanzar = () => {}, seguir = () => true, calendarId = null, carrusel = "" } = {}) {
  if (carrusel) return crearCarruselDelPlan(ctx, plan, { alAvanzar, seguir, titulo: carrusel });
  const { clienteId, activos, kit } = ctx;
  const cola = plan.filter((p) => !p.error).map((p) => p);
  const salida = Object.fromEntries(plan.filter((p) => p.error).map((p) => [p.n, { n: p.n, error: p.error }]));
  const trabajador = async () => {
    while (cola.length && seguir()) {
      const p = cola.shift();
      alAvanzar(p.n, { cargando: true });
      try {
        const { trabajo } = await api.pedirImagenes(clienteId, { ...p.pedido, confirmado: true, ...(calendarId && p.postId ? { calendarId, postId: p.postId } : {}) });
        let [archivo] = await esperarArchivos(clienteId, trabajo, { seguir });
        if (controlEncendido()) archivo = (await controlarYCorregir({ clienteId, archivo, texto: textoDeLaFicha(p.ficha) || null, activos, seguir })).archivo;
        archivo = await conLogoSiToca({ clienteId, archivo, kit });
        salida[p.n] = { n: p.n, archivo };
        alAvanzar(p.n, { archivo });
      } catch (e) {
        salida[p.n] = { n: p.n, error: e.message || "No salió." };
        alAvanzar(p.n, { error: salida[p.n].error });
        if (e.datos?.codigo === "presupuesto") cola.length = 0;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALELO, Math.max(1, cola.length)) }, trabajador));
  return plan.map((p) => salida[p.n] ?? { n: p.n, error: "No se llegó a crear." });
}

/**
 * Un CARRUSEL del director: por el MISMO camino que «Carrusel con IA» (carruselEstudio.js), no pieza a pieza: las
 * láminas EN ORDEN, cada una con la anterior y la portada de referencia, el sistema de diseño que se saca de la
 * portada, la ficha de cada lámina, el logo y el control. Antes salían sueltas y en paralelo, cada una por su lado, y
 * había que «unificarlas» después. Van a su carpeta, en orden (una tarjeta en la galería). Mismo contrato que crearPlan.
 */
async function crearCarruselDelPlan(ctx, plan, { alAvanzar, seguir, titulo }) {
  const { clienteId, activos, cliente, g } = ctx;
  const kit = limpiarKit(ctx.kit);
  const validas = plan.filter((p) => !p.error);
  const salida = Object.fromEntries(plan.filter((p) => p.error).map((p) => [p.n, { n: p.n, error: p.error }]));
  if (!validas.length) return plan.map((p) => salida[p.n]);
  const carpetaId = await api.carpetaDeGrupo(clienteId, "carrusel", titulo);
  const ultima = validas.length - 1;
  const laminas = validas.map((p, i) => ({
    n: i + 1, rol: i === 0 ? "portada" : i === ultima && validas.length >= 3 ? "cierre" : "contenido", texto: textoDeLaFicha(p.ficha), ficha: p.ficha,
  }));
  // Las fotos de los productos del carrusel (los ids que pasó el asistente y los que nombran las fichas): van en todas
  // las láminas como el producto REAL. Antes sólo se buscaban por el nombre en la ficha, y si no lo nombraba igual
  // al catálogo, el motor se inventaba el producto y la marca.
  const productos = g?.productos ?? [];
  const todas = { productos: validas.flatMap((p) => p.productos ?? []), ficha: validas.map((p) => p.ficha).join("\n") };
  const fotos = fotosDeLaPiezaDelChat(productos, todas, 3).map((f) => f.clave);
  alAvanzar(validas[0].n, { cargando: true });
  const hechas = await crearCarrusel({
    clienteId, modelo: validas[0].modelo, modo: "ia", plantilla: "banda", hilo: titulo, idea: titulo, laminas,
    preset: estiloDeMarca(kit, validas[0].estilo, { marca: cliente.name, rubro: cliente.industry ?? "" }), fotos, personajes: [],
    logo: estampaSola(kit) ? "" : kit.logo, estampar: estampaSola(kit) ? kit : null, colores: coloresPlantilla(kit), familia: kit.tipografia, fuente: kit.fuente,
    carpetaId, seguir, tipografia: referenciaDeTipografia(kit), controlar: controlEncendido(), activos,
    alAvanzar: (i, r) => {
      alAvanzar(validas[i].n, r?.final ? { archivo: r.final } : { error: r?.error || "No salió." });
      if (validas[i + 1]) alAvanzar(validas[i + 1].n, { cargando: true });
    },
  });
  validas.forEach((p, i) => { salida[p.n] = hechas[i]?.final ? { n: p.n, archivo: hechas[i].final } : { n: p.n, error: hechas[i]?.error || "No se llegó a crear." }; });
  const resultado = plan.map((p) => salida[p.n] ?? { n: p.n, error: "No se llegó a crear." });
  if (carpetaId) await api.ordenarCarpeta(clienteId, carpetaId, resultado.filter((r) => r.archivo).map((r) => r.archivo.id)).catch(() => {});
  return resultado;
}

/** Las imágenes como bloques para el modelo (copias pequeñas en JPEG). Las que no se puedan leer, se saltan. */
export async function paraElModelo(archivos = []) {
  const bloques = [];
  for (const a of archivos) {
    if (!a?.src) continue;
    try {
      bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imagenParaModelo(a.src, LADO_PARA_EL_MODELO) } });
    } catch { /* sin esa copia, el modelo sigue con el texto */ }
  }
  return bloques;
}

/** Un archivo de la galería por su id (o la imagen de una publicación por su ruta). */
async function archivoDe(ctx, id) {
  const g = await api.leerEstudio(ctx.clienteId);
  // Por su id, o por su clave o su ruta («Pedir un cambio» del chat señala la imagen por su clave).
  const a = (g?.archivos ?? []).find((x) => x.id === id || x.src === id || x.clave === id);
  return { a: a ?? (String(id).startsWith("/api/media/") ? api.archivoDesdeSrc(id, ctx.clienteId) : null), g };
}

/** La proporción de una pieza (la pedida, o la de sus medidas). Pura. */
export const proporcionDe = (a) => a?.ajustes?.aspectRatio ?? api.proporcionDeMedidas(a?.ancho, a?.alto);

/**
 * corregir_pieza: EDITA la misma imagen con la indicación (no la rehace). → { archivo (la nueva), antes }. La de antes
 * se queda en la galería.
 */
export async function corregirPieza(ctx, { archivoId, indicacion, igualA = "", seguir = () => true }) {
  const { a, g } = await archivoDe(ctx, archivoId);
  if (!a) throw new Error("No encontré esa imagen en la galería de este cliente.");
  // «Igualar a otra»: la que quedó bien va de referencia, sólo por dónde va el texto y de qué tamaño.
  const buena = igualA ? (g?.archivos ?? []).find((x) => x.id === igualA || x.clave === igualA) : null;
  if (igualA && !buena) throw new Error("No encontré la pieza a la que igualar.");
  const instruccion = String(indicacion ?? "").trim() || (buena ? api.IGUALAR_TEXTO : "");
  if (!instruccion) throw new Error("Falta qué corregir.");
  const m = modeloParaCorregir(ctx.activos, a.modelo, proporcionDe(a));
  if (!m) throw new Error("No hay ningún modelo que edite imágenes con llave (Ajustes → IA).");
  const { prompt, medios } = api.pedidoDeCorreccion({ clave: a.clave, instruccion, ejemplos: buena ? [api.ejemploParaIgualar(buena)] : [], modelo: m });
  const { trabajo } = await api.pedirImagenes(ctx.clienteId, {
    modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcionDe(a) }, medios), medios, confirmado: true,
    ...(a.carpetaId ? { carpetaId: a.carpetaId } : {}),
  });
  let [nueva] = await esperarArchivos(ctx.clienteId, trabajo, { seguir });
  if (controlEncendido()) nueva = (await controlarYCorregir({ clienteId: ctx.clienteId, archivo: nueva, activos: ctx.activos, seguir })).archivo;
  return { archivo: nueva, antes: a };
}

/**
 * version_final: el MISMO pedido (la ficha, las referencias, la marca y el logo) con el mejor modelo que tenga llave y
 * en 2K. → { archivo, antes, modelo }.
 */
export async function versionFinal(ctx, { archivoId, seguir = () => true }) {
  const { a, g } = await archivoDe(ctx, archivoId);
  if (!a?.prompt) throw new Error("Esa imagen no salió del Estudio: no tengo su pedido para repetirlo con otro modelo.");
  const prop = proporcionDe(a);
  // La final no puede cambiar de tamaño: un modelo sin esa proporción (GPT Image no tiene 4:5) cede al que la tenga.
  const m = modeloQueRespeta(modeloFinal(ctx.activos), ctx.activos, prop, 1);
  if (!m) throw new Error("No hay ningún modelo de calidad final con llave (Nano Banana Pro o GPT Image).");
  const trabajo = (g?.trabajos ?? []).find((t) => t.id === a.trabajoId);
  const refs = (trabajo?.medios?.reference ?? []).slice(0, m.referencias || 0);
  const medios = refs.length ? { reference: refs } : {};
  const valores = m.ajustes?.aspectRatio?.valores ?? [];
  const base = { ...(valores.includes(prop) ? { aspectRatio: prop } : {}), ...((m.ajustes?.imageSize?.valores ?? []).includes("2K") ? { imageSize: "2K" } : {}) };
  const { trabajo: nuevo } = await api.pedirImagenes(ctx.clienteId, { modelo: m.id, prompt: a.prompt, n: 1, ajustes: ajustesDe(m, base, medios), medios, confirmado: true, ...(a.carpetaId ? { carpetaId: a.carpetaId } : {}) });
  let [archivo] = await esperarArchivos(ctx.clienteId, nuevo, { seguir });
  if (controlEncendido()) archivo = (await controlarYCorregir({ clienteId: ctx.clienteId, archivo, texto: textoDeLaFicha(a.prompt) || null, activos: ctx.activos, seguir })).archivo;
  archivo = await conLogoSiToca({ clienteId: ctx.clienteId, archivo, kit: ctx.kit });
  return { archivo, antes: a, modelo: m };
}

/** Lo que cuesta la versión final de una imagen (para decírselo antes). Pura. */
export function costoFinal(activos) {
  const m = modeloFinal(activos);
  return m ? { modelo: m, costo: estimar(m, 1, {}) } : null;
}

/**
 * ver_lo_que_funciona: las plantillas del kit y las últimas que gustaron (hasta 6 imágenes) más un resumen en texto.
 * → { texto, archivos }.
 */
export function loQueFunciona(ctx) {
  const kit = limpiarKit(ctx.kit);
  const archivos = ctx.g?.archivos ?? [];
  const plantillas = kit.plantillas.map((p) => ({ p, a: archivos.find((x) => x.clave === p.clave) })).filter((x) => x.a);
  const gustos = archivos.filter((a) => a.favorito && a.tipo === "imagen" && !plantillas.some((x) => x.a.id === a.id)).slice(0, Math.max(0, 6 - plantillas.length));
  const lineas = [
    kitVacio(kit) ? "Este cliente NO tiene kit de marca: avísale y ofrece prepararlo (Estudio → Kit de marca)." : "",
    plantillas.length ? `PLANTILLAS (en este orden, las primeras imágenes):\n${plantillas.map(({ p }) => `- ${p.id} · «${p.nombre}» (${p.uso})${p.sistema ? `: ${p.sistema.slice(0, 300)}` : ""}`).join("\n")}` : "Sin plantillas guardadas todavía.",
    gustos.length ? `Después, ${gustos.length} imagen${gustos.length === 1 ? "" : "es"} que le gustaron a la agencia («Me gusta»)${gustos.some((g) => g.prompt) ? `; sus pedidos:\n${gustos.map((g, i) => `${i + 1}. ${String(g.prompt ?? "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}` : "."}` : "Sin «Me gusta» todavía.",
  ].filter(Boolean);
  return { texto: lineas.join("\n\n"), archivos: [...plantillas.map((x) => x.a), ...gustos] };
}

/** Las herramientas de diseño del asistente (sólo con un cliente abierto). */
export const NOMBRES_DISENO = Object.freeze(["disenar_piezas", "corregir_pieza", "version_final", "ver_lo_que_funciona"]);

/** El tamaño del chat de una pieza (para pintarla en su proporción). Pura. */
export function formatoDe(archivo) {
  const p = proporcionDe(archivo);
  return p === "9:16" ? "story" : p === "1:1" ? "square" : p === "16:9" ? "horizontal" : "vertical";
}

/** Que la papelera del Estudio sepa que una publicación usa el archivo. */
export const apuntarUso = api.apuntarUso;
