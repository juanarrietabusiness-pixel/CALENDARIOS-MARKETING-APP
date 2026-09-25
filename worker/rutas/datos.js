// ============================================================
// Las rutas con sesión — lo que sustituye a PostgREST
//
// Devuelven FILAS con la misma forma que daba PostgREST, para que los
// conversores del front (rowToClient, rowToCalendar…) no cambien ni una
// línea. Es lo que hace que esta migración sea larga pero no arriesgada.
//
// DOS CONVERSIONES QUE NO SON COSMÉTICAS
//
//  1. En D1 el jsonb es TEXTO. Si se devolviera tal cual, `row.days`
//     llegaría como una cadena y `days.map(...)` reventaría.
//
//  2. En D1 el boolean es 0/1. Y `rowToCalendar` hace
//     `row.share_enabled !== false`: con un 0 eso da **true**, así que
//     un enlace desactivado se vería activo. No falla nada; sólo miente.
//
// Y UNA REGLA NUEVA: TODA ESCRITURA AVISA
//
// Detrás de cada `acceso.guardar/insertar/borrar` va un `difundir`. Una
// que se olvide no falla —guarda perfectamente— y deja a la otra persona
// mirando lo de antes sin ningún síntoma. Por eso van pegados: el aviso
// se escribe en la misma línea que la escritura o no se escribe nunca.
// ============================================================

import { json, error, sinContenido, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, testigo, ahora } from "../lib/ids.js";
import { difundir, firma } from "../lib/vivo.js";
import { tareasParaPurgar, terminadasBorrables, MODOS_PURGA } from "../lib/tareas.js";
import { fechaEnZona, debeReabrirse, esFecha } from "../../src/lib/agenda.js";
import { leerConfigIA, MODELOS_ELEGIBLES, RAZONAMIENTOS, ACCIONES_LIMITE } from "../lib/configIA.js";

const JSON_CLIENTES = ["ideas_bank", "saved_categories", "weekly_structure", "meta_recipe"];
const JSON_CALENDARIOS = ["week_concepts", "days", "visual_references", "day_labels", "opciones"];
const BOOL_CALENDARIOS = ["share_enabled", "allow_editing"];

function parsear(fila, columnas, booleanos = []) {
  if (!fila) return fila;
  const salida = { ...fila };
  for (const c of columnas) {
    if (typeof salida[c] === "string") {
      try { salida[c] = JSON.parse(salida[c]); } catch { salida[c] = null; }
    }
  }
  for (const b of booleanos) {
    if (salida[b] !== null && salida[b] !== undefined) salida[b] = salida[b] === 1 || salida[b] === true;
  }
  return salida;
}

const salidaCliente = (f) => parsear(f, JSON_CLIENTES);
const salidaCalendario = (f) => parsear(f, JSON_CALENDARIOS, BOOL_CALENDARIOS);

/** Lo contrario: el jsonb del front vuelve a texto antes de entrar en D1. */
function aTexto(datos, columnas, booleanos = []) {
  const fila = { ...datos };
  for (const c of columnas) {
    if (fila[c] !== undefined && typeof fila[c] !== "string") fila[c] = JSON.stringify(fila[c] ?? null);
  }
  for (const b of booleanos) {
    if (fila[b] !== undefined) fila[b] = fila[b] ? 1 : 0;
  }
  return fila;
}

/**
 * Las fechas de una tarea son días AAAA-MM-DD o nada. Otra forma —un
 * instante ISO, «mañana»— se guardaría igual y el `<input type="date">`
 * la mostraría vacía: la tarea tendría fecha y nadie la vería.
 */
function fechasValidas(campos) {
  return ["due_date", "today_date"].every((c) => campos[c] == null || esFecha(campos[c]));
}

/** Quita lo que el navegador no puede fijar. */
function sinCamposDeServidor(datos, prohibidos) {
  const fila = { ...datos };
  for (const c of prohibidos) delete fila[c];
  return fila;
}

/**
 * Toda tarea que se guarda con alguien asignado deja su nombre en
 * `responsables`, para escogerlo la próxima vez en vez de escribirlo.
 * Así se llena solo, también con lo que crea el asistente.
 */
