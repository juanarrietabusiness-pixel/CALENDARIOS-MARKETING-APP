import { describe, it, expect, beforeEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { DEFINICIONES_ESTUDIO } from "../../worker/lib/estudio/herramientas.js";
import { DEFINICIONES, NOMBRES } from "../../worker/lib/herramientasServidor.js";
import { EJEMPLO_GUION, formatoParaLaIA } from "../../src/lib/videoFormatoIA.js";
import { validarGuion, COMPONENTES, TIPOS_ESCENA, palabrasDe, textoDeLocucion } from "../../src/lib/videoEscenas.js";

// ============================================================
// El video animado desde Claude (MCP) y el asistente, contra una D1 de verdad
//
// Lo que desbloquea: crear un proyecto, editarlo escena a escena, aprobarlo y, con eso, que generar_locucion pueda
// hacer la voz (hasta ahora el video sólo se creaba desde la pantalla). Lo que no se puede romper:
//   · las mismas reglas que la pantalla: un guion con errores no se guarda y dice cada error con su sitio;
//   · la versión que se leyó: si otra persona cambió el video, no se pisa;
//   · editar después de aprobar lo devuelve a borrador (la voz sólo sale de lo aprobado);
//   · un cliente de otro espacio no existe; nada de esto gasta.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
let db;
let env;
let avisos;

const copia = (x) => JSON.parse(JSON.stringify(x));

beforeEach(() => {
  db = d1EnMemoria();
  avisos = [];
  // El Durable Object del espacio: sólo se apunta lo que se le avisa.
  env = { DB: db, HUB: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { avisos.push(await req.json()); return new Response("ok"); } }) } };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "y");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("nov", "bc", JEFE, "Noviembre 2026", 10, 2026, JSON.stringify([{ date: "2026-11-20", posts: [{ id: "p-reel", format: "reel" }] }]));
});

const mcp = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
/** Llama una herramienta por MCP → { texto, error }. */
async function llamar(nombre, entrada) {
  const r = await mcp().llamar(nombre, entrada);
  return { texto: r.content.map((c) => c.text).join("\n"), error: Boolean(r.isError) };
}
const fila = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);
const idDe = (texto) => /\(ID ([0-9a-f-]{36})\)/.exec(texto)?.[1];

describe("el formato contado a la IA", () => {
  it("sale del mismo vocabulario que valida, y su ejemplo (neutro) valida", () => {
    const v = validarGuion(copia(EJEMPLO_GUION));
    expect(v.ok).toBe(true);
    expect(v.avisos).toEqual([]);
    const t = formatoParaLaIA();
    for (const tipo of Object.keys(COMPONENTES)) expect(t).toContain(`· ${tipo} — `);
    for (const tipo of Object.keys(TIPOS_ESCENA)) expect(t).toContain(`  ${tipo}: `);
    expect(t).toContain(JSON.stringify(EJEMPLO_GUION));
    // Los componentes que el motor todavía no dibuja se dicen.
    // Ya no queda ningún componente que se dibuje como marcador: ninguno lleva la advertencia.
    expect(t).not.toMatch(/MARCADOR/);
    expect(t).toMatch(/telefono — /);
    // Neutro: ningún cliente de la agencia en el ejemplo.
    expect(JSON.stringify(EJEMPLO_GUION)).not.toMatch(/Baby|Caleb|D'CASA|Rofer|toallita/i);
  });

  it("formato_video no pide cliente; las que escriben no son de sólo lectura en el MCP", async () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    expect(por.formato_video.inputSchema.required).toEqual([]);
    for (const n of ["listar_videos", "ver_video"]) {
      expect(por[n].annotations.readOnlyHint).toBe(true);
      expect(por[n].inputSchema.required).toContain("cliente");
    }
    for (const n of ["crear_video", "guardar_video", "editar_escena", "aprobar_video"]) {
      expect(por[n].annotations.readOnlyHint).toBe(false);
      expect(por[n].inputSchema.required).toContain("cliente");
    }
    expect((await llamar("formato_video", {})).texto).toMatch(/^FORMATO DE ESCENAS v1/);
    // El asistente del calendario también las tiene (son las mismas).
    expect(DEFINICIONES.map((d) => d.name)).toEqual(expect.arrayContaining(["crear_video", "aprobar_video"]));
    expect(NOMBRES.has("editar_escena")).toBe(true);
    expect(DEFINICIONES_ESTUDIO.filter((d) => d.name === "ver_video")).toHaveLength(1);
  });
});

