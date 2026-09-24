import { clientToRow, rowToClient, calendarToRow, rowToCalendar } from "./filas";

// ------------------------------------------------------------
// Acceso a datos
//
// Antes esto hablaba con PostgREST y las políticas RLS acotaban cada
// fila a su propietario. Ahora habla con el Worker, y quien acota es su
// capa de acceso: ninguna consulta viaja desde aquí, sólo la intención.
//
// **Todas las firmas se conservan.** `ownerId` sigue en los parámetros
// de saveClient y saveCalendar y ya no se usa —lo impone el servidor a
// partir de la sesión—, pero quitarlo obligaría a tocar App.jsx sin
// ganar nada. Es lo que hace que esta migración sea larga y no arriesgada.
//
// La sesión viaja en una cookie `__Host-` que el navegador manda sola:
// no hay ningún token que adjuntar a mano, ni que se pueda olvidar.
// ------------------------------------------------------------

/**
 * Una llamada a la API.
 *
 * El error útil viene en el cuerpo. Sin esto, un 400 llegaría como
 * «Failed to fetch» y mandaría a buscar un problema de red que no existe.
 *
 * Se exporta para que `equipo.js` no tenga que reimplementarla: dos
 * copias del mismo `fetch` es una que un día deja de mandar la cookie
 * —o de leer el error del cuerpo— y nadie sabe por qué esa pantalla
 * concreta dice «Failed to fetch».
 */
/**
 * Esta pestaña.
 *
 * Viaja en una cabecera con cada escritura y vuelve dentro del evento de
 * tiempo real, para que el navegador que originó un cambio no se lo
 * aplique a sí mismo. Sin esto, guardar mientras escribes te devolvía tu
 * propio guardado por el socket y te pisaba lo que hubieras tecleado en
 * los milisegundos siguientes: el cursor saltaba y la última palabra
 * desaparecía. Con el id de PESTAÑA y no el de persona, dos pestañas
 * abiertas por la misma persona sí se ven entre ellas, que es lo que se
 * espera cuando tienes el panel en el portátil y en el móvil.
 */
export const PESTANA = (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12);

export async function pedir(ruta, opciones = {}) {
  const res = await fetch(`/api${ruta}`, {
    credentials: "same-origin",
    ...opciones,
    headers: opciones.body instanceof FormData
      ? { "X-Pestana": PESTANA, ...(opciones.headers ?? {}) }
      : { "Content-Type": "application/json", "X-Pestana": PESTANA, ...(opciones.headers ?? {}) },
  });

  if (res.status === 204) return null;

  let datos = null;
  try { datos = await res.json(); } catch { /* 502 del borde: no es JSON */ }

  if (!res.ok) {
    throw new Error(datos?.error || `La petición falló con estado ${res.status}.`);
  }
  return datos;
}

const conCuerpo = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos) });

/** Carga clientes y calendarios y los devuelve con la forma que usa la aplicación. */
export async function loadWorkspace() {
  const { clients = [], calendars = [] } = await pedir("/espacio");

  const byClient = new Map();
  for (const row of calendars) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(rowToCalendar(row));
    byClient.set(row.client_id, list);
  }

  return clients.map((row) => ({
    ...rowToClient(row),
    calendars: byClient.get(row.id) ?? [],
  }));
}

export async function saveClient(client, _ownerId) {
  const row = clientToRow(client);
  const id = client.dbId || "nuevo";
  const data = await pedir(`/clientes/${id}`, conCuerpo("PUT", row));
  return { ...rowToClient(data), calendars: client.calendars ?? [] };
}

export async function deleteClient(clientDbId) {
  await pedir(`/clientes/${clientDbId}`, { method: "DELETE" });
}

export async function saveCalendar(cal, clientDbId, _ownerId) {
  const row = calendarToRow(cal, clientDbId);
  const id = cal.dbId || "nuevo";
  return rowToCalendar(await pedir(`/calendarios/${id}`, conCuerpo("PUT", row)));
}

export async function deleteCalendar(calendarDbId) {
  await pedir(`/calendarios/${calendarDbId}`, { method: "DELETE" });
}

// ------------------------------------------------------------
// Enlace de aprobación
// ------------------------------------------------------------

/**
 * Abre el enlace y devuelve el token. Lo genera EL SERVIDOR, y reutiliza
 * el que ya hubiera: regenerarlo mataría los enlaces que el cliente ya
 * tiene en su correo.
 */
export async function shareCalendar(calendarDbId) {
  const { token } = await pedir(`/calendarios/${calendarDbId}/enlace`, { method: "POST" });
  return token;
}

export async function setShareEnabled(calendarDbId, enabled) {
  await pedir(`/calendarios/${calendarDbId}/enlace`, conCuerpo("PATCH", { enabled }));
}

// ------------------------------------------------------------
// Respuestas del cliente final
// ------------------------------------------------------------

