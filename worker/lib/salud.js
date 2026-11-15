// ============================================================
// Que nada falle en silencio: la salud del cron y de los proveedores
//
// EL CRON EN CASCADA
//
// El cron de cada minuto (worker/index.js, `scheduled`) va en cascada: cada tarea dice si tuvo trabajo y, si lo tuvo,
// las de abajo esperan a la vuelta siguiente (las dos juntas no caben en las 50 consultas y 50 peticiones de una
// invocación). Antes, una tarea que FALLABA contaba como «tuvo trabajo» (`.catch(() => 1)`): si fallaba siempre, todo lo
// de abajo —métricas, informes, historias, avisos a mano, Estudio, encargos, inspiración, «Lo mejor», la 3Q— dejaba de
// correr para siempre, y el error sólo iba a la consola. Ahora (`correrCron`):
//   · Un fallo sigue parando la vuelta (pudo gastar la mitad del presupuesto: seguir podría pasarse), pero se CUENTA.
//   · A los `SALTAR_TRAS` fallos seguidos la tarea se SALTA un rato (5, 10, 20, 40 y luego 60 minutos) y las de abajo
//     corren; pasado el rato se intenta otra vez.
//   · Si lleva más de `AVISAR_TRAS_MS` fallando, la campana del ADMINISTRADOR lo dice, una vez por racha.
//   · Cada tarea tiene su fila en `salud` («tarea:<id>»): último éxito, última vez con trabajo, último error con su texto,
//     fallos seguidos y hasta cuándo se salta. Se lee UNA vez por vuelta (una consulta) y se escribe sólo cuando cambia de
//     estado o, si sigue bien, cada `LATIDO_MS` (una sentencia con todo lo que cambió).
//
// LOS PROVEEDORES
//
// Cada llamada a un proveedor con la llave del servidor (Anthropic, Meta IA, Google, Kie, ElevenLabs, fal, Higgsfield,
// Scrape Creators) se apunta con `anotar(proveedor, fallo)` donde ya ocurre: es SÍNCRONO y sólo toca la memoria de la
// instancia, así no cambia nada de quien llama. `volcarSalud(env)` lo escribe —al terminar cada petición
// (`ctx.waitUntil`), cada vuelta del cron y cada alarma de la bomba del Estudio—, sólo lo que cambió o lleva rato sin
// escribirse: sin nada nuevo no cuesta ni una consulta. Lo que va con el token de un ESPACIO (Drive) lleva su espacio.
//
// Un fallo POR SALDO (402, «credit balance», «prepayment credits depleted», «quota_exceeded», «sin créditos»…) avisa a
// la campana del administrador de cada espacio, UNA vez por proveedor y día (`avisos_dados`): casi todos los fallos del
// Estudio del mes fueron de saldo y nadie se enteraba hasta que algo no salía.
// ============================================================

import { leerSalud, guardarSalud, administradoresDeTodos, crearAcceso, mesesConLimiteVencido } from "./acceso.js";
import { avisar } from "./equipo.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import { visibleParaCliente } from "../../src/lib/trabajo.js";

/** Las tareas del cron, en el orden en que corren. La página de Ajustes → Salud las enseña así. */
export const TAREAS_CRON = Object.freeze([
  { id: "cola", nombre: "Publicar lo programado", que: "Instagram, Facebook, TikTok y YouTube, a su hora." },
  { id: "renders", nombre: "Renders que se quedaron colgados", que: "Un video que murió a la mitad se da por fallido y se avisa (cada 5 minutos)." },
  { id: "limites", nombre: "Fecha límite del cliente", que: "Si vence sin que el cliente mande su revisión, se avisa a la agencia (cada 5 minutos)." },
  { id: "metricas", nombre: "Métricas del día", que: "La foto diaria de cada cuenta de Instagram, Facebook y YouTube." },
  { id: "informes", nombre: "Informe mensual", que: "El automático del día 1." },
  { id: "informe-anuncios", nombre: "Informe de anuncios", que: "El automático del día 1." },
  { id: "historias", nombre: "Historias automáticas", que: "Poner en la cola la de cada día de cada cliente." },
  { id: "a-mano", nombre: "Avisos de «La publico yo»", que: "10 minutos antes y a la hora." },
  { id: "estudio", nombre: "Estudio sin pantalla", que: "Lo que se pidió y nadie está mirando." },
  { id: "encargos", nombre: "Encargos del Estudio", que: "Lotes, carruseles y reels que siguen en el servidor." },
  { id: "inspiracion", nombre: "Inspiración", que: "Lo que publican las cuentas que sigue cada cliente." },
  { id: "lo-mejor", nombre: "Lo mejor del momento", que: "Anuncios de las búsquedas guardadas, TikTok y clasificar." },
  { id: "3q", nombre: "Revisión de campañas", que: "Lo grave de las campañas de un cliente al día." },
]);
/** Nombres de tareas que pueden sumarse a la cascada sin estar en la lista de arriba. */
const OTRAS_TAREAS = Object.freeze({
  cerebro: { nombre: "Cerebro al día", que: "Ponerlo al día con su repositorio de GitHub." },
});
export const datosDeTarea = (id) => TAREAS_CRON.find((t) => t.id === id) ?? OTRAS_TAREAS[id] ?? { id, nombre: id, que: "" };

