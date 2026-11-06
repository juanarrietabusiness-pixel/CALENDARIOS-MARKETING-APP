import { describe, it, expect } from "vitest";
import {
  estiloDeGuion, limpiarEstiloVideo, limpiarEstilosVideo, estilosPara, resumenDeEstilo, lineaDeEstilo, aplicarEstilo, seDiceEnElHabla,
  cadaCuantasEscenas, MAX_ESTILOS_VIDEO, TOPE_FONDOS_ESTILO,
} from "./estilosVideo.js";
import { validarGuion } from "./videoEscenas.js";
import { fondosPendientes } from "./fondosVideo.js";
import { limpiarKit, fundirKit } from "./kitMarca.js";

// ============================================================
// Los ESTILOS DE VIDEO guardados (src/lib/estilosVideo.js): sacar las reglas de un video que salió bien, contarlas a la
// IA y a la persona, e imponerlas a otro guion sin tocar lo que se dice ni lo que se lee. El guion de prueba tiene la
// forma del de 57DMC («NO ME DA PENA»), con otra letra.
// ============================================================

const FRASES = [
  "Hoy canto sin miedo lo que llevo dentro",
  "Mi voz se levanta aunque el mundo no quiera",
  "Camino seguro por la luz que me guía",
  "No cambio mi nombre por una promesa",
  "La fuerza que tengo no viene de mí",
  "Por eso lo digo cantando más fuerte",
];
const CLAVES = ["MIEDO", "VOZ", "LUZ", "NOMBRE", "FUERZA", "FUERTE"];

/** Un guion «diseñado»: texto gigante palabra por palabra con su clave, un fondo cada 2 escenas, cierre negro con logo. */
function disenado() {
  return {
    version: 1, titulo: "Lyric de prueba", formatos: ["9:16"],
    estilo: { grano: 0.55, ritmo: "rapido", ilustracion: "poster" },
    subtitulos: { activo: false },
    escenas: [
      ...FRASES.map((habla, i) => ({
        id: `s${i + 1}`, tipo: "explicacion", habla, pantalla: CLAVES[i],
        fondo: { tipo: "plano", color: "fondo", color2: "superficie" },
        transicion: i === 0 ? { tipo: "corte", dur: 0.2 } : i % 2 === 1 ? { tipo: "corte", dur: 0.2 } : { tipo: i % 4 === 2 ? "barrido" : "zoom", dur: 0.35 },
        capas: [
          { id: "fondo", tipo: "imagen", archivo: `f${Math.floor(i / 2) + 1}`, encuadre: "completo", recorte: "cubrir", movimiento: ["acercar", "alejar", "paneo"][i % 3], oscurecer: 0.5, tratamiento: "byn" },
          { id: "t1", tipo: "texto", rol: "gigante", mayusculas: true, porPalabra: true, pulso: true, color: "claro", animacion: { entrada: "golpe" },
            texto: habla.toUpperCase().replace(CLAVES[i], `*${CLAVES[i]}*`).split(" ").slice(0, 6).join(" ") },
          ...(i === 2 ? [{ id: "cita", tipo: "texto", rol: "etiqueta", texto: "Salmo 27:1", color: "acento" }] : []),
          ...(i === 3 ? [{ id: "t2", tipo: "texto", rol: "apoyo", texto: "por una promesa", color: "claro", animacion: { entrada: "fundido" } }] : []),
        ],
      })),
      {
        id: "cierre", tipo: "cierre", habla: "", pantalla: "", pausa: 2, fondo: { tipo: "plano", color: "#000000" }, transicion: { tipo: "corte", dur: 0.1 },
        capas: [{ id: "logo", tipo: "imagen", archivo: "logo1", pos: { x: 0.5, y: 0.5 }, tam: 0.2, recorte: "contener", entra: { s: 0 } }],
      },
    ],
  };
}

