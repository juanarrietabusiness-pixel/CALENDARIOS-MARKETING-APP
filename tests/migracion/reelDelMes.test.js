import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { reelsDelMes, planosParaSegundos } from "../../worker/lib/estudio/reelDelMes.js";

// ============================================================
// Los reels de un mes (asistente del mes, POST /api/estudio/<c>/reel/mes)
//
//   · sin confirmado: el costo de cada reel aprobado y NADA más (ni guion ni encargo);
//   · un UGC, algo que no es reel o una publicación de otro mes se dicen, no se lanzan;
//   · confirmado: el ENCARGO del reel por planos de siempre, ligado a su publicación (se pone solo) y con el montaje.
// Motores de prueba: sin llave ni costo. Nada llama a un servicio de verdad.
// ============================================================

const ANA = "u-ana";
let db;
let env;
let acceso;
const cliente = () => db.sqlite.prepare("select * from clients where id = 'c1'").get();
const encargos = () => db.sqlite.prepare("select * from estudio_encargos").all().map((e) => ({ ...e, datos: JSON.parse(e.datos) }));
const GUION = {
  segundos: 9, gancho: "¿Sofá pequeño?", llamado: "Escríbenos", descripcion: "El sofá cama.",
  planos: [{ desde: 0, escena: "Sala pequeña" }, { desde: 3, escena: "Se abre el sofá" }, { desde: 6, escena: "Familia feliz" }],
};

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => null, get: async () => null, put: async () => {} } };
  acceso = crearAcceso(db, ANA);
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, ANA, "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Dcasa");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", ANA, "Noviembre", 10, 2026, JSON.stringify([{ date: "2026-11-12", posts: [
      { id: "r1", format: "reel", status: "pending", idea: "El sofá cama", etapa: "produccion" },
      { id: "u1", format: "reel", rostro: true, status: "pending", idea: "Testimonio" },
      { id: "p1", format: "post", status: "pending", idea: "Promo" },
    ] }]));
});

describe("los reels del mes", () => {
  it("sin confirmado: el costo de cada uno, y no se crea nada", async () => {
    const r = await reelsDelMes(env, acceso, cliente(), { calendarId: "cal1", postIds: ["r1", "u1", "p1", "nada"] });
    expect(r.reels[0]).toMatchObject({ postId: "r1", planos: planosParaSegundos(r.reels[0].segundos) });
    expect(r.reels[0].costoTexto).toBeTruthy();
    expect(r.reels.find((x) => x.postId === "u1").error).toMatch(/UGC/);
    expect(r.reels.find((x) => x.postId === "p1").error).toMatch(/No es un reel/);
    expect(r.reels.find((x) => x.postId === "nada").error).toMatch(/ya no está/);
    expect(encargos()).toHaveLength(0);
  });

  it("confirmado: el encargo del reel ligado a su publicación (se pone solo) y con el montaje", async () => {
    const r = await reelsDelMes(env, acceso, cliente(), { calendarId: "cal1", postId: "r1", confirmado: true, guion: GUION }, { usuario: { id: ANA } });
    const [e] = encargos();
    expect(r.encargoId).toBe(e.id);
    expect(e).toMatchObject({ tipo: "reel", estado: "en_marcha" });
    expect(e.datos).toMatchObject({ postId: "r1", calendarId: "cal1", montaje: { automatico: true, confirmadoVoz: false } });
  });

  it("un UGC o un mes de otro cliente no se lanzan", async () => {
    await expect(reelsDelMes(env, acceso, cliente(), { calendarId: "cal1", postId: "u1", confirmado: true, guion: GUION })).rejects.toThrow(/UGC/);
    await expect(reelsDelMes(env, acceso, cliente(), { calendarId: "otro", postIds: ["r1"] })).rejects.toThrow(/no existe/);
    expect(encargos()).toHaveLength(0);
  });
});
