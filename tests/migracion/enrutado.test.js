import { describe, it, expect } from "vitest";
import worker from "../../worker/index.js";
import { sha256 } from "../../worker/lib/ids.js";
import { COOKIE } from "../../worker/lib/sesion.js";

// ============================================================
// La puerta del Worker, pedida de verdad
//
// POR QUÉ ESTE FICHERO NO ES OTRO TEST ESTÁTICO
//
// `tests/despliegue/funciones.test.js` comprueba que todo lo escrito en
// `worker/rutas/` está enrutado, porque `ai-chat` corrió semanas con
// código que no estaba en ningún commit. Pero no llega DENTRO de
// `worker/index.js`, y ahí cabe el mismo fallo: una rama escrita, en el
// commit, desplegada, y a la que no llega ninguna petición porque otra
// de más arriba contestó primero.
//
// Eso es exactamente lo que le pasaba a la subida de imágenes. `POST
// /api/media` no lleva clave en la ruta, la comprobación de clave iba
// delante, y devolvía 404 antes de mirar el método. Leyendo el fichero
// las dos ramas están ahí y parecen bien.
//
// La única forma de verlo es pedirlo. Eso es lo que hace esto.
// ============================================================

const TESTIGO = "un-testigo-de-sesion-de-prueba";

/** D1 de mentira: reconoce las tres consultas que hace esta puerta. */
function dbFalsa({ clientes = ["cliente-1"], huella } = {}) {
  const responder = (sql, binds) => {
    const s = sql.toLowerCase().replace(/\s+/g, " ");

    if (s.includes("from sessions s")) {
      if (binds[0] !== huella) return null;
      return {
        id: "u-jefe", email: "jefe@a.com",
        owner_id: "u-jefe", rol: "admin", nombre: "Juan", color: "#1E90FF",
      };
    }

    // acceso.leerUno("clients", { id }) — acotado por el espacio.
    if (s.startsWith("select * from clients where id = ? and owner_id = ?")) {
      return clientes.includes(binds[0]) && binds[1] === "u-jefe" ? { id: binds[0] } : null;
    }
    return null;
  };

  return {
    prepare(sql) {
      const llamada = { sql, binds: [] };
      return {
        bind(...args) { llamada.binds = args; return this; },
        first: async () => responder(sql, llamada.binds),
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  };
}

/** R2 de mentira, con lo justo que usa `sirveMedia`. */
function r2Falso(inicial = {}) {
  const objetos = new Map(Object.entries(inicial));
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      return {
        body: objetos.get(clave),
        httpEtag: '"abc"',
        writeHttpMetadata: (h) => h.set("content-type", "image/jpeg"),
      };
    },
    async put(clave, cuerpo) { objetos.set(clave, cuerpo); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function entorno(opciones = {}) {
  return {
    DB: dbFalsa({ ...opciones, huella: await sha256(TESTIGO) }),
    MEDIA: r2Falso(opciones.r2),
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
  };
}

const conSesion = (ruta, opciones = {}) =>
  new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.headers ?? {}) },
  });

/** Un formulario de subida como el que manda el navegador. */
function formularioConImagen(clientId, nombre = "foto.JPG") {
  const form = new FormData();
  form.append("archivo", new File([new Uint8Array([1, 2, 3])], nombre, { type: "image/jpeg" }));
  form.append("clientId", clientId);
  return form;
}

