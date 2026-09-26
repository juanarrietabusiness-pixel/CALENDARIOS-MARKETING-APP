// ============================================================
// Publicar y programar en Instagram y Facebook
//
// LA COLA
//
// Instagram no deja programar por API: hay que publicar en el momento.
// Por eso la programación la lleva el servidor. Cada publicación y red es
// una fila de `publicaciones_programadas`, y el cron de cada minuto
// (`scheduled` en worker/index.js) procesa lo que ya toca.
//
// PUBLICAR EN INSTAGRAM SON VARIOS PASOS, Y NO CABEN EN UNA VUELTA
//
//   1. Crear el contenedor (Meta DESCARGA el medio de una URL pública).
//   2. Esperar a que esté listo: una foto tarda segundos; un reel, minutos.
//   3. Publicarlo. 4. Pedir el enlace y poner el primer comentario.
//
// Cada paso guarda su avance en la fila, así que una vuelta puede dejarlo
// a medias y la siguiente sigue donde quedó. Lo único que NUNCA se repite
// es el paso 3: el id publicado se guarda en cuanto Meta lo devuelve, y a
// partir de ahí un fallo ya no reintenta la publicación —sería un
// duplicado en el perfil del cliente—.
//
// DOS VUELTAS A LA VEZ
//
// El cron corre cada minuto y un reel puede tardar más. Antes de tocar
// una fila se RESERVA: se actualiza con su `updated_at` como condición, y
// si otra vuelta la tomó entre medias, no cambia ninguna fila y ésta se
// retira.
// ============================================================

import { crearAcceso, colaPendiente } from "./acceso.js";
import { difundir } from "./vivo.js";
import { uuid, ahora } from "./ids.js";
import { ErrorMeta, graph, mensajeMeta, descifrarMeta, urlMedioPublico, urlGraphVideo } from "./meta.js";
import { ErrorTikTok, mensajeTikTok, tokenTikTok, iniciarSubida, subirTrozos, estadoSubida } from "./tiktok.js";
import {
  REDES, revisarPublicacion, mediosDe, textoPara, primerComentario, destinoInstagram,
  esJPEG, piezasDe, publicacionDeVariante, momentoDeVariante, mediosParaRed, colaboradoresDe, conHistoria,
} from "../../src/lib/publicacion.js";
import { tipoAprobacion } from "../../src/lib/aprobacion.js";
import { avisarFallo } from "./equipo.js";

/** Un error que es de lo que se pidió, no del servidor: se enseña tal cual. */
export class ErrorPublicar extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorPublicar";
  }
}

const EN_COLA = ["programada", "procesando"];
const MAX_INTENTOS = 5;
const ESPERAS_MIN = [1, 3, 10, 30, 60];
/** Lo que una vuelta del cron dedica a una publicación antes de dejarla para la siguiente. */
const PRESUPUESTO_MS = 25_000;
const FIRMA_SISTEMA = { userId: "sistema", nombre: "Publicación", color: "#1E90FF" };

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};
const dentroDe = (ms) => new Date(Date.now() + ms).toISOString();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** La publicación y su fecha dentro de los días de un calendario. */
export function buscarPublicacion(days, postId) {
  for (const dia of days ?? []) {
    for (const p of dia?.posts ?? []) if (p?.id === postId) return { post: p, fecha: dia.date };
  }
  return null;
}

/** Lo que ve el navegador de una fila: sin tokens ni la copia de la publicación. */
export function filaPublica(f) {
  const carga = leerJSON(f.carga, {});
  return {
    id: f.id,
    clientId: f.client_id,
    calendarId: f.calendar_id,
    postId: f.post_id,
    red: f.red,
    variante: f.variante ?? "post",
    cuentaId: f.cuenta_id,
    programadaPara: f.programada_para,
    estado: f.estado,
    intentos: f.intentos,
    enlace: f.enlace ?? "",
    error: f.error ?? "",
    aviso: carga.aviso ?? "",
    publicadaAt: f.publicada_at ?? null,
    ahoraMismo: Boolean(carga.ahoraMismo),
  };
}

/**
 * La fila con lo justo de su publicación para reconocerla fuera del
 * calendario —la página Programación mezcla todos los clientes—: título,
 * formato y la primera imagen de lo que sale en ESA pieza.
 */
export function filaConResumen(f) {
  const post = leerJSON(f.carga, {}).post ?? {};
  const variante = f.variante ?? "post";
  const imagen = mediosParaRed(post, f.red, variante).find((m) => m.tipo === "imagen");
  const texto = post.title || post.idea || post.descripcion || post.script || "";
  return {
    ...filaPublica(f),
    titulo: String(texto).replace(/\s+/g, " ").trim().slice(0, 140),
    formato: variante === "historia" ? "historia" : post.format ?? "post",
    miniatura: imagen?.src?.startsWith("/api/media/") ? imagen.src : "",
    hora: post.publishTime ?? "",
  };
}

