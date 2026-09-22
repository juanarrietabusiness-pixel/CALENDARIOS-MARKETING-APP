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

const JSON_CLIENTES = ["ideas_bank", "saved_categories", "weekly_structure", "meta_recipe"];
const JSON_CALENDARIOS = ["week_concepts", "days", "visual_references", "day_labels"];
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

/** Quita lo que el navegador no puede fijar. */
function sinCamposDeServidor(datos, prohibidos) {
  const fila = { ...datos };
  for (const c of prohibidos) delete fila[c];
  return fila;
}

export async function rutasDatos(req, env, ctx) {
  const { acceso, partes, metodo } = ctx;
  const [, seccion, id, sub, subId] = ["", ...partes];

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
        return json(await acceso.leer("client_tasks", { client_id: id }, "position asc, created_at asc"));
      }
      if (metodo === "POST" && subId === "plantillas") {
        const { templates = [] } = (await cuerpo(req)) ?? {};
        const creadas = [];
        for (const t of templates) {
          const fila = {
            id: uuid(), client_id: id, title: t.title,
            description: t.description || "", status: "pending",
            recurrence: t.recurrence || "none", recurrence_day: t.recurrence_day ?? null,
            created_at: ahora(),
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
        await acceso.guardar("client_tasks", fila);
        const tarea = await acceso.leerUno("client_tasks", { id: fila.id });
        difundir(env, acceso.ownerId, { tipo: "tarea", tarea, por: firma(ctx.usuario, req) });
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
      const limpio = sinCamposDeServidor(datos, [
        "owner_id", "share_token", "share_enabled", "share_expires_at",
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
      const n = await acceso.actualizar("client_tasks", { id }, campos);
      if (!n) return noEncontrado("Tarea");
      const tarea = await acceso.leerUno("client_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea", tarea, por: firma(ctx.usuario, req) });
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
      return json(await acceso.leerUno("task_templates", { id: fila.id }), 201);
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      if (campos.is_mandatory !== undefined) campos.is_mandatory = campos.is_mandatory ? 1 : 0;
      const n = await acceso.actualizar("task_templates", { id }, campos);
      if (!n) return noEncontrado("Plantilla");
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
      return json(await acceso.leer("quick_tasks", {}, "position asc, created_at asc"));
    }
    if (metodo === "POST" && !id) {
      const datos = (await cuerpo(req)) ?? {};
      const fila = {
        id: uuid(), title: datos.title || "", status: "pending",
        assigned_to: datos.assigned_to || "", description: datos.description || "",
        position: datos.position ?? 0, created_at: ahora(),
      };
      await acceso.insertar("quick_tasks", fila);
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea: fila, por: firma(ctx.usuario, req) });
      return json(fila, 201);
    }
    if (metodo === "PUT" && id) {
      const datos = (await cuerpo(req)) ?? {};
      const campos = sinCamposDeServidor(datos, ["owner_id", "id", "created_at"]);
      const n = await acceso.actualizar("quick_tasks", { id }, campos);
      if (!n) return noEncontrado("Tarea rápida");
      const tarea = await acceso.leerUno("quick_tasks", { id });
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea, por: firma(ctx.usuario, req) });
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
