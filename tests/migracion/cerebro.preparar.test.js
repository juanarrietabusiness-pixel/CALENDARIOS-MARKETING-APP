import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos, mesActual } from "../../worker/lib/configIA.js";
import { notasParaLaFicha, promptDeLaFicha, leerRespuesta } from "../../worker/lib/cerebro/preparar.js";

// ============================================================
// La ficha técnica y las cifras, escritas por la IA
//
// Anthropic es de mentira y registra lo que se le pide. Lo que importa:
//
//   1. La IA NO ve lo interno, ni la maquetación, ni su ficha anterior.
//   2. Lo que una persona corrigió a mano no se pisa.
//   3. El gasto se apunta, y el presupuesto se respeta.
//   4. Un fallo del proveedor se dice con su motivo y no deja nada a medias.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t, { parada = "end_turn", uso = { input_tokens: 4000 } } = {}) => new Response([
  sse("message_start", { message: { model: "x", usage: uso } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: parada }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const RESPUESTA = "FICHA:\n## Quién es\nDcasa vende muebles y hogar en Panamá [[tono-y-voz]].\n\n## Falta por definir\nGarantía.\nCIFRAS:\n- Envío gratis desde $300 [[precios]]\n";

function anthropic(respuestas) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }, { id: "claude-opus-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      const r = respuestas.shift();
      return typeof r === "function" ? r() : r;
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave) } : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const poner = (nota) => pedir("/api/cerebro/c1/nota", { method: "PUT", body: nota });
const preparar = (body = {}) => pedir("/api/cerebro/c1/preparar", { method: "POST", body });
const notas = () => db.sqlite.prepare("select * from cerebro_notas order by ruta").all().map((n) => ({ ...n }));
const de = (ruta) => notas().find((n) => n.ruta === ruta);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  await poner({ titulo: "Tono y voz", texto: "Cercano, de tú. Nunca versículos.", tipo: "marca" });
  await poner({ titulo: "Precios", texto: "Envío gratis desde 300 dólares.", tipo: "marca" });
  await poner({ titulo: "Costos", texto: "El costo del sofá es de 200 dólares.", tipo: "documento", interna: true });
  await poner({ titulo: "Plantillas", texto: "Plantilla A: fondo azul.", tipo: "maquetacion" });
  await poner({ titulo: "Reporte", texto: "Ideas del agente diario.", tipo: "borrador", interna: true });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("lo que la IA ve", () => {
  it("sólo el canon y lo que se puede publicar: sin internas, sin maquetación, sin borradores", () => {
    const { dentro } = notasParaLaFicha(notas());
    expect(dentro.map((n) => n.ruta).sort()).toEqual(["precios", "tono-y-voz"]);
  });

  it("no se lee a sí misma: la ficha anterior no entra en la nueva", () => {
    const con = [...notas(), { ruta: "ficha-tecnica", titulo: "Ficha técnica", tipo: "ficha", texto: "vieja", interna: 0 }];
    expect(notasParaLaFicha(con).dentro.map((n) => n.ruta)).not.toContain("ficha-tecnica");
  });

  it("lo que no cabe en el presupuesto se nombra, no se manda", () => {
    const grandes = Array.from({ length: 5 }, (_, i) => ({ ruta: `n${i}`, titulo: `Nota ${i}`, tipo: "marca", texto: "x".repeat(4000), interna: 0 }));
    const { dentro, fuera } = notasParaLaFicha(grandes, { presupuesto: 9000 });
    expect(dentro).toHaveLength(2);
    expect(fuera).toEqual(["Nota 2", "Nota 3", "Nota 4"]);
  });

  it("cada nota lleva su ruta entre corchetes, para que la ficha pueda citarla", () => {
    const p = promptDeLaFicha({ name: "Dcasa" }, notasParaLaFicha(notas()));
    expect(p).toContain("--- Tono y voz [tono-y-voz] ---");
    expect(p).toContain("Nunca versículos");
    for (const fuera of ["nueve dólares", "200 dólares", "Plantilla A", "agente diario"]) expect(p).not.toContain(fuera);
    expect(p).toMatch(/nada que las notas marquen como interno/i);
  });

  it("la llamada de verdad no lleva lo interno", async () => {
    anthropic([flujo(RESPUESTA)]);
    expect((await preparar()).status).toBe(200);
    const enviado = JSON.stringify(peticiones[0].messages);
    expect(enviado).toContain("Nunca versículos");
    expect(enviado).not.toContain("200 dólares");
    expect(enviado).not.toContain("Plantilla A");
  });
});

