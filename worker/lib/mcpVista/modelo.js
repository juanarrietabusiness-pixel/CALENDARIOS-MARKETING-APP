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
//   · los mensajes que la página escribe en el chat por la persona (pedir un cambio, crear el plan).
//
// Las imágenes NO van en `structuredContent`: ya van como bloques de imagen en `content` (las mira Claude) y la vista
// las toma de ahí por su índice (`imagen`). Así no viajan dos veces. Lo que no es de Claude (lo que la página pregunta
// cada pocos segundos) sólo manda las imágenes que la página aún no tiene (`ya`).
// ============================================================

/** El recurso de la vista. La versión va en el nombre: si cambia la página, claude.ai no se queda con la de antes. */
export const URI_VISTA = "ui://juancito-ads/vista-1.html";
export const MIME_VISTA = "text/html;profile=mcp-app";
/** La forma del `structuredContent`: la página sólo lee la que conoce. */
export const VERSION_VISTA = 1;

/** Las herramientas cuyo resultado se enseña en la vista previa del chat. */
export const CON_VISTA = Object.freeze([
  "ver_pieza", "estado_trabajo", "estado_encargo", "crear_en_estudio", "corregir_pieza", "disenar_piezas", "ver_cuadro", "ver_escenas",
  // El reel del servidor: su storyboard se ve en el chat según sale.
  "crear_reel", "estado_reel", "continuar_reel", "montar_reel",
]);
/** Las que sólo llama la página (`visibility: ["app"]`): claude.ai no se las da al modelo. */
export const SOLO_DE_LA_VISTA = Object.freeze(["vista_encargo", "vista_trabajo", "me_gusta_pieza"]);

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

/**
 * El `structuredContent` de la vista. `tipo`: «piezas» (imágenes del Estudio), «cuadros» (del video animado) o «plan»
 * (lo que va a costar antes de crearlo). `seguir`: la herramienta SÓLO de la vista que la página llama cada `cada`
 * segundos mientras haga falta. `cliente`: { id, nombre } (el Worker le pone `enlace` al Estudio). Pura.
 */
export function vistaDe({ tipo = "piezas", titulo = "", subtitulo = "", cliente = null, estado = "", piezas = [], seguir = null, plan = null, aviso = "" } = {}) {
  return {
    vista: VERSION_VISTA,
    tipo: ["piezas", "cuadros", "plan"].includes(tipo) ? tipo : "piezas",
    titulo: corto(titulo, 140),
    ...(subtitulo ? { subtitulo: corto(subtitulo, 200) } : {}),
    ...(cliente?.id ? { cliente: { id: String(cliente.id), nombre: corto(cliente.nombre ?? cliente.name ?? "", 80) } } : {}),
    ...(estado ? { estado: String(estado) } : {}),
    piezas: (Array.isArray(piezas) ? piezas : []).slice(0, 40),
    ...(seguir?.herramienta && SOLO_DE_LA_VISTA.includes(seguir.herramienta)
      ? { seguir: { herramienta: seguir.herramienta, argumentos: seguir.argumentos ?? {}, cada: Math.max(1, Math.min(30, Number(seguir.cada) || 5)) } }
      : {}),
    ...(plan ? { plan: { costo: corto(plan.costo, 40), piezas: (plan.piezas ?? []).slice(0, 12).map((p) => ({ titulo: corto(p.titulo, 120), detalle: corto(p.detalle, 200), ...(p.error ? { error: corto(p.error, 200) } : {}) })) } } : {}),
    ...(aviso ? { aviso: corto(aviso, 300) } : {}),
  };
}

/** El enlace al Estudio del cliente en la aplicación (`origen`: el del conector). Pura. */
export function conEnlace(resultado, origen) {
  const sc = resultado?.structuredContent;
  if (!sc?.cliente?.id || !origen) return resultado;
  return { ...resultado, structuredContent: { ...sc, cliente: { ...sc.cliente, enlace: `${origen}/cliente/${encodeURIComponent(sc.cliente.id)}/estudio` } } };
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
    return { ...(anterior ?? { tipo: "piezas", titulo: "", piezas: [] }), error: corto(textoDe(resultado), 400) || "No se pudo.", seguir: null };
  }
  if (sc?.vista !== VERSION_VISTA) {
    const texto = textoDe(resultado);
    return {
      tipo: "piezas", titulo: corto(texto.split("\n")[0], 140), piezas: imagenes.map((src, i) => ({ id: `img${i}`, titulo: "", estado: "lista", src, archivo: false })),
      seguir: null, ...(imagenes.length ? {} : { texto: corto(texto, 600) }),
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
    piezas, seguir: sc.seguir ?? null, plan: sc.plan ?? null, aviso: sc.aviso ?? "", gustos: anterior?.gustos ?? {},
  };
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
