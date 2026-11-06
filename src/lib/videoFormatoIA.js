// ============================================================
// El formato de escenas v1 CONTADO a una IA (puro): lo que devuelve la herramienta `formato_video`
//
// Sale del MISMO vocabulario que valida (`COMPONENTES`, `TIPOS_ESCENA`, las listas de animación…) y no de un texto
// escrito aparte: si mañana se añade un componente o una entrada, Claude lo ve sin que nadie se acuerde de actualizar
// nada. La explicación larga, con ejemplos, sigue en docs/formato-escenas-v1.md (eso no llega al Worker).
//
// `EJEMPLO_GUION` es un guion NEUTRO —ningún cliente, ninguna marca— y un test exige que `validarGuion` lo acepte: un
// ejemplo que no valida enseñaría a escribir guiones que se rechazan.
// ============================================================

import {
  COMPONENTES, TIPOS_ESCENA, TOKENS_COLOR, POSICIONES, ENTRADAS, SALIDAS, BUCLES, TRANSICIONES, FONDOS, RITMOS,
  ILUSTRACIONES, FORMATOS_VIDEO, MIN_SEGUNDOS, MAX_SEGUNDOS, MAX_ESCENAS, MAX_CAPAS, MAX_HABLA, MAX_PANTALLA, MAX_PAUSA,
  MAX_SEGUNDOS_CANCION, MAX_ESCENAS_CANCION,
} from "./videoEscenas.js";
import { COMPONENTES_LISTOS } from "./motorVideo.js";

/** Una propiedad dicha en una línea: «texto* (≤ 80)», «rol: titular|apoyo…», «color (token o #RRGGBB)». */
function propiedad(nombre, def) {
  const req = def.req ? "*" : "";
  switch (def.t) {
    case "texto": return `${nombre}${req} (texto ≤ ${def.max})`;
    case "enum": return `${nombre}${req}: ${def.lista.join("|")}`;
    case "num": return `${nombre}${req} (${def.min} a ${def.max})`;
    case "color": return `${nombre} (color)`;
    case "bool": return `${nombre} (sí/no)`;
    case "textos": return `${nombre}${req} (lista de hasta ${def.max} textos ≤ ${def.maxTexto})`;
    case "lista": return `${nombre} (lista de hasta ${def.max}: ${Object.entries(def.item).map(([k, d]) => propiedad(k, d)).join(", ")})`;
    default: return nombre;
  }
}

/**
 * Un guion de ejemplo, neutro, que valida y que el motor ya dibuja entero (sólo componentes de `COMPONENTES_LISTOS`: un
 * ejemplo con marcadores enseñaría justo lo que hay que evitar). Tres escenas: gancho, explicación y cierre.
 */
export const EJEMPLO_GUION = Object.freeze({
  version: 1,
  titulo: "Tres errores al elegir",
  formatos: ["9:16"],
  estilo: { ritmo: "medio", grano: 0.2 },
  subtitulos: { activo: true, pos: "abajo", maxPalabras: 4 },
  escenas: [
    {
      id: "e1", tipo: "gancho", habla: "[intrigada] ¿Sabías que casi todos cometen estos tres errores?", pantalla: "3 errores",
      fondo: { tipo: "degradado", color: "fondo", color2: "superficie" }, transicion: { tipo: "corte" },
      capas: [
        { tipo: "cifra", id: "n", valor: 3, etiqueta: "errores", color: "acento", pos: "centro", entra: { palabra: 0 }, animacion: { entrada: "escala" } },
        { tipo: "texto", id: "t", texto: "errores que casi todos cometen", rol: "titular", pos: "abajo", entra: { palabra: 5 }, animacion: { entrada: "sube" } },
      ],
    },
    {
      id: "e2", tipo: "explicacion", habla: "El primero: decidir sólo por el precio y no por lo que de verdad necesitas.", pantalla: "No sólo el precio",
      fondo: { tipo: "puntos", color: "fondo" }, transicion: { tipo: "deslizar", dur: 0.4 },
      capas: [
        { tipo: "sello", id: "s", texto: "Error 1", pos: "arriba", entra: { palabra: 1 }, animacion: { entrada: "rebote" } },
        { tipo: "texto", id: "l", texto: "Mira lo que necesitas, no sólo el precio", rol: "apoyo", placa: "superficie", pos: "abajo", entra: { palabra: 3 }, animacion: { entrada: "sube" } },
        { tipo: "icono", id: "i", nombre: "dinero", fondo: "superficie", pos: "centro", tam: 0.3, entra: { palabra: 2 }, animacion: { entrada: "escala" } },
      ],
    },
    {
      id: "e3", tipo: "cierre", habla: "Guarda este video y escríbenos para ayudarte a escoger.", pantalla: "Escríbenos",
      fondo: { tipo: "plano", color: "acento" }, transicion: { tipo: "fundido", dur: 0.3 }, pausa: 0.6,
      capas: [
        { tipo: "logo", id: "logo", pos: "centro", entra: { palabra: 0 }, animacion: { entrada: "escala", bucle: "late" } },
        { tipo: "llamado", id: "cta", texto: "Escríbenos", pos: "abajo", entra: { palabra: 4 }, animacion: { entrada: "rebote" } },
      ],
    },
  ],
});