describe("leer lo que devuelve el modelo", () => {
  it("separa la ficha de las cifras, aunque tengan varias líneas", () => {
    const r = leerRespuesta(RESPUESTA);
    expect(r.ficha).toContain("## Quién es");
    expect(r.ficha).toContain("Falta por definir");
    expect(r.cifras).toBe("- Envío gratis desde $300 [[precios]]");
  });

  it("sin ficha no vale; sin cifras sí, y quedan vacías", () => {
    expect(leerRespuesta("CIFRAS:\n- algo")).toBeNull();
    expect(leerRespuesta("hola")).toBeNull();
    expect(leerRespuesta("FICHA:\nSólo la ficha.")).toEqual({ ficha: "Sólo la ficha.", cifras: "" });
  });

  it("no pasa de los topes", () => {
    const r = leerRespuesta(`FICHA:\n${"a".repeat(9000)}\nCIFRAS:\n${"b".repeat(9000)}`);
    expect(r.ficha.length).toBe(6000);
    expect(r.cifras.length).toBe(3000);
  });
});

describe("escribir la ficha", () => {
  it("crea la ficha y las cifras como notas de su tipo, con sus enlaces, y las deja en el índice", async () => {
    anthropic([flujo(RESPUESTA)]);
    const res = await preparar();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ficha: "creada", cifras: "creada", leidas: 2, fuera: [] });
    expect(de("ficha-tecnica")).toMatchObject({ tipo: "ficha", origen: "ia", interna: 0, titulo: "Ficha técnica" });
    expect(de("ficha-tecnica").texto).toContain("[[tono-y-voz]]");
    expect(de("cifras-vigentes")).toMatchObject({ tipo: "cifras", origen: "ia" });

    const c = await (await pedir("/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "lo que sea", para: "texto" } })).json();
    expect(c.ficha).toContain("muebles y hogar");
    expect(c.cifras).toContain("Envío gratis");
  });

  it("nace «sin tocar»: creada y actualizada en el mismo instante", async () => {
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    for (const r of ["ficha-tecnica", "cifras-vigentes"]) expect(de(r).created_at).toBe(de(r).updated_at);
  });

  it("volver a prepararla la reemplaza, con la misma ruta y sin dejar una copia", async () => {
    anthropic([flujo(RESPUESTA), flujo("FICHA:\nOtra ficha.\nCIFRAS:\n- Otra")]);
    await preparar();
    const antes = notas().length;
    expect((await (await preparar()).json())).toMatchObject({ ficha: "reemplazada", cifras: "reemplazada" });
    expect(notas()).toHaveLength(antes);
    expect(de("ficha-tecnica").texto).toBe("Otra ficha.");
  });

  it("lo que una persona corrigió a mano MANDA: no se pisa, salvo que se fuerce", async () => {
    anthropic([flujo(RESPUESTA), flujo("FICHA:\nNueva.\nCIFRAS:\n- Nueva"), flujo("FICHA:\nForzada.\nCIFRAS:\n- Forzada")]);
    await preparar();
    const f = de("ficha-tecnica");
    await poner({ id: f.id, titulo: "Ficha técnica", texto: "Ficha corregida por la agencia.", tipo: "ficha" });

    const res = await (await preparar()).json();
    expect(res.ficha).toBe("conservada");
    expect(res.cifras).toBe("reemplazada");
    expect(de("ficha-tecnica").texto).toBe("Ficha corregida por la agencia.");

    const forzada = await (await preparar({ forzar: true })).json();
    expect(forzada.ficha).toBe("reemplazada");
    expect(de("ficha-tecnica").texto).toBe("Forzada.");
  });

  it("si las dos están corregidas, no llama a la IA ni gasta nada", async () => {
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    for (const r of ["ficha-tecnica", "cifras-vigentes"]) {
      const n = de(r);
      await poner({ id: n.id, titulo: n.titulo, texto: "a mano", tipo: n.tipo });
    }
    anthropic([]);
    const res = await (await preparar()).json();
    expect(res).toMatchObject({ ficha: "conservada", cifras: "conservada" });
    expect(peticiones).toHaveLength(0);
  });
});

