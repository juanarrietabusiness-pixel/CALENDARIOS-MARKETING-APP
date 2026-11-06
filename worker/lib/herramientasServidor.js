// ============================================================
// Las herramientas del asistente que corren en el SERVIDOR
//
// Hasta aquí el asistente sólo tenía herramientas del navegador (crear,
// editar, borrar publicaciones…) y un resumen del ADN recortado dentro
// del prompt. Lo que no cabía en ese resumen no existía para él, y lo
// de los demás clientes, tampoco. Estas herramientas le dejan PEDIR lo
// que necesita en vez de recibirlo todo en cada mensaje:
//
//   · ver_calendario, ver_tareas, ver_banco_ideas (el banco único, con las generales): lo que hay en D1,
//     siempre por la capa de acceso —el espacio de la sesión—.
//   · ver_resultados: cómo le fue en redes (las fotos diarias de
//     métricas), con las MISMAS cuentas que la pestaña Resultados.
//   · kit_whatsapp: el kit de WhatsApp Business que guardó la agencia
//     (bienvenida, respuestas rápidas, etiquetas, guiones de ventas).
//   · revisar_campanas: la revisión 3Q de los anuncios que corren en el Ads
//     Manager (worker/lib/revision3q.js), la misma de Resultados → Anuncios.
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
import { vaAPauta, describirPauta, limpiarAnuncio } from "../../src/lib/pauta.js";
import { limpiarEnPauta, lineaEnPauta, clavePublicacion } from "../../src/lib/enPauta.js";
import { buscar as buscarCerebro, leerNota } from "./cerebro/cerebro.js";
import { pack } from "./cerebro/memoria.js";
import { lineaDeIdea, ideaDeFila as publicaIdea } from "../../src/lib/bancoIdeas.js";
import { limpiarKitWhatsApp, kitATexto } from "../../src/lib/kitWhatsApp.js";
import { DEFINICIONES_ESTUDIO, crearHerramientasEstudio } from "./estudio/herramientas.js";
import { DEFINICIONES_RECETAS, crearHerramientasRecetas } from "./estudio/herramientasRecetas.js";
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
      "descripción y guion, y si están EN PAUTA de verdad en su Ads Manager (etapa y costo por resultado, de la última " +
      "revisión de campañas). Úsala para consultar otro mes u otro cliente.",
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
    description: "Lista el banco de ideas de la agencia: ideas y referencias (enlaces a videos de Instagram, TikTok…). Con " +
      "cliente, las suyas y las generales (sin empresa); sin cliente ni cliente abierto, todas.",
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
  {
    name: "kit_whatsapp",
    description: "El kit de WhatsApp Business de un cliente tal como lo guardó la agencia: el mensaje de bienvenida y el de " +
      "ausencia, las respuestas rápidas con su atajo (precio, envío, horario, ubicación, pago y las objeciones del estudio de " +
      "mercado), las etiquetas con su etapa del ciclo de ventas y un guion de ventas por producto. Sólo lectura. Úsala antes " +
      "de escribir mensajes de WhatsApp para un cliente o si preguntan cómo responderle a alguien.",
    input_schema: { type: "object", properties: { ...clienteOpcional } },
  },
  {
    name: "revisar_campanas",
    description: "La revisión 3Q de los anuncios que corren en el Ads Manager de un cliente: su número mágico (lo que aguanta cada conversación o compra), lo real en 30, 14 y 7 días, y cada campaña activa con su etapa (presentación, evaluación, conversión, ascensión o temporada) y qué hacer con cada conjunto y anuncio (qué pasó, por qué y qué cambiar), y qué publicación del calendario es cada anuncio (o si es un anuncio nuevo, subido aparte). Sólo lee de Meta: no cambia nada ni gasta. Úsala si preguntan cómo van los anuncios, qué pausar o mejorar, o qué publicación está en pauta.",
    input_schema: { type: "object", properties: { ...clienteOpcional } },
  },
  {
    name: "plan_de_campanas",
    description: "El PLAN DE CAMPAÑAS de un cliente para un mes, como se monta en el Ads Manager: las campañas del ciclo de ventas " +
      "(presentación y evaluación en una cuenta nueva; las cuatro con historial; y la de temporada si el mes trae oferta o fecha " +
      "comercial), el presupuesto de cada una (de los números del negocio y el reparto del Manual), sus conjuntos con los públicos " +
      "y las exclusiones, cuántos anuncios y qué pieza del calendario va en cada uno, y los avisos (maletas que faltan, sin números, " +
      "piezas repetidas para Meta). Sólo lectura: la aplicación no crea campañas; las monta la agencia en el Ads Manager con su guía.",
    input_schema: {
      type: "object",
      properties: { ...clienteOpcional, mes: { type: "string", description: "AAAA-MM. Si se omite, el de este mes." } },
    },
  },
]);

