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
  "consumo_ia",
  "integracion_drive",
  "integracion_meta",
  "cuentas_sociales",
  "publicaciones_programadas",
  "metricas_cuenta",
  "metricas_publicacion",
  "metricas_competencia",
  "informes",
  "auditorias",
  "mcp_codigos",
  "mcp_tokens",
  // El trabajo en equipo: la bandeja de avisos de cada persona, el hilo
  // interno de cada publicación y quién cambió qué.
  "avisos",
  "notas_equipo",
  "historial",
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
export const TABLAS_POR_CALENDARIO = Object.freeze(["approvals", "comentarios_aprobacion"]);

/**
 * Las tablas cuyas filas son de UN cliente (`client_id`). Con un
 * colaborador —alguien que sólo lleva algunos clientes— la capa añade
 * `client_id in (…)` a todo lo que lee y comprueba el cliente de todo lo
 * que escribe, igual que añade el dueño: aquí, no en cada ruta, que es
 * donde se olvidaría. Una fila sin cliente (una auditoría de un
 * prospecto, una cuenta sin asignar) no la ve un colaborador.
 */
export const TABLAS_CON_CLIENTE = Object.freeze([
  "calendars", "chat_messages", "chat_resumenes", "client_memories", "client_tasks", "content_bank",
  "consumo_ia", "cuentas_sociales", "image_references", "image_templates", "informes", "auditorias",
  "metricas_competencia", "metricas_cuenta", "metricas_publicacion", "publicaciones_programadas",
]);

/** Las que cuelgan de un calendario sin llevar el cliente: se acotan por el calendario. */
export const TABLAS_CON_CALENDARIO = Object.freeze(["approvals", "comentarios_aprobacion", "notas_equipo", "historial"]);

const CON_DUENO = new Set(TABLAS_CON_DUENO);
const CON_CLIENTE = new Set(TABLAS_CON_CLIENTE);
const CON_CALENDARIO = new Set(TABLAS_CON_CALENDARIO);

