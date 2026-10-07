// ============================================================
// El estudio de mercado de un cliente: lo que toca la base, la IA y Drive
//
// Lo puro (limpiar, pedidos a la IA, lecturas, notas y documento) vive en
// src/lib/estudioMercado.js, que también usa la pantalla. Aquí:
//
//   · el CATÁLOGO se guarda en `mercado_clientes` y, además, como nota de
//     cifras del cerebro («Productos y servicios»), que la IA lee SIEMPRE
//     que escribe: un precio no depende de que la búsqueda lo encuentre.
//   · el ESTUDIO se hace POR PASOS —lo general y luego un producto por
//     llamada— y cada paso se guarda en el BORRADOR. Una llamada con
//     búsqueda web y razonamiento puede tardar minutos; todo el estudio de
//     un cliente con diez servicios no cabría en una. Si la pestaña se
//     cierra a mitad, lo hecho queda en el borrador.
//   · APROBAR pasa el borrador a vigente, escribe las notas del cerebro
//     (una general y una por producto, tipo «mercado») y deja el documento
//     en la carpeta de Drive del cliente. Drive nunca tumba la aprobación:
//     si falla, se dice.
//   · las REFERENCIAS de la competencia: la captura (o el VIDEO: un anuncio
//     o un orgánico de TikTok o Reels) se sube a la galería del Estudio
//     (carpeta «Competencia»), la IA la MIRA —un video lo ve Gemini, con
//     audio— y su análisis va a la lista y al cerebro. De un video sale
//     además su ESTRUCTURA tramo a tramo, y «Adaptar» escribe un guion
//     para la marca con la misma forma.
//
// Nada interno del cliente viaja a la IA: el contexto sale del cerebro con
// `para: "texto"`, que deja fuera las notas internas.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { contexto as contextoCerebro, reindexar } from "./cerebro/cerebro.js";
import { derivados, rutaUnica, MAX_NOTAS_POR_CLIENTE } from "./cerebro/notas.js";
import { HERRAMIENTAS_WEB } from "./herramientasServidor.js";
import { idDeCarpeta, carpetaDeLaApp, subirADrive, DriveDesconectado, ErrorDrive } from "./google.js";
import { crearCarpeta, cambiarArchivo } from "./estudio/galeria.js";
import { aBase64 } from "./estudio/gemini.js";
import { kitDe } from "./estudio/kit.js";
import { verVideo, ErrorVideo, MAX_BYTES_VIDEO } from "./geminiVideo.js";
import { bloqueoPorPresupuesto } from "./configIA.js";
import { textoPaleta } from "../../src/lib/kitMarca.js";
import {
  limpiarCatalogo, catalogoATexto, pedidoDeCatalogo, leerCatalogo, fundirCatalogo, productosActivos,
  pedidoGeneral, leerGeneral, pedidoDeProducto, leerDeProducto, limpiarEstudio, notasDelEstudio,
  estudioADocumento, limpiarReferencias, pedidoDeReferencia, pedidoDeReferenciaVideo, leerReferencia, notaDeReferencia,
  pedidoDeAdaptacion, leerAdaptacion, lineaDeProducto,
  MAX_MATERIAL, MAX_REFERENCIAS, slugProducto,
} from "../../src/lib/estudioMercado.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const RUTA_CATALOGO = "productos-y-servicios";
const CARPETA_DRIVE = "Estudios de mercado";
const CARPETA_COMPETENCIA = "Competencia";
const MIME_DOC_GOOGLE = "application/vnd.google-apps.document";
/** Lo que Anthropic admite por imagen (5 MB en base64): con margen. */
const MAX_BYTES_IMAGEN = 3_600_000;
const CONSULTA_MERCADO = "productos servicios precios clientes público objetivo propuesta de valor diferenciador competencia garantía testimonios objeciones";

/** Un fallo que se le puede decir a la persona, con su estado. */
export class ErrorMercado extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

// ------------------------------------------------------------
// La fila del cliente
// ------------------------------------------------------------

