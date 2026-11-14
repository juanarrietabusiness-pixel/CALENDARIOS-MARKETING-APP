// ============================================================
// LO QUE SE VE DÍA A DÍA en las campañas de un cliente: las alertas que la revisión 3Q no ve con ventanas (puro)
//
// La revisión (src/lib/tresQ.js) juzga 30, 14 y 7 días SUMADOS: un destino que se rompió hace tres días o un anuncio que
// se cansa poco a poco quedan escondidos en la suma. Estas reglas miran la serie DIARIA (lo que Meta da con
// `time_increment=1`: dos llamadas más en la revisión, una en el cron) y dicen, cada una con su semáforo con texto, por
// qué en una frase, qué hacer y dónde en el Ads Manager:
//
//   · `ritmoDeGasto()`     — lo gastado en el mes frente a lo que tocaba a estas alturas según el PLAN del mes (la
//                            inversión de los números del negocio y la temporada: lib/planCiclo.js `presupuestoDelMes`).
//                            ±10 % es «en línea»; se proyecta a fin de mes.
//   · `alertasDeDestino()` — el anuncio funciona y el destino no: la gente hace clic igual (CTR estable) y las
//                            conversaciones por clic caen más de un 20 % tres días seguidos, o hay clics y CERO
//                            conversaciones tres días (el destino está roto: el enlace, el número de WhatsApp, la web).
//   · `cpmAnomalo()`       — el costo de mil impresiones se sale un 25 % de su promedio de 7 días dos días seguidos. Toda
//                            la cuenta = algo de fuera (la subasta, una fecha); una campaña sola = algo suyo.
//   · `anunciosCansados()` — el CTR de un anuncio frente al de sus 3 primeros días: una caída sostenida en los últimos 7
//                            (con 1.000 impresiones o más; un día suelto no cuenta). Complementa «Renovar la pieza» de la
//                            revisión: lo que ella ya dice no se repite.
//   · `formatoDominante()` — un formato (video, imagen o carrusel) que se lleva más del 80 % del gasto.
//   · `alertasGravesDiarias()` — lo GRAVE y barato para el cron: el destino roto y el gasto adelantado más de un 30 %.
//
// Con pocos resultados no se concluye fuerte (`POCOS_RESULTADOS`): la pantalla lo dice. Las ideas vienen del curso de
// campañas y de cómo Meta reparte el presupuesto, dichas con palabras propias.
// ============================================================

import { cifras3q, SEMAFOROS, POCOS_RESULTADOS } from "./tresQ.js";
import { formatoMoneda, objetivoODAX } from "./anuncios.js";
import { sumarDias } from "./agenda.js";

/** Los umbrales de las alertas diarias (los de la agencia; cambiarlos aquí los cambia en la revisión y el cron). */
export const UMBRALES_DIARIOS = Object.freeze({
  ritmoLinea: 10, // ±10 %: el gasto va en línea con el plan
  ritmoMal: 30, // más de un 30 % adelantado: grave (se acaba el presupuesto antes de fin de mes)
  destinoCaida: 20, // las conversaciones por clic caen más de un 20 %…
  destinoDias: 3, // …tres días seguidos
  minClicsDia: 5, // un día con menos clics no dice nada del destino
  ctrEstable: 15, // el CTR se movió menos de un 15 %: el anuncio sigue igual
  cpmDesvio: 25, // el CPM se sale un 25 % de su promedio…
  cpmDias: 2, // …dos días seguidos
  minImpresionesDia: 300, // un día con menos impresiones no cuenta para el CPM
  cansadoBase: 3, // los primeros días con impresiones: la base del CTR de un anuncio
  cansadoCaida: 25, // el CTR de los últimos 7 días, un 25 % por debajo de la base
  cansadoMinImpresiones: 1000,
  formatoDominante: 80, // un formato con más del 80 % del gasto
});
/** Con menos resultados que esto no se sacan conclusiones fuertes (el de tresQ.js). */
export { POCOS_RESULTADOS };
/** Lo que se lee día a día para el destino, el CPM y el cansancio: las dos últimas semanas. */
export const DIAS_SERIE = 14;