/** Los proveedores con llave del servidor. `saldo`: si se puede leer gratis (Kie, ElevenLabs) o sólo se sabe al fallar. */
export const PROVEEDORES = Object.freeze([
  { id: "anthropic", nombre: "Anthropic (Claude)", llave: "ANTHROPIC_API_KEY", recargar: "console.anthropic.com → Billing" },
  { id: "meta-ia", nombre: "Meta IA (Muse)", llave: "META_API_KEY", recargar: "la consola de Meta AI" },
  { id: "google", nombre: "Google (Gemini, Nano Banana, Omni)", llave: "GOOGLE_AI_KEY", recargar: "aistudio.google.com → Facturación" },
  { id: "kie", nombre: "Kie.ai", llave: "KIE_API_KEY", saldo: true, recargar: "kie.ai" },
  { id: "elevenlabs", nombre: "ElevenLabs", llave: "ELEVENLABS_API_KEY", saldo: true, recargar: "elevenlabs.io" },
  { id: "fal", nombre: "fal.ai", llave: "FAL_KEY", recargar: "fal.ai → Billing" },
  { id: "higgsfield", nombre: "Higgsfield", llave: "HF_KEY", recargar: "higgsfield.ai" },
  { id: "scrape-creators", nombre: "Scrape Creators", llave: "SCRAPECREATORS_API_KEY", recargar: "scrapecreators.com" },
]);
export const datosDeProveedor = (id) => PROVEEDORES.find((p) => p.id === id) ?? { id, nombre: id, llave: "" };

/** ¿Tiene el servidor la llave de ese proveedor? (Meta IA y Higgsfield se configuran de dos maneras.) */
export function proveedorConfigurado(env, id) {
  if (id === "meta-ia") return Boolean(env?.META_API_KEY || env?.MODEL_API_KEY);
  if (id === "higgsfield") return Boolean(env?.HF_KEY || (env?.HF_API_KEY && env?.HF_API_SECRET));
  const p = PROVEEDORES.find((x) => x.id === id);
  return Boolean(p && env?.[p.llave]);
}

/** Fallos seguidos a partir de los cuales una tarea se salta un rato. */
export const SALTAR_TRAS = 3;
/** Cuánto lleva fallando una tarea para que se avise al administrador. */
export const AVISAR_TRAS_MS = 30 * 60_000;
/** Sin cambios, cada cuánto se escribe que sigue bien (el «último éxito» de la pantalla no envejece más que esto). */
export const LATIDO_MS = 15 * 60_000;
/** Lo que se guarda del texto de un error. */
const MAX_ERROR = 300;

/** Minutos que se salta una tarea con `fallos` seguidos: 5, 10, 20, 40 y luego 60. Pura. */
export function minutosDeSalto(fallos) {
  if (fallos < SALTAR_TRAS) return 0;
  return Math.min(60, 5 * 2 ** (fallos - SALTAR_TRAS));
}

/** ¿Se salta ahora esta tarea? Pura. */
export const seSalta = (fila, ahoraMs = Date.now()) => Boolean(fila?.saltar_hasta && Date.parse(fila.saltar_hasta) > ahoraMs);

