// ============================================================
// El Durable Object que maneja el CONTAINER del video animado (container/, Node + @napi-rs/canvas)
//
// Un Container sólo se alcanza por su Durable Object (`ctx.container`). Esto es lo mínimo: arrancarlo si está
// dormido, esperar a que conteste /salud y pasarle el pedido. Sin la librería `@cloudflare/containers` a propósito:
// importa `cloudflare:workers`, que no existe en Node, y las pruebas cargan el Worker entero en Node. La API nativa
// es la misma que esa librería envuelve (start, getTcpPort, setInactivityTimeout).
//
// SE DUERME SOLO a los `DORMIR_TRAS_MS` sin pedidos: la memoria se paga mientras está despierto, la CPU sólo cuando
// dibuja. Un cuadro de una persona que revisa son unos segundos; dormirse rápido es lo que lo deja en céntimos.
//
// Un solo Container para todo el espacio (`idFromName("cuadros")`): dibujar un cuadro son milisegundos y no hace
// falta repartir.
//
// El RENDER del mp4 va en OTRA clase (`RenderVideo`) con su propio Container, más grande (2 vCPU, ver wrangler.jsonc),
// uno por video (`idFromName(<id del video>)`). No contesta el pedido esperando el render: lo apunta y lo hace en su
// ALARMA, que sigue aunque la persona cierre la pantalla y tiene hasta 15 minutos; lo lleva worker/lib/estudio/render.js.
// ============================================================

import { ejecutarRender } from "./lib/estudio/render.js";

/** El puerto del servidor del Container (container/servidor.mjs). */
const PUERTO = 8080;
/** Cuánto se queda despierto sin pedidos. */
export const DORMIR_TRAS_MS = 2 * 60 * 1000;
/** El del render se duerme antes: es más grande (la memoria se paga despierta) y entre renders no hay prisa. */
export const DORMIR_RENDER_MS = 30 * 1000;
/** Cuánto se espera a que arranque (la primera vez tras dormir, unos segundos). Las pruebas lo acortan. */
export const ESPERA = { arranqueMs: 40_000, pausaMs: 300 };

class SinContenedor extends Error {
  constructor() { super("El Container del video no está disponible aquí (en local no se arranca: se prueba con container/probar.mjs)."); }
}

/** Lo común de los dos: arrancar su Container, esperar a /salud y fijar cuándo dormirse. */
class ConContenedor {
  constructor(state, env, dormirMs) {
    this.state = state;
    this.env = env;
    this.dormirMs = dormirMs;
    this.arrancando = null;
    // Si ya estaba despierto (el objeto se reinició, p. ej. tras un despliegue), vuelve a fijar cuándo dormirse.
    const c = state.container;
    if (c?.running) state.blockConcurrencyWhile(() => c.setInactivityTimeout(dormirMs)).catch(() => {});
  }

  /** El puerto del Container, arrancándolo si hace falta (los pedidos que llegan a la vez comparten el arranque). */
  puerto() {
    this.arrancando ??= this.listo().finally(() => { this.arrancando = null; });
    return this.arrancando;
  }

  /** Arranca el Container si hace falta y espera a que conteste /salud. */
  async listo() {
    const c = this.state.container;
    // Sin Container: en local (`wrangler dev` con `dev.enable_containers: false`) o si falta la sección en wrangler.jsonc.
    if (!c) throw new SinContenedor();
    if (!c.running) c.start({ enableInternet: false });
    await c.setInactivityTimeout(this.dormirMs);
    const puerto = c.getTcpPort(PUERTO);
    const hasta = Date.now() + ESPERA.arranqueMs;
    let ultimo;
    while (Date.now() < hasta) {
      try {
        const r = await puerto.fetch("http://contenedor/salud");
        if (r.ok) return puerto;
        ultimo = new Error(`/salud respondió ${r.status}`);
      } catch (e) {
        ultimo = e;
      }
      await new Promise((ok) => setTimeout(ok, ESPERA.pausaMs));
    }
    throw new Error(`El Container no arrancó a tiempo: ${ultimo?.message ?? "sin respuesta"}`);
  }

}

/** El Container de los CUADROS: pasa cada pedido tal cual (ver_cuadro, la hoja, la revisión). */
export class ContenedorVideo extends ConContenedor {
  constructor(state, env) {
    super(state, env, DORMIR_TRAS_MS);
  }

  async fetch(req) {
    try {
      const puerto = await this.puerto();
      const url = new URL(req.url);
      // El cuerpo como bytes (un pedido son pocos MB): pasarlo como flujo exige `duplex` fuera de Workers.
      const cuerpo = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
      return await puerto.fetch(new Request(`http://contenedor${url.pathname}`, { method: req.method, headers: req.headers, body: cuerpo }));
    } catch (e) {
      if (e instanceof SinContenedor) return new Response(JSON.stringify({ error: e.message }), { status: 503, headers: { "Content-Type": "application/json" } });
      console.error("contenedor del video:", e?.message ?? e);
      return new Response(JSON.stringify({ error: `El Container del video no respondió: ${e?.message ?? e}` }), {
        status: 503, headers: { "Content-Type": "application/json" },
      });
    }
  }
}

/**
 * El Container del RENDER. `POST /encargar` { ownerId, clienteId, videoId, intento } apunta el encargo y pone la alarma
 * ya (202); la alarma lo hace. El encargo se BORRA antes de empezar: si el objeto muere a la mitad, la alarma no lo
 * repite (otro render entero, y quizá el mismo fallo); el proyecto queda «Renderizando» y al leerlo pasado el plazo se
 * da por fallido (`renderAlDia`), con «Renderizar» otra vez a un toque.
 */
export class RenderVideo extends ConContenedor {
  constructor(state, env) {
    super(state, env, DORMIR_RENDER_MS);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/encargar") return new Response("No existe.", { status: 404 });
    const e = await req.json().catch(() => null);
    if (!e || !["ownerId", "clienteId", "videoId", "intento"].every((k) => typeof e[k] === "string" && e[k])) {
      return Response.json({ error: "Encargo incompleto." }, { status: 400 });
    }
    await this.state.storage.put("encargo", { ownerId: e.ownerId, clienteId: e.clienteId, videoId: e.videoId, intento: e.intento });
    await this.state.storage.setAlarm(Date.now());
    return Response.json({ ok: true }, { status: 202 });
  }

  async alarm() {
    const encargo = await this.state.storage.get("encargo");
    if (!encargo) return;
    await this.state.storage.delete("encargo");
    await ejecutarRender(this.env, encargo, async (ruta, cuerpo) => {
      const puerto = await this.puerto();
      return puerto.fetch(new Request(`http://contenedor${ruta}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      }));
    });
  }
}
