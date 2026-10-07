import { describe, it, expect } from "vitest";
import { idDeCarpeta, tipoDeArchivo, tamanoLegible, horaParaNombre, carpetasDeFecha, nombreDePieza, planDrive, guardadoTras } from "./drive.js";

describe("idDeCarpeta", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-12";

  it("saca el id de cualquier forma del enlace", () => {
    expect(idDeCarpeta(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("acepta el id a secas y rechaza lo que no lo es", () => {
    expect(idDeCarpeta(`  ${ID} `)).toBe(ID);
    expect(idDeCarpeta("mi carpeta")).toBe("");
    expect(idDeCarpeta("")).toBe("");
    expect(idDeCarpeta("https://example.com/cosa")).toBe("");
  });
});

describe("tipoDeArchivo y tamanoLegible", () => {
  it("clasifica por el tipo MIME", () => {
    expect(tipoDeArchivo("application/vnd.google-apps.folder")).toBe("carpeta");
    expect(tipoDeArchivo("image/jpeg")).toBe("imagen");
    expect(tipoDeArchivo("video/quicktime")).toBe("video");
    expect(tipoDeArchivo("application/pdf")).toBe("otro");
  });

  it("escribe el tamaño en KB o MB", () => {
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(0)).toBe("");
    expect(tamanoLegible(3.5 * 1048576)).toMatch(/^3[,.]5 MB$/);
  });
});

describe("guardar en Drive por mes y semana", () => {
  const m = (ruta) => ({ src: `/api/media/clientes/c1/${ruta}` });

  it("la hora, las carpetas y el nombre como los pone la agencia", () => {
    expect(horaParaNombre("08:00")).toBe("8 am");
    expect(horaParaNombre("13:30")).toBe("1.30 pm");
    expect(horaParaNombre("00:05")).toBe("12.05 am");
    expect(horaParaNombre("")).toBe("");
    expect(horaParaNombre("9am")).toBe("");
    // Octubre de 2026 empieza en jueves: el martes 6 es de la semana 2.
    expect(carpetasDeFecha("2026-10-06")).toEqual(["Octubre 2026", "Semana 2"]);
    expect(carpetasDeFecha("2026-10-04")).toEqual(["Octubre 2026", "Semana 1"]);
    expect(carpetasDeFecha("x")).toEqual([]);
    expect(nombreDePieza({ fecha: "2026-10-06", hora: "08:00", src: "a.jpg" })).toBe("Martes 6 - Semana 2 - 8 am.jpg");
    expect(nombreDePieza({ fecha: "2026-10-06", indice: 1, total: 3, src: "b.PNG" })).toBe("Martes 6 - Semana 2 - 2.png");
    expect(nombreDePieza({ fecha: "2026-10-06", hora: "18:00", indice: 0, historia: true, src: "v.mp4" })).toBe("Martes 6 - Semana 2 - 6 pm - historia 1.mp4");
  });

  it("el plan: un carrusel con su número, lo de Drive también, y nada de fuera", () => {
    const post = { publishTime: "08:00", medios: [m("posts/a.jpg"), m("drive/b.jpg"), { src: "https://otro.sitio/x.jpg" }], historias: [m("posts/h.jpg")] };
    const plan = planDrive(post, "2026-10-06");
    expect(plan.subir.map((p) => p.nombre)).toEqual(["Martes 6 - Semana 2 - 8 am - 1.jpg", "Martes 6 - Semana 2 - 8 am - 2.jpg", "Martes 6 - Semana 2 - 8 am - historia 1.jpg"]);
    expect(plan.subir[0].carpetas).toEqual(["Octubre 2026", "Semana 2"]);
    expect(plan).toMatchObject({ quitar: [], guardadas: 0, total: 3 });
    expect(planDrive({ image: "/api/media/clientes/c1/posts/v.jpg" }, "2026-10-06").subir).toHaveLength(1);
    expect(planDrive({}, "2026-10-06").total).toBe(0);
  });

  it("lo guardado no se sube dos veces; lo que cambió de hora se sube y la copia vieja se reemplaza", () => {
    const post = { publishTime: "08:00", medios: [m("posts/a.jpg")] };
    const guardadoDrive = guardadoTras(post, "2026-10-06", [{ src: m("posts/a.jpg").src, id: "drive-a", ruta: "Octubre 2026/Semana 2/Martes 6 - Semana 2 - 8 am.jpg" }]);
    expect(planDrive({ ...post, guardadoDrive }, "2026-10-06")).toMatchObject({ subir: [], quitar: [], guardadas: 1 });
    const movida = { ...post, publishTime: "09:00", guardadoDrive };
    const plan = planDrive(movida, "2026-10-06");
    expect(plan.subir).toEqual([expect.objectContaining({ nombre: "Martes 6 - Semana 2 - 9 am.jpg", reemplaza: "drive-a" })]);
    // Si la nueva no sube, se queda apuntada la de antes (no se mandó a la papelera).
    expect(guardadoTras(movida, "2026-10-06", [])).toEqual(guardadoDrive);
  });

  it("un archivo que la publicación ya no tiene se quita", () => {
    const guardadoDrive = { [m("posts/viejo.jpg").src]: { id: "drive-viejo", ruta: "x" } };
    const post = { medios: [m("posts/nuevo.jpg")], guardadoDrive };
    expect(planDrive(post, "2026-10-06").quitar).toEqual(["drive-viejo"]);
    expect(guardadoTras(post, "2026-10-06", [{ src: m("posts/nuevo.jpg").src, id: "n", ruta: "r" }])).toEqual({ [m("posts/nuevo.jpg").src]: { id: "n", ruta: "r" } });
  });
});