/** Un dibujo de ejemplo (una taza de café con su vapor): lo que se pide con formas simples, sin tocar el código. */
export const EJEMPLO_DIBUJO = Object.freeze({
  tipo: "dibujo", id: "taza", pos: "centro", tam: 0.5, proporcion: 1, entra: { palabra: 0 },
  formas: [
    { figura: "rect", x: 0.45, y: 0.62, w: 0.5, h: 0.42, radio: 0.12, color: "claro", entrada: "sube" },
    { figura: "arco", x: 0.74, y: 0.6, w: 0.2, inicio: 270, fin: 90, relleno: false, grosor: 0.05, color: "claro", retraso: 0.2, entrada: "dibuja" },
    { figura: "curva", x: 0.38, y: 0.36, x2: 0.4, y2: 0.1, cx: 0.3, cy: 0.22, relleno: false, grosor: 0.025, color: "acento", retraso: 0.4, entrada: "dibuja" },
    { figura: "curva", x: 0.52, y: 0.36, x2: 0.54, y2: 0.1, cx: 0.62, cy: 0.22, relleno: false, grosor: 0.025, color: "acento", retraso: 0.55, entrada: "dibuja" },
  ],
});

/** El formato entero en texto para una IA: las reglas, el vocabulario, los componentes y un ejemplo. Pura. */
export function formatoParaLaIA() {
  const componentes = Object.entries(COMPONENTES).map(([tipo, c]) => {
    const props = Object.entries(c.props).map(([k, d]) => propiedad(k, d)).join("; ");
    const listo = COMPONENTES_LISTOS.includes(tipo) ? "" : " [AÚN SE DIBUJA COMO MARCADOR en la vista previa: válido, pero mejor evitarlo]";
    return `· ${tipo} — ${c.nombre}${props ? `: ${props}` : ""}${listo}`;
  });
  return [
    "FORMATO DE ESCENAS v1 del video animado (un JSON). Lo valida el servidor: un guion con errores no se guarda y la respuesta dice cada error con su sitio.",
    "",
    "LAS TRES REGLAS",
    "1. Las escenas se anclan a PALABRAS, no a segundos: el «habla» de todas las escenas, en orden, ES la locución (una sola toma). Una capa entra con {\"palabra\": n} (la n-ésima palabra que se dice EN SU escena, desde 0) o {\"s\": segundos} desde que empieza la escena. Las [emociones] entre corchetes no cuentan como palabras.",
    "2. Las posiciones son ZONAS («arriba», «centro», «abajo»; con -izq/-der para ir lado a lado): dicen el ORDEN de arriba abajo y el motor reparte el área segura sin encimar nada. No pongas coordenadas salvo que haga falta ({\"x\":0.5,\"y\":0.3}, de 0 a 1). «tam» es el ancho en fracción del lado corto.",
    `3. Los colores son tokens del estilo (${TOKENS_COLOR.join(", ")}) o #RRGGBB. Sin paleta propia salen del kit de marca del cliente: no inventes colores de marca.`,
    "",
    "RAÍZ: version (1), titulo (≤ 120), formatos (el primero es el principal: " + Object.keys(FORMATOS_VIDEO).join(", ") + "), estilo, escenas, subtitulos, musica ({\"estilo\": \"la música con género Y subgénero concretos, 3–4 instrumentos, BPM y atmósfera (p. ej. «indie folk acústico, ukelele, palmas y contrabajo, 100 BPM, cálido y luminoso»; nada de «corporativa alegre», nunca artistas ni canciones)\", \"instrumental\": true} o null: es la PISTA del director musical, que escucha el video ya hecho y la música de la marca antes de pedirla a Suno; la mezcla va debajo de la voz).",
    `Duración total de ${MIN_SEGUNDOS} a ${MAX_SEGUNDOS} s; de 1 a ${MAX_ESCENAS} escenas; hasta ${MAX_CAPAS} capas por escena.`,
    `estilo: paleta {token: "#RRGGBB"} (opcional), fuentes {titular, cuerpo: "kit"}, grano (0–1), ritmo (${RITMOS.join("|")}), ilustracion (${ILUSTRACIONES.join("|")}), personaje {piel, pelo, ropa, accesorio} (opcional: sin él, el aspecto del kit del cliente, que fija personaje_video).`,
    "subtitulos: activo (sí/no), pos (abajo|centro|arriba), maxPalabras (1–4), maxCaracteres (10–30), acento (color). Tienen su franja propia: nada se pone encima.",
    "",
    "ESCENA",
    `id (único), tipo (${Object.keys(TIPOS_ESCENA).join("|")}), habla (≤ ${MAX_HABLA}: lo que se dice), pantalla (≤ ${MAX_PANTALLA}: el texto principal, para leer el guion de un vistazo), pausa (0–${MAX_PAUSA} s de silencio detrás del habla; una escena muda la necesita), fondo {tipo: ${FONDOS.join("|")}, color, color2}, transicion {tipo: ${TRANSICIONES.join("|")}, dur 0–1}, capas.`,
    "Para qué es cada tipo de escena:",
    ...Object.entries(TIPOS_ESCENA).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "CAPA: tipo, id (único en la escena), pos, tam, entra, sale (vacío: hasta el final), animacion {entrada: " + ENTRADAS.join("|") + "; salida: " + SALIDAS.join("|") + "; bucle: " + BUCLES.join("|") + "}.",
    "Posiciones: " + POSICIONES.join(", ") + ". (* = obligatorio)",
    ...componentes,
    "",
    "CONSEJOS: el gancho dice lo importante en el primer segundo y su texto entra en la palabra 0; una idea por escena; texto en pantalla corto (lo largo va en el habla); las imágenes son IDs de la galería del cliente (ver_estudio), nunca inventadas; la escena de cierre lleva el logo y un llamado.",
    "LLENA EL CUADRO: cada escena con una pieza visual grande (cifra, anillo, icono, dibujo o imagen) y su texto; una escena con sólo una frase se ve vacía. revisar_video avisa de texto pequeño, escena vacía y escena cargada a un lado.",
    "PIEZAS: «cifra» es un número gigante que cuenta hasta su valor (prefijo «$», sufijo «%» o «años», etiqueta debajo); «anillo» un porcentaje que se llena (o su texto en medio); «icono» uno de la lista, con «fondo» si va en un círculo de color; el logo se recorta solo de su fondo liso y lleva placa si no contrasta (o «placa» con un color).",
    "DIBUJO (lienzo libre): para un objeto propio del video (una taza, una casa, un gráfico) sin imagen. Formas en FRACCIONES de su caja (0,0 arriba a la izquierda; 1,1 abajo a la derecha): circulo, elipse, rect (con radio), triangulo, estrella, corazon, gota (x, y = el centro; w, h = el tamaño; h 0 = tan alto como ancho), linea y curva (de x,y a x2,y2; la curva dobla hacia cx,cy) y arco (inicio y fin en grados). relleno false = sólo el trazo (grosor). Cada forma entra con su «retraso» (s) y su «entrada»; «dibuja» traza las líneas. Pocas formas y grandes: es un icono, no una ilustración. Ejemplo: " + JSON.stringify(EJEMPLO_DIBUJO),
    "FONDOS: plano, degradado, papel, rayas, puntos, estrellas (que titilan) y lineas; color2 elige el color del adorno.",
    "VIDEO (un clip de la galería del cliente: lo que grabó, un video de Kie, uno de Drive; su ID sale en ver_estudio, nunca inventado): encuadre «completo» lo pone a sangre detrás de todo (el texto encima, con «oscurecer» 0,3–0,5 o con placa) y «caja» en su zona como una imagen. «desde» es el segundo del clip donde empieza; «hasta» fija el tramo y la escena dura eso aunque no diga nada (un MONTAJE de clips sin habla no necesita locución). «sonido» true deja oír su audio (el de la persona que habla en un UGC); con habla encima, bájalo con «volumen».",
    `CANCIÓN (MODO CANCIÓN: un video sobre una canción YA GRABADA, voz e instrumental mezclados; «cancion» {archivo, duracion} en la raíz la pone la aplicación con video_con_cancion, no la escribas): el «habla» de las escenas es la LETRA TAL CUAL y en orden; NO se genera voz ni se inserta nada en el audio (sin «pausa»: se ignora); el video dura lo que la canción (hasta ${MAX_SEGUNDOS_CANCION} s y ${MAX_ESCENAS_CANCION} escenas); una escena con «habla» vacío ocupa un hueco instrumental (intro, puente, final) y una escena demasiado corta se AVISA, no se estira. El coro, con más fuerza visual; el texto en pantalla, las palabras clave de la línea.`,
    "IMAGEN A SANGRE: una «imagen» con encuadre «completo» va detrás de todo, como un video (recorte «cubrir» llena el cuadro; «contener» la enseña entera sobre ella misma ampliada y difuminada). «movimiento» la mueve despacio mientras se ve (acercar, alejar o paneo), «dura» hace que la escena dure esos segundos aunque no diga nada (una FOTO CON MÚSICA, sin habla, no necesita locución) y «oscurecer» pone un velo para leer el texto encima.",
    "",
    "EJEMPLO (neutro, valida):",
    JSON.stringify(EJEMPLO_GUION),
  ].join("\n");
}
