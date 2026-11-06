import { describe, it, expect } from "vitest";
import {
  analisisDelVideo, textoDelVideo, pedidoDeDirectorMusical, leerPropuestaMusical, propuestaDeRespaldo, bpmPorCortes,
  sinArtistas, huellaMusical, lineaDeMusicaDeMarca, minSeg, TOPES_PROPUESTA,
} from "./directorMusical.js";
import { validarGuion, palabrasDe, textoDeLocucion } from "./videoEscenas.js";
import { limpiarKit, fundirKit, limpiarMusicaDeMarca, MAX_REFS_MUSICA } from "./kitMarca.js";
import { cuerpoSuno, limpiarPedidoMusica } from "./musica.js";

// ============================================================
// El DIRECTOR MUSICAL (lo puro): lo que el código cuenta del video (BPM por los cortes, silencios, momentos), el pedido
// a la IA con la música de la marca delante, la lectura de su respuesta y el respaldo; la música de la marca del kit.
// ============================================================

/** Un guion de cinco escenas de ~2,4 s (seis palabras cada una a 2,5 palabras/s), con una pausa y un cierre. */
const guion = () => validarGuion({
  version: 1, titulo: "Toallitas sin alcohol", formatos: ["9:16"],
  estilo: { ritmo: "medio", paleta: { fondo: "#F4EDE4", acento: "#C8553D" } },
  musica: { estilo: "música corporativa alegre" },
  escenas: [
    { id: "e1", tipo: "gancho", habla: "¿Sabías que tu bebé lo nota todo?", pantalla: "¿Lo nota?" },
    { id: "e2", tipo: "problema", habla: "El alcohol reseca su piel muy delicada.", pausa: 1 },
    { id: "e3", tipo: "beneficio", habla: "Nuestras toallitas limpian sin irritar nada.", transicion: { tipo: "fundido" } },
    { id: "e4", tipo: "prueba", habla: "Probadas por pediatras en todo Panamá.", transicion: { tipo: "barrido" } },
    { id: "e5", tipo: "cierre", habla: "Pídelas hoy mismo por WhatsApp, mamá.", pantalla: "Pídelas hoy" },
  ],
}).guion;

describe("el BPM que casa con los cortes", () => {
  it("un compás de cuatro tiempos por escena, llevado al rango del ritmo por octavas", () => {
    expect(bpmPorCortes(2, "medio")).toBe(118); // 120 se pasa del rango medio (88–118): se queda en el borde
    expect(bpmPorCortes(2, "rapido")).toBe(120);
    expect(bpmPorCortes(3, "calmado")).toBe(80);
    expect(bpmPorCortes(4, "rapido")).toBe(120); // 60 → el doble
    expect(bpmPorCortes(1, "calmado")).toBe(70); // 240 → la cuarta parte (60), la más cercana, y al borde
    expect(bpmPorCortes(0, "medio")).toBe(103); // sin escenas, el centro
    expect(bpmPorCortes(2.5, "otro")).toBe(96); // un ritmo que no existe: el medio
  });
});

