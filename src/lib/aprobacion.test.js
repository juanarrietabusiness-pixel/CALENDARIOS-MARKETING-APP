import { describe, it, expect } from "vitest";
import {
  tipoAprobacion, huellaPieza, aprobacionVigente, conAprobacion, porProducir, listaParaProgramar,
  cambiosTrasAprobar, avisoCambios, pedirAprobacion, resumenEnvio, aprobadasDelEspacio,
  corregidaTrasCambios, estadoDelEnvio, mensajeDeEnvio, instruccionDelCliente,
  elegirAprobacion, aprobacionAutomatica, ideaAprobadaConPieza, motivoParaNoContar, contadaComoPieza,
} from "./aprobacion.js";
import { publicacionParaCliente } from "./publicacion.js";
import { postConPiezas } from "./galeriaPura.js";

const IMG = { src: "/api/media/clientes/c1/a.jpg", tipo: "imagen" };

describe("qué se le pide al cliente", () => {
  it("sin elegir: pieza si hay archivo, idea si no", () => {
    expect(tipoAprobacion({})).toBe("idea");
    expect(tipoAprobacion({ medios: [IMG] })).toBe("pieza");
  });

  it("la «idea» que puso el SISTEMA se va sola cuando llega la pieza; la que escogió una PERSONA se queda", () => {
    // Sin archivo, la marca del sistema (el lote, una copia repetida, lo de antes) vale: es una idea.
    expect(tipoAprobacion({ aprobacion: "idea" })).toBe("idea");
    // Con archivo y sin elección de nadie: pieza. Es lo de Feria del Lente: el cliente vio la imagen con «Idea para
    // aprobar» y su «sí» quedó «por producir» para siempre.
    expect(tipoAprobacion({ medios: [IMG], aprobacion: "idea" })).toBe("pieza");
    expect(tipoAprobacion({ image: IMG.src, aprobacion: "idea" })).toBe("pieza");
    // La que escoge una persona en «¿Qué aprueba el cliente?» se respeta con archivo.
    expect(tipoAprobacion(elegirAprobacion({ medios: [IMG] }, "idea"))).toBe("idea");
    expect(tipoAprobacion({ medios: [IMG], aprobacion: "idea", aprobacionElegida: true })).toBe("idea");
    // «pieza» puesta vale siempre (la pide una persona con «Pedir aprobación de la pieza»).
    expect(tipoAprobacion({ aprobacion: "pieza" })).toBe("pieza");
    // Una marca que no es ninguna de las dos: lo de siempre.
    expect(tipoAprobacion({ medios: [IMG], aprobacion: "otra", aprobacionElegida: true })).toBe("pieza");
  });

  it("vale por TODOS los caminos por los que llega la pieza, sin acordarse en cada uno", () => {
    // Una idea del lote («Sólo las ideas al calendario», de antes, con su marca) que recibe su imagen por el chat, el
    // MCP, el Estudio o el servidor (`postConPiezas`).
    const idea = { id: "p1", format: "post", status: "pending", aprobacion: "idea", title: "Lentes" };
    const { post } = postConPiezas(idea, [{ src: IMG.src, mime: "image/png", ancho: 1080, alto: 1350 }], "reemplazar");
    expect(tipoAprobacion(post)).toBe("pieza");
    // Y lo que ve el cliente en su enlace sale de la MISMA regla: ya no le dice «Idea para aprobar».
    expect(publicacionParaCliente(post).aprobacion).toBe("pieza");
    expect(publicacionParaCliente(idea).aprobacion).toBe("idea");
    expect(publicacionParaCliente(elegirAprobacion(post, "idea")).aprobacion).toBe("idea");
    // Y la marca de la persona no sale al cliente.
    expect(publicacionParaCliente(elegirAprobacion(post, "idea"))).not.toHaveProperty("aprobacionElegida");
  });

  it("lo que escoge una persona lleva su marca; «Elegido solo» sólo cuando no lo escogió nadie", () => {
    expect(elegirAprobacion({ id: "1" }, "idea")).toEqual({ id: "1", aprobacion: "idea", aprobacionElegida: true });
    expect(elegirAprobacion({ id: "1" }, "otra")).toEqual({ id: "1" });
    expect(aprobacionAutomatica({})).toBe(true);
    expect(aprobacionAutomatica({ aprobacion: "idea" })).toBe(true);
    expect(aprobacionAutomatica({ aprobacion: "idea", aprobacionElegida: true })).toBe(false);
    expect(aprobacionAutomatica({ aprobacion: "pieza" })).toBe(false);
    // «Pedir aprobación de la pieza» también es de una persona.
    expect(pedirAprobacion({ id: "1" }, "2026-11-06T00:00:00Z", "idea")).toMatchObject({ aprobacion: "idea", aprobacionElegida: true });
  });

  it("el resumen del envío cuenta lo que falta por aprobar", () => {
    expect(resumenEnvio([{ posts: [{ status: "pending" }, { status: "pending", medios: [IMG] }, { status: "approved" }] }]))
      .toEqual({ idea: 1, pieza: 1 });
  });
});

