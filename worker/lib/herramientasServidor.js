// ============================================================
// Las herramientas del asistente que corren en el SERVIDOR
//
// Hasta aquí el asistente sólo tenía herramientas del navegador (crear,
// editar, borrar publicaciones…) y un resumen del ADN recortado dentro
// del prompt. Lo que no cabía en ese resumen no existía para él, y lo
// de los demás clientes, tampoco. Estas herramientas le dejan PEDIR lo
// que necesita en vez de recibirlo todo en cada mensaje:
//
//   · listar_repositorio / leer_archivo_repositorio: el repositorio de
//     GitHub del cliente, con el token del servidor. Sólo dentro de la
//     carpeta del cliente: el repositorio es de la agencia entera.
//   · ver_calendario, ver_tareas, ver_banco_ideas: lo que hay en D1,
//     siempre por la capa de acceso —el espacio de la sesión—.
//   · ver_resultados: cómo le fue en redes (las fotos diarias de
//     métricas), con las MISMAS cuentas que la pestaña Resultados.
//
// Son de LECTURA a propósito. Lo que escribe se queda en el navegador,
// que es quien tiene el estado abierto y sabe no pisar lo que la
// persona está editando.
// ============================================================

import { parseGitHubUrl, decodeRuta, decodificarBlob } from "../rutas/adn.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import {
  kpis, porFormato, mejoresMomentos, mejoresPublicaciones, resumenCompetencia, numeroCorto, DIAS_SEMANA, BLOQUES_HORA,
} from "../../src/lib/resultados.js";

const MAX_LECTURA = 60_000;
const MAX_LISTADO = 200;
const TEXTO = /\.(md|txt|json|ya?ml|csv|html?)$/i;

export const HERRAMIENTAS_WEB = Object.freeze([
  {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
    user_location: { type: "approximate", country: "PA", timezone: "America/Panama" },
  },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
]);

const clienteOpcional = {
  cliente: {
    type: "string",
    description: "Nombre del cliente. En el asistente de un cliente se puede omitir: es ese cliente.",
  },
};

export const DEFINICIONES = Object.freeze([
  {
    name: "listar_repositorio",
    description:
      "Lista las carpetas y archivos del repositorio de GitHub (ADN de marca) del cliente, dentro de su carpeta. " +
      "Úsala para saber qué documentos hay antes de leer uno.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        ruta: { type: "string", description: "Subcarpeta relativa a la carpeta del cliente. Vacío para la raíz." },
      },
    },
  },
  {
    name: "leer_archivo_repositorio",
    description:
      "Lee ENTERO un archivo de texto del repositorio del cliente (guías de marca, buyer personas, recetas, calendarios " +
      "aprobados, auditorías). Úsala cuando necesites el detalle y no el resumen.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        ruta: { type: "string", description: "Ruta del archivo relativa a la carpeta del cliente, tal como la da listar_repositorio." },
      },
      required: ["ruta"],
    },
  },
  {
    name: "ver_calendario",
    description:
      "Devuelve las publicaciones de un calendario de un cliente: fecha, ID, formato, categoría, hora, estado, idea, " +
      "descripción y guion. Úsala para consultar otro mes u otro cliente.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        mes: { type: "string", description: "Mes en formato AAAA-MM. Si se omite, el más reciente." },
      },
    },
  },
  {
    name: "ver_tareas",
    description: "Lista las tareas de un cliente —o las de todos y las rápidas, si no se indica cliente en el asistente general—.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        estado: { type: "string", enum: ["pendientes", "terminadas", "todas"], description: "Por defecto, pendientes." },
      },
    },
  },
  {
    name: "ver_banco_ideas",
    description: "Lista las ideas guardadas en el banco de ideas de un cliente.",
    input_schema: { type: "object", properties: { ...clienteOpcional } },
  },
  {
    name: "ver_resultados",
    description: "Cómo le fue en redes a un cliente: seguidores, alcance, interacciones y su cambio contra el periodo anterior, las publicaciones que mejor funcionaron, qué formato rinde más, a qué hora y cómo va la competencia. Úsala antes de proponer contenido basado en lo que funciona, o si preguntan por resultados.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        dias: { type: "integer", description: "Días hacia atrás (7 a 90). Por defecto, 30." },
      },
    },
  },
]);

