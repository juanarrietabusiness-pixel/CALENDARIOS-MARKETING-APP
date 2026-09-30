// ============================================================
// Reglas que la IA propone y que una persona decide
//
// «Aprender» de lo que pasó después de escribir tiene un riesgo que los
// pesos no tienen: un comentario sobre UNA publicación puede leerse
// después como una regla general. Aquí una sola llamada a la IA lee las
// respuestas del cliente —lo que dijo, tal cual—, propone unas pocas
// reglas cortas y cada una espera a que alguien la acepte, la corrija o la
// descarte. Sólo las aceptadas entran al cerebro, como notas de tipo
// «decisión».
//
// LAS CUATRO GUARDAS
//
//   1. Una regla general necesita el respaldo de DOS respuestas, salvo que
//      el cliente la haya dicho como una orden («nunca…», «no quiero…»).
//      Se comprueba en código, no se le pide a la IA que se acuerde.
//   2. La IA no puede citar lo que no leyó: el respaldo son números de las
//      respuestas del prompt, y una regla sin ninguno válido se tira.
//   3. No se propone dos veces lo mismo: ni lo que ya es una nota de
//      decisión, ni lo que se descartó, ni lo que espera respuesta.
//   4. No se llama a la IA si no hay nada nuevo desde la última vez, ni
//      cuando ya hay diez reglas esperando: cada llamada cuesta.
//
// La parte pura (qué se le enseña, cómo se lee lo que devuelve) va aparte
// de la que toca la base y la IA.
// ============================================================

import { uuid, ahora } from "../ids.js";
import { ErrorIA, llamarIA } from "./ia.js";
import { limpiarNota, slug, rutaUnica, derivados, MAX_NOTAS_POR_CLIENTE } from "./notas.js";
import { actualizarIndice } from "./cerebro.js";
import { leerSenales } from "./aprender.js";
import { mismoTitulo } from "./senales.js";

export const MAX_REGLAS = 6;
export const MAX_PENDIENTES = 10;
export const MIN_SENALES = 3;
const MAX_TITULO = 80;
const MAX_TEXTO = 600;
const MAX_CARACTERES_EVIDENCIA = 18_000;

const recorta = (t, max) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * ¿La señal enseña algo por sí sola? Una respuesta, si trae palabras de alguien; un resultado en redes, si fue de los
 * muy buenos o de los muy malos (uno del montón no dice nada); una corrección del equipo, si fue algo más que un
 * retoque. Una aprobación a secas no enseña nada por sí sola.
 */
export function conPalabras(s) {
  const d = s.detalle ?? {};
  if (s.tipo === "metricas") {
    const p = Number(d.percentil);
    return Number.isFinite(p) && (p >= 75 || p <= 25);
  }
  if (s.tipo === "correccion") return Number(d.intensidad) >= 0.3;
  return Boolean(String(d.comentario ?? "").trim() || String(d.sugeridaDescripcion ?? "").trim() || String(d.sugeridoGuion ?? "").trim());
}

/** Lo que dijo el cliente, junto, para buscar en ello órdenes expresas. */
const palabrasDelCliente = (s) => [s.detalle?.comentario, s.detalle?.sugeridaDescripcion, s.detalle?.sugeridoGuion].filter(Boolean).join(" ");

const cuando = (d) => [d?.fecha, d?.publicacion?.formato, d?.publicacion?.categoria].filter(Boolean).join(" · ");