describe("la respuesta del cliente", () => {
  const review = { estado: "aprobado", tipo: "idea", huella: "h", timestamp: "2026-10-01T10:00:00Z" };

  it("una idea aprobada queda por producir, no por programar", () => {
    const p = conAprobacion({ id: "1" }, review);
    expect(p.status).toBe("approved");
    expect(porProducir(p)).toBe(true);
    expect(listaParaProgramar(p)).toBe(false);
  });

  it("una pieza aprobada (o sin tipo, de antes) está lista para programar", () => {
    expect(listaParaProgramar(conAprobacion({ id: "1" }, { ...review, tipo: "pieza" }))).toBe(true);
    expect(listaParaProgramar(conAprobacion({ id: "1", medios: [IMG] }, { ...review, tipo: null }))).toBe(true);
    // Lo subido con «Subir»: aprobada sin pasar por el cliente.
    expect(listaParaProgramar({ status: "approved", subidaRapida: true })).toBe(true);
    expect(listaParaProgramar({ status: "approved", asistida: true })).toBe(false);
  });

  it("pedir otra vez la aprobación invalida lo que respondió antes", () => {
    const p = pedirAprobacion({ id: "1", status: "approved", aprobadaComo: "idea" }, "2026-10-02T00:00:00Z");
    expect(p).toMatchObject({ status: "pending", aprobacion: "pieza", pideAprobacionDesde: "2026-10-02T00:00:00Z" });
    expect(p.aprobadaComo).toBeUndefined();
    expect(aprobacionVigente(p, review)).toBeNull();
    expect(conAprobacion(p, review).status).toBe("pending");
    expect(aprobacionVigente(p, { ...review, timestamp: "2026-10-03T00:00:00Z" })).toBeTruthy();
  });

  it("«cambios» marca la publicación; una publicada no la pisa nadie", () => {
    expect(conAprobacion({ id: "1" }, { estado: "cambios" }).status).toBe("rejected");
    expect(conAprobacion({ id: "1", status: "published" }, review).status).toBe("published");
  });
});

describe("lo que cambió después del sí", () => {
  const base = { id: "1", descripcion: "Hola", hashtagsFinales: "#a" };
  const aprobada = { ...base, status: "approved", aprobadaComo: "pieza", huellaAprobada: huellaPieza(base), aprobadaAt: "2026-10-01T10:00:00Z" };

  it("nada: sin aviso", () => {
    expect(cambiosTrasAprobar(aprobada)).toEqual([]);
    expect(avisoCambios(aprobada)).toBe("");
  });

  it("el texto y los archivos, en palabras", () => {
    expect(cambiosTrasAprobar({ ...aprobada, descripcion: "Adiós" })).toEqual(["el texto"]);
    expect(avisoCambios({ ...aprobada, descripcion: "Adiós", mediosCambiadosAt: "2026-10-02T00:00:00Z" }))
      .toBe("Cambiaste el texto y los archivos después de que el cliente la aprobara.");
  });

  it("los archivos cambiados ANTES de aprobar no cuentan", () => {
    expect(cambiosTrasAprobar({ ...aprobada, mediosCambiadosAt: "2026-09-30T00:00:00Z" })).toEqual([]);
  });
});