/** Lo guardado de un cliente, ya leído. */
export async function leerMercado(acceso, clienteId) {
  const f = await acceso.leerUno("mercado_clientes", { client_id: clienteId });
  return {
    catalogo: limpiarCatalogo(leerJSON(f?.catalogo, [])),
    estudio: limpiarEstudio(leerJSON(f?.estudio, null)),
    borrador: limpiarEstudio(leerJSON(f?.borrador, null)),
    referencias: limpiarReferencias(leerJSON(f?.referencias, [])),
    // En D1 el booleano es 0/1: se convierte aquí para que nadie lea un `0` como verdadero.
    inventario: Number(f?.inventario) === 1,
    actualizado: f?.updated_at ?? null,
  };
}

/** Escribe columnas de la fila del cliente; la crea si no existe. */
async function escribir(acceso, clienteId, cambios) {
  const t = ahora();
  const n = await acceso.actualizar("mercado_clientes", { client_id: clienteId }, { ...cambios, updated_at: t });
  if (n) return;
  try {
    await acceso.insertar("mercado_clientes", {
      id: uuid(), client_id: clienteId, catalogo: "[]", referencias: "[]", ...cambios, created_at: t, updated_at: t,
    });
  } catch (e) {
    // Dos pestañas crearon la fila a la vez (índice único por cliente): la otra ganó, se escribe sobre ella.
    const n2 = await acceso.actualizar("mercado_clientes", { client_id: clienteId }, { ...cambios, updated_at: t });
    if (!n2) throw e;
  }
}

// ------------------------------------------------------------
// Las notas del cerebro que escribe el estudio
// ------------------------------------------------------------

/**
 * Reemplaza las notas del estudio cuyo `ruta` cumple `esDeEste` por `nuevas` ({ ruta, titulo, texto, tipo, interna }).
 * Sólo toca notas con `origen: "mercado"`: una nota de la persona que se llame igual se queda y la nueva toma
 * otra ruta. Se insertan SIN fechas (las pone la base, iguales): así consta que nadie las ha tocado.
 */
async function reemplazarNotas(env, acceso, clienteId, esDeEste, nuevas) {
  const existentes = await acceso.leerColumnas("cerebro_notas", ["id", "ruta", "origen"], { client_id: clienteId });
  const viejas = existentes.filter((n) => n.origen === "mercado" && esDeEste(n.ruta));
  const libres = existentes.length - viejas.length;
  if (libres + nuevas.length > MAX_NOTAS_POR_CLIENTE) {
    throw new ErrorMercado(`El cerebro de este cliente pasaría de ${MAX_NOTAS_POR_CLIENTE} notas. Borra las que no sirvan.`, 409);
  }
  if (viejas.length) await acceso.borrarVarios("cerebro_notas", viejas.map((n) => n.id));
  const usadas = new Set(existentes.filter((n) => !viejas.includes(n)).map((n) => n.ruta));
  const creadas = [];
  for (const n of nuevas) {
    const ruta = rutaUnica(n.ruta, usadas);
    usadas.add(ruta);
    const fila = {
      id: uuid(), client_id: clienteId, ruta, titulo: n.titulo.slice(0, 140), texto: n.texto, ...derivados(n.texto),
      tipo: n.tipo ?? "mercado", origen: "mercado", fuente: "", fuente_sha: "", interna: n.interna ? 1 : 0,
    };
    await acceso.insertar("cerebro_notas", fila);
    creadas.push({ id: fila.id, ruta });
  }
  await reindexar(env, acceso, clienteId);
  return creadas;
}

// ------------------------------------------------------------
// Lo que se le da a la IA de la marca
// ------------------------------------------------------------

