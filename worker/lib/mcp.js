// ============================================================
// Las herramientas que Claude usa desde cualquier chat (MCP)
//
// No es «reenviar mensajes al asistente»: eso sería pagar dos veces (el
// Claude del chat y la API de la aplicación). Aquí el Claude del chat ES
// el asistente: se le dan las herramientas y las usa él.
//
//   · Las de CONSULTA son las mismas del asistente de la aplicación
//     (`herramientasServidor.js`): calendario, tareas, banco de ideas,
//     resultados y repositorio. Una sola implementación.
//   · Las que ESCRIBEN pasan por la misma capa de acceso que la API, con
//     el espacio del token, y avisan al espacio en vivo firmadas como
//     «Claude»: quien tenga la aplicación abierta lo ve al momento.
//
// Publicar ya y borrar se declaran destructivas (`destructiveHint`), para
// que Claude pida confirmación antes.
// ============================================================

import { crearEjecutor } from "./herramientasServidor.js";
import { difundir } from "./vivo.js";
import { uuid, ahora } from "./ids.js";
import { programar, programarLote, cancelarPendientes, resincronizarCalendario, filaPublica, filaConResumen, ErrorPublicar } from "./publicador.js";
import { normalizarHora } from "../../src/lib/horas.js";
import { aprobadasSinProgramar, fechaHora } from "../../src/lib/cola.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";

// Las columnas JSON de `clients`, como las devuelve la API (datos.js).
const JSON_CLIENTES = ["ideas_bank", "saved_categories", "weekly_structure", "meta_recipe", "competidores"];
const FORMATOS = ["post", "reel", "carrusel", "historia", "live"];
const REDES = ["instagram", "facebook", "tiktok"];

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const idPublicacion = () => `p${uuid().replace(/-/g, "").slice(0, 12)}`;

