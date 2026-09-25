// ============================================================
// El enlace de aprobación — la superficie SIN autenticar
//
// Esto sustituye a las tres funciones `security definer` de Supabase:
// get_shared_calendar, submit_approval y update_post_content. En
// Postgres, «security definer» significaba «esto corre con permisos que
// quien llama no tiene». Aquí significa lo mismo, sólo que los permisos
// son «ser el Worker»: cualquiera con el testigo llega a este código.
//
// Por eso cada validación del SQL original está portada UNA A UNA, y
// ninguna se da por obvia. La que más importa, y la menos evidente:
// **el post_id tiene que pertenecer a ese calendario**. Sin ella,
// cualquiera escribe aprobaciones sobre identificadores inventados.
//
// Límite de frecuencia: no se pone en código. Va como regla de Rate
// Limiting de Cloudflare sobre /api/publico/*, que se configura en la
// zona y no gasta ni una consulta a D1. Hoy, en Supabase, no hay
// ninguno.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { diaParaCliente, rutasDeMedios } from "../../src/lib/publicacion.js";

const MIN_TESTIGO = 24;
const corta = (s, n) => (s == null ? null : String(s).slice(0, n));

/** Ni siquiera se consulta si el testigo no tiene la forma de un testigo. */
function testigoValido(token) {
  return typeof token === "string" && token.length >= MIN_TESTIGO;
}

/** El calendario vigente que corresponde a un testigo, o null. */
async function calendarioVigente(db, token) {
  if (!testigoValido(token)) return null;
  return db
    .prepare(
      `select id, client_id, owner_id, name, month, year, campaign, week_concepts, days,
              visual_references, day_labels, allow_editing, opciones, revision_enviada, revision_revisor
         from calendars
        where share_token = ? and share_enabled = 1
          and (share_expires_at is null or share_expires_at > ?)`,
    )
    .bind(token, ahora())
    .first();
}

/**
 * get_shared_calendar.
 *
 * La lista de campos está escrita a mano, igual que en el SQL original.
 * `calendarioVigente` sí LEE `owner_id` —hace falta para avisar al
 * espacio de que el cliente acaba de responder—, pero de aquí no sale:
 * la respuesta se construye campo a campo, no con el `cal` entero.
 * NO se devuelve owner_id, ni share_token, ni el ADN de marca del
 * cliente. Un `select *` recortado después en JavaScript es una
 * filtración esperando su turno: basta que alguien añada una columna.
 */
export async function calendarioPorTestigo(db, token) {
  const cal = await calendarioVigente(db, token);
  if (!cal) return null;

  const cliente = await db
    .prepare("select name, industry, instagram, primary_color, secondary_color, accent_color, logo from clients where id = ?")
    .bind(cal.client_id)
    .first();
  if (!cliente) return null;

  const { results = [] } = await db
    .prepare(
      `select post_id, estado, comentario, reviewer_name, updated_at,
              suggested_descripcion, suggested_guion
         from approvals where calendar_id = ?`,
    )
    .bind(cal.id)
    .all();

  const approvals = {};
  for (const a of results) {
    approvals[a.post_id] = {
      estado: a.estado,
      comentario: a.comentario,
      revisor: a.reviewer_name,
      timestamp: a.updated_at,
      suggestedDescripcion: a.suggested_descripcion || null,
      suggestedGuion: a.suggested_guion || null,
    };
  }

  const { results: comentarios = [] } = await db
    .prepare("select id, post_id, autor, nombre, texto, created_at from comentarios_aprobacion where calendar_id = ? order by created_at asc")
    .bind(cal.id)
    .all();

  // Sólo lo que el cliente debe ver, campo a campo: antes los días iban
  // enteros y con ellos el «Comentario interno» de la agencia y la idea
  // que se le da a la IA. Lo decide `diaParaCliente` (lista blanca).
  let opciones = {};
  try { opciones = JSON.parse(cal.opciones || "{}"); } catch { opciones = {}; }

  return {
    calendar: {
      calendar: {
        id: cal.id,
        name: cal.name,
        month: cal.month,
        year: cal.year,
        campaign: cal.campaign,
        weekConcepts: JSON.parse(cal.week_concepts || "[]"),
        days: JSON.parse(cal.days || "[]").map(diaParaCliente),
        allowEditing: cal.allow_editing === 1,
        visualReferences: JSON.parse(cal.visual_references || "[]"),
        fechaLimite: typeof opciones.fechaLimite === "string" ? opciones.fechaLimite : "",
        mensaje: typeof opciones.mensajeCliente === "string" ? opciones.mensajeCliente.slice(0, 2000) : "",
        revisionEnviada: cal.revision_enviada || null,
        revisionRevisor: cal.revision_revisor || "",
      },
      client: {
        name: cliente.name,
        industry: cliente.industry,
        instagram: cliente.instagram,
        primaryColor: cliente.primary_color,
        secondaryColor: cliente.secondary_color,
        accentColor: cliente.accent_color,
        logo: cliente.logo,
      },
    },
    approvals,
    comentarios: comentarios.map((c) => ({
      id: c.id, postId: c.post_id, autor: c.autor, nombre: c.nombre, texto: c.texto, fecha: c.created_at,
    })),
  };
}

