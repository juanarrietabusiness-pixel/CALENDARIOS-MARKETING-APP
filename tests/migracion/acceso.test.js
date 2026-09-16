import { describe, it, expect } from "vitest";
import { crearAcceso, TABLAS_CON_DUENO, TABLAS_POR_CALENDARIO } from "../../worker/lib/acceso.js";

/** D1 de mentira: no ejecuta nada, apunta lo que se le pide. */
function d1Falsa() {
  const llamadas = [];
  return {
    llamadas,
    ultima: () => llamadas[llamadas.length - 1],
    prepare(sql) {
      const llamada = { sql, binds: [] };
      llamadas.push(llamada);
      return {
        bind(...args) { llamada.binds = args; return this; },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  };
}

describe("la capa de acceso sustituye a las 16 políticas RLS", () => {
  it("no se puede construir sin dueño", () => {
    // Sin esta guarda, un fallo al resolver la sesión produciría un
    // acceso «de nadie» que consulta sin acotar: exactamente lo que D1
    // no impide por su cuenta.
    expect(() => crearAcceso(d1Falsa(), null)).toThrow(/ownerId/);
    expect(() => crearAcceso(d1Falsa(), "")).toThrow(/ownerId/);
  });

  // Los métodos son async, así que rechazan la promesa en vez de lanzar
  // en el acto. En un Worker eso es un 500: ruidoso, que es lo que se
  // quiere. Lo que no puede pasar es que la consulta llegue a D1.
  it("rechaza una tabla que no está en la lista", async () => {
    const db = d1Falsa();
    const a = crearAcceso(db, "u1");
    await expect(a.leer("users")).rejects.toThrow(/no permitida/);
    await expect(a.leer("clients; drop table clients")).rejects.toThrow(/no permitida/);
    expect(db.llamadas).toHaveLength(0);
  });

  it("rechaza un nombre de columna que no es un identificador", async () => {
    const db = d1Falsa();
    const a = crearAcceso(db, "u1");
    await expect(a.leer("clients", { "id = 1 or 1": 1 })).rejects.toThrow(/Columna no permitida/);
    expect(db.llamadas).toHaveLength(0);
  });
});

describe("toda consulta sobre una tabla con dueño lleva el dueño", () => {
  // El bucle es lo que importa: añadir una tabla a TABLAS_CON_DUENO la
  // mete en el test sin que nadie tenga que acordarse.
  for (const tabla of TABLAS_CON_DUENO) {
    it(`${tabla}: leer, leerUno, borrar y actualizar acotan por owner_id`, async () => {
      const db = d1Falsa();
      const a = crearAcceso(db, "u1");

      await a.leer(tabla);
      expect(db.ultima().sql).toContain("owner_id = ?");
      expect(db.ultima().binds).toEqual(["u1"]);

      await a.leerUno(tabla, { id: "x" });
      expect(db.ultima().sql).toMatch(/id = \? and owner_id = \?/);
      expect(db.ultima().binds).toEqual(["x", "u1"]);

      await a.borrar(tabla, { id: "x" });
      expect(db.ultima().sql).toMatch(/^delete from .* where id = \? and owner_id = \?$/);
      expect(db.ultima().binds).toEqual(["x", "u1"]);

      await a.actualizar(tabla, { id: "x" }, { title: "t" });
      expect(db.ultima().sql).toContain("owner_id = ?");
      expect(db.ultima().binds).toEqual(["t", "x", "u1"]);
    });

    it(`${tabla}: insertar impone el dueño y no deja que lo fije el cuerpo`, async () => {
      // Si el cuerpo de una petición pudiera traer su propio owner_id,
      // cualquiera escribiría en nombre de otro. Se pisa, no se confía.
      const db = d1Falsa();
      const a = crearAcceso(db, "u1");
      const fila = await a.insertar(tabla, { id: "x", owner_id: "EL_DE_OTRO" });
      expect(fila.owner_id).toBe("u1");
      const i = db.ultima().sql.match(/\(([^)]+)\) values/)[1].split(",").indexOf("owner_id");
      expect(db.ultima().binds[i]).toBe("u1");
    });
  }
});

describe("approvals no tiene owner_id: se acota por su calendario", () => {
  for (const tabla of TABLAS_POR_CALENDARIO) {
    it(`${tabla}: la condición salta a calendars`, async () => {
      // Es lo que hacía su política RLS: un EXISTS contra calendars.
      // Acotar por calendar_id a secas dejaría leer las aprobaciones de
      // cualquier calendario cuyo id se adivine o se filtre.
      const db = d1Falsa();
      const a = crearAcceso(db, "u1");

      await a.leer(tabla, { calendar_id: "cal1" });
      expect(db.ultima().sql).toContain("calendar_id in (select id from calendars where owner_id = ?)");
      expect(db.ultima().binds).toEqual(["cal1", "u1"]);
    });

    it(`${tabla}: insertar NO inventa un owner_id que la tabla no tiene`, async () => {
      const db = d1Falsa();
      const a = crearAcceso(db, "u1");
      const fila = await a.insertar(tabla, { id: "a1", calendar_id: "cal1" });
      expect(fila.owner_id).toBeUndefined();
      expect(db.ultima().sql).not.toContain("owner_id");
    });
  }
});

describe("guardar: el upsert también va acotado", () => {
  it("el on conflict no puede pisar la fila de otro dueño", async () => {
    // Sin el `where owner_id = ?` final, un upsert con el id de una fila
    // ajena la sobrescribiría: el INSERT choca, el UPDATE gana, y el dato
    // de otro desaparece sin ningún error.
    const db = d1Falsa();
    const a = crearAcceso(db, "u1");
    await a.guardar("clients", { id: "c1", name: "Nuevo", updated_at: null });

    expect(db.ultima().sql).toContain("on conflict (id) do update");
    expect(db.ultima().sql).toMatch(/where clients\.owner_id = \?$/);
    expect(db.ultima().binds[db.ultima().binds.length - 1]).toBe("u1");
  });

  it("refresca updated_at cuando la fila lo tiene", async () => {
    const a = crearAcceso(d1Falsa(), "u1");
    const fila = await a.guardar("clients", { id: "c1", updated_at: "2020-01-01T00:00:00.000Z" });
    expect(fila.updated_at).not.toBe("2020-01-01T00:00:00.000Z");
    expect(fila.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
