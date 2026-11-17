// ============================================================
// ESCUCHAR SIN OÍDOS: el sonido de un video animado convertido en números y palabras (puro: lo usa el Container en
// POST /escuchar; la herramienta `escuchar_video` y la pantalla «Sonido» lo muestran)
//
// Claude no oye. Pero el calendario arma el audio por PISTAS (la voz, la música y los efectos, src/lib/efectosSonido.js)
// y sabe en qué segundo se dice cada palabra (`lineaDeTiempo`), así que puede MEDIR lo que un editor comprobaría de oído:
//
//   · cada efecto: cuándo suena, cuántos dB queda bajo la voz y sobre la música, qué palabra pisa;
//   · lo que se tapa (un efecto bajo la voz que no se oye, uno que la música se come en un hueco) y lo que compite (uno
//     que se le subió a mano y pisa una palabra), los que se pisan entre sí;
//   · cuántos efectos hay cada 10 s frente a lo medido por earshot en videos profesionales;
//   · los huecos sin nada y el volumen antes del final (el render lo lleva a -14 LUFS);
//   · y los 5 MOMENTOS que debe escuchar una persona: lo que más riesgo tiene, con el porqué.
//
// Lo que NO hace: juzgar el gusto, el ánimo de la música ni si un efecto «queda bonito». Eso lo dice una persona en esos
// 5 momentos. Sólo mide.
// ============================================================

import { BYTES_MUESTRA, RENDER } from "./renderVideo.js";
import { DENSIDAD_DE_REFERENCIA, PAPELES, BAJADA_MUSICA } from "./efectosColocados.js";

/** La ventana de las envolventes (s): 50 ms, como la que usa earshot para el fondo. */
export const VENTANA_ESCUCHA = 0.05;
/** Lo más bajo que se dibuja o se cuenta (dBFS). */
export const SUELO_DB = -70;
/** Un hueco: tanto tiempo (s) con todo por debajo de -50 dBFS. */
const HUECO = { db: -50, s: 1 };
/** Cuánto de un efecto cuenta para ver qué palabra pisa (s): la cola de un impacto no «pisa» nada. */
const ZONA_EFECTO = 0.6;

const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
/** Un número como se escribe en español (coma decimal). */
const es = (n) => String(n).replace(".", ",");
const r2 = (n) => Math.round(n * 100) / 100;
const dB = (x) => (x > 0 ? Math.max(SUELO_DB, 20 * Math.log10(x)) : SUELO_DB);

/** «0:03,2»: un segundo del video como lo diría una persona. Pura. */
export function reloj(s) {
  const t = Math.max(0, Number(s) || 0);
  const m = Math.floor(t / 60);
  const resto = (t - m * 60).toFixed(1).replace(".", ",");
  return `${m}:${resto.padStart(4, "0")}`;
}

/** La envolvente de una pista PCM s16le estéreo: el RMS de cada ventana de 50 ms en dBFS. → Float32Array. Pura. */
export function envolvente(pcm, muestreo = RENDER.muestreo, ventana = VENTANA_ESCUCHA) {
  if (!pcm?.byteLength) return new Float32Array(0);
  const total = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  const porVentana = Math.max(1, Math.round(ventana * muestreo));
  const n = Math.ceil(total / porVentana);
  const out = new Float32Array(n);
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let k = 0; k < n; k++) {
    let suma = 0;
    const fin = Math.min(total, (k + 1) * porVentana);
    for (let i = k * porVentana; i < fin; i++) {
      const a = v.getInt16(i * BYTES_MUESTRA, true) / 32768;
      const b = v.getInt16(i * BYTES_MUESTRA + 2, true) / 32768;
      suma += (a * a + b * b) / 2;
    }
    out[k] = dB(Math.sqrt(suma / Math.max(1, fin - k * porVentana)));
  }
  return out;
}

/** La energía media (lineal) de una envolvente en las ventanas que marca `donde` (o en todas). → dBFS, o null. */
function mediaDe(env, donde = null) {
  let suma = 0;
  let n = 0;
  for (let k = 0; k < env.length; k++) {
    if (donde && !donde[k]) continue;
    suma += 10 ** (env[k] / 10);
    n++;
  }
  return n ? 10 * Math.log10(suma / n) : null;
}

/** Las palabras del video (de `lineaDeTiempo`), planas y en orden, con su escena. Pura. */
export function palabrasDelVideo(linea) {
  const out = [];
  (linea?.escenas ?? []).forEach((e) => { for (const p of e.palabras ?? []) out.push({ ...p, escena: e.id }); });
  return out;
}

