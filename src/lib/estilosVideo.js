// ============================================================
// Los ESTILOS DE VIDEO guardados de un cliente (puro: lo comparten la pantalla, el Worker y Claude)
//
// Decisión de la agencia (57DMC, «NO ME DA PENA»): un video que quedó muy bien se GUARDA COMO ESTILO y el siguiente sale
// igual sin código. Un estilo son las REGLAS de cómo se ve y se mueve el video —no su letra, ni su texto, ni sus
// imágenes—: el texto principal (gigante, en mayúsculas, palabra por palabra, de golpe, la palabra clave en el acento),
// los fondos (imágenes a sangre en blanco y negro, oscurecidas, con su movimiento, una cada N escenas), las transiciones
// (corte dentro de un mismo fondo, barrido y zoom al cambiar), el cierre (negro con el logo pequeño en el centro), el
// grano, el ritmo, los subtítulos y los efectos. Vive en el kit del cliente (`kit.estilosVideo`, hasta
// `MAX_ESTILOS_VIDEO`) y sólo lo cambian sus rutas (worker/lib/estudio/estilosVideo.js): el PUT del kit lo conserva.
//
// Al crear un video con un estilo: la IA escribe el CONTENIDO (qué palabras se leen, cuál es la clave, qué muestra cada
// fondo) con `lineaDeEstilo` delante, y el CÓDIGO impone el estilo encima (`aplicarEstilo`): lo que la IA no respete en
// la forma, se corrige solo. Así el estilo sale igual cada vez, y la IA sólo decide lo que depende de la letra.
// ============================================================

import {
  TOKENS_COLOR, ENTRADAS, TRANSICIONES, FONDOS, RITMOS, ILUSTRACIONES, TRATAMIENTOS_IMAGEN, MOVIMIENTOS_IMAGEN, POSICIONES, palabrasDe,
} from "./videoEscenas.js";

/** Como mucho, estilos guardados por cliente. */
export const MAX_ESTILOS_VIDEO = 8;
/** Para qué videos es un estilo. */
export const USOS_ESTILO_VIDEO = Object.freeze({ cancion: "Videos con canción", voz: "Videos con voz en off", todos: "Todos los videos" });
/** Como mucho, imágenes de fondo distintas que un estilo puede pedir en un video (cada una se paga, con su confirmación). */
export const TOPE_FONDOS_ESTILO = 16;
const MAX_NOMBRE = 60;
const MAX_NOTA = 600;
const ROLES_PRINCIPAL = ["gigante", "titular"];
const HEX = /^#[0-9a-f]{6}$/i;
const ID_ESTILO = /^ev-[a-z0-9]{4,24}$/;

const esColor = (c) => TOKENS_COLOR.includes(c) || HEX.test(String(c ?? ""));
const de = (lista, v) => (lista.includes(v) ? v : undefined);
const num = (v, min, max) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(max, Math.max(min, Number(v))) : undefined);
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const sinVacios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** El valor que más se repite (a igualdad, el primero que apareció). */
function masComun(valores) {
  const n = new Map();
  for (const v of valores) if (v !== undefined && v !== null && v !== "") n.set(v, (n.get(v) ?? 0) + 1);
  let mejor;
  let max = 0;
  for (const [v, c] of n) if (c > max) { mejor = v; max = c; }
  return mejor;
}
const parte = (lista, f) => (lista.length ? lista.filter(f).length / lista.length : 0);
function mediana(v) {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : undefined;
}
const redondo = (n, paso = 0.05) => (Number.isFinite(n) ? Math.round(n / paso) * paso : undefined);
/** Una palabra para comparar: sin tildes, sin mayúsculas y sin signos («JESÚS,» = «jesús»). */
const normal = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** ¿La capa es una imagen a sangre (el fondo de la escena)? */
const imagenDeFondo = (capas = []) => capas.find((c) => c?.tipo === "imagen" && c.encuadre === "completo") ?? null;
/** De qué imagen es el fondo de una escena (su archivo o su `pide`), o "" si no tiene. */
const claveDeFondo = (e) => {
  const c = imagenDeFondo(e?.capas);
  return c ? String(c.archivo || corto(c.pide, 400).toLowerCase()) : "";
};