// ------------------------------------------------------------
// Programar
// ------------------------------------------------------------

/**
 * Pone una publicación en la cola para cada red. Valida con las MISMAS
 * reglas que el panel (`revisarPublicacion`), exige una cuenta asignada
 * al cliente por red y sustituye lo que hubiera programado antes.
 *
 * `soloPosibles`: para la programación automática al aprobar, que se
 * salta las redes sin cuenta en vez de fallar entera.
 */
export async function programar(env, acceso, { calendarId, postId, redes = null, ahoraMismo = false, usuarioId = null, soloPosibles = false }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) throw new ErrorPublicar("Ese calendario no existe.");
  const hallada = buscarPublicacion(leerJSON(cal.days, []), postId);
  if (!hallada) throw new ErrorPublicar("La publicación ya no está en el calendario.");
  const [cuentas, meta, previas] = await Promise.all([
    acceso.leer("cuentas_sociales", { client_id: cal.client_id }),
    acceso.leerUno("integracion_meta", { id: acceso.ownerId }),
    acceso.leer("publicaciones_programadas", { calendar_id: calendarId, post_id: postId }),
  ]);
  const plan = planificar({ ...hallada, cal, cuentas, hayMeta: Boolean(meta), previas, redes, ahoraMismo, usuarioId, soloPosibles });
  await acceso.guardarVarios("publicaciones_programadas", [...plan.cancelar, ...plan.nuevas]);
  return plan.nuevas;
}

/**
 * «Programar todo lo aprobado» de un calendario: las mismas reglas que
 * `programar`, pero leyendo UNA vez lo que es común —calendario, cuentas,
 * Meta, la cola del calendario— y escribiendo en UN lote. Uno a uno, un
 * mes de veinte publicaciones pasaría de las 50 consultas por invocación
 * del plan gratuito. Lo que no se puede programar no para a lo demás:
 * vuelve con su motivo.
 */
export async function programarLote(env, acceso, { calendarId, postIds = [], usuarioId = null }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) throw new ErrorPublicar("Ese calendario no existe.");
  const [cuentas, meta, cola] = await Promise.all([
    acceso.leer("cuentas_sociales", { client_id: cal.client_id }),
    acceso.leerUno("integracion_meta", { id: acceso.ownerId }),
    acceso.leer("publicaciones_programadas", { calendar_id: calendarId }),
  ]);
  const days = leerJSON(cal.days, []);
  const nuevas = [];
  const cancelar = [];
  const fallidas = [];
  for (const postId of [...new Set(postIds.map(String))].slice(0, 100)) {
    const hallada = buscarPublicacion(days, postId);
    if (!hallada) { fallidas.push({ postId, motivo: "La publicación ya no está en el calendario." }); continue; }
    try {
      const previas = cola.filter((f) => f.post_id === postId);
      const plan = planificar({ ...hallada, cal, cuentas, hayMeta: Boolean(meta), previas, usuarioId, soloPosibles: true });
      nuevas.push(...plan.nuevas);
      cancelar.push(...plan.cancelar);
    } catch (e) {
      if (!(e instanceof ErrorPublicar)) throw e;
      fallidas.push({ postId, motivo: e.message });
    }
  }
  await acceso.guardarVarios("publicaciones_programadas", [...cancelar, ...nuevas]);
  return { nuevas, fallidas };
}

/**
 * Qué filas crear y cuáles sustituir para una publicación. Sin E/S: lo
 * que necesita se le da leído, para que programar una y programar muchas
 * apliquen exactamente las mismas reglas.
 */
