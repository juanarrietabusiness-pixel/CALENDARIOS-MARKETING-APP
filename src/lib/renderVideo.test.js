import { describe, it, expect } from "vitest";
import { cuadrosDelVideo, tramosDeAudio, armarPcm, FILTRO_MEDIR, gananciaDe, filtroDeNormalizar, BYTES_MUESTRA, leerLoudnorm, puedeRenderizar, esMp4, RENDER, medidaDeDecodificar, leerSonda, LADO_MAX_CLIP } from "./renderVideo.js";

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

  // Una toma de mentira a 10 muestras por segundo: cada muestra lleva su número (canal izquierdo), así se ve qué trozo
  // de la toma acabó en cada sitio.
  const M = 10;
  const toma = (segundos) => {
    const b = new Uint8Array(segundos * M * BYTES_MUESTRA);
    const v = new DataView(b.buffer);
    for (let i = 0; i < segundos * M; i++) { v.setInt16(i * BYTES_MUESTRA, i + 1, true); v.setInt16(i * BYTES_MUESTRA + 2, i + 1, true); }
    return b;
  };
  const muestras = (b) => Array.from({ length: b.length / BYTES_MUESTRA }, (_, i) => new DataView(b.buffer).getInt16(i * BYTES_MUESTRA, true));

  it("arma el audio copiando la toma, mete el silencio en su sitio y mide justo el total", () => {
    const fuera = armarPcm(toma(3), tramosDeAudio([{ en: 1, dur: 0.5 }]), 4, M);
    expect(muestras(fuera)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0, 0, 0, 0, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 0, 0, 0, 0, 0]);
    // Sin pausas: la toma tal cual, cortada al total.
    expect(muestras(armarPcm(toma(3), tramosDeAudio([]), 2, M))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("una pausa DESPUÉS del final de la toma (la alineación acaba más tarde que el archivo) no rompe nada", () => {
    // La toma dura 3 s y la pausa cae en 3,2 s: el trozo de voz que va detrás está vacío.
    const fuera = armarPcm(toma(3), tramosDeAudio([{ en: 1, dur: 0.2 }, { en: 3.2, dur: 0.5 }]), 4, M);
    const m = muestras(fuera);
    expect(m).toHaveLength(40);
    expect(m.slice(0, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0]);
    expect(m[31]).toBe(30); // la última muestra de la toma
    expect(m.slice(32).every((x) => x === 0)).toBe(true); // y el resto, silencio
  });

  it("sin voz, todo silencio del largo pedido", () => {
    const fuera = armarPcm(new Uint8Array(0), tramosDeAudio([]), 5, M);
    expect(fuera.length).toBe(5 * M * BYTES_MUESTRA);
    expect(fuera.every((x) => x === 0)).toBe(true);
  });

  it("el volumen: loudnorm sólo mide; la segunda pasada es una ganancia fija y, si el pico se pasaría, un limitador", () => {
    expect(FILTRO_MEDIR).toBe(`loudnorm=I=${RENDER.lufs}:TP=${RENDER.pico}:LRA=${RENDER.rango}:print_format=json`);
    // Una toma tranquila: sube 16,1 dB y el pico queda en -9,9: sin limitador.
    const tranquila = { input_i: -30.1, input_tp: -26, input_lra: 2, input_thresh: -40, target_offset: 0.3 };
    expect(gananciaDe(tranquila)).toEqual({ db: 16.1, limitar: false });
    expect(filtroDeNormalizar(tranquila)).toBe("volume=16.1dB,aresample=48000");
    // Una voz de verdad: el pico pasaría a +2 dB → limitador a -2 dB, sin nivel automático.
    const voz = { input_i: -24, input_tp: -8, input_lra: 6, input_thresh: -34, target_offset: 0 };
    expect(gananciaDe(voz)).toEqual({ db: 10, limitar: true });
    expect(filtroDeNormalizar(voz)).toBe("volume=10dB,alimiter=limit=0.794:attack=5:release=50:level=disabled,aresample=48000");
    // Nunca la segunda pasada de loudnorm (su modo dinámico con medidas rompía el ffmpeg 5.1 de la imagen), ni cadena compleja.
    for (const f of [filtroDeNormalizar(tranquila), filtroDeNormalizar(voz)]) expect(f).not.toMatch(/loudnorm|measured|asplit|concat|\[/);
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


describe("un montaje SIN habla y los clips", () => {
  it("sin habla en ninguna escena se renderiza sin locución; con habla, la sigue pidiendo", () => {
    const base = { estado: "aprobado", version: 2, aprobada_version: 2, locucion: {} };
    expect(puedeRenderizar({ ...base, guion: { escenas: [{ habla: "" }] } })).toMatchObject({ ok: true, sinVoz: true });
    expect(puedeRenderizar({ ...base, guion: { escenas: [{ habla: "Hola a todos" }] } }).ok).toBe(false);
    // Sin aprobar, ni así.
    expect(puedeRenderizar({ ...base, estado: "borrador", guion: { escenas: [{ habla: "" }] } }).ok).toBe(false);
  });

  it("la medida de decodificar: la suya, sin pasar de 1920 de lado ni agrandar, y en pares", () => {
    expect(medidaDeDecodificar({ ancho: 1080, alto: 1920 })).toEqual({ ancho: 1080, alto: 1920 });
    expect(medidaDeDecodificar({ ancho: 3840, alto: 2160 })).toEqual({ ancho: LADO_MAX_CLIP, alto: 1080 });
    expect(medidaDeDecodificar({ ancho: 641, alto: 359 })).toEqual({ ancho: 642, alto: 360 });
  });

  it("lo que dice ffprobe: un clip grabado de lado se mide girado; la carátula no es el video", () => {
    const sonda = (extra = {}) => JSON.stringify({
      streams: [
        { codec_type: "video", width: 300, height: 300, disposition: { attached_pic: 1 } },
        { codec_type: "video", width: 1920, height: 1080, duration: "12.5", ...extra },
        { codec_type: "audio" },
      ],
      format: { duration: "12.6" },
    });
    expect(leerSonda(sonda())).toEqual({ ancho: 1920, alto: 1080, duracion: 12.5, audio: true });
    expect(leerSonda(sonda({ side_data_list: [{ rotation: -90 }] }))).toMatchObject({ ancho: 1080, alto: 1920 });
    expect(leerSonda(sonda({ tags: { rotate: "90" }, duration: undefined }))).toMatchObject({ ancho: 1080, alto: 1920, duracion: 12.6 });
    expect(leerSonda(JSON.stringify({ streams: [{ codec_type: "audio" }] }))).toBeNull();
    expect(leerSonda("no es json")).toBeNull();
  });
});