/**
 * Un comentario del cliente en la conversación de una publicación. Va
 * además de la aprobación: «pedir cambios» deja su motivo aquí, y la
 * agencia contesta en el mismo hilo.
 */
export async function comentarCliente(db, { token, postId, texto, nombre }) {
  if (!testigoValido(token)) throw new Error("Enlace inválido");
  const limpio = String(texto ?? "").trim().slice(0, 2000);
  if (!limpio) throw new Error("El comentario está vacío: inválido");
  const cal = await calendarioVigente(db, token);
  if (!cal) throw new Error("Enlace inválido o caducado");
  if (typeof postId !== "string" || !perteneceAlCalendario(cal, postId)) {
    throw new Error("El elemento no pertenece a este calendario");
  }
  const fila = { id: uuid(), post_id: postId, nombre: corta(nombre ?? "", 120) || "El cliente", texto: limpio, created_at: ahora() };
  await db
    .prepare("insert into comentarios_aprobacion (id, calendar_id, post_id, autor, nombre, texto, created_at) values (?,?,?,?,?,?,?)")
    .bind(fila.id, cal.id, fila.post_id, "cliente", fila.nombre, fila.texto, fila.created_at)
    .run();
  return { ok: true, comentario: { id: fila.id, postId, autor: "cliente", nombre: fila.nombre, texto: fila.texto, fecha: fila.created_at }, calendarId: cal.id, ownerId: cal.owner_id };
}

/** «Enviar mi revisión»: el cliente terminó. Se guarda quién y cuándo. */
export async function enviarRevision(db, { token, revisor }) {
  if (!testigoValido(token)) throw new Error("Enlace inválido");
  const cal = await calendarioVigente(db, token);
  if (!cal) throw new Error("Enlace inválido o caducado");
  const t = ahora();
  await db
    .prepare("update calendars set revision_enviada = ?, revision_revisor = ? where id = ?")
    .bind(t, corta(revisor ?? "", 120) ?? "", cal.id)
    .run();
  return { ok: true, fecha: t, calendarId: cal.id, ownerId: cal.owner_id, clientId: cal.client_id };
}

/**
 * ¿Existe ese post_id dentro de ESTE calendario?
 *
 * Es la comprobación que sostiene todo el enlace público. El SQL
 * original recorría days[].posts[] y, si no lo encontraba, también
 * visual_references[] —porque las referencias visuales también se
 * aprueban—.
 */
export function perteneceAlCalendario(cal, postId) {
  const days = JSON.parse(cal.days || "[]");
  for (const dia of days) {
    for (const post of dia?.posts ?? []) {
      if (post?.id === postId) return true;
    }
  }
  const refs = JSON.parse(cal.visual_references || "[]");
  return refs.some((r) => r?.id === postId);
}

