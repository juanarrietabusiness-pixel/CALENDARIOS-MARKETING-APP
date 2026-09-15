import { describe, it, expect } from "vitest";
import { leerToml, directivaCSP } from "../utils/toml";
import { leer, hay } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// La plantilla de despliegue
//
// `netlify.toml` es lo único que decide qué cabeceras ve un navegador en
// producción. No hay forma de comprobarlo mirando la aplicación: el sitio
// se ve igual con la CSP puesta que sin ella, y la diferencia sólo
// aparece el día que alguien inyecta algo.
//
// Estos casos convierten cada decisión escrita en netlify.toml —y en los
// comentarios de CLAUDE.md que la explican— en algo que falla solo.
// ============================================================

const toml = leerToml(leer("netlify.toml"));

/** Las cabeceras declaradas para una ruta. */
function cabecerasDe(patron) {
  const bloque = (toml.headers ?? []).find((h) => h.for === patron);
  return bloque?.values ?? null;
}

const globales = cabecerasDe("/*") ?? {};
const csp = globales["Content-Security-Policy"] ?? "";

describe("netlify.toml — construcción", () => {
  it("publica dist/ con el build del proyecto", () => {
    expect(toml.build?.command).toBe("npm run build");
    expect(toml.build?.publish).toBe("dist");
  });

  it("fija la versión de Node", () => {
    expect(
      toml.build?.environment?.NODE_VERSION,
      fallo({
        que: "netlify.toml no fija NODE_VERSION",
        donde: "netlify.toml → [build.environment]",
        porque: "Netlify elegiría la versión por defecto, que cambia sin avisar y ya rompió el arranque del cliente de Supabase.",
        arreglo: 'Añade NODE_VERSION = "22" en [build.environment].',
      }),
    ).toBeTruthy();
  });

  it("declara el directorio de funciones", () => {
    expect(toml.functions?.directory).toBe("netlify/functions");
  });
});

describe("netlify.toml — redirecciones", () => {
  const redirs = toml.redirects ?? [];

  it("manda /api/* a las funciones de Netlify", () => {
    const api = redirs.find((r) => r.from === "/api/*");
    expect(api, "falta la redirección de /api/*").toBeTruthy();
    expect(api.to).toBe("/.netlify/functions/:splat");
    expect(api.status).toBe(200);
  });

  it("deja el respaldo de la SPA en último lugar", () => {
    const i = redirs.findIndex((r) => r.from === "/*");
    expect(
      i,
      fallo({
        que: "falta el respaldo de la SPA",
        donde: "netlify.toml → [[redirects]]",
        porque: "Sin él, recargar en cualquier ruta que no sea / devuelve 404.",
        arreglo: 'Añade un [[redirects]] de "/*" a "/index.html" con status 200.',
      }),
    ).toBeGreaterThanOrEqual(0);

    expect(
      i,
      fallo({
        que: "el respaldo de la SPA no es la última redirección",
        donde: `netlify.toml → [[redirects]] #${i + 1} de ${redirs.length}`,
        porque: "Netlify procesa de arriba abajo y gana la primera coincidencia: un /* por delante se traga /api/* y las funciones dejan de responder.",
        arreglo: "Mueve el bloque de \"/*\" al final del archivo.",
      }),
    ).toBe(redirs.length - 1);
  });

  it("public/_redirects no contradice a netlify.toml", () => {
    // Los dos existen y Netlify lee los dos. Si dicen cosas distintas,
    // gana uno de ellos y nadie recuerda cuál.
    if (!hay("public/_redirects")) return;
    const delArchivo = leer("public/_redirects")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/));

    const delToml = (toml.redirects ?? []).map((r) => [r.from, r.to, String(r.status)]);

    expect(
      delArchivo,
      fallo({
        que: "public/_redirects y netlify.toml declaran redirecciones distintas",
        donde: "public/_redirects vs netlify.toml",
        porque: "Netlify lee ambos; cuando discrepan, la ruta que se aplica depende de cuál gane y deja de ser deducible leyendo el repositorio.",
        arreglo: "Deja las mismas reglas, en el mismo orden, en los dos archivos (o borra public/_redirects y quédate sólo con netlify.toml).",
      }),
    ).toEqual(delToml);
  });
});

