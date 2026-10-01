// ============================================================
// La bandeja: comentarios y mensajes de Facebook e Instagram
//
//   GET/POST /api/webhooks/meta              Lo que manda Meta — SIN sesión
//
//   GET  /api/bandeja                        Qué hay: Meta, permisos, interruptores
//   GET  /api/bandeja/pendientes             Los números de la navegación
//   GET  /api/bandeja/comentarios            Los comentarios (clientes encendidos)
//   GET  /api/bandeja/mensajes               Los hilos privados
//   GET  /api/bandeja/hilos/:id              Un hilo con sus mensajes
//   PUT  /api/bandeja/clientes/:cliente      El interruptor { activa }
//   POST /api/bandeja/clientes/:cliente/actualizar   Leer lo último de Meta
//   POST /api/bandeja/comentarios/:id/responder      { texto }
//   POST /api/bandeja/comentarios/:id/ocultar        { oculto }
//   POST /api/bandeja/comentarios/:id/atendido       { atendido }
//   DELETE /api/bandeja/comentarios/:id              Borrar en la red
//   POST /api/bandeja/hilos/:id/responder            { texto } (ventana de 24 h)
//   POST /api/bandeja/hilos/:id/atendido             { atendido }
//
// EL WEBHOOK NO TIENE SESIÓN, y por eso va antes de ella en index.js. Lo
// único que dice que un aviso es de Meta es la firma del cuerpo crudo con
// META_APP_SECRET; sin firma, con otra, o con el cuerpo tocado, 403 y no se
// lee nada. De quién es lo que llega lo decide la CUENTA (worker/lib/
// bandeja/almacen.js), nunca algo que venga en el aviso.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { ahora } from "../lib/ids.js";
import { metaConfigurado, mensajeMeta, ErrorMeta } from "../lib/meta.js";
import { firmaValida, retoDeSuscripcion, TOPE_AVISO } from "../lib/bandeja/webhook.js";
import { procesarAviso } from "../lib/bandeja/almacen.js";
import {
  suscribir, actualizarCliente, cuentasDelCliente, responderComentario, ocultarComentario, borrarComentario,
  enviarMensaje, ErrorBandeja,
} from "../lib/bandeja/graph.js";
import { permisosQueFaltanBandeja, validarRespuesta } from "../../src/lib/bandejaVista.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

/**
 * /api/webhooks/meta — sin sesión.
 *
 * GET: la verificación de la suscripción (`hub.challenge`), con el testigo
 * META_WEBHOOK_VERIFY_TOKEN. POST: un aviso firmado.
 */
