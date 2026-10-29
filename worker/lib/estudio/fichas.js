// ============================================================
// El DIRECTOR DE ARTE: una ficha de diseño por pieza, por tandas
//
// Sustituye a «Mejorar idea» (60 palabras describiendo una foto) en todas las
// piezas de imagen: el lote, «Producir el mes», «Crear con IA», «Crear la
// imagen aquí», «Otra versión» y las historias. Razona como el asistente
// —con el manual del director, el kit, la identidad visual del cerebro, el
// catálogo y las plantillas del cliente— y escribe la ficha completa de cada
// pieza (src/lib/director.js). En una tanda, todas como una serie, pero CADA
// pieza en su propia llamada (la primera fija el concepto): así piensa cada una
// como lo hace el asistente en el chat. También lee la ficha técnica y el
// catálogo entero, y puede MIRAR una imagen especial (la original de «Otra
// versión», la pieza de otra marca de «Recrear con mi marca»).
//
// No guarda nada: devuelve las fichas, y quien pide las pone en el pedido (y
// en la publicación, para que la segunda vez salga al instante).
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { kitDe } from "./kit.js";
import { leerMercado } from "../mercado.js";
import { bloqueDeMarca, kitVacio } from "../../../src/lib/kitMarca.js";
import { productosActivos, lineaDeProducto, catalogoATexto } from "../../../src/lib/estudioMercado.js";
import {
  pedidoDeFichas, leerFichas, limpiarPiezaEncargo, MAX_FICHAS, correccionesRecientes, plantillaParaTipo, PAPELES_ESPECIALES, MAX_SOBRE_LA_MARCA,
} from "../../../src/lib/director.js";
import { ErrorEstudio } from "./trabajos.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CONSULTA_VISUAL = "identidad visual paleta colores tipografía estilo fotografía composición logo evitar";
const MAX_GUIA = 3_500;

/** El manual de la agencia (con el del director dentro), o null. No puede tumbar nada. */
export async function manualDelEspacio(acceso) {
  try {
    const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
    return leerJSON(fila?.manual_campanas, null);
  } catch {
    return null;
  }
}

/**
 * Lo que la agencia corrigió hace poco en este cliente (los pedidos de edición de su Estudio, los más nuevos primero),
 * para que el director no repita esos errores. Vacío si no hay o falla.
 */
export async function correccionesDelCliente(acceso, clienteId) {
  try {
    const filas = await acceso.leerColumnas("estudio_trabajos", ["prompt"], { client_id: clienteId }, "created_at desc", 80);
    return correccionesRecientes(filas.map((f) => f.prompt));
  } catch {
    return [];
  }
}

/** Como mucho, las imágenes del cliente que ve el director (las manda el navegador ya pequeñas). */
export const MAX_VISTAS = 4;
const MAX_VISTA = 700_000; // caracteres de base64 por imagen (~500 kB): copias de 512–768 px en JPEG

/** Las imágenes que manda el navegador, limpias: sólo JPEG, PNG o WEBP en base64 y de tamaño razonable. */
export function limpiarVistas(vistas) {
  return (Array.isArray(vistas) ? vistas : [])
    .filter((v) => /^image\/(jpeg|png|webp)$/.test(String(v?.media_type ?? "")) && typeof v?.data === "string" && v.data.length > 0 && v.data.length <= MAX_VISTA && /^[A-Za-z0-9+/=]+$/.test(v.data.slice(0, 200)))
    .slice(0, MAX_VISTAS)
    .map((v) => ({ type: "image", source: { type: "base64", media_type: v.media_type, data: v.data } }));
}

/** El pedido con las imágenes delante (si las hay): así el director ve el nivel a igualar. */
export const conVistas = (bloques, texto) => (bloques.length ? [...bloques, { type: "text", text: texto }] : texto);