const clienteParam = { cliente: { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." } };
const pubParam = { publicacion_id: { type: "string", description: "El ID de la publicación (sale en ver_calendario)." } };
const soloLectura = { readOnlyHint: true, openWorldHint: false };
const escribe = (destructiva = false) => ({ readOnlyHint: false, destructiveHint: destructiva, openWorldHint: false });

/** La lista de herramientas, con la forma de MCP (`inputSchema`, `annotations`). */
export const HERRAMIENTAS_MCP = Object.freeze([
  { name: "listar_clientes", description: "Los clientes de la agencia, con su rubro, su Instagram y sus calendarios (mes y nombre). Empieza por aquí si no sabes el nombre exacto.", inputSchema: { type: "object", properties: {} }, annotations: soloLectura },
  { name: "ver_calendario", description: "Las publicaciones de un calendario de un cliente: fecha, ID, formato, hora, estado de aprobación, idea, descripción y guion.", inputSchema: { type: "object", properties: { ...clienteParam, mes: { type: "string", description: "AAAA-MM. Si se omite, el más reciente." } }, required: ["cliente"] }, annotations: soloLectura },
  { name: "ver_cola", description: "La cola de publicación: qué sale en los próximos días, qué falló (con el motivo) y qué salió. De todos los clientes o de uno.", inputSchema: { type: "object", properties: { ...clienteParam, dias: { type: "integer", description: "Días hacia delante. Por defecto 7." } } }, annotations: soloLectura },
  { name: "ver_tareas", description: "Las tareas de un cliente, o todas si no se indica cliente.", inputSchema: { type: "object", properties: { ...clienteParam, estado: { type: "string", enum: ["pendientes", "terminadas", "todas"] } } }, annotations: soloLectura },
  { name: "ver_banco_ideas", description: "Las ideas guardadas de un cliente.", inputSchema: { type: "object", properties: { ...clienteParam }, required: ["cliente"] }, annotations: soloLectura },
  { name: "ver_resultados", description: "Cómo le va en redes a un cliente: seguidores, alcance, interacción, mejores publicaciones, formatos, horarios y competencia.", inputSchema: { type: "object", properties: { ...clienteParam, dias: { type: "integer", description: "7 a 90. Por defecto 30." } }, required: ["cliente"] }, annotations: soloLectura },
  {
    name: "crear_publicacion",
    description: "Añade una publicación al calendario del cliente para ese día (el calendario de ese mes tiene que existir). Queda pendiente de aprobación.",
    inputSchema: {
      type: "object",
      properties: {
        ...clienteParam,
        fecha: { type: "string", description: "AAAA-MM-DD" },
        formato: { type: "string", enum: FORMATOS },
        titulo: { type: "string" }, idea: { type: "string" }, descripcion: { type: "string", description: "El caption." },
        guion: { type: "string" }, hashtags: { type: "string" }, hora: { type: "string", description: "Ej.: 18:30 o 6:30 pm" },
        redes: { type: "array", items: { type: "string", enum: REDES } },
      },
      required: ["cliente", "fecha", "formato"],
    },
    annotations: escribe(),
  },
  {
    name: "editar_publicacion",
    description: "Cambia campos de una publicación: sólo los que se pasen. Para cambiarla de día, mover_publicacion.",
    inputSchema: {
      type: "object",
      properties: {
        ...pubParam,
        titulo: { type: "string" }, idea: { type: "string" }, descripcion: { type: "string" }, guion: { type: "string" },
        hashtags: { type: "string" }, hora: { type: "string" }, formato: { type: "string", enum: FORMATOS },
        redes: { type: "array", items: { type: "string", enum: REDES } }, nota_interna: { type: "string" },
      },
      required: ["publicacion_id"],
    },
    annotations: escribe(),
  },
  { name: "mover_publicacion", description: "Cambia una publicación de día (dentro del mismo mes). Si estaba programada, la cola se mueve con ella.", inputSchema: { type: "object", properties: { ...pubParam, fecha: { type: "string", description: "AAAA-MM-DD" } }, required: ["publicacion_id", "fecha"] }, annotations: escribe() },
  { name: "eliminar_publicacion", description: "Borra una publicación del calendario. No se puede deshacer.", inputSchema: { type: "object", properties: { ...pubParam }, required: ["publicacion_id"] }, annotations: escribe(true) },
  { name: "programar_publicacion", description: "Pone una publicación en la cola para que salga sola a su día y hora en sus redes (y su historia, si la tiene). Las imágenes que Instagram no acepte tal cual hay que prepararlas desde la aplicación.", inputSchema: { type: "object", properties: { ...pubParam, redes: { type: "array", items: { type: "string", enum: REDES } } }, required: ["publicacion_id"] }, annotations: escribe() },
  { name: "programar_lo_aprobado", description: "Programa de una vez todo lo que el cliente aprobó en un mes y aún no está en la cola. Devuelve lo que no se pudo y por qué.", inputSchema: { type: "object", properties: { ...clienteParam, mes: { type: "string", description: "AAAA-MM. Si se omite, el más reciente." } }, required: ["cliente"] }, annotations: escribe() },
  { name: "cancelar_programacion", description: "Saca de la cola lo que aún no salió de una publicación.", inputSchema: { type: "object", properties: { ...pubParam }, required: ["publicacion_id"] }, annotations: escribe(true) },
  { name: "crear_tarea", description: "Crea una tarea para un cliente (o una tarea rápida sin cliente).", inputSchema: { type: "object", properties: { ...clienteParam, titulo: { type: "string" }, fecha_limite: { type: "string", description: "AAAA-MM-DD" }, para_hoy: { type: "boolean" } }, required: ["titulo"] }, annotations: escribe() },
  { name: "completar_tarea", description: "Marca una tarea como hecha. El id sale de ver_tareas.", inputSchema: { type: "object", properties: { tarea_id: { type: "string" } }, required: ["tarea_id"] }, annotations: escribe() },
  { name: "anadir_idea", description: "Guarda una idea en el banco de ideas del cliente.", inputSchema: { type: "object", properties: { ...clienteParam, idea: { type: "string" }, formato: { type: "string", enum: FORMATOS }, descripcion: { type: "string" } }, required: ["cliente", "idea"] }, annotations: escribe() },
]);

/** Un error de lo pedido: vuelve a Claude como resultado con `isError`, no como fallo del servidor. */
class ErrorHerramienta extends Error {}

export function crearHerramientasMCP({ env, acceso, usuario }) {
  const consultas = crearEjecutor({ env, acceso });
  const por = { userId: usuario.id, nombre: `Claude (${usuario.nombre})`, color: "#D97757", tab: null };
  let clientes = null;

  async function resolverCliente(nombre) {
    if (!nombre) throw new ErrorHerramienta("Indica de qué cliente.");
    clientes ??= await acceso.leer("clients", {}, "created_at asc");
    const n = normalizar(nombre);
    const c = clientes.find((x) => x.id === nombre) ?? clientes.find((x) => normalizar(x.name) === n) ?? clientes.find((x) => normalizar(x.name).includes(n));
    if (!c) throw new ErrorHerramienta(`No encontré el cliente «${nombre}». Usa listar_clientes.`);
    return c;
  }

  async function calendarioDe(c, mes) {
    const cals = await acceso.leer("calendars", { client_id: c.id }, "year desc, month desc");
    if (!cals.length) throw new ErrorHerramienta(`${c.name} no tiene calendarios.`);
    if (!mes) return cals[0];
    const [a, m] = String(mes).split("-").map(Number);
    const cal = cals.find((x) => x.year === a && x.month === m - 1);
    if (!cal) throw new ErrorHerramienta(`${c.name} no tiene calendario de ${mes}. Tiene: ${cals.map((x) => `${x.year}-${String(x.month + 1).padStart(2, "0")}`).join(", ")}.`);
    return cal;
  }

  /** Busca una publicación por su id en todos los calendarios del espacio. */
  async function buscar(postId) {
    const cals = await acceso.leer("calendars", {}, "year desc, month desc");
    for (const cal of cals) {
      const days = leerJSON(cal.days, []);
      for (const d of days) {
        const i = (d.posts ?? []).findIndex((p) => p?.id === postId);
        if (i >= 0) return { cal, days, dia: d, indice: i, post: d.posts[i] };
      }
    }
    throw new ErrorHerramienta(`No encontré la publicación «${postId}». Usa ver_calendario para ver los IDs.`);
  }

  /** Escribe los días del calendario, mueve la cola y avisa al espacio. Lo mismo que el PUT de la API. */
  async function guardarDias(cal, days) {
    await acceso.actualizar("calendars", { id: cal.id }, { days: JSON.stringify(days), updated_at: ahora() });
    const crudo = await acceso.leerUno("calendars", { id: cal.id });
    try { await resincronizarCalendario(env, acceso, crudo, por); } catch (e) { console.error("mcp resincronizar:", e); }
    difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: cal.client_id, por });
  }

  const hora = (h) => {
    if (h === undefined || h === null || h === "") return undefined;
    const n = normalizarHora(String(h));
    if (!n) throw new ErrorHerramienta(`No entiendo la hora «${h}». Escríbela como 18:30 o 6:30 pm.`);
    return n;
  };
  const fechaValida = (f) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f ?? ""))) throw new ErrorHerramienta("La fecha va como AAAA-MM-DD.");
    return f;
  };
  const describir = (p, fecha) => `${fecha} · ${p.format} · «${p.title || p.idea || "sin título"}»${p.publishTime ? ` a las ${p.publishTime}` : ""} (ID ${p.id})`;

  const acciones = {
    async listar_clientes() {
      clientes ??= await acceso.leer("clients", {}, "created_at asc");
      const cals = await acceso.leer("calendars", {}, "year desc, month desc");
      return clientes.map((c) => {
        const suyos = cals.filter((k) => k.client_id === c.id).map((k) => `${k.year}-${String(k.month + 1).padStart(2, "0")}${k.name ? ` («${k.name}»)` : ""}`);
        return `· ${c.name}${c.industry ? ` — ${c.industry}` : ""}${c.instagram ? ` · ${c.instagram}` : ""}\n  Calendarios: ${suyos.join(", ") || "ninguno"}`;
      }).join("\n") || "Todavía no hay clientes.";
    },

    async ver_cola({ cliente, dias = 7 }) {
      const c = cliente ? await resolverCliente(cliente) : null;
      const n = Math.min(60, Math.max(1, Number(dias) || 7));
      const filas = (await acceso.leer("publicaciones_programadas", c ? { client_id: c.id } : {}, "programada_para asc"))
        .filter((f) => f.estado !== "cancelada").map(filaConResumen);
      clientes ??= await acceso.leer("clients", {}, "created_at asc");
      const nombre = (id) => clientes.find((x) => x.id === id)?.name ?? "¿?";
      const hasta = sumarDias(fechaEnZona(), n);
      const linea = (f) => `· ${fechaHora(f.programadaPara)} · ${nombre(f.clientId)} · ${f.red}${f.variante === "historia" ? " (historia)" : ""} · «${f.titulo || "sin título"}» (publicación ${f.postId})`;
      const fallidas = filas.filter((f) => f.estado === "error");
      const proximas = filas.filter((f) => ["programada", "procesando"].includes(f.estado) && f.programadaPara.slice(0, 10) <= hasta);
      const salieron = filas.filter((f) => f.estado === "publicada" && (f.publicadaAt ?? "") >= `${sumarDias(fechaEnZona(), -7)}`).slice(-10);
      return [
        fallidas.length ? `NO SE PUBLICARON (${fallidas.length}):\n${fallidas.map((f) => `${linea(f)}\n  Motivo: ${f.error}`).join("\n")}` : "Nada ha fallado.",
        `PRÓXIMOS ${n} DÍAS (${proximas.length}):\n${proximas.map(linea).join("\n") || "(nada)"}`,
        salieron.length ? `SALIERON (última semana):\n${salieron.map((f) => `${linea(f)}${f.enlace ? ` → ${f.enlace}` : ""}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
    },

    async crear_publicacion({ cliente, fecha, formato, titulo, idea, descripcion, guion, hashtags, hora: h, redes }) {
      const c = await resolverCliente(cliente);
      fechaValida(fecha);
      if (!FORMATOS.includes(formato)) throw new ErrorHerramienta(`Formato no válido: ${formato}.`);
      const cal = await calendarioDe(c, fecha.slice(0, 7));
      const days = leerJSON(cal.days, []);
      let dia = days.find((d) => d.date === fecha);
      if (!dia) {
        dia = { date: fecha, dayName: DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()], posts: [] };
        days.push(dia);
        days.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
      const post = {
        id: idPublicacion(), format: formato, status: "pending",
        title: titulo ?? "", idea: idea ?? "", descripcion: descripcion ?? "", guion: guion ?? "",
        hashtagsFinales: hashtags ?? "", publishTime: hora(h) ?? "",
        ...(Array.isArray(redes) && redes.length ? { redes: redes.filter((r) => REDES.includes(r)) } : {}),
      };
      dia.posts = [...(dia.posts ?? []), post];
      await guardarDias(cal, days);
      return `Creada: ${describir(post, fecha)} en el calendario de ${c.name}.`;
    },

    async editar_publicacion({ publicacion_id: id, titulo, idea, descripcion, guion, hashtags, hora: h, formato, redes, nota_interna: nota }) {
      const { cal, days, dia, indice, post } = await buscar(id);
      if (formato !== undefined && !FORMATOS.includes(formato)) throw new ErrorHerramienta(`Formato no válido: ${formato}.`);
      const cambios = Object.fromEntries(Object.entries({
        title: titulo, idea, descripcion, guion, hashtagsFinales: hashtags, publishTime: hora(h), format: formato,
        redes: Array.isArray(redes) ? redes.filter((r) => REDES.includes(r)) : undefined, comment: nota,
      }).filter(([, v]) => v !== undefined));
      if (!Object.keys(cambios).length) throw new ErrorHerramienta("No indicaste nada que cambiar.");
      dia.posts[indice] = { ...post, ...cambios };
      await guardarDias(cal, days);
      return `Actualizada: ${describir(dia.posts[indice], dia.date)}. Cambió: ${Object.keys(cambios).join(", ")}.`;
    },

    async mover_publicacion({ publicacion_id: id, fecha }) {
      fechaValida(fecha);
      const { cal, days, dia, indice, post } = await buscar(id);
      if (fecha.slice(0, 7) !== dia.date.slice(0, 7)) throw new ErrorHerramienta("Sólo se puede mover dentro del mismo mes: para otro mes, créala en ese calendario y borra ésta.");
      dia.posts.splice(indice, 1);
      let destino = days.find((d) => d.date === fecha);
      if (!destino) {
        destino = { date: fecha, dayName: DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()], posts: [] };
        days.push(destino);
        days.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
      destino.posts = [...(destino.posts ?? []), post];
      await guardarDias(cal, days);
      return `Movida al ${fecha}: ${describir(post, fecha)}.`;
    },

    async eliminar_publicacion({ publicacion_id: id }) {
      const { cal, days, dia, indice, post } = await buscar(id);
      dia.posts.splice(indice, 1);
      await guardarDias(cal, days);
      return `Borrada: ${describir(post, dia.date)}.`;
    },

    async programar_publicacion({ publicacion_id: id, redes }) {
      const { cal, post, dia } = await buscar(id);
      try {
        const filas = await programar(env, acceso, { calendarId: cal.id, postId: id, redes: Array.isArray(redes) ? redes : null, usuarioId: usuario.id });
        difundir(env, acceso.ownerId, { tipo: "publicacion", calId: cal.id, postId: id, por });
        return `Programada ${describir(post, dia.date)}:\n${filas.map(filaPublica).map((f) => `· ${f.red}${f.variante === "historia" ? " (historia)" : ""}: ${fechaHora(f.programadaPara)}`).join("\n")}`;
      } catch (e) {
        if (e instanceof ErrorPublicar) throw new ErrorHerramienta(e.message);
        throw e;
      }
    },

    async programar_lo_aprobado({ cliente, mes }) {
      const c = await resolverCliente(cliente);
      const cal = await calendarioDe(c, mes);
      const cola = (await acceso.leer("publicaciones_programadas", { calendar_id: cal.id })).map(filaPublica);
      const candidatas = aprobadasSinProgramar(leerJSON(cal.days, []), cola);
      if (!candidatas.length) return "No hay nada aprobado pendiente de programar en ese calendario.";
      const { nuevas, fallidas } = await programarLote(env, acceso, { calendarId: cal.id, postIds: candidatas.map((x) => x.post.id), usuarioId: usuario.id });
      if (nuevas.length) difundir(env, acceso.ownerId, { tipo: "publicacion", calId: cal.id, por });
      const titulo = (pid) => candidatas.find((x) => x.post.id === pid)?.post;
      return [
        `Programadas ${nuevas.length} piezas de ${candidatas.length} publicaciones aprobadas.`,
        ...fallidas.map((f) => `· No se pudo «${titulo(f.postId)?.title || titulo(f.postId)?.idea || f.postId}»: ${f.motivo}`),
      ].join("\n");
    },

    async cancelar_programacion({ publicacion_id: id }) {
      const { cal } = await buscar(id);
      const n = await cancelarPendientes(acceso, cal.id, id, "Cancelada desde Claude.");
      difundir(env, acceso.ownerId, { tipo: "publicacion", calId: cal.id, postId: id, por });
      return n ? `Cancelado lo que aún no había salido (${n}).` : "No había nada pendiente de salir de esa publicación.";
    },

    async crear_tarea({ cliente, titulo, fecha_limite: limite, para_hoy: hoy }) {
      if (!String(titulo ?? "").trim()) throw new ErrorHerramienta("Falta el título de la tarea.");
      if (limite) fechaValida(limite);
      const base = { id: uuid(), title: String(titulo).trim().slice(0, 300), status: "pending", created_at: ahora(), ...(hoy ? { today_date: fechaEnZona() } : {}) };
      if (cliente) {
        const c = await resolverCliente(cliente);
        const fila = { ...base, client_id: c.id, recurrence: "none", due_date: limite || null };
        await acceso.insertar("client_tasks", fila);
        difundir(env, acceso.ownerId, { tipo: "tarea", tarea: fila, por });
        return `Tarea creada para ${c.name}: «${fila.title}»${limite ? `, vence el ${limite}` : ""} (id ${fila.id}).`;
      }
      const fila = { ...base };
      await acceso.insertar("quick_tasks", fila);
      difundir(env, acceso.ownerId, { tipo: "tarea-rapida", tarea: fila, por });
      return `Tarea rápida creada: «${fila.title}» (id ${fila.id}).`;
    },

    async completar_tarea({ tarea_id: id }) {
      for (const [tabla, rapida] of [["client_tasks", false], ["quick_tasks", true]]) {
        const t = await acceso.leerUno(tabla, { id });
        if (!t) continue;
        await acceso.actualizar(tabla, { id }, { status: "completed", completed_at: ahora() });
        difundir(env, acceso.ownerId, { tipo: rapida ? "tarea-rapida" : "tarea", tarea: { ...t, status: "completed", completed_at: ahora() }, por });
        return `Hecha: «${t.title}».`;
      }
      throw new ErrorHerramienta(`No encontré la tarea «${id}». Usa ver_tareas.`);
    },

    async anadir_idea({ cliente, idea, formato = "post", descripcion = "" }) {
      const c = await resolverCliente(cliente);
      const ideas = leerJSON(c.ideas_bank, []) ?? [];
      const nueva = { id: idPublicacion(), idea: String(idea).slice(0, 1000), format: FORMATOS.includes(formato) ? formato : "post", descripcion: String(descripcion).slice(0, 2000), createdAt: ahora() };
      await acceso.actualizar("clients", { id: c.id }, { ideas_bank: JSON.stringify([...ideas, nueva]) });
      clientes = null;
      const actualizado = await acceso.leerUno("clients", { id: c.id });
      const salida = { ...actualizado };
      for (const k of JSON_CLIENTES) if (typeof salida[k] === "string") salida[k] = leerJSON(salida[k], null);
      difundir(env, acceso.ownerId, { tipo: "cliente", cliente: salida, por });
      return `Idea guardada en el banco de ${c.name}.`;
    },
  };

  /** Ejecuta una herramienta. Devuelve SIEMPRE el resultado de MCP: `content` y, si falló, `isError`. */
  async function llamar(nombre, entrada = {}) {
    try {
      if (acciones[nombre]) return { content: [{ type: "text", text: await acciones[nombre](entrada ?? {}) }] };
      if (["ver_calendario", "ver_tareas", "ver_banco_ideas", "ver_resultados"].includes(nombre)) {
        const r = await consultas.ejecutar({ id: "mcp", name: nombre, input: entrada ?? {} });
        return { content: [{ type: "text", text: String(r.content) }], ...(r.is_error ? { isError: true } : {}) };
      }
      return { content: [{ type: "text", text: `Herramienta desconocida: ${nombre}` }], isError: true };
    } catch (e) {
      if (!(e instanceof ErrorHerramienta)) console.error("mcp:", nombre, e);
      return { content: [{ type: "text", text: e instanceof ErrorHerramienta ? e.message : `No se pudo: ${e?.message ?? e}` }], isError: true };
    }
  }

  return { llamar };
}
