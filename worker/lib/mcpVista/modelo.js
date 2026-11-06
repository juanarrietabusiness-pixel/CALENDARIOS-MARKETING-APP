// ============================================================
// La VISTA PREVIA del conector en el chat de Claude (MCP Apps): lo puro
//
// claude.ai (web, escritorio y teléfono) pinta el resultado de una herramienta dentro del chat si la herramienta declara
// `_meta.ui.resourceUri` y el servidor sirve ese recurso `ui://` por `resources/read` como `text/html;profile=mcp-app`
// (especificación de MCP Apps, 2026-01-26). Aquí está lo que comparten el Worker y la página que corre en ese iframe
// (navegador.js, empaquetada en pagina.generada.js):
//   · qué herramientas llevan vista y cuáles son SÓLO de la vista (Claude no las ve: las llama la página);
//   · la forma del `structuredContent` que la alimenta (`vistaDe`, `piezaDe`);
//   · cómo la página lee un resultado (`leerResultado`), qué ya tiene y cuándo vuelve a preguntar (`proximaVuelta`);
//   · los mensajes que la página escribe en el chat por la persona (pedir un cambio, crear el plan);
//   · los AUDIOS y VIDEOS (`medioDe`): una toma de voz, una música, el mp4 de un video. Éstos no caben en el resultado:
//     van por su dirección FIRMADA y de corta vida (worker/lib/medioVista.js), que el recurso permite cargar porque
//     declara el origen del conector en `_meta.ui.csp.resourceDomains` (worker/rutas/mcp.js). Cuando una caduca, la
//     página pide otra (`vista_medios`, `conRenovados`); si aun así no carga, «Abrir».
//
// Las imágenes NO van en `structuredContent`: ya van como bloques de imagen en `content` (las mira Claude) y la vista
// las toma de ahí por su índice (`imagen`). Así no viajan dos veces. Lo que no es de Claude (lo que la página pregunta
// cada pocos segundos) sólo manda las imágenes que la página aún no tiene (`ya`).
// ============================================================

/**
 * El recurso de la vista. La versión va en el nombre: si cambia la página, claude.ai no se queda con la de antes. La 2
 * trae los reproductores de audio y video, y su recurso declara el origen del conector (sin eso no cargaría ninguno).
 */
export const URI_VISTA = "ui://juancito-ads/vista-2.html";
export const MIME_VISTA = "text/html;profile=mcp-app";
/** La forma del `structuredContent`: la página sólo lee la que conoce. */
export const VERSION_VISTA = 1;

/** Las herramientas cuyo resultado se enseña en la vista previa del chat. */
export const CON_VISTA = Object.freeze([
  "ver_pieza", "estado_trabajo", "estado_encargo", "crear_en_estudio", "corregir_pieza", "disenar_piezas", "ver_cuadro", "ver_escenas",
  // El reel del servidor: su storyboard se ve en el chat según sale (y su mp4, cuando lo hay).
  "crear_reel", "estado_reel", "continuar_reel", "montar_reel",
  // Lo que SUENA o se reproduce: la muestra de una voz, la locución, la música (las dos versiones de Suno) y el mp4.
  "previsualizar_voz", "generar_locucion", "generar_musica", "renderizar_video", "ver_video",
  // «Video con tu canción»: la canción del video recién creado se oye ahí mismo.
  "video_con_cancion",
]);
/** Las que sólo llama la página (`visibility: ["app"]`): claude.ai no se las da al modelo. */
export const SOLO_DE_LA_VISTA = Object.freeze(["vista_encargo", "vista_trabajo", "me_gusta_pieza", "vista_video", "vista_medios"]);

/** La definición de una herramienta con su `_meta.ui` (y la clave plana de antes, que algunos clientes aún leen). Pura. */
export function conMetaDeVista(h) {
  if (SOLO_DE_LA_VISTA.includes(h?.name)) return { ...h, _meta: { ...(h._meta ?? {}), ui: { visibility: ["app"] } } };
  if (!CON_VISTA.includes(h?.name)) return h;
  return { ...h, _meta: { ...(h._meta ?? {}), ui: { resourceUri: URI_VISTA, visibility: ["model", "app"] }, "ui/resourceUri": URI_VISTA } };
}

