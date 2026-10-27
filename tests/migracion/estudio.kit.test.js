import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El kit de marca del Estudio: guardar, preparar con la IA y revisar
//
// Lo que importa:
//   1. El logo es una imagen de ESTE cliente que existe: la clave llega del
//      navegador y no se cree.
//   2. Preparar lee el cerebro con `para: "imagen"` —nunca lo interno— y NO
//      guarda: devuelve una propuesta que una persona revisa.
//   3. Revisar MIRA la imagen (va como imagen, no como texto) con el kit delante.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(texto) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return flujo(texto);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      const bytes = typeof o.bytes === "string" ? new TextEncoder().encode(o.bytes) : o.bytes;
      return { httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) { objetos.set(clave, { bytes: typeof valor === "string" ? valor : new Uint8Array(valor), tipo: op?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Otro");
  // El cerebro: su identidad visual y una nota interna que no puede salir.
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Identidad visual", texto: "Paleta azul marino y arena; fotografía cálida con luz natural; nunca fondos negros.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del sofá es de 200 dólares y el margen del 40 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const kitGuardado = () => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = 'c1'").get().kit_marca ?? "null");

describe("guardar el kit", () => {
  it("sin kit, la galería trae uno vacío", async () => {
    const r = await (await pedir("/api/estudio/c1")).json();
    expect(r.kit).toMatchObject({ paleta: [], presets: {}, logo: "" });
  });

  it("el logo tiene que ser una imagen de este cliente y existir", async () => {
    env.MEDIA.objetos.set("clientes/c2/logo.png", { bytes: PNG, tipo: "image/png" });
    let res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { logo: "clientes/c2/logo.png" } } });
    expect(res.status).toBe(400);
    res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { logo: "clientes/c1/no-existe.png" } } });
    expect(res.status).toBe(404);
    env.MEDIA.objetos.set("clientes/c1/estudio/logo.png", { bytes: PNG, tipo: "image/png" });
    res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: {
      logo: "/api/media/clientes/c1/estudio/logo.png", tipografia: "Montserrat",
      paleta: [{ hex: "#1b3246", rol: "estructura" }, { hex: "azul" }], presets: { producto: "Mi preset." },
    } } });
    expect(res.status).toBe(200);
    expect(kitGuardado()).toMatchObject({ logo: "clientes/c1/estudio/logo.png", tipografia: "Montserrat", paleta: [{ hex: "#1B3246", rol: "estructura" }], presets: { servicios: "Mi preset." } });
    expect((await (await pedir("/api/estudio/c1")).json()).kit.logo).toBe("clientes/c1/estudio/logo.png");
  });

  it("la referencia visual de cada tipo: sólo claves de este cliente", async () => {
    const res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: {
      referencias: { anuncio: ["clientes/c1/estudio/a.jpg", "clientes/c2/estudio/ajena.jpg"], educativo: ["clientes/c2/x.jpg"] },
    } } });
    expect(res.status).toBe(200);
    expect(kitGuardado().referencias).toEqual({ anuncio: ["clientes/c1/estudio/a.jpg"] });
  });

  it("el modelo fijado del cliente: sólo uno que exista y sea de ese tipo", async () => {
    const res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { modelos: { imagen: "seedream-4", video: "nano-banana" } } } });
    expect(res.status).toBe(200);
    expect(kitGuardado().modelos).toEqual({ imagen: "seedream-4" });
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { modelos: { imagen: "no-existe" } } } });
    expect(kitGuardado().modelos).toEqual({});
  });

  it("«Guardar como regla» suma al kit GUARDADO, sin repetir y con tope", async () => {
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { tipografia: "Montserrat", logoModo: "estampado", logoPosicion: { esquina: "arriba-izquierda" } } } });
    let res = await pedir("/api/estudio/c1/kit/reglas", { method: "POST", body: { regla: "  El texto ocupa como mucho un tercio.  " } });
    expect(res.status).toBe(200);
    await pedir("/api/estudio/c1/kit/reglas", { method: "POST", body: { regla: "el texto ocupa como mucho un tercio" } });
    expect(kitGuardado()).toMatchObject({ tipografia: "Montserrat", reglas: ["El texto ocupa como mucho un tercio"], logoModo: "estampado", logoPosicion: { esquina: "arriba-izquierda" } });
    expect((await pedir("/api/estudio/c1/kit/reglas", { method: "POST", body: { regla: " " } })).status).toBe(400);
    for (let i = 1; i < 12; i++) await pedir("/api/estudio/c1/kit/reglas", { method: "POST", body: { regla: `Regla ${i}` } });
    expect(kitGuardado().reglas).toHaveLength(12);
    res = await pedir("/api/estudio/c1/kit/reglas", { method: "POST", body: { regla: "Una de más" } });
    expect(res.status).toBe(409);
  });

  it("la ficha guardada desde el cliente no pisa el kit", async () => {
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { tipografia: "Montserrat" } } });
    await pedir("/api/clientes/c1", { method: "PUT", body: { name: "Dcasa", industry: "Muebles" } });
    expect(kitGuardado()).toMatchObject({ tipografia: "Montserrat" });
  });
});

