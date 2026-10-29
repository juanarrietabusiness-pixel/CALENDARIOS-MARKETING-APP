import { describe, it, expect } from "vitest";
import { necesitaCopiaTikTok, TIKTOK_FOTO } from "./fotosTikTok.js";

describe("las fotos para TikTok", () => {
  it("piden su copia si pasan de 1080p, si no son JPEG ni WebP o si no se sabe su tamaño", () => {
    expect(TIKTOK_FOTO).toEqual({ ancho: 1080, alto: 1920 });
    expect(necesitaCopiaTikTok({ src: "/api/media/clientes/c1/a.jpg", ancho: 1080, alto: 1350 })).toBe(false);
    expect(necesitaCopiaTikTok({ src: "/api/media/clientes/c1/a.webp", ancho: 1080, alto: 1920 })).toBe(false);
    expect(necesitaCopiaTikTok({ src: "/api/media/clientes/c1/a.jpg", ancho: 2048, alto: 2560 })).toBe(true);
    expect(necesitaCopiaTikTok({ src: "/api/media/clientes/c1/a.png", ancho: 1080, alto: 1350 })).toBe(true);
    expect(necesitaCopiaTikTok({ src: "/api/media/clientes/c1/a.jpg" })).toBe(true);
  });
});
