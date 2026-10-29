// ============================================================
// El Estudio, desde el navegador
//
// Llama a /api/estudio por `pedir()` (db.js): la misma cookie, la misma
// cabecera de pestaña y el mismo error con el motivo del servidor en
// español. Nada aquí habla con Google ni con ningún otro motor: eso es del
// Worker, y `connect-src` sigue en `'self'`.
//
// Lo PURO (filtrar la galería, agrupar los trabajos, la frase de cada
// estado) está abajo y tiene sus casos; lo que llama a la red, arriba.
// ============================================================

import { pedir } from "./db";
import { imagenParaModelo } from "./medios";
import { estaVivo, diasQueQuedan, modeloPorId, modeloPorDefecto, modeloQueRespeta, VOCES_OMNI, ajustesDe, nombreDelModelo } from "./estudioCatalogo";
import { composicionDe } from "./loteAnuncios";
import { productosDelPost } from "./pilares";
// Lo de editar una imagen vive en un módulo puro: también lo usa el Worker (los encargos del servidor).
export { proporcionDeMedidas, promptDeEdicion, pedidoDeCorreccion, modeloParaEditar, modeloDeEdicion } from "./edicion";

const base = (clienteId) => `/estudio/${encodeURIComponent(clienteId)}`;
const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });

/** Qué motores tienen llave en el servidor (nunca la llave). */
export const leerMotores = () => pedir("/estudio/motores");

/** La galería, la papelera, las carpetas y los trabajos de un cliente. */
export const leerEstudio = (clienteId) => pedir(base(clienteId));

/** Pide imágenes. Lanza con `e.datos.codigo === "confirmar"` si cuesta 0,50 $ o más y falta la confirmación. */
export const pedirImagenes = (clienteId, datos) => pedir(`${base(clienteId)}/trabajos`, post(datos));

