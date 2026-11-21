import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { versionVigente } from "../../worker/lib/manualEditor.js";
import { kitDe } from "../../worker/lib/estudio/kit.js";
import { KIT_EDICION } from "../../src/lib/kitEdicionVersion.js";
import { RECETAS_CASA } from "../../src/lib/recetas.js";

// ============================================================
// La GUÍA y el ACTA del editor de video grabado (Fase 4), por el MCP y contra una D1 de verdad
//
// Lo que importa:
//   1. La guía trae el manual del tipo, la marca, los estilos, la lista de control y la versión del kit, y el CONTACTO de
//      la nota «Datos del negocio» avisando de lo que no coincide (decisión 10: Rofer, 61562010 frente a 6086-6581).
//   2. El acta guarda y propone; nada se aplica sin confirmado; una general sin orden no entra; aplicar es exacto.
//   3. Aplicar una general crea una versión nueva del manual; una de la marca cambia (o crea) su estilo.
//   4. Un colaborador no propone ni aplica lo general.
// ============================================================

const ANA = "u-ana";
const ADMIN = { id: ANA, nombre: "Ana", rol: "admin" };
const ROFER = JSON.parse(readFileSync(new URL("../../docs/estilos-edicion/rofer-alex-en-obra.json", import.meta.url), "utf8"));
let db;
let env;
let acceso;

function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, ANA, "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, instagram, whatsapp, kit_marca) values (?,?,?,?,?,?)").run("c1", ANA, "Rofer Service", "roferservice", "61562010", JSON.stringify({
    paleta: [{ hex: "#0B2545", nombre: "Marino", rol: "fondo" }], estilosEdicion: [{ ...ROFER, id: "ee-rofer00001" }],
  }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Baby Caleb");
  const nota = (id, ruta, titulo, texto) => s.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto) values (?,?,?,?,?,?)").run(id, ANA, "c1", ruta, titulo, texto);
  nota("n1", "brand-guidelines/datos-del-negocio", "Brand guidelines — Datos del negocio", "WhatsApp: +507 6086-6581. Instagram @roferservice.");
  nota("n2", "ficha-tecnica", "Ficha técnica", "- WhatsApp: 61562010 [[brand-guidelines/datos-del-negocio]]");
}