export const NOMBRES = new Set([...DEFINICIONES.map((d) => d.name), ...HERRAMIENTAS_WEB.map((d) => d.name)]);

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const JSON_SEGURO = (v, porDefecto) => {
  if (typeof v !== "string") return v ?? porDefecto;
  try { return JSON.parse(v); } catch { return porDefecto; }
};

/**
 * El contexto de UNA petición: la capa de acceso, el cliente abierto (si
 * lo hay) y una caché del árbol de GitHub, que se pide una vez aunque el
 * modelo liste y lea varias veces seguidas.
 */
export function crearEjecutor({ env, acceso, clienteActual = null }) {
  const arboles = new Map();
  let clientes = null;

  async function resolverCliente(nombre) {
    if (!nombre) {
      if (clienteActual) return clienteActual;
      throw new Error("Indica de qué cliente.");
    }
    clientes ??= await acceso.leer("clients", {}, "created_at asc");
    const n = normalizar(nombre);
    const c = clientes.find((x) => x.id === nombre)
      ?? clientes.find((x) => normalizar(x.name) === n)
      ?? clientes.find((x) => normalizar(x.name).includes(n));
    if (!c) throw new Error(`No encontré el cliente «${nombre}».`);
    return c;
  }

  async function repositorio(cliente) {
    const parsed = parseGitHubUrl(cliente.github_repo || "");
    if (!parsed) throw new Error(`${cliente.name} no tiene repositorio de GitHub conectado (ficha del cliente, pestaña GitHub).`);
    const base = decodeRuta(cliente.github_folder || "") || parsed.folder || "";
    const clave = `${parsed.owner}/${parsed.repo}`;
    const cabeceras = { Accept: "application/vnd.github.v3+json", "User-Agent": "juancito-calendarios" };
    if (env.GITHUB_TOKEN) cabeceras.Authorization = `token ${env.GITHUB_TOKEN}`;
    const api = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    if (!arboles.has(clave)) {
      const res = await fetch(`${api}/git/trees/HEAD?recursive=1`, { headers: cabeceras });
      if (!res.ok) {
        throw new Error(res.status === 404
          ? "No se encontró el repositorio, o el token del servidor no tiene acceso."
          : `GitHub respondió ${res.status}.`);
      }
      const data = await res.json();
      arboles.set(clave, Array.isArray(data?.tree) ? data.tree : []);
    }
    return { arbol: arboles.get(clave), base, api, cabeceras, nombre: clave };
  }

  /** Une la carpeta del cliente y una ruta relativa, sin salirse de ella. */
  function dentro(base, ruta) {
    const limpia = decodeRuta(String(ruta ?? "")).replace(/^\/+|\/+$/g, "");
    if (limpia.split("/").includes("..")) throw new Error("Ruta no permitida.");
    if (!base) return limpia;
    if (!limpia) return base;
    return limpia === base || limpia.startsWith(`${base}/`) ? limpia : `${base}/${limpia}`;
  }

  const acciones = {
    async listar_repositorio({ cliente, ruta }) {
      const c = await resolverCliente(cliente);
      const { arbol, base, nombre } = await repositorio(c);
      const carpeta = dentro(base, ruta);
      const prefijo = carpeta ? `${carpeta}/` : "";
      const hijos = arbol.filter((n) =>
        n.path.startsWith(prefijo) && !n.path.slice(prefijo.length).includes("/") && n.path !== carpeta);
      if (carpeta && !hijos.length && !arbol.some((n) => n.path === carpeta)) {
        throw new Error(`La carpeta «${carpeta}» no existe en ${nombre}.`);
      }
      const rel = (p) => (base ? p.slice(base.length).replace(/^\//, "") : p);
      const lineas = hijos.slice(0, MAX_LISTADO).map((n) =>
        n.type === "tree" ? `[carpeta] ${rel(n.path)}/` : `· ${rel(n.path)} (${Math.round((n.size ?? 0) / 1024)} KB)`);
      return `Repositorio ${nombre}, carpeta «${carpeta || "/"}»:\n${lineas.join("\n") || "(vacía)"}` +
        (hijos.length > MAX_LISTADO ? `\n… y ${hijos.length - MAX_LISTADO} más.` : "");
    },

    async leer_archivo_repositorio({ cliente, ruta }) {
      const c = await resolverCliente(cliente);
      const { arbol, base, api, cabeceras } = await repositorio(c);
      const camino = dentro(base, ruta);
      const nodo = arbol.find((n) => n.type === "blob" && n.path === camino);
      if (!nodo) throw new Error(`No existe el archivo «${camino}». Usa listar_repositorio para ver qué hay.`);
      if (!TEXTO.test(camino)) throw new Error(`«${camino}» no es un archivo de texto.`);
      const res = await fetch(`${api}/git/blobs/${nodo.sha}`, { headers: cabeceras });
      if (!res.ok) throw new Error(`GitHub respondió ${res.status} al leer «${camino}».`);
      const data = await res.json();
      const texto = decodificarBlob(String(data?.content ?? ""));
      return texto.length > MAX_LECTURA
        ? `${texto.slice(0, MAX_LECTURA)}\n\n[Recortado: el archivo tiene ${texto.length} caracteres y se muestran ${MAX_LECTURA}.]`
        : texto;
    },

    async ver_calendario({ cliente, mes }) {
      const c = await resolverCliente(cliente);
      const cals = await acceso.leer("calendars", { client_id: c.id }, "year desc, month desc");
      if (!cals.length) return `${c.name} no tiene calendarios.`;
      let cal = cals[0];
      if (mes) {
        const [a, m] = String(mes).split("-").map(Number);
        cal = cals.find((x) => x.year === a && x.month === m - 1);
        if (!cal) {
          const hay = cals.map((x) => `${x.year}-${String(x.month + 1).padStart(2, "0")}`).join(", ");
          return `${c.name} no tiene calendario de ${mes}. Tiene: ${hay}.`;
        }
      }
      const dias = JSON_SEGURO(cal.days, []) ?? [];
      const recorta = (t, n) => (t && t.length > n ? `${t.slice(0, n)}…` : t || "");
      const lineas = [];
      for (const d of dias) {
        for (const p of d.posts ?? []) {
          lineas.push([
            `${d.date} · ID ${p.id} · ${p.format}${p.category ? ` · ${p.category}` : ""}${p.publishTime ? ` · ${p.publishTime}` : ""} · ${p.status ?? "pending"}`,
            p.idea ? `  Idea: ${recorta(p.idea, 300)}` : "",
            (p.descripcion || p.script) ? `  Descripción: ${recorta(p.descripcion || p.script, 600)}` : "",
            p.guion ? `  Guion: ${recorta(p.guion, 600)}` : "",
          ].filter(Boolean).join("\n"));
        }
      }
      return `Calendario «${cal.name || ""}» de ${c.name} (${cal.year}-${String(cal.month + 1).padStart(2, "0")})` +
        `${cal.campaign ? `, campaña: ${cal.campaign}` : ""}:\n${lineas.join("\n") || "(sin publicaciones)"}`;
    },

    async ver_tareas({ cliente, estado = "pendientes" }) {
      const filtro = (t) => estado === "todas" || (estado === "terminadas" ? t.status === "completed" : t.status !== "completed");
      const linea = (t) => [
        `· ${t.title}`,
        t.status === "completed" ? "(hecha)" : "",
        t.recurrence && t.recurrence !== "none" ? `[${t.recurrence}]` : "",
        t.due_date ? `vence ${t.due_date}` : "",
        t.today_date ? `marcada para ${t.today_date}` : "",
        t.assigned_to ? `→ ${t.assigned_to}` : "",
      ].filter(Boolean).join(" ");
      if (cliente || clienteActual) {
        const c = await resolverCliente(cliente);
        const tareas = (await acceso.leer("client_tasks", { client_id: c.id }, "position asc, created_at asc")).filter(filtro);
        return `Tareas de ${c.name} (${estado}):\n${tareas.map(linea).join("\n") || "(ninguna)"}`;
      }
      clientes ??= await acceso.leer("clients", {}, "created_at asc");
      const nombre = new Map(clientes.map((c) => [c.id, c.name]));
      const [deClientes, rapidas] = await Promise.all([
        acceso.leer("client_tasks", {}, "client_id asc, position asc"),
        acceso.leer("quick_tasks", {}, "position asc"),
      ]);
      const partes = [];
      for (const [id, n] of nombre) {
        const suyas = deClientes.filter((t) => t.client_id === id && filtro(t));
        if (suyas.length) partes.push(`${n}:\n${suyas.map(linea).join("\n")}`);
      }
      const r = rapidas.filter(filtro);
      if (r.length) partes.push(`Sin empresa (rápidas):\n${r.map(linea).join("\n")}`);
      return `Tareas (${estado}):\n${partes.join("\n\n") || "(ninguna)"}`;
    },

    async ver_banco_ideas({ cliente }) {
      const c = await resolverCliente(cliente);
      const ideas = JSON_SEGURO(c.ideas_bank, []) ?? [];
      if (!ideas.length) return `${c.name} no tiene ideas en el banco.`;
      return `Banco de ideas de ${c.name}:\n${ideas.map((i) =>
        `· [${i.format ?? "post"}${i.category ? ` · ${i.category}` : ""}] ${i.idea ?? ""}${i.descripcion ? ` — ${i.descripcion.slice(0, 200)}` : ""}`).join("\n")}`;
    },
  };

  acciones.ver_resultados = async ({ cliente, dias = 30 }) => {
    const c = await resolverCliente(cliente);
    const n = Math.min(90, Math.max(7, Number(dias) || 30));
    const hasta = fechaEnZona();
    const desde = sumarDias(hasta, -n);
    const [serieBruta, pubsBrutas, compBruta] = await Promise.all([
      acceso.leer("metricas_cuenta", { client_id: c.id }, "fecha asc"),
      acceso.leer("metricas_publicacion", { client_id: c.id }, "publicada_at desc"),
      acceso.leer("metricas_competencia", { client_id: c.id }, "fecha asc"),
    ]);
    if (!serieBruta.length) return `${c.name} todavía no tiene resultados medidos: hay que conectar Meta y asignar sus cuentas en Ajustes → Integraciones.`;
    const serie = serieBruta.filter((f) => !JSON_SEGURO(f.datos, {})?.error).map((f) => ({
      red: f.red, fecha: f.fecha, seguidores: f.seguidores, alcance: f.alcance, vistas: f.vistas, interacciones: f.interacciones, visitas: f.visitas_perfil,
    }));
    const publicaciones = pubsBrutas.map((p) => ({
      red: p.red, tipo: p.tipo, texto: p.texto, publicadaAt: p.publicada_at, interacciones: p.interacciones, alcance: p.alcance, vistas: p.vistas,
    }));
    const delPeriodo = publicaciones.filter((p) => (p.publicadaAt ?? "") >= `${desde}T05:00:00`);
    const k = kpis({ serie, publicaciones }, { desde, hasta });
    const cambio = (x) => (x?.cambio == null ? "" : ` (${x.cambio >= 0 ? "+" : ""}${x.cambio.toFixed(1)} % vs. periodo anterior)`);
    const lineas = [
      `Resultados de ${c.name}, últimos ${n} días (${desde} a ${hasta}):`,
      `· Seguidores: ${numeroCorto(k.seguidores.valor)}${k.seguidores.ganados != null ? `, ${k.seguidores.ganados >= 0 ? "+" : ""}${k.seguidores.ganados} en el periodo` : ""}`,
      `· Alcance: ${numeroCorto(k.alcance.valor)}${cambio(k.alcance)}`,
      `· Vistas: ${numeroCorto(k.vistas.valor)}${cambio(k.vistas)}`,
      `· Interacciones: ${numeroCorto(k.interacciones.valor)}${cambio(k.interacciones)}`,
      `· Tasa de interacción: ${k.tasaInteraccion.valor == null ? "—" : `${k.tasaInteraccion.valor.toFixed(2)} %`}`,
      `· Publicaciones: ${k.publicaciones.valor}`,
      "",
      "Las que mejor funcionaron:",
      ...mejoresPublicaciones(delPeriodo, 5).map((p) =>
        `· ${p.tipo} del ${(p.publicadaAt ?? "").slice(0, 10)}: ${p.interacciones} interacciones, ${p.alcance} de alcance — «${String(p.texto ?? "").slice(0, 100)}»`),
      "",
      "Por formato (interacción media):",
      ...porFormato(delPeriodo).map((f) => `· ${f.nombre}: ${f.cantidad} publicaciones, ${Math.round(f.interacciones)} de media`),
    ];
    const momentos = mejoresMomentos(delPeriodo).mejores;
    if (momentos.length) {
      lineas.push("", `Mejores momentos (hora de Panamá): ${momentos.map((m) => `${DIAS_SEMANA[m.dia]} ${BLOQUES_HORA[m.bloque]} h (${Math.round(m.media)})`).join(", ")}`);
    }
    const competencia = resumenCompetencia(compBruta.map((f) => ({
      usuario: f.usuario, fecha: f.fecha, seguidores: f.seguidores, publicaciones: f.publicaciones,
      interaccionesPromedio: f.interacciones_promedio, datos: JSON_SEGURO(f.datos, {}),
    })), desde);
    if (competencia.length) {
      lineas.push("", "Competencia:", ...competencia.map((x) =>
        `· @${x.usuario}: ${numeroCorto(x.seguidores)} seguidores${x.cambio == null ? "" : ` (${x.cambio >= 0 ? "+" : ""}${x.cambio.toFixed(1)} %)`}, ${numeroCorto(x.interaccionesPromedio)} interacciones por publicación`));
    }
    return lineas.join("\n");
  };

  /** Ejecuta una herramienta y devuelve SIEMPRE un tool_result. */
  async function ejecutar(bloque) {
    const accion = acciones[bloque.name];
    try {
      if (!accion) throw new Error(`Herramienta desconocida: ${bloque.name}`);
      const contenido = await accion(bloque.input ?? {});
      return { type: "tool_result", tool_use_id: bloque.id, content: contenido };
    } catch (e) {
      return { type: "tool_result", tool_use_id: bloque.id, content: e?.message || "Error al consultar.", is_error: true };
    }
  }

  return { ejecutar, esDelServidor: (nombre) => nombre in acciones };
}

/** Lo que se le cuenta al usuario de cada herramienta de servidor. */
export function describirUso(nombre, entrada = {}) {
  switch (nombre) {
    case "web_search": return `Buscó en internet: «${entrada.query ?? ""}»`;
    case "web_fetch": return `Leyó la página ${entrada.url ?? ""}`;
    case "listar_repositorio": return `Miró el repositorio${entrada.ruta ? ` (${entrada.ruta})` : ""}`;
    case "leer_archivo_repositorio": return `Leyó ${entrada.ruta ?? "un archivo"} del repositorio`;
    case "ver_calendario": return `Consultó el calendario${entrada.cliente ? ` de ${entrada.cliente}` : ""}${entrada.mes ? ` (${entrada.mes})` : ""}`;
    case "ver_tareas": return `Consultó las tareas${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_banco_ideas": return `Consultó el banco de ideas${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_resultados": return `Consultó los resultados${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    default: return nombre;
  }
}
