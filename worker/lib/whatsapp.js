// ============================================================
// WhatsApp e investigación (curso de campañas, entrega 8): el kit de WhatsApp Business y la voz del cliente
//
// Lo puro vive en src/lib/kitWhatsApp.js y src/lib/vozCliente.js; aquí, lo que toca D1 y la IA.
//
// EL KIT (`anuncios_clientes.kit_whatsapp`, 0072)
//
//   · «Proponer» le pide a la IA el kit entero con el estudio de mercado APROBADO (maletas y objeciones con su
//     respuesta), el catálogo, el perfil del negocio (tipo y destino), la ficha del cliente y el cerebro PARA ESCRIBIR
//     (`para: "texto"`: nunca lo interno). No guarda nada: lo guarda una persona con «Guardar».
//   · Los precios los pone el código (`ponerPrecios`): la IA escribe «{precio}» y «{precios}».
//   · La fila es la de lo que decide la agencia de los anuncios de un cliente: se escribe con `actualizar` (sólo esta
//     columna), nunca con `guardar`, que pisaría el informe, los números del negocio y el enlace de ventas.
//
// LA VOZ DEL CLIENTE (`voz_cliente`, `anuncios_clientes.testigo_voz`, 0072)
//
//   · El enlace va SIN sesión por su testigo (`/api/publico-voz/<testigo>`), que se crea una vez y se reutiliza. La
//     única lectura sin dueño es la del testigo (worker/lib/publico.js); lo demás, por la capa de acceso de ese espacio.
//   · Un cliente guarda como mucho MAX_RESPUESTAS_CLIENTE respuestas (el enlace es público) y el campo trampa `sitio`
//     descarta lo que manda un robot sin decírselo.
//   · «Llevar al estudio» PROPONE (la IA lee las respuestas nuevas) y «Aceptar» pone lo marcado en el BORRADOR del
//     estudio de mercado, que se aprueba como siempre. Los testimonios se vuelven a comprobar al aceptar: sólo de quien
//     dio permiso, con su nombre.
//
// Nada de esto se ha probado contra la IA real: los tests usan un `fetch` de mentira (tests/migracion/whatsapp.test.js).
// ============================================================

import { crearAcceso, NULO } from "./acceso.js";
import { difundir } from "./vivo.js";
import { ahora, uuid, testigo as nuevoTestigo } from "./ids.js";
import { clienteDeVozPorTestigo } from "./publico.js";
import { leerMercado, guardarBorrador } from "./mercado.js";
import { leerNegocio } from "./negocio.js";
import { contexto as contextoCerebro, textoParaEscribir } from "./cerebro/cerebro.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { productosActivos, resumenGeneral, limpiarEstudio } from "../../src/lib/estudioMercado.js";
import { textoDelCliente } from "../../src/lib/loteAnuncios.js";
import { tipoNegocioDe, destinoNegocioDe } from "../../src/lib/cicloVentas.js";
import {
  limpiarKitWhatsApp, productosDelKit, pedidoKitWhatsApp, leerKitWhatsApp, avisosDelKit, pendientesDelKit, estudioTieneGarantia,
  MAX_GUIONES,
} from "../../src/lib/kitWhatsApp.js";
import {
  limpiarRespuestaVoz, respuestaDeFila, resumenVoz, PREGUNTAS_VOZ, RECOMIENDA, MAX_RESPUESTAS_CLIENTE, MAX_PARA_ESTUDIO,
} from "../../src/lib/vozCliente.js";
import { pedidoVozAlEstudio, leerPropuestaVoz, limpiarPropuestaVoz, aplicarPropuestaVoz, propuestaVacia } from "../../src/lib/vozAlEstudio.js";

export class ErrorWhatsApp extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.name = "ErrorWhatsApp";
    this.estado = estado;
  }
}

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CONSULTA_KIT = "whatsapp atención al cliente mensajes respuestas horario ubicación envío entrega pago garantía tono voz";

// ------------------------------------------------------------
// La fila de anuncios del cliente (la comparten el informe, los números, las ventas y esto)
// ------------------------------------------------------------

