// ============================================================
// El Worker
//
// Sirve la aplicación (Static Assets) y la API en el MISMO origen. Eso
// es lo que permite que la CSP quede en `connect-src 'self'` y que la
// cookie lleve prefijo `__Host-`.
//
// EL ORDEN DE ESTE FICHERO IMPORTA:
//
//   1. Lo público va PRIMERO. /api/publico/* es la página que ve el
//      cliente final; si cayera detrás de la sesión, todos los enlaces
//      ya enviados dejarían de abrirse.
//   2. Después se resuelve la sesión, una sola vez.
//   3. Y sólo entonces se construye el acceso a D1, que exige el dueño.
//
// Las cabeceras de seguridad de /api/* las pone respuesta.js, no
// `public/_headers`: los encabezados de ese fichero NO se aplican a lo
// que genera el código del Worker.
// ============================================================

import { json, error, noAutenticado, noEncontrado, cuerpo, CABECERAS_API } from "./lib/respuesta.js";
import { crearAcceso } from "./lib/acceso.js";
import { usuarioDeLaPeticion, iniciarSesion, cerrarSesion, cookieSesion, cookieBorrada } from "./lib/sesion.js";
import { calendarioPorTestigo, enviarAprobacion, actualizarContenido, mediaPermitida } from "./lib/publico.js";
import { rutasDatos } from "./rutas/datos.js";
import { rutaIA } from "./rutas/ia.js";
import { rutaChat } from "./rutas/chat.js";
import { rutaADN } from "./rutas/adn.js";

/** Los errores del enlace público son de quien lo usa, no del servidor. */
function comoRespuesta(e) {
  const msg = String(e?.message ?? "Error");
  const codigo = /inválid|caducad|no pertenece|no está habilitada/i.test(msg) ? 400 : 500;
  if (codigo === 500) console.error("publico:", e);
  return error(codigo === 500 ? "No se pudo completar la operación" : msg, codigo);
}

async function sirveMedia(env, clave, cacheable) {
  const objeto = await env.MEDIA.get(clave);
  if (!objeto) return noEncontrado("Archivo");
  const cabeceras = new Headers();
  objeto.writeHttpMetadata(cabeceras);
  cabeceras.set("etag", objeto.httpEtag);
  // `private`: son imágenes de clientes. Que una caché compartida las
  // guarde es exactamente lo que no se quiere.
  cabeceras.set("Cache-Control", cacheable ? "private, max-age=3600" : "no-store");
  cabeceras.set("X-Content-Type-Options", "nosniff");
  return new Response(objeto.body, { headers: cabeceras });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const ruta = url.pathname;

    // Lo que no es API lo sirve Static Assets (SPA).
    if (!ruta.startsWith("/api/")) return env.ASSETS.fetch(req);

    const partes = ruta.replace(/^\/api\//, "").replace(/\/$/, "").split("/").map(decodeURIComponent);
    const metodo = req.method;

    try {
      // ---------- 1. Público, sin sesión ----------
      if (partes[0] === "publico") {
        const testigo = partes[1] ?? "";

        if (partes.length === 2 && metodo === "GET") {
          const datos = await calendarioPorTestigo(env.DB, testigo);
          return datos ? json(datos) : noEncontrado("Calendario");
        }

        if (partes[2] === "aprobacion" && metodo === "POST") {
          const b = (await cuerpo(req)) ?? {};
          try {
            return json(await enviarAprobacion(env.DB, { ...b, token: testigo }));
          } catch (e) { return comoRespuesta(e); }
        }

        if (partes[2] === "publicacion" && metodo === "PATCH") {
          const b = (await cuerpo(req)) ?? {};
          try {
            return json(await actualizarContenido(env.DB, { ...b, token: testigo, postId: partes[3] }));
          } catch (e) { return comoRespuesta(e); }
        }

        if (partes[2] === "media" && metodo === "GET") {
          const clave = partes.slice(3).join("/");
          if (!(await mediaPermitida(env.DB, testigo, clave))) return noEncontrado("Archivo");
          return sirveMedia(env, clave, true);
        }

        return noEncontrado("Ruta");
      }

      // ---------- 2. Acceso ----------
      if (partes[0] === "acceso" && metodo === "POST") {
        const { email, password } = (await cuerpo(req)) ?? {};
        const sesion = await iniciarSesion(env.DB, email, password, req.headers.get("User-Agent") ?? "");
        if (!sesion) return error("Usuario o contraseña incorrectos.", 401);
        return json({ usuario: sesion.usuario }, 200, { "Set-Cookie": cookieSesion(sesion.testigo) });
      }

      if (partes[0] === "salir" && metodo === "POST") {
        await cerrarSesion(env.DB, req);
        return json({ ok: true }, 200, { "Set-Cookie": cookieBorrada() });
      }

      // ---------- 3. Sesión ----------
      const usuario = await usuarioDeLaPeticion(env.DB, req);
      if (!usuario) return noAutenticado();

      if (partes[0] === "yo" && metodo === "GET") return json({ usuario });

      // ---------- 4. IA ----------
      if (partes[0] === "ia" && partes[1] === "chat" && metodo === "POST") return rutaChat(req, env);
      if (partes[0] === "ia" && !partes[1] && metodo === "POST") return rutaIA(req, env);
      if (partes[0] === "adn" && metodo === "POST") return rutaADN(req, env);

      // ---------- 5. Acceso a datos ----------
      const acceso = crearAcceso(env.DB, usuario.id);

      // Medios con sesión: la clave tiene que ser de un cliente de este
      // dueño. Sin esta comprobación, /api/media/ sería un lector de R2
      // para cualquiera que tenga sesión, y en el hub eso ya no es «la
      // única cuenta de la agencia».
      if (partes[0] === "media") {
        const clave = partes.slice(1).join("/");
        const m = /^clientes\/([^/]+)\//.exec(clave);
        if (!m) return noEncontrado("Archivo");
        if (!(await acceso.leerUno("clients", { id: m[1] }))) return noEncontrado("Archivo");
        if (metodo === "GET") return sirveMedia(env, clave, true);
        if (metodo === "DELETE") { await env.MEDIA.delete(clave); return json({ ok: true }); }
      }

      // Subida de imágenes de publicación y logos. Devuelve la CLAVE,
      // que es lo que se guarda en el JSON del calendario: nunca un
      // data: URI, que es lo que llevaba la fila contra el techo de 2 MB.
      if (partes[0] === "media" && partes.length === 1 && metodo === "POST") {
        const form = await req.formData().catch(() => null);
        const archivo = form?.get("archivo");
        const clientId = String(form?.get("clientId") ?? "");
        const carpeta = String(form?.get("carpeta") ?? "posts").replace(/[^a-z]/g, "") || "posts";
        if (!archivo || typeof archivo === "string") return error("Falta el archivo");
        if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");

        const ext = (archivo.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
        const clave = `clientes/${clientId}/${carpeta}/${crypto.randomUUID()}.${ext}`;
        await env.MEDIA.put(clave, archivo.stream(), {
          httpMetadata: { contentType: archivo.type || "image/jpeg" },
        });
        return json({ clave }, 201);
      }

      return rutasDatos(req, env, { acceso, partes, metodo, usuario });
    } catch (e) {
      console.error("worker:", e);
      return new Response(JSON.stringify({ error: "Error interno" }), {
        status: 500, headers: CABECERAS_API,
      });
    }
  },
};
