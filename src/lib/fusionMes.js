// ============================================================
// Juntar lo que cambié yo con lo que otra persona guardó en el MISMO mes mientras tanto (puro)
//
// Un mes es UNA fila con todas sus publicaciones (`days`) y se guarda entera. Sin condición ganaba la última escritura:
// lo que había puesto el Estudio, Claude o la otra persona mientras yo escribía desaparecía sin ningún aviso. Ahora el
// guardado lleva la versión que se leyó (`updatedAt`) y, si otra persona guardó entremedias (409), el navegador junta
// las dos y vuelve a guardar (src/lib/db.js → saveCalendar). Es lo mismo que hace el servidor con `cambiarCalendario`
// (worker/lib/estudio/ponerEnPost.js), pero desde la pantalla, que tiene la versión de la que partió.
//
// La regla, de tres versiones: la BASE (lo que leí), lo MÍO (lo que quiero guardar) y lo SUYO (lo que hay ahora):
//   · lo del mes (campaña, ofertas, conceptos…) y cada clave de `opciones`: lo mío si lo cambié desde la base; si no,
//     lo suyo;
//   · cada publicación, POR CAMPO: lo mío en los campos que cambié yo; lo suyo en todos los demás. Si los dos cambiamos
//     el mismo campo, gana lo mío (es lo que estoy viendo);
//   · una publicación que añadí yo entra; una que añadió la otra persona se queda;
//   · una que quité yo se va, salvo que la otra persona la cambiara entremedias (entonces se queda la suya);
//   · una que quitó (o se llevó a otro mes) la otra persona se va, aunque yo la estuviera cambiando: si volviera, la
//     misma publicación estaría en dos meses;
//   · el día: el que le puse yo si lo cambié; si no, el suyo.
// ============================================================

const igual = (a, b) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Lo del mes que se guarda (calendarToRow), sin `days` ni `opciones`, que van aparte. */
const CAMPOS_MES = ["name", "campaign", "weekConcepts", "generatedAt", "allowEditing", "visualReferences", "dayLabels", "offers", "promoCode"];

const esObjeto = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** De cada clave: lo mío si cambió desde la base (también si la quité); si no, lo suyo. */
function porCampo(base, mio, suyo) {
  const b = esObjeto(base) ? base : {};
  const m = esObjeto(mio) ? mio : {};
  const salida = { ...(esObjeto(suyo) ? suyo : {}) };
  for (const k of new Set([...Object.keys(b), ...Object.keys(m)])) {
    if (igual(m[k], b[k])) continue;
    if (m[k] === undefined) delete salida[k];
    else salida[k] = m[k];
  }
  return salida;
}

/** id de publicación → { post, fecha } de unos días. */
function indice(days) {
  const salida = new Map();
  for (const d of Array.isArray(days) ? days : []) {
    for (const p of Array.isArray(d?.posts) ? d.posts : []) if (p?.id) salida.set(p.id, { post: p, fecha: d.date });
  }
  return salida;
}

const sinPosts = (d) => {
  if (!esObjeto(d)) return {};
  const { posts: _posts, ...resto } = d;
  return resto;
};

/**
 * Lo mío sobre lo suyo, desde la base. Sin base (no se sabe de dónde partió lo mío) o sin lo suyo, lo mío tal cual: es
 * lo que se guardaba antes. → el mes juntado, con el id y la versión de lo SUYO (para volver a guardar con esa
 * condición).
 */
export function fusionarGuardado(base, mio, suyo) {
  if (!esObjeto(base) || !esObjeto(suyo)) return mio;
  if (!esObjeto(mio)) return suyo;
  const salida = { ...suyo };
  for (const k of CAMPOS_MES) if (!igual(mio[k], base[k])) salida[k] = mio[k];
  if (esObjeto(mio.opciones) || esObjeto(suyo.opciones)) salida.opciones = porCampo(base.opciones, mio.opciones, suyo.opciones);

  // Los días: los suyos, con lo de cada día (nombre, concepto…) que cambié yo, y los que creé yo.
  const dias = new Map((Array.isArray(suyo.days) ? suyo.days : []).map((d) => [d.date, { ...d, posts: [...(d.posts ?? [])] }]));
  const diasBase = new Map((Array.isArray(base.days) ? base.days : []).map((d) => [d.date, d]));
  const diasMios = new Map((Array.isArray(mio.days) ? mio.days : []).map((d) => [d.date, d]));
  for (const [fecha, d] of diasMios) {
    const actual = dias.get(fecha);
    if (!actual) dias.set(fecha, { ...sinPosts(d), posts: [] });
    else dias.set(fecha, { ...porCampo(sinPosts(diasBase.get(fecha)), sinPosts(d), sinPosts(actual)), posts: actual.posts });
  }
  const quitar = (id) => {
    for (const d of dias.values()) {
      const i = d.posts.findIndex((p) => p?.id === id);
      if (i >= 0) { d.posts.splice(i, 1); return; }
    }
  };
  const poner = (fecha, post) => {
    if (!dias.has(fecha)) dias.set(fecha, { ...sinPosts(diasMios.get(fecha) ?? { date: fecha }), date: fecha, posts: [] });
    dias.get(fecha).posts.push(post);
  };

  const enBase = indice(base.days);
  const enMio = indice(mio.days);
  const enSuyo = indice(suyo.days);

  for (const [id, m] of enMio) {
    const b = enBase.get(id);
    const s = enSuyo.get(id);
    // No la toqué: queda como la tiene la otra persona (o no queda, si la quitó).
    if (b && igual(m.post, b.post) && m.fecha === b.fecha) continue;
    // La cambié yo y la otra persona la quitó o se la llevó a otro mes: se va.
    if (b && !s) continue;
    const post = b ? porCampo(b.post, m.post, s.post) : m.post;
    const fecha = b && m.fecha === b.fecha && s ? s.fecha : m.fecha;
    if (s && s.fecha === fecha) {
      const dia = dias.get(fecha);
      const i = dia.posts.findIndex((p) => p?.id === id);
      dia.posts[i] = post;
    } else {
      if (s) quitar(id);
      poner(fecha, post);
    }
  }
  // Las que quité yo: se van, salvo que la otra persona las cambiara entremedias.
  for (const [id, b] of enBase) {
    if (enMio.has(id)) continue;
    const s = enSuyo.get(id);
    if (s && igual(s.post, b.post)) quitar(id);
  }

  // Un día que quitamos uno de los dos y se quedó sin nada, fuera.
  const diasSuyos = new Set((Array.isArray(suyo.days) ? suyo.days : []).map((d) => d.date));
  for (const [fecha, d] of dias) {
    if (!d.posts.length && diasBase.has(fecha) && (!diasMios.has(fecha) || !diasSuyos.has(fecha))) dias.delete(fecha);
  }
  salida.days = [...dias.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return salida;
}