/** La ficha, las cifras y los pasajes del cerebro (sin lo interno); sin cerebro, lo de la ficha del cliente. */
async function contextoDeMarca(env, acceso, cliente, consulta = CONSULTA_MERCADO) {
  let c = null;
  try {
    c = await contextoCerebro(env, acceso, cliente.id, consulta, { para: "texto", presupuesto: 12_000 });
  } catch (e) {
    console.warn("mercado: el cerebro no respondió, se usa la ficha", e?.message);
  }
  const ficha = [
    cliente.industry && `Rubro: ${cliente.industry}`,
    cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 1500)}`,
    cliente.audiencia && `Público: ${String(cliente.audiencia).slice(0, 600)}`,
    cliente.diferenciador && `Diferenciador: ${String(cliente.diferenciador).slice(0, 600)}`,
    cliente.competencia && `Competencia (de la ficha): ${String(cliente.competencia).slice(0, 600)}`,
  ].filter(Boolean).join("\n");
  if (!c?.notas) return ficha;
  return [c.ficha && `FICHA:\n${c.ficha}`, c.cifras && `CIFRAS:\n${c.cifras}`, c.pasajes && `NOTAS:\n${c.pasajes}`, ficha && `DE LA FICHA DEL CLIENTE:\n${ficha}`]
    .filter(Boolean).join("\n\n");
}

const materialDe = (m) => String(m ?? "").slice(0, MAX_MATERIAL);

// ------------------------------------------------------------
// El catálogo
// ------------------------------------------------------------

/**
 * Guarda el catálogo y su nota de cifras en el cerebro. `inventario` (booleano) enciende o apaga el inventario del
 * cliente; sin pasarlo, se queda como estaba. → { catalogo, inventario }.
 */
export async function guardarCatalogo(env, acceso, cliente, entrada, { inventario } = {}) {
  // Las fotos sólo pueden ser de ESTE cliente: la clave la manda el navegador.
  const propias = `clientes/${cliente.id}/`;
  const catalogo = limpiarCatalogo(entrada).map((p) => ({ ...p, fotos: p.fotos.filter((k) => k.startsWith(propias)) }));
  const conInventario = typeof inventario === "boolean" ? inventario : (await leerMercado(acceso, cliente.id)).inventario;
  await escribir(acceso, cliente.id, { catalogo: JSON.stringify(catalogo), inventario: conInventario ? 1 : 0 });
  const texto = catalogoATexto(catalogo, { inventario: conInventario });
  await reemplazarNotas(env, acceso, cliente.id, (r) => r === RUTA_CATALOGO || r.startsWith(`${RUTA_CATALOGO}-`),
    texto ? [{ ruta: RUTA_CATALOGO, titulo: "Productos y servicios", texto, tipo: "cifras" }] : []);
  return { catalogo, inventario: conInventario };
}

/** La IA propone el catálogo a partir del cerebro. No guarda: devuelve lo propuesto fundido con lo que había. */
export async function proponerCatalogo(env, acceso, cliente) {
  const actual = (await leerMercado(acceso, cliente.id)).catalogo;
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeCatalogo({ marca: cliente.name, rubro: cliente.industry ?? "", contexto: await contextoDeMarca(env, acceso, cliente, "productos servicios precios catálogo ofertas planes paquetes") }),
    salida: 5000,
    funcion: "catálogo",
  });
  const propuesto = leerCatalogo(r.texto);
  if (!propuesto) throw new ErrorMercado("La IA no devolvió un catálogo que se pueda leer. Inténtalo otra vez.", 502);
  return { catalogo: fundirCatalogo(actual, propuesto), nuevos: propuesto.length, modelo: r.modelo, aviso: r.aviso };
}

// ------------------------------------------------------------
// El estudio, por pasos
// ------------------------------------------------------------

/**
 * Paso 1: lo general del mercado. Sobre el borrador que haya o, si no hay, sobre una copia del aprobado: así los
 * productos ya estudiados no se pierden si sólo se rehace lo general (la pantalla los rehace todos al «Rehacer»).
 */
export async function estudiarGeneral(env, acceso, cliente, { material = "" } = {}) {
  const { catalogo, borrador: enCurso, estudio } = await leerMercado(acceso, cliente.id);
  const borrador = enCurso ?? (estudio ? { productos: estudio.productos, conWeb: estudio.conWeb } : null);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoGeneral({
      marca: cliente.name, rubro: cliente.industry ?? "", contexto: await contextoDeMarca(env, acceso, cliente),
      catalogo, material: materialDe(material), conWeb: true,
    }),
    salida: 7000,
    funcion: "estudio de mercado",
    herramientas: HERRAMIENTAS_WEB,
  });
  const general = leerGeneral(r.texto);
  if (!general) throw new ErrorMercado("La IA no devolvió el estudio con el formato esperado. Inténtalo otra vez.", 502);
  // Las fuentes: las que la IA apuntó y las que de verdad devolvió la búsqueda.
  general.fuentes = [...new Set([...general.fuentes, ...(r.fuentes ?? [])])].slice(0, 15);
  const nuevo = limpiarEstudio({ ...(borrador ?? {}), general, conWeb: Boolean(r.conWeb || borrador?.conWeb), hechoAt: ahora() });
  await escribir(acceso, cliente.id, { borrador: JSON.stringify(nuevo) });
  return { borrador: nuevo, modelo: r.modelo, aviso: r.aviso, busquedas: r.busquedas, conWeb: r.conWeb, segundos: r.segundos };
}

/** Paso 2…n: un producto o servicio del catálogo. Necesita lo general en el borrador (o en lo aprobado). */
export async function estudiarProducto(env, acceso, cliente, { productoId, material = "" } = {}) {
  const { catalogo, borrador, estudio } = await leerMercado(acceso, cliente.id);
  const producto = productosActivos(catalogo).find((p) => p.id === productoId);
  if (!producto) throw new ErrorMercado("Ese producto no está en el catálogo (o no está activo).", 404);
  const general = borrador?.general ?? estudio?.general ?? null;
  if (!general) throw new ErrorMercado("Primero hace falta el estudio general del mercado.", 409);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeProducto({
      marca: cliente.name, producto, general,
      contexto: await contextoDeMarca(env, acceso, cliente, `${producto.nombre} ${producto.beneficios} garantía testimonios objeciones precio`),
      material: materialDe(material), conWeb: true,
    }),
    salida: 6000,
    funcion: "estudio de mercado",
    herramientas: HERRAMIENTAS_WEB.map((h) => ({ ...h, max_uses: 3 })),
  });
  const deProducto = leerDeProducto(r.texto, { nombre: producto.nombre });
  if (!deProducto) throw new ErrorMercado(`La IA no devolvió el estudio de «${producto.nombre}» con el formato esperado. Inténtalo otra vez.`, 502);
  // Se relee el borrador justo antes de escribir: otra pestaña pudo añadir otro producto entretanto.
  const actual = (await leerMercado(acceso, cliente.id)).borrador ?? { general, productos: {} };
  const nuevo = limpiarEstudio({
    ...actual,
    general: actual.general ?? general,
    productos: { ...actual.productos, [producto.id]: deProducto },
    conWeb: Boolean(actual.conWeb || r.conWeb),
    hechoAt: actual.hechoAt ?? ahora(),
  });
  await escribir(acceso, cliente.id, { borrador: JSON.stringify(nuevo) });
  return { borrador: nuevo, modelo: r.modelo, aviso: r.aviso, busquedas: r.busquedas, conWeb: r.conWeb, segundos: r.segundos };
}

/** Guarda lo corregido a mano en el borrador (o lo descarta con `null`). */
export async function guardarBorrador(acceso, cliente, entrada) {
  const borrador = entrada === null ? null : limpiarEstudio(entrada);
  if (entrada !== null && !borrador) throw new ErrorMercado("El borrador está vacío.", 400);
  await escribir(acceso, cliente.id, { borrador: borrador ? JSON.stringify(borrador) : null });
  return borrador;
}

/** El documento del estudio en la carpeta «Estudios de mercado» del Drive del cliente. Nunca lanza: devuelve el aviso. */
async function documentoEnDrive(env, acceso, cliente, estudio, catalogo) {
  const raiz = idDeCarpeta(cliente.drive_folder);
  if (!raiz) return { drive: null, avisoDrive: "Este cliente no tiene carpeta de Drive en su ficha: el documento no se guardó allí." };
  try {
    const carpeta = await carpetaDeLaApp(env, acceso, raiz, CARPETA_DRIVE);
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const bytes = new TextEncoder().encode(estudioADocumento(estudio, catalogo, { marca: cliente.name, fecha: hoy }));
    const f = await subirADrive(env, acceso, {
      carpeta, nombre: `Estudio de mercado · ${cliente.name} · ${fecha}`, mime: "text/html", largo: bytes.byteLength, cuerpo: bytes,
      convertirA: MIME_DOC_GOOGLE, descripcion: "Estudio de mercado hecho y aprobado en el calendario de Juancito Ads.",
    });
    return { drive: { id: f.id, nombre: f.name, enlace: `https://docs.google.com/document/d/${encodeURIComponent(f.id)}/edit` }, avisoDrive: null };
  } catch (e) {
    if (e instanceof DriveDesconectado || e instanceof ErrorDrive) return { drive: null, avisoDrive: `No se guardó en Drive: ${e.message}` };
    console.error("mercado: no se pudo guardar el documento en Drive", e);
    return { drive: null, avisoDrive: "No se pudo guardar el documento en Drive." };
  }
}

