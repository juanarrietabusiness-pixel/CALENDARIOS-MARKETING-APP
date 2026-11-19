// ============================================================
// Los DIEZ MOTORES DE VIDEO de prioridad y cuál conviene para cada toma (puro: la pantalla, el Worker y el MCP)
//
// Decisión de la agencia (19-11-2026): los videos de los clientes se hacen con los motores de alta gama, no con el más
// barato. Cuáles son y en qué orden lo dice el catálogo (`prioridad` en estudioCatalogo.js, 1 a 10); aquí vive qué hace
// bien cada uno y la REGLA que, tras desglosar un video («Desglosar toma por toma», `deconstruir_video`), sugiere el
// motor del video entero y de cada toma por lo que pasa en ella: alguien que habla, agua y efectos, personas que se
// mueven, el producto, la cámara, una toma larga.
//
// Como `motorParaRecrear`, la sugerencia NO la escribe la IA: no puede proponer un modelo que no existe, que está sin
// llave o que no hace la duración. Las fortalezas salen de las comparativas públicas de noviembre de 2026 (Artificial
// Analysis, LMArena, Curious Refuge) y de lo que cada modelo admite en el catálogo: no son pruebas de la agencia.
//
// UN video, UN motor principal: dos motores en el mismo video se notan (lo dijo la agencia con el reel de Baby Caleb).
// Otro motor sólo se sugiere donde el principal flojea de verdad (≤ 1 punto en algo que la toma necesita y otro tiene
// 3) o no llega (una toma más larga de lo que hace), y se avisa de que se va a notar.
// ============================================================

import { MODELOS, modeloPorId, textoCosto } from "./estudioCatalogo.js";

/** Lo que puede necesitar una toma, con su nombre para la persona. */
export const USOS_VIDEO = Object.freeze({
  dialogo: "alguien habla en cuadro",
  efectos: "agua, fuego, humo y física",
  persona: "personas que se mueven",
  producto: "el producto fiel",
  camara: "cámara de cine",
  larga: "una toma de más de 15 s",
  referencias: "la misma persona y el mismo producto en todas las tomas",
  protagonista: "el plano protagonista",
  borrador: "probar barato",
  movimiento: "el mismo movimiento de la referencia",
});

/**
 * Qué hace bien cada uno de los diez. `base`: lo bien que sale una toma cualquiera (0 a 3); `usos`: los puntos de más
 * en lo que la toma necesita (0 a 3; sin entrada, 0). `principal: false`: nunca lleva un video entero (el borrador y
 * el que sólo copia un movimiento). Seedance y Wan van sin voz en español (`sinVozPropia`): diálogo 0.
 */
