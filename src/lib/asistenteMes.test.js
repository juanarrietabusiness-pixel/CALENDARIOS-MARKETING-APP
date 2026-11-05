import { describe, it, expect } from "vitest";
import {
  PASO_MES, limpiarAsistente, conAsistente, estadoDelMes, pasoQueToca, casillasDelMes, publicacionDeCasilla, conCasillas, horasEnBloque,
  avanceDelMes, paraDisenar,
} from "./asistenteMes.js";
import { ritmoDelMes } from "./pilares.js";

// ============================================================
// El asistente del mes (fase 6): el paso que le toca a un mes, las casillas
// del plan semanal, ponerlas sin pisar lo que hay y las horas en bloque.
// ============================================================

const semana = {
  dias: {
    0: [],
    1: [{ format: "post", pilar: "anuncio", hora: "09:00" }, { format: "reel", pilar: "humano", rostro: true, hora: "18:30" }],
    2: [{ format: "carrusel", pilar: "beneficios" }],
    3: [], 4: [], 5: [], 6: [],
  },
};
const cal = (posts = [], opciones = {}) => ({ id: "k", year: 2026, month: 10, opciones, days: posts.length ? [{ date: "2026-11-02", posts }] : [] });

describe("el paso que le toca al mes", () => {
  it("un mes vacío empieza por la estrategia; con estrategia, por el plan", () => {
    expect(pasoQueToca(cal())).toBe(PASO_MES.estrategia);
    expect(pasoQueToca({ ...cal(), campaign: "Noviembre en casa" })).toBe(PASO_MES.plan);
  });

  it("con casillas sin idea o ideas por aprobar, las ideas; con aprobadas sin pieza, diseñar; si no, revisar y enviar", () => {
    expect(pasoQueToca(cal([{ id: "a", format: "post", idea: "" }]))).toBe(PASO_MES.ideas);
    expect(pasoQueToca(cal([{ id: "a", format: "post", idea: "Sofá cama" }]))).toBe(PASO_MES.ideas);
    expect(pasoQueToca(cal([{ id: "a", format: "post", idea: "Sofá cama", etapa: "produccion" }]))).toBe(PASO_MES.disenar);
    // Un UGC aprobado no se diseña con IA: se graba.
    expect(paraDisenar({ format: "reel", rostro: true, etapa: "produccion" })).toBe(false);
    expect(pasoQueToca(cal([{ id: "a", format: "post", idea: "x", medios: [{ src: "/api/media/clientes/c/a.jpg", tipo: "imagen" }] }]))).toBe(PASO_MES.enviar);
  });

  it("si se guardó un paso anterior, se vuelve ahí; nunca más allá de lo que falta", () => {
    const listo = [{ id: "a", format: "post", idea: "x", medios: [{ src: "/api/media/clientes/c/a.jpg", tipo: "imagen" }] }];
    expect(pasoQueToca(cal(listo, { asistente: { paso: 0 } }))).toBe(0);
    expect(pasoQueToca(cal([{ id: "a", format: "post", idea: "" }], { asistente: { paso: 4 } }))).toBe(PASO_MES.ideas);
  });

  it("el estado y el avance: sin hora, enviado, por diseñar", () => {
    const e = estadoDelMes(cal([{ id: "a", format: "carrusel", idea: "x", etapa: "produccion" }, { id: "b", format: "reel", rostro: true, idea: "y" }], { enviadoAt: "2026-11-01" }));
    expect(e).toMatchObject({ publicaciones: 2, porDisenar: 1, paraGrabar: 1, sinHora: 2, enviado: true, porAprobar: 1 });
    expect(avanceDelMes(cal())[0]).toBe("Por hacer");
  });
});

describe("lo del asistente en el calendario", () => {
  it("se limpia y se guarda en opciones sin tocar lo demás", () => {
    expect(limpiarAsistente({ paso: 9, aceptadas: [{ fecha: "x" }, { fecha: "2026-11-03", a: "beneficios" }] })).toMatchObject({ paso: null, aceptadas: [{ fecha: "2026-11-03", a: "beneficios" }] });
    const c = conAsistente(cal([], { estrategia: { objetivo: "vender" } }), { paso: 2 }, { por: "Ana", ahora: "2026-11-05T10:00:00Z" });
    expect(c.opciones.estrategia).toEqual({ objetivo: "vender" });
    expect(c.opciones.asistente).toMatchObject({ paso: 2, por: "Ana", actualizadoAt: "2026-11-05T10:00:00Z" });
  });
});

