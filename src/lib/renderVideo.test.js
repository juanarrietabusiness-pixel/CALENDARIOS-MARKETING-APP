import { describe, it, expect } from "vitest";
import { cuadrosDelVideo, tramosDeAudio, filtroDeAudio, leerLoudnorm, puedeRenderizar, esMp4, RENDER } from "./renderVideo.js";

// ============================================================
// Lo que se decide antes de dibujar el mp4: los cuadros, el audio con los silencios, el volumen y cuándo se puede.
// ============================================================

describe("los cuadros y el audio", () => {
  it("un cuadro por cada 1/30 s del video (con los silencios ya dentro)", () => {
    expect(cuadrosDelVideo(31.833)).toBe(955);
    expect(cuadrosDelVideo(0)).toBe(1);
  });

  it("los silencios se insertan en su segundo del AUDIO, en orden, sin trozos vacíos", () => {
    expect(tramosDeAudio([{ en: 10, dur: 1 }, { en: 3.05, dur: 0.8 }, { en: 12, dur: 0 }])).toEqual([
      { tipo: "voz", desde: 0, hasta: 3.05 }, { tipo: "silencio", dur: 0.8 },
      { tipo: "voz", desde: 3.05, hasta: 10 }, { tipo: "silencio", dur: 1 },
      { tipo: "voz", desde: 10, hasta: null },
    ]);
    // Un silencio al principio no deja un trozo de voz vacío delante.
    expect(tramosDeAudio([{ en: 0, dur: 0.5 }])[0]).toEqual({ tipo: "silencio", dur: 0.5 });
    expect(tramosDeAudio([])).toEqual([{ tipo: "voz", desde: 0, hasta: null }]);
  });

  it("el filtro corta la voz, mete el silencio, rellena hasta el final y mide o aplica el volumen", () => {
    const tramos = tramosDeAudio([{ en: 3.05, dur: 0.8 }]);
    const medir = filtroDeAudio(tramos, 31.833, { normalizar: { medir: true } });
    expect(medir).toContain("asplit=2[v0][v1]");
    expect(medir).toContain("[v0]atrim=start=0:end=3.05");
    expect(medir).toContain("[v1]atrim=start=3.05,");
    expect(medir).toContain("aevalsrc=0|0:c=stereo:s=48000:d=0.8");
    expect(medir).toContain("concat=n=3:v=0:a=1,apad,atrim=end=31.833");
    expect(medir).toContain(`loudnorm=I=${RENDER.lufs}:TP=${RENDER.pico}`);
    expect(medir).toMatch(/\[mezcla\]$/);
    const medidas = { input_i: -30.1, input_tp: -12, input_lra: 2, input_thresh: -40, target_offset: 0.3 };
    const aplicar = filtroDeAudio(tramos, 31.833, { normalizar: medidas });
    expect(aplicar).toContain("measured_I=-30.1:measured_TP=-12:measured_LRA=2:measured_thresh=-40:offset=0.3:linear=true");
    expect(filtroDeAudio(tramos, 5, { conVoz: false })).toBe("aevalsrc=0|0:c=stereo:s=48000:d=5,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[mezcla]");
  });

  it("lee lo que mide loudnorm (el último bloque); el silencio («-inf») no se normaliza", () => {
    const salida = 'Stream mapping...\n[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-30.10",\n\t"input_tp" : "-12.00",\n\t"input_lra" : "2.00",\n\t"input_thresh" : "-40.20",\n\t"output_i" : "-14.02",\n\t"target_offset" : "0.30"\n}\n';
    expect(leerLoudnorm(salida)).toMatchObject({ input_i: -30.1, input_thresh: -40.2, output_i: -14.02, target_offset: 0.3 });
    expect(leerLoudnorm(salida.replace('"-30.10"', '"-inf"'))).toBeNull();
    expect(leerLoudnorm("nada")).toBeNull();
  });
});

describe("cuándo se puede renderizar", () => {
  const voz = { estado: "lista", clave: "clientes/c/voz.mp3", version: 2 };
  it("con el guion aprobado de esta versión y SU locución", () => {
    expect(puedeRenderizar({ estado: "con_voz", version: 2, aprobada_version: 2, locucion: voz }).ok).toBe(true);
    expect(puedeRenderizar({ estado: "aprobado", version: 2, aprobada_version: 2, locucion: voz }).ok).toBe(true);
    expect(puedeRenderizar({ estado: "renderizado", version: 2, aprobada_version: 2, locucion: voz }).ok).toBe(true);
    expect(puedeRenderizar({ estado: "borrador", version: 2, aprobada_version: 1, locucion: voz }).motivo).toMatch(/aprueba/);
    expect(puedeRenderizar({ estado: "aprobado", version: 2, aprobada_version: 2, locucion: {} }).motivo).toMatch(/locución/);
    expect(puedeRenderizar({ estado: "aprobado", version: 2, aprobada_version: 2, locucion: { ...voz, version: 1 } }).motivo).toMatch(/otra versión/);
    expect(puedeRenderizar({ estado: "renderizando", version: 2, aprobada_version: 2, locucion: voz }).ok).toBe(false);
  });

  it("un mp4 se reconoce por su caja «ftyp»", () => {
    expect(esMp4(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4, 5]))).toBe(true);
    expect(esMp4(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

import { publicacionesParaVideo } from "./renderVideo.js";

describe("a qué publicación va el video", () => {
  const cal = (id, days) => ({ id, days });
  const calendars = [
    cal("oct", [{ date: "2026-10-01", posts: [{ id: "vieja", format: "reel", title: "De hace un mes" }] }]),
    cal("nov", [
      { date: "2026-11-20", posts: [{ id: "p-post", format: "post", title: "Un post" }, { id: "p-reel", format: "reel", idea: "Lentes en 40 minutos" }] },
      { date: "2026-11-02", posts: [{ id: "p-antes", format: "historia", title: "Hace dos días" }] },
    ]),
  ];
  it("desde una semana antes de hoy, por fecha, y en cada día primero lo que lleva video", () => {
    const l = publicacionesParaVideo(calendars, { hoy: "2026-11-04" });
    expect(l.map((x) => x.postId)).toEqual(["p-antes", "p-reel", "p-post"]);
    expect(l[1]).toEqual({ postId: "p-reel", calendarId: "nov", fecha: "2026-11-20", etiqueta: "20 nov · Reel · Lentes en 40 minutos" });
  });
  it("la ya ligada sale siempre, aunque sea vieja", () => {
    expect(publicacionesParaVideo(calendars, { hoy: "2026-11-04", ligada: "vieja" })[0].postId).toBe("vieja");
    // Aunque no quepa en el tope, entra (delante).
    expect(publicacionesParaVideo(calendars, { hoy: "2026-11-04", ligada: "p-post", max: 1 }).map((x) => x.postId)).toEqual(["p-post", "p-antes"]);
  });
});
