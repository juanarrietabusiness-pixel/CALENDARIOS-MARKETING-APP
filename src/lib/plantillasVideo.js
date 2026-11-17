// ============================================================
// PLANTILLAS de reels de movimiento gráfico: el guion del video animado (formato v1) armado por el CÓDIGO
//
// Formatos que hoy funcionan en Instagram y TikTok, hechos sólo con texto, el logo y las fotos que ya tiene el cliente:
// sin grabar a nadie y sin IA de video. Los dibuja el motor de siempre (motorVideo.js) con el kit del cliente (paleta,
// letra, logo) en el Container, así que cuestan céntimos de céntimo. Cada plantilla devuelve un guion que valida y se
// guarda como cualquier video animado (borrador): se puede retocar escena por escena, ponerle música en «Sonido» y
// renderizar.
//
//   comentarios       «Respondo tu comentario»: el comentario (como en Instagram), la respuesta en frases y el cierre.
//   busqueda          Una búsqueda que se escribe sola, los resultados y el último es el producto de la marca.
//   producto          El producto saltando por fondos de la marca al ritmo, con su nombre y su precio.
//   logo              El logo fijo mientras detrás cambian rápido las fotos de la marca.
//
// Sin voz: las escenas duran lo que su `pausa` (o lo que `dura` una foto), y la música va aparte. Pura.
// ============================================================

import { MAX_PAUSA, MIN_ESCENA } from "./videoEscenas.js";

export const PLANTILLAS_VIDEO = Object.freeze([
  { id: "comentarios", nombre: "Respondo tu comentario", detalle: "El comentario de un cliente como en Instagram, la respuesta de la marca frase a frase y el cierre con el producto y el logo. Para responder objeciones." },
  { id: "busqueda", nombre: "Búsqueda", detalle: "Una búsqueda que se escribe sola, los resultados pasan y el último es tu producto. Un gancho de «lo que todos buscan»." },
  { id: "producto", nombre: "Producto que salta", detalle: "La foto del producto pasando por fondos de la marca, un golpe por cambio, con su nombre y su precio. Para lanzamientos y ofertas." },
  { id: "logo", nombre: "Logo sobre fondos", detalle: "El logo fijo en el centro mientras detrás cambian rápido las fotos de la marca. Para cerrar un video o presentar la marca." },
]);

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const lista = (v, max, n) => (Array.isArray(v) ? v : [v]).map((x) => corto(x, n)).filter(Boolean).slice(0, max);
const ids = (v, max) => (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "").trim()).filter((x) => /^[\w-]{1,64}$/.test(x)).slice(0, max);
/** Lo que se lee cómodo: unas 3 palabras por segundo, entre 1,2 s y la pausa máxima. */
const leer = (texto) => Math.min(MAX_PAUSA, Math.max(1.2, String(texto).split(/\s+/).length / 3 + 0.6));
const fondoDe = (k) => ["acento", "oscuro", "apoyo", "fondo", "superficie"][k % 5];

const base = (titulo, escenas) => ({
  version: 1, titulo: corto(titulo, 80) || "Reel", formatos: ["9:16"], estilo: { ritmo: "rapido", grano: 0 },
  subtitulos: { activo: false, pos: "abajo", maxPalabras: 4 }, escenas,
});

/** El cierre de todas: el logo (y el producto si lo hay) con el llamado. */
function cierre(id, { llamado, producto }) {
  const capas = [];
  if (producto) capas.push({ tipo: "imagen", id: "p", archivo: producto, rol: "producto", recorte: "contener", pos: "centro", tam: 0.62, entra: { s: 0 }, animacion: { entrada: "escala" } });
  capas.push({ tipo: "logo", id: "logo", pos: producto ? "arriba" : "centro", tam: producto ? 0.3 : 0.45, entra: { s: 0 }, animacion: { entrada: "escala", bucle: "late" } });
  if (llamado) capas.push({ tipo: "llamado", id: "cta", texto: corto(llamado, 30), pos: "abajo", entra: { s: 0.3 }, animacion: { entrada: "rebote" } });
  return { id, tipo: "cierre", habla: "", pausa: 2.5, fondo: { tipo: "plano", color: "fondo" }, transicion: { tipo: "fundido", dur: 0.3 }, capas };
}

