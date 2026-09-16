import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ, leer, listar, fuentesNavegador, buscar, rel } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// Secretos y límite navegador / servidor
//
// La regla del proyecto es corta: sólo las variables `VITE_*` llegan al
// navegador, y ahí sólo van claves públicas. Todo lo demás —la clave de
// servicio, las de IA, el token de GitHub, la contraseña del
// administrador— vive en el servidor.
//
// Es una regla fácil de romper sin notarlo: basta un `import.meta.env` de
// más, o renombrar una variable con el prefijo puesto. No se rompe nada
// visible; simplemente la clave queda publicada en un archivo estático.
// ============================================================

/**
 * Los patrones se arman por trozos a propósito: escritos enteros, este
 * mismo archivo saldría en el listado de fugas de su propio test.
 */
const FORMATOS_DE_CLAVE = [
  { nombre: "clave de Anthropic", re: new RegExp("sk-" + "ant-" + "[A-Za-z0-9_-]{20,}") },
  { nombre: "clave de Groq", re: new RegExp("\\bgsk" + "_[A-Za-z0-9]{40,}") },
  { nombre: "token de GitHub", re: new RegExp("\\b(ghp" + "_|github" + "_pat" + "_)[A-Za-z0-9_]{30,}") },
  { nombre: "token de Supabase", re: new RegExp("\\bsbp" + "_[a-f0-9]{40,}") },
  { nombre: "clave de OpenAI", re: new RegExp("\\bsk-" + "proj-" + "[A-Za-z0-9_-]{20,}") },
];

/** Archivos versionados que tiene sentido leer como texto. */
function archivosDeTexto() {
  const salida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" });
  return salida.split("\0").filter(Boolean).filter((f) => {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|whl|mp4|webm)$/i.test(f)) return false;
    if (f === "package-lock.json") return false;
    try { return statSync(join(RAIZ, f)).size < 2_000_000; } catch { return false; }
  });
}

describe("no hay claves escritas en el repositorio", () => {
  it("ningún archivo versionado contiene una clave con formato conocido", () => {
    const encontrados = [];
    for (const archivo of archivosDeTexto()) {
      const texto = readFileSync(join(RAIZ, archivo), "utf8");
      for (const { nombre, re } of FORMATOS_DE_CLAVE) {
        if (re.test(texto)) {
          encontrados.push(fallo({
            que: `hay algo con forma de ${nombre}`,
            donde: archivo,
            porque: "Una clave versionada está filtrada aunque se borre después: queda en el historial de git y en cada clon.",
            arreglo: "Revócala en el proveedor, muévela a los secretos del Worker (`wrangler secret put`), y reescribe el historial si hiciera falta.",
          }));
        }
      }
    }
    expect(encontrados.join(""), fallos(encontrados)).toBe("");
  });

  it(".env está ignorado y .env.example no", () => {
    const ignore = leer(".gitignore");
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
  });

  it(".env.example documenta las variables sin rellenar ninguna", () => {
    const conValor = leer(".env.example")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .filter((l) => {
        const [clave, ...resto] = l.split("=");
        const valor = resto.join("=").trim();
        // AI_PROVIDER=anthropic es una elección, no un secreto.
        if (["AI_PROVIDER", "AI_MODEL", "GROQ_MODEL"].includes(clave.trim())) return false;
        return valor.length > 0;
      });

    expect(
      conValor,
      fallo({
        que: ".env.example trae valores rellenados",
        donde: ".env.example",
        porque: "Ese archivo sí se versiona: cualquier valor real que se escriba ahí queda publicado.",
        arreglo: "Deja la clave con el `=` vacío y explica en un comentario de dónde sacar el valor.",
      }),
    ).toEqual([]);
  });
});

