// ============================================================
// La VOZ del video animado: las voces, la muestra y la locución, como TRABAJOS del Estudio
//
// Lo puro (modelos, voces, costo, los tiempos de cada palabra) vive en src/lib/voces.js; aquí lo que toca la base,
// R2 y Kie. Cada toma es un trabajo de `estudio_trabajos` con `tipo: "audio"`: va por la MISMA cola que un video de
// Kie (enviar una vez, mirar, bajar), lo avanza la bomba del espacio aunque nadie mire, y su costo se apunta al
// ENTREGARLO. `trabajos.js` llama a `terminarAudio` cuando Kie lo tiene listo.
//
// LA VOZ SIEMPRE SE CONFIRMA (decisión de la agencia): toda toma pagada —la locución y la muestra de una voz—
// contesta 409 `confirmar` con el costo exacto hasta que llega `confirmado: true`, aunque cueste centavos. El
// asistente y Claude por MCP tampoco se lo saltan: la herramienta no lo da por su cuenta.
//
// LA MUESTRA DE UNA VOZ SE PAGA UNA VEZ para toda la agencia: queda en R2 bajo `voces/elevenlabs/…` (no bajo
// `clientes/`, que la ruta de medios serviría y borraría por cliente) y la siguiente vez sale gratis.
//
// LA LOCUCIÓN SÓLO DEL GUION APROBADO (`puedeGenerarVoz`): con la versión que se aprobó. Al terminar se guarda en el
// proyecto (`videos_proyectos.locucion`) con los tiempos de cada palabra (src/lib/voces.js: los del motor, los de la
// verificación posterior con Gemini o los estimados sobre la duración real) y el proyecto pasa a «Con voz» si nadie
// cambió el guion entretanto. El audio se apunta en `estudio_archivos` (tipo «audio»: la galería no lo enseña).
// ============================================================

import { uuid } from "../ids.js";
import { difundir } from "../vivo.js";
import { despertar } from "../despertar.js";
import { bloqueoPorPresupuesto, registrarConsumoFijo } from "../configIA.js";
import { verVideo } from "../geminiVideo.js";
import { MOTORES } from "./motores.js";
import { abrirDescarga, guardarDescarga } from "./descarga.js";
import { claveDeArchivo } from "./archivos.js";
import { kitDe } from "./kit.js";
import { validarGuion, puedeGenerarVoz, puedePasar, NOMBRE_ESTADO_VIDEO } from "../../../src/lib/videoEscenas.js";
import {
  MODELOS_VOZ, modeloDeVoz, limpiarLocucion, vocesDisponibles, vozPorId, VOCES_DE_SERIE, textoParaVoz, costoDeVoz,
  fraseDeMuestra, problemaDelTexto, palabrasDelResultado, tiemposDeLocucion, duracionMp3,
  PEDIDO_TRANSCRIPCION_TIEMPOS, leerTranscripcionConTiempos, COINCIDENCIA_MINIMA, MODELO_VOZ_POR_DEFECTO,
} from "../../../src/lib/voces.js";
import { textoCosto } from "../../../src/lib/estudioCatalogo.js";

/** Lo más que pesa una toma que se baja (una locución de 2 minutos en MP3 son ~2 MB). */
export const TOPE_AUDIO = 25 * 1024 * 1024;
const TIPOS_AUDIO = ["audio/mpeg", "audio/wav"];

/** Un error de lo pedido, con su estado HTTP y lo que la pantalla necesita (`codigo`, `costo`…). */
export class ErrorVoz extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    Object.assign(this, extra);
  }
}

const leerJSON = (t, def) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? def); } catch { return def; } };

/** Dónde queda la muestra de una voz: una por modelo y voz, para toda la agencia. */
export const claveDeMuestra = (modelo, vozId) => `voces/elevenlabs/${modeloDeVoz(modelo)?.clave ?? "v3"}/${vozId}.mp3`;

