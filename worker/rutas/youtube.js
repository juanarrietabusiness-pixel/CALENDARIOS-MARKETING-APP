// ============================================================
// YouTube: conectar el canal de cada cliente
//
//   Sin sesión (la identidad va firmada):
//     GET  /api/redes/youtube/inicio/<enlace>  el enlace que se le manda al cliente
//     GET  /api/redes/youtube/callback         la vuelta de Google
//   Con sesión:
//     GET  /api/redes/youtube/conectar?cliente=:id   a Google, desde esta pestaña
//     POST /api/redes/youtube/enlace      { clientId }             el enlace del cliente
//     POST /api/redes/youtube/elegir      { cuentaId }             el canal, si llegaron varios
//     PUT  /api/redes/youtube/privacidad  { cuentaId, privacidad } público, oculto o privado
//     POST /api/redes/youtube/desconectar { cuentaId }
//
// LA VUELTA VA SIN SESIÓN, igual que Drive y Meta: el `state` va
// firmado con GOOGLE_CLIENT_SECRET y atado a la cookie `__Host-youtube-oauth`
// del navegador que lo pidió. Sin la cookie, un enlace de conexión
// reenviado conectaría el canal de otra persona al cliente de quien lo generó.
// Lo que va en `cuentas_sociales` es lo de siempre: el token de acceso y el
// de renovación CIFRADOS (firmas.js), y en `datos` la privacidad.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { crearAcceso } from "../lib/acceso.js";
import { difundir, firma } from "../lib/vivo.js";
import { ahora, testigo } from "../lib/ids.js";
import {
  COOKIE_YOUTUBE, youtubeConfigurado, firmarEstadoYouTube, leerEstadoYouTube, firmarEnlaceYouTube, leerEnlaceYouTube,
  urlConsentimientoYouTube, canjearCodigoYouTube, filaDeTokensYouTube, canalesYouTube, mensajeYouTube, revocarYouTube,
  descifrarYouTube, PRIVACIDADES_YOUTUBE, extraCuentaYouTube, ErrorYouTube,
} from "../lib/youtube.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const FIRMA_YOUTUBE = { nombre: "YouTube", color: "#FF0000" };

/** La redirección a Google, con la cookie que ata la vuelta a ESTE navegador. */
async function aGoogle(env, origen, datos) {
  const nonce = testigo(16);
  const state = await firmarEstadoYouTube(env, { ...datos, nonce });
  return new Response(null, {
    status: 302,
    headers: {
      Location: urlConsentimientoYouTube(env, origen, state),
      "Set-Cookie": `${COOKIE_YOUTUBE}=${nonce}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Guarda los canales que llegaron. Uno: queda asignado al cliente (y el
 * que ocupaba su sitio, libre). Varios: todos sin cliente, marcados con
 * `elegirPara`, y la agencia elige en Ajustes. Comparten el permiso
 * (`datos.permiso`): desconectar uno no revoca el de los otros.
 */
async function guardarCanales(env, acceso, cliente, tokens, canales) {
  const filaTokens = await filaDeTokensYouTube(env, tokens);
  const permiso = testigo(8);
  const varios = canales.length > 1;
  if (!varios) {
    for (const o of await acceso.leer("cuentas_sociales", { client_id: cliente.id, red: "youtube" })) {
      await acceso.actualizar("cuentas_sociales", { id: o.id }, { client_id: null, updated_at: ahora() });
    }
  }
  for (const c of canales) {
    const id = `${acceso.ownerId}:youtube:${c.id}`;
    const previa = await acceso.leerUno("cuentas_sociales", { id });
    const datos = { ...leerJSON(previa?.datos, {}), permiso };
    if (varios) datos.elegirPara = cliente.id; else delete datos.elegirPara;
    await acceso.guardar("cuentas_sociales", {
      id, red: "youtube", externo_id: c.id, nombre: c.snippet?.title ?? "",
      usuario: String(c.snippet?.customUrl ?? "").replace(/^@/, ""),
      avatar: c.snippet?.thumbnails?.default?.url ?? "", pagina_id: null, ...filaTokens,
      client_id: varios ? previa?.client_id ?? null : cliente.id,
      datos: JSON.stringify(datos), created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
    });
  }
  return varios;
}

/** Sin sesión: el enlace del cliente y la vuelta de Google. */
export async function rutaYouTubePublica(req, env, partes) {
  const url = new URL(req.url);
  const volver = (resultado, motivo = "", publico = false) => {
    const destino = new URL(publico ? (resultado === "error" ? "/youtube-error.html" : "/youtube-conectado.html") : "/ajustes", url.origin);
    destino.searchParams.set("youtube", resultado);
    if (motivo) destino.searchParams.set("motivo", motivo.slice(0, 200));
    if (!publico) destino.hash = "integraciones";
    return new Response(null, {
      status: 302,
      headers: {
        Location: destino.toString(),
        "Set-Cookie": `${COOKIE_YOUTUBE}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    });
  };
  if (!youtubeConfigurado(env)) return volver("error", "Falta configurar Google en el servidor.");

  if (partes[2] === "inicio") {
    const enlace = await leerEnlaceYouTube(env, partes[3] ?? "");
    if (!enlace) return volver("error", "Este enlace caducó. Pide uno nuevo a la agencia.", true);
    return aGoogle(env, url.origin, { ownerId: enlace.ownerId, clientId: enlace.clientId, publico: true });
  }

  const estado = await leerEstadoYouTube(env, url.searchParams.get("state"));
  const publico = Boolean(estado?.publico);
  if (url.searchParams.get("error")) {
    return volver("error", url.searchParams.get("error") === "access_denied" ? "Se canceló el permiso en Google." : url.searchParams.get("error_description") || "Google no dio permiso.", publico);
  }
  const cookie = new RegExp(`(?:^|;\\s*)${COOKIE_YOUTUBE}=([^;]+)`).exec(req.headers.get("Cookie") ?? "")?.[1];
  if (!estado || !cookie || cookie !== estado.nonce) {
    return volver("error", "El enlace de conexión caducó o no salió de este navegador. Vuelve a empezar.", publico);
  }

  const acceso = crearAcceso(env.DB, estado.ownerId);
  const cliente = await acceso.leerUno("clients", { id: estado.clientId });
  if (!cliente) return volver("error", "Ese cliente ya no existe.", publico);
  let varios;
  try {
    const tokens = await canjearCodigoYouTube(env, url.origin, url.searchParams.get("code") ?? "");
    const canales = await canalesYouTube(tokens.access_token);
    if (!canales.length) return volver("error", mensajeYouTube(new ErrorYouTube({ razon: "youtubeSignupRequired" })), publico);
    varios = await guardarCanales(env, acceso, cliente, tokens, canales);
  } catch (e) {
    return volver("error", mensajeYouTube(e), publico);
  }
  difundir(env, estado.ownerId, { tipo: "ajustes", por: { userId: estado.userId ?? "cliente", ...FIRMA_YOUTUBE } });
  return volver(varios ? "elegir" : "ok", "", publico);
}

