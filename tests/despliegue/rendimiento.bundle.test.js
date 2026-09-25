import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { RAIZ } from "../utils/repo";
import { fallo } from "../utils/fallo";

// ============================================================
// Lo que de verdad descarga el navegador
//
// Este archivo NO se ejecuta con `npm test`: necesita un dist/ recién
// construido. Corre con `npm run test:bundle`, y las dos cosas juntas
// son `npm run verificar`.
//
// Aquí vivía un canario: con Supabase, `npm run build` a secas compilaba
// MEDIA aplicación —sin las VITE_*, Vite plegaba `isSupabaseEnabled` a
// false y rollup borraba el panel entero—, el build pasaba, el hash del
// chunk ni cambiaba, y no se había verificado nada.
//
// Ese canario ya no hace falta: la API vive en el mismo origen y no hay
// ninguna variable de la que dependa QUÉ se compila. Se queda la
// comprobación de contenido —que el panel esté dentro—, porque avisa de
// lo mismo sin depender de un número.
// ============================================================

const DIST = join(RAIZ, "dist");
const ASSETS = join(DIST, "assets");

// Presupuestos, en kB de transferencia (gzip) salvo donde se diga.
// Se fijan con holgura sobre la medida de hoy: la idea no es congelar el
// tamaño, es que doblarlo tenga que ser una decisión y no un descuido.
// Bajados tras la migración: quitar @supabase/supabase-js —que arrastraba
// PostgREST, GoTrue, Storage y Realtime con su WebSocket— se llevó 54 kB
// comprimidos del chunk principal, de 150 a 96. Los presupuestos bajan
// con él: dejarlos donde estaban sería regalar el margen que acabamos de
// ganar.
const PRESUPUESTO = {
  jsTotalGz: 170,    // hoy ~155
  cssGz: 12,         // hoy ~6
  chunkMayorGz: 110, // hoy ~96
  htmlGz: 2,
  totalInicialGz: 180,
};

let archivos = [];
const kb = (n) => Math.round(n / 1024);
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

beforeAll(() => {
  if (!existsSync(ASSETS)) {
    throw new Error(
      "\n\n  No hay dist/ que medir.\n" +
      "  Construye antes:\n\n    npm run build\n\n" +
      "  O ejecuta `npm run verificar`, que hace las dos cosas.\n",
    );
  }
  archivos = readdirSync(ASSETS).map((n) => {
    const buf = readFileSync(join(ASSETS, n));
    return { nombre: n, bytes: buf.length, gzip: gz(buf), buf };
  });
});

const js = () => archivos.filter((a) => a.nombre.endsWith(".js"));
const css = () => archivos.filter((a) => a.nombre.endsWith(".css"));

/**
 * Lo que se descarga ANTES de pintar: lo que `index.html` pide o precarga.
 * Un chunk de `import()` —el asistente— no entra hasta que se abre, así
 * que contarlo aquí castigaba justo el arreglo que el presupuesto pide.
 * Los diferidos siguen vigilados, cada uno, por «ningún chunk se desmadra».
 */
/**
 * El CSS que se descarga antes de pintar, igual que `jsInicial`: el de
 * la página del cliente y el de Ajustes van en su chunk y sólo bajan al
 * abrir esas páginas.
 */
const cssInicial = () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  return css().filter((a) => html.includes(`/assets/${a.nombre}`));
};

const jsInicial = () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  return js().filter((a) => html.includes(`/assets/${a.nombre}`));
};

describe("el dist que se mide es la aplicación entera", () => {
  it("el panel está dentro del bundle", () => {
    // Una comprobación de CONTENIDO, no de tamaño: el tope de kB avisa
    // de que falta bulto, pero no de QUÉ falta.
    //
    // Las marcas son rutas y textos que sólo existen dentro del panel.
    // «Calendario» no valdría: aparece en sitios que se compilan
    // siempre. Antes una de las marcas era «share_calendar», el nombre
    // de la RPC de Supabase; ahora es la ruta que la sustituyó.
    const todo = js().map((a) => a.buf.toString("utf8")).join("");
    const marcas = ["/enlace", "Banco de contenido", "/espacio"];
    const ausentes = marcas.filter((m) => !todo.includes(m));
    expect(
      ausentes,
      fallo({
        que: `el bundle no contiene ${ausentes.join(", ")}`,
        donde: "dist/assets/",
        porque: "Es código que sólo existe dentro del panel. Si no está, rollup lo eliminó y lo que se está midiendo no es la aplicación entera.",
        arreglo: "Revisa que el build no esté tirando el panel por una rama muerta, y que las marcas sigan existiendo en el código.",
      }),
    ).toEqual([]);
  });
});