function planificar({ post, fecha, cal, cuentas: todas, hayMeta, previas, redes = null, ahoraMismo = false, usuarioId = null, soloPosibles = false }) {
  const postId = post.id;
  const calendarId = cal.id;
  // Marcada para publicarla a mano (música, stickers…): si saliera sola,
  // saldría sin lo que sólo se pone desde el teléfono.
  if (post.asistida) throw new ErrorPublicar("Está marcada para publicarla a mano desde el teléfono: no se programa sola.");
  let lista = [...new Set(redes?.length ? redes : post.redes?.length ? post.redes : ["instagram"])].filter((r) => r in REDES);
  const cuentas = {};
  for (const red of lista) {
    const cuenta = todas.find((c) => c.red === red);
    if (cuenta) cuentas[red] = cuenta;
    else if (!soloPosibles) {
      throw new ErrorPublicar(`Este cliente no tiene una cuenta de ${REDES[red].nombre} asignada. Asígnala en Ajustes → Integraciones.`);
    }
  }
  lista = lista.filter((r) => cuentas[r]);
  if (!lista.length) throw new ErrorPublicar("El cliente no tiene asignada ninguna cuenta de las redes de esta publicación.");

  const { errores } = revisarPublicacion(post, lista);
  if (errores.length) throw new ErrorPublicar(errores.join(" "));
  const piezas = piezasDe(post, lista);
  if (lista.includes("instagram") && piezas.some((p) => p.red === "instagram" &&
    mediosParaRed(post, "instagram", p.variante).some((m) => m.tipo === "imagen" && !esJPEG(m.src)))) {
    throw new ErrorPublicar("Instagram sólo acepta imágenes JPEG. Programa desde el panel de la publicación: allí se convierten solas.");
  }
  if (lista.includes("tiktok") && !mediosDe(post).some((m) => m.tipo === "video" && m.src.startsWith("/api/media/clientes/"))) {
    throw new ErrorPublicar("Para TikTok, el video tiene que estar subido a la publicación (desde el equipo o desde Drive).");
  }
  if ((lista.includes("instagram") || lista.includes("facebook")) && !hayMeta) {
    throw new ErrorPublicar("Meta no está conectado. Conéctalo en Ajustes → Integraciones.");
  }

  const cuandoDe = (variante) => (ahoraMismo
    ? new Date(Date.now() + (variante === "historia" ? retrasoAhora(post) : 0)).toJSON()
    : momentoDeVariante(fecha, post.publishTime, post, variante));
  if (!cuandoDe("post")) throw new ErrorPublicar("La publicación no tiene una fecha válida.");
  if (!ahoraMismo && Date.parse(cuandoDe("post")) < Date.now() - 60_000) {
    throw new ErrorPublicar("Esa fecha y hora ya pasaron. Cámbiala o usa «Publicar ahora».");
  }

  // Lo que ya salió o se está publicando no se vuelve a meter: se
  // programa lo demás. Si no queda nada, se dice.
  const deLaPieza = (f, p) => f.red === p.red && (f.variante ?? "post") === p.variante;
  const pendientes = piezas.filter((p) => !previas.some((f) => deLaPieza(f, p) && (f.estado === "procesando" || f.estado === "publicada")));
  if (!pendientes.length) {
    throw new ErrorPublicar(`Esta publicación ya salió (o está saliendo) en ${lista.map((r) => REDES[r].nombre).join(" y ")}.`);
  }

  const nuevas = [];
  const cancelar = [];
  for (const p of pendientes) {
    // Lo programado antes para la misma pieza se sustituye: una fila viva
    // por publicación, red y variante, o saldría dos veces.
    for (const f of previas.filter((x) => deLaPieza(x, p) && (x.estado === "programada" || x.estado === "error"))) {
      cancelar.push({ ...f, estado: "cancelada", updated_at: ahora() });
    }
    nuevas.push({
      id: uuid(), client_id: cal.client_id, calendar_id: calendarId, post_id: postId, red: p.red, variante: p.variante,
      cuenta_id: cuentas[p.red].id, programada_para: cuandoDe(p.variante), estado: "programada", intentos: 0,
      siguiente_intento: null, carga: JSON.stringify({ ahoraMismo, post }), creado_por: usuarioId,
      created_at: ahora(), updated_at: ahora(),
    });
  }
  return { nuevas, cancelar };
}

/** «Publicar ahora» con historia: la historia sale a los minutos pedidos, pero como mucho a los 5. */
const retrasoAhora = (post) => Math.min(Number(post?.historiaRetraso ?? 5), 5) * 60_000;

/** Saca de la cola lo que aún no salió de una publicación (el cliente pidió cambios, por ejemplo). */
export async function cancelarPendientes(acceso, calendarId, postId, motivo) {
  const filas = await acceso.leer("publicaciones_programadas", { calendar_id: calendarId, post_id: postId, estado: "programada" });
  for (const f of filas) {
    if (f.contenedor_id) continue;
    await acceso.actualizar("publicaciones_programadas", { id: f.id, updated_at: f.updated_at }, {
      estado: "cancelada", error: motivo, updated_at: ahora(),
    });
  }
  return filas.length;
}

/**
 * Después de guardar un calendario: si se movió de día o de hora algo
 * programado, la cola se mueve con ello; si se quitó, se cancela. Lo que
 * ya empezó a publicarse no se toca.
 */
