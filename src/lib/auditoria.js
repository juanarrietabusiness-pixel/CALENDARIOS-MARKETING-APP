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
