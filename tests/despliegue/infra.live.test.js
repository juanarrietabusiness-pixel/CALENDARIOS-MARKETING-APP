import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { ruta } from "../utils/repo";
import { fallo, fallos } from "../utils/fallo";

// ============================================================
// Lo que hay desplegado de verdad
//
// Todo lo demás en esta carpeta lee el repositorio. Esto lee el
// proyecto: qué funciones corren, qué avisos tiene la base de datos, qué
// tablas están sin RLS. Es la única forma de ver la DERIVA —lo que se
// desplegó a mano y no está en ningún commit, o lo que está en el
// commit y nunca se desplegó—.
//
// Necesita un token de acceso, así que no corre en los pull requests de
// nadie que no lo tenga. Se activa con:
//
//   SUPABASE_ACCESS_TOKEN=...  SUPABASE_PROJECT_REF=...  npm run test:infra
//
// Sin esas variables los casos se saltan en vez de fallar. Un test que
// no puede comprobar algo no debe decir que está bien, pero tampoco
// bloquear a quien no tiene las llaves.
// ============================================================

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const hayAcceso = Boolean(TOKEN && REF);

const API = "https://api.supabase.com/v1";

async function api(camino) {
  const res = await fetch(`${API}/projects/${REF}${camino}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`La API de Supabase respondió ${res.status} en ${camino}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

/**
 * Devuelve la lista de avisos, exigiendo que venga.
 *
 * Sin esta comprobación, `const { lints = [] } = ...` convertiría
 * cualquier cambio de forma en la respuesta —o una respuesta vacía— en
 * un test verde: se estaría afirmando «no hay avisos» sobre algo que
 * nunca se llegó a leer. Un test de infraestructura que pasa por no
 * haber mirado es peor que no tenerlo.
 */
async function avisos(tipo) {
  const datos = await api(`/advisors?lint_type=${tipo}`);
  const lints = datos?.lints ?? datos?.result?.lints;
  if (!Array.isArray(lints)) {
    throw new Error(
      `La API de avisos (${tipo}) no devolvió una lista de lints. ` +
      `Recibido: ${JSON.stringify(datos).slice(0, 300)}`,
    );
  }
  return lints;
}

const enRepo = () =>
  readdirSync(ruta("supabase/functions"))
    .filter((n) => statSync(ruta("supabase/functions", n)).isDirectory())
    .sort();

describe.skipIf(!hayAcceso)("las funciones desplegadas y el repositorio coinciden", () => {
  let desplegadas = [];

  beforeAll(async () => {
    const datos = await api("/functions");
    desplegadas = Array.isArray(datos) ? datos : datos?.functions;
    if (!Array.isArray(desplegadas)) {
      throw new Error(
        "La API no devolvió una lista de funciones. " +
        `Recibido: ${JSON.stringify(datos).slice(0, 300)}`,
      );
    }
    // Una lista vacía significaría que no hay NADA desplegado, no que
    // todo esté bien: se dice en alto en vez de dar los casos por buenos.
    expect(desplegadas.length, "el proyecto no tiene ninguna función desplegada").toBeGreaterThan(0);
  });

  it("toda función del repositorio existe en el proyecto y está activa", () => {
    const porSlug = new Map(desplegadas.map((f) => [f.slug, f]));
    const lista = [];
    for (const nombre of enRepo()) {
      const viva = porSlug.get(nombre);
      if (!viva) {
        lista.push(fallo({
          que: `la función «${nombre}» no está desplegada`,
          donde: `supabase/functions/${nombre}/`,
          porque: "Está en el repositorio, así que el código que la llama da por hecho que responde. En producción devuelve 404.",
          arreglo: `supabase functions deploy ${nombre} --project-ref ${REF}`,
        }));
      } else if (viva.status !== "ACTIVE") {
        lista.push(fallo({
          que: `la función «${nombre}» está en estado ${viva.status}`,
          donde: `proyecto ${REF}`,
          porque: "Una función que no está activa no responde, y el error que llega al navegador no dice por qué.",
          arreglo: "Vuelve a desplegarla y revisa los registros de la función en el panel de Supabase.",
        }));
      }
    }
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("no hay funciones desplegadas cuyo código no esté en el repositorio", () => {
    // Éste es el caso que nadie ve: una función subida a mano sigue
    // corriendo, con su clave y su acceso, sin que su código esté en
    // ningún commit. No se puede revisar, ni arreglar, ni saber qué hace.
    const huerfanas = desplegadas.map((f) => f.slug).filter((s) => !enRepo().includes(s));
    const lista = huerfanas.map((s) => fallo({
      que: `la función «${s}» corre en producción sin código en el repositorio`,
      donde: `proyecto ${REF} → funciones`,
      porque: "Está expuesta a internet y consume los secretos del proyecto, pero su código no está en ningún commit: no se puede revisar ni corregir, y nadie sabe qué hace.",
      arreglo: `Recupera su código en supabase/functions/${s}/ y añádela al workflow de despliegue, o bórrala del proyecto si ya no se usa.`,
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("todas exigen JWT", () => {
    const abiertas = desplegadas.filter((f) => f.verify_jwt === false);
    const lista = abiertas.map((f) => fallo({
      que: `la función «${f.slug}» acepta peticiones sin JWT`,
      donde: `proyecto ${REF}`,
      porque: "Queda abierta a internet gastando las claves de IA de la agencia.",
      arreglo: "Despliégala sin --no-verify-jwt.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

describe.skipIf(!hayAcceso)("los avisos del proyecto", () => {
  it("no hay avisos de seguridad de nivel ERROR", async () => {
    const lints = await avisos("security");
    const graves = lints.filter((l) => l.level === "ERROR");
    const lista = graves.map((l) => fallo({
      que: `${l.title} (${l.count})`,
      donde: (l.findings ?? []).map((f) => f.detail).join(" | ").slice(0, 400),
      porque: "Es un aviso de nivel ERROR del propio linter de Supabase: una tabla sin RLS o una vista que ignora las políticas.",
      arreglo: l.remediation ?? "Consulta el panel de avisos del proyecto.",
    }));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("no queda ninguna tabla de public sin RLS", async () => {
    const lints = await avisos("security");
    const sinRls = lints.filter((l) => /rls/i.test(l.name) && /disabled|no policy/i.test(l.name));
    expect(
      sinRls.flatMap((l) => (l.findings ?? []).map((f) => f.detail)),
      fallo({
        que: "hay tablas sin row level security",
        donde: `proyecto ${REF}`,
        porque: "La clave anónima va dentro del bundle: sin RLS, esa tabla se lee entera desde cualquier navegador.",
        arreglo: "alter table public.<tabla> enable row level security; y añade su política por owner_id.",
      }),
    ).toEqual([]);
  });

  it("las políticas no reevalúan auth.uid() por fila", async () => {
    // El mismo aviso que comprueba el test estático de migraciones, pero
    // contra lo que hay aplicado: una migración escrita y no aplicada
    // pasaría allí y fallaría aquí.
    const lints = await avisos("performance");
    const initplan = lints.filter((l) => l.name === "auth_rls_initplan");
    const lista = initplan.flatMap((l) => (l.findings ?? []).map((f) => fallo({
      que: "una política aplicada llama a auth.uid() por fila",
      donde: f.detail.slice(0, 300),
      porque: "La migración que lo corrige puede estar escrita y sin aplicar: el repositorio dice una cosa y la base de datos otra.",
      arreglo: "Aplica las migraciones pendientes con `supabase db push --project-ref " + REF + "`.",
    })));
    expect(lista.join(""), fallos(lista)).toBe("");
  });

  it("no hay claves ajenas sin índice", async () => {
    const lints = await avisos("performance");
    const sinIndice = lints.filter((l) => l.name === "unindexed_foreign_keys");
    const lista = sinIndice.flatMap((l) => (l.findings ?? []).map((f) => fallo({
      que: "una clave ajena aplicada no tiene índice",
      donde: f.detail.slice(0, 300),
      porque: "Cada consulta por esa columna recorre la tabla entera.",
      arreglo: "Aplica la migración que crea el índice.",
    })));
    expect(lista.join(""), fallos(lista)).toBe("");
  });
});

// ------------------------------------------------------------
// El sitio publicado
//
// Comprueba que las cabeceras que declara netlify.toml son las que
// Netlify sirve de verdad. Es la diferencia entre escribir una CSP y
// tenerla puesta. Se activa con SITIO_URL.
// ------------------------------------------------------------
const SITIO = process.env.SITIO_URL;

describe.skipIf(!SITIO)("el sitio publicado sirve lo que dice netlify.toml", () => {
  let cabeceras;
  let estado;

  beforeAll(async () => {
    const res = await fetch(SITIO, { redirect: "follow" });
    estado = res.status;
    cabeceras = res.headers;
  });

  it("responde", () => {
    expect(estado, `${SITIO} respondió ${estado}`).toBeLessThan(400);
  });

  it("manda la política de seguridad de contenido", () => {
    const csp = cabeceras.get("content-security-policy") ?? "";
    expect(
      csp,
      fallo({
        que: "el sitio no manda Content-Security-Policy",
        donde: SITIO,
        porque: "Está escrita en netlify.toml, así que se da por puesta. Si no llega, o el archivo no se está aplicando o el despliegue no es el que se cree.",
        arreglo: "Comprueba que netlify.toml está en la raíz del repositorio publicado y que el despliegue es reciente.",
      }),
    ).toContain("default-src");
    expect(csp, "script-src permite inline en producción").not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("manda las demás cabeceras de seguridad", () => {
    const faltan = ["x-frame-options", "x-content-type-options", "strict-transport-security", "referrer-policy"]
      .filter((h) => !cabeceras.get(h));
    expect(faltan, `faltan cabeceras en producción: ${faltan.join(", ")}`).toEqual([]);
  });

  it("no revela el servidor que hay detrás", () => {
    for (const h of ["x-powered-by", "server"]) {
      const v = cabeceras.get(h);
      if (v) expect(v.toLowerCase(), `la cabecera ${h} revela «${v}»`).not.toMatch(/express|node|vite/);
    }
  });
});
