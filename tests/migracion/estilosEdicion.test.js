import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { guardarKit, kitDe } from "../../worker/lib/estudio/kit.js";
import { planDelKit } from "../../worker/lib/kitDescargable.js";

// ============================================================
// Los ESTILOS DE EDICIÓN de un cliente (Fase 3 del editor de video grabado), por el MCP y contra una D1 de verdad
//
// Lo que importa:
//   1. Sin confirmado no se guarda ni se quita NADA: se devuelve lo que se haría, para enseñárselo a la persona.
//   2. Guardar crea o reemplaza ENTERO (por id o por el mismo nombre); hasta 6; lo que no se entiende, error sin guardar.
//   3. El PUT del kit (guardarKit sin conEdicion) no se los lleva.
//   4. El ZIP de la marca los lleva (estilos-edicion.json) con las músicas de la identidad de video.
// ============================================================

const ANA = "u-ana";
const USUARIO = { id: ANA, nombre: "Ana" };
const ROFER = JSON.parse(readFileSync(new URL("../../docs/estilos-edicion/rofer-alex-en-obra.json", import.meta.url), "utf8"));
let db;
let env;
let acceso;

function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, ANA, "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c1", ANA, "Rofer Service", JSON.stringify({
    estilo: "sobrio", identidadVideo: { musicas: [{ id: "m1", nombre: "Obra" }, { id: "b1", de: "agencia", nombre: "De la agencia" }] },
  }));
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt, modelo, origen) values (?,?,?,?,?,?,?,?,?)")
    .run("m1", ANA, "c1", "clientes/c1/sonido/m1.mp3", "audio", "audio/mpeg", "Obra", "musica-subida", "subida");
  s.prepare("insert into biblioteca_sonidos (id, owner_id, categoria, nombre, clave) values (?,?,?,?,?)")
    .run("b1", ANA, "musica", "De la agencia", `biblioteca/${ANA}/b1.mp3`);
}

