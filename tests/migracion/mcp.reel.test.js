import { describe, it, expect, beforeEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { planDeReel, modeloParaFotogramas, textoDelAhorro, lineaDeClips } from "../../worker/lib/estudio/herramientasReel.js";
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

  it("B6 · por defecto se PARA tras el storyboard: sólo cuesta lo de los fotogramas y el video se confirma después", async () => {
    const t = textoDe(await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION }));
    expect(t).toMatch(/se PARA a revisar el storyboard/);
    await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, confirmado: true });
    const [e] = encargos();
    expect(e.datos).toMatchObject({ revisar: true, video: { fase: "espera" } });
    // Saltarse la revisión sólo si se pide.
    const r2 = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: { ...GUION, titulo: "Otro reel" }, confirmado: true, revisar: false });
    expect(textoDe(r2)).toMatch(/Reel en marcha/);
    expect(encargos().some((x) => x.datos.revisar === false)).toBe(true);
  });

  it("E22 · otra voz para ESTE reel viaja al montaje", async () => {
    await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, confirmado: true, voz: "abcdefgh12345678" });
    expect(encargos()[0].datos.montaje).toMatchObject({ vozId: "abcdefgh12345678" });
  });

  it("B7 · con Kie, el saldo que no alcanza se dice (con la cuenta de la llave) y no se gasta", async () => {
    env.KIE_API_KEY = "kie-llave-1234abcd";
    vi.stubGlobal("fetch", async (url) => {
      if (String(url).includes("/api/v1/chat/credit")) return Response.json({ code: 200, msg: "success", data: 2 });
      throw new Error(`fetch inesperado a ${url}`);
    });
    try {
      const t = textoDe(await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, revisar: false }));
      expect(t).toMatch(/saldo de Kie NO alcanza.*Saldo: 2 créditos.*termina en abcd/s);
      const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, revisar: false, confirmado: true });
      expect(r.isError).toBe(true);
      expect(encargos()).toHaveLength(0);
    } finally { vi.unstubAllGlobals(); }
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
  it("B7/B9/C12 · el plan: clips con Veo 3.1 Lite, sin pagar la toma fija, y lo que se ahorra frente a la opción cara", () => {
    const guion = { ...GUION, segundos: 9, planos: GUION.planos.map((x, i) => ({ ...x, desde: i * 3, hasta: (i + 1) * 3, toma: i === 1 ? "fija" : "movimiento" })) };
    const p = planDeReel({ guion, activos: { kie: true }, kit: {} });
    expect(p).toMatchObject({ salida: "clips", clips: 2, fijos: 1 });
    expect(p.video.id).toBe("veo-3-1-lite-kie");
    expect(p.cara.ahorro).toBeGreaterThan(0);
    expect(textoDelAhorro(p)).toMatch(/se ahorran unos/);
    // Sin montaje (para descargar los clips), cada plano lleva su clip.
    expect(planDeReel({ guion, activos: { kie: true }, kit: {}, montar: false }).clips).toBe(3);
  });
  it("B8 · estado_reel dice qué clips no salieron y por qué (y que se montan con su fotograma)", () => {
    const pasos = [
      { id: "f1", titulo: "Plano 1", clip: { fase: "hecho", archivoId: "a1" } },
      { id: "f2", titulo: "Plano 2", clip: { fase: "fallido", error: "Veo rechazó el primer plano de la piel" } },
      { id: "f3", titulo: "Plano 3", clip: { fase: "omitido" } },
    ];
    const t = lineaDeClips(pasos, true);
    expect(t).toMatch(/Clips: 1 de 2 listos/);
    expect(t).toMatch(/NO salieron: Plano 2 \(Veo rechazó el primer plano de la piel\)\. Se montan con su fotograma/);
    expect(t).toMatch(/Toma fija, con su fotograma \(sin clip\): Plano 3/);
  });
  it("el plan: los fotogramas con un modelo que admite referencias; 60 s, por clips", () => {
    expect(modeloParaFotogramas({ kie: true }, {}).referencias).toBeGreaterThanOrEqual(2);
    const p = planDeReel({ guion: { ...GUION, segundos: 60, planos: GUION.planos.map((x, i) => ({ ...x, desde: i * 20, hasta: (i + 1) * 20 })) }, activos: { kie: true }, kit: {} });
    expect(p.salida).toBe("clips");
    expect(p.video.inicial).toBeTruthy();
    expect(p.total).toBeGreaterThan(0);
  });
});