describe("netlify.toml — cabeceras de seguridad", () => {
  it("manda las cabeceras básicas en todas las rutas", () => {
    const esperadas = {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
    };
    const faltan = [];
    for (const [nombre, valor] of Object.entries(esperadas)) {
      if (globales[nombre] !== valor) {
        faltan.push(fallo({
          que: `la cabecera ${nombre} no vale «${valor}»`,
          donde: 'netlify.toml → [[headers]] for = "/*"',
          porque: "Es la defensa que no se ve: el sitio funciona igual sin ella hasta el día que no.",
          arreglo: `Pon ${nombre} = "${valor}" en [headers.values].`,
        }));
      }
    }
    expect(faltan.join(""), fallos(faltan)).toBe("");
  });

  it("fuerza HTTPS durante al menos un año", () => {
    const hsts = globales["Strict-Transport-Security"] ?? "";
    const edad = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(
      edad,
      fallo({
        que: `Strict-Transport-Security dura ${edad} s`,
        donde: "netlify.toml → Strict-Transport-Security",
        porque: "Por debajo de un año el navegador vuelve a aceptar http:// antes de tiempo y la primera visita queda expuesta.",
        arreglo: 'Strict-Transport-Security = "max-age=31536000; includeSubDomains".',
      }),
    ).toBeGreaterThanOrEqual(31_536_000);
  });

  it("cierra cámara, micrófono y geolocalización", () => {
    const pp = globales["Permissions-Policy"] ?? "";
    for (const permiso of ["camera", "microphone", "geolocation"]) {
      expect(pp, `Permissions-Policy no cierra ${permiso}`).toContain(`${permiso}=()`);
    }
  });
});

