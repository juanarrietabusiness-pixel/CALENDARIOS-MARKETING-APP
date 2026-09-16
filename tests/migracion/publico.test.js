import { describe, it, expect } from "vitest";
import {
  calendarioPorTestigo, perteneceAlCalendario,
  enviarAprobacion, actualizarContenido, mediaPermitida,
} from "../../worker/lib/publico.js";

const TESTIGO = "a".repeat(48);

const CAL = () => ({
  id: "cal1",
  client_id: "c1",
  // El dueño no sale nunca hacia el cliente final; se lee para poder
  // avisar al espacio de la agencia de que acaban de responder.
  owner_id: "dueno1",
  name: "MES DE AGOSTO",
  month: 7,
  year: 2026,
  campaign: "Mes de Décimo",
  week_concepts: '["semana 1"]',
  days: JSON.stringify([
    { date: "2026-08-01", posts: [
      { id: "p1", idea: "Una idea", guion: "Un guion", descripcion: "Una descripción",
        image: "clientes/c1/posts/a.jpg", format: "reel", publishTime: "18:00" },
    ] },
  ]),
  visual_references: '[{"id":"r1","url":"clientes/c1/referencias/b.png","name":"ref"}]',
  day_labels: "{}",
  allow_editing: 0,
});

const CLIENTE = {
  name: "D'CASA Panamá", industry: "Hogar",
  primary_color: "#1E90FF", logo: "clientes/c1/logo.jpg",
};

function d1Con({ calendario, cliente = CLIENTE, aprobaciones = [] } = {}) {
  const escrituras = [];
  return {
    escrituras,
    prepare(sql) {
      const ctx = { sql, binds: [] };
      return {
        bind(...args) { ctx.binds = args; return this; },
        first: async () => {
          if (/from calendars/.test(sql)) return calendario ?? null;
          if (/from clients/.test(sql)) return cliente ?? null;
          return null;
        },
        all: async () => ({ results: /from approvals/.test(sql) ? aprobaciones : [] }),
        run: async () => { escrituras.push(ctx); return { meta: { changes: 1 } }; },
      };
    },
  };
}

describe("el testigo tiene que parecer un testigo antes de consultar nada", () => {
  it("uno corto no llega ni a la base", async () => {
    const db = d1Con({ calendario: CAL() });
    expect(await calendarioPorTestigo(db, "corto")).toBe(null);
    expect(await calendarioPorTestigo(db, null)).toBe(null);
  });

  it("las escrituras lo rechazan con un error, no en silencio", async () => {
    const db = d1Con({ calendario: CAL() });
    await expect(enviarAprobacion(db, { token: "x", postId: "p1", estado: "aprobado" }))
      .rejects.toThrow("Enlace inválido");
    await expect(actualizarContenido(db, { token: "x", postId: "p1", descripcion: "y" }))
      .rejects.toThrow("Enlace inválido");
  });
});

describe("calendarioPorTestigo: la lista blanca es la seguridad", () => {
  it("no devuelve owner_id, share_token ni el ADN de marca del cliente", async () => {
    // El SQL original escribía la lista a mano por esto. Un `select *`
    // recortado en JavaScript filtra en cuanto alguien añade una columna.
    const db = d1Con({
      calendario: { ...CAL(), owner_id: "u1", share_token: TESTIGO },
      cliente: { ...CLIENTE, valores: "SECRETO", audiencia: "SECRETO", github_repo: "SECRETO" },
    });
    const salida = await calendarioPorTestigo(db, TESTIGO);
    const texto = JSON.stringify(salida);

    expect(texto).not.toContain("owner_id");
    expect(texto).not.toContain(TESTIGO);
    expect(texto).not.toContain("SECRETO");
    expect(Object.keys(salida.calendar.client).sort()).toEqual(["industry", "logo", "name", "primaryColor"]);
  });

  it("devuelve el calendario con el JSON ya deserializado", async () => {
    const salida = await calendarioPorTestigo(d1Con({ calendario: CAL() }), TESTIGO);
    expect(salida.calendar.calendar.days[0].posts[0].id).toBe("p1");
    expect(salida.calendar.calendar.allowEditing).toBe(false);
    expect(salida.calendar.calendar.dayLabels).toEqual({});
  });

  it("mapea las aprobaciones por post_id, como hacía el jsonb_object_agg", async () => {
    const db = d1Con({
      calendario: CAL(),
      aprobaciones: [{
        post_id: "p1", estado: "cambios", comentario: "Cambiar el copy",
        reviewer_name: "Ana", updated_at: "2026-09-01T10:00:00.000Z",
        suggested_descripcion: null, suggested_guion: null,
      }],
    });
    const { approvals } = await calendarioPorTestigo(db, TESTIGO);
    expect(approvals.p1).toEqual({
      estado: "cambios", comentario: "Cambiar el copy", revisor: "Ana",
      timestamp: "2026-09-01T10:00:00.000Z",
      suggestedDescripcion: null, suggestedGuion: null,
    });
  });
});