describe("lo que el código cuenta del video", () => {
  it("sin locución: estimado, con las escenas, los cortes, los momentos y el silencio de la pausa", () => {
    const a = analisisDelVideo(guion());
    expect(a.estimado).toBe(true);
    expect(a.conVoz).toBe(false);
    expect(a.escenas).toHaveLength(5);
    expect(a.escenas[0]).toMatchObject({ n: 1, tipo: "gancho", desde: 0, transicion: "" });
    expect(a.escenas[2].transicion).toBe("fundido");
    expect(a.transiciones).toEqual({ corte: 2, fundido: 1, barrido: 1 });
    expect(a.momentos.gancho).toMatchObject({ desde: 0 });
    expect(a.momentos.beneficio.desde).toBe(a.escenas[2].desde);
    expect(a.momentos.llamado.desde).toBe(a.escenas[4].desde);
    // La pausa de la escena 2: un hueco sin voz de casi un segundo detrás de su última palabra.
    expect(a.silencios).toHaveLength(1);
    expect(a.silencios[0].hasta).toBe(a.escenas[1].hasta);
    expect(a.silencios[0].hasta - a.silencios[0].desde).toBeGreaterThanOrEqual(0.9);
    expect(a.bpm).toBeGreaterThanOrEqual(88);
    expect(a.bpm).toBeLessThanOrEqual(118);
    expect(a.pista).toBe("música corporativa alegre");
    expect(a.paleta).toMatchObject({ acento: "#C8553D" });
  });

  it("con la locución real: lo que dura de verdad y a qué velocidad habla", () => {
    const g = guion();
    const n = palabrasDe(textoDeLocucion(g)).length;
    // Una voz más lenta que la estimada: 0,6 s por palabra.
    const palabras = Array.from({ length: n }, (_, i) => ({ desde: i * 0.6, hasta: i * 0.6 + 0.5 }));
    const a = analisisDelVideo(g, { palabras });
    expect(a.conVoz).toBe(true);
    expect(a.estimado).toBe(false);
    expect(a.segundos).toBeGreaterThan(analisisDelVideo(g).segundos);
    expect(a.palabrasPorSegundo).toBeGreaterThan(1.5);
    expect(a.palabrasPorSegundo).toBeLessThan(2);
    // Si los tiempos no cuadran con el guion (otra versión), vuelve a estimar.
    expect(analisisDelVideo(g, { palabras: palabras.slice(1) }).conVoz).toBe(false);
  });

  it("el video contado a la IA: duración, cortes, BPM, escena a escena, silencios y momentos", () => {
    const t = textoDelVideo(analisisDelVideo(guion()));
    expect(t).toMatch(/Duración: [\d,]+ s \(ESTIMADA/);
    expect(t).toMatch(/BPM que casa con los cortes: \d+/);
    expect(t).toMatch(/1\. 0–[\d,]+ s · Gancho · dice «¿Sabías que tu bebé lo nota todo\?» · se lee «¿Lo nota\?»/);
    expect(t).toMatch(/entra con fundido/);
    expect(t).toMatch(/Silencios \(sin voz/);
    expect(t).toMatch(/el llamado a la acción desde [\d,]+ s/);
  });
});

describe("el pedido al director musical", () => {
  const kitMusica = limpiarMusicaDeMarca({ estilo: "Acústica cálida, nada electrónico", evitar: "trap, reguetón", referencias: [{ estilo: "warm acoustic folk, ukulele, 96 BPM", titulo: "Mañana" }] });

  it("la música de la marca va delante y MANDA; luego el cliente, el cerebro, el video y cómo decidir", () => {
    const p = pedidoDeDirectorMusical({
      marca: "Baby Caleb", analisis: analisisDelVideo(guion()), tipo: "Educativo", voz: "Matilda (cálida, cercana)",
      cliente: { rubro: "Productos para bebés", audiencia: "Mamás primerizas", estiloLocucion: "Cercana y tranquila" },
      kit: { musica: kitMusica, paleta: "arena #F4EDE4", estilo: "Ilustración plana suave" },
      ficha: "Baby Caleb cuida la piel del bebé.",
    });
    const marca = p.indexOf("LA MÚSICA DE LA MARCA");
    expect(marca).toBeGreaterThan(-1);
    expect(marca).toBeLessThan(p.indexOf("EL CLIENTE"));
    expect(p).toMatch(/MANDA sobre todo lo demás/);
    expect(p).toMatch(/Estilo: Acústica cálida, nada electrónico/);
    expect(p).toMatch(/Nunca: trap, reguetón/);
    expect(p).toMatch(/«Mañana»: warm acoustic folk/);
    expect(p).toMatch(/Rubro: Productos para bebés/);
    expect(p).toMatch(/La voz de este video: Matilda \(cálida, cercana\)/);
    expect(p).toMatch(/Tipo de contenido: Educativo/);
    expect(p).toMatch(/Baby Caleb cuida la piel/);
    expect(p).toMatch(/Escena a escena/);
    expect(p).toMatch(/sólo una pista.*«música corporativa alegre»/);
    expect(p).toMatch(/NUNCA nombres de artistas/);
    expect(p).toMatch(/"estilo": "en INGLÉS/);
    expect(p).toMatch(/"porque"/);
  });

  it("sin música de la marca no la nombra", () => {
    const p = pedidoDeDirectorMusical({ marca: "X", analisis: analisisDelVideo(guion()) });
    expect(p).not.toMatch(/LA MÚSICA DE LA MARCA/);
    expect(lineaDeMusicaDeMarca(limpiarMusicaDeMarca({}))).toBe("");
  });
});

describe("la respuesta del director musical", () => {
  const analisis = analisisDelVideo(guion());

  it("lee el JSON con texto alrededor, quita los artistas y las voces, y lleva el BPM y lo que evita la marca", () => {
    const r = leerPropuestaMusical(
      'Aquí va:\n```json\n{"estilo": "warm acoustic folk, in the style of Jack Johnson, ukulele, soft claps, builds at 0:08", "evitar": "vocals, heavy distortion, Trap", "bpm": 98, "genero": "Folk acústico", "instrumentos": ["ukelele", "palmas"], "energia": "sube en el beneficio", "titulo": "Piel tranquila", "porque": "Cálida como la marca."}\n```',
      { analisis, kitMusica: { evitar: "trap, reguetón" } },
    );
    expect(r.estilo).not.toMatch(/Jack Johnson|style of/i);
    expect(r.estilo).toMatch(/^warm acoustic folk, ukulele, soft claps, builds at 0:08, 98 BPM$/);
    expect(r.bpm).toBe(98);
    expect(r.evitar).toBe("trap, reguetón, heavy distortion");
    expect(r).toMatchObject({ instrumental: true, titulo: "Piel tranquila", genero: "Folk acústico", instrumentos: "ukelele, palmas", porque: "Cálida como la marca." });
    expect(r.duracion).toBe(Math.ceil(analisis.segundos));
  });

  it("un BPM fuera de 50–200 se cambia por el de los cortes; sin título, uno del video; sin estilo, nada", () => {
    const r = leerPropuestaMusical('{"estilo": "lo-fi house, 300 bpm", "bpm": 300}', { analisis });
    expect(r.bpm).toBe(analisis.bpm);
    expect(r.estilo).toBe("lo-fi house, 300 bpm"); // ya dice un BPM: no se añade otro
    expect(r.titulo).toBe("Música de «Toallitas sin alcohol»");
    expect(leerPropuestaMusical('{"estilo": ""}', { analisis })).toBeNull();
    expect(leerPropuestaMusical("no es JSON", { analisis })).toBeNull();
    expect(leerPropuestaMusical(`{"estilo": "${"a".repeat(900)}"}`, { analisis }).estilo.length).toBeLessThanOrEqual(TOPES_PROPUESTA.estilo + 10);
  });

  it("sin artistas: «like» o «by» con nombre propio, «inspired by», «al estilo de»", () => {
    expect(sinArtistas("dreamlike synth pop, like Daft Punk, airy pads")).toBe("dreamlike synth pop, airy pads");
    expect(sinArtistas("chill beat inspired by lofi girl, piano")).toBe("chill beat, piano");
    expect(sinArtistas("bossa nova al estilo de Jobim, guitarra")).toBe("bossa nova, guitarra");
    expect(sinArtistas("driven by soft drums")).toBe("driven by soft drums"); // minúscula: no es un nombre
  });

  it("el respaldo: la música de la marca (o la pista, o una base por el ritmo) con el BPM y la energía de los momentos", () => {
    const conMarca = propuestaDeRespaldo(analisis, { kitMusica: { estilo: "Acústica cálida", evitar: "trap" } });
    expect(conMarca.estilo).toMatch(new RegExp(`^Acústica cálida, ${analisis.bpm} BPM, soft intro under the hook, builds at ${minSeg(analisis.momentos.beneficio.desde)}`));
    expect(conMarca).toMatchObject({ deRespaldo: true, instrumental: true, evitar: "trap, heavy distortion, aggressive drops" });
    expect(propuestaDeRespaldo(analisis).estilo).toMatch(/^música corporativa alegre, \d+ BPM/);
    expect(propuestaDeRespaldo({ ...analisis, pista: "" }).estilo).toMatch(/^modern light pop/);
    expect(minSeg(68.4)).toBe("1:08");
  });
});

describe("la huella de la propuesta guardada", () => {
  it("cambia si cambia lo que se dice, la voz o la música de la marca; no si no cambia nada", () => {
    const g = guion();
    const h = huellaMusical(g);
    expect(huellaMusical(guion())).toBe(h);
    const otro = guion();
    otro.escenas[1].habla = "Otra cosa distinta que decir aquí.";
    expect(huellaMusical(otro)).not.toBe(h);
    expect(huellaMusical(g, { kitMusica: { estilo: "jazz" } })).not.toBe(h);
    expect(huellaMusical(g, { palabras: [{ desde: 0, hasta: 1 }] })).not.toBe(h);
  });
});

describe("la música de la marca en el kit", () => {
  it("se limpia (topes, referencias sin repetir y como mucho tres) y «Volver a preparar» no se la lleva", () => {
    const m = limpiarMusicaDeMarca({
      estilo: "x".repeat(500), evitar: " trap ",
      referencias: [
        { estilo: "folk, 96 BPM", titulo: "A", archivoId: "a1" }, { estilo: "FOLK, 96 bpm", titulo: "repetida" },
        { estilo: "jazz" }, { estilo: "lofi", archivoId: "../malo" }, { estilo: "pop" }, { estilo: "" },
      ],
    });
    expect(m.estilo).toHaveLength(400);
    expect(m.evitar).toBe("trap");
    expect(m.referencias).toHaveLength(MAX_REFS_MUSICA);
    expect(m.referencias.map((r) => r.estilo)).toEqual(["folk, 96 BPM", "jazz", "lofi"]);
    expect(m.referencias[2]).not.toHaveProperty("archivoId");
    expect(limpiarKit({}).musica).toEqual({ estilo: "", evitar: "", referencias: [] });
    const kit = fundirKit({ musica: { estilo: "Acústica cálida" } }, { estilo: "plano" });
    expect(kit.musica.estilo).toBe("Acústica cálida");
  });
});

describe("las voces en una instrumental no se caen del «evitar»", () => {
  it("van primero aunque lo de la marca y del director sea largo", () => {
    const { pedido } = limpiarPedidoMusica({ estilo: "folk", evitar: "heavy distortion, ".repeat(20) });
    expect(cuerpoSuno(pedido).input.negative_tags).toMatch(/^vocals, singing, voice, lyrics, spoken word/);
  });
});