/** submit_approval. */
export async function enviarAprobacion(db, datos) {
  const { token, postId, estado, comentario, revisor, sugeridaDescripcion, sugeridoGuion } = datos;

  if (estado !== "aprobado" && estado !== "cambios") throw new Error("Estado inválido");
  if (typeof postId !== "string" || postId.length === 0 || postId.length > 200) {
    throw new Error("Identificador inválido");
  }
  if (!testigoValido(token)) throw new Error("Enlace inválido");

  const cal = await calendarioVigente(db, token);
  if (!cal) throw new Error("Enlace inválido o caducado");
  if (!perteneceAlCalendario(cal, postId)) throw new Error("El elemento no pertenece a este calendario");

  const traeSugerencia = sugeridaDescripcion != null || sugeridoGuion != null;
  if (traeSugerencia && cal.allow_editing !== 1) {
    throw new Error("La edición no está habilitada para este calendario");
  }

  const t = ahora();
  await db
    .prepare(
      `insert into approvals
         (id, calendar_id, post_id, estado, comentario, reviewer_name,
          suggested_descripcion, suggested_guion, created_at, updated_at)
       values (?,?,?,?,?,?,?,?,?,?)
       on conflict (calendar_id, post_id) do update set
         estado                = excluded.estado,
         comentario            = excluded.comentario,
         reviewer_name         = excluded.reviewer_name,
         suggested_descripcion = excluded.suggested_descripcion,
         suggested_guion       = excluded.suggested_guion,
         updated_at            = excluded.updated_at`,
    )
    .bind(
      uuid(), cal.id, postId, estado,
      corta(comentario ?? "", 2000),
      corta(revisor ?? "", 120),
      corta(sugeridaDescripcion, 5000),
      corta(sugeridoGuion, 5000),
      t, t,
    )
    .run();

  // Los ids salen para que el Worker pueda avisar al espacio: la agencia
  // ve la respuesta del cliente final en el momento, sin esperar a la
  // siguiente vuelta del sondeo.
  return { ok: true, estado, calendarId: cal.id, ownerId: cal.owner_id, postId };
}

/**
 * update_post_content.
 *
 * El jsonb_set original era quirúrgico: tocaba dos claves y dejaba el
 * resto del post intacto. Aquí se hace igual —se mutan `descripcion` y
 * `guion` del objeto encontrado— y no se reescribe la publicación, que
 * es como se pierde un guion sin que falle nada.
 */
export async function actualizarContenido(db, { token, postId, descripcion, guion }) {
  if (!testigoValido(token)) throw new Error("Enlace inválido");
  if (typeof postId !== "string" || postId.length === 0) {
    throw new Error("Identificador de publicación inválido");
  }

  const cal = await calendarioVigente(db, token);
  if (!cal) throw new Error("Enlace inválido o caducado");
  if (cal.allow_editing !== 1) throw new Error("La edición no está habilitada para este calendario");

  const days = JSON.parse(cal.days || "[]");
  let encontrado = false;
  for (const dia of days) {
    for (const post of dia?.posts ?? []) {
      if (post?.id !== postId) continue;
      if (descripcion != null) post.descripcion = corta(descripcion, 10000);
      if (guion != null) post.guion = corta(guion, 10000);
      encontrado = true;
      break;
    }
    if (encontrado) break;
  }
  if (!encontrado) throw new Error("La publicación no pertenece a este calendario");

  await db
    .prepare("update calendars set days = ?, updated_at = ? where id = ?")
    .bind(JSON.stringify(days), ahora(), cal.id)
    .run();

  return { ok: true, calendarId: cal.id, ownerId: cal.owner_id, postId };
}

/**
 * Los medios del calendario compartido, sin sesión.
 *
 * Comprueba que la clave pertenece a ESE calendario. Sin esta vuelta, el
 * testigo de un cliente abriría los medios de cualquier otro con sólo
 * cambiar la clave en la dirección.
 */