/** Una señal como la lee la IA: el número con el que la va a citar, de qué publicación es y lo que se dijo. */
export function bloqueDeSenal(s, n) {
  const d = s.detalle ?? {};
  const pub = d.publicacion ?? {};
  const titulo = pub.titulo ? ` «${recorta(pub.titulo, 80)}»` : "";
  const c = cuando({ ...d, fecha: d.fecha || String(s.updated_at ?? "").slice(0, 10) });
  if (s.tipo === "metricas") {
    const partes = [`rindió mejor que el ${Math.round(d.percentil ?? 0)} % de las publicaciones de este cliente`];
    if (d.alcance != null) partes.push(`${d.alcance} de alcance`);
    if (d.interacciones != null) partes.push(`${d.interacciones} interacciones`);
    if (d.hora) partes.push(`salió a las ${d.hora}`);
    return `[R${n}] Resultado en redes · ${c} —${titulo}: ${partes.join(", ")}.${d.texto ? ` Texto: «${recorta(d.texto, 300)}».` : ""}`;
  }
  if (s.tipo === "correccion") {
    return `[R${n}] Corrección del equipo · ${c} —${titulo}: la IA escribió «${recorta(d.antes, 400)}» y quedó «${recorta(d.despues, 400)}»${d.cambio ? ` (${d.cambio})` : ""}.`;
  }
  const dijo = recorta(d.comentario, 500);
  const desc = recorta(d.sugeridaDescripcion, 400);
  const guion = recorta(d.sugeridoGuion, 400);
  return `[R${n}] Respuesta del cliente · ${c} —${titulo}: ${d.estado === "aprobado" ? "aprobó" : "pidió cambios"}.`
    + `${dijo ? ` Dijo: «${dijo}».` : ""}${desc ? ` Propuso la descripción: «${desc}».` : ""}${guion ? ` Propuso el guion: «${guion}».` : ""}`;
}

/**
 * Qué se le enseña a la IA: lo que salió mal primero (es lo que más enseña), luego lo demás con palabras, hasta
 * llenar el presupuesto. Las aprobaciones a secas no se enseñan una a una: se cuentan.
 * → { bloques: [{ n, senal, texto }], aprobadasSinPalabras, total }
 */
export function elegirEvidencia(senales, { maxCaracteres = MAX_CARACTERES_EVIDENCIA } = {}) {
  const con = senales.filter(conPalabras);
  // Sólo una RESPUESTA sin palabras es «aprobó y ya»; un resultado del montón o un retoque no se cuentan como nada.
  const sin = senales.filter((s) => s.tipo === "respuesta" && !conPalabras(s));
  const orden = [...con].sort((a, b) => (a.resultado - b.resultado) || String(b.updated_at).localeCompare(String(a.updated_at)));
  const bloques = [];
  let usados = 0;
  for (const s of orden) {
    const n = bloques.length + 1;
    const texto = bloqueDeSenal(s, n);
    if (usados + texto.length > maxCaracteres || bloques.length >= 40) break;
    bloques.push({ n, senal: s, texto });
    usados += texto.length;
  }
  const formatos = {};
  for (const s of sin) { const f = s.detalle?.publicacion?.formato || "publicación"; formatos[f] = (formatos[f] ?? 0) + 1; }
  return { bloques, aprobadasSinPalabras: { total: sin.length, formatos }, total: senales.length };
}

/** ¿Hay de dónde aprender? → { ok, n }: cuántas señales traen palabras o datos. */
export function hayEvidencia(senales, minimo = MIN_SENALES) {
  const n = senales.filter(conPalabras).length;
  return { ok: n >= minimo, n };
}