const num = (x) => Number(x) || 0;
const r1 = (n) => Math.round(n * 10) / 10;
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
const coma = (x) => String(r1(Math.abs(x))).replace(".", ",");
const semaforo = (id) => ({ id, texto: SEMAFOROS[id].texto, tono: SEMAFOROS[id].tono });
const dia = (f) => String(f?.date_start ?? f?.fecha ?? "").slice(0, 10);
const ultimoDiaDelMes = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** Las campañas que no buscan un resultado (alcance, reconocimiento): el destino y el «sin conversaciones» no aplican. */
const SIN_RESULTADO = new Set(["OUTCOME_AWARENESS"]);

/**
 * Una fila diaria de /insights como cifras: gasto, impresiones, clics al enlace (únicos si los hay), resultados (los
 * de `tipo`: «conversacion», «compra» o «cliente») y el CPM y el CTR del día. Pura.
 */
export function cifrasDelDia(f, tipo = "conversacion") {
  const c = cifras3q(f, f?.objective || "x", { tipo });
  if (!c) return null;
  const clics = f?.unique_inline_link_clicks != null ? num(f.unique_inline_link_clicks) : f?.inline_link_clicks != null ? num(f.inline_link_clicks) : num(f?.clicks);
  return {
    fecha: dia(f), gasto: c.gasto, impresiones: c.impresiones, clics, resultados: c.resultados ?? 0,
    cpm: c.impresiones > 0 ? (c.gasto / c.impresiones) * 1000 : null,
    ctr: c.impresiones > 0 ? (clics / c.impresiones) * 100 : null,
  };
}

/** Suma unas cifras diarias. Pura. */
function sumar(dias) {
  const t = dias.reduce((s, d) => ({ gasto: s.gasto + d.gasto, impresiones: s.impresiones + d.impresiones, clics: s.clics + d.clics, resultados: s.resultados + d.resultados }), { gasto: 0, impresiones: 0, clics: 0, resultados: 0 });
  return { ...t, cpm: t.impresiones > 0 ? (t.gasto / t.impresiones) * 1000 : null, ctr: t.impresiones > 0 ? (t.clics / t.impresiones) * 100 : null };
}

/** Las filas diarias juntadas por día (varias campañas, o una sola): fecha → cifras. Pura. */
function porDia(filas, tipo, filtro = () => true) {
  const m = new Map();
  for (const f of filas ?? []) {
    if (!filtro(f)) continue;
    const c = cifrasDelDia(f, tipo);
    if (!c?.fecha) continue;
    const previa = m.get(c.fecha);
    m.set(c.fecha, previa ? { ...sumar([previa, c]), fecha: c.fecha } : c);
  }
  return m;
}

/** Los días de `desde` a `hasta` (AAAA-MM-DD), en orden. */
function dias(desde, hasta) {
  const salida = [];
  for (let d = desde; d <= hasta && salida.length < 62; d = sumarDias(d, 1)) salida.push(d);
  return salida;
}

// ------------------------------------------------------------
// El ritmo de gasto frente al plan del mes
// ------------------------------------------------------------

/**
 * Lo gastado este mes (hasta AYER: hoy va a medias) frente a lo que tocaba: el presupuesto del mes ÷ los días del mes ×
 * los días que pasaron. `presupuesto`: { total, de } (lib/planCiclo.js `presupuestoDelMes`); `filas`: las diarias por
 * campaña. Sin presupuesto, un aviso «sin datos» que dice dónde se completa; el primer día del mes, null. Pura.
 */