/** El texto PRINCIPAL de una escena: el gigante, si no el titular, si no el primer texto que no es apoyo ni etiqueta. */
export function principalDe(capas = []) {
  const textos = capas.filter((c) => c?.tipo === "texto");
  return textos.find((c) => c.rol === "gigante") ?? textos.find((c) => (c.rol ?? "titular") === "titular")
    ?? textos.find((c) => !["apoyo", "etiqueta"].includes(c.rol)) ?? null;
}

/** ¿Las palabras de un texto se dicen (en orden) en el habla? Es lo que necesita «porPalabra» para que cada una entre al cantarse. */
export function seDiceEnElHabla(texto, habla) {
  const dichas = palabrasDe(String(habla ?? "")).map(normal);
  const escritas = palabrasDe(String(texto ?? "").replace(/\*/g, " ")).map(normal);
  if (!escritas.length || !dichas.length) return false;
  let i = 0;
  for (const p of dichas) if (i < escritas.length && p === escritas[i]) i++;
  return i === escritas.length;
}

/**
 * La escena de CIERRE de un guion, como la entiende un estilo: la última, si es de tipo «cierre» y no dice nada (el final
 * instrumental de una canción, o un cierre mudo). Un cierre que se dice (o se canta) es una escena más.
 */
const cierreDe = (escenas = []) => {
  const u = escenas.at(-1);
  return escenas.length > 1 && u?.tipo === "cierre" && !palabrasDe(String(u.habla ?? "")).length ? u : null;
};

/** El logo del cierre: la capa «logo», o una imagen pequeña y entera que hace de logo (como en el de 57DMC). */
function logoDelCierre(cierre) {
  const capas = cierre?.capas ?? [];
  const c = capas.find((x) => x?.tipo === "logo")
    ?? capas.find((x) => x?.tipo === "imagen" && x.encuadre !== "completo" && (/logo/i.test(String(x.id ?? "")) || (x.recorte === "contener" && capas.length === 1)));
  if (!c) return null;
  const pos = c.pos && typeof c.pos === "object" ? { x: num(c.pos.x, 0, 1) ?? 0.5, y: num(c.pos.y, 0, 1) ?? 0.5 } : de(POSICIONES, c.pos) ?? "centro";
  return { pos, tam: num(c.tam, 0.05, 1) ?? 0.2 };
}

/**
 * Las reglas de un video (su guion y su sonido) como ESTILO. `datos`: { id, nombre, nota?, para?, videoId?, version?,
 * titulo?, sonido?, ahora? }. No se lleva ni la letra, ni los textos, ni las imágenes: sólo cómo se ven y se mueven.
 * → el estilo limpio, o null si el guion no tiene escenas. Pura.
 */