/** Aprueba el borrador: pasa a vigente, se escribe en el cerebro y se guarda en Drive. */
export async function aprobarEstudio(env, acceso, cliente) {
  const { catalogo, borrador } = await leerMercado(acceso, cliente.id);
  if (!borrador?.general) throw new ErrorMercado("No hay un estudio por aprobar: falta al menos el estudio general.", 409);
  // Sólo los productos que siguen en el catálogo: uno que se quitó no deja su estudio en el cerebro.
  const vigentes = new Set(productosActivos(catalogo).map((p) => p.id));
  const productos = Object.fromEntries(Object.entries(borrador.productos).filter(([id]) => vigentes.has(id)));
  const estudio = limpiarEstudio({ ...borrador, productos, aprobadoAt: ahora() });
  const notas = notasDelEstudio(estudio, catalogo, { marca: cliente.name });
  // Primero el cerebro (que es lo que usa la IA) y la fila; Drive después y sin poder tumbar nada.
  const creadas = await reemplazarNotas(env, acceso, cliente.id, (r) => r.startsWith("estudio-"), notas.map((n) => ({ ...n, tipo: "mercado" })));
  await escribir(acceso, cliente.id, { estudio: JSON.stringify(estudio), borrador: null });
  const { drive, avisoDrive } = await documentoEnDrive(env, acceso, cliente, estudio, catalogo);
  return { estudio, notas: creadas.length, drive, avisoDrive };
}

