// ============================================================
// La bandeja: lo que se le pide a Meta
//
//   suscribir()          Al encender el interruptor, la página (y la página
//                        del Instagram) se suscribe a la app con `feed` y
//                        `messages`; al apagarlo, se da de baja. Sin esa
//                        suscripción Meta no manda nada al webhook, aunque
//                        la app esté suscrita en su panel.
//   actualizarCliente()  El respaldo del webhook: los últimos comentarios
//                        de las publicaciones recientes y las últimas
//                        conversaciones. UNA llamada por cuenta y tipo —las
//                        publicaciones traen sus comentarios con expansión
//                        de campos—: como mucho cuatro, lejos de las 50
//                        subpeticiones de una invocación.
//   responder…/ocultar…/borrar…/enviarMensaje()  Las acciones.
//
// El token es el de cada PÁGINA (`cuentas_sociales.token_cifrado`), el
// mismo que publica. Los permisos que piden estas llamadas tienen revisión
// de Meta y se conceden aparte (PERMISOS_EXTRA_META.bandeja).
//
// NO PROBADO CONTRA META: los tests hablan con un `fetch` de mentira que
// responde con la forma de la documentación de la Graph API (v23).
// ============================================================

import { graph, descifrarMeta, ErrorMeta, mensajeMeta } from "../meta.js";
import { guardarSucesos, idDe } from "./almacen.js";
import { fechaMeta } from "./webhook.js";
import { ventanaMensajes } from "../../../src/lib/bandejaVista.js";

const ahora = () => new Date().toISOString();

/** Los campos que se piden a la página al encender la bandeja. */
export const CAMPOS_SUSCRIPCION = "feed,messages";

/** Cuántas publicaciones recientes, comentarios por publicación y conversaciones lee «Actualizar». */
export const LECTURA = Object.freeze({ publicaciones: 8, comentarios: 25, respuestas: 10, conversaciones: 10, mensajes: 10 });

export class ErrorBandeja extends Error {
  constructor(mensaje, estado = 409) {
    super(mensaje);
    this.name = "ErrorBandeja";
    this.estado = estado;
  }
}

/** Las cuentas de Meta de un cliente (Instagram y Facebook). */
export async function cuentasDelCliente(acceso, clientId) {
  const filas = await acceso.leer("cuentas_sociales", { client_id: clientId }, "red asc");
  return filas.filter((c) => c.red === "instagram" || c.red === "facebook");
}

async function tokenDe(env, cuenta) {
  if (!cuenta?.token_cifrado) throw new ErrorBandeja("Esta cuenta no tiene permiso guardado. Actualiza las cuentas de Meta en Ajustes.");
  return descifrarMeta(env, cuenta.token_cifrado);
}

/** La página de Facebook de una cuenta: la suya, o la que lleva el Instagram. */
const paginaDe = (cuenta) => (cuenta.red === "facebook" ? cuenta.externo_id : cuenta.pagina_id);

/**
 * Suscribe (o da de baja) las páginas del cliente. Devuelve lo que se
 * guarda en `bandeja_clientes.suscripcion`: qué páginas quedaron y, si Meta
 * no quiso, por qué. Nunca lanza: el interruptor se guarda igual, y la
 * pantalla dice qué falta.
 */
export async function suscribir(env, cuentas, activa) {
  const paginas = new Map();
  for (const c of cuentas) {
    const p = paginaDe(c);
    if (p && c.token_cifrado && !paginas.has(p)) paginas.set(p, c);
  }
  const salida = { paginas: [], errores: [], at: ahora() };
  for (const [pagina, cuenta] of paginas) {
    try {
      const token = await tokenDe(env, cuenta);
      if (activa) {
        await graph(env, token, `/${pagina}/subscribed_apps`, { metodo: "POST", params: { subscribed_fields: CAMPOS_SUSCRIPCION } });
      } else {
        await graph(env, token, `/${pagina}/subscribed_apps`, { metodo: "DELETE" });
      }
      salida.paginas.push(pagina);
    } catch (e) {
      salida.errores.push(`${cuenta.nombre || pagina}: ${e instanceof ErrorBandeja ? e.message : mensajeMeta(e)}`);
    }
  }
  return salida;
}

// ------------------------------------------------------------
// «Actualizar»
// ------------------------------------------------------------

/** Las publicaciones recientes de Instagram con sus comentarios, en sucesos. */
async function comentariosInstagram(env, token, cuenta) {
  const { publicaciones, comentarios, respuestas } = LECTURA;
  const campos = `id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,` +
    `comments.limit(${comentarios}){id,text,timestamp,username,hidden,from,replies.limit(${respuestas}){id,text,timestamp,username,hidden,from}}`;
  const r = await graph(env, token, `/${cuenta.externo_id}/media`, { params: { fields: campos, limit: publicaciones } });
  const sucesos = [];
  for (const m of r?.data ?? []) {
    const publicacion = {
      texto: m.caption ?? "",
      miniatura: m.thumbnail_url || (m.media_type === "VIDEO" ? "" : m.media_url) || "",
      enlace: m.permalink ?? "",
    };
    const uno = (c, padreId) => ({
      tipo: "comentario", red: "instagram", cuenta: cuenta.externo_id, verbo: "add",
      externoId: String(c.id), padreId, publicacionId: String(m.id), publicacion,
      autorId: String(c.from?.id ?? ""), autor: c.from?.username ?? c.username ?? "",
      texto: c.text ?? "", oculto: Boolean(c.hidden), creadoAt: fechaMeta(c.timestamp),
    });
    for (const c of m.comments?.data ?? []) {
      sucesos.push(uno(c, null));
      for (const h of c.replies?.data ?? []) sucesos.push(uno(h, String(c.id)));
    }
  }
  return sucesos;
}