describe("lo que no escribió la IA no se toca", () => {
  it("una nota llamada «Ficha técnica» a mano NO se reemplaza: la de la IA toma otra ruta", async () => {
    const mia = await (await poner({ titulo: "Ficha técnica", texto: "La ficha que escribió la agencia a mano.", tipo: "ficha" })).json();
    expect(mia.ruta).toBe("ficha-tecnica");
    anthropic([flujo(RESPUESTA)]);
    const r = await (await preparar()).json();
    expect(r.ficha).toBe("creada");
    expect(de("ficha-tecnica").texto, "la de la persona sigue donde estaba").toBe("La ficha que escribió la agencia a mano.");
    expect(de("ficha-tecnica").origen).toBe("manual");
    expect(de("ficha-tecnica-2")).toMatchObject({ origen: "ia", tipo: "ficha" });
  });

  it("aunque nadie la haya editado después: una nota manual sin tocar tampoco cuenta como de la IA", async () => {
    await poner({ titulo: "Cifras vigentes", texto: "- Envío: gratis.", tipo: "cifras" });
    expect(de("cifras-vigentes").created_at).toBe(de("cifras-vigentes").updated_at);
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    expect(de("cifras-vigentes").texto).toBe("- Envío: gratis.");
    expect(de("cifras-vigentes-2")).toMatchObject({ origen: "ia" });
  });

  it("una sección importada del repositorio que se llama igual tampoco se borra", async () => {
    db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen, fuente, fuente_sha) values (?,?,?,?,?,?,?,?,?,?)")
      .run("n-repo", JEFE, "c1", "ficha-tecnica", "Ficha técnica", "Sección del repositorio.", "documento", "repositorio", "x/ficha.md", "sha1");
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    expect(de("ficha-tecnica")).toMatchObject({ id: "n-repo", origen: "repositorio", texto: "Sección del repositorio." });
    expect(de("ficha-tecnica-2")).toMatchObject({ origen: "ia" });
  });

  it("la siguiente vez reemplaza la SUYA, en su ruta, sin crear una tercera", async () => {
    await poner({ titulo: "Ficha técnica", texto: "A mano.", tipo: "ficha" });
    anthropic([flujo(RESPUESTA), flujo("FICHA:\nOtra ficha.\nCIFRAS:\n- Otra")]);
    await preparar();
    const antes = notas().length;
    const r = await (await preparar()).json();
    expect(r.ficha).toBe("reemplazada");
    expect(notas()).toHaveLength(antes);
    expect(de("ficha-tecnica").texto).toBe("A mano.");
    expect(de("ficha-tecnica-2").texto).toBe("Otra ficha.");
  });

  it("guarda su resumen y su tamaño como cualquier otra nota", async () => {
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    const f = de("ficha-tecnica");
    expect(f.caracteres).toBe(f.texto.length);
    expect(f.resumen).toMatch(/Quién es|Dcasa/);
  });
});

describe("el gasto y los fallos", () => {
  it("apunta el consumo como «cerebro», del cliente", async () => {
    anthropic([flujo(RESPUESTA, { uso: { input_tokens: 12_000 } })]);
    await preparar();
    const fila = db.sqlite.prepare("select * from consumo_ia").get();
    expect(fila).toMatchObject({ funcion: "cerebro", client_id: "c1" });
    expect(Number(fila.costo_usd)).toBeGreaterThan(0);
  });

  it("con el presupuesto agotado y «detener», no llama a la IA", async () => {
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)")
      .run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 5);
    anthropic([]);
    const res = await preparar();
    expect(res.status).toBe(402);
    expect(peticiones).toHaveLength(0);
    expect(de("ficha-tecnica")).toBeUndefined();
  });

  it("una respuesta cortada por longitud no escribe nada", async () => {
    anthropic([flujo("FICHA:\nA medias", { parada: "max_tokens" })]);
    const res = await preparar();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/cortó por longitud/);
    expect(de("ficha-tecnica")).toBeUndefined();
  });

  it("una respuesta sin el formato tampoco", async () => {
    anthropic([flujo("Aquí tienes una ficha muy bonita, pero sin etiquetas.")]);
    const res = await preparar();
    expect(res.status).toBe(502);
    expect(notas().filter((n) => n.origen === "ia")).toEqual([]);
  });

  it("un rechazo de Anthropic enseña su motivo", async () => {
    anthropic([new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "prompt demasiado largo" } }), { status: 400 })]);
    const res = await preparar();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("prompt demasiado largo");
  });

  it("sin notas de marca lo dice, en vez de pedirle a la IA una ficha de la nada", async () => {
    db.sqlite.prepare("delete from cerebro_notas").run();
    await poner({ titulo: "Sólo interna", texto: "costos", interna: true });
    anthropic([]);
    const res = await preparar();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/notas de marca/);
    expect(peticiones).toHaveLength(0);
  });

  it("sin la clave de Anthropic, 503", async () => {
    env.ANTHROPIC_API_KEY = "";
    expect((await preparar()).status).toBe(503);
  });

  it("no toca el cerebro de otro cliente", async () => {
    db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Otro");
    anthropic([flujo(RESPUESTA)]);
    await preparar();
    expect(db.sqlite.prepare("select count(*) as n from cerebro_notas where client_id = 'c2'").get().n).toBe(0);
  });
});
