// ============================================================
// Los ESTILOS DE EDICIÓN de un cliente (puro): las REGLAS de cómo se editan sus videos GRABADOS
//
// Cómo se editan los videos de Alex en obra (Rofer) o de la Comunidad: qué piezas van y cuándo, la cámara, las
// transiciones, el gancho, el cierre y la música. Son reglas, no contenido: no llevan los textos de un video, sino cuándo
// va cada pieza. Los lee quien edita (guia_de_edicion, Fase 4) junto al manual del editor (src/lib/manualEditor.js); lo que
// un estilo no dice sale del manual y de los números del oficio (src/lib/oficioEdicion.js).
//
// Viven en el kit del cliente (`kit.estilosEdicion`, hasta 6; decisión de la agencia 4: sin tabla propia) y SÓLO los
// escribe su ruta (worker/lib/estudio/estilosEdicion.js, `guardarKit(…, { conEdicion: true })`): el PUT del kit los
// conserva. Se guardan sólo con el «sí» de una persona.
//
// Lo que ya dice la IDENTIDAD DE VIDEO (subtítulos, músicas, efectos: src/lib/identidadVideo.js) no se repite aquí.
// Este archivo lo importa kitMarca.js (y con él la carga inicial): que siga pequeño y sin importar nada.
// ============================================================

export const MAX_ESTILOS_EDICION = 6;
export const MAX_NOTAS_EDICION = 600;
export const MAX_TEXTO_EDICION = 160;
/** El estilo entero, en caracteres de su JSON: lo que cabe en la guía sin desplazar al manual. */
export const MAX_ESTILO_EDICION = 2_000;

/**
 * Los tipos de video grabado, los mismos ids que el manual (TIPOS_VIDEO_GRABADO en manualEditor.js; un test comprueba
 * que coinciden). Aquí escritos a mano para no cargar el manual entero en la carga inicial.
 */
export const TIPOS_ESTILO_EDICION = Object.freeze(["persona-a-camara", "persona-y-pantalla", "sin-persona"]);

/** Las piezas de las que un estilo puede decir cuándo y cómo van (los tipos del kit: src/lib/escenaEdicion.js). */
export const PIEZAS_ESTILO_EDICION = Object.freeze({
  textoDetras: "el texto gigante DETRÁS de la persona (gancho, datos fuertes, la pregunta del llamado)",
  titular: "el titular del cuadro 0",
  tachado: "lo que se tacha (lo que está mal)",
  cinta: "la cinta de peligro (lo negativo)",
  sello: "el sello (datos verificados)",
  fichas: "las fichas (pares: TIEMPO / DINERO)",
  lista: "la lista numerada",
  preguntas: "las preguntas numeradas",
  trio: "el trío (tres cosas en fila)",
  logo: "la tarjeta del logo",
  whatsapp: "el botón de WhatsApp del cierre",
  celular: "el modo celular (lo de la pantalla dentro de un teléfono)",
});

/** Las transiciones que pinta el kit. */
export const TRANSICIONES_EDICION = Object.freeze({
  "barrido-diagonal": "un barrido en diagonal con los colores de la marca",
  "destello-obturador": "un destello blanco con el obturador",
  "corte-seco": "corte seco, sin nada",
});

/**
 * Las VARIANTES del kit que un estilo fija para cada pieza (el catálogo entero, con nombres y descripciones, está en
 * src/lib/variantesEdicion.js; aquí sólo los ids, escritos a mano para no cargarlo en la carga inicial: un test comprueba
 * que coinciden). Con ellas los videos de una marca salen COHERENTES y los de marcas distintas, distintos.
 */
export const VARIANTES_ESTILO_EDICION = Object.freeze({
  transicion: ["barrido", "zoom", "paneo", "deslizar", "glitch", "destello"],
  entrada: ["subir", "golpe", "palabra", "mascara", "maquina", "escala"],
  subtitulos: ["clasico", "palabra", "placa", "limpio"],
  cierre: ["tarjeta", "limpio", "banda", "circulo"],
  ritmo: ["pausado", "normal", "vivo"],
  forma: ["redonda", "recta"],
});
/** Las piezas que más se VEN: dos marcas con 3 o 4 iguales de éstas se ven iguales. */
export const PIEZAS_QUE_SE_VEN = Object.freeze(["transicion", "entrada", "subtitulos", "cierre"]);
export const MAX_IGUALES_ENTRE_MARCAS = 2;

/** Cuántas de las piezas que se ven tienen la misma variante en dos estilos (0 si a alguno le falta). Pura. */
export function igualesEntreVariantes(a, b) {
  if (!esObjeto(a) || !esObjeto(b)) return 0;
  return PIEZAS_QUE_SE_VEN.filter((k) => a[k] && a[k] === b[k]).length;
}

