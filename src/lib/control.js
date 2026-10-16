// ============================================================
// El CONTROL DE CALIDAD de una pieza (puro)
//
// Nano Banana diseña mejor que cualquier plantilla —integra el texto con la
// luz, la perspectiva y la composición—, pero se equivoca en letras. En vez
// de quitarle el texto (y la creatividad), cada pieza pasa por aquí al
// terminar: la IA MIRA la imagen, transcribe el texto tal cual se ve y busca
// lo que la agencia no puede dejar pasar —letras mal, precios que no están
// en el catálogo, el logo deformado o ausente, manos o caras deformes—.
//
// El veredicto no lo da sólo la IA: el CÓDIGO compara palabra por palabra el
// texto esperado con el leído (`compararTexto`), con tildes y eñes, porque
// un modelo que lee «Sofa» donde dice «Sofá» suele decir que está bien.
//
// Si sólo falla el texto, la corrección es QUIRÚRGICA (`correccionDeTexto`):
// se edita la misma imagen («cambia X por Y, no toques nada más») en vez de
// pedir otra desde cero, que perdería el diseño que salió bien.
//
// Lo usan el Worker (worker/lib/estudio/control.js) y la pantalla
// (src/lib/controlEstudio.js, el Estudio, el lote, el carrusel y «Producir el mes»).
// ============================================================

