// ============================================================
// El MANUAL DEL EDITOR de videos grabados (puro)
//
// Lo que sabe la agencia de editar un video que grabó una persona (clips de alguien hablando a cámara), para que un
// chat NUEVO de Claude, sin historial, edite igual o mejor que los videos que ya se aprobaron (Rofer · reel de Alex v2,
// Comunidad v3). La propuesta entera: docs/propuesta-edicion-video-grabado.md.
//
// POR PARTES. Lo COMÚN a todo video (diagnóstico, propuesta, corte, gancho, imagen, textos, subtítulos, sonido,
// llamado, revisión) y lo de cada TIPO de video, porque reconocer el tipo es lo primero y decide las técnicas:
//   · persona-a-camara    completo (Rofer)
//   · persona-y-pantalla  en prueba (lo aprendido de Comunidad v3)
//   · sin-persona         sin escribir, marcado
//   · solo-idea           no es una edición: va por la receta del video animado
//
// LA CASA Y LA AGENCIA. La base vive aquí, escrita con los números de src/lib/oficioEdicion.js (una sola fuente). La
// agencia cambia las partes que quiera en Ajustes → Manuales de la agencia → «Editor de video»; lo que no cambió, vale
// el de la casa. Cada guardado es una VERSIÓN nueva en D1 (`manual_editor_versiones`, worker/rutas/manualEditor.js) y
// volver atrás es otra versión con las partes de la vieja: la historia no se borra.
//
// LA HUELLA. Con cada parte cambiada se guarda la huella de la base de entonces: si después la casa mejora esa parte,
// la pantalla lo dice («la versión de la casa cambió desde tu edición») en vez de taparlo para siempre.
//
// Lo importan la pantalla, el Worker y (Fase 4) `guia_de_edicion`, que lo entrega compacto con `manualParaClaude`.
// ============================================================

import { personalidadesEnTexto } from "./personalidadEdicion.js";
import { OFICIO, coma, rango, db } from "./oficioEdicion.js";

/** Lo más largo que puede ser una parte común y una de tipo (la de la casa y la de la agencia). */
export const MAX_PARTE_COMUN = 2_000;
export const MAX_PARTE_TIPO = 4_000;

const { silencio: S, rescate: R, camara: C, zonas: Z, subtitulos: ST, musica: M, ducking: D, voz: V, master: MA, hoja: H, cierre: CI } = OFICIO;
const pct = (f) => `${Math.round(f * 100)} %`;
const lineas = (...l) => l.map((x) => `- ${x}`).join("\n");

/** Los estados de un tipo de video en el manual. */
export const ESTADOS_TIPO = Object.freeze({
  completo: "Completo",
  "en-prueba": "En prueba",
  vacio: "Sin escribir",
  "otro-camino": "No es una edición",
});