/** Todas las herramientas de servidor del asistente: las de lectura, las del Estudio y las recetas. */
export const DEFINICIONES = Object.freeze([...DEFINICIONES_DE_LECTURA, ...DEFINICIONES_ESTUDIO, ...DEFINICIONES_RECETAS]);

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
 *
 * `mas({ resolverCliente, buscarPublicacion })` → más acciones: las que no
 * pueden importarse aquí sin cerrar el ciclo de siempre (el reel por planos,
 * worker/lib/estudio/herramientasReel.js, llega a mercado.js, que importa este
 * archivo): las pone quien llama (worker/rutas/chat.js).
 */
export function crearEjecutor({ env, acceso, clienteActual = null, estudio = null, mas = null }) {
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
      // Lo que corre de verdad en su Ads Manager (worker/lib/enPauta.js, lo de la última revisión 3Q): sólo D1.
      const pauta = limpiarEnPauta((await acceso.leerColumnas("anuncios_clientes", ["en_pauta"], { client_id: c.id }, "created_at asc", 1).catch(() => []))[0]?.en_pauta);
      const enPautaDe = (p) => {
        const e = pauta.publicaciones[clavePublicacion(cal.id, p.id)];
        return e ? ` · ${e.activo ? "EN PAUTA" : "YA NO ESTÁ EN PAUTA"} (${lineaEnPauta(e, pauta.moneda)}${pauta.leidoAt ? `; leído del Ads Manager el ${String(pauta.leidoAt).slice(0, 10)}` : ""})` : "";
      };
      const lineas = [];
      for (const d of dias) {
        for (const p of d.posts ?? []) {
          lineas.push([
            `${d.date} · ID ${p.id} · ${p.format}${p.category ? ` · ${p.category}` : ""}${p.publishTime ? ` · ${p.publishTime}` : ""} · ${p.status ?? "pending"}${vaAPauta(p) ? ` · VA A PAUTA (${describirPauta(p.pauta)}; su descripción ES el texto del anuncio${limpiarAnuncio(p.anuncio)?.textos.length ? `, con ${limpiarAnuncio(p.anuncio).textos.length} textos de anuncio aparte` : ", sin sus textos de anuncio aparte"})` : ""}${enPautaDe(p)}`,
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
        // El id va siempre: `completar_tarea` lo pide, y sin él ni Claude ni la agenda personal podían cerrar nada.
        `(id ${t.id})`,
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
      // El banco es UNO para la agencia (tabla banco_ideas): cada idea con su cliente o general.
      const c = cliente || clienteActual ? await resolverCliente(cliente) : null;
      clientes ??= await acceso.leer("clients", {}, "created_at asc");
      const nombre = new Map(clientes.map((x) => [x.id, x.name]));
      const filas = (await acceso.leer("banco_ideas", {}, "created_at desc", 300))
        .filter((f) => !c || f.client_id === c.id || !f.client_id)
        .map(publicaIdea);
      if (!filas.length) return c ? `${c.name} no tiene ideas en el banco (ni hay generales).` : "El banco de ideas está vacío.";
      return `Banco de ideas${c ? ` de ${c.name} (y las generales)` : " de la agencia"}:\n${filas.map((i) => lineaDeIdea(i, i.clientId ? nombre.get(i.clientId) ?? "" : "")).join("\n")}`;
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
    if (!hits.length) return `El cerebro de ${c.name} no tiene nada sobre «${q}». Prueba con otras palabras antes de decir que no lo sabes; si de verdad no está, dilo y sugiere añadirlo como nota en Marca → Cerebro.`;
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

  acciones.kit_whatsapp = async ({ cliente }) => {
    const c = await resolverCliente(cliente);
    const fila = await acceso.leerUno("anuncios_clientes", { client_id: c.id });
    const texto = kitATexto(limpiarKitWhatsApp(JSON_SEGURO(fila?.kit_whatsapp, {})), { marca: c.name });
    return texto || `${c.name} todavía no tiene kit de WhatsApp guardado: se prepara (y lo propone la IA) en Marca → WhatsApp.`;
  };

  // La revisión 3Q de las campañas: sólo lee de Meta. Se importa en el momento: worker/lib/revision3q.js llega a
  // negocio.js y a anuncios.js, y este archivo lo importa mercado.js (el ciclo de siempre).
  acciones.revisar_campanas = async ({ cliente }) => {
    const c = await resolverCliente(cliente);
    const { revisionDelCliente } = await import("./revision3q.js");
    const { textoDeRevision } = await import("../../src/lib/tresQ.js");
    // Sin cuenta publicitaria, sin permisos o si Meta dice que no, el error vuelve como resultado con su motivo.
    return textoDeRevision(await revisionDelCliente(env, acceso, c.id));
  };

  acciones.plan_de_campanas = async ({ cliente, mes }) => {
    const c = await resolverCliente(cliente);
    // En el momento: planCampanas.js llega a mercado.js, que importa este archivo (sería el ciclo de siempre).
    const { planDeCampanasEnTexto } = await import("./planCampanas.js");
    return planDeCampanasEnTexto(env, acceso, c, mes);
  };

  if (estudio) Object.assign(acciones, crearHerramientasEstudio({ env, acceso, resolverCliente, ...estudio }));
  // Las recetas (el mismo «/receta» que llega de claude.ai): sólo leen, así que no necesitan a quien firma.
  Object.assign(acciones, crearHerramientasRecetas({ env, acceso, buscarPublicacion: (id) => buscarEn(acceso, id) }));
  if (mas) Object.assign(acciones, mas({ resolverCliente, buscarPublicacion: (id) => buscarEn(acceso, id) }));

  /** Ejecuta una herramienta y devuelve SIEMPRE un tool_result. */
  async function ejecutar(bloque) {
    const accion = acciones[bloque.name];
    try {
      if (!accion) throw new Error(`Herramienta desconocida: ${bloque.name}`);
      const contenido = await accion(bloque.input ?? {});
      // Las que MIRAN el video devuelven { texto, imagenes }: el modelo recibe la imagen en el mismo tool_result.
      if (contenido && typeof contenido === "object" && Array.isArray(contenido.imagenes)) {
        // Sin imágenes (lo que sólo trae la vista del chat de Claude), el texto a secas, como antes.
        if (!contenido.imagenes.length) return { type: "tool_result", tool_use_id: bloque.id, content: contenido.texto ?? "" };
        return {
          type: "tool_result", tool_use_id: bloque.id,
          content: [
            { type: "text", text: contenido.texto ?? "" },
            ...contenido.imagenes.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.datos } })),
          ],
        };
      }
      return { type: "tool_result", tool_use_id: bloque.id, content: contenido };
    } catch (e) {
      return { type: "tool_result", tool_use_id: bloque.id, content: e?.message || "Error al consultar.", is_error: true };
    }
  }

  return { ejecutar, esDelServidor: (nombre) => nombre in acciones };
}

