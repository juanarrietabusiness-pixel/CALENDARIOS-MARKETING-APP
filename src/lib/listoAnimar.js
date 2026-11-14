// ============================================================
// «¿Listo para animar?»: el storyboard del reel por planos, revisado ANTES de pagar el video (puro; también el Worker)
//
// Un fotograma es la imagen de la que arranca su clip (o un plano del storyboard). Hay cuatro cosas que hacen que un
// modelo de video la anime mal, y se ven en la imagen:
//   · el SUJETO pegado al fondo (mismo tono, sin borde): el modelo los funde al moverse;
//   · la LUZ que no casa (sombras hacia dos lados, un recorte iluminado aparte): al moverse se nota el montaje;
//   · sin ESPACIO para el movimiento que pide su plano (la cámara se acerca y el sujeto ya toca el borde; camina hacia
//     la derecha y no queda sitio a la derecha);
//   · ARTEFACTOS o TEXTO (manos raras, letras, marcas de agua): el video los arrastra y los deforma.
//
// Una sola mirada de la IA a todo el storyboard (las copias pequeñas, numeradas en orden) cuando el encargo se para a
// revisar. NO bloquea nada: es un aviso con su porqué al lado de cada fotograma, que la persona corrige o ignora. El
// VEREDICTO lo pone el código (un «no» en cualquiera de los cuatro es «Ojo antes de animar»).
// ============================================================

export const CRITERIOS_ANIMAR = Object.freeze([
  { id: "separado", nombre: "sujeto separado del fondo", pista: "el sujeto principal se distingue del fondo por tono, color o enfoque; no se funde con lo de detrás" },
  { id: "luz", nombre: "luz coherente", pista: "toda la imagen tiene la misma luz: las sombras caen hacia el mismo lado y nada parece recortado y pegado" },
  { id: "espacio", nombre: "espacio para el movimiento", pista: "queda sitio para lo que pide su plano: si la cámara se acerca, el sujeto no toca el borde; si algo se desplaza, hay espacio hacia donde va" },
  { id: "limpio", nombre: "sin artefactos ni texto", pista: "sin manos o caras deformes, objetos fundidos ni letras, logos o marcas de agua dibujados" },
]);
const IDS = CRITERIOS_ANIMAR.map((c) => c.id);
const NOMBRE = Object.fromEntries(CRITERIOS_ANIMAR.map((c) => [c.id, c.nombre]));

/** Cuántos fotogramas mira de una vez (las copias pequeñas). */
export const MAX_FOTOGRAMAS_ANIMAR = 12;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * El pedido: las imágenes van DELANTE, cada una precedida de «Fotograma del plano N»; aquí, lo que se mira en cada una
 * y la forma de la respuesta. `planos`: [{ n, escena, camara }] en el mismo orden que las imágenes. Pura.
 */
export function pedidoDeListoAnimar({ planos = [] } = {}) {
  return [
    "Eres un técnico de video que revisa un STORYBOARD antes de animarlo con un modelo de video con IA. Cada imagen de arriba es el fotograma del que arranca un plano. No opinas del diseño ni del mensaje: sólo miras si cada imagen se puede animar sin que el modelo la deforme.",
    "",
    "Mira en cada fotograma estas cuatro cosas, y responde sí (true), no (false) o «no se puede saber» (null):",
    ...CRITERIOS_ANIMAR.map((c) => `· ${c.id}: ${c.pista}.`),
    "",
    "Lo que va a hacer cada plano (para juzgar el espacio):",
    ...planos.map((p) => `· Plano ${p.n}: ${corto(p.escena, 200)}${p.camara ? ` · cámara: ${corto(p.camara, 80)}` : ""}`),
    "",
    "Si alguno es «no», di en «porque» qué se ve que lo causa, en una frase corta y concreta (dónde está y qué es), sin opinar ni proponer un diseño nuevo.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"fotogramas":[{"n":1,${IDS.map((id) => `"${id}":true`).join(",")},"porque":""}]}`,
  ].join("\n");
}

const siNo = (v) => (v === true || v === false ? v : v === "true" ? true : v === "false" ? false : null);

/**
 * La respuesta → Map n → { ok, motivos: [id del criterio que falla], nota }. Sólo los números del storyboard (`ns`); lo
 * que no se pudo leer se queda fuera. El veredicto lo pone el código: un «no» en cualquiera = no está listo. Null si la
 * respuesta no se puede leer. Pura.
 */
export function leerListoAnimar(texto, ns = []) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  let d;
  try { d = JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
  const lista = Array.isArray(d?.fotogramas) ? d.fotogramas : Array.isArray(d) ? d : null;
  if (!lista) return null;
  const validos = new Set(ns.map(Number));
  const salida = new Map();
  for (const f of lista) {
    const n = Math.round(Number(f?.n));
    if (!validos.has(n) || salida.has(n)) continue;
    const motivos = IDS.filter((id) => siNo(f[id]) === false);
    salida.set(n, { ok: motivos.length === 0, motivos, nota: motivos.length ? corto(f.porque, 220) : "" });
  }
  return salida;
}

/** La frase de UN fotograma: «Listo para animar» u «Ojo antes de animar: …». Pura. */
export function fraseDeAnimar(a) {
  if (!a) return "";
  if (a.ok) return "Listo para animar.";
  const que = (a.motivos ?? []).map((m) => NOMBRE[m] ?? m).filter(Boolean);
  const falta = que.length ? `falla «${que.join("», «")}»` : "puede salir mal al animarlo";
  return `Ojo antes de animar: ${falta}${a.nota ? ` (${a.nota.replace(/[.\s]+$/, "")})` : ""}.`;
}

/**
 * El resumen del storyboard para Claude y para la nota: cuántos están listos y el porqué de los que no.
 * `revisados`: [{ n, animable }] (los que tienen revisión vigente). Pura.
 */
export function resumenDeAnimar(revisados = []) {
  const con = revisados.filter((r) => r?.animable);
  if (!con.length) return "";
  const malos = con.filter((r) => !r.animable.ok);
  if (!malos.length) return `Listo para animar: los ${con.length} fotogramas revisados.`;
  return [
    `Listo para animar: ${con.length - malos.length} de ${con.length} (es un aviso, no bloquea: corrige o rehace el fotograma antes de seguir, o sigue igual).`,
    ...malos.map((r) => `· Plano ${r.n}: ${fraseDeAnimar(r.animable).replace(/^Ojo antes de animar: /, "")}`),
  ].join("\n");
}