// ------------------------------------------------------------
// Las referencias de la competencia
// ------------------------------------------------------------

/** La carpeta «Competencia» de la galería del Estudio; se crea si falta. Null si no se pudo (tope de carpetas). */
async function carpetaCompetencia(acceso, clienteId) {
  const existentes = await acceso.leerColumnas("estudio_carpetas", ["id", "nombre"], { client_id: clienteId });
  const hay = existentes.find((c) => c.nombre.toLowerCase() === CARPETA_COMPETENCIA.toLowerCase());
  if (hay) return hay.id;
  try {
    return (await crearCarpeta(acceso, clienteId, CARPETA_COMPETENCIA)).id;
  } catch {
    return null;
  }
}

/** Un video de la competencia lo VE Gemini (imagen y audio): su análisis y su estructura tramo a tramo. */
async function analizarVideo(env, acceso, cliente, archivo, datos, estudio) {
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorMercado(bloqueo, 402);
  const obj = await env.MEDIA.get(archivo.clave);
  if (!obj) throw new ErrorMercado("El video ya no está en el almacenamiento.", 404);
  if (obj.size > MAX_BYTES_VIDEO) throw new ErrorMercado("El video es demasiado grande para analizarlo.", 413);
  let texto;
  try {
    texto = await verVideo(env, acceso, {
      bytes: await obj.arrayBuffer(), mime: archivo.mime, nombre: archivo.clave.split("/").pop(), clienteId: cliente.id,
      prompt: pedidoDeReferenciaVideo({ marca: cliente.name, ...datos, estudio }), funcion: "referencia de competencia", json: true,
    });
  } catch (e) {
    if (e instanceof ErrorVideo) throw new ErrorMercado(e.message, e.estado);
    throw e;
  }
  const analisis = leerReferencia(texto);
  if (!analisis) throw new ErrorMercado("Google AI no devolvió un análisis del video que se pueda leer. Inténtalo otra vez.", 502);
  return analisis;
}