/** Escribe columnas de la fila del cliente SIN tocar las demás; la crea si no existe. */
async function escribirFila(acceso, clientId, cambios) {
  const t = ahora();
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (previa) {
    await acceso.actualizar("anuncios_clientes", { id: previa.id }, { ...cambios, updated_at: t });
    return;
  }
  try {
    await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, ...cambios, created_at: t, updated_at: t });
  } catch (e) {
    // Otra petición creó la fila entre la lectura y la escritura (client_id es único): se escribe sobre ésa.
    const otra = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
    if (!otra) throw e;
    await acceso.actualizar("anuncios_clientes", { id: otra.id }, { ...cambios, updated_at: t });
  }
}

// ------------------------------------------------------------
// El kit
// ------------------------------------------------------------

/** El kit guardado del cliente, limpio (vacío si no hay). */
export async function leerKit(acceso, clientId) {
  const f = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  return limpiarKitWhatsApp(leerJSON(f?.kit_whatsapp, {}));
}

/** Lo que la pantalla necesita para revisar el kit: los precios del catálogo y si el estudio tiene garantía. */
export async function contextoDelKit(acceso, clientId) {
  const m = await leerMercado(acceso, clientId);
  return {
    productos: productosDelKit(m.catalogo),
    hayGarantia: estudioTieneGarantia(m.estudio),
    conEstudio: Boolean(m.estudio),
    aprobadoAt: m.estudio?.aprobadoAt ?? null,
  };
}

/** Guarda el kit (limpio) con quién y cuándo. Sólo toca la columna `kit_whatsapp`. */
export async function guardarKit(env, acceso, { clientId, entrada, usuario, firma = null }) {
  const kit = { ...limpiarKitWhatsApp(entrada), actualizado: ahora() };
  const por = String(usuario?.nombre ?? "").slice(0, 80);
  if (por) kit.por = por;
  else delete kit.por;
  await escribirFila(acceso, clientId, { kit_whatsapp: JSON.stringify(kit) });
  difundir(env, acceso.ownerId, { tipo: "whatsapp", que: "kit", clientId, por: firma });
  return kit;
}

/** Los productos del guion: los activos del catálogo, primero los que tienen estudio, con sus maletas y objeciones. */
function productosParaElKit(catalogo, estudio) {
  const e = limpiarEstudio(estudio);
  const activos = productosActivos(catalogo);
  const conEstudio = activos.filter((p) => e?.productos?.[p.id]);
  const sinEstudio = activos.filter((p) => !e?.productos?.[p.id]);
  return [...conEstudio, ...sinEstudio].slice(0, MAX_GUIONES).map((p) => ({
    ...p,
    maletas: e?.productos?.[p.id]?.elementos ?? {},
    objeciones: e?.productos?.[p.id]?.objeciones ?? [],
  }));
}

/**
 * La IA PROPONE el kit (no guarda): { kit, avisos, pendientes, modelo, aviso }. Con el estudio APROBADO; sin él, el
 * kit sale sin las objeciones del estudio y se dice.
 */
