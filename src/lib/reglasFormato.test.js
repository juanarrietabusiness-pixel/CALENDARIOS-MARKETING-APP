import { describe, it, expect } from "vitest";
import {
  REGLAS_FORMATO, llevaGuion, llevaCaption, llevaTextoPieza, llevaHashtags, llevaCampo, camposQueFaltan, separarHashtags,
  juntarHashtags, tieneHashtags,
} from "./reglasFormato.js";
import { completitud } from "./completitud.js";
import { faltaParaEnviar } from "./completitud.js";
import { rellenarConIdea } from "./ideaPublicacion.js";
import { pedidoDeProduccion, leerProduccion, darForma, captionYHashtags } from "./loteAnuncios.js";

// ============================================================
// UNA regla por formato, y la leen todos: el motor, la completitud y el panel
// ============================================================

describe("qué lleva cada formato", () => {
  it("una historia: sólo el texto en la pieza (ni guion, ni caption, ni hashtags)", () => {
    expect([llevaGuion("historia"), llevaCaption("historia"), llevaHashtags("historia"), llevaTextoPieza("historia")]).toEqual([false, false, false, true]);
  });
  it("un reel: guion (una sola forma: por planos), caption y hashtags; sin texto en la pieza", () => {
    expect(REGLAS_FORMATO.reel).toMatchObject({ guion: "planos", caption: true, textoPieza: false, hashtags: true });
  });
  it("un post: sin guion; un carrusel, el texto va lámina a lámina (no en la pieza); un directo, sus temas", () => {
    expect(llevaGuion("post")).toBe(false);
    expect(llevaTextoPieza("carrusel")).toBe(false);
    expect(REGLAS_FORMATO.live.guion).toBe("temas");
    // Un formato desconocido se trata como un post.
    expect(llevaGuion("raro")).toBe(false);
    expect(llevaCampo("historia", "idea")).toBe(true);
    expect(llevaCampo("historia", "descripcion")).toBe(false);
  });
});

describe("lo que le falta a una publicación (lo que pide «Completar los textos que faltan»)", () => {
  it("según su formato y sólo lo vacío", () => {
    expect(camposQueFaltan({ format: "post" })).toEqual(["descripcion", "textoPieza", "hashtags"]);
    expect(camposQueFaltan({ format: "historia", idea: "x" })).toEqual(["textoPieza"]);
    expect(camposQueFaltan({ format: "reel", guion: "[0–2 s] …" })).toEqual(["descripcion", "hashtags"]);
    expect(camposQueFaltan({ format: "carrusel", descripcion: "Ven", hashtagsFinales: "#a" })).toEqual(["guion"]);
  });
  it("los hashtags de antes, dentro del caption, cuentan como puestos (si no, saldrían dos veces)", () => {
    expect(tieneHashtags({ descripcion: "Ven hoy #Dcasa" })).toBe(true);
    expect(camposQueFaltan({ format: "post", descripcion: "Ven hoy #Dcasa", textoPieza: "x" })).toEqual([]);
  });
});

describe("los hashtags, siempre aparte", () => {
  it("se sacan del final del caption; los de en medio de una frase son parte de ella", () => {
    expect(separarHashtags("Ven hoy 🛋️\n\n#sofa #panama #sofa")).toEqual({ texto: "Ven hoy 🛋️", hashtags: "#sofa #panama" });
    expect(separarHashtags("El #lunes abrimos. Escríbenos.")).toEqual({ texto: "El #lunes abrimos. Escríbenos.", hashtags: "" });
    expect(separarHashtags("")).toEqual({ texto: "", hashtags: "" });
  });
  it("juntar no repite (sin distinguir mayúsculas)", () => {
    expect(juntarHashtags("#Dcasa #sofa", "#dcasa #Panama")).toBe("#Dcasa #sofa #Panama");
  });
  it("lo que devuelve el motor: el caption sin hashtags y los del final en «hashtags»; una historia, sin nada de eso", () => {
    expect(captionYHashtags({ descripcion: "Ven hoy.\n#sofa #panama", hashtags: "#Dcasa" }, "post")).toEqual({ descripcion: "Ven hoy.", hashtags: "#Dcasa #sofa #panama" });
    expect(captionYHashtags({ descripcion: "Ven hoy.", hashtags: "#Dcasa" }, "historia")).toEqual({ descripcion: "" });
  });
});

describe("la regla, leída por todos", () => {
  it("la completitud no le exige a una historia guion, caption ni hashtags", () => {
    expect(completitud({ format: "historia", title: "T", category: "C", idea: "I", publishTime: "09:00" }).faltan).toEqual([]);
    expect(faltaParaEnviar({ format: "historia", title: "T", referenceLink: "https://x" })).toEqual([]);
  });

  it("el motor de ideas no le pide caption a una historia, y su lectura no se lo pone", () => {
    const plan = darForma([{ tipo: "educativo", formato: "historia" }, { tipo: "educativo", formato: "post" }]);
    const t = pedidoDeProduccion({ plan });
    expect(t).toMatch(/"descripcion" \(vacía en las historias: no llevan caption\)/);
    expect(t).toMatch(/Es una HISTORIA[^\n]*No lleva caption ni hashtags/);
    const ideas = leerProduccion(JSON.stringify({ ideas: [
      { n: 1, titular: "Uno", escena: "Una sala", descripcion: "No va", hashtags: "#no" },
      { n: 2, titular: "Dos", escena: "Otra sala", descripcion: "Ven.\n\n#sofa", hashtags: "#Dcasa" },
    ] }), plan);
    expect(ideas[0]).toMatchObject({ descripcion: "" });
    expect(ideas[0].hashtags).toBeUndefined();
    expect(ideas[1]).toMatchObject({ descripcion: "Ven.", hashtags: "#Dcasa #sofa" });
    // Sólo historias: ni se le piden.
    const soloHistorias = pedidoDeProduccion({ plan: darForma([{ tipo: "educativo" }], { formato: "historia" }), formato: "historia" });
    expect(soloHistorias).not.toMatch(/"descripcion"/);
  });

  it("la idea que llega a una historia no le escribe caption ni hashtags", () => {
    const { cambios } = rellenarConIdea({ format: "historia" }, { titular: "Hoy", escena: "Una sala", descripcion: "x", hashtags: "#a", textoPieza: "Hoy" });
    expect(cambios.descripcion).toBeUndefined();
    expect(cambios.hashtagsFinales).toBeUndefined();
    expect(cambios.textoPieza).toBe("Hoy");
  });
});
