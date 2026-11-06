import { describe, it, expect } from "vitest";
import { repartirLocucion, hablaDePlanos, ganchoDe, llamadoDe, guionDeMontaje, sePuedeMontar, textoDelGuionReel, LLAMADO_POR_DEFECTO, comprobarMontaje, partirEscenasLargas, fotosDeEscenas, MARGEN_CLIP } from "./montajeReel.js";
import { validarGuion, tieneHabla, lineaDeTiempo, palabrasDe, textoDeLocucion } from "./videoEscenas.js";

const palabrasDeLocucion = (g) => palabrasDe(textoDeLocucion(g));
import { duracionesDeReel, duracionDeClip, haceDuracion, rutaDeDuracion, DURACIONES_OBJETIVO, CLIPS_POR_DEFECTO } from "./duracionesVideo.js";
import { modeloPorId } from "./estudioCatalogo.js";
import { rellenarVacios, conVideoEnPost } from "./resultadoEnPost.js";
import { pedidoDeVideo, pedidoDeFotogramaReel } from "./reelPedidos.js";
import { resultadoDeReel } from "./encargoReelPuro.js";
import { acabadoDelGuion, conAcabado, pedidoDeRevisionVideo, leerRevisionVideo } from "./revisionVideo.js";
import { lineaDelGuionPost, lineasComunesDeGuion } from "./guionVideo.js";

describe("«¿Está listo?» sobre el mp4 montado aprueba lo que antes reprobaba por faltar texto y logo", () => {
  const guion = guionDeMontaje({
    reel: { planos: [{ n: 1, desde: 0, hasta: 3, escena: "a" }, { n: 2, desde: 3, hasta: 6, escena: "b" }], locucion: "Hola. Escríbenos hoy.", gancho: "¿Piel sensible?", llamado: "Pídelos hoy" },
    fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 5 }, { archivoId: "a2", duracion: 5 }] },
  });
  const acabado = acabadoDelGuion(guion);
  it("el guion dice lo que puso la aplicación", () => {
    expect(acabado).toMatchObject({ subtitulos: true, logo: true, llamado: "Pídelos hoy", voz: true });
    expect(acabado.textos).toContain("¿Piel sensible?");
    expect(pedidoDeRevisionVideo({ marca: "BC", acabado })).toMatch(/MONTADO en la aplicación[\s\S]*«¿Piel sensible\?»[\s\S]*No los cuentes como texto mal escrito/);
    expect(acabadoDelGuion({ escenas: [] })).toBeNull();
  });
  it("sin sonido, la marca y el cierre que el modelo de video no tenía, ahora se cumplen y el veredicto cambia", () => {
    const antes = leerRevisionVideo(JSON.stringify({ puntaje: 8, criterios: { gancho: { ok: true }, sinSonido: { ok: false }, marca: { ok: false }, cierre: { ok: false }, voz: { ok: true }, defectos: { ok: true } } }));
    expect(antes.veredicto).not.toBe("listo");
    const despues = conAcabado(antes, acabado);
    expect(despues.criterios.find((c) => c.id === "marca")).toMatchObject({ ok: true });
    expect(despues.criterios.find((c) => c.id === "sinSonido").nota).toMatch(/subtítulos/);
    expect(despues.veredicto).toBe("listo");
    // Un defecto de verdad (del clip) sigue mandando.
    const conDefecto = conAcabado({ ...antes, criterios: antes.criterios.map((c) => (c.id === "defectos" ? { ...c, ok: false } : c)) }, acabado);
    expect(conDefecto.veredicto).toBe("no");
    expect(conAcabado(antes, null)).toBe(antes);
  });
});

