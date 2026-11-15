import { describe, it, expect } from "vitest";
import { diasConRespuestas, respuestasDeFilas, listaSinAprobar } from "./aprobacion.js";
import { aprobadasSinProgramar } from "./cola.js";
import { resumenCalendario } from "./resumenCliente.js";

// Lo que respondió el cliente (las filas de `approvals`) aplicado fuera de la pantalla del mes: Claude, el informe, el
// Inicio y «Programar lo aprobado» lo leen igual que el calendario abierto.

const dias = [{ date: "2030-01-02", posts: [
  { id: "a", status: "pending", medios: [{ src: "/api/media/clientes/c/x.jpg", tipo: "imagen" }] },
  { id: "b", status: "pending" },
  { id: "c", status: "approved", pideAprobacionDesde: "2030-01-01T10:00:00.000Z" },
] }];
const filas = [
  { post_id: "a", estado: "aprobado", comentario: "", tipo: "pieza", updated_at: "2030-01-01T12:00:00.000Z" },
  { post_id: "b", estado: "cambios", comentario: "Otra foto", reviewer_name: "Ana", updated_at: "2030-01-01T12:00:00.000Z" },
  // Respondida ANTES de que se le volviera a pedir: ya no cuenta.
  { post_id: "c", estado: "cambios", comentario: "x", updated_at: "2030-01-01T09:00:00.000Z" },
];

describe("diasConRespuestas", () => {
  it("con las filas, un Map o una función: lo que respondió el cliente manda sobre el status guardado", () => {
    for (const r of [filas, respuestasDeFilas(filas), (id) => respuestasDeFilas(filas).get(id)]) {
      const [a, b, c] = diasConRespuestas(dias, r)[0].posts;
      expect(a).toMatchObject({ status: "approved", aprobadaComo: "pieza" });
      expect(b).toMatchObject({ status: "rejected", cambiosPedidos: "Otra foto" });
      expect(c.status).toBe("approved");
    }
    expect(diasConRespuestas(dias, null)[0].posts[0].status).toBe("pending");
    expect(diasConRespuestas(null, filas)).toEqual([]);
  });
});

describe("¿aprueba antes de publicar?", () => {
  const img = { medios: [{ src: "x.jpg", tipo: "imagen" }] };
  it("listaSinAprobar: con su pieza y sin cambios pedidos, aunque no esté aprobada", () => {
    expect(listaSinAprobar({ status: "pending", ...img })).toBe(true);
    expect(listaSinAprobar({ status: "pending" })).toBe(false);
    expect(listaSinAprobar({ status: "rejected", ...img })).toBe(false);
    expect(listaSinAprobar({ status: "pending", format: "live", ...img })).toBe(false);
    expect(listaSinAprobar({ status: "pending", asistida: true, ...img })).toBe(false);
  });

  it("aprobadasSinProgramar: con `sinAprobar` toma lo listo; sin él, sólo lo aprobado como pieza (lo de siempre)", () => {
    const mes = [{ date: "2030-01-05", posts: [{ id: "lista", status: "pending", ...img }, { id: "aprobada", status: "approved", ...img }, { id: "sin-pieza", status: "pending" }] }];
    expect(aprobadasSinProgramar(mes, [], "2030-01-01").map((x) => x.post.id)).toEqual(["aprobada"]);
    expect(aprobadasSinProgramar(mes, [], "2030-01-01", { sinAprobar: true }).map((x) => x.post.id)).toEqual(["lista", "aprobada"]);
  });
});

describe("el Inicio cuenta con lo que respondió el cliente", () => {
  it("resumenCalendario con las respuestas del espacio («calendario:publicación»)", () => {
    const cal = { id: "cal1", days: dias };
    const respuestas = new Map([...respuestasDeFilas(filas)].map(([id, r]) => [`cal1:${id}`, r]));
    expect(resumenCalendario(cal)).toMatchObject({ aprobadas: 1, conCambios: 0, porAprobar: 2 });
    expect(resumenCalendario(cal, respuestas)).toMatchObject({ aprobadas: 2, conCambios: 1, porAprobar: 0 });
  });
});
