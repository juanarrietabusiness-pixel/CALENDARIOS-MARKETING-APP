import { describe, it, expect } from "vitest";
import { estadoDelChip, miniaturaDe, ESTADOS_CHIP } from "./estadoChip.js";

const img = { src: "/api/media/clientes/c/a.jpg", tipo: "imagen" };
const vid = { src: "/api/media/clientes/c/v.mp4", tipo: "video" };

describe("el estado del chip del mes", () => {
  it("lo que falló en redes manda sobre todo", () => {
    expect(estadoDelChip({ status: "approved" }, { estado: "error" })).toBe("fallo");
    expect(estadoDelChip({ status: "published" }, { estado: "error" })).toBe("fallo");
  });
  it("publicada, por el calendario o por la cola", () => {
    expect(estadoDelChip({ status: "published" })).toBe("publicada");
    expect(estadoDelChip({ status: "approved" }, { estado: "publicada" })).toBe("publicada");
  });
  it("programada va antes que aprobada", () => {
    expect(estadoDelChip({ status: "approved" }, { estado: "programada" })).toBe("programada");
  });
  it("cambios, aprobada, idea aprobada y pendiente", () => {
    expect(estadoDelChip({ status: "rejected" })).toBe("cambios");
    expect(estadoDelChip({ status: "approved" })).toBe("aprobada");
    expect(estadoDelChip({ status: "approved", aprobadaComo: "idea" })).toBe("idea-aprobada");
    expect(estadoDelChip({ status: "pending" })).toBe("pendiente");
    expect(estadoDelChip({})).toBe("pendiente");
  });
  it("cada estado posible está en la leyenda", () => {
    const posibles = [
      estadoDelChip({}, { estado: "error" }), estadoDelChip({ status: "published" }), estadoDelChip({}, { estado: "programada" }),
      estadoDelChip({ status: "rejected" }), estadoDelChip({ status: "approved" }), estadoDelChip({ status: "approved", aprobadaComo: "idea" }),
      estadoDelChip({}),
    ];
    expect(Object.keys(ESTADOS_CHIP).sort()).toEqual([...new Set(posibles)].sort());
  });

  it("los iconos que pidió la agencia: aprobada con la mano, programada con el reloj, publicada con ✓", () => {
    expect(ESTADOS_CHIP.aprobada.icono).toBe("thumbsUp");
    expect(ESTADOS_CHIP.programada.icono).toBe("clock");
    expect(ESTADOS_CHIP.publicada.icono).toBe("check");
  });
});

describe("la miniatura del chip", () => {
  it("la primera imagen, aunque haya un video delante", () => {
    expect(miniaturaDe({ medios: [vid, img] })).toEqual({ src: img.src, video: false });
  });
  it("de un video, su portada; sin portada, sólo que es video", () => {
    expect(miniaturaDe({ medios: [vid], portada: "/api/media/clientes/c/p.jpg" })).toEqual({ src: "/api/media/clientes/c/p.jpg", video: true });
    expect(miniaturaDe({ medios: [vid] })).toEqual({ src: null, video: true });
  });
  it("sin nada subido no hay miniatura: es una idea", () => {
    expect(miniaturaDe({ idea: "algo" })).toBeNull();
    expect(miniaturaDe({ image: img.src })).toEqual({ src: img.src, video: false });
  });
});
