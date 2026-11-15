// ============================================================
// «Datos que no cuadran» (puro; también lo importa el Worker)
//
// Un mismo dato vive en varios sitios: las notas del cerebro, la ficha técnica
// y las cifras (que escribe la IA y van en TODO lo que se escribe), la ficha del
// cliente en la aplicación y las memorias viejas del asistente. Cuando cambia en
// uno y no en los otros, la IA sigue usando el viejo y nadie sabe por qué: así
// pasó con el WhatsApp de ROFER (las notas decían 6086-6581 y la ficha técnica,
// 61562010).
//
// Esto lo encuentra sin IA: saca teléfonos y correos de cada sitio y avisa de
// los que están en lo que va SIEMPRE (ficha, cifras, ficha del cliente,
// memorias) pero en ninguna nota, mientras las notas sí traen otro del mismo
// tipo. Lo que va DESPUÉS de «anterior», «obsoleto», «reemplaza»… en una línea
// no cuenta: es el número viejo que esa línea avisa que ya no vale («6086-6581,
// reemplaza al anterior 61562010»: vale el primero).
//
// LOS PRECIOS LOS MANDA EL CATÁLOGO del estudio de mercado (la nota de cifras
// «Productos y servicios», fuente `catalogo`). Un precio que la ficha técnica,
// las cifras o una memoria del asistente le ponen a un producto del catálogo
// y que el catálogo no tiene, no cuadra: lo más probable es que sea viejo.
// ============================================================

/** Las fuentes que van siempre a la IA, o que lee el asistente: ahí un dato viejo hace daño. */
export const FUENTES_SIEMPRE = Object.freeze(["ficha", "cifras", "catalogo", "cliente", "memoria"]);

const NOMBRE_FUENTE = { ficha: "Ficha técnica", cifras: "Cifras vigentes", catalogo: "Catálogo", cliente: "Ficha del cliente", memoria: "Memoria del asistente", nota: "Nota" };
export const nombreDeFuente = (f) => NOMBRE_FUENTE[f] ?? "Nota";

const OBSOLETO = /\b(anterior|antiguo|obsolet[oa]|viej[oa]|ya no|reemplaza|sustituye|dejó de|dejo de|no usar|no se usa)\b/i;

/** Un teléfono de Panamá en sus formas de siempre, sin el +507: «6086-6581», «+507 6086 6581», «60866581», «225-1234». */
const TELEFONO = /(?:\+?\s?507[\s.-]?)?(?<![\d.,$])(\d{3,4})[\s.-]?(\d{4})(?![\d.,]*\d)/g;
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** «6086-6581» → «60866581». Sólo 7 u 8 cifras (fijo o móvil): un año o un precio no pasan. */
export function normalizarTelefono(t) {
  const d = String(t ?? "").replace(/\D/g, "").replace(/^507(?=\d{7,8}$)/, "");
  return /^\d{7,8}$/.test(d) ? d : "";
}

/** Para enseñar: «6086-6581». */
export const verTelefono = (d) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : `${d.slice(0, 3)}-${d.slice(3)}`);

/** Un importe de dinero: «$50», «$ 1,250.00», «B/. 25», «25,50 USD», «30 dólares». */
const DINERO = /(?:US\$|\$|B\/\.?|USD)\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?(?:USD|d[oó]lares|balboas)\b/gi;

const ANTES = /\b(antes|era)\s*:?\s*$/i;

