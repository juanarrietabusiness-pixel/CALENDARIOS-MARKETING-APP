import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { clientesPermitidos } from "../../worker/lib/sesion.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { DEFINICIONES_EQUIPO } from "../../worker/lib/herramientasEquipo.js";
import { mensajeDeEnvio } from "../../src/lib/aprobacion.js";

// ============================================================
// Lo del EQUIPO por MCP (worker/lib/herramientasEquipo.js), contra una D1 de verdad
//
//   · enlace_del_cliente: el testigo del mes se REUTILIZA (nunca se crea ni se regenera) y el mensaje es el de la
//     pantalla (`mensajeDeEnvio`), con lo que respondió el cliente aplicado.
//   · ver_avisos: sólo los de quien conecta; marcar leídos, sólo los suyos y sólo los que enseña.
//   · ver_bandeja: sólo con la bandeja encendida; lo de otro espacio o de otro colaborador no existe.
//   · ver_informes: la lista con el enlace de lo compartido; con mes, el resumen del análisis.
//   · Todas se anuncian de sólo lectura: una persona de sólo lectura las usa.
// ============================================================

const JEFE = "u-jefe";
const ANA = "u-ana";
const OTRA = "u-otra";
const COLAB = "u-colab";
const ORIGEN = "https://calendario.test";
let db;
let env;
let difusiones;

const DIAS = [
  { date: "2026-11-03", posts: [
    { id: "p1", format: "post", status: "pending", title: "Sofá", publishTime: "09:00", medios: [{ src: "/api/media/clientes/c1/a.jpg", tipo: "imagen" }] },
    { id: "p2", format: "reel", status: "pending", title: "Reel sin pieza", publishTime: "" },
  ] },
  { date: "2026-11-05", posts: [
    { id: "p3", format: "post", status: "pending", title: "Aprobada por el cliente", publishTime: "10:00", medios: [{ src: "/api/media/clientes/c1/b.jpg", tipo: "imagen" }] },
  ] },
];

