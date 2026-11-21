import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { conEnlace } from "../../worker/lib/mcpVista/modelo.js";
import { rutaDelZip } from "../../worker/lib/kitEdicion.js";
import { KIT_EDICION } from "../../src/lib/kitEdicionVersion.js";
import { archivosDelKit, huellaDelKit, LIB_DEL_KIT } from "../../scripts/kit-edicion/empaquetar.mjs";
import { armarZip } from "../../scripts/kit-edicion/zip.mjs";

// ============================================================
// El KIT DE EDICIÓN de videos grabados: que lo que se empaqueta es lo que dice su versión, que el ZIP se abre con un
// programa que no es el nuestro, que la lógica que lleva copiada no importa nada que se quede fuera, que kit.mjs
// arranca, que el Python compila, y que `kit_edicion` y su ruta sólo lo entregan con un enlace firmado.
// (Los modelos NO corren en CI: el kit se probó con los clips de Rofer a mano; docs/trampas/video-y-sonido.md.)
// ============================================================

const RAIZ = join(import.meta.dirname, "..", "..");
const ORIGEN = "https://calendarios.test";
const ANA = "u-ana";

function listarConUnzip(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "kit-"));
  const f = join(dir, "k.zip");
  writeFileSync(f, bytes);
  execFileSync("unzip", ["-tq", f]); // comprueba los CRC
  const filas = execFileSync("unzip", ["-Zl", f]).toString().trim().split("\n").filter((l) => /^[-d]r/.test(l));
  rmSync(dir, { recursive: true, force: true });
  return Object.fromEntries(filas.map((l) => [l.split(/\s+/).pop(), l.split(/\s+/)[0]]));
}

