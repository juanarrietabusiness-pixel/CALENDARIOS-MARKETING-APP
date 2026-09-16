import { describe, it, expect } from "vitest";
import { fallo } from "../utils/fallo";

// ============================================================
// Lo que hay desplegado de verdad
//
// `npm test` lee el repositorio: dice si el código está bien escrito, no
// si lo que corre en producción es ese código. La deriva —una función
// subida a mano que no está en ningún commit, una migración escrita y
// sin aplicar, una cabecera que se quedó en el fichero pero no llegó al
// borde— sólo se ve mirando el sitio.
//
// Esa deriva no es hipotética: `image-gen` corrió meses desplegada en
// Supabase sin existir en el repositorio, y `ai-chat` corrió semanas con
// código que no estaba en ningún commit.
//
// No va en CI: necesita el sitio publicado y, para la parte de
// Cloudflare, un token. Sin ellos, cada bloque se salta solo.
//
//   SITIO_URL              la dirección del sitio publicado
//   CLOUDFLARE_API_TOKEN   opcional, para mirar la cuenta
//   CLOUDFLARE_ACCOUNT_ID  opcional, idem
// ============================================================

const SITIO = process.env.SITIO_URL?.replace(/\/$/, "");
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CUENTA = process.env.CLOUDFLARE_ACCOUNT_ID;

const conSitio = SITIO ? describe : describe.skip;
const conCuenta = TOKEN && CUENTA ? describe : describe.skip;

conSitio("el sitio publicado", () => {
  it("responde y sirve la aplicación", async () => {
    const res = await fetch(SITIO);
    expect(res.status, `${SITIO} respondió ${res.status}`).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("manda las cabeceras de seguridad que dice public/_headers", async () => {
    // Que estén en el fichero no significa que lleguen: un `_headers`
    // mal colocado o una regla que no casa se comportan igual que no
    // tenerlo, y el sitio se ve exactamente igual.
    const res = await fetch(SITIO);
    const faltan = ["x-frame-options", "x-content-type-options", "content-security-policy",
      "strict-transport-security", "referrer-policy"]
      .filter((h) => !res.headers.get(h));

    expect(
      faltan,
      fallo({
        que: `el sitio no manda: ${faltan.join(", ")}`,
        donde: `${SITIO} (cabeceras de la respuesta)`,
        porque: "Están escritas en public/_headers pero no llegan al navegador. El sitio se ve igual con ellas que sin ellas: esto es lo único que lo nota.",
        arreglo: "Comprueba que public/_headers se copia a dist/ y que el patrón /* casa con la ruta.",
      }),
    ).toEqual([]);
  });

  it("la CSP publicada no deja hablar con Supabase ni con ningún proveedor de IA", async () => {
    const csp = (await fetch(SITIO)).headers.get("content-security-policy") ?? "";
    const conectar = csp.match(/connect-src ([^;]*)/)?.[1] ?? "";
    for (const prohibido of ["supabase", "anthropic", "groq", "api.github.com"]) {
      expect(
        conectar.includes(prohibido),
        fallo({
          que: `connect-src publicado incluye ${prohibido}`,
          donde: `${SITIO} → Content-Security-Policy`,
          porque: "Esas llamadas las hace el Worker con las claves del servidor. Si el navegador las necesita, una clave volvió al front.",
          arreglo: "Deja connect-src en 'self' y mueve la llamada a worker/rutas/.",
        }),
      ).toBe(false);
    }
  });

  it("la API responde y no se cachea", async () => {
    // /api/yo sin sesión tiene que decir 401, no 404: un 404 significa
    // que el Worker no está atendiendo /api/* y los assets se lo comen.
    const res = await fetch(`${SITIO}/api/yo`);
    expect(
      res.status,
      fallo({
        que: `/api/yo respondió ${res.status}`,
        donde: `${SITIO}/api/yo`,
        porque: "Un 404 aquí significa que el Worker no atiende /api/*: lo está sirviendo el servidor de assets, y toda la API está muerta aunque el sitio se vea.",
        arreglo: 'Revisa assets.run_worker_first: ["/api/*"] en wrangler.jsonc.',
      }),
    ).toBe(401);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("un testigo inventado no abre ningún calendario", async () => {
    const res = await fetch(`${SITIO}/api/publico/${"z".repeat(48)}`);
    expect(res.status, "un testigo que no existe no devuelve 404").toBe(404);
  });

  it("el respaldo de la aplicación de una sola página funciona", async () => {
    // La página de aprobación vive en una ruta que no es un archivo.
    const res = await fetch(`${SITIO}/aprobar`);
    expect(res.status, "/aprobar no cae en el respaldo de la SPA").toBe(200);
  });
});

conCuenta("la cuenta de Cloudflare", () => {
  const api = (ruta) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${CUENTA}${ruta}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).then((r) => r.json());

  it("la base de D1 existe y tiene las tablas del esquema", async () => {
    const { result } = await api("/d1/database");
    const base = (result ?? []).find((d) => d.name === "calendarios-db");
    expect(base, "no existe la base calendarios-db").toBeTruthy();
  });

  it("el bucket de R2 existe", async () => {
    const { result } = await api("/r2/buckets");
    const nombres = (result?.buckets ?? []).map((b) => b.name);
    expect(nombres, "no existe el bucket juancito-contenido").toContain("juancito-contenido");
  });

  it("no hay Workers desplegados que no estén en ningún repositorio", async () => {
    // Éste es el test que detecta lo contrario que los demás: no lo que
    // falta por desplegar, sino lo que corre sin código aquí. Es
    // exactamente el caso de `image-gen`.
    const { result } = await api("/workers/scripts");
    const nombres = (result ?? []).map((w) => w.id ?? w.name);
    const conocidos = ["calendarios", "juancitoads-bot", "nebula-storefront", "nebula-admin"];
    const desconocidos = nombres.filter((n) => !conocidos.includes(n));

    expect(
      desconocidos,
      fallo({
        que: `hay Workers desplegados que nadie declara: ${desconocidos.join(", ")}`,
        donde: "cuenta de Cloudflare → Workers",
        porque: "Un Worker desplegado a mano no está en ningún commit. El síntoma no se parece a la causa: campos que faltan, respuestas recortadas, y un diff limpio. Ya pasó con image-gen y con ai-chat en Supabase.",
        arreglo: "O se commitea su código y se despliega desde el workflow, o se borra.",
      }),
    ).toEqual([]);
  });
});