describe("el HTML publicado encuentra sus recursos", () => {
  it("cada ruta que referencia index.html existe en dist/", () => {
    // ESTE ES EL TEST QUE FALTABA. `base` estaba condicionado a
    // GITHUB_ACTIONS por la época de GitHub Pages, así que el build de
    // CI —el que se publica— salía pidiendo
    // /CALENDARIOS-MARKETING-APP/assets/index-*.js. Esa ruta no existe,
    // el respaldo de la SPA devuelve index.html en su lugar, y el
    // navegador se niega a ejecutar HTML como módulo: página en blanco,
    // con el título correcto en la pestaña y sin nada que mirar.
    //
    // Los pesos no lo detectaban: el bundle pesaba lo de siempre. Sólo
    // lo detecta comprobar que las rutas resuelven.
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    const rutas = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|png|svg|ico))"/g)]
      .map((m) => m[1]);

    expect(rutas.length, "index.html no referencia ningún recurso propio").toBeGreaterThan(0);

    const rotas = rutas.filter((r) => !existsSync(join(DIST, r.replace(/^\//, ""))));
    expect(
      rotas,
      fallo({
        que: `index.html pide recursos que no están en dist/: ${rotas.join(", ")}`,
        donde: "dist/index.html — y casi seguro `base` en vite.config.js",
        porque: "La ruta no existe, el respaldo de la SPA devuelve index.html en su lugar, y el navegador rechaza ejecutar HTML como módulo. La página sale EN BLANCO, con el título correcto y sin ningún error en el registro.",
        arreglo: "Comprueba que `base` en vite.config.js sea la del sitio publicado. No la condiciones a una variable de CI: el build de CI es el que se publica.",
      }),
    ).toEqual([]);
  });
});

describe("presupuesto de descarga", () => {
  it("el JavaScript total cabe en el presupuesto", () => {
    const total = Math.round(jsInicial().reduce((s, a) => s + a.gzip, 0) / 1024);
    expect(
      total,
      fallo({
        que: `el JavaScript pesa ${total} kB comprimidos, por encima de ${PRESUPUESTO.jsTotalGz}`,
        donde: jsInicial().map((a) => `${a.nombre} (${kb(a.gzip)} kB gz)`).join(", "),
        porque: "Es lo que se descarga antes de ver nada. En una conexión móvil cada 50 kB son casi un segundo de pantalla en blanco.",
        arreglo: "Mira qué entró nuevo en el chunk grande y sepáralo con import() dinámico, o sube el presupuesto a conciencia en tests/despliegue/rendimiento.bundle.test.js.",
      }),
    ).toBeLessThanOrEqual(PRESUPUESTO.jsTotalGz);
  });

  it("ningún chunk se desmadra por su cuenta", () => {
    const mayor = js().sort((a, b) => b.gzip - a.gzip)[0];
    expect(
      Math.round(mayor.gzip / 1024),
      fallo({
        que: `${mayor.nombre} pesa ${kb(mayor.gzip)} kB comprimidos`,
        donde: `dist/assets/${mayor.nombre}`,
        porque: "Un único chunk gigante se descarga y se analiza entero antes de pintar, aunque la mitad sea de pantallas que no se han abierto.",
        arreglo: "Carga con import() lo que no hace falta en el primer pintado (el asistente, los paneles de chat, el modal del prompt maestro).",
      }),
    ).toBeLessThanOrEqual(PRESUPUESTO.chunkMayorGz);
  });

  it("los estilos caben en el presupuesto", () => {
    const total = Math.round(cssInicial().reduce((s, a) => s + a.gzip, 0) / 1024);
    expect(total, `el CSS inicial pesa ${total} kB comprimidos`).toBeLessThanOrEqual(PRESUPUESTO.cssGz);
    // Y ningún CSS diferido se desmadra por su cuenta.
    for (const a of css()) expect(Math.round(a.gzip / 1024), `${a.nombre}`).toBeLessThanOrEqual(PRESUPUESTO.cssGz);
  });

  it("la primera visita entera cabe en el presupuesto", () => {
    const html = statSync(join(DIST, "index.html")).size;
    const total = Math.round(
      (jsInicial().reduce((s, a) => s + a.gzip, 0) + cssInicial().reduce((s, a) => s + a.gzip, 0) + gz(readFileSync(join(DIST, "index.html")))) / 1024,
    );
    expect(html).toBeGreaterThan(0);
    expect(total, `la carga inicial suma ${total} kB comprimidos`).toBeLessThanOrEqual(PRESUPUESTO.totalInicialGz);
  });
});

describe("la caché puede hacer su trabajo", () => {
  it("todo recurso lleva hash de contenido en el nombre", () => {
    const sinHash = archivos.filter((a) => !/-[A-Za-z0-9_-]{8,}\.(js|css|png|jpg|svg|woff2?)$/.test(a.nombre));
    expect(
      sinHash.map((a) => a.nombre),
      fallo({
        que: "hay recursos sin hash en el nombre",
        donde: sinHash.map((a) => `dist/assets/${a.nombre}`).join(", "),
        porque: "public/_headers cachea /assets/* como inmutable durante un año: un archivo sin hash queda congelado en los navegadores con la versión vieja.",
        arreglo: "Deja que Vite nombre los assets; no fuerces nombres fijos en rollupOptions.output.",
      }),
    ).toEqual([]);
  });

  it("React viaja en su propio chunk", () => {
    const reactChunk = js().find((a) => /^react-/.test(a.nombre));
    expect(
      reactChunk,
      fallo({
        que: "React no está en un chunk aparte",
        donde: "dist/assets/",
        porque: "React cambia una vez al trimestre y la aplicación diez veces al día: juntos, cada despliegue invalida 190 kB de caché que no habían cambiado.",
        arreglo: "Revisa manualChunks en vite.config.js.",
      }),
    ).toBeTruthy();
    expect(reactChunk.bytes).toBeGreaterThan(100 * 1024);
  });

  it("los chunks de aplicación y de React son archivos distintos", () => {
    const nombres = js().map((a) => a.nombre);
    expect(nombres.length, `sólo hay un chunk: ${nombres.join(", ")}`).toBeGreaterThanOrEqual(2);
  });
});

describe("no se publica material de desarrollo", () => {
  it("no hay sourcemaps en dist", () => {
    const mapas = readdirSync(ASSETS).filter((n) => n.endsWith(".map"));
    expect(
      mapas,
      fallo({
        que: "hay sourcemaps publicados",
        donde: mapas.map((m) => `dist/assets/${m}`).join(", "),
        porque: "Un sourcemap devuelve el código original completo, con los comentarios y la estructura de carpetas.",
        arreglo: "Deja build.sourcemap en false (es el valor por defecto de Vite).",
      }),
    ).toEqual([]);
  });

  it("el bundle no contiene rutas de la máquina que construyó", () => {
    const todo = js().map((a) => a.buf.toString("utf8")).join("");
    for (const pista of ["/home/", "/Users/", "C:\\\\Users"]) {
      expect(todo.includes(pista), `el bundle filtra rutas locales (${pista})`).toBe(false);
    }
  });

  it("el JavaScript está minificado", () => {
    const mayor = js().sort((a, b) => b.bytes - a.bytes)[0];
    const texto = mayor.buf.toString("utf8");
    const lineas = texto.split("\n").length;
    const media = texto.length / lineas;
    expect(media, `${mayor.nombre} parece sin minificar (${Math.round(media)} caracteres por línea)`).toBeGreaterThan(200);
  });
});
