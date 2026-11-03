// ============================================================
// La auditoría de un perfil de Instagram (puro)
//
// Lo importan el Worker (que la genera) y el navegador (que la pinta):
// las cifras del perfil se calculan UNA vez y con este código, igual que
// las del informe mensual, y la IA las recibe hechas con la orden de no
// inventar otras.
// ============================================================

const DIA_MS = 86_400_000;

/** Los límites de Instagram que la auditoría tiene que respetar al proponer. */
export const LIMITES_PERFIL = Object.freeze({ bio: 150, nombre: 64, tituloDestacado: 15 });

/** Cuántos perfiles de referencia (los mejores del rubro) se comparan como mucho. */
export const MAX_REFERENTES = 3;

/**
 * Los iconos que la IA puede proponer para la portada de un destacado: nombres de `Icon.jsx`. Lo que no esté aquí
 * se cambia por «star» al limpiar: la portada se dibuja con plantilla y un icono que no existe no se ve.
 */
export const ICONOS_DESTACADO = Object.freeze([
  "star", "message", "info", "calendar", "image", "photo", "video", "megaphone", "users", "user", "bolt", "thumbsUp",
  "clipboardCheck", "checkCircle", "home", "building", "clock", "globe", "bell", "palette", "bulb", "chart", "rocket",
  "sparkles", "link", "search", "inbox", "file", "brain", "sun",
]);

/** «@a, @b c» → ["a", "b", "c"], sin repetir ni pasar del tope. Pura. */
export function referentesDe(texto, propio = "") {
  const yo = usuarioInstagram(propio);
  const salida = [];
  for (const parte of String(texto ?? "").split(/[\s,;]+/)) {
    const u = usuarioInstagram(parte);
    if (u && u !== yo && !salida.includes(u)) salida.push(u);
    if (salida.length >= MAX_REFERENTES) break;
  }
  return salida;
}

export const ESTADOS = Object.freeze({
  bien: { texto: "Bien", tono: "bien" },
  mejorable: { texto: "Mejorable", tono: "medio" },
  mal: { texto: "Hay que cambiarlo", tono: "mal" },
});

/** «@Baby.Caleb » → «baby.caleb». null si no es un usuario de Instagram válido. */
export function usuarioInstagram(texto) {
  const limpio = String(texto ?? "").trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(limpio) ? limpio : null;
}

/**
 * Lo que dicen los números del perfil: interacción media por publicación
 * y en % de los seguidores, cuántas publica a la semana, la mezcla de
 * formatos y cuántos días lleva sin publicar.
 */
export function cifrasPerfil(perfil = {}, ahora = Date.now()) {
  const medios = Array.isArray(perfil.medios) ? perfil.medios : [];
  const inter = medios.map((m) => (Number(m.meGusta) || 0) + (Number(m.comentarios) || 0));
  const media = inter.length ? inter.reduce((a, b) => a + b, 0) / inter.length : null;
  const seguidores = Number(perfil.seguidores) || null;
  const fechas = medios.map((m) => Date.parse(m.fecha)).filter(Number.isFinite).sort((a, b) => b - a);
  const ultimos30 = fechas.filter((t) => ahora - t <= 30 * DIA_MS).length;
  const formatos = {};
  for (const m of medios) {
    const f = m.formato || "imagen";
    formatos[f] = (formatos[f] ?? 0) + 1;
  }
  return {
    seguidores,
    siguiendo: Number(perfil.siguiendo) || null,
    publicaciones: Number(perfil.publicaciones) || null,
    interaccionMedia: media === null ? null : Math.round(media),
    tasaInteraccion: media !== null && seguidores ? Math.round((media / seguidores) * 1000) / 10 : null,
    porSemana: fechas.length ? Math.round((ultimos30 / (30 / 7)) * 10) / 10 : null,
    diasSinPublicar: fechas.length ? Math.floor((ahora - fechas[0]) / DIA_MS) : null,
    formatos,
    analizadas: medios.length,
  };
}

const texto = (x, max = 1200) => String(x ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);
const estado = (x) => (x in ESTADOS ? x : "mejorable");
const listaDe = (x, n, max = 400) => (Array.isArray(x) ? x.map((s) => texto(s, max)).filter(Boolean).slice(0, n) : []);
const bloque = (b, conLista = false) => ({
  estado: estado(b?.estado),
  comentario: texto(b?.comentario, 800),
  ...(conLista ? { recomendaciones: listaDe(b?.recomendaciones, 5) } : { recomendacion: texto(b?.recomendacion, 600) }),
});

/**
 * Lo que devuelve la IA, a la forma que pinta la pantalla. Lo que se pasa
 * de los límites de Instagram se RECORTA o se descarta aquí: una
 * biografía de 170 caracteres que la agencia copie y pegue no entra.
 */
