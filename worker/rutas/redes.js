// ============================================================
// Redes sociales: conectar, asignar cuentas y publicar
//
//   /api/redes/estado             Qué hay conectado y qué cuentas
//   /api/redes/meta/conectar      Al consentimiento de Facebook (admin)
//   /api/redes/meta/callback      La vuelta — SIN sesión, ver abajo
//   /api/redes/meta/sincronizar   Releer páginas e Instagram (admin)
//   /api/redes/meta/desconectar   Quitar la conexión (admin)
//   /api/redes/cuentas/:id        Asignar una cuenta a un cliente
//   /api/publicar                 La cola: listar, programar, cancelar, reintentar
//   /api/medio-publico/:t/:nombre Lo que Meta descarga — SIN sesión, firmado
//
// LA VUELTA DEL OAUTH VA SIN SESIÓN, igual que la de Drive: la identidad
// viaja en el `state` firmado y atado a la cookie `__Host-meta-oauth` de
// la pestaña que lo pidió. Sin la cookie, un enlace de conexión reenviado
// conectaría la cuenta de Facebook de otra persona al espacio de quien lo
// generó.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { crearAcceso } from "../lib/acceso.js";
import { difundir, firma } from "../lib/vivo.js";
import { ahora, testigo } from "../lib/ids.js";
import {
  COOKIE_META, metaConfigurado, urlVueltaMeta, firmarEstadoMeta, leerEstadoMeta, urlConsentimientoMeta,
  canjearCodigoMeta, cifrarMeta, descifrarMeta, graph, sincronizarCuentasMeta, mensajeMeta, claveDeMedioPublico,
} from "../lib/meta.js";
import { aprobadasDelEspacio } from "../../src/lib/aprobacion.js";
import { programar, programarLote, procesarPublicacion, filaPublica, filaConResumen, ErrorPublicar } from "../lib/publicador.js";
import {
  COOKIE_TIKTOK, tiktokConfigurado, urlVueltaTikTok, firmarEstadoTikTok, leerEstadoTikTok, firmarEnlaceTikTok, leerEnlaceTikTok,
  urlConsentimientoTikTok, canjearCodigoTikTok, revocarTikTok, filaDeTokens, tokenTikTok, usuarioTikTok, mensajeTikTok,
} from "../lib/tiktok.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

const cuentaPublica = (c) => ({
  id: c.id, red: c.red, externoId: c.externo_id, nombre: c.nombre, usuario: c.usuario,
  avatar: c.avatar, paginaId: c.pagina_id, clientId: c.client_id, actualizada: c.updated_at,
  ...(c.red === "tiktok" ? { modo: leerJSON(c.datos, {})?.modo === "directo" ? "directo" : "borrador" } : {}),
});

