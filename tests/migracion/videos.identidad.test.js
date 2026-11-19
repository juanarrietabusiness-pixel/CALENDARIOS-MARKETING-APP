import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { guardarKit } from "../../worker/lib/estudio/kit.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";

// ============================================================
// La IDENTIDAD DE VIDEO de un cliente, por el MCP y contra una D1 de verdad
//
// Lo que importa:
//   1. Guardar comprueba lo que nombra (el estilo guardado, las músicas de la biblioteca, los efectos del catálogo) y
//      cambia sólo las partes que trae; el PUT del kit no se la lleva.
//   2. Un video NUEVO sale con ella: el estilo de la marca, sus subtítulos, una música de SU lista que no sonó en el
//      anterior y sus efectos por momento. Uno con otro estilo pedido, con ese.
//   3. Sin identidad, todo como antes.
// ============================================================

const ANA = "u-ana";
const USUARIO = { id: ANA, nombre: "Ana" };
let db;
let env;
let acceso;

function r2() {
  const objetos = new Map();
  return {
    async head(clave) { return objetos.has(clave) ? { size: 10 } : null; },
    async get(clave) { const b = objetos.get(clave); return b ? { size: b.length, arrayBuffer: async () => b.buffer } : null; },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete() {},
  };
}

const ESTILO = {
  id: "ev-marca01", nombre: "Marca personal", para: "todos", grano: 0.3, ritmo: "rapido",
  texto: { rol: "gigante", mayusculas: true, entrada: "golpe" }, transiciones: { cambio: ["empuje"] },
};

function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, ANA, "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c1", ANA, "Juan Arrieta", JSON.stringify({ estilo: "sobrio", estilosVideo: [ESTILO] }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Sin identidad");
  for (const [id, nombre] of [["m1", "Mañana"], ["m2", "Enfoque"]]) {
    s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt, modelo, origen) values (?,?,?,?,?,?,?,?,?)")
      .run(id, ANA, "c1", `clientes/c1/sonido/${id}.mp3`, "audio", "audio/mpeg", nombre, "musica-subida", "subida");
  }
}

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });
const llamar = async (nombre, args) => {
  const r = await mcp().llamar(nombre, args);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError), imagenes: r.content.filter((b) => b.type === "image") };
};
const kit = (id = "c1") => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = ?").get(id).kit_marca || "{}");
const videos = () => db.sqlite.prepare("select * from videos_proyectos order by created_at, rowid").all().map((v) => ({ ...v, guion: JSON.parse(v.guion), sonido: JSON.parse(v.sonido || "{}"), origen: JSON.parse(v.origen || "{}") }));

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("identidad_video", () => {
  it("está en el MCP y escribe", () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.name === "identidad_video");
    expect(h).toBeTruthy();
    expect(h.annotations.readOnlyHint).toBe(false);
  });

  it("sin guardar dice que no tiene, con lo que se puede escoger", async () => {
    const r = await llamar("identidad_video", { cliente: "Juan Arrieta" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/no tiene identidad de video/);
    expect(r.texto).toMatch(/«Marca personal» \[ev-marca01\]/);
    expect(r.texto).toMatch(/«Mañana» \[m1\]/);
    expect(r.texto).toMatch(/clasico .*palabra .*placa .*limpio/s);
  });

  it("guardar comprueba lo que nombra y no guarda nada si algo no existe", async () => {
    const malo = await llamar("identidad_video", { cliente: "Juan Arrieta", guardar: { estiloId: "ev-noexiste", musicas: ["m9"], efectos: { transicion: ["no-existe"] } } });
    expect(malo.error).toBe(true);
    expect(malo.texto).toMatch(/ev-noexiste/);
    expect(malo.texto).toMatch(/m9/);
    expect(malo.texto).toMatch(/no-existe/);
    expect(kit().identidadVideo).toBeUndefined();
  });

  it("guarda por partes, y el kit guardado desde la pantalla no se la lleva", async () => {
    const r = await llamar("identidad_video", { cliente: "Juan Arrieta", guardar: { estiloId: "ev-marca01", musicas: ["m1", "m2"], efectos: { transicion: ["swipe-glide"] }, subtitulos: { estilo: "palabra", pos: "centro" } } });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Estilo de la marca: «Marca personal»/);
    expect(kit().identidadVideo).toEqual({
      estiloId: "ev-marca01", musicas: [{ id: "m1", nombre: "Mañana" }, { id: "m2", nombre: "Enfoque" }],
      efectos: { transicion: ["swipe-glide"] }, subtitulos: { estilo: "palabra", pos: "centro" },
    });
    // Cambiar sólo los subtítulos deja lo demás; null quita una parte.
    await llamar("identidad_video", { cliente: "Juan Arrieta", guardar: { subtitulos: { estilo: "limpio" }, efectos: null } });
    expect(kit().identidadVideo.subtitulos).toEqual({ estilo: "limpio" });
    expect(kit().identidadVideo.efectos).toBeUndefined();
    expect(kit().identidadVideo.musicas).toHaveLength(2);
    // El kit guardado desde otra pestaña (sin la identidad) la conserva.
    const cliente = db.sqlite.prepare("select * from clients where id = 'c1'").get();
    await guardarKit(env, acceso, cliente, { estilo: "cálido" });
    expect(kit().estilo).toBe("cálido");
    expect(kit().identidadVideo.estiloId).toBe("ev-marca01");
  });
});