async function recordarResponsable(env, ctx, req, nombre) {
  const n = String(nombre ?? "").trim().slice(0, 80);
  if (!n) return;
  const { acceso } = ctx;
  if (await acceso.leerUno("responsables", { nombre: n })) return;
  try {
    await acceso.insertar("responsables", { id: uuid(), nombre: n, created_at: ahora() });
    difundir(env, acceso.ownerId, { tipo: "responsable", por: firma(ctx.usuario, req) });
  } catch { /* dos guardados a la vez: el índice único ya lo tiene */ }
}

/**
 * Una recurrente cerrada vuelve a pendiente cuando empieza su periodo
 * siguiente: la diaria cada mañana, la de los lunes cada lunes. Sin
 * esto se completaba una vez y no volvía a aparecer nunca, que es justo
 * lo contrario de lo que significa «recurrente».
 *
 * Al leer, como la purga, y con la misma cuenta de fechas que usa el
 * navegador (src/lib/agenda.js): dos copias de «qué semana es» acaban
 * discrepando.
 */
async function reabrirRecurrentes(env, ctx, req) {
  const { acceso } = ctx;
  const hoy = fechaEnZona();
  const cerradas = await acceso.leer("client_tasks", { status: "completed" });
  for (const t of cerradas) {
    if (!debeReabrirse(t, hoy)) continue;
    await acceso.actualizar("client_tasks", { id: t.id }, { status: "pending", completed_at: null });
    difundir(env, acceso.ownerId, { tipo: "tarea", tarea: { ...t, status: "pending", completed_at: null }, por: firma(ctx.usuario, req) });
  }
}

/**
 * La purga automática corre al LEER tareas, no con un cron: sin nadie
 * mirando no hace falta que desaparezcan, y así no hay otra pieza que
 * desplegar ni que pueda quedarse parada sin que nadie lo note.
 */
async function purgarTareas(env, ctx, req) {
  const { acceso } = ctx;
  await reabrirRecurrentes(env, ctx, req);
  const ajustes = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
  const modo = ajustes?.purga_tareas ?? "nunca";
  if (modo === "nunca") return;
  const [deClientes, rapidas] = await Promise.all([
    acceso.leer("client_tasks", { status: "completed" }),
    acceso.leer("quick_tasks", { status: "completed" }),
  ]);
  for (const t of tareasParaPurgar(deClientes, modo)) {
    await acceso.borrar("client_tasks", { id: t.id });
    difundir(env, acceso.ownerId, { tipo: "tarea:fuera", id: t.id, por: firma(ctx.usuario, req) });
  }
  for (const t of tareasParaPurgar(rapidas, modo)) {
    await acceso.borrar("quick_tasks", { id: t.id });
    difundir(env, acceso.ownerId, { tipo: "tarea-rapida:fuera", id: t.id, por: firma(ctx.usuario, req) });
  }
}