/** Las publicaciones recientes de la página con sus comentarios (y respuestas, en plano). */
async function comentariosFacebook(env, token, cuenta) {
  const { publicaciones, comentarios } = LECTURA;
  const campos = `id,message,full_picture,permalink_url,created_time,` +
    `comments.limit(${comentarios}).filter(stream).order(reverse_chronological){id,message,created_time,from,is_hidden,parent{id}}`;
  const r = await graph(env, token, `/${cuenta.externo_id}/posts`, { params: { fields: campos, limit: publicaciones } });
  const sucesos = [];
  for (const p of r?.data ?? []) {
    const publicacion = { texto: p.message ?? "", miniatura: p.full_picture ?? "", enlace: p.permalink_url ?? "" };
    for (const c of p.comments?.data ?? []) {
      sucesos.push({
        tipo: "comentario", red: "facebook", cuenta: cuenta.externo_id, verbo: "add",
        externoId: String(c.id), padreId: c.parent?.id ? String(c.parent.id) : null,
        publicacionId: String(p.id), publicacion,
        autorId: String(c.from?.id ?? ""), autor: c.from?.name ?? "",
        texto: c.message ?? "", oculto: Boolean(c.is_hidden), creadoAt: fechaMeta(c.created_time),
      });
    }
  }
  return sucesos;
}

/** Las últimas conversaciones de la cuenta (Messenger o Instagram), en sucesos y nombres. */
async function conversaciones(env, token, cuenta) {
  const pagina = paginaDe(cuenta);
  if (!pagina) return { sucesos: [], nombres: new Map() };
  const { conversaciones: n, mensajes } = LECTURA;
  const r = await graph(env, token, `/${pagina}/conversations`, {
    params: {
      platform: cuenta.red === "instagram" ? "instagram" : "messenger",
      fields: `id,updated_time,participants,messages.limit(${mensajes}){id,message,from,to,created_time}`,
      limit: n,
    },
  });
  const sucesos = [];
  const nombres = new Map();
  const esLaCuenta = (id) => String(id) === String(cuenta.externo_id) || String(id) === String(pagina);
  for (const conv of r?.data ?? []) {
    const persona = (conv.participants?.data ?? []).find((p) => !esLaCuenta(p.id));
    if (!persona?.id) continue;
    nombres.set(String(persona.id), persona.username ? `@${persona.username}` : persona.name ?? "");
    for (const m of conv.messages?.data ?? []) {
      const propio = esLaCuenta(m.from?.id);
      sucesos.push({
        tipo: "mensaje", red: cuenta.red, cuenta: cuenta.externo_id, propio,
        usuarioId: String(persona.id), externoId: String(m.id), texto: m.message ?? "", adjuntos: [],
        enviadoAt: fechaMeta(m.created_time),
      });
    }
  }
  return { sucesos, nombres };
}

/**
 * Lee de Meta lo último de un cliente y lo guarda. Cada parte va por su
 * lado: que falte el permiso de los mensajes no impide traer los
 * comentarios. Devuelve lo guardado y los avisos, en español.
 */
export async function actualizarCliente(env, acceso, clientId) {
  const cuentas = await cuentasDelCliente(acceso, clientId);
  if (!cuentas.length) throw new ErrorBandeja("Este cliente no tiene cuentas de Facebook ni de Instagram asignadas.");
  const sucesos = [];
  const nombres = new Map();
  const avisos = [];
  for (const cuenta of cuentas) {
    const conCuenta = (lista) => lista.map((s) => ({ ...s, cuentaFila: cuenta }));
    let token;
    try { token = await tokenDe(env, cuenta); } catch (e) { avisos.push(e.message); continue; }
    const red = cuenta.red === "instagram" ? "Instagram" : "Facebook";
    try {
      sucesos.push(...conCuenta(await (cuenta.red === "instagram" ? comentariosInstagram : comentariosFacebook)(env, token, cuenta)));
    } catch (e) {
      avisos.push(`Comentarios de ${red}: ${mensajeMeta(e)}`);
    }
    try {
      const c = await conversaciones(env, token, cuenta);
      sucesos.push(...conCuenta(c.sucesos));
      for (const [k, v] of c.nombres) nombres.set(k, v);
    } catch (e) {
      avisos.push(`Mensajes de ${cuenta.red === "instagram" ? "Instagram" : "Messenger"}: ${mensajeMeta(e)}`);
    }
  }
  const r = await guardarSucesos(env, acceso, sucesos, { restante: 0 }, nombres);
  await acceso.actualizar("bandeja_clientes", { id: clientId }, { actualizada_at: ahora(), updated_at: ahora() });
  return { ...r, avisos };
}

