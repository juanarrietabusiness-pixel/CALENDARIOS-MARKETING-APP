import { describe, it, expect } from "vitest";
import {
  usuarioDeLaPeticion, perfilDeUsuario, nombrePorCorreo, colorDeNombre,
  invitacionPorTestigo, aceptarInvitacion, expulsarDelEspacio,
  cookieSesion, COOKIE,
} from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// El equipo
//
// LA PREGUNTA QUE CONTESTAN ESTOS CASOS
//
// «¿De qué espacio es quien acaba de entrar?» Antes no había pregunta:
// el dueño de las filas ERA quien iniciaba sesión, porque sólo había una
// cuenta. Ahora son dos cosas distintas —la persona y el espacio— y
// confundirlas tiene dos formas de fallar, las dos silenciosas:
//
//   · Acotar por la persona: quien entra por invitación abre el panel y
//     no ve ningún cliente. La aplicación «funciona» y está vacía.
//   · Dejar que el espacio venga del cuerpo de una petición: cualquiera
//     con un enlace se mete en el espacio que quiera. Es exactamente la
//     forma del fallo que la capa de acceso existe para impedir.
// ============================================================

/**
 * Una D1 de mentira con tablas en memoria.
 *
 * No interpreta SQL: reconoce por la forma de la consulta cuál es y
 * contesta. Es suficiente y no esconde nada, porque lo que se está
 * comprobando es la LÓGICA de pertenencia, no el motor.
 */
function d1Falsa({ users = [], memberships = [], invitaciones = [], sessions = [] } = {}) {
  const tablas = { users, memberships, invitaciones, sessions };
  const ejecutadas = [];

  const responder = (sql, binds) => {
    const s = sql.toLowerCase().replace(/\s+/g, " ");

    // La sesión: join de sessions + users + memberships.
    if (s.includes("from sessions s")) {
      const ses = tablas.sessions.find((x) => x.token_hash === binds[0]);
      if (!ses || ses.expires_at <= binds[1]) return null;
      const u = tablas.users.find((x) => x.id === ses.user_id);
      if (!u) return null;
      const m = tablas.memberships.find((x) => x.user_id === u.id);
      return { id: u.id, email: u.email, owner_id: m?.owner_id ?? null, rol: m?.rol ?? null, nombre: m?.nombre ?? null, color: m?.color ?? null };
    }

    if (s.startsWith("select owner_id, rol, nombre, color, solo_lectura, clientes from memberships")) {
      return tablas.memberships.find((x) => x.user_id === binds[0]) ?? null;
    }

    if (s.startsWith("select user_id from memberships")) {
      return tablas.memberships.find((x) => x.user_id === binds[0] && x.owner_id === binds[1]) ?? null;
    }

    if (s.includes("from invitaciones i")) {
      const inv = tablas.invitaciones.find((x) => x.token_hash === binds[0]);
      if (!inv) return null;
      const quien = tablas.memberships.find((x) => x.user_id === inv.creada_por);
      return { ...inv, invita: quien?.nombre ?? null };
    }

    if (s.startsWith("select id from users where email")) {
      return tablas.users.find((x) => x.email === binds[0]) ?? null;
    }

    if (s.startsWith("insert or ignore into memberships")) {
      const [user_id, owner_id, nombre, color, created_at] = binds;
      if (!tablas.memberships.some((x) => x.user_id === user_id)) {
        tablas.memberships.push({ user_id, owner_id, rol: "admin", nombre, color, created_at });
      }
      return null;
    }

    if (s.startsWith("insert into users")) {
      const [id, email, password_hash, salt, created_at] = binds;
      tablas.users.push({ id, email, password_hash, salt, created_at });
      return null;
    }

    if (s.startsWith("insert into memberships")) {
      const [user_id, owner_id, rol, nombre, color, created_at] = binds;
      tablas.memberships.push({ user_id, owner_id, rol, nombre, color, created_at });
      return null;
    }

    if (s.startsWith("update invitaciones set aceptada_at")) {
      const inv = tablas.invitaciones.find((x) => x.id === binds[1]);
      if (inv) inv.aceptada_at = binds[0];
      return null;
    }

    if (s.startsWith("insert into sessions")) {
      tablas.sessions.push({ token_hash: binds[0], user_id: binds[1], created_at: binds[2], expires_at: binds[3] });
      return null;
    }

    if (s.startsWith("delete from users where id")) {
      const antes = tablas.users.length;
      tablas.users = tablas.users.filter((x) => x.id !== binds[0]);
      // La cascada real la hace SQLite; aquí se imita para que el estado
      // final del test sea el que de verdad queda en la base.
      tablas.memberships = tablas.memberships.filter((x) => x.user_id !== binds[0]);
      tablas.sessions = tablas.sessions.filter((x) => x.user_id !== binds[0]);
      return { changes: antes - tablas.users.length };
    }

    return null;
  };

  const db = {
    tablas,
    ejecutadas,
    prepare(sql) {
      const llamada = { sql, binds: [] };
      ejecutadas.push(llamada);
      return {
        bind(...args) { llamada.binds = args; return this; },
        first: async () => responder(sql, llamada.binds),
        all: async () => ({ results: [] }),
        run: async () => ({ meta: responder(sql, llamada.binds) ?? { changes: 1 } }),
      };
    },
    async batch(sentencias) {
      for (const s of sentencias) await s.run();
      return sentencias.map(() => ({ success: true }));
    },
  };
  return db;
}

