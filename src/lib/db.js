import { supabase } from "./supabase";
import { clientToRow, rowToClient, calendarToRow, rowToCalendar } from "./supabase";

// ------------------------------------------------------------
// Acceso a datos
//
// Las políticas RLS ya limitan cada fila a su propietario, así que
// ninguna consulta filtra por owner_id: si alguna vez se colara un
// filtro de más y faltara la política, el fallo pasaría inadvertido.
// ------------------------------------------------------------

/** El id de la fila es undefined al crear; PostgREST rechaza la clave vacía. */
function withoutEmptyId(row) {
  if (!row.id) {
    const { id: _omit, ...rest } = row;
    return rest;
  }
  return row;
}

/** Carga clientes y calendarios y los devuelve con la forma que usa la aplicación. */
export async function loadWorkspace() {
  const [clientsRes, calendarsRes] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: true }),
    supabase.from("calendars").select("*").order("created_at", { ascending: true }),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (calendarsRes.error) throw calendarsRes.error;

  const byClient = new Map();
  for (const row of calendarsRes.data ?? []) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(rowToCalendar(row));
    byClient.set(row.client_id, list);
  }

  return (clientsRes.data ?? []).map((row) => ({
    ...rowToClient(row),
    calendars: byClient.get(row.id) ?? [],
  }));
}

export async function saveClient(client, ownerId) {
  const row = withoutEmptyId(clientToRow(client, ownerId));
  const { data, error } = await supabase
    .from("clients").upsert(row).select().single();
  if (error) throw error;
  return { ...rowToClient(data), calendars: client.calendars ?? [] };
}

export async function deleteClient(clientDbId) {
  const { error } = await supabase.from("clients").delete().eq("id", clientDbId);
  if (error) throw error;
}

export async function saveCalendar(cal, clientDbId, ownerId) {
  const row = withoutEmptyId(calendarToRow(cal, clientDbId, ownerId));
  const { data, error } = await supabase
    .from("calendars").upsert(row).select().single();
  if (error) throw error;
  return rowToCalendar(data);
}

export async function deleteCalendar(calendarDbId) {
  const { error } = await supabase.from("calendars").delete().eq("id", calendarDbId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Enlace de aprobación
// ------------------------------------------------------------

/** Abre el enlace y devuelve el token. Lo genera la base de datos. */
export async function shareCalendar(calendarDbId) {
  const { data, error } = await supabase.rpc("share_calendar", {
    p_calendar_id: calendarDbId,
  });
  if (error) throw error;
  return data;
}

export async function setShareEnabled(calendarDbId, enabled) {
  const { error } = await supabase.rpc("set_share_enabled", {
    p_calendar_id: calendarDbId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

// ------------------------------------------------------------
// Respuestas del cliente final
// ------------------------------------------------------------

export async function fetchApprovals(calendarDbId) {
  const { data, error } = await supabase
    .from("approvals")
    .select("post_id, estado, comentario, reviewer_name, updated_at, suggested_descripcion, suggested_guion")
    .eq("calendar_id", calendarDbId);
  if (error) throw error;

  const map = {};
  for (const row of data ?? []) {
    map[row.post_id] = {
      estado: row.estado,
      comentario: row.comentario,
      revisor: row.reviewer_name,
      timestamp: row.updated_at,
      suggestedDescripcion: row.suggested_descripcion || null,
      suggestedGuion: row.suggested_guion || null,
    };
  }
  return map;
}

/**
 * Avisa cuando el cliente final responde. Sustituye al botón
 * «Sincronizar», que obligaba a la agencia a preguntar a mano.
 *
 * Devuelve la función para darse de baja: sin ella, cambiar de
 * calendario dejaba canales abiertos acumulándose.
 */
export function subscribeApprovals(calendarDbId, onChange) {
  const channel = supabase
    .channel(`approvals-${calendarDbId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "approvals",
        filter: `calendar_id=eq.${calendarDbId}`,
      },
      onChange,
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