beforeEach(() => {
  db = d1EnMemoria();
  difusiones = [];
  env = {
    DB: db, ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { difusiones.push(await req.json().catch(() => null)); return new Response("ok"); } }) },
  };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [ANA, "ana@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#123123");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  // El colaborador es del espacio del jefe y sólo lleva c2.
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Leo", "#654321", '["c2"]');
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name, revision_interna) values (?,?,?,?)").run("c2", JEFE, "Baby Caleb", 1);
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");

  // Dcasa: noviembre compartido (con su testigo), octubre sin compartir nunca.
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?)")
    .run("cal-nov", "c1", JEFE, 10, 2026, JSON.stringify(DIAS), "tok-nov-123", 1);
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
    .run("cal-oct", "c1", JEFE, 9, 2026, "[]");
  // El cliente aprobó p3 por el enlace (el `status` de los días sigue en «pending»: la verdad es la tabla).
  s.prepare("insert into approvals (id, calendar_id, post_id, estado, tipo) values (?,?,?,?,?)").run("ap1", "cal-nov", "p3", "aprobado", "pieza");
  // Baby Caleb: un mes con el enlace desactivado y una idea que aún no ve el cliente (revisión interna).
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?)")
    .run("cal-bc", "c2", JEFE, 10, 2026, JSON.stringify([{ date: "2026-11-02", posts: [{ id: "q1", format: "post", status: "pending", etapa: "idea" }] }]), "tok-bc", 0);
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?)")
    .run("cal-ajeno", "c9", OTRA, 10, 2026, "[]", "tok-ajeno", 1);

  // La campana: dos de Juan (uno leído), uno de Ana, uno de otro espacio.
  const aviso = s.prepare("insert into avisos (id, owner_id, user_id, tipo, texto, enlace, por_nombre, leido_at, created_at) values (?,?,?,?,?,?,?,?,?)");
  aviso.run("a1", JEFE, JEFE, "aprobada", "Dcasa aprobó «Sofá»", "/cliente/c1/noviembre-2026?post=p1", "Cliente", null, "2026-11-14T10:00:00.000Z");
  aviso.run("a2", JEFE, JEFE, "mencion", "Ana te mencionó en «Reel»", "", "Ana", "2026-11-13T09:00:00.000Z", "2026-11-13T08:00:00.000Z");
  aviso.run("a3", JEFE, ANA, "aprobada", "Sólo para Ana", "", "Cliente", null, "2026-11-14T11:00:00.000Z");
  aviso.run("a9", OTRA, OTRA, "aprobada", "De otro espacio", "", "Cliente", null, "2026-11-14T11:00:00.000Z");

  // La bandeja: Dcasa encendida, Baby Caleb apagada.
  s.prepare("insert into bandeja_clientes (id, owner_id, client_id, activa, actualizada_at) values (?,?,?,?,?)").run("c1", JEFE, "c1", 1, "2026-11-14T09:00:00.000Z");
  s.prepare("insert into bandeja_clientes (id, owner_id, client_id, activa) values (?,?,?,?)").run("c2", JEFE, "c2", 0);
  const comentario = s.prepare("insert into bandeja_comentarios (id, owner_id, client_id, red, externo_id, autor, texto, propio, atendido, creado_at, publicacion_texto) values (?,?,?,?,?,?,?,?,?,?,?)");
  comentario.run("k1", JEFE, "c1", "instagram", "e1", "maria", "¿Cuánto cuesta lavar un sofá de 3 puestos?", 0, 0, "2026-11-14T08:00:00.000Z", "Sofá como nuevo");
  comentario.run("k2", JEFE, "c1", "instagram", "e2", "dcasa", "¡Te escribimos por privado!", 1, 0, "2026-11-14T08:05:00.000Z", "");
  comentario.run("k3", JEFE, "c1", "facebook", "e3", "pedro", "Ya atendido", 0, 1, "2026-11-13T08:00:00.000Z", "");
  comentario.run("k4", JEFE, "c2", "instagram", "e4", "luz", "De Baby Caleb", 0, 0, "2026-11-14T08:00:00.000Z", "");
  s.prepare("insert into bandeja_hilos (id, owner_id, client_id, red, usuario_id, usuario, ultimo_texto, ultimo_at, ultimo_usuario_at, sin_leer, atendido) values (?,?,?,?,?,?,?,?,?,?,?)")
    .run("h1", JEFE, "c1", "facebook", "u1", "Rosa", "¿Tienen cita el sábado?", new Date(Date.now() - 3600_000).toJSON(), new Date(Date.now() - 3600_000).toJSON(), 2, 0);
  s.prepare("insert into bandeja_hilos (id, owner_id, client_id, red, usuario_id, usuario, ultimo_texto, ultimo_at, ultimo_usuario_at, sin_leer, atendido) values (?,?,?,?,?,?,?,?,?,?,?)")
    .run("h2", JEFE, "c1", "instagram", "u2", "Tomás", "Gracias", "2026-11-01T08:00:00.000Z", "2026-11-01T08:00:00.000Z", 0, 0);

  // Los informes de Dcasa: octubre compartido con su análisis, septiembre sin compartir; uno de anuncios.
  const informe = s.prepare("insert into informes (id, owner_id, client_id, mes, estado, contenido, testigo, compartido) values (?,?,?,?,?,?,?,?)");
  informe.run("i1", JEFE, "c1", "2026-10", "listo", JSON.stringify({ cifras: {}, analisis: { resumen: "Octubre creció un 12 % en alcance.", recomendaciones: ["Más reels de antes y después"] } }), "tok-inf", 1);
  informe.run("i2", JEFE, "c1", "2026-09", "listo", "{}", null, 0);
  s.prepare("insert into informes_anuncios (id, owner_id, client_id, mes, estado, contenido, testigo, compartido) values (?,?,?,?,?,?,?,?)")
    .run("ia1", JEFE, "c1", "2026-10", "listo", JSON.stringify({ cifras: {}, analisis: { resumen: "Las conversaciones salieron a 0,80 $." } }), "tok-ia", 1);
  informe.run("i9", OTRA, "c9", "2026-10", "listo", "{}", "tok-ajeno-inf", 1);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** El perfil como lo arma la sesión del MCP (sesion.js). */
const perfil = (id, { soloLectura = false } = {}) => {
  const m = db.sqlite.prepare("select * from memberships where user_id = ?").get(id);
  return { id, nombre: m.nombre, ownerId: m.owner_id, rol: m.rol, soloLectura, clientes: m.rol !== "admin" ? clientesPermitidos(m.clientes) : null };
};
async function llamar(nombre, entrada, id = JEFE, opciones = {}) {
  const usuario = perfil(id, opciones);
  const r = await crearHerramientasMCP({ env, acceso: crearAcceso(db, usuario.ownerId, { clientes: usuario.clientes }), usuario, origen: ORIGEN }).llamar(nombre, entrada);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
}
const testigo = (id) => db.sqlite.prepare("select share_token, share_enabled from calendars where id = ?").get(id);

