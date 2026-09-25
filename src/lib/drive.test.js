import { describe, it, expect } from "vitest";
import { idDeCarpeta, tipoDeArchivo, tamanoLegible } from "./drive.js";

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
