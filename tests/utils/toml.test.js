import { describe, it, expect } from "vitest";
import { leerToml, directivaCSP } from "./toml";

// El lector de netlify.toml valida la plantilla de despliegue entera, así
// que él mismo tiene que estar probado: un lector que se come una
// directiva daría por buena una CSP rota.

describe("leerToml", () => {
  it("lee tablas y tablas anidadas", () => {
    const t = leerToml(`
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
`);
    expect(t.build.command).toBe("npm run build");
    expect(t.build.environment.NODE_VERSION).toBe("22");
  });

  it("lee arrays de tablas conservando el orden", () => {
    const t = leerToml(`
[[redirects]]
  from = "/api/*"
  status = 200

[[redirects]]
  from = "/*"
  status = 200
`);
    expect(t.redirects).toHaveLength(2);
    expect(t.redirects.map((r) => r.from)).toEqual(["/api/*", "/*"]);
    expect(t.redirects[0].status).toBe(200);
  });

  it("distingue enteros, booleanos y cadenas", () => {
    const t = leerToml(`
[x]
  n = 200
  si = true
  no = false
  s = "texto"
`);
    expect(t.x).toEqual({ n: 200, si: true, no: false, s: "texto" });
  });

  it("ignora los comentarios, pero no un # dentro de una cadena", () => {
    const t = leerToml(`
# comentario suelto
[x]
  color = "#050D1F"   # esto sí es comentario
`);
    expect(t.x.color).toBe("#050D1F");
  });

  it("pliega una cadena multilínea con continuación de barra", () => {
    const t = leerToml(`
[h]
  csp = """
    default-src 'self'; \\
    script-src 'self'; \\
    object-src 'none'"""
`);
    expect(t.h.csp).toBe("    default-src 'self'; script-src 'self'; object-src 'none'");
  });

  it("no corta una cadena multilínea en un # interior", () => {
    const t = leerToml(`
[h]
  v = """
    a #uno; \\
    b"""
`);
    expect(t.h.v).toContain("#uno");
  });

  it("lee el netlify.toml real sin perder secciones", () => {
    const t = leerToml(`
[build]
  command = "npm run build"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"

[[headers]]
  for = "/api/*"
  [headers.values]
    Cache-Control = "no-store, max-age=0"
`);
    expect(t.headers).toHaveLength(2);
    expect(t.headers[0].values["X-Frame-Options"]).toBe("DENY");
    expect(t.headers[1].values["Cache-Control"]).toBe("no-store, max-age=0");
  });
});

describe("directivaCSP", () => {
  const csp = "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'";

  it("devuelve los orígenes de una directiva", () => {
    expect(directivaCSP(csp, "connect-src")).toEqual([
      "'self'", "https://*.supabase.co", "wss://*.supabase.co",
    ]);
  });

  it("devuelve null cuando la directiva no está", () => {
    expect(directivaCSP(csp, "frame-ancestors")).toBeNull();
  });

  it("no confunde una directiva con otra que la contiene", () => {
    // `src` no debe casar con `default-src`.
    expect(directivaCSP(csp, "src")).toBeNull();
  });
});