/** El texto de un fallo, corto y sin saltos de línea. Pura. */
export function textoDeFallo(fallo) {
  const t = typeof fallo === "string" ? fallo : fallo?.message ?? String(fallo ?? "");
  return t.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR) || "Falló sin decir por qué.";
}

/**
 * ¿Es un fallo de SALDO (la cuenta del proveedor sin créditos), no de la llave ni del pedido? Por el estado (402) o por
 * lo que dicen los proveedores y nuestros propios mensajes. Un 429 de cuota POR MINUTO no lo es. Pura.
 */
export function esFalloDeSaldo(fallo) {
  if (!fallo) return false;
  if (fallo.sinSaldo === true) return true;
  const estado = Number(fallo.estado ?? fallo.status ?? 0);
  if (estado === 402) return true;
  const t = textoDeFallo(fallo);
  return /\(402\)|\b402\b.*(?:pay|cr[eé]dit|saldo)|credit balance|prepayment|credits? (?:are |is )?depleted|quota_exceeded|insufficient[_ ](?:credits?|balance|funds|quota)|exhausted balance|no tiene cr[eé]ditos|sin cr[eé]ditos|se acab[oó] el saldo|saldo agotado/i.test(t);
}

/**
 * La fila nueva de una tarea tras una vuelta (`fallo`: lo que lanzó, o null; `trabajo`: si tuvo trabajo) → { fila,
 * escribir, avisar }. `escribir`: cambió de estado o lleva `LATIDO_MS` sin escribirse. `avisar`: lleva más de
 * `AVISAR_TRAS_MS` fallando y aún no se avisó en esta racha. Pura.
 */
export function siguienteEstado(fila, { id, fallo = null, trabajo = false }, ahoraISO = new Date().toISOString()) {
  const t = ahoraISO;
  const ms = Date.parse(t);
  const base = fila ?? { id: `tarea:${id}`, espacio: "", tipo: "tarea", fallos: 0, ok_at: null, trabajo_at: null, error_at: null, error: "", desde: null, saltar_hasta: null, avisado_at: null, saldo_at: null };
  if (!fallo) {
    const venia = Number(base.fallos) > 0 || Boolean(base.saltar_hasta);
    const viejo = !base.updated_at || ms - Date.parse(base.updated_at) >= LATIDO_MS;
    return {
      fila: { ...base, ok_at: t, trabajo_at: trabajo ? t : base.trabajo_at, fallos: 0, desde: null, saltar_hasta: null, avisado_at: null, updated_at: t },
      escribir: !fila || venia || viejo,
      avisar: false,
    };
  }
  const fallos = (Number(base.fallos) || 0) + 1;
  const desde = Number(base.fallos) > 0 && base.desde ? base.desde : t;
  const salto = minutosDeSalto(fallos);
  const avisar = fallos >= SALTAR_TRAS && ms - Date.parse(desde) >= AVISAR_TRAS_MS && !base.avisado_at;
  return {
    fila: {
      ...base, error_at: t, error: textoDeFallo(fallo), fallos, desde,
      saltar_hasta: salto ? new Date(ms + salto * 60_000).toISOString() : null,
      avisado_at: avisar ? t : base.avisado_at ?? null, updated_at: t,
    },
    escribir: true,
    avisar,
  };
}

/**
 * La cascada del cron con su salud. `pasos`: [[id, () => promesa de «tuvo trabajo»]] en orden. Lo que se salta no corre;
 * lo que falla se cuenta y para la vuelta; lo que tiene trabajo, también. Al final se escribe lo que cambió (una
 * sentencia), se avisa lo que toca y se vuelca lo de los proveedores. → el id de la tarea que paró la vuelta, o null.
 */