export function estiloDeGuion(guion, { id, nombre, nota = "", para = "", videoId = "", version = 0, titulo = "", sonido = null, ahora = "", por = "" } = {}) {
  const escenas = Array.isArray(guion?.escenas) ? guion.escenas : [];
  if (!escenas.length) return null;
  const cierre = cierreDe(escenas);
  const cuerpo = cierre ? escenas.slice(0, -1) : escenas;
  const capas = cuerpo.flatMap((e) => e.capas ?? []);

  // El texto principal de cada escena.
  const principales = cuerpo.map((e) => principalDe(e.capas)).filter(Boolean);
  const texto = principales.length ? {
    rol: de(ROLES_PRINCIPAL, masComun(principales.map((c) => c.rol ?? "titular"))),
    mayusculas: parte(principales, (c) => c.mayusculas === true) >= 0.5,
    porPalabra: parte(principales, (c) => c.porPalabra === true) >= 0.5,
    entrada: de(ENTRADAS, masComun(principales.map((c) => c.animacion?.entrada))),
    pulso: parte(principales, (c) => c.pulso === true) >= 0.5,
    color: masComun(principales.map((c) => c.color).filter(esColor)),
    enfasis: parte(principales, (c) => /\*[^*]+\*/.test(String(c.texto ?? ""))) >= 0.4,
  } : null;
  const apoyos = capas.filter((c) => c?.tipo === "texto" && c.rol === "apoyo");
  const etiquetas = capas.filter((c) => c?.tipo === "texto" && c.rol === "etiqueta");

  // Los fondos: imágenes a sangre (si la mayoría de las escenas la llevan) y el fondo base de la escena.
  const imgs = cuerpo.map((e) => imagenDeFondo(e.capas)).filter(Boolean);
  const distintas = new Set(cuerpo.map(claveDeFondo).filter(Boolean));
  const conImagen = imgs.length >= cuerpo.length * 0.6 && imgs.length > 0;
  const movimientos = [...new Set(imgs.map((c) => c.movimiento).filter((m) => m && m !== "ninguno"))].filter((m) => MOVIMIENTOS_IMAGEN.includes(m));
  const fondo = {
    base: sinVacios({
      tipo: de(FONDOS, masComun(cuerpo.map((e) => e.fondo?.tipo))),
      color: masComun(cuerpo.map((e) => e.fondo?.color).filter(esColor)),
      color2: masComun(cuerpo.map((e) => e.fondo?.color2).filter(esColor)),
    }),
    ...(conImagen ? {
      imagen: true,
      tratamiento: de(TRATAMIENTOS_IMAGEN, masComun(imgs.map((c) => c.tratamiento ?? "color"))),
      oscurecer: redondo(mediana(imgs.map((c) => Number(c.oscurecer ?? 0)))),
      recorte: masComun(imgs.map((c) => c.recorte ?? "cubrir")) === "contener" ? "contener" : "cubrir",
      movimientos,
      escenas: Math.min(4, Math.max(1, Math.round(imgs.length / Math.max(1, distintas.size)))),
    } : {}),
  };

  // Las transiciones: la que va dentro de un mismo fondo y las que van al cambiar (en el orden en que aparecen).
  const dentro = [];
  const cambio = [];
  const dur = {};
  cuerpo.forEach((e, i) => {
    if (i === 0) return;
    const t = de(TRANSICIONES, e.transicion?.tipo);
    if (!t) return;
    if (dur[t] === undefined && Number.isFinite(Number(e.transicion?.dur))) dur[t] = num(e.transicion.dur, 0, 1);
    if (conImagen && claveDeFondo(e) === claveDeFondo(cuerpo[i - 1])) dentro.push(t);
    else cambio.push(t);
  });
  const transiciones = sinVacios({
    dentro: masComun(dentro),
    cambio: [...new Set(cambio)].slice(0, 4),
    dur: Object.keys(dur).length ? dur : undefined,
  });

  // El cierre: su fondo y el logo (con su sitio y su tamaño).
  const logo = logoDelCierre(cierre);
  const estilo = {
    id, nombre: nombre || corto(titulo, MAX_NOMBRE) || "Estilo de video", nota,
    para: para || (guion?.cancion ? "cancion" : "voz"),
    grano: num(guion?.estilo?.grano, 0, 1), ritmo: de(RITMOS, guion?.estilo?.ritmo), ilustracion: de(ILUSTRACIONES, guion?.estilo?.ilustracion),
    subtitulos: guion?.subtitulos?.activo === true,
    efectos: sonido ? sonido.efectos !== false : true,
    texto,
    apoyo: apoyos.length ? sinVacios({ entrada: de(ENTRADAS, masComun(apoyos.map((c) => c.animacion?.entrada))), color: masComun(apoyos.map((c) => c.color).filter(esColor)) }) : null,
    etiqueta: etiquetas.length ? sinVacios({ color: masComun(etiquetas.map((c) => c.color).filter(esColor)) }) : null,
    fondo,
    transiciones,
    cierre: cierre ? sinVacios({
      color: esColor(cierre.fondo?.color) ? cierre.fondo.color : undefined, logo,
      transicion: de(TRANSICIONES, cierre.transicion?.tipo), dur: num(cierre.transicion?.dur, 0, 1),
    }) : null,
    de: sinVacios({ video: corto(videoId, 64), version: Number(version) || undefined, titulo: corto(titulo, 120) }),
    creado: ahora || undefined, por: corto(por, 64) || undefined,
  };
  return limpiarEstiloVideo(estilo);
}