export async function rutasDatos(req, env, ctx) {
  const { acceso, partes, metodo } = ctx;
  const [, seccion, id, sub, subId] = ["", ...partes];

  // ---- /api/ajustes ----
  //
  // Las opciones de la IA las cambia SÓLO el administrador: el modelo y
  // el razonamiento deciden lo que cuesta cada mes, y eso no puede
  // cambiarlo cualquiera sin querer. Se guarda lo que llega y nada más:
  // cada ajuste se valida por su cuenta.
  if (seccion === "ajustes") {
    if (metodo === "GET") {
      const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
      return json({ purga_tareas: fila?.purga_tareas ?? "nunca", ...(await leerConfigIA(acceso)) });
    }
    if (metodo === "PUT") {
      const datos = (await cuerpo(req)) ?? {};
      const cambios = {};
      if ("purga_tareas" in datos) {
        if (!(datos.purga_tareas in MODOS_PURGA)) return error("Modo de borrado inválido");
        cambios.purga_tareas = datos.purga_tareas;
      }
      const CAMPOS_ADMIN = ["ia_modelo", "ia_razonamiento", "ia_razonamiento_chat", "presupuesto_usd", "al_limite"];
      if (CAMPOS_ADMIN.some((c) => c in datos)) {
        if (ctx.usuario?.rol !== "admin") return error("Sólo el administrador cambia la configuración de la IA", 403);
        if ("ia_razonamiento_chat" in datos) {
          const v = datos.ia_razonamiento_chat;
          if (v !== null && !(v in RAZONAMIENTOS)) return error("Nivel del asistente inválido");
          cambios.ia_razonamiento_chat = v;
        }
        if ("presupuesto_usd" in datos) {
          const v = Number(datos.presupuesto_usd);
          if (!Number.isFinite(v) || v < 0 || v > 100_000) return error("Presupuesto inválido");
          cambios.presupuesto_usd = Math.round(v * 100) / 100;
        }
        if ("al_limite" in datos) {
          if (!ACCIONES_LIMITE.includes(datos.al_limite)) return error("Acción al límite inválida");
          cambios.al_limite = datos.al_limite;
        }
        if ("ia_modelo" in datos) {
          if (!MODELOS_ELEGIBLES.includes(datos.ia_modelo)) return error("Modelo inválido");
          cambios.ia_modelo = datos.ia_modelo;
        }
        if ("ia_razonamiento" in datos) {
          if (!(datos.ia_razonamiento in RAZONAMIENTOS)) return error("Nivel de razonamiento inválido");
          cambios.ia_razonamiento = datos.ia_razonamiento;
        }
      }
      if (!Object.keys(cambios).length) return error("Nada que guardar");
      const previa = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
      await acceso.guardar("ajustes_espacio", {
        id: acceso.ownerId, ...cambios,
        created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
      });
      difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(ctx.usuario, req) });
      const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
      return json({ purga_tareas: fila?.purga_tareas ?? "nunca", ...(await leerConfigIA(acceso)) });
    }
  }

  // ---- /api/responsables ----
  if (seccion === "responsables") {
    if (metodo === "GET") return json(await acceso.leer("responsables", {}, "nombre collate nocase asc"));
    if (metodo === "POST") {
      const { nombre } = (await cuerpo(req)) ?? {};
      if (!String(nombre ?? "").trim()) return error("Falta el nombre");
      await recordarResponsable(env, ctx, req, nombre);
      return json(await acceso.leerUno("responsables", { nombre: String(nombre).trim().slice(0, 80) }), 201);
    }
    if (metodo === "DELETE" && id) {
      const n = await acceso.borrar("responsables", { id });
      if (!n) return noEncontrado("Responsable");
      difundir(env, acceso.ownerId, { tipo: "responsable", por: firma(ctx.usuario, req) });
      return sinContenido();
    }
  }

  // ---- /api/espacio ----
  if (seccion === "espacio" && metodo === "GET") {
    const [clientes, calendarios] = await Promise.all([
      acceso.leer("clients", {}, "created_at asc"),
      acceso.leer("calendars", {}, "created_at asc"),
    ]);
    return json({
      clients: clientes.map(salidaCliente),
      calendars: calendarios.map(salidaCalendario),
    });
  }

  // ---- /api/clientes ----
  if (seccion === "clientes") {
    if (!sub && metodo === "PUT") {
      const datos = await cuerpo(req);
      if (!datos) return error("Cuerpo inválido");
      // `owner_id` lo impone la capa; el id lo genera el servidor si falta.
      const fila = aTexto(sinCamposDeServidor(datos, ["owner_id"]), JSON_CLIENTES);
      fila.id = id && id !== "nuevo" ? id : (fila.id || uuid());
      fila.created_at ??= ahora();
      fila.updated_at = ahora();
      await acceso.guardar("clients", fila);
      const guardado = salidaCliente(await acceso.leerUno("clients", { id: fila.id }));
      difundir(env, acceso.ownerId, { tipo: "cliente", cliente: guardado, por: firma(ctx.usuario, req) });
      return json(guardado);
    }

    if (!sub && metodo === "DELETE") {
      const n = await acceso.borrar("clients", { id });
      if (!n) return noEncontrado("Cliente");
      difundir(env, acceso.ownerId, { tipo: "cliente:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }

    // ---- subrecursos del cliente ----
    if (sub === "chat") {
      if (metodo === "GET") {
        const filas = await acceso.leer("chat_messages", { client_id: id }, "created_at asc");
        return json(filas.map((f) => ({ role: f.role, content: f.content, created_at: f.created_at })));
      }
      if (metodo === "POST") {
        const { role, content } = (await cuerpo(req)) ?? {};
        if (role !== "user" && role !== "assistant") return error("Rol inválido");
        if (!content) return error("Falta el contenido");
        await acceso.insertar("chat_messages", {
          id: uuid(), client_id: id, role, content, created_at: ahora(),
        });
        return json({ ok: true }, 201);
      }
      if (metodo === "DELETE") {
        await acceso.borrar("chat_messages", { client_id: id });
        // El resumen es de esos mensajes: borrarlos y dejarlo haría que
        // el asistente «recordara» una conversación que ya no está.
        await acceso.borrar("chat_resumenes", { client_id: id });
        return sinContenido();
      }
    }

    if (sub === "memoria") {
      if (metodo === "GET") {
        const filas = await acceso.leer("client_memories", { client_id: id }, "created_at asc");
        return json(filas.map((f) => ({ id: f.id, content: f.content, created_at: f.created_at })));
      }
      if (metodo === "POST") {
        const { content } = (await cuerpo(req)) ?? {};
        if (!content) return error("Falta el contenido");
        const fila = { id: uuid(), client_id: id, content, created_at: ahora() };
        await acceso.insertar("client_memories", fila);
        difundir(env, acceso.ownerId, { tipo: "memoria", clientId: id, por: firma(ctx.usuario, req) });
        return json({ id: fila.id, content: fila.content, created_at: fila.created_at }, 201);
      }
    }

    if (sub === "tareas") {
      if (metodo === "GET") {
        await purgarTareas(env, ctx, req);
        return json(await acceso.leer("client_tasks", { client_id: id }, "position asc, created_at asc"));
      }
      // Vaciar a mano las terminadas de este cliente. Las recurrentes se
      // quedan: son la definición de algo que vuelve.
      if (metodo === "DELETE" && subId === "terminadas") {
        const borrables = terminadasBorrables(await acceso.leer("client_tasks", { client_id: id, status: "completed" }));
        for (const t of borrables) {
          await acceso.borrar("client_tasks", { id: t.id });
          difundir(env, acceso.ownerId, { tipo: "tarea:fuera", id: t.id, por: firma(ctx.usuario, req) });
        }
        return json({ borradas: borrables.length });
      }
      if (metodo === "POST" && subId === "plantillas") {
        const { templates = [] } = (await cuerpo(req)) ?? {};
        const creadas = [];
        for (const t of templates) {
          const fila = {
            id: uuid(), client_id: id, title: t.title,
            description: t.description || "", status: "pending",
            recurrence: t.recurrence || "none", recurrence_day: t.recurrence_day ?? null,
            assigned_to: t.assigned_to || "", created_at: ahora(),
          };
          await acceso.insertar("client_tasks", fila);
          creadas.push(fila);
        }
        for (const t of creadas) difundir(env, acceso.ownerId, { tipo: "tarea", tarea: t, por: firma(ctx.usuario, req) });
        return json(creadas, 201);
      }
      if (metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        const fila = {
          ...sinCamposDeServidor(datos, ["owner_id"]),
          id: datos.id || uuid(), client_id: id, created_at: datos.created_at || ahora(),
        };
        if (!fechasValidas(fila)) return error("Fecha inválida: se espera AAAA-MM-DD");
        await acceso.guardar("client_tasks", fila);
        const tarea = await acceso.leerUno("client_tasks", { id: fila.id });
        difundir(env, acceso.ownerId, { tipo: "tarea", tarea, por: firma(ctx.usuario, req) });
        await recordarResponsable(env, ctx, req, fila.assigned_to);
        return json(tarea, 201);
      }
    }

    if (sub === "banco") {
      if (metodo === "GET") {
        return json(await acceso.leer("content_bank", { client_id: id }, "created_at desc"));
      }
      if (metodo === "POST") {
        // Subir a un cliente que no es tuyo sería escribir en el bucket
        // de otro: se comprueba el cliente ANTES de tocar R2.
        if (!(await acceso.leerUno("clients", { id }))) return noEncontrado("Cliente");

        const form = await req.formData().catch(() => null);
        const archivo = form?.get("archivo");
        if (!archivo || typeof archivo === "string") return error("Falta el archivo");

        const ext = (archivo.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
        const clave = `clientes/${id}/banco/${uuid()}.${ext}`;
        await env.MEDIA.put(clave, archivo.stream(), {
          httpMetadata: { contentType: archivo.type || "application/octet-stream" },
        });

        const fila = {
          id: uuid(), client_id: id, file_path: clave,
          file_name: String(archivo.name ?? "archivo").slice(0, 300),
          file_type: String(archivo.type ?? "").startsWith("video/") ? "video" : "image",
          description: "", size_bytes: archivo.size ?? 0, created_at: ahora(),
        };
        await acceso.insertar("content_bank", fila);
        difundir(env, acceso.ownerId, { tipo: "banco", archivo: fila, por: firma(ctx.usuario, req) });
        return json(fila, 201);
      }
    }
  }

  // ---- /api/calendarios ----
  if (seccion === "calendarios") {
    if (!sub && metodo === "PUT") {
      const datos = await cuerpo(req);
      if (!datos) return error("Cuerpo inválido");
      // El navegador no elige su propio testigo de compartición ni
      // reactiva un enlace por su cuenta: eso son rutas aparte.
      // Tampoco escribe la revisión del cliente: eso lo marca el enlace
      // público cuando el cliente pulsa «Enviar mi revisión».
      const limpio = sinCamposDeServidor(datos, [
        "owner_id", "share_token", "share_enabled", "share_expires_at",
        "revision_enviada", "revision_revisor",
      ]);
      const fila = aTexto(limpio, JSON_CALENDARIOS, ["allow_editing"]);
      fila.id = id && id !== "nuevo" ? id : (fila.id || uuid());
      fila.created_at ??= ahora();
      fila.updated_at = ahora();
      await acceso.guardar("calendars", fila);
      const guardado = salidaCalendario(await acceso.leerUno("calendars", { id: fila.id }));
      // Un mes escrito entero puede no caber en un mensaje: por eso va
      // el aviso ligero de repuesto. Ver TOPE_EVENTO en lib/vivo.js.
      difundir(
        env, acceso.ownerId,
        { tipo: "calendario", calendario: guardado, por: firma(ctx.usuario, req) },
        { tipo: "calendario:recargar", id: fila.id, clientId: guardado.client_id, por: firma(ctx.usuario, req) },
      );
      return json(guardado);
    }

    // La conversación de cada publicación con el cliente. Lo del cliente
    // entra por el enlace público; lo de la agencia, por aquí.
    if (sub === "comentarios") {
      if (!(await acceso.leerUno("calendars", { id }))) return noEncontrado("Calendario");
      if (metodo === "GET") {
        return json(await acceso.leer("comentarios_aprobacion", { calendar_id: id }, "created_at asc"));
      }
      if (metodo === "POST") {
        const { postId, texto } = (await cuerpo(req)) ?? {};
        const limpio = String(texto ?? "").trim().slice(0, 2000);
        if (!postId || !limpio) return error("Falta la publicación o el texto");
        const fila = {
          id: uuid(), calendar_id: id, post_id: String(postId).slice(0, 200), autor: "agencia",
          nombre: ctx.usuario?.nombre ?? "La agencia", texto: limpio, created_at: ahora(),
        };
        await acceso.insertar("comentarios_aprobacion", fila);
        difundir(env, acceso.ownerId, { tipo: "comentario", calId: id, postId: fila.post_id, por: firma(ctx.usuario, req) });
        return json(fila, 201);
      }
    }

    if (!sub && metodo === "DELETE") {
      const n = await acceso.borrar("calendars", { id });
      if (!n) return noEncontrado("Calendario");
      difundir(env, acceso.ownerId, { tipo: "calendario:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }

    // share_calendar: el testigo lo genera el SERVIDOR, y se reutiliza si
    // ya había uno. Regenerarlo mataría los enlaces que el cliente ya tiene.
    if (sub === "enlace" && metodo === "POST") {
      const cal = await acceso.leerUno("calendars", { id });
      if (!cal) return noEncontrado("Calendario");
      const token = cal.share_token || testigo(24);
      await acceso.actualizar("calendars", { id }, {
        share_token: token, share_enabled: 1, share_expires_at: null,
      });
      difundir(env, acceso.ownerId, { tipo: "calendario:enlace", id, enabled: true, por: firma(ctx.usuario, req) });
      return json({ token });
    }

    if (sub === "enlace" && metodo === "PATCH") {
      const { enabled } = (await cuerpo(req)) ?? {};
      const n = await acceso.actualizar("calendars", { id }, { share_enabled: enabled ? 1 : 0 });
      if (!n) return noEncontrado("Calendario");
      difundir(env, acceso.ownerId, { tipo: "calendario:enlace", id, enabled: Boolean(enabled), por: firma(ctx.usuario, req) });
      return json({ enabled: Boolean(enabled) });
    }

    if (sub === "aprobaciones" && metodo === "GET") {
      const filas = await acceso.leer("approvals", { calendar_id: id }, "updated_at desc");
      return json(filas.map((a) => ({
        post_id: a.post_id, estado: a.estado, comentario: a.comentario,
        reviewer_name: a.reviewer_name, updated_at: a.updated_at,
        suggested_descripcion: a.suggested_descripcion,
        suggested_guion: a.suggested_guion,
      })));
    }
  }

  // ---- recursos sueltos ----
  if (seccion === "memoria" && metodo === "DELETE") {
    const n = await acceso.borrar("client_memories", { id });
    if (!n) return noEncontrado("Memoria");
    difundir(env, acceso.ownerId, { tipo: "memoria", clientId: null, por: firma(ctx.usuario, req) });
    return sinContenido();
  }

  if (seccion === "tareas") {
    if (metodo === "DELETE") {
      const n = await acceso.borrar("client_tasks", { id });
      if (!n) return noEncontrado("Tarea");
      difundir(env, acceso.ownerId, { tipo: "tarea:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      if (!fechasValidas(campos)) return error("Fecha inválida: se espera AAAA-MM-DD");
      const n = await acceso.actualizar("client_tasks", { id }, campos);
      if (!n) return noEncontrado("Tarea");
      const tarea = await acceso.leerUno("client_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea", tarea, por: firma(ctx.usuario, req) });
      await recordarResponsable(env, ctx, req, campos.assigned_to);
      return json(tarea);
    }
    if (metodo === "POST" && sub === "reordenar") {
      const { ids = [] } = (await cuerpo(req)) ?? {};
      for (let i = 0; i < ids.length; i++) {
        await acceso.actualizar("client_tasks", { id: ids[i] }, { position: i });
      }
      difundir(env, acceso.ownerId, { tipo: "tarea:reorden", por: firma(ctx.usuario, req) });
      return json({ ok: true });
    }
    if (metodo === "POST" && (sub === "completar" || sub === "reabrir")) {
      const completada = sub === "completar";
      const n = await acceso.actualizar("client_tasks", { id }, {
        status: completada ? "completed" : "pending",
        completed_at: completada ? ahora() : null,
      });
      if (!n) return noEncontrado("Tarea");
      const tarea = await acceso.leerUno("client_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea", tarea, por: firma(ctx.usuario, req) });
      return json(tarea);
    }
  }

  if (seccion === "todas-tareas" && metodo === "GET") {
    await purgarTareas(env, ctx, req);
    const [clientTasks, quickTasks] = await Promise.all([
      acceso.leer("client_tasks", {}, "position asc, created_at asc"),
      acceso.leer("quick_tasks", {}, "position asc, created_at asc"),
    ]);
    return json({ clientTasks, quickTasks });
  }

  if (seccion === "plantillas-tarea") {
    if (metodo === "GET") return json(await acceso.leer("task_templates", {}, "created_at asc"));
    if (metodo === "POST") {
      const datos = (await cuerpo(req)) ?? {};
      const fila = {
        ...sinCamposDeServidor(datos, ["owner_id"]),
        id: datos.id || uuid(), created_at: datos.created_at || ahora(),
      };
      if (fila.is_mandatory !== undefined) fila.is_mandatory = fila.is_mandatory ? 1 : 0;
      await acceso.guardar("task_templates", fila);
      await recordarResponsable(env, ctx, req, fila.assigned_to);
      return json(await acceso.leerUno("task_templates", { id: fila.id }), 201);
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      if (campos.is_mandatory !== undefined) campos.is_mandatory = campos.is_mandatory ? 1 : 0;
      const n = await acceso.actualizar("task_templates", { id }, campos);
      if (!n) return noEncontrado("Plantilla");
      await recordarResponsable(env, ctx, req, campos.assigned_to);
      return json(await acceso.leerUno("task_templates", { id }));
    }
    if (metodo === "DELETE") {
      const n = await acceso.borrar("task_templates", { id });
      return n ? sinContenido() : noEncontrado("Plantilla");
    }
  }

  // ---- /api/tareas-rapidas ----
  if (seccion === "tareas-rapidas") {
    if (metodo === "GET") {
      await purgarTareas(env, ctx, req);
      return json(await acceso.leer("quick_tasks", {}, "position asc, created_at asc"));
    }
    // Antes que el DELETE por id: si no, «terminadas» se tomaría por el
    // id de una tarea y contestaría 404.
    if (metodo === "DELETE" && id === "terminadas" && !sub) {
      const borrables = terminadasBorrables(await acceso.leer("quick_tasks", { status: "completed" }));
      for (const t of borrables) {
        await acceso.borrar("quick_tasks", { id: t.id });
        difundir(env, acceso.ownerId, { tipo: "tarea-rapida:fuera", id: t.id, por: firma(ctx.usuario, req) });
      }
      return json({ borradas: borrables.length });
    }
    if (metodo === "POST" && !id) {
      const datos = (await cuerpo(req)) ?? {};
      const fila = {
        id: uuid(), title: datos.title || "", status: "pending",
        assigned_to: datos.assigned_to || "", description: datos.description || "",
        position: datos.position ?? 0, created_at: ahora(),
        due_date: datos.due_date || null, today_date: datos.today_date || null,
      };
      if (!fechasValidas(fila)) return error("Fecha inválida: se espera AAAA-MM-DD");
      await acceso.insertar("quick_tasks", fila);
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea: fila, por: firma(ctx.usuario, req) });
      await recordarResponsable(env, ctx, req, fila.assigned_to);
      return json(fila, 201);
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      if (!fechasValidas(campos)) return error("Fecha inválida: se espera AAAA-MM-DD");
      const n = await acceso.actualizar("quick_tasks", { id }, campos);
      if (!n) return noEncontrado("Tarea rápida");
      const tarea = await acceso.leerUno("quick_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea, por: firma(ctx.usuario, req) });
      await recordarResponsable(env, ctx, req, campos.assigned_to);
      return json(tarea);
    }
    if (metodo === "DELETE" && id) {
      const n = await acceso.borrar("quick_tasks", { id });
      if (!n) return noEncontrado("Tarea rápida");
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }
    if (metodo === "POST" && id === "reordenar" && !sub) {
      const { ids = [] } = (await cuerpo(req)) ?? {};
      for (let i = 0; i < ids.length; i++) {
        await acceso.actualizar("quick_tasks", { id: ids[i] }, { position: i });
      }
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida:reorden", por: firma(ctx.usuario, req) });
      return json({ ok: true });
    }
    if (metodo === "POST" && sub === "completar") {
      const n = await acceso.actualizar("quick_tasks", { id }, { status: "completed", completed_at: ahora() });
      if (!n) return noEncontrado("Tarea rápida");
      const tarea = await acceso.leerUno("quick_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea, por: firma(ctx.usuario, req) });
      return json(tarea);
    }
    if (metodo === "POST" && sub === "reabrir") {
      const n = await acceso.actualizar("quick_tasks", { id }, { status: "pending", completed_at: null });
      if (!n) return noEncontrado("Tarea rápida");
      const tarea = await acceso.leerUno("quick_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea, por: firma(ctx.usuario, req) });
      return json(tarea);
    }
  }

  // ---- /api/plantillas-imagen ----
  if (seccion === "plantillas-imagen") {
    if (metodo === "GET" && id) {
      return json(await acceso.leer("image_templates", { client_id: id }, "created_at asc"));
    }
    if (metodo === "POST") {
      const datos = (await cuerpo(req)) ?? {};
      if (!datos.client_id || !datos.name) return error("Falta cliente o nombre");
      const fila = {
        id: uuid(), client_id: datos.client_id, name: datos.name,
        prompt: datos.prompt || "", format: datos.format || "square",
        created_at: ahora(),
      };
      await acceso.insertar("image_templates", fila);
      difundir(env, acceso.ownerId, { tipo: "plantilla-imagen", plantilla: fila, por: firma(ctx.usuario, req) });
      return json(fila, 201);
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      const n = await acceso.actualizar("image_templates", { id }, campos);
      if (!n) return noEncontrado("Plantilla");
      const plantilla = await acceso.leerUno("image_templates", { id });
      return json(plantilla);
    }
    if (metodo === "DELETE" && id) {
      const n = await acceso.borrar("image_templates", { id });
      if (!n) return noEncontrado("Plantilla");
      difundir(env, acceso.ownerId, { tipo: "plantilla-imagen:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }
  }

  // ---- /api/referencias-imagen ----
  if (seccion === "referencias-imagen") {
    if (metodo === "GET" && id) {
      return json(await acceso.leer("image_references", { client_id: id }, "created_at desc"));
    }
    if (metodo === "POST") {
      if (!(await acceso.leerUno("clients", { id }))) return noEncontrado("Cliente");
      const form = await req.formData().catch(() => null);
      const archivo = form?.get("archivo");
      if (!archivo || typeof archivo === "string") return error("Falta el archivo");
      const ext = (archivo.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
      const clave = `clientes/${id}/referencias/${uuid()}.${ext}`;
      await env.MEDIA.put(clave, archivo.stream(), {
        httpMetadata: { contentType: archivo.type || "image/jpeg" },
      });
      const fila = {
        id: uuid(), client_id: id, file_path: clave,
        source: "upload", created_at: ahora(),
      };
      await acceso.insertar("image_references", fila);
      difundir(env, acceso.ownerId, { tipo: "referencia-imagen", referencia: fila, por: firma(ctx.usuario, req) });
      return json(fila, 201);
    }
    if (metodo === "DELETE" && id) {
      const item = await acceso.leerUno("image_references", { id });
      if (!item) return noEncontrado("Referencia");
      await env.MEDIA.delete(item.file_path);
      await acceso.borrar("image_references", { id });
      difundir(env, acceso.ownerId, { tipo: "referencia-imagen:fuera", id, por: firma(ctx.usuario, req) });
      return sinContenido();
    }
  }

  // ---- /api/feedback-imagen ----
  if (seccion === "feedback-imagen" && metodo === "POST") {
    const datos = (await cuerpo(req)) ?? {};
    const { clientId, clave, liked } = datos;
    if (!clientId || !clave) return error("Falta cliente o clave");
    // La clave llega del navegador: sin esto, un «no me gusta» borraba
    // cualquier objeto de R2, fuera de quien fuera.
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    if (!String(clave).startsWith(`clientes/${clientId}/generadas/`) || String(clave).includes("..")) {
      return error("La imagen no es de este cliente", 403);
    }

    if (liked) {
      const fila = {
        id: uuid(), client_id: clientId, file_path: clave,
        source: "liked", created_at: ahora(),
      };
      await acceso.insertar("image_references", fila);
      difundir(env, acceso.ownerId, { tipo: "referencia-imagen", referencia: fila, por: firma(ctx.usuario, req) });
      return json(fila, 201);
    }

    await env.MEDIA.delete(clave);
    return json({ ok: true });
  }

  if (seccion === "banco" && metodo === "DELETE") {
    const item = await acceso.leerUno("content_bank", { id });
    if (!item) return noEncontrado("Archivo");
    await env.MEDIA.delete(item.file_path);
    await acceso.borrar("content_bank", { id });
    difundir(env, acceso.ownerId, { tipo: "banco:fuera", id, clientId: item.client_id, por: firma(ctx.usuario, req) });
    return sinContenido();
  }

  return noEncontrado("Ruta");
}
