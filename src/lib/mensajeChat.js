// ============================================================
// Un mensaje del chat, partido en bloques
//
// El asistente devuelve TEXTO, y el historial se guarda como texto
// (`chat_messages.content`). Todo lo que no es prosa viaja dentro del
// texto como una marca, para que al recargar se pinte igual que se
// pintó la primera vez:
//
//   [[pieza: Descripción 1]] … [[/pieza]]   un texto que se copia entero
//   [[imagen: clientes/…/x.png | vertical]] una imagen generada
//   [[contexto: Análisis del video]] … [[/contexto]]
//                                           lo que se le adjuntó al modelo
//
// La marca de pieza la escribe el MODELO —se le pide en el prompt—, así
// que el análisis es tolerante: una pieza sin cerrar llega hasta la
// siguiente o hasta el final, y un cierre suelto se ignora. Perder una
// marca no puede comerse el texto.
// ============================================================

export const FORMATOS_IMAGEN = Object.freeze({
  square:     { w: 1080, h: 1080, label: "Cuadrado 1080×1080" },
  vertical:   { w: 1080, h: 1350, label: "Vertical 1080×1350" },
  story:      { w: 1080, h: 1920, label: "Historia 1080×1920" },
  horizontal: { w: 1200, h: 630,  label: "Horizontal 1200×630" },
});

/** Lo que se le pide al modelo para que las piezas salgan separadas. */
export const INSTRUCCION_PIEZAS = `ENTREGA DE PIEZAS (obligatorio):
· Todo texto pensado para publicar o pegar —descripción, caption, guion, copy, gancho, mensaje— va
  entre [[pieza: título corto]] y [[/pieza]], UN bloque por pieza. Si te piden 4 descripciones,
  son 4 bloques; si te piden guion y descripción de un reel, son 2.
· Dentro del bloque, SÓLO el texto listo para pegar: sin repetir el título, sin comentarios tuyos.
· Lo que expliques, sugieras o preguntes va FUERA de los bloques.
· Una respuesta de conversación, sin nada que pegar, no lleva bloques.
Ejemplo:
Aquí tienes las dos opciones:
[[pieza: Descripción 1 — cercana]]
¿Ya probaste…?
[[/pieza]]
[[pieza: Descripción 2 — directa]]
Llegó lo que esperabas…
[[/pieza]]
¿Ajusto el tono de alguna?`;

/** Lo que se le explica al modelo sobre lo que el usuario adjunta. */
export const INSTRUCCION_ADJUNTOS = `ADJUNTOS:
· El usuario puede adjuntarte imágenes y videos, subidos o escogidos del banco de contenido.
· De cada video recibes un análisis escrito —transcripción, texto en pantalla, escenas, estructura y
  estilo— marcado como [[contexto: Video «…»]], y algunos fotogramas. Con eso SÍ puedes ver el video:
  no digas que no puedes. Úsalo para inspirarte: toma la estructura, el gancho y el ritmo, y
  adáptalos a la marca; no copies el texto literal salvo que te lo pidan.`;

// Una clave de R2 de este espacio: siempre cuelga de `clientes/<id>/`, y
// sin `..`. Lo que no cuadre se queda como texto en vez de ir a un `src`.
const CLAVE_VALIDA = /^clientes\/[A-Za-z0-9_-]+\/[A-Za-z0-9_\-/.]+$/;

const MARCA = /\[\[(pieza|contexto)(?::([^\]\n]*))?\]\]|\[\[\/(pieza|contexto)\]\]|\[\[imagen:([^\]\n]*)\]\]/gi;

export function claveImagenValida(clave) {
  return typeof clave === "string" && CLAVE_VALIDA.test(clave) && !clave.includes("..");
}

export function marcarImagen(clave, formato = "square") {
  return `[[imagen: ${clave} | ${formato}]]`;
}

export function marcarContexto(titulo, texto) {
  return `[[contexto: ${titulo.replace(/[\]\n]/g, " ")}]]\n${texto}\n[[/contexto]]`;
}

function leerImagen(cuerpo) {
  const [clave = "", formato = ""] = cuerpo.split("|").map((s) => s.trim());
  if (!claveImagenValida(clave)) return null;
  return { tipo: "imagen", clave, formato: FORMATOS_IMAGEN[formato] ? formato : "square" };
}

/**
 * Parte el contenido en bloques. Nunca lanza, y nunca devuelve un
 * bloque vacío.
 * @returns {Array<{tipo:"texto",texto:string}|{tipo:"pieza"|"contexto",titulo:string,texto:string}|{tipo:"imagen",clave:string,formato:string}>}
 */
export function partirMensaje(contenido) {
  const texto = typeof contenido === "string" ? contenido : "";
  const bloques = [];
  let abierto = null;
  let desde = 0;

  const sueltoHasta = (hasta) => {
    const t = texto.slice(desde, hasta).trim();
    if (t) bloques.push({ tipo: "texto", texto: t });
  };
  const cerrar = (hasta) => {
    const t = texto.slice(desde, hasta).trim();
    if (t) bloques.push({ tipo: abierto.tipo, titulo: abierto.titulo, texto: t });
    abierto = null;
  };

  for (const m of texto.matchAll(MARCA)) {
    const [entero, apertura, titulo, cierre, imagen] = m;
    const i = m.index;

    if (apertura) {
      if (abierto) cerrar(i); else sueltoHasta(i);
      abierto = { tipo: apertura.toLowerCase(), titulo: (titulo ?? "").trim() };
      desde = i + entero.length;
    } else if (cierre) {
      if (abierto) {
        cerrar(i);
        desde = i + entero.length;
      }
    } else if (imagen !== undefined && !abierto) {
      const bloque = leerImagen(imagen);
      if (!bloque) continue;
      sueltoHasta(i);
      bloques.push(bloque);
      desde = i + entero.length;
    }
  }

  if (abierto) cerrar(texto.length); else sueltoHasta(texto.length);
  return bloques;
}