describe("crear, editar, aprobar y la voz", () => {
  it("un guion con errores no se crea y dice cada error con su sitio", async () => {
    const malo = copia(EJEMPLO_GUION);
    malo.escenas[0].capas[0].tipo = "holograma";
    malo.escenas[1].fondo.color = "rosa chicle";
    const r = await llamar("crear_video", { cliente: "Baby Caleb", guion: malo });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/escenas\[0\]\.capas\[0\]\.tipo: «holograma» no es un componente/);
    expect(r.texto).toMatch(/escenas\[1\]\.fondo\.color/);
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
  });

  it("crea el borrador ligado a su publicación, avisa al espacio y ver_video dice qué falta y cuándo empieza cada escena", async () => {
    const r = await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION), publicacion_id: "p-reel" });
    expect(r.error).toBe(false);
    const id = idDe(r.texto);
    expect(fila(id)).toMatchObject({ client_id: "bc", calendar_id: "nov", post_id: "p-reel", estado: "borrador", version: 1, titulo: "Tres errores al elegir" });
    // Una publicación que no es del cliente no se liga.
    expect((await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION), publicacion_id: "no-existe" })).texto).toMatch(/No encontré la publicación/);

    const v = (await llamar("ver_video", { cliente: "Baby Caleb", video_id: id })).texto;
    // El aviso al espacio (para que la pantalla abierta se ponga al día) sale sin esperarlo.
    expect(avisos.some((a) => a.tipo === "videos" && a.id === id && /Claude/.test(a.por?.nombre))).toBe(true);
    expect(v).toMatch(/Borrador, versión 1/);
    expect(v).toMatch(/Ligado a la publicación p-reel/);
    expect(v).toMatch(/\(estimada: aún no hay voz\), 3 escenas/);
    expect(v).toMatch(/Siguiente paso: Que la persona revise el guion y lo apruebe/);
    expect(v).toMatch(/1\. e1 · Gancho · 0\.0–/);
    expect(v).toMatch(/Guion \(JSON, versión 1\):\n\{/);
    expect((await llamar("listar_videos", { cliente: "Baby Caleb" })).texto).toContain(`${id} — «Tres errores al elegir» · Borrador · versión 1 · publicación p-reel`);
  });

  it("editar_escena cambia, mueve, añade y quita una sola escena; con una versión vieja no pisa nada", async () => {
    const id = idDe((await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION) })).texto);
    const e2 = { ...copia(EJEMPLO_GUION.escenas[1]), habla: "El primero: mirar sólo el precio." };
    let r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 1, escena: e2 });
    expect(r.texto).toMatch(/Cambiada la escena «e2»\. Ahora es la versión 2/);
    expect(JSON.parse(fila(id).guion).escenas[1].habla).toBe("El primero: mirar sólo el precio.");

    // La versión vieja: no se pisa.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 1, quitar: "e2" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/Otra persona cambió este video/);

    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 2, escena: { id: "e9", tipo: "dato", habla: "Un dato que importa mucho aquí.", capas: [] }, posicion: 2 });
    expect(r.texto).toMatch(/Añadida una escena en la posición 2\. Ahora es la versión 3/);
    expect(JSON.parse(fila(id).guion).escenas.map((e) => e.id)).toEqual(["e1", "e9", "e2", "e3"]);
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 3, escena: JSON.parse(fila(id).guion).escenas[0], posicion: 4 });
    expect(JSON.parse(fila(id).guion).escenas.map((e) => e.id)).toEqual(["e9", "e2", "e3", "e1"]);
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 4, quitar: "e9" });
    expect(r.texto).toMatch(/Quitada la escena «e9»/);
    expect(JSON.parse(fila(id).guion).escenas.map((e) => e.id)).toEqual(["e2", "e3", "e1"]);
    // Una escena que rompe el guion no se guarda.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 5, escena: { id: "e2", tipo: "inventado", habla: "x" } });
    expect(r.error).toBe(true);
    expect(fila(id).version).toBe(5);
    // Quitar una que no existe dice cuáles hay.
    expect((await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 5, quitar: "zz" })).texto).toMatch(/Las que hay: e2, e3, e1/);
  });

  it("editar_escena con «cambios»: varias escenas en UNA versión, en orden y todas o ninguna", async () => {
    const id = idDe((await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION) })).texto);
    let r = await llamar("editar_escena", {
      cliente: "Baby Caleb", video_id: id, version: 1,
      cambios: [
        { id: "e1", cambiar: { habla: "Tres errores que casi todos cometen." } },
        { id: "e3", cambiar: { pantalla: "Elige bien", pausa: 0.4 }, posicion: 1 },
        { escena: { id: "e9", tipo: "dato", habla: "Un dato que importa mucho aquí.", capas: [] } },
        { quitar: "e2" },
      ],
    });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Cambiada la escena «e1» \(habla\)\. Cambiada la escena «e3» \(pantalla, pausa\), ahora es la 1\. Añadida una escena en la posición 4\. Quitada la escena «e2»\. Ahora es la versión 2/);
    const g = JSON.parse(fila(id).guion);
    expect(g.escenas.map((e) => e.id)).toEqual(["e3", "e1", "e9"]);
    expect(g.escenas[1].habla).toBe("Tres errores que casi todos cometen.");
    expect(g.escenas[0]).toMatchObject({ pantalla: "Elige bien", pausa: 0.4 });
    // Lo que no cambia de la escena se queda (sus capas).
    expect(g.escenas[0].capas.length).toBe(EJEMPLO_GUION.escenas[2].capas.length);
    expect(fila(id).version).toBe(2);

    // Uno que falla (el 2.º) no deja nada a medias y dice cuál fue.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 2, cambios: [{ id: "e1", cambiar: { habla: "Otra cosa distinta." } }, { quitar: "zz" }] });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/Cambio 2: No hay ninguna escena «zz»/);
    expect(fila(id).version).toBe(2);
    // Un campo que no se cambia así, o el id.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 2, cambios: [{ id: "e1", cambiar: { id: "otro" } }] });
    expect(r.texto).toMatch(/Cambio 1: «id» no se cambia así/);
    // Un guion que queda roto no se guarda.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 2, cambios: [{ id: "e1", cambiar: { tipo: "inventado" } }] });
    expect(r.error).toBe(true);
    expect(fila(id).version).toBe(2);
    // Sólo moverla, con la forma de uno solo.
    r = await llamar("editar_escena", { cliente: "Baby Caleb", video_id: id, version: 2, id: "e9", posicion: 1 });
    expect(r.texto).toMatch(/Movida la escena «e9» a la posición 1/);
    expect(JSON.parse(fila(id).guion).escenas.map((e) => e.id)).toEqual(["e9", "e3", "e1"]);
  });

  it("aprobar desbloquea generar_locucion; editar después lo devuelve a borrador y la voz ya no se puede", async () => {
    const id = idDe((await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION) })).texto);
    // Sin aprobar, la voz no se puede pedir.
    env.ELEVENLABS_API_KEY = "el-secreta";
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 }));
    expect((await llamar("generar_locucion", { cliente: "Baby Caleb", video_id: id })).texto).toMatch(/guion APROBADO/);

    const a = await llamar("aprobar_video", { cliente: "Baby Caleb", video_id: id, version: 1 });
    expect(a.texto).toMatch(/Guion aprobado \(versión 1\)\. Ya se puede generar la voz/);
    expect(fila(id)).toMatchObject({ estado: "aprobado", aprobada_version: 1, aprobado_por: JEFE });
    // Con voz de serie de ElevenLabs: la primera llamada es SIEMPRE la confirmación con la cifra; nada se crea.
    const voz = await llamar("generar_locucion", { cliente: "Baby Caleb", video_id: id, voz: "XrExE9yKIg1WjnnlVkGX" });
    expect(voz.texto).toMatch(/^NO SE CREÓ NADA\./);
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(0);
    expect((await llamar("ver_video", { cliente: "Baby Caleb", video_id: id })).texto).toMatch(/Siguiente paso: Generar la voz con generar_locucion/);

    // Aprobar otra vez la misma versión no se puede (ya no es borrador).
    expect((await llamar("aprobar_video", { cliente: "Baby Caleb", video_id: id, version: 1 })).texto).toMatch(/sólo se aprueba un borrador/);
    // Editar después de aprobar: versión 2, borrador, y la voz otra vez bloqueada.
    await llamar("guardar_video", { cliente: "Baby Caleb", video_id: id, version: 1, guion: { ...copia(EJEMPLO_GUION), titulo: "Otro título dentro" } });
    expect(fila(id)).toMatchObject({ estado: "borrador", version: 2, aprobada_version: 1 });
    expect((await llamar("generar_locucion", { cliente: "Baby Caleb", video_id: id })).texto).toMatch(/guion APROBADO/);
    // Sólo el título: no cambia la versión ni el estado.
    const t = await llamar("guardar_video", { cliente: "Baby Caleb", video_id: id, version: 2, titulo: "Nuevo nombre" });
    expect(t.texto).toMatch(/versión 2 \(Borrador\)/);
    expect(fila(id)).toMatchObject({ titulo: "Nuevo nombre", version: 2 });
  });

  it("«aprobado» con la voz de esa versión no pide otra locución, y avisa de las palabras que la voz no dijo", async () => {
    const id = idDe((await llamar("crear_video", { cliente: "Baby Caleb", guion: copia(EJEMPLO_GUION) })).texto);
    await llamar("aprobar_video", { cliente: "Baby Caleb", video_id: id, version: 1 });
    const total = palabrasDe(textoDeLocucion(EJEMPLO_GUION)).length;
    // Las dos últimas, sin duración y pegadas al final: la voz se las comió.
    const palabras = Array.from({ length: total }, (_, i) => (i < total - 2 ? { desde: i * 0.4, hasta: i * 0.4 + 0.3 } : { desde: (total - 3) * 0.4 + 0.3, hasta: (total - 3) * 0.4 + 0.3 }));
    db.sqlite.prepare("update videos_proyectos set locucion = ? where id = ?")
      .run(JSON.stringify({ estado: "lista", clave: "clientes/bc/estudio/x.mp3", palabras, version: 1, fuente: "motor", voz: { nombre: "Sarah" }, modelo: "v3", duracion: 10 }), id);
    const t = (await llamar("ver_video", { cliente: "Baby Caleb", video_id: id })).texto;
    expect(t).toMatch(/Ya tiene la locución de esta versión/);
    const dichas = palabrasDe(textoDeLocucion(EJEMPLO_GUION));
    expect(t).toContain(`la voz NO dijo «${dichas.slice(-2).join(" ").replace(/[.,]$/, "")}»`);
  });

  it("personaje_video: sin datos dice cómo es; con ellos lo guarda en el kit (sólo eso) y la vista previa lo usa", async () => {
    expect((await llamar("personaje_video", { cliente: "Baby Caleb" })).texto).toMatch(/no tiene personaje propio/);
    const r = await llamar("personaje_video", { cliente: "Baby Caleb", ropa: "acento", accesorio: "chupete", pelo: "ninguno", nombre: "Caleb" });
    expect(r.texto).toMatch(/Guardado en el kit de Baby Caleb \(«Caleb»\): piel #F3C7A6, sin pelo, ropa acento, accesorio chupete/);
    const kit = JSON.parse(db.sqlite.prepare("select kit_marca from clients where name = 'Baby Caleb'").get().kit_marca);
    expect(kit.personajeVideo).toEqual({ piel: "#F3C7A6", pelo: "", ropa: "acento", accesorio: "chupete", nombre: "Caleb" });
    // Un valor que no vale vuelve al de partida en vez de guardarse.
    await llamar("personaje_video", { cliente: "Baby Caleb", accesorio: "espada" });
    expect(JSON.parse(db.sqlite.prepare("select kit_marca from clients where name = 'Baby Caleb'").get().kit_marca).personajeVideo.accesorio).toBe("ninguno");
  });

  it("un cliente o un video de otro espacio no existen", async () => {
    expect((await llamar("listar_videos", { cliente: "Ajeno" })).texto).toMatch(/No encontré el cliente/);
    const otro = crearHerramientasMCP({ env, acceso: crearAcceso(db, OTRO), usuario: { id: OTRO, nombre: "Otra" } });
    const r = await otro.llamar("crear_video", { cliente: "Ajeno", guion: copia(EJEMPLO_GUION) });
    const ajeno = idDe(r.content[0].text);
    expect((await llamar("ver_video", { cliente: "Baby Caleb", video_id: ajeno })).texto).toMatch(/No encontré ese video/);
  });
});

