import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { levantarEspacio, ANA } from "./espacio.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import { slugDeMes } from "../../src/lib/rutas.js";

// ============================================================
// La prueba de humo EN UN NAVEGADOR: la aplicación de verdad, abierta en Chromium
//
// POR QUÉ ESTO EXISTE
//
// Ningún test abría la aplicación: todos leen ficheros o llaman a la API. Y las roturas que más dolieron fueron de las
// que sólo se ven abriendo la pantalla —la página EN BLANCO por el `base` de Vite, «FORMAT_ICONS is not defined» en el
// panel de una publicación, «useCallback is not defined»—, con el lint, los tests y el build en verde. CLAUDE.md lo
// repite: «lo cazó Chromium, no los tests».
//
// Así que esto levanta el Worker con el dist/ recién construido (`wrangler dev`, como el resto de tests/vivo), entra
// por la pantalla de acceso, abre un cliente, abre una publicación del mes (el panel, lo que más se rompe al partir
// archivos) y abre /aprobar con el testigo del mes sin sesión. En cada pantalla exige que se pinte algo y que la consola
// no tenga errores.
//
// QUIÉN LO CORRE: `npm run test:vivo` (dentro de `verificar`), en CI y al desplegar. Necesita Playwright y su Chromium,
// que no son dependencias del proyecto: en CI los instala el paso «Chromium para la prueba de humo» (ci.yml y
// desplegar.yml). En local usa los que haya (`require("playwright")`); si no hay, la prueba LO DICE y se salta. En CI
// (`CI=true`) no se salta nunca: falla.
// ============================================================

const require = createRequire(import.meta.url);
const EN_CI = Boolean(process.env.CI);
const DIST = fileURLToPath(new URL("../../dist/index.html", import.meta.url));

/** ¿Se puede correr? → { playwright } o { motivo } (por qué no). */
function navegadorDisponible() {
  if (!existsSync(DIST)) return { motivo: "no hay dist/: construye antes con `npm run build` (o corre `npm run verificar`)" };
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    return { motivo: "no está Playwright (en CI lo instala el paso «Chromium para la prueba de humo»)" };
  }
  try {
    if (!existsSync(playwright.chromium.executablePath())) return { motivo: `no está su Chromium (${playwright.chromium.executablePath()})` };
  } catch (e) {
    return { motivo: `no se encuentra su Chromium: ${e.message}` };
  }
  return { playwright };
}

const disponible = navegadorDisponible();
if (!disponible.playwright) {
  if (EN_CI) throw new Error(`La prueba de humo en el navegador TIENE que correr en CI y no puede: ${disponible.motivo}.`);
  console.warn(`\n  ⚠ Prueba de humo en el navegador SALTADA: ${disponible.motivo}.\n`);
}

const CLIENTE = { id: "c0ffee00-0000-4000-8000-0000000000aa", nombre: "Cliente Humo", slug: "cliente-humo" };
const CALENDARIO = "c0ffee00-0000-4000-8000-0000000000bb";
const TESTIGO = "testigo-de-humo-0123456789";
const IDEA = "Sofa nuevo para la sala";
/** Lo que ve el cliente final: el texto (la idea es interna y no viaja al enlace). */
const TEXTO = "El sofa que tu sala necesita";

/**
 * Lo que la consola dice mal. Sólo se perdona lo esperado: el 401 de /api/yo ANTES de entrar (el arranque pregunta si
 * hay sesión, y sin ella contesta 401, que Chromium apunta como «Failed to load resource»).
 */
function vigilar(pagina) {
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(`excepción: ${e.message}`));
  pagina.on("console", (m) => {
    if (m.type() !== "error") return;
    const texto = m.text();
    if (/Failed to load resource: the server responded with a status of 401/.test(texto)) return;
    errores.push(`consola: ${texto}${m.location()?.url ? ` (${m.location().url})` : ""}`);
  });
  return errores;
}

/** La pantalla no está en blanco: #root tiene contenido y se ve texto. */
async function noEnBlanco(pagina) {
  const texto = await pagina.evaluate(() => document.getElementById("root")?.innerText?.trim() ?? "");
  expect(texto.length, "la pantalla está EN BLANCO (el #root no pinta nada)").toBeGreaterThan(20);
}