export function limpiarAnalisis(bruto = {}) {
  const b = bruto ?? {};
  const punt = Math.round(Number(b.puntuacion));
  return {
    puntuacion: Number.isFinite(punt) ? Math.min(100, Math.max(0, punt)) : null,
    resumen: texto(b.resumen, 1500),
    fortalezas: listaDe(b.fortalezas, 4),
    foto: bloque(b.foto),
    nombre: {
      ...bloque(b.nombre),
      propuesta: texto(b.nombre?.propuesta, 200).slice(0, LIMITES_PERFIL.nombre),
    },
    bio: {
      estado: estado(b.bio?.estado),
      comentario: texto(b.bio?.comentario, 800),
      opciones: listaDe(b.bio?.opciones, 3, 400).filter((o) => [...o].length <= LIMITES_PERFIL.bio),
    },
    enlace: bloque(b.enlace),
    destacados: {
      estado: estado(b.destacados?.estado),
      comentario: texto(b.destacados?.comentario, 800),
      propuesta: (Array.isArray(b.destacados?.propuesta) ? b.destacados.propuesta : []).slice(0, 8).map((d) => ({
        titulo: texto(d?.titulo, 40).slice(0, LIMITES_PERFIL.tituloDestacado),
        contenido: texto(d?.contenido, 300),
        icono: ICONOS_DESTACADO.includes(d?.icono) ? d.icono : "star",
      })).filter((d) => d.titulo),
    },
    fijados: {
      comentario: texto(b.fijados?.comentario, 600),
      propuesta: (Array.isArray(b.fijados?.propuesta) ? b.fijados.propuesta : []).map((f) => ({
        titulo: texto(f?.titulo, 80),
        idea: texto(f?.idea, 500),
      })).filter((f) => f.titulo || f.idea).slice(0, 3),
    },
    referentes: {
      comentario: texto(b.referentes?.comentario, 800),
      aprender: listaDe(b.referentes?.aprender, 6),
    },
    rejilla: bloque(b.rejilla, true),
    contenido: bloque(b.contenido, true),
    prioridades: listaDe(b.prioridades, 5),
  };
}

/** El objeto JSON que venga dentro del texto de la IA, o null. */
export function extraerJSON(textoIA) {
  const t = String(textoIA ?? "");
  const inicio = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (inicio < 0 || fin < inicio) return null;
  try { return JSON.parse(t.slice(inicio, fin + 1)); } catch { return null; }
}

// ============================================================
// «Aplicar en el perfil»: la lista de cambios, guardada en el servidor
//
// Antes se marcaba en el navegador de cada uno: lo que hacía Ana no lo veía
// Juan, y al cambiar de equipo se perdía. Ahora cada cambio guarda quién y
// cuándo (`auditorias.aplicado`, 0057) y, con todo hecho, el perfil se marca
// «optimizado» (`optimizado_at`). «Comprobar en Instagram» relee el perfil y
// marca solo lo que se puede ver por la API: el nombre, la biografía y el
// enlace. La foto no (su dirección del CDN cambia en cada lectura aunque la
// foto sea la misma), y los destacados y los fijados la API no los da nunca.
// ============================================================

const normal = (t) => String(t ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Los cambios que propone una auditoría, en el orden en que se hacen. `k` es la clave estable de cada uno. */
export function itemsParaAplicar(analisis = {}, perfil = {}) {
  const a = analisis ?? {};
  return [
    a.foto?.estado && a.foto.estado !== "bien" && { k: "foto", texto: "Cambiar la foto de perfil", auto: false },
    a.nombre?.propuesta && a.nombre.propuesta !== perfil?.nombre && { k: "nombre", texto: `Nombre: «${a.nombre.propuesta}»`, auto: true },
    a.bio?.opciones?.length > 0 && { k: "bio", texto: "Biografía: pegar una de las opciones de arriba", auto: true },
    a.enlace?.recomendacion && a.enlace.estado !== "bien" && { k: "enlace", texto: `Enlace: ${a.enlace.recomendacion}`, auto: true },
    a.destacados?.propuesta?.length > 0 && { k: "destacados", texto: `Destacados: ${a.destacados.propuesta.map((d) => d.titulo).join(", ")}`, auto: false },
    ...(a.fijados?.propuesta ?? []).map((f, i) => ({ k: `fijado-${i}`, texto: `Fijar: ${f.titulo || f.idea}`, auto: false })),
  ].filter(Boolean);
}

/** Lo guardado, limpio: { clave: { hecho, por, at, auto } }. Sólo claves cortas y sin rarezas. */
export function limpiarAplicado(valor) {
  let v = valor;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return {}; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const salida = {};
  for (const [k, x] of Object.entries(v)) {
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(k) || !x || typeof x !== "object") continue;
    salida[k] = { hecho: x.hecho === true, por: String(x.por ?? "").slice(0, 80), at: String(x.at ?? "").slice(0, 40), auto: x.auto === true };
  }
  return salida;
}

/** Cuántos están hechos de los que pide la auditoría (lo marcado de una clave que ya no se pide no cuenta). */
export function progresoAplicado(items, aplicado = {}) {
  const hechos = items.filter((x) => aplicado[x.k]?.hecho).length;
  return { hechos, total: items.length, completo: items.length > 0 && hechos === items.length };
}

/**
 * Lo que ya se ve hecho en el perfil leído ahora. Devuelve las claves hechas y, de las que cambiaron sin ser lo
 * propuesto, un aviso (una persona decide si vale).
 * @returns {{ hechas: string[], avisos: string[] }}
 */
export function comprobarEnPerfil(analisis = {}, antes = {}, ahora = {}) {
  const hechas = [];
  const avisos = [];
  const a = analisis ?? {};
  if (a.nombre?.propuesta) {
    if (normal(ahora.nombre) === normal(a.nombre.propuesta)) hechas.push("nombre");
    else if (normal(ahora.nombre) !== normal(antes.nombre)) avisos.push(`El nombre cambió a «${ahora.nombre}», pero no es el propuesto.`);
  }
  if (a.bio?.opciones?.length) {
    if (a.bio.opciones.some((o) => normal(o) === normal(ahora.bio))) hechas.push("bio");
    else if (normal(ahora.bio) !== normal(antes.bio)) avisos.push("La biografía cambió, pero no es ninguna de las opciones: si vale, márcala a mano.");
  }
  if (a.enlace?.recomendacion && a.enlace.estado !== "bien" && normal(ahora.enlace) && normal(ahora.enlace) !== normal(antes.enlace)) {
    hechas.push("enlace");
  }
  return { hechas, avisos };
}
