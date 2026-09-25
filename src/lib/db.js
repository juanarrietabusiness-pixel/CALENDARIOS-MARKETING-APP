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

/** Los modelos que tiene la cuenta de Anthropic y el que está en uso. */
export async function loadModelosIA() {
  return pedir("/ia/modelos");
}

/** Lo que costó la IA en un mes (AAAA-MM): por función, modelo, día y cliente. */
export async function loadConsumoIA(mes = "") {
  return pedir(`/ia/consumo${mes ? `?mes=${encodeURIComponent(mes)}` : ""}`);
}

/** Relee el medidor de gasto cuando termina una llamada que cuesta. */
function avisarGasto(promesa) {
  return promesa.finally(() => window.dispatchEvent(new Event("ia:gasto")));
}

/** Lo justo para el medidor: gastado, presupuesto y estado del mes. */
export async function loadGastoIA() {
  return pedir("/ia/gasto");
}

// ------------------------------------------------------------
// Generación de imágenes
// ------------------------------------------------------------

export async function generateImage(datos) {
  return avisarGasto(pedir("/generar-imagen", conCuerpo("POST", datos)));
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
  return avisarGasto(pedir("/ia/video", conCuerpo("POST", { clave })));
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

// ------------------------------------------------------------
// Google Drive: el banco de contenido
//
// Todo pasa por /api/drive/*: el navegador no habla con Google, y así
// `connect-src` sigue en 'self'. Ver worker/rutas/drive.js.
// ------------------------------------------------------------

const rutaDrive = (clienteId, resto) => `/drive/clientes/${encodeURIComponent(clienteId)}/${resto}`;

/** ¿Está Google configurado en el servidor y conectado el espacio? */
export async function estadoDrive() {
  return pedir("/drive/estado");
}

/** Conectar es NAVEGAR (Google pide permiso en su página), no un fetch. */
export const urlConectarDrive = () => "/api/drive/conectar";

export async function desconectarDrive() {
  return pedir("/drive/desconectar", { method: "POST" });
}

export async function listarDrive(clienteId, { carpeta = "", q = "", tipo = "", pagina = "" } = {}) {
  const p = new URLSearchParams();
  if (carpeta) p.set("carpeta", carpeta);
  if (q) p.set("q", q);
  if (tipo) p.set("tipo", tipo);
  if (pagina) p.set("pagina", pagina);
  return pedir(`${rutaDrive(clienteId, "archivos")}${p.size ? `?${p}` : ""}`);
}

export const urlArchivoDrive = (clienteId, id, { descargar = false } = {}) =>
  `/api${rutaDrive(clienteId, `archivo/${encodeURIComponent(id)}`)}${descargar ? "?descargar=1" : ""}`;

export const urlMiniaturaDrive = (clienteId, id, tam = 400) =>
  `/api${rutaDrive(clienteId, `miniatura/${encodeURIComponent(id)}`)}?t=${tam}`;

/** Sube el archivo tal cual, sin FormData: el Worker lo pasa a Drive sin copiarlo. */
export async function subirADrive(clienteId, file, carpeta = "") {
  const p = new URLSearchParams({ nombre: file.name || "archivo" });
  if (carpeta) p.set("carpeta", carpeta);
  return pedir(`${rutaDrive(clienteId, "subir")}?${p}`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
}

export async function crearCarpetaDrive(clienteId, nombre, dentro = "") {
  return pedir(rutaDrive(clienteId, "carpeta"), conCuerpo("POST", { nombre, dentro }));
}

export async function papeleraDrive(clienteId, id) {
  return pedir(rutaDrive(clienteId, `papelera/${encodeURIComponent(id)}`), { method: "POST" });
}

/**
 * Copia un archivo de Drive (imagen o video) a R2 y devuelve la ruta que
 * va en la publicación. Se copia porque la página del cliente y Meta a la
 * hora de publicar no pueden leer el Drive de la agencia.
 */
export async function imagenDeDriveParaPublicacion(clienteId, fileId) {
  return (await medioDeDrive(clienteId, fileId)).src;
}

export async function medioDeDrive(clienteId, fileId) {
  const { clave, tipo, nombre } = await pedir(rutaDrive(clienteId, "a-publicacion"), conCuerpo("POST", { fileId }));
  return { src: getContentBankUrl(clave), tipo: tipo === "video" ? "video" : "imagen", nombre: nombre ?? "" };
}

/** Una tanda de la migración del banco de antes a Drive. */
export async function migrarBancoADrive(clienteId) {
  return pedir(rutaDrive(clienteId, "migrar-banco"), { method: "POST" });
}

/** Lo que Gemini ve y oye en un video de Drive. */
export async function analizarVideoDrive(clienteId, fileId) {
  return avisarGasto(pedir("/ia/video", conCuerpo("POST", { drive: { clienteId, fileId } })));
}

// ------------------------------------------------------------
// Conversación de cada publicación con el cliente
// ------------------------------------------------------------

export async function loadComentarios(calId) {
  return (await pedir(`/calendarios/${encodeURIComponent(calId)}/comentarios`)) ?? [];
}

export async function comentarComoAgencia(calId, postId, texto) {
  return pedir(`/calendarios/${encodeURIComponent(calId)}/comentarios`, conCuerpo("POST", { postId, texto }));
}

// ------------------------------------------------------------
// Redes: Meta, las cuentas de cada cliente y la cola de publicación
//
// El navegador no habla con Facebook: todo por /api/redes/* y
// /api/publicar. Ver worker/rutas/redes.js.
// ------------------------------------------------------------

export async function estadoRedes() {
  return pedir("/redes/estado");
}

/** Conectar es NAVEGAR a Facebook, igual que con Drive. */
export const urlConectarMeta = () => "/api/redes/meta/conectar";

export async function sincronizarMeta() {
  return pedir("/redes/meta/sincronizar", { method: "POST" });
}

export async function desconectarMeta() {
  return pedir("/redes/meta/desconectar", { method: "POST" });
}

export async function asignarCuenta(cuentaId, clientId) {
  return pedir(`/redes/cuentas/${encodeURIComponent(cuentaId)}`, conCuerpo("PUT", { clientId: clientId || null }));
}

/** La cola de un calendario (o de un cliente). */
export async function listarPublicaciones({ calendario = "", cliente = "" } = {}) {
  const p = new URLSearchParams(calendario ? { calendario } : { cliente });
  return (await pedir(`/publicar?${p}`)) ?? [];
}

/** Programar a su día y hora, o `ahora: true` para que salga ya. */
export async function publicar({ calendarId, postId, redes, ahora = false }) {
  return pedir("/publicar", conCuerpo("POST", { calendarId, postId, redes, ahora }));
}

export async function cancelarPublicacion(id) {
  return pedir(`/publicar/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function reintentarPublicacion(id) {
  return pedir(`/publicar/${encodeURIComponent(id)}/reintentar`, { method: "POST" });
}

// ------------------------------------------------------------
// Resultados: las métricas guardadas por el cron
// ------------------------------------------------------------

export async function metricasCliente(clientId, dias = 30) {
  return pedir(`/metricas/clientes/${encodeURIComponent(clientId)}?dias=${dias}`);
}

/** La foto de una cuenta, ahora (una por petición: cada una son ~30 llamadas a Meta). */
export async function actualizarMetricasCuenta(cuentaId) {
  return pedir(`/metricas/cuentas/${encodeURIComponent(cuentaId)}/actualizar`, { method: "POST" });
}

export async function resumenMetricas() {
  return pedir("/metricas/resumen");
}

// ------------------------------------------------------------
// Informes mensuales
// ------------------------------------------------------------

export async function listarInformes(clientId) {
  return (await pedir(`/informes?cliente=${encodeURIComponent(clientId)}`)) ?? [];
}

export async function leerInforme(id) {
  return pedir(`/informes/${encodeURIComponent(id)}`);
}

/** Generar tarda: la IA escribe el análisis (hasta un par de minutos). */
export async function generarInforme(clientId, mes) {
  return avisarGasto(pedir("/informes", conCuerpo("POST", { clientId, mes })));
}

export async function compartirInforme(id) {
  return pedir(`/informes/${encodeURIComponent(id)}/enlace`, { method: "POST" });
}

export async function dejarDeCompartirInforme(id) {
  return pedir(`/informes/${encodeURIComponent(id)}/enlace`, conCuerpo("PATCH", { compartido: false }));
}

export async function borrarInforme(id) {
  return pedir(`/informes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** El informe que abre el cliente, sin sesión: sólo si se compartió. */
export async function informePublico(testigo) {
  return pedir(`/publico-informe/${encodeURIComponent(testigo)}`);
}

// ------------------------------------------------------------
// TikTok: una conexión por cliente
// ------------------------------------------------------------

/** Conectar aquí es NAVEGAR a TikTok (con la cuenta del cliente). */
export const urlConectarTikTok = (clientId) => `/api/redes/tiktok/conectar?cliente=${encodeURIComponent(clientId)}`;

/** El enlace para que el cliente conecte su TikTok desde su teléfono (vale una semana). */
export async function enlaceTikTok(clientId) {
  return pedir("/redes/tiktok/enlace", conCuerpo("POST", { clientId }));
}

export async function desconectarTikTok(cuentaId) {
  return pedir("/redes/tiktok/desconectar", conCuerpo("POST", { cuentaId }));
}

/** «borrador» (a la bandeja del cliente) o «directo». */
export async function modoTikTok(cuentaId, modo) {
  return pedir(`/redes/cuentas/${encodeURIComponent(cuentaId)}`, conCuerpo("PUT", { modo }));
}