describe("el navegador sólo ve lo que puede ver", () => {
  const fuentes = fuentesNavegador();

  it("sólo lee variables con prefijo VITE_", () => {
    const usos = buscar(fuentes, /import\.meta\.env\.(\w+)/);
    const malos = usos.filter((u) => {
      const nombre = u.texto.match(/import\.meta\.env\.(\w+)/)?.[1] ?? "";
      return !nombre.startsWith("VITE_") && !["MODE", "DEV", "PROD", "SSR", "BASE_URL"].includes(nombre);
    });
    expect(
      malos.map((m) => `${m.archivo}:${m.linea}`),
      fallo({
        que: "el código del navegador lee una variable sin prefijo VITE_",
        donde: malos.map((m) => `${m.archivo}:${m.linea}`).join(", "),
        porque: "Vite no la sustituye: en producción llega `undefined` y la rama que dependa de ella se comporta al revés que en local.",
        arreglo: "Si el dato es público, renómbrala con VITE_. Si no lo es, sácala a una función del servidor.",
      }),
    ).toEqual([]);
  });

  it("no lee ningún secreto del servidor", () => {
    // Se busca la LECTURA, no la mención: la interfaz explica al usuario
    // que GITHUB_TOKEN se configura en el servidor, y ese texto de ayuda
    // no es una fuga. Lo que sí lo sería es acceder al valor.
    const prohibidos = [
      "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
      "GROQ_API_KEY", "GITHUB_TOKEN", "ADMIN_PASSWORD", "ADMIN_SEED_TOKEN",
    ].join("|");
    const acceso = new RegExp(
      `(process\\.env|import\\.meta\\.env)\\.(${prohibidos})` +
      `|(process\\.env|import\\.meta\\.env)\\[\\s*["'\`](${prohibidos})` +
      `|Deno\\.env\\.get\\(\\s*["'\`](${prohibidos})`,
    );
    const hits = buscar(fuentes, acceso);
    expect(
      hits.map((h) => `${h.archivo}:${h.linea} → ${h.texto}`),
      fallo({
        que: "el código del navegador lee un secreto del servidor",
        donde: hits.map((h) => `${h.archivo}:${h.linea}`).join(", "),
        porque: "Todo lo que hay en src/ se empaqueta y se sirve como archivo estático: cualquiera lo descarga.",
        arreglo: "Mueve esa llamada a worker/rutas/, donde el secreto sí existe, y llámala desde el navegador por /api/*.",
      }),
    ).toEqual([]);
  });

  it("no llama directamente a ningún proveedor de IA ni a GitHub", () => {
    const hits = buscar(fuentes, /api\.anthropic\.com|api\.groq\.com|api\.github\.com|api\.openai\.com/);
    expect(
      hits.map((h) => `${h.archivo}:${h.linea}`),
      fallo({
        que: "el navegador llama directamente a un proveedor externo",
        donde: hits.map((h) => `${h.archivo}:${h.linea}`).join(", "),
        porque: "Esa llamada necesita una clave, y una clave en el navegador es una clave publicada. Además la CSP la bloquea, así que falla en producción y funciona en local.",
        arreglo: "Llama a la Edge Function correspondiente con supabase.functions.invoke().",
      }),
    ).toEqual([]);
  });

  it("no guarda nada sensible en localStorage", () => {
    // localStorage sólo conserva la marca de migración y los datos
    // antiguos. Cualquier token ahí sobrevive al cierre de sesión.
    const hits = buscar(fuentes, /localStorage\.setItem\(\s*["'`][^"'`]*(token|key|clave|secret|password)/i);
    expect(hits.map((h) => `${h.archivo}:${h.linea}`)).toEqual([]);
  });
});

describe("las funciones del servidor no se exponen de más", () => {
  it("ningún secreto del servidor lleva el prefijo VITE_", () => {
    const fuentes = listar("worker", /\.js$/);
    const hits = buscar(fuentes, /VITE_[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/);
    expect(
      hits.map((h) => `${h.archivo}:${h.linea}`),
      fallo({
        que: "un secreto está nombrado con prefijo VITE_",
        donde: hits.map((h) => `${h.archivo}:${h.linea}`).join(", "),
        porque: "Vite incrusta en el bundle todo lo que empiece por VITE_. El prefijo es lo único que decide si algo se publica.",
        arreglo: "Quita el prefijo VITE_ del nombre de la variable en el proveedor y en el código.",
      }),
    ).toEqual([]);
  });

  it("el alta del administrador ya no es un endpoint", () => {
    // Antes vivía en netlify/functions/admin-seed.mjs, protegida con
    // ADMIN_SEED_TOKEN y comparación en tiempo constante, porque un
    // endpoint que crea administradores y queda abierto por un despiste
    // de configuración entrega el panel entero.
    //
    // Ahora se siembra desde la línea de órdenes. No hay token que
    // proteger porque no hay nada expuesto: es la forma buena de
    // resolver ese riesgo, quitarle la puerta a la calle.
    const worker = listar("worker", /\.js$/).map((f) => leer(rel(f))).join("\n");
    const sospechosas = buscar(listar("worker", /\.js$/), /["'`]\/?(seed|sembrar|admin-seed)["'`]/);

    expect(
      sospechosas.map((h) => `${h.archivo}:${h.linea}`),
      fallo({
        que: "el Worker expone una ruta de alta de administradores",
        donde: sospechosas.map((h) => `${h.archivo}:${h.linea}`).join(", "),
        porque: "Un endpoint que crea administradores no puede quedar abierto por un despiste de configuración: entrega el panel entero.",
        arreglo: "Siembra el usuario con `npm run sembrar`, que corre en local contra wrangler y no está expuesto a la red.",
      }),
    ).toEqual([]);

    // La contraseña sigue teniendo su longitud mínima, sólo que ahora la
    // exigen el script y el Worker, no la función de Netlify.
    expect(
      leer("scripts/sembrar-admin.mjs"),
      "el script de alta no exige longitud mínima de contraseña",
    ).toMatch(/length\s*<\s*12/);
    expect(worker, "sembrarUsuario no exige longitud mínima").toMatch(/length\s*<\s*12/);
  });

  it("las contraseñas no se guardan en claro ni con un hash rápido", () => {
    // SHA-256 a secas se prueba a millones por segundo. PBKDF2 con
    // 210.000 iteraciones es la recomendación vigente de OWASP, y es lo
    // único que crypto.subtle ofrece en Workers —no hay bcrypt—.
    const sesion = leer("worker/lib/sesion.js");
    expect(
      sesion,
      fallo({
        que: "las contraseñas no pasan por PBKDF2",
        donde: "worker/lib/sesion.js",
        porque: "Un hash rápido se prueba a millones por segundo: un volcado de la tabla users equivale a tener las contraseñas.",
        arreglo: "Deriva con PBKDF2-SHA256 y al menos 210.000 iteraciones.",
      }),
    ).toMatch(/PBKDF2/);
    const iteraciones = Number(sesion.match(/ITERACIONES\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, "") ?? 0);
    expect(iteraciones, `sólo se usan ${iteraciones} iteraciones`).toBeGreaterThanOrEqual(210_000);
  });

  it("en sessions se guarda la huella del testigo, no el testigo", () => {
    expect(
      leer("worker/lib/sesion.js"),
      fallo({
        que: "la sesión se guarda en claro",
        donde: "worker/lib/sesion.js",
        porque: "Un volcado de D1 —o una consulta de más— devolvería sesiones utilizables tal cual.",
        arreglo: "Guarda sha256(testigo) en token_hash y manda el testigo sólo en la cookie.",
      }),
    ).toMatch(/token_hash[\s\S]{0,200}sha256\(/);
  });

  it("la cookie de sesión lleva prefijo __Host- y es HttpOnly", () => {
    // `__Host-` PROHÍBE el atributo Domain: la cookie sólo vale para
    // este origen exacto y ningún subdominio la ve. HttpOnly impide que
    // un XSS la lea.
    const sesion = leer("worker/lib/sesion.js");
    expect(sesion, "la cookie no lleva prefijo __Host-").toMatch(/__Host-/);
    for (const atributo of ["Secure", "HttpOnly", "SameSite"]) {
      expect(sesion, `la cookie no lleva ${atributo}`).toContain(atributo);
    }
    expect(
      sesion,
      fallo({
        que: "la cookie de sesión declara Domain",
        donde: "worker/lib/sesion.js",
        porque: "Con prefijo __Host- el navegador RECHAZA la cookie si lleva Domain, así que no se guardaría ninguna sesión. Y sin el prefijo, cualquier subdominio comprometido la vería.",
        arreglo: "No pongas Domain. La cookie vale para este origen y ya.",
      }),
    ).not.toMatch(/Domain=/);
  });

  it("ninguna función devuelve al cliente el error crudo del proveedor", () => {
    // El error de un proveedor puede describir la clave o la cuenta.
    const hits = buscar(listar("worker", /\.js$/), /error\((await\s+)?res\.(text|json)\(\)/);
    expect(hits.map((h) => `${h.archivo}:${h.linea}`)).toEqual([]);
  });
});

describe("higiene del repositorio", () => {
  it("no versiona binarios grandes ajenos al proyecto", () => {
    const salida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" });
    const gordos = salida.split("\0").filter(Boolean)
      .map((f) => { try { return { f, s: statSync(join(RAIZ, f)).size }; } catch { return null; } })
      .filter((x) => x && x.s > 1_000_000 && x.f !== "package-lock.json");

    expect(
      gordos.map((g) => `${g.f} (${(g.s / 1e6).toFixed(1)} MB)`),
      fallo({
        que: "hay binarios de más de 1 MB versionados",
        donde: gordos.map((g) => g.f).join(", "),
        porque: "Cada clon y cada checkout de CI se lo descarga, en cada ejecución, para siempre: git no olvida un blob aunque se borre el archivo.",
        arreglo: "Bórralo del árbol, añádelo a .gitignore y —si pesa de verdad— purga el blob del historial.",
      }),
    ).toEqual([]);
  });

  it("los derivados del logo siguen pesando poco", () => {
    // El original de 1,3 MB vive fuera del repositorio a propósito.
    const imagenes = [...listar("public", /\.png$/), ...listar("src/assets", /\.png$/)];
    const pesadas = imagenes.map((f) => ({ f: rel(f), s: statSync(f).size })).filter((x) => x.s > 300_000);
    expect(
      pesadas.map((p) => `${p.f} (${Math.round(p.s / 1024)} kB)`),
      fallo({
        que: "una imagen de marca pesa más de 300 kB",
        donde: pesadas.map((p) => p.f).join(", "),
        porque: "El favicon y el logo se descargan en la primera visita, antes de que se vea nada.",
        arreglo: "Vuelve a generar el derivado optimizado; el original grande no se versiona.",
      }),
    ).toEqual([]);
  });
});
