import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import {
  dibujarFrame, paletaDelKit, paletaDelGuion, colorDe, contraste, centroDe, estadoDeCapa, encajarTexto, escenaEn,
  ruidoDeGrano, semilla, aleatorio, COMPONENTES_LISTOS, framesDe, areaSegura, bandaDeSubtitulos, cajasDeEscena,
  tiemposDeEscena, medirCapa, razonDeContraste, ZONA_SEGURA, PRIMERO_ANTES_DE, colorLegible, partirEquilibrado,
  cajaOpaca, textoPrincipal, capasDe, MIN_LOGO_CIERRE, DESPUES_DEL_GANCHO,
  ANCHO_COLUMNA_APAISADO, CRECER_POR_FORMATO, CRECER_MAX,
} from "./motorVideo.js";

// ============================================================
// El motor del video animado
//
//   · es DETERMINISTA: el mismo instante da las mismas llamadas al lienzo, y el grano cambia por fotograma;
//   · no usa nada del navegador (el render del Container usará el mismo archivo);
//   · lo que aún no entra no se dibuja; las entradas, salidas y bucles hacen lo que dicen;
//   · las transiciones pintan las dos escenas; lo que el motor aún no dibuja sale como marcador con su nombre;
//   · la paleta sale del kit por el papel de cada color y, si no lo dice, por la luz.
// ============================================================

/** Un contexto 2D de mentira: apunta cada llamada y cada propiedad que se fija, y mide el texto por su largo. */
function lienzo() {
  const log = [];
  const estado = { font: "10px x" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: (...a) => { log.push(["createLinearGradient", ...a]); return { addColorStop: (...b) => log.push(["addColorStop", ...b]) }; },
    createPattern: () => ({ patron: true }),
  };
  return {
    log,
    ctx: new Proxy({}, {
      get(_, k) {
        if (k in metodos) return metodos[k];
        if (k in estado) return estado[k];
        return (...args) => log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a))]);
      },
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, v]); return true; },
    }),
  };
}

const guionDelEjemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return validarGuion(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1])).guion;
};
const pintar = (guion, t, extra = {}) => {
  const { ctx, log } = lienzo();
  dibujarFrame(ctx, { guion, linea: lineaDeTiempo(guion), t, ...extra });
  return log;
};
const textos = (log) => log.filter(([m]) => m === "fillText").map(([, t]) => t);
const QUINCE = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince";

