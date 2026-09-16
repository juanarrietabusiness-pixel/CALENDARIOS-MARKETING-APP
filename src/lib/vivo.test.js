import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Vivo } from "./vivo.js";

// ============================================================
// La conexión de tiempo real
//
// Nada de esto se puede probar abriendo la aplicación: un latido que no
// se manda, un reintento que se dispara en bucle o un socket viejo que
// avisa tarde sólo se ven a los veinte minutos, en un móvil, con la
// pantalla apagada un rato. Aquí se ven en milisegundos.
// ============================================================

const CONECTANDO = 0;
const ABIERTO = 1;
const CERRANDO = 2;
const CERRADO = 3;

/** Un WebSocket de mentira que apunta lo que se le manda. */
class SocketFalso {
  static abiertos = [];

  constructor(url) {
    this.url = url;
    this.readyState = CONECTANDO;
    this.enviados = [];
    SocketFalso.abiertos.push(this);
  }

  send(dato) { this.enviados.push(dato); }
  close() { this.readyState = CERRADO; this.onclose?.(); }

  // Empujones desde el «servidor».
  abrir() { this.readyState = ABIERTO; this.onopen?.(); }
  recibir(obj) { this.onmessage?.({ data: typeof obj === "string" ? obj : JSON.stringify(obj) }); }
  caerse() { this.readyState = CERRADO; this.onclose?.(); }
}

let visibilidad = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  SocketFalso.abiertos = [];
  visibilidad = "visible";
  globalThis.WebSocket = Object.assign(SocketFalso, {
    CONNECTING: CONECTANDO, OPEN: ABIERTO, CLOSING: CERRANDO, CLOSED: CERRADO,
  });
  globalThis.document = {
    get visibilityState() { return visibilidad; },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = {
    location: { protocol: "https:", host: "calendarios.example" },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.WebSocket;
  delete globalThis.document;
  delete globalThis.window;
});

const ultimo = () => SocketFalso.abiertos.at(-1);

describe("conectar", () => {
  it("usa wss cuando la página va por https", () => {
    // Con ws: sobre una página https el navegador bloquea la conexión
    // por contenido mixto, y el mensaje de la consola no dice eso.
    new Vivo().conectar();
    expect(ultimo().url).toBe("wss://calendarios.example/api/live");
  });

  it("no abre dos sockets si se llama dos veces", () => {
    const v = new Vivo();
    v.conectar();
    v.conectar();
    expect(SocketFalso.abiertos).toHaveLength(1);
  });

  it("avisa del estado a quien escuche, empezando por el actual", () => {
    const v = new Vivo();
    const estados = [];
    v.alCambiarEstado((e) => estados.push(e));
    expect(estados).toEqual(["desconectado"]);

    v.conectar();
    ultimo().abrir();
    expect(estados).toEqual(["desconectado", "conectando", "conectado"]);
  });
});

describe("el latido", () => {
  it("manda ping cada 25 s y no cuenta el pong como evento", () => {
    // Sin latido, los proxies móviles cortan la conexión al minuto y la
    // aplicación parece conectada mientras hace rato que no recibe nada.
    const v = new Vivo();
    const recibidos = [];
    v.al((ev) => recibidos.push(ev));
    v.conectar();
    ultimo().abrir();

    vi.advanceTimersByTime(25_000);
    expect(ultimo().enviados).toContain("ping");

    ultimo().recibir("pong");
    expect(recibidos).toEqual([]);
  });

  it("y deja de mandarlo al desconectar", () => {
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();
    const socket = ultimo();
    v.desconectar();

    const antes = socket.enviados.length;
    vi.advanceTimersByTime(60_000);
    expect(socket.enviados).toHaveLength(antes);
  });
});