export const FORTALEZAS = Object.freeze({
  "veo-3-1-kie": {
    fuerte: "la mejor imagen, la física más creíble (agua, efectos) y la que más obedece al pedido, con voz y labios propios; tomas de 4, 6 u 8 s",
    base: 3, usos: { protagonista: 3, dialogo: 3, efectos: 3, producto: 2, persona: 2, camara: 2 },
  },
  "gemini-omni-video-kie": {
    fuerte: "física y efectos muy creíbles, hasta 4K; entiende texto, imágenes y un video, y corrige conversando (sin imagen inicial)",
    base: 3, usos: { efectos: 3, protagonista: 2, persona: 2, referencias: 2, dialogo: 2, camara: 1 },
  },
  "seedance-2-5-kie": {
    fuerte: "el primero en animar una imagen (Artificial Analysis, noviembre de 2026): tomas de hasta 30 s, hasta 14 referencias y la misma cara en todas; sin voz en español",
    base: 3, usos: { persona: 3, referencias: 3, larga: 3, producto: 2, camara: 2, efectos: 2 },
  },
  "kling-3-omni-kie": {
    fuerte: "voz y labios en español nativos, personajes y producto con referencias; sigue un video",
    base: 3, usos: { dialogo: 3, persona: 3, referencias: 2, producto: 2, camara: 2, efectos: 1 },
  },
  "minimax-h3-kie": {
    fuerte: "2K con sonido estéreo; fue el n.º 1 en animar una imagen (LMArena, septiembre) y es el de «Video del producto»",
    base: 3, usos: { producto: 3, protagonista: 2, persona: 2, efectos: 2, camara: 2, dialogo: 1 },
  },
  "seedance-2-kie": {
    fuerte: "el n.º 1 anterior en animar una imagen, más barato: varios planos y referencias; sin voz en español",
    base: 2, usos: { persona: 2, referencias: 2, producto: 2, camara: 2, efectos: 1 },
  },
  "wan-3-kie": {
    fuerte: "1080p, hasta 10 referencias o un video que seguir, a buen precio; sin voz en español",
    base: 2, usos: { referencias: 2, persona: 2, producto: 1, camara: 1, efectos: 1 },
  },
  "kling-3-kie": {
    fuerte: "cámara de cine y movimiento natural al animar una foto (8,1/10 en Curious Refuge), barato",
    base: 2, usos: { camara: 3, persona: 2, producto: 2, efectos: 1, dialogo: 1 },
  },
  "veo-3-1-fast-kie": {
    fuerte: "Veo con voz a precio de borrador: para probar la toma antes de pagar la buena",
    base: 1, usos: { borrador: 3, dialogo: 2, persona: 1, camara: 1 }, principal: false,
  },
  "kling-2-6-movimiento-kie": {
    fuerte: "pone a la persona de TU foto a hacer el movimiento, los gestos y los labios de un video de referencia",
    base: 0, usos: { movimiento: 3 }, principal: false,
  },
});

/** Los diez, en su orden (del catálogo). */
export const MOTORES_PRIORIDAD = Object.freeze(MODELOS.filter((m) => m.prioridad).sort((a, b) => a.prioridad - b.prioridad));

/** ¿Es uno de los diez? */
export const esPrioritario = (id) => Boolean(modeloPorId(id)?.prioridad);

/** Una lista de modelos con los diez primero, en su orden; los demás detrás, como venían. Pura. */
export function conPrioridadPrimero(lista = []) {
  return lista.map((m, i) => ({ m, i })).sort((a, b) => (a.m.prioridad ?? 99) - (b.m.prioridad ?? 99) || a.i - b.i).map(({ m }) => m);
}

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIO = /^\s*(|-|—|–|vacio|nada|ninguno|ninguna|no se oye|no se dice|sin dialogo|\(vacio\)|n\/a)\s*\.?\s*$/;

const PERSONA = /\b(mujer|mujeres|hombre|hombres|nin[oa]s?|bebes?|mama|madre|papa|padre|persona|personas|gente|chic[oa]s?|senor[a]?|joven|jovenes|modelo|pareja|familia|abuel[oa]s?|actor|actriz|cliente|clienta|corre|corren|corriendo|camina|caminando|baila|bailando|salta|saltando|se cae|cae al|tropieza|abraza|sonrie|rie|llora|grita|saluda|carga a)\b/;
const HABLA = /\b(habla|hablando|dice|grita|pregunta|responde|conversa|canta|a camara|mira a camara|labios|boca)\b/;
const EFECTOS = /\b(agua|ola|olas|tsunami|mar|lluvia|llueve|fuego|llamas?|humo|explosion|explota|chispas?|niebla|nieve|derrumbe|se derrumba|inunda|salpica|salpicadura|liquido|vapor|tormenta|rayo|choque|choca|destruye|estalla|absorbe|absorcion|magia|se transforma|vuela|flota|levita|remolino|torbellino)\b/;
const PRODUCTO = /\b(producto|paquete|empaque|caja|botella|frasco|envase|logo|logotipo|marca|etiqueta|packshot|panal|panales|bolsa|tubo|crema|lata)\b/;
const CAMARA = /\b(dron|grua|orbita|seguimiento|travelling|dolly|estabilizador)\b/;