/** Escribir en un cliente que no es de los tuyos. Es de la petición, no del servidor. */
export class ErrorAcceso extends Error {
  constructor(mensaje = "No tienes acceso a ese cliente.") {
    super(mensaje);
    this.name = "ErrorAcceso";
    this.status = 403;
  }
}
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
export function crearAcceso(db, ownerId, { clientes = null } = {}) {
  if (!ownerId || typeof ownerId !== "string") {
    throw new Error("crearAcceso necesita un ownerId: sin él no hay nada que acotar.");
  }
  // null = todos los clientes del espacio; una lista = un colaborador.
  const limitado = Array.isArray(clientes);
  const permitidos = limitado ? clientes.map(String) : [];

  /** La condición de «sólo estos clientes» para una tabla, o null si no aplica. */
  function porCliente(tabla, alias = "") {
    if (!limitado) return null;
    const pre = alias ? `${alias}.` : "";
    const dentro = permitidos.length ? `in (${permitidos.map(() => "?").join(",")})` : null;
    const nada = { sql: "1 = 0", valores: [] };
    if (tabla === "clients") return dentro ? { sql: `${pre}id ${dentro}`, valores: permitidos } : nada;
    if (CON_CLIENTE.has(tabla)) return dentro ? { sql: `${pre}client_id ${dentro}`, valores: permitidos } : nada;
    if (CON_CALENDARIO.has(tabla)) {
      return dentro ? { sql: `${pre}calendar_id in (select id from calendars where client_id ${dentro})`, valores: permitidos } : nada;
    }
    return null;
  }

  /** Lo que se escribe tiene que ser de un cliente permitido. */
  function comprobarCliente(tabla, fila) {
    if (!limitado) return;
    const id = tabla === "clients" ? fila.id : CON_CLIENTE.has(tabla) ? fila.client_id : undefined;
    if (id === undefined) return;
    // consumo_ia sin cliente (el asistente general) no es de nadie en concreto.
    if (id === null && tabla === "consumo_ia") return;
    if (!permitidos.includes(String(id))) throw new ErrorAcceso();
  }

  /** Lo que se añade al `on conflict … where` para no pisar la fila de otro cliente con el mismo id. */
  function guardaUpsert(tabla) {
    const r = porCliente(tabla, tabla);
    return r ? { sql: ` and ${r.sql}`, valores: r.valores } : { sql: "", valores: [] };
  }

  /** Añade el dueño a un WHERE que puede traer más condiciones. */
  function acotar(tabla, where = {}) {
    exigirTabla(tabla);
    const cols = exigirColumnas(Object.keys(where));
    const valores = cols.map((c) => where[c]);
    const cliente = porCliente(tabla);
    const extra = cliente ? { sql: [cliente.sql], valores: cliente.valores } : { sql: [], valores: [] };

    if (CON_DUENO.has(tabla)) {
      return {
        sql: [...cols.map((c) => `${c} = ?`), "owner_id = ?", ...extra.sql].join(" and "),
        valores: [...valores, ownerId, ...extra.valores],
      };
    }
    // approvals: el dueño está un salto más allá.
    return {
      sql: [
        ...cols.map((c) => `${c} = ?`),
        "calendar_id in (select id from calendars where owner_id = ?)",
        ...extra.sql,
      ].join(" and "),
      valores: [...valores, ownerId, ...extra.valores],
    };
  }

  return {
    ownerId,
    /** null = todos; una lista = los clientes de un colaborador. */
    clientes: limitado ? [...permitidos] : null,

    async leer(tabla, where = {}, orden = "created_at asc", limite = null) {
      const { sql, valores } = acotar(tabla, where);
      const tope = Number.isInteger(limite) && limite > 0 ? ` limit ${limite}` : "";
      const { results } = await db
        .prepare(`select * from ${tabla} where ${sql} order by ${orden}${tope}`)
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
      comprobarCliente(tabla, fila);
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
      comprobarCliente(tabla, fila);
      if ("updated_at" in fila) fila.updated_at = ahora();
      const cols = exigirColumnas(Object.keys(fila));
      const sinId = cols.filter((c) => c !== "id");
      const guarda = guardaUpsert(tabla);
      await db
        .prepare(
          `insert into ${tabla} (${cols.join(",")}) values (${cols.map(() => "?").join(",")}) ` +
            `on conflict (id) do update set ${sinId.map((c) => `${c} = excluded.${c}`).join(", ")} ` +
            `where ${tabla}.owner_id = ?${guarda.sql}`,
        )
        .bind(...cols.map((c) => fila[c]), ownerId, ...guarda.valores)
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

    /** La suma de una columna, acotada igual que `leer`. 0 si no hay filas. */
    async sumar(tabla, columna, where = {}) {
      exigirColumnas([columna]);
      const { sql, valores } = acotar(tabla, where);
      const fila = await db
        .prepare(`select coalesce(sum(${columna}), 0) as total from ${tabla} where ${sql}`)
        .bind(...valores)
        .first();
      return Number(fila?.total ?? 0);
    },

    /**
     * Varias filas de una vez (`guardar` de cada una), en UN lote de D1:
     * la foto diaria de métricas escribe decenas, y el plan gratuito
     * cuenta las consultas por invocación.
     */
    async guardarVarios(tabla, filas) {
      exigirTabla(tabla);
      if (!filas.length) return 0;
      const guarda = guardaUpsert(tabla);
      const sentencias = filas.map((datos) => {
        const fila = CON_DUENO.has(tabla) ? { ...datos, owner_id: ownerId } : { ...datos };
        comprobarCliente(tabla, fila);
        if ("updated_at" in fila) fila.updated_at = ahora();
        const cols = exigirColumnas(Object.keys(fila));
        const sinId = cols.filter((c) => c !== "id");
        return db
          .prepare(
            `insert into ${tabla} (${cols.join(",")}) values (${cols.map(() => "?").join(",")}) ` +
              `on conflict (id) do update set ${sinId.map((c) => `${c} = excluded.${c}`).join(", ")} ` +
              `where ${tabla}.owner_id = ?${guarda.sql}`,
          )
          .bind(...cols.map((c) => fila[c]), ownerId, ...guarda.valores);
      });
      if (db.batch) await db.batch(sentencias);
      else for (const s of sentencias) await s.run();
      return filas.length;
    },

    async borrar(tabla, where) {
      const { sql, valores } = acotar(tabla, where);
      const { meta } = await db.prepare(`delete from ${tabla} where ${sql}`).bind(...valores).run();
      return meta?.changes ?? 0;
    },
  };
}

/**
 * La cola de publicación, de TODOS los espacios: lo que ya toca publicar
 * o volver a mirar. Es la única lectura sin dueño fuera de la sesión y
 * el enlace público, y por eso vive aquí: devuelve sólo id y dueño, y
 * cada fila se procesa después con `crearAcceso(db, owner_id)`, que
 * vuelve a acotar todo lo demás.
 */
export async function colaPendiente(db, ahoraISO, limite = 3) {
  const { results } = await db
    .prepare(
      `select id, owner_id from publicaciones_programadas
        where estado in ('programada','procesando')
          and programada_para <= ?
          and (siguiente_intento is null or siguiente_intento <= ?)
        order by programada_para asc
        limit ?`,
    )
    .bind(ahoraISO, ahoraISO, limite)
    .all();
  return results ?? [];
}

/**
 * Las cuentas asignadas a un cliente que aún no tienen su foto de
 * métricas de `fecha`, de todos los espacios. Igual que `colaPendiente`:
 * sólo ids y dueño, y lo demás se lee después con `crearAcceso`.
 */
export async function cuentasSinFoto(db, fecha, limite = 1) {
  const { results } = await db
    .prepare(
      `select c.id, c.owner_id from cuentas_sociales c
        where c.client_id is not null and c.red in ('instagram','facebook','tiktok')
          and not exists (select 1 from metricas_cuenta m where m.cuenta_id = c.id and m.fecha = ?)
        order by c.updated_at asc
        limit ?`,
    )
    .bind(fecha, limite)
    .all();
  return results ?? [];
}

/**
 * Los clientes con cuentas asignadas que aún no tienen informe de `mes`,
 * de todos los espacios: para el informe automático del día 1.
 */
export async function clientesSinInforme(db, mes, limite = 1) {
  const { results } = await db
    .prepare(
      `select distinct c.client_id, c.owner_id from cuentas_sociales c
        where c.client_id is not null
          and not exists (select 1 from informes i where i.client_id = c.client_id and i.mes = ?)
        limit ?`,
    )
    .bind(mes, limite)
    .all();
  return results ?? [];
}