describe("netlify.toml — política de seguridad de contenido", () => {
  it("existe y parte de default-src 'self'", () => {
    expect(csp, "no hay Content-Security-Policy").toBeTruthy();
    expect(directivaCSP(csp, "default-src")).toEqual(["'self'"]);
  });

  it("no deja scripts en línea ni eval", () => {
    const script = directivaCSP(csp, "script-src") ?? [];
    for (const prohibido of ["'unsafe-inline'", "'unsafe-eval'"]) {
      expect(
        script,
        fallo({
          que: `script-src incluye ${prohibido}`,
          donde: "netlify.toml → Content-Security-Policy",
          porque: "Con eso puesto, la CSP deja de proteger de lo único de lo que sirve protegerse: un script inyectado se ejecuta.",
          arreglo: `Quita ${prohibido} de script-src. Vite emite módulos externos, así que no hace falta.`,
        }),
      ).not.toContain(prohibido);
    }
  });

  it("permite estilos en línea, que React necesita", () => {
    // No es un descuido: la prop `style` de React genera atributos en
    // línea. Se afirma para que nadie lo «arregle» y rompa la interfaz.
    expect(directivaCSP(csp, "style-src")).toContain("'unsafe-inline'");
  });

  it("no deja que el navegador hable con ningún proveedor de IA ni con GitHub", () => {
    // Éste es el canario documentado: si estas URLs vuelven a connect-src,
    // es que una clave ha vuelto al front.
    const connect = directivaCSP(csp, "connect-src") ?? [];
    const prohibidos = ["anthropic.com", "groq.com", "api.github.com", "openai.com"];
    const encontrados = connect.filter((o) => prohibidos.some((p) => o.includes(p)));
    expect(
      encontrados,
      fallo({
        que: `connect-src permite llamar a ${encontrados.join(", ")}`,
        donde: "netlify.toml → Content-Security-Policy → connect-src",
        porque: "El navegador no llama a esos servicios: lo hacen las funciones del servidor. Que aparezcan aquí significa que una clave ha vuelto al front.",
        arreglo: "Quítalos de connect-src y mueve la llamada a supabase/functions/. Las claves viven en los secretos del proyecto.",
      }),
    ).toEqual([]);
  });

  it("deja pasar el WebSocket de Supabase, que usan las aprobaciones en vivo", () => {
    const connect = directivaCSP(csp, "connect-src") ?? [];
    expect(
      connect.some((o) => o.startsWith("wss://")),
      fallo({
        que: "connect-src no permite wss://",
        donde: "netlify.toml → Content-Security-Policy → connect-src",
        porque: "Realtime abre un WebSocket: sin esto, las respuestas del cliente final dejan de llegar solas y vuelve el botón de sincronizar.",
        arreglo: "Añade wss://*.supabase.co a connect-src.",
      }),
    ).toBe(true);
  });

  it("prohíbe enmarcar el sitio, los plugins y el secuestro de base", () => {
    expect(directivaCSP(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directivaCSP(csp, "object-src")).toEqual(["'none'"]);
    expect(directivaCSP(csp, "base-uri")).toEqual(["'self'"]);
    expect(directivaCSP(csp, "form-action")).toEqual(["'self'"]);
  });
});

describe("netlify.toml — caché", () => {
  it("no cachea nunca las respuestas de /api/*", () => {
    const api = cabecerasDe("/api/*") ?? {};
    expect(
      api["Cache-Control"] ?? "",
      fallo({
        que: "/api/* no manda Cache-Control: no-store",
        donde: 'netlify.toml → [[headers]] for = "/api/*"',
        porque: "El endpoint de aprobación devuelve el estado de revisión en vivo: cacheado, la agencia ve respuestas viejas.",
        arreglo: 'Cache-Control = "no-store, max-age=0".',
      }),
    ).toContain("no-store");
  });

  it("cachea para siempre los recursos con hash", () => {
    const assets = cabecerasDe("/assets/*") ?? {};
    expect(assets["Cache-Control"] ?? "").toContain("immutable");
    expect(assets["Cache-Control"] ?? "").toContain("max-age=31536000");
  });

  it("revalida siempre el index.html", () => {
    // Si el index se cachea, el navegador sigue pidiendo el bundle viejo
    // aunque el despliegue haya subido uno nuevo.
    const index = cabecerasDe("/index.html") ?? {};
    expect(index["Cache-Control"] ?? "").toContain("must-revalidate");
    expect(index["Cache-Control"] ?? "").toContain("max-age=0");
  });
});

describe("index.html", () => {
  const html = leer("index.html");

  it("referencia sus recursos con %BASE_URL%", () => {
    // El sitio también se publica en GitHub Pages bajo un subdirectorio:
    // una ruta absoluta se rompe allí en silencio.
    const absolutas = [...html.matchAll(/(?:href|content)="(\/[^"]*\.(?:png|svg|ico|jpg))"/g)];
    expect(
      absolutas.map((m) => m[1]),
      fallo({
        que: "index.html referencia recursos con ruta absoluta",
        donde: "index.html",
        porque: "En GitHub Pages el sitio cuelga de un subdirectorio y /logo.png no existe: el icono y la og:image se rompen sin error.",
        arreglo: "Usa %BASE_URL%logo.png en vez de /logo.png.",
      }),
    ).toEqual([]);
  });

  it("declara idioma español", () => {
    expect(html).toMatch(/<html[^>]+lang="es"/);
  });

  it("trae viewport apto para móvil con viewport-fit", () => {
    expect(html).toMatch(/name="viewport"[^>]*width=device-width/);
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it("precalienta la conexión a las fuentes", () => {
    expect(html).toMatch(/rel="preconnect"[^>]+fonts\.googleapis\.com/);
    expect(html).toMatch(/rel="preconnect"[^>]+fonts\.gstatic\.com/);
  });

  it("no carga ningún script de terceros", () => {
    const externos = [...html.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(
      externos,
      fallo({
        que: `index.html carga scripts externos: ${externos.join(", ")}`,
        donde: "index.html",
        porque: "script-src es 'self': ese script no se ejecutaría en producción, y si se ejecuta es que la CSP se ha aflojado.",
        arreglo: "Instala la dependencia y que la empaquete Vite.",
      }),
    ).toEqual([]);
  });
});

describe("vite.config.js", () => {
  const cfg = leer("vite.config.js");

  it("separa React en su propio chunk", () => {
    // React cambia una vez al trimestre y la aplicación diez veces al día:
    // en el mismo chunk, cada despliegue invalida 190 kB de caché.
    expect(cfg).toMatch(/manualChunks/);
    expect(cfg).toMatch(/react-dom/);
  });

  it("usa base relativa cuando publica en GitHub Pages", () => {
    expect(cfg).toMatch(/GITHUB_ACTIONS/);
  });
});

describe("el workflow de CI verifica lo mismo que se despliega", () => {
  const ci = leer(".github/workflows/ci.yml");

  it("corre con la misma versión de Node que Netlify", () => {
    // Con la 20 en CI y la 22 en Netlify, el verde de un PR se daba sobre
    // un runtime que no es el del sitio. Y la 20 no trae WebSocket
    // nativo, que es justo lo que necesita el cliente de Supabase.
    const enNetlify = String(toml.build?.environment?.NODE_VERSION ?? "");
    const enCI = (ci.match(/node-version:\s*["']?(\d+)/) ?? [])[1] ?? "";
    expect(
      enCI,
      fallo({
        que: `CI usa Node ${enCI || "(sin declarar)"} y Netlify construye con Node ${enNetlify}`,
        donde: ".github/workflows/ci.yml vs netlify.toml",
        porque: "El verde de un pull request se estaría dando sobre un runtime distinto al de producción: lo que pasa aquí puede romper allí, y la causa no se parece al síntoma.",
        arreglo: `Pon node-version: ${enNetlify} en ci.yml, o cambia NODE_VERSION en netlify.toml. Los dos números tienen que ser el mismo.`,
      }),
    ).toBe(enNetlify);
  });

  it("pasa el lint, los tests y el build", () => {
    for (const paso of ["npm run lint", "npm test", "npm run build"]) {
      expect(ci, `CI no ejecuta «${paso}»`).toContain(paso);
    }
  });

  it("construye con las variables VITE_ puestas", () => {
    // Sin ellas el build compila media aplicación y CI da verde sin
    // haber compilado lo que se acaba de tocar.
    expect(
      ci,
      fallo({
        que: "CI construye sin las variables VITE_",
        donde: ".github/workflows/ci.yml",
        porque: "Vite constant-folda `isSupabaseEnabled` a false y rollup elimina el panel: el build pasa sin haber compilado lo que se acaba de tocar.",
        arreglo: "Usa `npm run build:verificado`, que las define, en vez de `npm run build` a secas.",
      }),
    ).toMatch(/build:verificado|VITE_SUPABASE_URL/);
  });

  it("mide el bundle después de construirlo", () => {
    expect(ci, "CI no ejecuta los tests de bundle").toContain("npm run test:bundle");
    const iBuild = ci.indexOf("build:verificado");
    const iBundle = ci.indexOf("test:bundle");
    expect(
      iBuild < iBundle,
      fallo({
        que: "los tests de bundle corren antes del build",
        donde: ".github/workflows/ci.yml",
        porque: "Medirían el dist de la ejecución anterior, o ninguno.",
        arreglo: "Deja el paso «Tests de bundle» después de «Construir».",
      }),
    ).toBe(true);
  });

  it("se dispara en los pull requests, que es donde tiene que bloquear", () => {
    expect(ci).toMatch(/^\s*pull_request:/m);
  });

  it("el job que ejecuta el código del PR no puede escribir en el repositorio", () => {
    // Un pull request de fuera puede traer un script en package.json. El
    // job que lo ejecuta no debe tener permisos de escritura.
    const cabecera = ci.slice(0, ci.indexOf("jobs:"));
    expect(
      cabecera,
      fallo({
        que: "el workflow no declara permissions",
        donde: ".github/workflows/ci.yml",
        porque: "Sin declararlos, el token del job hereda los permisos por defecto del repositorio y ejecuta el código del pull request con ellos.",
        arreglo: "Añade `permissions:\\n  contents: read` en la raíz del workflow.",
      }),
    ).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});
