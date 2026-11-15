// ============================================================
// La pestaña Cerebro: lo que decide qué se ve
//
// Todo puro. Los nombres de los tipos, cómo se filtran y ordenan las
// notas, cómo se cuenta lo que hizo una importación o la IA, y cómo se
// lee un documento que se suelta encima.
// ============================================================

/** Cada tipo de nota, como lo ve quien no sabe qué es un «tipo». */
export const TIPOS_VISTA = Object.freeze({
  ficha: { nombre: "Ficha técnica", ayuda: "La tarjeta corta que la IA lee siempre" },
  cifras: { nombre: "Cifras", ayuda: "Precios, plazos y teléfonos vigentes; la IA los lee siempre" },
  pautas: { nombre: "Pautas para escribir", ayuda: "Reglas de redacción, estructuras de guion y lo que la IA no hace nunca; la IA las lee SIEMPRE que escribe (chat, ideas, guiones, Estudio)" },
  marca: { nombre: "Marca", ayuda: "Tono, personas, límites: lo que define a la marca" },
  maquetacion: { nombre: "Maquetación", ayuda: "Plantillas y medidas para pedirle las piezas a Meta AI; no entra en los textos" },
  documento: { nombre: "Documento", ayuda: "Lo importado o subido que no es canon" },
  nota: { nombre: "Nota", ayuda: "Escrita a mano" },
  decision: { nombre: "Decisión", ayuda: "Lo que el cliente aprobó o rechazó, y por qué" },
  mercado: { nombre: "Estudio de mercado", ayuda: "El estudio de mercado y las referencias de la competencia" },
  borrador: { nombre: "Borrador", ayuda: "Informes de otros sistemas: pesan poco y no salen en los textos" },
});

/** Los filtros por tipo, en el orden en que se ofrecen. */
export const FILTROS_TIPO = Object.freeze(["todas", "ficha", "cifras", "pautas", "marca", "mercado", "documento", "nota", "maquetacion", "borrador"]);

/** Los tipos que el asistente puede proponer guardar en el cerebro, en este orden. */
export const TIPOS_PROPONIBLES = Object.freeze(["pautas", "nota", "decision", "marca"]);

/**
 * Lo que propone el modelo, limpio: un tipo que no se puede proponer pasa a «nota», y título y texto se recortan a
 * lo que acepta el cerebro. Pura.
 */
export function propuestaLimpia(entrada = {}) {
  return {
    tipo: TIPOS_PROPONIBLES.includes(entrada.tipo) ? entrada.tipo : "nota",
    titulo: String(entrada.titulo ?? "").trim().slice(0, 140),
    texto: String(entrada.texto ?? "").trim().slice(0, 20_000),
  };
}

export const nombreDeTipo = (tipo) => TIPOS_VISTA[tipo]?.nombre ?? "Nota";

/** Orden de las notas: la ficha, las cifras y las pautas primero, luego por tipo y por título. */
const PESO = { ficha: 0, cifras: 1, pautas: 1.5, marca: 2, mercado: 3, decision: 4, documento: 5, nota: 6, maquetacion: 7, borrador: 8 };
export function ordenarNotas(notas) {
  return [...notas].sort((a, b) => (PESO[a.tipo] ?? 9) - (PESO[b.tipo] ?? 9) || a.titulo.localeCompare(b.titulo, "es"));
}

/** Los tipos que la IA lee SIEMPRE, sin buscarlos: van arriba, aparte, porque un error ahí está en todo lo que escribe. */
export const TIPOS_SIEMPRE = Object.freeze(["ficha", "cifras", "pautas"]);

const GRUPO_ORIGEN = {
  manual: "Escritas aquí",
  ia: "Escritas por la IA",
  mercado: "Del estudio de mercado",
  documento: "Documentos subidos",
  app: "Aprendidas de la aplicación",
};

/** «clientes/Rofer/01_brand_guidelines.md» → «01 brand guidelines». */
export const nombreDeArchivo = (ruta) => String(ruta ?? "").split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "Archivo";

/**
 * Las notas como se enseñan: lo que la IA lee siempre arriba, y lo demás agrupado por de dónde salió (cada archivo del
 * repositorio es un grupo: una nota es una SECCIÓN de ese archivo, y suelta no se entendía de dónde venía). Pura.
 * @returns {{ siempre: object[], grupos: Array<{ clave, titulo, ayuda, notas: object[] }> }}
 */
