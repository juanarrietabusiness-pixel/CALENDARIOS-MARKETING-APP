import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ruta } from "../utils/repo.js";
import { MODELOS, modeloPorId, estimar, validarPedido } from "../../src/lib/estudioCatalogo.js";
import { MODELOS_KIE, pedidoKie, validarKie } from "../../worker/lib/estudio/kie.js";

// ============================================================
// Cada pedido a Kie, contra SU documentación
//
// docs/kie/catalogo-2026-10.md es el extracto que entregó la agencia: por
// cada `model`, qué campos lleva su `input`, cuáles son obligatorios (*) y qué
// valores admite cada texto con lista. Nada de Kie se ha probado contra el
// servicio real, así que esto es lo que queda: que cada pedido que arma
// kie.js use un `model` que existe, sólo campos que ese modelo conoce, todos
// los obligatorios y, en los textos con lista, un valor de la lista.
// ============================================================

/** model → { campos: Map(nombre → { obligatorio, tipo, valores }) }, leído del extracto. */
function leerDocumentacion() {
  const texto = readFileSync(ruta("docs", "kie", "catalogo-2026-10.md"), "utf8");
  const lineas = texto.split("\n");
  const mapa = new Map();
  for (let i = 0; i < lineas.length; i++) {
    const cabeza = lineas[i].match(/^- (`[^`]+`(?:, `[^`]+`)*)\s*$/);
    const inputs = lineas[i + 1]?.match(/^\s+inputs: (.*)$/);
    if (!cabeza || !inputs) continue;
    const campos = new Map();
    for (const trozo of inputs[1].split(";")) {
      const m = trozo.trim().match(/^(TOP\.)?([\w]+)(\*)?:(\w+)(?:\[([^\]]*)\])?/);
      if (!m || m[1]) continue;
      campos.set(m[2], { obligatorio: Boolean(m[3]), tipo: m[4], valores: m[5] ? m[5].split("|") : null });
    }
    for (const id of cabeza[1].match(/`([^`]+)`/g).map((x) => x.slice(1, -1))) mapa.set(id, campos);
  }
  return mapa;
}

const DOC = leerDocumentacion();
const deKie = MODELOS.filter((m) => m.motor === "kie");
const porDefecto = (m) => Object.fromEntries(Object.entries(m.ajustes).map(([k, d]) => [k, d.defecto]));

/** Las formas de pedir que el catálogo permite a ese modelo: texto, referencias, imagen inicial (y final), video. */
function variantes(m) {
  const lista = [];
  const sinImagen = !m.necesitaImagen && !m.necesitaVideo;
  if (sinImagen) lista.push({ nombre: "texto" });
  if (m.referencias && !m.necesitaVideo) lista.push({ nombre: "referencias", refs: Array.from({ length: Math.min(m.referencias, 3) }, (_, i) => `https://r/${i}`) });
  if (m.inicial && !m.necesitaVideo) lista.push({ nombre: "inicial", inicio: ["https://i"] });
  if (m.inicial && m.final) lista.push({ nombre: "inicial y final", inicio: ["https://i"], fin: ["https://f"] });
  if (m.video) lista.push({ nombre: "video", videos: ["https://v"], refs: m.necesitaImagen ? ["https://r/0"] : [] });
  return lista;
}