/** UN paso de un trabajo: una imagen. Devuelve `{ trabajo, ocupado }`. */
export const avanzarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/avanzar`, post());
export const cancelarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/cancelar`, post());
export const reintentarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/reintentar`, post());

/**
 * «Mejorar idea»: la IA devuelve la idea más clara y sencilla, para que el
 * motor la entienda. `{ idea, modelo, aviso }`. Es texto: no pide nada al motor.
 */
export const mejorarIdea = async (clienteId, datos) => pedir(`${base(clienteId)}/mejorar`, post(datos?.tipo === "video" ? datos : await conVistas(clienteId, datos)));
/** «Guardar como plantilla»: { archivoId, nombre?, uso? } → { kit, plantilla }. */
export const guardarPlantilla = (clienteId, datos) => pedir(`${base(clienteId)}/kit/plantillas`, post(datos));
export const quitarPlantilla = (clienteId, id) => pedir(`${base(clienteId)}/kit/plantillas/${encodeURIComponent(id)}`, { method: "DELETE" });
/** El director de arte: { piezas: [{ n, formato, tipo, idea, escena, texto, productoId, indicacion, sinTexto, plantilla }], concepto? } → { concepto, fichas }. */
export const fichasDeDiseno = async (clienteId, datos) => pedir(`${base(clienteId)}/fichas`, post(await conVistas(clienteId, datos)));
/** El carrusel: la contrapropuesta del director de arte → { hilo, laminas: [{ n, rol, escena, texto, composicion }] } (texto). */
export const proponerCarrusel = async (clienteId, datos) => pedir(`${base(clienteId)}/carrusel/propuesta`, post(await conVistas(clienteId, datos)));

/**
 * Lo que el director VE de este cliente antes de diseñar: hasta 4 imágenes pequeñas (512 px, JPEG) de sus plantillas
 * del kit y de las que le gustaron a la agencia. El director del chat las veía y el del lote no: era una de las
 * razones por las que el chat daba un 8 y el lote menos. Se recuerdan 10 minutos por cliente (una tanda pide varias
 * veces). Sin galería o si falla, ninguna: el director diseña igual, sólo con texto.
 */
const VISTAS = new Map();
export async function vistasDelCliente(clienteId) {
  const guardada = VISTAS.get(clienteId);
  if (guardada && Date.now() - guardada.t < 10 * 60_000) return guardada.v;
  try {
    const g = await leerEstudio(clienteId);
    const archivos = g?.archivos ?? [];
    const plantillas = (g?.kit?.plantillas ?? []).map((p) => archivos.find((a) => a.clave === p.clave)).filter(Boolean);
    const gustos = archivos.filter((a) => a.favorito && a.tipo === "imagen" && !plantillas.includes(a));
    const v = (await Promise.all([...plantillas, ...gustos].slice(0, 4)
      .map((a) => imagenParaModelo(a.src, 512).then((data) => ({ media_type: "image/jpeg", data })).catch(() => null)))).filter(Boolean);
    VISTAS.set(clienteId, { t: Date.now(), v });
    return v;
  } catch {
    return [];
  }
}
/**
 * Las imágenes ESPECIALES que el director mira antes que nada ({ papel, src }: la original de «Otra versión», la pieza
 * de otra marca de «Recrear con mi marca»), como copias de 768 px en JPEG. La que no se pueda leer se queda fuera.
 */
async function conEspeciales(datos = {}) {
  const lista = Array.isArray(datos.especiales) ? datos.especiales : [];
  if (!lista.length) return datos;
  const especiales = (await Promise.all(lista.slice(0, 2).map((e) => (e?.data ? Promise.resolve(e) : e?.src
    ? imagenParaModelo(e.src, 768).then((data) => ({ papel: e.papel, media_type: "image/jpeg", data })).catch(() => null)
    : Promise.resolve(null))))).filter(Boolean);
  return { ...datos, especiales };
}
const conVistas = async (clienteId, datos = {}) => conEspeciales(datos.vistas ? datos : { ...datos, vistas: await vistasDelCliente(clienteId) });
/** El reel: el guion por planos → { hilo, planos: [{ n, desde, hasta, escena, texto, camara }], sonido, descripcion } (texto). */
export const guionDeReel = (clienteId, datos) => pedir(`${base(clienteId)}/reel/guion`, post(datos));
/** «Revisar como director comercial»: `{ idea, cambios }` (no guarda). */
export const revisarComoDirector = (clienteId, datos) => pedir(`${base(clienteId)}/director`, post(datos));

/** «Dame ideas» de carrusel o de reel IA: { preset?, tema?, productoId?, n?, usados? } → `{ ideas }` (texto). */
export const ideasDeFormato = (clienteId, formato, datos) => pedir(`${base(clienteId)}/${formato === "reel" ? "reel" : "carrusel"}/ideas`, post(datos));
/** «Otra versión distinta»: { idea, n, tipo, original?, texto? } → { versiones: [escena o ficha] } (texto: no gasta en el motor). */
export const versionesDeIdea = async (clienteId, { original, ...datos } = {}) => {
  // Con la imagen original (su ruta), el director la mira para hacer la versión: la misma información, el mismo texto.
  const conOriginal = original && datos.tipo !== "video"
    ? await imagenParaModelo(original, 768).then((data) => ({ ...datos, original: { media_type: "image/jpeg", data } })).catch(() => datos)
    : datos;
  return pedir(`${base(clienteId)}/versiones`, post(conOriginal));
};
/** El guion de un video corto (8 o 10 s): `{ guion, prompt }`. Texto: no pide nada al motor. */
export const escribirGuionCorto = (clienteId, datos) => pedir(`${base(clienteId)}/guion-corto`, post(datos));

/** Guarda el kit de marca (paleta, tipografía, estilo, presets, logo). Devuelve `{ kit }`. */
export const guardarKit = (clienteId, kit) => pedir(`${base(clienteId)}/kit`, { method: "PUT", body: JSON.stringify({ kit }) });

/** La IA PROPONE el kit desde el cerebro del cliente: `{ kit, dudas, conCerebro }`. No guarda. */
export const prepararKit = (clienteId) => pedir(`${base(clienteId)}/kit/preparar`, post());

/** La IA mira una imagen de la galería contra el kit: `{ puntaje, cumple, falla, sugerencia }`. */
export const revisarMarca = (clienteId, archivoId) => pedir(`${base(clienteId)}/revisar`, post({ archivoId }));
/** Lo mismo para la imagen de una publicación, por su ruta (`/api/media/…`): no hace falta que esté en la galería. */
export const revisarMarcaDeRuta = (clienteId, clave) => pedir(`${base(clienteId)}/revisar`, post({ clave }));

/**
 * Sube una imagen a mano (la foto del producto, el logo) a la galería del cliente. Una pieza con el texto de la
 * plantilla puesto encima sube con `origenId` (la cruda de la que sale) y `plantilla` ({ texto, plantilla }).
 */
/** Devuelve `{ archivo, repetido? }`: con `repetido`, esa imagen ya estaba en la galería y no se guardó otra copia. */
export function subirImagen(clienteId, archivo, { carpetaId = null, origenId = null, plantilla = null } = {}) {
  const form = new FormData();
  form.set("archivo", archivo);
  if (carpetaId) form.set("carpetaId", carpetaId);
  if (origenId) form.set("origenId", origenId);
  if (plantilla) form.set("plantilla", JSON.stringify(plantilla));
  return pedir(`${base(clienteId)}/archivos`, { method: "POST", body: form });
}

const delArchivo = (clienteId, id, accion) => `${base(clienteId)}/archivos/${encodeURIComponent(id)}/${accion}`;
export const cambiarArchivo = (clienteId, id, cambios) => pedir(delArchivo(clienteId, id, "cambiar"), post(cambios));
export const apuntarUso = (clienteId, id, { calendarId, postId }) => pedir(delArchivo(clienteId, id, "uso"), post({ calendarId, postId }));
export const mandarAPapelera = (clienteId, id) => pedir(delArchivo(clienteId, id, "papelera"), post());
/** El control de calidad de una pieza (la IA la mira; queda en `ajustes.control`): `{ control, archivo }`. */
export const controlarArchivo = (clienteId, id, { texto = null, sistema = null, ficha = null } = {}) =>
  pedir(delArchivo(clienteId, id, "control"), post({ ...(texto === null ? {} : { texto }), ...(sistema ? { sistema } : {}), ...(ficha ? { ficha } : {}) }));
/** El sistema de diseño de la portada de un carrusel (la IA la mira; queda en su ficha) → { sistema }. */
export const sistemaDeArchivo = (clienteId, id, { texto = "" } = {}) => pedir(delArchivo(clienteId, id, "sistema"), post({ texto }));
/** Sube la fuente de la marca (TTF, OTF, WOFF, WOFF2): `{ clave, nombre }`. No guarda el kit. */
export function subirFuente(clienteId, archivo) {
  const form = new FormData();
  form.set("archivo", archivo);
  return pedir(`${base(clienteId)}/kit/fuente`, { method: "POST", body: form });
}
export const recuperarArchivo = (clienteId, id) => pedir(delArchivo(clienteId, id, "recuperar"), post());
export const quitarPerdido = (clienteId, id) => pedir(delArchivo(clienteId, id, "perdido"), post());
export const borrarDelTodo = (clienteId, id, { forzar = false } = {}) =>
  pedir(`${base(clienteId)}/archivos/${encodeURIComponent(id)}${forzar ? "?forzar=1" : ""}`, { method: "DELETE" });
export const vaciarPapelera = (clienteId) => pedir(`${base(clienteId)}/papelera/vaciar`, post());
/** Quita del kit y del catálogo lo de la marca que ya no existe (el aviso «Falta una imagen de la marca»). */
export const quitarPerdidasDelKit = (clienteId) => pedir(`${base(clienteId)}/kit/perdidas`, post());

/** «Vaciar la papelera» entera (el servidor borra 500 por llamada y dice si quedan más) → lo que hay que decir. */
export async function vaciarDelTodo(clienteId) {
  let borrados = 0;
  let r;
  do { r = await vaciarPapelera(clienteId); borrados += r.borrados ?? 0; } while (r.mas);
  return textoDeVaciar(borrados, r.quedan ?? []);
}

/**
 * Varias piezas a la papelera, una por una (cada una es su fila), salvo las de la marca. → lo que hay que decir. Si una
 * falla a mitad, el error dice cuántas se mandaron.
 */
export async function variasALaPapelera(clienteId, ids, archivos = []) {
  const { lista, nota } = sinLasDeLaMarca(ids, archivos);
  let hechas = 0;
  try {
    for (const id of lista) { await mandarAPapelera(clienteId, id); hechas += 1; }
  } catch (e) {
    throw new Error(hechas ? `Se mandaron ${hechas} de ${lista.length}: ${e.message}` : e.message);
  }
  return `${hechas} a la papelera. Puedes recuperarlas 30 días.${nota}`;
}

/** De unas piezas para la papelera, las que no son de la marca y lo que se dice de las que se quedan. Pura. */
export function sinLasDeLaMarca(ids, archivos = []) {
  const lista = ids.filter((id) => !archivos.find((x) => x.id === id)?.deLaMarca);
  const n = ids.length - lista.length;
  return { lista, nota: n ? ` ${n === 1 ? "Una se queda: es" : `${n} se quedan: son`} de la marca (kit o catálogo).` : "" };
}

/**
 * Lo que dice «Vaciar la papelera»: cuántas se borraron y qué se queda y POR QUÉ (antes, «no había nada que borrar» con
 * la papelera llena). `quedan`: [{ motivo: "marca" | "publicacion", que?, fecha? }]. Pura.
 */
export function textoDeVaciar(borrados, quedan = []) {
  const hecho = borrados ? `${borrados} borrada${borrados === 1 ? "" : "s"} del todo.` : "No se borró nada.";
  if (!quedan.length) return hecho;
  const enUso = quedan.filter((q) => q.motivo === "publicacion").length;
  const deMarca = quedan.filter((q) => q.motivo === "marca");
  const partes = [
    enUso ? `${enUso} ${enUso === 1 ? "la usa" : "las usan"} una publicación (quítala de ahí primero)` : "",
    deMarca.length ? `${deMarca.length} ${deMarca.length === 1 ? "es" : "son"} de la marca (${[...new Set(deMarca.map((q) => q.que))].slice(0, 3).join(", ")}): cámbiala en el kit o el catálogo` : "",
  ].filter(Boolean);
  return `${hecho} Se ${quedan.length === 1 ? "queda 1" : `quedan ${quedan.length}`}: ${partes.join("; ")}.`;
}

/** `tipo` «carrusel» | «reel»: la galería la enseña como UNA tarjeta con sus piezas en orden. */
export const crearCarpeta = (clienteId, nombre, { tipo = "" } = {}) => pedir(`${base(clienteId)}/carpetas`, post({ nombre, ...(tipo ? { tipo } : {}) }));
/** Las piezas de un carrusel o un reel, en orden (ids de la galería que están en esa carpeta). */
export const ordenarCarpeta = (clienteId, id, orden) => pedir(`${base(clienteId)}/carpetas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ orden }) });