/**
 * Cómo se nombra la voz ante Kie: v3 por su id de ElevenLabs (el ejemplo de su documentación); v2, a las de serie
 * por su nombre (como las enumeran los servicios que lo envuelven) y a las propias por su id. NO PROBADO contra Kie:
 * si v2 quiere el id, se cambia aquí y nada más.
 */
export function vozParaKie(modelo, voz) {
  const m = modeloDeVoz(modelo);
  if (m?.clave === "v2" && !voz.propia && VOCES_DE_SERIE.some((v) => v.id === voz.id)) return voz.nombre;
  return voz.id;
}

/** La locución del kit de un cliente (voz escogida, modelo, voces propias). */
export const locucionDe = (cliente) => limpiarLocucion(kitDe(cliente)?.locucion);

/** La lista de voces de un cliente, con si su muestra ya está hecha (y entonces es gratis oírla). */
export async function listarVoces(env, cliente) {
  const loc = locucionDe(cliente);
  const voces = vocesDisponibles(loc);
  const conMuestra = await Promise.all(voces.map(async (v) => {
    const muestras = {};
    for (const clave of Object.keys(MODELOS_VOZ)) muestras[clave] = Boolean(await env.MEDIA?.head(claveDeMuestra(clave, v.id)).catch(() => null));
    return { ...v, muestras, escogida: v.id === loc.voz };
  }));
  const muestra = (clave) => costoDeVoz(clave, fraseDeMuestra(clave).length).usd;
  return {
    voces: conMuestra, voz: loc.voz, modelo: loc.modelo,
    modelos: Object.values(MODELOS_VOZ).map((m) => ({ clave: m.clave, nombre: m.nombre, creditos: m.creditos, muestra: muestra(m.clave) })),
  };
}

/** El modelo de voz del Estudio (`tipo: "audio"`) que va en la fila del trabajo. */
const modeloDelTrabajo = (clave) => MODELOS_VOZ[clave];

/**
 * Crea el trabajo de una toma. Comprueba la llave y el presupuesto; la confirmación la pide quien llama (siempre).
 * `ajustes`: la voz como se manda a Kie y lo que hace falta para terminarla (para qué es, el video y su versión).
 */
async function crearToma(env, acceso, cliente, { modelo, texto, voz, costo, ajustes, usuario = null, origen = "persona" }) {
  if (!MOTORES.kie?.activo(env)) {
    throw new ErrorVoz("La voz necesita la llave de Kie.ai (KIE_API_KEY), que este servidor no tiene. El administrador la pone como secreto del Worker.", 503, { codigo: "sin_llave" });
  }
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorVoz(bloqueo, 402, { codigo: "presupuesto" });
  const m = modeloDelTrabajo(modelo);
  const ahora = new Date().toISOString();
  const fila = await acceso.insertar("estudio_trabajos", {
    id: uuid(), client_id: cliente.id, estado: "en_cola", tipo: "audio", motor: "kie", modelo: m.id,
    prompt: texto, n: 1,
    ajustes: JSON.stringify({ ...ajustes, voz: vozParaKie(modelo, voz), vozId: voz.id, vozNombre: voz.nombre, modeloVoz: m.clave }),
    medios: "{}", remoto: "[]", archivos: "[]", nota: "", intentos: 0, bloqueado_hasta: "",
    costo_estimado: costo, costo: 0, error: "", origen, creado_por: usuario?.id ?? null,
    calendar_id: null, post_id: null, carpeta_id: null, created_at: ahora, updated_at: ahora, terminado_at: null,
  });
  // Que siga aunque se cierre la pantalla: la bomba del espacio lo avanza.
  await despertar(env, acceso.ownerId);
  return fila;
}

/** El 409 de la confirmación: la cifra exacta y lo que se va a decir. */
function pedirConfirmacion(que, costo, extra = {}) {
  return new ErrorVoz(`${que} cuesta ${textoCosto(costo.usd)} (${costo.creditos} créditos de Kie.ai). Confírmalo para generarla.`, 409, {
    codigo: "confirmar", costo: costo.usd, creditos: costo.creditos, ...extra,
  });
}