describe("los modelos de Kie, contra su documentación", () => {
  it("el extracto se lee: trae los modelos y sus campos", () => {
    expect(DOC.size).toBeGreaterThan(100);
    expect(DOC.get("nano-banana-2-lite").get("aspect_ratio")).toMatchObject({ obligatorio: true });
    expect(DOC.get("seedream/4.5-edit").get("quality").valores).toEqual(["basic", "high"]);
  });

  it("hay modelos nuevos de la documentación de octubre (imagen y video)", () => {
    expect(deKie.filter((m) => m.tipo === "imagen").length).toBeGreaterThanOrEqual(25);
    expect(deKie.filter((m) => m.tipo === "video").length).toBeGreaterThanOrEqual(22);
    for (const m of deKie) {
      expect(m.estimado, m.id).toBe(true);
      expect(m.nota, m.id).toMatch(/aproximado/i);
      expect(MODELOS_KIE[m.id], m.id).toBeTypeOf("function");
    }
  });

  for (const m of deKie) {
    it(`${m.nombre}: cada forma de pedirlo es un model de la documentación con sus campos`, () => {
      const ajustes = porDefecto(m);
      for (const v of variantes(m)) {
        const pedido = pedidoKie(m, { prompt: "Una escena", ajustes, refs: v.refs ?? [], inicio: v.inicio ?? [], fin: v.fin ?? [], videos: v.videos ?? [] });
        const donde = `${m.id} (${v.nombre}) → ${pedido.model}`;
        const campos = DOC.get(pedido.model);
        expect(campos, `${donde}: ese model no está en docs/kie/catalogo-2026-10.md`).toBeTruthy();
        // De algunos modelos el extracto sólo trae la cabecera (Kling 3.0 Omni): ahí no hay campos con que comparar.
        if (campos.size === 0) continue;
        for (const [k, valor] of Object.entries(pedido.input)) {
          const def = campos.get(k);
          expect(def, `${donde}: «${k}» no es un campo de ese model`).toBeTruthy();
          if (def.tipo === "string" && def.valores && typeof valor === "string") expect(def.valores, `${donde}: ${k}=${valor}`).toContain(valor);
          if (def.tipo === "array") expect(Array.isArray(valor), `${donde}: ${k} va como lista`).toBe(true);
          if (def.tipo === "boolean") expect(typeof valor, `${donde}: ${k}`).toBe("boolean");
        }
        for (const [k, def] of campos) if (def.obligatorio) expect(pedido.input, `${donde}: falta «${k}», obligatorio`).toHaveProperty(k);
      }
    });
  }

  it("cada uno cuesta algo y se puede pedir con sus valores por defecto", () => {
    for (const m of deKie) {
      expect(estimar(m), m.id).toBeGreaterThan(0);
      const medios = m.necesitaVideo ? { video: ["v"], reference: ["r"] } : m.necesitaImagen ? (m.inicial ? { start: ["i"] } : { reference: ["r"] }) : {};
      expect(validarPedido({ modelo: m.id, prompt: "Una escena", medios }).ok, m.id).toBe(true);
    }
  });

  it("lo que Kie no mezcla se dice al pedir", () => {
    const pedir = (id, medios) => validarKie(modeloPorId(id), { medios });
    expect(pedir("minimax-h3-kie", { start: ["i"], reference: ["r"] })).toMatch(/no mezcla/);
    expect(pedir("happyhorse-1-1-kie", { start: ["i"], reference: ["r"] })).toMatch(/no mezcla/);
    expect(pedir("vidu-q4-kie", { start: ["i"], reference: ["r"] })).toMatch(/no mezcla/);
    expect(pedir("kling-2-6-movimiento-kie", { start: ["i"], reference: ["r"], video: ["v"] })).toMatch(/UNA foto/);
    expect(pedir("minimax-h3-kie", { reference: ["r"] })).toBeNull();
    // Copiar el movimiento sin video, o sin la foto, no pasa.
    expect(validarPedido({ modelo: "kling-2-6-movimiento-kie", prompt: "a", medios: { reference: ["r"] } }).ok).toBe(false);
    expect(validarPedido({ modelo: "kling-2-6-movimiento-kie", prompt: "a", medios: { video: ["v"] } }).ok).toBe(false);
  });

  it("detalles que no se ven: Ideogram recibe sólo el personaje, PixVerse hace la transición, Omni completo sin imagen inicial", () => {
    const ideo = pedidoKie(modeloPorId("ideogram-personaje-kie"), { prompt: "p", ajustes: porDefecto(modeloPorId("ideogram-personaje-kie")), refs: ["https://persona", "https://logo"] });
    expect(ideo.input.reference_image_urls).toEqual(["https://persona"]);
    const pix = pedidoKie(modeloPorId("pixverse-6-kie"), { prompt: "p", ajustes: porDefecto(modeloPorId("pixverse-6-kie")), inicio: ["https://a"], fin: ["https://b"] });
    expect(pix).toMatchObject({ model: "pixverse-v6/transition", input: { first_frame_image_url: "https://a", last_frame_image_url: "https://b" } });
    expect(modeloPorId("gemini-omni-video-kie").inicial ?? 0).toBe(0);
    const mov = pedidoKie(modeloPorId("kling-2-6-movimiento-kie"), { prompt: "p", ajustes: porDefecto(modeloPorId("kling-2-6-movimiento-kie")), inicio: ["https://yo"], videos: ["https://baile"] });
    expect(mov.input).toMatchObject({ input_urls: ["https://yo"], video_urls: ["https://baile"], character_orientation: "video", mode: "720p" });
  });
});
