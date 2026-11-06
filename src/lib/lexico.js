// ============================================================
// El LÉXICO de cada marca: cómo se dice algo y qué no se dice nunca (puro: la pantalla, el Worker y las herramientas)
//
// Método de agencia: una marca tiene palabras suyas («fibras de bambú», nunca «bambú» a secas ni «100 % bambú») y la IA
// que escribe guiones las olvida. Pedírselo en el prompt no basta; por eso el CÓDIGO lo aplica a lo que se DICE y a lo
// que se LEE de todos sus videos (el guion del video animado al guardarse, el del reel al escribirse):
//
//   · una regla con «di» (cómo se dice) cambia cada «nunca» por «di», sin tocar lo que ya dice «di» (así «fibras de
//     bambú» no se vuelve «fibras de fibras de bambú»), respetando la mayúscula del principio;
//   · una regla SIN «di» (una palabra prohibida sin reemplazo) no se cambia sola —quitarla rompería la frase—: va en el
//     pedido a la IA y en los avisos.
//
// Vive en el kit de la marca (`kit.lexico`), hasta `MAX_REGLAS` reglas.
// ============================================================

export const MAX_REGLAS = 20;
const MAX_FRASE = 60;
const MAX_NUNCA = 6;

const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FRASE);

/** Las reglas limpias: [{ di, nunca: [..] }] (sin repetidos, al menos un «nunca» por regla). Pura. */
export function limpiarLexico(lista) {
  const salida = [];
  for (const r of Array.isArray(lista) ? lista : []) {
    if (!r || typeof r !== "object") continue;
    const di = limpio(r.di);
    const nunca = [...new Set((Array.isArray(r.nunca) ? r.nunca : [r.nunca]).map(limpio).filter(Boolean))]
      .filter((n) => n.toLowerCase() !== di.toLowerCase()).slice(0, MAX_NUNCA);
    if (!nunca.length) continue;
    salida.push({ ...(di ? { di } : {}), nunca });
    if (salida.length >= MAX_REGLAS) break;
  }
  return salida;
}

/**
 * Las reglas desde un texto, una por línea: «fibras de bambú ← bambú, 100% bambú» (cómo se dice ← lo que no) o
 * «nunca: barato, oferta loca» (prohibidas sin reemplazo). Es lo que escribe la persona en el kit. Pura.
 */
export function lexicoDeTexto(texto = "") {
  return limpiarLexico(String(texto).split(/\n+/).map((linea) => {
    const l = linea.trim();
    if (!l) return null;
    const flecha = l.split(/\s*(?:←|<-)\s*/);
    if (flecha.length === 2) return { di: flecha[0], nunca: flecha[1].split(/\s*[,;]\s*/) };
    const prohibidas = /^nunca\s*:\s*(.+)$/i.exec(l);
    return prohibidas ? { nunca: prohibidas[1].split(/\s*[,;]\s*/) } : null;
  }));
}

/** Y al revés, para enseñarlas en el mismo campo. Pura. */
export const textoDeLexico = (lexico = []) => limpiarLexico(lexico).map((r) => (r.di ? `${r.di} ← ${r.nunca.join(", ")}` : `nunca: ${r.nunca.join(", ")}`)).join("\n");

/** La línea para la IA que escribe guiones (vacía sin reglas). Pura. */
export function lineaDeLexico(lexico = []) {
  const reglas = limpiarLexico(lexico);
  if (!reglas.length) return "";
  const partes = reglas.map((r) => (r.di ? `di «${r.di}», nunca ${r.nunca.map((n) => `«${n}»`).join(" ni ")}` : `nunca digas ni escribas ${r.nunca.map((n) => `«${n}»`).join(" ni ")}`));
  return `LÉXICO DE LA MARCA (obligatorio en lo que se dice y en lo que se lee): ${partes.join("; ")}.`;
}

const LETRA = "[\\p{L}\\p{N}]";
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Una frase como expresión: sin distinguir mayúsculas, con espacios flexibles y que no sea parte de otra palabra. */
const patron = (frase) => new RegExp(`(?<!${LETRA})${escapar(frase).replace(/\\? /g, "\\s+")}(?!${LETRA})`, "giu");

/** Los tramos [desde, hasta) de un texto donde ya se dice «di» (no se tocan). */
function protegidos(texto, di) {
  if (!di) return [];
  return [...texto.matchAll(patron(di))].map((m) => [m.index, m.index + m[0].length]);
}

