import { describe, it, expect } from "vitest";
import { idDeCarpeta, tipoDeArchivo, tamanoLegible, mediosParaCopiar } from "./drive.js";

describe("idDeCarpeta", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-12";

  it("saca el id de cualquier forma del enlace", () => {
    expect(idDeCarpeta(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("acepta el id a secas y rechaza lo que no lo es", () => {
    expect(idDeCarpeta(`  ${ID} `)).toBe(ID);
    expect(idDeCarpeta("mi carpeta")).toBe("");
    expect(idDeCarpeta("")).toBe("");
    expect(idDeCarpeta("https://example.com/cosa")).toBe("");
  });
});

describe("tipoDeArchivo y tamanoLegible", () => {
  it("clasifica por el tipo MIME", () => {
    expect(tipoDeArchivo("application/vnd.google-apps.folder")).toBe("carpeta");
    expect(tipoDeArchivo("image/jpeg")).toBe("imagen");
    expect(tipoDeArchivo("video/quicktime")).toBe("video");
    expect(tipoDeArchivo("application/pdf")).toBe("otro");
  });

  it("escribe el tamaño en KB o MB", () => {
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(0)).toBe("");
    expect(tamanoLegible(3.5 * 1048576)).toMatch(/^3[,.]5 MB$/);
  });
});

describe("la copia en Drive de lo que se programa", () => {
  const m = (ruta) => ({ src: `/api/media/clientes/c1/${ruta}` });
  it("copia lo de la aplicación y de su historia, no lo que vino de Drive ni lo ya copiado", () => {
    const post = {
      medios: [m("posts/a.jpg"), m("drive/b.jpg"), m("estudio/2026-09/c.png"), { src: "https://otro.sitio/x.jpg" }],
      historias: [m("posts/h.jpg"), m("posts/a.jpg")],
      copiasDrive: { "/api/media/clientes/c1/estudio/2026-09/c.png": "id-drive" },
    };
    expect(mediosParaCopiar(post)).toEqual(["/api/media/clientes/c1/posts/a.jpg", "/api/media/clientes/c1/posts/h.jpg"]);
  });
  it("las publicaciones de antes, con sólo `image`", () => {
    expect(mediosParaCopiar({ image: "/api/media/clientes/c1/posts/v.jpg" })).toEqual(["/api/media/clientes/c1/posts/v.jpg"]);
    expect(mediosParaCopiar({})).toEqual([]);
  });
});