describe("lo que se empaqueta", () => {
  it("la huella de src/lib/kitEdicionVersion.js es la del kit (si no: sube la versión y npm run kit:huella)", () => {
    expect(huellaDelKit(), `el kit cambió: sube «version» en src/lib/kitEdicionVersion.js, deja la huella en "" y corre npm run kit:huella`).toBe(KIT_EDICION.huella);
  });

  it("el ZIP se abre con unzip, lleva el kit y su lógica, y el instalador es ejecutable", () => {
    const archivos = archivosDelKit();
    const zip = armarZip(archivos);
    const lista = listarConUnzip(zip);
    for (const r of ["kit.mjs", "instalar.sh", "requisitos.txt", "LEEME.md", "python/transcribir.py", "python/mezcla.py", "python/persona.py", "python/cuadros.py",
      "lib/corteEdicion.js", "lib/camaraEdicion.js", "lib/escenaEdicion.js", "lib/catalogoEfectos.datos.js",
      "remotion/package.json", "remotion/package-lock.json", "remotion/render.mjs", "remotion/src/Video.jsx", "remotion/src/Piezas.jsx"]) {
      expect(Object.keys(lista)).toContain(r);
    }
    expect(lista["instalar.sh"]).toMatch(/^-rwx/);
    expect(lista["LEEME.md"]).toMatch(/^-rw-/);
    // Ni modelos, ni marcas de instalación, ni lo que deja Python, ni las dependencias de Remotion.
    expect(Object.keys(lista).some((r) => /modelos\/|\.instalado|__pycache__|\.pyc$|node_modules/.test(r))).toBe(false);
    // Determinista: el mismo contenido da los mismos bytes.
    expect(Buffer.compare(zip, armarZip(archivosDelKit()))).toBe(0);
  });

  it("la lógica copiada al kit sólo importa archivos que también van en el kit", () => {
    const fuera = [];
    for (const n of LIB_DEL_KIT) {
      const t = readFileSync(join(RAIZ, "src", "lib", n), "utf8");
      for (const m of t.matchAll(/^\s*import[^;]*?from\s+["']([^"']+)["']/gm)) {
        const destino = m[1].replace(/^\.\//, "");
        if (!LIB_DEL_KIT.includes(destino)) fuera.push(`${n} → ${m[1]}`);
      }
    }
    expect(fuera, "un import que no va en el zip rompe el kit en el chat: añádelo a LIB_DEL_KIT o quítalo").toEqual([]);
  });

  it("kit.mjs arranca y, sin proyecto, dice por dónde empezar", () => {
    const dir = mkdtempSync(join(tmpdir(), "proyecto-"));
    try {
      const v = spawnSync("node", [join(RAIZ, "kit-edicion", "kit.mjs"), "version"], { encoding: "utf8" });
      expect(v.stdout.trim()).toBe(KIT_EDICION.version);
      const e = spawnSync("node", [join(RAIZ, "kit-edicion", "kit.mjs"), "estado"], { cwd: dir, encoding: "utf8" });
      expect(e.stdout).toMatch(/falta {2}preparar \(no hay plan\.json\)/);
      const a = spawnSync("node", [join(RAIZ, "kit-edicion", "kit.mjs")], { cwd: dir, encoding: "utf8" });
      expect(a.stdout).toMatch(/siguiente {20}el próximo paso que falta/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("las dependencias de Remotion van fijadas (versión exacta y package-lock), y es la de Rofer v2", () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, "kit-edicion", "remotion", "package.json"), "utf8"));
    for (const [n, v] of Object.entries(pkg.dependencies)) expect(v, n).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies.remotion).toBe("4.0.541");
    const lock = JSON.parse(readFileSync(join(RAIZ, "kit-edicion", "remotion", "package-lock.json"), "utf8"));
    expect(lock.packages[""].dependencies.remotion).toBe("4.0.541");
  });

  it("el Python del kit compila", () => {
    const py = spawnSync("python3", ["--version"]);
    if (py.status !== 0) return; // sin python3 no hay nada que compilar aquí (en CI sí lo hay)
    const dir = join(RAIZ, "kit-edicion", "python");
    const archivos = readdirSync(dir).filter((n) => n.endsWith(".py")).map((n) => join(dir, n));
    const r = spawnSync("python3", ["-c", "import ast,sys\nfor f in sys.argv[1:]: ast.parse(open(f).read(), f)", ...archivos], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});

describe("kit_edicion y su enlace", () => {
  let env;
  const zip = armarZip(archivosDelKit());
  const objetos = new Map();
  beforeEach(() => {
    objetos.clear();
    env = {
      DB: d1EnMemoria(),
      MEDIA: {
        async get(k) { const b = objetos.get(k); return b ? { body: new Response(b).body, text: async () => new TextDecoder().decode(b) } : null; },
        async put(k, v) { objetos.set(k, v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer())); },
        async head(k) { return objetos.has(k) ? { size: objetos.get(k).length } : null; },
      },
      // Los archivos estáticos: sólo el ZIP del kit en su sitio.
      ASSETS: { fetch: async (req) => (new URL(req.url).pathname === rutaDelZip() ? new Response(zip) : new Response("no", { status: 404 })) },
    };
  });
  const mcp = (origen = ORIGEN) => crearHerramientasMCP({ env, acceso: crearAcceso(env.DB, ANA), usuario: { id: ANA, ownerId: ANA, nombre: "Ana" }, origen });
  const texto = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

  it("está en el MCP, sólo lee y no pide nada", () => {
    const d = HERRAMIENTAS_MCP.find((x) => x.name === "kit_edicion");
    expect(d.annotations.readOnlyHint).toBe(true);
    expect(d.inputSchema.required).toBeUndefined();
  });

  it("da la versión, el enlace y el comando; el enlace entrega el ZIP del despliegue", async () => {
    const t = texto(conEnlace(await mcp().llamar("kit_edicion", {}), ORIGEN));
    expect(t).toContain(`Kit de edición v${KIT_EDICION.version} (huella ${KIT_EDICION.huella})`);
    expect(t).toContain(`KIT_DOMINIO=${ORIGEN} bash instalar.sh`);
    const url = /(https:\/\/calendarios\.test\/api\/exportar\/kit-edicion\/\S+?\.zip)/.exec(t)?.[1];
    expect(url).toMatch(new RegExp(`kit-edicion-${KIT_EDICION.version.replace(/\./g, "\\.")}\\.zip$`));
    expect(t).toContain(`curl -fsSL "${url}" -o kit.zip`);
    const res = await worker.fetch(new Request(url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), zip)).toBe(0);
  });

  it("sin firma, con otra firma o con un testigo de otro uso, no sale; y el archivo estático no se sirve suelto", async () => {
    const t = texto(conEnlace(await mcp().llamar("kit_edicion", {}), ORIGEN));
    const url = /(https:\/\/calendarios\.test\/api\/exportar\/kit-edicion\/\S+?\.zip)/.exec(t)[1];
    const roto = url.replace(/kit-edicion\/([^.]+)\.([^/]+)\//, "kit-edicion/$1.AAAA/");
    expect((await worker.fetch(new Request(roto), env, {})).status).toBe(404);
    // El mismo testigo por la ruta del kit de MARCA tampoco abre nada.
    expect((await worker.fetch(new Request(url.replace("/kit-edicion/", "/kit/")), env, {})).status).toBe(404);
    // /api/_kit/… pide sesión como el resto de /api.
    expect((await worker.fetch(new Request(`${ORIGEN}${rutaDelZip()}`), env, {})).status).toBe(401);
  });

  it("si el build no empaquetó el kit, lo dice", async () => {
    env.ASSETS = { fetch: async () => new Response("no", { status: 404 }) };
    const t = texto(conEnlace(await mcp().llamar("kit_edicion", {}), ORIGEN));
    const url = /(https:\/\/calendarios\.test\/api\/exportar\/kit-edicion\/\S+?\.zip)/.exec(t)[1];
    const res = await worker.fetch(new Request(url), env, {});
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/no está en este despliegue/);
  });
});