/**
 * El INFORME de escucha. Entra lo que armó el Container:
 *   pistas { habla, musica, efectos } y la mezcla (PCM), `momentos` (de `momentosColocados`), `medidas` (de
 *   `mezclarColocados`), `sinSitio`, `movidos`, `sinArchivo`, `bajadas`, `linea`, `volumen` ({ lufs, pico } medidos con
 *   loudnorm antes del volumen final, o null), `musica` (el nombre), `automaticos` (si la lista era la automática) y
 *   `avisosExtra` (lo que ya avisó quien armó el audio).
 * → { duracion, voz, musica, efectos: [...], densidad, huecos, volumen, escuchar: [...], avisos, envolventes, texto }. Pura.
 */
export function informeDeEscucha({
  pistas, mezcla, momentos = [], medidas = [], sinSitio = [], movidos = [], sinArchivo = [], bajadas = [], linea,
  volumen = null, musica = null, automaticos = false, colocados = [], titulo = "", avisosExtra = [], muestreo = RENDER.muestreo,
}) {
  const duracion = r2(Number(linea?.total) || (mezcla?.byteLength ?? 0) / BYTES_MUESTRA / muestreo);
  const envVoz = envolvente(pistas?.habla, muestreo);
  const envMusica = pistas?.musica ? envolvente(pistas.musica, muestreo) : null;
  const envEfectos = pistas?.efectos ? envolvente(pistas.efectos, muestreo) : null;
  const envMezcla = envolvente(mezcla, muestreo);
  const ventanas = envMezcla.length;
  const enVentana = (t) => Math.max(0, Math.min(ventanas - 1, Math.floor(t / VENTANA_ESCUCHA)));

  // La voz: dónde se habla (20 dB bajo su nivel medio) y cuánto suena.
  const nivelVoz = mediaDe(envVoz.map((x) => (x > SUELO_DB + 1 ? x : SUELO_DB)).filter((x) => x > SUELO_DB + 1));
  const hablando = new Uint8Array(ventanas);
  if (nivelVoz !== null) for (let k = 0; k < ventanas; k++) hablando[k] = (envVoz[k] ?? SUELO_DB) > nivelVoz - 20 ? 1 : 0;
  const hayVoz = nivelVoz !== null && hablando.some(Boolean);
  const huecos = new Uint8Array(ventanas).map((_, k) => (hablando[k] ? 0 : 1));
  const musicaHablando = envMusica && hayVoz ? mediaDe(envMusica, hablando) : null;
  const musicaHueco = envMusica ? mediaDe(envMusica, hayVoz ? huecos : null) : null;

  const palabras = palabrasDelVideo(linea);
  const porI = new Map(momentos.map((m) => [m.i, m]));
  const efectos = medidas.map((md, n) => {
    const m = porI.get(md.i) ?? {};
    const zona = [md.en, md.en + Math.min(md.dur, ZONA_EFECTO)];
    const pisa = palabras.filter((p) => p.hasta > zona[0] && p.desde < zona[1]).map((p) => p.texto);
    const habla = Boolean(hablando[enVentana(md.golpe)]);
    const avisos = [];
    if (md.sobreVoz !== null && md.sobreVoz > -6 && pisa.length) avisos.push(`compite con la voz: pisa «${pisa[0]}» a ${es(md.sobreVoz)} dB de ella`);
    if (habla && md.sobreVoz !== null && md.sobreVoz < -22) avisos.push(`casi no se oye: queda ${es(-md.sobreVoz)} dB bajo la voz`);
    if (!habla && md.sobreFondo !== null && md.sobreFondo < 3) avisos.push(`la música lo tapa: sólo ${es(md.sobreFondo)} dB sobre ella`);
    const queda = duracion - md.en;
    if (queda < 0.05) avisos.push("empieza cuando el video ya acabó: no se oye");
    else if (queda < Math.min(md.dur, 0.3)) avisos.push(`apenas suena: el video acaba ${es(r2(queda))} s después de que empiece`);
    const movido = movidos.find((x) => x.i === md.i);
    if (movido) avisos.push(`se atrasó ${movido.ms} ms para no amontonarse con otro igual`);
    return {
      n: n + 1, i: md.i, en: md.en, golpe: md.golpe, dur: md.dur, nombre: m.nombre ?? md.clave, papel: m.papel ?? "propio", que: m.que ?? "",
      sobreVoz: md.sobreVoz, sobreFondo: md.sobreFondo, aMano: md.aMano, hablando: habla, pisa: pisa.slice(0, 3), avisos,
    };
  });
  // Los que se pisan entre sí (los dos se oyen: ninguno está 15 dB por debajo de la voz… o no hay voz).
  for (let a = 0; a < efectos.length; a++) {
    for (let b = a + 1; b < efectos.length; b++) {
      const x = efectos[a];
      const y = efectos[b];
      if (y.en >= x.en + Math.min(x.dur, ZONA_EFECTO)) break;
      if (y.golpe - x.golpe < 0.03) continue; // a la vez a propósito (un golpe con su caída debajo)
      y.avisos.push(`se pisa con el ${x.n} («${x.nombre}»)`);
    }
  }

  const densidad = duracion > 0 ? r1((efectos.length / duracion) * 10) : 0;
  const referencia = hayVoz ? DENSIDAD_DE_REFERENCIA.locucion : envMusica ? DENSIDAD_DE_REFERENCIA.musica : DENSIDAD_DE_REFERENCIA.efectos;

  // Los huecos: todo por debajo de -50 dBFS durante más de 1 s (sin contar el final, que puede ser la salida).
  const vacios = [];
  let desde = null;
  for (let k = 0; k <= ventanas; k++) {
    const callado = k < ventanas && envMezcla[k] < HUECO.db;
    if (callado && desde === null) desde = k;
    if (!callado && desde !== null) {
      const a = desde * VENTANA_ESCUCHA;
      const b = Math.min(duracion, k * VENTANA_ESCUCHA);
      if (b - a >= HUECO.s && b < duracion - 0.2) vacios.push({ desde: r2(a), hasta: r2(b) });
      desde = null;
    }
  }

  const avisos = [...avisosExtra];
  for (const s of sinSitio) avisos.push(`El efecto ${s.i + 1} de la lista no suena: ${s.motivo}`);
  for (const s of sinArchivo) avisos.push(`«${s.nombre}» no se pudo leer y no suena.`);
  if (linea?.estimado && hayVoz === false && palabras.length) avisos.push("Aún no hay voz: los tiempos de las palabras son estimados (a 2,5 palabras por segundo).");
  if (densidad > referencia[1]) avisos.push(`Hay muchos efectos: ${es(densidad)} cada 10 s (en lo medido, ${referencia[0]} a ${referencia[1]}).`);

  let vol = null;
  if (volumen && Number.isFinite(volumen.lufs)) {
    const ganancia = RENDER.lufs - volumen.lufs;
    const picoFinal = Number.isFinite(volumen.pico) ? volumen.pico + ganancia : null;
    vol = { lufs: r1(volumen.lufs), ganancia: r1(ganancia), picoFinal: r1(picoFinal), limitador: picoFinal !== null && picoFinal > RENDER.pico };
  }

  // Los 5 momentos para escuchar: lo de más riesgo primero, sin dos en el mismo medio segundo.
  const candidatos = [];
  for (const e of efectos) {
    if (e.avisos.length) candidatos.push({ segundo: e.golpe, peso: 10 + e.avisos.length, porque: `el ${e.n} («${e.nombre}»): ${e.avisos[0]}` });
  }
  const masFuerte = [...efectos].filter((e) => e.sobreVoz !== null).sort((a, b) => b.sobreVoz - a.sobreVoz)[0];
  if (masFuerte) candidatos.push({ segundo: masFuerte.golpe, peso: 6, porque: `el efecto más fuerte frente a la voz (el ${masFuerte.n}, «${masFuerte.nombre}», a ${es(masFuerte.sobreVoz)} dB)` });
  if (efectos[0]) candidatos.push({ segundo: efectos[0].golpe, peso: 5, porque: `el primer efecto (el 1, «${efectos[0].nombre}»): marca el tono de todo el video` });
  if (bajadas[0]) candidatos.push({ segundo: bajadas[0].hasta, peso: 5, porque: `la música baja ${BAJADA_MUSICA.db} dB antes del golpe y vuelve con él: que no se note el hueco` });
  const masJuntos = efectos.reduce((mejor, e, k) => {
    const n = efectos.filter((x) => x.en >= e.en && x.en < e.en + 2).length;
    return n > (mejor?.n ?? 2) ? { n, t: e.en, k } : mejor;
  }, null);
  if (masJuntos) candidatos.push({ segundo: masJuntos.t, peso: 4, porque: `${masJuntos.n} efectos en 2 segundos: que no se amontonen` });
  if (envMusica) candidatos.push({ segundo: Math.max(0, duracion - 2), peso: 2, porque: "la salida de la música (fundido de 2 s)" });
  const escuchar = [];
  for (const c of candidatos.sort((a, b) => b.peso - a.peso)) {
    if (escuchar.length >= 5) break;
    if (escuchar.some((x) => Math.abs(x.segundo - c.segundo) < 0.5)) continue;
    escuchar.push({ segundo: r2(Math.max(0, c.segundo)), porque: c.porque });
  }
  escuchar.sort((a, b) => a.segundo - b.segundo);

  const informe = {
    titulo, duracion, estimado: Boolean(linea?.estimado),
    voz: hayVoz ? { nivel: r1(nivelVoz) } : null,
    musica: envMusica ? { nombre: musica, hablando: musicaHablando !== null && hayVoz ? r1(musicaHablando - nivelVoz) : null, hueco: musicaHueco !== null && hayVoz ? r1(musicaHueco - nivelVoz) : r1(musicaHueco) } : null,
    automaticos, colocados: colocados.length, efectos, densidad, referencia, huecos: vacios, volumen: vol, bajadas, escuchar, avisos,
    envolventes: { ventana: VENTANA_ESCUCHA, voz: Array.from(envVoz, r1), musica: envMusica ? Array.from(envMusica, r1) : null, efectos: envEfectos ? Array.from(envEfectos, r1) : null },
  };
  informe.texto = textoDelInforme(informe);
  return informe;
}