describe("perteneceAlCalendario: la comprobación que sostiene todo", () => {
  it("encuentra una publicación del calendario", () => {
    expect(perteneceAlCalendario(CAL(), "p1")).toBe(true);
  });

  it("encuentra también una referencia visual, que también se aprueba", () => {
    expect(perteneceAlCalendario(CAL(), "r1")).toBe(true);
  });

  it("rechaza un identificador inventado", () => {
    // Sin esto, cualquiera con un testigo válido escribe aprobaciones
    // sobre ids que no existen —o que existen en OTRO calendario—.
    expect(perteneceAlCalendario(CAL(), "p999")).toBe(false);
    expect(perteneceAlCalendario(CAL(), "")).toBe(false);
  });
});

describe("enviarAprobacion", () => {
  it("sólo acepta «aprobado» y «cambios»", async () => {
    const db = d1Con({ calendario: CAL() });
    for (const estado of ["publicado", "rechazado", "", null]) {
      await expect(enviarAprobacion(db, { token: TESTIGO, postId: "p1", estado }))
        .rejects.toThrow("Estado inválido");
    }
  });

  it("rechaza un post_id vacío o de más de 200 caracteres", async () => {
    const db = d1Con({ calendario: CAL() });
    await expect(enviarAprobacion(db, { token: TESTIGO, postId: "", estado: "aprobado" }))
      .rejects.toThrow("Identificador inválido");
    await expect(enviarAprobacion(db, { token: TESTIGO, postId: "x".repeat(201), estado: "aprobado" }))
      .rejects.toThrow("Identificador inválido");
  });

  it("rechaza un post que no pertenece al calendario", async () => {
    const db = d1Con({ calendario: CAL() });
    await expect(enviarAprobacion(db, { token: TESTIGO, postId: "ajeno", estado: "aprobado" }))
      .rejects.toThrow("no pertenece a este calendario");
    expect(db.escrituras).toHaveLength(0);
  });

  it("rechaza sugerencias si el calendario no permite editar", async () => {
    const db = d1Con({ calendario: CAL() });
    await expect(enviarAprobacion(db, {
      token: TESTIGO, postId: "p1", estado: "cambios", sugeridaDescripcion: "otra",
    })).rejects.toThrow("edición no está habilitada");
  });

  it("las acepta cuando sí lo permite", async () => {
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    const r = await enviarAprobacion(db, {
      token: TESTIGO, postId: "p1", estado: "cambios", sugeridoGuion: "nuevo guion",
    });
    // Devuelve además a QUÉ calendario y a qué espacio pertenece la
    // respuesta. Sin eso, el Worker no sabría a qué Durable Object avisar
    // y la agencia no vería la aprobación hasta la siguiente vuelta del
    // sondeo. Son ids internos: la respuesta HTTP no los reenvía.
    expect(r).toEqual({
      ok: true, estado: "cambios",
      calendarId: "cal1", ownerId: "dueno1", postId: "p1",
    });
    expect(db.escrituras).toHaveLength(1);
  });

  it("trunca comentario a 2000, revisor a 120 y sugerencias a 5000", async () => {
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    await enviarAprobacion(db, {
      token: TESTIGO, postId: "p1", estado: "cambios",
      comentario: "c".repeat(5000), revisor: "r".repeat(500),
      sugeridaDescripcion: "d".repeat(9000), sugeridoGuion: "g".repeat(9000),
    });
    const b = db.escrituras[0].binds;
    expect(b[4]).toHaveLength(2000);
    expect(b[5]).toHaveLength(120);
    expect(b[6]).toHaveLength(5000);
    expect(b[7]).toHaveLength(5000);
  });

  it("escribe un upsert por (calendar_id, post_id)", async () => {
    const db = d1Con({ calendario: CAL() });
    await enviarAprobacion(db, { token: TESTIGO, postId: "p1", estado: "aprobado" });
    expect(db.escrituras[0].sql).toContain("on conflict (calendar_id, post_id) do update");
  });
});