const llamar = async (nombre, args, usuario = ADMIN) => {
  const r = await crearHerramientasMCP({ env, acceso, usuario }).llamar(nombre, args);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
};
const propuestas = () => db.sqlite.prepare("select * from edicion_propuestas order by created_at, rowid").all();
const ids = (texto) => [...texto.matchAll(/\[(pe-[a-z0-9]+)\]/g)].map((m) => m[1]);
const cliente = (id = "c1") => db.sqlite.prepare("select * from clients where id = ?").get(id);

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => ({ size: 1 }), get: async () => null, put: async () => {}, delete: async () => {} } };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("guia_de_edicion", () => {
  it("sólo lee y, sin tipo, pide reconocerlo primero", async () => {
    expect(HERRAMIENTAS_MCP.find((h) => h.name === "guia_de_edicion").annotations.readOnlyHint).toBe(true);
    const r = await llamar("guia_de_edicion", { cliente: "Rofer" });
    expect(r.texto).toMatch(/TIPOS DE VIDEO \(reconoce el tuyo/);
  });

  it("con el tipo: el manual del tipo, la marca, el estilo, el control y el kit; el contacto de la nota con sus avisos", async () => {
    const r = await llamar("guia_de_edicion", { cliente: "Rofer", tipo: "persona-a-camara" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/## TIPO: PERSONA A CÁMARA/);
    expect(r.texto).toMatch(/Colores: #0B2545 \(fondo\)/);
    expect(r.texto).toMatch(/CONTACTO para el video \(de la nota «Brand guidelines — Datos del negocio»\): WhatsApp \+507 6086-6581 · @roferservice/);
    expect(r.texto).toMatch(/OJO: La Ficha técnica dice 61562010/);
    expect(r.texto).toMatch(/OJO: El WhatsApp de la ficha del cliente \(61562010\)/);
    expect(r.texto).toMatch(/«Alex en obra» \[ee-rofer00001\]/);
    expect(r.texto).toMatch(/## ANTES DE ENTREGAR/);
    expect(r.texto).toContain(`Versión vigente: ${KIT_EDICION.version}`);
    expect(r.texto.length).toBeLessThan(16_000);
  });
});

describe("acta_de_edicion", () => {
  const ACTA = { tipo: "persona-a-camara", kit_version: KIT_EDICION.version, resumen: { duracion: 40.1, lufs: -14 } };

  it("guarda el acta y propone; la general sin orden no entra; nada se aplica solo", async () => {
    const r = await llamar("acta_de_edicion", {
      cliente: "Rofer", acta: ACTA, correcciones: [
        { alcance: "general", parte: "comun.sonido", operacion: "anadir", texto: "La música se tiene que oír por debajo de la voz.", cita: "La música prácticamente ni se escucha" },
        { alcance: "general", parte: "tipos.persona-a-camara", operacion: "anadir", texto: "Sin modo celular ni candado si el video no los tiene.", cita: "eso debe pasar en todos los videos" },
        { alcance: "marca", parte: "piezas.lista", operacion: "cambiar", antes: "ARRIBA", texto: "ARRIBA, con aire sobre el casco", cita: "casi tapa la cara" },
      ],
    });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Acta guardada/);
    expect(r.texto).toMatch(/corrección 1: Como GENERAL necesita una orden/);
    const [general, marca] = ids(r.texto);
    expect(r.texto).toMatch(new RegExp(`\\[${general}\\] En el MANUAL .*AÑADIR: «Sin modo celular`));
    expect(r.texto).toMatch(new RegExp(`\\[${marca}\\] En el ESTILO de la marca, «piezas.lista»: CAMBIAR «ARRIBA» POR`));
    expect(propuestas().map((p) => [p.destino, p.estado, p.client_id])).toEqual([["manual", "pendiente", null], ["estilo", "pendiente", "c1"]]);
    // Y a la campana de los demás del espacio (quien editó ya las ve en el chat): aquí no hay nadie más, así que ninguno.
    expect(db.sqlite.prepare("select count(*) as n from avisos").get().n).toBe(0);
    db.sqlite.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-bruno", "b@a.com", "x", "x");
    db.sqlite.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-bruno", ANA, "editor", "Bruno", "#FF0000");
    await llamar("acta_de_edicion", { cliente: "Rofer", acta: ACTA, correcciones: [
      { alcance: "marca", parte: "notas", operacion: "anadir", texto: "Más aire sobre el casco.", cita: "pegados al personaje" },
    ] });
    const aviso = db.sqlite.prepare("select * from avisos").get();
    expect(aviso).toMatchObject({ user_id: "u-bruno", tipo: "edicion", enlace: "/cliente/c1/marca/kit" });
    expect(aviso.texto).toMatch(/Claude propone aprender de la edición de Rofer Service: 1 para el estilo de Rofer Service/);

    const sin = await llamar("acta_de_edicion", { cliente: "Rofer", aplicar: [general, marca] });
    expect(sin.texto).toMatch(/NO SE HA APLICADO NADA/);
    expect(await versionVigente(acceso)).toBeNull();
    expect((await llamar("acta_de_edicion", { cliente: "Rofer" })).texto).toMatch(/ESPERAN EL SÍ/);
  });

  it("con el sí: la general es una versión nueva del manual y la de la marca cambia su estilo; dos veces, no", async () => {
    const r = await llamar("acta_de_edicion", {
      cliente: "Rofer", acta: ACTA, correcciones: [
        { alcance: "general", parte: "tipos.persona-a-camara", operacion: "anadir", texto: "Sin modo celular ni candado si el video no los tiene.", cita: "eso debe pasar en todos los videos" },
        { alcance: "marca", parte: "piezas.lista", operacion: "cambiar", antes: "ARRIBA", texto: "ARRIBA, con aire sobre el casco", cita: "casi tapa la cara" },
      ],
    });
    const [general, marca] = ids(r.texto);
    const a = await llamar("acta_de_edicion", { cliente: "Rofer", aplicar: [general, marca], confirmado: true });
    expect(a.texto).toMatch(new RegExp(`${general}: aplicada \\(manual, versión 1\\)`));
    expect(a.texto).toMatch(new RegExp(`${marca}: aplicada \\(estilo «Alex en obra»\\)`));
    const v = await versionVigente(acceso);
    expect(v.partes["tipos.persona-a-camara"]).toMatch(/\nSin modo celular ni candado si el video no los tiene\.$/);
    expect(v.motivo).toMatch(general);
    expect(kitDe(cliente()).estilosEdicion[0].piezas.lista).toMatch(/ARRIBA, con aire sobre el casco: nunca/);
    expect((await llamar("acta_de_edicion", { cliente: "Rofer", aplicar: [general], confirmado: true })).texto).toMatch(/ya estaba aplicada/);

    // Lo mismo otra vez: ya lo dice.
    const otra = await llamar("acta_de_edicion", { cliente: "Rofer", acta: ACTA, correcciones: [
      { alcance: "general", parte: "tipos.persona-a-camara", operacion: "anadir", texto: "Sin modo celular ni candado si el video no los tiene.", cita: "siempre" },
    ] });
    expect(otra.texto).toMatch(/Eso ya lo dice/);
  });

  it("lo de la marca sin estilo crea uno al aplicarse; descartar; y un colaborador no toca lo general", async () => {
    const r = await llamar("acta_de_edicion", { cliente: "Baby Caleb", acta: ACTA, correcciones: [
      { alcance: "marca", operacion: "anadir", texto: "Los textos un poco más arriba.", cita: "pudieron quedar un poquitito más arriba" },
      { alcance: "marca", parte: "gancho", operacion: "anadir", texto: "El producto en la mano desde el cuadro 0.", cita: "que se vea el producto" },
    ] });
    expect(r.texto).toMatch(/Baby Caleb no tiene estilo de edición para este tipo: al aplicar lo de la marca se crea uno/);
    const [notas, gancho] = ids(r.texto);
    await llamar("acta_de_edicion", { cliente: "Baby Caleb", aplicar: [notas], confirmado: true });
    const [e] = kitDe(cliente("c2")).estilosEdicion;
    expect(e).toMatchObject({ nombre: "Baby Caleb · persona-a-camara", tipo: "persona-a-camara", notas: "Los textos un poco más arriba." });
    expect((await llamar("acta_de_edicion", { cliente: "Baby Caleb", descartar: [gancho] })).texto).toMatch(/descartada/);

    const colaborador = { id: ANA, nombre: "Ana", rol: "editor", clientes: ["c1"] };
    const c = await llamar("acta_de_edicion", { cliente: "Rofer", acta: ACTA, correcciones: [
      { alcance: "general", parte: "comun.textos", operacion: "anadir", texto: "Nunca textos inclinados.", cita: "nunca" },
    ] }, colaborador);
    expect(c.texto).toMatch(/la propone quien la lleva entera/);
  });

  it("el acta dice qué falta y comprueba lo que nombra", async () => {
    expect((await llamar("acta_de_edicion", { cliente: "Rofer", acta: { tipo: "baile" } })).texto).toMatch(/acta\.tipo/);
    expect((await llamar("acta_de_edicion", { cliente: "Rofer", acta: { ...ACTA, archivo_id: "nada" } })).texto).toMatch(/no está en la galería/);
    expect((await llamar("acta_de_edicion", { cliente: "Rofer", acta: { ...ACTA, estilo_id: "ee-otro000001" } })).texto).toMatch(/no es de Rofer/);
  });
});

describe("la receta premium y la rápida", () => {
  it("editar-video-grabado es la premium (muestras antes, acta al final) y montaje-ugc dice que es la rápida", () => {
    const premium = RECETAS_CASA.find((r) => r.id === "editar-video-grabado");
    expect(premium.instrucciones).toMatch(/guia_de_edicion/);
    expect(premium.instrucciones).toMatch(/CUADROS DE MUESTRA/);
    expect(premium.instrucciones).toMatch(/NUNCA la compongas/);
    expect(premium.instrucciones).toMatch(/acta_de_edicion/);
    expect(premium.instrucciones.length).toBeLessThanOrEqual(5000);
    expect(RECETAS_CASA.find((r) => r.id === "montaje-ugc").descripcion).toMatch(/RÁPIDO.*editar-video-grabado/);
  });
});