export function ritmoDeGasto({ filas = [], presupuesto = null, hoy = "", moneda = "USD", u = UMBRALES_DIARIOS } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null;
  const mes = hoy.slice(0, 7);
  const ayer = sumarDias(hoy, -1);
  if (ayer < `${mes}-01`) return null;
  const d = (n) => formatoMoneda(n, moneda);
  const base = { id: "ritmo", clave: `ritmo:${mes}`, tipo: "ritmo", termino: "ritmo", nivel: "cuenta" };
  if (!(presupuesto?.total > 0)) {
    return {
      ...base, semaforo: semaforo("sin-datos"), titulo: "Ritmo de gasto: sin presupuesto del mes",
      porque: "Sin los números del negocio no hay un presupuesto del mes con el que comparar lo gastado.",
      pasos: ["Completa la meta de ventas, el ticket y el % a invertir (o el presupuesto del mes) en Marca → Números del negocio."],
      donde: "En la aplicación: Marca → Números del negocio",
    };
  }
  const diasMes = ultimoDiaDelMes(mes);
  const pasados = Number(ayer.slice(8, 10));
  const gastado = (filas ?? []).filter((f) => dia(f).startsWith(mes) && dia(f) <= ayer).reduce((s, f) => s + num(f.spend), 0);
  const ideal = (presupuesto.total / diasMes) * pasados;
  const desvio = pct(gastado, ideal) ?? 0;
  const proyeccion = pasados > 0 ? (gastado / pasados) * diasMes : 0;
  const cifras = { gastado: r1(gastado), ideal: r1(ideal), total: presupuesto.total, desvio: r1(desvio), proyeccion: r1(proyeccion), pasados, diasMes };
  const linea = `Van ${d(gastado)} gastados en ${pasados} ${pasados === 1 ? "día" : "días"}; según el plan del mes (${d(presupuesto.total)}) tocaban ${d(ideal)}.`;
  if (Math.abs(desvio) <= u.ritmoLinea) {
    return { ...base, cifras, semaforo: semaforo("sana"), titulo: "Ritmo de gasto: en línea con el plan", porque: `${linea} A este paso el mes cierra en unos ${d(proyeccion)}.`, pasos: ["No toques los presupuestos: van bien."], donde: "" };
  }
  if (desvio > 0) {
    const grave = desvio > u.ritmoMal;
    const seAcaba = proyeccion > presupuesto.total ? ` A este paso el mes cierra en ${d(proyeccion)}: ${d(proyeccion - presupuesto.total)} más de lo planeado.` : "";
    return {
      ...base, cifras, grave, semaforo: semaforo(grave ? "mala" : "vigilar"),
      titulo: `Ritmo de gasto: ${coma(desvio)} % por encima del plan`,
      porque: `${linea}${seAcaba}`,
      pasos: [
        "Mira qué campaña gasta más de lo planeado (la columna «Importe gastado» en las campañas).",
        `Baja su presupuesto diario hasta que el total vuelva a unos ${d(presupuesto.total / diasMes)} al día; si es lo que más vende, sube la inversión del mes en el plan en lugar de bajarla.`,
        "No bajes más de un 20 % de una vez: reinicia el aprendizaje.",
      ],
      donde: "En el Ads Manager: Campañas → columna «Importe gastado» → Editar → Presupuesto",
    };
  }
  return {
    ...base, cifras, semaforo: semaforo("vigilar"),
    titulo: `Ritmo de gasto: ${coma(desvio)} % por debajo del plan`,
    porque: `${linea} A este paso el mes cierra en ${d(proyeccion)}, ${d(presupuesto.total - proyeccion)} menos de lo planeado.`,
    pasos: [
      "Mira si hay campañas o conjuntos pausados, en revisión o sin entregar (la columna «Entrega»).",
      "Si todo entrega y aun así gasta poco, los públicos pueden ser pequeños: amplía el de presentación o sube el presupuesto un 20 %.",
    ],
    donde: "En el Ads Manager: Campañas → columna «Entrega»",
  };
}

// ------------------------------------------------------------
// El anuncio funciona y el destino no
// ------------------------------------------------------------

/**
 * Por campaña, los últimos `destinoDias` días frente a los de antes (de la serie de `DIAS_SERIE`): clics y CERO
 * resultados cada día → el destino está roto (grave); los resultados por clic caen más de `destinoCaida` % cada día con
 * el CTR estable → el problema está en el destino, no en el anuncio. `filas`: las diarias por campaña (con
 * `campaign_id`, `campaign_name` y `objective`); `tipo`: lo que cuenta como resultado. Pura.
 */