describe("lo aprobado de todo el espacio", () => {
  const cal = (posts, date = "2026-10-10") => ({ id: "cal1", client_id: "c1", name: "Octubre", days: JSON.stringify([{ date, posts }]) });

  it("reparte por programar y por producir, y salta lo que ya está en la cola o ya pasó", () => {
    const r = aprobadasDelEspacio({
      calendarios: [cal([{ id: "a", medios: [IMG] }, { id: "b" }, { id: "c", medios: [IMG] }]), { ...cal([{ id: "d", medios: [IMG] }], "2026-09-01"), id: "cal2" }],
      aprobaciones: [
        { calendar_id: "cal1", post_id: "a", estado: "aprobado", tipo: "pieza", updated_at: "x" },
        { calendar_id: "cal1", post_id: "b", estado: "aprobado", tipo: "idea", updated_at: "x" },
        { calendar_id: "cal1", post_id: "c", estado: "aprobado", tipo: "pieza", updated_at: "x" },
        { calendar_id: "cal2", post_id: "d", estado: "aprobado", tipo: "pieza", updated_at: "x" },
      ],
      filas: [{ calendar_id: "cal1", post_id: "c", estado: "programada" }],
      clientes: { c1: "Café Luna" },
    }, "2026-10-01");
    expect(r.porProgramar.map((x) => x.postId)).toEqual(["a"]);
    expect(r.porProducir.map((x) => x.postId)).toEqual(["b"]);
    expect(r.porProgramar[0].cliente).toBe("Café Luna");
  });
});

describe("el calendario completo al cliente, y lo que pidió cambiar", () => {
  it("«cambios» trae lo que pidió y cuándo; reenviar lo olvida", () => {
    const p = conAprobacion({ id: "1" }, { estado: "cambios", comentario: " Más luz ", timestamp: "2026-10-05T10:00:00Z" });
    expect(p).toMatchObject({ status: "rejected", cambiosPedidos: "Más luz", cambiosAt: "2026-10-05T10:00:00Z" });
    const otra = pedirAprobacion(p, "2026-10-06T00:00:00Z");
    expect(otra.cambiosPedidos).toBeUndefined();
    expect(otra.cambiosAt).toBeUndefined();
  });

  it("corregida: se cambió algo DESPUÉS de que pidiera cambios", () => {
    const p = { status: "rejected", cambiosAt: "2026-10-05T10:00:00Z" };
    expect(corregidaTrasCambios(p)).toBe(false);
    expect(corregidaTrasCambios({ ...p, actualizadaAt: "2026-10-04T10:00:00Z" })).toBe(false);
    expect(corregidaTrasCambios({ ...p, actualizadaAt: "2026-10-06T10:00:00Z" })).toBe(true);
  });

  it("el estado del envío: piezas, sin pieza, sin hora, por corregir y corregidas", () => {
    const days = [{ posts: [
      { status: "pending", medios: [IMG], publishTime: "09:00" },
      { status: "pending" },
      { status: "pending", format: "live" },
      { status: "approved", medios: [IMG] },
      { status: "published" },
      { status: "rejected", medios: [IMG], publishTime: "10:00", cambiosAt: "2026-10-05" },
      { status: "rejected", medios: [IMG], publishTime: "10:00", cambiosAt: "2026-10-05", actualizadaAt: "2026-10-06" },
    ] }];
    expect(estadoDelEnvio(days)).toEqual({ total: 4, conPieza: 3, sinPieza: 1, sinHora: 1, porCorregir: 1, corregidas: 1 });
  });

  it("el mensaje dice qué se corrigió cuando ya revisó", () => {
    expect(mensajeDeEnvio({ nombre: "Dcasa", mes: "Noviembre 2026", url: "u", corregidas: 2, revisado: true })).toContain("2 publicaciones");
    expect(mensajeDeEnvio({ nombre: "Dcasa", mes: "Noviembre 2026", url: "u", corregidas: 2 })).toContain("para tu revisión");
  });

  it("la indicación de la edición: lo que pidió el cliente y lo que añada la agencia", () => {
    expect(instruccionDelCliente("Más luz")).toBe("el cliente pidió este cambio: «Más luz». Haz SÓLO ese cambio");
    expect(instruccionDelCliente("Más luz", "sin la planta")).toContain("y además sin la planta");
    expect(instruccionDelCliente("", "fondo azul")).toBe("haz este cambio: fondo azul. Haz SÓLO ese cambio");
    expect(instruccionDelCliente("", "")).toBe("");
  });
});