const peticion = (testigo) =>
  new Request("https://x/api/yo", { headers: { Cookie: `${COOKIE}=${testigo}` } });

const DENTRO_DE_UN_ANO = new Date(Date.now() + 365 * 24 * 3600_000).toISOString();
const AYER = new Date(Date.now() - 24 * 3600_000).toISOString();

async function conSesion(extra = {}) {
  const testigo = "un-testigo-de-prueba";
  return {
    testigo,
    db: d1Falsa({
      users: [{ id: "u-jefe", email: "jefe@agencia.com" }, ...(extra.users ?? [])],
      sessions: [{ token_hash: await sha256(testigo), user_id: extra.userId ?? "u-jefe", expires_at: DENTRO_DE_UN_ANO }],
      ...extra,
    }),
  };
}

describe("de quién es este espacio", () => {
  it("quien fue invitado trabaja en el espacio de quien le invitó, no en el suyo", async () => {
    // Es LO de esta migración. Si `ownerId` fuera el id de la persona,
    // la pareja entraría a un panel vacío sin ningún error a la vista.
    const testigo = "t";
    const db = d1Falsa({
      users: [{ id: "u-jefe", email: "jefe@a.com" }, { id: "u-pareja", email: "pareja@a.com" }],
      memberships: [
        { user_id: "u-jefe", owner_id: "u-jefe", rol: "admin", nombre: "Juan", color: "#1E90FF" },
        { user_id: "u-pareja", owner_id: "u-jefe", rol: "editor", nombre: "Ana", color: "#22C55E" },
      ],
      sessions: [{ token_hash: await sha256(testigo), user_id: "u-pareja", expires_at: DENTRO_DE_UN_ANO }],
    });

    const usuario = await usuarioDeLaPeticion(db, peticion(testigo));
    expect(usuario.id).toBe("u-pareja");
    expect(usuario.ownerId).toBe("u-jefe");
    expect(usuario.rol).toBe("editor");
    expect(usuario.nombre).toBe("Ana");
  });

  it("el administrador de siempre funda su espacio la primera vez, sin migrar ninguna fila", async () => {
    // Las filas que ya existen llevan su id en `owner_id`: al fundarse
    // con ese mismo id, siguen siendo suyas sin tocar nada.
    const { db, testigo } = await conSesion();
    const usuario = await usuarioDeLaPeticion(db, peticion(testigo));

    expect(usuario.ownerId).toBe("u-jefe");
    expect(usuario.rol).toBe("admin");
    expect(db.tablas.memberships).toHaveLength(1);
    expect(db.tablas.memberships[0]).toMatchObject({ user_id: "u-jefe", owner_id: "u-jefe", rol: "admin" });
  });

  it("sin cookie no hay usuario, y no se consulta nada", async () => {
    const db = d1Falsa();
    expect(await usuarioDeLaPeticion(db, new Request("https://x/api/yo"))).toBeNull();
    expect(db.ejecutadas).toHaveLength(0);
  });

  it("una sesión caducada no vale aunque la fila siga ahí", async () => {
    const testigo = "t";
    const db = d1Falsa({
      users: [{ id: "u1", email: "a@b.c" }],
      sessions: [{ token_hash: await sha256(testigo), user_id: "u1", expires_at: AYER }],
    });
    expect(await usuarioDeLaPeticion(db, peticion(testigo))).toBeNull();
  });

  it("perfilDeUsuario da lo mismo que la cookie, partiendo del id", async () => {
    const db = d1Falsa({
      memberships: [{ user_id: "u1", owner_id: "u9", rol: "editor", nombre: "Ana", color: "#123456" }],
    });
    expect(await perfilDeUsuario(db, "u1", "ana@a.com")).toEqual({
      id: "u1", email: "ana@a.com", ownerId: "u9", rol: "editor", nombre: "Ana", color: "#123456",
      soloLectura: false, clientes: null,
    });
  });

  it("los papeles finos: sólo lectura y colaborador de algunos clientes; al admin no le afectan", async () => {
    const db = d1Falsa({
      memberships: [{ user_id: "u1", owner_id: "u9", rol: "editor", nombre: "Ana", color: "#123456", solo_lectura: 1, clientes: '["c1"]' }],
    });
    expect(await perfilDeUsuario(db, "u1", "ana@a.com")).toMatchObject({ soloLectura: true, clientes: ["c1"] });
    const admin = d1Falsa({
      memberships: [{ user_id: "u1", owner_id: "u9", rol: "admin", nombre: "Ana", color: "#123456", solo_lectura: 1, clientes: '["c1"]' }],
    });
    expect(await perfilDeUsuario(admin, "u1", "ana@a.com")).toMatchObject({ soloLectura: false, clientes: null });
  });

  it("un nombre en blanco cae al trozo del correo, no a una cadena vacía", async () => {
    const db = d1Falsa({
      memberships: [{ user_id: "u1", owner_id: "u1", rol: "admin", nombre: "", color: "#1E90FF" }],
    });
    const p = await perfilDeUsuario(db, "u1", "juancito@agencia.com");
    expect(p.nombre).toBe("juancito");
    expect(nombrePorCorreo("juancito@agencia.com")).toBe("juancito");
  });
});

