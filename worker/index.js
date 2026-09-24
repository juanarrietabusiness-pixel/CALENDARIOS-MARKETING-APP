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
//      cliente final y /api/invitacion/* es el enlace con el que entra
//      alguien nuevo; si cualquiera de los dos cayera detrás de la
//      sesión, dejaría de abrirse para justo quien no tiene cuenta.
//   2. Después se resuelve la sesión, una sola vez. Desde que hay
//      equipo, resolverla devuelve DOS identidades: la persona
//      (`usuario.id`, quién firma) y el espacio (`usuario.ownerId`, qué
//      filas puede tocar). Antes eran la misma y no se notaba.
//   3. Y sólo entonces se construye el acceso a D1, que exige el dueño
//      —el ESPACIO, no la persona—.
//
// Las cabeceras de seguridad de /api/* las pone respuesta.js, no
// `public/_headers`: los encabezados de ese fichero NO se aplican a lo
// que genera el código del Worker.
// ============================================================

import { json, error, noAutenticado, noEncontrado, cuerpo, CABECERAS_API } from "./lib/respuesta.js";
import { crearAcceso } from "./lib/acceso.js";
import { usuarioDeLaPeticion, iniciarSesion, cerrarSesion, cookieSesion, cookieBorrada } from "./lib/sesion.js";
import { calendarioPorTestigo, enviarAprobacion, actualizarContenido, mediaPermitida } from "./lib/publico.js";
import { difundir } from "./lib/vivo.js";
import { rutasDatos } from "./rutas/datos.js";
import { rutasEquipo, rutaInvitacionPublica } from "./rutas/equipo.js";
import { rutaIA } from "./rutas/ia.js";
import { rutaChat, rutaResumenChat } from "./rutas/chat.js";
import { rutaADN } from "./rutas/adn.js";
import { rutaGenerarImagen } from "./rutas/imagen.js";
import { rutaAnalizarVideo } from "./rutas/video.js";

