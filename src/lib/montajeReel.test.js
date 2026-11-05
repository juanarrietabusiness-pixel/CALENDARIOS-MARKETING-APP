import { describe, it, expect } from "vitest";
import { repartirLocucion, hablaDePlanos, ganchoDe, llamadoDe, guionDeMontaje, sePuedeMontar, textoDelGuionReel, LLAMADO_POR_DEFECTO } from "./montajeReel.js";
import { validarGuion, tieneHabla, lineaDeTiempo } from "./videoEscenas.js";
import { duracionesDeReel, duracionDeClip, haceDuracion, rutaDeDuracion, DURACIONES_OBJETIVO } from "./duracionesVideo.js";
import { modeloPorId } from "./estudioCatalogo.js";
import { rellenarVacios, conVideoEnPost } from "./resultadoEnPost.js";
import { pedidoDeVideo, pedidoDeFotogramaReel } from "./reelPedidos.js";
import { resultadoDeReel } from "./encargoReelPuro.js";

const PLANOS = [
  { n: 1, desde: 0, hasta: 3, escena: "El bebé llora", camara: "Acercamiento" },
  { n: 2, desde: 3, hasta: 6, escena: "La mamá abre la caja", camara: "Fija" },
  { n: 3, desde: 6, hasta: 10, escena: "El bebé sonríe", camara: "Abre" },
];
const LOCUCION = "¿Tu bebé tiene la piel sensible? Los wipes Nateen la cuidan desde el primer uso, sin alcohol. Escríbenos y pídelos hoy.";

describe("la locución repartida por planos", () => {
  it("en proporción a lo que dura cada plano, sin perder ni repetir palabras, cortando en un signo si está cerca", () => {
    const partes = repartirLocucion(LOCUCION, PLANOS);
    expect(partes).toHaveLength(3);
    expect(partes.join(" ")).toBe(LOCUCION);
    expect(partes[0]).toBe("¿Tu bebé tiene la piel sensible?");
    expect(partes[2]).toMatch(/pídelos hoy\.$/);
  });
  it("lo que el guion dice de cada plano manda sobre el reparto", () => {
    const planos = PLANOS.map((p, i) => ({ ...p, dice: ["Uno.", "", "Tres."][i] }));
    expect(hablaDePlanos({ planos, locucion: LOCUCION })).toEqual(["Uno.", "", "Tres."]);
  });
  it("sin voz, todo vacío", () => {
    expect(repartirLocucion("", PLANOS)).toEqual(["", "", ""]);
  });
});

describe("el gancho y el llamado los escribe el código", () => {
  it("el del guion; si no, el texto del primer plano; si no, el principio de la voz", () => {
    expect(ganchoDe({ gancho: "¿Piel sensible?" })).toBe("¿Piel sensible?");
    expect(ganchoDe({ planos: [{ pantalla: "Ojo con esto" }] })).toBe("Ojo con esto");
    expect(ganchoDe({ locucion: LOCUCION })).toBe("¿Tu bebé tiene la piel sensible?");
    expect(llamadoDe({})).toBe(LLAMADO_POR_DEFECTO);
    expect(llamadoDe({ llamado: "Escríbenos por WhatsApp hoy mismo, que hay oferta" }).length).toBeLessThanOrEqual(30);
  });
});

