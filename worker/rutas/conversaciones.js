// ============================================================
// Las conversaciones del asistente: /api/chat/conversaciones
//
//   GET    /chat/conversaciones?cliente=<id>   La lista de un cliente; sin cliente, la del asistente general
//   POST   /chat/conversaciones                Empezar una { clienteId?, titulo?, tema? } (tema «diseno»: desde el Estudio)
//   PATCH  /chat/conversaciones/<id>           Cambiarle el título { titulo }
//   DELETE /chat/conversaciones/<id>           Borrarla, con sus mensajes y su resumen (cascada de D1)
//   GET    /chat/conversaciones/<id>/mensajes  Sus mensajes, en orden
//   POST   /chat/conversaciones/<id>/mensajes  Apuntar uno { role, content }
//   POST   /chat/conversaciones/<id>/titulo    La IA le pone título con el primer intercambio
//
// Las ve TODO el equipo, como antes el hilo de cada cliente: una persona de
// otro equipo puede abrir «Guiones de reels» y pedir ahí mismo. Un
// colaborador ve las de sus clientes y no las del asistente general (la capa
// de acceso no le enseña filas sin cliente y no le deja escribirlas).
//
// Cada cambio avisa al espacio (`chat:conversaciones`): la lista y la
// conversación abierta de los demás se releen.
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { difundir, firma } from "../lib/vivo.js";
import { llamarIA, ErrorIA } from "../lib/cerebro/ia.js";
import { tituloLimpio, pedidoDeTitulo, TITULO_NUEVA, MAX_TITULO } from "../../src/lib/conversaciones.js";

/** Lo más que se lista de un cliente (las más recientes). */
const MAX_LISTA = 200;
const MAX_MENSAJE = 400_000;

const deCliente = (url) => {
  const c = String(url.searchParams.get("cliente") ?? "").trim();
  return c || null;
};

const publica = (c) => ({ id: c.id, clientId: c.client_id ?? null, titulo: c.titulo || TITULO_NUEVA, tema: c.tema === "diseno" ? "diseno" : "", creadaPor: c.creada_por ?? null, created_at: c.created_at, updated_at: c.updated_at });

export async function rutasConversaciones(req, env, { acceso, usuario, partes, metodo }) {
  const url = new URL(req.url);
  const id = partes[2] ? String(partes[2]) : "";
  const sub = partes[3] ?? "";
  const avisar = (conversacion, extra = {}) => difundir(env, acceso.ownerId, {
    tipo: "chat:conversaciones", clientId: conversacion.client_id ?? null, conversacionId: conversacion.id, ...extra, por: firma(usuario, req),
  });

  // ---------- La lista ----------
  if (!id && metodo === "GET") {
    const cliente = deCliente(url);
    if (cliente && !(await acceso.leerUno("clients", { id: cliente }))) return noEncontrado("Cliente");
    // El asistente general no tiene cliente: `client_id = ?` no casa con un vacío, así que se filtra aquí.
    const filas = cliente
      ? await acceso.leer("chat_conversaciones", { client_id: cliente }, "updated_at desc", MAX_LISTA)
      : (await acceso.leer("chat_conversaciones", {}, "updated_at desc", 2000)).filter((c) => !c.client_id).slice(0, MAX_LISTA);
    return json({ conversaciones: filas.map(publica) });
  }

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const cliente = b.clienteId ? String(b.clienteId) : null;
    if (cliente && !(await acceso.leerUno("clients", { id: cliente }))) return noEncontrado("Cliente");
    const fila = {
      id: uuid(), client_id: cliente, titulo: tituloLimpio(b.titulo) || TITULO_NUEVA, creada_por: usuario?.id ?? null,
      // Las empezadas en el Estudio, con el director creativo (0047): el resto, como siempre.
      tema: b.tema === "diseno" ? "diseno" : "",
      created_at: ahora(), updated_at: ahora(),
    };
    await acceso.insertar("chat_conversaciones", fila);
    avisar(fila);
    return json({ conversacion: publica(fila) }, 201);
  }

  if (!id) return error(`Método ${metodo} no permitido aquí`, 405);
  const conversacion = await acceso.leerUno("chat_conversaciones", { id });
  if (!conversacion) return noEncontrado("Conversación");

  if (!sub && metodo === "PATCH") {
    const titulo = tituloLimpio((await cuerpo(req))?.titulo);
    if (!titulo) return error("El título está vacío.");
    await acceso.actualizar("chat_conversaciones", { id }, { titulo: titulo.slice(0, MAX_TITULO), updated_at: conversacion.updated_at });
    avisar(conversacion);
    return json({ conversacion: publica({ ...conversacion, titulo }) });
  }

  if (!sub && metodo === "DELETE") {
    // Los mensajes y el resumen cuelgan de ella con `on delete cascade`; se borran también a mano por si la base
    // no tuviera las claves ajenas encendidas (en local, alguna herramienta las apaga).
    await acceso.borrar("chat_messages", { conversacion_id: id });
    await acceso.borrar("chat_resumenes", { conversacion_id: id });
    await acceso.borrar("chat_conversaciones", { id });
    avisar(conversacion, { borrada: true });
    return sinContenido();
  }

  if (sub === "mensajes" && metodo === "GET") {
    const filas = await acceso.leer("chat_messages", { conversacion_id: id }, "created_at asc");
    return json({ mensajes: filas.map((f) => ({ role: f.role, content: f.content, created_at: f.created_at })) });
  }

  if (sub === "mensajes" && metodo === "POST") {
    const { role, content } = (await cuerpo(req)) ?? {};
    if (role !== "user" && role !== "assistant") return error("Rol inválido");
    if (!content || typeof content !== "string") return error("Falta el contenido");
    if (content.length > MAX_MENSAJE) return error("El mensaje es demasiado largo.", 413);
    const cuando = ahora();
    await acceso.insertar("chat_messages", {
      id: uuid(), client_id: conversacion.client_id ?? null, conversacion_id: id, role, content, created_at: cuando,
    });
    // La lista va por la última vez que se habló.
    await acceso.actualizar("chat_conversaciones", { id }, { updated_at: cuando });
    avisar(conversacion, { mensaje: true });
    return json({ ok: true, created_at: cuando }, 201);
  }

  if (sub === "titulo" && metodo === "POST") {
    const mensajes = await acceso.leer("chat_messages", { conversacion_id: id }, "created_at asc", 4);
    const pregunta = mensajes.find((m) => m.role === "user")?.content ?? "";
    if (!pregunta) return error("La conversación aún no tiene nada que titular.");
    const respuesta = mensajes.find((m) => m.role === "assistant")?.content ?? "";
    const cliente = conversacion.client_id ? await acceso.leerUno("clients", { id: conversacion.client_id }) : null;
    try {
      const r = await llamarIA(env, acceso, cliente, {
        prompt: pedidoDeTitulo({ pregunta, respuesta, cliente: cliente?.name ?? "" }),
        salida: 60,
        funcion: "título de conversación",
      });
      const titulo = tituloLimpio(r.texto);
      if (!titulo) return error("La IA no devolvió un título.", 502);
      await acceso.actualizar("chat_conversaciones", { id }, { titulo, updated_at: conversacion.updated_at });
      avisar(conversacion);
      return json({ conversacion: publica({ ...conversacion, titulo }) });
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado, e.cause);
      throw e;
    }
  }

  return error(`Método ${metodo} no permitido aquí`, 405);
}
