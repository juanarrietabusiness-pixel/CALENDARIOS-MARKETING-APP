import { describe, it, expect } from "vitest";
import {
  ventanaMensajes, VENTANA_MS, haceCuanto, filtrarComentarios, filtrarHilos, enHilos, conversaciones,
  totalPendientes, permisosQueFaltanBandeja, validarRespuesta, TOPE_RESPUESTA,
} from "./bandejaVista";

const AHORA = Date.parse("2026-10-01T15:00:00.000Z");
const hace = (ms) => new Date(AHORA - ms).toJSON();

describe("la ventana de 24 horas de los mensajes", () => {
  it("abierta si la persona escribió hace menos de 24 h, con cuándo se cierra", () => {
    const v = ventanaMensajes(hace(3 * 3600_000), AHORA);
    expect(v.abierta).toBe(true);
    expect(v.motivo).toBe("");
    expect(v.restanteMs).toBe(21 * 3600_000);
    expect(v.cierraAt).toBe(new Date(AHORA + 21 * 3600_000).toJSON());
    expect(v.aviso).toBe("");
  });

  it("avisa cuando quedan menos de dos horas", () => {
    const v = ventanaMensajes(hace(VENTANA_MS - 45 * 60_000), AHORA);
    expect(v.abierta).toBe(true);
    expect(v.aviso).toBe("Quedan 45 min para poder responder.");
    expect(ventanaMensajes(hace(VENTANA_MS - 90 * 60_000), AHORA).aviso).toBe("Quedan 1 h 30 min para poder responder.");
  });

  it("cerrada justo a las 24 h y después, y dice por qué", () => {
    for (const ms of [VENTANA_MS, VENTANA_MS + 1, 3 * VENTANA_MS]) {
      const v = ventanaMensajes(hace(ms), AHORA);
      expect(v.abierta).toBe(false);
      expect(v.restanteMs).toBe(0);
      expect(v.motivo).toMatch(/más de 24 horas/);
    }
  });

  it("sin mensaje de la persona (sólo escribió la cuenta) está cerrada", () => {
    for (const valor of [null, undefined, "", "no es fecha"]) {
      const v = ventanaMensajes(valor, AHORA, "instagram");
      expect(v.abierta).toBe(false);
      expect(v.motivo).toMatch(/Instagram sólo deja responder a quien escribió primero/);
    }
  });

  it("un minuto antes del cierre sigue abierta", () => {
    expect(ventanaMensajes(hace(VENTANA_MS - 60_000), AHORA).abierta).toBe(true);
  });
});

describe("las frases y los filtros", () => {
  it("haceCuanto", () => {
    expect(haceCuanto(hace(10_000), AHORA)).toBe("ahora");
    expect(haceCuanto(hace(5 * 60_000), AHORA)).toBe("hace 5 min");
    expect(haceCuanto(hace(3 * 3600_000), AHORA)).toBe("hace 3 h");
    expect(haceCuanto(hace(30 * 3600_000), AHORA)).toBe("ayer");
    expect(haceCuanto("", AHORA)).toBe("");
  });

  const lista = [
    { id: "1", externoId: "a", clientId: "c1", red: "instagram", propio: false, atendido: false, oculto: false, creadoAt: "2026-10-01T10:00:00Z" },
    { id: "2", externoId: "b", padreId: "a", clientId: "c1", red: "instagram", propio: true, atendido: true, oculto: false, creadoAt: "2026-10-01T11:00:00Z" },
    { id: "3", externoId: "c", clientId: "c2", red: "facebook", propio: false, atendido: true, oculto: true, creadoAt: "2026-10-01T09:00:00Z" },
    { id: "4", externoId: "d", padreId: "c", clientId: "c2", red: "facebook", propio: false, atendido: false, oculto: false, creadoAt: "2026-10-01T12:00:00Z" },
  ];

  it("filtrarComentarios: lo propio nunca es pendiente", () => {
    expect(filtrarComentarios(lista).map((c) => c.id)).toEqual(["1", "4"]);
    expect(filtrarComentarios(lista, { estado: "ocultos" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComentarios(lista, { estado: "todos", red: "facebook" }).map((c) => c.id)).toEqual(["3", "4"]);
  });

  it("enHilos cuelga cada respuesta de su comentario, en orden", () => {
    const h = enHilos(lista);
    expect(h.map((x) => x.id)).toEqual(["1", "3"]);
    expect(h[0].respuestas.map((x) => x.id)).toEqual(["2"]);
    expect(h[1].respuestas.map((x) => x.id)).toEqual(["4"]);
  });

  it("una respuesta nueva a un comentario atendido saca la conversación entera a pendientes", () => {
    const c = conversaciones(lista, { estado: "pendientes" });
    expect(c.map((x) => x.id)).toEqual(["1", "3"]);
    expect(conversaciones(lista, { cliente: "c2", estado: "ocultos" }).map((x) => x.id)).toEqual(["3"]);
    expect(conversaciones(lista, { red: "instagram", estado: "todos" })).toHaveLength(1);
  });

  it("filtrarHilos", () => {
    const hilos = [{ id: "h1", clientId: "c1", red: "facebook", atendido: false }, { id: "h2", clientId: "c1", red: "instagram", atendido: true }];
    expect(filtrarHilos(hilos).map((h) => h.id)).toEqual(["h1"]);
    expect(filtrarHilos(hilos, { estado: "todos", red: "instagram" }).map((h) => h.id)).toEqual(["h2"]);
  });

  it("totalPendientes", () => {
    expect(totalPendientes({ comentarios: 3, mensajes: 2 })).toBe(5);
    expect(totalPendientes(null)).toBe(0);
  });
});

describe("permisos y respuestas", () => {
  it("dice qué permisos de la bandeja faltan, o null si no se sabe", () => {
    expect(permisosQueFaltanBandeja(null)).toBeNull();
    expect(permisosQueFaltanBandeja(["pages_messaging", "instagram_manage_comments"]))
      .toEqual(["pages_manage_metadata", "pages_manage_engagement", "instagram_manage_messages"]);
  });

  it("una respuesta vacía o demasiado larga no sale", () => {
    expect(validarRespuesta("  ").ok).toBe(false);
    expect(validarRespuesta("x".repeat(TOPE_RESPUESTA + 1)).ok).toBe(false);
    expect(validarRespuesta("  ¡Gracias!  ")).toEqual({ ok: true, texto: "¡Gracias!" });
  });
});