describe("el guion del montaje", () => {
  const reel = { planos: PLANOS, locucion: LOCUCION, musica: "Acústica suave", gancho: "¿Piel sensible?", llamado: "Pídelos hoy" };
  it("con clips: una escena por plano, el clip a sangre, el gancho arriba, el logo y el llamado al cierre; y VALIDA", () => {
    const g = guionDeMontaje({ reel, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 5 }, { archivoId: "a2", duracion: 5 }, { archivoId: "a3", duracion: 5 }] } });
    const v = validarGuion(g);
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
    expect(g.escenas.map((e) => e.tipo)).toEqual(["gancho", "producto", "cierre"]);
    expect(g.escenas[0].capas[0]).toMatchObject({ tipo: "video", archivo: "a1", encuadre: "completo", sonido: false });
    expect(g.escenas[0].capas[1]).toMatchObject({ tipo: "texto", texto: "¿Piel sensible?", rol: "titular" });
    expect(g.escenas[2].capas.map((c) => c.tipo)).toEqual(["video", "logo", "llamado"]);
    expect(g.escenas[2].capas.at(-1).texto).toBe("Pídelos hoy");
    expect(g.subtitulos.activo).toBe(true);
    expect(g.musica).toMatchObject({ estilo: "Acústica suave" });
    // Un clip no se estira más allá de lo que dura.
    expect(g.escenas.every((e) => e.capas[0].hasta <= 5)).toBe(true);
    expect(tieneHabla(g)).toBe(true);
    expect(lineaDeTiempo(g).total).toBeGreaterThanOrEqual(5);
  });
  it("con un solo video: cada escena con SU tramo del mismo archivo", () => {
    const g = guionDeMontaje({ reel, fuente: { tipo: "uno", archivoId: "v1", duracion: 10 }, sonidoClip: true });
    expect(validarGuion(g).ok).toBe(true);
    expect(g.escenas.map((e) => [e.capas[0].desde, e.capas[0].hasta])).toEqual([[0, 3], [3, 6], [6, 10]]);
    expect(g.escenas[0].capas[0]).toMatchObject({ archivo: "v1", sonido: true });
  });
  it("sin logo en el kit, el cierre sólo lleva el llamado; un plano sin clip se salta", () => {
    const g = guionDeMontaje({ reel, conLogo: false, fuente: { tipo: "clips", clips: [{ archivoId: "a1" }, null, { archivoId: "a3" }] } });
    expect(g.escenas).toHaveLength(2);
    expect(g.escenas[1].capas.map((c) => c.tipo)).toEqual(["video", "llamado"]);
    expect(validarGuion(g).ok).toBe(true);
  });
  it("un montaje SIN voz: sin habla ni subtítulos (se renderiza sin locución)", () => {
    const g = guionDeMontaje({ reel, voz: false, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 5 }, { archivoId: "a2", duracion: 5 }] } });
    expect(tieneHabla(g)).toBe(false);
    expect(g.subtitulos.activo).toBe(false);
    expect(validarGuion(g).ok).toBe(true);
  });
  it("sin clips ni video no hay qué montar", () => {
    expect(sePuedeMontar({ tipo: "clips", clips: [null, null] })).toBe(false);
    expect(sePuedeMontar({ tipo: "uno", archivoId: null })).toBe(false);
    expect(sePuedeMontar({ tipo: "uno", archivoId: "v" })).toBe(true);
  });
  it("el guion de la publicación, por tramos: se ve, voz y texto", () => {
    const t = textoDelGuionReel(reel).split("\n");
    expect(t).toHaveLength(3);
    expect(t[0]).toBe("[0–3 s] SE VE: El bebé llora | VOZ: «¿Tu bebé tiene la piel sensible?» | TEXTO: ¿Piel sensible?");
  });
});

describe("las duraciones por ruta, con las llaves que hay", () => {
  it("con Kie: 10 s en UN video (Omni), 30 s también (Seedance 2.5), 45 y 60 s por clips y montaje", () => {
    const lista = duracionesDeReel({ kie: true });
    const de = (s) => lista.find((d) => d.segundos === s);
    expect(de(10)).toMatchObject({ ruta: "uno" });
    expect(de(10).modelos[0]).toBe("gemini-omni-kie");
    expect(de(30)).toMatchObject({ ruta: "uno" });
    expect(de(30).modelos).toContain("seedance-2-5-kie");
    expect(de(45)).toMatchObject({ ruta: "clips" });
    expect(de(60).modelos[0]).toBe("kling-3-kie");
  });
  it("nunca un guion de 30 s con un modelo que hace 10: cada modelo de «uno» hace esa duración exacta", () => {
    for (const d of duracionesDeReel({ kie: true, gemini: true })) {
      if (d.ruta === "uno") for (const id of d.modelos) expect(haceDuracion(modeloPorId(id), d.segundos), `${id} ${d.segundos}`).toBe(true);
    }
  });
  it("sin llaves sólo queda la prueba; y una duración que nada hace no se ofrece", () => {
    const lista = duracionesDeReel({});
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((d) => d.modelos.every((id) => modeloPorId(id).motor === "prueba"))).toBe(true);
    expect(DURACIONES_OBJETIVO).toContain(60);
    expect(rutaDeDuracion({}, 60)).toBeTruthy();
  });
  it("cada clip dura lo que su plano, en lo que el modelo admita", () => {
    const kling = modeloPorId("kling-3-kie");
    expect(duracionDeClip(kling, 3)).toBe(5);
    expect(duracionDeClip(kling, 11)).toBe(12);
    expect(duracionDeClip(kling, 40)).toBe(15);
  });
});

