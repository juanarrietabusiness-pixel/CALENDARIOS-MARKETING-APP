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

/** Un guion de ejemplo, neutro, que valida. Tres escenas: gancho, explicación y cierre. */
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
        { tipo: "cifra", id: "n", valor: 3, pos: "centro", tam: 0.5, entra: { palabra: 0 }, animacion: { entrada: "escala" } },
        { tipo: "texto", id: "t", texto: "errores que casi todos cometen", rol: "titular", pos: "abajo", entra: { palabra: 5 }, animacion: { entrada: "sube" } },
      ],
    },
    {
      id: "e2", tipo: "explicacion", habla: "El primero: decidir sólo por el precio y no por lo que de verdad necesitas.", pantalla: "No sólo el precio",
      fondo: { tipo: "plano", color: "fondo" }, transicion: { tipo: "deslizar", dur: 0.4 },
      capas: [
        { tipo: "sello", id: "s", texto: "Error 1", pos: "arriba", entra: { palabra: 1 }, animacion: { entrada: "rebote" } },
        { tipo: "lista", id: "l", items: ["Sólo el precio", "Lo que necesitas"], pos: "centro", entra: { palabra: 3 }, animacion: { entrada: "sube" } },
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
    "RAÍZ: version (1), titulo (≤ 120), formatos (el primero es el principal: " + Object.keys(FORMATOS_VIDEO).join(", ") + "), estilo, escenas, subtitulos, musica (null por ahora).",
    `Duración total de ${MIN_SEGUNDOS} a ${MAX_SEGUNDOS} s; de 1 a ${MAX_ESCENAS} escenas; hasta ${MAX_CAPAS} capas por escena.`,
    `estilo: paleta {token: "#RRGGBB"} (opcional), fuentes {titular, cuerpo: "kit"}, grano (0–1), ritmo (${RITMOS.join("|")}), ilustracion (${ILUSTRACIONES.join("|")}).`,
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
    "",
    "EJEMPLO (neutro, valida):",
    JSON.stringify(EJEMPLO_GUION),
  ].join("\n");
}