export async function proponerKit(env, acceso, cliente) {
  const [mercado, negocio] = await Promise.all([leerMercado(acceso, cliente.id), leerNegocio(acceso, cliente.id)]);
  const productos = productosParaElKit(mercado.catalogo, mercado.estudio);
  let contexto = "";
  try {
    contexto = textoParaEscribir(await contextoCerebro(env, acceso, cliente.id, CONSULTA_KIT, { para: "texto", presupuesto: 6000 }));
  } catch (e) {
    console.warn("kit de WhatsApp: el cerebro no respondió", e?.message);
  }
  const perfil = [
    tipoNegocioDe(negocio.tipo) && `vende ${tipoNegocioDe(negocio.tipo).nombre.toLowerCase()} (${tipoNegocioDe(negocio.tipo).ayuda.replace(/\.$/, "").toLowerCase()})`,
    destinoNegocioDe(negocio.destino) && `los anuncios llevan a ${destinoNegocioDe(negocio.destino).nombre} (${destinoNegocioDe(negocio.destino).ayuda.replace(/\.$/, "").toLowerCase()})`,
  ].filter(Boolean).join("; ");
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoKitWhatsApp({
      marca: cliente.name ?? "", rubro: cliente.industry ?? "", productos,
      general: resumenGeneral(mercado.estudio?.general), ficha: textoDelCliente(cliente), contexto: contexto.slice(0, 14_000), negocio: perfil,
    }),
    salida: 9000, funcion: "kit de WhatsApp",
  });
  const delCatalogo = productosDelKit(mercado.catalogo);
  const kit = leerKitWhatsApp(r.texto, { productos: delCatalogo });
  if (!kit) throw new ErrorIA("La IA no devolvió un kit que se pueda leer. Inténtalo otra vez.", 502);
  const propuesto = { ...kit, propuestoAt: ahora() };
  const avisos = avisosDelKit(propuesto, { productos: delCatalogo, hayGarantia: estudioTieneGarantia(mercado.estudio) });
  if (!mercado.estudio) avisos.unshift("Sin estudio de mercado aprobado: las respuestas a las objeciones salen de lo que se sabe de la marca. Con el estudio, salen mejor.");
  return { kit: propuesto, avisos, pendientes: pendientesDelKit(propuesto), modelo: r.modelo ?? null, aviso: r.aviso ?? null };
}

// ------------------------------------------------------------
// La voz del cliente: el enlace
// ------------------------------------------------------------

/** El testigo del enlace de la voz, o null si todavía no se creó. */
export async function testigoDeVoz(acceso, clientId) {
  const f = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  return f?.testigo_voz || null;
}

/**
 * El testigo, creándolo la PRIMERA vez y nunca más: regenerarlo mataría el enlace que el cliente ya reenvió. Si dos
 * personas lo piden a la vez, gana la primera (sólo se escribe si seguía vacío) y las dos se llevan el mismo.
 */
export async function crearEnlaceDeVoz(acceso, clientId) {
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (previa?.testigo_voz) return previa.testigo_voz;
  const nuevo = nuevoTestigo(24);
  if (previa) {
    await acceso.actualizar("anuncios_clientes", { id: previa.id, testigo_voz: NULO }, { testigo_voz: nuevo, updated_at: ahora() });
  } else {
    try {
      await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, testigo_voz: nuevo, created_at: ahora(), updated_at: ahora() });
    } catch {
      const otra = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
      if (otra && !otra.testigo_voz) await acceso.actualizar("anuncios_clientes", { id: otra.id, testigo_voz: NULO }, { testigo_voz: nuevo, updated_at: ahora() });
    }
  }
  const fila = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (!fila?.testigo_voz) throw new ErrorWhatsApp("No se pudo crear el enlace. Vuelve a intentarlo.", 500);
  return fila.testigo_voz;
}

/** Los productos activos que puede escoger quien responde («¿Qué compraste?»): sólo su id y su nombre. */
async function productosParaLaVoz(acceso, clientId) {
  const m = await leerMercado(acceso, clientId);
  return productosActivos(m.catalogo).map((p) => ({ id: p.id, nombre: p.nombre }));
}

// ------------------------------------------------------------
// La voz del cliente: lo que ve la agencia
// ------------------------------------------------------------

/** Las respuestas del cliente, las más nuevas primero (hasta 200), con su resumen y el testigo. */
export async function vozDelCliente(acceso, clientId) {
  const [filas, testigo, productos] = await Promise.all([
    acceso.leer("voz_cliente", { client_id: clientId }, "created_at desc", 200),
    testigoDeVoz(acceso, clientId),
    productosParaLaVoz(acceso, clientId),
  ]);
  const respuestas = filas.map(respuestaDeFila);
  return { respuestas, resumen: resumenVoz(respuestas), testigo, productos };
}

/** Quita una respuesta (una de prueba, o un robot que pasó la trampa). */
export async function borrarRespuesta(env, acceso, { clientId, id, firma = null }) {
  const n = await acceso.borrar("voz_cliente", { id: String(id ?? ""), client_id: clientId });
  if (!n) throw new ErrorWhatsApp("Esa respuesta ya no está.", 404);
  difundir(env, acceso.ownerId, { tipo: "whatsapp", que: "voz", clientId, por: firma });
  return { ok: true };
}