/** Un estilo tal como se guarda: sólo lo que se entiende, con sus topes. → el estilo, o null si no vale (sin id o nombre). Pura. */
export function limpiarEstiloVideo(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const id = String(e.id ?? "");
  const nombre = corto(e.nombre, MAX_NOMBRE);
  if (!ID_ESTILO.test(id) || !nombre) return null;
  const t = e.texto && typeof e.texto === "object" ? e.texto : null;
  const f = e.fondo && typeof e.fondo === "object" ? e.fondo : {};
  const base = f.base && typeof f.base === "object" ? f.base : {};
  const tr = e.transiciones && typeof e.transiciones === "object" ? e.transiciones : {};
  const ci = e.cierre && typeof e.cierre === "object" ? e.cierre : null;
  const logo = ci?.logo && typeof ci.logo === "object" ? ci.logo : null;
  const posLogo = logo?.pos && typeof logo.pos === "object"
    ? { x: num(logo.pos.x, 0, 1) ?? 0.5, y: num(logo.pos.y, 0, 1) ?? 0.5 }
    : de(POSICIONES, logo?.pos) ?? "centro";
  const dur = tr.dur && typeof tr.dur === "object"
    ? Object.fromEntries(Object.entries(tr.dur).filter(([k]) => TRANSICIONES.includes(k)).map(([k, v]) => [k, num(v, 0, 1)]).filter(([, v]) => v !== undefined))
    : {};
  const bool = (v) => (typeof v === "boolean" ? v : undefined);
  return sinVacios({
    id, nombre, nota: corto(e.nota, MAX_NOTA),
    para: de(Object.keys(USOS_ESTILO_VIDEO), e.para) ?? "todos",
    grano: num(e.grano, 0, 1), ritmo: de(RITMOS, e.ritmo), ilustracion: de(ILUSTRACIONES, e.ilustracion),
    subtitulos: bool(e.subtitulos), efectos: bool(e.efectos),
    texto: t ? sinVacios({
      rol: de(ROLES_PRINCIPAL, t.rol), mayusculas: bool(t.mayusculas), porPalabra: bool(t.porPalabra), entrada: de(ENTRADAS, t.entrada),
      pulso: bool(t.pulso), color: esColor(t.color) ? t.color : undefined, enfasis: bool(t.enfasis),
    }) : undefined,
    apoyo: e.apoyo && typeof e.apoyo === "object" ? sinVacios({ entrada: de(ENTRADAS, e.apoyo.entrada), color: esColor(e.apoyo.color) ? e.apoyo.color : undefined }) : undefined,
    etiqueta: e.etiqueta && typeof e.etiqueta === "object" ? sinVacios({ color: esColor(e.etiqueta.color) ? e.etiqueta.color : undefined }) : undefined,
    fondo: sinVacios({
      base: sinVacios({ tipo: de(FONDOS, base.tipo), color: esColor(base.color) ? base.color : undefined, color2: esColor(base.color2) ? base.color2 : undefined }),
      ...(f.imagen === true ? {
        imagen: true, tratamiento: de(TRATAMIENTOS_IMAGEN, f.tratamiento), oscurecer: num(f.oscurecer, 0, 0.85),
        recorte: f.recorte === "contener" ? "contener" : "cubrir",
        movimientos: (Array.isArray(f.movimientos) ? f.movimientos : []).filter((m) => MOVIMIENTOS_IMAGEN.includes(m) && m !== "ninguno").slice(0, 3),
        escenas: Math.round(num(f.escenas, 1, 4) ?? 1),
      } : {}),
    }),
    transiciones: sinVacios({
      dentro: de(TRANSICIONES, tr.dentro),
      cambio: (Array.isArray(tr.cambio) ? tr.cambio : []).filter((x) => TRANSICIONES.includes(x)).slice(0, 4),
      dur: Object.keys(dur).length ? dur : undefined,
    }),
    cierre: ci ? sinVacios({
      color: esColor(ci.color) ? ci.color : undefined, logo: logo ? { pos: posLogo, tam: num(logo.tam, 0.05, 1) ?? 0.2 } : undefined,
      transicion: de(TRANSICIONES, ci.transicion), dur: num(ci.dur, 0, 1),
    }) : undefined,
    de: e.de && typeof e.de === "object" ? sinVacios({ video: corto(e.de.video, 64), version: Number.isInteger(e.de.version) ? e.de.version : undefined, titulo: corto(e.de.titulo, 120) }) : undefined,
    creado: corto(e.creado, 40), por: corto(e.por, 64),
  });
}

