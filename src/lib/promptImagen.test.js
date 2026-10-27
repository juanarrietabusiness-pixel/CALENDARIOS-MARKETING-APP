import { describe, it, expect } from "vitest";
import { huellaDelPrompt, promptListo, conPromptListo } from "./promptImagen.js";
import { pedidoDeProduccion, leerProduccion, publicacionDePieza, textoDeIdea } from "./loteAnuncios.js";
import { rellenarConIdea, reemplazarConIdea } from "./ideaPublicacion.js";
import { lineaDeIndicacion } from "./otraVersion.js";

const post = { format: "post", escena: "Una mamá abre el sofá cama en una sala luminosa", textoPieza: "Duerme mejor\nDesde $399" };
const listo = 'Una mamá abre el sofá cama en una sala luminosa de tarde, plano medio. Texto legible: "Duerme mejor" / "Desde $399".';

describe("el pedido de la imagen, listo", () => {
  it("vale mientras la publicación diga lo mismo", () => {
    const p = conPromptListo(post, listo);
    expect(promptListo(p)).toBe(listo);
    expect(promptListo({ ...p, escena: "Otra escena" })).toBe("");
    expect(promptListo({ ...p, textoPieza: "Otro texto" })).toBe("");
    expect(promptListo({ ...p, format: "historia" })).toBe("");
    // Sin escena, manda la idea.
    const sinEscena = conPromptListo({ format: "post", idea: "Un sofá gris" }, "Un sofá gris en una sala.");
    expect(promptListo({ ...sinEscena, idea: "Un sofá azul" })).toBe("");
  });
  it("los espacios no cambian la huella; sin pedido no hay nada", () => {
    expect(huellaDelPrompt(post)).toBe(huellaDelPrompt({ ...post, escena: `  ${post.escena}  ` }));
    expect(promptListo(post)).toBe("");
    expect(conPromptListo(post, "  ")).toBe(post);
  });
});

describe("el motor de ideas lo escribe", () => {
  const plan = [{ n: 1, formato: "post", tipo: "beneficios" }, { n: 2, formato: "carrusel", tipo: "educativo" }];
  it("se le pide sólo a las de una imagen", () => {
    const pedido = pedidoDeProduccion({ plan });
    expect(pedido).toMatch(/"imagen" \(SÓLO en las de una imagen[^\n]*FICHA DE DISEÑO/);
    expect(pedido).toContain('"imagen":"…"');
    expect(pedidoDeProduccion({ plan: [{ n: 1 }], formato: "reel" })).not.toContain('"imagen"');
  });
  it("se lee con el texto EXACTO (repuesto si hace falta), y nunca en un carrusel", () => {
    const respuesta = JSON.stringify({ ideas: [
      { n: 1, titular: "Duerme mejor", apoyo: "Desde $399", escena: "Una sala", imagen: 'Una sala de tarde. "Duerme mejor" / "Desde $399"' },
      { n: 2, titular: "Aprende a elegir", escena: "Una tienda", imagen: 'Una tienda. "Aprende a elegir"', guion: "Portada: …" },
    ] });
    const [a, b] = leerProduccion(respuesta, plan);
    expect(a.imagen).toMatch(/^Una sala de tarde/);
    expect(b.imagen).toBeUndefined();
    // Si la IA reescribió el texto, la ficha no se tira: se le repone el texto exacto.
    const mal = JSON.stringify({ ideas: [{ n: 1, titular: "Duerme mejor", escena: "Una sala", imagen: 'Una sala. "Duerme bien"' }] });
    expect(leerProduccion(mal, plan.slice(0, 1))[0].imagen).toMatch(/Texto exacto que va en la imagen[^\n]*«Duerme mejor»/);
    // La ficha conserva sus líneas (cada apartado en la suya).
    const ficha = JSON.stringify({ ideas: [{ n: 1, titular: "Duerme mejor", escena: "Una sala", imagen: "Pieza: post 4:5.\nTexto: titular «Duerme mejor»." }] });
    expect(leerProduccion(ficha, plan.slice(0, 1))[0].imagen).toBe("Pieza: post 4:5.\nTexto: titular «Duerme mejor».");
  });
  it("la publicación del lote sale con su pedido listo (si aún no tiene imagen)", () => {
    const idea = { titular: "Duerme mejor", apoyo: "Desde $399", escena: "Una sala", imagen: 'Una sala. "Duerme mejor" / "Desde $399"', tipo: "beneficios" };
    const pub = publicacionDePieza({ id: "p1", idea });
    expect(pub.textoPieza).toBe(textoDeIdea(idea));
    expect(promptListo(pub)).toBe(idea.imagen);
    expect(publicacionDePieza({ id: "p2", idea, archivo: { src: "/api/media/clientes/c/a.png", tipo: "imagen" } }).promptImagen).toBeUndefined();
    expect(publicacionDePieza({ id: "p3", idea, formato: "carrusel" }).promptImagen).toBeUndefined();
  });
  it("«Generar» y «Completar» lo dejan sólo si la publicación queda con lo de la IA", () => {
    const idea = { escena: "Una sala", textoPieza: "Duerme mejor", imagen: 'Una sala. "Duerme mejor"' };
    const { cambios } = rellenarConIdea({ format: "post" }, idea);
    expect(promptListo({ format: "post", ...cambios })).toBe(idea.imagen);
    // Qué se ve lo escribió una persona: el pedido de la IA no le corresponde.
    expect(rellenarConIdea({ format: "post", escena: "La mía" }, idea).cambios.promptImagen).toBeUndefined();
    expect(rellenarConIdea({ format: "reel" }, idea).cambios.promptImagen).toBeUndefined();
    const otra = reemplazarConIdea({ format: "post", promptImagen: "viejo", promptImagenDe: "x" }, idea);
    expect(promptListo(otra)).toBe(idea.imagen);
    expect(reemplazarConIdea({ format: "post", promptImagen: "viejo" }, { escena: "Otra" }).promptImagen).toBe("");
  });
});

describe("«¿Qué quieres?»", () => {
  it("va como una línea del pedido, y manda", () => {
    expect(lineaDeIndicacion("  el fondo más claro.  ")).toBe("LO QUE PIDE LA AGENCIA (manda sobre todo lo demás de este pedido): el fondo más claro.");
    expect(lineaDeIndicacion("")).toBe("");
  });
});