export async function fetchApprovals(calendarDbId) {
  const filas = await pedir(`/calendarios/${calendarDbId}/aprobaciones`);
  const map = {};
  for (const row of filas ?? []) {
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
 * Avisa cuando el cliente final responde.
 *
 * Antes era una suscripción a Realtime de Supabase; Cloudflare no tiene
 * equivalente. Y resulta que casi no hacía falta: lo que llegaba por
 * Realtime se volcaba **sólo en el estado** (`onUpdateCalLocal`), nunca
 * se persistía, así que el trabajo de verdad ya lo hacía `fetchApprovals`
 * y la suscripción sólo disparaba una relectura.
 *
 * AHORA SÍ HAY DURABLE OBJECT, y esto sigue aquí a propósito.
 *
 * El enlace público avisa al espacio en cuanto el cliente final
 * responde, así que la relectura llega en el momento y no en el próximo
 * minuto. Pero el socket puede estar caído —túnel, avión, el móvil que
 * congeló la pestaña— y entonces este sondeo es lo único que queda. Es
 * barato y es la red de debajo: se sube a sesenta segundos, que es lo
 * que tiene sentido para algo que ya no es el camino principal.
 *
 * La firma es la misma, así que quien llama no cambia.
 */
export function subscribeApprovals(calendarDbId, onChange) {
  const id = setInterval(() => { onChange(); }, 60000);
  return () => { clearInterval(id); };
}

// ------------------------------------------------------------
// Chat del asistente por cliente
// ------------------------------------------------------------

export async function loadChatMessages(clientId, limit = 100) {
  const filas = await pedir(`/clientes/${clientId}/chat`);
  return (filas ?? []).slice(-limit);
}

export async function saveChatMessage(clientId, role, content) {
  await pedir(`/clientes/${clientId}/chat`, conCuerpo("POST", { role, content }));
}

export async function clearChatMessages(clientId) {
  await pedir(`/clientes/${clientId}/chat`, { method: "DELETE" });
}

// ------------------------------------------------------------
// Memorias persistentes del asistente
// ------------------------------------------------------------

export async function loadClientMemories(clientId) {
  return (await pedir(`/clientes/${clientId}/memoria`)) ?? [];
}

export async function saveClientMemory(clientId, content) {
  return pedir(`/clientes/${clientId}/memoria`, conCuerpo("POST", { content }));
}

export async function deleteClientMemory(memoryId) {
  await pedir(`/memoria/${memoryId}`, { method: "DELETE" });
}

// ------------------------------------------------------------
// Tareas por cliente
// ------------------------------------------------------------

export async function loadClientTasks(clientId) {
  return (await pedir(`/clientes/${clientId}/tareas`)) ?? [];
}

export async function saveClientTask(task) {
  return pedir(`/clientes/${task.client_id}/tareas`, conCuerpo("POST", task));
}

export async function updateClientTask(taskId, data) {
  return pedir(`/tareas/${taskId}`, conCuerpo("PUT", data));
}

export async function deleteClientTask(taskId) {
  await pedir(`/tareas/${taskId}`, { method: "DELETE" });
}

export async function completeClientTask(taskId) {
  return pedir(`/tareas/${taskId}/completar`, { method: "POST" });
}

export async function reopenClientTask(taskId) {
  return pedir(`/tareas/${taskId}/reabrir`, { method: "POST" });
}

export async function reorderClientTasks(clientId, ids) {
  return pedir(`/tareas/${clientId}/reordenar`, conCuerpo("POST", { ids }));
}

// ------------------------------------------------------------
// Plantillas de tareas
// ------------------------------------------------------------

export async function loadTaskTemplates() {
  return (await pedir("/plantillas-tarea")) ?? [];
}

export async function saveTaskTemplate(template) {
  return pedir("/plantillas-tarea", conCuerpo("POST", template));
}

export async function updateTaskTemplate(templateId, data) {
  return pedir(`/plantillas-tarea/${templateId}`, conCuerpo("PUT", data));
}

export async function deleteTaskTemplate(templateId) {
  await pedir(`/plantillas-tarea/${templateId}`, { method: "DELETE" });
}

export async function applyTemplatesToClient(clientId, templates) {
  if (!templates.length) return [];
  return (await pedir(`/clientes/${clientId}/tareas/plantillas`, conCuerpo("POST", { templates }))) ?? [];
}

// ------------------------------------------------------------
// Tareas rápidas (inbox global)
// ------------------------------------------------------------

export async function loadQuickTasks() {
  return (await pedir("/tareas-rapidas")) ?? [];
}

export async function saveQuickTask(task) {
  return pedir("/tareas-rapidas", conCuerpo("POST", task));
}

export async function updateQuickTask(taskId, data) {
  return pedir(`/tareas-rapidas/${taskId}`, conCuerpo("PUT", data));
}

export async function deleteQuickTask(taskId) {
  await pedir(`/tareas-rapidas/${taskId}`, { method: "DELETE" });
}

export async function completeQuickTask(taskId) {
  return pedir(`/tareas-rapidas/${taskId}/completar`, { method: "POST" });
}

export async function reopenQuickTask(taskId) {
  return pedir(`/tareas-rapidas/${taskId}/reabrir`, { method: "POST" });
}

export async function reorderQuickTasks(ids) {
  return pedir("/tareas-rapidas/reordenar", conCuerpo("POST", { ids }));
}

export async function loadAllTasks() {
  return pedir("/todas-tareas");
}

/** Borra las terminadas de un cliente, o las rápidas si no hay cliente. Las recurrentes se quedan. */
export async function borrarTerminadas(clientId = null) {
  const ruta = clientId ? `/clientes/${clientId}/tareas/terminadas` : "/tareas-rapidas/terminadas";
  return pedir(ruta, { method: "DELETE" });
}

// ------------------------------------------------------------
// Responsables y ajustes del espacio
// ------------------------------------------------------------

export async function loadResponsables() {
  return (await pedir("/responsables")) ?? [];
}

export async function saveResponsable(nombre) {
  return pedir("/responsables", conCuerpo("POST", { nombre }));
}

export async function deleteResponsable(id) {
  await pedir(`/responsables/${id}`, { method: "DELETE" });
}

export async function loadAjustes() {
  return pedir("/ajustes");
}

export async function saveAjustes(ajustes) {
  return pedir("/ajustes", conCuerpo("PUT", ajustes));
}

// ------------------------------------------------------------
// Generación de imágenes
// ------------------------------------------------------------

export async function generateImage(datos) {
  return pedir("/generar-imagen", conCuerpo("POST", datos));
}

/**
 * Sube la imagen de una publicación a R2 y devuelve la ruta que se
 * guarda en `post.image`. En el calendario va la ruta, nunca los bytes:
 * el JSON del mes crece hasta el techo de fila de D1.
 */
export async function subirImagenPublicacion(clientId, file) {
  const form = new FormData();
  form.append("archivo", file);
  form.append("clientId", clientId);
  form.append("carpeta", "posts");
  const { clave } = await pedir("/media", { method: "POST", body: form });
  return getContentBankUrl(clave);
}

/** Lo que Gemini ve y oye en un video del banco, por escrito. */
export async function analizarVideo(clave) {
  return pedir("/ia/video", conCuerpo("POST", { clave }));
}

export async function feedbackImage(clientId, clave, liked) {
  return pedir("/feedback-imagen", conCuerpo("POST", { clientId, clave, liked }));
}

// ---- Plantillas de imagen ----

export async function loadImageTemplates(clientId) {
  return (await pedir(`/plantillas-imagen/${clientId}`)) ?? [];
}

export async function saveImageTemplate(template) {
  return pedir("/plantillas-imagen", conCuerpo("POST", template));
}

export async function updateImageTemplate(templateId, data) {
  return pedir(`/plantillas-imagen/${templateId}`, conCuerpo("PUT", data));
}

export async function deleteImageTemplate(templateId) {
  await pedir(`/plantillas-imagen/${templateId}`, { method: "DELETE" });
}

// ---- Referencias de imagen ----

export async function loadImageReferences(clientId) {
  return (await pedir(`/referencias-imagen/${clientId}`)) ?? [];
}

export async function uploadImageReference(clientId, file) {
  const form = new FormData();
  form.append("archivo", file);
  return pedir(`/referencias-imagen/${clientId}`, { method: "POST", body: form });
}

export async function deleteImageReference(refId) {
  await pedir(`/referencias-imagen/${refId}`, { method: "DELETE" });
}

// ------------------------------------------------------------
// Banco de contenido
// ------------------------------------------------------------

export async function loadContentBank(clientId) {
  return (await pedir(`/clientes/${clientId}/banco`)) ?? [];
}

export async function uploadContentBankItem(clientId, file) {
  const form = new FormData();
  form.append("archivo", file);
  return pedir(`/clientes/${clientId}/banco`, { method: "POST", body: form });
}

export async function deleteContentBankItem(item) {
  await pedir(`/banco/${item.id}`, { method: "DELETE" });
}

/**
 * La dirección de un archivo del banco.
 *
 * Ya no hay URL pública ni URL firmada: R2 no se expone al exterior y
 * todo pasa por `/api/media/*`, que comprueba la sesión y que la clave
 * sea de un cliente de este dueño. Las dos funciones se conservan —una
 * síncrona y otra asíncrona— porque así las llama la interfaz.
 */
export function getContentBankUrl(filePath) {
  return `/api/media/${filePath}`;
}

export async function getContentBankSignedUrl(filePath) {
  return getContentBankUrl(filePath);
}