export async function resincronizarCalendario(env, acceso, cal, por) {
  const filas = await acceso.leer("publicaciones_programadas", { calendar_id: cal.id, estado: "programada" });
  if (!filas.length) return 0;
  const days = leerJSON(cal.days, []);
  let cambios = 0;
  for (const f of filas) {
    const carga = leerJSON(f.carga, {});
    if (f.contenedor_id || f.intentos > 0 || carga.ahoraMismo) continue;
    const hallada = buscarPublicacion(days, f.post_id);
    const variante = f.variante ?? "post";
    const motivo = !hallada ? "Se quitó del calendario."
      : hallada.post.redes?.length && !hallada.post.redes.includes(f.red) ? "Se quitó esta red de la publicación."
        : variante === "historia" && !conHistoria(hallada.post) ? "Se quitó la historia de la publicación."
          : null;
    if (motivo) {
      await acceso.actualizar("publicaciones_programadas", { id: f.id, updated_at: f.updated_at }, {
        estado: "cancelada", error: motivo, updated_at: ahora(),
      });
      cambios += 1;
      continue;
    }
    const cuando = momentoDeVariante(hallada.fecha, hallada.post.publishTime, hallada.post, variante);
    if (cuando && cuando !== f.programada_para) {
      await acceso.actualizar("publicaciones_programadas", { id: f.id, updated_at: f.updated_at }, {
        programada_para: cuando, updated_at: ahora(),
      });
      cambios += 1;
    }
  }
  if (cambios) difundir(env, acceso.ownerId, { tipo: "publicacion", calId: cal.id, por });
  return cambios;
}

/**
 * «Programar al aprobar»: cuando el cliente aprueba y el calendario lo
 * tiene encendido, la publicación entra sola en la cola, a su día y hora.
 * Viene APAGADO: lo normal es que lo aprobado espere en «Por programar» a
 * que alguien de la agencia dé el paso final. Y aun encendido, sólo la
 * PIEZA FINAL: aprobar una idea no es aprobar lo que se publica.
 * Lo que no se pueda programar se avisa al equipo; no se calla.
 */
export async function programarAlAprobar(env, ownerId, calendarId, postId) {
  const acceso = crearAcceso(env.DB, ownerId);
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!leerJSON(cal?.opciones, {})?.programarAlAprobar) return null;
  const hallada = buscarPublicacion(leerJSON(cal.days, []), postId);
  if (!hallada || tipoAprobacion(hallada.post) !== "pieza") return null;
  try {
    const filas = await programar(env, acceso, { calendarId, postId, soloPosibles: true });
    difundir(env, ownerId, { tipo: "publicacion", calId: calendarId, postId, por: FIRMA_SISTEMA });
    return filas;
  } catch (e) {
    difundir(env, ownerId, {
      tipo: "publicacion", calId: calendarId, postId, por: FIRMA_SISTEMA,
      aviso: `El cliente la aprobó, pero no se pudo programar: ${e.message}`,
    });
    return null;
  }
}

// ------------------------------------------------------------
// Procesar la cola
// ------------------------------------------------------------

/**
 * Una vuelta del cron: lo que ya toca, en orden. Pocas por vuelta a
 * propósito: el plan gratuito de Workers admite 50 consultas a D1 y 50
 * peticiones de salida por invocación, y cada publicación gasta unas
 * diez de cada. Con el cron cada minuto, tres por minuto sobra.
 */
export async function procesarCola(env, limite = 3) {
  const filas = await colaPendiente(env.DB, ahora(), limite);
  for (const f of filas) {
    try { await procesarPublicacion(env, f); } catch (e) { console.error("cola de publicación:", e); }
  }
  return filas.length;
}