/**
 * Las imágenes ESPECIALES que van delante del pedido, limpias: la original de «Otra versión» o la pieza de otra marca
 * de «Recrear con mi marca» (`papel`, ver PAPELES_ESPECIALES). Como mucho dos.
 */
export function limpiarEspeciales(especiales) {
  const lista = (Array.isArray(especiales) ? especiales : []).filter((e) => PAPELES_ESPECIALES.includes(e?.papel)).slice(0, 2);
  const bloques = limpiarVistas(lista);
  // limpiarVistas descarta las que no valen: el papel va con la que quedó.
  const papeles = lista.filter((e) => limpiarVistas([e]).length).map((e) => e.papel);
  return { bloques, papeles };
}

/** Los ids de los productos de una pieza: el principal y los demás (`productoIds`), sin repetir. Pura. */
export const idsDeProductos = (p) => [...new Set([p?.productoId, ...(Array.isArray(p?.productoIds) ? p.productoIds : [])].map((x) => String(x ?? "").slice(0, 80)).filter(Boolean))].slice(0, 6);

/**
 * Lo que el director necesita del cliente, leído UNA vez para toda la tanda: el kit, el catálogo, la ficha técnica y la
 * identidad visual del cerebro, el manual y lo que la agencia corrigió. Lo que falla, falta (no tumba nada).
 */
export async function contextoDelDirector(env, acceso, cliente) {
  const kit = kitDe(cliente);
  const [mercado, saber, manual, correcciones] = await Promise.all([
    leerMercado(acceso, cliente.id).catch(() => null),
    contextoCerebro(env, acceso, cliente.id, CONSULTA_VISUAL, { para: "imagen", n: 5, per: 2, presupuesto: MAX_GUIA }).catch(() => null),
    manualDelEspacio(acceso),
    correccionesDelCliente(acceso, cliente.id),
  ]);
  const activos = mercado ? productosActivos(mercado.catalogo) : [];
  return {
    kit, mercado, activos, manual, correcciones,
    guia: saber?.pasajes ?? "",
    sobreLaMarca: String(saber?.ficha ?? "").slice(0, MAX_SOBRE_LA_MARCA),
    catalogo: mercado ? catalogoATexto(mercado.catalogo, { inventario: mercado.inventario }) : "",
  };
}

/** Cuántas piezas se diseñan a la vez (una llamada cada una): más, y la cuenta de Anthropic empieza a decir 429. */
const A_LA_VEZ = 3;

/**
 * Las fichas de una tanda. `piezas`: [{ n, formato, tipo, idea, escena, texto, productoId, productoIds, indicacion,
 * sinTexto, plantilla, composicion, fecha }] (hasta 12); `concepto`: el de la tanda, si ya se sabe; `previas`: fichas
 * de la misma serie ya diseñadas; `especiales`: la original o la referencia de otra marca ({ papel, media_type, data }).
 *
 * CADA PIEZA ES SU PROPIA LLAMADA, con el razonamiento entero para ella (el asistente piensa cada pieza en la
 * conversación, y por eso salían mejor que las de la tanda). Para que sigan siendo una serie, la primera se diseña sola
 * y fija el concepto; las demás van después, a la vez, con ese concepto y la primera delante.
 * → { concepto, fichas: { n → { ficha, plantilla? } }, modelo, aviso }.
 */
