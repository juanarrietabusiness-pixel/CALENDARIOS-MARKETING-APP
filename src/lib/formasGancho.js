// ============================================================
// Las FORMAS DE GANCHO (puro, pequeño y sin importaciones)
//
// El motor de ideas ya decidía la TÁCTICA del gancho (la palanca: precio, prueba, urgencia, empatía…), pero la frase la
// escribía la IA libre, y los ganchos de un mes se parecían todos («¿Sabías que…?», «Descubre…»). Las bibliotecas de
// ganchos del curso de la agencia traen siempre las mismas FAMILIAS de forma —el error común, lo que nadie cuenta, la
// lista con número, el punto de vista, la comparación, la historia, la señal…—; aquí están escritas con palabras
// propias (las listas originales son de terceros, en parte con derechos reservados: no se copia ninguna plantilla ni
// ningún ejemplo), en español neutro y con ejemplos genéricos de la agencia.
//
// Como la composición y la estructura de un carrusel, la forma la escoge el CÓDIGO (`formaPara`, desde `darForma` en
// lib/loteAnuncios.js): una por pieza, que encaje con su nivel de consciencia, su formato (en un video, el primer
// segundo; en un carrusel, la portada; en un post o una historia, el titular y la primera línea), sin repetir la de la
// vecina ni las que el cliente usó hace poco y, si la pieza va a pauta, sólo las que sirven en un anuncio (`pauta`:
// las que por fuerza dicen algo de quien lee, o piden comentarios, no). Las que necesitan un dato real
// (`requiereDato`) sólo si el cliente lo tiene escrito (catálogo con precios o pruebas del estudio).
//
// Tres ejes para variar sin repetir: la FORMA, la VOZ de quien habla (marca, creador, experto, cliente) y el TIPO de las
// cuatro «S» (historia, suposición, ciencia, estadística). La publicación guarda la forma (`post.formaGancho`, el id):
// así no se repite el mes siguiente y, cuando hay muestra, se aprende cuál rinde con cada cliente (`aprenderFormas`).
//
// Y las REGLAS del gancho que se pueden contar (`problemasDelGancho`): una cifra que no está escrita en ninguna parte y
// el gancho de miedo o sensacionalista. Lo personal en un anuncio lo vigila lib/pauta.js (no se repite aquí).
// ============================================================

/** Los cinco niveles de consciencia, por su clave (los de lib/consciencia.js: aquí sin importarlo, para quedar pequeño). */
const TODOS_LOS_NIVELES = Object.freeze(["inconsciente", "problema", "solucion", "producto", "decision"]);

/** Quién habla en el gancho. */
export const VOCES_GANCHO = Object.freeze(["marca", "creador", "experto", "cliente"]);
/** Las cuatro «S»: historia, suposición, ciencia (cómo funciona algo) y estadística (una cifra). */
export const TIPOS_GANCHO = Object.freeze(["historia", "suposicion", "ciencia", "estadistica"]);
/** Dónde vive el gancho: el primer segundo de un video, el titular y la primera línea, o la portada de un carrusel. */
export const DONDE_GANCHO = Object.freeze(["video", "caption", "portada"]);

/**
 * Las formas. `como`: cómo se arma (lo lee la IA); `ejemplo`: uno genérico de la agencia (lo ve la persona, no va al
 * pedido); `niveles`: dónde funciona; `pauta`: false si no va en un anuncio; `requiereDato`: necesita una cifra o un
 * hecho REAL escrito.
 */