describe("las definiciones", () => {
  it("están en el conector, todas de sólo lectura y sin nombres repetidos", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    for (const d of DEFINICIONES_EQUIPO) {
      expect(por[d.name], d.name).toBeTruthy();
      expect(por[d.name].annotations.readOnlyHint, d.name).toBe(true);
    }
    expect(por.enlace_del_cliente.inputSchema.required).toEqual(["cliente"]);
    expect(por.ver_bandeja.inputSchema.required).toEqual(["cliente"]);
    expect(por.ver_informes.inputSchema.required).toEqual(["cliente"]);
    expect(por.ver_avisos.inputSchema.required).toBeUndefined();
    expect(new Set(HERRAMIENTAS_MCP.map((h) => h.name)).size).toBe(HERRAMIENTAS_MCP.length);
  });
});

describe("enlace_del_cliente", () => {
  it("da el enlace con el testigo de siempre y el MISMO mensaje de «Enviar al cliente», con las respuestas aplicadas", async () => {
    const antes = testigo("cal-nov");
    const r = await llamar("enlace_del_cliente", { cliente: "dcasa", mes: "2026-11" });
    expect(r.error).toBe(false);
    const enlace = `${ORIGEN}/aprobar?t=tok-nov-123`;
    expect(r.texto).toContain(enlace);
    expect(r.texto).toContain(mensajeDeEnvio({ nombre: "Dcasa", mes: "Noviembre 2026", url: enlace }));
    // p2 no tiene pieza ni hora; p3 ya la aprobó el cliente (no cuenta como pendiente).
    expect(r.texto).toMatch(/1 sin su pieza/);
    expect(r.texto).toMatch(/1 sin hora/);
    expect(r.texto).not.toMatch(/con cambios que pidió/);
    // Nada se escribe: el testigo es el mismo y el mes no queda marcado como enviado.
    expect(testigo("cal-nov")).toEqual(antes);
    expect(JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal-nov'").get().days)[0].posts[0].enviadoAt).toBeUndefined();
  });

  it("sin mes, el más reciente; un mes nunca compartido no se crea aquí", async () => {
    expect((await llamar("enlace_del_cliente", { cliente: "Dcasa" })).texto).toContain("tok-nov-123");
    const r = await llamar("enlace_del_cliente", { cliente: "Dcasa", mes: "2026-10" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/aún no tiene enlace[\s\S]*«Enviar al cliente»/);
    expect(testigo("cal-oct").share_token).toBeNull();
  });

  it("un enlace desactivado lo dice sin enseñarlo; un mes que no existe dice cuáles hay", async () => {
    const r = await llamar("enlace_del_cliente", { cliente: "Baby Caleb" });
    expect(r.texto).toMatch(/DESACTIVADO/);
    expect(r.texto).not.toContain("tok-bc");
    const sin = await llamar("enlace_del_cliente", { cliente: "Dcasa", mes: "2025-01" });
    expect(sin.error).toBe(true);
    expect(sin.texto).toMatch(/Tiene: 2026-11, 2026-10/);
    expect((await llamar("enlace_del_cliente", { cliente: "Dcasa", mes: "noviembre" })).error).toBe(true);
  });

  it("con revisión interna, dice cuántas aún no ve el cliente", async () => {
    db.sqlite.prepare("update calendars set share_enabled = 1 where id = 'cal-bc'").run();
    const r = await llamar("enlace_del_cliente", { cliente: "Baby Caleb" });
    expect(r.texto).toMatch(/revisión interna: 1 todavía no las ve el cliente/);
  });

  it("lo de otro espacio no existe, y un colaborador sólo ve sus clientes", async () => {
    expect((await llamar("enlace_del_cliente", { cliente: "Ajeno" })).texto).toMatch(/No encontré el cliente/);
    expect((await llamar("enlace_del_cliente", { cliente: "Dcasa" }, COLAB)).texto).toMatch(/No encontré el cliente/);
    expect((await llamar("enlace_del_cliente", { cliente: "Baby Caleb" }, COLAB)).error).toBe(false);
  });
});

describe("ver_avisos", () => {
  it("los de quien conecta, los sin leer primero, con su enlace absoluto", async () => {
    const r = await llamar("ver_avisos", {});
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/1 sin leer/);
    expect(r.texto.indexOf("Dcasa aprobó")).toBeLessThan(r.texto.indexOf("Ana te mencionó"));
    expect(r.texto).toContain("[sin leer]");
    expect(r.texto).toContain(`${ORIGEN}/cliente/c1/noviembre-2026?post=p1`);
    expect(r.texto).not.toContain("Sólo para Ana");
    expect(r.texto).not.toContain("De otro espacio");
    expect(r.texto).toMatch(/marcar_leidos=true/);
    // Leer no marca nada.
    expect(db.sqlite.prepare("select leido_at from avisos where id = 'a1'").get().leido_at).toBeNull();
  });

  it("solo_sin_leer y marcar_leidos: sólo los suyos, y avisa a sus pestañas", async () => {
    const r = await llamar("ver_avisos", { solo_sin_leer: true, marcar_leidos: true });
    expect(r.texto).toContain("Dcasa aprobó");
    expect(r.texto).not.toContain("Ana te mencionó");
    expect(r.texto).toMatch(/Marcado como leído: 1/);
    expect(db.sqlite.prepare("select leido_at from avisos where id = 'a1'").get().leido_at).toBeTruthy();
    expect(db.sqlite.prepare("select leido_at from avisos where id = 'a3'").get().leido_at).toBeNull();
    await new Promise((r) => setTimeout(r, 10)); // difundir no se espera
    expect(difusiones.some((d) => d?.tipo === "avisos" && d.para?.includes(JEFE))).toBe(true);
    expect((await llamar("ver_avisos", { solo_sin_leer: true })).texto).toMatch(/al día/);
  });

  it("una persona de sólo lectura lee y marca su campana", async () => {
    const r = await llamar("ver_avisos", { marcar_leidos: true }, ANA, { soloLectura: true });
    expect(r.error).toBe(false);
    expect(r.texto).toContain("Sólo para Ana");
    expect(db.sqlite.prepare("select leido_at from avisos where id = 'a3'").get().leido_at).toBeTruthy();
  });
});

describe("ver_bandeja", () => {
  it("lo pendiente de un cliente encendido: comentarios de otros sin atender y conversaciones con su plazo", async () => {
    const r = await llamar("ver_bandeja", { cliente: "dcasa" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/COMENTARIOS SIN ATENDER: 1/);
    expect(r.texto).toContain("¿Cuánto cuesta lavar un sofá de 3 puestos?");
    expect(r.texto).toContain("Sofá como nuevo");
    expect(r.texto).not.toContain("¡Te escribimos por privado!");
    expect(r.texto).not.toContain("Ya atendido");
    expect(r.texto).not.toContain("De Baby Caleb");
    expect(r.texto).toMatch(/CONVERSACIONES SIN ATENDER: 2/);
    expect(r.texto).toMatch(/Rosa[^\n]*2 sin leer[^\n]*se puede responder/);
    expect(r.texto).toMatch(/Tomás[^\n]*fuera de las 24 h/);
    const solo = await llamar("ver_bandeja", { cliente: "dcasa", tipo: "mensajes" });
    expect(solo.texto).not.toMatch(/COMENTARIOS/);
  });

  it("con la bandeja apagada no enseña nada", async () => {
    const r = await llamar("ver_bandeja", { cliente: "Baby Caleb" });
    expect(r.texto).toMatch(/está apagada/);
    expect(r.texto).not.toContain("De Baby Caleb");
  });

  it("de sólo lectura también la ve", async () => {
    expect((await llamar("ver_bandeja", { cliente: "dcasa" }, ANA, { soloLectura: true })).texto).toContain("¿Cuánto cuesta");
  });
});

describe("ver_informes", () => {
  it("la lista con el enlace de lo compartido; con mes, el resumen del análisis", async () => {
    const r = await llamar("ver_informes", { cliente: "dcasa" });
    expect(r.error).toBe(false);
    expect(r.texto).toContain(`${ORIGEN}/informe?t=tok-inf`);
    expect(r.texto).toMatch(/2026-09 · listo · sin compartir/);
    expect(r.texto).toContain(`${ORIGEN}/informe-anuncios?t=tok-ia`);
    expect(r.texto).not.toMatch(/Octubre creció/);
    const conMes = await llamar("ver_informes", { cliente: "dcasa", mes: "2026-10" });
    expect(conMes.texto).toMatch(/Redes: Octubre creció un 12 % en alcance\./);
    expect(conMes.texto).toContain("Más reels de antes y después");
    expect(conMes.texto).toMatch(/Anuncios: Las conversaciones salieron a 0,80 \$\./);
    expect((await llamar("ver_informes", { cliente: "dcasa", mes: "2026-09" })).texto).toMatch(/Anuncios: no hay informe de ese mes/);
  });

  it("sin informes lo dice; lo de otro espacio no existe", async () => {
    expect((await llamar("ver_informes", { cliente: "Baby Caleb" })).texto).toMatch(/no tiene informes todavía/);
    expect((await llamar("ver_informes", { cliente: "Ajeno" })).texto).toMatch(/No encontré el cliente/);
  });
});
