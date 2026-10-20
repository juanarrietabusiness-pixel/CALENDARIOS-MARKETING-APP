// ============================================================
// Las herramientas del asistente que corren en el SERVIDOR
//
// Hasta aquí el asistente sólo tenía herramientas del navegador (crear,
// editar, borrar publicaciones…) y un resumen del ADN recortado dentro
// del prompt. Lo que no cabía en ese resumen no existía para él, y lo
// de los demás clientes, tampoco. Estas herramientas le dejan PEDIR lo
// que necesita en vez de recibirlo todo en cada mensaje:
//
//   · ver_calendario, ver_tareas, ver_banco_ideas: lo que hay en D1,
//     siempre por la capa de acceso —el espacio de la sesión—.
//   · ver_resultados: cómo le fue en redes (las fotos diarias de
//     métricas), con las MISMAS cuentas que la pestaña Resultados.
//   · buscar_cerebro y leer_nota_cerebro: las notas del cerebro del cliente
//     (su ficha, sus documentos, lo que se le ha ido añadiendo). Las cortas
//     llegan enteras; de las largas, sus pasajes, y la nota completa se pide
//     aparte. Es LA fuente del asistente: sustituye a volcar el ADN entero
//     en el prompt y, desde que el cerebro manda, al repositorio de GitHub
//     (las herramientas que lo leían se quitaron: lo que se corrige en el
//     cerebro no vuelve al repositorio, y leerlo daba datos viejos).
//
// Son de LECTURA a propósito. Lo que escribe en el calendario se queda en
// el navegador, que es quien tiene el estado abierto y sabe no pisar lo
// que la persona está editando.
//
// LA ÚNICA EXCEPCIÓN ES EL ESTUDIO (`estudio/herramientas.js`): pedir una
// imagen o un video crea un pedido en la cola del Estudio, que no toca el
// calendario abierto ni espera nada. Sólo existe si quien llama pasa
// `estudio` (con la persona que firma): un ejecutor sin ella —el de las
// consultas del MCP— no puede gastar.
// ============================================================

import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import { buscar as buscarCerebro, leerNota } from "./cerebro/cerebro.js";
import { pack } from "./cerebro/memoria.js";
import { DEFINICIONES_ESTUDIO, crearHerramientasEstudio } from "./estudio/herramientas.js";
import {
  kpis, porFormato, mejoresMomentos, mejoresPublicaciones, resumenCompetencia, numeroCorto, DIAS_SEMANA, BLOQUES_HORA,
} from "../../src/lib/resultados.js";

/** Hasta cuántos caracteres una nota encontrada llega ENTERA (y no en dos pasajes). */
export const NOTA_ENTERA = 4000;
/** Lo más que se da de una nota pedida entera. */
const MAX_NOTA = 30_000;

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

export const DEFINICIONES_DE_LECTURA = Object.freeze([
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
    name: "buscar_cerebro",
    description:
      "Busca en el CEREBRO del cliente —sus notas: ficha, marca, precios, personas, límites, pautas, decisiones, documentos que " +
      "se le subieron— y devuelve lo que responde: las notas cortas ENTERAS y, de las largas, sus pasajes (con su ruta, para " +
      "pedirla entera con leer_nota_cerebro). Úsala ANTES de decir que no sabes algo de un cliente y antes de escribir para él. " +
      "Con varias palabras clave (precio del envío, garantía, tono para historias).",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        consulta: { type: "string", description: "Qué buscar, en palabras del tema." },
        para_publicar: {
          type: "boolean",
          description: "true si lo que buscas es para ESCRIBIR un texto que se publica (caption, guion, idea, texto de la pieza): " +
            "entonces las notas internas (costos, márgenes, proveedores) no salen. false o sin poner para una consulta del equipo.",
        },
      },
      required: ["consulta"],
    },
  },
  {
    name: "leer_nota_cerebro",
    description: "Lee ENTERA una nota del cerebro del cliente, por su ruta (la que da buscar_cerebro entre corchetes) o por su título. " +
      "Úsala cuando buscar_cerebro te dio sólo pasajes de una nota larga y necesitas el resto.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteOpcional,
        nota: { type: "string", description: "La ruta de la nota o su título." },
        para_publicar: { type: "boolean", description: "Igual que en buscar_cerebro: true si es para escribir un texto que se publica." },
      },
      required: ["nota"],
    },
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