// ------------------------------------------------------------
// Lo que manda el Worker (structuredContent)
// ------------------------------------------------------------

/** Los estados de una pieza en la vista, con lo que dice la página. */
export const ESTADOS_PIEZA = Object.freeze({
  lista: "Lista",
  en_marcha: "Creándose…",
  esperando: "En espera",
  fallida: "No salió",
});

const corto = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const indice = (n) => (Number.isInteger(n) && n >= 0 ? n : null);

/**
 * Una pieza para la vista. `imagen`: el índice de su imagen entre los bloques de imagen del resultado (null si no va en
 * éste). `control`: el del control de calidad ({ estado, puntajeDiseno }). `sinImagen`: no hay imagen que enseñar (un
 * video, o no se pudo reducir): la página no la espera. Pura.
 */
export function piezaDe({ id, titulo = "", estado = "lista", nota = "", imagen = null, control = null, gusta = false, sinImagen = false, archivo = true } = {}) {
  return {
    id: corto(id, 80),
    titulo: corto(titulo, 120),
    estado: estado in ESTADOS_PIEZA ? estado : "lista",
    ...(nota ? { nota: corto(nota, 240) } : {}),
    imagen: indice(imagen),
    ...(control?.estado ? { control: { estado: control.estado === "ok" ? "ok" : "revisar", ...(Number.isFinite(control.puntajeDiseno) ? { puntaje: control.puntajeDiseno } : {}) } } : {}),
    ...(gusta ? { gusta: true } : {}),
    ...(sinImagen ? { sinImagen: true } : {}),
    // Una pieza de la galería (se puede marcar «Me gusta» o pedir que se cambie); un paso en marcha, no.
    archivo: Boolean(archivo),
  };
}