describe("lo que se pone solo en la publicación", () => {
  it("sólo rellena lo vacío (la descripción heredada en `script` cuenta como escrita)", () => {
    const { post, rellenados } = rellenarVacios({ descripcion: "", guion: "El mío", script: "" }, { descripcion: "Nueva", guion: "Otro", portada: "/api/media/x.png" });
    expect(post).toMatchObject({ descripcion: "Nueva", guion: "El mío", portada: "/api/media/x.png", portadaMs: null });
    expect(rellenados).toEqual(["descripcion", "portada"]);
    expect(rellenarVacios({ script: "viejo" }, { descripcion: "Nueva" }).rellenados).toEqual([]);
  });
  it("el video en el sitio de su versión anterior; si no, el primero, y lo demás se queda", () => {
    const post = { medios: [{ src: "/a.jpg", tipo: "imagen" }, { src: "/viejo.mp4", tipo: "video", deReel: "e1" }] };
    const r = conVideoEnPost(post, { src: "/nuevo.mp4", tipo: "video", deReel: "e1" }, (m) => m.deReel === "e1");
    expect(r.medios.map((m) => m.src)).toEqual(["/a.jpg", "/nuevo.mp4"]);
    const r2 = conVideoEnPost({ medios: [{ src: "/a.jpg", tipo: "imagen" }] }, { src: "/v.mp4", tipo: "video" });
    expect(r2.medios.map((m) => m.src)).toEqual(["/v.mp4", "/a.jpg"]);
    expect(r2.mediosCambiadosAt).toBeTruthy();
  });
});

describe("los pedidos del reel son los mismos para la pantalla y el servidor", () => {
  it("el fotograma lleva el anterior y el primero de referencia, en 9:16", () => {
    const p = pedidoDeFotogramaReel({ modelo: modeloPorId("prueba"), plano: PLANOS[1], total: 3, anterior: { clave: "k1" }, primero: { clave: "k0" }, fotos: ["f1"] });
    expect(p.medios.reference).toEqual(["k1", "k0", "f1"]);
    expect(p.ajustes.aspectRatio).toBe("9:16");
  });
  it("con montaje el video va SIN voz (la pone ElevenLabs), aunque el guion traiga locución", () => {
    const m = modeloPorId("gemini-omni-kie");
    const con = pedidoDeVideo({ modelo: m, planos: PLANOS, locucion: LOCUCION, voz: "kore", fotogramas: [{ clave: "a" }] });
    const sin = pedidoDeVideo({ modelo: m, planos: PLANOS, locucion: LOCUCION, voz: "kore", fotogramas: [{ clave: "a" }], sinVoz: true });
    expect(con.prompt).toMatch(/Locución en off/);
    expect(sin.prompt).toMatch(/Sin voz ni diálogo/);
    expect(sin.ajustes.voz || "").toBe("");
  });
});

describe("la pantalla lee un encargo de reel", () => {
  it("fotogramas, clips, video y si espera la revisión", () => {
    const archivos = new Map([["a1", { id: "a1" }], ["c1", { id: "c1" }]]);
    const e = {
      estado: "hecho",
      pasos: [{ fase: "hecho", opciones: [{ id: "a1" }], clip: { fase: "hecho", archivoId: "c1" } }, { fase: "fallido", error: "x" }],
      reel: { salida: "clips", video: { fase: "espera" }, montaje: null },
    };
    const r = resultadoDeReel(e, archivos);
    expect(r.fotos[0].archivo.id).toBe("a1");
    expect(r.fotos[1].error).toBe("x");
    expect(r.clips[0].archivo.id).toBe("c1");
    expect(r.storyboardListo).toBe(true);
    expect(r.esperaRevision).toBe(true);
  });
});