export async function correrCron(env, pasos, { ahora = () => new Date() } = {}) {
  let filas = [];
  try { filas = await leerSalud(env.DB); } catch (e) { console.error("salud: leer", e?.message ?? e); }
  const porId = new Map(filas.filter((f) => f.tipo === "tarea").map((f) => [f.id, f]));
  const escribir = [];
  const avisos = [];
  let paro = null;
  for (const [id, fn] of pasos) {
    const fila = porId.get(`tarea:${id}`) ?? null;
    if (seSalta(fila, ahora().getTime())) continue;
    let trabajo = false;
    let fallo = null;
    try {
      trabajo = Boolean(await fn());
    } catch (e) {
      fallo = e ?? new Error("Falló sin decir por qué.");
      console.error(`cron ${id}:`, e);
    }
    const r = siguienteEstado(fila, { id, fallo, trabajo }, ahora().toISOString());
    if (r.escribir) escribir.push(r.fila);
    if (r.avisar) avisos.push(r.fila);
    if (fallo || trabajo) { paro = id; break; }
  }
  try { await guardarSalud(env.DB, escribir); } catch (e) { console.error("salud: escribir", e?.message ?? e); }
  for (const f of avisos) {
    const t = datosDeTarea(f.id.replace(/^tarea:/, ""));
    await avisarAdministradores(env, {
      clave: `${f.id}:${f.desde}`, tipo: "salud", enlace: "/ajustes#salud",
      texto: `«${t.nombre}» lleva más de ${Math.round(AVISAR_TRAS_MS / 60_000)} minutos fallando (${f.fallos} veces seguidas): ${f.error} ` +
        "Mientras tanto se salta un rato y lo demás sigue. Míralo en Ajustes → Salud.",
    });
  }
  await volcarSalud(env);
  return paro;
}

/**
 * Un aviso del SERVIDOR para el administrador de cada espacio, una sola vez por `clave` y espacio (`avisos_dados`). Nunca
 * lanza. → a cuántos espacios llegó.
 */
export async function avisarAdministradores(env, { clave, tipo, texto, enlace = "/ajustes#salud" }, { soloEspacio = null } = {}) {
  if (!env?.DB) return 0;
  let enviados = 0;
  try {
    const admins = await administradoresDeTodos(env.DB);
    const porEspacio = new Map();
    for (const a of admins) {
      if (soloEspacio && a.owner_id !== soloEspacio) continue;
      porEspacio.set(a.owner_id, [...(porEspacio.get(a.owner_id) ?? []), a.user_id]);
    }
    for (const [owner, para] of porEspacio) {
      try {
        const acceso = crearAcceso(env.DB, owner);
        if (!(await acceso.insertarSiNoEsta("avisos_dados", { id: String(clave).slice(0, 200), created_at: new Date().toISOString() }))) continue;
        if (await avisar(env, acceso, { para, tipo, texto, enlace, por: { userId: "sistema", nombre: "Salud" } })) enviados++;
      } catch (e) {
        console.error("salud: avisar", owner, e?.message ?? e);
      }
    }
  } catch (e) {
    console.error("salud: administradores", e?.message ?? e);
  }
  return enviados;
}

// ------------------------------------------------------------
// Los proveedores: anotar en memoria, volcar a D1 de vez en cuando
// ------------------------------------------------------------

/** Lo que ha visto ESTA instancia del Worker, por fila de `salud`. */
const memoria = new Map();
/** Los saldos ya avisados hoy desde esta instancia («kie|2026-11-15»): no se vuelve a mirar `avisos_dados`. */
const saldosAvisados = new Set();

/** Para los tests: olvida lo apuntado. */
export function olvidarSalud() {
  memoria.clear();
  saldosAvisados.clear();
}

/**
 * Apunta el resultado de una llamada a un proveedor: `fallo` null = fue bien; si no, el error (o su texto). SÍNCRONO y
 * sólo en memoria: lo escribe `volcarSalud`. Con `espacio`, la fila es de ese espacio (Drive, con su token). Nunca lanza.
 */
export function anotar(proveedor, fallo = null, { espacio = "" } = {}) {
  try {
    const id = espacio ? `${espacio}|${proveedor}` : `proveedor:${proveedor}`;
    const ms = Date.now();
    const t = new Date(ms).toISOString();
    const e = memoria.get(id) ?? { id, espacio: String(espacio ?? ""), tipo: espacio ? "integracion" : "proveedor", escritoMs: 0, ultimo: null };
    if (!fallo) {
      const cambio = e.ultimo !== "ok";
      e.ok_at = t;
      e.ultimo = "ok";
      if (cambio || ms - e.escritoMs >= LATIDO_MS) e.sucio = true;
    } else {
      const texto = textoDeFallo(fallo);
      const cambio = e.ultimo !== "error" || texto !== e.error;
      e.error_at = t;
      e.error = texto;
      e.ultimo = "error";
      if (cambio || ms - e.escritoMs >= LATIDO_MS) e.sucio = true;
      if (!espacio && esFalloDeSaldo(fallo)) {
        e.saldo_at = t;
        e.sucio = true;
        e.avisarSaldo = true;
      }
    }
    memoria.set(id, e);
  } catch { /* la salud nunca tumba una llamada */ }
}

