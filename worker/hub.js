// ============================================================
// El Durable Object del espacio — el tiempo real
//
// POR QUÉ UN DURABLE OBJECT Y NO UN SONDEO
//
// Hasta aquí lo único que llegaba solo eran las aprobaciones, y llegaban
// con `setInterval` cada 15 s (`subscribeApprovals`). Para el cliente
// final, que tarda minutos en revisar, eso bastaba. Para dos personas de
// la agencia editando el mismo mes a la vez, no: quince segundos es
// tiempo de sobra para escribir encima de lo que acaba de escribir el
// otro y no enterarse.
//
// Cloudflare garantiza que de este objeto existe UNA SOLA instancia por
// espacio en todo el mundo. Las dos personas, estén donde estén, se
// conectan a la misma, y lo que escribe una sale hacia la otra en el
// mismo viaje.
//
// HIBERNACIÓN
//
// `state.acceptWebSocket(ws)` —y no `ws.accept()`— es lo que permite que
// Cloudflare descargue el objeto de memoria cuando no pasa nada SIN
// cortar los sockets. Una agencia con el panel abierto toda la tarde y
// sin tocar nada no cuesta prácticamente nada, y la conexión sigue viva
// cuando por fin alguien escribe.
//
// QUÉ SE REPARTE
//
// Dos clases de mensaje, y conviene no confundirlas:
//
//   · Cambios de DATOS. Los manda el Worker por `/difundir` después de
//     escribir en D1. Van a TODOS, incluida la pestaña que los originó:
//     el cambio llegó por HTTP, así que no hay forma de saber qué socket
//     lo produjo, y aunque la hubiera, la misma persona puede tener el
//     panel abierto en el portátil y en el móvil. Recibir el eco de lo
//     propio no molesta: el cliente aplica por id, así que reaplicar el
//     mismo dato no cambia nada.
//
//   · PRESENCIA. Quién está conectado y qué está mirando. No toca la
//     base: nace y muere con los sockets, que es exactamente lo que es.
//
// LA BOMBA DEL ESTUDIO
//
// Además, el objeto lleva lo que el Estudio deja en marcha (trabajos y
// encargos) cuando nadie mira la pantalla: `/despertar` pone una ALARMA y
// la alarma da unos pocos pasos (worker/lib/estudio/bomba.js) y se vuelve a
// poner mientras quede algo vivo. Cada alarma es su propia invocación, con
// sus propios límites: por eso da pocos pasos y vuelve en segundos.
// ============================================================

import { bombear } from "./lib/estudio/bomba.js";

/** Lo que se guarda pegado a cada socket. Sobrevive a la hibernación. */
function datosDe(ws) {
  try {
    return ws.deserializeAttachment() ?? null;
  } catch {
    return null;
  }
}

export class EspacioHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req) {
    const url = new URL(req.url);

    // Alta de conexión. El Worker ya ha validado la sesión antes de
    // llegar aquí: este objeto no sabe leer cookies ni debe saberlo.
    if (url.pathname.endsWith("/conectar")) {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Se esperaba una conexión WebSocket", { status: 426 });
      }