describe("el ejemplo se dibuja entero", () => {
  it("sólo usa componentes que el motor ya dibuja (nada de marcadores)", async () => {
    const { COMPONENTES_LISTOS } = await import("../../src/lib/motorVideo.js");
    const usados = EJEMPLO_GUION.escenas.flatMap((e) => e.capas.map((c) => c.tipo));
    for (const t of usados) expect(COMPONENTES_LISTOS).toContain(t);
  });
});

describe("E22/E23/D18 · la voz, el léxico y la mascota de la marca, por MCP", () => {
  it("E23 · lexico_de_marca guarda las reglas, el PUT del kit las conserva y se aplican SOLAS al guardar un video", async () => {
    expect((await llamar("lexico_de_marca", { cliente: "Baby Caleb" })).texto).toMatch(/\(ninguna\)/);
    const g = await llamar("lexico_de_marca", { cliente: "Baby Caleb", reglas: [{ di: "fibras de bambú", nunca: ["bambú"] }, { nunca: ["barato"] }] });
    expect(g.error).toBe(false);
    expect(g.texto).toMatch(/di «fibras de bambú», nunca «bambú»/);
    // El PUT del kit entero (otra pestaña, sin el léxico) no se lo lleva.
    const { guardarKit, kitDe } = await import("../../worker/lib/estudio/kit.js");
    const cli = () => db.sqlite.prepare("select * from clients where id = 'bc'").get();
    await guardarKit(env, crearAcceso(db, JEFE), cli(), { estilo: "Cálido" });
    expect(kitDe(cli()).lexico).toEqual([{ di: "fibras de bambú", nunca: ["bambú"] }, { nunca: ["barato"] }]);
    // Un video que dice «bambú» se guarda diciendo «fibras de bambú» (en la voz y en lo que se lee) y avisa de «barato».
    const guion = copia(EJEMPLO_GUION);
    guion.escenas[0].habla = `Pañales de bambú, nada barato. ${guion.escenas[0].habla}`;
    const r = await llamar("crear_video", { cliente: "Baby Caleb", guion });
    expect(r.error).toBe(false);
    const v = JSON.parse(fila(idDe(r.texto)).guion);
    expect(v.escenas[0].habla).toMatch(/^Pañales de fibras de bambú, nada barato\./);
  });

  it("E22 · voz_de_marca dice la voz y, sin llave de voz, no la cambia (lo dice)", async () => {
    expect((await llamar("voz_de_marca", { cliente: "Baby Caleb" })).texto).toMatch(/no tiene voz fijada/);
    const r = await llamar("voz_de_marca", { cliente: "Baby Caleb", voz: "abcdefgh12345678" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/ELEVENLABS_API_KEY|KIE_API_KEY/);
  });

  it("D18 · personaje_video guarda las imágenes de la mascota (sólo de la galería de ESE cliente)", async () => {
    const s = db.sqlite;
    s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)").run("masc1", JEFE, "bc", "clientes/bc/estudio/m.png", "imagen", "image/png");
    s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)").run("ajena", OTRO, "ajeno", "clientes/ajeno/estudio/m.png", "imagen", "image/png");
    const mal = await llamar("personaje_video", { cliente: "Baby Caleb", imagenes: { saluda: "ajena" } });
    expect(mal.error).toBe(true);
    const bien = await llamar("personaje_video", { cliente: "Baby Caleb", imagenes: { saluda: "masc1" } });
    expect(bien.error).toBe(false);
    expect(bien.texto).toMatch(/Mascota propia.*saluda → masc1/);
    const { kitDe } = await import("../../worker/lib/estudio/kit.js");
    expect(kitDe(s.prepare("select * from clients where id = 'bc'").get()).personajeVideo.imagenes).toEqual({ saluda: "masc1" });
  });
});