/** Lo que dice el aviso de un saldo que se acabó. Pura. */
export function textoDeSaldo(proveedor, error = "") {
  const p = datosDeProveedor(proveedor);
  return `Se acabó el saldo de ${p.nombre}: ${String(error).slice(0, 180)} ` +
    `Hasta que se recargue${p.recargar ? ` (en ${p.recargar})` : ""}, lo que dependa de él no sale. Míralo en Ajustes → Salud.`;
}

/** Escribe lo que cambió de los proveedores (una sentencia) y avisa de los saldos que se acabaron. Nunca lanza. */
export async function volcarSalud(env) {
  try {
    const sucias = [...memoria.values()].filter((e) => e.sucio);
    if (!sucias.length || !env?.DB) return 0;
    const ms = Date.now();
    const filas = sucias.map((e) => ({
      id: e.id, espacio: e.espacio, tipo: e.tipo, ok_at: e.ok_at ?? null, error_at: e.error_at ?? null, error: e.error ?? "",
      saldo_at: e.saldo_at ?? null, updated_at: new Date(ms).toISOString(),
    }));
    for (const e of sucias) { e.sucio = false; e.escritoMs = ms; }
    await guardarSalud(env.DB, filas);
    const hoy = fechaEnZona(new Date(ms));
    for (const e of sucias.filter((x) => x.avisarSaldo)) {
      e.avisarSaldo = false;
      const proveedor = e.id.replace(/^proveedor:/, "");
      const llave = `${proveedor}|${hoy}`;
      if (saldosAvisados.has(llave)) continue;
      saldosAvisados.add(llave);
      await avisarAdministradores(env, { clave: `saldo:${proveedor}:${hoy}`, tipo: "saldo", texto: textoDeSaldo(proveedor, e.error) });
    }
    return filas.length;
  } catch (e) {
    console.error("salud: volcar", e?.message ?? e);
    return 0;
  }
}

/**
 * Envuelve una llamada a un proveedor: apunta si fue bien o el error (que se vuelve a lanzar tal cual). Para los módulos
 * que tienen UNA función por la que pasa todo (`llamar`). `ignorar(e)`: un error que no dice nada de la salud del
 * proveedor (el filtro de contenido de Google rechazó la escena) no se apunta.
 */
export async function seguido(proveedor, fn, { espacio = "", ignorar = null } = {}) {
  try {
    const v = await fn();
    anotar(proveedor, null, { espacio });
    return v;
  } catch (e) {
    if (!ignorar?.(e)) anotar(proveedor, e, { espacio });
    throw e;
  }
}

// ------------------------------------------------------------
// La fecha límite del cliente (del cron, cada 5 minutos)
// ------------------------------------------------------------

/** El minuto (de cada 5) en que mira la fecha límite: así no coincide con el barrido de los renders. */
const MINUTO_LIMITES = 1;
/** Hasta cuántos días atrás se avisa de una fecha vencida (lo de antes de instalar esto no se avisa de golpe). */
const DIAS_LIMITE = 7;

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** Las publicaciones que el cliente ve y siguen sin respuesta suya (ni publicadas). Pura. */
export function sinRespuestaDelCliente(dias, respondidas, revisionInterna = false) {
  let n = 0;
  for (const d of Array.isArray(dias) ? dias : []) {
    for (const p of d?.posts ?? []) {
      if (!p?.id || p.status === "published" || respondidas.has(p.id)) continue;
      if (visibleParaCliente(p, revisionInterna)) n++;
    }
  }
  return n;
}

/**
 * Los meses cuya FECHA LÍMITE para que el cliente revise (`opciones.fechaLimite`, «Enviar a cliente») venció sin su
 * revisión: un aviso a la agencia (quien lleva el cliente), UNA vez por mes y fecha (`avisos_dados`). Si el cliente ya
 * respondió todo una a una, no se avisa. Sin nada que avisar, una consulta cada 5 minutos. → 1 si hizo algo.
 */