/** Otro guion «libre», como lo escribiría la IA sin el estilo: titulares, fundidos, colores y fondos distintos. */
function libre({ fondos = true } = {}) {
  const g = disenado();
  g.estilo = { grano: 0.1, ritmo: "calmado", ilustracion: "plana" };
  g.subtitulos = { activo: true };
  g.escenas.forEach((s, i) => {
    s.transicion = { tipo: "fundido", dur: 0.5 };
    s.fondo = { tipo: "degradado", color: "superficie" };
    for (const c of s.capas) {
      if (c.tipo === "texto") { c.rol = c.rol === "gigante" ? "titular" : c.rol; c.mayusculas = false; c.porPalabra = false; c.animacion = { entrada: "rebote" }; c.color = "texto"; c.pulso = false; }
      if (c.tipo === "imagen" && c.encuadre === "completo") { delete c.archivo; c.pide = `una imagen distinta ${i}`; c.tratamiento = "color"; c.oscurecer = 0.2; c.movimiento = "ninguno"; }
    }
    if (!fondos) s.capas = s.capas.filter((c) => c.encuadre !== "completo");
  });
  g.escenas.at(-1).capas = [{ id: "logo", tipo: "logo", pos: "centro", tam: 0.6 }, { id: "t", tipo: "texto", texto: "@marca", pos: "abajo" }];
  g.escenas.at(-1).fondo = { tipo: "plano", color: "acento" };
  return g;
}

const estilo = () => estiloDeGuion(disenado(), { id: "ev-prueba01", nombre: "Lyric en blanco y negro", videoId: "v1", version: 3, titulo: "Lyric de prueba", sonido: { efectos: true } });

describe("sacar el estilo de un guion", () => {
  it("lee las reglas: el texto principal, los fondos, las transiciones, el cierre y lo global", () => {
    const e = estilo();
    expect(e).toMatchObject({
      id: "ev-prueba01", nombre: "Lyric en blanco y negro", para: "voz", grano: 0.55, ritmo: "rapido", ilustracion: "poster", subtitulos: false, efectos: true,
      texto: { rol: "gigante", mayusculas: true, porPalabra: true, entrada: "golpe", pulso: true, color: "claro", enfasis: true },
      apoyo: { entrada: "fundido", color: "claro" },
      etiqueta: { color: "acento" },
      fondo: { base: { tipo: "plano", color: "fondo", color2: "superficie" }, imagen: true, tratamiento: "byn", oscurecer: 0.5, recorte: "cubrir", escenas: 2 },
      transiciones: { dentro: "corte", cambio: ["barrido", "zoom"] },
      cierre: { color: "#000000", logo: { pos: { x: 0.5, y: 0.5 }, tam: 0.2 }, transicion: "corte", dur: 0.1 },
      de: { video: "v1", version: 3, titulo: "Lyric de prueba" },
    });
    expect(e.fondo.movimientos).toEqual(["acercar", "alejar", "paneo"]);
    // No se lleva la letra, los textos ni las imágenes.
    const texto = JSON.stringify(e);
    for (const f of [...FRASES, ...CLAVES.map((c) => `*${c}*`), "f1", "logo1", "Salmo"]) expect(texto).not.toContain(f);
  });

  it("con canción es «para canciones»; sin escenas, nada", () => {
    const g = disenado();
    g.cancion = { archivo: "c1", duracion: 30 };
    expect(estiloDeGuion(g, { id: "ev-cancion01", nombre: "X" }).para).toBe("cancion");
    expect(estiloDeGuion({ escenas: [] }, { id: "ev-vacio001", nombre: "X" })).toBeNull();
  });

  it("limpiar: sin id o sin nombre no vale; lo que no se entiende se quita; la lista sin repetidos y con tope", () => {
    expect(limpiarEstiloVideo({ nombre: "X" })).toBeNull();
    expect(limpiarEstiloVideo({ id: "ev-bien0001", nombre: "  " })).toBeNull();
    expect(limpiarEstiloVideo({ id: "otro-id", nombre: "X" })).toBeNull();
    const l = limpiarEstiloVideo({ id: "ev-bien0001", nombre: "X", texto: { rol: "sello", color: "rojo", entrada: "golpe" }, fondo: { imagen: true, escenas: 9, movimientos: ["volar", "acercar"] }, raro: 1 });
    expect(l.texto).toEqual({ entrada: "golpe" });
    expect(l.fondo).toMatchObject({ imagen: true, escenas: 4, movimientos: ["acercar"] });
    expect(l.raro).toBeUndefined();
    expect(l.para).toBe("todos");
    const muchos = Array.from({ length: MAX_ESTILOS_VIDEO + 3 }, (_, i) => ({ id: `ev-n${String(i).padStart(4, "0")}`, nombre: `E${i}` }));
    expect(limpiarEstilosVideo([...muchos, muchos[0]])).toHaveLength(MAX_ESTILOS_VIDEO);
    expect(estilosPara([{ id: "ev-a0000001", nombre: "A", para: "voz" }, { id: "ev-b0000001", nombre: "B", para: "cancion" }, { id: "ev-c0000001", nombre: "C" }], "cancion").map((e) => e.nombre)).toEqual(["B", "C"]);
  });

  it("vive en el kit: limpiarKit lo conserva y «Volver a preparar» con IA no se lo lleva", () => {
    const e = estilo();
    expect(limpiarKit({ estilosVideo: [e] }).estilosVideo).toEqual([e]);
    expect(limpiarKit({}).estilosVideo).toBeUndefined();
    expect(fundirKit({ estilosVideo: [e] }, { estilo: "nuevo" }).estilosVideo).toEqual([e]);
  });
});

