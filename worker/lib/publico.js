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
      `select id, client_id, name, month, year, campaign, week_concepts, days,
              visual_references, day_labels, allow_editing
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
 * NO se devuelve owner_id, ni share_token, ni el ADN de marca del
 * cliente. Un `select *` recortado después en JavaScript es una
 * filtración esperando su turno: basta que alguien añada una columna.
 */
export async function calendarioPorTestigo(db, token) {
  const cal = await calendarioVigente(db, token);
  if (!cal) return null;

  const cliente = await db
    .prepare("select name, industry, primary_color, logo from clients where id = ?")
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

  return {
    calendar: {
      calendar: {
        id: cal.id,
        name: cal.name,
        month: cal.month,
        year: cal.year,
        campaign: cal.campaign,
        weekConcepts: JSON.parse(cal.week_concepts || "[]"),
        days: JSON.parse(cal.days || "[]"),
        allowEditing: cal.allow_editing === 1,
        visualReferences: JSON.parse(cal.visual_references || "[]"),
        dayLabels: JSON.parse(cal.day_labels || "{}"),
      },
      client: {
        name: cliente.name,
        industry: cliente.industry,
        primaryColor: cliente.primary_color,
        logo: cliente.logo,
      },
    },
    approvals,
  };
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

  return { ok: true, estado };
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

  return { ok: true };
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

  const days = JSON.parse(cal.days || "[]");
  for (const dia of days) {
    for (const post of dia?.posts ?? []) {
      if (post?.image === clave) return true;
    }
  }
  const refs = JSON.parse(cal.visual_references || "[]");
  if (refs.some((r) => r?.url === clave)) return true;

  const cliente = await db.prepare("select logo from clients where id = ?").bind(cal.client_id).first();
  return cliente?.logo === clave;
}