/** La lista del kit: sólo los que valen, sin ids repetidos, hasta `MAX_ESTILOS_VIDEO`. Pura. */
export function limpiarEstilosVideo(lista) {
  const vistos = new Set();
  const out = [];
  for (const e of Array.isArray(lista) ? lista : []) {
    const l = limpiarEstiloVideo(e);
    if (!l || vistos.has(l.id)) continue;
    vistos.add(l.id);
    out.push(l);
    if (out.length >= MAX_ESTILOS_VIDEO) break;
  }
  return out;
}

/** Los estilos que sirven para un tipo de video («cancion» o «voz»). Pura. */
export const estilosPara = (lista, uso) => limpiarEstilosVideo(lista).filter((e) => e.para === "todos" || e.para === uso);

const NOMBRE_COLOR = { fondo: "el color del fondo", superficie: "el color de las placas", texto: "el color del texto", acento: "el color de acento", apoyo: "el color de apoyo", claro: "el color claro", oscuro: "el color oscuro" };
/** Un color dicho para la persona: «el color de acento», o su #RRGGBB. */
const nombreColor = (c) => NOMBRE_COLOR[c] ?? c;
const NOMBRE_ENTRADA = { golpe: "de golpe", aparece: "aparece", fundido: "con fundido", sube: "subiendo", baja: "bajando", escala: "creciendo", rebote: "con rebote", escribe: "escribiéndose", barrido: "con barrido", dibuja: "dibujándose" };
const lista = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} y ${a.at(-1)}`);
const pct = (n) => `${Math.round(n * 100)} %`;

/** Lo que dice un estilo, en frases cortas para la pantalla (y para Claude). Pura. */
export function resumenDeEstilo(estilo) {
  const e = limpiarEstiloVideo(estilo);
  if (!e) return [];
  const t = e.texto ?? {};
  const f = e.fondo ?? {};
  const tr = e.transiciones ?? {};
  const out = [];
  if (e.texto) {
    out.push([
      `Texto principal ${t.rol === "gigante" ? "gigante (una o dos palabras por línea, a todo el ancho)" : "titular"}`,
      t.mayusculas ? "en mayúsculas" : "",
      t.porPalabra ? "palabra por palabra cuando se dice" : "",
      t.entrada ? `entra ${NOMBRE_ENTRADA[t.entrada] ?? t.entrada}` : "",
      t.pulso ? "late con el ritmo" : "",
      t.color ? `en ${nombreColor(t.color)}` : "",
      t.enfasis ? "y la palabra clave destacada en el color de acento" : "",
    ].filter(Boolean).join(", ").replace(/, (y la palabra)/, " $1") + ".");
  }
  if (e.apoyo) out.push(`Texto de apoyo${e.apoyo.entrada ? ` ${NOMBRE_ENTRADA[e.apoyo.entrada] ?? e.apoyo.entrada}` : ""}${e.apoyo.color ? `, en ${nombreColor(e.apoyo.color)}` : ""}.`);
  if (e.etiqueta?.color) out.push(`Etiquetas (citas, referencias) en ${nombreColor(e.etiqueta.color)}.`);
  if (f.imagen) {
    out.push([
      `Fondos: imágenes a sangre${f.tratamiento === "byn" ? " en blanco y negro" : ""}`,
      f.oscurecer ? `oscurecidas al ${pct(f.oscurecer)}` : "",
      f.movimientos?.length ? `que se mueven (${lista(f.movimientos)})` : "",
      `una imagen ${f.escenas > 1 ? `cada ${f.escenas} escenas` : "por escena"}`,
    ].filter(Boolean).join(", ") + ".");
  } else if (f.base?.tipo) {
    out.push(`Fondo ${f.base.tipo}${f.base.color ? ` en ${nombreColor(f.base.color)}` : ""}.`);
  }
  if (tr.dentro || tr.cambio?.length) {
    out.push(f.imagen
      ? `Transiciones: ${tr.dentro ? `${tr.dentro} dentro de un mismo fondo` : ""}${tr.dentro && tr.cambio?.length ? "; " : ""}${tr.cambio?.length ? `${lista(tr.cambio)} al cambiar de fondo` : ""}.`
      : `Transiciones: ${lista(tr.cambio ?? [tr.dentro])}, por turnos.`);
  }
  if (e.cierre) {
    const l = e.cierre.logo;
    out.push(`Cierre: fondo ${e.cierre.color ? `en ${nombreColor(e.cierre.color)}` : "de la escena"}${l ? ` con el logo ${l.tam <= 0.3 ? "pequeño" : "grande"} (${pct(l.tam)} del ancho)${l.pos === "centro" || (typeof l.pos === "object" && Math.abs(l.pos.x - 0.5) < 0.05 && Math.abs(l.pos.y - 0.5) < 0.05) ? " en el centro" : ""}` : ""}.`);
  }
  out.push([
    e.grano !== undefined ? `Grano ${String(e.grano).replace(".", ",")}` : "",
    e.ritmo ? `ritmo ${e.ritmo === "rapido" ? "rápido" : e.ritmo}` : "",
    e.ilustracion ? `ilustración ${e.ilustracion === "poster" ? "póster" : e.ilustracion}` : "",
    e.subtitulos === false ? "sin subtítulos" : e.subtitulos ? "con subtítulos" : "",
    e.efectos === false ? "sin efectos de sonido" : e.efectos ? "con efectos de sonido" : "",
  ].filter(Boolean).join(" · ") + ".");
  if (e.nota) out.push(`Además: ${e.nota}`);
  return out.filter((x) => x && x !== ".");
}

/**
 * Cada cuántas escenas cambia la imagen de fondo con este estilo en un video de `escenas` escenas: la del estilo, o más
 * si así pasaría de `TOPE_FONDOS_ESTILO` imágenes. Pura.
 */
export function cadaCuantasEscenas(estilo, escenas) {
  const n = Math.max(1, Number(estilo?.fondo?.escenas) || 1);
  return Math.max(n, Math.ceil(Math.max(0, Number(escenas) || 0) / TOPE_FONDOS_ESTILO));
}

/**
 * El estilo contado a la IA que escribe el guion: las reglas que tiene que seguir (y que el código impone después) y lo
 * que sí decide ella. `escenas`: cuántas escenas tendrá, más o menos (para la cadencia de los fondos). Pura.
 */
export function lineaDeEstilo(estilo, { escenas = 0, cancion = false } = {}) {
  const e = limpiarEstiloVideo(estilo);
  if (!e) return "";
  const t = e.texto ?? {};
  const f = e.fondo ?? {};
  const n = cadaCuantasEscenas(e, escenas);
  const ejemplo = e.texto ? JSON.stringify(sinVacios({
    tipo: "texto", id: "t1", pos: "centro", rol: t.rol, mayusculas: t.mayusculas || undefined, porPalabra: t.porPalabra || undefined,
    pulso: t.pulso || undefined, color: t.color, texto: t.enfasis ? "LAS PALABRAS *CLAVE* DE LA LÍNEA" : "LAS PALABRAS DE LA LÍNEA",
    animacion: t.entrada ? { entrada: t.entrada } : undefined,
  })) : "";
  return [
    `ESTILO GUARDADO DE ESTE CLIENTE: «${e.nombre}» (manda sobre los consejos generales; la aplicación lo IMPONE después en la forma, así que síguelo desde ya)`,
    ...resumenDeEstilo(e).map((x) => `· ${x}`),
    "Lo que decides TÚ (no lo puede decidir el código):",
    e.texto ? `· El texto principal de cada escena${cancion ? " con letra" : " con habla"}, como ${ejemplo}${t.porPalabra ? `: con las MISMAS palabras que se ${cancion ? "cantan" : "dicen"} en esa escena (las que importan, en su orden)` : ""}${t.enfasis ? "; una o dos palabras clave entre *asteriscos*" : ""}.` : "",
    f.imagen ? `· Qué MUESTRA cada imagen de fondo («pide»), nacido de lo que dice esa parte: ${n > 1 ? `cada ${n} escenas seguidas comparten la MISMA imagen (el mismo «pide» exacto)` : "una imagen por escena"}; como mucho ${TOPE_FONDOS_ESTILO} distintas.` : "",
    "· Los adornos que pida la letra (una cruz, una línea que tacha, una cita pequeña con su referencia), con los colores del estilo.",
    e.cierre ? `· Si ${cancion ? "la canción termina con un hueco instrumental" : "el video termina con una escena muda"}, esa última escena (tipo «cierre», sin ${cancion ? "letra" : "habla"}) lleva sólo lo que dice el estilo; si no, la última escena${cancion ? " con letra" : ""} es una más.` : "",
  ].filter(Boolean).join("\n");
}

const clonar = (o) => JSON.parse(JSON.stringify(o));

/**
 * Impone el estilo a un guion (el que escribió la IA, o uno guardado): el aspecto del texto principal, de los apoyos y de
 * las etiquetas; los fondos (tratamiento, velo, movimiento y una imagen cada N escenas); las transiciones; el cierre; el
 * grano, el ritmo y los subtítulos. NO toca lo que se dice ni lo que se lee (salvo «porPalabra», que sólo se pone si las
 * palabras del texto se dicen en la escena). `conFondos`: con imágenes por crear, las agrupa por la cadencia del estilo
 * (y pone la del grupo en la escena que no tenga). → { guion, cambios } (cambios: cuántos valores cambió). Pura.
 */
export function aplicarEstilo(guion, estilo, { conFondos = false } = {}) {
  const e = limpiarEstiloVideo(estilo);
  if (!e || !Array.isArray(guion?.escenas) || !guion.escenas.length) return { guion, cambios: 0 };
  const g = clonar(guion);
  let cambios = 0;
  const poner = (o, k, v) => {
    if (v === undefined || o[k] === v) return;
    o[k] = v;
    cambios++;
  };

  g.estilo = g.estilo && typeof g.estilo === "object" ? g.estilo : {};
  poner(g.estilo, "grano", e.grano);
  poner(g.estilo, "ritmo", e.ritmo);
  poner(g.estilo, "ilustracion", e.ilustracion);
  if (typeof e.subtitulos === "boolean") {
    g.subtitulos = g.subtitulos && typeof g.subtitulos === "object" ? g.subtitulos : {};
    poner(g.subtitulos, "activo", e.subtitulos && !e.texto?.porPalabra);
  }

  const cierre = cierreDe(g.escenas);
  const cuerpo = cierre ? g.escenas.slice(0, -1) : g.escenas;
  const t = e.texto ?? null;
  const f = e.fondo ?? {};

  // Los fondos: una imagen cada N escenas (la del primer escena del grupo que la tenga; la que no tiene, se la pone).
  if (f.imagen && conFondos) {
    const n = cadaCuantasEscenas(e, cuerpo.length);
    for (let i = 0; i < cuerpo.length; i += n) {
      const grupo = cuerpo.slice(i, i + n);
      const lider = grupo.map((x) => imagenDeFondo(x.capas)).find(Boolean);
      if (!lider) continue;
      for (const x of grupo) {
        x.capas = Array.isArray(x.capas) ? x.capas : [];
        const img = imagenDeFondo(x.capas);
        if (!img) {
          // Sin fondo en esta escena: el del grupo, la primera de sus capas (si cabe).
          if (x.capas.length < 8) { x.capas.unshift({ ...clonar(lider), id: x.capas.some((c) => c.id === "fondo") ? `fondo-${i}` : "fondo" }); cambios++; }
        } else if (img !== lider && !img.archivo && !lider.archivo && img.pide !== lider.pide) {
          img.pide = lider.pide;
          cambios++;
        } else if (img !== lider && lider.archivo && !img.archivo) {
          img.archivo = lider.archivo;
          delete img.pide;
          cambios++;
        }
      }
    }
  }

  const ciclo = e.transiciones?.cambio?.length ? e.transiciones.cambio : null;
  let k = 0;
  cuerpo.forEach((x, i) => {
    x.capas = Array.isArray(x.capas) ? x.capas : [];
    // El fondo base de la escena.
    if (f.base?.tipo || f.base?.color) {
      x.fondo = x.fondo && typeof x.fondo === "object" ? x.fondo : {};
      poner(x.fondo, "tipo", f.base.tipo);
      poner(x.fondo, "color", f.base.color);
      poner(x.fondo, "color2", f.base.color2);
    }
    // La imagen a sangre.
    const img = imagenDeFondo(x.capas);
    if (img && f.imagen) {
      poner(img, "tratamiento", f.tratamiento);
      poner(img, "oscurecer", f.oscurecer);
      poner(img, "recorte", f.recorte);
      if (f.movimientos?.length) poner(img, "movimiento", f.movimientos[i % f.movimientos.length]);
    }
    // El texto principal (sólo si ya era principal: un apoyo no pasa a gigante).
    const p = t ? principalDe(x.capas) : null;
    if (p && ROLES_PRINCIPAL.includes(p.rol ?? "titular")) {
      poner(p, "rol", t.rol);
      poner(p, "mayusculas", t.mayusculas);
      poner(p, "color", t.color);
      if (t.pulso !== undefined) poner(p, "pulso", t.pulso);
      if (t.entrada) { p.animacion = p.animacion && typeof p.animacion === "object" ? p.animacion : {}; poner(p.animacion, "entrada", t.entrada); }
      if (t.porPalabra !== undefined) poner(p, "porPalabra", t.porPalabra && seDiceEnElHabla(p.texto, x.habla));
    }
    for (const c of x.capas) {
      if (c?.tipo !== "texto" || c === p) continue;
      if (c.rol === "apoyo" && e.apoyo) {
        poner(c, "color", e.apoyo.color);
        if (e.apoyo.entrada) { c.animacion = c.animacion && typeof c.animacion === "object" ? c.animacion : {}; poner(c.animacion, "entrada", e.apoyo.entrada); }
      }
      if (c.rol === "etiqueta" && e.etiqueta) poner(c, "color", e.etiqueta.color);
    }
    // Las transiciones: la de dentro de un mismo fondo y, al cambiar, las del ciclo por turnos.
    if (i > 0 && (ciclo || e.transiciones?.dentro)) {
      const mismo = f.imagen && claveDeFondo(x) && claveDeFondo(x) === claveDeFondo(cuerpo[i - 1]);
      const tipo = mismo ? e.transiciones.dentro ?? x.transicion?.tipo : ciclo ? ciclo[k++ % ciclo.length] : e.transiciones.dentro;
      if (tipo) {
        x.transicion = x.transicion && typeof x.transicion === "object" ? x.transicion : {};
        poner(x.transicion, "tipo", tipo);
        poner(x.transicion, "dur", e.transiciones.dur?.[tipo]);
      }
    }
  });

  // El cierre mudo (el final instrumental): su fondo y sólo el logo, con su sitio y su tamaño. Un cierre que se dice no
  // se toca aquí: el logo encima del texto lo taparía.
  if (cierre && e.cierre) {
    cierre.capas = Array.isArray(cierre.capas) ? cierre.capas : [];
    if (e.cierre.color) {
      cierre.fondo = { ...(cierre.fondo && typeof cierre.fondo === "object" ? cierre.fondo : {}) };
      poner(cierre.fondo, "tipo", "plano");
      poner(cierre.fondo, "color", e.cierre.color);
    }
    if (e.cierre.transicion) {
      cierre.transicion = cierre.transicion && typeof cierre.transicion === "object" ? cierre.transicion : {};
      poner(cierre.transicion, "tipo", e.cierre.transicion);
      poner(cierre.transicion, "dur", e.cierre.dur);
    }
    const l = e.cierre.logo;
    if (l) {
      const logo = { tipo: "logo", id: "logo", pos: l.pos, tam: l.tam, entra: { s: 0 }, animacion: { entrada: "fundido", salida: "ninguna", bucle: "ninguno" } };
      // Sólo el logo (y los adornos que no son texto ni otra imagen).
      cierre.capas = [logo, ...cierre.capas.filter((c) => !["texto", "imagen", "logo", "sello", "llamado", "video"].includes(c?.tipo))];
      cambios++;
    }
  }
  return { guion: g, cambios };
}
