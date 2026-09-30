import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { LIMITES, DEFINICIONES_ESTUDIO } from "../../worker/lib/estudio/herramientas.js";
import { crearEjecutor, DEFINICIONES, NOMBRES } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { MODELOS, estimar, pideConfirmar } from "../../src/lib/estudioCatalogo.js";
import { USOS, fueraDeUso } from "../../worker/lib/cerebro/cerebro.js";

// ============================================================
// El Estudio desde el asistente y desde Claude (MCP), contra una D1 de verdad
//
// Lo que importa, por orden de gravedad:
//
//   1. No se gasta sin el segundo toque: un pedido caro NO se crea hasta que llega
//      `confirmado: true`, y sólo el booleano `true` cuenta.
//   2. Una imagen de apoyo se pide por id de la GALERÍA de ESE cliente: la de otro
//      cliente, la que está en la papelera o un archivo que no es imagen se rechazan.
//   3. Nada de otro espacio: ni cliente ni pedido.
//   4. La guía visual sale del cerebro SIN las notas internas (costos, márgenes): es
//      lo que se le enseña al modelo para que escriba un prompt que sale a un proveedor.
//   5. Un ejecutor sin `estudio` (el de las consultas del MCP) no puede gastar.
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const USUARIO = { id: ANA, nombre: "Ana" };
const POR = { userId: ANA, nombre: "Ana", color: "#1E90FF", tab: null };

let db;
let env;
let acceso;
let objetos;

/** R2 de mentira que guarda de verdad: el cerebro escribe su índice, y las imágenes de apoyo se comprueban con `head`. */
function r2() {
  objetos = new Map();
  const bytesDe = async (valor) => (typeof valor === "string" ? new TextEncoder().encode(valor) : valor instanceof Uint8Array ? valor : new Uint8Array(await new Response(valor).arrayBuffer()));
  return {
    async head(clave) { return objetos.has(clave) ? { size: 1 } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      if (!o || o === true) return null;
      return { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.tipo }, text: async () => new TextDecoder().decode(o.bytes), json: async () => JSON.parse(new TextDecoder().decode(o.bytes)), arrayBuffer: async () => o.bytes.buffer };
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
}

/** Un archivo en la galería (y en R2). */
function archivo(id, cliente, { mime = "image/png", borrado = null, prompt = "un sofá", tipo = "imagen" } = {}) {
  const clave = `clientes/${cliente}/estudio/${id}.png`;
  objetos.set(clave, true);
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt, modelo, origen, borrado_at) values (?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, tipo, mime, prompt, "prueba", "estudio", borrado);
  return clave;
}

function nota(id, cliente, { titulo, texto, tipo = "marca", interna = 0 }) {
  db.sqlite.prepare(
    "insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen, interna, resumen, caracteres) values (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, ANA, cliente, id, titulo, texto, tipo, "manual", interna, texto.slice(0, 100), texto.length);
}

const trabajos = () => db.sqlite.prepare("select * from estudio_trabajos order by created_at").all().map((t) => ({ ...t }));

/** Las tres herramientas, como las ve el asistente de un cliente. */
const asistente = (extra = {}, clienteActual = null) => crearEjecutor({
  env, acceso, clienteActual, estudio: { usuario: USUARIO, por: POR, origen: "asistente" }, ...extra,
});
const usar = async (ejecutor, name, input) => {
  const r = await ejecutor.ejecutar({ id: "t1", name, input });
  return { texto: String(r.content), error: Boolean(r.is_error) };
};

// Un modelo caro de verdad, sacado del catálogo (no de un número escrito aquí).
const CARO = MODELOS.find((m) => m.tipo === "video" && m.motor === "gemini" && estimar(m, 1, { duration: "8" }) >= 0.5);

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GOOGLE_AI_KEY: "llave-de-prueba" };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("ver_estudio", () => {
  it("dice qué modelos hay, cuánto cuestan y lo último de la galería con sus ids", async () => {
    archivo("a1", "c1", { prompt: "sofá gris en sala" });
    archivo("a2", "c2", { prompt: "cuna blanca" });
    archivo("a3", "c1", { prompt: "ya borrada", borrado: "2026-09-01T00:00:00.000Z" });
    const { texto, error } = await usar(asistente(), "ver_estudio", { cliente: "Dcasa" });
    expect(error).toBe(false);
    expect(texto).toContain("Estudio de Dcasa");
    expect(texto).toMatch(/PREDETERMINADO/);
    expect(texto).toContain("a1");
    expect(texto).toContain("sofá gris en sala");
    // Ni lo de otro cliente ni lo que está en la papelera.
    expect(texto).not.toContain("a2");
    expect(texto).not.toContain("a3");
    expect(texto).not.toContain("prueba (");
  });

  it("sin llave de ningún proveedor lo dice: lo que hay son tarjetas, no imágenes", async () => {
    env.GOOGLE_AI_KEY = undefined;
    const { texto } = await usar(asistente(), "ver_estudio", { cliente: "Dcasa" });
    expect(texto).toMatch(/AVISO: .*motor de prueba/);
    expect(texto).toContain("prueba");
  });

  it("la guía visual sale del cerebro y NUNCA con notas internas", async () => {
    nota("n1", "c1", { titulo: "Identidad visual", texto: "Paleta cálida: terracota y crema. Fotografía con luz natural lateral, estilo editorial. Evitar fondos saturados." });
    nota("n2", "c1", { titulo: "Costos y márgenes", texto: "Paleta interna de precios: costo de landed 12 dólares, margen 62 por ciento, estilo de negociación con proveedores.", interna: 1 });
    nota("n3", "c2", { titulo: "Otro cliente", texto: "Paleta azul eléctrico y neón, estilo futurista de otro cliente." });
    const { texto } = await usar(asistente(), "ver_estudio", { cliente: "Dcasa" });
    expect(texto).toContain("GUÍA VISUAL DE LA MARCA");
    expect(texto).toContain("terracota");
    expect(texto).not.toContain("landed");
    expect(texto).not.toContain("62 por ciento");
    expect(texto).not.toContain("eléctrico");
  });

  it("sin notas visuales pide que se añadan, en vez de inventar una marca", async () => {
    const { texto } = await usar(asistente(), "ver_estudio", { cliente: "Dcasa" });
    expect(texto).toMatch(/no tiene notas de identidad visual/);
  });

  it("lo que está en marcha aparece", async () => {
    await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "un sofá", modelo: "prueba" });
    const { texto } = await usar(asistente(), "ver_estudio", { cliente: "Dcasa" });
    expect(texto).toContain("EN MARCHA");
    expect(texto).toContain("un sofá");
  });
});

