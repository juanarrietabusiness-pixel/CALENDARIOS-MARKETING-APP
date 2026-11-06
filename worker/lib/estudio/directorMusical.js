// ============================================================
// El DIRECTOR MUSICAL: una IA de texto LEE el video ya hecho y al cliente y escribe el pedido para Suno (lo puro, en
// src/lib/directorMusical.js; la música se pide en worker/lib/estudio/musica.js)
//
//   · Lee el guion guardado con su línea de tiempo (la de la locución si está lista; si no, estimada), el kit (la
//     MÚSICA DE LA MARCA manda, la voz, la paleta, el estilo), la ficha del cliente, el cerebro para escribir (nunca lo
//     interno) y el tipo de contenido de su publicación.
//   · Es texto y barato: no pide confirmación (la de Suno se queda como está). Función «director musical», hueco
//     «guiones» (FUNCIONES_IA): pasa por `prepararIA` y apunta su costo con `registrarConsumo` (llamarIA).
//   · La propuesta se GUARDA en R2 (`musica-director/<espacio>/<video>.json`, fuera de `clientes/`: /api/media no la
//     sirve) con la huella de lo que la decide. Así `generar_musica` sin estilo, al volver con `confirmado: true`,
//     pide a Suno EXACTAMENTE lo que se le dijo a la persona, sin pagar otra vez al director.
//   · Si la IA no contesta (sin llave, sin presupuesto, caída), sale la de RESPALDO (la música de la marca o la pista
//     del guion con el tempo de los cortes) con el aviso: nunca deja sin música.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { kitDe, guardarKit } from "./kit.js";
import { validarGuion } from "../../../src/lib/videoEscenas.js";
import { nombreDePilar } from "../../../src/lib/pilares.js";
import { VOCES_ELEVENLABS, VOCES_KIE, vozPorId } from "../../../src/lib/voces.js";
import { textoPaleta, limpiarMusicaDeMarca } from "../../../src/lib/kitMarca.js";
import { analisisDelVideo, pedidoDeDirectorMusical, leerPropuestaMusical, propuestaDeRespaldo, huellaMusical } from "../../../src/lib/directorMusical.js";

/** Cuánto vale la propuesta guardada (la confirmación llega en minutos; pasado esto, se vuelve a pensar). */
export const VIGENCIA_PROPUESTA_MS = 6 * 60 * 60 * 1000;
const CONSULTA = "música sonido tono emoción ambiente público personalidad de la marca";

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorDirectorMusical extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
export const claveDePropuesta = (ownerId, videoId) => `musica-director/${ownerId}/${videoId}.json`;

/** Los tiempos de la locución si están listos (los mismos que usa el Container para dibujar). */
const palabrasDe = (fila) => {
  const l = leerJSON(fila?.locucion, {}) ?? {};
  return l.estado === "lista" && Array.isArray(l.palabras) ? l.palabras : null;
};

/** El tipo de contenido de la publicación del video («7 maletas · Testimonio»), si va ligado a una. */
async function tipoDeLaPublicacion(acceso, fila) {
  if (!fila?.post_id) return "";
  try {
    const cals = await acceso.leerColumnas("calendars", ["id", "days"], fila.calendar_id ? { id: fila.calendar_id, client_id: fila.client_id } : { client_id: fila.client_id });
    for (const cal of cals) {
      for (const d of leerJSON(cal.days, []) ?? []) {
        const p = (d?.posts ?? []).find((x) => x?.id === fila.post_id);
        if (p) return nombreDePilar(p.pilar, p.pilarSub);
      }
    }
  } catch { /* sin publicación, sin tipo */ }
  return "";
}

/** La voz del video: la de su locución o la de la marca, con su nota («Matilda (cálida, cercana)»). */
function vozDelVideo(fila, kit) {
  const l = leerJSON(fila?.locucion, {}) ?? {};
  const id = l.voz?.id || kit.locucion?.voz || "";
  const v = id ? vozPorId(kit.locucion, id, [...VOCES_ELEVENLABS, ...VOCES_KIE]) : null;
  const nombre = l.voz?.nombre || v?.nombre || "";
  return nombre ? `${nombre}${v?.nota ? ` (${v.nota})` : ""}` : "";
}

/**
 * La propuesta del director musical para un video (una fila de videos_proyectos). Con `reusar`, la guardada si sigue
 * valiendo (misma huella y menos de 6 h): no se paga otra vez. Lanza ErrorDirectorMusical si el guion tiene errores.
 * → { propuesta, analisis, aviso, modelo, guardada, huella }
 */