/**
 * La carpeta propia de un carrusel o un reel («Carrusel · tema · 14 oct»). Si ya hay una con ese nombre, ésa. Sin
 * carpeta (falla la red), las piezas van a la galería igual: devuelve null.
 */
export async function carpetaDeGrupo(clienteId, tipo, titulo) {
  const dia = new Date().toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).replace(/\./g, "");
  const nombre = `${tipo === "reel" ? "Reel" : "Carrusel"} · ${String(titulo ?? "").split("\n")[0].slice(0, 18).trim()} · ${dia}`.slice(0, 40);
  try {
    return (await crearCarpeta(clienteId, nombre, { tipo }))?.carpeta?.id ?? null;
  } catch {
    const g = await leerEstudio(clienteId).catch(() => null);
    return (g?.carpetas ?? []).find((c) => c.nombre.toLowerCase() === nombre.toLowerCase())?.id ?? null;
  }
}
/**
 * «Agrupar como carrusel»: las imágenes escogidas (en el orden en que se tocaron) pasan a una carpeta de carrusel con
 * ese orden, y la galería las enseña como UNA tarjeta (y «De la galería» las pone juntas en una publicación). Las
 * que estaban en otra carpeta salen de ella. → el id de la carpeta.
 */
export async function agruparComoCarrusel(clienteId, ids = [], titulo = "Agrupado") {
  const carpetaId = await carpetaDeGrupo(clienteId, "carrusel", titulo);
  if (!carpetaId) throw new Error("No se pudo crear el carrusel. Prueba otra vez.");
  for (const id of ids) await cambiarArchivo(clienteId, id, { carpetaId });
  await ordenarCarpeta(clienteId, carpetaId, ids);
  return carpetaId;
}

/** «Desagrupar»: se borra la carpeta del carrusel y sus piezas vuelven a la galería sueltas (lo hace el servidor). */
export const desagrupar = (clienteId, carpetaId) => borrarCarpeta(clienteId, carpetaId);