/** El prompt. Puro. */
export function promptDeReglas(cliente, evidencia, { decididas = [], descartadas = [], pendientes = [], ficha = "" } = {}) {
  const lista = (l) => (l.length ? l.map((t) => `- ${t}`).join("\n") : "(ninguna)");
  const sin = evidencia.aprobadasSinPalabras;
  const nota = sin.total ? `\n\nAdemás, ${sin.total} publicaciones se aprobaron sin ningún comentario (${Object.entries(sin.formatos).map(([f, c]) => `${c} de ${f}`).join(", ")}): eso no es una preferencia, no lo uses como regla.` : "";
  return `Eres el archivista de la agencia Juancito Ads. Vas a proponer REGLAS para el cerebro de ${cliente.name}: preferencias y límites que el cliente ha mostrado, para que la próxima vez la IA escriba mejor a la primera.

Lees lo que pasó DESPUÉS de escribir. Cada bloque [R#] es una respuesta del cliente, un resultado en redes o una corrección del equipo, con lo que se dijo tal cual.
· Las «Respuesta del cliente» son lo que el cliente quiere. Las «Corrección del equipo» son lo que la agencia cambió de lo que escribió la IA: sirven para ver QUÉ se repite, no para inventar gustos. Los «Resultado en redes» dependen de la hora, el día y la suerte: son apoyo, nunca la única razón de una regla.

REGLAS DE ESTA TAREA (no se negocian):
· Sólo lo que las respuestas respaldan. Una regla general necesita al menos DOS respuestas que la respalden, salvo que el cliente la diga como una orden expresa («nunca…», «siempre…», «no quiero…»).
· Es lo que quiere el CLIENTE, no lo que opine la agencia. No inventes gustos ni completes lo que no se dijo.
· Nada de costos, márgenes, proveedores ni cifras internas.
· Una regla, una idea: corta, en imperativo, con su porqué en una frase. Español de Panamá.
· No repitas nada de lo que ya está decidido, esperando respuesta o descartado (abajo).
· Entre 1 y ${MAX_REGLAS} reglas. Si no hay nada que valga la pena, responde exactamente: SIN REGLAS

Formato exacto, una regla tras otra, sin nada antes ni después:
REGLA: (título de hasta ${MAX_TITULO} caracteres)
TEXTO: (la regla, de 1 a 3 frases)
RESPALDO: (los números de las respuestas que la sostienen, por ejemplo R2, R5, R9)

YA DECIDIDO (no lo repitas):
${lista(decididas)}

ESPERANDO RESPUESTA (no lo repitas):
${lista(pendientes)}

DESCARTADO ANTES (no lo repitas):
${lista(descartadas)}
${ficha ? `\nFICHA DEL CLIENTE (para que no la contradigas):\n${recorta(ficha, 2500)}\n` : ""}
RESPUESTAS DEL CLIENTE, RESULTADOS Y CORRECCIONES:
${evidencia.bloques.map((b) => b.texto).join("\n")}${nota}`;
}

/**
 * Lo que devolvió la IA, en reglas: [{ titulo, texto, apoyo: [n…] }]. Una regla sin título o sin texto se tira; el
 * respaldo son los números de las respuestas que SÍ estaban en el prompt.
 */
export function leerReglas(texto, evidencia) {
  const t = String(texto ?? "");
  if (/^\s*SIN REGLAS\b/i.test(t)) return [];
  const validas = new Set(evidencia.bloques.map((b) => b.n));
  const reglas = [];
  for (const bloque of t.split(/^\s*REGLA\s*:/im).slice(1)) {
    const titulo = recorta(/^(.*)$/m.exec(bloque)?.[1], MAX_TITULO);
    const cuerpo = /TEXTO\s*:\s*([\s\S]*?)(?=^\s*RESPALDO\s*:|$(?![\s\S]))/im.exec(bloque)?.[1];
    const respaldo = /RESPALDO\s*:\s*([^\n]*)/i.exec(bloque)?.[1] ?? "";
    const apoyo = [...new Set([...respaldo.matchAll(/R\s*(\d+)/gi)].map((m) => Number(m[1])).filter((n) => validas.has(n)))];
    const texto2 = recorta(cuerpo, MAX_TEXTO);
    if (titulo && texto2) reglas.push({ titulo, texto: texto2, apoyo });
    if (reglas.length >= MAX_REGLAS) break;
  }
  return reglas;
}

const ORDEN_EXPRESA = /\b(nunca|siempre|jam[aá]s|no quiero|no queremos|no quiere|prohibido|obligatorio|tienen que|deben)\b/i;

/**
 * ¿La regla tiene el respaldo que hace falta? Dos respuestas; o una sola que sea una orden expresa del cliente
 * («nunca pongan…»). Lo dijo la IA, pero lo comprueba el código.
 */
export function respaldoSuficiente(regla, evidencia) {
  if (regla.apoyo.length >= 2) return true;
  if (regla.apoyo.length === 1) {
    const b = evidencia.bloques.find((x) => x.n === regla.apoyo[0]);
    return Boolean(b && b.senal.tipo === "respuesta" && ORDEN_EXPRESA.test(palabrasDelCliente(b.senal)));
  }
  return false;
}

/** Separa las reglas que no están ya en `existentes` (títulos). */
export function filtrarNuevas(reglas, existentes) {
  const vistos = [...existentes];
  const nuevas = [];
  let repetidas = 0;
  for (const r of reglas) {
    if (vistos.some((t) => mismoTitulo(t, r.titulo))) { repetidas++; continue; }
    vistos.push(r.titulo);
    nuevas.push(r);
  }
  return { nuevas, repetidas };
}