/** La IA mira la captura (o el video) con lo que sabemos del mercado delante. */
async function analizar(env, acceso, cliente, archivo, datos, estudio) {
  if (archivo.tipo === "video" && /^video\//.test(archivo.mime ?? "")) return analizarVideo(env, acceso, cliente, archivo, datos, estudio);
  if (archivo.tipo !== "imagen" || !/^image\/(png|jpeg|webp|gif)$/.test(archivo.mime)) {
    throw new ErrorMercado("Sólo se analizan capturas (PNG, JPEG o WebP) o videos.", 400);
  }
  const obj = await env.MEDIA.get(archivo.clave);
  if (!obj) throw new ErrorMercado("La captura ya no está en el almacenamiento.", 404);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES_IMAGEN) throw new ErrorMercado("La captura es demasiado grande para analizarla (más de 3,5 MB).", 413);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: archivo.mime, data: aBase64(bytes) } },
      { type: "text", text: pedidoDeReferencia({ marca: cliente.name, ...datos, estudio }) },
    ],
    salida: 1500,
    funcion: "referencia de competencia",
  });
  const analisis = leerReferencia(r.texto);
  if (!analisis) throw new ErrorMercado("La IA no devolvió un análisis que se pueda leer. Inténtalo otra vez.", 502);
  return analisis;
}

/** Añade una referencia: la captura (ya subida a la galería) va a «Competencia», la IA la analiza y va al cerebro. */
export async function agregarReferencia(env, acceso, cliente, entrada = {}) {
  const { referencias, estudio, borrador } = await leerMercado(acceso, cliente.id);
  if (referencias.length >= MAX_REFERENCIAS) throw new ErrorMercado(`Ya hay ${MAX_REFERENCIAS} referencias: borra las que ya no sirvan.`, 409);
  const archivo = await acceso.leerUno("estudio_archivos", { id: String(entrada.archivoId ?? ""), client_id: cliente.id });
  if (!archivo || archivo.borrado_at) throw new ErrorMercado("Esa captura no está en la galería de este cliente.", 404);
  const base = limpiarReferencias([{
    ...entrada, id: uuid(), archivoId: archivo.id, clave: archivo.clave, medio: archivo.tipo === "video" ? "video" : "imagen", creadaAt: ahora(),
  }])[0];
  const carpeta = await carpetaCompetencia(acceso, cliente.id);
  if (carpeta) await cambiarArchivo(acceso, cliente.id, archivo.id, { carpetaId: carpeta }).catch(() => {});

  let analisis = null;
  let aviso = null;
  try {
    analisis = await analizar(env, acceso, cliente, archivo, { competidor: base.competidor, desde: base.desde, nota: base.nota, origen: base.origen }, estudio ?? borrador);
  } catch (e) {
    // La referencia se guarda igual: se puede volver a analizar.
    if (!(e instanceof ErrorMercado || e instanceof ErrorIA)) throw e;
    aviso = e.message;
  }
  const referencia = { ...base, analisis };
  const [nota] = await reemplazarNotas(env, acceso, cliente.id, () => false, [{
    ruta: `referencia-${slugProducto(base.competidor || "competencia")}`,
    titulo: `Referencia: ${base.competidor || "competencia"}`,
    texto: notaDeReferencia(referencia),
    tipo: "mercado",
    // Interna: es de la competencia. La ven el equipo y el asistente; lo que se escribe para publicar, no.
    interna: true,
  }]);
  referencia.notaId = nota.id;
  // Se relee antes de escribir: otra referencia pudo entrar entretanto.
  const actuales = (await leerMercado(acceso, cliente.id)).referencias;
  await escribir(acceso, cliente.id, { referencias: JSON.stringify(limpiarReferencias([referencia, ...actuales])) });
  return { referencia: limpiarReferencias([referencia])[0], aviso };
}