/**
 * La MUESTRA de una voz (la frase fija): si ya está hecha, sale gratis (`lista: true` y su clave); si no, sin
 * `confirmado: true` contesta 409 con el costo, y con él crea el trabajo.
 */
export async function pedirMuestra(env, acceso, cliente, { modelo = MODELO_VOZ_POR_DEFECTO, vozId, confirmado = false, usuario = null, origen = "persona" } = {}) {
  const m = modeloDeVoz(modelo);
  if (!m) throw new ErrorVoz("Ese modelo de voz no existe: v3 o v2.");
  const voz = vozPorId(locucionDe(cliente), String(vozId ?? ""));
  if (!voz) throw new ErrorVoz("Esa voz no está entre las del cliente: escoge una de la lista (o añádela como voz propia en el kit).", 404);
  const clave = claveDeMuestra(m.clave, voz.id);
  if (await env.MEDIA.head(clave).catch(() => null)) return { lista: true, clave, voz, modelo: m.clave, costo: 0 };
  const texto = fraseDeMuestra(m.clave);
  const costo = costoDeVoz(m.clave, texto.length);
  if (confirmado !== true) throw pedirConfirmacion(`La muestra de ${voz.nombre} con ${m.nombre}`, costo, { voz: voz.nombre, modelo: m.clave });
  const fila = await crearToma(env, acceso, cliente, { modelo: m.clave, texto, voz, costo: costo.usd, ajustes: { para: "muestra" }, usuario, origen });
  return { lista: false, trabajoId: fila.id, clave, voz, modelo: m.clave, costo: costo.usd };
}

/**
 * La LOCUCIÓN de un proyecto de video: sólo del guion aprobado, con la voz del kit (o la que se pida, si es de las
 * del cliente). Sin `confirmado: true`, 409 con el costo exacto; con él, crea el trabajo y apunta en el proyecto que
 * la voz va en camino.
 */
export async function pedirLocucion(env, acceso, cliente, video, { modelo, vozId, confirmado = false, usuario = null, origen = "persona", por = null } = {}) {
  if (!puedeGenerarVoz(video)) {
    throw new ErrorVoz(`La voz se genera del guion APROBADO: está en «${NOMBRE_ESTADO_VIDEO[video.estado] ?? video.estado}». Apruébalo primero.`, 409, { codigo: "sin_aprobar" });
  }
  const v = validarGuion(leerJSON(video.guion, null));
  if (!v.ok) throw new ErrorVoz("El guion tiene errores: corrígelos y apruébalo otra vez.", 400);
  const actual = leerJSON(video.locucion, {});
  if (actual.estado === "generando" && actual.trabajoId) {
    const t = await acceso.leerUno("estudio_trabajos", { id: actual.trabajoId }).catch(() => null);
    if (t && ["en_cola", "en_marcha"].includes(t.estado)) throw new ErrorVoz("Ya se está generando la voz de este video: espera a que termine.", 409, { codigo: "en_curso" });
  }
  const loc = locucionDe(cliente);
  const m = modeloDeVoz(modelo ?? loc.modelo);
  if (!m) throw new ErrorVoz("Ese modelo de voz no existe: v3 o v2.");
  const voz = vozPorId(loc, String(vozId ?? loc.voz ?? ""));
  if (!voz) throw new ErrorVoz(loc.voz ? "Esa voz no está entre las del cliente." : "Escoge la voz de la marca (en el kit o para este video).", 400, { codigo: "sin_voz" });
  const texto = textoParaVoz(v.guion, m.clave);
  const problema = problemaDelTexto(texto, m.clave);
  if (problema) throw new ErrorVoz(problema, 400);
  const costo = costoDeVoz(m.clave, texto.length);
  if (confirmado !== true) {
    throw pedirConfirmacion(`La locución (${texto.length} caracteres, voz ${voz.nombre}, ${m.nombre})`, costo, { voz: voz.nombre, modelo: m.clave, caracteres: texto.length });
  }
  const fila = await crearToma(env, acceso, cliente, {
    modelo: m.clave, texto, voz, costo: costo.usd, ajustes: { para: "locucion", videoId: video.id, version: video.version }, usuario, origen,
  });
  const locucion = {
    estado: "generando", trabajoId: fila.id, modelo: m.clave, voz: { id: voz.id, nombre: voz.nombre }, version: video.version,
    caracteres: texto.length, costoEstimado: costo.usd, pedidoAt: new Date().toISOString(),
  };
  // Condición: la versión que se leyó (si otra persona cambió el guion entretanto, la toma sigue pero no se apunta aquí).
  await acceso.actualizar("videos_proyectos", { id: video.id, client_id: cliente.id, version: video.version }, {
    locucion: JSON.stringify(locucion), updated_at: new Date().toISOString(),
  });
  difundir(env, acceso.ownerId, { tipo: "videos", clienteId: cliente.id, id: video.id, por: por ?? { userId: "sistema", nombre: "Estudio", color: "", tab: null } });
  return { trabajoId: fila.id, costo: costo.usd, creditos: costo.creditos, caracteres: texto.length, voz, modelo: m.clave };
}