describe("el motor es determinista y no sabe del navegador", () => {
  it("el mismo instante da exactamente las mismas llamadas", () => {
    const g = guionDelEjemplo();
    expect(pintar(g, 3.3)).toEqual(pintar(g, 3.3));
  });

  it("el grano cambia de un fotograma a otro, y siempre igual para el mismo", () => {
    const g = guionDelEjemplo();
    const grano = { grano: { width: 256, height: 256 } };
    const despl = (t) => pintar(g, t, { recursos: grano }).filter(([m]) => m === "translate").at(-1);
    expect(despl(1)).toEqual(despl(1));
    expect(despl(1)).not.toEqual(despl(1 + 1 / 30));
  });

  it("el archivo no usa nada que no exista en el Container", () => {
    const fuente = readFileSync(new URL("./motorVideo.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    for (const prohibido of ["document.", "window.", "Math.random", "Date.now", "new Date", "performance.", "requestAnimationFrame", "new Image", "fetch("]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });

  it("el ruido del grano sale de su semilla", () => {
    expect(ruidoDeGrano(8, 3)).toEqual(ruidoDeGrano(8, 3));
    expect(ruidoDeGrano(8, 3)).not.toEqual(ruidoDeGrano(8, 4));
    const al = aleatorio(semilla("x"));
    const v = [al(), al(), al()];
    expect(v.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe("la paleta", () => {
  const KIT_BC = [
    { hex: "#1B3246", nombre: "Navy", rol: "estructura y tipografía" },
    { hex: "#91C9A2", nombre: "Sage", rol: "acento natural" },
    { hex: "#EE924A", nombre: "Amber", rol: "detalle y CTA" },
    { hex: "#F9F6ED", nombre: "Cream", rol: "fondos" },
  ];

  it("sale del papel de cada color del kit", () => {
    const p = paletaDelKit(KIT_BC);
    expect(p).toMatchObject({ fondo: "#F9F6ED", texto: "#1B3246", claro: "#F9F6ED", oscuro: "#1B3246" });
    expect(["#91C9A2", "#EE924A"]).toContain(p.acento);
  });

  it("con el kit real de Baby Caleb (sus 7 papeles tal cual): texto navy, acento naranja, no beige ni sage", () => {
    // Los papeles del kit guardado (oct. 2026), cortados como los guarda la aplicación. «Base limpia para TEXTO» es
    // el papel de un FONDO y «acento natural» no es el CTA: con la primera regla, el texto salía beige y el acento verde.
    const KIT_REAL = [
      { hex: "#EFFFED", nombre: "Verde Background", rol: "Fondo principal dominante — manda sobre el lienzo y construy" },
      { hex: "#F9F6ED", nombre: "Beige Claro Chalk White", rol: "Fondo principal alterno dominante — base limpia para texto" },
      { hex: "#F2EFE5", nombre: "Beige Superficie", rol: "Fondo de apoyo/superficie — soporte secundario" },
      { hex: "#91C9A2", nombre: "Verde Sage Logo", rol: "Color de marca principal — logo y acento natural suave" },
      { hex: "#C0D4B9", nombre: "Verde Secundario", rol: "Apoyo del verde de marca — acento suave secundario" },
      { hex: "#1B3246", nombre: "Azul Navy Ink", rol: "Texto/títulos/logo — alto contraste, solo estructura y tipog" },
      { hex: "#EE924A", nombre: "Naranja Honeyed Amber", rol: "Acento cálido ~10% — solo highlights/detalles/CTA, nunca dom" },
    ];
    const p = paletaDelKit(KIT_REAL);
    expect(p).toMatchObject({ fondo: "#EFFFED", superficie: "#F2EFE5", texto: "#1B3246", acento: "#EE924A", apoyo: "#91C9A2", claro: "#EFFFED", oscuro: "#1B3246" });
    expect(razonDeContraste(p.texto, p.fondo)).toBeGreaterThan(4.5);
  });

  it("el texto tiene que leerse sobre el fondo, diga lo que diga su papel", () => {
    const p = paletaDelKit([{ hex: "#FAFAFA", rol: "fondo" }, { hex: "#EEEEEE", rol: "texto suave" }, { hex: "#222222", rol: "detalles" }]);
    expect(p.texto).toBe("#222222");
  });

  it("sin papeles, por la luz: el más claro de fondo y el más oscuro de texto", () => {
    const p = paletaDelKit([{ hex: "#FFB400" }, { hex: "#152473" }, { hex: "#FAFAFA" }]);
    expect(p).toMatchObject({ fondo: "#FAFAFA", texto: "#152473", acento: "#FFB400" });
  });

  it("sin kit, la neutra; y lo que fija el guion manda sobre el kit", () => {
    expect(paletaDelKit([]).fondo).toMatch(/^#/);
    expect(paletaDelGuion({ estilo: { paleta: { acento: "#123456" } } }, KIT_BC).acento).toBe("#123456");
    expect(colorDe("#ABCDEF", {})).toBe("#ABCDEF");
    expect(colorDe("acento", { acento: "#111111" })).toBe("#111111");
  });

  it("un texto sobre su placa siempre se lee: si el del guion no llega a 3 a 1, el claro u oscuro que más contraste", () => {
    const p = { claro: "#EFFFED", oscuro: "#1B3246", acento: "#EE924A", texto: "#1B3246" };
    expect(colorLegible("claro", "acento", p)).toBe("#1B3246");
    expect(colorLegible("texto", "claro", p)).toBe("#1B3246");
    expect(colorLegible("claro", "oscuro", p)).toBe("#EFFFED");
  });

  it("el texto sobre un color escoge el que más contrasta", () => {
    expect(contraste("#1B3246")).toBe("#FFFFFF");
    expect(contraste("#F9F6ED")).toBe("#111111");
  });
});

describe("dónde va cada capa: el motor reparte por zonas", () => {
  const FORMATOS = ["9:16", "1:1", "16:9"];
  const MEDIDAS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
  const cajas = (guion, indice, formato) => { const { ctx } = lienzo(); return cajasDeEscena(ctx, { guion, linea: lineaDeTiempo(guion), indice, formato }); };
  const seEnciman = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  /** Las de delante: una forma va detrás a propósito. */
  const delante = (cs) => cs.filter((c) => !c.detras);

  it("el área segura de 9:16 deja libre el 12 % de arriba y el 20 % de abajo; los otros, su margen", () => {
    expect(ZONA_SEGURA["9:16"]).toMatchObject({ arriba: 0.12, abajo: 0.2 });
    const a = areaSegura("9:16", 1080, 1920);
    expect(a.y).toBeCloseTo(230.4, 1);
    expect(a.y + a.h).toBeCloseTo(1536, 1);
    for (const f of ["1:1", "16:9"]) { const [w, h] = MEDIDAS[f]; const z = areaSegura(f, w, h); expect(z.y).toBeGreaterThan(0); expect(z.y + z.h).toBeLessThan(h); }
  });

  it("los subtítulos van dentro del área segura, abajo por defecto", () => {
    for (const f of FORMATOS) {
      const [w, h] = MEDIDAS[f]; const a = areaSegura(f, w, h); const b = bandaDeSubtitulos(f, w, h);
      expect(b.y).toBeGreaterThanOrEqual(a.y);
      expect(b.y + b.h).toBeCloseTo(a.y + a.h, 5);
    }
    expect(bandaDeSubtitulos("9:16", 1080, 1920, "arriba").y).toBeCloseTo(areaSegura("9:16", 1080, 1920).y, 5);
  });

  it("en el ejemplo, en los tres formatos: nada se encima, todo está dentro del área segura y fuera de los subtítulos", () => {
    const g = guionDelEjemplo();
    for (const f of FORMATOS) {
      const [w, h] = MEDIDAS[f]; const a = areaSegura(f, w, h); const b = bandaDeSubtitulos(f, w, h);
      g.escenas.forEach((_, i) => {
        const cs = delante(cajas(g, i, f));
        for (const c of cs) {
          expect(c.x, `${f} escena ${i + 1} ${c.tipo}`).toBeGreaterThanOrEqual(a.x - 0.5);
          expect(c.x + c.w).toBeLessThanOrEqual(a.x + a.w + 0.5);
          expect(c.y, `${f} escena ${i + 1} ${c.tipo}`).toBeGreaterThanOrEqual(a.y - 0.5);
          expect(c.y + c.h, `${f} escena ${i + 1} ${c.tipo}`).toBeLessThanOrEqual(b.y + 0.5);
        }
        for (let p = 0; p < cs.length; p++) for (let q = p + 1; q < cs.length; q++) expect(seEnciman(cs[p], cs[q]), `${f} escena ${i + 1}: ${cs[p].tipo} y ${cs[q].tipo}`).toBe(false);
      });
    }
  });

  it("con dos cosas o más, el tercio de abajo no se queda vacío (gancho, problema, producto y cierre)", () => {
    const g = guionDelEjemplo();
    for (const f of FORMATOS) {
      const [w, h] = MEDIDAS[f]; const a = areaSegura(f, w, h);
      g.escenas.forEach((_, i) => {
        const cs = delante(cajas(g, i, f));
        if (cs.length < 2) return;
        const fondo = Math.max(...cs.map((c) => c.y + c.h));
        expect(fondo, `${f} escena ${i + 1}`).toBeGreaterThan(a.y + (a.h * 2) / 3);
        expect(Math.min(...cs.map((c) => c.y)), `${f} escena ${i + 1}`).toBeLessThan(a.y + a.h / 3);
      });
    }
  });

  it("la placa de un texto no tapa la imagen: cada una tiene su sitio", () => {
    const g = validarGuion({ escenas: [{ tipo: "producto", habla: QUINCE, capas: [
      { tipo: "imagen", archivo: "x", pos: "centro", tam: 0.8 },
      { tipo: "texto", texto: "Pañales de bambú para piel sensible", placa: "superficie", pos: "centro", tam: 0.85 },
    ] }] }).guion;
    for (const f of FORMATOS) { const [img, txt] = cajas(g, 0, f); expect(seEnciman(img, txt), f).toBe(false); }
  });

  it("una forma va DETRÁS de lo que acompaña, centrada en ello", () => {
    const g = guionDelEjemplo();
    const cs = cajas(g, 2, "9:16");
    const forma = cs.find((c) => c.tipo === "forma"); const img = cs.find((c) => c.tipo === "imagen");
    expect(forma.detras).toBe(true);
    expect(forma.x + forma.w / 2).toBeCloseTo(img.x + img.w / 2, 3);
    expect(forma.y + forma.h / 2).toBeCloseTo(img.y + img.h / 2, 3);
  });

  it("en 16:9 lo visual va en su columna y el texto al lado", () => {
    const g = guionDelEjemplo();
    const cs = delante(cajas(g, 2, "16:9"));
    const img = cs.find((c) => c.tipo === "imagen"); const txt = cs.find((c) => c.tipo === "texto");
    expect(img.x + img.w).toBeLessThanOrEqual(txt.x);
  });

  it("en 16:9 también el icono, la lista y el logo van a la izquierda y el texto a la derecha; sólo texto, columna centrada y no tan ancha", () => {
    const g = guionDelEjemplo();
    const e2 = delante(cajas(g, 1, "16:9"));
    const txt = e2.find((c) => c.tipo === "texto");
    for (const c of e2.filter((x) => x.tipo !== "texto")) expect(c.x + c.w).toBeLessThanOrEqual(txt.x + 0.5);
    const cierre = delante(cajas(g, 3, "16:9"));
    expect(cierre.find((c) => c.tipo === "logo").x + cierre.find((c) => c.tipo === "logo").w).toBeLessThanOrEqual(cierre.find((c) => c.tipo === "llamado").x + 0.5);
    const solo = validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [{ tipo: "texto", texto: "Un titular de varias palabras que se lee bien", tam: 0.9 }] }] }).guion;
    const [t] = cajas(solo, 0, "16:9");
    const a = areaSegura("16:9", 1920, 1080);
    expect(t.w).toBeLessThanOrEqual(a.w * ANCHO_COLUMNA_APAISADO + 0.5);
    expect(t.x + t.w / 2).toBeCloseTo(1920 / 2, 0);
  });

  it("en 1:1 y 16:9 lo poco que hay crece más que en 9:16 (hay sitio alrededor)", () => {
    expect(CRECER_POR_FORMATO["9:16"]).toBe(CRECER_MAX);
    expect(CRECER_POR_FORMATO["1:1"]).toBeGreaterThan(CRECER_MAX);
    expect(CRECER_POR_FORMATO["16:9"]).toBeGreaterThan(CRECER_POR_FORMATO["1:1"]);
    for (const f of FORMATOS) {
      const [w, h] = MEDIDAS[f]; const a = areaSegura(f, w, h);
      for (let i = 0; i < 4; i++) {
        for (const c of delante(cajas(guionDelEjemplo(), i, f))) {
          expect(c.x).toBeGreaterThanOrEqual(a.x - 0.5); expect(c.y).toBeGreaterThanOrEqual(a.y - 0.5);
          expect(c.x + c.w).toBeLessThanOrEqual(a.x + a.w + 0.5); expect(c.y + c.h).toBeLessThanOrEqual(a.y + a.h + 0.5);
        }
      }
    }
  });

  it("dos capas que no se ven a la vez comparten el sitio en vez de apilarse", () => {
    const g = validarGuion({ escenas: [{ tipo: "pasos", habla: QUINCE, capas: [
      { tipo: "texto", texto: "Paso uno", sale: { palabra: 6 } },
      { tipo: "texto", texto: "Paso dos", entra: { palabra: 7 } },
    ] }] }).guion;
    const [a, b] = cajas(g, 0, "9:16");
    expect(a.y + a.h / 2).toBeCloseTo(b.y + b.h / 2, 3);
  });

  it("izquierda y derecha en la misma zona van lado a lado", () => {
    const g = validarGuion({ escenas: [{ tipo: "comparacion", habla: QUINCE, capas: [
      { tipo: "texto", texto: "Antes", pos: "izq", tam: 0.4 },
      { tipo: "texto", texto: "Ahora", pos: "der", tam: 0.4 },
    ] }] }).guion;
    const [a, b] = cajas(g, 0, "9:16");
    expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    expect(a.y + a.h / 2).toBeCloseTo(b.y + b.h / 2, 3);
  });

  it("demasiado para el alto: se encoge (primero lo visual) y sigue sin encimarse ni salirse", () => {
    const capas = [{ tipo: "imagen", archivo: "x", tam: 1 }, ...[1, 2, 3, 4, 5].map((n) => ({ tipo: "texto", texto: `Línea número ${n} con bastante texto`, tam: 0.9 }))];
    const g = validarGuion({ escenas: [{ tipo: "explicacion", habla: QUINCE, capas }] }).guion;
    for (const f of FORMATOS) {
      const [w, h] = MEDIDAS[f]; const b = bandaDeSubtitulos(f, w, h);
      const cs = cajas(g, 0, f);
      expect(Math.max(...cs.map((c) => c.y + c.h))).toBeLessThanOrEqual(b.y + 0.5);
      for (let p = 0; p < cs.length; p++) for (let q = p + 1; q < cs.length; q++) expect(seEnciman(cs[p], cs[q])).toBe(false);
    }
  });

  it("una capa con { x, y } va donde dice el guion", () => {
    expect(centroDe({ x: 0.1, y: 0.5 }, 1080, 1080)).toEqual({ x: 108, y: 540 });
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Aquí", pos: { x: 0.5, y: 0.3 } }] }] }).guion;
    const [c] = cajas(g, 0, "9:16");
    expect(c.y + c.h / 2).toBeCloseTo(576, 1);
  });

  it("lo que mide el reparto es lo que ocupa al dibujarse", () => {
    const g = guionDelEjemplo();
    const { ctx } = lienzo();
    const c = { ancho: 1080, alto: 1920, lado: 1080, formato: "9:16", paleta: paletaDelGuion(g), recursos: {}, fuentes: {}, altoUtil: 800 };
    for (const capa of g.escenas.flatMap((e) => e.capas)) {
      const a = medirCapa(ctx, capa, c, 700); const b = medirCapa(ctx, capa, c, 700);
      expect(a).toEqual(b);
      expect(a.h).toBeGreaterThan(0);
    }
  });
});

describe("el borde transparente de una imagen", () => {
  it("cajaOpaca encuentra lo que se ve", () => {
    const w = 10; const h = 8; const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 2; y <= 4; y++) for (let x = 3; x <= 6; x++) d[(y * w + x) * 4 + 3] = 255;
    expect(cajaOpaca(d, w, h)).toEqual({ x: 3, y: 2, w: 4, h: 3 });
    expect(cajaOpaca(new Uint8ClampedArray(w * h * 4), w, h)).toBe(null);
  });
});

describe("el texto de cada escena", () => {
  it("una escena sin texto, sello ni llamado enseña su «pantalla» como titular, la primera", () => {
    const g = guionDelEjemplo();
    const problema = g.escenas[1];
    const capas = capasDe(problema);
    expect(capas[0]).toMatchObject({ tipo: "texto", texto: problema.pantalla, rol: "titular" });
    expect(textos(pintar(g, lineaDeTiempo(g).escenas[1].hasta - 0.2)).join(" ")).toContain("irritación");
  });

  it("una escena con su texto no repite la «pantalla»", () => {
    const g = guionDelEjemplo();
    expect(capasDe(g.escenas[2]).some((c) => c.id.endsWith("-pantalla"))).toBe(false);
    expect(capasDe(g.escenas[3]).some((c) => c.id.endsWith("-pantalla"))).toBe(false);
  });

  it("el texto principal: titular, si no sello, si no texto, si no llamado", () => {
    expect(textoPrincipal([{ id: "a", tipo: "imagen" }, { id: "b", tipo: "sello" }]).id).toBe("b");
    expect(textoPrincipal([{ id: "a", tipo: "llamado" }, { id: "b", tipo: "texto", rol: "apoyo" }]).id).toBe("b");
    expect(textoPrincipal([{ id: "a", tipo: "imagen" }])).toBe(null);
  });
});

describe("el logo del cierre", () => {
  it(`mide al menos ${MIN_LOGO_CIERRE * 100} % del lado corto aunque el guion pida menos`, () => {
    const g = guionDelEjemplo();
    const { ctx } = lienzo();
    const logo = { width: 800, height: 400 };
    const [caja] = cajasDeEscena(ctx, { guion: g, linea: lineaDeTiempo(g), indice: 3, formato: "9:16", recursos: { logo } });
    expect(g.escenas[3].capas[0].tam).toBeLessThan(MIN_LOGO_CIERRE);
    expect(caja.w).toBeGreaterThanOrEqual(1080 * MIN_LOGO_CIERRE - 1);
  });
});

describe("el primer segundo", () => {
  it("en el gancho lo primero que entra es su texto principal; lo demás, después", () => {
    const g = guionDelEjemplo();
    const l = lineaDeTiempo(g);
    const [personaje, sello] = g.escenas[0].capas;
    const t = tiemposDeEscena(g.escenas[0].capas, l.escenas[0], true);
    expect(t.get(sello.id).desde).toBe(0);
    expect(t.get(personaje.id).desde).toBeCloseTo(DESPUES_DEL_GANCHO, 5);
    const a015 = pintar(g, 0.15);
    expect(textos(a015).join(" ")).toMatch(/PIEL ROJA/);
    expect(textos(a015).join(" ")).not.toMatch(/Personaje/);
  });

  it(`sin texto en la primera escena, algo empieza a entrar antes de ${PRIMERO_ANTES_DE} s`, () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Tarde", entra: { palabra: 10 } }] }, { tipo: "cierre", habla: QUINCE, capas: [{ tipo: "texto", texto: "Luego", entra: { palabra: 10 } }] }] }).guion;
    const l = lineaDeTiempo(g);
    expect(tiemposDeEscena(g.escenas[0].capas, l.escenas[0], true).get(g.escenas[0].capas[0].id).desde).toBe(0);
    expect(textos(pintar(g, 0.2))).toContain("Tarde");
    // En las demás escenas, cada capa entra en su palabra.
    expect(tiemposDeEscena(g.escenas[1].capas, l.escenas[1], false).get(g.escenas[1].capas[0].id).desde).toBeGreaterThan(l.escenas[1].desde + 1);
  });

  it("en el ejemplo, en el instante 0,3 ya se ve algo además del fondo", () => {
    expect(pintar(guionDelEjemplo(), 0.3).some(([m]) => ["fillText", "drawImage", "stroke"].includes(m))).toBe(true);
  });
});

describe("la animación de una capa", () => {
  const capa = (animacion) => ({ animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno", ...animacion } });
  const m = { desde: 1, hasta: 4 };

  it("antes de entrar y después de salir no existe", () => {
    expect(estadoDeCapa(capa({}), m, 0.5)).toBe(null);
    expect(estadoDeCapa(capa({}), m, 4.5)).toBe(null);
    expect(estadoDeCapa(capa({}), m, 2)).toMatchObject({ alfa: 1, escala: 1 });
  });

  it("sube, escala y fundido terminan en su sitio", () => {
    expect(estadoDeCapa(capa({ entrada: "sube" }), m, 1.1).dy).toBeGreaterThan(0);
    expect(estadoDeCapa(capa({ entrada: "sube" }), m, 2).dy).toBeCloseTo(0, 5);
    expect(estadoDeCapa(capa({ entrada: "escala" }), m, 1.1).escala).toBeLessThan(1);
    expect(estadoDeCapa(capa({ entrada: "fundido" }), m, 1.1).alfa).toBeLessThan(1);
  });

  it("el ritmo cambia lo que tarda la entrada", () => {
    const a = (ritmo) => estadoDeCapa(capa({ entrada: "fundido" }), m, 1.3, { ritmo }).alfa;
    expect(a("rapido")).toBe(1);
    expect(a("calmado")).toBeLessThan(a("medio"));
  });

  it("la salida se apaga en sus últimos 0,3 s", () => {
    expect(estadoDeCapa(capa({ salida: "fundido" }), m, 3.5).alfa).toBe(1);
    expect(estadoDeCapa(capa({ salida: "fundido" }), m, 3.9).alfa).toBeLessThan(0.5);
  });

  it("los bucles se mueven solos y vuelven", () => {
    const flota = (t) => estadoDeCapa(capa({ bucle: "flota" }), m, t).dy;
    expect(flota(1.75)).not.toBeCloseTo(0, 1);
    expect(flota(4)).toBeCloseTo(0, 5);
    expect(estadoDeCapa(capa({ bucle: "gira" }), m, 4).giro).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("el texto cabe en su sitio", () => {
  const conFuente = (px) => { const { ctx } = lienzo(); ctx.font = `800 ${px}px x`; return ctx; };

  it("«Sin alcohol · sin perfume» en dos líneas corta en el «·» y lo quita", () => {
    // 22 px por letra: «Sin alcohol · sin perfume» (25) no cabe en 400; en dos líneas, sí.
    expect(partirEquilibrado(conFuente(40), "Sin alcohol · sin perfume", 400, 2)).toEqual(["Sin alcohol", "sin perfume"]);
  });

  it("corta después de una coma antes que en mitad de la frase, si el reparto queda parecido", () => {
    expect(partirEquilibrado(conFuente(40), "Sin perfume, sin alcohol ni cloro", 480, 2)).toEqual(["Sin perfume,", "sin alcohol ni cloro"]);
    // Muy desparejo, gana el equilibrio: una palabra sola arriba se ve peor que cortar sin coma.
    expect(partirEquilibrado(conFuente(40), "Suaves, sin perfume ni alcohol", 500, 2)[0]).not.toBe("Suaves,");
  });

  it("sin separadores, reparte las líneas parejas (no deja una palabra sola abajo)", () => {
    const l = partirEquilibrado(conFuente(40), "Pañales de bambú para piel sensible", 520, 2);
    expect(l).toHaveLength(2);
    expect(Math.abs(l[0].length - l[1].length)).toBeLessThanOrEqual(8);
  });

  it("«+» e «=» empiezan la línea siguiente: nunca se quedan al final", () => {
    expect(partirEquilibrado(conFuente(40), "Alcohol + perfume = irritación", 400, 2)).toEqual(["Alcohol + perfume", "= irritación"]);
    expect(partirEquilibrado(conFuente(40), "Alcohol + perfume = irritación", 280, 3)).toEqual(["Alcohol", "+ perfume", "= irritación"]);
  });

  it("si en esas líneas no cabe, dice null; con una línea que cabe, la deja", () => {
    expect(partirEquilibrado(conFuente(40), "Una frase demasiado larga para dos", 200, 2)).toBe(null);
    expect(partirEquilibrado(conFuente(40), "Hola", 400, 1)).toEqual(["Hola"]);
  });

  it("la placa del producto del ejemplo sale en dos líneas parejas, sin el «·» colgando", () => {
    const g = guionDelEjemplo();
    const lineas = textos(pintar(g, lineaDeTiempo(g).escenas[2].hasta - 0.2)).filter((t) => /alcohol|perfume/i.test(t));
    expect(lineas.some((t) => /·\s*$|^\s*·/.test(t))).toBe(false);
  });

  it("un titular largo baja de tamaño hasta caber en sus tres líneas", () => {
    const { ctx } = lienzo();
    const corto = encajarTexto(ctx, "Hola", { ancho: 900, lado: 1080 });
    const largo = encajarTexto(ctx, "Un titular demasiado largo para caber de una vez en la pieza", { ancho: 900, lado: 1080 });
    expect(largo.tam).toBeLessThan(corto.tam);
    expect(largo.lineas.length).toBeLessThanOrEqual(3);
  });
});

describe("dibujar un fotograma", () => {
  it("una capa que entra en una palabra no se dibuja antes", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Ya" }, { tipo: "texto", texto: "Ahora", entra: { palabra: 10 } }] }] }).guion;
    expect(textos(pintar(g, 1))).not.toContain("Ahora");
    expect(textos(pintar(g, 5))).toContain("Ahora");
  });

  it("«escribe» revela las letras en orden", () => {
    const g = validarGuion({ subtitulos: { activo: false }, escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Hola mamá", animacion: { entrada: "escribe" } }] }] }).guion;
    const a = textos(pintar(g, 0.05)).join("");
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan("Hola mamá".length);
    expect(textos(pintar(g, 2)).join(" ")).toBe("Hola mamá");
  });

  it("en una transición se pintan las dos escenas", () => {
    const g = validarGuion({ escenas: [
      { tipo: "gancho", habla: QUINCE, fondo: { color: "#111111" } },
      { tipo: "cierre", habla: QUINCE, fondo: { color: "#EEEEEE" }, transicion: { tipo: "fundido", dur: 0.5 } },
    ] }).guion;
    const inicio = lineaDeTiempo(g).escenas[1].desde;
    const colores = (t) => pintar(g, t).filter(([m]) => m === "=fillStyle").map(([, v]) => v);
    expect(colores(inicio + 0.1)).toEqual(expect.arrayContaining(["#111111", "#EEEEEE"]));
    expect(colores(inicio + 0.8)).not.toContain("#111111");
    expect(escenaEn(lineaDeTiempo(g), inicio + 0.1)).toBe(1);
  });

  it("sin capas, enseña el texto de «pantalla»", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, pantalla: "¿Piel roja?" }] }).guion;
    expect(textos(pintar(g, 2))).toContain("¿Piel roja?");
  });

  it("una imagen sin cargar sale como marcador; el teléfono y el antes y después ya se dibujan de verdad", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [
      { tipo: "telefono", pantalla: "notificacion", notificacion: "Tu pedido llegó" }, { tipo: "imagen", archivo: "x1" }, { tipo: "antes_despues", textoAntes: "a", textoDespues: "b" },
    ] }] }).guion;
    const t = textos(pintar(g, 2));
    expect(t).toContain("Imagen");
    expect(t).not.toContain("Teléfono");
    expect(t).not.toContain("Antes / después");
    expect(t).toEqual(expect.arrayContaining(["ANTES", "DESPUÉS", "a", "b", "9:41"]));
  });

  it("con la imagen cargada la dibuja, y el logo del kit también", () => {
    const g = validarGuion({ escenas: [{ tipo: "producto", habla: QUINCE, capas: [{ tipo: "imagen", archivo: "x1" }, { tipo: "logo" }] }] }).guion;
    const img = { width: 800, height: 1000 };
    const log = pintar(g, 2, { recursos: { imagen: (id) => (id === "x1" ? img : null), logo: { width: 400, height: 200 } } });
    expect(log.filter(([m]) => m === "drawImage")).toHaveLength(2);
    expect(textos(log)).not.toContain("Imagen");
  });

  it("dibuja en las medidas del formato que se pida", () => {
    const g = guionDelEjemplo();
    const fondo = (formato) => pintar(g, 0.5, { formato }).find(([m]) => m === "fillRect");
    expect(fondo("9:16")).toEqual(["fillRect", 0, 0, 1080, 1920]);
    expect(fondo("16:9")).toEqual(["fillRect", 0, 0, 1920, 1080]);
  });

  it("todo componente del formato o está listo o sale como marcador", () => {
    expect(COMPONENTES_LISTOS).toEqual(expect.arrayContaining(["texto", "sello", "imagen", "forma", "logo", "llamado"]));
    expect(framesDe(40.2)).toBe(1206);
  });
});
