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
// construido y con las variables VITE_ puestas. Corre con
// `npm run test:bundle`, y las dos cosas juntas son `npm run verificar`.
//
// La separación no es un capricho. `npm run build` a secas compila media
// aplicación: sin las VITE_*, `isSupabaseEnabled` se constant-folda a
// false y rollup elimina el panel entero. El build pasa, el bundle sale a
// 137 kB en vez de 570, y no se ha verificado nada. El primer caso de
// aquí es exactamente ese: un canario que falla si el dist que se está
// midiendo es el de media aplicación.
// ============================================================

const DIST = join(RAIZ, "dist");
const ASSETS = join(DIST, "assets");

// Presupuestos, en kB de transferencia (gzip) salvo donde se diga.
// Se fijan con holgura sobre la medida de hoy: la idea no es congelar el
// tamaño, es que doblarlo tenga que ser una decisión y no un descuido.
const PRESUPUESTO = {
  jsTotalGz: 230,   // hoy ~210
  cssGz: 12,        // hoy ~6
  chunkMayorGz: 170, // hoy ~150
  htmlGz: 2,
  totalInicialGz: 240,
};

// Por debajo de esto, el dist es el de un build sin variables VITE_.
const MINIMO_JS_CRUDO_KB = 400;

let archivos = [];
const kb = (n) => Math.round(n / 1024);
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

beforeAll(() => {
  if (!existsSync(ASSETS)) {
    throw new Error(
      "\n\n  No hay dist/ que medir.\n" +
      "  Construye antes con las variables puestas:\n\n" +
      '    VITE_SUPABASE_URL="https://ejemplo.supabase.co" \\\n' +
      '    VITE_SUPABASE_ANON_KEY="verificacion-de-build" npm run build\n\n' +
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

describe("el dist que se mide es la aplicación entera", () => {
  it("no es un build sin variables VITE_", () => {
    const crudoKb = kb(js().reduce((s, a) => s + a.bytes, 0));
    expect(
      crudoKb,
      fallo({
        que: `el JavaScript construido pesa ${crudoKb} kB, menos de ${MINIMO_JS_CRUDO_KB}`,
        donde: "dist/assets/",
        porque: "Sin las VITE_*, Vite constant-folda `isSupabaseEnabled` a false y rollup elimina el panel entero. El build pasa, el hash del chunk ni cambia, y lo que se acaba de tocar no se ha compilado.",
        arreglo: 'Construye con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY definidas, o usa `npm run verificar`.',
      }),
    ).toBeGreaterThan(MINIMO_JS_CRUDO_KB);
  });

  it("el panel está dentro del bundle", () => {
    // Una comprobación de contenido, no de tamaño: el tope de kB avisa de
    // que falta bulto, pero no de QUÉ falta.
    //
    // Las marcas están escogidas midiendo los dos builds: aparecen en el
    // completo y desaparecen del que se construye sin variables. Una
    // cadena como «Calendario» no vale, porque sobrevive en el aviso de
    // configuración que sí se compila siempre.
    const todo = js().map((a) => a.buf.toString("utf8")).join("");
    const marcas = ["share_calendar", "Banco de contenido"];
    const ausentes = marcas.filter((m) => !todo.includes(m));
    expect(
      ausentes,
      fallo({
        que: `el bundle no contiene ${ausentes.join(", ")}`,
        donde: "dist/assets/",
        porque: "Son código que sólo existe dentro del panel: si no están, rollup lo eliminó y lo que se está midiendo es el aviso de configuración.",
        arreglo: "Construye con las variables VITE_ definidas (`npm run verificar`).",
      }),
    ).toEqual([]);
  });
});

describe("presupuesto de descarga", () => {
  it("el JavaScript total cabe en el presupuesto", () => {
    const total = Math.round(js().reduce((s, a) => s + a.gzip, 0) / 1024);
    expect(
      total,
      fallo({
        que: `el JavaScript pesa ${total} kB comprimidos, por encima de ${PRESUPUESTO.jsTotalGz}`,
        donde: js().map((a) => `${a.nombre} (${kb(a.gzip)} kB gz)`).join(", "),
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
    const total = Math.round(css().reduce((s, a) => s + a.gzip, 0) / 1024);
    expect(total, `el CSS pesa ${total} kB comprimidos`).toBeLessThanOrEqual(PRESUPUESTO.cssGz);
  });

  it("la primera visita entera cabe en el presupuesto", () => {
    const html = statSync(join(DIST, "index.html")).size;
    const total = Math.round(
      (js().reduce((s, a) => s + a.gzip, 0) + css().reduce((s, a) => s + a.gzip, 0) + gz(readFileSync(join(DIST, "index.html")))) / 1024,
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
        porque: "netlify.toml cachea /assets/* como inmutable durante un año: un archivo sin hash queda congelado en los navegadores con la versión vieja.",
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