/**
 * Lo que necesita una toma del desglose (`{ contenido, dice, plano, movimiento, desde, hasta }`), leído del texto: una
 * lista de claves de USOS_VIDEO. Diálogo sólo si se dice algo Y sale gente o alguien habla (una voz en off la pone el
 * montaje). Pura.
 */
export function usosDeToma(t = {}) {
  const que = sinTildes(t.contenido);
  const dice = VACIO.test(sinTildes(t.dice)) ? "" : String(t.dice ?? "").trim();
  const plano = sinTildes(t.plano);
  const usos = [];
  const persona = PERSONA.test(que);
  if (dice && (persona || HABLA.test(que))) usos.push("dialogo");
  if (EFECTOS.test(que)) usos.push("efectos");
  if (persona) usos.push("persona");
  if (PRODUCTO.test(que) || plano === "plano detalle" || plano === "inserto") usos.push("producto");
  if (CAMARA.test(sinTildes(t.movimiento))) usos.push("camara");
  if (Number(t.hasta) - Number(t.desde) > 15) usos.push("larga");
  return usos;
}

const disponible = (m, activos) => Boolean(m) && (!activos || m.motor === "prueba" || Boolean(activos[m.motor]));
const maxDuracion = (m) => Math.max(0, ...(m?.ajustes?.duration?.valores ?? []).map(Number).filter(Number.isFinite), Number(m?.segundos) || 0);

/** Los puntos de un motor para una toma con esos usos. Pura. */
export function puntosPara(id, usos = []) {
  const f = FORTALEZAS[id];
  if (!f) return 0;
  return f.base + usos.reduce((s, u) => s + (f.usos[u] ?? 0), 0);
}

/**
 * ¿Sirve este motor aquí? Con llave (`activos` null: no se mira), con imagen inicial si se anima un fotograma por
 * toma (`conFotogramas`, el método del reel) y llegando a los `segundos`. El que copia un movimiento sólo si se pide.
 */
function sirve(m, activos, { segundos = 0, conFotogramas = false, usos = [] } = {}) {
  if (!disponible(m, activos) || !FORTALEZAS[m.id]) return false;
  if (FORTALEZAS[m.id].usos.movimiento) return usos.includes("movimiento");
  if (conFotogramas && !m.inicial) return false;
  // Alguien que habla en cuadro necesita voz en español: Seedance y Wan la inventan mal (`sinVozPropia`).
  if (usos.includes("dialogo") && !(FORTALEZAS[m.id].usos.dialogo > 0)) return false;
  return !(segundos > 0) || maxDuracion(m) >= segundos;
}

const porque = (m, usos) => {
  const fuertes = usos.filter((u) => (FORTALEZAS[m.id]?.usos[u] ?? 0) >= 2).map((u) => USOS_VIDEO[u]);
  return `${fuertes.length ? `fuerte en ${fuertes.join(", ")}: ` : ""}${FORTALEZAS[m.id]?.fuerte ?? m.nota ?? ""}`;
};

/**
 * Los mejores de los diez para lo que se pide, del mejor al peor: `[{ modelo, puntos, porque }]`. A igual puntaje, el
 * más barato (sale igual por menos) y luego su orden. `usos`: claves de USOS_VIDEO; `segundos`: lo que dura la toma;
 * `conFotogramas`: se anima una imagen inicial. Pura.
 */
export function sugerirMotores(activos = null, { usos = [], segundos = 0, conFotogramas = false, cuantos = 3 } = {}) {
  return MOTORES_PRIORIDAD
    .filter((m) => sirve(m, activos, { segundos, conFotogramas, usos }))
    .map((m) => ({ modelo: m, puntos: puntosPara(m.id, usos), porque: porque(m, usos) }))
    .sort((a, b) => b.puntos - a.puntos || a.modelo.costo - b.modelo.costo || a.modelo.prioridad - b.modelo.prioridad)
    .slice(0, Math.max(1, cuantos));
}

