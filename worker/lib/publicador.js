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
import {
  REDES, revisarPublicacion, mediosDe, textoPara, primerComentario, destinoInstagram,
  momentoPublicacion, esJPEG,
} from "../../src/lib/publicacion.js";

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
  const { post, fecha } = hallada;

  let lista = [...new Set(redes?.length ? redes : post.redes?.length ? post.redes : ["instagram"])].filter((r) => r in REDES);
  const cuentas = {};
  for (const red of lista) {
    const cuenta = await acceso.leerUno("cuentas_sociales", { client_id: cal.client_id, red });
    if (cuenta) cuentas[red] = cuenta;
    else if (!soloPosibles) {
      throw new ErrorPublicar(`Este cliente no tiene una cuenta de ${REDES[red].nombre} asignada. Asígnala en Ajustes → Integraciones.`);
    }
  }
  lista = lista.filter((r) => cuentas[r]);
  if (!lista.length) throw new ErrorPublicar("No hay ninguna red a la que publicar.");

  const { errores } = revisarPublicacion(post, lista);
  if (errores.length) throw new ErrorPublicar(errores.join(" "));
  if (lista.includes("instagram") && mediosDe(post).some((m) => m.tipo === "imagen" && !esJPEG(m.src))) {
    throw new ErrorPublicar("Instagram sólo acepta imágenes JPEG. Programa desde el panel de la publicación: allí se convierten solas.");
  }
  if ((lista.includes("instagram") || lista.includes("facebook")) && !(await acceso.leerUno("integracion_meta", { id: acceso.ownerId }))) {
    throw new ErrorPublicar("Meta no está conectado. Conéctalo en Ajustes → Integraciones.");
  }

  const cuando = ahoraMismo ? ahora() : momentoPublicacion(fecha, post.publishTime);
  if (!cuando) throw new ErrorPublicar("La publicación no tiene una fecha válida.");
  if (!ahoraMismo && Date.parse(cuando) < Date.now() - 60_000) {
    throw new ErrorPublicar("Esa fecha y hora ya pasaron. Cámbiala o usa «Publicar ahora».");
  }

  const previas = await acceso.leer("publicaciones_programadas", { calendar_id: calendarId, post_id: postId });
  for (const red of lista) {
    const nombre = REDES[red].nombre;
    if (previas.some((f) => f.red === red && f.estado === "procesando")) throw new ErrorPublicar(`Ya se está publicando en ${nombre}.`);
    if (previas.some((f) => f.red === red && f.estado === "publicada")) throw new ErrorPublicar(`Esta publicación ya salió en ${nombre}.`);
  }

  const creadas = [];
  for (const red of lista) {
    // Lo programado antes para la misma red se sustituye: una fila viva
    // por publicación y red, o saldría dos veces.
    for (const f of previas.filter((x) => x.red === red && (x.estado === "programada" || x.estado === "error"))) {
      await acceso.actualizar("publicaciones_programadas", { id: f.id }, { estado: "cancelada", updated_at: ahora() });
    }
    const fila = {
      id: uuid(), client_id: cal.client_id, calendar_id: calendarId, post_id: postId, red,
      cuenta_id: cuentas[red].id, programada_para: cuando, estado: "programada", intentos: 0,
      siguiente_intento: null, carga: JSON.stringify({ ahoraMismo, post }), creado_por: usuarioId,
      created_at: ahora(), updated_at: ahora(),
    };
    await acceso.insertar("publicaciones_programadas", fila);
    creadas.push(fila);
  }
  return creadas;
}

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
    if (!hallada || (hallada.post.redes?.length && !hallada.post.redes.includes(f.red))) {
      await acceso.actualizar("publicaciones_programadas", { id: f.id, updated_at: f.updated_at }, {
        estado: "cancelada", error: hallada ? "Se quitó esta red de la publicación." : "Se quitó del calendario.", updated_at: ahora(),
      });
      cambios += 1;
      continue;
    }
    const cuando = momentoPublicacion(hallada.fecha, hallada.post.publishTime);
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
 * Lo que no se pueda programar se avisa al equipo; no se calla.
 */
