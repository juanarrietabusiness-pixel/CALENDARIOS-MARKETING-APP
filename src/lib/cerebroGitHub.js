// ============================================================
// El cerebro y GitHub, en la pantalla (puro)
//
// Lo que enseña la pestaña Cerebro de cómo va con GitHub: varias vueltas de
// una importación sumadas, cuándo se miró y cuándo se trajo algo, lo que de
// la carpeta no entra y la diferencia «La tuya / La de GitHub» de una nota
// que choca. Aparte de cerebroVista.js a propósito: ése lo cargan también el
// asistente y el panel de una publicación, que no necesitan nada de esto.
// ============================================================

import { nombreDeArchivo } from "./cerebroVista";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Suma dos vueltas de una importación (la pantalla sigue sola mientras queden archivos): la última dice lo que queda. Pura. */
export function sumarImportaciones(a, b) {
  if (!a) return b;
  const sumar = (x = {}, y = {}) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [k, (Number(x[k]) || 0) + (Number(y[k]) || 0)]));
  return {
    ...b,
    archivos: { ...sumar(a.archivos, b.archivos), omitidos: b.archivos?.omitidos ?? 0, cambiados: b.archivos?.cambiados ?? 0, iguales: b.archivos?.iguales ?? 0 },
    notas: sumar(a.notas, b.notas),
    internas: [...(a.internas ?? []), ...(b.internas ?? [])],
    revisar: [...(a.revisar ?? []), ...(b.revisar ?? [])],
    sinSitio: [...(a.sinSitio ?? []), ...(b.sinSitio ?? [])],
    trajo: Boolean(a.trajo || b.trajo),
  };
}

const fechaCorta = (iso, ahora) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date(ahora);
  const mismoDia = d.toLocaleDateString("es-PA", { timeZone: "America/Panama" }) === hoy.toLocaleDateString("es-PA", { timeZone: "America/Panama" });
  const hora = d.toLocaleTimeString("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit" });
  return mismoDia ? `hoy a las ${hora}` : `el ${d.toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short" })} a las ${hora}`;
};

/**
 * Cómo va el cerebro con GitHub, en una frase: cuándo se miró por última vez y cuándo se trajo algo. Pura (`ahora`
 * para los tests). → "" si nunca se miró.
 */
export function describirSincronia(sync, ahora = Date.now()) {
  if (!sync?.revisadoAt) return "";
  const partes = [`Revisado en GitHub ${fechaCorta(sync.revisadoAt, ahora)}`];
  if (sync.sincronizadoAt) partes.push(`último cambio traído ${fechaCorta(sync.sincronizadoAt, ahora)}`);
  if (sync.pendientes) partes.push(`${plural(sync.pendientes, "archivo espera", "archivos esperan")} la siguiente vuelta`);
  const t = partes.join(" · ");
  return t.endsWith(".") ? t : `${t}.`;
}

const NO_TEXTO = { pdf: ["PDF", "PDF"], word: ["Word", "Word"], hoja: ["hoja de cálculo", "hojas de cálculo"], imagen: ["imagen", "imágenes"], otro: ["archivo de otro tipo", "archivos de otro tipo"] };

/** Lo que de la carpeta de GitHub NO entra en el cerebro, en frases (con su lista, si la hay). Pura. */
export function loQueNoEntro(fuera = {}) {
  const salida = [];
  if (fuera.truncado) salida.push({ texto: "GitHub cortó la lista de archivos del repositorio (es muy grande): lo que falte no se quita del cerebro hasta que la lista llegue entera.", lista: [] });
  const no = Object.entries(NO_TEXTO).filter(([k]) => fuera.noTexto?.[k]).map(([k, [uno, varios]]) => plural(fuera.noTexto[k], uno, varios));
  if (no.length) salida.push({ texto: `No se leen ${no.join(", ")}: el cerebro sólo lee .md, .txt, .json y .yml. Si algo de ahí importa, pásalo a un .md en GitHub.`, lista: [] });
  if (fuera.grandes?.length) salida.push({ texto: "Demasiado grandes (más de 400 KB): pártelos en varios.", lista: fuera.grandes.map(nombreDeArchivo) });
  if (fuera.profundos?.length) salida.push({ texto: "Están a más de tres carpetas de hondo: súbelos un nivel.", lista: fuera.profundos.map((r) => String(r).split("/").slice(-3).join("/")) });
  if (fuera.fallidos?.length) salida.push({ texto: "GitHub no los dejó leer en la última vuelta (se intentan otra vez):", lista: fuera.fallidos.map(nombreDeArchivo) });
  if (fuera.sinSitio?.length) salida.push({ texto: "No cupieron: el cerebro llegó a su tope de 400 notas. Borra las que no sirvan.", lista: fuera.sinSitio.map(nombreDeArchivo) });
  return salida;
}

/**
 * Lo que cambia entre la nota de aquí (`mia`) y la sección de GitHub (`github`), línea a línea (la subsecuencia común
 * más larga). Los tramos iguales largos se pliegan en «… N líneas iguales …». → [{ tipo: "igual"|"mia"|"github"|"plegado",
 * texto, n? }]. Con textos enormes (más de 400 líneas) no se compara: null. Pura.
 */
export function diferenciaPorLineas(mia, github, { contexto = 2 } = {}) {
  const a = String(mia ?? "").replace(/\r\n?/g, "\n").split("\n");
  const b = String(github ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (a.length > 400 || b.length > 400) return null;
  const n = a.length;
  const m = b.length;
  const largo = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) largo[i][j] = a[i] === b[j] ? largo[i + 1][j + 1] + 1 : Math.max(largo[i + 1][j], largo[i][j + 1]);
  const lineas = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { lineas.push({ tipo: "igual", texto: a[i] }); i++; j++; }
    else if (i < n && (j >= m || largo[i + 1][j] >= largo[i][j + 1])) { lineas.push({ tipo: "mia", texto: a[i] }); i++; }
    else { lineas.push({ tipo: "github", texto: b[j] }); j++; }
  }
  // Plegar lo igual que queda lejos de un cambio.
  const cerca = lineas.map((_, k) => lineas.slice(Math.max(0, k - contexto), k + contexto + 1).some((x) => x.tipo !== "igual"));
  const salida = [];
  for (let k = 0; k < lineas.length; k++) {
    if (lineas[k].tipo !== "igual" || cerca[k]) { salida.push(lineas[k]); continue; }
    const ultimo = salida[salida.length - 1];
    if (ultimo?.tipo === "plegado") ultimo.n++;
    else salida.push({ tipo: "plegado", texto: "", n: 1 });
  }
  return salida;
}