describe("la reconexión", () => {
  it("espera cada vez más, y no más de 30 s", () => {
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();

    ultimo().caerse();
    vi.advanceTimersByTime(1600); // 1 s + el azar
    expect(SocketFalso.abiertos).toHaveLength(2);

    ultimo().caerse();
    vi.advanceTimersByTime(1600);
    expect(SocketFalso.abiertos, "el segundo reintento no debería haber llegado aún").toHaveLength(2);
    vi.advanceTimersByTime(3000);
    expect(SocketFalso.abiertos).toHaveLength(3);
  });

  it("no reintenta si el cierre fue a propósito", () => {
    // Al salir de la sesión, o al desmontar. Reintentar ahí deja un
    // socket vivo pidiendo entrar con una cookie que ya no vale.
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();
    v.desconectar();

    vi.advanceTimersByTime(120_000);
    expect(SocketFalso.abiertos).toHaveLength(1);
  });

  it("un socket viejo que avisa tarde no toca al que ya está vivo", () => {
    // Pasa en cada remontaje de React en desarrollo, y también cuando la
    // red va y viene: el `onclose` del anterior llegaba después de que se
    // hubiera abierto el siguiente, marcaba «desconectado» y programaba
    // un reintento sobre una conexión perfectamente viva.
    const v = new Vivo();
    v.conectar();
    const viejo = ultimo();
    viejo.abrir();

    viejo.caerse();
    vi.advanceTimersByTime(1600);
    const nuevo = ultimo();
    nuevo.abrir();
    expect(v.estado).toBe("conectado");

    viejo.caerse(); // el rezagado
    expect(v.estado).toBe("conectado");
    vi.advanceTimersByTime(120_000);
    expect(SocketFalso.abiertos).toHaveLength(2);
  });
});

describe("decir dónde está uno", () => {
  it("no repite la misma posición: cada envío reparte presencia a todo el equipo", () => {
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();

    v.mirar("cliente-1", null);
    v.mirar("cliente-1", null);
    const mirandos = ultimo().enviados.filter((e) => e.includes('"mirando"'));
    expect(mirandos).toHaveLength(1);
  });

  it("pero sí un cambio de sitio", () => {
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();

    v.mirar("cliente-1", null);
    v.mirar("cliente-1", "cal-9");
    expect(ultimo().enviados.filter((e) => e.includes('"mirando"'))).toHaveLength(2);
  });

  it("y al reconectar se repite: para los demás no te has movido", () => {
    const v = new Vivo();
    v.conectar();
    ultimo().abrir();
    v.mirar("cliente-1", "cal-9");

    ultimo().caerse();
    vi.advanceTimersByTime(1600);
    ultimo().abrir();

    const reenviado = ultimo().enviados.find((e) => e.includes('"mirando"'));
    expect(JSON.parse(reenviado)).toEqual({ tipo: "mirando", clienteId: "cliente-1", calId: "cal-9" });
  });

  it("lo que se manda sin conexión no revienta, sólo se pierde", () => {
    const v = new Vivo();
    v.conectar(); // todavía CONNECTING
    expect(() => v.editar("cal", "post", true)).not.toThrow();
    expect(ultimo().enviados).toEqual([]);
  });
});

describe("los eventos que llegan", () => {
  it("se reparten a quien escuche, y darse de baja funciona", () => {
    const v = new Vivo();
    const recibidos = [];
    const baja = v.al((ev) => recibidos.push(ev));
    v.conectar();
    ultimo().abrir();

    ultimo().recibir({ tipo: "cliente", cliente: { id: "c1" } });
    expect(recibidos).toHaveLength(1);

    baja();
    ultimo().recibir({ tipo: "cliente", cliente: { id: "c2" } });
    expect(recibidos, "sigue llegando después de darse de baja").toHaveLength(1);
  });

  it("un mensaje que no se entiende se ignora en vez de tirar la conexión", () => {
    const v = new Vivo();
    const recibidos = [];
    v.al((ev) => recibidos.push(ev));
    v.conectar();
    ultimo().abrir();

    expect(() => ultimo().recibir("{ esto no es json")).not.toThrow();
    expect(recibidos).toEqual([]);
    expect(v.estado).toBe("conectado");
  });
});
