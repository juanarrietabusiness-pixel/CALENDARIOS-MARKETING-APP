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
function vigilar(pagina, { perdonar = [] } = {}) {
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(`excepción: ${e.message}`));
  pagina.on("console", (m) => {
    if (m.type() !== "error") return;
    const texto = m.text();
    if (/Failed to load resource: the server responded with a status of 401/.test(texto)) return;
    if (perdonar.some((re) => re.test(`${texto} ${m.location()?.url ?? ""}`))) return;
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

  it("«Ver el mes» → Feed y el panel → Publicar: la publicación se ve ENTERA en el teléfono y en una laptop (Juan, 25-nov)", async () => {
    // La imagen iba siempre al ancho del teléfono de la vista previa y se salía de la pantalla por abajo: había que achicar
    // el navegador, y en el celular no se podía. Ahora el teléfono es tan ancho como deje caber la imagen entera.
    const CLI = "c0ffee00-0000-4000-8000-0000000000ee";
    const CAL = "c0ffee00-0000-4000-8000-0000000000ef";
    const hoy = fechaEnZona();
    const [ano, mes] = hoy.split("-").map(Number);
    await espacio.d1(`insert into clients (id, owner_id, name, industry) values ('${CLI}', '${ANA.id}', 'Cliente Feed', 'Muebles');`);
    // Una imagen 4:5 de verdad (1080×1350, un PNG pequeño de un color) subida con la sesión de la página.
    const subir = async (pagina) => pagina.evaluate(async (cli) => {
      const c = document.createElement("canvas");
      c.width = 1080; c.height = 1350;
      c.getContext("2d").fillRect(0, 0, 1080, 1350);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
      const f = new FormData();
      f.append("archivo", new File([blob], "feed.png", { type: "image/png" })); f.append("clientId", cli); f.append("carpeta", "posts");
      return (await (await fetch("/api/media", { method: "POST", body: f })).json()).clave;
    }, CLI);

    const entrar = async (vista) => {
      const contexto = await navegador.newContext({ viewport: vista, locale: "es-PA", ...(vista.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
      const pagina = await contexto.newPage();
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });
      return { contexto, pagina };
    };
    // El teléfono entero (de su cabecera al final de la imagen) dentro de lo que se ve del contenedor que se desplaza.
    const entera = (pagina) => pagina.locator(".vista-red-telefono").first().evaluate((tel) => {
      const medio = tel.querySelector(".vista-red-medio").getBoundingClientRect();
      let cont = tel.parentElement;
      while (cont && !/(auto|scroll)/.test(getComputedStyle(cont).overflowY)) cont = cont.parentElement;
      const caja = cont.getBoundingClientRect();
      return { arriba: tel.getBoundingClientRect().top - caja.top, abajo: caja.bottom - medio.bottom, alto: medio.height };
    });

    const primera = await entrar({ width: 1366, height: 768 });
    const clave = await subir(primera.pagina);
    await primera.contexto.close();
    const posts = [{ id: "pf1", format: "post", status: "approved", title: "Feed 4:5", descripcion: "Texto", publishTime: "09:00", medios: [{ src: `/api/media/${clave}`, tipo: "imagen", ancho: 1080, alto: 1350 }] }];
    await espacio.d1(`insert into calendars (id, client_id, owner_id, month, year, days) values ('${CAL}', '${CLI}', '${ANA.id}', ${mes - 1}, ${ano}, '${JSON.stringify([{ date: hoy, posts }])}');`);

    for (const vista of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
      const { contexto, pagina } = await entrar(vista);
      const errores = vigilar(pagina);
      try {
        await pagina.goto(`${espacio.base}/cliente/cliente-feed/${slugDeMes(ano, mes - 1)}`);
        await pagina.locator("button.cal-post").first().waitFor({ timeout: 20_000 });
        await pagina.getByRole("button", { name: "Ver el mes como se verá" }).click();
        await pagina.getByRole("tab", { name: "Feed" }).click();
        await pagina.locator(".vista-red-medio img").first().waitFor({ timeout: 20_000 });
        await pagina.waitForTimeout(500);
        const feed = await entera(pagina);
        expect(feed.abajo, `Feed a ${vista.width}px: la imagen se sale ${-feed.abajo}px por abajo`).toBeGreaterThanOrEqual(0);
        expect(feed.alto).toBeGreaterThan(200);
        await pagina.getByRole("button", { name: "Cerrar" }).last().click();

        if (vista.width > 1000) {
          await pagina.locator("button.cal-post").first().click();
          const panel = pagina.getByRole("dialog").filter({ has: pagina.getByRole("tablist", { name: "Secciones de la publicación" }) });
          await panel.getByRole("tab", { name: "Publicar" }).click();
          await panel.locator(".vista-red-medio img").first().waitFor({ timeout: 20_000 });
          await pagina.waitForTimeout(500);
          const dentro = await entera(pagina);
          expect(dentro.arriba, "el panel: la vista previa empieza arriba").toBeGreaterThanOrEqual(0);
          expect(dentro.abajo, `el panel a ${vista.width}px: la imagen se sale ${-dentro.abajo}px por abajo`).toBeGreaterThanOrEqual(0);
        }
        expect(errores, errores.join("\n")).toEqual([]);
      } finally {
        await contexto.close();
      }
    }
  }, 180_000);

  it("Galería en el TELÉFONO: «Descargar» baja la imagen (Juan, 24-nov: «desde el celular no puedo descargar»)", async () => {
    // Chromium no tiene hoja de compartir: aquí se ve el respaldo (el archivo ya bajado, con su nombre). La hoja de iOS
    // (Guardar imagen / video) no se puede probar sin un iPhone: lib/descargar.js y su test cubren ese camino.
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA", isMobile: true, hasTouch: true, acceptDownloads: true });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina);
    try {
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });
      expect(await pagina.evaluate(() => matchMedia("(pointer: coarse)").matches), "el teléfono emulado tiene que ser táctil").toBe(true);

      // Una imagen de verdad en R2 (por la API, con la sesión de la página) y su fila en la galería.
      // Desde la página: la cookie de sesión es Secure y el contexto de peticiones de Playwright no la manda por http.
      const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const subida = await pagina.evaluate(async ({ b64, clientId }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const form = new FormData();
        form.append("archivo", new File([bytes], "prueba.png", { type: "image/png" }));
        form.append("clientId", clientId);
        form.append("carpeta", "estudio");
        const r = await fetch("/api/media", { method: "POST", body: form, credentials: "same-origin" });
        return { estado: r.status, cuerpo: await r.json() };
      }, { b64: PNG, clientId: CLIENTE.id });
      expect(subida.estado, JSON.stringify(subida.cuerpo)).toBe(201);
      const { clave } = subida.cuerpo;
      const png = Buffer.from(PNG, "base64");
      await espacio.d1(
        `insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, bytes, prompt, origen, subido)
         values ('arch-descarga-1', '${ANA.id}', '${CLIENTE.id}', '${clave}', 'imagen', 'image/png', 1, 1, ${png.length}, 'Foto para descargar desde el telefono', 'subida', 1);`,
      );

      await pagina.goto(`${espacio.base}/cliente/${CLIENTE.slug}/crear/galeria`);
      await pagina.getByRole("button", { name: /Abrir: .*descargar desde el telefono/i }).click({ timeout: 30_000 });
      const dialogo = pagina.getByRole("dialog");
      const [descarga] = await Promise.all([
        pagina.waitForEvent("download", { timeout: 20_000 }),
        dialogo.getByRole("button", { name: "Descargar" }).click(),
      ]);
      expect(descarga.suggestedFilename()).toMatch(/^foto-para-descargar.*\.png$/);
      expect((await descarga.createReadStream()) !== null).toBe(true);
      // Con hoja de compartir (iOS, Android), es ella la que recibe el ARCHIVO (no un enlace): Guardar imagen / video.
      await pagina.evaluate(() => {
        navigator.canShare = () => true;
        navigator.share = async ({ files }) => { window.__compartido = files.map((f) => `${f.name}|${f.type}|${f.size}`); };
      });
      await dialogo.getByRole("button", { name: "Descargar" }).click();
      await pagina.waitForFunction(() => Array.isArray(window.__compartido), null, { timeout: 10_000 });
      const compartido = await pagina.evaluate(() => window.__compartido);
      expect(compartido).toHaveLength(1);
      expect(compartido[0]).toMatch(new RegExp(`^foto-para-descargar.*\\.png\\|image/png\\|${png.length}$`));
      await pagina.waitForTimeout(500);
      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);

  it("Ajustes → Editor de video: las últimas ediciones y el manual abren sin errores, también en el teléfono", async () => {
    // El editor de video grabado en la pantalla (Fase 5): su sección en diferido, sus actas y el manual en otro chunk.
    await espacio.d1(`insert or replace into edicion_actas (id, owner_id, client_id, tipo, kit_version, manual_version, resumen, correcciones)
      values ('acta-humo', '${ANA.id}', '${CLIENTE.id}', 'persona-a-camara', '0.2.1', 0, '{"duracion":40.1,"lufs":-14}', '[{"cita":"más arriba"}]');`);
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    // Ajustes pregunta por los modelos de IA, y aquí (wrangler dev sin llaves) el servidor contesta 503 a propósito: «no
    // hay ninguna llave de IA de texto». En producción hay llaves. Sólo eso se perdona.
    const errores = vigilar(pagina, { perdonar: [/status of 503.*\/api\/ia\/modelos/] });
    try {
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });

      await pagina.goto(`${espacio.base}/ajustes#editor-video`);
      const seccion = pagina.locator("#editor-video");
      await seccion.getByRole("heading", { name: "Editor de video" }).waitFor({ timeout: 30_000 });
      await seccion.getByText(/Kit de edición v\d/).waitFor({ timeout: 30_000 });
      await seccion.getByText(CLIENTE.nombre).first().waitFor({ timeout: 30_000 });
      await seccion.getByText(/1 corrección de la persona/).waitFor();
      await seccion.getByText(/El manual del editor/).click();
      await seccion.getByText("Lo común a todo video").first().waitFor({ timeout: 30_000 });
      await noEnBlanco(pagina);
      await pagina.waitForTimeout(500);
      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);

  it("Marca → Kit y voz: crear, editar y quitar un estilo de edición, en el teléfono", async () => {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina);
    try {
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });

      await pagina.goto(`${espacio.base}/cliente/${CLIENTE.slug}/marca/kit`);
      const zona = pagina.getByRole("region", { name: "Estilos de edición" });
      await zona.getByRole("button", { name: /Nuevo estilo de edición/ }).click({ timeout: 30_000 });
      const forma = zona.getByRole("form", { name: "Nuevo estilo de edición" });
      await forma.getByLabel("Nombre").fill("Humo en obra");
      await forma.getByLabel(/El texto gigante DETRÁS/).fill("el gancho, en el cielo");
      await forma.getByLabel("Plano abierto (×)").fill("1,13");
      // Las variantes del kit (la parte 3 de «variedad»): cómo se ve cada pieza en todos los videos de la marca.
      await forma.getByLabel("Transición", { exact: true }).selectOption("glitch");
      await forma.getByLabel("Entrada de texto", { exact: true }).selectOption("maquina");
      await forma.getByRole("button", { name: "Guardar el estilo" }).click();
      await zona.getByText("Humo en obra").waitFor({ timeout: 20_000 });
      await zona.getByText(/Cámara: abierto 1.13×/).waitFor();
      await zona.getByText(/Variantes del kit: transicion «glitch», entrada «maquina»/).waitFor();

      await zona.getByRole("button", { name: "Editar" }).click();
      await zona.getByRole("form", { name: /Editar el estilo/ }).getByLabel("El ritmo").fill("alterno en cada corte");
      await zona.getByRole("button", { name: "Guardar el estilo" }).click();
      await zona.getByText(/Ritmo: alterno en cada corte/).waitFor({ timeout: 20_000 });

      await zona.getByRole("button", { name: "Quitar el estilo Humo en obra" }).click();
      await zona.getByRole("button", { name: "Sí, quitarlo" }).click();
      await zona.getByText(/Ninguno todavía/).waitFor({ timeout: 20_000 });
      await noEnBlanco(pagina);
      expect(errores, errores.join("\n")).toEqual([]);
    } finally {
      await contexto.close();
    }
  }, 120_000);

  it("Las propuestas de lo que aprende el editor: aceptar una en Ajustes y rechazar otra en Kit y voz", async () => {
    await espacio.d1(`insert or replace into edicion_actas (id, owner_id, client_id, tipo, kit_version, resumen, correcciones)
      values ('acta-prop', '${ANA.id}', '${CLIENTE.id}', 'persona-a-camara', '0.2.1', '{}', '[]');`);
    await espacio.d1(`insert or replace into edicion_propuestas (id, owner_id, client_id, acta_id, destino, parte, operacion, antes, texto, cita)
      values ('pe-humo-general', '${ANA.id}', null, 'acta-prop', 'manual', 'tipos.persona-a-camara', 'anadir', '', 'Nunca modo celular si el video no lo tiene.', 'eso pasa en todos los videos'),
             ('pe-humo-marca', '${ANA.id}', '${CLIENTE.id}', 'acta-prop', 'estilo', 'notas', 'anadir', '', 'Los textos más arriba.', 'pudieron quedar más arriba');`);
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: "es-PA" });
    const pagina = await contexto.newPage();
    const errores = vigilar(pagina, { perdonar: [/status of 503.*\/api\/ia\/modelos/] });
    try {
      await pagina.goto(`${espacio.base}/`);
      await pagina.getByLabel("Correo").fill(ANA.email);
      await pagina.getByLabel("Contraseña").fill("contrasena-de-prueba-larga");
      await pagina.getByRole("button", { name: /Entrar/ }).click();
      await pagina.getByRole("navigation").first().waitFor({ timeout: 20_000 });

      await pagina.goto(`${espacio.base}/ajustes#editor-video`);
      const manual = pagina.getByRole("group", { name: /propone aprender para el manual/ });
      await manual.getByText("Nunca modo celular si el video no lo tiene.").waitFor({ timeout: 30_000 });
      await manual.getByRole("button", { name: /^Aceptar/ }).click();
      await manual.getByText(/el manual pasa a la versión \d+/).waitFor({ timeout: 20_000 });

      await pagina.goto(`${espacio.base}/cliente/${CLIENTE.slug}/marca/kit`);
      const marca = pagina.getByRole("group", { name: /propone aprender para su estilo/ });
      await marca.getByText("Los textos más arriba.").waitFor({ timeout: 30_000 });
      await marca.getByRole("button", { name: /^Rechazar/ }).click();
      await marca.getByText(/Rechazada: no se volverá a proponer/).waitFor({ timeout: 20_000 });
      await marca.getByText("Los textos más arriba.").waitFor({ state: "detached", timeout: 20_000 });
      await noEnBlanco(pagina);
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
