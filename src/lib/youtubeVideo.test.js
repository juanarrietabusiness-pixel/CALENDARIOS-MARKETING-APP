import { describe, it, expect } from "vitest";
import {
  capitulosDelVideo, citasDelGuion, descripcionYouTubeDelVideo, marcaDeTiempo, lineasDePortada, publicarElDesdePanama, CAPITULOS,
} from "./youtubeVideo.js";
import { bytesDe } from "./publicacion.js";
import { recursoDeVideo } from "../../worker/lib/youtube.js";

// YouTube, fase 3 (26-nov-2026): la descripción con la letra, los capítulos de los tiempos, las citas y las redes.

const fondo = (archivo) => ({ tipo: "imagen", id: "fondo", archivo, encuadre: "completo" });
const escena = (id, habla, archivo, tipo = "explicacion") => ({ id, tipo, habla, capas: archivo ? [fondo(archivo)] : [] });
const guion = {
  escenas: [
    escena("i", "", "a"), escena("l1", "Somos bendecidos, pero no lo sabemos", "a"), escena("l2", "Somos bendecidos pero no lo entendemos", "a"),
    escena("l3", "Nos unió a la vid perfecta", "b"), escena("l4", "somos santos e intachables", "b"),
    escena("l5", "Somos bendecidos, pero no lo sabemos", "c"), escena("cierre", "", null, "cierre"),
  ],
};
const linea = { escenas: [[0, 6], [6, 12], [12, 20], [20, 32], [32, 45], [45, 70], [70, 74]].map(([desde, hasta]) => ({ desde, hasta })) };

describe("los capítulos", () => {
  it("uno por sección (el mismo fondo), el primero en 0:00, cada uno de 10 s o más y el coro que vuelve con su número", () => {
    expect(capitulosDelVideo(guion, linea)).toEqual([
      { desde: 0, titulo: "Somos bendecidos, pero no lo sabemos" },
      { desde: 20, titulo: "Nos unió a la vid perfecta" },
      { desde: 45, titulo: "Somos bendecidos, pero no lo sabemos (2)" },
    ]);
  });

  it("sin los que pide YouTube (3, de 10 s o más), ninguno", () => {
    const corta = { escenas: guion.escenas.slice(0, 3) };
    expect(capitulosDelVideo(corta, { escenas: linea.escenas.slice(0, 3) })).toEqual([]);
    expect(CAPITULOS.minimos).toBe(3);
  });

  it("las marcas de tiempo como las lee YouTube", () => {
    expect(marcaDeTiempo(0)).toBe("0:00");
    expect(marcaDeTiempo(194.5)).toBe("3:14");
    expect(marcaDeTiempo(3725)).toBe("1:02:05");
  });
});

describe("las citas y la descripción", () => {
  it("las citas bíblicas que enseña el video (también en mayúsculas), sin repetir", () => {
    const g = { escenas: [{ capas: [{ tipo: "texto", texto: "Efesios 1:4" }, { tipo: "texto", texto: "EFESIOS 1:4" }, { tipo: "texto", texto: "1 Juan 4:8" }, { tipo: "texto", texto: "SOMOS SANTOS" }] }] };
    expect(citasDelGuion(g)).toEqual(["Efesios 1:4", "1 Juan 4:8"]);
  });

  it("título, capítulos, letra, citas y redes; nunca más de 5.000 bytes (se acorta la letra)", () => {
    const d = descripcionYouTubeDelVideo({
      titulo: "BENDECIDOS", capitulos: [{ desde: 0, titulo: "Intro" }, { desde: 20, titulo: "Verso" }, { desde: 45, titulo: "Coro" }],
      letra: "Somos bendecidos\npero no lo sabemos", citas: ["Efesios 1:4"], redes: { instagram: "@57dmc", whatsapp: "+507 6000-0000" },
    });
    expect(d).toMatch(/^BENDECIDOS\n\nCapítulos:\n0:00 Intro\n0:20 Verso\n0:45 Coro\n\nLetra:\nSomos bendecidos/);
    expect(d).toMatch(/Citas: Efesios 1:4/);
    expect(d).toMatch(/Instagram: https:\/\/www\.instagram\.com\/57dmc\nWhatsApp: https:\/\/wa\.me\/50760000000/);
    const larga = descripcionYouTubeDelVideo({ titulo: "X", letra: Array.from({ length: 400 }, (_, i) => `línea número ${i} de la canción`).join("\n") });
    expect(bytesDe(larga)).toBeLessThanOrEqual(5000);
    expect(larga).toMatch(/…/);
  });

  it("la portada en una o dos líneas; la hora de Panamá a UTC", () => {
    expect(lineasDePortada("BENDECIDOS")).toEqual(["BENDECIDOS"]);
    expect(lineasDePortada("SOMOS BENDECIDOS PERO NO LO SABEMOS")).toHaveLength(2);
    expect(publicarElDesdePanama("2026-12-01T19:30")).toBe("2026-12-02T00:30:00.000Z");
    expect(publicarElDesdePanama("mañana")).toBeNull();
  });
});

describe("el recurso de YouTube", () => {
  it("la categoría y, programado, privado con su hora; sin programar, como siempre", () => {
    const ahoraMs = Date.parse("2026-11-26T12:00:00Z");
    const r = recursoDeVideo({ titulo: "T", descripcion: "D", categoria: "10", publicarEl: "2026-12-02T00:30:00.000Z", ahoraMs });
    expect(r.snippet.categoryId).toBe("10");
    expect(r.status).toMatchObject({ privacyStatus: "private", publishAt: "2026-12-02T00:30:00.000Z" });
    const ya = recursoDeVideo({ titulo: "T", descripcion: "D", publicarEl: "2026-11-01T00:00:00.000Z", ahoraMs });
    expect(ya.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false });
    expect(ya.snippet.categoryId).toBe("22");
  });
});