export async function proponerMusica(env, acceso, cliente, fila, { reusar = false } = {}) {
  const v = validarGuion(leerJSON(fila?.guion, null));
  if (!v.ok) throw new ErrorDirectorMusical("El guion tiene errores: corrígelos antes de proponer la música.", 400);
  const kit = kitDe(cliente);
  const kitMusica = limpiarMusicaDeMarca(kit.musica);
  const palabras = palabrasDe(fila);
  const analisis = analisisDelVideo(v.guion, { palabras });
  const huella = huellaMusical(v.guion, { palabras, kitMusica });
  const clave = claveDePropuesta(acceso.ownerId, fila.id);

  if (reusar) {
    try {
      const o = await env.MEDIA.get(clave);
      const g = o ? leerJSON(await new Response(o.body).text(), null) : null;
      if (g?.huella === huella && Date.now() - Date.parse(g.at) < VIGENCIA_PROPUESTA_MS && g.propuesta?.estilo) {
        return { propuesta: g.propuesta, analisis, aviso: g.aviso ?? null, modelo: g.modelo ?? null, guardada: true, huella };
      }
    } catch { /* sin la guardada, se piensa otra vez */ }
  }

  let propuesta = null;
  let aviso = null;
  let modelo = null;
  try {
    const [cerebro, tipo] = await Promise.all([
      contextoCerebro(env, acceso, cliente.id, CONSULTA, { para: "texto", presupuesto: 1500 }).catch(() => null),
      tipoDeLaPublicacion(acceso, fila),
    ]);
    const prompt = pedidoDeDirectorMusical({
      marca: cliente.name, analisis, tipo, voz: vozDelVideo(fila, kit),
      cliente: { rubro: cliente.industry, descripcion: cliente.descripcion, audiencia: cliente.audiencia, estiloLocucion: cliente.estilo_locucion },
      kit: { musica: kitMusica, paleta: textoPaleta(kit.paleta), estilo: kit.estilo, luz: kit.luz },
      ficha: [cerebro?.ficha, cerebro?.pasajes].filter(Boolean).join("\n\n"),
    });
    const r = await llamarIA(env, acceso, cliente, { prompt, salida: 1500, funcion: "director musical" });
    modelo = r.modelo;
    aviso = r.aviso ?? null;
    propuesta = leerPropuestaMusical(r.texto, { analisis, kitMusica });
    if (!propuesta) aviso = [aviso, "El director musical no devolvió un pedido que se pudiera leer: va la música de la marca (o la del guion) con el tempo de los cortes."].filter(Boolean).join(" ");
  } catch (e) {
    aviso = `El director musical no respondió (${String(e?.message ?? "sin motivo").replace(/\.$/, "")}): va la música de la marca (o la del guion) con el tempo de los cortes.`;
  }
  if (!propuesta) propuesta = propuestaDeRespaldo(analisis, { kitMusica });

  try {
    await env.MEDIA.put(clave, JSON.stringify({ huella, at: new Date().toISOString(), propuesta, aviso, modelo }), { httpMetadata: { contentType: "application/json" } });
  } catch { /* sin guardar, la confirmación la pensará otra vez */ }
  return { propuesta, analisis, aviso, modelo, guardada: false, huella };
}

/** Lo que la pantalla necesita del análisis (sin las escenas enteras). */
export const resumenDelAnalisis = (a) => ({
  segundos: a.segundos, estimado: a.estimado, conVoz: a.conVoz, escenas: a.escenas.length, segundosPorEscena: a.segundosPorEscena,
  cortesPorMinuto: a.cortesPorMinuto, bpm: a.bpm, momentos: a.momentos,
});

/**
 * «Me gusta esta»: una música GENERADA de la galería del cliente pasa a ser referencia de la marca (su estilo: lo que
 * se le mandó a Suno), sobre el kit GUARDADO. La más nueva primero; como mucho tres. → la música de la marca.
 */
export async function musicaALaMarca(env, acceso, cliente, archivoId) {
  const a = await acceso.leerUno("estudio_archivos", { id: String(archivoId ?? ""), client_id: cliente.id }).catch(() => null);
  if (!a || a.borrado_at || a.tipo !== "audio" || !String(a.modelo ?? "").startsWith("musica")) {
    throw new ErrorDirectorMusical("Esa música no está en la galería de este cliente.", 404);
  }
  const estilo = String(leerJSON(a.ajustes, {})?.pedido?.estilo ?? "").trim();
  if (!estilo) {
    throw new ErrorDirectorMusical("Esa música se subió a mano: no se sabe qué se le pidió a Suno. Escribe cómo suena en la música de la marca (Marca → Kit y voz).", 409);
  }
  const actual = kitDe(cliente);
  const antes = limpiarMusicaDeMarca(actual.musica);
  const titulo = String(a.prompt || "Música").replace(/\.[a-z0-9]+$/i, "").replace(/\s*\(\d+\)$/, "").trim();
  const musica = limpiarMusicaDeMarca({
    ...antes,
    referencias: [{ estilo, titulo, archivoId: a.id, at: new Date().toISOString() }, ...antes.referencias.filter((r) => r.archivoId !== a.id && r.estilo !== estilo)],
  });
  const kit = await guardarKit(env, acceso, cliente, { ...actual, musica });
  return kit.musica;
}