export async function rutaWebhookMeta(req, env, ctx) {
  if (req.method === "GET") {
    const reto = retoDeSuscripcion(new URL(req.url), env.META_WEBHOOK_VERIFY_TOKEN);
    if (!reto) return error("Verificación no válida", 403);
    return new Response(reto, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  if (req.method !== "POST") return error(`Método ${req.method} no permitido aquí`, 405);
  if (!env.META_APP_SECRET) return error("El webhook de Meta no está configurado", 503);

  if (Number(req.headers.get("content-length") ?? 0) > TOPE_AVISO) return error("Aviso demasiado grande", 413);
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > TOPE_AVISO) return error("Aviso demasiado grande", 413);
  if (!(await firmaValida(env.META_APP_SECRET, bytes, req.headers.get("X-Hub-Signature-256")))) {
    return error("Firma no válida", 403);
  }
  let aviso;
  try { aviso = JSON.parse(new TextDecoder().decode(bytes)); } catch { return error("El aviso no es JSON", 400); }

  // Meta quiere un 200 rápido y reintenta si no llega. Guardar va detrás de
  // la respuesta; un fallo aquí es un aviso perdido (lo repone «Actualizar»).
  const tarea = procesarAviso(env, aviso).catch((e) => console.error("webhook meta:", e));
  if (ctx?.waitUntil) ctx.waitUntil(tarea); else await tarea;
  return json({ ok: true });
}

const miniatura = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");

const comentarioPublico = (f) => ({
  id: f.id, clientId: f.client_id, cuentaId: f.cuenta_id, red: f.red, externoId: f.externo_id, padreId: f.padre_id,
  publicacion: { id: f.publicacion_id, texto: f.publicacion_texto, miniatura: miniatura(f.publicacion_miniatura), enlace: f.publicacion_enlace },
  autor: f.autor, texto: f.texto, propio: Boolean(f.propio), oculto: Boolean(f.oculto), atendido: Boolean(f.atendido),
  respondido: Boolean(f.respondido), creadoAt: f.creado_at,
});

const hiloPublico = (h) => ({
  id: h.id, clientId: h.client_id, cuentaId: h.cuenta_id, red: h.red, usuario: h.usuario, ultimoTexto: h.ultimo_texto,
  ultimoAt: h.ultimo_at, ultimoUsuarioAt: h.ultimo_usuario_at, sinLeer: Number(h.sin_leer ?? 0), atendido: Boolean(h.atendido),
});

const mensajePublico = (m) => ({
  id: m.id, propio: Boolean(m.propio), texto: m.texto, adjuntos: leerJSON(m.adjuntos, []), enviadoAt: m.enviado_at,
});

const clientePublico = (f, cuentas) => ({
  clientId: f?.client_id ?? null,
  activa: Number(f?.activa ?? 0) === 1,
  suscripcion: leerJSON(f?.suscripcion, {}),
  actualizadaAt: f?.actualizada_at ?? null,
  cuentas: cuentas.map((c) => ({ red: c.red, nombre: c.usuario ? `@${c.usuario}` : c.nombre })),
});

/** Los clientes con la bandeja encendida (de los que ve esta sesión). */
async function activos(acceso) {
  return new Set((await acceso.leer("bandeja_clientes", { activa: 1 })).map((f) => f.client_id));
}

export async function rutasBandeja(req, env, { acceso, usuario, partes, metodo }) {
  const [, grupo, id, accion] = partes;
  const url = new URL(req.url);
  const avisar = (clientId) => difundir(env, acceso.ownerId, { tipo: "bandeja", clientes: clientId ? [clientId] : [], por: firma(usuario, req) });

  try {
    if (!grupo && metodo === "GET") {
      const [filas, cuentas, meta] = await Promise.all([
        acceso.leer("bandeja_clientes"),
        acceso.leer("cuentas_sociales", {}, "red asc, nombre asc"),
        metaConfigurado(env) ? acceso.leerUno("integracion_meta", { id: acceso.ownerId }) : null,
      ]);
      const permisos = meta?.permisos ? leerJSON(meta.permisos, null) : null;
      const deMeta = cuentas.filter((c) => c.client_id && (c.red === "instagram" || c.red === "facebook"));
      const clientes = [...new Set(deMeta.map((c) => c.client_id))].map((cid) =>
        clientePublico(filas.find((f) => f.client_id === cid) ?? { client_id: cid }, deMeta.filter((c) => c.client_id === cid)));
      return json({
        meta: {
          configurado: metaConfigurado(env),
          conectado: Boolean(meta),
          webhook: Boolean(env.META_WEBHOOK_VERIFY_TOKEN),
          // Con «Inicio de sesión para empresas» hace falta la configuración de la bandeja.
          puedePedirPermisos: metaConfigurado(env) && (!env.META_CONFIG_ID || Boolean(env.META_CONFIG_ID_BANDEJA)),
          permisos,
          faltan: permisosQueFaltanBandeja(permisos),
          urlWebhook: `${url.origin}/api/webhooks/meta`,
        },
        clientes,
      });
    }

    if (grupo === "pendientes" && metodo === "GET") {
      const [encendidos, comentarios, hilos] = await Promise.all([
        activos(acceso),
        acceso.leerColumnas("bandeja_comentarios", ["id", "client_id"], { propio: 0, atendido: 0 }),
        acceso.leerColumnas("bandeja_hilos", ["id", "client_id"], { atendido: 0 }),
      ]);
      return json({
        comentarios: comentarios.filter((f) => encendidos.has(f.client_id)).length,
        mensajes: hilos.filter((f) => encendidos.has(f.client_id)).length,
      });
    }

    if (grupo === "comentarios" && !id && metodo === "GET") {
      const where = {};
      if (url.searchParams.get("cliente")) where.client_id = url.searchParams.get("cliente");
      if (["instagram", "facebook"].includes(url.searchParams.get("red"))) where.red = url.searchParams.get("red");
      const [encendidos, recientes, pendientes] = await Promise.all([
        activos(acceso),
        acceso.leer("bandeja_comentarios", where, "creado_at desc", 300),
        acceso.leer("bandeja_comentarios", { ...where, propio: 0, atendido: 0 }, "creado_at desc", 300),
      ]);
      const todas = new Map([...recientes, ...pendientes].map((f) => [f.id, f]));
      return json([...todas.values()].filter((f) => encendidos.has(f.client_id)).map(comentarioPublico)
        .sort((a, b) => String(b.creadoAt).localeCompare(String(a.creadoAt))));
    }

    if (grupo === "mensajes" && metodo === "GET") {
      const where = {};
      if (url.searchParams.get("cliente")) where.client_id = url.searchParams.get("cliente");
      if (["instagram", "facebook"].includes(url.searchParams.get("red"))) where.red = url.searchParams.get("red");
      const [encendidos, hilos] = await Promise.all([activos(acceso), acceso.leer("bandeja_hilos", where, "ultimo_at desc", 200)]);
      return json(hilos.filter((h) => encendidos.has(h.client_id)).map(hiloPublico));
    }

    // ---- El interruptor ----
    if (grupo === "clientes" && id) {
      const cliente = await acceso.leerUno("clients", { id });
      if (!cliente) return noEncontrado("Cliente");

      if (!accion && metodo === "PUT") {
        const { activa } = (await cuerpo(req)) ?? {};
        if (typeof activa !== "boolean") return error("Falta { activa: true | false }");
        const cuentas = await cuentasDelCliente(acceso, id);
        if (activa && !cuentas.length) {
          return error("Este cliente no tiene cuentas de Facebook ni de Instagram asignadas. Asígnalas en Ajustes → Integraciones.", 409);
        }
        const previa = await acceso.leerUno("bandeja_clientes", { id });
        const suscripcion = await suscribir(env, cuentas, activa);
        const fila = {
          id, client_id: id, activa: activa ? 1 : 0, suscripcion: JSON.stringify(suscripcion),
          actualizada_at: previa?.actualizada_at ?? null, activada_por: activa ? usuario.id : previa?.activada_por ?? null,
          created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
        };
        await acceso.guardar("bandeja_clientes", fila);
        avisar(id);
        return json(clientePublico(fila, cuentas));
      }

      if (accion === "actualizar" && metodo === "POST") {
        const fila = await acceso.leerUno("bandeja_clientes", { id });
        if (Number(fila?.activa) !== 1) return error("La bandeja de este cliente está apagada: enciéndela para leer sus comentarios y mensajes.", 409);
        const r = await actualizarCliente(env, acceso, id);
        avisar(id);
        return json(r);
      }
      return noEncontrado("Ruta");
    }

    // ---- Un comentario ----
    if (grupo === "comentarios" && id) {
      const fila = await acceso.leerUno("bandeja_comentarios", { id });
      if (!fila) return noEncontrado("Comentario");
      const b = metodo === "DELETE" ? {} : (await cuerpo(req)) ?? {};

      if (accion === "responder" && metodo === "POST") {
        const v = validarRespuesta(b.texto);
        if (!v.ok) return error(v.motivo);
        const respuesta = await responderComentario(env, acceso, fila, v.texto, usuario);
        avisar(fila.client_id);
        return json(comentarioPublico(respuesta), 201);
      }
      if (accion === "ocultar" && metodo === "POST") {
        await ocultarComentario(env, acceso, fila, Boolean(b.oculto));
        avisar(fila.client_id);
        return json({ ok: true, oculto: Boolean(b.oculto) });
      }
      if (accion === "atendido" && metodo === "POST") {
        await acceso.actualizar("bandeja_comentarios", { id }, {
          atendido: b.atendido === false ? 0 : 1, atendido_por: b.atendido === false ? null : usuario.id, updated_at: ahora(),
        });
        avisar(fila.client_id);
        return json({ ok: true });
      }
      if (!accion && metodo === "DELETE") {
        await borrarComentario(env, acceso, fila);
        avisar(fila.client_id);
        return json({ ok: true });
      }
      return noEncontrado("Ruta");
    }

    // ---- Un hilo privado ----
    if (grupo === "hilos" && id) {
      const hilo = await acceso.leerUno("bandeja_hilos", { id });
      if (!hilo) return noEncontrado("Conversación");

      if (!accion && metodo === "GET") {
        const mensajes = await acceso.leer("bandeja_mensajes", { hilo_id: id }, "enviado_at desc", 200);
        return json({ hilo: hiloPublico(hilo), mensajes: mensajes.reverse().map(mensajePublico) });
      }
      const b = (await cuerpo(req)) ?? {};
      if (accion === "responder" && metodo === "POST") {
        const v = validarRespuesta(b.texto);
        if (!v.ok) return error(v.motivo);
        const m = await enviarMensaje(env, acceso, hilo, v.texto, usuario);
        avisar(hilo.client_id);
        return json(mensajePublico(m), 201);
      }
      if (accion === "atendido" && metodo === "POST") {
        await acceso.actualizar("bandeja_hilos", { id }, {
          atendido: b.atendido === false ? 0 : 1, ...(b.atendido === false ? {} : { sin_leer: 0 }), updated_at: ahora(),
        });
        avisar(hilo.client_id);
        return json({ ok: true });
      }
      return noEncontrado("Ruta");
    }
  } catch (e) {
    if (e instanceof ErrorBandeja) return error(e.message, e.estado);
    if (e instanceof ErrorMeta) return error(mensajeMeta(e), 502);
    throw e;
  }

  return noEncontrado("Ruta");
}