describe("el enlace de invitación", () => {
  const TESTIGO = "testigo-de-invitacion-largo";

  const conInvitacion = async (cambios = {}) =>
    d1Falsa({
      users: [{ id: "u-jefe", email: "jefe@a.com" }],
      memberships: [{ user_id: "u-jefe", owner_id: "u-jefe", rol: "admin", nombre: "Juan", color: "#1E90FF" }],
      invitaciones: [{
        id: "inv1", owner_id: "u-jefe", token_hash: await sha256(TESTIGO),
        email: "ana@a.com", nombre: "Ana", rol: "editor", creada_por: "u-jefe",
        expires_at: DENTRO_DE_UN_ANO, aceptada_at: null, ...cambios,
      }],
    });

  it("se busca por la HUELLA del testigo, nunca por el testigo", async () => {
    // En la base sólo está el SHA-256. Un volcado de D1 —o una consulta
    // de más— no puede devolver enlaces utilizables.
    const db = await conInvitacion();
    await invitacionPorTestigo(db, TESTIGO);
    const consulta = db.ejecutadas.at(-1);
    expect(consulta.sql).toContain("token_hash = ?");
    expect(consulta.binds[0]).toBe(await sha256(TESTIGO));
    expect(consulta.binds[0]).not.toBe(TESTIGO);
  });

  it("cuenta quién invita, para que el enlace no parezca una suplantación", async () => {
    const db = await conInvitacion();
    const inv = await invitacionPorTestigo(db, TESTIGO);
    expect(inv.invita).toBe("Juan");
    expect(inv.caducada).toBe(false);
    expect(inv.aceptada).toBe(false);
  });

  it("caducada y ya usada se distinguen: las dos se arreglan igual, pero no son lo mismo", async () => {
    expect((await invitacionPorTestigo(await conInvitacion({ expires_at: AYER }), TESTIGO)).caducada).toBe(true);
    expect((await invitacionPorTestigo(await conInvitacion({ aceptada_at: AYER }), TESTIGO)).aceptada).toBe(true);
  });

  it("un testigo que no existe no es un 500", async () => {
    expect(await invitacionPorTestigo(await conInvitacion(), "otro-testigo")).toBeNull();
    expect(await invitacionPorTestigo(await conInvitacion(), "")).toBeNull();
  });

  it("aceptarla crea la persona DENTRO del espacio de quien invitó", async () => {
    const db = await conInvitacion();
    const r = await aceptarInvitacion(db, TESTIGO, {
      email: "ana@a.com", contrasena: "una-contrasena-larga", nombre: "Ana",
    });

    expect(r.usuario.ownerId).toBe("u-jefe");
    expect(r.usuario.rol).toBe("editor");
    expect(db.tablas.users).toHaveLength(2);
    expect(db.tablas.memberships.at(-1)).toMatchObject({ owner_id: "u-jefe", rol: "editor", nombre: "Ana" });
    // Y deja la sesión abierta: acaba de escribir la contraseña, pedirla
    // otra vez en la pantalla siguiente no protege nada.
    expect(db.tablas.sessions).toHaveLength(1);
    expect(cookieSesion(r.testigo)).toContain("HttpOnly");
  });

  it("el espacio y el papel salen de la INVITACIÓN, no del cuerpo de la petición", async () => {
    // Si vinieran del cuerpo, cualquiera con un enlace se haría
    // administrador del espacio que quisiera escribiendo otro id.
    const db = await conInvitacion();
    const r = await aceptarInvitacion(db, TESTIGO, {
      email: "ana@a.com", contrasena: "una-contrasena-larga", nombre: "Ana",
      // Lo que un atacante intentaría colar:
      rol: "admin", ownerId: "el-espacio-de-otro", owner_id: "el-espacio-de-otro",
    });
    expect(r.usuario.rol).toBe("editor");
    expect(r.usuario.ownerId).toBe("u-jefe");
  });

  it("no se puede usar dos veces, ni caducada", async () => {
    const usada = await conInvitacion({ aceptada_at: AYER });
    await expect(aceptarInvitacion(usada, TESTIGO, { email: "a@b.c", contrasena: "doce-caracteres-o-mas" }))
      .rejects.toThrow(/ya se usó/i);

    const vieja = await conInvitacion({ expires_at: AYER });
    await expect(aceptarInvitacion(vieja, TESTIGO, { email: "a@b.c", contrasena: "doce-caracteres-o-mas" }))
      .rejects.toThrow(/caducad/i);
  });

  it("exige contraseña de doce y correo con forma de correo", async () => {
    const db = await conInvitacion();
    await expect(aceptarInvitacion(db, TESTIGO, { email: "ana@a.com", contrasena: "corta" }))
      .rejects.toThrow(/12 caracteres/);
    await expect(aceptarInvitacion(db, TESTIGO, { email: "no-es-un-correo", contrasena: "doce-caracteres-o-mas" }))
      .rejects.toThrow(/no es válido/);
    // Nada de lo anterior llegó a crear a nadie.
    expect(db.tablas.users).toHaveLength(1);
  });

  it("un correo que ya tiene cuenta no crea una segunda", async () => {
    const db = await conInvitacion();
    db.tablas.users.push({ id: "u-ana", email: "ana@a.com" });
    await expect(aceptarInvitacion(db, TESTIGO, { email: "ana@a.com", contrasena: "doce-caracteres-o-mas" }))
      .rejects.toThrow(/ya hay una cuenta/i);
  });

  it("la contraseña no se guarda: se guarda su derivación, con sal propia", async () => {
    const db = await conInvitacion();
    await aceptarInvitacion(db, TESTIGO, { email: "ana@a.com", contrasena: "una-contrasena-larga", nombre: "Ana" });
    const nueva = db.tablas.users.at(-1);
    expect(nueva.password_hash).not.toContain("una-contrasena-larga");
    expect(nueva.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(nueva.password_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sacar a alguien del espacio", () => {
  const espacio = () => d1Falsa({
    users: [{ id: "u-jefe", email: "jefe@a.com" }, { id: "u-pareja", email: "pareja@a.com" }],
    memberships: [
      { user_id: "u-jefe", owner_id: "u-jefe", rol: "admin", nombre: "Juan", color: "#1E90FF" },
      { user_id: "u-pareja", owner_id: "u-jefe", rol: "editor", nombre: "Ana", color: "#22C55E" },
    ],
    sessions: [{ token_hash: "h", user_id: "u-pareja", expires_at: DENTRO_DE_UN_ANO }],
  });

  it("se lleva su cuenta y sus sesiones", async () => {
    // Dejar la cuenta viva sin pertenencia sería peor: al volver a
    // entrar, la resolución de espacio le fundaría uno propio y vacío, y
    // vería una aplicación que funciona y no tiene nada dentro.
    const db = espacio();
    expect(await expulsarDelEspacio(db, "u-jefe", "u-pareja")).toBe(1);
    expect(db.tablas.users.map((u) => u.id)).toEqual(["u-jefe"]);
    expect(db.tablas.memberships.map((m) => m.user_id)).toEqual(["u-jefe"]);
    expect(db.tablas.sessions).toHaveLength(0);
  });

  it("al fundador NO, porque la cascada se llevaría el espacio entero", async () => {
    // Los clientes y calendarios cuelgan de su id: borrarlo los borra.
    const db = espacio();
    await expect(expulsarDelEspacio(db, "u-jefe", "u-jefe")).rejects.toThrow(/fundó el espacio/);
    expect(db.tablas.users).toHaveLength(2);
  });

  it("a alguien de otro espacio tampoco, aunque se sepa su id", async () => {
    const db = espacio();
    expect(await expulsarDelEspacio(db, "otro-espacio", "u-pareja")).toBe(0);
    expect(db.tablas.users).toHaveLength(2);
  });
});

describe("el color de cada persona", () => {
  it("es el mismo siempre para el mismo nombre", () => {
    // Si cambiara entre sesiones, el color dejaría de servir para
    // reconocer a nadie, que es para lo único que está.
    expect(colorDeNombre("Ana")).toBe(colorDeNombre("Ana"));
    expect(colorDeNombre("Ana")).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("y nombres distintos tienden a colores distintos", () => {
    const colores = new Set(["Ana", "Juan", "María", "Pedro", "Lucía"].map(colorDeNombre));
    expect(colores.size).toBeGreaterThan(1);
  });
});