/**
 * Tras un desglose: el motor PRINCIPAL del video entero (el que más puntos suma en todas sus tomas), lo que necesita
 * cada toma con sus dos mejores, y las excepciones: tomas donde el principal flojea (≤ 1 en algo que la toma necesita
 * y otro tiene 3) o no llega a la duración. Más dos opciones: copiar EXACTO el movimiento de la referencia y un
 * borrador barato. `conFotogramas` (por defecto true): cada toma anima su fotograma, como el reel por planos.
 * → { principal: { modelo, porque, costo } | null, tomas: [{ n, desde, hasta, usos, mejores }], excepciones: [{ tomas,
 *    modelo, motivo }], movimiento: { modelo, tomas } | null, borrador: modelo | null } o null sin tomas. Pura.
 */
export function sugerenciaDeDesglose(d, activos = null, { conFotogramas = true } = {}) {
  const lista = Array.isArray(d?.tomas) ? d.tomas : [];
  if (!lista.length) return null;
  const tomas = lista.map((t) => {
    const usos = usosDeToma(t);
    const dura = Math.max(0, Number(t.hasta) - Number(t.desde));
    return { n: t.n, desde: t.desde, hasta: t.hasta, dura, usos, mejores: sugerirMotores(activos, { usos, segundos: dura, conFotogramas, cuantos: 2 }) };
  });
  const candidatos = MOTORES_PRIORIDAD.filter((m) => FORTALEZAS[m.id]?.principal !== false && sirve(m, activos, { conFotogramas }));
  const total = (m) => tomas.reduce((s, t) => s + (maxDuracion(m) >= t.dura ? puntosPara(m.id, t.usos) : 0), 0);
  const ganador = candidatos.map((m) => ({ m, p: total(m) }))
    .sort((a, b) => b.p - a.p || a.m.costo - b.m.costo || a.m.prioridad - b.m.prioridad)[0]?.m ?? null;
  const duracion = Math.max(Number(d?.cuenta?.duracion) || 0, lista.at(-1)?.hasta ?? 0);
  const usosDelVideo = [...new Set(tomas.flatMap((t) => t.usos))];
  const principal = ganador ? { modelo: ganador, porque: porque(ganador, usosDelVideo), costo: ganador.costo * duracion } : null;

  // Las excepciones, juntando las tomas con el mismo motor y el mismo motivo.
  const excepciones = [];
  const anotar = (n, modelo, motivo) => {
    const ya = excepciones.find((e) => e.modelo.id === modelo.id && e.motivo === motivo);
    if (ya) ya.tomas.push(n); else excepciones.push({ tomas: [n], modelo, motivo });
  };
  if (ganador) {
    for (const t of tomas) {
      if (maxDuracion(ganador) < t.dura) {
        const otro = sugerirMotores(activos, { usos: t.usos, segundos: t.dura, conFotogramas, cuantos: 1 })[0]?.modelo;
        if (otro && otro.id !== ganador.id) anotar(t.n, otro, `dura más de lo que hace ${ganador.nombre} (${maxDuracion(ganador)} s)`);
        continue;
      }
      const flojo = t.usos.find((u) => u !== "larga" && (FORTALEZAS[ganador.id].usos[u] ?? 0) <= 1
        && candidatosPara(activos, t, conFotogramas).some((m) => (FORTALEZAS[m.id].usos[u] ?? 0) >= 3));
      if (!flojo) continue;
      const otro = candidatosPara(activos, t, conFotogramas)
        .filter((m) => (FORTALEZAS[m.id].usos[flojo] ?? 0) >= 3)
        .sort((a, b) => puntosPara(b.id, t.usos) - puntosPara(a.id, t.usos) || a.costo - b.costo)[0];
      if (otro) anotar(t.n, otro, `${USOS_VIDEO[flojo]}: ${ganador.nombre} flojea ahí`);
    }
  }
  const copia = MOTORES_PRIORIDAD.find((m) => FORTALEZAS[m.id]?.usos.movimiento && disponible(m, activos));
  const conGente = tomas.filter((t) => t.usos.includes("persona")).map((t) => t.n);
  const borrador = MOTORES_PRIORIDAD.find((m) => FORTALEZAS[m.id]?.usos.borrador && disponible(m, activos) && m.id !== ganador?.id) ?? null;
  return { principal, tomas, excepciones, movimiento: copia && conGente.length ? { modelo: copia, tomas: conGente } : null, borrador, duracion };
}