      const userId = url.searchParams.get("userId") ?? "";
      if (!userId) return new Response("Falta la identidad", { status: 400 });

      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);

      this.state.acceptWebSocket(servidor);
      servidor.serializeAttachment({
        userId,
        nombre: url.searchParams.get("nombre") ?? "",
        color: url.searchParams.get("color") ?? "#1E90FF",
        mirando: null,
        foco: null,
      });

      servidor.send(JSON.stringify({ tipo: "hola", userId, presentes: this.presentes() }));
      this.difundir({ tipo: "presencia", presentes: this.presentes() }, servidor);

      return new Response(null, { status: 101, webSocket: cliente });
    }

    if (url.pathname.endsWith("/despertar")) {
      const { ownerId } = await req.json().catch(() => ({}));
      if (typeof ownerId !== "string" || !ownerId) return new Response("Falta el espacio", { status: 400 });
      await this.state.storage.put("owner", ownerId);
      const puesta = await this.state.storage.getAlarm();
      // Una alarma que ya va a sonar pronto basta; una lejana (un video esperando) se adelanta.
      if (!puesta || puesta > Date.now() + 2000) await this.state.storage.setAlarm(Date.now() + 1000);
      return new Response(null, { status: 204 });
    }

    if (url.pathname.endsWith("/difundir")) {
      const evento = await req.json();
      this.difundir(evento);
      return new Response(null, { status: 204 });
    }

    return new Response("No encontrado", { status: 404 });
  }

  /** La bomba del Estudio: unos pasos y, si queda algo vivo, la siguiente alarma. */
  async alarm() {
    const ownerId = await this.state.storage.get("owner");
    if (!ownerId || !this.env?.DB) return;
    let siguiente = null;
    try {
      siguiente = await bombear(this.env, ownerId);
    } catch (e) {
      console.error("bomba del estudio:", e?.message ?? e);
      siguiente = 30_000;
    }
    if (siguiente != null) await this.state.storage.setAlarm(Date.now() + siguiente);
  }

  async webSocketMessage(ws, mensaje) {
    if (typeof mensaje !== "string") return;

    // Latido. Los proxies móviles cortan las conexiones ociosas al
    // minuto; sin esto la app «funciona» y deja de recibir nada.
    if (mensaje === "ping") {
      ws.send("pong");
      return;
    }

    let m;
    try {
      m = JSON.parse(mensaje);
    } catch {
      return; // Un mensaje que no se entiende no tira la conexión.
    }

    const datos = datosDe(ws);
    if (!datos) return;

    // «Estoy mirando este cliente / este calendario». Se guarda en el
    // socket y se reparte: es lo que dibuja los avatares sobre el
    // cliente en la lista.
    if (m.tipo === "mirando") {
      ws.serializeAttachment({
        ...datos,
        mirando: m.clienteId ? { clienteId: m.clienteId, calId: m.calId ?? null } : null,
      });
      this.difundir({ tipo: "presencia", presentes: this.presentes() });
      return;
    }

    // «Hoy trabajo en esta empresa». Distinto de `mirando`: aquello es
    // la pantalla que tienes delante y cambia a cada clic; esto es lo que
    // decidiste por la mañana, y sigue valiendo aunque abras otro cliente
    // un momento para mirar algo.
    if (m.tipo === "foco") {
      ws.serializeAttachment({
        ...datos,
        foco: typeof m.clienteId === "string" && m.clienteId ? m.clienteId.slice(0, 80) : null,
      });
      this.difundir({ tipo: "presencia", presentes: this.presentes() });
      return;
    }

    // «Estoy editando esta publicación». No se guarda: es un aviso que
    // vale mientras el panel esté abierto, y el cierre manda el suyo.
    // La identidad la pone el servidor a partir del socket, nunca el
    // mensaje: si viniera del cliente, cualquiera firmaría como otro.
    if (m.tipo === "editando") {
      this.difundir(
        {
          tipo: "editando",
          calId: m.calId ?? null,
          postId: m.postId ?? null,
          activo: Boolean(m.activo),
          por: { userId: datos.userId, nombre: datos.nombre, color: datos.color },
        },
        ws,
      );
    }
  }

  async webSocketClose(ws) {
    // El socket que se va sigue figurando en getWebSockets() en este
    // punto, así que se lo excluye a mano del listado.
    this.difundir({ tipo: "presencia", presentes: this.presentes(ws) }, ws);
  }

  async webSocketError(ws) {
    this.difundir({ tipo: "presencia", presentes: this.presentes(ws) }, ws);
  }

  /**
   * Quién está conectado ahora mismo, sin repetir.
   *
   * Una persona puede tener dos pestañas abiertas; se cuenta una sola
   * vez, y se queda con la última posición conocida —la pestaña que
   * tiene delante es la que acaba de mandar su `mirando`—.
   */
  presentes(excluir) {
    const porPersona = new Map();
    for (const ws of this.state.getWebSockets()) {
      if (ws === excluir) continue;
      const d = datosDe(ws);
      if (!d?.userId) continue;
      const previo = porPersona.get(d.userId);
      porPersona.set(d.userId, {
        userId: d.userId,
        nombre: d.nombre,
        color: d.color,
        mirando: d.mirando ?? previo?.mirando ?? null,
        foco: d.foco ?? previo?.foco ?? null,
      });
    }
    return [...porPersona.values()];
  }

  difundir(evento, excluir) {
    const payload = JSON.stringify(evento);
    for (const ws of this.state.getWebSockets()) {
      if (ws === excluir) continue;
      try {
        ws.send(payload);
      } catch {
        // Socket muerto que todavía no se ha limpiado. Se ignora: el
        // cliente reconecta solo y vuelve a sincronizar al hacerlo.
      }
    }
  }
}