export function agruparNotas(notas) {
  const siempre = ordenarNotas(notas.filter((n) => TIPOS_SIEMPRE.includes(n.tipo)));
  const mapa = new Map();
  for (const n of ordenarNotas(notas.filter((x) => !TIPOS_SIEMPRE.includes(x.tipo)))) {
    const delRepo = n.origen === "repositorio" && n.fuente;
    const clave = delRepo ? `repo:${n.fuente}` : `origen:${n.origen ?? "manual"}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        titulo: delRepo ? nombreDeArchivo(n.fuente) : GRUPO_ORIGEN[n.origen] ?? "Otras",
        ayuda: delRepo ? `Del repositorio: ${n.fuente}` : "",
        notas: [],
      });
    }
    mapa.get(clave).notas.push(n);
  }
  // Primero lo escrito aquí (lo más reciente de la agencia), luego los archivos por nombre.
  const orden = (g) => (g.clave === "origen:manual" ? 0 : g.clave.startsWith("repo:") ? 1 : 2);
  const grupos = [...mapa.values()].sort((a, b) => orden(a) - orden(b) || a.titulo.localeCompare(b.titulo, "es"));
  return { siempre, grupos };
}

export const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Filtra por tipo, por «sólo internas» y por lo que se escriba en el cuadro (título o resumen). */
export function filtrarNotas(notas, { tipo = "todas", soloInternas = false, texto = "" } = {}) {
  const q = sinTildes(texto).trim();
  return notas.filter((n) => {
    if (tipo !== "todas" && n.tipo !== tipo) return false;
    if (soloInternas && !n.interna) return false;
    if (q && !sinTildes(`${n.titulo} ${n.resumen ?? ""}`).includes(q)) return false;
    return true;
  });
}

/** Cuántas notas hay de cada tipo, para los números de los filtros. */
export function contarPorTipo(notas) {
  const c = { todas: notas.length };
  for (const n of notas) c[n.tipo] = (c[n.tipo] ?? 0) + 1;
  return c;
}

/** 3 541 → «3,5 mil»; 126 975 → «127 mil»; 800 → «800». */
export function formatoCaracteres(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${(k >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toLocaleString("es")} mil`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que hizo una importación, en frases. → { texto, detalles: [{ titulo, lista }] }
 * `detalles` son las notas que la pantalla debe enseñar a la agencia: las
 * que se marcaron internas solas y las que hay que revisar.
 */
export function describirImportacion(r) {
  const a = r?.archivos ?? {};
  const n = r?.notas ?? {};
  const partes = [];
  if (n.creadas) partes.push(`${plural(n.creadas, "nota creada", "notas creadas")} de ${plural((a.nuevos ?? 0) + (a.actualizados ?? 0), "archivo", "archivos")}`);
  if (n.reemplazadas) partes.push(`${plural(n.reemplazadas, "nota renovada", "notas renovadas")}`);
  if (n.borradas) partes.push(`${plural(n.borradas, "nota quitada", "notas quitadas")}: ya no están en GitHub`);
  if (n.conservadas) partes.push(`${plural(n.conservadas, "nota que corregiste aquí se conservó", "notas que corregiste aquí se conservaron")}`);
  if (r?.conflictos?.total) partes.push(`${plural(r.conflictos.total, "nota choca", "notas chocan")} con GitHub: decide abajo cuál vale`);
  if (n.saltadas) partes.push(`${plural(n.saltadas, "sección no se trajo porque la borraste aquí", "secciones no se trajeron porque las borraste aquí")}`);
  if (a.iguales) partes.push(`${plural(a.iguales, "archivo sin cambios", "archivos sin cambios")}`);
  if (a.cambiados) partes.push(`${plural(a.cambiados, "archivo cambió", "archivos cambiaron")} en el repositorio (usa «Actualizar desde GitHub» para traerlos)`);
  if (a.omitidos) partes.push(`${plural(a.omitidos, "archivo quedó", "archivos quedaron")} para la siguiente vuelta: vuelve a pulsar el botón`);
  if (a.fallidos) partes.push(`${plural(a.fallidos, "archivo no se pudo leer", "archivos no se pudieron leer")}`);
  if (r?.sinSitio?.length) partes.push(`${plural(r.sinSitio.length, "archivo no cupo", "archivos no cupieron")}: el cerebro llegó a su tope de 400 notas`);
  if (r?.truncado) partes.push("GitHub cortó la lista de archivos (el repositorio es muy grande): no se quitó nada de lo que podría faltar");
  if (r?.carpetaCambio) partes.push("La carpeta de GitHub de la ficha cambió: pulsa «Actualizar desde GitHub» para quitar lo de la carpeta anterior");
  const detalles = [];
  if (r?.internas?.length) detalles.push({ titulo: "Marcadas como internas (no salen en los textos que se publican): si alguna es pública, quítale el candado", lista: r.internas });
  if (r?.revisar?.length) detalles.push({ titulo: "Mencionan algo interno: revisa si alguna debe marcarse", lista: r.revisar });
  return { texto: partes.length ? `${partes.join(". ")}.` : "No había nada nuevo que traer.", detalles };
}

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
  return `${partes.join(" · ")}.`;
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
    else if (j < m && (i >= n || largo[i][j + 1] >= largo[i + 1][j])) { lineas.push({ tipo: "github", texto: b[j] }); j++; }
    else { lineas.push({ tipo: "mia", texto: a[i] }); i++; }
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

/**
 * Qué le pasa a quien todavía no tiene ficha técnica, para que no crea que el cerebro ya trabaja: mientras falte, la
 * generación sigue con el ADN guardado en la ficha del cliente (si lo hay) y el cerebro sólo se consulta a mano.
 * Sin ADN guardado, la IA tiene lo que el cerebro encuentre para cada tarea y nada más.
 */
export function avisoSinFicha(estado, cliente) {
  if (!estado || estado.conFicha || !estado.notas) return "";
  return String(cliente?.githubContext ?? "").trim()
    ? "Todavía no hay ficha técnica: hasta que la prepares, los textos se siguen escribiendo con el ADN guardado en la ficha del cliente. La IA empieza a usar este cerebro cuando la ficha exista."
    : "Todavía no hay ficha técnica: la IA sólo tiene los pasajes que encuentra en las notas para cada tarea. Prepárala para que conozca al cliente de entrada.";
}

/** Lo que hizo la pasada de IA, en una frase. */
export function describirFicha(r) {
  const ficha = { creada: "Ficha técnica escrita", reemplazada: "Ficha técnica renovada", conservada: "La ficha técnica tiene cambios tuyos: se conservó" }[r?.ficha] ?? "";
  const cifras = { creada: "cifras escritas", reemplazada: "cifras renovadas", conservada: "las cifras tienen cambios tuyos: se conservaron", vacia: "no había cifras claras que anotar" }[r?.cifras] ?? "";
  const extra = [];
  if (r?.leidas) extra.push(`leyó ${plural(r.leidas, "nota", "notas")}`);
  if (r?.fuera?.length) extra.push(`${plural(r.fuera.length, "no cupo", "no cupieron")}`);
  if (r?.aviso) extra.push(r.aviso);
  return `${[ficha, cifras].filter(Boolean).join("; ")}${extra.length ? ` (${extra.join("; ")})` : ""}.`;
}

// ------------------------------------------------------------
// Documentos que se sueltan
// ------------------------------------------------------------

const MAX_CARACTERES = 200_000;
const TEXTO = /\.(md|markdown|txt|csv|json)$/i;
const CON_LIBRERIA = /\.(pdf|docx?|xlsx?|pptx?)$/i;

/** Un nombre de archivo como título: «precios-2026_v2.md» → «Precios 2026 v2». */
export function tituloDeDocumento(nombre) {
  const t = String(nombre ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Documento";
}

/** ¿Se puede leer este archivo como nota? → { ok: true } o { ok: false, motivo }. */
export function validarDocumento(nombre, tamano) {
  if (CON_LIBRERIA.test(nombre)) {
    return { ok: false, motivo: `«${nombre}»: los PDF, Word y Excel llegan más adelante. Por ahora, pega su texto en una nota o sube un .md, .txt o .csv.` };
  }
  if (!TEXTO.test(nombre)) return { ok: false, motivo: `«${nombre}»: sólo se leen archivos .md, .txt, .csv y .json.` };
  if (tamano > MAX_CARACTERES * 4) return { ok: false, motivo: `«${nombre}» es demasiado grande. Pártelo en varios.` };
  return { ok: true };
}

/** El texto de un archivo como cuerpo de nota, o el motivo por el que no vale. Puro salvo por `file.text()`. */
export async function leerDocumento(file) {
  const v = validarDocumento(file.name, file.size);
  if (!v.ok) return { error: v.motivo };
  const texto = (await file.text()).replace(/\r\n?/g, "\n").trim();
  if (!texto) return { error: `«${file.name}» está vacío.` };
  if (texto.length > MAX_CARACTERES) return { error: `«${file.name}» pasa de ${MAX_CARACTERES.toLocaleString("es")} caracteres. Pártelo en varios.` };
  return { nota: { titulo: tituloDeDocumento(file.name), texto, tipo: "documento", origen: "documento", fuente: file.name } };
}