/** «1,250.00» / «1.250,00» / «25,5» / «1.250» → céntimos (125000, 125000, 2550, 125000). null si no es un número. */
export function centimos(numero) {
  let t = String(numero ?? "").trim();
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (ultimo >= 0) {
    const decimales = t.length - ultimo - 1;
    // Con los dos separadores, el último es el decimal; con uno solo, es decimal si lleva 1 o 2 cifras detrás.
    const ambos = t.includes(".") && t.includes(",");
    if (ambos || decimales <= 2) t = `${t.slice(0, ultimo).replace(/[.,]/g, "")}.${t.slice(ultimo + 1)}`;
    else t = t.replace(/[.,]/g, "");
  }
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** Para enseñar un importe: 5000 → «$50», 2550 → «$25,50». */
export const verPrecio = (c) => `$${c % 100 ? (c / 100).toFixed(2).replace(".", ",") : String(c / 100)}`;

/** Los importes de una línea (en céntimos), sin los que la línea dice que ya no valen. */
export function preciosDeLinea(linea) {
  const corte = String(linea ?? "").search(OBSOLETO);
  const salida = [];
  for (const m of String(linea ?? "").matchAll(DINERO)) {
    if (corte >= 0 && m.index > corte) continue;
    // «antes $50, ahora $45»: el que va pegado a «antes» es el precio viejo (y el de después sí vale).
    if (ANTES.test(String(linea).slice(Math.max(0, m.index - 14), m.index))) continue;
    const c = centimos(m[1] ?? m[2]);
    if (c !== null) salida.push(c);
  }
  return salida;
}

const plegar = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const palabras = (s) => plegar(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Los productos del catálogo con sus importes, leídos de la nota «Productos y servicios» (una línea por producto:
 * «- Nombre (tipo) · precio: … · oferta: …»; ver `lineaDeProducto`). Todo importe de su línea vale: el precio y el
 * de la oferta. Puro.
 */
export function productosDelCatalogo(texto) {
  const salida = [];
  for (const linea of String(texto ?? "").split("\n")) {
    const m = /^-\s+(.+?)\s+\(/.exec(linea.trim());
    if (!m || m[1].trim().length < 3) continue;
    salida.push({ nombre: m[1].trim(), clave: palabras(m[1]), precios: preciosDeLinea(linea) });
  }
  return salida;
}

/** El producto del catálogo que nombra una línea (el de nombre más largo, por palabras enteras), o null. */
function productoDeLinea(linea, productos) {
  const l = ` ${palabras(linea)} `;
  let mejor = null;
  for (const p of productos) {
    if (p.clave && l.includes(` ${p.clave} `) && (!mejor || p.clave.length > mejor.clave.length)) mejor = p;
  }
  return mejor;
}

/** Los teléfonos y correos de un texto, sin los que una línea dice que ya no valen. */
export function datosDeTexto(texto) {
  const telefonos = new Set();
  const correos = new Set();
  for (const linea of String(texto ?? "").split("\n")) {
    const corte = linea.search(OBSOLETO);
    const vale = (i) => corte < 0 || i < corte;
    for (const m of linea.matchAll(TELEFONO)) {
      if (!vale(m.index)) continue;
      const crudo = m[0];
      // Ocho cifras seguidas sin separador sólo si parece un móvil (empieza por 6) o lleva +507: si no, es una
      // referencia, un código o un precio.
      const pegado = !/[\s.-]/.test(crudo.replace(/^\+?\s?507[\s.-]?/, ""));
      if (pegado && !/507/.test(crudo) && !/^6/.test(m[1])) continue;
      const n = normalizarTelefono(crudo);
      if (n) telefonos.add(n);
    }
    for (const m of linea.matchAll(CORREO)) if (vale(m.index)) correos.add(m[0].toLowerCase());
  }
  return { telefonos, correos };
}

/**
 * Los datos que no cuadran.
 * @param {Array<{ fuente: string, titulo: string, texto: string }>} fuentes  `fuente`: ficha | cifras | cliente | memoria | nota
 * @returns {Array<{ tipo: "telefono"|"correo", valor: string, en: string[], fuentes: string[], memorias: string[],
 *                   vigentes: string[], vigentesEn: string[] }>}  `fuentes`: ficha/cifras/cliente/memoria; `memorias`: sus ids
 *   `valor` aparece en `en` (lo que va siempre) y en ninguna nota; las notas dicen `vigentes`.
 */
export function datosQueNoCuadran(fuentes) {
  return [...telefonosYCorreos(fuentes), ...preciosQueNoCuadran(fuentes)];
}

/**
 * Los precios que no cuadran con el catálogo: en la ficha técnica, las cifras o una memoria del asistente, una línea que
 * nombra un producto del catálogo con un importe que el catálogo no tiene para él (o el catálogo no le pone precio).
 * @returns {Array<{ tipo: "precio", valor: string, producto: string, en: string[], fuentes: string[], memorias: string[],
 *                   vigentes: string[], vigentesEn: string[] }>}
 */
export function preciosQueNoCuadran(fuentes) {
  const catalogo = (fuentes ?? []).filter((f) => f.fuente === "catalogo").flatMap((f) => productosDelCatalogo(f.texto));
  if (!catalogo.length) return [];
  const vistos = new Map();
  for (const f of fuentes ?? []) {
    if (!["ficha", "cifras", "memoria"].includes(f.fuente)) continue;
    for (const linea of String(f.texto ?? "").split("\n")) {
      const precios = preciosDeLinea(linea);
      if (!precios.length) continue;
      const p = productoDeLinea(linea, catalogo);
      if (!p || precios.some((c) => p.precios.includes(c))) continue;
      const valor = verPrecio(precios[0]);
      const k = `${p.clave}|${valor}`;
      const donde = f.fuente === "memoria" ? `${nombreDeFuente("memoria")}: «${String(f.texto).slice(0, 60)}»` : nombreDeFuente(f.fuente);
      if (!vistos.has(k)) {
        vistos.set(k, {
          tipo: "precio", valor, producto: p.nombre, en: [], fuentes: [], memorias: [],
          vigentes: [...new Set(p.precios)].map(verPrecio), vigentesEn: ["Catálogo"],
        });
      }
      const d = vistos.get(k);
      if (!d.en.includes(donde)) d.en.push(donde);
      if (!d.fuentes.includes(f.fuente)) d.fuentes.push(f.fuente);
      if (f.fuente === "memoria" && f.id && !d.memorias.includes(String(f.id))) d.memorias.push(String(f.id));
    }
  }
  return [...vistos.values()];
}

/** Los teléfonos y correos que no cuadran (lo de siempre: ver la cabecera). */
function telefonosYCorreos(fuentes) {
  const porTipo = { telefono: { notas: new Map(), siempre: new Map() }, correo: { notas: new Map(), siempre: new Map() } };
  const apuntar = (mapa, valor, donde) => { if (!mapa.has(valor)) mapa.set(valor, new Set()); mapa.get(valor).add(donde); };
  // De cada valor de lo que va siempre: en qué fuentes está y, si es una memoria, cuál (para poder borrarla).
  const origen = new Map();
  const anotarOrigen = (tipo, valor, f) => {
    const k = `${tipo}|${valor}`;
    if (!origen.has(k)) origen.set(k, { fuentes: new Set(), memorias: new Set() });
    origen.get(k).fuentes.add(f.fuente);
    if (f.fuente === "memoria" && f.id) origen.get(k).memorias.add(String(f.id));
  };
  for (const f of fuentes ?? []) {
    const { telefonos, correos } = datosDeTexto(f.texto);
    const lado = FUENTES_SIEMPRE.includes(f.fuente) ? "siempre" : "notas";
    const donde = f.fuente === "nota" ? f.titulo : `${nombreDeFuente(f.fuente)}${f.fuente === "memoria" ? `: «${String(f.texto).slice(0, 60)}»` : ""}`;
    for (const t of telefonos) { apuntar(porTipo.telefono[lado], t, donde); if (lado === "siempre") anotarOrigen("telefono", t, f); }
    for (const c of correos) { apuntar(porTipo.correo[lado], c, donde); if (lado === "siempre") anotarOrigen("correo", c, f); }
  }
  const salida = [];
  for (const [tipo, { notas, siempre }] of Object.entries(porTipo)) {
    if (!notas.size) continue; // sin notas que lo digan no hay con qué comparar
    for (const [valor, en] of siempre) {
      if (notas.has(valor)) continue;
      const vigentes = [...notas.keys()];
      salida.push({
        tipo,
        valor: tipo === "telefono" ? verTelefono(valor) : valor,
        en: [...en],
        fuentes: [...(origen.get(`${tipo}|${valor}`)?.fuentes ?? [])],
        memorias: [...(origen.get(`${tipo}|${valor}`)?.memorias ?? [])],
        vigentes: vigentes.map((v) => (tipo === "telefono" ? verTelefono(v) : v)),
        vigentesEn: [...new Set(vigentes.flatMap((v) => [...notas.get(v)]))].slice(0, 5),
      });
    }
  }
  return salida;
}