/** Cuántos audios y cuántos videos como mucho en una vista. */
export const MAX_MEDIOS = 12;
/** La ruta (relativa) de las direcciones firmadas de la API: el conector le pone su origen (`conEnlace`). */
const RELATIVA = /^\/api\/vista-medio\/[^\s"'<>]+$/;

/**
 * ¿Se puede poner esta dirección en un <audio>/<video> (o abrirla)? Sólo http(s) absoluta; con `relativa`, también la
 * de la API que el conector completa con su origen. Nada de `javascript:` ni `data:`. Pura.
 */
export function direccionValida(u, { relativa = false } = {}) {
  const s = String(u ?? "");
  if (!s || s.length > 2000 || /[\s"'<>]/.test(s)) return false;
  if (relativa && RELATIVA.test(s)) return true;
  try {
    const x = new URL(s);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Un AUDIO o un VIDEO para la vista. `url`: su dirección firmada (null si no hay: en marcha, o no se pudo firmar);
 * `caduca`: cuándo deja de valer (ms); `ref`: lo que el servidor necesita para firmar otra (`archivo:<id>` o
 * `muestra:<modelo>:<voz>:<huella>`). `duracion` en segundos, `voz` el nombre de la voz. Pura.
 */
export function medioDe({ id, ref = "", url = "", titulo = "", duracion = null, voz = "", estado = "lista", nota = "", caduca = null, poster = "" } = {}) {
  const d = Number(duracion);
  return {
    id: corto(id, 80),
    ...(ref ? { ref: String(ref).slice(0, 200) } : {}),
    url: direccionValida(url, { relativa: true }) ? String(url) : null,
    titulo: corto(titulo, 120),
    ...(Number.isFinite(d) && d > 0 ? { duracion: Math.round(d * 10) / 10 } : {}),
    ...(voz ? { voz: corto(voz, 80) } : {}),
    estado: estado in ESTADOS_PIEZA ? estado : "lista",
    ...(nota ? { nota: corto(nota, 240) } : {}),
    ...(Number.isFinite(caduca) ? { caduca: Number(caduca) } : {}),
    ...(poster && direccionValida(poster, { relativa: true }) ? { poster: String(poster) } : {}),
  };
}

const listaDeMedios = (l) => (Array.isArray(l) ? l : []).slice(0, MAX_MEDIOS).map(medioDe);

/**
 * El `structuredContent` de la vista. `tipo`: «piezas» (imágenes del Estudio), «cuadros» (del video animado), «plan»
 * (lo que va a costar antes de crearlo) o «medios» (sólo audio o video). `audios` y `videos`: los reproductores
 * (`medioDe`), con cualquier tipo. `seguir`: la herramienta SÓLO de la vista que la página llama cada `cada` segundos
 * mientras haga falta. `cliente`: { id, nombre } (el Worker le pone `enlace` al Estudio). Pura.
 */
export function vistaDe({ tipo = "piezas", titulo = "", subtitulo = "", cliente = null, estado = "", piezas = [], seguir = null, plan = null, aviso = "", audios = [], videos = [] } = {}) {
  const a = listaDeMedios(audios);
  const v = listaDeMedios(videos);
  return {
    vista: VERSION_VISTA,
    tipo: ["piezas", "cuadros", "plan", "medios"].includes(tipo) ? tipo : "piezas",
    titulo: corto(titulo, 140),
    ...(subtitulo ? { subtitulo: corto(subtitulo, 200) } : {}),
    ...(cliente?.id ? { cliente: { id: String(cliente.id), nombre: corto(cliente.nombre ?? cliente.name ?? "", 80) } } : {}),
    ...(estado ? { estado: String(estado) } : {}),
    piezas: (Array.isArray(piezas) ? piezas : []).slice(0, 40),
    ...(a.length ? { audios: a } : {}),
    ...(v.length ? { videos: v } : {}),
    ...(seguir?.herramienta && SOLO_DE_LA_VISTA.includes(seguir.herramienta)
      ? { seguir: { herramienta: seguir.herramienta, argumentos: seguir.argumentos ?? {}, cada: Math.max(1, Math.min(30, Number(seguir.cada) || 5)) } }
      : {}),
    ...(plan ? { plan: { costo: corto(plan.costo, 40), piezas: (plan.piezas ?? []).slice(0, 12).map((p) => ({ titulo: corto(p.titulo, 120), detalle: corto(p.detalle, 200), ...(p.error ? { error: corto(p.error, 200) } : {}) })) } } : {}),
    ...(aviso ? { aviso: corto(aviso, 300) } : {}),
  };
}

/**
 * Lo que va con la página (`_meta` del recurso): un borde del chat alrededor y su política de contenido. Las imágenes
 * llegan en el resultado; los audios y videos, por su dirección firmada en el origen del conector, que es lo ÚNICO que
 * se declara (`resourceDomains`: media-src, y también img/script/style/font-src, que la página no usa). Nada en
 * `connectDomains`: la página no hace `fetch`, habla con claude.ai por `postMessage`. Pura.
 */
export function metaDeVista(origen) {
  let valido = "";
  try {
    const u = new URL(String(origen ?? ""));
    if ((u.protocol === "https:" || u.protocol === "http:") && u.origin === origen) valido = u.origin;
  } catch {
    valido = "";
  }
  return { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: valido ? [valido] : [] } } };
}

const absoluta = (u, origen) => (typeof u === "string" && RELATIVA.test(u) ? `${origen}${u}` : u);
/** Las direcciones firmadas dentro de un texto (detrás de un espacio, un paréntesis o unas comillas). */
const EN_TEXTO = /(^|[\s(«"'<[])(\/api\/vista-medio\/)/g;
const textoAbsoluto = (t, origen) => (typeof t === "string" ? t.replace(EN_TEXTO, `$1${origen}$2`) : t);

/**
 * Lo que el resultado sólo sabe en relativo, con el ORIGEN del conector: las direcciones firmadas de los audios y los
 * videos (en la vista y en el texto, para que Claude pueda dárselas a la persona) y el enlace al Estudio del cliente en
 * esta aplicación. Pura.
 */
export function conEnlace(resultado, origen) {
  if (!resultado || !origen) return resultado;
  const content = Array.isArray(resultado.content)
    ? resultado.content.map((b) => (b?.type === "text" ? { ...b, text: textoAbsoluto(b.text, origen) } : b))
    : resultado.content;
  const sc = resultado.structuredContent;
  if (!sc || typeof sc !== "object") return { ...resultado, content };
  const medios = (l) => l.map((m) => ({ ...m, url: absoluta(m.url, origen), ...(m.poster ? { poster: absoluta(m.poster, origen) } : {}) }));
  return {
    ...resultado,
    content,
    structuredContent: {
      ...sc,
      ...(typeof sc.texto === "string" ? { texto: textoAbsoluto(sc.texto, origen) } : {}),
      ...(Array.isArray(sc.audios) ? { audios: medios(sc.audios) } : {}),
      ...(Array.isArray(sc.videos) ? { videos: medios(sc.videos) } : {}),
      ...(sc.cliente?.id ? { cliente: { ...sc.cliente, enlace: `${origen}/cliente/${encodeURIComponent(sc.cliente.id)}/estudio` } } : {}),
    },
  };
}

// ------------------------------------------------------------
// Lo que hace la página con un resultado
// ------------------------------------------------------------

/** Las imágenes de un resultado de MCP como direcciones `data:`, en su orden. Pura. */
export function imagenesDe(resultado) {
  return (Array.isArray(resultado?.content) ? resultado.content : [])
    .filter((b) => b?.type === "image" && typeof b.data === "string" && /^image\/(jpeg|png|webp|gif)$/.test(String(b.mimeType)))
    .map((b) => `data:${b.mimeType};base64,${b.data}`);
}

const textoDe = (resultado) => (Array.isArray(resultado?.content) ? resultado.content : []).filter((b) => b?.type === "text").map((b) => b.text ?? "").join("\n").trim();

/**
 * Lo que se pinta a partir de un resultado (el de la herramienta de Claude o el de una vuelta de la página), sin perder
 * las imágenes que ya se tenían (`anterior`): una vuelta sólo trae las nuevas. Sin `structuredContent` de la vista (otra
 * herramienta, o un cliente que no lo pasa), las imágenes del resultado y su primera línea. Pura.
 */
export function leerResultado(resultado, anterior = null) {
  const imagenes = imagenesDe(resultado);
  const sc = resultado?.structuredContent;
  if (resultado?.isError) {
    return { ...(anterior ?? { tipo: "piezas", titulo: "", piezas: [], audios: [], videos: [] }), error: corto(textoDe(resultado), 400) || "No se pudo.", seguir: null };
  }
  if (sc?.vista !== VERSION_VISTA) {
    const texto = textoDe(resultado);
    return {
      tipo: "piezas", titulo: corto(texto.split("\n")[0], 140), piezas: imagenes.map((src, i) => ({ id: `img${i}`, titulo: "", estado: "lista", src, archivo: false })),
      audios: [], videos: [], seguir: null, ...(imagenes.length ? {} : { texto: corto(texto, 600) }),
    };
  }
  const antes = new Map((anterior?.piezas ?? []).filter((p) => p.src).map((p) => [p.id, p]));
  const piezas = (sc.piezas ?? []).map((p) => {
    const src = p.imagen !== null && p.imagen !== undefined ? imagenes[p.imagen] ?? null : antes.get(p.id)?.src ?? null;
    // «Me gusta» marcado en la página y aún no leído de vuelta: gana lo que la persona tocó.
    const local = anterior?.gustos?.[p.id];
    return { ...p, src, gusta: local ?? Boolean(p.gusta) };
  });
  return {
    tipo: sc.tipo, titulo: sc.titulo ?? "", subtitulo: sc.subtitulo ?? "", cliente: sc.cliente ?? null, estado: sc.estado ?? "",
    piezas, audios: mediosConLosDeAntes(sc.audios, anterior?.audios), videos: mediosConLosDeAntes(sc.videos, anterior?.videos),
    seguir: sc.seguir ?? null, plan: sc.plan ?? null, aviso: sc.aviso ?? "", gustos: anterior?.gustos ?? {},
  };
}

/**
 * Los audios o videos de un resultado, sin cambiar la dirección de lo que ya se tenía: cada vuelta trae una firma nueva,
 * y cambiarle el `src` a un reproductor cortaría lo que se está oyendo. Sólo direcciones absolutas http(s) (en el
 * iframe, una relativa apuntaría a claude.ai). Pura.
 */
function mediosConLosDeAntes(lista, anteriores) {
  const antes = new Map((anteriores ?? []).map((m) => [m.id, m]));
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_MEDIOS).map((m) => {
    const previo = antes.get(m.id);
    const propia = direccionValida(m.url) ? m.url : null;
    if (previo?.url && !previo.fallo) return { ...m, url: previo.url, ...(previo.caduca ? { caduca: previo.caduca } : {}), ...(previo.renovado ? { renovado: true } : {}) };
    return { ...m, url: propia };
  });
}

/** Un audio o video que no cargó: se marca (la página enseña «Abrir» en vez de la caja rota). Pura. */
export function conFallo(modelo, tipo, id) {
  const clave = tipo === "video" ? "videos" : "audios";
  if (!modelo?.[clave]) return modelo;
  return { ...modelo, [clave]: modelo[clave].map((m) => (m.id === id ? { ...m, fallo: true } : m)) };
}

/** Margen antes de caducar en que ya se pide otra dirección (ms). */
export const MARGEN_CADUCA = 120_000;

/**
 * ¿Pedir otra dirección para un audio o video que no cargó? Sólo si se sabe firmarla (`ref`), no se pidió ya y la que
 * tiene caducó o está por caducar (si no se sabe cuándo caduca, una vez). Si no cargó por otra cosa, «Abrir». Pura.
 */
export function tocaRenovar(m, ahora = Date.now()) {
  if (!m?.ref || m.renovado) return false;
  return !Number.isFinite(m.caduca) || ahora >= m.caduca - MARGEN_CADUCA;
}

/** Las direcciones nuevas de `vista_medios` puestas en los audios y videos con su misma `ref`. Pura. */
export function conRenovados(modelo, resultado) {
  const sc = resultado?.structuredContent;
  const nuevos = new Map([...(sc?.audios ?? []), ...(sc?.videos ?? [])].filter((m) => m?.ref && direccionValida(m.url)).map((m) => [m.ref, m]));
  if (!modelo || !nuevos.size) return modelo;
  const poner = (lista) => (lista ?? []).map((m) => {
    const n = m.ref ? nuevos.get(m.ref) : null;
    return n ? { ...m, url: n.url, ...(Number.isFinite(n.caduca) ? { caduca: n.caduca } : {}), fallo: false, renovado: true } : m;
  });
  return { ...modelo, audios: poner(modelo.audios), videos: poner(modelo.videos) };
}

/** «0:31», «1:05»: lo que dura un audio o un video, para leerlo de un vistazo. Pura. */
export function reloj(segundos) {
  const s = Math.round(Number(segundos));
  if (!Number.isFinite(s) || s <= 0) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Los ids de las piezas cuya imagen ya tiene la página (lo que va en `ya` al preguntar otra vez). Pura. */
export function idsConImagen(modelo) {
  return (modelo?.piezas ?? []).filter((p) => p.src && p.archivo).map((p) => p.id);
}

/** Cuántas vueltas como mucho (a 5 s, unos 25 minutos): lo que dura un encargo largo; después, «Actualizar». */
export const MAX_VUELTAS = 300;

/** Dentro de cuánto (ms) se vuelve a preguntar, o null si ya no hace falta. Pura. */
export function proximaVuelta(modelo, vueltas = 0) {
  if (!modelo?.seguir || modelo.error) return null;
  if (vueltas >= MAX_VUELTAS) return null;
  return Math.max(1, Number(modelo.seguir.cada) || 5) * 1000;
}

/** El mensaje que la página escribe en el chat al pedir un cambio de una pieza. Pura. */
export function mensajeDeCambio({ pieza, cliente, indicacion }) {
  const que = corto(indicacion, 600);
  if (!que) return "";
  return `En la pieza ${pieza?.id}${cliente?.nombre ? ` de ${cliente.nombre}` : ""}${pieza?.titulo ? ` («${pieza.titulo}»)` : ""}: ${que}`;
}

/** El mensaje de «Crear» de un plan: el sí de la persona, con la cifra que vio. Pura. */
export function mensajeDeCrear(modelo) {
  const costo = modelo?.plan?.costo;
  return `Sí, créalo${costo ? ` (vi el costo: unos ${costo})` : ""}.`;
}

/** Cuántas hay listas de cuántas (para el subtítulo de la página mientras se crean). Pura. */
export function cuentaDeListas(modelo) {
  const piezas = modelo?.piezas ?? [];
  return { listas: piezas.filter((p) => p.estado === "lista").length, total: piezas.length };
}