describe("actualizarContenido: quirúrgico, como el jsonb_set original", () => {
  it("exige que el calendario permita editar", async () => {
    const db = d1Con({ calendario: CAL() });
    await expect(actualizarContenido(db, { token: TESTIGO, postId: "p1", descripcion: "x" }))
      .rejects.toThrow("edición no está habilitada");
  });

  it("cambia SÓLO descripcion y guion, y deja el resto del post intacto", async () => {
    // Reescribir la publicación entera no da ningún error: da una idea,
    // una imagen o una hora de publicación que desaparece.
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    await actualizarContenido(db, { token: TESTIGO, postId: "p1", descripcion: "nueva" });

    const days = JSON.parse(db.escrituras[0].binds[0]);
    expect(days[0].posts[0]).toEqual({
      id: "p1", idea: "Una idea", guion: "Un guion", descripcion: "nueva",
      image: "clientes/c1/posts/a.jpg", format: "reel", publishTime: "18:00",
    });
  });

  it("no toca el guion si no se manda", async () => {
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    await actualizarContenido(db, { token: TESTIGO, postId: "p1", descripcion: "nueva" });
    expect(JSON.parse(db.escrituras[0].binds[0])[0].posts[0].guion).toBe("Un guion");
  });

  it("trunca a 10.000", async () => {
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    await actualizarContenido(db, { token: TESTIGO, postId: "p1", guion: "g".repeat(20000) });
    expect(JSON.parse(db.escrituras[0].binds[0])[0].posts[0].guion).toHaveLength(10000);
  });

  it("rechaza un post que no está, sin escribir nada", async () => {
    const db = d1Con({ calendario: { ...CAL(), allow_editing: 1 } });
    await expect(actualizarContenido(db, { token: TESTIGO, postId: "ajeno", descripcion: "x" }))
      .rejects.toThrow("no pertenece a este calendario");
    expect(db.escrituras).toHaveLength(0);
  });
});

describe("mediaPermitida: el testigo no abre los medios de otro", () => {
  it("permite una imagen del propio calendario", async () => {
    const db = d1Con({ calendario: CAL() });
    expect(await mediaPermitida(db, TESTIGO, "clientes/c1/posts/a.jpg")).toBe(true);
    expect(await mediaPermitida(db, TESTIGO, "clientes/c1/referencias/b.png")).toBe(true);
  });

  it("permite el logo del cliente de ese calendario", async () => {
    const db = d1Con({ calendario: CAL() });
    expect(await mediaPermitida(db, TESTIGO, "clientes/c1/logo.jpg")).toBe(true);
  });

  it("NIEGA una clave de otro cliente", async () => {
    // Sin esta vuelta bastaría con cambiar la clave en la dirección para
    // ver los medios de cualquier otro cliente de la agencia.
    const db = d1Con({ calendario: CAL() });
    expect(await mediaPermitida(db, TESTIGO, "clientes/OTRO/posts/x.jpg")).toBe(false);
  });
});