/** «Respondo tu comentario». */
function comentarios(d) {
  const comentario = corto(d.comentario, 140);
  if (!comentario) return { error: "Escribe el comentario que se responde." };
  const respuestas = lista(d.respuestas, 4, 80);
  if (!respuestas.length) return { error: "Escribe la respuesta (una frase por pantalla, hasta 4)." };
  const escenas = [{
    // Un fondo de la marca, oscuro: la tarjeta blanca del comentario se despega (sobre el claro casi no se veía).
    id: "e1", tipo: "gancho", habla: "", pausa: 2.6, fondo: { tipo: "degradado", color: "acento", color2: "oscuro" }, transicion: { tipo: "corte" },
    capas: [
      { tipo: "sello", id: "s", texto: "Respondo tu comentario", color: "claro", pos: "arriba", entra: { s: 0 }, animacion: { entrada: "rebote" } },
      { tipo: "comentario", id: "c", usuario: corto(d.usuario, 30) || "cliente", texto: comentario, likes: Math.max(0, Math.round(Number(d.likes) || 0)), pos: "centro", tam: 0.86, entra: { s: 0.3 }, animacion: { entrada: "escala" } },
    ],
  }];
  respuestas.forEach((r, i) => escenas.push({
    id: `e${i + 2}`, tipo: i === 0 ? "solucion" : "beneficio", habla: "", pausa: leer(r), fondo: { tipo: "plano", color: i % 2 ? "superficie" : "fondo" },
    transicion: { tipo: "deslizar", dur: 0.3 },
    capas: [{ tipo: "texto", id: "t", texto: r, rol: "titular", placa: "superficie", pos: "centro", entra: { s: 0 }, animacion: { entrada: "sube" } }],
  }));
  escenas.push(cierre(`e${escenas.length + 1}`, { llamado: d.llamado, producto: ids(d.producto, 1)[0] }));
  return { guion: base(d.titulo || `Respondo: ${comentario}`, escenas) };
}

/** «Búsqueda». */
function busqueda(d) {
  const texto = corto(d.busqueda, 60);
  if (!texto) return { error: "Escribe lo que se busca." };
  const resultados = lista(d.resultados, 4, 50);
  const escribir = texto.length / 16 + 0.3 + resultados.length * 0.35 + 1;
  const escenas = [{
    id: "e1", tipo: "gancho", habla: "", pausa: Math.min(MAX_PAUSA, Math.max(1.6, escribir)), fondo: { tipo: "degradado", color: "acento", color2: "oscuro" }, transicion: { tipo: "corte" },
    capas: [{ tipo: "busqueda", id: "b", texto, resultados, pos: "centro", tam: 0.88, entra: { s: 0 }, animacion: { entrada: "aparece" } }],
  }];
  const producto = ids(d.producto, 1)[0];
  const nombre = corto(d.nombre, 60);
  if (producto || nombre) {
    const capas = [];
    if (producto) capas.push({ tipo: "imagen", id: "p", archivo: producto, rol: "producto", recorte: "contener", pos: "centro", tam: 0.7, entra: { s: 0 }, animacion: { entrada: "escala" } });
    if (nombre) capas.push({ tipo: "texto", id: "n", texto: nombre, rol: "titular", pos: producto ? "arriba" : "centro", entra: { s: 0.2 }, animacion: { entrada: "sube" } });
    if (d.precio) capas.push({ tipo: "sello", id: "precio", texto: corto(d.precio, 24), pos: "abajo", entra: { s: 0.5 }, animacion: { entrada: "golpe" } });
    escenas.push({ id: "e2", tipo: "producto", habla: "", pausa: 2.4, fondo: { tipo: "plano", color: "acento" }, transicion: { tipo: "zoom", dur: 0.3 }, capas });
  }
  escenas.push(cierre(`e${escenas.length + 1}`, { llamado: d.llamado, producto: null }));
  return { guion: base(d.titulo || texto, escenas) };
}