export async function limitesVencidosPendiente(env, cuando = new Date()) {
  if (cuando.getUTCMinutes() % 5 !== MINUTO_LIMITES) return 0;
  const hoy = fechaEnZona(cuando);
  const meses = await mesesConLimiteVencido(env.DB, sumarDias(hoy, -DIAS_LIMITE), hoy, 3);
  if (!meses.length) return 0;
  for (const m of meses) {
    const acceso = crearAcceso(env.DB, m.owner_id);
    if (!(await acceso.insertarSiNoEsta("avisos_dados", { id: `limite:${m.id}:${m.limite}`, created_at: new Date().toISOString() }))) continue;
    const [cal, cliente, respuestas, miembros] = await Promise.all([
      acceso.leerUno("calendars", { id: m.id }),
      acceso.leerUno("clients", { id: m.client_id }),
      acceso.leerColumnas("approvals", ["post_id"], { calendar_id: m.id }),
      acceso.leerColumnas("memberships", ["user_id", "clientes"], {}),
    ]);
    if (!cal || !cliente) continue;
    const pendientes = sinRespuestaDelCliente(leerJSON(cal.days, []), new Set(respuestas.map((r) => r.post_id)), cliente.revision_interna === 1);
    if (!pendientes) continue;
    // A quien lleva este cliente: todo el equipo menos los colaboradores de otros clientes.
    const para = miembros.filter((x) => {
      const lista = leerJSON(x.clientes, null);
      return !Array.isArray(lista) || lista.map(String).includes(String(m.client_id));
    }).map((x) => x.user_id);
    const mes = cal.name || `${cal.month ?? ""} ${cal.year ?? ""}`.trim() || "el mes";
    await avisar(env, acceso, {
      para, tipo: "limite",
      texto: `Venció la fecha para que ${cliente.name || "el cliente"} revise ${mes} (${m.limite}): ${pendientes} ${pendientes === 1 ? "publicación sigue" : "publicaciones siguen"} sin respuesta.`,
      enlace: `/cliente/${encodeURIComponent(m.client_id)}/${encodeURIComponent(m.id)}`,
      por: { userId: "sistema", nombre: "Fecha límite" },
    });
  }
  return 1;
}

// ------------------------------------------------------------
// Lo que enseña Ajustes → Salud
// ------------------------------------------------------------

/** Si el cron no apunta nada en esto, es que no corre (la cola va primero y escribe su latido cada `LATIDO_MS`). */
export const CRON_PARADO_MS = 2 * LATIDO_MS + 5 * 60_000;

const masNuevo = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/** El estado de una tarea del cron: «en-pausa» (falla y se salta), «falla», «bien» o «sin-datos». Pura. */
export function estadoDeTarea(fila, ahoraMs = Date.now()) {
  if (!fila) return "sin-datos";
  if (seSalta(fila, ahoraMs)) return "en-pausa";
  if (Number(fila.fallos) > 0) return "falla";
  return fila.ok_at ? "bien" : "sin-datos";
}

/** El estado de un proveedor o una integración: «sin-configurar», «sin-datos», «sin-saldo», «falla» o «bien». Pura. */
export function estadoDeIntegracion({ configurado = true, okAt = null, errorAt = null, saldoAt = null }) {
  if (!configurado) return "sin-configurar";
  if (!okAt && !errorAt) return "sin-datos";
  if (errorAt && (!okAt || errorAt > okAt)) return saldoAt && saldoAt >= errorAt ? "sin-saldo" : "falla";
  return "bien";
}

const INTEGRACIONES = Object.freeze([
  { id: "meta-publicar", nombre: "Meta · publicar (Instagram y Facebook)", redes: ["instagram", "facebook"], de: "cola" },
  { id: "meta-medir", nombre: "Meta · medir (la foto diaria)", redes: ["instagram", "facebook"], de: "metricas" },
  { id: "tiktok-publicar", nombre: "TikTok · publicar (PostPeer)", redes: ["tiktok"], de: "cola" },
  { id: "youtube-publicar", nombre: "YouTube · publicar", redes: ["youtube"], de: "cola" },
  { id: "youtube-medir", nombre: "YouTube · medir", redes: ["youtube"], de: "metricas" },
  { id: "drive", nombre: "Google Drive", de: "salud" },
]);

