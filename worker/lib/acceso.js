// ============================================================
// La capa de acceso a D1
//
// EL PROBLEMA QUE RESUELVE
//
// Supabase tenía dieciséis políticas RLS haciendo de segunda red: aunque
// el código pidiera mal los datos, Postgres no devolvía filas de otro
// dueño. D1 no tiene nada de eso. Una consulta a la que se le olvide el
// `owner_id` NO FALLA: devuelve datos ajenos, en silencio.
//
// Con una sola cuenta de agencia es invisible —es exactamente la forma
// del fallo que 20260915182356_cerrar_brechas_rls.sql ya arregló una vez
// en el banco de contenido, donde tres políticas se llamaban «own» y su
// única condición era el bucket—. Con el hub y varias personas, deja de
// serlo.
//
// LA REGLA
//
// Fuera de este fichero no se llama a `db.prepare(...)`. Nunca. Las
// tablas con dueño sólo se tocan por estas funciones, que reciben el
// `ownerId` al construirse y no ofrecen ninguna forma de omitirlo.
// `tests/despliegue/acceso.test.js` lo vigila.
//
// QUÉ ES HOY `ownerId`
//
// El ESPACIO DE TRABAJO, no quien ha iniciado sesión. Mientras hubo una
// sola cuenta las dos cosas coincidían y el nombre no mentía; con dos
// personas en la misma agencia, sí: los clientes son de la agencia, y
// los ve igual quien los creó que quien entró ayer.
//
// El espacio se identifica por el id del administrador que lo fundó, así
// que **las filas de antes siguen valiendo sin tocar una sola**. Quien
// traduce «este usuario → este espacio» es `worker/lib/sesion.js`: aquí
// no puede hacerse, porque hace falta el espacio para construir esto.
// ============================================================

/**
 * Tablas cuyas filas pertenecen a alguien. Toda consulta sobre ellas
 * lleva `owner_id = ?` añadido por la capa, no por quien la escribe.
 */
export const TABLAS_CON_DUENO = Object.freeze([
  "clients",
  "calendars",
  "chat_messages",
  "client_memories",
  "client_tasks",
  "task_templates",
  "content_bank",
  "quick_tasks",
  "image_templates",
  "image_references",
  "chat_resumenes",
  // Del equipo. Tienen dueño como las demás: la lista de miembros de un
  // espacio es un dato del espacio, y pedirla sin acotar devolvería la
  // plantilla de otra agencia. Quien resuelve «este usuario, ¿de qué
  // espacio es?» NO es esta capa —no puede: hace falta el espacio para
  // construirla— sino sesion.js, que es quien define al dueño.
  "memberships",
  "invitaciones",
  "responsables",
  "ajustes_espacio",
]);

/**
 * `approvals` no tiene `owner_id`: pertenece a su calendario, y el
 * calendario tiene dueño. Se acota por ese salto, no por columna, que es
 * lo que hacía su política RLS.
 */
export const TABLAS_POR_CALENDARIO = Object.freeze(["approvals"]);

const CON_DUENO = new Set(TABLAS_CON_DUENO);
const POR_CALENDARIO = new Set(TABLAS_POR_CALENDARIO);

/** Sin esto, un nombre de tabla que venga de fuera entra en el SQL. */
function exigirTabla(tabla) {
  if (!CON_DUENO.has(tabla) && !POR_CALENDARIO.has(tabla)) {
    throw new Error(`Tabla no permitida: «${tabla}»`);
  }
  return tabla;
}

function exigirColumnas(cols) {
  for (const c of cols) {
    if (!/^[a-z_][a-z0-9_]*$/.test(c)) throw new Error(`Columna no permitida: «${c}»`);
  }
  return cols;
}

const ahora = () => new Date().toISOString();

/**
 * Construye el acceso para UNA sesión. El `ownerId` —el espacio, ver la
 * cabecera— se fija aquí y ya no vuelve a pasar por parámetro: así no
 * hay ninguna llamada en la que se pueda olvidar.
 */