const llamar = async (nombre, args) => {
  const r = await crearHerramientasMCP({ env, acceso, usuario: USUARIO }).llamar(nombre, args);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
};
const cliente = () => db.sqlite.prepare("select * from clients where id = 'c1'").get();
const estilos = () => kitDe(cliente()).estilosEdicion ?? [];

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => ({ size: 10 }), get: async () => null, put: async () => {}, delete: async () => {} } };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("estilo_de_edicion", () => {
  it("está en el MCP, escribe y su descripción dice que guardar es con el sí", () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.name === "estilo_de_edicion");
    expect(h).toBeTruthy();
    expect(h.annotations.readOnlyHint).toBe(false);
    expect(h.description).toMatch(/sí de la persona/);
  });

  it("sin estilos lo dice; sin confirmado no guarda nada y enseña lo que guardaría", async () => {
    expect((await llamar("estilo_de_edicion", { cliente: "Rofer" })).texto).toMatch(/no tiene estilos de edición/);
    const r = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: ROFER });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/NO SE HA GUARDADO NADA/);
    expect(r.texto).toMatch(/CREA el estilo de edición/);
    expect(r.texto).toMatch(/Cámara: abierto 1.13×/);
    expect(estilos()).toEqual([]);
  });

  it("con confirmado lo guarda con id; con el mismo nombre lo REEMPLAZA entero", async () => {
    const r = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: ROFER, confirmado: true });
    expect(r.texto).toMatch(/Guardado el estilo de edición «Alex en obra» \[ee-[a-z0-9]{10}\]/);
    const [g] = estilos();
    expect(g).toEqual({ ...ROFER, id: g.id });

    const previa = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { nombre: "alex en obra", ritmo: "más lento" } });
    expect(previa.texto).toMatch(/REEMPLAZA ENTERO el estilo «Alex en obra»/);
    await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { nombre: "alex en obra", ritmo: "más lento" }, confirmado: true });
    expect(estilos()).toEqual([{ id: g.id, nombre: "alex en obra", ritmo: "más lento" }]);

    const uno = await llamar("estilo_de_edicion", { cliente: "Rofer", estilo: "Alex" });
    expect(JSON.parse(uno.texto.slice(uno.texto.indexOf("{")))).toEqual(estilos()[0]);
  });

  it("lo que no se entiende es un error y no guarda nada; con un id que no existe, también", async () => {
    const r = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { nombre: "Malo", transiciones: { entreClips: "estrella" } }, confirmado: true });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/NO SE GUARDÓ NADA.*estrella/);
    const r2 = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { id: "ee-noexiste1", nombre: "X" }, confirmado: true });
    expect(r2.texto).toMatch(/No hay ningún estilo con el id «ee-noexiste1»/);
    expect(estilos()).toEqual([]);
  });

  it("guarda las VARIANTES del kit; las que se parecen a las de otra marca no se guardan", async () => {
    db.sqlite.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c2", ANA, "D'CASA", JSON.stringify({
      estilosEdicion: [{ id: "ee-dcasa00001", nombre: "Tienda", variantes: { transicion: "zoom", entrada: "golpe", subtitulos: "clasico", cierre: "banda" } }],
    }));
    const mal = await llamar("estilo_de_edicion", { cliente: "Rofer Service", guardar: { nombre: "Obra", variantes: { transicion: "fundido" } } });
    expect(mal.error).toBe(true);
    expect(mal.texto).toMatch(/variantes\.transicion: «fundido» no la pinta el kit/);
    const igual = await llamar("estilo_de_edicion", { cliente: "Rofer Service", guardar: { nombre: "Obra", variantes: { transicion: "zoom", entrada: "golpe", subtitulos: "clasico", cierre: "tarjeta" } } });
    expect(igual.error).toBe(true);
    expect(igual.texto).toMatch(/se parecen demasiado a las de D'CASA \(«Tienda»/);
    const propio = { nombre: "Obra", variantes: { transicion: "glitch", entrada: "maquina", subtitulos: "clasico", cierre: "banda", ritmo: "vivo", forma: "recta" } };
    const vista = await llamar("estilo_de_edicion", { cliente: "Rofer Service", guardar: propio });
    expect(vista.texto).toMatch(/Variantes del kit: transicion «glitch», entrada «maquina»/);
    expect((await llamar("estilo_de_edicion", { cliente: "Rofer Service", guardar: propio, confirmado: true })).error).toBe(false);
    expect(estilos()[0].variantes).toEqual(propio.variantes);
    // La guía las da para el plan y enseña las de las demás marcas, para no repetirlas.
    const guia = await llamar("guia_de_edicion", { cliente: "Rofer Service", tipo: "persona-a-camara" });
    expect(guia.texto).toContain(`"variantes": ${JSON.stringify(propio.variantes)}`);
    expect(guia.texto).toMatch(/D'CASA \(«Tienda»\): Transición: golpe de zoom/);
    expect(guia.texto).toMatch(/El juego de siempre \(Rofer v2/);
    const guiaDcasa = await llamar("guia_de_edicion", { cliente: "D'CASA", tipo: "persona-a-camara" });
    expect(guiaDcasa.texto).toMatch(/Rofer Service \(«Obra»\): Transición: glitch/);
  });

  it("hasta 6: el séptimo no entra", async () => {
    for (let i = 0; i < 6; i++) await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { nombre: `E${i}` }, confirmado: true });
    const r = await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: { nombre: "E7" }, confirmado: true });
    expect(r.texto).toMatch(/ya tiene 6 estilos/);
    expect(estilos()).toHaveLength(6);
  });

  it("quitar pide el sí antes", async () => {
    await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: ROFER, confirmado: true });
    expect((await llamar("estilo_de_edicion", { cliente: "Rofer", estilo: "Alex en obra", quitar: true })).texto).toMatch(/NO SE HA QUITADO NADA/);
    expect(estilos()).toHaveLength(1);
    expect((await llamar("estilo_de_edicion", { cliente: "Rofer", estilo: "Alex en obra", quitar: true, confirmado: true })).texto).toMatch(/Quitado/);
    expect(estilos()).toEqual([]);
  });

  it("el PUT del kit no se los lleva", async () => {
    await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: ROFER, confirmado: true });
    await guardarKit(env, acceso, cliente(), { estilo: "otro", estilosEdicion: [] });
    expect(estilos()).toHaveLength(1);
    expect(kitDe(cliente()).estilo).toBe("otro");
  });

  it("el ZIP de la marca lleva los estilos y las músicas de la identidad de video", async () => {
    await llamar("estilo_de_edicion", { cliente: "Rofer", guardar: ROFER, confirmado: true });
    const plan = await planDelKit(acceso, cliente());
    const est = plan.textos.find((t) => t.ruta === "estilos-edicion.json");
    expect(JSON.parse(est.texto).estilos[0].nombre).toBe("Alex en obra");
    expect(plan.archivos.map((a) => a.clave)).toEqual(expect.arrayContaining(["clientes/c1/sonido/m1.mp3", `biblioteca/${ANA}/b1.mp3`]));
    const kitJson = JSON.parse(plan.textos.find((t) => t.ruta === "kit.json").texto);
    expect(kitJson.musicasIdentidad.map((m) => m.nombre)).toEqual(["Obra", "De la agencia"]);
    expect(plan.textos.find((t) => t.ruta === "LEEME.txt").texto).toMatch(/Estilos de edición de sus videos grabados: «Alex en obra»/);
  });
});