/** Los productos del estudio (el borrador si se está revisando; si no, el aprobado) con lo que ya dicen. */
function productosDelEstudio(catalogo, estudio) {
  const e = limpiarEstudio(estudio);
  if (!e) return [];
  const nombres = new Map(productosActivos(catalogo).map((p) => [p.id, p.nombre]));
  return Object.entries(e.productos).map(([id, p]) => ({ id, nombre: nombres.get(id) || p.nombre || id, maletas: p.elementos, objeciones: p.objeciones }));
}

/**
 * «Llevar al estudio»: la IA lee las respuestas que aún no se llevaron (o todas, con `todas`) y PROPONE qué añadir a
 * las maletas de cada producto. No guarda: { propuesta, leidas, modelo, aviso }.
 */
export async function vozAlEstudio(env, acceso, cliente, { todas = false } = {}) {
  const mercado = await leerMercado(acceso, cliente.id);
  const base = mercado.borrador ?? mercado.estudio;
  const productos = productosDelEstudio(mercado.catalogo, base);
  if (!productos.length) throw new ErrorWhatsApp("Primero hace falta el estudio de mercado de algún producto (Marca → Cerebro → Estudio de mercado): ahí van las respuestas.", 409);
  const filas = (await acceso.leer("voz_cliente", { client_id: cliente.id }, "created_at desc", 200)).map(respuestaDeFila);
  const elegidas = (todas ? filas : filas.filter((r) => !r.llevadaAt)).slice(0, MAX_PARA_ESTUDIO);
  if (!elegidas.length) {
    throw new ErrorWhatsApp(filas.length ? "Ya llevaste todas las respuestas al estudio. Cuando lleguen nuevas, vuelve a intentarlo (o léelas todas otra vez)." : "Todavía no hay respuestas: manda el enlace a sus clientes.", 409);
  }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoVozAlEstudio({ marca: cliente.name ?? "", respuestas: elegidas, productos }),
    salida: 4000, funcion: "voz del cliente",
  });
  const propuesta = leerPropuestaVoz(r.texto, { respuestas: elegidas, productos });
  if (!propuesta) throw new ErrorIA("La IA no devolvió una propuesta que se pueda leer. Inténtalo otra vez.", 502);
  return { propuesta, leidas: elegidas.map((x) => x.id), enBorrador: Boolean(mercado.borrador), modelo: r.modelo ?? null, aviso: r.aviso ?? null };
}

/**
 * «Añadir al estudio»: lo que la persona dejó marcado va al BORRADOR del estudio de mercado (se crea desde el aprobado
 * si no había) y las respuestas leídas quedan llevadas. Todo se vuelve a comprobar aquí: el navegador manda la
 * propuesta, y un testimonio sólo vale si su respuesta dio permiso. → { borrador, cambios }.
 */