describe.skipIf(!disponible.playwright)("la aplicación abierta en Chromium", () => {
  let espacio;
  let navegador;

  beforeAll(async () => {
    espacio = await levantarEspacio();
    // Un cliente con una publicación HOY y su mes compartido con el cliente final.
    const hoy = fechaEnZona();
    const [ano, mes] = hoy.split("-").map(Number);
    const dias = JSON.stringify([{ date: hoy, posts: [{ id: "p-humo-1", format: "post", status: "pending", title: "Publicacion de humo", idea: IDEA, descripcion: TEXTO, publishTime: "09:00" }] }]);
    await espacio.d1(`delete from clients where id = '${CLIENTE.id}';`);
    await espacio.d1(`insert into clients (id, owner_id, name, industry) values ('${CLIENTE.id}', '${ANA.id}', '${CLIENTE.nombre}', 'Muebles');`);
    await espacio.d1(
      `insert into calendars (id, client_id, owner_id, month, year, days, share_token, share_enabled)
       values ('${CALENDARIO}', '${CLIENTE.id}', '${ANA.id}', ${mes - 1}, ${ano}, '${dias}', '${TESTIGO}', 1);`,
    );
    espacio.mesSlug = slugDeMes(ano, mes - 1);
    navegador = await disponible.playwright.chromium.launch();
  });

  afterAll(async () => {
    await navegador?.close().catch(() => {});
    await espacio?.cerrar();
  });

  it("entra, abre el cliente y el panel de una publicación sin errores", async () => {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina);
    try {
      // 1. La pantalla de acceso, y entrar por ella (la sesión la pinta quien la abre: Login → setSession).
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation", { name: "Secciones" }).first().waitFor({ timeout: 20_000 });
      await noEnBlanco(pagina);

      // 2. El cliente, en su mes: el calendario pinta la publicación.
      await pagina.goto(`${espacio.base}/cliente/${CLIENTE.slug}/${espacio.mesSlug}`);
      await pagina.getByRole("heading", { name: CLIENTE.nombre }).waitFor({ timeout: 20_000 });
      const chip = pagina.locator("button.cal-post").first();
      await chip.waitFor({ timeout: 20_000 });
      await noEnBlanco(pagina);
      // Un cliente recién creado tiene «Primeros pasos» arriba (componente en diferido, con su lectura ligera).
      await pagina.getByRole("button", { name: /Primeros pasos/ }).waitFor({ timeout: 20_000 });

      // 3. El panel de una publicación (lo que más se ha roto al partir archivos), con sus pestañas.
      await chip.click();
      const panel = pagina.getByRole("dialog").filter({ has: pagina.getByRole("tablist", { name: "Secciones de la publicación" }) });
      await panel.waitFor({ timeout: 20_000 });
      for (const nombre of ["Idea", "Pieza", "Publicar"]) await panel.getByRole("tab", { name: nombre }).waitFor();
      await panel.getByRole("tab", { name: "Pieza" }).click();
      await pagina.waitForTimeout(500);

      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);

  it("Crear → «A mano» (el compositor) y la galería abren sin errores, también en el teléfono", async () => {
    // Aquí se juntaron el compositor en su chunk y la galería en el suyo (EstudioCompositor, EstudioGaleria): una
    // importación que falte sólo revienta al pintarlos.
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina);
    try {
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });

      await pagina.goto(`${espacio.base}/cliente/${CLIENTE.slug}/crear/a-mano`);
      await pagina.getByRole("heading", { name: "Crear a mano" }).waitFor({ timeout: 30_000 });
      await pagina.getByRole("heading", { name: "Galería" }).waitFor({ timeout: 30_000 });
      await noEnBlanco(pagina);
      await pagina.waitForTimeout(500);
      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);

  it("/aprobar abre el mes del cliente final sin sesión", async () => {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina);
    try {
      await pagina.goto(`${espacio.base}/aprobar?t=${TESTIGO}`);
      await pagina.getByText(CLIENTE.nombre).first().waitFor({ timeout: 20_000 });
      // Primero pide su nombre (así la agencia sabe quién aprobó), y luego enseña el mes.
      await pagina.getByLabel(/Tu nombre/i).fill("Cliente de prueba");
      await pagina.getByRole("button", { name: /Empezar a revisar/ }).click();
      await pagina.getByText(TEXTO).first().waitFor({ timeout: 20_000 });
      await noEnBlanco(pagina);
      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);
});