/** Lo numérico de la cámara y de la música, con su rango (lo que se sale, fuera). */
const CAMARA = Object.freeze({ abierto: [1, 1.4], medio: [1, 2], seguir: [0, 1], maxAcercar: [1, 2.5] });
const MUSICA = Object.freeze({ bajoVoz: [-40, 0], llamado: [-40, 0], libre: [-40, 0], cierre: [-40, 0] });

const ID = /^ee-[a-z0-9]{6,16}$/;
const esObjeto = (o) => o && typeof o === "object" && !Array.isArray(o);
const corto = (t, n) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, n) : "");
const enRango = (v, [a, b]) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;

/** Los números que traiga dentro de su rango; lo demás se anota en `errores`. */
function numeros(o, rangos, donde, errores) {
  if (!esObjeto(o)) return null;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (!Object.hasOwn(rangos, k)) { errores.push(`${donde}.${k}: no existe (${Object.keys(rangos).join(", ")}).`); continue; }
    if (enRango(v, rangos[k])) out[k] = Math.round(v * 1000) / 1000;
    else errores.push(`${donde}.${k}: ${JSON.stringify(v)} está fuera de ${rangos[k][0]}…${rangos[k][1]}.`);
  }
  return out;
}

/**
 * Un estilo de edición tal como se guarda, o null si no tiene nombre. Lo que no se entiende se descarta y se anota en
 * `errores` (para decírselo a quien lo escribió). Pura.
 *
 *   { id, nombre, tipo, piezas: { textoDetras: "…", sello: "…", placasNumeradas: true, … },
 *     camara: { abierto, medio, seguir, maxAcercar, golpeAlEntrar }, transiciones: { entreClips, saltoMismoClip },
 *     gancho, cierre: { segundos, boton, numero, usuario }, musica: { bajoVoz, llamado, libre, cierre }, ritmo, notas,
 *     variantes: { transicion, entrada, subtitulos, cierre, ritmo, forma } }   (las del kit: van tal cual a plan.variantes)
 */
export function limpiarEstiloEdicion(o, errores = []) {
  if (!esObjeto(o)) return null;
  const nombre = corto(o.nombre, 60);
  if (!nombre) { errores.push("Falta el nombre del estilo («Alex en obra»)."); return null; }
  const out = { ...(ID.test(String(o.id ?? "")) ? { id: String(o.id) } : {}), nombre };
  if (o.tipo !== undefined) {
    if (TIPOS_ESTILO_EDICION.includes(o.tipo)) out.tipo = o.tipo;
    else errores.push(`tipo: «${o.tipo}» no es un tipo de video grabado (${TIPOS_ESTILO_EDICION.join(", ")}).`);
  }
  if (esObjeto(o.piezas)) {
    const piezas = {};
    for (const [k, v] of Object.entries(o.piezas)) {
      if (k === "placasNumeradas") { if (typeof v === "boolean") piezas[k] = v; continue; }
      if (!Object.hasOwn(PIEZAS_ESTILO_EDICION, k)) { errores.push(`piezas.${k}: no es una pieza del kit (${Object.keys(PIEZAS_ESTILO_EDICION).join(", ")}).`); continue; }
      const t = corto(v, MAX_TEXTO_EDICION);
      if (t) piezas[k] = t;
    }
    if (Object.keys(piezas).length) out.piezas = piezas;
  }
  if (o.camara !== undefined) {
    const { golpeAlEntrar, ...resto } = esObjeto(o.camara) ? o.camara : {};
    const camara = numeros(resto, CAMARA, "camara", errores) ?? {};
    if (typeof golpeAlEntrar === "boolean") camara.golpeAlEntrar = golpeAlEntrar;
    if (camara.abierto && camara.medio && camara.medio <= camara.abierto) errores.push("camara: el plano medio tiene que acercar más que el abierto.");
    if (Object.keys(camara).length) out.camara = camara;
  }
  if (esObjeto(o.transiciones)) {
    const tr = {};
    for (const k of ["entreClips", "saltoMismoClip"]) {
      const v = o.transiciones[k];
      if (v === undefined) continue;
      if (Object.hasOwn(TRANSICIONES_EDICION, v)) tr[k] = v;
      else errores.push(`transiciones.${k}: «${v}» no la pinta el kit (${Object.keys(TRANSICIONES_EDICION).join(", ")}).`);
    }
    if (Object.keys(tr).length) out.transiciones = tr;
  }
  if (o.variantes !== undefined) {
    if (!esObjeto(o.variantes)) errores.push(`variantes: es un objeto { ${Object.keys(VARIANTES_ESTILO_EDICION).join(", ")} }.`);
    else {
      const v = {};
      for (const [k, x] of Object.entries(o.variantes)) {
        if (!Object.hasOwn(VARIANTES_ESTILO_EDICION, k)) errores.push(`variantes.${k}: no es una pieza con variantes (${Object.keys(VARIANTES_ESTILO_EDICION).join(", ")}).`);
        else if (!VARIANTES_ESTILO_EDICION[k].includes(x)) errores.push(`variantes.${k}: «${x}» no la pinta el kit (${VARIANTES_ESTILO_EDICION[k].join(", ")}).`);
        else v[k] = x;
      }
      if (Object.keys(v).length) out.variantes = v;
    }
  }
  for (const k of ["gancho", "ritmo"]) {
    const t = corto(o[k], MAX_TEXTO_EDICION);
    if (t) out[k] = t;
  }
  if (esObjeto(o.cierre)) {
    const c = {};
    if (o.cierre.segundos !== undefined) {
      if (enRango(o.cierre.segundos, [0, 8])) c.segundos = o.cierre.segundos;
      else errores.push("cierre.segundos: entre 0 y 8.");
    }
    const boton = corto(o.cierre.boton, 40);
    if (boton) c.boton = boton;
    for (const k of ["numero", "usuario"]) if (typeof o.cierre[k] === "boolean") c[k] = o.cierre[k];
    if (Object.keys(c).length) out.cierre = c;
  }
  if (o.musica !== undefined) {
    const m = numeros(o.musica, MUSICA, "musica", errores);
    if (m && Object.keys(m).length) out.musica = m;
  }
  const notas = typeof o.notas === "string" ? o.notas.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_NOTAS_EDICION) : "";
  if (notas) out.notas = notas;
  if (JSON.stringify(out).length > MAX_ESTILO_EDICION) {
    errores.push(`El estilo pasa de ${MAX_ESTILO_EDICION} caracteres: acórtalo (son reglas, no el guion).`);
    return null;
  }
  return out;
}