/** Lo último de la cola en esas redes: el último éxito y el último error que sigue en error. */
async function deLaCola(acceso, redes) {
  const leer = (red, estado) => acceso.leerColumnas("publicaciones_programadas", ["red", "estado", "error", "updated_at", "publicada_at"], { red, estado }, "updated_at desc", 1);
  const filas = await Promise.all(redes.flatMap((red) => [leer(red, "publicada"), leer(red, "error")]));
  let okAt = null;
  let error = null;
  for (const f of filas.flat()) {
    if (f.estado === "error") {
      if (!error || f.updated_at > error.at) error = { at: f.updated_at, texto: `${f.red}: ${String(f.error ?? "").slice(0, 240)}` };
    } else okAt = masNuevo(okAt, f.publicada_at ?? f.updated_at);
  }
  return { okAt, errorAt: error?.at ?? null, error: error?.texto ?? "" };
}

/** Lo último de la foto diaria de esas redes: la última que salió bien y la última con error. */
async function deLasMetricas(acceso, redes) {
  const filas = (await Promise.all(redes.map((red) => acceso.leerColumnas("metricas_cuenta", ["red", "datos", "created_at"], { red }, "created_at desc", 12)))).flat();
  let okAt = null;
  let error = null;
  for (const f of filas) {
    const e = leerJSON(f.datos, {})?.error;
    if (e) { if (!error || f.created_at > error.at) error = { at: f.created_at, texto: `${f.red}: ${String(e).slice(0, 240)}` }; }
    else okAt = masNuevo(okAt, f.created_at);
  }
  return { okAt, errorAt: error?.at ?? null, error: error?.texto ?? "" };
}

/**
 * Todo lo de la página: las tareas del cron, los proveedores del servidor y las integraciones de ESTE espacio (lo de
 * publicar y medir sale de la cola y de la foto de métricas, que ya lo guardan con su error: no se escribe nada aparte).
 * Primero vuelca lo que esta instancia tenga sin escribir.
 */
export async function estadoDeSalud(env, acceso, ahoraMs = Date.now()) {
  await volcarSalud(env);
  const filas = await leerSalud(env.DB, acceso.ownerId);
  const porId = new Map(filas.map((f) => [f.id, f]));

  const ids = [...TAREAS_CRON.map((t) => t.id), ...filas.filter((f) => f.tipo === "tarea").map((f) => f.id.replace(/^tarea:/, ""))];
  const tareas = [...new Set(ids)].map((id) => {
    const f = porId.get(`tarea:${id}`) ?? null;
    const d = datosDeTarea(id);
    return {
      id, nombre: d.nombre, que: d.que, estado: estadoDeTarea(f, ahoraMs), okAt: f?.ok_at ?? null, trabajoAt: f?.trabajo_at ?? null,
      errorAt: f?.error_at ?? null, error: f?.error ?? "", fallos: Number(f?.fallos ?? 0), desde: f?.desde ?? null, saltarHasta: f?.saltar_hasta ?? null,
    };
  });
  const cola = porId.get("tarea:cola");
  const cronParado = Boolean(cola?.updated_at) && ahoraMs - Date.parse(cola.updated_at) > CRON_PARADO_MS;

  const proveedores = PROVEEDORES.map((p) => {
    const f = porId.get(`proveedor:${p.id}`);
    const v = { configurado: proveedorConfigurado(env, p.id), okAt: f?.ok_at ?? null, errorAt: f?.error_at ?? null, saldoAt: f?.saldo_at ?? null };
    return { id: p.id, nombre: p.nombre, llave: p.llave, recargar: p.recargar ?? "", leeSaldo: Boolean(p.saldo), ...v, error: f?.error ?? "", estado: estadoDeIntegracion(v) };
  });

  const [meta, drive, cuentas] = await Promise.all([
    acceso.leerColumnas("integracion_meta", ["id"], {}, "created_at asc", 1),
    acceso.leerColumnas("integracion_drive", ["id"], {}, "created_at asc", 1),
    acceso.leerColumnas("cuentas_sociales", ["red"], {}),
  ]);
  const redes = new Set(cuentas.map((c) => c.red));
  const conectado = {
    "meta-publicar": meta.length > 0, "meta-medir": meta.length > 0,
    "tiktok-publicar": Boolean(env?.POSTPEER_API_KEY) && redes.has("tiktok"),
    "youtube-publicar": redes.has("youtube"), "youtube-medir": redes.has("youtube"), drive: drive.length > 0,
  };
  const integraciones = [];
  for (const i of INTEGRACIONES) {
    let v;
    if (i.de === "cola") v = await deLaCola(acceso, i.redes);
    else if (i.de === "metricas") v = await deLasMetricas(acceso, i.redes);
    else {
      const f = porId.get(`${acceso.ownerId}|${i.id}`);
      v = { okAt: f?.ok_at ?? null, errorAt: f?.error_at ?? null, error: f?.error ?? "" };
    }
    integraciones.push({ id: i.id, nombre: i.nombre, conectado: conectado[i.id], ...v, estado: estadoDeIntegracion({ configurado: conectado[i.id], ...v }) });
  }
  return { tareas, cronParado, cronVisto: cola?.updated_at ?? null, proveedores, integraciones, ahora: new Date(ahoraMs).toISOString() };
}