// ------------------------------------------------------------
// Con la base y con la IA
// ------------------------------------------------------------

const parsear = (texto, defecto) => {
  try { return JSON.parse(texto); } catch { return defecto; }
};

/** Las reglas que esperan respuesta, con las señales que las respaldan (su línea legible). */
export async function propuestasPendientes(acceso, clientId) {
  const filas = await acceso.leerColumnas(
    "cerebro_propuestas", ["id", "titulo", "texto", "motivo", "senales", "created_at"], { client_id: clientId, estado: "pendiente" }, "created_at desc",
  );
  const claves = [...new Set(filas.flatMap((f) => parsear(f.senales, [])))];
  const respaldo = claves.length
    ? new Map((await acceso.leerVarios("cerebro_senales", ["clave", "resumen"], "clave", claves, { client_id: clientId })).map((s) => [s.clave, s.resumen]))
    : new Map();
  return filas.map((f) => ({
    id: f.id, titulo: f.titulo, texto: f.texto, motivo: f.motivo, creada: f.created_at,
    respaldo: parsear(f.senales, []).map((c) => respaldo.get(c)).filter(Boolean),
  }));
}

/**
 * Le pide a la IA reglas a partir de lo que pasó después de escribir. Deja las nuevas como propuestas pendientes.
 * @returns {{ propuestas: number, repetidas: number, sinRespaldo: number, leidas: number, sinNovedades?: boolean,
 *             sinReglas?: boolean, modelo?: string, aviso?: string|null, segundos?: number }}
 */
export async function proponerReglas(env, acceso, cliente, { forzar = false } = {}) {
  const senales = await leerSenales(acceso, cliente.id, { limite: 200 });
  const { ok, n } = hayEvidencia(senales);
  if (!ok) {
    throw new ErrorIA(`Hacen falta al menos ${MIN_SENALES} casos de los que aprender —respuestas del cliente con comentarios, resultados muy buenos o muy malos, o textos que el equipo reescribió—; hoy hay ${n}. Cuando el cliente responda, o con «Aprender de lo que ya respondió» y «Aprender de los resultados en redes», habrá de dónde.`, 400);
  }

  const previas = await acceso.leerColumnas("cerebro_propuestas", ["titulo", "estado", "created_at"], { client_id: cliente.id }, "created_at desc");
  const pendientes = previas.filter((p) => p.estado === "pendiente");
  if (pendientes.length >= MAX_PENDIENTES) {
    throw new ErrorIA(`Ya hay ${pendientes.length} reglas esperando tu decisión: acepta o descarta algunas antes de pedir más.`, 409);
  }
  // Nada nuevo desde la última vez: no se gasta.
  const ultimaSenal = senales.reduce((m, s) => (String(s.updated_at) > m ? String(s.updated_at) : m), "");
  const ultimaVez = previas[0]?.created_at ?? "";
  if (!forzar && ultimaVez && ultimaSenal <= ultimaVez) {
    return { propuestas: 0, repetidas: 0, sinRespaldo: 0, leidas: 0, sinNovedades: true };
  }

  const evidencia = elegirEvidencia(senales);
  const decisiones = await acceso.leerColumnas("cerebro_notas", ["titulo"], { client_id: cliente.id, tipo: "decision" });
  const [ficha] = await acceso.leerColumnas("cerebro_notas", ["texto"], { client_id: cliente.id, tipo: "ficha" });
  const prompt = promptDeReglas(cliente, evidencia, {
    decididas: decisiones.map((d) => d.titulo).slice(0, 40),
    pendientes: pendientes.map((p) => p.titulo),
    descartadas: previas.filter((p) => p.estado === "descartada").map((p) => p.titulo).slice(0, 30),
    ficha: ficha?.texto ?? "",
  });
  const { texto, modelo, aviso, segundos } = await llamarIA(env, acceso, cliente, { prompt, salida: 4000 });

  const leidas = leerReglas(texto, evidencia);
  if (!leidas.length && !/^\s*SIN REGLAS\b/i.test(texto) && !/REGLA\s*:/i.test(texto)) {
    throw new ErrorIA("La IA no devolvió las reglas con el formato esperado. Inténtalo otra vez.", 502);
  }
  const respaldadas = leidas.filter((r) => respaldoSuficiente(r, evidencia));
  const { nuevas, repetidas } = filtrarNuevas(respaldadas, [...decisiones.map((d) => d.titulo), ...previas.map((p) => p.titulo)]);

  const filas = nuevas.slice(0, MAX_PENDIENTES - pendientes.length).map((r) => {
    const claves = r.apoyo.map((num) => evidencia.bloques.find((b) => b.n === num)?.senal.clave).filter(Boolean);
    return {
      id: uuid(), client_id: cliente.id, titulo: r.titulo, texto: r.texto, senales: JSON.stringify(claves),
      motivo: `Se apoya en ${claves.length === 1 ? "1 caso" : `${claves.length} casos`}.`, estado: "pendiente",
    };
  });
  if (filas.length) await acceso.guardarVarios("cerebro_propuestas", filas);
  return {
    propuestas: filas.length, repetidas, sinRespaldo: leidas.length - respaldadas.length, leidas: evidencia.bloques.length,
    sinReglas: !leidas.length, modelo, aviso, segundos,
  };
}