const corto = (t, max = 200) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Las palabras de un texto para compararlas: sin puntuación ni mayúsculas, CON tildes y eñes. Pura. */
export function palabras(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .replace(/[«»“”"'¿?¡!.,;:()[\]{}…·•/\\|*_~-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** La misma palabra sin tildes: para reconocer «sofa» como la versión mal escrita de «sofá». Pura. */
const sinTildes = (p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La distancia entre dos palabras (cuántas letras cambian; dos de sitio cuentan una), para emparejar «cmaa» con «cama». Pura. */
function distancia(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Dos letras cambiadas de sitio («cmaa» por «cama») cuentan como un error, que es lo que hace el motor.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/**
 * Compara el texto que se pidió con el que se lee en la imagen → [{ esperado, escrito }]: cada palabra esperada que no
 * aparece tal cual, con la leída que más se le parece (o «» si falta). Mayúsculas y puntuación no cuentan; tildes y
 * eñes, sí. Pura.
 */
export function compararTexto(esperado, leido) {
  const quiere = palabras(esperado);
  const hay = palabras(leido);
  if (!quiere.length) return [];
  const libres = [...hay];
  const fuera = [];
  for (const p of quiere) {
    const i = libres.indexOf(p);
    if (i >= 0) { libres.splice(i, 1); continue; }
    // La más parecida de las que sobran: misma palabra sin tildes, o a una o dos letras.
    let mejor = -1;
    let dMejor = Infinity;
    libres.forEach((x, k) => {
      const dd = sinTildes(x) === sinTildes(p) ? 0.5 : distancia(x, p);
      if (dd < dMejor) { dMejor = dd; mejor = k; }
    });
    const cerca = mejor >= 0 && dMejor <= Math.max(1, Math.ceil(p.length / 3));
    fuera.push({ esperado: p, escrito: cerca ? libres[mejor] : "" });
    if (cerca) libres.splice(mejor, 1);
  }
  return fuera;
}

/**
 * El texto que se le pidió al motor, sacado del pedido (lo que va entre comillas tras «Texto en la imagen» o «Escribe
 * en la lámina este texto»). Vacío si el pedido no pedía texto. Pura.
 */
export function textoDelPedido(prompt) {
  const t = String(prompt ?? "");
  const comillas = (trozo) => [...String(trozo).matchAll(/["“«]([^"”»]+)["”»]/g)].map((x) => x[1].trim()).filter(Boolean).join("\n");
  const m = t.match(/(?:Texto en la imagen[^:]*|Escribe en la lámina este texto[^:]*):\s*([\s\S]*?)(?:\.\s*Ningún otro texto|\n\n|$)/i);
  if (m) return comillas(m[1]);
  // «Mejorar idea» integra el texto en la escena, entre comillas: se toma lo citado DENTRO de la escena.
  const escena = t.match(/(?:^|\n\n)Escena: ([\s\S]*?)(?:\n\n|$)/)?.[1] ?? (t.includes("\n\n") ? "" : t);
  return comillas(escena);
}

/**
 * Lo que se le pide a la IA. La imagen va aparte. `texto`: lo que tiene que decir (exacto); `precios`: los del
 * catálogo; `logo`: si la pieza debía llevar el logo de la marca (se le pidió al modelo). Pura.
 */
export function pedidoDeControl({ marca = "la marca", texto = "", precios = [], logo = false, evitar = "", reglas = [], sistema = "" } = {}) {
  return [
    `Eres el control de calidad de una agencia. Revisa esta pieza de ${marca} antes de que la vea el cliente. Sé estricto y concreto: lo que dejes pasar lo ve el cliente.`,
    "",
    "1. Transcribe EXACTAMENTE todo el texto que se ve en la imagen, letra por letra, con sus tildes y signos, tal cual (aunque esté mal escrito). Una línea por renglón. Si no hay texto, vacío.",
    texto ? `2. El texto que DEBÍA decir (exacto): "${corto(texto, 400).replace(/"/g, "'")}". Di cada palabra mal escrita, que falte o que sobre.` : "2. No se pidió texto: di si apareció texto inventado o letras sin sentido.",
    precios.length ? `3. Los únicos precios válidos son los del catálogo: ${precios.slice(0, 20).join(", ")}. Di cualquier precio, porcentaje o cifra de venta que no esté ahí.` : "3. Di cualquier precio, porcentaje o cifra de venta que aparezca (no se pidió ninguno).",
    logo ? `4. La pieza debía llevar el logo de ${marca}: di si falta, si está deformado o redibujado, o si está bien.` : "4. Di si aparece el logo de otra marca o un logo inventado.",
    "5. Busca deformaciones: manos, dedos, caras, ojos, objetos fundidos, perspectivas imposibles, texto fantasma de fondo.",
    evitar || reglas.length ? `6. La marca pide: ${[evitar && `nunca ${corto(evitar, 300)}`, ...reglas.map((r) => corto(r, 120))].filter(Boolean).join("; ")}. Di lo que no se cumpla.` : "",
    // Una lámina de un carrusel: lo que se sale del sistema de su portada (src/lib/sistemaCarrusel.js).
    sistema ? `7. Esta pieza es parte de una serie. ${corto(sistema, 900)} Di en "serie" lo que se salga de ese sistema y se note a simple vista (titular de otro tamaño o peso, el texto en otra zona, otros márgenes, otros colores, falta un elemento que se repite); si lo respeta, vacío.` : "",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"textoLeido":"…","errores":[{"escrito":"lo que dice","esperado":"lo que debía decir"}],"precios":["precio que no está en el catálogo"],"logo":"bien|falta|deformado|no aplica","deformaciones":["…"],"otros":["…"],${sistema ? '"serie":["…"],' : ""}"puntaje":0-10}`,
  ].filter((l) => l !== "").join("\n");
}

const lista = (x, max = 6, largo = 160) => (Array.isArray(x) ? x.map((s) => corto(s, largo)).filter(Boolean).slice(0, max) : []);
const LOGOS = new Set(["bien", "falta", "deformado", "no aplica"]);

/**
 * La respuesta de la IA + la comparación del código → el control: { estado: "ok" | "revisar", textoLeido, errores,
 * precios, logo, deformaciones, otros, puntaje, soloTexto }. `soloTexto`: lo único que falla es el texto (se puede
 * corregir editando la misma imagen). Null si la IA no devolvió JSON. Pura.
 */
export function leerControl(respuesta, { texto = "", logo = false } = {}) {
  const m = String(respuesta ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const textoLeido = String(d.textoLeido ?? "").trim().slice(0, 600);
  // Los errores del texto: los que encuentra el CÓDIGO comparando, y los que dice la IA que el código no ve.
  const delCodigo = texto ? compararTexto(texto, textoLeido) : [];
  const deLaIA = (Array.isArray(d.errores) ? d.errores : [])
    .map((e) => ({ escrito: corto(e?.escrito, 80), esperado: corto(e?.esperado, 80) }))
    .filter((e) => (e.escrito || e.esperado) && e.escrito !== e.esperado);
  const vistos = new Set(delCodigo.map((e) => e.esperado));
  const errores = [...delCodigo, ...deLaIA.filter((e) => !vistos.has(palabras(e.esperado)[0] ?? "") && !delCodigo.some((x) => x.escrito && x.escrito === palabras(e.escrito)[0]))]
    .slice(0, 8);
  const logoEstado = LOGOS.has(d.logo) ? d.logo : logo ? "bien" : "no aplica";
  const precios = lista(d.precios, 4, 60);
  const deformaciones = lista(d.deformaciones);
  const otros = lista(d.otros);
  // Lo que se sale del sistema de la portada (sólo en láminas de un carrusel): se revisa, pero no impide corregir
  // sola una letra mal escrita, que es otra cosa.
  const serie = lista(d.serie, 4, 140);
  const fallaLogo = logo && (logoEstado === "falta" || logoEstado === "deformado");
  const graves = precios.length + deformaciones.length + (fallaLogo ? 1 : 0);
  const estado = errores.length || graves || serie.length ? "revisar" : "ok";
  return {
    estado, textoLeido, errores, precios, logo: logoEstado, deformaciones, otros, ...(serie.length ? { serie } : {}),
    puntaje: Math.max(0, Math.min(10, Math.round(Number(d.puntaje) || (estado === "ok" ? 9 : 5)))),
    soloTexto: errores.length > 0 && graves === 0,
  };
}

/**
 * La indicación de edición para corregir SÓLO el texto de la misma imagen: qué cambiar por qué, y que todo lo demás
 * se quede igual. Con el texto completo esperado delante, para que no invente otro. Pura.
 */
export function correccionDeTexto(control, textoEsperado = "") {
  const cambios = (control?.errores ?? [])
    .map((e) => (e.escrito ? `donde dice "${e.escrito}" debe decir "${e.esperado}"` : e.esperado ? `falta la palabra "${e.esperado}"` : ""))
    .filter(Boolean);
  if (!cambios.length) return "";
  return [
    `Corrige SÓLO el texto de esta imagen: ${cambios.join("; ")}.`,
    textoEsperado ? `El texto completo tiene que quedar EXACTAMENTE así: "${corto(textoEsperado, 400).replace(/"/g, "'")}".` : "",
    "Conserva todo lo demás exactamente igual: la composición, los colores, la tipografía y su tamaño, la posición del texto, las personas, los objetos y el logo.",
  ].filter(Boolean).join(" ");
}

/** «Revisada» · «Revisar: dice “Sofa cmaa”» · «Revisar: el logo está deformado»: lo que se dice en la tarjeta. Pura. */
export function resumenControl(control) {
  if (!control) return "";
  if (control.estado === "ok") return "Revisada";
  const e = control.errores?.[0];
  if (e) return e.escrito ? `Revisar: dice «${e.escrito}» (debía decir «${e.esperado}»)` : `Revisar: falta «${e.esperado}»`;
  if (control.precios?.length) return `Revisar: precio que no está en el catálogo (${control.precios[0]})`;
  if (control.logo === "falta") return "Revisar: falta el logo";
  if (control.logo === "deformado") return "Revisar: el logo está deformado";
  if (control.deformaciones?.length) return `Revisar: ${control.deformaciones[0]}`;
  if (control.serie?.length) return `Revisar: se sale de la serie (${control.serie[0]})`;
  return "Revisar";
}