describe("lo ya aprobado como idea que tiene su pieza: «El cliente vio la pieza: contarla como aprobada»", () => {
  const review = { estado: "aprobado", tipo: "idea", huella: "h", timestamp: "2026-11-05T10:00:00Z" };
  const conPieza = { id: "p1", format: "post", medios: [IMG], descripcion: "Hola", aprobacion: "idea" };

  it("se reconoce: idea aprobada con archivo (sin archivo es «por producir» de verdad)", () => {
    expect(ideaAprobadaConPieza(conAprobacion(conPieza, review))).toBe(true);
    expect(ideaAprobadaConPieza(conAprobacion({ id: "p1" }, review))).toBe(false);
    expect(ideaAprobadaConPieza(conAprobacion(conPieza, { ...review, tipo: "pieza" }))).toBe(false);
  });

  it("el servidor sólo la cuenta con un «sí» que siga valiendo, a una publicación con su archivo y sin publicar", () => {
    expect(motivoParaNoContar(conPieza, review)).toBeNull();
    expect(motivoParaNoContar(null, review)).toMatch(/ya no está/);
    expect(motivoParaNoContar({ ...conPieza, status: "published" }, review)).toMatch(/ya salió/);
    expect(motivoParaNoContar({ id: "p1" }, review)).toMatch(/Todavía no tiene su pieza/);
    expect(motivoParaNoContar(conPieza, null)).toMatch(/todavía no la ha aprobado/);
    expect(motivoParaNoContar(conPieza, { ...review, estado: "cambios" })).toMatch(/pidió cambios/);
    // Se le volvió a pedir DESPUÉS de su respuesta: lo de antes no cuenta (como en `aprobacionVigente`).
    expect(motivoParaNoContar({ ...conPieza, pideAprobacionDesde: "2026-11-06T00:00:00Z" }, review)).toMatch(/volvió a pedir/);
    // La fila de D1 tal cual (con `updated_at`) también vale.
    expect(motivoParaNoContar(conPieza, { estado: "aprobado", updated_at: "2026-11-05T10:00:00Z" })).toBeNull();
  });

  it("contada, queda por programar (no por producir) y sin el aviso de «cambiaste… después»", () => {
    const antes = conAprobacion({ ...conPieza, mediosCambiadosAt: "2026-11-05T12:00:00Z" }, review);
    expect(porProducir(antes)).toBe(true);
    const despues = contadaComoPieza(antes, { huella: huellaPieza(conPieza), timestamp: "2026-11-06T09:00:00Z" });
    expect(porProducir(despues)).toBe(false);
    expect(listaParaProgramar(despues)).toBe(true);
    expect(cambiosTrasAprobar(despues)).toEqual([]);
    // Y lo que el servidor guarda en `approvals` da lo mismo al releer.
    const releida = conAprobacion(conPieza, { ...review, tipo: "pieza", huella: huellaPieza(conPieza), timestamp: "2026-11-06T09:00:00Z" });
    expect(listaParaProgramar(releida)).toBe(true);
    expect(cambiosTrasAprobar({ ...releida, mediosCambiadosAt: "2026-11-05T12:00:00Z" })).toEqual([]);
    // Si después se cambia el texto, el aviso sale como en cualquier pieza aprobada.
    expect(cambiosTrasAprobar({ ...releida, descripcion: "Otro" })).toEqual(["el texto"]);
  });
});
