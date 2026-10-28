// ============================================================
// Dos personas, el mismo calendario, sin recargar
//
// El caso que pidió la agencia, tal cual: «si yo escribo el título y la
// descripción de una publicación y guardo, ¿lo ve mi compañera en su
// pantalla sin refrescar?». Esto lo comprueba de verdad —workerd, D1 y
// el Durable Object—, no leyendo el código.
//
// Lo que se afirma aquí NO se puede afirmar leyendo ficheros: que el
// binding HUB existe, que el socket entra, que las dos personas caen en
// el MISMO objeto y que el cuerpo del cambio viaja entero.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { levantarEspacio, ANA, BRUNO } from "./espacio.js";

// Levantar el Worker y sembrar tarda; el resto va en milisegundos.
const ARRANQUE = 120_000;

let espacio;
let ana;
let bruno;
let socketAna;
let socketBruno;
let clienteId;

beforeAll(async () => {
  espacio = await levantarEspacio();
  ana = await espacio.entrar(ANA);
  bruno = await espacio.entrar(BRUNO);
  socketAna = await espacio.conectar(ANA);
  socketBruno = await espacio.conectar(BRUNO);
}, ARRANQUE);

afterAll(async () => {
  await espacio?.cerrar();
});

describe("las dos personas están en el mismo espacio", () => {
  it("comparten ownerId aunque sean cuentas distintas", () => {
    // Si esto falla, no se verían NUNCA y nada daría error: cada una
    // hablaría con su propio Durable Object.
    expect(ana.ownerId).toBe(bruno.ownerId);
    expect(ana.id).not.toBe(bruno.id);
  });

  it("y cada una conserva su papel", () => {
    expect(ana.rol).toBe("admin");
    expect(bruno.rol).toBe("editor");
  });
});

describe("quien se conecta ve a quien ya estaba", () => {
  it("el saludo trae la lista de presentes, no una lista vacía", async () => {
    const hola = await socketBruno.esperarEvento("hola");
    const nombres = (hola.presentes ?? []).map((p) => p.nombre).sort();
    expect(nombres).toEqual(["Ana", "Bruno"]);
  });

  it("y a quien ya estaba le avisan de la que entra", async () => {
    const presencia = await socketAna.esperarEvento("presencia");
    expect((presencia.presentes ?? []).map((p) => p.nombre)).toContain("Bruno");
  });
});

describe("lo que escribe una aparece en la pantalla de la otra", () => {
  it("un cliente nuevo le llega a la otra persona", async () => {
    clienteId = crypto.randomUUID();
    const r = await espacio.api(ANA, `/api/clientes/${clienteId}`, {
      method: "PUT",
      body: JSON.stringify({ id: clienteId, name: "Cliente de prueba", industry: "pruebas" }),
    });
    expect(r.status).toBe(200);

    const evento = await socketBruno.esperarEvento("cliente");
    expect(evento.cliente.name).toBe("Cliente de prueba");
  });

  it("una publicación guardada llega ENTERA: idea y descripción incluidas", async () => {
    // El caso exacto de la agencia. Que llegue el aviso no basta: si
    // viajara vacío, la otra pantalla se quedaría igual de desactualizada.
    const calId = crypto.randomUUID();
    const r = await espacio.api(ANA, `/api/calendarios/${calId}`, {
      method: "PUT",
      body: JSON.stringify({
        id: calId,
        client_id: clienteId,
        name: "Octubre 2026",
        month: 9,
        year: 2026,
        days: [{
          date: "2026-10-01",
          posts: [{
            id: crypto.randomUUID(),
            format: "post",
            status: "pending",
            idea: "Título que escribe Ana",
            descripcion: "Descripción que escribe Ana",
          }],
        }],
      }),
    });
    expect(r.status).toBe(200);

    const evento = await socketBruno.esperarEvento("calendario");
    const publicacion = evento.calendario.days[0].posts[0];
    expect(publicacion.idea).toBe("Título que escribe Ana");
    expect(publicacion.descripcion).toBe("Descripción que escribe Ana");
  });

  it("y el evento dice QUIÉN lo hizo, para no cambiar cosas solas delante de nadie", async () => {
    const evento = await socketBruno.esperarEvento("calendario");
    expect(evento.por.nombre).toBe("Ana");
    expect(evento.por.userId).toBe(ANA.id);
  });
});