/** Pone la mayúscula del original: «Bambú» → «Fibras de bambú». */
const conMayuscula = (original, nuevo) => (/^\p{Lu}/u.test(original) ? nuevo.charAt(0).toUpperCase() + nuevo.slice(1) : nuevo);

/**
 * Un texto con el léxico aplicado: cada «nunca» de una regla con «di» se cambia por «di». → { texto, cambios } (cambios:
 * [{ de, a }]). Pura.
 */
export function aplicarLexico(texto, lexico = []) {
  let t = String(texto ?? "");
  const cambios = [];
  for (const r of limpiarLexico(lexico)) {
    if (!r.di) continue;
    // Lo más largo primero: «100% bambú» antes que «bambú».
    for (const nunca of [...r.nunca].sort((a, b) => b.length - a.length)) {
      const libres = protegidos(t, r.di);
      t = t.replace(patron(nunca), (m, ...args) => {
        const i = args.at(-2);
        if (libres.some(([a, b]) => i < b && i + m.length > a)) return m;
        cambios.push({ de: m, a: r.di });
        return conMayuscula(m, r.di);
      });
    }
  }
  return { texto: t, cambios };
}

/** Las palabras prohibidas SIN reemplazo que aparecen en un texto (para avisar). Pura. */
export function prohibidasEn(texto, lexico = []) {
  const t = String(texto ?? "");
  return limpiarLexico(lexico).filter((r) => !r.di).flatMap((r) => r.nunca.filter((n) => patron(n).test(t)));
}

/** Los campos de texto de las capas de un video animado que se LEEN. */
const CAMPOS_CAPA = ["texto", "etiqueta", "textoAntes", "textoDespues", "notificacion"];

/**
 * El guion de un VIDEO ANIMADO con el léxico aplicado a lo que se dice (`habla`) y a lo que se lee (`pantalla` y los
 * textos de las capas). En un video con CANCIÓN el habla es la letra grabada: sólo se toca lo que se lee. →
 * { guion, cambios, prohibidas }. Pura.
 */
export function aplicarLexicoAlGuion(guion, lexico = []) {
  const reglas = limpiarLexico(lexico);
  if (!reglas.length || !guion?.escenas) return { guion, cambios: [], prohibidas: [] };
  const cambios = [];
  const prohibidas = new Set();
  const fijar = (texto) => {
    const r = aplicarLexico(texto, reglas);
    cambios.push(...r.cambios);
    for (const p of prohibidasEn(r.texto, reglas)) prohibidas.add(p);
    return r.texto;
  };
  const cancion = Boolean(guion.cancion);
  const escenas = guion.escenas.map((e) => ({
    ...e,
    ...(!cancion && e.habla ? { habla: fijar(e.habla) } : {}),
    ...(e.pantalla ? { pantalla: fijar(e.pantalla) } : {}),
    capas: (e.capas ?? []).map((c) => {
      const nueva = { ...c };
      for (const k of CAMPOS_CAPA) if (typeof c[k] === "string" && c[k]) nueva[k] = fijar(c[k]);
      if (Array.isArray(c.items)) nueva.items = c.items.map((it) => (typeof it === "string" ? fijar(it) : it));
      if (Array.isArray(c.mensajes)) nueva.mensajes = c.mensajes.map((m) => (m && typeof m.texto === "string" ? { ...m, texto: fijar(m.texto) } : m));
      return nueva;
    }),
  }));
  return { guion: cambios.length ? { ...guion, escenas } : guion, cambios, prohibidas: [...prohibidas] };
}

/** El guion de un REEL por planos con el léxico aplicado (lo que dice la voz, lo que se lee y el caption). Pura. */
export function aplicarLexicoAlReel(reel, lexico = []) {
  const reglas = limpiarLexico(lexico);
  if (!reglas.length || !reel) return { reel, cambios: [] };
  const cambios = [];
  const fijar = (texto) => { const r = aplicarLexico(texto, reglas); cambios.push(...r.cambios); return r.texto; };
  const nuevo = {
    ...reel,
    ...Object.fromEntries(["locucion", "gancho", "llamado", "descripcion", "titulo"].filter((k) => typeof reel[k] === "string").map((k) => [k, fijar(reel[k])])),
    planos: (reel.planos ?? []).map((p) => ({ ...p, ...(p.dice ? { dice: fijar(p.dice) } : {}), ...(p.pantalla ? { pantalla: fijar(p.pantalla) } : {}) })),
  };
  return { reel: cambios.length ? nuevo : reel, cambios };
}