export function alertasDeDestino({ filas = [], hoy = "", tipo = "conversacion", moneda = "USD", nombreResultado = "conversaciones", u = UMBRALES_DIARIOS } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return [];
  const ayer = sumarDias(hoy, -1);
  const ultimos = dias(sumarDias(ayer, -(u.destinoDias - 1)), ayer);
  const antes = dias(sumarDias(ayer, -(DIAS_SERIE - 1)), sumarDias(ultimos[0], -1));
  const campanas = new Map();
  for (const f of filas ?? []) {
    if (!f?.campaign_id || SIN_RESULTADO.has(objetivoODAX(f.objective))) continue;
    if (!campanas.has(String(f.campaign_id))) campanas.set(String(f.campaign_id), f.campaign_name ?? String(f.campaign_id));
  }
  const d = (n) => formatoMoneda(n, moneda);
  const salida = [];
  for (const [id, nombre] of campanas) {
    const serie = porDia(filas, tipo, (f) => String(f.campaign_id) === id);
    const recientes = ultimos.map((x) => serie.get(x)).filter(Boolean);
    if (recientes.length < u.destinoDias || recientes.some((x) => x.clics < u.minClicsDia)) continue;
    const r = sumar(recientes);
    const base = sumar(antes.map((x) => serie.get(x)).filter(Boolean));
    const enlace = { campanaId: id, campana: nombre, nivel: "campana" };
    if (recientes.every((x) => x.resultados === 0) && base.resultados > 0) {
      salida.push({
        ...enlace, id: `destino-roto:${id}`, clave: `destino-roto:${id}`, tipo: "destino-roto", termino: "destino", grave: true, semaforo: semaforo("mala"),
        titulo: `«${nombre}»: hay clics y ninguna ${singular(nombreResultado)} en ${u.destinoDias} días`,
        porque: `En los últimos ${u.destinoDias} días hubo ${r.clics} clics y 0 ${nombreResultado} (se gastaron ${d(r.gasto)}); antes sí llegaban. La gente toca el anuncio y algo falla al llegar: lo más probable es el destino, no el anuncio.`,
        pasos: [
          "Toca tú el anuncio desde el teléfono (la vista previa del Ads Manager) y mira a dónde lleva: que abra el WhatsApp correcto (o la web) y que funcione.",
          "Revisa el número de WhatsApp conectado a la página y que la web cargue.",
          "Si el destino está bien, mira si alguien está contestando los mensajes.",
        ],
        donde: `En el Ads Manager: Campañas → «${nombre}» → un anuncio → Vista previa`,
        cifras: { clics: r.clics, resultados: 0, gasto: r1(r.gasto), dias: u.destinoDias },
      });
      continue;
    }
    if (!(base.clics >= 30 && base.resultados >= 3)) continue;
    const tasaBase = base.resultados / base.clics;
    const caen = recientes.every((x) => x.resultados / x.clics < tasaBase * (1 - u.destinoCaida / 100));
    const ctrIgual = base.ctr > 0 && r.ctr !== null && Math.abs(pct(r.ctr, base.ctr)) <= u.ctrEstable;
    if (!caen || !ctrIgual) continue;
    const tasaAhora = r.clics > 0 ? r.resultados / r.clics : 0;
    salida.push({
      ...enlace, id: `destino-cae:${id}`, clave: `destino-cae:${id}`, tipo: "destino-cae", termino: "destino", grave: false, semaforo: semaforo("vigilar"),
      titulo: `«${nombre}»: el anuncio funciona igual y llegan menos ${nombreResultado}`,
      porque: `La gente hace clic igual que antes (CTR ${coma(r.ctr)} %, antes ${coma(base.ctr)} %), pero de cada 100 clics llegan ${coma(tasaAhora * 100)} ${nombreResultado} y antes ${coma(tasaBase * 100)}, ${u.destinoDias} días seguidos (se gastaron ${d(r.gasto)} en esos días). Lo que cambió está en el destino.`,
      pasos: [
        "Revisa el destino: que el mensaje de bienvenida de WhatsApp (o la página) diga lo mismo que el anuncio y que el precio y la oferta sean los mismos.",
        "Mira si cambió algo estos días: el número, la web, el horario de respuesta, un producto agotado.",
        "No cambies el anuncio: él está haciendo su parte.",
      ],
      donde: `En el Ads Manager: Campañas → «${nombre}» → un anuncio → Editar → Destino`,
      cifras: { ctr: r1(r.ctr), ctrAntes: r1(base.ctr), tasa: r1(tasaAhora * 100), tasaAntes: r1(tasaBase * 100), gasto: r1(r.gasto) },
    });
  }
  return salida;
}
const singular = (nombre) => ({ conversaciones: "conversación", compras: "compra", "clientes potenciales": "cliente potencial" }[nombre] ?? "conversación");