/**
 * Acepta una regla —con los cambios que la persona le haya hecho— y la deja como nota de tipo «decisión».
 * Se reserva ANTES de escribir la nota: dos personas pulsando «Aceptar» a la vez dejan una nota, no dos.
 * → { nota } o { error, estado }.
 */
export async function aceptarPropuesta(env, acceso, clientId, id, cambios = {}) {
  const p = await acceso.leerUno("cerebro_propuestas", { id, client_id: clientId });
  if (!p) return { error: "No se encontró esa regla.", estado: 404 };
  if (p.estado !== "pendiente") return { error: "Esa regla ya se resolvió.", estado: 409 };
  const { nota, error: motivo } = limpiarNota({
    titulo: cambios.titulo ?? p.titulo, texto: cambios.texto ?? p.texto, tipo: "decision", interna: cambios.interna, origen: "ia", fuente: `propuesta:${id}`,
  });
  if (motivo) return { error: motivo, estado: 400 };
  const existentes = await acceso.leerColumnas("cerebro_notas", ["ruta"], { client_id: clientId });
  if (existentes.length >= MAX_NOTAS_POR_CLIENTE) {
    return { error: `Este cliente ya tiene ${MAX_NOTAS_POR_CLIENTE} notas. Borra las que no sirvan antes de añadir más.`, estado: 409 };
  }
  const reservada = await acceso.actualizar("cerebro_propuestas", { id, client_id: clientId, estado: "pendiente" }, { estado: "aceptada", resuelta_at: ahora() });
  if (!reservada) return { error: "Esa regla ya se resolvió.", estado: 409 };
  const ruta = rutaUnica(slug(nota.titulo), new Set(existentes.map((e) => e.ruta)));
  const fila = { id: uuid(), client_id: clientId, ruta, ...nota, ...derivados(nota.texto), fuente_sha: "" };
  try {
    await acceso.insertar("cerebro_notas", fila);
  } catch (e) {
    // Sin nota no hay regla aceptada: vuelve a esperar.
    await acceso.actualizar("cerebro_propuestas", { id, client_id: clientId }, { estado: "pendiente", resuelta_at: null });
    throw e;
  }
  await acceso.actualizar("cerebro_propuestas", { id, client_id: clientId }, { nota_id: fila.id });
  const guardada = await acceso.leerUno("cerebro_notas", { id: fila.id, client_id: clientId });
  await actualizarIndice(env, acceso, clientId, ruta, guardada);
  return { nota: { id: fila.id, ruta, titulo: nota.titulo } };
}

/** Descarta una regla: no se vuelve a proponer. → { ok } o { error, estado }. */
export async function descartarPropuesta(acceso, clientId, id) {
  const p = await acceso.leerUno("cerebro_propuestas", { id, client_id: clientId });
  if (!p) return { error: "No se encontró esa regla.", estado: 404 };
  const n = await acceso.actualizar("cerebro_propuestas", { id, client_id: clientId, estado: "pendiente" }, { estado: "descartada", resuelta_at: ahora() });
  return n ? { ok: true } : { error: "Esa regla ya se resolvió.", estado: 409 };
}