/** La dirección que Meta descarga: firmada si es de R2; una antigua incrustada no se puede. */
async function urlDe(env, origen, src) {
  if (typeof src !== "string" || !src) throw new ErrorPublicar("Falta el archivo de la publicación.");
  if (src.startsWith("/api/media/")) return urlMedioPublico(env, origen, src);
  if (/^https:\/\//.test(src)) return src;
  throw new ErrorPublicar("Esta imagen es de las antiguas, guardadas dentro del calendario. Vuelve a añadirla a la publicación.");
}

export async function procesarPublicacion(env, { id, owner_id: ownerId }) {
  const acceso = crearAcceso(env.DB, ownerId);
  let fila = await acceso.leerUno("publicaciones_programadas", { id });
  if (!fila || !EN_COLA.includes(fila.estado)) return null;

  // Reservarla. Ver «DOS VUELTAS A LA VEZ» en la cabecera.
  const marca = ahora();
  const tomada = await acceso.actualizar("publicaciones_programadas", { id, updated_at: fila.updated_at }, {
    estado: "procesando", siguiente_intento: dentroDe(5 * 60_000), updated_at: marca,
  });
  if (!tomada) return null;
  fila = { ...fila, estado: "procesando", updated_at: marca };
  const carga = leerJSON(fila.carga, {});

  const guardar = async (cambios = {}) => {
    const t = ahora();
    await acceso.actualizar("publicaciones_programadas", { id }, { ...cambios, carga: JSON.stringify(carga), updated_at: t });
    fila = { ...fila, ...cambios, updated_at: t };
  };
  const avisar = () => difundir(env, ownerId, {
    tipo: "publicacion", calId: fila.calendar_id, postId: fila.post_id, red: fila.red, variante: fila.variante ?? "post",
    estado: fila.estado, por: FIRMA_SISTEMA,
  });

  try {
    // Antes del primer paso se relee la publicación: lo que sale es lo
    // que hay AHORA en el calendario, no lo que había al programar.
    if (!fila.contenedor_id && !carga.hijos && !fila.externo_id && fila.calendar_id) {
      const cal = await acceso.leerUno("calendars", { id: fila.calendar_id });
      const hallada = cal && buscarPublicacion(leerJSON(cal.days, []), fila.post_id);
      if (cal && !hallada) {
        await guardar({ estado: "cancelada", error: "Se quitó del calendario.", siguiente_intento: null });
        avisar();
        return fila;
      }
      if (hallada) carga.post = hallada.post;
      if ((fila.variante ?? "post") === "historia" && !conHistoria(carga.post)) {
        await guardar({ estado: "cancelada", error: "Se quitó la historia de la publicación.", siguiente_intento: null });
        avisar();
        return fila;
      }
      const { errores } = revisarPublicacion(publicacionDeVariante(carga.post, fila.variante), [fila.red]);
      if (errores.length) throw new ErrorPublicar(errores.join(" "));
    }

    const cuenta = fila.cuenta_id ? await acceso.leerUno("cuentas_sociales", { id: fila.cuenta_id }) : null;
    if (!cuenta?.token_cifrado) throw new ErrorPublicar("La cuenta de destino ya no está conectada. Revísala en Ajustes → Integraciones.");
    let token;
    let origen = "";
    if (fila.red === "tiktok") {
      token = await tokenTikTok(env, acceso, cuenta);
    } else {
      const meta = await acceso.leerUno("integracion_meta", { id: ownerId });
      if (!meta) throw new ErrorPublicar("Meta no está conectado. Conéctalo en Ajustes → Integraciones.");
      token = await descifrarMeta(env, cuenta.token_cifrado);
      origen = meta.origen;
    }
    const paso = { instagram: pasoInstagram, facebook: pasoFacebook, tiktok: pasoTikTok }[fila.red];
    if (!paso) throw new ErrorPublicar(`Publicar en ${REDES[fila.red]?.nombre ?? fila.red} todavía no está disponible.`);

    const contexto = { cuenta, token, origen, carga, guardar, fila: () => fila };
    const inicio = Date.now();
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const r = await paso(env, contexto);
      if (r.hecho) {
        await guardar({ estado: "publicada", error: null, siguiente_intento: null, publicada_at: fila.publicada_at ?? ahora() });
        break;
      }
      const espera = r.esperar ?? 0;
      if (espera > 6000 || Date.now() - inicio + espera > PRESUPUESTO_MS) {
        await guardar({ siguiente_intento: dentroDe(espera) });
        break;
      }
      await dormir(espera);
    }
  } catch (e) {
    const intentos = (fila.intentos ?? 0) + 1;
    const mensaje = e instanceof ErrorPublicar ? e.message : e instanceof ErrorTikTok ? mensajeTikTok(e) : mensajeMeta(e);
    const parcial = carga.tanda?.ids?.length ?? 0;
    if (fila.externo_id) {
      // Ya salió. Lo que falló es lo de después: no se vuelve a publicar.
      carga.aviso = `Se publicó, pero después: ${mensaje}`;
      await guardar({ estado: "publicada", siguiente_intento: null, publicada_at: fila.publicada_at ?? ahora() });
    } else if (parcial && !((e instanceof ErrorMeta || e instanceof ErrorTikTok) && e.transitorio && intentos < MAX_INTENTOS)) {
      // Una tanda de historias a medias: las que salieron, salieron. No se
      // repiten; se dice cuántas faltaron.
      carga.aviso = `Salieron ${parcial} de ${carga.tanda.total} historias; el resto falló: ${mensaje}`;
      await guardar({ estado: "publicada", externo_id: carga.tanda.ids[0], siguiente_intento: null, publicada_at: ahora() });
    } else if ((e instanceof ErrorMeta || e instanceof ErrorTikTok) && e.transitorio && intentos < MAX_INTENTOS) {
      await guardar({
        intentos, error: mensaje,
        estado: fila.contenedor_id || carga.hijos || carga.tanda ? "procesando" : "programada",
        siguiente_intento: dentroDe(ESPERAS_MIN[intentos - 1] * 60_000),
      });
    } else {
      if (!(e instanceof ErrorPublicar)) console.error("publicar:", e);
      await guardar({ intentos, estado: "error", error: mensaje, siguiente_intento: null });
      // A la bandeja de quien la lleva: el cron publica sin nadie delante.
      await avisarFallo(env, acceso, fila, mensaje);
    }
  }
  avisar();
  return fila;
}

// ------------------------------------------------------------
// Instagram
// ------------------------------------------------------------

async function estadoContenedor(env, token, id) {
  const c = await graph(env, token, `/${id}`, { params: { fields: "status_code,status" } });
  return { codigo: c.status_code ?? "FINISHED", detalle: c.status ?? "" };
}

