import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { planDeReel, modeloParaFotogramas } from "../../worker/lib/estudio/herramientasReel.js";
import { CON_VISTA } from "../../worker/lib/mcpVista/modelo.js";

// ============================================================
// El VIDEO por MCP (worker/lib/estudio/herramientasReel.js): crear un reel, montarlo, «¿Está listo?» y el UGC
//
//   · crear_reel sin confirmado NO crea nada: el plan con su costo (y el guion para devolverlo tal cual);
//   · con confirmado=true, el ENCARGO del servidor (el mismo de la pantalla), con su carpeta, ligado a su publicación;
//   · las que escriben no son de sólo lectura, y las del reel llevan la vista previa del chat.
// Motores de prueba: sin llave ni costo. Nada llama a un servicio de verdad.
// ============================================================

const ANA = "u-ana";
const USUARIO = { id: ANA, nombre: "Ana" };
let db;
let env;
let acceso;

const GUION = {
  segundos: 9, hilo: "luz cálida", gancho: "¿Piel sensible?", llamado: "Pídelos hoy", descripcion: "Para la piel de tu bebé.",
  planos: [{ desde: 0, escena: "El bebé llora" }, { desde: 3, escena: "La caja de wipes" }, { desde: 6, escena: "El bebé sonríe" }],
  locucion: "¿Tu bebé tiene la piel sensible? Los wipes la cuidan. Escríbenos hoy.",
};

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => null, get: async () => null, put: async () => {} } };
  acceso = crearAcceso(db, ANA);
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, ANA, "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Baby Caleb");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", ANA, "Noviembre", 10, 2026, JSON.stringify([{ date: "2026-11-12", posts: [{ id: "p1", format: "reel", status: "pending" }] }]));
});

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const encargos = () => db.sqlite.prepare("select * from estudio_encargos").all().map((e) => ({ ...e, datos: JSON.parse(e.datos), pasos: JSON.parse(e.pasos) }));

describe("crear_reel", () => {
  it("sin confirmado no crea nada: el plan con su costo y el guion para devolverlo", async () => {
    const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, publicacion_id: "p1" });
    expect(r.isError).toBeUndefined();
    const t = textoDe(r);
    expect(t).toMatch(/NO SE CREÓ NADA TODAVÍA/);
    expect(t).toMatch(/3 fotogramas/);
    expect(t).toMatch(/confirmado=true/);
    expect(t).toMatch(/"gancho":"¿Piel sensible\?"/);
    expect(encargos()).toHaveLength(0);
  });

  it("confirmado: el encargo del servidor, con su carpeta de reel, ligado a su publicación y con el montaje", async () => {
    const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, publicacion_id: "p1", confirmado: true });
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toMatch(/Reel en marcha para Baby Caleb/);
    const [e] = encargos();
    expect(e).toMatchObject({ tipo: "reel", estado: "en_marcha", creado_por: ANA });
    expect(e.datos).toMatchObject({ postId: "p1", calendarId: "cal1", poner: true, montaje: { automatico: true, confirmadoVoz: false } });
    expect(e.pasos).toHaveLength(3);
    expect(db.sqlite.prepare("select tipo from estudio_carpetas where id = ?").get(e.datos.carpetaId).tipo).toBe("reel");
    // La vista previa del chat va con el resultado.
    expect(r.structuredContent).toBeTruthy();
  });

  it("una publicación que no existe no se liga a ciegas", async () => {
    const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, publicacion_id: "nada", confirmado: true });
    expect(r.isError).toBe(true);
    expect(encargos()).toHaveLength(0);
  });

  it("estado_reel cuenta cómo va; montar antes del video es un error dicho", async () => {
    await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, confirmado: true });
    const [e] = encargos();
    const est = await mcp().llamar("estado_reel", { encargo_id: e.id });
    expect(textoDe(est)).toMatch(/Storyboard: 0 de 3 fotogramas/);
    const m = await mcp().llamar("montar_reel", { encargo_id: e.id });
    expect(m.isError).toBe(true);
  });
});

describe("las demás del video por MCP", () => {
  it("video_listo y extraer_guion_ugc piden qué video", async () => {
    expect((await mcp().llamar("video_listo", { cliente: "Baby Caleb" })).isError).toBe(true);
    expect((await mcp().llamar("extraer_guion_ugc", { cliente: "Baby Caleb" })).isError).toBe(true);
  });
  it("están en el MCP; las que gastan o escriben no son de sólo lectura; las del reel con la vista previa", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    for (const n of ["crear_reel", "continuar_reel", "montar_reel", "video_listo", "extraer_guion_ugc"]) expect(por[n].annotations.readOnlyHint, n).toBe(false);
    expect(por.estado_reel.annotations.readOnlyHint).toBe(true);
    expect(por.crear_reel.description).toMatch(/sólo con su «sí»/);
    for (const n of ["crear_reel", "estado_reel"]) expect(CON_VISTA).toContain(n);
  });
  it("el plan: los fotogramas con un modelo que admite referencias; 60 s, por clips", () => {
    expect(modeloParaFotogramas({ kie: true }, {}).referencias).toBeGreaterThanOrEqual(2);
    const p = planDeReel({ guion: { ...GUION, segundos: 60, planos: GUION.planos.map((x, i) => ({ ...x, desde: i * 20, hasta: (i + 1) * 20 })) }, activos: { kie: true }, kit: {} });
    expect(p.salida).toBe("clips");
    expect(p.video.inicial).toBeTruthy();
    expect(p.total).toBeGreaterThan(0);
  });
});