// ------------------------------------------------------------
// El CPM fuera de lo normal
// ------------------------------------------------------------

/** ¿Los últimos `cpmDias` días se salen un `cpmDesvio` % (todos hacia el mismo lado) del promedio de los 7 de antes? */
function desvioCpm(serie, ayer, u) {
  const ultimos = dias(sumarDias(ayer, -(u.cpmDias - 1)), ayer).map((x) => serie.get(x));
  if (ultimos.some((x) => !x || x.impresiones < u.minImpresionesDia || x.cpm === null)) return null;
  const previos = dias(sumarDias(ayer, -(u.cpmDias + 6)), sumarDias(ayer, -u.cpmDias)).map((x) => serie.get(x)).filter((x) => x?.impresiones >= u.minImpresionesDia);
  if (previos.length < 4) return null;
  const promedio = sumar(previos).cpm;
  if (!(promedio > 0)) return null;
  const desvios = ultimos.map((x) => pct(x.cpm, promedio));
  if (desvios.every((x) => x > u.cpmDesvio)) return { lado: "sube", desvio: Math.min(...desvios), promedio, ahora: sumar(ultimos).cpm };
  if (desvios.every((x) => x < -u.cpmDesvio)) return { lado: "baja", desvio: Math.max(...desvios), promedio, ahora: sumar(ultimos).cpm };
  return null;
}

/**
 * El CPM (lo que cuestan mil impresiones) fuera de lo normal dos días seguidos. Si se mueve toda la cuenta (y la mayoría
 * de sus campañas), es de FUERA: la subasta (más anunciantes, una fecha comercial); si es una campaña sola, es SUYO (su
 * público, su pieza, su calidad). `filas`: las diarias por campaña. Pura.
 */
export function cpmAnomalo({ filas = [], hoy = "", moneda = "USD", u = UMBRALES_DIARIOS } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return [];
  const ayer = sumarDias(hoy, -1);
  const d = (n) => formatoMoneda(n, moneda);
  const cuenta = desvioCpm(porDia(filas, "conversacion"), ayer, u);
  const ids = [...new Map((filas ?? []).filter((f) => f?.campaign_id).map((f) => [String(f.campaign_id), f.campaign_name ?? String(f.campaign_id)])).entries()];
  const porCampana = ids.map(([id, nombre]) => ({ id, nombre, x: desvioCpm(porDia(filas, "conversacion", (f) => String(f.campaign_id) === id), ayer, u) }));
  const salida = [];
  if (cuenta) {
    const igual = porCampana.filter((c) => c.x?.lado === cuenta.lado).length;
    const externo = ids.length <= 1 || igual >= Math.ceil(ids.length / 2);
    const sube = cuenta.lado === "sube";
    salida.push({
      id: `cpm:cuenta:${cuenta.lado}`, clave: `cpm:cuenta:${cuenta.lado}:${ayer}`, tipo: "cpm", termino: "cpm", nivel: "cuenta", grave: false,
      semaforo: semaforo(sube ? "vigilar" : "sana"),
      titulo: `CPM de toda la cuenta: ${sube ? "más caro" : "más barato"} que de costumbre`,
      porque: `Mil impresiones cuestan ${d(cuenta.ahora)} los últimos ${u.cpmDias} días, frente a ${d(cuenta.promedio)} de promedio la semana anterior (${coma(cuenta.desvio)} %${sube ? " más" : " menos"})${externo ? ", y le pasa a casi todas las campañas: es algo de fuera (la subasta, una fecha comercial, más marcas anunciándose)" : ""}.`,
      pasos: sube
        ? ["No cambies nada por esto solo: si es de la subasta, pasa en unos días.", "Si el costo por resultado se mantiene dentro del número mágico, sigue igual; si se dispara, baja el presupuesto un 20 % hasta que pase la fecha."]
        : ["Aprovéchalo: si el costo por resultado también baja, es buen momento para subir un 20 % lo que funciona."],
      donde: "En el Ads Manager: Campañas → columna «CPM (costo por mil impresiones)»",
      cifras: { cpm: r1(cuenta.ahora), promedio: r1(cuenta.promedio), desvio: r1(cuenta.desvio) },
    });
    if (externo) return salida;
  }
  for (const c of porCampana) {
    if (!c.x || (cuenta && c.x.lado === cuenta.lado)) continue;
    const sube = c.x.lado === "sube";
    salida.push({
      id: `cpm:${c.id}:${c.x.lado}`, clave: `cpm:${c.id}:${c.x.lado}:${ayer}`, tipo: "cpm", termino: "cpm", nivel: "campana", campanaId: c.id, campana: c.nombre, grave: false,
      semaforo: semaforo(sube ? "vigilar" : "sana"),
      titulo: `«${c.nombre}»: su CPM ${sube ? "subió" : "bajó"} y el de la cuenta no`,
      porque: `Mil impresiones de esta campaña cuestan ${d(c.x.ahora)} los últimos ${u.cpmDias} días, frente a ${d(c.x.promedio)} de promedio (${coma(c.x.desvio)} %${sube ? " más" : " menos"}); el resto de la cuenta sigue igual, así que es algo suyo${sube ? ": un público que se agota, una pieza que gusta menos o la calidad del anuncio" : ""}.`,
      pasos: sube
        ? ["Mira su frecuencia: por encima de 3, el público ya vio mucho los anuncios (renuévalos o amplía el público).", "Mira los rankings de calidad de sus anuncios: el que esté por debajo del promedio encarece todo."]
        : ["Si el costo por resultado también bajó, es lo que funciona: no lo toques."],
      donde: `En el Ads Manager: Campañas → «${c.nombre}» → columnas «Frecuencia» y «CPM»`,
      cifras: { cpm: r1(c.x.ahora), promedio: r1(c.x.promedio), desvio: r1(c.x.desvio) },
    });
  }
  return salida;
}

