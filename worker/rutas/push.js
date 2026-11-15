// ============================================================
// /api/avisos/push — recibir los avisos importantes en ESTE dispositivo (Web Push)
//
//   GET            La llave pública VAPID (para `pushManager.subscribe`) y los dispositivos de quien pregunta
//   POST           Suscribir este dispositivo { endpoint, keys: { p256dh, auth }, dispositivo }
//   POST quitar    Dejar de recibirlos en este dispositivo { endpoint }
//   POST prueba    Mandar un aviso de prueba a los dispositivos de quien pregunta
//
// Va dentro de /api/avisos a propósito: es lo suyo propio, como marcar sus avisos leídos, así que también quien es de
// sólo lectura puede recibirlos en su teléfono (worker/index.js deja pasar /avisos). Siempre los de QUIEN PREGUNTA.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { sha256, ahora } from "../lib/ids.js";
import { clavesVapid, endpointValido, llavesValidas, enviarPush } from "../lib/push.js";

const COLUMNAS = ["id", "user_id", "endpoint", "p256dh", "auth", "dispositivo", "origen", "ok_at", "created_at"];
const idDe = async (endpoint) => (await sha256(String(endpoint))).slice(0, 40);

export async function rutasPush(req, env, { acceso, usuario, partes, metodo }) {
  const sub = partes[2];

  if (!sub && metodo === "GET") {
    const claves = await clavesVapid(env).catch(() => null);
    const filas = await acceso.leerColumnas("push_suscripciones", COLUMNAS, { user_id: usuario.id }, "created_at desc", 20);
    return json({
      clave: claves?.publica ?? null,
      dispositivos: filas.map((f) => ({ id: f.id, endpoint: f.endpoint, dispositivo: f.dispositivo, desde: f.created_at, ultimaPrueba: f.ok_at })),
    });
  }

  if (!sub && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!endpointValido(b.endpoint)) return error("Ese navegador usa un servicio de avisos que no se conoce.");
    if (!llavesValidas(b.keys)) return error("La suscripción del navegador no trae sus llaves.");
    const t = ahora();
    const id = await idDe(b.endpoint);
    const antes = await acceso.leerUno("push_suscripciones", { id });
    await acceso.guardar("push_suscripciones", {
      id, user_id: usuario.id, endpoint: String(b.endpoint), p256dh: String(b.keys.p256dh), auth: String(b.keys.auth),
      dispositivo: String(b.dispositivo ?? "").slice(0, 80), origen: new URL(req.url).origin, ok_at: antes?.ok_at ?? null,
      created_at: antes?.created_at ?? t, updated_at: t,
    });
    return json({ ok: true, id });
  }

  if (sub === "quitar" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!b.endpoint) return error("Falta el dispositivo.");
    await acceso.borrar("push_suscripciones", { id: await idDe(b.endpoint), user_id: usuario.id });
    return json({ ok: true });
  }

  if (sub === "prueba" && metodo === "POST") {
    const subs = await acceso.leerColumnas("push_suscripciones", COLUMNAS, { user_id: usuario.id }, "created_at desc", 10);
    if (!subs.length) return error("Este usuario no recibe avisos en ningún dispositivo todavía.", 409);
    const carga = { titulo: "Avisos en este dispositivo", texto: "Así te llegarán los avisos importantes: lo que no se publicó, lo que pide el cliente y lo que termina el Estudio.", enlace: "/ajustes#salud", etiqueta: "prueba" };
    const resultados = await Promise.all(subs.map(async (s) => ({ s, r: await enviarPush(env, s, carga) })));
    const t = ahora();
    for (const { s, r } of resultados) {
      if (r.ok) await acceso.actualizar("push_suscripciones", { id: s.id, user_id: usuario.id }, { ok_at: t });
      else if (r.estado === 404 || r.estado === 410) await acceso.borrar("push_suscripciones", { id: s.id, user_id: usuario.id });
    }
    return json({
      enviados: resultados.filter((x) => x.r.ok).length,
      quitados: resultados.filter((x) => x.r.estado === 404 || x.r.estado === 410).length,
      fallidos: resultados.filter((x) => !x.r.ok && x.r.estado !== 404 && x.r.estado !== 410).length,
    });
  }

  return noEncontrado("Ruta");
}