/** Todas las herramientas de servidor del asistente: las de lectura y las del Estudio. */
export const DEFINICIONES = Object.freeze([...DEFINICIONES_DE_LECTURA, ...DEFINICIONES_ESTUDIO]);

export const NOMBRES = new Set([...DEFINICIONES.map((d) => d.name), ...HERRAMIENTAS_WEB.map((d) => d.name)]);

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const JSON_SEGURO = (v, porDefecto) => {
  if (typeof v !== "string") return v ?? porDefecto;
  try { return JSON.parse(v); } catch { return porDefecto; }
};

/**
 * El contexto de UNA petición: la capa de acceso y el cliente abierto (si
 * lo hay).
 *
 * `estudio` = { usuario, por, origen }: con ella el ejecutor también sabe
 * pedir al Estudio (ver_estudio, crear_en_estudio, estado_trabajo). Sin ella,
 * no: esas herramientas gastan y necesitan saber quién firma.
 */
export function crearEjecutor({ env, acceso, clienteActual = null, estudio = null }) {
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

  const acciones = {
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

  // Para publicar, el mismo candado que el resto de la aplicación: lo interno no existe (`para: "texto"`). Para una
  // consulta del equipo sale, marcado.
  const usoDe = (paraPublicar) => (paraPublicar === true ? "texto" : "chat");
  const cabecera = (h) => `--- ${h.titulo} [${h.ruta}] (${h.tipo}${h.interna ? " · INTERNA: no la uses en textos que se publican" : ""}) ---`;

  acciones.buscar_cerebro = async ({ cliente, consulta, para_publicar }) => {
    const c = await resolverCliente(cliente);
    const q = String(consulta ?? "").trim().slice(0, 500);
    if (!q) throw new Error("Falta lo que buscar.");
    const hits = await buscarCerebro(env, acceso, c.id, q, { para: usoDe(para_publicar), n: 6, enteras: NOTA_ENTERA });
    if (!hits.length) return `El cerebro de ${c.name} no tiene nada sobre «${q}». Prueba con otras palabras antes de decir que no lo sabes; si de verdad no está, dilo y sugiere añadirlo como nota en la pestaña Cerebro.`;
    const bloques = hits.map((h) => ({
      head: cabecera(h) + (h.texto ? " (entera)" : " (pasajes: pide el resto con leer_nota_cerebro)"),
      body: h.texto || h.pasajes.join("\n…\n"),
    }));
    return `Del cerebro de ${c.name}, sobre «${q}»:\n\n${pack(bloques, 14_000)}`;
  };

  acciones.leer_nota_cerebro = async ({ cliente, nota, para_publicar }) => {
    const c = await resolverCliente(cliente);
    const cual = String(nota ?? "").trim().slice(0, 200);
    if (!cual) throw new Error("Falta qué nota leer.");
    const n = await leerNota(env, acceso, c.id, cual, { para: usoDe(para_publicar) });
    if (!n) throw new Error(`El cerebro de ${c.name} no tiene una nota «${cual}». Búscala antes con buscar_cerebro.`);
    const texto = n.texto.length > MAX_NOTA ? `${n.texto.slice(0, MAX_NOTA)}\n\n[Recortada: la nota tiene ${n.texto.length} caracteres y se muestran ${MAX_NOTA}.]` : n.texto;
    return `${cabecera(n)}\n${texto}`;
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

  if (estudio) Object.assign(acciones, crearHerramientasEstudio({ env, acceso, resolverCliente, ...estudio }));

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
    case "ver_calendario": return `Consultó el calendario${entrada.cliente ? ` de ${entrada.cliente}` : ""}${entrada.mes ? ` (${entrada.mes})` : ""}`;
    case "ver_tareas": return `Consultó las tareas${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_banco_ideas": return `Consultó el banco de ideas${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "buscar_cerebro": return `Buscó en el cerebro${entrada.cliente ? ` de ${entrada.cliente}` : ""}: «${entrada.consulta ?? ""}»`;
    case "leer_nota_cerebro": return `Leyó la nota «${entrada.nota ?? ""}» del cerebro${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_resultados": return `Consultó los resultados${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_estudio": return `Miró el Estudio${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "crear_en_estudio": return `Pidió al Estudio ${entrada.tipo === "video" ? "un video" : "una imagen"}: «${String(entrada.prompt ?? "").slice(0, 80)}»`;
    case "estado_trabajo": return "Miró cómo va un pedido del Estudio";
    default: return nombre;
  }
}