/**
 * Una tanda de historias, una tras otra (Instagram y Facebook publican
 * las historias de una en una). El avance vive en `carga.tanda`: cuántas
 * salieron y sus ids. Una historia que ya salió no se repite nunca, y una
 * tanda que falla a medias queda «publicada» con cuántas faltaron.
 */
async function pasoTanda({ carga, guardar }, medios, { crear, listo = null, publicar }) {
  carga.tanda ??= { i: 0, ids: [], total: medios.length };
  const t = carga.tanda;
  if (t.i >= medios.length) {
    await guardar({ externo_id: t.ids[0] ?? "historia", publicada_at: ahora() });
    return { hecho: true };
  }
  const m = medios[t.i];
  if (!t.contenedor) {
    t.contenedor = await crear(m);
    await guardar({});
    return { esperar: m.tipo === "video" ? 20_000 : 0 };
  }
  if (listo) {
    const estado = await listo(t.contenedor);
    if (estado === "espera") return { esperar: 20_000 };
    if (estado === "error") {
      delete t.contenedor;
      await guardar({});
      throw new ErrorMeta({ message: `No se pudo procesar la historia ${t.i + 1}.`, is_transient: true }, 400);
    }
  }
  const id = await publicar(t.contenedor, m);
  t.ids.push(String(id));
  t.i += 1;
  delete t.contenedor;
  await guardar({});
  return { esperar: 0 };
}

async function pasoInstagram(env, { cuenta, token, origen, carga, guardar, fila: actual }) {
  const fila = actual();
  const ig = cuenta.externo_id;
  const post = publicacionDeVariante(carga.post ?? {}, fila.variante);
  const destino = destinoInstagram(post);
  const medios = mediosParaRed(carga.post ?? {}, "instagram", fila.variante);
  const url = (src) => urlDe(env, origen, src);
  const texto = textoPara(post, "instagram");
  // Hasta 3 cuentas públicas; el invitado acepta desde su app.
  const colab = colaboradoresDe(post);
  const conColab = colab.length && destino !== "historia" ? { collaborators: JSON.stringify(colab.slice(0, 3)) } : {};
  // Texto alternativo para lectores de pantalla (sólo imágenes del feed).
  const conAlt = post.altTexto?.trim() ? { alt_text: post.altTexto.trim().slice(0, 1000) } : {};

  // Historias: una tras otra, con su propio avance.
  if (destino === "historia") {
    if (fila.externo_id) return { hecho: true };
    return pasoTanda({ carga, guardar }, medios.slice(0, 10), {
      crear: async (m) => (await graph(env, token, `/${ig}/media`, {
        metodo: "POST",
        params: m.tipo === "video" ? { media_type: "STORIES", video_url: await url(m.src) } : { media_type: "STORIES", image_url: await url(m.src) },
      })).id,
      listo: async (id) => {
        const { codigo } = await estadoContenedor(env, token, id);
        return codigo === "IN_PROGRESS" ? "espera" : codigo === "ERROR" || codigo === "EXPIRED" ? "error" : "ok";
      },
      publicar: async (id) => (await graph(env, token, `/${ig}/media_publish`, { metodo: "POST", params: { creation_id: id } })).id,
    });
  }

  // 4. Ya publicada: el enlace y el primer comentario, sin reintentar nada.
  if (fila.externo_id) {
    if (!fila.enlace) {
      try {
        const m = await graph(env, token, `/${fila.externo_id}`, { params: { fields: "permalink" } });
        await guardar({ enlace: m.permalink ?? "" });
      } catch { /* sin enlace, pero publicada */ }
    }
    const comentario = primerComentario(post);
    if (comentario && destino !== "historia" && !carga.comentado) {
      try {
        await graph(env, token, `/${fila.externo_id}/comments`, { metodo: "POST", params: { message: comentario } });
        carga.comentado = true;
      } catch (e) {
        carga.aviso = `Se publicó, pero no se pudo poner el primer comentario: ${mensajeMeta(e)}`;
      }
    }
    return { hecho: true };
  }

  // 2 y 3. El contenedor existe: esperar a que Meta lo tenga y publicarlo.
  if (fila.contenedor_id) {
    const { codigo, detalle } = await estadoContenedor(env, token, fila.contenedor_id);
    if (codigo === "IN_PROGRESS") return { esperar: destino === "imagen" ? 3000 : 20_000 };
    if (codigo === "PUBLISHED") {
      carga.aviso = "Instagram ya la tenía publicada; revisa el perfil para el enlace.";
      await guardar({ externo_id: fila.contenedor_id, publicada_at: ahora() });
      return { hecho: true };
    }
    if (codigo === "ERROR" || codigo === "EXPIRED") {
      // Se vuelve a crear en el siguiente intento: casi siempre es una
      // descarga que falló o un contenedor que caducó (24 h).
      delete carga.hijos;
      await guardar({ contenedor_id: null });
      throw new ErrorMeta({ message: `Instagram no pudo procesar el archivo (${detalle || codigo}).`, is_transient: (fila.intentos ?? 0) < 1 }, 400);
    }
    const r = await graph(env, token, `/${ig}/media_publish`, { metodo: "POST", params: { creation_id: fila.contenedor_id } });
    // Lo primero, antes de cualquier otra cosa: a partir de aquí un fallo
    // no puede volver a publicar.
    await guardar({ externo_id: r.id, publicada_at: ahora() });
    return { esperar: 0 };
  }

  // 1b. Carrusel: primero cada elemento, luego el conjunto.
  if (destino === "carrusel") {
    if (!carga.hijos) {
      const hijos = [];
      for (const m of medios.slice(0, 10)) {
        const params = m.tipo === "video"
          ? { media_type: "VIDEO", video_url: await url(m.src), is_carousel_item: true }
          : { image_url: await url(m.src), is_carousel_item: true, ...conAlt };
        hijos.push((await graph(env, token, `/${ig}/media`, { metodo: "POST", params })).id);
      }
      carga.hijos = hijos;
      await guardar({});
      return { esperar: medios.some((m) => m.tipo === "video") ? 20_000 : 0 };
    }
    for (const h of carga.hijos) {
      const { codigo, detalle } = await estadoContenedor(env, token, h);
      if (codigo === "IN_PROGRESS") return { esperar: 20_000 };
      if (codigo === "ERROR" || codigo === "EXPIRED") {
        delete carga.hijos;
        await guardar({});
        throw new ErrorMeta({ message: `Instagram no pudo procesar un elemento del carrusel (${detalle || codigo}).`, is_transient: (fila.intentos ?? 0) < 1 }, 400);
      }
    }
    const padre = await graph(env, token, `/${ig}/media`, {
      metodo: "POST", params: { media_type: "CAROUSEL", children: carga.hijos.join(","), caption: texto, ...conColab },
    });
    await guardar({ contenedor_id: padre.id });
    return { esperar: 0 };
  }

  // 1. El contenedor de un solo elemento.
  const primero = medios[0];
  let params;
  if (destino === "reel") {
    const video = medios.find((m) => m.tipo === "video");
    params = {
      media_type: "REELS", video_url: await url(video.src), caption: texto, share_to_feed: true, ...conColab,
      ...(post.audioNombre?.trim() ? { audio_name: post.audioNombre.trim().slice(0, 100) } : {}),
      ...(post.portada && !/\.(mp4|mov|m4v|webm)/i.test(post.portada) ? { cover_url: await url(post.portada) } : {}),
    };
  } else {
    params = { image_url: await url(primero.src), caption: texto, ...conColab, ...conAlt };
  }
  const c = await graph(env, token, `/${ig}/media`, { metodo: "POST", params });
  await guardar({ contenedor_id: c.id });
  // Una foto suele estar lista al momento: se mira ya, y si no, en 3 s.
  return { esperar: primero.tipo === "video" || destino === "reel" ? 20_000 : 0 };
}