/** El informe en palabras (lo que lee Claude y lo que muestra la pantalla). Pura. */
export function textoDelInforme(inf) {
  const l = [];
  const mas = (n) => `${n > 0 ? "+" : ""}${es(n)}`;
  l.push(`Sonido de «${inf.titulo || "el video"}» (${es(inf.duracion)} s${inf.estimado ? "; tiempos ESTIMADOS: sin los de la voz, a 2,5 palabras por segundo" : ""}).`);
  l.push(inf.voz ? `Voz: sí (${es(inf.voz.nivel)} dBFS de media antes del volumen final).` : "Voz: no hay.");
  if (inf.musica) {
    l.push(`Música: «${inf.musica.nombre || "de fondo"}»${inf.voz ? `, ${es(-inf.musica.hablando)} dB bajo la voz mientras se habla y ${es(-inf.musica.hueco)} dB bajo ella en los huecos` : ""}.`);
  } else l.push("Música: ninguna.");
  const tipo = inf.automaticos ? "los automáticos (un whoosh en cada transición y un pop en cada sello o llamado)" : `la lista colocada (${inf.colocados})`;
  l.push(`Efectos: ${inf.efectos.length}, ${tipo}; ${es(inf.densidad)} cada 10 s (referencia de earshot en películas de producto ${inf.voz ? "con locución" : inf.musica ? "con música" : "sólo de efectos"}: ${inf.referencia[0]} a ${inf.referencia[1]}; un video de marketing va con lo que pida lo que se ve).`);
  if (inf.volumen) {
    l.push(`Volumen antes del final: ${es(inf.volumen.lufs)} LUFS; el render lo lleva a ${RENDER.lufs} LUFS (${mas(inf.volumen.ganancia)} dB)${inf.volumen.limitador ? ` y el limitador actuará (el pico llegaría a ${es(inf.volumen.picoFinal)} dBTP)` : ""}.`);
  }
  if (inf.efectos.length) {
    l.push("", "Cada efecto (dB: frente a la voz / sobre la música del segundo de antes):");
    for (const e of inf.efectos) {
      const niveles = [e.sobreVoz !== null ? `${es(e.sobreVoz)} dB frente a la voz` : "", e.sobreFondo !== null ? `${mas(e.sobreFondo)} dB sobre la música` : ""].filter(Boolean).join(", ");
      const papel = PAPELES[e.papel]?.nombre ?? e.papel;
      l.push(`${e.n}. ${reloj(e.golpe)} · «${e.nombre}» (${papel}) ${e.que}${niveles ? ` · ${niveles}` : ""}${e.pisa.length ? ` · suena con «${e.pisa.join(" ")}»` : ""}${e.aMano ? ` · ${mas(e.aMano)} dB a mano` : ""}${e.avisos.length ? ` · OJO: ${e.avisos.join("; ")}` : ""}`);
    }
  }
  if (inf.bajadas.length) l.push("", `La música baja ${BAJADA_MUSICA.db} dB antes de: ${inf.bajadas.map((b) => reloj(b.hasta)).join(", ")} (y vuelve con el golpe).`);
  if (inf.huecos.length) l.push(`Huecos sin sonido: ${inf.huecos.map((h) => `${reloj(h.desde)}–${reloj(h.hasta)}`).join(", ")}.`);
  if (inf.avisos.length) l.push("", ...inf.avisos.map((a) => `OJO: ${a}`));
  if (inf.escuchar.length) l.push("", "Que una persona escuche estos momentos:", ...inf.escuchar.map((m) => `· ${reloj(m.segundo)}: ${m.porque}`));
  l.push("", "Medido, no oído: el gusto lo pone quien escucha esos momentos.");
  return l.join("\n");
}