// ------------------------------------------------------------
// Los saldos que se pueden leer GRATIS
// ------------------------------------------------------------

const MS_SALDOS = 5 * 60_000;
let saldosRecordados = null;

/** La cuota de ElevenLabs (`/v1/user/subscription`, no gasta). → { texto, valor?, bajo? } o null sin llave. */
async function saldoDeElevenLabs(env) {
  if (!env?.ELEVENLABS_API_KEY) return null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) return { texto: "La llave del servidor no deja leer la cuota (le falta el permiso de leer la cuenta): se sabrá cuando un pedido falle." };
    if (!res.ok) return { texto: `ElevenLabs no dio la cuota (${res.status}).` };
    const j = await res.json().catch(() => null);
    const limite = Number(j?.character_limit);
    const usados = Number(j?.character_count);
    if (!Number.isFinite(limite) || !Number.isFinite(usados)) return { texto: "ElevenLabs no dijo la cuota." };
    const quedan = Math.max(0, limite - usados);
    const reinicio = Number(j?.next_character_count_reset_unix) > 0 ? fechaEnZona(new Date(Number(j.next_character_count_reset_unix) * 1000)) : "";
    return {
      valor: quedan, bajo: quedan < limite * 0.1,
      texto: `Quedan ${quedan.toLocaleString("es-PA")} de ${limite.toLocaleString("es-PA")} créditos${reinicio ? `; se renuevan el ${reinicio}` : ""}.`,
    };
  } catch {
    return { texto: "ElevenLabs no contestó." };
  }
}

/** El saldo de Kie (`GET /api/v1/chat/credit`, no gasta). → { texto, valor?, bajo? } o null sin llave. */
async function saldoDeKie(env) {
  if (!env?.KIE_API_KEY) return null;
  // En el momento: kie.js apunta su salud aquí (estático sería un ciclo).
  const { saldoKie } = await import("./estudio/kie.js");
  const { USD_POR_CREDITO } = await import("../../src/lib/voces.js");
  const n = await saldoKie(env);
  if (n === null) return { texto: "Kie no dio el saldo." };
  return { valor: n, bajo: n * USD_POR_CREDITO < 1, texto: `${n.toLocaleString("es-PA")} créditos (≈ ${(n * USD_POR_CREDITO).toFixed(2)} $).` };
}

/**
 * Los saldos de los proveedores que se pueden leer gratis (Kie y ElevenLabs); del resto se sabe cuando un pedido falla
 * por saldo. Recordados 5 minutos por instancia (`otraVez` los vuelve a pedir). → { kie, elevenlabs, leidoAt }.
 */
export async function saldosDeProveedores(env, { otraVez = false } = {}) {
  if (!otraVez && saldosRecordados && Date.now() - saldosRecordados.ms < MS_SALDOS) return saldosRecordados.valor;
  const [kie, elevenlabs] = await Promise.all([saldoDeKie(env).catch(() => null), saldoDeElevenLabs(env)]);
  const valor = { kie, elevenlabs, leidoAt: new Date().toISOString() };
  saldosRecordados = { ms: Date.now(), valor };
  return valor;
}