export const FORMAS_GANCHO = Object.freeze([
  { id: "error-comun", nombre: "Error común", como: "nombra un error frecuente de quien tiene el problema y deja ver que hay otra forma de hacerlo", ejemplo: "El error que casi todos cometen al escoger [producto]", niveles: ["inconsciente", "problema", "solucion"], voces: ["marca", "experto", "creador"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "nadie-cuenta", nombre: "Lo que nadie cuenta", como: "revela algo del rubro que poca gente explica y que cambia cómo se ve el problema", ejemplo: "Lo que nadie te explica antes de comprar [producto]", niveles: ["problema", "solucion"], voces: ["experto", "creador", "marca"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "si-te-pasa", nombre: "Si te pasa esto", como: "llama por su situación a quien vive el problema, para que se reconozca al instante", ejemplo: "Si cada mañana [situación incómoda], esto es para ti", niveles: ["problema", "solucion"], voces: ["creador", "marca", "experto"], tipo: "suposicion", requiereDato: false, pauta: false, donde: ["video", "caption", "portada"] },
  { id: "punto-de-vista", nombre: "Punto de vista", como: "pone a quien mira dentro de una escena cotidiana, en primera persona («POV: …»)", ejemplo: "POV: [momento cotidiano] y por fin [resultado]", niveles: ["inconsciente", "problema", "solucion"], voces: ["creador", "cliente"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption"] },
  { id: "probe-varios", nombre: "Probé varios por ti", como: "alguien que comparó opciones cuenta con cuál se quedó y por qué", ejemplo: "Comparé [varias opciones] para que tú no tengas que hacerlo", niveles: ["solucion", "producto"], voces: ["creador", "cliente", "experto"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "esto-o-aquello", nombre: "Esto o aquello", como: "pone dos opciones lado a lado (lo de siempre y esto, antes y ahora) sin nombrar ninguna marca", ejemplo: "[Lo de siempre] o [esto]: la diferencia en un minuto", niveles: ["solucion", "producto"], voces: ["marca", "experto", "creador"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "lista", nombre: "Lista con número", como: "promete un número concreto de consejos, razones o pasos que la pieza cumple de verdad", ejemplo: "3 cosas que revisar antes de [acción]", niveles: ["problema", "solucion", "producto"], voces: ["marca", "experto", "creador"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "sabias-que", nombre: "¿Sabías que…?", como: "abre con un hecho del rubro que sorprende, sólo uno que esté escrito en lo que se sabe de la marca", ejemplo: "¿Sabías que [hecho real del rubro]?", niveles: ["inconsciente", "problema", "solucion"], voces: ["experto", "marca"], tipo: "ciencia", requiereDato: true, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "y-si", nombre: "¿Y si…?", como: "plantea un escenario posible en el que el problema ya no existe", ejemplo: "¿Y si [tarea pesada] te tomara la mitad del tiempo?", niveles: ["problema", "solucion", "producto"], voces: ["marca", "creador", "experto"], tipo: "suposicion", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "mito", nombre: "Mito o creencia falsa", como: "desarma una creencia que muchos repiten en el rubro y dice qué es lo cierto", ejemplo: "Creer que [creencia común] te está saliendo caro", niveles: ["problema", "solucion"], voces: ["experto", "marca", "creador"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "historia", nombre: "Historia personal", como: "empieza por un momento concreto vivido por la marca o por un cliente, con un detalle que se pueda ver", ejemplo: "El día que [momento concreto] entendimos [aprendizaje]", niveles: ["inconsciente", "problema"], voces: ["marca", "creador", "cliente"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "tu-senal", nombre: "Esta es tu señal", como: "invita a dar por fin el paso que quien mira viene aplazando", ejemplo: "Esta es tu señal para [paso que se aplaza]", niveles: ["producto", "decision"], voces: ["marca", "creador"], tipo: "suposicion", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "resena", nombre: "Reseña honesta", como: "opinión directa de quien lo usa, con lo bueno y lo que conviene saber, sin exagerar", ejemplo: "Mi opinión sincera de [producto] después de usarlo", niveles: ["producto", "decision"], voces: ["creador", "cliente"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption"] },
  { id: "ven-conmigo", nombre: "Ven conmigo", como: "acompaña a quien mira a hacer algo con el producto o el servicio, paso a paso", ejemplo: "Acompáñame a [tarea] en menos de un minuto", niveles: ["inconsciente", "solucion", "producto"], voces: ["creador", "marca"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption"] },
  { id: "ocasion", nombre: "Regalo u ocasión", como: "conecta el producto con una fecha, un regalo o un momento concreto del año", ejemplo: "Lo que sí conviene regalar para [ocasión]", niveles: ["producto", "decision"], voces: ["marca", "creador"], tipo: "suposicion", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "confesion", nombre: "Confesión", como: "admite una duda, un error o algo que se aprendió por las malas, y lo que se hizo después", ejemplo: "Me equivoqué con [algo] durante años, hasta que…", niveles: ["inconsciente", "problema"], voces: ["marca", "creador"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption"] },
  { id: "de-a-b", nombre: "De aquí a allá", como: "promete el camino de una situación incómoda a una mejor y qué hace falta para recorrerlo", ejemplo: "De [situación incómoda] a [resultado] sin complicarte", niveles: ["solucion", "producto"], voces: ["marca", "experto", "creador"], tipo: "suposicion", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "senales", nombre: "Señales de alerta", como: "cuenta cuántas señales indican que algo necesita atención: en una cosa o una situación, nunca en el cuerpo ni la salud de quien lee", ejemplo: "3 señales de que tu [objeto] ya pide cambio", niveles: ["inconsciente", "problema"], voces: ["experto", "marca"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "participa", nombre: "Pregunta para participar", como: "pide una respuesta fácil en los comentarios (del 1 al 10, esto o aquello)", ejemplo: "Del 1 al 10, ¿qué tanto te pasa [situación]?", niveles: ["inconsciente", "problema", "solucion"], voces: ["marca", "creador"], tipo: "suposicion", requiereDato: false, pauta: false, donde: ["video", "caption"] },
  { id: "desliza", nombre: "Desliza para ver", como: "la portada promete lo que hay en las láminas y pide deslizar para descubrirlo", ejemplo: "Desliza: [lo que se descubre]", niveles: ["problema", "solucion", "producto"], voces: ["marca", "experto"], tipo: "ciencia", requiereDato: false, pauta: true, donde: ["portada"] },
  { id: "cifra-real", nombre: "La cifra real", como: "abre con un número de la marca que está escrito (su precio, sus años, su garantía), nunca uno inventado", ejemplo: "[Cifra real de la marca]: lo que hay detrás", niveles: ["producto", "decision"], voces: ["marca", "experto"], tipo: "estadistica", requiereDato: true, pauta: true, donde: ["video", "caption", "portada"] },
  { id: "resultado-primero", nombre: "El resultado primero", como: "abre con el resultado final y después cuenta cómo se llegó", ejemplo: "Así quedó [resultado]; te cuento cómo", niveles: ["solucion", "producto", "decision"], voces: ["marca", "creador", "cliente"], tipo: "historia", requiereDato: false, pauta: true, donde: ["video", "caption", "portada"] },
]);

/**
 * Los GANCHOS VISUALES del primer segundo de un video (lo que se VE antes de entender nada). `ia`: sirve en un reel
 * hecho con IA (va limpio, sin texto en pantalla); `conProducto`: necesita el producto en cuadro.
 */
export const GANCHOS_VISUALES = Object.freeze([
  { id: "en-uso", nombre: "El producto en uso, de cerca", como: "primerísimo plano del producto mientras se usa, con su sonido real (abrir, servir, deslizar): se entiende sin palabras", ia: true, conProducto: true },
  { id: "transicion", nombre: "Transición rápida", como: "un corte rápido del problema al resultado en el primer segundo, unido por un movimiento de cámara", ia: true, conProducto: false },
  { id: "movimiento", nombre: "Algo que se mueve", como: "el primer plano empieza con algo en movimiento que atrapa la vista (algo que cae, se abre o se transforma) antes de cualquier explicación", ia: true, conProducto: false },
  { id: "pedido-llegado", nombre: "Lo que se pidió y lo que llegó", como: "lo que se esperaba y enseguida lo que llegó de verdad, abriendo el paquete", ia: true, conProducto: true },
  { id: "comentario", nombre: "Responder un comentario", como: "arranca con la pregunta real de un seguidor en pantalla y la respuesta empieza de inmediato", ia: false, conProducto: false },
]);

export const formaDe = (id) => FORMAS_GANCHO.find((f) => f.id === id) ?? null;
export const ganchoVisualDe = (id) => GANCHOS_VISUALES.find((g) => g.id === id) ?? null;
export const nombreDeForma = (id) => formaDe(id)?.nombre ?? "";

/** Dónde vive el gancho de un formato: video (reel), portada (carrusel) o titular y primera línea (lo demás). Pura. */
export const dondeDeFormato = (formato) => (formato === "reel" ? "video" : formato === "carrusel" ? "portada" : "caption");

/** Lo que se dice a la IA de dónde va el gancho, por formato. */
const DONDE_DICHO = Object.freeze({
  video: "el primer segundo del video (lo primero que se dice y se ve)",
  portada: "la portada del carrusel",
  caption: "el titular de la pieza y la primera línea del caption",
  historia: "el texto de la pieza",
  ugc: "el primer tramo de lo que se dice",
});

/**
 * Las formas que sirven para una pieza: por su nivel, su formato, si va a pauta y si hay datos reales. Con pocas, se
 * suelta primero la voz y luego el nivel (nunca la pauta ni el dato: eso es una regla, no una preferencia). Pura.
 */
export function formasPosibles({ nivel = "", formato = "post", pauta = false, hayDatos = false, rostro = false } = {}) {
  const donde = dondeDeFormato(formato);
  const base = FORMAS_GANCHO.filter((f) => f.donde.includes(donde) && (!pauta || f.pauta) && (hayDatos || !f.requiereDato));
  const porNivel = TODOS_LOS_NIVELES.includes(nivel) ? base.filter((f) => f.niveles.includes(nivel)) : base;
  // Una UGC la dice una persona a cámara: mejor las formas de creador o de cliente.
  const porVoz = rostro ? porNivel.filter((f) => f.voces.includes("creador") || f.voces.includes("cliente")) : porNivel;
  if (porVoz.length >= 2) return porVoz;
  if (porNivel.length >= 2) return porNivel;
  return base.length ? base : FORMAS_GANCHO.filter((f) => !pauta || f.pauta);
}

const s0 = (n) => Math.abs(Math.floor(Number(n) || 0));

/**
 * La forma de UNA pieza. `cuenta`: Map id → cuántas veces salió (lo reciente del cliente y lo de este plan); `previa`:
 * la de la vecina; `aprendidas`: { buenas, malas } (`aprenderFormas`). Las malas no salen si quedan otras; con buenas,
 * una pieza de cada dos sale con una (`indice` impar). Entre las que quedan, la menos usada; a igualdad, la que cambia de
 * tipo de las cuatro «S» frente a la vecina, rotando con `semilla + indice`. Pura.
 */
export function formaPara(celda = {}, { formato = "post", hayDatos = false, cuenta = new Map(), previa = "", aprendidas = null, semilla = 0, indice = 0 } = {}) {
  let lista = formasPosibles({ nivel: celda.nivel, formato: celda.formato ?? formato, pauta: Boolean(celda.pauta), hayDatos, rostro: Boolean(celda.rostro) });
  const sinVecina = lista.filter((f) => f.id !== previa);
  if (sinVecina.length) lista = sinVecina;
  const malas = new Set(aprendidas?.malas ?? []);
  const sinMalas = lista.filter((f) => !malas.has(f.id));
  if (sinMalas.length >= 2) lista = sinMalas;
  const buenas = lista.filter((f) => (aprendidas?.buenas ?? []).includes(f.id));
  if (buenas.length && indice % 2 === 1) lista = buenas;
  const usos = (f) => cuenta.get(f.id) ?? 0;
  const minimo = Math.min(...lista.map(usos));
  let menos = lista.filter((f) => usos(f) === minimo);
  const tipoPrevio = formaDe(previa)?.tipo;
  const otroTipo = menos.filter((f) => f.tipo !== tipoPrevio);
  if (otroTipo.length) menos = otroTipo;
  return menos[(s0(semilla) + indice) % menos.length].id;
}

/**
 * Las formas de los 3 ganchos alternativos de una UGC: la de la pieza y dos más, DISTINTAS, para el primer tramo. Pura.
 */
export function formasParaGanchos(celda = {}, { hayDatos = false, semilla = 0, indice = 0 } = {}) {
  const lista = formasPosibles({ nivel: celda.nivel, formato: "reel", pauta: Boolean(celda.pauta), hayDatos, rostro: true });
  const todas = [...lista, ...formasPosibles({ formato: "reel", pauta: Boolean(celda.pauta), hayDatos })];
  const fuera = formaDe(celda.formaGancho) ? [celda.formaGancho] : [];
  for (let k = 0; fuera.length < 3 && k < todas.length * 2; k++) {
    const f = todas[(s0(semilla) + indice + k * 5) % todas.length];
    if (!fuera.includes(f.id)) fuera.push(f.id);
  }
  return fuera.slice(0, 3);
}

/** La línea de la forma en el pedido: «forma del gancho: «Error común» — cómo; va en…». Pura. */
export function lineaDeForma(id, formato = "post", { rostro = false } = {}) {
  const f = formaDe(id);
  if (!f) return "";
  const donde = rostro ? "ugc" : formato === "historia" ? "historia" : dondeDeFormato(formato);
  return `forma del gancho: «${f.nombre}» — ${f.como}; va en ${DONDE_DICHO[donde]}`;
}

/** La línea de los 3 ganchos de una UGC, uno con cada forma. Pura. */
export function lineaDeGanchosUgc(ids = []) {
  const nombres = ids.map(formaDe).filter(Boolean).map((f) => `«${f.nombre}» (${f.como})`);
  return nombres.length ? `ganchos (3 alternativos para el primer tramo, uno con CADA forma, en este orden): ${nombres.join("; ")}` : "";
}

/** La regla del gancho para el pedido (una vez): la forma es la frase; sin cifras inventadas ni miedo. */
export const REGLA_GANCHO = "- El GANCHO (el titular, la primera línea del caption, el primer segundo del video o la portada del carrusel) se escribe CON la forma que dice su pieza: la táctica es la palanca y la forma es la frase, que no choquen. Sin cifras ni porcentajes que no estén escritos, y nada de miedo ni sensacionalismo («podría matarte», «esto debería ser ilegal», «te están mintiendo»).";

/**
 * El gancho visual para el primer plano de un reel: rota con `semilla`; en un reel hecho con IA sólo los que sirven ahí
 * y, sin el producto en cuadro, los que no lo necesitan. Pura.
 */
export function ganchoVisualPara({ semilla = 0, conProducto = false, ia = true } = {}) {
  const lista = GANCHOS_VISUALES.filter((g) => (!ia || g.ia) && (conProducto || !g.conProducto));
  return lista.length ? lista[s0(semilla) % lista.length].id : "";
}

/** «Primer plano: …» para el guion del reel. Pura. */
export const lineaDeGanchoVisual = (id) => (ganchoVisualDe(id) ? `«${ganchoVisualDe(id).nombre}»: ${ganchoVisualDe(id).como}` : "");

/** Una semilla estable de un texto (para escoger siempre lo mismo con la misma idea). Pura. */
export function semillaDeTexto(t) {
  let h = 0;
  for (const c of String(t ?? "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

// ------------------------------------------------------------
// Lo que ya usó el cliente y lo que se aprende
// ------------------------------------------------------------

/** Las formas recientes que manda quien llama, limpias (ids que existen, las últimas 40). Pura. */
export const limpiarFormasRecientes = (lista) => (Array.isArray(lista) ? lista : []).filter((id) => formaDe(id)).slice(-40);

/** Las formas que usó un cliente en sus calendarios, de la más vieja a la más nueva (`days[].posts[].formaGancho`). Pura. */
export function formasDeCalendarios(calendarios = []) {
  const filas = [];
  for (const cal of calendarios ?? []) {
    for (const d of Array.isArray(cal?.days) ? cal.days : []) {
      for (const p of d?.posts ?? []) if (formaDe(p?.formaGancho)) filas.push({ fecha: String(d.date ?? ""), forma: p.formaGancho });
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((f) => f.forma).slice(-40);
}

/** Cuántas veces salió cada forma: Map id → n. Pura. */
export function cuentaDeFormas(ids = []) {
  const m = new Map();
  for (const id of ids) if (formaDe(id)) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Cuántas piezas medidas de una forma hacen falta para decir algo de ella, y cuántas en total. */
export const MIN_PIEZAS_FORMA = 3;
export const MIN_SENALES_FORMA = 6;
/** Una forma «rinde» si su mediana pasa de esto (veces lo normal de la cuenta); «no rinde» por debajo de lo otro. */
export const RINDE_BUENA = 1.2;
export const RINDE_MALA = 0.75;
/** Los días que tarda en madurar una publicación (sus cifras siguen subiendo hasta entonces). */
export const DIAS_MADURAR = 5;

/**
 * Las publicaciones con forma de gancho, ya pasadas `hasta` (AAAA-MM-DD): [{ calendarId, postId, forma }]. `calendarios`:
 * [{ id, days }]. Pura.
 */
export function piezasConForma(calendarios = [], { hasta = "" } = {}) {
  const fuera = [];
  for (const cal of calendarios ?? []) {
    for (const d of Array.isArray(cal?.days) ? cal.days : []) {
      if (hasta && String(d?.date ?? "") > hasta) continue;
      for (const p of d?.posts ?? []) {
        if (p?.id && formaDe(p.formaGancho)) fuera.push({ calendarId: String(cal.id ?? ""), postId: String(p.id), forma: p.formaGancho });
      }
    }
  }
  return fuera;
}

/**
 * Cada pieza con su «rinde» (veces lo normal de su cuenta): por las filas PUBLICADAS de la cola (el post, no su
 * historia) y el «rinde» de cada publicación medida (`rindes`: Map «red:externo_id» → rinde, el de lib/loMejor.js). De
 * las redes en que salió, la que mejor rindió. Las que no se midieron no cuentan. Pura.
 */
export function piezasConRinde(piezas = [], { cola = [], rindes = new Map() } = {}) {
  const porPost = new Map();
  for (const f of cola ?? []) {
    if (f?.estado !== "publicada" || (f.variante && f.variante !== "post") || !f.externo_id) continue;
    const k = `${f.calendar_id}|${f.post_id}`;
    if (!porPost.has(k)) porPost.set(k, []);
    porPost.get(k).push(`${f.red}:${f.externo_id}`);
  }
  return piezas.flatMap((p) => {
    const valores = (porPost.get(`${p.calendarId}|${p.postId}`) ?? []).map((k) => rindes.get(k)).filter((r) => Number.isFinite(r));
    return valores.length ? [{ forma: p.forma, rinde: Math.max(...valores) }] : [];
  });
}

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

/**
 * Qué formas rinden con ESTE cliente: [{ forma, rinde }] → { buenas, malas, porForma, senales, motivo }. Una forma
 * necesita MIN_PIEZAS_FORMA piezas medidas, y hacen falta dos formas así y MIN_SENALES_FORMA piezas en total: con menos,
 * nada (no se aprende de tres publicaciones). Buenas: mediana ≥ RINDE_BUENA (hasta tres, la mejor primero); malas:
 * mediana ≤ RINDE_MALA. Pura.
 */
export function aprenderFormas(piezas = []) {
  const grupos = new Map();
  for (const p of piezas ?? []) {
    if (!formaDe(p?.forma) || !Number.isFinite(p?.rinde)) continue;
    if (!grupos.has(p.forma)) grupos.set(p.forma, []);
    grupos.get(p.forma).push(p.rinde);
  }
  const porForma = [...grupos].map(([forma, v]) => ({ forma, piezas: v.length, mediana: Math.round(mediana(v) * 100) / 100 }));
  const validas = porForma.filter((g) => g.piezas >= MIN_PIEZAS_FORMA);
  const senales = validas.reduce((n, g) => n + g.piezas, 0);
  if (validas.length < 2 || senales < MIN_SENALES_FORMA) {
    return { buenas: [], malas: [], porForma, senales, motivo: `Hace falta que al menos dos formas tengan ${MIN_PIEZAS_FORMA} publicaciones medidas cada una.` };
  }
  const buenas = validas.filter((g) => g.mediana >= RINDE_BUENA).sort((a, b) => b.mediana - a.mediana).slice(0, 3).map((g) => g.forma);
  const malas = validas.filter((g) => g.mediana <= RINDE_MALA).map((g) => g.forma);
  return { buenas, malas, porForma, senales, motivo: "" };
}

// ------------------------------------------------------------
// Las reglas del gancho (las cuenta el código, no la IA)
// ------------------------------------------------------------

const ANTES = "(?:^|[^\\p{L}\\p{N}])";
const DESPUES = "(?=[^\\p{L}\\p{N}]|$)";
/** Un número con separadores («10.000», «1,5») → «10000», «1.5». */
const norma = (n) => {
  const t = String(n).replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return String(Number(t));
};

/** Los números de un texto, normalizados (para saber cuáles están escritos en el catálogo, el estudio o la idea). Pura. */
export function numerosDe(texto) {
  return new Set([...String(texto ?? "").matchAll(/\d[\d.,]*/g)].map((m) => norma(m[0].replace(/[.,]+$/, ""))).filter((x) => x !== "NaN"));
}

const AFIRMA = "clientes|personas|familias|usuarios|pacientes|años|a[ñn]os|rese[ñn]as|estrellas|ventas|pedidos|seguidores|casos|hogares|empresas|alumnos|estudiantes";

/**
 * Las CIFRAS de un gancho que dicen algo (no el «3» de «3 errores»): porcentajes, dinero, multiplicadores («3x», «5
 * veces»), un número con lo que afirma («500 clientes», «10 años», «5 estrellas») y los de tres cifras o más (sin años
 * ni teléfonos). → [{ dicho, numero, norma }]. Pura.
 */
export function cifrasDelGancho(texto) {
  const t = String(texto ?? "").replace(/\+?\d{3,4}[-\s]\d{4}/g, " ");
  const fuera = [];
  const vistos = new Set();
  const poner = (dicho, numero, clave) => {
    const n = norma(numero);
    if (n === "NaN" || vistos.has(clave ?? n)) return;
    vistos.add(clave ?? n);
    fuera.push({ dicho: dicho.trim(), numero: n, norma: clave ?? n });
  };
  for (const m of t.matchAll(/(\d[\d.,]*)\s?%/g)) poner(m[0], m[1], `${norma(m[1])}%`);
  for (const m of t.matchAll(/(?:\$|B\/\.?|USD)\s?(\d[\d.,]*)/gi)) poner(m[0], m[1].replace(/[.,]+$/, ""));
  for (const m of t.matchAll(/(\d[\d.,]*)\s?(?:d[oó]lares|balboas)/gi)) poner(m[0], m[1]);
  for (const m of t.matchAll(new RegExp(`${ANTES}(\\d[\\d.,]*)\\s?(?:x|veces)${DESPUES}`, "giu"))) poner(m[0], m[1], `${norma(m[1])}x`);
  for (const m of t.matchAll(new RegExp(`${ANTES}\\+?\\s?(\\d[\\d.,]*)\\s+(?:m[aá]s\\s+de\\s+)?(?:${AFIRMA})${DESPUES}`, "giu"))) poner(m[0], m[1]);
  for (const m of t.matchAll(/(?<![\d.,:/$])(\d{1,3}(?:[.,]\d{3})+|\d{3,})(?!\d|\s?%)/g)) {
    const n = Number(norma(m[1]));
    if (n >= 1900 && n <= 2099 && !/[.,]/.test(m[1])) continue;
    poner(m[0], m[1]);
  }
  return fuera;
}

/** Lo que asusta o exagera en un gancho (lista corta y estrecha: no casa con un uso normal). La frase, en el grupo 1. */
const MIEDO = [
  new RegExp(`${ANTES}((?:podr[ií]an?|puede|pueden|va a|van a)\\s+matar(?:te|nos|les)|te\\s+(?:puede|podr[ií]a|va\\s+a)\\s+matar)${DESPUES}`, "iu"),
  new RegExp(`${ANTES}((?:esto|eso|est[oa]s|es[oa]s)\\s+(?:deber[ií]an?\\s+(?:ser|estar)\\s+(?:ilegal(?:es)?|prohibid[oa]s?)|es\\s+ilegal))${DESPUES}`, "iu"),
  new RegExp(`${ANTES}(te\\s+(?:est[aá]n|han\\s+estado)\\s+(?:mintiendo|enga[ñn]ando)|nos\\s+(?:est[aá]n\\s+)?(?:mintiendo|mienten|enga[ñn]an))${DESPUES}`, "iu"),
  new RegExp(`${ANTES}((?:peligro|error)\\s+mortal)${DESPUES}`, "iu"),
  new RegExp(`${ANTES}((?:est[aá]s|est[aá]n|estamos)\\s+condenad[oa]s?|(?:vas|van|vamos)\\s+a\\s+morir)${DESPUES}`, "iu"),
  new RegExp(`${ANTES}((?:bombas?|ataque|guerra)\\s+nucleares?)${DESPUES}`, "iu"),
];
/** «El marketing está muerto»: la frase de clickbait (no «la planta está muerta», que es de verdad). */
const MUERTO = /(?:^|[.!?¡¿]\s*)((?:el|la|los|las)\s+([\p{L}]+)(?:\s+[\p{L}]+)?\s+(?:ya\s+)?est[aá]n?\s+muert[oa]s?)\s*[.!…]*\s*$/iu;
const DE_VERDAD = /^(plantas?|flor(?:es)?|pilas?|bater[ií]as?|celular(?:es)?|tel[eé]fonos?|c[eé]sped|[aá]rbol(?:es)?|ra[ií]z|ra[ií]ces|pez|peces|mascotas?|perros?|gatos?|hojas?|semillas?|cultivos?|pantallas?)$/iu;

/** La frase de miedo o sensacionalista de un texto, o "". Pura. */
export function fraseDeMiedo(texto) {
  const t = String(texto ?? "");
  for (const r of MIEDO) {
    const m = r.exec(t);
    if (m) return m[1].trim();
  }
  for (const linea of t.split(/\n/)) {
    const m = MUERTO.exec(linea.trim());
    if (m && !DE_VERDAD.test(m[2])) return m[1].trim();
  }
  return "";
}

/** Lo que es el GANCHO de una publicación: el titular, la primera línea del caption, la del guion y los ganchos de una UGC. Pura. */
export function ganchosDePost(post = {}) {
  const primera = (t) => String(t ?? "").trim().split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const delGuion = primera(post.guion).replace(/^\[[^\]]*\]\s*/, "").replace(/^(?:portada|slide\s*\d+|l[aá]mina\s*\d+)\s*:\s*/i, "").replace(/^VOZ:\s*/i, "").split("|")[0];
  return [
    primera(post.textoPieza),
    primera(post.descripcion || post.script),
    delGuion,
    ...(Array.isArray(post.ganchosUgc) ? post.ganchosUgc : []),
  ].map((t) => String(t ?? "").trim()).filter(Boolean);
}

/**
 * Lo que las reglas ven en el gancho de una publicación → [{ codigo, texto }]: «cifra-gancho» (una cifra que no está en
 * `permitidos`, los números del catálogo, el estudio y la idea; las de `excluir` ya se dijeron en otra regla) y «miedo».
 * No reescribe nada: lo dice. Pura.
 */
export function problemasDelGancho(post = {}, { permitidos = new Set(), excluir = new Set() } = {}) {
  const ganchos = ganchosDePost(post);
  if (!ganchos.length) return [];
  const deLaIdea = numerosDe(`${post.idea ?? ""} ${post.escena ?? ""}`);
  const raras = [];
  for (const g of ganchos) {
    for (const c of cifrasDelGancho(g)) {
      if (permitidos.has(c.numero) || deLaIdea.has(c.numero) || excluir.has(c.norma) || raras.some((x) => x.norma === c.norma)) continue;
      raras.push(c);
    }
  }
  const salida = [];
  if (raras.length) {
    salida.push({ codigo: "cifra-gancho", texto: `El gancho dice ${raras.map((c) => `«${c.dicho}»`).join(", ")}, que no está en el catálogo, el estudio de mercado ni la idea: ¿es una cifra inventada? Sólo valen las que estén escritas.` });
  }
  const miedo = ganchos.map(fraseDeMiedo).find(Boolean);
  if (miedo) salida.push({ codigo: "miedo", texto: `El gancho asusta o exagera («${miedo}»): aleja a quien lee y Meta rechaza ese tono en los anuncios. Cuéntalo sin miedo.` });
  return salida;
}