/** Las partes COMUNES, en el orden en que se trabaja. */
const COMUNES = [
  {
    id: "diagnostico",
    nombre: "Antes de editar",
    base: lineas(
      "Lee la marca en el calendario antes de nada: identidad_video, guia_de_diseno, lexico_de_marca y buscar_cerebro.",
      "Mira los clips antes de decidir (una hoja de contactos de cada uno) y RECONOCE EL TIPO DE VIDEO: persona hablando a cámara en un lugar real, persona y pantalla, sin persona (tomas, texto y locución) o sólo una idea. El tipo decide las técnicas: lo que sirve en uno estorba en otro.",
      "Sólo datos VERIFICADOS del cerebro. Una cifra que no está escrita no sale («14 equipos propios», sí; unas toneladas sin confirmar, no).",
      "El contacto (WhatsApp, @usuario) sale de la nota «Datos del negocio» del cerebro, no del resumen (la Ficha técnica) ni del campo de la ficha del cliente, que pueden haberse quedado viejos. Si no coinciden, díselo a la persona antes de escribirlo en el video.",
      "Respeta cómo habla la persona: si tutea, se deja. Lo que escribe la marca (titulares, sellos, cierre) va en el registro de la marca.",
    ),
  },
  {
    id: "propuesta",
    nombre: "La propuesta corta",
    base: lineas(
      "Antes de editar, una propuesta corta a la persona: el tipo de video, el gancho, el plan de escenas (qué pieza entra con qué palabra) y la música (de la biblioteca o, si ninguna sirve, una nueva con Suno).",
      "Con 2 o 3 CUADROS DE MUESTRA con la marca, no sólo texto: el cuadro 0 con el gancho, un gráfico detrás de la persona y los subtítulos. En Rofer, aprobar esos bocetos antes de editar fue clave.",
      "Si la marca aún no tiene su estilo (sus variantes guardadas), la propuesta enseña 2 o 3 ESTILOS distintos con los mismos cuadros (guia_de_edicion los da; node kit.mjs estilos los pinta) para que la persona ESCOJA; el escogido (node kit.mjs elegir) se guarda con su sí como estilo de la marca (estilo_de_edicion, «variantes»).",
      "No se edita sin su «sí». Lo que corrija, se apunta para el acta.",
    ),
  },
  {
    id: "estilo",
    nombre: "El estilo de la marca",
    base: lineas(
      "Cada marca tiene SU estilo: las variantes del kit (transición, entrada de texto, subtítulos, cierre, ritmo y forma) en plan.variantes; node kit.mjs variantes las lista. Sin «variantes» sale el juego de Rofer v2: eso es copiar a Rofer.",
      "Si la marca ya tiene sus variantes guardadas (guia_de_edicion las da), van TAL CUAL: así sus videos salen coherentes entre sí.",
      "Si no, se eligen por la PERSONALIDAD de la marca, leída en su kit, su rubro y su cerebro (guia_de_edicion sugiere una, pero decides tú):",
      ...personalidadesEnTexto(),
      "Una marca que no encaja en ninguna se arma con lo que más se le parezca, y se dice por qué.",
      "NUNCA copies el estilo de otro cliente: guia_de_edicion enseña las variantes de las demás marcas; 3 o 4 iguales de transición, entrada, subtítulos y cierre se ven iguales (y estilo_de_edicion no las guarda).",
      "Los ejemplos de este manual (Rofer, Comunidad) dicen QUÉ se escribe y DÓNDE va, no cómo se ve.",
    ),
  },
  {
    id: "corte",
    nombre: "Corte",
    base: lineas(
      "Transcribe por palabra (faster-whisper large-v3-turbo). Corta por la palabra, en el punto más silencioso cercano y con fundidos de " + S.fundidoMs + " ms. Quita las tomas repetidas: se queda la mejor dicha.",
      `Silencios relativos a la VOZ, no un umbral fijo: toda pausa por debajo de (voz ${db(S.umbralDb)} dB) que dure más de ${coma(S.minimo)} s queda en ${coma(S.queda.toFixed(2))} s.`,
      "Iguala el nivel de cada clip.",
      `Para rescatar un clip flojo: el llamado ${db(R.llamadoDb)} dB, presencia (${coma(R.presenciaHz / 1000)} kHz ${db(R.presenciaDb)} dB), un ${Math.round((R.atempo - 1) * 100)} % más rápido con atempo (sin cambiar el tono) y realzar SÓLO la palabra susurrada (${db(R.susurroDb)} dB en ella).`,
    ),
  },
  {
    id: "gancho",
    nombre: "Gancho y portada",
    base: lineas(
      "El cuadro 0 ya muestra el gancho COMPLETO: es la portada del perfil. Nada de logo ni presentación al empezar.",
      "El gancho escrito dice el dolor o el deseo de quien lo ve, en el registro de la marca, y entra con la primera palabra que lo dice.",
    ),
  },
  {
    id: "imagen",
    nombre: "Imagen y cámara",
    base: lineas(
      `Cámara virtual por tramo: alterna abierto (≈${rango(C.abierto)}) y medio (≈${rango(C.medio)}) en cada corte, con un golpe de zoom al entrar a cada tramo.`,
      `Sigue la cabeza (desde la máscara de la persona), suavizado y sólo al ${pct(C.seguir)}.`,
      `Si la persona está lejos, acerca hasta ≈${coma(C.maxAcercar)}× y sube la nitidez de ese clip: más de ${coma(C.maxAcercar)}× se ve blando.`,
      "Cambio de clip: la transición del estilo de la marca (plan.variantes.transicion) y su efecto de transición. Salto dentro del mismo clip: destello corto + obturador.",
    ),
  },
  {
    id: "textos",
    nombre: "Textos y gráficos",
    base: lineas(
      "TEXTO GIGANTE DETRÁS de la persona, en el cielo o el espacio libre de arriba, con la persona recortada encima. Es lo que más gustó.",
      "Usa el espacio de arriba: nunca listas ni gráficos a la altura de la cara.",
      "Lo de arriba va un poco alto, con AIRE sobre la cabeza: se mide desde el tope REAL de la cabeza o del casco (la máscara de la persona), no desde la caja de la cara.",
      `Respeta sólo las franjas seguras: ${pct(Z.arriba)} arriba y ${pct(Z.abajo)} abajo.`,
      "Una palabra gigante puede quedar un poco detrás de la cabeza, pero tiene que leerse: si la cabeza tapa letras clave, cambia el texto («+20 AÑOS» en una línea, no partido).",
      "Los textos van en espacio de PANTALLA, nunca dentro del cuadro que hace zoom: ahí se descentran, se inclinan o se rompen.",
      "Cada gráfico entra con la palabra que lo dice y con su efecto del catálogo alineado a su pico. Mientras un gráfico dice algo, el subtítulo no lo repite.",
      "Sellos para los datos fuertes, cinta de obra para lo negativo (sólo si le va a la marca: en una de lujo o familiar, otra pieza), fichas con icono para los pares, preguntas numeradas en placas. Los textos entran con la entrada del estilo (plan.variantes.entrada).",
    ),
  },
  {
    id: "subtitulos",
    nombre: "Subtítulos",
    base: lineas(
      "El estilo es el de las variantes de la marca (plan.variantes.subtitulos) o, si no lo fija, el de su identidad de video (identidad_video): clásico, palabra a palabra, sobre placa o limpio.",
      `Grupos de hasta ${ST.maxPalabras} palabras, UNA línea, con el tamaño ajustado al ancho MEDIDO de la letra y centrados; lo aún no dicho, tenue.`,
      "Sin agrandar palabras sueltas: se comen el espacio.",
      `Dentro de la franja segura de abajo (${pct(Z.abajo)}) y nunca encima de un gráfico, tampoco de uno que aún no salió.`,
    ),
  },
  {
    id: "sonido",
    nombre: "Sonido",
    base: lineas(
      "Música SIEMPRE de la biblioteca del cliente (primero las de su identidad de video) o generada con Suno cuando ninguna sirva. Nunca compuesta con código.",
      `Que se oiga: bajo la voz, ${M.debajoDeLaVoz.join("–")} dB por debajo de ella (en Rofer, la canción de −14 dB RMS quedó en ${db(M.bajoVoz)}); en el llamado, ${db(M.llamado)}; en el cierre sin voz, ${db(M.cierre)}. La primera versión de Rofer la tenía 19 dB por debajo y «ni se escuchaba».`,
      `Ducking que empieza ≈${Math.round(D.anticipacion * 1000)} ms ANTES de la voz, con ataque de ${Math.round(D.ataque * 1000)} ms y liberación de ${coma(D.liberacion)} s.`,
      "La música se corta al montaje en límites de COMPÁS (tempo y compases medidos): el drop entra en un corte con energía, el quiebre queda bajo el inicio del llamado, vuelve con la palabra fuerte del llamado y el final de la canción cae en el cierre.",
      "Efectos sólo del catálogo del calendario y de la identidad del cliente (transición, golpe, subida, sello, logo, ítem, cifra), alineados a su «pico».",
      `Voz: paso alto a ${V.pasoAltoHz} Hz, reducción de ruido (arnndn, mezcla ${coma(V.ruidoMezcla)}), compresión suave y de-esser. Máster a ${db(MA.lufs)} LUFS y pico ${db(MA.picoDbtp)} dBTP, medidos DESPUÉS de codificar.`,
    ),
  },
  {
    id: "llamado",
    nombre: "Llamado y cierre",
    base: lineas(
      "El llamado: la pregunta gigante detrás de la persona, un acercamiento fuerte cuando dice «escríbenos» y el botón de WhatsApp con el número cuando dice «WhatsApp», con su toque animado.",
      `Cierre de ${CI.segundos} s sin voz, con el cierre del estilo (plan.variantes.cierre: tarjeta, limpio, banda o círculo): logo, llamado de la marca, número y @usuario, con los datos verificados.`,
    ),
  },
  {
    id: "revision",
    nombre: "Revisión antes de entregar",
    base: lineas(
      "Cuadros fijos de los momentos más cargados → corregir → UN render completo.",
      `Hoja de contactos del video final (un cuadro cada ≈${coma(H.cadaSegundos)} s) para cazar solapes: un subtítulo encima de un gráfico que aún no salió, un texto pegado a la cabeza, algo fuera de la franja segura.`,
      "Mide el audio por tramos (voz frente a música y efectos) y la sonoridad final.",
      "Para un arreglo pequeño, renderiza sólo ese tramo y móntalo encima.",
      "Al entregar: súbelo a la galería del cliente (y a su publicación, si la tiene) y deja el acta con lo que corrigió la persona.",
    ),
  },
];