describe("las casillas del plan", () => {
  it("salen del plan semanal con su formato, su tipo, su hora y la fecha especial; la temporada cambia la primera", () => {
    const ritmoMes = ritmoDelMes(2026, 10, { 1: "anuncio", 2: "beneficios" }, [{ fecha: "2026-11-03", a: "servicios" }]);
    const c = casillasDelMes({ year: 2026, month: 10, semana, ritmoMes, fechas: [{ fecha: "2026-11-02", nombre: "Día de los Difuntos" }] });
    expect(c.filter((x) => x.fecha === "2026-11-02")).toEqual([
      { clave: "2026-11-02|0", fecha: "2026-11-02", format: "post", pilar: "anuncio", hora: "09:00", especial: "Día de los Difuntos" },
      { clave: "2026-11-02|1", fecha: "2026-11-02", format: "reel", pilar: "humano", rostro: true, hora: "18:30", especial: "Día de los Difuntos" },
    ]);
    expect(c.find((x) => x.fecha === "2026-11-03").pilar).toBe("servicios");
    // Noviembre de 2026: 5 lunes y 4 martes.
    expect(c).toHaveLength(5 * 2 + 4);
  });

  it("no pone nada en los días ocupados (salvo que se pida) ni antes de hoy", () => {
    const ocupados = new Set(["2026-11-02"]);
    expect(casillasDelMes({ year: 2026, month: 10, semana, ocupados }).some((x) => x.fecha === "2026-11-02")).toBe(false);
    expect(casillasDelMes({ year: 2026, month: 10, semana, ocupados, llenarOcupados: true }).some((x) => x.fecha === "2026-11-02")).toBe(true);
    expect(casillasDelMes({ year: 2026, month: 10, semana, desde: "2026-11-10" }).every((x) => x.fecha >= "2026-11-10")).toBe(true);
  });

  it("se ponen en el calendario como ideas sin escribir, sin repetir y sin tocar lo que había", () => {
    const antes = cal([{ id: "ya", format: "post", idea: "La de antes" }]);
    const p = publicacionDeCasilla({ format: "reel", pilar: "humano", rostro: true, hora: "18:30" }, { id: "n1", matriz: { productoId: "p1", producto: "Sofá", nivel: "problema" } });
    expect(p).toMatchObject({ id: "n1", format: "reel", rostro: true, pilar: "humano", productoId: "p1", nivel: "problema", publishTime: "18:30", idea: "", status: "pending", delPlan: true });
    expect(p).not.toHaveProperty("aprobacion");
    const despues = conCasillas(antes, [{ fecha: "2026-11-02", post: p, especial: "Difuntos" }, { fecha: "2026-11-09", post: { ...p, id: "n2" } }, { fecha: "2026-11-09", post: { ...p, id: "n2" } }]);
    expect(despues.days.find((d) => d.date === "2026-11-02").posts.map((x) => x.id)).toEqual(["ya", "n1"]);
    expect(despues.days.find((d) => d.date === "2026-11-02").specialDate).toBe("Difuntos");
    expect(despues.days.find((d) => d.date === "2026-11-09").posts).toHaveLength(1);
  });
});

describe("las horas en bloque", () => {
  it("pone la del plan (por día y formato) o la de por defecto, y no toca lo que tiene hora ni lo publicado", () => {
    const days = [
      { date: "2026-11-02", posts: [{ id: "a", format: "post" }, { id: "b", format: "reel" }, { id: "c", format: "post", publishTime: "07:00" }] },
      { date: "2026-11-04", posts: [{ id: "d", format: "historia" }, { id: "e", format: "post", status: "published" }] },
    ];
    const r = horasEnBloque(days, { semana, porDefecto: "10:00" });
    const hora = (id) => r.days.flatMap((d) => d.posts).find((p) => p.id === id).publishTime;
    expect([hora("a"), hora("b"), hora("c"), hora("d"), hora("e")]).toEqual(["09:00", "18:30", "07:00", "10:00", undefined]);
    expect(r.cambiadas).toBe(3);
    // Sin plan ni hora por defecto, nada.
    expect(horasEnBloque(days, {}).cambiadas).toBe(0);
  });
});
