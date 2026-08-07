import { getStore } from "@netlify/blobs";
import { createClient } from "@supabase/supabase-js";

// ------------------------------------------------------------
// Configuración
// ------------------------------------------------------------

// Origen permitido. Antes era "*", lo que dejaba que cualquier página
// leyera un calendario compartido desde el navegador de la víctima.
// URL la define Netlify automáticamente con la URL del sitio.
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [SITE_URL, ...EXTRA_ORIGINS].filter(Boolean);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

// La clave de servicio ignora RLS: sólo puede vivir aquí, nunca en el
// paquete del navegador.
const supabase = useSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// Un identificador de enlace es "clientId-calId-timestamp": letras,
// números, guiones y guiones bajos. Validarlo evita que se use como
// vector de inyección en la clave del almacén.
const ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB: los calendarios llevan imágenes en base64
const MAX_COMMENT_LENGTH = 2000;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function corsHeaders(req) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  // Sin lista configurada (desarrollo local) se refleja el origen;
  // en producción Netlify siempre define URL.
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  }
  return headers;
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(req) });
}

// ------------------------------------------------------------
// Capa de almacenamiento
// Supabase si está configurado; si no, Netlify Blobs (comportamiento
// anterior), para que los enlaces ya emitidos sigan funcionando.
// ------------------------------------------------------------

async function readCalendar(approvalId) {
  if (useSupabase) {
    const { data, error } = await supabase.rpc("get_shared_calendar", {
      p_approval_id: approvalId,
    });
    if (error) throw new Error(error.message);
    if (data) return data;
    // Sin fila en Supabase: puede ser un enlace emitido antes de migrar.
  }
  const store = getStore("calendar-approvals");
  return (await store.get(approvalId, { type: "json" })) || null;
}

async function writeCalendar(approvalId, payload) {
  // El calendario completo (con imágenes) se guarda en Blobs también
  // cuando Supabase está activo: la función sólo escribe en la tabla
  // de calendarios si el propietario ya migró sus datos, cosa que hace
  // la aplicación autenticada, no este endpoint público.
  const store = getStore("calendar-approvals");
  await store.setJSON(approvalId, payload);
}

async function writeApproval(approvalId, postId, estado, comentario) {
  if (useSupabase) {
    const { data: cal, error: findErr } = await supabase
      .from("calendars")
      .select("id")
      .eq("approval_id", approvalId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (cal) {
      const { error } = await supabase
        .from("approvals")
        .upsert(
          { calendar_id: cal.id, post_id: postId, estado, comentario },
          { onConflict: "calendar_id,post_id" }
        );
      if (error) throw new Error(error.message);
      return;
    }
    // Enlace anterior a la migración: cae al almacén de Blobs.
  }

  const store = getStore("calendar-approvals");
  let current = {};
  try {
    current = (await store.get(approvalId, { type: "json" })) || {};
  } catch {
    /* primera escritura */
  }
  if (!current.approvals) current.approvals = {};
  current.approvals[postId] = {
    estado,
    comentario,
    timestamp: new Date().toISOString(),
  };
  await store.setJSON(approvalId, current);
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  const calendarId = url.searchParams.get("id");

  if (!calendarId) {
    return json(req, { error: "Falta el identificador del calendario" }, 400);
  }
  if (!ID_PATTERN.test(calendarId)) {
    return json(req, { error: "Identificador inválido" }, 400);
  }

  if (req.method === "GET") {
    try {
      const data = await readCalendar(calendarId);
      return json(req, data || { approvals: {}, calendar: null });
    } catch (e) {
      console.error("approval GET:", e);
      return json(req, { error: "No se pudo leer el calendario" }, 500);
    }
  }

  if (req.method === "POST") {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return json(req, { error: "La petición es demasiado grande" }, 413);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json(req, { error: "JSON inválido" }, 400);
    }

    if (body.action === "save_calendar") {
      if (!body.data || typeof body.data !== "object") {
        return json(req, { error: "Faltan los datos del calendario" }, 400);
      }
      try {
        await writeCalendar(calendarId, body.data);
        return json(req, { ok: true });
      } catch (e) {
        console.error("approval save_calendar:", e);
        return json(req, { error: "No se pudo guardar el calendario" }, 500);
      }
    }

    if (body.action === "approve") {
      // Antes se aceptaba cualquier valor de `estado` y se escribía tal
      // cual, así que la interfaz de la agencia podía recibir estados
      // que no sabía interpretar.
      if (body.estado !== "aprobado" && body.estado !== "cambios") {
        return json(req, { error: "Estado inválido" }, 400);
      }
      if (typeof body.publicacionId !== "string" || !body.publicacionId) {
        return json(req, { error: "Falta el identificador de la publicación" }, 400);
      }
      const comentario = String(body.comentario || "").slice(0, MAX_COMMENT_LENGTH);

      try {
        await writeApproval(calendarId, body.publicacionId, body.estado, comentario);
        return json(req, { ok: true });
      } catch (e) {
        console.error("approval approve:", e);
        return json(req, { error: "No se pudo guardar la respuesta" }, 500);
      }
    }

    return json(req, { error: "Acción desconocida" }, 400);
  }

  return json(req, { error: "Método no permitido" }, 405);
};

export const config = { path: "/api/approval" };