describe("subir un archivo a /api/media", () => {
  it("llega a la rama de subida en vez de morir en la comprobación de clave", async () => {
    // LA REGRESIÓN. Antes esto era 404: `partes` vale ["media"], la clave
    // sale vacía, y el `if (!m) return noEncontrado("Archivo")` que iba
    // delante contestaba antes de que nadie mirase el método.
    const env = await entorno();
    const res = await worker.fetch(
      conSesion("/api/media", { method: "POST", body: formularioConImagen("cliente-1") }),
      env,
    );

    expect(res.status, "la subida vuelve a ser inalcanzable").toBe(201);
    const { clave } = await res.json();
    expect(clave).toMatch(/^clientes\/cliente-1\/posts\/[0-9a-f-]+\.jpg$/);
    expect(env.MEDIA.objetos.has(clave), "no se escribió en R2").toBe(true);
  });

  it("la clave la inventa el servidor: el navegador no elige dónde escribe", async () => {
    // Si la clave viniera del formulario, bastaría mandar
    // `clientes/otro-cliente/…` para escribir en la carpeta de otro.
    const env = await entorno();
    const form = formularioConImagen("cliente-1");
    form.append("clave", "clientes/cliente-de-otro/posts/colado.jpg");

    const res = await worker.fetch(conSesion("/api/media", { method: "POST", body: form }), env);
    const { clave } = await res.json();
    expect(clave).not.toContain("cliente-de-otro");
    expect(env.MEDIA.objetos.has("clientes/cliente-de-otro/posts/colado.jpg")).toBe(false);
  });

  it("la carpeta se limpia: no se puede salir de la del cliente", async () => {
    const env = await entorno();
    const form = formularioConImagen("cliente-1");
    form.append("carpeta", "../../otro");

    const { clave } = await (await worker.fetch(
      conSesion("/api/media", { method: "POST", body: form }), env,
    )).json();
    expect(clave).not.toContain("..");
    expect(clave).toMatch(/^clientes\/cliente-1\/otro\//);
  });

  it("a un cliente de otro espacio, no", async () => {
    const env = await entorno({ clientes: ["cliente-1"] });
    const res = await worker.fetch(
      conSesion("/api/media", { method: "POST", body: formularioConImagen("cliente-de-otro") }),
      env,
    );
    expect(res.status).toBe(404);
    expect(env.MEDIA.objetos.size).toBe(0);
  });

  it("sin archivo es un 400 con motivo, no un 500", async () => {
    const env = await entorno();
    const form = new FormData();
    form.append("clientId", "cliente-1");
    const res = await worker.fetch(conSesion("/api/media", { method: "POST", body: form }), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/archivo/i);
  });

  it("y sin sesión, ni eso", async () => {
    const env = await entorno();
    const res = await worker.fetch(
      new Request("https://calendarios.test/api/media", { method: "POST", body: formularioConImagen("cliente-1") }),
      env,
    );
    expect(res.status).toBe(401);
    expect(env.MEDIA.objetos.size).toBe(0);
  });
});

describe("leer y borrar un archivo", () => {
  const CLAVE = "clientes/cliente-1/posts/foto.jpg";

  it("se sirve el de un cliente del espacio", async () => {
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/${""}media/${CLAVE}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // `private`: son imágenes de clientes, y una caché compartida que las
    // guarde es justo lo que no se quiere.
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("el de otro espacio no existe, aunque el objeto esté en R2", async () => {
    const otro = "clientes/cliente-de-otro/posts/foto.jpg";
    const env = await entorno({ clientes: ["cliente-1"], r2: { [otro]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${otro}`), env);
    expect(res.status).toBe(404);
  });

  it("una clave sin la forma de siempre tampoco", async () => {
    // En Supabase la ruta era `{clientId}/{uuid}.jpg`; en R2 todo cuelga
    // de `clientes/`, y sin ese prefijo no se sabe de qué cliente es.
    const env = await entorno({ r2: { "suelta.jpg": "bytes" } });
    expect((await worker.fetch(conSesion("/api/media/suelta.jpg"), env)).status).toBe(404);
  });

  it("borrar quita el objeto", async () => {
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${CLAVE}`, { method: "DELETE" }), env);
    expect(res.status).toBe(200);
    expect(env.MEDIA.objetos.has(CLAVE)).toBe(false);
  });

  it("un método que no se atiende dice 405, no 404", async () => {
    // 404 diría «ese archivo no existe», que es mentira y manda a buscar
    // al sitio equivocado.
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${CLAVE}`, { method: "PUT" }), env);
    expect(res.status).toBe(405);
  });
});

describe("la puerta, en general", () => {
  it("lo que no es /api/ lo sirve el frontend compilado", async () => {
    const env = await entorno();
    const res = await worker.fetch(new Request("https://calendarios.test/cliente/baby-caleb"), env);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("sin sesión, 401 y no 404", async () => {
    // Un 404 en /api/yo significaría que el Worker no atiende /api/* y
    // que la API entera está muerta aunque el sitio se vea perfecto.
    const env = await entorno();
    const res = await worker.fetch(new Request("https://calendarios.test/api/yo"), env);
    expect(res.status).toBe(401);
  });

  it("/api/live sin cabecera de Upgrade es 426, no un socket a medias", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/live"), env);
    expect(res.status).toBe(426);
  });

  it("una ruta que no existe es 404 con JSON y con las cabeceras de la API", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/no-existe"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
