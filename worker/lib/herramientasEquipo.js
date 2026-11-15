// ============================================================
// Lo del EQUIPO por MCP: el enlace del cliente, la campana, la Bandeja y los informes
//
// Lo que Claude no podía (docs/analisis-mejoras-2026-11.md, punto 9): sacar el enlace y el mensaje para mandarle el mes
// al cliente, leer la campana de quien conecta, ver lo que espera en la Bandeja de un cliente y los informes con su
// enlace. Todo SÓLO LEE, salvo marcar como leídos los avisos de la propia persona (como la campana de la aplicación, que
// también lo deja a quien es de sólo lectura).
//
//   · enlace_del_cliente: el testigo del mes se REUTILIZA, nunca se crea ni se regenera aquí (regenerarlo mataría los
//     enlaces que el cliente ya tiene; crearlo es «Enviar al cliente» de la aplicación). El mensaje es el MISMO de la
//     pantalla (`mensajeDeEnvio`, src/lib/aprobacion.js), con lo que respondió el cliente aplicado (`conAprobacion`), no
//     el `status` guardado en los días, que sólo se pone al día al abrir el mes.
//   · ver_avisos: los de QUIEN CONECTA (`user_id` del token), nunca los de otra persona del equipo.
//   · ver_bandeja: sólo con la bandeja del cliente ENCENDIDA (si no, como la pantalla: no se enseña). Responder sigue
//     siendo de la Bandeja de la aplicación (la ventana de 24 h, ocultar, borrar).
//   · ver_informes: la lista sin el contenido (pesa); con `mes`, el resumen del análisis de ese mes.
//
// Las direcciones van con el ORIGEN del conector cuando se sabe (`origen`, lo pasa worker/rutas/mcp.js); si no, en
// relativo, que en la aplicación vale tal cual.
// ============================================================

import { difundir } from "./vivo.js";
import { ahora } from "./ids.js";
import { MONTHS } from "../../src/constants.js";
import { conAprobacion, estadoDelEnvio, mensajeDeEnvio } from "../../src/lib/aprobacion.js";
import { visibleParaCliente } from "../../src/lib/trabajo.js";
import { ventanaMensajes, haceCuanto } from "../../src/lib/bandejaVista.js";

export class ErrorEquipo extends Error {}

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};
const corto = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const MES = /^\d{4}-\d{2}$/;
const nombreDelMes = (cal) => cal.name || `${MONTHS[cal.month]} ${cal.year}`;
const claveDelMes = (cal) => `${cal.year}-${String(cal.month + 1).padStart(2, "0")}`;

/** Cuántos avisos enseña ver_avisos como mucho (la campana de la aplicación lee 60). */
export const MAX_AVISOS = 30;
/** Cuántos comentarios y conversaciones pendientes enseña ver_bandeja como mucho. */
export const MAX_BANDEJA = 25;