export async function fichasDeDiseno(env, acceso, cliente, { piezas = [], concepto = "", vistas = [], especiales = [], previas = [], serie = 0 } = {}) {
  const lista = (Array.isArray(piezas) ? piezas : []).slice(0, MAX_FICHAS);
  if (!lista.length) throw new ErrorEstudio("No hay piezas que diseñar.", 400);
  const ctx = await contextoDelDirector(env, acceso, cliente);
  const { kit, mercado, activos } = ctx;
  // Los productos de cada pieza, con su precio del catálogo (sólo los que existen).
  const lineasDe = (p) => idsDeProductos(p).map((id) => activos.find((x) => x.id === id)).filter(Boolean)
    .map((x) => lineaDeProducto(x, { inventario: mercado.inventario }));
  const encargo = lista.map((p, i) => {
    const lineas = lineasDe(p);
    const producto = lineas.length > 1 ? lineas.join("\n") : lineas.length ? lineas[0].slice(2) : p?.producto;
    const limpia = limpiarPiezaEncargo({ ...p, producto }, i);
    // La plantilla asignada a su tipo de contenido, si nadie escogió otra (y la pieza lleva su texto: con la plantilla
    // de texto encima, el diseño lo decide la plantilla de la aplicación).
    if (!limpia.plantilla && !limpia.sinTexto) {
      const asignada = plantillaParaTipo(kit.plantillas, limpia.tipo, limpia.formato);
      if (asignada) limpia.plantilla = asignada.id;
    }
    return limpia;
  });
  const { bloques: deEspeciales, papeles } = limpiarEspeciales(especiales);
  const imagenes = [...deEspeciales, ...limpiarVistas(vistas)];
  const total = Math.max(serie, encargo.length);

  const disenar = async (pieza, { concepto: c, previas: antes }) => {
    const lineas = lineasDe(lista[encargo.indexOf(pieza)]);
    const r = await llamarIA(env, acceso, cliente, {
      prompt: conVistas(imagenes, pedidoDeFichas({ conLogo: Boolean(kit?.logo),
        cliente: cliente.name, rubro: cliente.industry ?? "", piezas: [pieza], serie: total,
        marca: kitVacio(kit) ? "" : bloqueDeMarca(kit), guia: ctx.guia, sobreLaMarca: ctx.sobreLaMarca, catalogo: ctx.catalogo,
        plantillas: kit.plantillas, manual: ctx.manual, concepto: c, productos: lineas.join("\n"),
        correcciones: ctx.correcciones, vistas: imagenes.length - deEspeciales.length, especiales: papeles, previas: antes,
      })),
      salida: 2_400,
      funcion: "director de arte",
    });
    return { leido: leerFichas(r.texto, [pieza]), modelo: r.modelo, aviso: r.aviso ?? null };
  };

  const fichas = {};
  let conceptoFinal = String(concepto ?? "");
  let modelo = "";
  let aviso = null;
  const errores = [];
  const apuntar = (res) => {
    if (res.status === "rejected") { errores.push(res.reason); return; }
    const { leido, modelo: m, aviso: a } = res.value;
    modelo ||= m;
    aviso ||= a;
    if (!leido) return;
    conceptoFinal ||= leido.concepto;
    Object.assign(fichas, leido.fichas);
  };

  let resto = encargo;
  const antes = (Array.isArray(previas) ? previas : []).map((f) => String(f ?? "")).filter(Boolean).slice(-2);
  // La primera fija el concepto de la serie (si aún no lo hay y son varias).
  if (!conceptoFinal && encargo.length > 1) {
    apuntar(...(await Promise.allSettled([disenar(encargo[0], { concepto: "", previas: antes })])));
    resto = encargo.slice(1);
  }
  const primeras = [...antes, ...Object.values(fichas).map((f) => f.ficha)].slice(-2);
  for (let k = 0; k < resto.length; k += A_LA_VEZ) {
    const tanda = resto.slice(k, k + A_LA_VEZ);
    (await Promise.allSettled(tanda.map((p) => disenar(p, { concepto: conceptoFinal, previas: primeras })))).forEach(apuntar);
  }

  if (!Object.keys(fichas).length) {
    // Sin presupuesto, o la IA caída: el motivo de verdad, no uno genérico.
    const e = errores.find((x) => x?.estado === 402) ?? errores[0];
    if (e) throw e;
    throw new ErrorEstudio("El director de arte no devolvió fichas que se puedan leer. Inténtalo otra vez.", 502);
  }
  return { concepto: conceptoFinal, fichas, modelo, aviso };
}