export async function aceptarVoz(env, acceso, cliente, { propuesta, leidas = [], firma = null }) {
  const mercado = await leerMercado(acceso, cliente.id);
  const base = mercado.borrador ?? mercado.estudio;
  const productos = productosDelEstudio(mercado.catalogo, base);
  if (!productos.length) throw new ErrorWhatsApp("No hay estudio de mercado en el que ponerlo.", 409);
  const ids = [...new Set([
    ...(Array.isArray(leidas) ? leidas : []),
    ...(Array.isArray(propuesta?.productos) ? propuesta.productos.flatMap((p) => (Array.isArray(p?.testimonios) ? p.testimonios.map((t) => t?.respuestaId) : [])) : []),
  ].map(String).filter((x) => /^[\w-]{1,80}$/.test(x)))].slice(0, MAX_PARA_ESTUDIO * 2);
  const filas = ids.length ? await acceso.leerVarios("voz_cliente", ["id", "respuestas", "nombre", "permiso", "producto", "recomienda", "llevada_at", "created_at"], "id", ids, { client_id: cliente.id }) : [];
  const limpia = limpiarPropuestaVoz(propuesta, { respuestas: filas, productos });
  if (!limpia || propuestaVacia(limpia)) throw new ErrorWhatsApp("No hay nada marcado para añadir al estudio.", 400);
  const sinAprobar = { ...limpiarEstudio(base) };
  delete sinAprobar.aprobadoAt;
  const { estudio, cambios } = aplicarPropuestaVoz(sinAprobar, limpia);
  if (!estudio || !cambios) throw new ErrorWhatsApp("Todo lo marcado ya estaba en el estudio.", 409);
  const borrador = await guardarBorrador(acceso, cliente, estudio);
  // Las leídas quedan llevadas (las que se le dieron a la IA, sean del espacio y de este cliente).
  const leidasValidas = filas.filter((f) => (Array.isArray(leidas) ? leidas.map(String) : []).includes(String(f.id)));
  if (leidasValidas.length) {
    const t = ahora();
    const completas = await acceso.leerVarios("voz_cliente", ["id", "client_id", "respuestas", "nombre", "permiso", "producto", "recomienda", "llevada_at", "created_at", "updated_at"], "id", leidasValidas.map((f) => f.id), { client_id: cliente.id });
    await acceso.guardarVarios("voz_cliente", completas.map((f) => ({ ...f, llevada_at: f.llevada_at || t, updated_at: t })));
  }
  difundir(env, acceso.ownerId, { tipo: "whatsapp", que: "voz", clientId: cliente.id, por: firma });
  return { borrador, cambios };
}

// ------------------------------------------------------------
// La voz del cliente: lo que ve quien responde (sin sesión)
// ------------------------------------------------------------

/** El cliente del testigo y la capa de acceso de su espacio, o null si el testigo no vale. */
async function delTestigo(env, testigo) {
  const c = await clienteDeVozPorTestigo(env.DB, testigo);
  if (!c) return null;
  return { ...c, acceso: crearAcceso(env.DB, c.ownerId) };
}

/** Lo que enseña la encuesta: el nombre, el color y el logo del cliente, las preguntas y sus productos. null si no vale. */
export async function vozPublica(env, testigo) {
  const c = await delTestigo(env, testigo);
  if (!c) return null;
  return {
    cliente: { nombre: c.nombre, color: c.color, logo: c.logo },
    preguntas: PREGUNTAS_VOZ.map((p) => ({ id: p.id, pregunta: p.pregunta, ...(p.obligatoria ? { obligatoria: true } : {}) })),
    recomienda: RECOMIENDA,
    productos: await productosParaLaVoz(c.acceso, c.clientId),
  };
}

/** Quien responde guarda su respuesta. → { ok }; null si el testigo no vale. */
export async function guardarVozPublica(env, testigo, entrada) {
  const c = await delTestigo(env, testigo);
  if (!c) return null;
  const { fila, error, spam } = limpiarRespuestaVoz(entrada, { productos: await productosParaLaVoz(c.acceso, c.clientId) });
  // Un robot llenó el campo que una persona no ve: se le dice que sí y no se guarda nada.
  if (spam) return { ok: true };
  if (error) throw new ErrorWhatsApp(error, 400);
  const ya = await c.acceso.leerColumnas("voz_cliente", ["id"], { client_id: c.clientId }, "created_at asc", MAX_RESPUESTAS_CLIENTE);
  if (ya.length >= MAX_RESPUESTAS_CLIENTE) throw new ErrorWhatsApp("Ya recibimos muchas respuestas por este enlace. ¡Gracias de todas formas!", 409);
  const t = ahora();
  await c.acceso.insertar("voz_cliente", {
    id: uuid(), client_id: c.clientId, respuestas: JSON.stringify(fila.respuestas), nombre: fila.nombre, permiso: fila.permiso ? 1 : 0,
    producto: fila.producto, recomienda: fila.recomienda, created_at: t, updated_at: t,
  });
  difundir(env, c.ownerId, { tipo: "whatsapp", que: "voz", clientId: c.clientId, por: { userId: "cliente", nombre: c.nombre } });
  return { ok: true };
}
