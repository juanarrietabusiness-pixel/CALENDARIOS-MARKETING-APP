import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { MENSAJE_IDENTIDAD } from "../../worker/lib/biblioteca.js";
import { MAX_PAGINAS } from "../../src/lib/biblioteca.js";

// ============================================================
// /api/biblioteca, contra una D1 de verdad y un Meta de mentira
//
// El `fetch` de mentira contesta como la documentación de `/ads_archive`
// (data + paging.cursors.after + paging.next con el token dentro). NADA de
// esto se ha probado contra Meta: lo primero con una cuenta verificada es
// una búsqueda de política en PA y otra comercial en ES.
//
// Por orden de gravedad:
//   1. Los filtros guardados no se ven ni se tocan desde otro espacio, ni
//      desde un colaborador que no lleva ese cliente.
//   2. El token no sale nunca al navegador (ni en `paging.next` ni en la
//      instantánea del anuncio).
//   3. Una búsqueda es UNA llamada a Meta, con topes.
//   4. El error de identidad se traduce a qué hacer.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab", [LECTOR]: "t-lector" };
const TOKEN = "EAAG-token-de-la-persona";

let db;
let env;
let llamadas;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"], [LECTOR, "lector@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c1"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado) values (?,?,?,?)")
    .run(JEFE, JEFE, "Juan en Facebook", await cifrarMeta(env, TOKEN));
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const buscar = (quien, consulta, extra = "") => pedir(quien, `/api/biblioteca/buscar?c=${encodeURIComponent(JSON.stringify(consulta))}${extra}`);
const guardar = (quien, cuerpo) => pedir(quien, "/api/biblioteca/filtros", { method: "POST", body: cuerpo });
const FILTRO = { nombre: "Competencia de Dcasa", clientId: "c1", consulta: { texto: "muebles", paises: ["PA"] } };

/** Meta de mentira: contesta a /ads_archive como la documentación. */
function metaFalso(respuesta) {
  return vi.fn(async (url) => {
    const u = new URL(String(url));
    llamadas.push(u);
    const r = typeof respuesta === "function" ? respuesta(u) : respuesta;
    return new Response(JSON.stringify(r.cuerpo), { status: r.estado ?? 200, headers: { "content-type": "application/json" } });
  });
}

const PAGINA_1 = {
  cuerpo: {
    data: [{
      id: "1234567890123", page_id: "111222333", page_name: "Ministerio de Salud",
      ad_creative_bodies: ["Vacúnate, Panamá."], ad_creative_link_titles: ["Jornada"], ad_delivery_start_time: "2026-09-01",
      publisher_platforms: ["facebook", "instagram"], languages: ["es"],
      ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=1234567890123&access_token=${TOKEN}`,
    }],
    paging: { cursors: { after: "QVFIUmFi" }, next: `https://graph.facebook.com/v23.0/ads_archive?after=QVFIUmFi&access_token=${TOKEN}` },
  },
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: {}, ASSETS: { fetch: async () => new Response("") }, META_APP_ID: "app", META_APP_SECRET: "secreto-de-la-app-de-meta" };
  llamadas = [];
  await sembrar();
});
afterEach(() => vi.unstubAllGlobals());

