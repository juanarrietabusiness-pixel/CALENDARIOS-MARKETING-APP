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

// ------------------------------------------------------------
// Chat del asistente por cliente
// ------------------------------------------------------------

export async function loadChatMessages(clientId, limit = 100) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function saveChatMessage(clientId, role, content) {
  const { error } = await supabase
    .from("chat_messages")
    .insert({ client_id: clientId, role, content });
  if (error) throw error;
}

export async function clearChatMessages(clientId) {
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("client_id", clientId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Memorias persistentes del asistente
// ------------------------------------------------------------

export async function loadClientMemories(clientId) {
  const { data, error } = await supabase
    .from("client_memories")
    .select("id, content, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveClientMemory(clientId, content) {
  const { data, error } = await supabase
    .from("client_memories")
    .insert({ client_id: clientId, content })
    .select("id, content, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClientMemory(memoryId) {
  const { error } = await supabase
    .from("client_memories")
    .delete()
    .eq("id", memoryId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Tareas por cliente
// ------------------------------------------------------------

export async function loadClientTasks(clientId) {
  const { data, error } = await supabase
    .from("client_tasks")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveClientTask(task) {
  const row = { ...task };
  if (!row.id) delete row.id;
  const { data, error } = await supabase
    .from("client_tasks")
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClientTask(taskId) {
  const { error } = await supabase
    .from("client_tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw error;
}

export async function completeClientTask(taskId) {
  const { data, error } = await supabase
    .from("client_tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reopenClientTask(taskId) {
  const { data, error } = await supabase
    .from("client_tasks")
    .update({ status: "pending", completed_at: null })
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------
// Plantillas de tareas
// ------------------------------------------------------------

export async function loadTaskTemplates() {
  const { data, error } = await supabase
    .from("task_templates")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveTaskTemplate(template) {
  const row = { ...template };
  if (!row.id) delete row.id;
  const { data, error } = await supabase
    .from("task_templates")
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaskTemplate(templateId) {
  const { error } = await supabase
    .from("task_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw error;
}

export async function applyTemplatesToClient(clientId, templates) {
  const rows = templates.map((t) => ({
    client_id: clientId,
    title: t.title,
    description: t.description || "",
    recurrence: t.recurrence || "none",
    recurrence_day: t.recurrence_day ?? null,
  }));
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("client_tasks")
    .insert(rows)
    .select();
  if (error) throw error;
  return data ?? [];
}

// ------------------------------------------------------------
// Banco de contenido
// ------------------------------------------------------------

export async function loadContentBank(clientId) {
  const { data, error } = await supabase
    .from("content_bank")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function uploadContentBankItem(clientId, file) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("content-bank")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (uploadErr) throw uploadErr;

  const isVideo = file.type.startsWith("video/");
  const { data, error } = await supabase
    .from("content_bank")
    .insert({
      client_id: clientId,
      file_path: path,
      file_name: file.name,
      file_type: isVideo ? "video" : "image",
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContentBankItem(item) {
  const { error: storageErr } = await supabase.storage
    .from("content-bank")
    .remove([item.file_path]);
  if (storageErr) throw storageErr;

  const { error } = await supabase
    .from("content_bank")
    .delete()
    .eq("id", item.id);
  if (error) throw error;
}

export function getContentBankUrl(filePath) {
  const { data } = supabase.storage
    .from("content-bank")
    .getPublicUrl(filePath);
  return data?.publicUrl || "";
}

export async function getContentBankSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from("content-bank")
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data?.signedUrl || "";
}