/** La redirección a TikTok, con la cookie que ata la vuelta a ESTE navegador. */
async function aTikTok(env, origen, datos) {
  const nonce = testigo(16);
  const state = await firmarEstadoTikTok(env, { ...datos, nonce });
  return new Response(null, {
    status: 302,
    headers: {
      Location: urlConsentimientoTikTok(env, origen, state),
      "Set-Cookie": `${COOKIE_TIKTOK}=${nonce}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Sin sesión:
 *   GET /api/redes/tiktok/inicio/<enlace firmado>  el enlace que se le manda al cliente
 *   GET /api/redes/tiktok/callback                 la vuelta de TikTok
 */
export async function rutaTikTokPublica(req, env, partes) {
  const url = new URL(req.url);
  const volver = (resultado, motivo = "", publico = false) => {
    const destino = new URL(publico ? (resultado === "ok" ? "/tiktok-conectado.html" : "/tiktok-error.html") : "/ajustes", url.origin);
    destino.searchParams.set("tiktok", resultado);
    if (motivo) destino.searchParams.set("motivo", motivo.slice(0, 200));
    if (!publico) destino.hash = "integraciones";
    return new Response(null, {
      status: 302,
      headers: {
        Location: destino.toString(),
        "Set-Cookie": `${COOKIE_TIKTOK}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  };
  if (!tiktokConfigurado(env)) return volver("error", "Falta configurar TikTok en el servidor.");

  if (partes[2] === "inicio") {
    const enlace = await leerEnlaceTikTok(env, partes[3] ?? "");
    if (!enlace) return volver("error", "Este enlace caducó. Pide uno nuevo a la agencia.", true);
    return aTikTok(env, url.origin, { ownerId: enlace.ownerId, clientId: enlace.clientId, publico: true });
  }

  const estado = await leerEstadoTikTok(env, url.searchParams.get("state"));
  const publico = Boolean(estado?.publico);
  if (url.searchParams.get("error")) {
    return volver("error", url.searchParams.get("error") === "access_denied" ? "Se canceló el permiso en TikTok." : url.searchParams.get("error_description") || "TikTok no dio permiso.", publico);
  }
  const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_TIKTOK}=([^;]+)`).exec(req.headers.get("Cookie") ?? "")?.[1];
  if (!estado || !cookie || cookie !== estado.nonce) {
    return volver("error", "El enlace de conexión caducó o no salió de este navegador. Vuelve a empezar.", publico);
  }

  const acceso = crearAcceso(env.DB, estado.ownerId);
  const cliente = await acceso.leerUno("clients", { id: estado.clientId });
  if (!cliente) return volver("error", "Ese cliente ya no existe.", publico);
  try {
    const tokens = await canjearCodigoTikTok(env, url.origin, url.searchParams.get("code") ?? "");
    const filaTokens = await filaDeTokens(env, tokens);
    const u = await usuarioTikTok(tokens.access_token);
    const id = `${estado.ownerId}:tiktok:${tokens.open_id}`;
    const previa = await acceso.leerUno("cuentas_sociales", { id });
    // Una cuenta de TikTok por cliente: la que ocupaba el sitio queda libre.
    for (const o of await acceso.leer("cuentas_sociales", { client_id: cliente.id, red: "tiktok" })) {
      if (o.id !== id) await acceso.actualizar("cuentas_sociales", { id: o.id }, { client_id: null, updated_at: ahora() });
    }
    await acceso.guardar("cuentas_sociales", {
      id, red: "tiktok", externo_id: tokens.open_id, nombre: u.display_name ?? "", usuario: u.username ?? "",
      avatar: u.avatar_url ?? "", pagina_id: null, ...filaTokens, client_id: cliente.id,
      datos: previa?.datos ?? "{}", created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
    });
  } catch (e) {
    return volver("error", mensajeTikTok(e), publico);
  }
  difundir(env, estado.ownerId, { tipo: "ajustes", por: { userId: estado.userId ?? "cliente", nombre: "TikTok", color: "#FE2C55" } });
  return volver("ok", "", publico);
}

// ------------------------------------------------------------
// Sin sesión
// ------------------------------------------------------------

/** GET /api/redes/meta/callback */
export async function rutaMetaCallback(req, env) {
  const url = new URL(req.url);
  const volver = (resultado, motivo = "") => {
    const destino = new URL("/ajustes", url.origin);
    destino.searchParams.set("meta", resultado);
    if (motivo) destino.searchParams.set("motivo", motivo.slice(0, 200));
    destino.hash = "integraciones";
    return new Response(null, {
      status: 302,
      headers: {
        Location: destino.toString(),
        "Set-Cookie": `${COOKIE_META}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  };

  if (!metaConfigurado(env)) return volver("error", "Falta configurar Meta en el servidor.");
  if (url.searchParams.get("error")) {
    return volver("error", url.searchParams.get("error_reason") === "user_denied" ? "Cancelaste el permiso en Facebook." : url.searchParams.get("error_description") || "Facebook no dio permiso.");
  }

  const estado = await leerEstadoMeta(env, url.searchParams.get("state"));
  const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_META}=([^;]+)`).exec(req.headers.get("Cookie") ?? "")?.[1];
  if (!estado || !cookie || cookie !== estado.nonce) {
    return volver("error", "El enlace de conexión caducó o no salió de esta pestaña. Vuelve a pulsar «Conectar».");
  }

  const acceso = crearAcceso(env.DB, estado.ownerId);
  let total;
  try {
    const { token, expira } = await canjearCodigoMeta(env, req, url.searchParams.get("code") ?? "");
    const yo = await graph(env, token, "/me", { params: { fields: "id,name" } });
    const previa = await acceso.leerUno("integracion_meta", { id: estado.ownerId });
    await acceso.guardar("integracion_meta", {
      id: estado.ownerId,
      usuario_meta: yo.id ?? "",
      nombre: yo.name ?? "",
      token_cifrado: await cifrarMeta(env, token),
      expira,
      // La cola publica sin una petición delante: necesita saber en qué
      // dirección están los medios que Meta tiene que descargar.
      origen: url.origin,
      conectado_por: estado.userId ?? null,
      created_at: previa?.created_at ?? ahora(),
      updated_at: ahora(),
    });
    total = await sincronizarCuentasMeta(env, acceso, token);
  } catch (e) {
    return volver("error", mensajeMeta(e));
  }
  difundir(env, estado.ownerId, { tipo: "ajustes", por: { userId: estado.userId, nombre: "Meta", color: "#1877F2" } });
  return volver("ok", total ? "" : "Conectado, pero no llegó ninguna página. Revisa que tu usuario administre las páginas de los clientes.");
}

/**
 * GET /api/medio-publico/<testigo>/<nombre>
 *
 * Lo que Meta descarga al publicar. Sólo abre el archivo que dice el
 * testigo firmado, y sólo tres días. Nada se ejecuta en este origen:
 * imagen o video, con `nosniff` y `sandbox`.
 */
export async function rutaMedioPublico(env, partes) {
  const clave = await claveDeMedioPublico(env, partes[1] ?? "");
  if (!clave) return noEncontrado("Archivo");
  const objeto = await env.MEDIA.get(clave);
  if (!objeto) return noEncontrado("Archivo");
  const tipo = objeto.httpMetadata?.contentType ?? "";
  if (!/^(image\/(jpeg|png|webp|gif)|video\/)/.test(tipo)) return noEncontrado("Archivo");
  return new Response(objeto.body, {
    headers: {
      "Content-Type": tipo,
      "Content-Length": String(objeto.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      etag: objeto.httpEtag,
    },
  });
}

// ------------------------------------------------------------
// Con sesión
// ------------------------------------------------------------

export async function rutasRedes(req, env, { acceso, usuario, partes, metodo }) {
  const [, grupo, accion] = partes;
  const esAdmin = usuario?.rol === "admin";

  if (grupo === "estado" && metodo === "GET") {
    const fila = metaConfigurado(env) ? await acceso.leerUno("integracion_meta", { id: acceso.ownerId }) : null;
    const cuentas = await acceso.leer("cuentas_sociales", {}, "red asc, nombre asc");
    return json({
      meta: {
        configurado: metaConfigurado(env),
        conectado: Boolean(fila),
        nombre: fila?.nombre ?? "",
        expira: fila?.expira ?? null,
        desde: fila?.updated_at ?? null,
        redireccion: urlVueltaMeta(req),
      },
      tiktok: { configurado: tiktokConfigurado(env), redireccion: urlVueltaTikTok(new URL(req.url).origin) },
      cuentas: cuentas.map(cuentaPublica),
    });
  }

  if (grupo === "meta" && accion === "conectar" && metodo === "GET") {
    if (!esAdmin) return error("Sólo el administrador conecta Meta", 403);
    if (!metaConfigurado(env)) return error("Falta configurar META_APP_ID y META_APP_SECRET en el Worker", 503);
    const nonce = testigo(16);
    const state = await firmarEstadoMeta(env, { ownerId: acceso.ownerId, userId: usuario.id, nonce });
    return new Response(null, {
      status: 302,
      headers: {
        Location: urlConsentimientoMeta(env, req, state),
        "Set-Cookie": `${COOKIE_META}=${nonce}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (grupo === "meta" && accion === "sincronizar" && metodo === "POST") {
    if (!esAdmin) return error("Sólo el administrador actualiza las cuentas de Meta", 403);
    const fila = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
    if (!fila) return error("Meta no está conectado", 409);
    try {
      const total = await sincronizarCuentasMeta(env, acceso, await descifrarMeta(env, fila.token_cifrado));
      await acceso.actualizar("integracion_meta", { id: acceso.ownerId }, { origen: new URL(req.url).origin, updated_at: ahora() });
      difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
      return json({ ok: true, total });
    } catch (e) {
      return error(mensajeMeta(e), 502);
    }
  }

  if (grupo === "meta" && accion === "desconectar" && metodo === "POST") {
    if (!esAdmin) return error("Sólo el administrador desconecta Meta", 403);
    const fila = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
    if (fila) {
      try {
        await graph(env, await descifrarMeta(env, fila.token_cifrado), "/me/permissions", { metodo: "DELETE" });
      } catch { /* se borra igual */ }
      await acceso.borrar("integracion_meta", { id: acceso.ownerId });
    }
    await acceso.borrar("cuentas_sociales", { red: "instagram" });
    await acceso.borrar("cuentas_sociales", { red: "facebook" });
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json({ ok: true });
  }

  // ---- TikTok: una conexión por cliente ----
  if (grupo === "tiktok" && accion === "conectar" && metodo === "GET") {
    if (!tiktokConfigurado(env)) return error("Falta configurar TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en el Worker", 503);
    const clientId = new URL(req.url).searchParams.get("cliente");
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    return aTikTok(env, new URL(req.url).origin, { ownerId: acceso.ownerId, userId: usuario.id, clientId });
  }

  // El enlace para que el CLIENTE conecte su cuenta desde su teléfono.
  if (grupo === "tiktok" && accion === "enlace" && metodo === "POST") {
    if (!tiktokConfigurado(env)) return error("Falta configurar TikTok en el Worker", 503);
    const { clientId } = (await cuerpo(req)) ?? {};
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    const t = await firmarEnlaceTikTok(env, { ownerId: acceso.ownerId, clientId });
    return json({ url: `${new URL(req.url).origin}/api/redes/tiktok/inicio/${t}` });
  }

  if (grupo === "tiktok" && accion === "desconectar" && metodo === "POST") {
    const { cuentaId } = (await cuerpo(req)) ?? {};
    const cuenta = await acceso.leerUno("cuentas_sociales", { id: cuentaId, red: "tiktok" });
    if (!cuenta) return noEncontrado("Cuenta");
    try { await revocarTikTok(env, await tokenTikTok(env, acceso, cuenta)); } catch { /* se borra igual */ }
    await acceso.borrar("cuentas_sociales", { id: cuenta.id });
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json({ ok: true });
  }

  // Asignar una cuenta a un cliente (o dejarla sin cliente con null), y
  // en TikTok, el modo: borrador o directo.
  if (grupo === "cuentas" && accion && metodo === "PUT") {
    const cuenta = await acceso.leerUno("cuentas_sociales", { id: accion });
    if (!cuenta) return noEncontrado("Cuenta");
    const b = (await cuerpo(req)) ?? {};
    if (b.modo !== undefined) {
      if (cuenta.red !== "tiktok" || !["borrador", "directo"].includes(b.modo)) return error("Modo no válido");
      const datos = { ...leerJSON(cuenta.datos, {}), modo: b.modo };
      await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { datos: JSON.stringify(datos), updated_at: ahora() });
      difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
      return json(cuentaPublica({ ...cuenta, datos: JSON.stringify(datos) }));
    }
    const { clientId } = b;
    if (clientId && !(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    // Una red, una cuenta por cliente: la que ocupaba el sitio queda libre.
    if (clientId) {
      const otras = await acceso.leer("cuentas_sociales", { client_id: clientId, red: cuenta.red });
      for (const o of otras) if (o.id !== cuenta.id) await acceso.actualizar("cuentas_sociales", { id: o.id }, { client_id: null, updated_at: ahora() });
    }
    await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { client_id: clientId || null, updated_at: ahora() });
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json(cuentaPublica({ ...cuenta, client_id: clientId || null }));
  }

  return noEncontrado("Ruta");
}