/** Los TIPOS de video grabado, cada uno con su parte. */
const TIPOS = [
  {
    id: "persona-a-camara",
    nombre: "Persona a cámara (en un lugar real)",
    ejemplo: "Rofer · Alex en obra",
    estado: "completo",
    base: [
      "Una persona habla a cámara en un lugar real (Rofer: Alex en la obra). El lugar también vende: que se vea.",
      lineas(
        "Nada de modo celular ni candado: no tocan en este tipo (en Rofer no se metieron, y es lo correcto).",
        "El cielo o el espacio de arriba es el lienzo: ahí van el gancho gigante, los datos fuertes y la pregunta del llamado, con la persona recortada encima.",
        "La cámara alterna abierto y medio en cada corte; los saltos dentro de un clip, con destello y obturador; los cambios de clip, con la transición del estilo de la marca.",
        "Persona lejos: acercar hasta ≈2× con más nitidez. Si no aguanta, ese tramo va abierto con el gráfico arriba.",
        "La persona habla como habla; lo escrito va en el registro de la marca (Rofer trata de usted aunque Alex tutee al hablar).",
        "Ejemplos de Rofer (de QUÉ decir y dónde, no de cómo se ve: su estilo es suyo): el gancho «LO MÁS CARO / DE UNA OBRA», gigante detrás de Alex desde el cuadro 0; el sello «FLOTA PROPIA · 14 EQUIPOS»; la cinta «EQUIPO EQUIVOCADO»; las fichas TIEMPO / DINERO; el llamado «¿UNA OBRA POR COMENZAR?».",
      ),
    ].join("\n"),
  },
  {
    id: "persona-y-pantalla",
    nombre: "Persona y pantalla",
    ejemplo: "Comunidad v3",
    estado: "en-prueba",
    base: [
      "Una persona explica algo que se ve en una pantalla (Comunidad v3). EN PRUEBA: dile a la persona que este tipo aún se está afinando.",
      lineas(
        "Alterna a la persona y lo que se explica; lo de la pantalla va en «modo celular», dentro de un teléfono.",
        "Los textos, en espacio de pantalla y nunca dentro del contenedor que hace zoom: en Comunidad se inclinaban a un lado o se rompían (corrección de la agencia).",
        "Lo que falta de este tipo se escribe con el código de Comunidad v3.",
      ),
    ].join("\n"),
  },
  {
    id: "sin-persona",
    nombre: "Sin persona",
    ejemplo: "Tomas, texto y locución",
    estado: "vacio",
    base: "",
  },
  {
    id: "solo-idea",
    nombre: "Sólo una idea",
    ejemplo: "Sin clips grabados",
    estado: "otro-camino",
    base: "No es una edición: sin clips grabados, el video se hace con la receta «video-animado» (crear_video), no con este manual.",
  },
];

