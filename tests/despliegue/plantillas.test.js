import { describe, it, expect } from "vitest";
import { wrangler, cabecerasDe, csp } from "../utils/config";
import { leer } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// La plantilla de despliegue
//
// Antes era `netlify.toml` y decidía él solo qué cabeceras veía un
// navegador. Ahora son TRES ficheros, y esa división es la trampa
// principal de esta migración:
//
//   wrangler.jsonc            qué se despliega y con qué ataduras
//   public/_headers           cabeceras de los recursos ESTÁTICOS
//   worker/lib/respuesta.js   cabeceras de /api/*
//
// La documentación de Workers Static Assets lo dice con todas las
// letras: «los encabezados personalizados definidos en _headers no se
// aplican a las respuestas generadas por el código de tu Worker». Quien
// traduzca netlify.toml a _headers y se quede ahí deja la API sin
// nosniff, sin Cache-Control y sin CSP —y el sitio se verá exactamente
// igual—.
//
// Nada de esto se ve mirando la pantalla. Por eso está aquí.
// ============================================================

const W = wrangler();
const RESPUESTA = leer("worker/lib/respuesta.js");

describe("wrangler.jsonc — qué se despliega", () => {
  it("publica dist/, que es lo que construye vite", () => {
    expect(
      W.assets?.directory,
      fallo({
        que: "el Worker no publica dist/",
        donde: "wrangler.jsonc → assets.directory",
        porque: "Se desplegaría un directorio que el build no genera: el sitio saldría vacío o con la versión anterior.",
        arreglo: 'Pon "directory": "./dist/".',
      }),
    ).toMatch(/dist/);
    expect(W.main, "el Worker no apunta a worker/index.js").toMatch(/worker\/index\.js$/);
  });

  it("deja el respaldo de la SPA puesto", () => {
    // Sin esto, /aprobar?t=… devuelve 404: es el equivalente del
    // `/* → /index.html 200` que tenía Netlify.
    expect(
      W.assets?.not_found_handling,
      fallo({
        que: "no está configurado el respaldo de aplicación de una sola página",
        donde: "wrangler.jsonc → assets.not_found_handling",
        porque: "La página de aprobación vive en una ruta que no existe como archivo. Sin el respaldo, el cliente final recibe un 404 del borde y no llega a ver nada.",
        arreglo: 'Pon "not_found_handling": "single-page-application".',
      }),
    ).toBe("single-page-application");
  });

  it("sólo despierta al Worker en /api/*", () => {
    const rutas = W.assets?.run_worker_first ?? [];
    expect(
      rutas,
      fallo({
        que: "run_worker_first no acota a /api/*",
        donde: "wrangler.jsonc → assets.run_worker_first",
        porque: "Si el Worker se despierta para cada imagen y cada chunk, se paga una invocación por recurso y se pierde la caché del borde.",
        arreglo: 'Pon "run_worker_first": ["/api/*"].',
      }),
    ).toContain("/api/*");
  });

  it("ata D1 y R2 con los nombres que usa el código", () => {
    const d1 = W.d1_databases?.[0];
    const r2 = W.r2_buckets?.[0];
    const usadas = [...leer("worker/index.js").matchAll(/env\.([A-Z_]+)/g)].map((m) => m[1]);

    const lista = [];
    if (d1?.binding !== "DB") lista.push(fallo({
      que: "la atadura de D1 no se llama DB",
      donde: "wrangler.jsonc → d1_databases",
      porque: "El Worker lee env.DB. Con otro nombre, `env.DB` es undefined y toda la API responde 500 en cuanto toca datos.",
      arreglo: 'Pon "binding": "DB".',
    }));
    if (r2?.binding !== "MEDIA") lista.push(fallo({
      que: "la atadura de R2 no se llama MEDIA",
      donde: "wrangler.jsonc → r2_buckets",
      porque: "El Worker lee env.MEDIA para servir y guardar imágenes.",
      arreglo: 'Pon "binding": "MEDIA".',
    }));
    for (const nombre of ["DB", "MEDIA", "ASSETS"]) {
      if (!usadas.includes(nombre)) continue;
      const declarada = d1?.binding === nombre || r2?.binding === nombre || W.assets?.binding === nombre;
      if (!declarada) lista.push(fallo({
        que: `el Worker usa env.${nombre} y no está declarada`,
        donde: "wrangler.jsonc",
        porque: "En producción es undefined y falla en tiempo de ejecución, no al desplegar.",
        arreglo: `Declara la atadura «${nombre}».`,
      }));
    }
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("no lleva ningún secreto escrito", () => {
    // Las claves van con `wrangler secret put`. En wrangler.jsonc
    // quedarían versionadas, que es exactamente lo que no puede pasar.
    const vars = Object.keys(W.vars ?? {});
    const sospechosas = vars.filter((v) => /KEY|TOKEN|SECRET|PASSWORD/i.test(v));
    expect(
      sospechosas,
      fallo({
        que: `hay variables con pinta de secreto en wrangler.jsonc: ${sospechosas.join(", ")}`,
        donde: "wrangler.jsonc → vars",
        porque: "`vars` se versiona en el repositorio y se ve en el panel. Una clave ahí está publicada.",
        arreglo: "Sácala a `wrangler secret put NOMBRE`.",
      }),
    ).toEqual([]);
  });
});

describe("cabeceras de seguridad — en LOS DOS sitios", () => {
  const BASICAS = {
    "X-Frame-Options": /DENY/,
    "X-Content-Type-Options": /nosniff/,
    "Referrer-Policy": /strict-origin/,
  };

  it("los recursos estáticos las llevan", () => {
    const h = cabecerasDe("/index.html");
    const lista = Object.entries(BASICAS)
      .filter(([nombre, re]) => !re.test(h[nombre] ?? ""))
      .map(([nombre]) => fallo({
        que: `falta la cabecera ${nombre}`,
        donde: "public/_headers → /*",
        porque: "Sin ella el navegador permite enmarcar el sitio, adivinar tipos MIME o filtrar la dirección completa al salir.",
        arreglo: `Añade ${nombre} a la regla /* de public/_headers.`,
      }));
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("las respuestas de /api/* TAMBIÉN las llevan", () => {
    // Ésta es la trampa. `_headers` no toca lo que genera el Worker, así
    // que traducir netlify.toml y quedarse ahí deja la API desnuda sin
    // ningún síntoma visible.
    const lista = Object.entries(BASICAS)
      .filter(([nombre]) => !new RegExp(`["']${nombre}["']\\s*:`).test(RESPUESTA))
      .map(([nombre]) => fallo({
        que: `las respuestas de la API no llevan ${nombre}`,
        donde: "worker/lib/respuesta.js → CABECERAS_API",
        porque: "public/_headers NO se aplica a lo que genera el Worker. La API se queda sin esa cabecera y el sitio se ve exactamente igual.",
        arreglo: `Añade ${nombre} a CABECERAS_API.`,
      }));
    expect(lista, fallos(lista)).toEqual([]);
  });

  it("la API no se cachea nunca", () => {
    // Devuelve estado en vivo —aprobaciones, sesión—: una copia vieja
    // miente sin dar ningún síntoma de estar mintiendo.
    expect(
      RESPUESTA,
      fallo({
        que: "CABECERAS_API no fuerza no-store",
        donde: "worker/lib/respuesta.js",
        porque: "Una aprobación cacheada muestra el estado de ayer como si fuera el de ahora.",
        arreglo: 'Añade "Cache-Control": "no-store, max-age=0" a CABECERAS_API.',
      }),
    ).toMatch(/no-store/);
  });

  it("fuerza HTTPS durante al menos un año", () => {
    const hsts = cabecerasDe("/index.html")["Strict-Transport-Security"] ?? "";
    const edad = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(
      edad,
      fallo({
        que: `Strict-Transport-Security dura ${edad} s`,
        donde: "public/_headers",
        porque: "Por debajo de un año, un navegador que no haya vuelto en meses acepta la primera petición en claro.",
        arreglo: "Pon max-age=31536000; includeSubDomains.",
      }),
    ).toBeGreaterThanOrEqual(31_536_000);
  });

  it("cierra cámara, micrófono y geolocalización", () => {
    const p = cabecerasDe("/index.html")["Permissions-Policy"] ?? "";
    for (const permiso of ["camera", "microphone", "geolocation"]) {
      expect(p, `Permissions-Policy no cierra ${permiso}`).toMatch(new RegExp(`${permiso}=\\(\\)`));
    }
  });
});

describe("política de seguridad de contenido", () => {
  const C = csp();

  it("existe y parte de default-src 'self'", () => {
    expect(
      C["default-src"],
      fallo({
        que: "la CSP no parte de default-src 'self'",
        donde: "public/_headers",
        porque: "Sin una base restrictiva, cada directiva que falte queda abierta por defecto.",
        arreglo: "Empieza la CSP por default-src 'self'.",
      }),
    ).toEqual(["'self'"]);
  });

  it("no deja scripts en línea ni eval", () => {
    const s = C["script-src"] ?? [];
    expect(
      s,
      fallo({
        que: "script-src permite código en línea",
        donde: "public/_headers",
        porque: "Con 'unsafe-inline' en script-src, un <script> inyectado se ejecuta y la CSP deja de servir para nada. Vite emite módulos externos: no hace ninguna falta.",
        arreglo: "Quita 'unsafe-inline' y 'unsafe-eval' de script-src.",
      }),
    ).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
  });

  it("permite estilos en línea, que React necesita", () => {
    // React aplica la prop `style` como atributo en línea. Sin esto la
    // interfaz se pinta sin la mitad de sus estilos.
    expect(C["style-src"] ?? []).toContain("'unsafe-inline'");
  });

  it("el navegador no habla con ningún proveedor de IA ni con GitHub", () => {
    const conectar = (C["connect-src"] ?? []).join(" ");
    const prohibidos = ["anthropic", "groq", "api.github.com", "openai"];
    const encontrados = prohibidos.filter((p) => conectar.includes(p));
    expect(
      encontrados,
      fallo({
        que: `connect-src deja hablar con: ${encontrados.join(", ")}`,
        donde: "public/_headers",
        porque: "Esas llamadas las hace el Worker con las claves del servidor. Si el navegador necesita hacerlas, es que una clave ha vuelto al front.",
        arreglo: "Quítalos de connect-src y mueve la llamada a worker/rutas/.",
      }),
    ).toEqual([]);
  });

  it("connect-src 'self' es lo que abre también el WebSocket", () => {
    // Y por eso NO hay que añadir `wss://…` cuando se toca el tiempo
    // real. La especificación de CSP dice que, en una página https,
    // `'self'` casa con `wss:` del mismo host. Alguien que vea el socket
    // caer en local —donde la CSP ni siquiera se aplica igual— podría
    // «arreglarlo» metiendo un origen aquí, y eso rompe la regla de oro
    // del repositorio: si en connect-src aparece un tercero, es la señal
    // de que una clave ha vuelto al navegador.
    expect(C["connect-src"], "connect-src dejó de ser 'self' a secas").toEqual(["'self'"]);
    expect(
      (C["connect-src"] ?? []).join(" "),
      "no hace falta declarar wss: y declararlo enturbia la regla",
    ).not.toContain("wss:");
  });

  it("connect-src ya no necesita a Supabase: la API va en el mismo origen", () => {
    const conectar = (C["connect-src"] ?? []).join(" ");
    expect(
      conectar,
      fallo({
        que: "connect-src sigue nombrando a Supabase",
        donde: "public/_headers",
        porque: "La aplicación ya no habla con Supabase. Un permiso que sobra es un permiso que alguien puede usar, y además disimula que la migración quedó a medias.",
        arreglo: "Deja connect-src en 'self' a secas.",
      }),
    ).not.toMatch(/supabase/i);
    expect(C["connect-src"]).toEqual(["'self'"]);
  });

  it("prohíbe enmarcar el sitio, los plugins y el secuestro de base", () => {
    expect(C["frame-ancestors"]).toEqual(["'none'"]);
    expect(C["object-src"]).toEqual(["'none'"]);
    expect(C["base-uri"]).toEqual(["'self'"]);
    expect(C["form-action"]).toEqual(["'self'"]);
  });
});

describe("caché de los recursos", () => {
  it("cachea para siempre los recursos con hash", () => {
    const cc = cabecerasDe("/assets/index-abc123.js")["Cache-Control"] ?? "";
    expect(
      cc,
      fallo({
        que: "los recursos con hash no se cachean como inmutables",
        donde: "public/_headers → /assets/*",
        porque: "Llevan el hash del contenido en el nombre: nunca cambian sin cambiar de nombre. Revalidarlos es una petición de más en cada carga.",
        arreglo: "Cache-Control: public, max-age=31536000, immutable",
      }),
    ).toMatch(/immutable/);
  });

  it("revalida siempre el index.html", () => {
    const cc = cabecerasDe("/index.html")["Cache-Control"] ?? "";
    expect(
      cc,
      fallo({
        que: "index.html se cachea sin revalidar",
        donde: "public/_headers → /index.html",
        porque: "Es quien nombra los recursos con hash. Cacheado, un navegador sigue pidiendo la versión anterior de todo aunque ya esté desplegada la nueva.",
        arreglo: "Cache-Control: public, max-age=0, must-revalidate",
      }),
    ).toMatch(/must-revalidate|no-cache/);
  });
});

describe("index.html", () => {
  const html = leer("index.html");

  it("referencia sus recursos con %BASE_URL%", () => {
    // `%BASE_URL%` se resuelve con la base del build, así que el HTML
    // sigue valiendo si algún día el sitio cuelga de un subdirectorio.
    // Hoy la base es «/» y las dos formas coinciden; la plantilla se
    // mantiene porque no cuesta nada y evita rehacer esto.
    const absolutas = [...html.matchAll(/(?:href|content)="(\/[^"]*\.(?:png|svg|ico|jpg))"/g)];
    expect(
      absolutas.map((m) => m[1]),
      fallo({
        que: "index.html referencia recursos con ruta absoluta",
        donde: "index.html",
        porque: "Una ruta absoluta se rompe en silencio el día que el sitio cuelgue de un subdirectorio: el icono y la og:image dejan de estar y no hay ningún error.",
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

  it("la base NO depende de si construye CI", () => {
    // Este test decía lo contrario —exigía GITHUB_ACTIONS— porque el
    // sitio se publicaba en GitHub Pages bajo un subdirectorio. Cuando
    // el despliegue pasó a Cloudflare, la condición se quedó y siguió
    // exigiéndose: el build de CI, que es EL QUE SE PUBLICA, salía con
    // los recursos colgando de /CALENDARIOS-MARKETING-APP/ y la página
    // quedaba en blanco.
    //
    // Es la peor forma de un fallo: en local todo bien, y sólo se rompe
    // lo que llega al usuario.
    // Sin quitar los comentarios, el propio comentario que explica esta
    // historia —que nombra GITHUB_ACTIONS— hace fallar el test. Es el
    // mismo motivo por el que `buscar()` de utils/repo.js se salta las
    // líneas de comentario: en este repositorio se explica todo, y lo
    // explicado no es lo que se ejecuta.
    const codigo = cfg.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

    expect(
      codigo,
      fallo({
        que: "la base del build depende de una variable de entorno de CI",
        donde: "vite.config.js → base",
        porque: "El build de CI es el que se publica. Si su base no es la del sitio, el HTML pide los recursos donde no están, el respaldo de la SPA devuelve index.html en su lugar, y la página sale en blanco sin ningún error.",
        arreglo: "Deja `base: '/'` fijo. Si algún día hace falta publicar en un subdirectorio, que sea una configuración aparte y con su propio test.",
      }),
    ).not.toMatch(/GITHUB_ACTIONS|CI\s*\?/);
    expect(codigo).toMatch(/base:\s*['"]\/['"]/);
  });
});