describe("preparar con la IA", () => {
  it("lee el cerebro sin lo interno, propone y no guarda", async () => {
    anthropic('Listo: {"paleta":[{"hex":"#1E2A5A","nombre":"azul marino","rol":"dominante"}],"tipografia":"","estilo":"cálido","luz":"natural","evitar":"nunca fondos negros","presets":{"anuncio":"A","beneficios":"B","servicios":"P","educativo":"E","diferenciador":"D","maletas":"M","humano":"H","corporativo":"no"},"dudas":"no hay tipografía"}');
    const res = await pedir("/api/estudio/c1/kit/preparar", { method: "POST" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.kit.paleta[0]).toMatchObject({ hex: "#1E2A5A", rol: "dominante" });
    expect(r.kit.presets).toEqual({ anuncio: "A", beneficios: "B", servicios: "P", educativo: "E", diferenciador: "D", maletas: "M", humano: "H" });
    expect(r.dudas).toBe("no hay tipografía");
    expect(r.conCerebro).toBe(true);
    const enviado = textoDe(peticiones[0]);
    expect(enviado).toContain("Paleta azul marino y arena");
    expect(enviado).not.toContain("margen del 40");
    expect(kitGuardado()).toBeNull();
  });
});

describe("revisar una pieza", () => {
  async function conImagen() {
    env.MEDIA.objetos.set("clientes/c1/estudio/a.png", { bytes: PNG, tipo: "image/png" });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
      .run("a1", JEFE, "c1", "clientes/c1/estudio/a.png", "imagen", "image/png", "Un sofá en la sala");
  }

  it("sin kit, primero hay que prepararlo", async () => {
    await conImagen();
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(409);
  });

  it("la IA mira la imagen con el kit delante y dice qué falla", async () => {
    await conImagen();
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { paleta: [{ hex: "#1E2A5A", nombre: "azul", rol: "dominante" }], estilo: "cálido" } } });
    anthropic('{"puntaje":6,"cumple":["luz cálida"],"falla":["aparece rojo fuera de la paleta"],"sugerencia":"sin rojo"}');
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ puntaje: 6, falla: ["aparece rojo fuera de la paleta"], sugerencia: "sin rojo" });
    const bloques = peticiones[0].messages[0].content;
    expect(bloques[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(textoDe(peticiones[0])).toContain("azul #1E2A5A (dominante)");
    expect(textoDe(peticiones[0])).toContain("Lo que se pidió: Un sofá en la sala");
  });

  it("la imagen de una publicación se revisa por su ruta, aunque no esté en la galería; la de otro cliente, no", async () => {
    env.MEDIA.objetos.set("clientes/c1/banco/post.png", { bytes: PNG, tipo: "image/png" });
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { paleta: [{ hex: "#1E2A5A", nombre: "azul", rol: "dominante" }] } } });
    anthropic('{"puntaje":9,"cumple":["paleta"],"falla":[],"sugerencia":""}');
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "/api/media/clientes/c1/banco/post.png" } });
    expect(res.status).toBe(200);
    expect((await res.json()).puntaje).toBe(9);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c2/banco/post.png" } })).status).toBe(400);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c1/../c2/x.png" } })).status).toBe(400);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c1/no-existe.png" } })).status).toBe(404);
  });

  it("una imagen de otro cliente no se revisa", async () => {
    await conImagen();
    const res = await pedir("/api/estudio/c2/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(404);
  });
});