/** Todas las partes, con su id completo (`comun.corte`, `tipos.persona-a-camara`) y su tope. */
export const PARTES_EDITOR = Object.freeze([
  ...COMUNES.map((p) => Object.freeze({ ...p, id: `comun.${p.id}`, grupo: "comun", tope: MAX_PARTE_COMUN })),
  ...TIPOS.map((p) => Object.freeze({ ...p, id: `tipos.${p.id}`, grupo: "tipo", tope: MAX_PARTE_TIPO })),
]);
const POR_ID = new Map(PARTES_EDITOR.map((p) => [p.id, p]));

/** Los ids de los tipos de video grabado («persona-a-camara»…). */
export const TIPOS_VIDEO_GRABADO = Object.freeze(TIPOS.map((t) => t.id));

const largo = (t, n) => String(t ?? "").replace(/\r/g, "").trim().slice(0, n);

/** La huella de un texto (FNV-1a de 32 bits, en hex): para saber si la base cambió, no para seguridad. Pura. */
export function huella(texto) {
  let h = 0x811c9dc5;
  for (const c of String(texto ?? "")) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Lo que la agencia cambió, limpio: sólo ids que existen, sin vacíos y con el tope de cada parte. Pura. */
export function limpiarPartes(partes) {
  if (!partes || typeof partes !== "object" || Array.isArray(partes)) return {};
  const fuera = {};
  for (const [id, texto] of Object.entries(partes)) {
    const p = POR_ID.get(id);
    const t = p && typeof texto === "string" ? largo(texto, p.tope) : "";
    // Lo idéntico a la casa no es un cambio: si no, la parte quedaría congelada y no recibiría las mejoras de la casa.
    if (t && t !== p.base) fuera[id] = t;
  }
  return fuera;
}

/** Las huellas de la base de las partes que la agencia cambió (lo que se guarda con la versión). Pura. */
export const huellasDeLaBase = (partes) => Object.fromEntries(Object.keys(limpiarPartes(partes)).map((id) => [id, huella(POR_ID.get(id).base)]));

/** El texto que vale de cada parte: el de la agencia o el de la casa. Pura. */
export function manualVigente(partes) {
  const propias = limpiarPartes(partes);
  return Object.fromEntries(PARTES_EDITOR.map((p) => [p.id, propias[p.id] ?? p.base]));
}

/** Las partes cambiadas por la agencia cuya base de la casa cambió después (para avisar en la pantalla). Pura. */
export function cambiosDeLaCasa(partes, bases) {
  const propias = limpiarPartes(partes);
  const guardadas = bases && typeof bases === "object" ? bases : {};
  return Object.keys(propias).filter((id) => guardadas[id] && guardadas[id] !== huella(POR_ID.get(id).base));
}

/** Las partes en que `a` y `b` dicen distinto (con lo de la casa para lo que no está). Pura. */
export function partesDistintas(a, b) {
  const x = limpiarPartes(a);
  const y = limpiarPartes(b);
  return PARTES_EDITOR.map((p) => p.id).filter((id) => (x[id] ?? "") !== (y[id] ?? ""));
}

/**
 * Juntar al guardar cuando otra persona guardó entretanto (el 409): lo que YO cambié desde lo que leí va encima de lo
 * último guardado. Si los dos cambiamos la misma parte, es un choque y no se junta sola. Pura.
 * @returns {{ partes: object, choques: string[] }}
 */
export function juntarPartes({ leidas, mias, ultimas }) {
  const base = limpiarPartes(leidas);
  const propias = limpiarPartes(mias);
  const otras = limpiarPartes(ultimas);
  const mioCambiado = partesDistintas(base, propias);
  const suyoCambiado = new Set(partesDistintas(base, otras));
  const choques = mioCambiado.filter((id) => suyoCambiado.has(id) && (propias[id] ?? "") !== (otras[id] ?? ""));
  const partes = { ...otras };
  for (const id of mioCambiado) {
    if (choques.includes(id)) continue;
    if (propias[id]) partes[id] = propias[id];
    else delete partes[id];
  }
  return { partes: limpiarPartes(partes), choques };
}

/**
 * El manual COMPACTO para Claude: lo común y lo del tipo pedido, con la versión. Lo entrega `guia_de_edicion` (Fase 4).
 * Sin tipo (o uno que no existe), lo común y la lista de tipos para que lo reconozca primero. Pura.
 */
export function manualParaClaude({ partes = {}, version = 0 } = {}, tipo = "") {
  const vigente = manualVigente(partes);
  const propias = limpiarPartes(partes);
  const elTipo = TIPOS.find((t) => t.id === tipo);
  const cabecera = `MANUAL DEL EDITOR DE LA AGENCIA · ${version ? `versión ${version}` : "el de la casa"}${Object.keys(propias).length ? " (con cambios de la agencia)" : ""}`;
  const bloques = [cabecera];
  for (const p of PARTES_EDITOR.filter((x) => x.grupo === "comun")) bloques.push(`## ${p.nombre.toUpperCase()}\n${vigente[p.id]}`);
  if (elTipo) {
    const id = `tipos.${elTipo.id}`;
    const texto = vigente[id];
    const estado = elTipo.estado === "completo" ? "" : ` · ${ESTADOS_TIPO[elTipo.estado].toUpperCase()}`;
    bloques.push(`## TIPO: ${elTipo.nombre.toUpperCase()}${estado}\n${texto || "Este tipo aún no tiene manual. Díselo a la persona y pídele permiso para seguir sólo con lo común."}`);
  } else {
    bloques.push(`## TIPOS DE VIDEO (reconoce el tuyo y vuelve a pedir el manual con él)\n${TIPOS.map((t) => `- ${t.id}: ${t.nombre} (${t.ejemplo}) · ${ESTADOS_TIPO[t.estado]}`).join("\n")}`);
  }
  return bloques.join("\n\n");
}