/** Con sesión: /api/redes/youtube/… */
export async function rutasYouTube(req, env, { acceso, usuario, partes, metodo }) {
  const accion = partes[2];
  const url = new URL(req.url);
  const avisar = () => difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
  const cuentaDe = async (id) => acceso.leerUno("cuentas_sociales", { id: String(id ?? ""), red: "youtube" });

  if (accion === "conectar" && metodo === "GET") {
    if (!youtubeConfigurado(env)) return error("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el Worker", 503);
    const clientId = url.searchParams.get("cliente");
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    return aGoogle(env, url.origin, { ownerId: acceso.ownerId, userId: usuario.id, clientId });
  }

  // El enlace para que el CLIENTE conecte su canal desde su teléfono.
  if (accion === "enlace" && metodo === "POST") {
    if (!youtubeConfigurado(env)) return error("Falta configurar Google en el Worker", 503);
    const { clientId } = (await cuerpo(req)) ?? {};
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    const t = await firmarEnlaceYouTube(env, { ownerId: acceso.ownerId, clientId });
    return json({ url: `${url.origin}/api/redes/youtube/inicio/${t}` });
  }

  // Llegaron varios canales: éste es el del cliente; los demás se sueltan.
  if (accion === "elegir" && metodo === "POST") {
    const { cuentaId } = (await cuerpo(req)) ?? {};
    const cuenta = await cuentaDe(cuentaId);
    const para = leerJSON(cuenta?.datos, {})?.elegirPara;
    if (!cuenta || !para) return noEncontrado("Canal por elegir");
    if (!(await acceso.leerUno("clients", { id: para }))) return noEncontrado("Cliente");
    for (const o of await acceso.leer("cuentas_sociales", { client_id: para, red: "youtube" })) {
      if (o.id !== cuenta.id) await acceso.actualizar("cuentas_sociales", { id: o.id }, { client_id: null, updated_at: ahora() });
    }
    // Los otros canales de ESA conexión, sin cliente, sobran: se borran
    // (sus filas; el permiso lo sigue usando el elegido).
    for (const o of await acceso.leer("cuentas_sociales", { red: "youtube" })) {
      if (o.id !== cuenta.id && !o.client_id && leerJSON(o.datos, {})?.elegirPara === para) await acceso.borrar("cuentas_sociales", { id: o.id });
    }
    const datos = leerJSON(cuenta.datos, {});
    delete datos.elegirPara;
    await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { client_id: para, datos: JSON.stringify(datos), updated_at: ahora() });
    avisar();
    return json({ ok: true, ...extraCuentaYouTube({ datos }) });
  }

  if (accion === "privacidad" && metodo === "PUT") {
    const { cuentaId, privacidad } = (await cuerpo(req)) ?? {};
    const cuenta = await cuentaDe(cuentaId);
    if (!cuenta) return noEncontrado("Cuenta");
    if (!(privacidad in PRIVACIDADES_YOUTUBE)) return error("Privacidad no válida");
    const datos = { ...leerJSON(cuenta.datos, {}), privacidad };
    await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { datos: JSON.stringify(datos), updated_at: ahora() });
    avisar();
    return json({ ok: true, privacidad });
  }

  if (accion === "desconectar" && metodo === "POST") {
    const { cuentaId } = (await cuerpo(req)) ?? {};
    const cuenta = await cuentaDe(cuentaId);
    if (!cuenta) return noEncontrado("Cuenta");
    // Revocar mata el permiso ENTERO, y los canales que llegaron juntos lo
    // comparten: sólo se revoca si no queda otro canal con él.
    const permiso = leerJSON(cuenta.datos, {})?.permiso;
    const otros = (await acceso.leer("cuentas_sociales", { red: "youtube" }))
      .filter((o) => o.id !== cuenta.id && permiso && leerJSON(o.datos, {})?.permiso === permiso);
    if (!otros.length && cuenta.refresh_cifrado) {
      try { await revocarYouTube(await descifrarYouTube(env, cuenta.refresh_cifrado)); } catch { /* se borra igual */ }
    }
    await acceso.borrar("cuentas_sociales", { id: cuenta.id });
    avisar();
    return json({ ok: true });
  }

  return noEncontrado("Ruta");
}