/**
 * Cómo va la voz de un proyecto: si se estaba generando y el trabajo acabó mal (fallido o cancelado), lo dice con su
 * motivo. Sólo lee (la pantalla lo pregunta al abrir el proyecto).
 */
export async function locucionAlDia(acceso, locucion) {
  if (locucion?.estado !== "generando" || !locucion.trabajoId) return locucion ?? {};
  const t = await acceso.leerUno("estudio_trabajos", { id: locucion.trabajoId }).catch(() => null);
  if (!t) return { ...locucion, estado: "fallida", error: "El pedido de la voz ya no existe." };
  if (["fallido", "cancelado"].includes(t.estado)) return { ...locucion, estado: "fallida", error: t.error || "La voz no se pudo generar." };
  return { ...locucion, nota: t.nota || "" };
}

/** La VERIFICACIÓN POSTERIOR: Gemini escucha la toma y la transcribe con tiempos. Null si no se pudo (sin gastar más). */
async function oirConTiempos(env, acceso, { bytes, mime, clienteId }) {
  try {
    if (await bloqueoPorPresupuesto(acceso)) return null;
    const texto = await verVideo(env, acceso, {
      bytes, mime, nombre: "locucion", clienteId, prompt: PEDIDO_TRANSCRIPCION_TIEMPOS, funcion: "verificar locución", json: true,
    });
    return leerTranscripcionConTiempos(texto);
  } catch (e) {
    console.warn("locución: la verificación posterior no salió", e?.message);
    return null;
  }
}

/**
 * Kie tiene la toma lista: se baja a R2, se apunta y se cierra el trabajo. Lo llama `pasoDeCola` (trabajos.js) y
 * devuelve los cambios del trabajo. Una muestra queda en su sitio de toda la agencia; una locución, en la galería del
 * cliente (tipo «audio») y en su proyecto con los tiempos de cada palabra.
 */