// El Durable Object del espacio. Se reexporta desde aquí porque
// `wrangler.jsonc` apunta su `class_name` al módulo de entrada: si se
// exportara sólo desde hub.js, el despliegue moriría con «class not
// found» y el síntoma no diría de qué clase habla.
export { EspacioHub } from "./hub.js";

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
  async fetch(req, env, ctx) {
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
            const r = await enviarAprobacion(env.DB, { ...b, token: testigo });
            // Quien responde no tiene sesión —es el cliente final—, así
            // que la firma no es una persona del equipo: es el enlace.
            difundir(env, r.ownerId, {
              tipo: "aprobacion",
              calId: r.calendarId,
              postId: r.postId,
              estado: r.estado,
              por: { userId: "cliente", nombre: b.revisor || "El cliente", color: "#F5A623" },
            });
            return json({ ok: r.ok, estado: r.estado });
          } catch (e) { return comoRespuesta(e); }
        }

        if (partes[2] === "publicacion" && metodo === "PATCH") {
          const b = (await cuerpo(req)) ?? {};
          try {
            const r = await actualizarContenido(env.DB, { ...b, token: testigo, postId: partes[3] });
            difundir(env, r.ownerId, {
              tipo: "aprobacion",
              calId: r.calendarId,
              postId: r.postId,
              estado: null,
              por: { userId: "cliente", nombre: "El cliente", color: "#F5A623" },
            });
            return json({ ok: r.ok });
          } catch (e) { return comoRespuesta(e); }
        }

        if (partes[2] === "media" && metodo === "GET") {
          const clave = partes.slice(3).join("/");
          if (!(await mediaPermitida(env.DB, testigo, clave))) return noEncontrado("Archivo");
          return sirveMedia(env, clave, true);
        }

        return noEncontrado("Ruta");
      }

      // El enlace de invitación, también sin sesión: quien lo abre
      // todavía no tiene cuenta. Ver worker/rutas/equipo.js.
      if (partes[0] === "invitacion") {
        return rutaInvitacionPublica(req, env, { partes, metodo });
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
      if (partes[0] === "ia" && !partes[1] && metodo === "POST") return rutaIA(req, env);
      if (partes[0] === "adn" && metodo === "POST") return rutaADN(req, env);

      // ---------- 5. Tiempo real ----------
      //
      // La sesión se comprueba AQUÍ y sólo después se entrega el socket
      // al Durable Object del espacio, que es el único que ve a todo el
      // equipo a la vez. El objeto no sabe leer cookies, y es mejor que
      // no lo sepa: la autorización vive en un solo sitio.
      if (partes[0] === "live") {
        if (req.headers.get("Upgrade") !== "websocket") {
          return error("Se esperaba una conexión WebSocket", 426);
        }
        if (!env.HUB) return error("El tiempo real no está configurado en este entorno", 503);

        const hub = env.HUB.get(env.HUB.idFromName(usuario.ownerId));
        const destino = new URL("https://hub/conectar");
        destino.searchParams.set("userId", usuario.id);
        destino.searchParams.set("nombre", usuario.nombre);
        destino.searchParams.set("color", usuario.color);
        return hub.fetch(new Request(destino, req));
      }

      // ---------- 6. Acceso a datos ----------
      //
      // El dueño es el ESPACIO, no quien ha entrado: los clientes son de
      // la agencia y los ve igual quien los creó que quien llegó ayer.
      const acceso = crearAcceso(env.DB, usuario.ownerId);

      // ---------- Generación de imágenes ----------
      if (partes[0] === "generar-imagen" && metodo === "POST") {
        return rutaGenerarImagen(req, env, { acceso, usuario });
      }
      // Aquí y no con el resto de /ia: necesita el acceso para saber si
      // el video es de un cliente de este espacio.
      if (partes[0] === "ia" && partes[1] === "video" && metodo === "POST") {
        return rutaAnalizarVideo(req, env, { acceso });
      }
      // El asistente, también aquí: sus herramientas de servidor leen D1
      // y el repositorio del cliente, y eso se acota por el espacio.
      if (partes[0] === "ia" && partes[1] === "chat" && partes[2] === "resumen") {
        return rutaResumenChat(req, env, { acceso, metodo });
      }
      if (partes[0] === "ia" && partes[1] === "chat" && !partes[2] && metodo === "POST") {
        return rutaChat(req, env, { acceso, ctx });
      }

      if (partes[0] === "equipo") return rutasEquipo(req, env, { acceso, partes, metodo, usuario });

      // ---------- Medios ----------
      //
      // EL ORDEN DE ESTE BLOQUE, OTRA VEZ.
      //
      // La subida iba en un `if` aparte, DESPUÉS del que comprueba la
      // clave, y nunca se alcanzaba: en `POST /api/media` no hay clave
      // —`partes` es sólo ["media"]—, así que la comprobación de arriba
      // devolvía 404 y se acababa la petición ahí. Código escrito, en el
      // commit, desplegado, y muerto; la misma forma del fallo que
      // `tests/despliegue/funciones.test.js` vigila en worker/rutas/,
      // sólo que dentro de este fichero, donde ese test no llega.
      //
      // Por eso van juntos ahora: la subida PRIMERO, porque es el caso
      // sin clave, y la lectura y el borrado después, que sí la tienen.
      if (partes[0] === "media") {
        // Subida de imágenes de publicación y logos. Devuelve la CLAVE,
        // que es lo que se guarda en el JSON del calendario: nunca un
        // data: URI, que es lo que llevaba la fila contra el techo de 2 MB.
        //
        // Aquí no hay clave que validar —la inventa el servidor, que es
        // justo lo que impide escribir en la carpeta de otro—: lo que se
        // comprueba es que el cliente sea de este espacio.
        if (partes.length === 1 && metodo === "POST") {
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

        // Leer y borrar: la clave viene en la ruta y tiene que ser de un
        // cliente de este espacio. Sin esta comprobación, /api/media/
        // sería un lector de R2 para cualquiera que tenga sesión, y con
        // equipo eso ya no es «la única cuenta de la agencia».
        const clave = partes.slice(1).join("/");
        const m = /^clientes\/([^/]+)\//.exec(clave);
        if (!m) return noEncontrado("Archivo");
        if (!(await acceso.leerUno("clients", { id: m[1] }))) return noEncontrado("Archivo");
        if (metodo === "GET") return sirveMedia(env, clave, true);
        if (metodo === "DELETE") { await env.MEDIA.delete(clave); return json({ ok: true }); }
        return error(`Método ${metodo} no permitido aquí`, 405);
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