export async function mediaPermitida(db, token, clave) {
  const cal = await calendarioVigente(db, token);
  if (!cal) return false;

  // La interfaz guarda la imagen como ruta (`/api/media/<clave>`), que
  // es lo que pinta un <img>; aquí llega la clave a secas.
  // Todos los medios de la publicación —carrusel, video, portada y la
  // imagen de antes de una corrección—, no sólo `image`.
  const days = JSON.parse(cal.days || "[]");
  for (const dia of days) {
    for (const post of dia?.posts ?? []) {
      if (rutasDeMedios(post).some((r) => r === clave || r === `/api/media/${clave}`)) return true;
    }
  }
  const refs = JSON.parse(cal.visual_references || "[]");
  if (refs.some((r) => r?.url === clave)) return true;

  const cliente = await db.prepare("select logo from clients where id = ?").bind(cal.client_id).first();
  return cliente?.logo === clave;
}

/**
 * El informe mensual que se le manda al cliente: sin sesión, por su
 * testigo, y sólo si la agencia lo compartió. Igual que el calendario, se
 * construye campo a campo: ni el dueño, ni el id, ni quién lo generó.
 */
export async function informePorTestigo(db, token) {
  if (!testigoValido(token)) return null;
  const inf = await db
    .prepare("select client_id, mes, contenido, updated_at from informes where testigo = ? and compartido = 1 and estado = 'listo'")
    .bind(token)
    .first();
  if (!inf) return null;
  const cliente = await db
    .prepare("select name, instagram, primary_color, secondary_color, accent_color, logo from clients where id = ?")
    .bind(inf.client_id)
    .first();
  if (!cliente) return null;
  let contenido = {};
  try { contenido = JSON.parse(inf.contenido); } catch { /* vacío */ }
  return {
    mes: inf.mes,
    actualizado: inf.updated_at,
    cifras: contenido.cifras ?? null,
    analisis: contenido.analisis ?? null,
    cliente: {
      name: cliente.name, instagram: cliente.instagram,
      primaryColor: cliente.primary_color, secondaryColor: cliente.secondary_color, accentColor: cliente.accent_color,
      // Sólo un logo incrustado: una ruta de R2 necesitaría sesión.
      logo: typeof cliente.logo === "string" && cliente.logo.startsWith("data:image/") ? cliente.logo : null,
    },
  };
}

/**
 * La auditoría de perfil compartida: lo que se auditó y el análisis, sin
 * nada de la agencia. Si es de un cliente, sus colores para la portada.
 */
export async function auditoriaPorTestigo(db, token) {
  if (!testigoValido(token)) return null;
  const a = await db
    .prepare("select client_id, usuario, datos, analisis, updated_at from auditorias where testigo = ? and compartido = 1 and estado = 'listo'")
    .bind(token)
    .first();
  if (!a) return null;
  const cliente = a.client_id
    ? await db.prepare("select name, primary_color, secondary_color, accent_color, logo from clients where id = ?").bind(a.client_id).first()
    : null;
  let datos = {};
  let analisis = {};
  try { datos = JSON.parse(a.datos); } catch { /* vacío */ }
  try { analisis = JSON.parse(a.analisis); } catch { /* vacío */ }
  return {
    usuario: a.usuario,
    actualizado: a.updated_at,
    perfil: datos.perfil ? { ...datos.perfil, medios: (datos.perfil.medios ?? []).map(({ imagen: _imagen, ...m }) => m) } : null,
    cifras: datos.cifras ?? null,
    auditadoEl: datos.auditadoEl ?? a.updated_at,
    analisis,
    cliente: cliente ? {
      name: cliente.name, primaryColor: cliente.primary_color, secondaryColor: cliente.secondary_color, accentColor: cliente.accent_color,
      logo: typeof cliente.logo === "string" && cliente.logo.startsWith("data:image/") ? cliente.logo : null,
    } : null,
  };
}