/**
 * /api/publicar
 *
 *   GET  ?calendario=:id       La cola de un calendario (o ?cliente=:id)
 *   POST { calendarId, postId, redes, ahora }
 *   GET  ?todo=1&dias=14       Todo el espacio (la página Programación)
 *   POST /lote { calendarId, postIds }  Programar varias (lo aprobado)
 *   DELETE /:id                Cancelar lo que aún no salió
 *   POST /:id/reintentar       Volver a intentar una que falló
 */
export async function rutasPublicar(req, env, { acceso, usuario, partes, metodo, ctx }) {
  const [, id, sub] = partes;
  const url = new URL(req.url);

  if (!id && metodo === "GET") {
    const calendario = url.searchParams.get("calendario");
    const cliente = url.searchParams.get("cliente");
    // La página Programación: todo el espacio. Lo pendiente y lo que
    // falló, entero; lo que ya salió, sólo lo de los últimos días.
    // El aviso de la cabecera sólo quiere lo que falló: una lectura corta,
    // que se repite con cada cambio del equipo.
    if (url.searchParams.get("fallidas")) {
      const filas = await acceso.leer("publicaciones_programadas", { estado: "error" }, "programada_para desc");
      return json(filas.map(filaConResumen));
    }
    if (url.searchParams.get("todo")) {
      const dias = Math.min(60, Math.max(1, Number(url.searchParams.get("dias")) || 14));
      const desde = new Date(Date.now() - dias * 86_400_000).toJSON();
      const filas = await acceso.leer("publicaciones_programadas", {}, "programada_para asc");
      return json(filas
        .filter((f) => f.estado !== "cancelada" && (f.estado !== "publicada" || (f.publicada_at ?? f.programada_para) >= desde))
        .map(filaConResumen));
    }
    if (!calendario && !cliente) return error("Falta el calendario o el cliente");
    const filas = await acceso.leer(
      "publicaciones_programadas",
      calendario ? { calendar_id: calendario } : { client_id: cliente },
      "programada_para asc",
    );
    return json(filas.filter((f) => f.estado !== "cancelada").map(filaPublica));
  }

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!b.calendarId || !b.postId) return error("Falta la publicación");
    // Publicar AL MOMENTO en la cuenta del cliente no tiene vuelta atrás:
    // es de quien administra (docs/propuesta-equipo.md, papeles).
    if (b.ahora && usuario.rol !== "admin") return error("Sólo quien administra puede publicar al momento. Prográmala y sale a su hora.", 403);
    try {
      const filas = await programar(env, acceso, {
        calendarId: String(b.calendarId), postId: String(b.postId),
        redes: Array.isArray(b.redes) ? b.redes.map(String) : null,
        ahoraMismo: Boolean(b.ahora), usuarioId: usuario.id,
      });
      // «Publicar ahora» no espera al cron: arranca en esta misma
      // invocación, después de responder.
      if (b.ahora) {
        const tarea = Promise.all(filas.map((f) => procesarPublicacion(env, { id: f.id, owner_id: acceso.ownerId })));
        if (ctx?.waitUntil) ctx.waitUntil(tarea); else await tarea;
      }
      difundir(env, acceso.ownerId, { tipo: "publicacion", calId: b.calendarId, postId: b.postId, por: firma(usuario, req) });
      return json(filas.map(filaPublica), 201);
    } catch (e) {
      if (e instanceof ErrorPublicar) return error(e.message, 422);
      throw e;
    }
  }

  // Lo aprobado de TODO el espacio que espera a la agencia: la pieza
  // aprobada «por programar» (el paso final) y la idea «por producir».
  if (id === "aprobadas" && !sub && metodo === "GET") {
    const [calendarios, aprobaciones, filas, clientes] = await Promise.all([
      acceso.leer("calendars"),
      acceso.leer("approvals"),
      acceso.leer("publicaciones_programadas"),
      acceso.leer("clients"),
    ]);
    return json(aprobadasDelEspacio({
      calendarios, aprobaciones, filas,
      clientes: Object.fromEntries(clientes.map((c) => [c.id, c.name])),
    }));
  }

  // «Programar todo lo aprobado»: varias publicaciones de un calendario.
  if (id === "lote" && !sub && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!b.calendarId || !Array.isArray(b.postIds) || !b.postIds.length) return error("Faltan las publicaciones");
    try {
      const { nuevas, fallidas } = await programarLote(env, acceso, {
        calendarId: String(b.calendarId), postIds: b.postIds, usuarioId: usuario.id,
      });
      if (nuevas.length) difundir(env, acceso.ownerId, { tipo: "publicacion", calId: b.calendarId, por: firma(usuario, req) });
      return json({ programadas: nuevas.map(filaPublica), fallidas });
    } catch (e) {
      if (e instanceof ErrorPublicar) return error(e.message, 422);
      throw e;
    }
  }

  if (!id) return noEncontrado("Ruta");
  const fila = await acceso.leerUno("publicaciones_programadas", { id });
  if (!fila) return noEncontrado("Publicación programada");

  if (!sub && metodo === "DELETE") {
    if (fila.externo_id || fila.estado === "publicada") return error("Ya se publicó: bórrala desde la red si hace falta.", 409);
    const n = await acceso.actualizar("publicaciones_programadas", { id, updated_at: fila.updated_at }, {
      estado: "cancelada", siguiente_intento: null, updated_at: ahora(),
    });
    if (!n) return error("Se está publicando en este momento. Prueba en unos segundos.", 409);
    difundir(env, acceso.ownerId, { tipo: "publicacion", calId: fila.calendar_id, postId: fila.post_id, por: firma(usuario, req) });
    return json({ ok: true });
  }

  if (sub === "reintentar" && metodo === "POST") {
    if (fila.estado !== "error") return error("Sólo se reintenta una publicación que falló.", 409);
    await acceso.actualizar("publicaciones_programadas", { id }, {
      estado: "programada", intentos: 0, error: null, siguiente_intento: null, contenedor_id: null,
      programada_para: ahora(), updated_at: ahora(),
    });
    const tarea = procesarPublicacion(env, { id, owner_id: acceso.ownerId });
    if (ctx?.waitUntil) ctx.waitUntil(tarea); else await tarea;
    difundir(env, acceso.ownerId, { tipo: "publicacion", calId: fila.calendar_id, postId: fila.post_id, por: firma(usuario, req) });
    return json({ ok: true });
  }

  return noEncontrado("Ruta");
}