describe("los filtros guardados son del espacio", () => {
  it("se guardan, se listan, se renombran y se borran", async () => {
    const res = await guardar(JEFE, FILTRO);
    expect(res.status).toBe(201);
    const f = await res.json();
    expect(f).toMatchObject({ nombre: "Competencia de Dcasa", clientId: "c1" });
    expect(f.consulta).toMatchObject({ texto: "muebles", paises: ["PA"], tipo: "POLITICAL_AND_ISSUE_ADS" });

    const estado = await (await pedir(JEFE, "/api/biblioteca")).json();
    expect(estado.meta).toMatchObject({ configurado: true, conectado: true, nombre: "Juan en Facebook" });
    expect(estado.filtros.map((x) => x.id)).toEqual([f.id]);

    const ren = await pedir(JEFE, `/api/biblioteca/filtros/${f.id}`, { method: "PATCH", body: { nombre: "  Dcasa:   muebles " } });
    expect(ren.status).toBe(200);
    expect((await ren.json()).nombre).toBe("Dcasa: muebles");

    expect((await pedir(JEFE, `/api/biblioteca/filtros/${f.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await (await pedir(JEFE, "/api/biblioteca")).json()).filtros).toEqual([]);
  });

  it("otro espacio no los ve, ni los renombra, ni los borra", async () => {
    const f = await (await guardar(JEFE, FILTRO)).json();
    expect((await (await pedir(OTRA, "/api/biblioteca")).json()).filtros).toEqual([]);
    expect((await pedir(OTRA, `/api/biblioteca/filtros/${f.id}`, { method: "PATCH", body: { nombre: "mío" } })).status).toBe(404);
    expect((await pedir(OTRA, `/api/biblioteca/filtros/${f.id}`, { method: "DELETE" })).status).toBe(404);
    expect(db.sqlite.prepare("select nombre from biblioteca_filtros where id = ?").get(f.id).nombre).toBe("Competencia de Dcasa");
  });

  it("no se asocia a un cliente de otro espacio", async () => {
    expect((await guardar(OTRA, { ...FILTRO, clientId: "c1" })).status).toBe(404);
    const f = await (await guardar(JEFE, { ...FILTRO, clientId: null })).json();
    expect((await pedir(JEFE, `/api/biblioteca/filtros/${f.id}`, { method: "PATCH", body: { clientId: "c9" } })).status).toBe(404);
  });

  it("un colaborador sólo ve los de sus clientes y no guarda sin cliente ni para otro", async () => {
    await guardar(JEFE, FILTRO); // c1: suyo
    await guardar(JEFE, { ...FILTRO, nombre: "Baby Caleb", clientId: "c2" });
    await guardar(JEFE, { ...FILTRO, nombre: "De la agencia", clientId: null });
    const vistos = (await (await pedir(COLAB, "/api/biblioteca")).json()).filtros.map((x) => x.nombre);
    expect(vistos).toEqual(["Competencia de Dcasa"]);

    // Un cliente que no lleva ni existe para él: «no encontrado», como en el resto de rutas.
    expect((await guardar(COLAB, { ...FILTRO, clientId: "c2" })).status).toBe(404);
    expect((await guardar(COLAB, { ...FILTRO, clientId: null })).status).toBe(403);
    expect((await guardar(COLAB, FILTRO)).status).toBe(201);

    const suyo = (await (await pedir(COLAB, "/api/biblioteca")).json()).filtros[0];
    expect((await pedir(COLAB, `/api/biblioteca/filtros/${suyo.id}`, { method: "PATCH", body: { clientId: "c2" } })).status).toBe(404);
    expect((await pedir(COLAB, `/api/biblioteca/filtros/${suyo.id}`, { method: "PATCH", body: { clientId: null } })).status).toBe(403);
  });

  it("la capa acota por espacio también sin pasar por la ruta", async () => {
    await guardar(JEFE, FILTRO);
    expect(await crearAcceso(db, OTRA).leer("biblioteca_filtros")).toEqual([]);
    expect(await crearAcceso(db, JEFE).leer("biblioteca_filtros")).toHaveLength(1);
    expect(await crearAcceso(db, JEFE, { clientes: ["c2"] }).leer("biblioteca_filtros")).toEqual([]);
  });

  it("no se guarda un filtro con el que no se puede buscar, ni sin nombre", async () => {
    expect((await guardar(JEFE, { nombre: "Vacío", consulta: {} })).status).toBe(400);
    expect((await guardar(JEFE, { ...FILTRO, nombre: "   " })).status).toBe(400);
  });

  it("sólo lectura busca, pero no guarda", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    expect((await buscar(LECTOR, { texto: "vacunación" })).status).toBe(200);
    expect((await guardar(LECTOR, FILTRO)).status).toBe(403);
  });
});

describe("buscar", () => {
  it("es UNA llamada a /ads_archive con el token de quien conectó Meta y la consulta limpia", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    const res = await buscar(JEFE, { texto: "vacunación", exacta: true, paises: ["PA"], limite: 500, plataformas: ["INSTAGRAM"] });
    expect(res.status).toBe(200);
    expect(llamadas).toHaveLength(1);
    const u = llamadas[0];
    expect(u.pathname).toMatch(/\/ads_archive$/);
    expect(u.searchParams.get("access_token")).toBe(TOKEN);
    expect(u.searchParams.get("search_terms")).toBe("vacunación");
    expect(u.searchParams.get("search_type")).toBe("KEYWORD_EXACT_PHRASE");
    expect(u.searchParams.get("ad_reached_countries")).toBe('["PA"]');
    expect(u.searchParams.get("ad_type")).toBe("POLITICAL_AND_ISSUE_ADS");
    expect(u.searchParams.get("publisher_platforms")).toBe('["INSTAGRAM"]');
    expect(u.searchParams.get("limit")).toBe("50");
  });

  it("devuelve tarjetas y el cursor; el token no sale en nada", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    const texto = await (await buscar(JEFE, { texto: "vacunación" })).text();
    expect(texto).not.toContain(TOKEN);
    const r = JSON.parse(texto);
    expect(r.anuncios[0]).toMatchObject({ pagina: "Ministerio de Salud", enlace: "https://www.facebook.com/ads/library/?id=1234567890123" });
    expect(r).toMatchObject({ siguiente: "QVFIUmFi", pagina: 1, cobertura: "politica" });
    expect(r.avisos.join(" ")).toMatch(/sólo devuelve anuncios sobre temas sociales/);
    expect(r.web).toMatch(/^https:\/\/www\.facebook\.com\/ads\/library\/\?.*ad_type=all/);
  });

  it("la página siguiente lleva el cursor; pasado el tope ya no se llama a Meta", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    const r = await (await buscar(JEFE, { texto: "x" }, "&after=QVFIUmFi&pagina=2")).json();
    expect(llamadas[0].searchParams.get("after")).toBe("QVFIUmFi");
    expect(r.pagina).toBe(2);

    const ultima = await (await buscar(JEFE, { texto: "x" }, `&after=QVFIUmFi&pagina=${MAX_PAGINAS}`)).json();
    expect(ultima.siguiente).toBeNull();
    expect(llamadas).toHaveLength(2);

    const pasada = await buscar(JEFE, { texto: "x" }, `&after=QVFIUmFi&pagina=${MAX_PAGINAS + 1}`);
    expect(pasada.status).toBe(400);
    expect(llamadas).toHaveLength(2);
  });

  it("un cursor que no es de Graph no se reenvía", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    expect((await buscar(JEFE, { texto: "x" }, `&after=${encodeURIComponent("https://malo.example/?x=1")}`)).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });

  it("sin palabras ni páginas no se llama a Meta", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    const res = await buscar(JEFE, { paises: ["PA"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/palabras clave/);
    expect(llamadas).toHaveLength(0);
  });

  it("sin Meta conectado lo dice, y sin llamar a nadie", async () => {
    vi.stubGlobal("fetch", metaFalso(PAGINA_1));
    const res = await buscar(OTRA, { texto: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ajustes → Integraciones/);
    expect(llamadas).toHaveLength(0);
  });

  it("identidad sin verificar (#10, 2332002) → «Verifica tu identidad en facebook.com/ID»", async () => {
    vi.stubGlobal("fetch", metaFalso({
      estado: 400,
      cuerpo: { error: {
        message: "(#10) Application does not have permission for this action", type: "OAuthException", code: 10, error_subcode: 2332002,
        error_user_title: "Authorization Required", error_user_msg: "To access the API, you'll need to follow the steps at facebook.com/ads/library/api",
      } },
    }));
    const res = await buscar(JEFE, { texto: "x" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(MENSAJE_IDENTIDAD);
  });

  it("el límite de peticiones de Meta se dice como tal", async () => {
    vi.stubGlobal("fetch", metaFalso({ estado: 400, cuerpo: { error: { message: "(#613) Calls to this api have exceeded the rate limit.", code: 613 } } }));
    expect((await (await buscar(JEFE, { texto: "x" })).json()).error).toMatch(/limitó las búsquedas/);
  });
});