/** La lista guardada: estilos con id, sin repetir id ni nombre, como mucho 6. Pura. */
export function limpiarEstilosEdicion(lista) {
  const out = [];
  for (const e of Array.isArray(lista) ? lista : []) {
    const limpio = limpiarEstiloEdicion(e);
    if (!limpio?.id) continue;
    if (out.some((x) => x.id === limpio.id || x.nombre.toLowerCase() === limpio.nombre.toLowerCase())) continue;
    out.push(limpio);
  }
  return out.slice(0, MAX_ESTILOS_EDICION);
}

const sn = (b) => (b ? "sí" : "no");

/** El estilo en frases cortas, para enseñarlo a la persona o leerlo antes de editar. Pura. */
export function resumenEstiloEdicion(e) {
  if (!e) return [];
  const l = [];
  if (e.tipo) l.push(`Tipo: ${e.tipo}.`);
  if (e.variantes) l.push(`Variantes del kit: ${Object.entries(e.variantes).map(([k, v]) => `${k} «${v}»`).join(", ")}.`);
  if (e.gancho) l.push(`Gancho: ${e.gancho}.`);
  for (const [k, v] of Object.entries(e.piezas ?? {})) {
    if (k === "placasNumeradas") l.push(`Placas numeradas: ${sn(v)}.`);
    else l.push(`${PIEZAS_ESTILO_EDICION[k][0].toUpperCase()}${PIEZAS_ESTILO_EDICION[k].slice(1)}: ${v}.`);
  }
  if (e.camara) {
    const c = e.camara;
    l.push(`Cámara: ${[c.abierto && `abierto ${c.abierto}×`, c.medio && `medio ${c.medio}×`, c.seguir !== undefined && `sigue la cabeza al ${Math.round(c.seguir * 100)} %`,
      c.maxAcercar && `acerca hasta ${c.maxAcercar}×`, c.golpeAlEntrar !== undefined && `golpe al entrar: ${sn(c.golpeAlEntrar)}`].filter(Boolean).join(", ")}.`);
  }
  if (e.transiciones) {
    l.push(`Transiciones: ${[e.transiciones.entreClips && `entre clips, ${e.transiciones.entreClips}`, e.transiciones.saltoMismoClip && `dentro de un clip, ${e.transiciones.saltoMismoClip}`].filter(Boolean).join("; ")}.`);
  }
  if (e.cierre) {
    const c = e.cierre;
    l.push(`Cierre: ${[c.segundos !== undefined && `${c.segundos} s sin voz`, c.boton && `botón «${c.boton}»`, c.numero !== undefined && `número: ${sn(c.numero)}`, c.usuario !== undefined && `@usuario: ${sn(c.usuario)}`].filter(Boolean).join(", ")}.`);
  }
  if (e.musica) l.push(`Música (dB, como en los números del oficio): ${Object.entries(e.musica).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  if (e.ritmo) l.push(`Ritmo: ${e.ritmo}.`);
  if (e.notas) l.push(`Notas: ${e.notas}`);
  return l;
}