export async function programarAlAprobar(env, ownerId, calendarId, postId) {
  const acceso = crearAcceso(env.DB, ownerId);
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!leerJSON(cal?.opciones, {})?.programarAlAprobar) return null;
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
    tipo: "publicacion", calId: fila.calendar_id, postId: fila.post_id, red: fila.red, estado: fila.estado, por: FIRMA_SISTEMA,
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
      const { errores } = revisarPublicacion(carga.post, [fila.red]);
      if (errores.length) throw new ErrorPublicar(errores.join(" "));
    }

    const cuenta = fila.cuenta_id ? await acceso.leerUno("cuentas_sociales", { id: fila.cuenta_id }) : null;
    if (!cuenta?.token_cifrado) throw new ErrorPublicar("La cuenta de destino ya no está conectada. Revísala en Ajustes → Integraciones.");
    const meta = await acceso.leerUno("integracion_meta", { id: ownerId });
    if (!meta) throw new ErrorPublicar("Meta no está conectado. Conéctalo en Ajustes → Integraciones.");
    const token = await descifrarMeta(env, cuenta.token_cifrado);
    const paso = fila.red === "instagram" ? pasoInstagram : fila.red === "facebook" ? pasoFacebook : null;
    if (!paso) throw new ErrorPublicar(`Publicar en ${REDES[fila.red]?.nombre ?? fila.red} todavía no está disponible.`);

    const contexto = { cuenta, token, origen: meta.origen, carga, guardar, fila: () => fila };
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
    const mensaje = e instanceof ErrorPublicar ? e.message : mensajeMeta(e);
    if (fila.externo_id) {
      // Ya salió. Lo que falló es lo de después: no se vuelve a publicar.
      carga.aviso = `Se publicó, pero después: ${mensaje}`;
      await guardar({ estado: "publicada", siguiente_intento: null, publicada_at: fila.publicada_at ?? ahora() });
    } else if (e instanceof ErrorMeta && e.transitorio && intentos < MAX_INTENTOS) {
      await guardar({
        intentos, error: mensaje,
        estado: fila.contenedor_id || carga.hijos ? "procesando" : "programada",
        siguiente_intento: dentroDe(ESPERAS_MIN[intentos - 1] * 60_000),
      });
    } else {
      if (!(e instanceof ErrorPublicar)) console.error("publicar:", e);
      await guardar({ intentos, estado: "error", error: mensaje, siguiente_intento: null });
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

async function pasoInstagram(env, { cuenta, token, origen, carga, guardar, fila: actual }) {
  const fila = actual();
  const ig = cuenta.externo_id;
  const post = carga.post ?? {};
  const destino = destinoInstagram(post);
  const medios = mediosDe(post);
  const url = (src) => urlDe(env, origen, src);
  const texto = textoPara(post, "instagram");

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
          : { image_url: await url(m.src), is_carousel_item: true };
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
      metodo: "POST", params: { media_type: "CAROUSEL", children: carga.hijos.join(","), caption: texto },
    });
    await guardar({ contenedor_id: padre.id });
    return { esperar: 0 };
  }

  // 1. El contenedor de un solo elemento.
  const primero = medios[0];
  let params;
  if (destino === "historia") {
    params = primero.tipo === "video"
      ? { media_type: "STORIES", video_url: await url(primero.src) }
      : { media_type: "STORIES", image_url: await url(primero.src) };
  } else if (destino === "reel") {
    const video = medios.find((m) => m.tipo === "video");
    params = {
      media_type: "REELS", video_url: await url(video.src), caption: texto, share_to_feed: true,
      ...(post.portada && !/\.(mp4|mov|m4v|webm)/i.test(post.portada) ? { cover_url: await url(post.portada) } : {}),
    };
  } else {
    params = { image_url: await url(primero.src), caption: texto };
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
  const post = carga.post ?? {};
  const texto = textoPara(post, "facebook");
  const medios = mediosDe(post);
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