// ------------------------------------------------------------
// El anuncio que se cansa
// ------------------------------------------------------------

/**
 * Los anuncios que se cansan día a día: el CTR de sus últimos 7 días, `cansadoCaida` % o más por debajo del de sus 3
 * primeros días con impresiones (dentro de la serie), con `cansadoMinImpresiones` o más en esos 7 días y la caída
 * sostenida (4 días o más de los 7 por debajo; un día malo no cuenta). `filas`: las diarias por anuncio (`ad_id`,
 * `ad_name`, `campaign_id`); `nombres`: id → { nombre, campana, conjunto }; `yaDichos`: los anuncios a los que la
 * revisión ya les dice «Renovar la pieza» (no se repite). Pura.
 */
export function anunciosCansados({ filas = [], hoy = "", nombres = new Map(), yaDichos = new Set(), u = UMBRALES_DIARIOS } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return [];
  const ayer = sumarDias(hoy, -1);
  const desde7 = sumarDias(ayer, -6);
  const ids = [...new Set((filas ?? []).map((f) => f?.ad_id).filter(Boolean).map(String))];
  const salida = [];
  for (const id of ids) {
    if (yaDichos.has(id)) continue;
    const serie = [...porDia(filas, "conversacion", (f) => String(f.ad_id) === id).values()].filter((x) => x.impresiones > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const base = serie.slice(0, u.cansadoBase);
    if (base.length < u.cansadoBase || base.at(-1).fecha >= desde7) continue;
    const ultimos = serie.filter((x) => x.fecha >= desde7);
    const r = sumar(ultimos);
    const b = sumar(base);
    if (r.impresiones < u.cansadoMinImpresiones || !(b.ctr > 0) || r.ctr === null) continue;
    const caida = pct(r.ctr, b.ctr);
    const bajos = ultimos.filter((x) => x.ctr !== null && x.ctr < b.ctr * 0.85).length;
    if (caida > -u.cansadoCaida || bajos < 4) continue;
    const info = nombres.get(id) ?? {};
    const nombre = info.nombre || id;
    salida.push({
      id: `cansado:${id}`, clave: `cansado:${id}`, tipo: "cansado", termino: "cansado", nivel: "anuncio", anuncioId: id, anuncio: nombre, campana: info.campana ?? "", grave: false,
      semaforo: semaforo("vigilar"),
      titulo: `«${nombre}» se está cansando`,
      porque: `Su CTR pasó de ${coma(b.ctr)} % en sus primeros días a ${coma(r.ctr)} % los últimos 7 (${coma(caida)} % menos, ${bajos} de 7 días por debajo): quien lo ve ya lo conoce y lo toca menos.`,
      pasos: [
        "Prepara una versión nueva de la pieza (otro gancho, otra imagen o el mismo mensaje con otro formato) en la aplicación.",
        `Súbela DENTRO del mismo conjunto${info.conjunto ? ` («${info.conjunto}»)` : ""}; no edites el anuncio que corre (reinicia el aprendizaje).`,
        "Cuando el nuevo entregue unos días, apaga el cansado si sigue bajando.",
      ],
      donde: `En el Ads Manager: Anuncios → «${nombre}» → columna «CTR (porcentaje de clics en el enlace)»`,
      cifras: { ctr: r1(r.ctr), ctrBase: r1(b.ctr), caida: r1(caida), impresiones: r.impresiones },
    });
  }
  return salida;
}

// ------------------------------------------------------------
// Un formato que se lleva casi todo
// ------------------------------------------------------------

/**
 * El formato de un anuncio con lo que se sabe de él: la publicación que usa (reel → video; carrusel → carrusel) o sus
 * reproducciones de video; si no, imagen. Pura.
 */
export function formatoDeAnuncio(a) {
  const f = a?.publicacion?.post?.formato;
  if (f === "reel") return "video";
  if (f === "carrusel") return "carrusel";
  const v = a?.ventanas?.[30] ?? a?.ventanas?.[7];
  if (v?.reproducciones3s > 0 || v?.thruplays > 0) return "video";
  return "imagen";
}
const NOMBRE_FORMATO = { video: "video", imagen: "imagen", carrusel: "carrusel" };

/**
 * Un formato que se lleva más del `formatoDominante` % del gasto de 30 días de la cuenta (con 3 anuncios o más
 * encendidos): Meta apuesta por lo que le funciona, pero así no se aprende de lo demás. `campanas`: las de la revisión
 * (con sus anuncios y sus ventanas). Pura.
 */
export function formatoDominante({ campanas = [], moneda = "USD", u = UMBRALES_DIARIOS } = {}) {
  const gasto = { video: 0, imagen: 0, carrusel: 0 };
  let n = 0;
  for (const c of campanas ?? []) {
    for (const a of c.anuncios ?? []) {
      const g = num(a.ventanas?.[30]?.gasto);
      if (!(g > 0)) continue;
      gasto[formatoDeAnuncio(a)] += g;
      n += 1;
    }
  }
  const total = gasto.video + gasto.imagen + gasto.carrusel;
  if (n < 3 || !(total > 0)) return null;
  const [formato, g] = Object.entries(gasto).sort((a, b) => b[1] - a[1])[0];
  const parte = (g / total) * 100;
  if (parte <= u.formatoDominante) return null;
  const otros = Object.keys(gasto).filter((k) => k !== formato).map((k) => NOMBRE_FORMATO[k]);
  return {
    id: `formato:${formato}`, clave: `formato:${formato}`, tipo: "formato", termino: "formato", nivel: "cuenta", grave: false, semaforo: semaforo("vigilar"),
    titulo: `El ${coma(parte)} % del gasto va a anuncios de ${NOMBRE_FORMATO[formato]}`,
    porque: `De ${formatoMoneda(total, moneda)} en 30 días, ${formatoMoneda(g, moneda)} fueron a ${NOMBRE_FORMATO[formato]}: Meta apuesta por lo que mejor le funciona, pero si todo es del mismo formato, no se sabe si ${otros.join(" o ")} venderían más barato.`,
    pasos: [
      `Si el costo por resultado es bueno, déjalo y suma en el mismo conjunto uno o dos anuncios de ${otros.join(" o ")} para probar.`,
      "Si es caro, el formato no es el problema principal: mira primero el gancho y el destino.",
    ],
    donde: "En el Ads Manager: Anuncios → columna «Importe gastado» (ordena de mayor a menor)",
    cifras: { formato, parte: r1(parte), total: r1(total) },
  };
}

// ------------------------------------------------------------
// Todo junto (la revisión) y lo grave (el cron)
// ------------------------------------------------------------

/**
 * Las alertas del día a día de una cuenta, en orden (lo malo primero). `campanasDia`: las filas diarias por campaña;
 * `anunciosDia`: las diarias por anuncio; `revision`: la revisión ya hecha (sus campañas, para el formato, los nombres
 * y lo que ya dice «Renovar»); `presupuesto`: el del plan del mes; `tipo`/`nombreResultado`: lo que cuenta como
 * resultado de la cuenta. Lo que no se pudo leer de Meta (null) no da alertas. Pura.
 */
export function alertasDelDia({ campanasDia = null, anunciosDia = null, revision = null, presupuesto = null, hoy = "", moneda = "USD", tipo = "conversacion", nombreResultado = "conversaciones" } = {}) {
  const salida = [];
  if (Array.isArray(campanasDia)) {
    const ritmo = ritmoDeGasto({ filas: campanasDia, presupuesto, hoy, moneda });
    if (ritmo) salida.push(ritmo);
    salida.push(...alertasDeDestino({ filas: campanasDia, hoy, tipo, moneda, nombreResultado }));
    salida.push(...cpmAnomalo({ filas: campanasDia, hoy, moneda }));
  }
  const campanas = revision?.campanas ?? [];
  if (Array.isArray(anunciosDia)) {
    const nombres = new Map();
    const yaDichos = new Set();
    for (const c of campanas) {
      const conjunto = new Map((c.conjuntos ?? []).map((s) => [String(s.id), s.nombre]));
      for (const a of c.anuncios ?? []) {
        nombres.set(String(a.id), { nombre: a.nombre || a.titulo || "", campana: c.nombre, conjunto: conjunto.get(String(a.conjuntoId)) ?? "" });
        if (a.veredicto?.id === "renovar") yaDichos.add(String(a.id));
      }
    }
    salida.push(...anunciosCansados({ filas: anunciosDia, hoy, nombres, yaDichos }));
  }
  const formato = formatoDominante({ campanas, moneda });
  if (formato) salida.push(formato);
  return salida.sort((a, b) => SEMAFOROS[a.semaforo.id].orden - SEMAFOROS[b.semaforo.id].orden);
}

/**
 * Lo GRAVE del día a día para el cron (a la campana): el destino roto y el gasto más de un 30 % adelantado al plan. Con
 * la forma de `alertasGraves` de tresQ.js ({ clave, tipo, texto }). `filas`: las diarias por campaña. Pura.
 */
export function alertasGravesDiarias({ filas = null, presupuesto = null, hoy = "", moneda = "USD", tipo = "conversacion", nombreResultado = "conversaciones", nombre = "" } = {}) {
  if (!Array.isArray(filas)) return [];
  const cliente = nombre ? ` de ${nombre}` : "";
  const salida = [];
  for (const a of alertasDeDestino({ filas, hoy, tipo, moneda, nombreResultado })) {
    if (a.tipo !== "destino-roto") continue;
    salida.push({ clave: a.clave, tipo: a.tipo, texto: `«${a.campana}»${cliente}: ${a.cifras.clics} clics y ninguna ${singular(nombreResultado)} en ${a.cifras.dias} días (${formatoMoneda(a.cifras.gasto, moneda)} gastados). Revisa el destino: el WhatsApp o la web.` });
  }
  const ritmo = ritmoDeGasto({ filas, presupuesto, hoy, moneda });
  if (ritmo?.grave) {
    salida.push({ clave: ritmo.clave, tipo: "ritmo", texto: `Las campañas${cliente} van ${coma(ritmo.cifras.desvio)} % por encima del plan del mes: ${formatoMoneda(ritmo.cifras.gastado, moneda)} gastados cuando tocaban ${formatoMoneda(ritmo.cifras.ideal, moneda)}; a este paso cierran en ${formatoMoneda(ritmo.cifras.proyeccion, moneda)}.` });
  }
  return salida;
}

/** Desde qué día se lee la serie diaria por campaña: el 1 del mes o `diasAtras` días antes de hoy, lo que sea antes. Pura. */
export function desdeDeLaSerie(hoy, diasAtras = DIAS_SERIE) {
  const primero = `${hoy.slice(0, 7)}-01`;
  const atras = sumarDias(hoy, -diasAtras);
  return atras < primero ? atras : primero;
}

/** ¿Pocos resultados para concluir fuerte? (menos de `POCOS_RESULTADOS`). Pura. */
export const pocosDatos = (resultados) => !(Number(resultados) >= POCOS_RESULTADOS);