/** Vuelve a analizar una referencia (por ejemplo, la que falló o tras completar el estudio). */
export async function reanalizarReferencia(env, acceso, cliente, id) {
  const { referencias, estudio, borrador } = await leerMercado(acceso, cliente.id);
  const ref = referencias.find((r) => r.id === id);
  if (!ref) throw new ErrorMercado("Esa referencia no existe.", 404);
  const archivo = await acceso.leerUno("estudio_archivos", { id: ref.archivoId, client_id: cliente.id });
  if (!archivo || archivo.borrado_at) throw new ErrorMercado("La captura de esta referencia ya no está en la galería.", 404);
  const analisis = await analizar(env, acceso, cliente, archivo, ref, estudio ?? borrador);
  const referencia = { ...ref, analisis };
  if (ref.notaId) {
    const texto = notaDeReferencia(referencia);
    await acceso.actualizar("cerebro_notas", { id: ref.notaId, client_id: cliente.id }, { texto, ...derivados(texto) }).catch(() => 0);
    await reindexar(env, acceso, cliente.id);
  }
  const actuales = (await leerMercado(acceso, cliente.id)).referencias;
  await escribir(acceso, cliente.id, { referencias: JSON.stringify(actuales.map((r) => (r.id === id ? referencia : r))) });
  return limpiarReferencias([referencia])[0];
}

/** Quita una referencia y su nota del cerebro. La captura se queda en la galería (puede estar usándose). */
export async function borrarReferencia(env, acceso, cliente, id) {
  const { referencias } = await leerMercado(acceso, cliente.id);
  const ref = referencias.find((r) => r.id === id);
  if (!ref) return false;
  if (ref.notaId) {
    await acceso.borrar("cerebro_notas", { id: ref.notaId, client_id: cliente.id }).catch(() => {});
    await reindexar(env, acceso, cliente.id);
  }
  await escribir(acceso, cliente.id, { referencias: JSON.stringify(referencias.filter((r) => r.id !== id)) });
  return true;
}

/**
 * «Adaptar a la marca»: un guion con la misma estructura que la referencia, para un producto del catálogo. No guarda
 * nada: devuelve el guion para revisarlo, copiarlo o llevarlo al planificador.
 */
export async function adaptarReferencia(env, acceso, cliente, id, { productoId = "", formato = "reel" } = {}) {
  const { referencias, catalogo, inventario } = await leerMercado(acceso, cliente.id);
  const ref = referencias.find((r) => r.id === id);
  if (!ref) throw new ErrorMercado("Esa referencia no existe.", 404);
  if (!ref.analisis) throw new ErrorMercado("Primero hay que analizar la referencia («Volver a analizar»).", 409);
  const producto = productosActivos(catalogo).find((p) => p.id === productoId) ?? null;
  const kit = kitDe(cliente);
  const textoKit = [kit.paleta.length && `Paleta: ${textoPaleta(kit.paleta)}`, kit.estilo && `Estilo: ${kit.estilo}`].filter(Boolean).join("\n");
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeAdaptacion({
      marca: cliente.name, referencia: ref, formato: ["reel", "carrusel", "post"].includes(formato) ? formato : "reel",
      productoLinea: producto ? lineaDeProducto(producto, { inventario }).slice(2) : "",
      kit: textoKit,
      contexto: await contextoDeMarca(env, acceso, cliente, `${producto?.nombre ?? ""} ${ref.analisis.gancho} ${ref.analisis.angulo}`),
    }),
    salida: 2500,
    funcion: "guion de video",
  });
  const adaptacion = leerAdaptacion(r.texto);
  if (!adaptacion) throw new ErrorMercado("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez.", 502);
  return { adaptacion, modelo: r.modelo, aviso: r.aviso };
}
