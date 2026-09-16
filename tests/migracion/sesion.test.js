import { describe, it, expect } from "vitest";
import { leer } from "../utils/repo";
import {
  derivar, hashearContrasena, ITERACIONES, MAX_POR_LLAMADA,
  leerCookie, cookieSesion, cookieBorrada, COOKIE,
} from "../../worker/lib/sesion.js";

// ============================================================
// El acceso
//
// Estos casos existen porque el acceso devolvió 500 en producción
// mientras en local funcionaba y los 278 tests estaban en verde:
// workerd rechaza más de 100.000 iteraciones de PBKDF2 por llamada, y
// ese tope NO lo aplican ni `wrangler dev` ni Node.
// ============================================================

const SAL = "00112233445566778899aabbccddeeff";

describe("PBKDF2 dentro del tope que impone workerd", () => {
  it("ninguna vuelta pide más de 100.000 iteraciones", async () => {
    // El tope es de producción, así que ningún entorno de pruebas lo
    // detecta ejecutando. Se comprueba espiando lo que se le pide a
    // crypto.subtle.
    const pedidas = [];
    const original = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = (algo, ...resto) => {
      pedidas.push(algo.iterations);
      return original(algo, ...resto);
    };
    try {
      await derivar("prueba", SAL);
    } finally {
      crypto.subtle.deriveBits = original;
    }

    expect(pedidas.length, "no se llamó a deriveBits").toBeGreaterThan(0);
    expect(
      pedidas.filter((n) => n > MAX_POR_LLAMADA),
      `workerd rechaza en PRODUCCIÓN más de ${MAX_POR_LLAMADA} por llamada; ` +
      `se pidieron: ${pedidas.join(", ")}`,
    ).toEqual([]);
  });

  it("y entre todas suman el trabajo declarado", async () => {
    const pedidas = [];
    const original = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = (algo, ...resto) => {
      pedidas.push(algo.iterations);
      return original(algo, ...resto);
    };
    try {
      await derivar("prueba", SAL);
    } finally {
      crypto.subtle.deriveBits = original;
    }
    expect(pedidas.reduce((a, b) => a + b, 0)).toBe(ITERACIONES);
  });

  it("el total llega a lo que recomienda OWASP para SHA-256", () => {
    expect(ITERACIONES).toBeGreaterThanOrEqual(600_000);
  });
});

describe("derivar", () => {
  it("es determinista: la misma contraseña y sal dan el mismo hash", async () => {
    expect(await derivar("secreta", SAL)).toBe(await derivar("secreta", SAL));
  });

  it("cambia con la contraseña y con la sal", async () => {
    const base = await derivar("secreta", SAL);
    expect(await derivar("otra", SAL)).not.toBe(base);
    expect(await derivar("secreta", "ffeeddccbbaa99887766554433221100")).not.toBe(base);
  });

  it("hashearContrasena devuelve sal nueva cada vez", async () => {
    const a = await hashearContrasena("secreta");
    const b = await hashearContrasena("secreta");
    expect(a.salt).not.toBe(b.salt);
    expect(a.password_hash).not.toBe(b.password_hash);
    expect(a.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("el hash del alta lo verifica derivar con su sal", async () => {
    // Si esto falla, el alta guarda un hash que el acceso no puede
    // reproducir: nadie entra, y el síntoma es «contraseña incorrecta».
    const { salt, password_hash } = await hashearContrasena("unaContraseñaLarga");
    expect(await derivar("unaContraseñaLarga", salt)).toBe(password_hash);
  });
});

describe("el alta y el acceso no pueden divergir", () => {
  it("el script de alta importa la derivación, no la reimplementa", () => {
    // Antes la copiaba. Dos implementaciones del mismo hash es una que
    // se queda atrás: el día que una cambie un parámetro, el hash
    // guardado deja de cuadrar y nadie entra, sin nada que lo explique.
    const script = leer("scripts/sembrar-admin.mjs");
    expect(script, "el script no importa de worker/lib/sesion.js")
      .toMatch(/import \{[^}]*hashearContrasena[^}]*\} from "\.\.\/worker\/lib\/sesion\.js"/);
    expect(script, "el script vuelve a implementar PBKDF2 por su cuenta")
      .not.toMatch(/deriveBits|importKey/);
  });
});

describe("la cookie de sesión", () => {
  it("lleva prefijo __Host- y no declara Domain", () => {
    // `__Host-` PROHÍBE Domain: el navegador rechazaría la cookie si lo
    // llevara, y sin el prefijo cualquier subdominio la vería.
    const c = cookieSesion("abc123");
    expect(c.startsWith(`${COOKIE}=`)).toBe(true);
    expect(c).not.toMatch(/Domain=/);
    for (const atributo of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) {
      expect(c, `falta ${atributo}`).toContain(atributo);
    }
  });

  it("la de borrado caduca en el acto", () => {
    expect(cookieBorrada()).toContain("Max-Age=0");
  });

  it("se lee de entre varias cookies", () => {
    const req = { headers: { get: () => `otra=1; ${COOKIE}=elvalor; mas=2` } };
    expect(leerCookie(req)).toBe("elvalor");
  });

  it("devuelve null cuando no está", () => {
    expect(leerCookie({ headers: { get: () => "otra=1" } })).toBe(null);
    expect(leerCookie({ headers: { get: () => null } })).toBe(null);
  });
});