describe("la base común de los guiones de video", () => {
  it("el guion de la publicación, el producto, el criterio y lo de la marca, en el mismo orden para todos", () => {
    expect(lineaDelGuionPost("")).toBe("");
    const l = lineasComunesDeGuion({ criterio: "CRITERIO", producto: "Wipes · $45", guionPost: "Hook", contexto: "Marca" });
    expect(l[0]).toBe("CRITERIO");
    expect(l[1]).toMatch(/precio EXACTO/);
    expect(l[2]).toMatch(/EL GUION QUE YA TIENE LA PUBLICACIÓN/);
    expect(l[3]).toMatch(/Lo que se sabe de la marca/);
  });
});

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
  it("con un solo video: corre SEGUIDO bajo todas las escenas (cada una lo arranca donde va la voz), sin saltos ni repetidos", () => {
    const g = guionDeMontaje({ reel, fuente: { tipo: "uno", archivoId: "v1", duracion: 10 }, sonidoClip: true });
    expect(validarGuion(g).ok).toBe(true);
    const l = lineaDeTiempo(g);
    expect(g.escenas.map((e) => e.capas[0].desde)).toEqual(l.escenas.map((e) => e.desde));
    expect(g.escenas.every((e) => e.capas[0].hasta === 10)).toBe(true);
    expect(g.escenas[0].capas[0]).toMatchObject({ archivo: "v1", sonido: true });
  });
  it("sin logo en el kit, el cierre sólo lleva el llamado", () => {
    const g = guionDeMontaje({ reel, conLogo: false, fuente: { tipo: "clips", clips: [{ archivoId: "a1" }, { archivoId: "a2" }, { archivoId: "a3" }] } });
    expect(g.escenas.at(-1).capas.map((c) => c.tipo)).toEqual(["video", "llamado"]);
    expect(validarGuion(g).ok).toBe(true);
  });
  it("B8 · un clip que no salió: su plano va con su FOTOGRAMA a sangre y su frase NO se pierde", () => {
    const g = guionDeMontaje({ reel, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 8 }, null, { archivoId: "a3", duracion: 8 }], fotogramas: ["f1", "f2", "f3"] } });
    expect(validarGuion(g).ok).toBe(true);
    expect(g.escenas.map((e) => e.capas[0].tipo)).toEqual(["video", "imagen", "video"]);
    expect(g.escenas[1].capas[0]).toMatchObject({ archivo: "f2", encuadre: "completo", movimiento: expect.stringMatching(/acercar|paneo|alejar/) });
    expect(g.escenas.map((e) => e.habla).join(" ")).toBe(LOCUCION);
    expect(comprobarMontaje(reel, g)).toEqual([]);
    // Sin fotograma ni clip, la frase sigue: va sobre el fondo (antes, el plano y su frase se saltaban).
    const sin = guionDeMontaje({ reel, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 8 }, null, { archivoId: "a3", duracion: 8 }] } });
    expect(sin.escenas.map((e) => e.habla).join(" ")).toBe(LOCUCION);
    expect(validarGuion(sin).ok).toBe(true);
  });
  it("B9/C12 · un plano de toma «fija» (producto, beneficio, cierre) se monta con su fotograma aunque tenga clip", () => {
    const fijo = { ...reel, planos: PLANOS.map((p, i) => (i === 2 ? { ...p, toma: "fija" } : { ...p, toma: "movimiento" })) };
    const g = guionDeMontaje({ reel: fijo, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 8 }, { archivoId: "a2", duracion: 8 }, null], fotogramas: ["f1", "f2", "f3"] } });
    expect(g.escenas.at(-1).capas.map((c) => c.tipo)).toEqual(["imagen", "logo", "llamado"]);
    expect(g.escenas.at(-1).capas[0].archivo).toBe("f3");
  });
  it("A2 · una frase más larga que su clip se parte por palabras: el clip hasta donde llega y el resto con el fotograma; nada se congela", () => {
    const larga = { planos: [{ n: 1, desde: 0, hasta: 5, escena: "La mamá abre la caja" }, { n: 2, desde: 5, hasta: 10, escena: "El bebé sonríe" }],
      locucion: "Tu bebé merece lo mejor desde el primer día de su vida, por eso cuidamos cada detalle de su piel. Escríbenos hoy y pídelos ya.", gancho: "Lo mejor", llamado: "Pídelos" };
    const g = guionDeMontaje({ reel: larga, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 4 }, { archivoId: "a2", duracion: 4 }], fotogramas: ["f1", "f2"] } });
    expect(validarGuion(g).errores).toEqual([]);
    // Lo que se dice no cambió (la locución ya pagada sigue valiendo).
    expect(g.escenas.map((e) => e.habla).join(" ")).toBe(larga.locucion);
    expect(comprobarMontaje(larga, g)).toEqual([]);
    const l = lineaDeTiempo(g);
    expect(l.silencios.every((x) => x.dur <= 1)).toBe(true);
    g.escenas.forEach((e, k) => {
      const clip = e.capas.find((c) => c.tipo === "video");
      if (clip) expect(l.escenas[k].hasta - l.escenas[k].desde).toBeLessThanOrEqual(clip.hasta - clip.desde - MARGEN_CLIP + 0.01);
    });
    expect(g.escenas.some((e) => e.id.endsWith("b") && e.capas[0].tipo === "imagen")).toBe(true);
    // El cierre se lleva el logo y el llamado a su segunda parte.
    expect(g.escenas.at(-1).capas.map((c) => c.tipo)).toEqual(["imagen", "logo", "llamado"]);
    // Con los tiempos de verdad de la voz (más lenta), se vuelve a partir sin tocar lo que se dice.
    const lenta = lineaDeTiempo(g, palabrasDeLocucion(g).map((_, i) => ({ desde: i * 0.6, hasta: i * 0.6 + 0.5 })));
    const r = partirEscenasLargas(g, lenta, fotosDeEscenas(larga, { fotogramas: ["f1", "f2"] }));
    expect(r.guion.escenas.map((e) => e.habla).join(" ")).toBe(larga.locucion);
  });
  it("B11 · si al montar faltara lo que se dice o el gancho, es un error grave", () => {
    const g = guionDeMontaje({ reel, fuente: { tipo: "clips", clips: [{ archivoId: "a1", duracion: 8 }, { archivoId: "a2", duracion: 8 }, { archivoId: "a3", duracion: 8 }] } });
    expect(comprobarMontaje(reel, g)).toEqual([]);
    const sinUna = { ...g, escenas: g.escenas.filter((_, i) => i !== 1) };
    expect(comprobarMontaje(reel, sinUna)[0]).toMatch(/se perdió parte de lo que se dice/);
    const sinGancho = { ...g, escenas: [{ ...g.escenas[0], capas: g.escenas[0].capas.filter((c) => c.tipo !== "texto") }, ...g.escenas.slice(1)] };
    expect(comprobarMontaje(reel, sinGancho)[0]).toMatch(/gancho/);
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
  it("B7 · con Kie, toda duración va por defecto por CLIPS con Veo 3.1 Lite (barato y fiel al producto) y el montaje", () => {
    const lista = duracionesDeReel({ kie: true });
    expect(lista.map((d) => d.segundos)).toEqual(DURACIONES_OBJETIVO);
    for (const d of lista) expect(d).toMatchObject({ ruta: "clips", modelos: expect.arrayContaining(["veo-3-1-lite-kie"]) });
    expect(lista.every((d) => d.modelos[0] === CLIPS_POR_DEFECTO)).toBe(true);
    // Los demás de clips siguen detrás, para escogerlos.
    expect(lista[0].modelos).toContain("kling-3-kie");
  });
  it("sin Veo 3.1 Lite, lo que un modelo hace en un video sale en UNO y lo demás por clips", () => {
    const lista = duracionesDeReel({ gemini: true });
    const de = (s) => lista.find((d) => d.segundos === s);
    expect(de(10)).toMatchObject({ ruta: "uno" });
    expect(de(10).modelos[0]).toBe("gemini-omni-flash");
    expect(de(30)).toMatchObject({ ruta: "clips" });
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