describe("contarlo", () => {
  it("el resumen dice cada regla en una frase para la persona", () => {
    const r = resumenDeEstilo(estilo());
    expect(r[0]).toMatch(/^Texto principal gigante .*mayúsculas.*palabra por palabra.*de golpe.*late con el ritmo.*palabra clave destacada/);
    expect(r.join(" ")).toMatch(/imágenes a sangre en blanco y negro, oscurecidas al 50 %/);
    expect(r.join(" ")).toMatch(/una imagen cada 2 escenas/);
    expect(r.join(" ")).toMatch(/corte dentro de un mismo fondo; barrido y zoom al cambiar de fondo/);
    expect(r.join(" ")).toMatch(/Cierre: fondo en #000000 con el logo pequeño \(20 % del ancho\) en el centro/);
    expect(r.at(-1)).toMatch(/Grano 0,55 · ritmo rápido · ilustración póster · sin subtítulos · con efectos de sonido/);
  });

  it("a la IA le dice qué manda y qué decide ella (las palabras que se dicen, la clave entre asteriscos y qué muestra cada fondo)", () => {
    const l = lineaDeEstilo(estilo(), { escenas: 12, cancion: true });
    expect(l).toMatch(/^ESTILO GUARDADO DE ESTE CLIENTE: «Lyric en blanco y negro»/);
    expect(l).toMatch(/"rol":"gigante"/);
    expect(l).toMatch(/MISMAS palabras que se cantan/);
    expect(l).toMatch(/\*asteriscos\*/);
    expect(l).toMatch(/cada 2 escenas seguidas comparten la MISMA imagen/);
  });

  it("la cadencia de los fondos no pasa del tope de imágenes", () => {
    expect(cadaCuantasEscenas(estilo(), 12)).toBe(2);
    expect(cadaCuantasEscenas(estilo(), TOPE_FONDOS_ESTILO * 3)).toBe(3);
  });
});

describe("imponerlo a otro guion", () => {
  it("cambia la forma y no lo que se dice ni lo que se lee; el resultado valida", () => {
    const antes = libre();
    const { guion: g, cambios } = aplicarEstilo(antes, estilo(), { conFondos: true });
    expect(cambios).toBeGreaterThan(20);
    expect(validarGuion(g).ok).toBe(true);
    expect(g.estilo).toMatchObject({ grano: 0.55, ritmo: "rapido", ilustracion: "poster" });
    expect(g.subtitulos.activo).toBe(false);
    g.escenas.slice(0, -1).forEach((s, i) => {
      expect(s.habla).toBe(antes.escenas[i].habla);
      const t = s.capas.find((c) => c.id === "t1");
      expect(t.texto).toBe(antes.escenas[i].capas.find((c) => c.id === "t1").texto);
      expect(t).toMatchObject({ rol: "gigante", mayusculas: true, porPalabra: true, pulso: true, color: "claro", animacion: { entrada: "golpe" } });
      expect(s.fondo).toMatchObject({ tipo: "plano", color: "fondo" });
      expect(s.capas.find((c) => c.encuadre === "completo")).toMatchObject({ tratamiento: "byn", oscurecer: 0.5 });
    });
    // El apoyo y la etiqueta, con lo suyo.
    expect(g.escenas[3].capas.find((c) => c.id === "t2")).toMatchObject({ rol: "apoyo", color: "claro", animacion: { entrada: "fundido" } });
    expect(g.escenas[2].capas.find((c) => c.id === "cita").color).toBe("acento");
    // Una imagen cada 2 escenas (la del primero del par) y las transiciones: corte dentro, barrido y zoom al cambiar.
    expect(fondosPendientes(g).map((f) => f.escenas)).toEqual([["s1", "s2"], ["s3", "s4"], ["s5", "s6"]]);
    expect(g.escenas.slice(1, 6).map((s) => s.transicion.tipo)).toEqual(["corte", "barrido", "corte", "zoom", "corte"]);
    // El cierre mudo: negro, con sólo el logo pequeño en el centro.
    expect(g.escenas.at(-1)).toMatchObject({ fondo: { tipo: "plano", color: "#000000" }, transicion: { tipo: "corte", dur: 0.1 } });
    expect(g.escenas.at(-1).capas).toEqual([expect.objectContaining({ tipo: "logo", pos: { x: 0.5, y: 0.5 }, tam: 0.2 })]);
    // No toca el guion que recibe.
    expect(antes.escenas[0].capas[1].rol).toBe("titular");
  });

  it("«porPalabra» sólo si las palabras del texto se dicen en la escena (si no, cada palabra no tendría cuándo entrar)", () => {
    const antes = libre();
    antes.escenas[0].capas.find((c) => c.id === "t1").texto = "OTRA COSA QUE NO SE DICE";
    const { guion: g } = aplicarEstilo(antes, estilo());
    expect(g.escenas[0].capas.find((c) => c.id === "t1").porPalabra).toBe(false);
    expect(g.escenas[1].capas.find((c) => c.id === "t1").porPalabra).toBe(true);
    expect(seDiceEnElHabla("*VOZ* SE LEVANTA", "Mi voz se levanta, aunque…")).toBe(true);
    expect(seDiceEnElHabla("JESÚS, LA LUZ", "Jesús es la luz")).toBe(true);
    expect(seDiceEnElHabla("LA LUZ JESÚS", "Jesús es la luz")).toBe(false);
  });

  it("una escena sin fondo recibe el de su par; sin fondos en el guion no se inventa ninguno", () => {
    const antes = libre();
    antes.escenas[1].capas = antes.escenas[1].capas.filter((c) => c.encuadre !== "completo");
    const { guion: g } = aplicarEstilo(antes, estilo(), { conFondos: true });
    expect(g.escenas[1].capas[0]).toMatchObject({ tipo: "imagen", encuadre: "completo", pide: antes.escenas[0].capas[0].pide });
    const sin = aplicarEstilo(libre({ fondos: false }), estilo(), { conFondos: true }).guion;
    expect(fondosPendientes(sin)).toEqual([]);
    expect(validarGuion(sin).ok).toBe(true);
  });

  it("un cierre que se dice es una escena más: su logo no se toca (encima del texto lo taparía); sin estilo válido no cambia nada", () => {
    const antes = libre();
    antes.escenas.at(-1).habla = "Síguenos para más";
    const { guion: g } = aplicarEstilo(antes, estilo());
    expect(g.escenas.at(-1).capas.find((c) => c.tipo === "logo")).toEqual(antes.escenas.at(-1).capas.find((c) => c.tipo === "logo"));
    expect(g.escenas.at(-1).fondo.color).toBe("fondo");
    expect(aplicarEstilo(antes, { nombre: "sin id" })).toEqual({ guion: antes, cambios: 0 });
  });
});