const clienteParam = { cliente: { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." } };
const soloLectura = { readOnlyHint: true, openWorldHint: false };

export const DEFINICIONES_EQUIPO = Object.freeze([
  {
    name: "enlace_del_cliente",
    description:
      "El enlace de aprobación de un mes de un cliente (el que abre en su teléfono para aprobar o pedir cambios) y el MENSAJE para mandárselo por WhatsApp, el mismo que da «Enviar al cliente» en la aplicación. Dice también cómo va el mes antes de mandarlo (cuántas sin pieza, sin hora o con cambios por corregir). " +
      "Sólo lee: si el mes nunca se compartió, no tiene enlace todavía y se crea en la aplicación con «Enviar al cliente» (luego siempre es el mismo).",
    inputSchema: { type: "object", properties: { ...clienteParam, mes: { type: "string", description: "AAAA-MM. Si se omite, el más reciente." } }, required: ["cliente"] },
    annotations: soloLectura,
  },
  {
    name: "ver_avisos",
    description:
      "La campana de quien conecta: sus avisos (aprobaciones y cambios que pidió un cliente, menciones, lo que terminó o falló en el Estudio, publicaciones que fallaron…), los sin leer primero. Con marcar_leidos=true marca como leídos los que enseña (sólo los suyos).",
    inputSchema: {
      type: "object",
      properties: {
        solo_sin_leer: { type: "boolean", description: "Sólo los que no ha leído. Por defecto, todos los recientes." },
        marcar_leidos: { type: "boolean", description: "Marca como leídos los avisos que se enseñan." },
      },
    },
    annotations: soloLectura,
  },
  {
    name: "ver_bandeja",
    description:
      "Lo que espera respuesta en la Bandeja de un cliente: los comentarios de Facebook e Instagram sin atender y las conversaciones privadas sin atender (con si aún se pueden responder: Meta sólo deja hacerlo dentro de las 24 horas desde su último mensaje). Sólo con la bandeja del cliente encendida. Sólo lee: responder, ocultar o marcar atendido se hace en la Bandeja de la aplicación.",
    inputSchema: {
      type: "object",
      properties: { ...clienteParam, tipo: { type: "string", enum: ["todo", "comentarios", "mensajes"], description: "Por defecto, todo." } },
      required: ["cliente"],
    },
    annotations: soloLectura,
  },
  {
    name: "ver_informes",
    description:
      "Los informes de un cliente: el mensual de redes y el de anuncios, cada uno con su mes, su estado y, si se compartió, el enlace que abre el cliente. Con mes, además el resumen del análisis de ese mes. Sólo lee: generar o compartir un informe se hace en la aplicación (Resultados y Anuncios).",
    inputSchema: { type: "object", properties: { ...clienteParam, mes: { type: "string", description: "AAAA-MM: el resumen de ese mes." } }, required: ["cliente"] },
    annotations: soloLectura,
  },
]);

/**
 * Las herramientas. `resolverCliente(nombre)` → la fila del cliente (la del MCP: lanza su propio error si no está).
 * `origen`: el del conector, para las direcciones (vacío: relativas).
 */
export function crearHerramientasEquipo({ env, acceso, resolverCliente, usuario, origen = "" }) {
  const url = (ruta) => `${origen || ""}${ruta}`;

  async function calendarioDelMes(c, mes) {
    const cals = await acceso.leerColumnas(
      "calendars", ["id", "name", "month", "year", "days", "share_token", "share_enabled", "revision_enviada"],
      { client_id: c.id }, "year desc, month desc",
    );
    if (!cals.length) throw new ErrorEquipo(`${c.name} no tiene ningún mes en el calendario todavía.`);
    if (!mes) return cals[0];
    if (!MES.test(String(mes))) throw new ErrorEquipo("El mes va como AAAA-MM (por ejemplo, 2026-11).");
    const cal = cals.find((x) => claveDelMes(x) === String(mes));
    if (!cal) throw new ErrorEquipo(`${c.name} no tiene ${mes} en el calendario. Tiene: ${cals.map(claveDelMes).join(", ")}.`);
    return cal;
  }

  return {
    async enlace_del_cliente({ cliente, mes = "" } = {}) {
      const c = await resolverCliente(cliente);
      const cal = await calendarioDelMes(c, mes);
      const nombre = nombreDelMes(cal);
      if (!cal.share_token) {
        return `${nombre} de ${c.name} aún no tiene enlace para el cliente: se crea con «Enviar al cliente» en el calendario de la aplicación (una vez; después siempre es el mismo y no caduca). Desde aquí no se crea.`;
      }
      if (Number(cal.share_enabled) !== 1) {
        return `El enlace de ${nombre} de ${c.name} está DESACTIVADO: el cliente no puede abrirlo. Se vuelve a activar desde «Enviar al cliente» en la aplicación (sigue siendo el mismo enlace).`;
      }
      // Lo que respondió el cliente, aplicado (la tabla de aprobaciones es la verdad, no el `status` de los días).
      const respuestas = await acceso.leer("approvals", { calendar_id: cal.id }, "updated_at desc");
      const porPost = new Map();
      for (const a of respuestas) if (!porPost.has(a.post_id)) porPost.set(a.post_id, { ...a, timestamp: a.updated_at });
      const revisionInterna = Number(c.revision_interna) === 1;
      const days = (leerJSON(cal.days, []) ?? []).map((d) => ({ ...d, posts: (d.posts ?? []).map((p) => conAprobacion(p, porPost.get(p.id))) }));
      const envio = estadoDelEnvio(days);
      const enlace = url(`/aprobar?t=${encodeURIComponent(cal.share_token)}`);
      const mensaje = mensajeDeEnvio({ nombre: c.name, mes: nombre, url: enlace, corregidas: envio.corregidas, revisado: Boolean(cal.revision_enviada) });

      const lineas = [`ENLACE DE ${nombre.toUpperCase()} · ${c.name}`, enlace, "", "EL MENSAJE PARA MANDARLO (el de «Enviar al cliente»):", mensaje, ""];
      const avisos = [];
      if (envio.sinPieza) avisos.push(`${envio.sinPieza} sin su pieza: el cliente las verá como idea (se diseñan con «Preparar el mes» → Diseñar).`);
      if (envio.sinHora) avisos.push(`${envio.sinHora} sin hora: si las aprueba, no se podrán programar sin ponérsela.`);
      if (envio.porCorregir) avisos.push(`${envio.porCorregir} con cambios que pidió el cliente sin corregir todavía.`);
      if (envio.corregidas) avisos.push(`${envio.corregidas} ya corregida${envio.corregidas === 1 ? "" : "s"}: su enlace las marca «Actualizada · revísala».`);
      if (revisionInterna) {
        const ocultas = days.reduce((n, d) => n + (d.posts ?? []).filter((p) => !visibleParaCliente(p, true)).length, 0);
        if (ocultas) avisos.push(`Tiene revisión interna: ${ocultas} todavía no las ve el cliente (no están «con el cliente»).`);
      }
      lineas.push(avisos.length ? `ANTES DE MANDARLO:\n${avisos.map((a) => `· ${a}`).join("\n")}` : `${envio.total ? `Las ${envio.total} pendientes llevan su pieza y su hora.` : "No queda nada pendiente de aprobar en este mes."}`);
      lineas.push("", "Desde aquí no se marca nada como enviado: al copiar el enlace o el mensaje en la aplicación, las publicaciones pasan a «Con el cliente».");
      return lineas.join("\n");
    },

    async ver_avisos({ solo_sin_leer: soloSinLeer = false, marcar_leidos: marcar = false } = {}) {
      const filas = await acceso.leer("avisos", { user_id: usuario.id }, "created_at desc", 60);
      const sinLeer = filas.filter((a) => !a.leido_at);
      const lista = (soloSinLeer ? sinLeer : [...sinLeer, ...filas.filter((a) => a.leido_at)]).slice(0, MAX_AVISOS);
      if (!lista.length) return soloSinLeer || !filas.length ? "La campana está al día: no hay avisos sin leer." : "No hay avisos.";
      const t = Date.now();
      const linea = (a) => `· ${a.leido_at ? "" : "[sin leer] "}${haceCuanto(a.created_at, t)} · ${corto(a.texto, 300)}${a.por_nombre ? ` (${a.por_nombre})` : ""}${a.enlace ? ` → ${url(a.enlace)}` : ""}`;
      const salida = [`LA CAMPANA DE ${String(usuario.nombre ?? "").toUpperCase() || "QUIEN CONECTA"}: ${sinLeer.length} sin leer${filas.length > lista.length ? ` (se enseñan ${lista.length})` : ""}.`, ...lista.map(linea)];
      const porMarcar = marcar ? lista.filter((a) => !a.leido_at) : [];
      if (porMarcar.length) {
        const cuando = ahora();
        for (const a of porMarcar) await acceso.actualizar("avisos", { user_id: usuario.id, id: a.id }, { leido_at: cuando });
        // Sus pestañas (la campana del móvil) bajan el número también.
        difundir(env, acceso.ownerId, { tipo: "avisos", para: [usuario.id] });
        salida.push("", `Marcado${porMarcar.length === 1 ? "" : "s"} como leído${porMarcar.length === 1 ? "" : "s"}: ${porMarcar.length}.`);
      } else if (sinLeer.length && !marcar) {
        salida.push("", "Para marcarlos como leídos: ver_avisos con marcar_leidos=true.");
      }
      return salida.join("\n");
    },

    async ver_bandeja({ cliente, tipo = "todo" } = {}) {
      const c = await resolverCliente(cliente);
      const estado = await acceso.leerUno("bandeja_clientes", { client_id: c.id });
      if (Number(estado?.activa) !== 1) {
        return `La bandeja de ${c.name} está apagada: sus comentarios y mensajes no se leen. Se enciende en la Bandeja de la aplicación (con sus cuentas de Facebook o Instagram asignadas).`;
      }
      const quiere = (t) => tipo === "todo" || tipo === t || !["comentarios", "mensajes"].includes(tipo);
      const t = Date.now();
      const salida = [`LA BANDEJA DE ${c.name.toUpperCase()}${estado.actualizada_at ? ` (leída de Meta ${haceCuanto(estado.actualizada_at, t)})` : ""}`];
      if (quiere("comentarios")) {
        const comentarios = await acceso.leer("bandeja_comentarios", { client_id: c.id, propio: 0, atendido: 0 }, "creado_at desc", MAX_BANDEJA + 1);
        salida.push("", `COMENTARIOS SIN ATENDER: ${comentarios.length > MAX_BANDEJA ? `más de ${MAX_BANDEJA}` : comentarios.length}`);
        for (const f of comentarios.slice(0, MAX_BANDEJA)) {
          salida.push(`· ${f.red === "instagram" ? "Instagram" : "Facebook"} · ${haceCuanto(f.creado_at, t)} · ${f.autor || "alguien"}: «${corto(f.texto, 300)}»${f.oculto ? " (oculto)" : ""}`);
          if (f.publicacion_texto) salida.push(`  en: «${corto(f.publicacion_texto, 100)}»${f.publicacion_enlace ? ` ${f.publicacion_enlace}` : ""}`);
        }
      }
      if (quiere("mensajes")) {
        const hilos = await acceso.leer("bandeja_hilos", { client_id: c.id, atendido: 0 }, "ultimo_at desc", MAX_BANDEJA + 1);
        salida.push("", `CONVERSACIONES SIN ATENDER: ${hilos.length > MAX_BANDEJA ? `más de ${MAX_BANDEJA}` : hilos.length}`);
        for (const h of hilos.slice(0, MAX_BANDEJA)) {
          const v = ventanaMensajes(h.ultimo_usuario_at, t, h.red);
          const plazo = v.abierta ? (v.aviso || "se puede responder") : "fuera de las 24 h: ya no se responde desde la aplicación";
          salida.push(`· ${h.red === "instagram" ? "Instagram" : "Facebook"} · ${h.usuario || "alguien"} · ${haceCuanto(h.ultimo_at, t)}${Number(h.sin_leer) ? ` · ${h.sin_leer} sin leer` : ""} · ${plazo}`);
          if (h.ultimo_texto) salida.push(`  último: «${corto(h.ultimo_texto, 300)}»`);
        }
      }
      salida.push("", "Para responder, ocultar o marcar atendido: la Bandeja de la aplicación.");
      return salida.join("\n");
    },

    async ver_informes({ cliente, mes = "" } = {}) {
      const c = await resolverCliente(cliente);
      if (mes && !MES.test(String(mes))) throw new ErrorEquipo("El mes va como AAAA-MM (por ejemplo, 2026-10).");
      const columnas = ["id", "mes", "estado", "error", "testigo", "compartido", "automatico", "updated_at"];
      const [redes, anuncios] = await Promise.all([
        acceso.leerColumnas("informes", columnas, { client_id: c.id }, "mes desc", 24),
        acceso.leerColumnas("informes_anuncios", columnas, { client_id: c.id }, "mes desc", 24),
      ]);
      if (!redes.length && !anuncios.length) {
        return `${c.name} no tiene informes todavía. El mensual se genera en Resultados → Informes; el de anuncios, en Anuncios → Informe (los dos pueden salir solos el día 1).`;
      }
      const ruta = { informes: "/informe", informes_anuncios: "/informe-anuncios" };
      const linea = (tabla) => (f) => {
        const estado = f.estado === "error" ? `falló${f.error ? `: ${corto(f.error, 160)}` : ""}` : f.estado === "generando" ? "generándose" : "listo";
        const compartido = Number(f.compartido) === 1 && f.testigo ? `compartido → ${url(`${ruta[tabla]}?t=${encodeURIComponent(f.testigo)}`)}` : "sin compartir";
        return `· ${f.mes} · ${estado}${f.estado === "listo" ? ` · ${compartido}` : ""}${Number(f.automatico) === 1 ? " · salió solo" : ""}`;
      };
      const salida = [`INFORMES DE ${c.name.toUpperCase()}`];
      salida.push("", `MENSUAL DE REDES (${redes.length}):`, ...(redes.length ? redes.map(linea("informes")) : ["· ninguno"]));
      salida.push("", `DE ANUNCIOS (${anuncios.length}):`, ...(anuncios.length ? anuncios.map(linea("informes_anuncios")) : ["· ninguno"]));

      if (mes) {
        salida.push("", `EL ANÁLISIS DE ${mes}:`);
        for (const [tabla, titulo] of [["informes", "Redes"], ["informes_anuncios", "Anuncios"]]) {
          const fila = await acceso.leerUno(tabla, { client_id: c.id, mes: String(mes) });
          const a = fila?.estado === "listo" ? leerJSON(fila.contenido, {})?.analisis ?? null : null;
          if (!a) { salida.push(`· ${titulo}: ${fila ? "aún no está listo" : "no hay informe de ese mes"}.`); continue; }
          const texto = typeof a === "string" ? a : a.resumen;
          salida.push(`· ${titulo}: ${corto(texto, 1200) || "sin resumen."}`);
          const recomendaciones = Array.isArray(a.recomendaciones) ? a.recomendaciones.slice(0, 5) : [];
          for (const r of recomendaciones) salida.push(`  - ${corto(typeof r === "string" ? r : r?.texto ?? r?.titulo ?? "", 240)}`);
        }
      }
      salida.push("", "Generar o compartir: en la aplicación (Resultados → Informes y Anuncios → Informe).");
      return salida.join("\n");
    },
  };
}