/** Una pieza movida un sitio antes (-1) o después (+1) en el orden de un grupo. Pura. */
export function moverEnOrden(ids = [], id, paso) {
  const i = ids.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const nuevo = [...ids];
  [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
  return nuevo;
}
export const renombrarCarpeta = (clienteId, id, nombre) => pedir(`${base(clienteId)}/carpetas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ nombre }) });
export const borrarCarpeta = (clienteId, id) => pedir(`${base(clienteId)}/carpetas/${encodeURIComponent(id)}`, { method: "DELETE" });

// ------------------------------------------------------------
// El modelo FIJADO de un cliente: el que se usa casi siempre con él
// ------------------------------------------------------------

/**
 * El modelo con que se arranca: el fijado del CLIENTE (`kit.modelos`, lo comparte el equipo) si existe, es de ese tipo
 * y su motor tiene llave; si no, el predeterminado del catálogo. Lo usan el compositor, el lote y «Producir el mes».
 */
export function modeloPreferido(activos = {}, tipo = "imagen", fijado = "") {
  const m = fijado ? modeloPorId(fijado) : null;
  return m && m.tipo === tipo && (m.motor === "prueba" || activos[m.motor]) ? m : modeloPorDefecto(activos, tipo);
}

// ------------------------------------------------------------
// Puro
// ------------------------------------------------------------

/** Lo que se dice al subir `n` archivos de los que `repetidas` ya estaban en la galería. Pura. */
export function fraseDeSubida(n, repetidas = 0, video = false) {
  if (repetidas && repetidas >= n) return n === 1 ? "Ya estaba en la galería: se usa la que había, sin guardar otra copia." : "Ya estaban en la galería: se usan las que había.";
  const subida = video ? "Video subido a la galería." : n === 1 ? "Imagen subida a la galería." : `${n} imágenes subidas.`;
  return repetidas ? `${subida} ${repetidas} ya estaba${repetidas === 1 ? "" : "n"} en la galería (no se guardó otra copia).` : subida;
}

/** Los filtros que no son una carpeta. */
export const FILTROS_GALERIA = ["todas", "favoritas", "subidas", "usadas", "sin-usar", "sin-carpeta"];
/** ¿Lo usa alguna publicación? */
export const estaUsado = (a) => (a?.usadoEn?.length ?? 0) > 0;

/**
 * El modelo escogido en el visor para «Otra igual» u «Otra versión distinta» de la pieza `a` (sólo esa vez): del mismo
 * tipo y con llave; si no hace la proporción de la pieza con sus `refs` imágenes de apoyo, el que lo releva (lo mismo que
 * avisa «Con qué modelo»). null si no sirve: se usa el de la pieza. Pura.
 */
export function modeloParaOtra(activos = {}, id = "", a = {}, refs = 0) {
  const o = id ? modeloPorId(id) : null;
  if (!o || o.tipo !== a.tipo || !(o.motor === "prueba" || activos[o.motor])) return null;
  return modeloQueRespeta(o, activos, a.ajustes?.aspectRatio ?? "", Math.min(refs, o.referencias ?? 0));
}

/** Con qué se hizo una pieza, como se lee en la pantalla: «Subida» o el nombre del modelo. Pura. */
export const modeloDeLaPieza = (a) => (a?.subido ? "Subida" : nombreDelModelo(a?.modelo) || "Aplicación");

/** Los modelos que hay en la galería, el más usado primero: [{ nombre, n }]. Para el filtro «Modelo». Pura. */
export function modelosDeLaGaleria(archivos = []) {
  const cuentas = new Map();
  for (const a of archivos) cuentas.set(modeloDeLaPieza(a), (cuentas.get(modeloDeLaPieza(a)) ?? 0) + 1);
  return [...cuentas].map(([nombre, n]) => ({ nombre, n })).sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre));
}

/**
 * Filtros de la galería: los de `FILTROS_GALERIA` o el id de una carpeta; `modelo`, el NOMBRE de uno de
 * `modelosDeLaGaleria` («Nano Banana» junta lo del Estudio y lo de «Ampliar con IA», que se apunta con otro id). El
 * texto busca también por el nombre del modelo.
 */
export function filtrarArchivos(archivos = [], { filtro = "todas", texto = "", modelo = "" } = {}) {
  const t = String(texto ?? "").trim().toLowerCase();
  return archivos.filter((a) => {
    if (modelo && modeloDeLaPieza(a) !== modelo) return false;
    if (filtro === "favoritas" && !a.favorito) return false;
    if (filtro === "subidas" && !a.subido) return false;
    if (filtro === "usadas" && !estaUsado(a)) return false;
    if (filtro === "sin-usar" && estaUsado(a)) return false;
    if (filtro === "sin-carpeta" && a.carpetaId) return false;
    if (!FILTROS_GALERIA.includes(filtro) && a.carpetaId !== filtro) return false;
    if (t && !`${a.prompt} ${a.modelo} ${modeloDeLaPieza(a)}`.toLowerCase().includes(t)) return false;
    return true;
  });
}

/** Cuántos archivos hay en cada filtro, para los números de los chips. */
export function contarFiltros(archivos = [], carpetas = []) {
  const cuentas = { todas: archivos.length, favoritas: 0, subidas: 0, usadas: 0, "sin-usar": 0, "sin-carpeta": 0 };
  for (const c of carpetas) cuentas[c.id] = 0;
  for (const a of archivos) {
    if (a.favorito) cuentas.favoritas++;
    if (a.subido) cuentas.subidas++;
    cuentas[estaUsado(a) ? "usadas" : "sin-usar"]++;
    if (!a.carpetaId) cuentas["sin-carpeta"]++;
    else if (a.carpetaId in cuentas) cuentas[a.carpetaId]++;
  }
  return cuentas;
}

// ------------------------------------------------------------
// Carruseles y reels: UNA tarjeta en la galería
// ------------------------------------------------------------

/** ¿Es la carpeta de un carrusel o un reel (la galería la agrupa)? */
export const esGrupo = (c) => c?.tipo === "carrusel" || c?.tipo === "reel";

/**
 * Las piezas de un carrusel o un reel, en orden. Manda el `orden` que guardó el flujo (las láminas finales, o los
 * videos y los fotogramas); sin él —se cerró a la mitad—, todo lo de la carpeta: en un carrusel, las láminas en el
 * orden en que salieron y sin las crudas que ya tienen su versión con texto encima; en un reel, los videos (el último
 * primero) y luego los fotogramas.
 */
export function piezasDeGrupo(carpeta, archivos = []) {
  const dentro = archivos.filter((a) => a.carpetaId === carpeta?.id && !a.borradoAt);
  const porId = new Map(dentro.map((a) => [a.id, a]));
  const ordenadas = (carpeta?.orden ?? []).map((id) => porId.get(id)).filter(Boolean);
  if (ordenadas.length) return ordenadas;
  const viejas = [...dentro].sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
  if (carpeta?.tipo === "reel") return [...viejas.filter((a) => a.tipo === "video").reverse(), ...viejas.filter((a) => a.tipo !== "video")];
  const conTexto = new Set(dentro.map((a) => a.ajustes?.plantilla?.origenId).filter(Boolean));
  return viejas.filter((a) => !conTexto.has(a.id));
}

/**
 * De qué pieza sale este archivo, si sale de otra de la galería: `deArchivo` (una edición: la letra que corrigió el
 * control, la recompuesta en su proporción, «Corregir esta»; la del logo estampado) o la cruda de la que lleva el texto
 * de la plantilla. Las ediciones de antes, sin `deArchivo`, por su trabajo (`ediciones`: clave original por trabajo). Pura.
 */
function padreDe(a, ediciones) {
  return a?.ajustes?.deArchivo ?? a?.ajustes?.plantilla?.origenId ?? ediciones.get(a?.trabajoId) ?? null;
}

/**
 * Las VERSIONES de una pieza en una sola tarjeta. Cada pieza deja de 2 a 4 archivos (la cruda y la que lleva el texto, la
 * corrección del control, la recompuesta a 4:5, la del logo estampado, lo que se corrigió desde el chat) y la galería se
 * llenaba de casi-iguales. Se ve UNA por pieza —la que usa una publicación; si no, la que gusta; si no, la que pasó el
 * control; si no, la más nueva— con las demás en `anteriores` (la tarjeta dice «N versiones» y el visor las enseña). Lo
 * de un carrusel o un reel se queda como está (su carpeta ya lo agrupa). `archivos`, del más nuevo al más viejo. Pura.
 */
export function apilarVersiones(archivos = [], carpetas = [], trabajos = []) {
  const grupos = new Set(carpetas.filter(esGrupo).map((c) => c.id));
  const porClave = new Map(archivos.map((a) => [a.clave, a.id]));
  const ediciones = new Map(trabajos
    .filter((t) => /^Edita la imagen de referencia/.test(t.prompt ?? "") && porClave.has(t.medios?.reference?.[0]))
    .map((t) => [t.id, porClave.get(t.medios.reference[0])]));
  const porId = new Map(archivos.map((a) => [a.id, a]));
  const raiz = (a) => {
    let r = a;
    for (let i = 0; i < 12; i++) {
      const p = porId.get(padreDe(r, ediciones));
      if (!p || p === r) break;
      r = p;
    }
    return r.id;
  };
  const pilas = new Map();
  for (const a of archivos) {
    if (a.carpetaId && grupos.has(a.carpetaId)) { pilas.set(a.id, [a]); continue; }
    const r = raiz(a);
    pilas.set(r, [...(pilas.get(r) ?? []), a]);
  }
  const puntos = (a) => (estaUsado(a) ? 8 : 0) + (a.favorito ? 4 : 0) + (a.ajustes?.control?.estado === "ok" ? 2 : 0);
  const salida = [];
  const puestas = new Set();
  for (const a of archivos) {
    const pila = pilas.get(a.carpetaId && grupos.has(a.carpetaId) ? a.id : raiz(a));
    if (puestas.has(pila)) continue;
    puestas.add(pila);
    // La primera de las que más puntúan: a igualdad, la más nueva (vienen de la más nueva a la más vieja).
    const vista = pila.reduce((m, x) => (puntos(x) > puntos(m) ? x : m), pila[0]);
    const anteriores = pila.filter((x) => x !== vista);
    salida.push(anteriores.length ? { ...vista, anteriores } : vista);
  }
  return salida;
}

/** «Carrusel · 6 láminas» · «Reel · 1 video y 5 fotogramas». */
export function textoDeGrupo(carpeta, piezas = []) {
  if (carpeta?.tipo === "reel") {
    const v = piezas.filter((a) => a.tipo === "video").length;
    const f = piezas.length - v;
    return `Reel · ${[v ? `${v} video${v === 1 ? "" : "s"}` : "", f ? `${f} fotograma${f === 1 ? "" : "s"}` : ""].filter(Boolean).join(" y ") || "vacío"}`;
  }
  return `Carrusel · ${piezas.length} lámina${piezas.length === 1 ? "" : "s"}`;
}

/**
 * La galería con cada carrusel y cada reel en UNA tarjeta: `{ grupo: { carpeta, piezas, portada } }` donde aparece su
 * pieza más reciente, y lo demás tal cual. `archivos` ya viene filtrado y del más nuevo al más viejo; `todos` es la
 * galería entera (las piezas de un grupo salen de ahí, también las que el filtro dejó fuera).
 */
export function agruparGaleria(archivos = [], carpetas = [], todos = archivos) {
  const grupos = new Map(carpetas.filter(esGrupo).map((c) => [c.id, c]));
  if (!grupos.size) return archivos;
  const puestos = new Set();
  const salida = [];
  for (const a of archivos) {
    const c = a.carpetaId ? grupos.get(a.carpetaId) : null;
    if (!c) { salida.push(a); continue; }
    if (puestos.has(c.id)) continue;
    puestos.add(c.id);
    const piezas = piezasDeGrupo(c, todos);
    if (!piezas.length) continue;
    const portada = c.tipo === "reel" ? piezas.find((p) => p.tipo === "video") ?? piezas[0] : piezas[0];
    salida.push({ id: `grupo-${c.id}`, grupo: { carpeta: c, piezas, portada } });
  }
  return salida;
}

/** El nombre de cada pieza dentro del ZIP: «01.png», «02.jpg»… (el reel: «video-1.mp4», «fotograma-01.png»). */
export function nombresParaZip(carpeta, piezas = []) {
  const ext = (a) => ({ "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[a.mime] ?? (a.tipo === "video" ? "mp4" : "png"));
  let v = 0;
  let f = 0;
  return piezas.map((a) => {
    if (carpeta?.tipo === "reel") return a.tipo === "video" ? `video-${++v}.${ext(a)}` : `fotograma-${String(++f).padStart(2, "0")}.${ext(a)}`;
    return `${String(++f).padStart(2, "0")}.${ext(a)}`;
  });
}

/**
 * Qué trabajos se enseñan arriba: los que siguen vivos, y lo que falló o se
 * canceló en la última hora y la persona no ha descartado. Lo terminado bien
 * ya está en la galería.
 */
export function trabajosVisibles(trabajos = [], { descartados = new Set(), ahora = Date.now() } = {}) {
  return trabajos.filter((t) => {
    if (estaVivo(t.estado)) return true;
    if (descartados.has(t.id)) return false;
    if (t.estado === "fallido" || t.estado === "cancelado") return ahora - Date.parse(t.actualizado || t.creado) < 3_600_000;
    // Un trabajo que terminó con menos de lo pedido lleva su nota: que se vea.
    return t.estado === "hecho" && Boolean(t.nota) && ahora - Date.parse(t.terminado || t.actualizado) < 3_600_000;
  });
}

/** Lo que dice una tarjeta de trabajo en curso. */
export function fraseDeTrabajo(t) {
  const hechos = t.archivos?.length ?? 0;
  if (t.estado === "en_cola") return t.nota || (hechos ? `Van ${hechos} de ${t.n}. Sigue en cola…` : "En cola…");
  if (t.estado === "en_marcha") {
    // Un video se envía y luego se espera: lo que el servidor dice («Enviado…», «Generando…») es más útil que un «Creando».
    if (t.nota) return t.nota;
    const cosa = t.tipo === "video" ? "el video" : "la imagen";
    return t.n > 1 ? `Creando ${t.tipo === "video" ? "el" : "la"} ${hechos + 1} de ${t.n}…` : `Creando ${cosa}…`;
  }
  if (t.estado === "fallido") return t.error || "No salió.";
  if (t.estado === "cancelado") return hechos ? `Cancelado. Llegaron ${hechos} de ${t.n}.` : "Cancelado.";
  return t.nota || "";
}

/** «hace 3 min», «hace 2 h», «ayer», o la fecha. */
export function hace(iso, ahora = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 45) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172_800) return "ayer";
  return new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short" });
}

/** «Se borra en 12 días», «Se borra hoy». */
export function textoPapelera(borradoAt, ahora = Date.now()) {
  const d = diasQueQuedan(borradoAt, ahora);
  return d <= 0 ? "Se borra hoy" : d === 1 ? "Se borra mañana" : `Se borra en ${d} días`;
}

/** Nombre del archivo al descargar: el prompt, corto y sin símbolos. */
export function nombreDeDescarga(archivo) {
  const ext = { "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm" }[archivo.mime] ?? "png";
  const base = String(archivo.prompt || "imagen").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "imagen";
  return `${base}.${ext}`;
}

// ------------------------------------------------------------
// Puro: de una publicación al Estudio y del Estudio a una publicación
// ------------------------------------------------------------

/** La proporción con que conviene crear la imagen o el video de una publicación. */
export function proporcionParaFormato(formato, tipo = "imagen") {
  if (formato === "reel" || formato === "historia") return "9:16";
  if (formato === "live") return "16:9";
  // Un post o un carrusel: 4:5 es lo más alto que admite el feed de Instagram. Un video de post, cuadrado no lo hacen los motores: vertical.
  return tipo === "video" ? "9:16" : "4:5";
}

/** «Titular\nApoyo\n$45» → «"Titular" / "Apoyo" / "$45"»: las líneas del texto de la pieza, entre comillas. Pura. */
export function textoDeLaPieza(texto) {
  return String(texto ?? "").split(/\n+/).map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean).slice(0, 4).map((l) => `"${l.slice(0, 80)}"`).join(" / ");
}

/**
 * Lo que entra al compositor con «Usar» una idea de «Dame ideas»: la escena y, si la idea trae texto, la orden de
 * escribirlo EXACTO (igual que desde una publicación). Pura.
 */
export function ideaAlPedido(idea) {
  const pieza = textoDeLaPieza(idea?.texto);
  return [String(idea?.escena ?? "").trim(), pieza ? `Texto en la imagen, exacto y legible: ${pieza}` : ""].filter(Boolean).join("\n\n");
}

/** Un archivo escogido en Drive (BancoSelector) como `File`, para subirlo a la galería como cualquier otro. */
export async function archivoDeDrive(it) {
  const res = await fetch(it.url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`No se pudo traer «${it.nombre}» de Drive.`);
  const blob = await res.blob();
  return new File([blob], it.nombre || (it.tipo === "video" ? "drive.mp4" : "drive.jpg"), { type: blob.type });
}

/** Las fotos del catálogo de un producto (`productos` de GET /api/estudio) como archivos de apoyo. [] si no tiene. Pura. */
export function fotosDelProducto(productos = [], productoId = "") {
  const p = productoId ? (productos ?? []).find((x) => x.id === productoId) : null;
  // `producto`: el pedido las presenta como el producto REAL (referencias.js), y si es de otra marca, lo dice.
  return (p?.fotos ?? []).map((clave) => ({ id: `ext:${clave}`, src: `/api/media/${clave}`, clave, prompt: p.nombre, producto: { nombre: p.nombre, marca: p.marca ?? "" } }));
}

/**
 * La escena de una pieza partida en lo que se VE y lo que manda sobre el texto («NO escribas ningún texto…», «Texto en
 * la imagen, EXACTO…»): a «Otra versión» sólo se le da a reescribir lo primero, y lo segundo se vuelve a poner tal cual.
 * Pura.
 */
export function partirEscena(escena) {
  const t = String(escena ?? "").trim();
  const m = t.match(/\s*(NO escribas ningún texto|Texto en la imagen)/);
  if (!m || m.index === 0) return { escena: t, cola: "" };
  return { escena: t.slice(0, m.index).trim(), cola: t.slice(m.index).trim() };
}

/**
 * Las fotos de VARIOS productos en los huecos que haya: primero una de cada uno, luego la segunda de cada uno… Así una
 * pieza con dos o tres productos lleva a todos, en vez de llenar los huecos con las cuatro fotos del primero. Pura.
 */
export function fotosDeVariosProductos(productos = [], ids = [], huecos = 0) {
  const listas = [...new Set(ids)].map((id) => fotosDelProducto(productos, id)).filter((l) => l.length);
  const fuera = [];
  for (let vuelta = 0; fuera.length < huecos && listas.some((l) => l.length > vuelta); vuelta++) {
    for (const l of listas) if (l[vuelta] && fuera.length < huecos) fuera.push(l[vuelta]);
  }
  return fuera;
}

/** El texto con que arranca el compositor desde una publicación: su idea y, si hay, lo que dice. */
export function promptDePublicacion(post = {}, { conTexto = true } = {}) {
  // «Qué se ve» (`escena`, del lote o escrito a mano) manda sobre la idea: es lo que se pensó para la imagen; la
  // idea (el brief) pasa entonces a contexto.
  const escena = String(post.escena ?? "").trim();
  const idea = escena || String(post.idea ?? "").trim();
  const titulo = String(post.title ?? "").trim();
  const texto = escena
    ? [String(post.idea ?? "").trim(), String(post.descripcion ?? post.script ?? "").trim()].filter(Boolean).join(" — ")
    : String(post.descripcion ?? post.script ?? "").trim();
  // El producto de la publicación (tipo de contenido), si la idea no lo nombra.
  const producto = String(post.producto ?? "").trim();
  const conProducto = producto && !idea.toLowerCase().includes(producto.toLowerCase()) ? `Producto: ${producto}.` : "";
  // Lo que va escrito encima (`textoPieza`): EXACTO, para que el motor no lo reescriba. En un carrusel va por
  // lámina, y en un video no (los modelos de video escriben mal: `conTexto: false`).
  const pieza = !conTexto || post.format === "carrusel" ? "" : textoDeLaPieza(post.textoPieza);
  // La composición que decidió el plan (el lote o «Planificar mes»): sugerida, la escena manda si dice otra.
  const comp = composicionDe(post.composicion);
  const partes = [
    [idea || titulo, conProducto].filter(Boolean).join(" "),
    comp ? `Composición sugerida: ${comp.linea.replace(/^Composición[^:]*:\s*/i, "")}` : "",
    pieza ? `Texto en la imagen, exacto y legible: ${pieza}` : "",
    idea && texto ? `Contexto de la publicación: ${texto.slice(0, 300)}` : "",
  ].filter(Boolean);
  return partes.join("\n\n").slice(0, 1500);
}

/** ¿Es un video de verdad (que se reproduce con <video>) y no una tarjeta animada de prueba? */
export const esVideoReal = (archivo) => String(archivo?.mime ?? "").startsWith("video/");

/** Lo que se añade a una publicación al usar un archivo del Estudio. */
export const medioDeArchivo = (a) => ({
  src: a.src, tipo: esVideoReal(a) ? "video" : "imagen", nombre: String(a.prompt ?? "").slice(0, 60),
  ...(a.ancho > 0 && a.alto > 0 ? { ancho: a.ancho, alto: a.alto } : {}),
});

/**
 * Una imagen que ya está en una publicación (`/api/media/clientes/<cliente>/…`) vista como
 * un archivo del Estudio, para usarla de imagen inicial sin pasar por la galería. `null` si
 * no es una ruta del propio cliente: el servidor tampoco la aceptaría.
 */
export function archivoDesdeSrc(src, clienteId, prompt = "") {
  const ruta = String(src ?? "");
  const prefijo = "/api/media/";
  if (!ruta.startsWith(prefijo)) return null;
  let clave;
  try { clave = decodeURIComponent(ruta.slice(prefijo.length).split("?")[0]); } catch { return null; }
  if (!clave.startsWith(`clientes/${clienteId}/`) || clave.includes("..")) return null;
  return { id: `ext:${clave}`, src: ruta, clave, prompt: String(prompt ?? "").slice(0, 200) };
}

/**
 * La ficha de la galería de una imagen puesta en una publicación, para abrirla en el visor del Estudio («Corregir
 * esta», «Otra versión», «Recrear con mi marca»): la que ya está, por su ruta o su clave; si se subió directo al post o
 * vino de Drive, se sube ahora a la galería (si los bytes ya estaban, la galería devuelve la que había y no guarda otra
 * copia). Lanza si la imagen no es de ESTE cliente.
 */
export async function archivoEnGaleria(clienteId, src) {
  const ref = archivoDesdeSrc(src, clienteId);
  if (!ref) throw new Error("Esa imagen no está en el almacén de este cliente: súbela de nuevo a la publicación.");
  const g = await leerEstudio(clienteId);
  const ya = (g?.archivos ?? []).find((a) => a.src === src || a.clave === ref.clave);
  if (ya) return ya;
  const r = await fetch(src, { credentials: "same-origin" });
  if (!r.ok) throw new Error("No se pudo leer la imagen para abrirla en el Estudio.");
  const blob = await r.blob();
  const { archivo } = await subirImagen(clienteId, new File([blob], ref.clave.split("/").pop() || "imagen.jpg", { type: blob.type || "image/jpeg" }));
  return archivo;
}

/** El nombre de cada ajuste en la pantalla. */
export const ETIQUETA_AJUSTE = Object.freeze({
  aspectRatio: "Formato", imageSize: "Tamaño", resolution: "Resolución", duration: "Duración", calidad: "Calidad", formato: "Archivo",
  modo: "Calidad del video", sonido: "Sonido", voz: "Voz de la locución",
});

/** «4 s», «720p», «1K» según el ajuste. */
const VALORES = Object.freeze({
  calidad: { high: "Alta (pule en varias pasadas)", low: "Rápida" }, formato: { webp: "WebP (ligero)", png: "PNG", jpeg: "JPEG" },
  modo: { std: "Estándar (720p)", pro: "Pro (1080p)", "4K": "4K" }, sonido: { si: "Con sonido", no: "Sin sonido" },
  voz: { "": "La que escoja el modelo", ...VOCES_OMNI },
});

export function valorDeAjuste(nombre, valor) {
  if (nombre === "duration") return `${valor} s`;
  return VALORES[nombre]?.[valor] ?? valor;
}

// ------------------------------------------------------------
// Editar una imagen con una indicación sencilla
// ------------------------------------------------------------

/** Atajos de «¿Qué cambio?»: lo que más se pide. */
/**
 * Los ajustes del TEXTO de un toque: donde más se equivoca el diseño no es la ortografía sino dónde va el texto y de qué
 * tamaño. Cada uno es una edición precisa de la misma imagen (con medidas), sin escribir nada.
 */
export const AJUSTES_DE_TEXTO = Object.freeze([
  { id: "arriba", etiqueta: "Texto más arriba", instruccion: "Sube el bloque de texto completo (titular, apoyo y botón, juntos) unos 10 puntos porcentuales de la altura, sin cambiar su tamaño, su letra ni sus palabras, y sin que se salga de los márgenes" },
  { id: "abajo", etiqueta: "Texto más abajo", instruccion: "Baja el bloque de texto completo (titular, apoyo y botón, juntos) unos 10 puntos porcentuales de la altura, sin cambiar su tamaño, su letra ni sus palabras, y sin que se salga de los márgenes" },
  { id: "pequeno", etiqueta: "Texto más pequeño", instruccion: "Reduce el tamaño de todo el texto un 20 % manteniendo su posición, su alineación, su letra y sus palabras" },
  { id: "grande", etiqueta: "Texto más grande", instruccion: "Aumenta el tamaño del titular un 25 % (y el apoyo en proporción) manteniendo su posición y su alineación, sin que se salga de los márgenes ni tape el sujeto" },
  { id: "centrar", etiqueta: "Centrar el texto", instruccion: "Centra el bloque de texto en horizontal, con el mismo margen a cada lado, sin cambiar su tamaño ni su altura" },
]);

/**
 * «Igualar a otra lámina»: el texto de esta imagen con la MISMA posición, tamaño, peso y alineación que en otra de la
 * misma serie (va de referencia 2, sólo por la composición y la tipografía). Para el carrusel perfecto con una lámina
 * que quedó con el texto muy arriba. Pura.
 */
export const IGUALAR_TEXTO = "Pon el texto de la imagen de referencia 1 en la MISMA posición, con el MISMO tamaño, peso, color y alineación que el texto de la imagen de referencia 2 (otra lámina de la misma serie). Cambia sólo dónde va el texto y de qué tamaño es: sus palabras, el fondo, el sujeto y los colores se quedan";
export const ejemploParaIgualar = (a) => ({ id: a.id, clave: a.clave, src: a.src, toma: ["composicion", "tipografia"], nota: "es otra lámina de la MISMA serie: iguala a ésta la posición y el tamaño del texto" });

export const ATAJOS_EDICION = Object.freeze([
  "Quita el texto",
  "Cambia el fondo por uno liso y claro",
  "Más luz, más brillante",
  "Acerca más el producto",
  "Quita los objetos que distraen",
  "Hazla más cálida",
]);

/** Cómo se llama cada sitio de una imagen de apoyo, y qué hace ahí. */
export const RANURAS = Object.freeze({
  start: { nombre: "Imagen inicial", ayuda: "el video empieza en esta imagen" },
  end: { nombre: "Imagen final", ayuda: "el video termina en esta imagen" },
  reference: { nombre: "Referencia", ayuda: "el modelo toma de ella lo que le digas: personaje, producto, estilo…" },
  video: { nombre: "Video de referencia", ayuda: "el modelo sigue este video" },
});

/**
 * Los sitios LIBRES donde puede ir un archivo de la galería con este modelo, en orden: inicial, final, referencia (un
 * video, sólo video de referencia). Si hay más de uno, la pantalla pregunta: antes iba siempre al primero libre y en
 * video eso era la imagen inicial, así que una referencia nunca llegaba a referencias. Pura.
 */
export function ranurasLibres(medios = {}, modelo = {}, archivo = {}) {
  const lista = (rol) => medios[rol] ?? [];
  if (archivo.tipo === "video") return modelo.video && !lista("video").length ? ["video"] : [];
  const puesta = (rol) => lista(rol).some((x) => x.id === archivo.id);
  const libres = [];
  if (modelo.inicial && !lista("start").length) libres.push("start");
  if (modelo.final && lista("start").length && !lista("end").length && !puesta("start")) libres.push("end");
  if (modelo.referencias && lista("reference").length < modelo.referencias) libres.push("reference");
  return libres;
}

/** ¿De qué imagen sale esta edición? El id del archivo original, si se sabe por su trabajo. Pura. */
export function originalDe(archivo, trabajos = [], archivos = []) {
  const t = trabajos.find((x) => x.id === archivo?.trabajoId);
  const clave = t?.medios?.reference?.[0];
  if (!clave || !/^Edita la imagen de referencia:/.test(t.prompt ?? "")) return null;
  return archivos.find((a) => a.clave === clave) ?? null;
}

/** El lote de anuncios: la IA escribe las ideas por nivel → `{ ideas, producto, conEstudio }` (texto: no gasta en el motor). */
export const ideasDeLote = (clienteId, datos) => pedir(`${base(clienteId)}/lote/ideas`, post(datos));

/** «Dame ideas»: { tipo?, n?, video?, tema?, semilla? } → `{ ideas, productos }` (texto: no gasta en el motor). */
export const ideasDelEstudio = (clienteId, datos) => pedir(`${base(clienteId)}/ideas`, post(datos));

/** El lote del mes completo: { mes, dias, formato, semilla?, usados? } → `{ ideas, productos }` (texto). */
export const ideasDelMes = (clienteId, datos) => pedir(`${base(clienteId)}/lote/mes`, post(datos));

/** «Guardar como regla»: suma una frase a las reglas que no se rompen del kit del cliente. Devuelve `{ kit }`. */
export const guardarRegla = (clienteId, regla) => pedir(`${base(clienteId)}/kit/reglas`, post({ regla }));

// ------------------------------------------------------------
// El formulario del compositor (fuera de Estudio.jsx: la pestaña tiene tope de 20 kB comprimidos)
// ------------------------------------------------------------

export const MEDIOS_VACIOS = () => ({ reference: [], start: [], end: [], video: [] });
/** Lo que cabe de cada papel en un modelo (al cambiar de modelo o de tipo, lo que no cabe se cae). */
export const recortarMedios = (medios, m) => ({
  reference: medios.reference.slice(0, m.referencias || 0), start: medios.start.slice(0, m.inicial || 0),
  end: medios.end.slice(0, m.final || 0), video: (medios.video ?? []).slice(0, m.video || 0),
});
/** Las claves de R2 de cada papel de los medios. */
export const clavesDe = (medios) => Object.fromEntries(Object.entries(medios).map(([rol, lista]) => [rol, lista.map((a) => a.clave)]));

/** El formulario con que arranca el compositor. */
export function formularioInicial(motores, inicial, productos = [], fijados = {}) {
  const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
  const tipo = inicial?.tipo ?? "imagen";
  // Un modelo pedido de fuera sólo se respeta si tiene llave: uno sin llave no se puede pedir, y la lista ya no
  // enseña los que no tienen (el recreador escoge entre los que hay: lib/recrear.js).
  const pedido = inicial?.modelo ? modeloPorId(inicial.modelo) : null;
  const m = pedido?.tipo === tipo && (pedido.motor === "prueba" || activos[pedido.motor]) ? pedido : modeloPreferido(activos, tipo, fijados[tipo]);
  const medios = MEDIOS_VACIOS();
  if (inicial?.inicio) medios.start = [inicial.inicio];
  // Desde una publicación de un producto con fotos en el catálogo, sus fotos van de referencia: sale el producto REAL.
  const delProducto = tipo === "imagen" && !inicial?.inicio ? fotosDelPost(productos, inicial?.post ?? {}) : [];
  // Lo que llega de fuera (la pieza de la que se pide otra versión, una referencia de la competencia) y las fotos del producto.
  const referencias = [...(inicial?.referencias ?? []), ...delProducto.filter((f) => !(inicial?.referencias ?? []).some((r) => r.clave === f.clave))];
  if (referencias.length) medios.reference = referencias.slice(0, m.referencias || 0);
  if (inicial?.video && m.video) medios.video = [inicial.video];
  return {
    tipo, modelo: m.id, prompt: inicial?.prompt ?? "", n: 1, medios,
    // Los ajustes que trae (la duración y el sonido del recreador) y la proporción; `ajustesDe` descarta lo que el modelo no admite.
    ajustes: ajustesDe(m, { ...(inicial?.ajustes ?? {}), ...(inicial?.proporcion ? { aspectRatio: inicial.proporcion } : {}) }, clavesDe(medios)),
  };
}

/**
 * Las fotos REALES de todos los productos de una publicación (el principal y los que salen con él), una de cada uno
 * antes que la segunda de ninguno (`fotosDeVariosProductos`). Quien arma la pieza recorta a lo que cabe en el modelo.
 */
export const fotosDelPost = (productos = [], post = {}, huecos = 8) => fotosDeVariosProductos(productos, productosDelPost(post), huecos);
