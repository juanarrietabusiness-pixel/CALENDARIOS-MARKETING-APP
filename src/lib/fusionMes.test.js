import { describe, it, expect } from "vitest";
import { fusionarGuardado } from "./fusionMes.js";

// Un mes con dos días. La BASE es lo que leí; lo MÍO, lo que quiero guardar; lo SUYO, lo que guardó otra persona.
const mes = (days, extra = {}) => ({ id: "oct", dbId: "oct", month: 9, year: 2026, campaign: "Otoño", offers: "", days, opciones: {}, updatedAt: "v1", ...extra });
const post = (id, campos = {}) => ({ id, format: "post", title: id, status: "pending", ...campos });
const dia = (date, posts, extra = {}) => ({ date, dayName: "Lunes", concept: "", posts, ...extra });
const BASE = mes([dia("2026-10-05", [post("a"), post("b")]), dia("2026-10-07", [post("c")])]);
const copia = (x) => structuredClone(x);
const ids = (cal) => cal.days.map((d) => `${d.date}:${d.posts.map((p) => p.id).join(",")}`);
const buscar = (cal, id) => cal.days.flatMap((d) => d.posts).find((p) => p.id === id);

describe("juntar lo mío con lo que guardó otra persona en el mismo mes", () => {
  it("lo que cambiamos en publicaciones distintas se queda todo", () => {
    const mio = copia(BASE);
    mio.days[0].posts[0].descripcion = "Mi texto";
    const suyo = { ...copia(BASE), updatedAt: "v2" };
    suyo.days[1].posts[0].publishTime = "09:00";
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(buscar(r, "a").descripcion).toBe("Mi texto");
    expect(buscar(r, "c").publishTime).toBe("09:00");
    expect(r.updatedAt).toBe("v2");
  });

  it("en la MISMA publicación, campo a campo: cada uno conserva el suyo", () => {
    const mio = copia(BASE);
    mio.days[0].posts[0].publishTime = "18:00";
    const suyo = copia(BASE);
    suyo.days[0].posts[0].medios = [{ src: "/api/media/clientes/c1/estudio/x.png", tipo: "imagen" }];
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(buscar(r, "a")).toMatchObject({ publishTime: "18:00", medios: [{ tipo: "imagen" }] });
  });

  it("si los dos cambiamos el mismo campo, gana lo mío (es lo que estoy viendo)", () => {
    const mio = copia(BASE);
    mio.days[0].posts[0].title = "Mío";
    const suyo = copia(BASE);
    suyo.days[0].posts[0].title = "Suyo";
    expect(buscar(fusionarGuardado(BASE, mio, suyo), "a").title).toBe("Mío");
  });

  it("una publicación que añadió la otra persona no desaparece, y la mía entra", () => {
    const mio = copia(BASE);
    mio.days[1].posts.push(post("mia"));
    mio.days.push(dia("2026-10-20", [post("nueva-mia")]));
    const suyo = copia(BASE);
    suyo.days[0].posts.push(post("suya"));
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(ids(r)).toEqual(["2026-10-05:a,b,suya", "2026-10-07:c,mia", "2026-10-20:nueva-mia"]);
  });

  it("lo que quité yo se va; lo que quité y la otra persona cambió entremedias, se queda", () => {
    const mio = copia(BASE);
    mio.days[0].posts = [];
    const suyo = copia(BASE);
    suyo.days[0].posts[1].descripcion = "La estaba escribiendo";
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(buscar(r, "a")).toBeUndefined();
    expect(buscar(r, "b").descripcion).toBe("La estaba escribiendo");
  });

  it("lo que quitó o se llevó a otro mes la otra persona no vuelve, aunque yo la tocara", () => {
    const mio = copia(BASE);
    mio.days[1].posts[0].title = "Cambio mío";
    const suyo = copia(BASE);
    suyo.days = [suyo.days[0]];
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(buscar(r, "c")).toBeUndefined();
    expect(ids(r)).toEqual(["2026-10-05:a,b"]);
  });

  it("muevo una de día y la otra persona le cambia el texto: queda en mi día y con su texto", () => {
    const mio = copia(BASE);
    const [b] = mio.days[0].posts.splice(1, 1);
    mio.days[1].posts.push(b);
    const suyo = copia(BASE);
    suyo.days[0].posts[1].descripcion = "Su texto";
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(ids(r)).toEqual(["2026-10-05:a", "2026-10-07:c,b"]);
    expect(buscar(r, "b").descripcion).toBe("Su texto");
  });

  it("si la movió la otra persona y yo no, queda donde la puso", () => {
    const mio = copia(BASE);
    mio.days[0].posts[0].title = "Retoque";
    const suyo = copia(BASE);
    const [a] = suyo.days[0].posts.splice(0, 1);
    suyo.days[1].posts.push(a);
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(ids(r)).toEqual(["2026-10-05:b", "2026-10-07:c,a"]);
    expect(buscar(r, "a").title).toBe("Retoque");
  });

  it("lo del mes y cada clave de las opciones: lo mío donde lo cambié, lo suyo en lo demás", () => {
    const base = mes(BASE.days, { opciones: { fechaLimite: "2026-10-01", estrategia: { objetivo: "vender" } } });
    const mio = { ...copia(base), campaign: "Mi campaña", opciones: { ...base.opciones, fechaLimite: "2026-10-03" } };
    const suyo = { ...copia(base), offers: "2x1", opciones: { ...base.opciones, estrategia: { objetivo: "crecer" }, enviadoAt: "x" } };
    const r = fusionarGuardado(base, mio, suyo);
    expect(r).toMatchObject({ campaign: "Mi campaña", offers: "2x1" });
    expect(r.opciones).toEqual({ fechaLimite: "2026-10-03", estrategia: { objetivo: "crecer" }, enviadoAt: "x" });
  });

  it("lo de cada día (el concepto) también va por quién lo cambió", () => {
    const mio = copia(BASE);
    mio.days[0].concept = "Mi concepto";
    const suyo = copia(BASE);
    suyo.days[1].concept = "Su concepto";
    const r = fusionarGuardado(BASE, mio, suyo);
    expect(r.days.map((d) => d.concept)).toEqual(["Mi concepto", "Su concepto"]);
  });

  it("sin base no se sabe qué cambié yo: se guarda lo mío tal cual, como antes", () => {
    const mio = copia(BASE);
    expect(fusionarGuardado(null, mio, mes([]))).toBe(mio);
  });

  it("no toca las versiones que recibe", () => {
    const mio = copia(BASE);
    mio.days[0].posts.push(post("x"));
    const suyo = copia(BASE);
    const antes = JSON.stringify([mio, suyo]);
    fusionarGuardado(BASE, mio, suyo);
    expect(JSON.stringify([mio, suyo])).toBe(antes);
  });
});
