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
// falta repartir. El render del mp4 (paso 3) tendrá el suyo, más grande.
// ============================================================

/** El puerto del servidor del Container (container/servidor.mjs). */
const PUERTO = 8080;
/** Cuánto se queda despierto sin pedidos. */
export const DORMIR_TRAS_MS = 2 * 60 * 1000;
/** Cuánto se espera a que arranque (la primera vez tras dormir, unos segundos). Las pruebas lo acortan. */
export const ESPERA = { arranqueMs: 40_000, pausaMs: 300 };

class SinContenedor extends Error {
  constructor() { super("El Container del video no está disponible aquí (en local no se arranca: se prueba con container/probar.mjs)."); }
}

export class ContenedorVideo {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.arrancando = null;
    // Si ya estaba despierto (el objeto se reinició, p. ej. tras un despliegue), vuelve a fijar cuándo dormirse.
    const c = state.container;
    if (c?.running) state.blockConcurrencyWhile(() => c.setInactivityTimeout(DORMIR_TRAS_MS)).catch(() => {});
  }

  /** Arranca el Container si hace falta y espera a que conteste /salud. */
  async listo() {
    const c = this.state.container;
    // Sin Container: en local (`wrangler dev` con `dev.enable_containers: false`) o si falta la sección en wrangler.jsonc.
    if (!c) throw new SinContenedor();
    if (!c.running) c.start({ enableInternet: false });
    await c.setInactivityTimeout(DORMIR_TRAS_MS);
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

  async fetch(req) {
    try {
      // Los pedidos que llegan a la vez comparten el arranque.
      this.arrancando ??= this.listo().finally(() => { this.arrancando = null; });
      const puerto = await this.arrancando;
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