describe("crear_en_estudio", () => {
  it("crea el pedido en la cola, firmado, y dice el id y dónde verlo", async () => {
    const { texto, error } = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "un sofá gris", modelo: "prueba", cantidad: 2, formato: "4:5" });
    expect(error).toBe(false);
    const [t] = trabajos();
    expect(t).toMatchObject({ client_id: "c1", modelo: "prueba", n: 2, estado: "en_cola", origen: "asistente", creado_por: ANA, prompt: "un sofá gris" });
    expect(JSON.parse(t.ajustes)).toMatchObject({ aspectRatio: "4:5" });
    expect(texto).toContain(t.id);
    expect(texto).toMatch(/estado_trabajo/);
    expect(texto).toMatch(/no hace falta esperar/);
  });

  it("en el asistente de un cliente, el cliente se puede omitir", async () => {
    const c1 = await acceso.leerUno("clients", { id: "c1" });
    const { error } = await usar(asistente({}, c1), "crear_en_estudio", { prompt: "una cuna", modelo: "prueba" });
    expect(error).toBe(false);
    expect(trabajos()[0].client_id).toBe("c1");
  });

  it("un pedido caro NO se crea hasta que llega confirmado=true", async () => {
    expect(CARO, "el catálogo debe tener un video que pase de 0,50 $").toBeTruthy();
    const pedido = { cliente: "Dcasa", tipo: "video", modelo: CARO.id, prompt: "el sofá gira", duracion: 8 };
    const a = await usar(asistente(), "crear_en_estudio", pedido);
    expect(a.error).toBe(false);
    expect(a.texto).toMatch(/NO SE CREÓ NADA/);
    expect(a.texto).toMatch(/confirmado=true/);
    expect(trabajos()).toHaveLength(0);

    // Un «sí» que no es el booleano no cuenta.
    for (const falso of ["true", 1, "sí"]) {
      const r = await usar(asistente(), "crear_en_estudio", { ...pedido, confirmado: falso });
      expect(r.texto).toMatch(/NO SE CREÓ NADA/);
    }
    expect(trabajos()).toHaveLength(0);

    const b = await usar(asistente(), "crear_en_estudio", { ...pedido, confirmado: true });
    expect(b.error).toBe(false);
    expect(trabajos()).toHaveLength(1);
    expect(pideConfirmar(trabajos()[0].costo_estimado)).toBe(true);
  });

  it("con el presupuesto agotado y «detener», no se crea aunque esté confirmado", async () => {
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(ANA, ANA, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)").run("k1", ANA, new Date().toISOString().slice(0, 7), "x", "claude-sonnet-5", 5);
    const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: CARO.id, prompt: "el sofá gira", duracion: 8, confirmado: true });
    expect(r.error).toBe(true);
    expect(trabajos()).toHaveLength(0);
  });

  it("los topes de una IA son más cortos que los de la pantalla", async () => {
    expect((await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "prueba", cantidad: LIMITES.imagenes + 1 })).error).toBe(true);
    expect((await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "prueba", cantidad: 1.5 })).error).toBe(true);
    expect((await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", tipo: "video", modelo: "prueba-video", cantidad: LIMITES.videos + 1 })).error).toBe(true);
    expect(trabajos()).toHaveLength(0);
    // Y el tope se cumple justo en el límite.
    expect((await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "prueba", cantidad: LIMITES.imagenes })).error).toBe(false);
  });

  it("lo que el modelo no admite se dice, no se cambia en silencio", async () => {
    const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "prueba", formato: "7:3" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/no admite formato «7:3»; admite: /);
    const m = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "no-existe" });
    expect(m.texto).toMatch(/No existe el modelo/);
    const t = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "x", tipo: "video", modelo: "prueba" });
    expect(t.texto).toMatch(/es un modelo de imagen, no de video/);
    expect(trabajos()).toHaveLength(0);
  });

  it("el prompt no puede ir vacío", async () => {
    const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "   ", modelo: "prueba" });
    expect(r.error).toBe(true);
    expect(trabajos()).toHaveLength(0);
  });

  describe("imágenes de apoyo, por id de la galería", () => {
    it("una imagen de ese cliente sirve de imagen inicial y se guarda su clave", async () => {
      const clave = archivo("a1", "c1");
      const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: "prueba-video", prompt: "anima el sofá", imagen_inicial: "a1" });
      expect(r.error, r.texto).toBe(false);
      expect(JSON.parse(trabajos()[0].medios)).toEqual({ start: [clave] });
    });

    it("la de otro cliente, la de otro espacio, la que está en la papelera y un archivo que no es imagen se rechazan", async () => {
      archivo("deOtroCliente", "c2");
      archivo("deOtroEspacio", "c9");
      archivo("borrada", "c1", { borrado: "2026-09-01T00:00:00.000Z" });
      archivo("video", "c1", { mime: "video/mp4", tipo: "video" });
      for (const id of ["deOtroCliente", "deOtroEspacio", "borrada", "video", "inventada"]) {
        const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: "prueba-video", prompt: "anima", imagen_inicial: id });
        expect(r.error, id).toBe(true);
        expect(r.texto, id).toMatch(/No encontré la imagen|no es una imagen/);
      }
      expect(trabajos()).toHaveLength(0);
    });

    it("una clave de R2 escrita a mano NO sirve: sólo ids de la galería", async () => {
      archivo("a1", "c1");
      const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: "prueba-video", prompt: "anima", imagen_inicial: "clientes/c2/estudio/a1.png" });
      expect(r.error).toBe(true);
    });

    it("las referencias de una imagen se respetan según el modelo", async () => {
      archivo("r1", "c1");
      archivo("r2", "c1");
      const ok = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", modelo: "prueba", prompt: "como esta", referencias: ["r1", "r2"] });
      expect(ok.error, ok.texto).toBe(false);
      expect(JSON.parse(trabajos()[0].medios).reference).toHaveLength(2);
      const demasiadas = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", modelo: "prueba", prompt: "x", referencias: Array.from({ length: 9 }, (_, i) => `r${i}`) });
      expect(demasiadas.error).toBe(true);
    });

    it("una imagen final sin inicial se rechaza", async () => {
      archivo("a1", "c1");
      const r = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: "prueba-video", prompt: "anima", imagen_final: "a1" });
      expect(r.error).toBe(true);
    });
  });

  it("un cliente de otro espacio no existe para el asistente", async () => {
    const r = await usar(asistente(), "crear_en_estudio", { cliente: "Ajeno", prompt: "x", modelo: "prueba" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/No encontré el cliente/);
    expect(trabajos()).toHaveLength(0);
  });
});