export function crearAcceso(db, ownerId) {
  if (!ownerId || typeof ownerId !== "string") {
    throw new Error("crearAcceso necesita un ownerId: sin él no hay nada que acotar.");
  }

  /** Añade el dueño a un WHERE que puede traer más condiciones. */
  function acotar(tabla, where = {}) {
    exigirTabla(tabla);
    const cols = exigirColumnas(Object.keys(where));
    const valores = cols.map((c) => where[c]);

    if (CON_DUENO.has(tabla)) {
      return {
        sql: [...cols.map((c) => `${c} = ?`), "owner_id = ?"].join(" and "),
        valores: [...valores, ownerId],
      };
    }
    // approvals: el dueño está un salto más allá.
    return {
      sql: [
        ...cols.map((c) => `${c} = ?`),
        "calendar_id in (select id from calendars where owner_id = ?)",
      ].join(" and "),
      valores: [...valores, ownerId],
    };
  }

  return {
    ownerId,

    async leer(tabla, where = {}, orden = "created_at asc") {
      const { sql, valores } = acotar(tabla, where);
      const { results } = await db
        .prepare(`select * from ${tabla} where ${sql} order by ${orden}`)
        .bind(...valores)
        .all();
      return results ?? [];
    },

    async leerUno(tabla, where = {}) {
      const { sql, valores } = acotar(tabla, where);
      return db.prepare(`select * from ${tabla} where ${sql} limit 1`).bind(...valores).first();
    },

    /**
     * El `owner_id` lo pone la capa y PISA lo que traiga `datos`: si el
     * cuerpo de una petición pudiera fijarlo, cualquiera escribiría en
     * nombre de otro.
     */
    async insertar(tabla, datos) {
      exigirTabla(tabla);
      const fila = CON_DUENO.has(tabla) ? { ...datos, owner_id: ownerId } : { ...datos };
      const cols = exigirColumnas(Object.keys(fila));
      await db
        .prepare(`insert into ${tabla} (${cols.join(",")}) values (${cols.map(() => "?").join(",")})`)
        .bind(...cols.map((c) => fila[c]))
        .run();
      return fila;
    },

    /** Reemplaza la fila entera; mantiene `updated_at` al día. */
    async guardar(tabla, datos) {
      exigirTabla(tabla);
      const fila = CON_DUENO.has(tabla) ? { ...datos, owner_id: ownerId } : { ...datos };
      if ("updated_at" in fila) fila.updated_at = ahora();
      const cols = exigirColumnas(Object.keys(fila));
      const sinId = cols.filter((c) => c !== "id");
      await db
        .prepare(
          `insert into ${tabla} (${cols.join(",")}) values (${cols.map(() => "?").join(",")}) ` +
            `on conflict (id) do update set ${sinId.map((c) => `${c} = excluded.${c}`).join(", ")} ` +
            `where ${tabla}.owner_id = ?`,
        )
        .bind(...cols.map((c) => fila[c]), ownerId)
        .run();
      return fila;
    },

    async actualizar(tabla, where, cambios) {
      const { sql, valores } = acotar(tabla, where);
      const campos = { ...cambios };
      const cols = exigirColumnas(Object.keys(campos));
      if (!cols.length) throw new Error("actualizar sin cambios");
      const { meta } = await db
        .prepare(`update ${tabla} set ${cols.map((c) => `${c} = ?`).join(", ")} where ${sql}`)
        .bind(...cols.map((c) => campos[c]), ...valores)
        .run();
      return meta?.changes ?? 0;
    },

    async borrar(tabla, where) {
      const { sql, valores } = acotar(tabla, where);
      const { meta } = await db.prepare(`delete from ${tabla} where ${sql}`).bind(...valores).run();
      return meta?.changes ?? 0;
    },
  };
}
