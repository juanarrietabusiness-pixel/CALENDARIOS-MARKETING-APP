import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EFECTOS_CATALOGO, efectoDelCatalogo, buscarEnCatalogo, cuentaPorPapel, srcDeEfecto, CARPETA_EFECTOS, RUTA_EFECTOS } from "./catalogoEfectos.js";
import { PAPELES, EFECTO_AUTOMATICO } from "./efectosColocados.js";
import { MAX_EFECTO_CATALOGO } from "./efectosSonido.js";

// ============================================================
// El CATÁLOGO DE EFECTOS: lo que dicen los datos generados es lo que hay en public/efectos/v1 (y lo que copia la imagen
// del Container), con un papel que tiene reglas, y los automáticos existen
// ============================================================

const RAIZ = join(import.meta.dirname, "..", "..");
const CARPETA = join(RAIZ, CARPETA_EFECTOS);

describe("el catálogo de efectos", () => {
  it("cada efecto tiene su MP3 en public/efectos/v1, y no sobra ninguno", () => {
    const faltan = EFECTOS_CATALOGO.filter((e) => !existsSync(join(CARPETA, e.archivo))).map((e) => e.archivo);
    expect(faltan).toEqual([]);
    const archivos = readdirSync(CARPETA).filter((f) => f.endsWith(".mp3"));
    const usados = new Set(EFECTOS_CATALOGO.map((e) => e.archivo));
    expect(archivos.filter((f) => !usados.has(f))).toEqual([]);
    // Los archivos empiezan como un MP3 (ID3 o una trama MPEG).
    for (const e of EFECTOS_CATALOGO.slice(0, 20)) {
      const b = readFileSync(join(CARPETA, e.archivo)).subarray(0, 3);
      expect(b.toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), e.archivo).toBe(true);
    }
  });

  it("ids únicos y seguros, un papel con reglas, duración y pico medidos", () => {
    const ids = EFECTOS_CATALOGO.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EFECTOS_CATALOGO) {
      expect(e.id, e.id).toMatch(/^[a-z0-9_-]{1,80}$/);
      expect(PAPELES[e.papel], `${e.id}: papel ${e.papel}`).toBeDefined();
      for (const p of e.papeles) expect(PAPELES[p], `${e.id}: papel ${p}`).toBeDefined();
      expect(e.dur).toBeGreaterThan(0);
      expect(e.dur).toBeLessThanOrEqual(MAX_EFECTO_CATALOGO);
      expect(e.pico).toBeGreaterThanOrEqual(0);
      expect(e.pico).toBeLessThanOrEqual(e.dur);
      expect(e.nombre.length).toBeGreaterThan(2);
      expect(["earshot", "uisfx"]).toContain(e.fuente);
    }
    expect(EFECTOS_CATALOGO.length).toBeGreaterThan(250);
  });

  it("los automáticos existen: el whoosh es una transición (por su pico) y el pop, un pop", () => {
    expect(efectoDelCatalogo(EFECTO_AUTOMATICO.transicion)?.papel).toBe("transicion");
    expect(efectoDelCatalogo(EFECTO_AUTOMATICO.sello)?.papel).toBe("pop");
    expect(efectoDelCatalogo("no-existe")).toBeNull();
  });

  it("el catálogo pesa poco (va en el repositorio y en la imagen del Container) y lleva sus licencias", () => {
    const bytes = readdirSync(CARPETA).reduce((n, f) => n + statSync(join(CARPETA, f)).size, 0);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
    const licencias = readFileSync(join(CARPETA, "LICENCIAS.txt"), "utf8");
    expect(licencias).toMatch(/earshot/);
    expect(licencias).toMatch(/MIT/);
    expect(licencias).toMatch(/CC0/);
  });

  it("se busca por papel y por palabras (sin tildes), y se cuenta por papel", () => {
    const transiciones = buscarEnCatalogo({ papel: "transicion" });
    expect(transiciones.length).toBeGreaterThan(5);
    expect(transiciones.every((e) => e.papel === "transicion" || e.papeles.includes("transicion"))).toBe(true);
    expect(buscarEnCatalogo({ texto: "carrito" }).map((e) => e.id)).toEqual(expect.arrayContaining(["ui-add-to-cart"]));
    expect(buscarEnCatalogo({ texto: "notificacion" }).length).toBeGreaterThan(0);
    expect(buscarEnCatalogo({ papel: "transicion", limite: 3 })).toHaveLength(3);
    const cuenta = cuentaPorPapel();
    expect(Object.values(cuenta).reduce((a, b) => a + b, 0)).toBe(EFECTOS_CATALOGO.length);
    expect(srcDeEfecto(efectoDelCatalogo(EFECTO_AUTOMATICO.sello))).toBe(`${RUTA_EFECTOS}ui_pop-soft.mp3`);
  });
});