describe("el eco de una misma no se aplica", () => {
  it("el evento vuelve con la PESTAÑA que lo originó", async () => {
    // El Durable Object no sabe de qué socket salió el cambio —llegó por
    // HTTP—, así que se lo manda también a quien lo hizo. Sin este dato,
    // esa pestaña se aplicaría su propio guardado encima de lo que su
    // usuario haya seguido escribiendo: el cursor salta y se pierde la
    // última palabra.
    const eco = await socketAna.esperarEvento("calendario");
    expect(eco.por.tab).toBe(ANA.pestana);
  });

  it("y a la otra persona le llega la misma pestaña, que no es la suya", async () => {
    const evento = await socketBruno.esperarEvento("calendario");
    expect(evento.por.tab).toBe(ANA.pestana);
    expect(evento.por.tab).not.toBe(BRUNO.pestana);
  });
});

describe("borrar también se ve", () => {
  it("al borrar un cliente, a la otra persona le llega el aviso", async () => {
    const id = crypto.randomUUID();
    await espacio.api(ANA, `/api/clientes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ id, name: "Cliente efímero" }),
    });
    await socketBruno.esperarEvento("cliente");

    const r = await espacio.api(ANA, `/api/clientes/${id}`, { method: "DELETE" });
    expect(r.status).toBe(204);

    const fuera = await socketBruno.esperarEvento("cliente:fuera");
    expect(fuera.id).toBe(id);
  });
});

describe("el Estudio sigue sin la pantalla", () => {
  it("un trabajo pedido termina SOLO: la alarma del Durable Object lo avanza, nadie llama a /avanzar", async () => {
    // Lo que pidió la agencia: salir de la aplicación y que siga. Aquí no hay pestaña que avance el trabajo; si llega
    // a «hecho», lo llevó la bomba del espacio (worker/hub.js → bombear). El motor de prueba no gasta ni pide llave.
    const id = crypto.randomUUID();
    await espacio.api(ANA, `/api/clientes/${id}`, { method: "PUT", body: JSON.stringify({ id, name: "Cliente del Estudio" }) });
    const r = await espacio.api(ANA, `/api/estudio/${id}/trabajos`, {
      method: "POST", body: JSON.stringify({ modelo: "prueba", prompt: "una taza de café", n: 2 }),
    });
    expect(r.status).toBe(201);
    const { trabajo } = await r.json();
    let estado = trabajo.estado;
    for (let i = 0; i < 40 && estado !== "hecho"; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      estado = (await (await espacio.api(ANA, `/api/estudio/${id}/trabajos/${trabajo.id}`)).json()).trabajo.estado;
    }
    expect(estado).toBe("hecho");
  }, 30_000);

  it("y un LOTE entero (el encargo) también: cada pieza se pide, sale y el encargo se cierra", async () => {
    const id = crypto.randomUUID();
    await espacio.api(ANA, `/api/clientes/${id}`, { method: "PUT", body: JSON.stringify({ id, name: "Cliente del lote" }) });
    const paso = (n) => ({ id: `p${n}`, escena: `Una taza número ${n}`, pedido: { modelo: "prueba", prompt: "Escena: {{ESCENA}}", n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} } });
    const r = await espacio.api(ANA, `/api/estudio/${id}/encargos`, {
      method: "POST", body: JSON.stringify({ tipo: "lote", mejorar: false, pasos: [paso(1), paso(2), paso(3)] }),
    });
    expect(r.status).toBe(201);
    const { encargo } = await r.json();
    let e = encargo;
    for (let i = 0; i < 60 && e.estado === "en_marcha"; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      e = (await (await espacio.api(ANA, `/api/estudio/${id}/encargos/${encargo.id}`)).json()).encargo;
    }
    expect(e.estado).toBe("hecho");
    expect(e.pasos.map((p) => p.fase)).toEqual(["hecho", "hecho", "hecho"]);
  }, 45_000);

  it("y un CARRUSEL: las láminas en orden, cada una con la anterior de referencia, sin pantalla", async () => {
    const id = crypto.randomUUID();
    await espacio.api(ANA, `/api/clientes/${id}`, { method: "PUT", body: JSON.stringify({ id, name: "Cliente del carrusel" }) });
    const laminas = [1, 2, 3].map((n) => ({ n, texto: `Lámina ${n}`, rol: n === 1 ? "portada" : "contenido" }));
    const r = await espacio.api(ANA, `/api/estudio/${id}/encargos`, {
      method: "POST", body: JSON.stringify({ tipo: "carrusel", comun: { modelo: "prueba", idea: "Tres errores" }, laminas, conSistema: false }),
    });
    expect(r.status).toBe(201);
    const { encargo } = await r.json();
    let e = encargo;
    for (let i = 0; i < 80 && e.estado === "en_marcha"; i++) {
      await new Promise((ok) => setTimeout(ok, 500));
      e = (await (await espacio.api(ANA, `/api/estudio/${id}/encargos/${encargo.id}`)).json()).encargo;
    }
    expect(e.estado).toBe("hecho");
    expect(e.pasos.map((p) => p.fase)).toEqual(["hecho", "hecho", "hecho"]);
  }, 60_000);
});