export async function terminarAudio(env, acceso, fila, { listo, modelo }) {
  const ajustes = leerJSON(fila.ajustes, {});
  const descarga = await abrirDescarga(listo.url, { headers: listo.headers, nombre: modelo.nombre, tope: TOPE_AUDIO, tipos: TIPOS_AUDIO });
  const costo = Number(fila.costo_estimado) || 0;
  const apuntar = () => registrarConsumoFijo(acceso, { proveedor: "kie", funcion: "estudio-voz", modelo: modelo.id, costo, clienteId: fila.client_id });
  const cerrar = (extra = {}) => ({ estado: "hecho", intentos: 0, error: "", costo, terminado_at: new Date().toISOString(), ...extra });

  if (ajustes.para === "muestra") {
    const clave = claveDeMuestra(ajustes.modeloVoz, ajustes.vozId);
    await guardarDescarga(env, clave, descarga);
    await apuntar();
    return cerrar({ nota: `Muestra de ${ajustes.vozNombre ?? "la voz"} lista.` });
  }

  // La locución: a la galería del cliente (no se enseña en la cuadrícula) y al proyecto.
  const clave = claveDeArchivo(fila.client_id, `locucion ${ajustes.vozNombre ?? ""}`, descarga.mime);
  const guardado = await guardarDescarga(env, clave, descarga);
  const obj = await env.MEDIA.get(clave);
  const bytes = obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array();
  const duracion = descarga.mime === "audio/mpeg" ? duracionMp3(bytes) : 0;
  const archivoId = uuid();
  const ahora = new Date().toISOString();
  await acceso.insertar("estudio_archivos", {
    id: archivoId, client_id: fila.client_id, clave, tipo: "audio", mime: descarga.mime, ancho: 0, alto: 0, bytes: guardado.bytes ?? bytes.byteLength,
    prompt: fila.prompt, modelo: modelo.id, ajustes: JSON.stringify({ ...ajustes, duracion }), trabajo_id: fila.id, carpeta_id: null,
    origen: "estudio", costo, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null, created_at: ahora, updated_at: ahora,
  });
  await apuntar();

  // Los tiempos: los del motor; si no trae, la verificación posterior; si no, estimados sobre la duración real.
  const resultado = listo.resultado ?? null;
  const oidas = palabrasDelResultado(resultado) ? null : await oirConTiempos(env, acceso, { bytes, mime: descarga.mime, clienteId: fila.client_id });
  const t = tiemposDeLocucion(fila.prompt, { resultado, oidas, duracion });
  const revisar = t.coincidencia !== null && t.coincidencia < COINCIDENCIA_MINIMA;

  const video = ajustes.videoId ? await acceso.leerUno("videos_proyectos", { id: ajustes.videoId, client_id: fila.client_id }).catch(() => null) : null;
  if (video) {
    const anterior = leerJSON(video.locucion, {});
    // Sólo si sigue siendo ESTE pedido el que espera el proyecto (otra toma posterior no se pisa).
    if (anterior.trabajoId === fila.id) {
      const alDia = video.version === ajustes.version;
      const locucion = {
        estado: "lista", trabajoId: fila.id, archivoId, clave, mime: descarga.mime, duracion, palabras: t.palabras,
        fuente: t.fuente, coincidencia: t.coincidencia, revisar, modelo: ajustes.modeloVoz,
        voz: { id: ajustes.vozId, nombre: ajustes.vozNombre }, version: ajustes.version, costo, terminadoAt: ahora,
        ...(alDia ? {} : { desfasada: true }),
      };
      const cambios = { locucion: JSON.stringify(locucion), updated_at: ahora };
      if (alDia && puedePasar(video.estado, "con_voz")) cambios.estado = "con_voz";
      await acceso.actualizar("videos_proyectos", { id: video.id, client_id: fila.client_id }, cambios);
      difundir(env, acceso.ownerId, { tipo: "videos", clienteId: fila.client_id, id: video.id, por: { userId: "sistema", nombre: "Estudio", color: "", tab: null } });
    }
  }
  const nota = [
    duracion ? `Locución de ${duracion.toFixed(1)} s` : "Locución lista",
    { motor: "con los tiempos del motor", verificado: "con los tiempos verificados al oírla", estimado: "con tiempos estimados" }[t.fuente],
    revisar ? `· OJO: sólo se oyó el ${Math.round(t.coincidencia * 100)} % del guion tal cual; escúchala` : "",
  ].filter(Boolean).join(" ");
  return cerrar({ archivos: JSON.stringify([archivoId]), nota: nota.slice(0, 400) });
}