describe("un video nuevo sale con la identidad", () => {
  beforeEach(async () => {
    await llamar("identidad_video", { cliente: "Juan Arrieta", guardar: { estiloId: "ev-marca01", musicas: ["m1", "m2"], efectos: { transicion: ["swipe-glide"], sello: ["ui_pop-soft"] }, subtitulos: { estilo: "placa", maxPalabras: 3 } } });
  });

  it("su estilo de marca, sus subtítulos, una música de su lista y sus efectos; el siguiente, la otra música", async () => {
    const a = await llamar("crear_video", { cliente: "Juan Arrieta", guion: EJEMPLO_GUION });
    expect(a.error).toBe(false);
    expect(a.texto).toMatch(/Con la identidad de video del cliente: el estilo de la marca «Marca personal» y sus subtítulos/);
    const b = await llamar("crear_video", { cliente: "Juan Arrieta", guion: EJEMPLO_GUION });
    expect(b.error).toBe(false);
    const [v1, v2] = videos();
    expect(v1.origen.estiloId).toBe("ev-marca01");
    expect(v1.guion.estilo.ritmo).toBe("rapido");
    expect(v1.guion.subtitulos).toMatchObject({ estilo: "placa", maxPalabras: 3 });
    expect(v1.sonido.efectosMarca).toEqual({ transicion: ["swipe-glide"], sello: ["ui_pop-soft"] });
    expect(v1.sonido.musica).toMatchObject({ archivoId: "m1", nombre: "Mañana" });
    expect(v2.sonido.musica).toMatchObject({ archivoId: "m2" });
  });

  it("con otro estilo pedido, ése; sin identidad, como siempre", async () => {
    db.sqlite.prepare("update clients set kit_marca = ? where id = 'c1'").run(JSON.stringify({ ...kit(), estilosVideo: [ESTILO, { ...ESTILO, id: "ev-otro001", nombre: "Otro", ritmo: "calmado" }] }));
    await llamar("crear_video", { cliente: "Juan Arrieta", guion: EJEMPLO_GUION, estilo_id: "ev-otro001" });
    expect(videos()[0].origen.estiloId).toBe("ev-otro001");
    expect(videos()[0].guion.estilo.ritmo).toBe("calmado");
    await llamar("crear_video", { cliente: "Sin identidad", guion: EJEMPLO_GUION });
    const sin = videos().find((v) => v.client_id === "c2");
    expect(sin.origen.estiloId).toBeUndefined();
    expect(sin.guion.subtitulos.estilo).toBeUndefined();
    expect(sin.sonido.efectosMarca).toBeUndefined();
  });
});
