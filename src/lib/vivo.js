// ============================================================
// La conexión de tiempo real con el espacio
//
// Tres cosas que, en la práctica, son las que rompen una conexión
// persistente y las que hay que resolver para que «en vivo» sea verdad:
//
//  1. RECONEXIÓN CON ESPERA CRECIENTE. Si el servidor o la red se caen,
//     no se reintenta en bucle cerrado: 1 s, 2 s, 4 s… hasta 30 s, con
//     un pellizco de azar para que dos navegadores no vuelvan a la vez.
//
//  2. LATIDO CADA 25 s. Los proxies —y el 4G del móvil— cortan las
//     conexiones ociosas al minuto. Sin el ping, la aplicación parece
//     conectada y hace horas que no recibe nada.
//
//  3. RECONEXIÓN AL VOLVER. iOS y Android congelan la pestaña en
//     segundo plano y el socket muere sin avisar. Al volver se
//     reconecta al instante, y quien escucha recarga: mientras estuvo
//     fuera pudieron pasar cosas que no llegaron.
//
// El tercer punto es el que hace que esto sea de fiar y no sólo rápido:
// **el socket no es la fuente de verdad, D1 lo es**. Todo lo que llega
// por aquí es un atajo para no tener que recargar; si se pierde un
// evento, la recarga al reconectar lo repone.
// ============================================================

const ESPERA_MAX_MS = 30_000;
const LATIDO_MS = 25_000;

export class Vivo {
  constructor() {
    this.ws = null;
    this.escuchas = new Set();
    this.cambios = new Set();
    this.intentos = 0;
    this.latido = null;
    this.reintento = null;
    this.cerradoAProposito = false;
    this.estado = "desconectado";
    // Lo último que se dijo estar mirando. Se reenvía al reconectar:
    // para el resto del equipo, una reconexión no es un cambio de sitio.
    this.ultimoMirando = null;
    this.alVolver = this.alVolver.bind(this);
  }

  conectar() {
    this.cerradoAProposito = false;
    this.abrir();
    document.addEventListener("visibilitychange", this.alVolver);
    window.addEventListener("online", this.alVolver);
  }

  desconectar() {
    this.cerradoAProposito = true;
    document.removeEventListener("visibilitychange", this.alVolver);
    window.removeEventListener("online", this.alVolver);
    this.limpiar();
    try { this.ws?.close(); } catch { /* ya estaba cerrado */ }
    this.ws = null;
    this.marcar("desconectado");
  }

  /** Suscribe a los eventos. Devuelve con qué darse de baja. */
  al(escucha) {
    this.escuchas.add(escucha);
    return () => this.escuchas.delete(escucha);
  }

  /** Igual, para el estado de la conexión. Avisa del actual al suscribirse. */
  alCambiarEstado(cb) {
    this.cambios.add(cb);
    cb(this.estado);
    return () => this.cambios.delete(cb);
  }

  /** «Estoy mirando este cliente / este calendario.» */
  mirar(clienteId, calId = null) {
    const m = { tipo: "mirando", clienteId: clienteId ?? null, calId };
    const igual =
      this.ultimoMirando?.clienteId === m.clienteId && this.ultimoMirando?.calId === m.calId;
    this.ultimoMirando = m;
    // No se reenvía lo mismo dos veces: cada envío hace que el servidor
    // recalcule y reparta la presencia a todo el equipo.
    if (!igual) this.enviar(m);
  }

  /** «Estoy editando esta publicación», y su contrario al cerrar. */
  editar(calId, postId, activo) {
    this.enviar({ tipo: "editando", calId, postId, activo });
  }

  enviar(obj) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(obj)); } catch { /* se repone al reconectar */ }
  }

  // ---- interno ----------------------------------------------------

  alVolver() {
    if (document.visibilityState !== "visible") return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentos = 0;
    this.abrir();
  }

  marcar(estado) {
    if (this.estado === estado) return;
    this.estado = estado;
    for (const cb of this.cambios) cb(estado);
  }

  abrir() {
    if (this.cerradoAProposito) return;
    // `this.ws &&` no sobra: sin él, cuando todavía no hay socket,
    // `this.ws?.readyState` vale undefined y se compara con constantes
    // que también podrían valerlo. Una comparación de dos undefined da
    // true, y entonces esto no abre NUNCA la primera conexión —sin
    // error, sin log, sin nada que mirar—.
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.limpiar();
    this.marcar("conectando");

    const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocolo}//${window.location.host}/api/live`);
    this.ws = ws;

    // Los manejadores comprueban que el socket que habla sigue siendo el
    // vigente. Uno viejo puede avisar de que se ha cerrado DESPUÉS de que
    // se haya abierto el siguiente —pasa en cada remontaje de React en
    // desarrollo, y también cuando la red va y viene—, y entonces marca
    // «desconectado» y programa un reintento sobre una conexión que está
    // perfectamente viva.
    const vigente = () => this.ws === ws;

    ws.onopen = () => {
      if (!vigente()) return;
      this.intentos = 0;
      this.marcar("conectado");
      if (this.ultimoMirando) this.enviar(this.ultimoMirando);
      this.latido = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, LATIDO_MS);
    };

    ws.onmessage = (ev) => {
      if (!vigente()) return;
      if (ev.data === "pong") return;
      let evento;
      try {
        evento = JSON.parse(ev.data);
      } catch {
        return; // Un mensaje que no se entiende se ignora, no tira nada.
      }
      for (const escucha of this.escuchas) escucha(evento);
    };

    ws.onclose = () => {
      if (!vigente()) return;
      this.marcar("desconectado");
      this.programarReintento();
    };

    // `onerror` siempre viene seguido de `onclose`, que es donde se
    // reintenta: cerrar aquí sólo adelanta ese camino.
    ws.onerror = () => { try { ws.close(); } catch { /* ya cerrado */ } };
  }

  programarReintento() {
    if (this.cerradoAProposito || this.reintento) return;
    const base = Math.min(1000 * 2 ** this.intentos, ESPERA_MAX_MS);
    const espera = base + Math.random() * 500;
    this.intentos++;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      this.abrir();
    }, espera);
  }

  limpiar() {
    if (this.latido) { clearInterval(this.latido); this.latido = null; }
    if (this.reintento) { clearTimeout(this.reintento); this.reintento = null; }
  }
}

export const vivo = new Vivo();