// ------------------------------------------------------------
// Facebook
// ------------------------------------------------------------

async function pasoFacebook(env, { cuenta, token, origen, carga, guardar, fila: actual }) {
  const fila = actual();
  if (fila.externo_id) return { hecho: true };
  const pagina = cuenta.externo_id;
  const post = publicacionDeVariante(carga.post ?? {}, fila.variante);
  const texto = textoPara(post, "facebook");
  const medios = mediosParaRed(carga.post ?? {}, "facebook", fila.variante);

  // Historias de la página: foto (se sube sin publicar y se publica como
  // historia) o video (subida en tres fases: empezar, subir, terminar).
  if (post.format === "historia") {
    return pasoTanda({ carga, guardar }, medios.slice(0, 10), {
      crear: async (m) => {
        if (m.tipo !== "video") {
          const f = await graph(env, token, `/${pagina}/photos`, { metodo: "POST", params: { url: await urlDe(env, origen, m.src), published: false } });
          return `foto:${f.id}`;
        }
        const inicio = await graph(env, token, `/${pagina}/video_stories`, { metodo: "POST", params: { upload_phase: "start" } });
        const r = await fetch(inicio.upload_url, {
          method: "POST",
          headers: { Authorization: `OAuth ${token}`, file_url: await urlDe(env, origen, m.src) },
        });
        if (!r.ok) throw new ErrorMeta({ message: `Facebook no pudo recibir el video de la historia (${r.status}).`, is_transient: r.status >= 500 }, r.status);
        return `video:${inicio.video_id}`;
      },
      publicar: async (contenedor) => {
        const [tipo, id] = contenedor.split(":");
        const r = tipo === "foto"
          ? await graph(env, token, `/${pagina}/photo_stories`, { metodo: "POST", params: { photo_id: id } })
          : await graph(env, token, `/${pagina}/video_stories`, { metodo: "POST", params: { upload_phase: "finish", video_id: id } });
        return r.post_id ?? r.id ?? id;
      },
    });
  }
  const video = medios.find((m) => m.tipo === "video");
  const url = (src) => urlDe(env, origen, src);

  let idPublicado;
  let enlace;
  if (video) {
    // Facebook no mezcla video y fotos: sale el video (el panel lo avisa).
    const r = await graph(env, token, `/${pagina}/videos`, {
      metodo: "POST", host: urlGraphVideo(env), params: { file_url: await url(video.src), description: texto },
    });
    idPublicado = r.id;
    enlace = `https://www.facebook.com/${pagina}/videos/${r.id}`;
  } else if (medios.length === 1) {
    const r = await graph(env, token, `/${pagina}/photos`, { metodo: "POST", params: { url: await url(medios[0].src), caption: texto } });
    idPublicado = r.post_id || r.id;
  } else if (medios.length > 1) {
    // Varias fotos: se suben sin publicar y se adjuntan a una sola entrada.
    const params = { message: texto };
    let i = 0;
    for (const m of medios.slice(0, 10)) {
      const f = await graph(env, token, `/${pagina}/photos`, { metodo: "POST", params: { url: await url(m.src), published: false } });
      params[`attached_media[${i++}]`] = JSON.stringify({ media_fbid: f.id });
    }
    idPublicado = (await graph(env, token, `/${pagina}/feed`, { metodo: "POST", params })).id;
  } else {
    idPublicado = (await graph(env, token, `/${pagina}/feed`, { metodo: "POST", params: { message: texto } })).id;
  }
  await guardar({ externo_id: idPublicado, enlace: enlace ?? `https://www.facebook.com/${idPublicado}`, publicada_at: ahora() });
  return { hecho: true };
}