// ------------------------------------------------------------
// Las acciones
// ------------------------------------------------------------

async function cuentaDeFila(env, acceso, fila) {
  const cuenta = fila.cuenta_id ? await acceso.leerUno("cuentas_sociales", { id: fila.cuenta_id }) : null;
  if (!cuenta) throw new ErrorBandeja("La cuenta de este comentario ya no está conectada.");
  return { cuenta, token: await tokenDe(env, cuenta) };
}

/** Responde en público a un comentario. Devuelve la fila de la respuesta. */
export async function responderComentario(env, acceso, fila, texto, usuario) {
  const { cuenta, token } = await cuentaDeFila(env, acceso, fila);
  const ruta = fila.red === "instagram" ? `/${fila.externo_id}/replies` : `/${fila.externo_id}/comments`;
  const r = await graph(env, token, ruta, { metodo: "POST", params: { message: texto } });
  if (!r?.id) throw new ErrorMeta({ message: "Meta no devolvió la respuesta publicada." }, 502);
  const marca = ahora();
  const respuesta = {
    id: idDe(acceso.ownerId, fila.red, String(r.id)),
    client_id: fila.client_id, cuenta_id: cuenta.id, red: fila.red, externo_id: String(r.id),
    padre_id: fila.externo_id, publicacion_id: fila.publicacion_id, publicacion_texto: fila.publicacion_texto,
    publicacion_miniatura: fila.publicacion_miniatura, publicacion_enlace: fila.publicacion_enlace,
    autor_id: cuenta.externo_id, autor: cuenta.usuario ? `@${cuenta.usuario}` : cuenta.nombre,
    texto, propio: 1, oculto: 0, atendido: 1, respondido: 0, creado_at: marca, atendido_por: usuario.id,
    created_at: marca, updated_at: marca,
  };
  await acceso.guardar("bandeja_comentarios", respuesta);
  await acceso.actualizar("bandeja_comentarios", { id: fila.id }, { atendido: 1, respondido: 1, atendido_por: usuario.id, updated_at: marca });
  return respuesta;
}

/** Oculta o vuelve a mostrar un comentario (en la red, no sólo aquí). */
export async function ocultarComentario(env, acceso, fila, oculto) {
  const { token } = await cuentaDeFila(env, acceso, fila);
  const params = fila.red === "instagram" ? { hide: oculto ? "true" : "false" } : { is_hidden: oculto ? "true" : "false" };
  await graph(env, token, `/${fila.externo_id}`, { metodo: "POST", params });
  await acceso.actualizar("bandeja_comentarios", { id: fila.id }, { oculto: oculto ? 1 : 0, updated_at: ahora() });
}

/** Borra un comentario de la red. Sin vuelta atrás: la pantalla lo confirma antes. */
export async function borrarComentario(env, acceso, fila) {
  const { token } = await cuentaDeFila(env, acceso, fila);
  await graph(env, token, `/${fila.externo_id}`, { metodo: "DELETE" });
  await acceso.borrar("bandeja_comentarios", { id: fila.id });
}

/**
 * Responde por privado. La ventana de 24 h se comprueba AQUÍ, no sólo en la
 * pantalla: fuera de ella Meta rechaza el envío con un error que no dice
 * eso, y una pestaña abierta desde ayer no lo sabría.
 */
export async function enviarMensaje(env, acceso, hilo, texto, usuario) {
  const ventana = ventanaMensajes(hilo.ultimo_usuario_at, Date.now(), hilo.red);
  if (!ventana.abierta) throw new ErrorBandeja(ventana.motivo);
  const { cuenta, token } = await cuentaDeFila(env, acceso, hilo);
  const pagina = paginaDe(cuenta);
  if (!pagina) throw new ErrorBandeja("Este Instagram no tiene su página de Facebook: vuelve a actualizar las cuentas de Meta.");
  const r = await graph(env, token, `/${pagina}/messages`, {
    metodo: "POST",
    params: {
      recipient: JSON.stringify({ id: hilo.usuario_id }),
      messaging_type: "RESPONSE",
      message: JSON.stringify({ text: texto }),
    },
  });
  const marca = ahora();
  const externo = String(r?.message_id ?? `local-${crypto.randomUUID()}`);
  const mensaje = {
    id: idDe(acceso.ownerId, hilo.red, externo),
    client_id: hilo.client_id, hilo_id: hilo.id, red: hilo.red, externo_id: externo,
    propio: 1, texto, adjuntos: "[]", enviado_at: marca, enviado_por: usuario.id, created_at: marca, updated_at: marca,
  };
  await acceso.guardar("bandeja_mensajes", mensaje);
  await acceso.actualizar("bandeja_hilos", { id: hilo.id }, {
    ultimo_texto: texto.slice(0, 300), ultimo_at: marca, atendido: 1, sin_leer: 0, updated_at: marca,
  });
  return mensaje;
}