describe("el control de calidad de una pieza", () => {
  const LINEA_LOGO = "Una de las imágenes de referencia es el logo de la marca: si aparece en la pieza, cópialo tal cual (forma, colores y letras), sin redibujarlo ni inventar otro.";
  async function pieza(prompt) {
    env.MEDIA.objetos.set("clientes/c1/estudio/p.png", { bytes: PNG, tipo: "image/png" });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
      .run("p1", JEFE, "c1", "clientes/c1/estudio/p.png", "imagen", "image/png", prompt);
  }

  it("la IA MIRA la imagen con el texto que debía decir y los precios del catálogo; el código compara y lo apunta en la ficha", async () => {
    await pieza(`Escena: una sala\n\nTexto en la imagen, exacto, legible y bien jerarquizado (lo primero grande): "Sofá cama" / "$399".\n\n${LINEA_LOGO}`);
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    // La IA dice que está bien, pero lee «Sofa cmaa»: el código lo caza.
    anthropic('{"textoLeido":"Sofa cmaa $399","errores":[],"precios":[],"logo":"bien","deformaciones":[],"puntaje":9}');
    const res = await pedir("/api/estudio/c1/archivos/p1/control", { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const { control, archivo } = await res.json();
    expect(control).toMatchObject({ estado: "revisar", soloTexto: true, texto: "Sofá cama\n$399", logo: "bien" });
    expect(control.errores).toEqual([{ esperado: "sofá", escrito: "sofa" }, { esperado: "cama", escrito: "cmaa" }]);
    expect(archivo.ajustes.control.estado).toBe("revisar");
    const bloques = peticiones[0].messages[0].content;
    expect(bloques[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/DEBÍA decir \(exacto\): "Sofá cama \$399"/);
    expect(t).toMatch(/precios válidos son los del catálogo: \$399/);
    expect(t).toMatch(/debía llevar el logo de Dcasa/);
    // Queda en la ficha: la galería la marca sin volver a preguntar.
    const g = await (await pedir("/api/estudio/c1")).json();
    expect(g.archivos.find((a) => a.id === "p1").ajustes.control.estado).toBe("revisar");
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("control de calidad");
  });

  it("el texto que manda la pantalla gana; una pieza de otro cliente o un video no se controlan", async () => {
    await pieza("Escena: una sala");
    anthropic('{"textoLeido":"Duerme mejor","logo":"no aplica"}');
    const { control } = await (await pedir("/api/estudio/c1/archivos/p1/control", { method: "POST", body: { texto: "Duerme mejor" } })).json();
    expect(control).toMatchObject({ estado: "ok", texto: "Duerme mejor" });
    expect((await pedir("/api/estudio/c2/archivos/p1/control", { method: "POST", body: {} })).status).toBe(404);
    db.sqlite.prepare("update estudio_archivos set tipo = 'video', mime = 'video/mp4' where id = 'p1'").run();
    expect((await pedir("/api/estudio/c1/archivos/p1/control", { method: "POST", body: {} })).status).toBe(400);
  });
});

describe("el sistema de diseño de la portada de un carrusel", () => {
  const SISTEMA = '{"titular":{"tamano":"≈9 % del alto","peso":"extra negrita","mayusculas":true,"color":"#ffffff"},"zonaTexto":"tercio superior","margenes":"≈6 % del ancho","fondo":"foto a sangre","colores":["#1b3246"],"elementos":[],"logo":"no lleva"}';
  async function portada() {
    env.MEDIA.objetos.set("clientes/c1/estudio/p.png", { bytes: PNG, tipo: "image/png" });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
      .run("p1", JEFE, "c1", "clientes/c1/estudio/p.png", "imagen", "image/png", "Lámina 1 de 4");
  }

  it("la IA mira la portada, escribe el sistema y queda en la ficha; la segunda vez no se paga", async () => {
    await portada();
    anthropic(SISTEMA);
    const res = await pedir("/api/estudio/c1/archivos/p1/sistema", { method: "POST", body: { texto: "3 errores" } });
    expect(res.status).toBe(200);
    const { sistema } = await res.json();
    expect(sistema).toMatchObject({ zonaTexto: "tercio superior", colores: ["#1b3246"] });
    expect(peticiones[0].messages[0].content[0]).toMatchObject({ type: "image" });
    expect(textoDe(peticiones[0])).toMatch(/PORTADA aprobada[\s\S]*"3 errores"/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("sistema de diseño");
    anthropic("{}");
    const otra = await (await pedir("/api/estudio/c1/archivos/p1/sistema", { method: "POST", body: {} })).json();
    expect(otra.sistema.zonaTexto).toBe("tercio superior");
    expect(peticiones).toHaveLength(0);
    expect((await pedir("/api/estudio/c2/archivos/p1/sistema", { method: "POST", body: {} })).status).toBe(404);
  });

  it("el control de una lámina recibe el sistema y dice lo que se sale de la serie", async () => {
    await portada();
    anthropic('{"textoLeido":"Error 1","serie":["el titular es la mitad de grande"],"logo":"no aplica"}');
    const { control } = await (await pedir("/api/estudio/c1/archivos/p1/control", { method: "POST", body: { texto: "Error 1", sistema: JSON.parse(SISTEMA) } })).json();
    expect(control).toMatchObject({ estado: "revisar", serie: ["el titular es la mitad de grande"] });
    expect(textoDe(peticiones[0])).toMatch(/SISTEMA DE DISEÑO DE LA SERIE[\s\S]*tercio superior/);
  });
});

describe("las plantillas del kit («Guardar como plantilla»)", () => {
  const SISTEMA = '{"titular":{"tamano":"≈9 % del alto","peso":"extra negrita","mayusculas":true,"color":"#ffffff"},"zonaTexto":"tercio superior","fondo":"placa azul","colores":["#1340b1"],"elementos":[],"logo":"abajo a la derecha"}';
  async function buena(id = "b1", cliente = "c1") {
    env.MEDIA.objetos.set(`clientes/${cliente}/estudio/${id}.png`, { bytes: PNG, tipo: "image/png" });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
      .run(id, JEFE, cliente, `clientes/${cliente}/estudio/${id}.png`, "imagen", "image/png", "Oferta con placa azul");
  }
  const guardar = (datos, cliente = "c1") => pedir(`/api/estudio/${cliente}/kit/plantillas`, { method: "POST", body: datos });

  it("la IA mira la pieza una vez, escribe su sistema y la pieza pasa al kit con su nombre y su uso", async () => {
    await buena();
    anthropic(SISTEMA);
    const res = await guardar({ archivoId: "b1", nombre: "Oferta azul", uso: "post" });
    expect(res.status).toBe(201);
    const { plantilla, kit } = await res.json();
    expect(plantilla).toMatchObject({ nombre: "Oferta azul", uso: "post", clave: "clientes/c1/estudio/b1.png", archivoId: "b1" });
    expect(plantilla.id).toMatch(/^plantilla-[a-z0-9-]+$/);
    expect(plantilla.sistema).toMatch(/tercio superior/);
    expect(kit.plantillas).toHaveLength(1);
    expect(kitGuardado().plantillas[0].id).toBe(plantilla.id);
    expect(textoDe(peticiones[0])).toMatch(/la agencia la guarda como PLANTILLA/);
    // Guardarla otra vez no la duplica ni vuelve a pagar el análisis.
    anthropic("{}");
    const otra = await (await guardar({ archivoId: "b1", nombre: "Oferta azul 2" })).json();
    expect(otra.kit.plantillas).toHaveLength(1);
    expect(otra.plantilla.nombre).toBe("Oferta azul 2");
    expect(peticiones).toHaveLength(0);
  });

  it("una pieza de otro cliente no se guarda; quitarla deja la imagen en la galería", async () => {
    await buena("b2", "c2");
    anthropic(SISTEMA);
    expect((await guardar({ archivoId: "b2" })).status).toBe(404);
    await buena();
    const { plantilla } = await (await guardar({ archivoId: "b1" })).json();
    const res = await pedir(`/api/estudio/c1/kit/plantillas/${plantilla.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(kitGuardado().plantillas).toEqual([]);
    expect(db.sqlite.prepare("select count(*) as n from estudio_archivos where id = 'b1'").get().n).toBe(1);
  });

  it("el kit no acepta una plantilla con la imagen de otro cliente (la clave llega del navegador)", async () => {
    const res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { plantillas: [{ id: "plantilla-x", nombre: "Ajena", clave: "clientes/c2/estudio/z.png" }] } } });
    expect(res.status).toBe(200);
    expect(kitGuardado().plantillas).toEqual([]);
  });
});

describe("la fuente de la marca", () => {
  const subir = (bytes, nombre = "Montserrat-Bold.woff2") => {
    const form = new FormData();
    form.set("archivo", new File([bytes], nombre));
    return worker.fetch(new Request("https://calendarios.test/api/estudio/c1/kit/fuente", { method: "POST", body: form, headers: { Cookie: `${COOKIE}=${TESTIGO}` } }), env);
  };

  it("se reconoce por sus bytes y va a fuentes/ del cliente; lo que no es una fuente, no", async () => {
    const res = await subir(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]));
    expect(res.status).toBe(201);
    const { clave, nombre } = await res.json();
    expect(clave).toMatch(/^clientes\/c1\/fuentes\/[\w-]+\.woff2$/);
    expect(nombre).toBe("Montserrat Bold");
    expect(env.MEDIA.objetos.get(clave).tipo).toBe("font/woff2");
    expect((await subir(PNG, "x.ttf")).status).toBe(415);
  });

  it("el kit guarda la fuente sólo con el archivo y la muestra de ESTE cliente; volver a preparar no se la lleva", async () => {
    env.MEDIA.objetos.set("clientes/c1/fuentes/f.ttf", { bytes: new Uint8Array([0, 1, 0, 0]), tipo: "font/ttf" });
    env.MEDIA.objetos.set("clientes/c1/estudio/muestra.png", { bytes: PNG, tipo: "image/png" });
    const bien = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { estilo: "cálido", fuente: { clave: "clientes/c1/fuentes/f.ttf", nombre: "Montserrat", muestra: "clientes/c1/estudio/muestra.png" } } } });
    expect(bien.status).toBe(200);
    expect(kitGuardado().fuente).toEqual({ clave: "clientes/c1/fuentes/f.ttf", nombre: "Montserrat", muestra: "clientes/c1/estudio/muestra.png" });
    const ajena = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { fuente: { clave: "clientes/c2/fuentes/f.ttf", muestra: "clientes/c1/estudio/muestra.png" } } } });
    expect(ajena.status).toBe(400);
    const sinArchivo = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { fuente: { clave: "clientes/c1/fuentes/no.ttf", muestra: "clientes/c1/estudio/muestra.png" } } } });
    expect(sinArchivo.status).toBe(400);
  });
});

// ------------------------------------------------------------
// Lo que el kit aprende de los «Me gusta» y la papelera
// ------------------------------------------------------------

describe("POST /api/estudio/<cliente>/kit/aprender", () => {
  const archivo = (id, { favorito = 0, borrado = null, subido = 0, cliente = "c1", tipo = "imagen", mime = "image/png" } = {}) => {
    const clave = `clientes/${cliente}/estudio/${id}.png`;
    env.MEDIA.objetos.set(clave, { bytes: PNG, tipo: mime });
    db.sqlite.prepare(`insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, bytes, prompt, favorito, subido, borrado_at)
      values (?,?,?,?,?,?,?,?,?,?,?)`).run(id, JEFE, cliente, clave, tipo, mime, PNG.length, `Escena: pieza ${id}`, favorito, subido, borrado);
  };
  const aprender = () => pedir("/api/estudio/c1/kit/aprender", { method: "POST", body: {} });
  const imagenes = (p) => p.messages[0].content.filter((b) => b.type === "image").length;

  it("con menos de tres «Me gusta» no llama a la IA y dice cuántas faltan", async () => {
    anthropic("x");
    archivo("a1", { favorito: 1 });
    archivo("a2", { favorito: 1 });
    archivo("x1", { favorito: 1, cliente: "c2" }); // de otro cliente: no cuenta
    const res = await aprender();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/al menos 3 .*llevas 2/);
    expect(peticiones).toHaveLength(0);
  });

  it("MIRA lo que gustó y lo descartado, y propone sólo lo respaldado; no guarda nada", async () => {
    anthropic([
      "GUSTA | fondos claros con mucha luz natural | G1, G2, G3",
      "GUSTA | una sola imagen no es regla | G1",
      "EVITAR | texto grande en la parte de arriba | D1, G9",   // G9 no existe: sólo queda D1
      "EVITAR | fondos oscuros y recargados | D1, G2",
      "GUSTA | inventada | G7, G8",
    ].join("\n"));
    for (const id of ["g1", "g2", "g3"]) archivo(id, { favorito: 1 });
    archivo("d1", { borrado: "2026-10-01T00:00:00.000Z" });
    archivo("s1", { borrado: "2026-10-01T00:00:00.000Z", subido: 1 }); // subida a mano: no es del motor
    archivo("v1", { favorito: 1, tipo: "video", mime: "video/mp4" }); // un video no se manda
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { estilo: "cálido" } } });
    const res = await aprender();
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.vistas).toEqual({ gustan: 3, descartadas: 1 });
    expect(r.reglas).toEqual([
      { texto: "fondos claros con mucha luz natural", tipo: "gusta", respaldo: ["G1", "G2", "G3"] },
      { texto: "fondos oscuros y recargados", tipo: "evitar", respaldo: ["D1", "G2"] },
    ]);
    expect(imagenes(peticiones[0])).toBe(4);
    expect(textoDe(peticiones[0])).toMatch(/EL KIT YA DICE:\n· estilo: cálido/);
    expect(textoDe(peticiones[0])).toMatch(/G1: pieza /);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("aprendizaje visual");
    expect(kitGuardado().aprendido).toEqual([]);
  });

  it("lo aceptado va al kit con PUT y sale en el bloque de la marca de toda pieza", async () => {
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { estilo: "cálido", aprendido: [{ texto: "fondos claros", tipo: "gusta" }, { texto: "texto arriba", tipo: "evitar" }] } } });
    expect(kitGuardado().aprendido).toEqual([{ texto: "fondos claros", tipo: "gusta" }, { texto: "texto arriba", tipo: "evitar" }]);
    // Volver a preparar el kit con la IA no se lleva lo aprendido.
    anthropic(JSON.stringify({ kit: { estilo: "otro estilo", paleta: [{ hex: "#112233" }] } }));
    const prop = await (await pedir("/api/estudio/c1/kit/preparar", { method: "POST" })).json();
    const { fundirKit } = await import("../../src/lib/kitMarca.js");
    expect(fundirKit(kitGuardado(), prop.kit ?? {}).aprendido).toHaveLength(2);
  });
});