// ------------------------------------------------------------
// TikTok
// ------------------------------------------------------------

/**
 * 1. Abrir la subida (bandeja o directo) y subir el video en trozos desde
 *    R2. El `publish_id` se guarda SÓLO cuando la subida terminó: a partir
 *    de ahí no se vuelve a abrir otra, que sería un segundo video.
 * 2. Esperar a que TikTok lo procese: en la bandeja del cliente
 *    (borrador) o publicado.
 */
async function pasoTikTok(env, { cuenta, token, carga, guardar, fila: actual }) {
  const fila = actual();
  const post = publicacionDeVariante(carga.post ?? {}, fila.variante);
  if (fila.externo_id) return { hecho: true };

  if (!fila.contenedor_id) {
    const video = mediosDe(post).find((m) => m.tipo === "video");
    const clave = String(video?.src ?? "").replace(/^\/api\/media\//, "");
    if (!/^clientes\/[^/]+\//.test(clave)) throw new ErrorPublicar("Para TikTok, el video tiene que estar subido a la publicación.");
    const cabeza = await env.MEDIA.head(clave);
    if (!cabeza) throw new ErrorPublicar("El video ya no está en el almacenamiento: vuelve a añadirlo a la publicación.");
    const modo = leerJSON(cuenta.datos, {})?.modo === "directo" ? "directo" : "borrador";
    const { publishId, uploadUrl, privacidad } = await iniciarSubida(token, { modo, tamano: cabeza.size, titulo: textoPara(post, "tiktok") });
    await subirTrozos(env, clave, uploadUrl, cabeza.size);
    carga.modo = modo;
    carga.privacidad = privacidad;
    await guardar({ contenedor_id: publishId });
    return { esperar: 15_000 };
  }

  const estado = await estadoSubida(token, fila.contenedor_id);
  if (estado.status === "SEND_TO_USER_INBOX") {
    carga.aviso = "Está en la bandeja de TikTok del cliente: se publica desde la app, con un toque.";
    await guardar({ externo_id: fila.contenedor_id, publicada_at: ahora() });
    return { hecho: true };
  }
  if (estado.status === "PUBLISH_COMPLETE") {
    const id = estado.publicaly_available_post_id?.[0];
    if (carga.privacidad === "SELF_ONLY") carga.aviso = "Publicada en privado: hasta que TikTok revise la app, sólo la ve la cuenta. Cámbiala a pública desde la app.";
    await guardar({
      externo_id: String(id ?? fila.contenedor_id),
      enlace: id && cuenta.usuario ? `https://www.tiktok.com/@${cuenta.usuario}/video/${id}` : "",
      publicada_at: ahora(),
    });
    return { hecho: true };
  }
  if (estado.status === "FAILED") {
    await guardar({ contenedor_id: null });
    throw new ErrorTikTok({ code: estado.fail_reason ?? "failed", message: `TikTok no pudo procesar el video (${estado.fail_reason ?? "sin motivo"}).` }, 400);
  }
  return { esperar: 20_000 };
}