describe("estado_trabajo", () => {
  it("cuenta cómo va y qué archivos dio", async () => {
    const creado = await usar(asistente(), "crear_en_estudio", { cliente: "Dcasa", prompt: "un sofá", modelo: "prueba" });
    const id = trabajos()[0].id;
    expect(creado.texto).toContain(id);
    const { texto } = await usar(asistente(), "estado_trabajo", { trabajo_id: id });
    expect(texto).toMatch(/En cola/);
    expect(texto).toMatch(/Llevan 0 de 1/);
    expect(texto).toMatch(/se hace solo/);
  });

  it("un pedido de otro espacio o inventado da «no encontré»", async () => {
    db.sqlite.prepare(
      "insert into estudio_trabajos (id, owner_id, client_id, estado, tipo, motor, modelo, prompt, n, ajustes, medios, remoto, archivos, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run("t9", OTRO, "c9", "en_cola", "imagen", "prueba", "prueba", "ajeno", 1, "{}", "{}", "[]", "[]", "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    for (const id of ["t9", "inventado"]) {
      const r = await usar(asistente(), "estado_trabajo", { trabajo_id: id });
      expect(r.error, id).toBe(true);
      expect(r.texto).toMatch(/No encontré el pedido/);
    }
  });
});

describe("quién puede gastar", () => {
  it("un ejecutor sin `estudio` (el de las consultas) no sabe pedir nada", () => {
    const sin = crearEjecutor({ env, acceso });
    for (const nombre of ["ver_estudio", "crear_en_estudio", "estado_trabajo"]) expect(sin.esDelServidor(nombre), nombre).toBe(false);
    const con = asistente();
    for (const nombre of ["ver_estudio", "crear_en_estudio", "estado_trabajo"]) expect(con.esDelServidor(nombre), nombre).toBe(true);
  });

  it("las tres herramientas están entre las de servidor del asistente y reservan su nombre", () => {
    for (const d of DEFINICIONES_ESTUDIO) {
      expect(DEFINICIONES.map((x) => x.name)).toContain(d.name);
      expect(NOMBRES.has(d.name)).toBe(true);
    }
  });

  it("la descripción de la que gasta dice que no se confirma por cuenta propia", () => {
    const d = DEFINICIONES_ESTUDIO.find((x) => x.name === "crear_en_estudio");
    expect(d.description).toMatch(/Nunca pongas confirmado=true por tu cuenta/);
    expect(d.input_schema.properties.confirmado.type).toBe("boolean");
  });
});

describe("por MCP (Claude)", () => {
  const herramientas = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });

  it("las tres están en la lista con el cliente obligatorio donde toca y la que gasta no es de sólo lectura", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    expect(por.ver_estudio.inputSchema.required).toContain("cliente");
    expect(por.crear_en_estudio.inputSchema.required).toEqual(expect.arrayContaining(["prompt", "cliente"]));
    expect(por.estado_trabajo.inputSchema.required).toEqual(["trabajo_id"]);
    expect(por.ver_estudio.annotations.readOnlyHint).toBe(true);
    expect(por.estado_trabajo.annotations.readOnlyHint).toBe(true);
    expect(por.crear_en_estudio.annotations.readOnlyHint).toBe(false);
  });

  it("un pedido queda firmado «claude» y respeta la confirmación", async () => {
    const h = herramientas();
    const caro = await h.llamar("crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: CARO.id, prompt: "el sofá gira", duracion: 8 });
    expect(caro.isError).toBeUndefined();
    expect(caro.content[0].text).toMatch(/NO SE CREÓ NADA/);
    expect(trabajos()).toHaveLength(0);

    const ok = await h.llamar("crear_en_estudio", { cliente: "Dcasa", prompt: "un sofá", modelo: "prueba" });
    expect(ok.isError).toBeUndefined();
    expect(trabajos()[0]).toMatchObject({ origen: "claude", creado_por: ANA });
  });

  it("un error de lo pedido vuelve como resultado con isError, sin tumbar la llamada", async () => {
    const r = await herramientas().llamar("crear_en_estudio", { cliente: "Dcasa", prompt: "x", modelo: "prueba", cantidad: 99 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/1 a 4/);
    const sinCliente = await herramientas().llamar("crear_en_estudio", { prompt: "x", modelo: "prueba" });
    expect(sinCliente.isError).toBe(true);
    expect(sinCliente.content[0].text).toMatch(/Indica de qué cliente/);
  });

  it("no ve los clientes de otro espacio", async () => {
    const r = await herramientas().llamar("ver_estudio", { cliente: "Ajeno" });
    expect(r.isError).toBe(true);
  });
});

describe("el cerebro para imagen", () => {
  it("«imagen» es un uso del cerebro: deja fuera lo interno y conserva la maquetación (que es identidad visual)", () => {
    expect(USOS).toContain("imagen");
    expect(fueraDeUso({ t: "marca", i: 1 }, "imagen")).toBe(true);
    expect(fueraDeUso({ t: "marca", i: 0 }, "imagen")).toBe(false);
    expect(fueraDeUso({ t: "maquetacion", i: 0 }, "imagen")).toBe(false);
    // Para escribir texto la maquetación sigue fuera, como antes.
    expect(fueraDeUso({ t: "maquetacion", i: 0 }, "texto")).toBe(true);
    // El equipo hablando con el asistente lo ve todo.
    expect(fueraDeUso({ t: "marca", i: 1 }, "chat")).toBe(false);
  });
});