/** La publicación de un handoff, en los calendarios del espacio → { cal, dia, post } (o lanza). */
async function buscarEn(acceso, postId) {
  for (const cal of await acceso.leer("calendars", {}, "year desc, month desc")) {
    for (const d of JSON_SEGURO(cal.days, [])) {
      const post = (d.posts ?? []).find((p) => p?.id === postId);
      if (post) return { cal, dia: d, post };
    }
  }
  throw new Error("No encontré esa publicación.");
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
    case "kit_whatsapp": return `Leyó el kit de WhatsApp${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "revisar_campanas": return `Revisó las campañas del Ads Manager${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "plan_de_campanas": return `Leyó el plan de campañas${entrada.cliente ? ` de ${entrada.cliente}` : ""}${entrada.mes ? ` (${entrada.mes})` : ""}`;
    case "ver_estudio": return `Miró el Estudio${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "crear_en_estudio": return `Pidió al Estudio ${entrada.tipo === "video" ? "un video" : "una imagen"}: «${String(entrada.prompt ?? "").slice(0, 80)}»`;
    case "estado_trabajo": return "Miró cómo va un pedido del Estudio";
    case "ver_recetas": return "Miró las recetas de la agencia";
    case "receta": return entrada.handoff_id ? "Leyó la receta y el pedido de la aplicación" : `Leyó la receta «${entrada.id ?? ""}»`;
    case "ver_pieza": return `Miró ${Array.isArray(entrada.archivo_ids) && entrada.archivo_ids.length > 1 ? `${entrada.archivo_ids.length} piezas` : "una pieza"} de la galería`;
    case "listar_voces": return `Miró las voces${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "previsualizar_voz": return `Pidió la muestra de una voz${entrada.confirmado === true ? "" : " (sin confirmar)"}`;
    case "generar_locucion": return `Pidió la locución de un video animado${entrada.confirmado === true ? "" : " (sin confirmar)"}`;
    case "generar_musica": return `Pidió una música de fondo con Suno${entrada.confirmado === true ? "" : " (sin confirmar)"}`;
    case "formato_video": return "Leyó el formato de escenas del video animado";
    case "ver_estructuras": return `Miró las estructuras de guion de la agencia${entrada.para === "voz" ? " (voz en off)" : entrada.para === "ugc" ? " (UGC)" : ""}`;
    case "listar_videos": return `Miró los videos animados${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "ver_video": return "Miró un video animado";
    case "crear_reel": return entrada.confirmado === true ? "Creó un reel por planos en el servidor" : "Escribió el guion de un reel y su costo (sin crear nada)";
    case "estado_reel": return "Miró cómo va un reel";
    case "continuar_reel": return entrada.confirmado === true ? "Siguió un reel tras revisar el storyboard" : "Miró el costo de seguir un reel";
    case "montar_reel": return "Montó un reel con la voz, el texto, los subtítulos y el logo";
    case "video_listo": return "Revisó si un video está listo para publicar";
    case "extraer_guion_ugc": return "Extrajo el guion de un video y lo adaptó como UGC";
    case "crear_video": return "Creó un video animado (borrador)";
    case "guardar_video": return "Guardó el guion de un video animado";
    case "editar_escena": return entrada.quitar ? `Quitó la escena «${entrada.quitar}» de un video animado` : "Editó una escena de un video animado";
    case "aprobar_video": return "Aprobó el guion de un video animado";
    case "ver_cuadro": return `Miró un cuadro del video animado${entrada.escena ? ` (escena ${entrada.escena})` : ""}`;
    case "ver_escenas": return "Miró todas las escenas del video animado";
    case "revisar_video": return "Revisó el video animado antes de renderizar";
    case "renderizar_video": return "Pidió el render a mp4 de un video animado";
    case "fondos_video": return entrada.confirmado === true ? "Pidió al director las imágenes de fondo de un video animado" : "Miró el costo de las imágenes de fondo de un video animado (sin crear nada)";
    case "ligar_video": return entrada.publicacion_id ? "Ligó un video animado a una publicación" : "Desligó un video animado de su publicación";
    case "personaje_video": return ["piel", "pelo", "ropa", "accesorio", "nombre", "imagenes"].some((k) => entrada[k] !== undefined) ? "Cambió el personaje de los videos animados" : "Miró el personaje de los videos animados";
    case "voz_de_marca": return entrada.voz || entrada.modelo ? "Cambió la voz de la marca en sus videos" : "Miró la voz de la marca";
    case "lexico_de_marca": return entrada.reglas === undefined ? "Miró el léxico de la marca" : "Cambió el léxico de la marca";
    case "sonido_video": return entrada.efectos === undefined && entrada.musica_id === undefined && entrada.volumen === undefined ? "Miró el sonido de un video animado" : "Cambió el sonido de un video animado (efectos o música)";
    case "musicas": return `Miró las músicas de fondo${entrada.cliente ? ` de ${entrada.cliente}` : ""}`;
    case "video_con_cancion": return entrada.confirmado === true ? `Creó un video animado con una canción${entrada.disenar === true ? " (escenas de la IA)" : " (prueba de sincronía)"}` : "Miró el costo de sincronizar una canción (sin crear nada)";
    case "versiones_video": return "Miró el historial de un video animado";
    case "volver_a_version": return `Volvió un video animado a su versión ${entrada.a_version ?? ""}`;
    default: return nombre;
  }
}