/** «Producto que salta». */
function producto(d) {
  const fotos = ids(d.fotos, 3);
  if (!fotos.length) return { error: "Escoge al menos una foto del producto (mejor con fondo transparente o liso)." };
  const textos = lista(d.textos, 8, 30);
  const golpes = Math.max(6, Math.min(12, Number(d.golpes) || 8));
  const cada = Math.max(MIN_ESCENA, Math.min(1.2, Number(d.cada) || 0.6));
  const escenas = Array.from({ length: golpes }, (_, k) => ({
    id: `e${k + 1}`, tipo: k === 0 ? "gancho" : "producto", habla: "", pausa: cada,
    fondo: { tipo: k % 3 === 2 ? "rayas" : "plano", color: fondoDe(k), color2: fondoDe(k + 2) }, transicion: { tipo: "corte" },
    capas: [
      { tipo: "imagen", id: "p", archivo: fotos[k % fotos.length], rol: "producto", recorte: "contener", pos: "centro", tam: 0.72, entra: { s: 0 }, animacion: { entrada: "golpe" } },
      ...(textos.length ? [{ tipo: "texto", id: "t", texto: textos[k % textos.length], rol: "gigante", pos: k % 2 ? "arriba" : "abajo", entra: { s: 0 }, animacion: { entrada: "golpe" } }] : []),
    ],
  }));
  if (d.precio) {
    escenas.push({
      id: `e${escenas.length + 1}`, tipo: "producto", habla: "", pausa: 1.6, fondo: { tipo: "plano", color: "acento" }, transicion: { tipo: "corte" },
      capas: [
        { tipo: "imagen", id: "p", archivo: fotos[0], rol: "producto", recorte: "contener", pos: "centro", tam: 0.7, entra: { s: 0 }, animacion: { entrada: "escala" } },
        { tipo: "sello", id: "precio", texto: corto(d.precio, 24), pos: "abajo", entra: { s: 0.2 }, animacion: { entrada: "golpe" } },
      ],
    });
  }
  escenas.push(cierre(`e${escenas.length + 1}`, { llamado: d.llamado, producto: null }));
  return { guion: base(d.titulo || textos[0] || "Producto", escenas) };
}

/** «Logo sobre fondos». */
function logo(d) {
  const fotos = ids(d.fotos, 12);
  if (fotos.length < 3) return { error: "Escoge al menos 3 fotos de la marca (productos, el local, clientes)." };
  const cada = Math.max(MIN_ESCENA, Math.min(1, Number(d.cada) || 0.6));
  const vueltas = fotos.length >= 8 ? 1 : 2;
  const orden = Array.from({ length: Math.min(16, fotos.length * vueltas) }, (_, k) => fotos[k % fotos.length]);
  const escenas = orden.map((f, k) => ({
    id: `e${k + 1}`, tipo: k === 0 ? "gancho" : "producto", habla: "", pausa: 0, fondo: { tipo: "plano", color: "oscuro" }, transicion: { tipo: "corte" },
    capas: [
      { tipo: "imagen", id: "f", archivo: f, rol: "foto", recorte: "cubrir", encuadre: "completo", dura: cada, oscurecer: 0.35, entra: { s: 0 } },
      // El logo en el MISMO sitio y del mismo tamaño en todas: se ve fijo mientras el fondo cambia.
      { tipo: "logo", id: "logo", placa: "claro", pos: "centro", tam: 0.42, entra: { s: 0 }, animacion: { entrada: k === 0 ? "escala" : "aparece" } },
    ],
  }));
  escenas.push(cierre(`e${escenas.length + 1}`, { llamado: d.llamado, producto: null }));
  return { guion: base(d.titulo || "Logo", escenas) };
}

const ARMAR = { comentarios, busqueda, producto, logo };

/**
 * El guion de una plantilla → { guion } | { error }. `datos` según la plantilla:
 *   comentarios: { usuario?, comentario, likes?, respuestas: [≤ 4], producto? (id de la galería), llamado? }
 *   busqueda:    { busqueda, resultados: [≤ 4], producto?, nombre?, precio?, llamado? }
 *   producto:    { fotos: [1–3 ids], textos?: [≤ 8], precio?, golpes? (6–12), cada? (s), llamado? }
 *   logo:        { fotos: [3–12 ids], cada? (s), llamado? }
 * Pura: lo valida `validarGuion` como cualquier guion (y las imágenes, que sean de ese cliente, el servidor).
 */
export function guionDePlantilla(plantilla, datos = {}) {
  const armar = ARMAR[plantilla];
  if (!armar) return { error: `Esa plantilla no existe. Opciones: ${Object.keys(ARMAR).join(", ")}.` };
  return armar(datos ?? {});
}