/** Los que pueden llevar una toma como especialistas (no el borrador ni el que copia). */
function candidatosPara(activos, t, conFotogramas) {
  return MOTORES_PRIORIDAD.filter((m) => FORTALEZAS[m.id]?.principal !== false && sirve(m, activos, { segundos: t.dura, conFotogramas }));
}

const numeros = (l) => (l.length === 1 ? `la toma ${l[0]}` : `las tomas ${l.slice(0, -1).join(", ")} y ${l.at(-1)}`);
const porSegundo = (m) => `${textoCosto(m.costo)} por segundo`;
/** Hasta cuántas tomas se listan una por una en el texto. */
export const MAX_TOMAS_SUGERENCIA = 12;

/** La sugerencia en texto (para Claude, el asistente y «Copiar»). Pura. */
export function textoDeSugerencia(s) {
  if (!s) return "";
  if (!s.principal) return "MOTORES SUGERIDOS: ninguno de los diez de prioridad tiene llave o hace estas tomas (Ajustes → IA).";
  const p = s.principal;
  const lineas = [
    "MOTORES SUGERIDOS (de los 10 de prioridad de la agencia; los escoge una regla del calendario con lo que pasa en cada toma, no la IA):",
    `· Principal, para TODO el video (un solo motor: dos en el mismo video se notan): ${p.modelo.nombre} — ${p.modelo.id} · ${porSegundo(p.modelo)}${s.duracion > 0 ? ` (unos ${textoCosto(p.costo).replace("≈ ", "")} los ${String(Math.round(s.duracion * 10) / 10).replace(".", ",")} s, a su precio base)` : ""}. Por qué: ${p.porque}.`,
    ...s.excepciones.map((e) => `· Sólo si ${numeros(e.tomas)} no convence${e.tomas.length > 1 ? "n" : ""} con el principal (${e.motivo}): ${e.modelo.nombre} — ${e.modelo.id}. Se va a notar el cambio de motor: iguala el color en el montaje.`),
    s.movimiento ? `· Para copiar EXACTO el movimiento de la referencia en ${numeros(s.movimiento.tomas)} (con personas): ${s.movimiento.modelo.nombre} — ${s.movimiento.modelo.id}, con la foto de TU personaje y ese tramo del video. El video sólo guía el movimiento: nada de la otra marca sale en el tuyo.` : "",
    s.borrador ? `· Para probar una toma barato antes de pagar la buena: ${s.borrador.nombre} — ${s.borrador.id} · ${porSegundo(s.borrador)}.` : "",
    "· Toma por toma (lo que necesita → los dos mejores):",
    ...s.tomas.slice(0, MAX_TOMAS_SUGERENCIA).map((t) => `  ${t.n} · ${t.usos.length ? t.usos.map((u) => USOS_VIDEO[u]).join(", ") : "nada especial"} → ${t.mejores.map((x) => x.modelo.id).join(", ") || "ninguno con llave llega"}`),
    s.tomas.length > MAX_TOMAS_SUGERENCIA ? `  … y ${s.tomas.length - MAX_TOMAS_SUGERENCIA} tomas más.` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}

/** La lista de los diez con lo que hace bien cada uno (para ver_estudio). Pura. */
export function textoDeLosDiez(activos = null) {
  return MOTORES_PRIORIDAD.map((m) => `${m.prioridad}. ${m.id} — ${m.nombre} · ${porSegundo(m)}${disponible(m, activos) ? "" : " · SIN LLAVE"}: ${FORTALEZAS[m.id]?.fuerte ?? ""}.`).join("\n");
}
