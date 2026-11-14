// ============================================================
// EL PLAN DE CAMPAÑAS: el ciclo de ventas entero como campañas para montar en el Ads Manager (puro)
//
// La agencia MONTA las campañas en el Ads Manager (la creación por la API de la app quedó congelada); el calendario le
// da la campaña COMPLETA sugerida y una guía para montarla (C.1–C.3 de docs/propuesta-curso-campanas.md). Las ideas del
// curso de campañas (módulos 5 y 5.7), con palabras propias: la licencia de su método no deja copiar su texto.
//
//   · `planDelCiclo()`   — las campañas: presentación y evaluación (cuenta nueva) o las cuatro (con historial), y la de
//                          TEMPORADA si el mes trae oferta o fecha comercial (con su presupuesto aparte y sus fechas).
//                          Cada una con su objetivo (cicloDe), su presupuesto (la inversión del mes de los números del
//                          negocio × el reparto del Manual), dónde va el presupuesto (campaña o conjuntos, como el Excel
//                          de estrategia de la agencia), sus conjuntos con públicos y exclusiones concretos, los tipos
//                          de arte y niveles que tocan, cuántos anuncios, la configuración y los avisos.
//   · `candidatasDelCalendario()` y `conPiezas()` — qué pieza va en cada anuncio: primero lo PUBLICADO que mejor
//                          funcionó en orgánico (la misma cuenta de «Lo mejor», `rindesDePropias`) si su texto sirve
//                          para pauta, luego lo marcado «Va a pauta» con esa etapa; lo que falte, a producir. Dos
//                          anuncios con el mismo tipo de arte y la misma composición son UNO para Meta: se avisa y no
//                          se ponen dos.
//   · `guiaDeMontaje()`  — en el orden del Ads Manager (públicos → campaña → conjunto → anuncio), cada paso con lo que
//                          se copia y su casilla (`id` estable: el progreso se guarda por él).
//   · `hojasDelPlan()`   — las 5 hojas del Excel de estrategia de la agencia, llenas (lib/xlsx.js las empaqueta).
//   · `planATextoCiclo()`— todo en texto, para copiarlo (y lo que lee Claude por `plan_de_campanas`).
//
// Los NOMBRES siguen la nomenclatura del Manual con `{etapa}`: así la revisión de lo que corre (la de las 3 Q) sabe de
// qué etapa es cada campaña por su nombre. Si el Manual guardado no lleva `{etapa}` (uno de antes), se pone detrás del
// cliente.
// ============================================================

import { ETAPAS_CICLO, etapaCiclo, idEtapaCiclo, nombreEtapaCiclo, tipoNegocioDe, destinoNegocioDe } from "./cicloVentas.js";
import { cicloDe } from "./cicloNegocio.js";
import { tipoArteDe, limpiarTiposArte, tipoArteDePost } from "./tiposArte.js";
import { maletasQueFaltan, avisoDeMaletas } from "./maletas.js";
import { objetivo as objetivoDelNegocio, limpiarNegocio, numero } from "./numerosNegocio.js";
import { limpiarManual, nombreConPlantilla } from "./estratega.js";
import { limpiarReparto, limpiarAnunciosPorConjunto, repartoDelCliente } from "./manualCiclo.js";
import { nivelesParaHuecos, cuentaDeNiveles, esNivelFrio, NIVELES_DE_ETAPA } from "./textosNivel.js";
import { limpiarQue, limpiarAnunciosPlan, idDeHueco, huecoDeId, PARA_QUE_CAMPANA, faltanTextos, textosATexto } from "./anunciosPlan.js";
import { limpiarPauta, limpiarAnuncio, problemasDePauta, deLaOferta, NIVEL_POR_ETAPA, nombreDeBoton, botonPorDefecto, primeraLinea } from "./pauta.js";
import { nombreDeNivel } from "./consciencia.js";
import { fechasDelMes } from "./fechasEspeciales.js";
import { sumarDias, diasEntre } from "./agenda.js";
import { limpiarEstudio, productosActivos, angulosDeProducto } from "./estudioMercado.js";
import { numeroMagicoDelCliente } from "./numerosNegocio.js";
import { rindesDePropias } from "./loMejor.js";

/** El presupuesto mensual se reparte en 30 días para el diario (como el Excel de la agencia). */
export const DIAS_DEL_MES = 30;
/** Por debajo de esto al día, un conjunto casi no sale (Meta pide alrededor de 1 $ diario por conjunto). */
export const MIN_DIARIO = 1;
/** Lo publicado que se propone pautar: lo que rindió al menos esto contra la mediana de su cuenta. */
export const RINDE_PARA_PAUTA = 1.2;
/** La campaña de temporada empieza unos días antes de su fecha. */
export const DIAS_ANTES_TEMPORADA = 7;
/** Lo que se sugiere para la temporada (aparte del reparto): este % de la inversión del mes, en 30 días. */
export const PCT_TEMPORADA = 20;
/** De cuántos meses atrás se buscan piezas (además del del plan). */
export const MESES_DE_PIEZAS = 3;
/** Sin número mágico, por debajo de esto al día un conjunto rinde muy poco (aviso de presupuesto bajo). */
export const DIARIO_POCO = 3;
/** Con número mágico: menos de esto a la semana (uno al día) y Meta casi no aprende. */
export const RESULTADOS_SEMANA_MIN = 7;
/** Lo que Meta pide para salir de la fase de aprendizaje: unos 50 resultados a la semana en cada conjunto. */
export const RESULTADOS_SEMANA_APRENDER = 50;
/** El público del ángulo de venta que pide cada etapa: frío en presentación; tibio en las demás. */
export const PUBLICO_DE_ETAPA = Object.freeze({ presentacion: "frio", evaluacion: "tibio", conversion: "tibio", ascension: "tibio", temporada: "tibio" });

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const r2 = (n) => Math.round(n * 100) / 100;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
/** «3,5» o «12» (las cifras de los avisos). */
const redondo = (x) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10).replace(".", ","));
/** Una de cada lista antes que la segunda de ninguna. */
const intercalar = (listas) => {
  const salida = [];
  for (let i = 0; listas.some((l) => i < l.length); i++) for (const l of listas) if (i < l.length) salida.push(l[i]);
  return salida;
};
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Un texto cortado en una PALABRA, con «…» si se cortó (nunca «busca información antes .» ni «Velvée — t»). Lo de
 * los nombres del Ads Manager y los textos del público pasa por aquí: `nombreConPlantilla` corta cada dato a 60
 * caracteres a media palabra, así que se le da ya cortado. Pura.
 */
export function enPalabra(t, n) {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  const c = s.slice(0, Math.max(1, n - 1));
  const i = c.lastIndexOf(" ");
  const base = (i > n * 0.5 ? c.slice(0, i) : c).replace(/[\s,;:.·—–-]+$/u, "");
  return `${base}…`;
}

/** Lo que va detrás de una edad y NO es una edad («de 30 a 45 minutos», «de 20 a 30 kg»). */
const NO_ES_EDAD = /^\s*(?:min|minutos|h|horas|dias|semanas|meses|kg|kilos|g|gramos|cm|m|metros|m2|%|personas|unidades|piezas|libras|lb|dolares|usd|productos|pedidos|veces|cuotas)\b/;

/**
 * La EDAD que dice un texto del público («Mamás de 30 a 45», «entre 25 y 38 años», «25-38 años», «mayores de 40»):
 * { min, max } (de 18 a 65; 65 es «65+» en el Ads Manager) o null si no dice ninguna. Lo que va detrás no puede ser
 * otra unidad («de 30 a 45 minutos» no es una edad). Pura.
 */
export function edadDeTexto(texto) {
  const t = sinTildes(texto);
  const valida = (a, b) => {
    const min = Math.max(18, a);
    const max = Math.min(65, b);
    return a >= 13 && b <= 99 && min < max ? { min, max } : null;
  };
  for (const re of [/\b(?:de|entre)\s+(\d{2})\s*(?:anos\s*)?(?:a|y|-|–|hasta)\s*(\d{2})\b(.{0,12})/g, /\b(\d{2})\s*(?:-|–|a)\s*(\d{2})\s*anos\b()/g]) {
    for (const m of t.matchAll(re)) {
      if (m[3] && NO_ES_EDAD.test(m[3]) && !/^\s*anos/.test(m[3])) continue;
      const e = valida(Number(m[1]), Number(m[2]));
      if (e) return e;
    }
  }
  const mayor = /\b(?:mayores de|mas de|desde los)\s+(\d{2})\s*(?:anos)?\b(.{0,10})/.exec(t);
  if (mayor && !(mayor[2] && NO_ES_EDAD.test(mayor[2]) && !/^\s*anos/.test(mayor[2]))) return valida(Number(mayor[1]), 65);
  return null;
}

/** «30-45» o «40-65+» (el hueco `{edad}` del nombre del conjunto). Pura. */
export const textoEdad = (e) => (e ? `${e.min}-${e.max >= 65 ? "65+" : e.max}` : "");
/** «de 30 a 45 años» o «de 40 años en adelante». Pura. */
const edadDicha = (e) => (e ? (e.max >= 65 ? `de ${e.min} años en adelante` : `de ${e.min} a ${e.max} años`) : "");

/** La clave de un ángulo de venta: «producto:ángulo». Pura. */
export const claveAngulo = (a) => (a?.productoId && a?.id ? `${a.productoId}:${a.id}` : "");
const refAngulo = (a, extra = {}) => ({ productoId: a.productoId, id: a.id, nombre: a.nombre, ...(a.publico ? { publico: a.publico } : {}), ...extra });

/**
 * El ÁNGULO DE VENTA de cada hueco de una campaña: de los del estudio aprobado (`pool`), los que le hablan al público de
 * su etapa (frío en presentación, tibio en las demás) y los que no dicen a quién; los menos usados por las otras
 * campañas primero (`uso`: clave → veces), así cada campaña prueba ángulos distintos. Sin ángulos, null en cada hueco.
 * Pura.
 */
export function angulosParaCampana(pool = [], etapa = "", n = 0, uso = new Map()) {
  const quiere = PUBLICO_DE_ETAPA[etapa] ?? "";
  const aptos = [...pool.filter((a) => a.publico === quiere), ...pool.filter((a) => !a.publico)];
  if (!aptos.length) return Array(n).fill(null);
  const orden = aptos.map((a, i) => ({ a, i, u: uso.get(claveAngulo(a)) ?? 0 })).sort((x, y) => x.u - y.u || x.i - y.i).map((x) => x.a);
  return Array.from({ length: n }, (_, i) => {
    const a = orden[i % orden.length];
    uso.set(claveAngulo(a), (uso.get(claveAngulo(a)) ?? 0) + 1);
    return refAngulo(a);
  });
}

/**
 * Lo que se propone cuando el presupuesto no da (`bajas`: las campañas con el aviso de presupuesto bajo): menos
 * conjuntos en presentación, evaluación en uno solo, este mes sólo presentación y evaluación, o cuánto subir. Con los
 * números de su plan. Pura.
 */
function propuestaDePresupuesto(bajas, { inversion, delCliente, magico, moneda, escogidas = [] }) {
  const partes = [];
  // Lo mínimo al día por conjunto: el número mágico de cada día (siete a la semana) o, sin él, DIARIO_POCO.
  const umbral = magico ? (magico * RESULTADOS_SEMANA_MIN) / 7 : DIARIO_POCO;
  const pre = bajas.find((c) => c.id === "presentacion");
  if (pre && pre.conjuntos.length > 1 && pre.presupuesto.diario) {
    const k = Math.max(1, Math.min(pre.conjuntos.length - 1, Math.floor(pre.presupuesto.diario / umbral)));
    partes.push(`presentación con ${k === 1 ? "un solo conjunto" : `${k} conjuntos`} en vez de ${pre.conjuntos.length}: cada uno tendría ${dinero(r2(pre.presupuesto.diario / k), moneda)} al día`);
  }
  if (bajas.some((c) => c.id === "evaluacion" && c.conjuntos.length > 1)) {
    partes.push("evaluación con un solo conjunto, «Interactuaron · 90 días» (ya incluye a los de 30), sin excluir a los de 30");
  }
  const otras = bajas.filter((c) => c.id === "conversion" || c.id === "ascension");
  if (otras.length && inversion && !escogidas.length) {
    const r = repartoDelPlan(delCliente.reparto, "nueva");
    const diaDe = (id) => dinero(r2((inversion * (r.find((x) => x.etapa === id)?.pct ?? 0)) / 100 / DIAS_DEL_MES), moneda);
    partes.push(`este mes, sólo presentación y evaluación (en «¿Qué vas a hacer?», escoge esas dos): con la misma inversión, presentación tendría ${diaDe("presentacion")} al día y evaluación ${diaDe("evaluacion")}; ${lista(otras.map((c) => c.nombreEtapa.toLowerCase()))}, cuando haya más presupuesto`);
  }
  const falta = bajas.reduce((s, c) => {
    const unidades = c.presupuesto.en === "conjunto" ? c.conjuntos.length : 1;
    return s + Math.max(0, umbral * unidades * c.presupuesto.dias - (c.presupuesto.mensual ?? 0));
  }, 0);
  const subir = falta > 0 ? `O sube la inversión unos ${dinero(Math.ceil(falta), moneda)} al mes para que ${bajas.length === 1 ? "esa campaña llegue" : "esas campañas lleguen"} a ${dinero(r2(umbral), moneda)} al día por conjunto.` : "";
  const dicho = partes.length ? `${partes.map((p, i) => `${i + 1}) ${p}`).join("; ")}.` : "junta conjuntos o etapas.";
  return { codigo: "presupuesto-juntar", grave: false, texto: `Para que el dinero rinda: ${dicho}${subir ? ` ${subir}` : ""}` };
}

/** «2026-11» → { year, month (0-11) } o null. Pura. */
export function mesDelPlan(mes) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(mes ?? ""));
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1, texto: `${m[1]}-${m[2]}` } : null;
}
/** «Noviembre 2026». Pura. */
export const nombreDelMes = (mes) => {
  const m = mesDelPlan(mes);
  return m ? `${MESES[m.month]} ${m.year}` : "";
};
/** «20 nov». Pura. */
export const diaCorto = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(String(f ?? "")) ? `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}` : "");
const ultimoDia = (m) => `${m.texto}-${String(new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate()).padStart(2, "0")}`;

// ------------------------------------------------------------
// Los públicos personalizados que se crean en el Ads Manager
// ------------------------------------------------------------

/**
 * Los públicos del ciclo, por su id. `que`: a quién reúne; `como`: cómo se crea en el Ads Manager (Públicos → Crear
 * público). `web`: sólo con una web con píxel.
 */
export const PUBLICOS_CICLO = Object.freeze([
  { id: "interaccion-30", nombre: "Interactuaron · 30 días", que: "Quien interactuó con la página de Facebook o la cuenta de Instagram, o vio 10 segundos o más de un video, en los últimos 30 días.",
    como: "Público personalizado con fuentes de Meta: uno de la página de Facebook, uno de la cuenta de Instagram y uno de video (10 s), cada uno con 30 días de retención. En el conjunto se escogen los tres." },
  { id: "interaccion-90", nombre: "Interactuaron · 90 días", que: "Lo mismo, en los últimos 90 días.",
    como: "Igual que el de 30 días, con 90 días de retención." },
  { id: "mensajes-30", nombre: "Escribieron · 30 días", que: "Quien envió un mensaje a la página o a la cuenta de Instagram en los últimos 30 días.",
    como: "Público personalizado → página de Facebook y cuenta de Instagram → «personas que enviaron un mensaje» → 30 días." },
  { id: "visitas-30", nombre: "Visitaron la web · 30 días", web: true, que: "Quien visitó la web en los últimos 30 días.",
    como: "Público personalizado → sitio web (el píxel) → todos los visitantes, 30 días." },
  { id: "carrito-30", nombre: "Dejaron el carrito · 30 días", web: true, que: "Quien agregó al carrito y no compró en los últimos 30 días.",
    como: "Público personalizado → sitio web → el evento de agregar al carrito en 30 días, sin quienes compraron." },
  { id: "clientes", nombre: "Lista de clientes", que: "Quien ya compró: la lista con sus correos y teléfonos.",
    como: "Público personalizado → lista de clientes → subir el archivo (correo, teléfono y nombre). Conviene ponerla al día cada mes." },
  { id: "similares-1", nombre: "Similares 1 %", que: "Gente parecida a quien ya interactuó (o a la lista de clientes).",
    como: "Crear público similar → origen: «Interactuaron · 90 días» (o la lista de clientes) → el país → 1 %. Sólo vale con más de 1.500 personas en el origen." },
]);
const PUBLICO = new Map(PUBLICOS_CICLO.map((p) => [p.id, p]));
export const publicoDe = (id) => PUBLICO.get(id) ?? null;
const nombresDe = (ids) => ids.map((id) => PUBLICO.get(id)?.nombre).filter(Boolean);

// ------------------------------------------------------------
// Los conjuntos de cada etapa
// ------------------------------------------------------------

/**
 * Dónde va el presupuesto en cada campaña, como las hojas del Excel de estrategia de la agencia: Presentación, en cada
 * conjunto (su columna «Presupuesto Diario» está en el grupo del conjunto); las demás —también Conversión y la Campaña
 * Especial—, en la campaña (la columna «Presupuesto diario» va en el grupo de la campaña).
 */
export const PRESUPUESTO_EN = Object.freeze({ presentacion: "conjunto", evaluacion: "campana", conversion: "campana", ascension: "campana", temporada: "campana" });
/** Cuántos anuncios por conjunto como mucho en cada etapa (el curso: evaluación, 4; ascensión, 3: su presupuesto es menor). */
export const TOPE_ANUNCIOS = Object.freeze({ evaluacion: 4, ascension: 3 });
/** Los anuncios por conjunto de una campaña: los del Manual, con el tope de su etapa. Pura. */
export const anunciosDeEtapa = (etapa, delManual) => Math.min(limpiarAnunciosPorConjunto(delManual), TOPE_ANUNCIOS[etapa] ?? 99);

/**
 * Los conjuntos de una etapa. Presentación: 3 públicos (con historial, intereses + similares + Advantage+; en una
 * cuenta nueva, dos de intereses —uno por perfil del estudio— y Advantage+ sólo de prueba). Evaluación: quien
 * interactuó en 30 y en 90 días (el de 90 sin los de 30: si no, compiten), sin Advantage+. Conversión: quien escribió (o
 * dejó el carrito). Ascensión: la lista de clientes. Temporada: quien ya conoce la marca y la lista.
 *
 * La EDAD (`edad`: { min, max } o null) sólo la llevan los de intereses: la del perfil del estudio («Mamás de 30 a 45»)
 * o, si no la dice, la del público del producto (`edadPublico`). Los demás van con la edad abierta (un público de quien
 * ya interactuó no se recorta) y su nombre no lleva edad: decir «18-65+» de todos no decía nada. Pura.
 */
export function conjuntosDeEtapa(etapa, { nueva = false, web = false, perfiles = [], rubro = "", objetivo = "", edadPublico = null } = {}) {
  // La tienda en línea (objetivo de ventas) tiene carrito; un servicio que capta con un formulario, no.
  const tienda = web && objetivo !== "clientes";
  const sobre = rubro ? ` relacionados con ${rubro.toLowerCase()}` : " relacionados con lo que se vende";
  const fria = { publicos: web ? ["interaccion-90", "visitas-30", "clientes"] : ["interaccion-90", "clientes"], nota: NOTA_EXCLUSIONES };
  const c = (id, tipo, nombre, publico, excluye, nota = "", edad = null) => ({ id, tipo, nombre, publico, excluye, edad, ...(nota ? { nota } : {}) });
  if (etapa === "presentacion") {
    const intereses = (n, perfil) => c(`c${n}`, "intereses", perfil ? `Intereses · ${enPalabra(perfil.nombre, 40)}` : nueva ? `Intereses · grupo ${n}` : "Intereses",
      { texto: `Segmentación detallada con intereses amplios${sobre}${perfil?.quien ? `, pensados para ${enPalabra(perfil.quien, 160).replace(/\.$/, "")}` : ""}.`, publicos: [], advantage: false }, fria,
      "", edadDeTexto(perfil?.quien) ?? edadPublico);
    if (nueva) {
      return [
        intereses(1, perfiles[0]),
        intereses(2, perfiles[1]),
        c("c3", "advantage", "Advantage+ · prueba", { texto: "Público Advantage+: Meta busca a quién mostrarlo (los intereses van sólo de sugerencia).", publicos: [], advantage: true }, fria,
          "En una cuenta nueva, Advantage+ va sólo como conjunto de prueba: a los 7 días se compara con los de intereses."),
      ];
    }
    return [
      intereses(1, perfiles[0]),
      c("c2", "similares", "Similares 1 %", { texto: "Público similar al 1 % de quien ya interactuó.", publicos: ["similares-1"], advantage: false }, fria,
        "Sólo con más de 1.500 personas en el público de origen; si no llega, usa otro grupo de intereses."),
      c("c3", "advantage", "Advantage+", { texto: "Público Advantage+: Meta busca a quién mostrarlo (los intereses van sólo de sugerencia).", publicos: [], advantage: true }, fria,
        "Con historial y presupuesto, la segmentación abierta suele rendir igual o mejor: puede ir en lugar de éste."),
    ];
  }
  const sinAdvantage = "Sin público Advantage+: sólo los públicos de aquí (edad y género abiertos).";
  if (etapa === "evaluacion") {
    // En la web, quien visitó la web ya es de conversión: evaluación le habla a quien interactuó o vio videos, y lo
    // excluye. «Escribieron» no existe en la web.
    const base = web ? ["visitas-30", "clientes"] : ["mensajes-30", "clientes"];
    // El de 90 días CONTIENE al de 30: sin excluirlos, los dos conjuntos pujan por la misma persona y se encarecen.
    return [
      c("c1", "interaccion", "Interactuaron · 30 días", { texto: `Quien interactuó con la página o la cuenta, o vio tus videos, en los últimos 30 días. ${sinAdvantage}`, publicos: ["interaccion-30"], advantage: false }, { publicos: base }),
      c("c2", "interaccion", "Interactuaron · 90 días", { texto: `Quien interactuó en los últimos 90 días, sin los de los últimos 30 (esos ya están en el conjunto 1). ${sinAdvantage}`, publicos: ["interaccion-90"], advantage: false },
        { publicos: ["interaccion-30", ...base], nota: "Quien interactuó en los últimos 30 días se excluye aquí porque ya lo ve el conjunto 1: así los dos conjuntos no compiten por la misma persona." }),
    ];
  }
  if (etapa === "conversion") {
    return [c("c1", "mensajes", tienda ? "Carrito y visitas · 30 días" : web ? "Visitaron la web · 30 días" : "Escribieron · 30 días", {
      texto: tienda ? `Quien dejó algo en el carrito o visitó la web en los últimos 30 días. ${sinAdvantage}`
        : web ? `Quien visitó la web (y vio el formulario) en los últimos 30 días. ${sinAdvantage}`
          : `Quien escribió por mensaje en los últimos 30 días (y, si se quiere, quien interactuó con un anuncio: compite con evaluación). ${sinAdvantage}`,
      publicos: tienda ? ["carrito-30", "visitas-30"] : web ? ["visitas-30"] : ["mensajes-30"], advantage: false,
    }, { publicos: ["clientes"] }, "Si estos públicos son pequeños (menos de unas 1.000 personas) o el presupuesto es poco, todavía no conviene hacerla.")];
  }
  if (etapa === "ascension") {
    return [c("c1", "clientes", "Lista de clientes", { texto: `La lista de clientes (quien ya compró). ${sinAdvantage}`, publicos: ["clientes"], advantage: false },
      { publicos: [], nota: "Sin exclusiones, salvo que se anuncie a quien compró un producto concreto." })];
  }
  // La temporada: una oferta con fecha cierra mejor con quien ya conoce la marca.
  return [c("c1", "temporada", "Ya te conocen · 90 días", { texto: "Quien interactuó en los últimos 90 días y la lista de clientes: la oferta con fecha cierra mejor con quien ya conoce la marca.", publicos: ["interaccion-90", "clientes"], advantage: false },
    { publicos: [], nota: "Sin exclusiones: es la misma gente de evaluación (y de ascensión). Mientras dure la oferta, esas personas pueden ver anuncios de las dos campañas; no subas el presupuesto de evaluación esos días." },
    "Si el presupuesto lo aguanta, un segundo conjunto con intereses amplios lleva la oferta a gente nueva.")];
}

/**
 * Por qué presentación excluye a quien ya conoce la marca, dicho para quien empieza: así no se paga dos veces por la
 * misma persona (de ella se encarga evaluación). Si los anuncios de las dos campañas son casi iguales, da lo mismo
 * quién vea cuál y se pueden quitar (el público queda más grande).
 */
export const NOTA_EXCLUSIONES = "Se excluye a quien ya te conoce (interactuó, escribió o compró) para no pagar dos veces por la misma persona: de ellos se encarga la campaña de evaluación. Si los anuncios de presentación y de evaluación son casi iguales, no importa que alguien que ya te conoce los vea: entonces puedes quitar estas exclusiones y el público queda más grande.";

// ------------------------------------------------------------
// La temporada
// ------------------------------------------------------------

/** ¿Es una fecha para vender? (no un feriado sin más ni una delicada). */
const vende = (f) => !f.delicada && (f.tipo === "comercial" || f.tipo === "propia" || f.destacada);

/**
 * La campaña de TEMPORADA que propone el mes (decisión 12): las fechas comerciales del cliente en ese mes (sus fechas
 * especiales, sin las delicadas) y la oferta del calendario (`offers`, `promoCode`, `campaign`). Con fecha, empieza
 * DIAS_ANTES_TEMPORADA días antes de la primera y termina con la última; con sólo la oferta, el mes entero. Nunca antes
 * de hoy. Null si el mes no trae nada (o ya pasó). → { nombre, motivo, fechas: [{ fecha, nombre }], inicio, fin, dias,
 * ofertas, codigo }. Pura.
 */
export function temporadaDelMes({ mes, calendario = null, fechasEspeciales = null, hoy = "" } = {}) {
  const m = mesDelPlan(mes);
  if (!m) return null;
  const fechas = fechasDelMes(m.year, m.month, fechasEspeciales).filter(vende);
  const ofertas = corto(calendario?.offers, 400);
  const codigo = corto(calendario?.promoCode, 40);
  const campana = corto(calendario?.campaign, 120);
  if (!fechas.length && !ofertas && !codigo) return null;
  const primero = `${m.texto}-01`;
  let inicio = fechas.length ? sumarDias(fechas[0].fecha, -DIAS_ANTES_TEMPORADA) : primero;
  if (inicio < primero) inicio = primero;
  const fin = fechas.length ? fechas[fechas.length - 1].fecha : ultimoDia(m);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hoy) && inicio < hoy) inicio = hoy;
  if (fin < inicio) return null;
  const nombreFechas = lista([...new Set(fechas.map((f) => f.nombre))]);
  return {
    nombre: enPalabra(nombreFechas || campana || "La oferta del mes", 80),
    motivo: [nombreFechas && `Fechas del mes: ${nombreFechas}`, ofertas && `la oferta: ${ofertas}`, codigo && `código ${codigo}`].filter(Boolean).join(" · "),
    fechas: fechas.map((f) => ({ fecha: f.fecha, nombre: f.nombre })),
    inicio, fin, dias: diasEntre(inicio, fin) + 1, ofertas, codigo,
  };
}

// ------------------------------------------------------------
// El plan
// ------------------------------------------------------------

const RENDIMIENTO = {
  interaccion: "Maximizar el número de conversaciones",
  ventas: "Maximizar el número de conversiones (compras)",
  clientes: "Maximizar el número de clientes potenciales",
  reconocimiento: "Maximizar el alcance",
};

/** La plantilla de la campaña con `{etapa}`: si el Manual guardado no lo lleva, va detrás del cliente. Pura. */
export function plantillaConEtapa(plantilla) {
  const p = String(plantilla ?? "").trim() || "{cliente} · {etapa} · {objetivo} · {mes}";
  if (p.includes("{etapa}")) return p;
  return p.includes("{cliente}") ? p.replace("{cliente}", "{cliente} · {etapa}") : `{etapa} · ${p}`;
}

/** Las etapas que tocan a la cuenta: nueva → presentación y evaluación; con historial (o sin decir) → las cuatro. */
export const etapasDeLaCuenta = (cuenta) => (cuenta === "nueva" ? ETAPAS_CICLO.filter((e) => e.id === "presentacion" || e.id === "evaluacion") : ETAPAS_CICLO);

/**
 * El reparto (el del Manual o el del cliente a mano) sobre las etapas que tocan, que vuelve a sumar 100 (75/25 en una
 * cuenta nueva). `soloIds`: las que escogió la agencia en «¿Qué vas a hacer?» (vacío: las de la cuenta). Pura.
 */
export function repartoDelPlan(reparto, cuenta, soloIds = null) {
  const r = limpiarReparto(reparto);
  const etapas = soloIds?.length ? ETAPAS_CICLO.filter((e) => soloIds.includes(e.id)) : etapasDeLaCuenta(cuenta);
  const suma = etapas.reduce((s, e) => s + r[e.id], 0) || 1;
  return etapas.map((e) => ({ etapa: e.id, nombre: e.nombre, pct: Math.round((r[e.id] / suma) * 1000) / 10 }));
}

/**
 * El plan del ciclo (C.1). `negocio`: los números del negocio (limpios o no); `numeros`: { tasaDefecto?, inversion? }
 * (una inversión del mes escrita a mano manda sobre la de la meta); `manual`: el Manual de campañas; `reparto`: el del
 * cliente A MANO (`anuncios_clientes.reparto`; si no vale, el del Manual); `mes`: «AAAA-MM»; `hoy`: AAAA-MM-DD (un plan
 * del mes en curso arranca HOY, no el 1); `calendario`: el de ese mes ({ offers, promoCode, campaign, opciones });
 * `kit`: el de la marca (sus tipos de arte); `estudio`: el estudio de mercado (aprobado o borrador); `catalogo`;
 * `temporada`: la de `temporadaDelMes` (o null) y `ajustes.temporada` ({ incluir, diario }) lo que decidió la agencia de
 * ella; `ajustes.que`: «¿Qué vas a hacer?» (lib/anunciosPlan.js: qué campañas, qué productos y lo que quiere lograr);
 * `cliente`: { nombre, rubro }; `estudioAprobado`: el estudio APROBADO (sólo de él salen los ÁNGULOS DE VENTA de cada
 * hueco; sin pasarlo, el `estudio` si está aprobado). Pura.
 */
export function planDelCiclo({
  negocio = null, numeros = {}, manual = null, reparto: repartoPropio = null, mes = "", hoy = "", calendario = null, kit = null, estudio = null,
  estudioAprobado, catalogo = null, temporada = null, ajustes = {}, cliente = {}, moneda = "USD",
} = {}) {
  const n = limpiarNegocio(negocio);
  const m = limpiarManual(manual ?? {});
  const que = limpiarQue(ajustes?.que);
  const avisos = [];
  const tipo = tipoNegocioDe(n.tipo)?.id ?? "";
  const destino = destinoNegocioDe(n.destino)?.id ?? "";
  if (!tipo || !destino) {
    avisos.push({ codigo: "sin-perfil", grave: false, texto: `Falta ${lista([!tipo && "el tipo de negocio", !destino && "a dónde llevan los anuncios"].filter(Boolean))}: se arma como ${tipo ? tipoNegocioDe(tipo).nombre.toLowerCase() : "productos"} por ${destino === "web" ? "la web" : "WhatsApp"}. Se cambia en Marca → Números del negocio.` });
  }
  const cuenta = n.cuenta === "nueva" ? "nueva" : n.cuenta === "historial" ? "historial" : "";
  const ciclo = cicloDe(tipo || "productos", destino || "whatsapp", { cuenta });
  const web = ciclo.destino === "web";
  if (!cuenta) avisos.push({ codigo: "sin-cuenta", grave: false, texto: "No se sabe si la cuenta publicitaria es nueva o tiene historial: se arma con las cuatro etapas. Una cuenta nueva empieza sólo con presentación y evaluación." });
  else if (cuenta === "nueva") avisos.push({ codigo: "cuenta-nueva", grave: false, texto: "Cuenta nueva: presentación y evaluación primero. Conversión y ascensión, cuando haya públicos (unas 1.500 personas que interactuaron) y una lista de clientes." });
  if (ciclo.nota) avisos.push({ codigo: "nota-ciclo", grave: false, texto: ciclo.nota });

  // La inversión del mes: la escrita a mano; si no, la de la meta (la calculadora de presupuesto); si no, el
  // presupuesto del mes de los números (escrito o leído de Meta).
  const o = objetivoDelNegocio(n, { tasaDefecto: numeros?.tasaDefecto });
  const aMano = numero(numeros?.inversion);
  let inversion = null;
  let inversionDe = null;
  if (aMano > 0) { inversion = r2(aMano); inversionDe = "escrita"; }
  else if (o.inversion > 0) { inversion = r2(o.inversion); inversionDe = "meta"; }
  else if (n.presupuesto?.valor > 0) { inversion = r2(n.presupuesto.valor); inversionDe = n.presupuesto.origen === "meta" ? "meta-ads" : "presupuesto"; }
  if (!inversion) {
    avisos.push({ codigo: "sin-numeros", grave: true, texto: "Sin los números del negocio (la meta de ventas, el ticket y el % a invertir, o el presupuesto del mes) no hay presupuesto: el plan sale sin cifras. Se completan en Marca → Números del negocio." });
  }

  // Qué campañas: las que escogió la agencia («¿Qué vas a hacer?») o las de la cuenta (nueva: presentación y evaluación).
  const escogidas = que.campanas.filter((id) => id !== "temporada");
  const soloTemporada = que.campanas.length > 0 && !escogidas.length;
  const etapas = que.campanas.length ? ETAPAS_CICLO.filter((e) => escogidas.includes(e.id)) : etapasDeLaCuenta(cuenta);
  if (cuenta === "nueva" && etapas.some((e) => e.id === "conversion" || e.id === "ascension")) {
    avisos.push({ codigo: "nueva-con-conversion", grave: false, texto: "Escogiste conversión o ascensión con una cuenta nueva: hacen falta públicos de quien ya interactuó o escribió (unas 1.000 personas) y una lista de clientes; si son pequeños, Meta casi no los muestra." });
  }
  // El reparto: el del cliente a mano (se queda para los meses siguientes) o el del Manual.
  const delCliente = repartoDelCliente(m.reparto, repartoPropio);
  const reparto = soloTemporada ? [] : repartoDelPlan(delCliente.reparto, cuenta, que.campanas.length ? escogidas : null);
  const anuncios = limpiarAnunciosPorConjunto(m.anunciosPorConjunto);
  const e = limpiarEstudio(estudio);
  const perfiles = e?.general?.perfiles ?? [];
  const artesMarca = limpiarTiposArte(kit?.tiposArte);
  const est = esObjeto(calendario?.opciones?.estrategia) ? calendario.opciones.estrategia : null;
  const productos = productosActivos(catalogo);
  // Qué productos: el foco (el de la estrategia del mes, o el primero escogido), varios o todo el catálogo.
  const elegidosProd = que.productoIds.map((id) => productos.find((p) => p.id === id)).filter(Boolean);
  const foco = que.productos === "foco" ? productos.find((p) => p.id === (elegidosProd[0]?.id ?? est?.focoId)) ?? null : null;
  const delPlan = que.productos === "todos" ? [] : que.productos === "varios" ? elegidosProd : foco ? [foco] : [];
  if (que.productos === "varios" && !elegidosProd.length) {
    avisos.push({ codigo: "sin-productos", grave: false, texto: "Escogiste «Varios productos» sin marcar ninguno: el plan va con todo el catálogo hasta que los marques." });
  }
  const nombreProductos = delPlan.length === 1 ? delPlan[0].nombre : delPlan.length === 2 ? `${delPlan[0].nombre} + ${delPlan[1].nombre}` : delPlan.length > 2 ? `${delPlan[0].nombre} + ${delPlan.length - 1} más` : "";
  // Cada dato del nombre va ya cortado en una palabra: `nombreConPlantilla` lo cortaría a media palabra.
  const datosNombre = (nombreEtapa) => ({
    cliente: enPalabra(cliente?.nombre, 60), etapa: nombreEtapa, objetivo: `${ciclo.nombreObjetivo}${web ? "" : " WhatsApp"}`,
    producto: enPalabra(nombreProductos, 60), mes: nombreDelMes(mes),
  });
  // La edad del público del producto (la maleta «Público» del estudio): la de los conjuntos de intereses cuyo perfil no
  // la dice. Sin edad en ningún sitio, el conjunto va sin edad en su nombre (y abierta en el Ads Manager).
  const edadPublico = (delPlan.length ? delPlan : productos.slice(0, 3)).map((p) => edadDeTexto(e?.productos?.[p.id]?.elementos?.publico)).find(Boolean) ?? null;
  const nombreCampana = (datos) => nombreConPlantilla(plantillaConEtapa(m.nomenclatura.campana), datos);
  // Los ÁNGULOS DE VENTA (sólo del estudio APROBADO): los de los productos del plan, o los de los primeros del catálogo
  // que los tengan; intercalados (uno de cada producto antes que el segundo de ninguno).
  const aprobado = estudioAprobado !== undefined ? limpiarEstudio(estudioAprobado) : e?.aprobadoAt ? e : null;
  const conAngulos = (delPlan.length ? delPlan : productos.filter((p) => angulosDeProducto(aprobado, p.id).length)).slice(0, 3);
  const angulos = intercalar(conAngulos.map((p) => angulosDeProducto(aprobado, p.id).map((a) => ({ ...a, productoId: p.id, producto: p.nombre }))));
  const usoAngulos = new Map();
  const mm = mesDelPlan(mes);
  const primerDia = mm ? `${mm.texto}-01` : "";
  // Un plan del mes en curso arranca HOY (las campañas no se montan con fecha pasada).
  const desde = mm && /^\d{4}-\d{2}-\d{2}$/.test(hoy) && hoy > primerDia && hoy <= ultimoDia(mm) ? hoy : primerDia;

  const campana = ({ id, etapa, nombreEtapa, pct, mensual, inicio, fin = "", contenido = "", lleva = "", artes, niveles, extra = {} }) => {
    const conjuntos = conjuntosDeEtapa(etapa === "temporada" ? "temporada" : etapa, { nueva: cuenta === "nueva", web, perfiles, rubro: cliente?.rubro ?? "", objetivo: ciclo.objetivo, edadPublico });
    const en = PRESUPUESTO_EN[etapa] ?? "conjunto";
    const dias = fin ? diasEntre(inicio, fin) + 1 : DIAS_DEL_MES;
    const diario = mensual > 0 ? r2(mensual / dias) : null;
    const porConjunto = en === "conjunto" && diario ? r2(diario / conjuntos.length) : null;
    const nombre = nombreCampana(datosNombre(nombreEtapa));
    const conNombres = conjuntos.map((x) => ({
      ...x,
      nombre: nombreConPlantilla(m.nomenclatura.conjunto, { tipo: x.nombre, edad: textoEdad(x.edad), lugar: "", etapa: nombreEtapa }) || x.nombre,
      nombreCorto: x.nombre,
      presupuestoDiario: porConjunto,
      publico: { ...x.publico, nombres: nombresDe(x.publico.publicos) },
      excluye: { ...x.excluye, nombres: nombresDe(x.excluye.publicos) },
    }));
    // Los tipos de arte: los de la etapa en este negocio, primero los de la marca (kit.tiposArte); los de la marca que
    // la etapa no trae no se fuerzan.
    const deLaEtapa = limpiarTiposArte(artes);
    const ordenados = [...deLaEtapa.filter((a) => artesMarca.includes(a)), ...deLaEtapa.filter((a) => !artesMarca.includes(a))];
    const porConjuntoAnuncios = anunciosDeEtapa(etapa, anuncios);
    return {
      id, etapa, nombreEtapa, nombre, para: PARA_QUE_CAMPANA[id] ?? "", objetivo: ciclo.objetivo, nombreObjetivo: ciclo.nombreObjetivo, objetivoMeta: ciclo.objetivoMeta,
      rendimiento: RENDIMIENTO[ciclo.objetivo] ?? RENDIMIENTO.interaccion,
      appMensajes: web ? "" : "WhatsApp",
      pct, presupuesto: { mensual: mensual > 0 ? r2(mensual) : null, diario, en, porConjunto, dias },
      calendario: { inicio, fin },
      ubicaciones: "Advantage+ (automáticas)",
      contenido, lleva, artes: ordenados, niveles,
      // En qué nivel de consciencia se escribe cada anuncio (la regla de 100 dentro de su etapa: lib/textosNivel.js).
      nivelesAnuncios: nivelesParaHuecos(etapa, porConjuntoAnuncios),
      // El ÁNGULO DE VENTA que prueba cada anuncio (los del estudio aprobado; vacío sin ángulos).
      angulosHuecos: angulosParaCampana(angulos, etapa, porConjuntoAnuncios, usoAngulos),
      conjuntos: conNombres, anunciosPorConjunto: porConjuntoAnuncios,
      anuncios: [], faltan: null,
      ...extra,
    };
  };

  const campanas = etapas.map((et) => {
    const r = reparto.find((x) => x.etapa === et.id);
    const delCiclo = ciclo.etapas.find((x) => x.id === et.id);
    return campana({
      id: et.id, etapa: et.id, nombreEtapa: et.nombre, pct: r?.pct ?? 0,
      mensual: inversion ? (inversion * (r?.pct ?? 0)) / 100 : 0, inicio: desde,
      contenido: delCiclo?.contenido ?? "", lleva: delCiclo?.lleva ?? "", artes: delCiclo?.artes ?? [], niveles: et.niveles,
    });
  });

  // La temporada: opcional, con su presupuesto APARTE del reparto y lo que dura su fecha. Si la agencia escogió las
  // campañas, va sólo si la escogió (y la pone aunque el mes no traiga fecha: «la pidió la agencia»).
  const ajT = esObjeto(ajustes?.temporada) ? ajustes.temporada : {};
  const incluir = que.campanas.length ? que.campanas.includes("temporada") : ajT.incluir;
  let tempo = temporada;
  if (!tempo && incluir === true && mm) {
    tempo = { nombre: "Temporada", motivo: "La pidió la agencia", fechas: [], inicio: desde, fin: ultimoDia(mm), dias: diasEntre(desde, ultimoDia(mm)) + 1, ofertas: "", codigo: "" };
  }
  const conTemporada = Boolean(tempo) && incluir !== false;
  if (conTemporada) {
    const diarioEscrito = numero(ajT.diario);
    const diario = diarioEscrito > 0 ? r2(diarioEscrito) : inversion ? r2((inversion * PCT_TEMPORADA) / 100 / DIAS_DEL_MES) : null;
    const conversion = ciclo.etapas.find((x) => x.id === "conversion");
    campanas.push(campana({
      id: "temporada", etapa: "temporada", nombreEtapa: "Temporada", pct: null,
      mensual: diario ? diario * tempo.dias : 0, inicio: tempo.inicio, fin: tempo.fin,
      contenido: `${tempo.nombre}: la oferta con fecha${tempo.ofertas ? ` (${tempo.ofertas})` : ""}, dicha sin rodeos y con su fecha de fin.`,
      lleva: conversion?.lleva ?? "", artes: ["promocion", "producto", "testimonio"], niveles: NIVELES_DE_ETAPA.temporada,
      extra: { temporada: { ...tempo, diarioSugerido: !(diarioEscrito > 0) } },
    }));
  } else if (tempo && incluir === false && !que.campanas.length) {
    avisos.push({ codigo: "temporada-quitada", grave: false, texto: `El mes trae ${tempo.nombre}: la campaña de temporada se quitó del plan (se vuelve a poner con «Incluir la de temporada»).` });
  }
  if (escogidas.length && escogidas.length < etapasDeLaCuenta(cuenta).length && inversion) {
    avisos.push({ codigo: "algunas", grave: false, texto: `Este mes van sólo ${lista(campanas.map((c) => c.nombreEtapa.toLowerCase()))}: la inversión del ciclo (${dinero(inversion, moneda)}) se reparte entre ${campanas.filter((c) => c.id !== "temporada").length === 1 ? "esa campaña" : "esas campañas"}. Si quieres gastar menos, escribe la inversión a mano.` });
  }

  // La temporada comparte gente con evaluación (y ascensión): se dice, y cómo no pagar de más.
  if (campanas.some((c) => c.id === "temporada")) {
    const comparten = campanas.filter((c) => c.id === "evaluacion" || c.id === "ascension").map((c) => c.nombreEtapa.toLowerCase());
    if (comparten.length) {
      avisos.push({ codigo: "temporada-compite", grave: false, campana: "temporada", texto: `La campaña de temporada le habla a la misma gente que ${lista(comparten)} (quien ya te conoce y tus clientes). Mientras dure, esas personas pueden ver anuncios de las dos campañas y Meta reparte entre ellas: no subas el presupuesto de ${comparten[0]} esos días. Si prefieres no duplicar, pon los anuncios de la oferta dentro de ${comparten[0]} en lugar de una campaña aparte.` });
    }
  }

  // Presupuestos que casi no salen: con poco al día, Meta casi no muestra el conjunto y no sale de la fase de
  // aprendizaje. Con el número mágico se dice cuántos resultados daría a la semana.
  const nm = numeroMagicoDelCliente(n, { tasaDefecto: numeros?.tasaDefecto, moneda });
  const magico = nm?.valor > 0 ? nm.valor : null;
  const nombreResultado = nm?.nombreMetrica || "resultado";
  const bajas = [];
  for (const c of campanas) {
    const enConjunto = c.presupuesto.en === "conjunto";
    const d = enConjunto ? c.presupuesto.porConjunto : c.presupuesto.diario;
    if (d === null) continue;
    const unidades = enConjunto ? c.conjuntos.length : 1;
    // La semana, de lo que de verdad hay (sin el redondeo del diario).
    const semana = c.presupuesto.mensual > 0 ? (c.presupuesto.mensual / c.presupuesto.dias / unidades) * 7 : d * 7;
    const porSemana = magico ? semana / magico : null;
    const baja = d < MIN_DIARIO || (porSemana !== null ? porSemana < RESULTADOS_SEMANA_MIN : d < DIARIO_POCO);
    if (!baja) continue;
    bajas.push(c);
    const quien = enConjunto ? `cada conjunto (${c.conjuntos.length})` : "la campaña";
    avisos.push({ codigo: "presupuesto-bajo", grave: false, campana: c.id, texto: `${c.nombreEtapa}: ${quien} queda con ${dinero(d, moneda)} al día (${dinero(r2(semana), moneda)} a la semana)${porSemana !== null ? `: con tu número mágico (${dinero(magico, moneda)} por ${nombreResultado}) son unos ${redondo(porSemana)} a la semana` : ""}. Con tan poco, Meta casi no lo muestra y no sale de la fase de aprendizaje (necesita alrededor de ${RESULTADOS_SEMANA_APRENDER} resultados a la semana en cada conjunto).` });
  }
  if (bajas.length) avisos.push(propuestaDePresupuesto(bajas, { inversion, delCliente, magico, moneda, escogidas }));

  // Las 7 maletas de los productos del plan (o de los activos, si es de todo el catálogo): si falta una, no se lanza.
  const aMirar = delPlan.length ? delPlan.slice(0, 3) : productos.slice(0, 3);
  const maletas = aMirar.map((p) => ({ productoId: p.id, producto: p.nombre, faltan: maletasQueFaltan(estudio, p.id) }))
    .filter((x) => x.faltan.length);
  for (const x of maletas) {
    const rojas = x.faltan.filter((f) => f.estado === "rojo");
    const flojas = x.faltan.filter((f) => f.estado !== "rojo");
    // La frase del semáforo de las maletas (lib/maletas.js), la misma que en el estudio de mercado.
    if (rojas.length) avisos.push({ codigo: "maletas", grave: true, productoId: x.productoId, texto: `«${x.producto}» (estudio de mercado): ${avisoDeMaletas(rojas, [])}` });
    else if (flojas.length) avisos.push({ codigo: "maletas-flojas", grave: false, productoId: x.productoId, texto: `«${x.producto}» (estudio de mercado): ${avisoDeMaletas([], flojas)}` });
  }
  if (!productos.length) avisos.push({ codigo: "sin-catalogo", grave: false, texto: "El cliente no tiene catálogo: sin productos no se puede revisar si están las 7 maletas." });

  const publicos = PUBLICOS_CICLO.filter((p) => campanas.some((c) => c.conjuntos.some((x) => [...x.publico.publicos, ...x.excluye.publicos].includes(p.id))))
    .map((p) => ({ ...p, usaEn: campanas.filter((c) => c.conjuntos.some((x) => [...x.publico.publicos, ...x.excluye.publicos].includes(p.id))).map((c) => c.id) }));

  // El total del mes: el ciclo y, aparte, la temporada («1.053 $: 1.000 $ del ciclo y 53 $ de la temporada»).
  const delCicloMes = r2(campanas.filter((c) => c.id !== "temporada").reduce((s, c) => s + (c.presupuesto.mensual ?? 0), 0));
  const deTemporada = r2(campanas.find((c) => c.id === "temporada")?.presupuesto.mensual ?? 0);

  return {
    v: 1, mes, nombreMes: nombreDelMes(mes), cliente: corto(cliente?.nombre, 80), moneda,
    tipo: ciclo.tipo, destino: ciclo.destino, cuenta, objetivo: ciclo.objetivo, nombreObjetivo: ciclo.nombreObjetivo,
    inversion, inversionDe, reparto, anunciosPorConjunto: anuncios, nomenclaturaAnuncio: m.nomenclatura.anuncio,
    // El reparto de las cuatro etapas (el del cliente a mano o el del Manual): lo que enseña «Repartir a mano».
    repartoBase: delCliente.reparto, repartoAMano: delCliente.aMano,
    total: { ciclo: delCicloMes, temporada: deTemporada, mes: r2(delCicloMes + deTemporada) },
    temporada: tempo ? { ...tempo, incluida: conTemporada } : null,
    que, desde,
    foco: foco ? { id: foco.id, nombre: foco.nombre } : null,
    productos: delPlan.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio ?? "" })),
    // El catálogo activo (lo que ofrece «¿Qué vas a hacer?» para escoger).
    catalogo: productos.slice(0, 40).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio ?? "" })),
    // Los ángulos de venta que se pueden escoger en cada hueco (los del estudio aprobado), con todo lo que lee la IA.
    angulos,
    campanas, publicos, maletas, avisos,
  };
}

/** El id del plan de un cliente y un mes en `planes_campana` («ciclo-<cliente>-AAAA-MM»). Pura. */
export const idDelPlanDelMes = (clientId, mes) => `ciclo-${clientId}-${mes}`;

/**
 * El PRESUPUESTO del mes para las campañas, el MISMO que pone el plan (la inversión de los números del negocio —o la
 * escrita a mano en el plan— y la temporada): con él se mide el ritmo de gasto de la revisión 3Q. Recibe lo mismo que
 * `planDelCiclo` (sin catálogo ni estudio: no cambian el dinero). → { total, ciclo, temporada, de } o null sin
 * números. Pura.
 */
export function presupuestoDelMes(entrada = {}) {
  const p = planDelCiclo({ ...entrada, catalogo: null, estudio: null, estudioAprobado: null, kit: null });
  if (!(p.total?.mes > 0)) return null;
  return { total: p.total.mes, ciclo: p.total.ciclo, temporada: p.total.temporada, de: p.inversionDe ?? "" };
}

/** El total del mes dicho en una línea: «$1053 en total: $1000 del ciclo y $53 de la temporada» (`formato`: el de la pantalla). Pura. */
export function textoDelTotal(plan, formato = null) {
  const t = plan?.total;
  if (!t || !(t.mes > 0)) return "";
  const d = (n) => (formato ? formato(n) : dinero(n, plan.moneda));
  if (t.temporada > 0 && t.ciclo > 0) return `${d(t.mes)} en total: ${d(t.ciclo)} del ciclo y ${d(t.temporada)} de la temporada`;
  return t.temporada > 0 ? `${d(t.mes)} en total, todo de la temporada` : `${d(t.mes)} en total`;
}

// ------------------------------------------------------------
// Qué pieza va en cada anuncio (C.2)
// ------------------------------------------------------------

// El tipo de arte de una publicación: la regla única de lib/tiposArte.js (la misma de lo que se aprende de los anuncios).
export { tipoArteDePost };

// Lo que impide usar la publicación TAL CUAL (su caption es el texto del anuncio y no se cambia).
const IMPIDEN = new Set(["sin-caption", "caduca", "personal", "llamado"]);

/**
 * Las publicaciones del cliente que pueden ir en un anuncio, con lo que se sabe de cada una. `calendarios`: [{ id,
 * year, month, days, soloClaves? }] (con `soloClaves`, un Set de «calendario|publicación», sólo esas: los meses viejos
 * que se leen por un anuncio que ya funcionó o una publicación escogida a mano); `cola`: las filas de
 * `publicaciones_programadas` (red, estado, variante, calendar_id, post_id, externo_id, enlace); `metricas`: las de
 * `metricas_publicacion` del cliente; `incluir`: claves que entran aunque no estén publicadas ni marcadas «Va a pauta»
 * (lo que escogió una persona, lo que ya corrió como anuncio). Lo PUBLICADO entra con su «rinde» (la cuenta de «Lo
 * mejor») y si su texto sirve para pauta; lo marcado «Va a pauta», con su etapa. → [{ calendarId, postId, fecha,
 * titulo, formato, publicada, enlaces, rinde, pauta, tipoArte, composicion, nivel, productoId, medios, textos, sirve,
 * motivo, caption }]. Pura.
 */
export function candidatasDelCalendario({ calendarios = [], cola = [], metricas = [], destino = "", artesMarca = [], incluir = null } = {}) {
  const enCola = new Map();
  for (const f of cola) {
    if (f?.variante && f.variante !== "post") continue;
    if (f?.estado !== "publicada") continue;
    const k = `${f.calendar_id}|${f.post_id}`;
    if (!enCola.has(k)) enCola.set(k, []);
    enCola.get(k).push(f);
  }
  const forzadas = incluir instanceof Set ? incluir : new Set(incluir ?? []);
  const rindes = rindesDePropias(metricas);
  const porExterno = new Map(metricas.map((f) => [`${f.red}:${f.externo_id}`, f]));
  const salida = [];
  const vistas = new Set();
  for (const cal of calendarios) {
    const solo = cal.soloClaves instanceof Set ? cal.soloClaves : null;
    for (const d of cal.days ?? []) {
      for (const post of d.posts ?? []) {
        if (!post?.id || post.format === "live") continue;
        const k = `${cal.id}|${post.id}`;
        if ((solo && !solo.has(k)) || vistas.has(k)) continue;
        const forzada = forzadas.has(k);
        const filas = enCola.get(k) ?? [];
        const publicada = filas.length > 0 || post.status === "published";
        const pauta = limpiarPauta(post.pauta);
        if (!publicada && !pauta && !forzada) continue;
        // Una historia publicada ya no está: sólo sirve si alguien la marcó para pauta (se sube la pieza).
        if (post.format === "historia" && !pauta && !forzada) continue;
        vistas.add(k);
        let rinde = null;
        let senal = null;
        for (const f of filas) {
          const mtr = porExterno.get(`${f.red}:${f.externo_id}`);
          const r = mtr ? rindes.get(mtr) : null;
          if (r?.senal !== null && r?.senal !== undefined && (senal === null || r.senal > senal)) { senal = r.senal; rinde = r.rinde; }
        }
        const enlaces = Object.fromEntries(filas.filter((f) => f.enlace).map((f) => [f.red, f.enlace]));
        const problemas = problemasDePauta({ ...post, pauta: pauta ?? { etapa: "presentacion" } }, { destino });
        const impiden = problemas.filter((p) => IMPIDEN.has(p.codigo));
        const medios = (Array.isArray(post.medios) ? post.medios : []).map((x) => x?.src).filter(Boolean);
        if (!medios.length && post.image) medios.push(post.image);
        salida.push({
          calendarId: cal.id, postId: post.id, fecha: d.date ?? "", titulo: enPalabra(post.title || primeraLinea(post.idea) || primeraLinea(post.descripcion), 80) || "(sin título)",
          formato: post.format ?? "post", publicada, enlaces, rinde, senal, pauta,
          tipoArte: tipoArteDePost(post, artesMarca), composicion: post.composicion ?? "", nivel: post.nivel ?? "", productoId: post.productoId ?? "",
          medios, textos: limpiarAnuncio(post.anuncio, { destino }), sirve: !impiden.length, motivo: impiden[0]?.texto ?? "",
          caption: String(post.descripcion || post.script || "").trim().slice(0, 2200),
          deOferta: false, post,
        });
      }
    }
  }
  return salida;
}

const claveDiversidad = (p) => (p.tipoArte && p.composicion ? `${p.tipoArte}|${p.composicion}` : "");
const claveDe = (p) => `${p.calendarId}|${p.postId}`;

/**
 * Los anuncios que YA FUNCIONARON en el Ads Manager (lo guardado en `anuncios_clientes.en_pauta`, entrega 7): las
 * publicaciones del calendario con resultados en 30 días, a un costo dentro del número mágico de ese día (o, sin él,
 * con 3 resultados o más), de la más barata a la más cara. «No reinventar la rueda»: el curso pide reusar los anuncios
 * que funcionaron antes que hacer otros. `enPauta`: lo guardado (ya limpio o crudo). → [{ clave, etapa, costo,
 * resultados, nombreResultado, activo }]. Pura.
 */
export function anunciosQueFuncionaron(enPauta) {
  const d = typeof enPauta === "string" ? (() => { try { return JSON.parse(enPauta); } catch { return null; } })() : enPauta;
  const ref = Number(d?.referencia) > 0 ? Number(d.referencia) : null;
  return Object.values(esObjeto(d?.publicaciones) ? d.publicaciones : {})
    .map((e) => {
      const c = e?.d30 ?? e?.d7;
      const costo = Number(c?.costo);
      const resultados = Number(c?.resultados) || 0;
      if (!e?.calendarId || !e?.postId || !(resultados > 0) || !(costo > 0)) return null;
      if (ref ? costo > ref : resultados < 3) return null;
      return { clave: `${e.calendarId}|${e.postId}`, etapa: idEtapaCiclo(e.etapa) || "", costo, resultados, nombreResultado: corto(e.nombreResultado, 40), activo: e.activo === true };
    })
    .filter(Boolean)
    .sort((a, b) => a.costo - b.costo);
}

/** Las artes que se le piden al lote para un nivel: en los fríos, las que no ponen el producto en el centro. Pura. */
export function artesParaNiveles(artes = [], niveles = []) {
  if (!niveles.some(esNivelFrio)) return artes;
  const sin = artes.filter((a) => !ARTES_DE_PRODUCTO.has(a));
  return sin.length ? sin : ["educativo", "humano", "dividida"];
}
/** Las artes que ponen el producto o la oferta en el centro: no van en un nivel frío. */
const ARTES_DE_PRODUCTO = new Set(["producto", "promocion"]);

/**
 * Pone las piezas en cada campaña (C.2) y dice lo que falta. El orden en que se SUGIERE:
 *   0. Lo que escogió una persona en ese hueco (`elegidos`: lo guardado del plan, `limpiarAnunciosPlan`): una
 *      publicación (de cualquier mes) o «anuncio nuevo» sin publicación. Manda: el plan sugiere, no limita.
 *   1. Los anuncios que YA FUNCIONARON (`funcionaron`: `anunciosQueFuncionaron`), en su etapa.
 *   2. Lo PUBLICADO que rindió (RINDE_PARA_PAUTA o más) y cuyo texto sirve para pauta: a su etapa si va a pauta, si no a
 *      presentación (o evaluación si presentación ya está llena).
 *   3. Lo marcado «Va a pauta» con esa etapa (las del mes del plan primero). En la de temporada, lo de la oferta.
 * Con productos escogidos («¿Qué vas a hacer?»), sólo se sugiere lo de esos productos (o lo que no dice de cuál es). Una
 * pieza va en UNA campaña. Dos con el mismo tipo de arte y la misma composición son una para Meta: la segunda no se
 * pone y se avisa. `ofertas`/`codigo`: los del calendario del mes. Pura.
 */
export function conPiezas(plan, candidatas = [], { ofertas = "", codigo = "", hoy = "", aprendido = null, funcionaron = [], elegidos = {} } = {}) {
  if (!plan) return plan;
  const usadas = new Set();
  const avisos = [...plan.avisos.filter((a) => !CODIGOS_DE_PIEZAS.has(a.codigo))];
  // Lo que se aprendió de sus anuncios (lib/aprenderAnuncios.js): el tipo de arte más barato va primero en lo que falta
  // y el más caro, al final. Sólo ordena: los tipos de cada etapa no cambian.
  const deArte = (lista) => (Array.isArray(aprendido?.[lista]) ? aprendido[lista] : []).filter((x) => x?.rasgo === "tipoArte").map((x) => x.id);
  const masBarato = deArte("mejores");
  const masCaro = deArte("peores");
  const peso = (a) => (masBarato.includes(a) ? 0 : masCaro.includes(a) ? 2 : 1);
  const mes = plan.mes;
  const huecos = new Map(plan.campanas.map((c) => [c.id, Array(c.anunciosPorConjunto).fill(null)]));
  const parecidas = [];
  const conOferta = candidatas.map((p) => ({ ...p, deOferta: deLaOferta(p.post ?? {}, { ofertas, codigo }) }));
  const porClave = new Map(conOferta.map((p) => [claveDe(p), p]));
  const productos = new Set((plan.productos ?? []).map((p) => p.id));
  const delPlan = (p) => !productos.size || !p.productoId || productos.has(p.productoId);
  const poner = (campanaId, p, origen, extra = {}) => {
    const c = plan.campanas.find((x) => x.id === campanaId);
    const lista = huecos.get(campanaId);
    if (!c || !lista || usadas.has(claveDe(p))) return false;
    const libre = lista.indexOf(null);
    if (libre < 0) return false;
    const k = claveDiversidad(p);
    const igual = k && lista.find((x) => x?.pieza && claveDiversidad(x.pieza) === k);
    if (igual) { parecidas.push({ campana: c, pieza: p, igual: igual.pieza }); return false; }
    lista[libre] = { pieza: p, origen, ...extra };
    usadas.add(claveDe(p));
    return true;
  };

  // 0. Lo que escogió una persona.
  const escogidos = limpiarAnunciosPlan(elegidos, { destino: plan.destino });
  const sueltos = new Map();
  for (const [slot, e] of Object.entries(escogidos)) {
    const h = huecoDeId(slot);
    const lista = h && huecos.get(h.campana);
    if (!lista || h.n > lista.length) continue;
    if (e.nuevo) { lista[h.n - 1] = { nuevo: true, origen: "nuevo", entrada: e }; continue; }
    if (e.pieza) {
      const p = porClave.get(`${e.pieza.calendarId}|${e.pieza.postId}`);
      if (!p) {
        avisos.push({ codigo: "escogida-perdida", grave: false, campana: h.campana, texto: `${nombreDeEtapaDelPlan(h.campana)}, anuncio ${h.n}: la publicación que se escogió ya no está en el calendario. Escoge otra.` });
        continue;
      }
      lista[h.n - 1] = { pieza: p, origen: "elegido", entrada: e };
      usadas.add(claveDe(p));
      continue;
    }
    sueltos.set(slot, e);
  }
  // 1. Los anuncios que ya funcionaron.
  for (const f of funcionaron) {
    const p = porClave.get(f.clave);
    if (!p || !delPlan(p)) continue;
    const etapa = huecos.has(f.etapa) ? f.etapa : null;
    if (etapa) poner(etapa, p, "funciono", { funciono: f });
  }
  // 2. Lo publicado que mejor funcionó en orgánico: cada pieza, a la etapa donde mejor ENCAJA (su tipo de arte, su nivel,
  // si habla de precio u oferta); primero cada una a su mejor etapa y después, lo que sobre, a la siguiente que le
  // sirva. Antes iban todas a presentación y conversión, ascensión y la temporada quedaban vacías.
  const ids = new Set(plan.campanas.map((c) => c.id));
  const buenas = conOferta.filter((p) => p.publicada && p.sirve && p.rinde !== null && p.rinde >= RINDE_PARA_PAUTA && p.formato !== "historia" && delPlan(p))
    .sort((a, b) => (b.senal ?? 0) - (a.senal ?? 0));
  const temporadaPlan = plan.campanas.find((c) => c.id === "temporada");
  const enTemporada = (p) => Boolean(temporadaPlan) && p.deOferta && (p.fecha.startsWith(mes) || (p.fecha >= temporadaPlan.calendario.inicio && p.fecha <= temporadaPlan.calendario.fin));
  const encajes = (p) => plan.campanas.map((c) => ({ id: c.id, s: encajeEnEtapa(p, c, { temporada: enTemporada(p) }) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const sobran = [];
  for (const p of buenas) {
    const suya = p.pauta?.etapa && ids.has(p.pauta.etapa) ? p.pauta.etapa : null;
    if (suya) { poner(suya, p, "publicada"); continue; }
    const mejor = encajes(p)[0];
    if (!mejor || !poner(mejor.id, p, "publicada")) sobran.push(p);
  }
  for (const p of sobran) {
    if (usadas.has(claveDe(p))) continue;
    for (const x of encajes(p).slice(1)) if (poner(x.id, p, "publicada")) break;
  }
  // 3. Lo marcado «Va a pauta»: las del mes del plan primero, en el orden del calendario.
  const marcadas = conOferta.filter((p) => p.pauta && !usadas.has(claveDe(p)) && delPlan(p))
    .sort((a, b) => Number(b.fecha.startsWith(mes)) - Number(a.fecha.startsWith(mes)) || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const temporada = plan.campanas.find((c) => c.id === "temporada");
  const sinSitio = [];
  for (const p of marcadas) {
    // La oferta del mes va primero a la temporada (si la hay y la pieza cae en sus fechas o es del mes).
    if (temporada && p.deOferta && (p.fecha.startsWith(mes) || (p.fecha >= temporada.calendario.inicio && p.fecha <= temporada.calendario.fin))) {
      if (poner("temporada", p, "pauta")) continue;
    }
    if (ids.has(p.pauta.etapa)) poner(p.pauta.etapa, p, "pauta");
    else if (p.fecha.startsWith(mes)) sinSitio.push(p);
  }
  if (sinSitio.length) {
    const etapas = [...new Set(sinSitio.map((p) => nombreDeEtapaDelPlan(p.pauta.etapa).toLowerCase()))];
    avisos.push({ codigo: "pauta-sin-campana", grave: false, texto: `${sinSitio.length === 1 ? "Una publicación del mes va" : `${sinSitio.length} publicaciones del mes van`} a pauta en ${lista(etapas)}, y esa campaña no está en este plan: ${sinSitio.length === 1 ? "no entra" : "no entran"} en ningún anuncio. Escógelas en otra campaña con «Cambiar» o añade la campaña en «¿Qué vas a hacer?».` });
  }

  let faltanTextosTotal = 0;
  const pool = Array.isArray(plan.angulos) ? plan.angulos : [];
  const campanas = plan.campanas.map((c) => {
    const lista = huecos.get(c.id);
    const anuncios = [];
    const vacios = [];
    const entradaDe = (x, i) => x?.entrada ?? sueltos.get(idDeHueco(c.id, i + 1)) ?? null;
    const angulosHuecos = lista.map((x, i) => anguloDelHueco(c, i, x, entradaDe(x, i), pool));
    lista.forEach((x, i) => {
      if (!x) { vacios.push(i); return; }
      const a = anuncioDe(x, c, plan, i, { hoy, entrada: entradaDe(x, i), angulo: angulosHuecos[i] });
      if (faltanTextos(a)) faltanTextosTotal += 1;
      anuncios.push(a);
    });
    const cubiertos = new Set(anuncios.map((a) => a.pieza?.tipoArte).filter(Boolean));
    const porPeso = (xs) => [...xs].sort((a, b) => peso(a) - peso(b));
    const nivelesVacios = vacios.map((i) => c.nivelesAnuncios[i]).filter(Boolean);
    const conNivel = artesParaNiveles(c.artes, nivelesVacios);
    const artes = [...porPeso(conNivel.filter((a) => !cubiertos.has(a))), ...porPeso(conNivel.filter((a) => cubiertos.has(a)))];
    const etapaLote = c.etapa === "temporada" ? "conversion" : c.etapa;
    const angulosVacios = vacios.map((i) => angulosHuecos[i]).filter(Boolean);
    return {
      ...c, anuncios, angulosHuecos, faltanTextos: anuncios.filter(faltanTextos).length,
      faltan: vacios.length ? {
        n: vacios.length, etapa: etapaLote, nivel: nivelesVacios[0] ?? NIVEL_POR_ETAPA[etapaLote] ?? "",
        niveles: cuentaDeNiveles(nivelesVacios), artes, productoId: plan.foco?.id ?? plan.productos?.[0]?.id ?? "",
        ...(angulosVacios.length ? { angulos: [...new Map(angulosVacios.map((a) => [claveAngulo(a), a])).values()] } : {}),
      } : null,
    };
  });
  // Una pieza que se dejó por parecida y después entró en otra campaña no es un aviso.
  const avisadas = new Set();
  for (const x of parecidas) {
    if (usadas.has(claveDe(x.pieza)) || avisadas.has(claveDe(x.pieza))) continue;
    avisadas.add(claveDe(x.pieza));
    avisos.push({ codigo: "diversidad", grave: false, campana: x.campana.id,
      texto: `${x.campana.nombreEtapa}: «${x.pieza.titulo}» (${diaCorto(x.pieza.fecha)}) tiene el mismo tipo de arte y la misma composición que «${x.igual.titulo}» (${diaCorto(x.igual.fecha)}). Para Meta serían UN solo anuncio: se dejó una y la otra se pide nueva.` });
  }
  const faltan = campanas.reduce((s, c) => s + (c.faltan?.n ?? 0), 0);
  if (faltan) avisos.push({ codigo: "faltan-piezas", grave: false, texto: `Faltan ${faltan} ${faltan === 1 ? "pieza" : "piezas"} para completar los anuncios: «Producir los anuncios que faltan» las pide al lote ya marcadas «Va a pauta», o escoge una publicación con «Cambiar».` });
  if (faltanTextosTotal) avisos.push({ codigo: "faltan-textos", grave: false, texto: `${faltanTextosTotal === 1 ? "Un anuncio no tiene" : `${faltanTextosTotal} anuncios no tienen`} sus textos (título y descripción, o el texto principal): «Escribir los que faltan» en su campaña.` });
  const conclusiones = [...(aprendido?.mejores ?? []).map((x) => ({ ...x, lado: "barato" })), ...(aprendido?.peores ?? []).map((x) => ({ ...x, lado: "caro" }))];
  if (conclusiones.length) {
    const articulo = (x) => (x.rasgo === "composicion" || x.rasgo === "etapa" ? "la" : "el");
    const dicho = (x) => `${articulo(x)} ${x.nombreRasgo} «${x.nombre}» (${x.costo == null ? "sin resultados" : dinero(x.costo, plan.moneda)})`;
    const baratos = conclusiones.filter((x) => x.lado === "barato").map(dicho);
    const caros = conclusiones.filter((x) => x.lado === "caro").map(dicho);
    avisos.push({ codigo: "aprendido", grave: false, texto: `Lo que ya se probó en sus anuncios (${aprendido.muestra} piezas con gasto, 30 días): ${[
      baratos.length ? `sale más barato ${baratos.join(", ")}` : "", caros.length ? `sale más caro ${caros.join(", ")}` : "",
    ].filter(Boolean).join("; ")}. Lo que falta pide primero lo más barato; deja una pieza de cada cuatro para probar algo distinto.` });
  }
  return { ...plan, campanas, avisos, aprendido: conclusiones.length ? { mejores: aprendido.mejores ?? [], peores: aprendido.peores ?? [], muestra: aprendido.muestra ?? 0 } : null };
}
/** Los avisos que rehace `conPiezas` (rehacer el plan no los repite). */
const CODIGOS_DE_PIEZAS = new Set(["diversidad", "faltan-piezas", "aprendido", "escogida-perdida", "faltan-textos", "pauta-sin-campana"]);

/** El anuncio de un hueco: en qué hueco y en qué nivel, la pieza (o «anuncio nuevo»), cómo se monta, su nombre y sus textos. */
function anuncioDe(x, c, plan, i, { hoy = "", entrada = null, angulo = null } = {}) {
  const n = i + 1;
  const slot = idDeHueco(c.id, n);
  const nivelHueco = c.nivelesAnuncios?.[i] ?? NIVEL_POR_ETAPA[c.etapa] ?? "";
  const textosGuardados = entrada?.textos ?? null;
  const base = { n, slot, origen: x.origen, sugerido: x.origen !== "elegido" && x.origen !== "nuevo", angulo, ...(entrada?.editado ? { editado: true } : {}), ...(entrada?.ia ? { ia: true } : {}) };
  // El nombre del anuncio, UNA regla: el ángulo de venta que prueba si lo tiene; si no, el título de su pieza (cortado en
  // una palabra); un anuncio nuevo sin ángulo, el nivel. Antes unos iban por el tipo de arte y otros por el título.
  const plantilla = plan.nomenclaturaAnuncio || limpiarManual({}).nomenclatura.anuncio;
  if (x.nuevo) {
    const nombre = nombreConPlantilla(plantilla, { numero: String(n), formato: "Pieza", angulo: angulo ? enPalabra(angulo.nombre, 40) : nombreNivelCorto(nivelHueco) || "Nuevo", etapa: c.nombreEtapa });
    return { ...base, nombre, nivel: nivelHueco, como: "subir", puedePublicacion: false, pieza: null, nuevo: true, textos: textosGuardados, textosDe: textosGuardados ? "plan" : "", caption: "", problemas: [] };
  }
  const p = x.pieza;
  const enlace = p.enlaces.instagram || p.enlaces.facebook || "";
  const futura = !p.publicada && p.fecha && hoy && p.fecha >= hoy;
  const puedePublicacion = Boolean((p.publicada && enlace) || futura);
  const porDefecto = p.publicada && enlace && p.sirve && (p.pauta?.como ?? "") !== "anuncio" ? "publicacion" : "subir";
  const como = entrada?.como === "publicacion" && puedePublicacion ? "publicacion" : entrada?.como === "subir" ? "subir" : porDefecto;
  const formato = p.formato === "carrusel" ? "Carrusel" : p.formato === "reel" ? "Reel" : p.formato === "historia" ? "Historia" : "Pieza";
  const nombre = nombreConPlantilla(plantilla, { numero: String(n), formato, angulo: angulo ? enPalabra(angulo.nombre, 40) : enPalabra(p.titulo, 30), etapa: c.nombreEtapa });
  const etapaPost = c.etapa === "temporada" ? "conversion" : c.etapa;
  const nivelPieza = p.pauta?.nivel || p.nivel;
  const nivel = (NIVELES_DE_ETAPA[c.etapa] ?? []).includes(nivelPieza) ? nivelPieza : nivelHueco;
  // Con la publicación ya subida, el texto principal ES su caption: se enseña y se revisa como anuncio.
  const problemas = como === "publicacion"
    ? problemasDePauta({ ...(p.post ?? {}), pauta: { etapa: etapaPost } }, { destino: plan.destino }).filter((q) => !["textos", "parecida"].includes(q.codigo)).map((q) => ({ codigo: q.codigo, texto: q.texto }))
    : [];
  const textos = textosGuardados ?? p.textos ?? null;
  return {
    ...base, nombre, nivel, como, puedePublicacion,
    textos, textosDe: textosGuardados ? "plan" : p.textos ? "publicacion" : "",
    caption: como === "publicacion" ? p.caption : "",
    problemas,
    ...(x.funciono ? { funciono: { costo: x.funciono.costo, resultados: x.funciono.resultados, nombreResultado: x.funciono.nombreResultado, activo: x.funciono.activo } } : {}),
    pieza: {
      calendarId: p.calendarId, postId: p.postId, fecha: p.fecha, titulo: p.titulo, formato: p.formato, tipoArte: p.tipoArte, composicion: p.composicion,
      nivel: p.nivel, rinde: p.rinde, enlaces: p.enlaces, medios: p.medios.slice(0, 10), textos: p.textos, publicada: p.publicada,
      boton: textos?.boton ?? botonPorDefecto(plan.destino), motivo: p.motivo, productoId: p.productoId,
      ...(futura ? { sale: p.fecha } : {}),
    },
  };
}
const nombreNivelCorto = (nivel) => ({ inconsciente: "Inconsciente", problema: "Problema", solucion: "Solución", producto: "Producto", decision: "Decisión" }[nivel] ?? "");

/**
 * El ángulo de venta de un hueco: el que escogió una persona (`entrada.angulo`; `false` = «sin ángulo») o el sugerido de
 * la campaña (`c.angulosHuecos[i]`). El sugerido se cambia por uno del producto de su pieza si la pieza es de otro
 * producto con ángulos (el ángulo de la mesa no sirve para el anuncio del sofá). → { productoId, id, nombre, publico?,
 * sugerido? } o null. Pura.
 */
function anguloDelHueco(c, i, x, entrada, pool) {
  if (entrada?.angulo === false) return null;
  if (entrada?.angulo) {
    const del = pool.find((a) => claveAngulo(a) === claveAngulo(entrada.angulo));
    return del ? refAngulo(del) : { ...entrada.angulo };
  }
  const sug = c.angulosHuecos?.[i] ?? null;
  const prod = x?.pieza?.productoId;
  if (sug && prod && sug.productoId !== prod) {
    const quiere = PUBLICO_DE_ETAPA[c.etapa] ?? "";
    const usados = new Set((c.angulosHuecos ?? []).map(claveAngulo));
    const delProducto = pool.filter((a) => a.productoId === prod && (!a.publico || a.publico === quiere));
    const otro = delProducto.find((a) => !usados.has(claveAngulo(a))) ?? delProducto[0];
    if (otro) return refAngulo(otro, { sugerido: true });
  }
  return sug ? { ...sug, sugerido: true } : null;
}

/** ¿Habla de precio u oferta? (un precio, un descuento, un 2x1, «gratis», una promoción, un código). */
const HABLA_DE_PRECIO = /(?:[$€]\s?\d|\d\s?(?:usd|dolares|%)|\b\d+\s?x\s?\d+\b|\bdescuento|\boferta|\bpromo|\bgratis\b|\bprecio|\bcupon|\bcodigo\b|\bultimas? (?:unidades|horas|dias)|\bsolo hoy\b|\bhasta el \d)/;

/**
 * Cuánto ENCAJA una pieza en la campaña de una etapa (más es mejor; 0 o menos, no va): lo que habla de precio u oferta,
 * a conversión (y a la temporada si es de su oferta); su tipo de arte, a las campañas que lo piden; su nivel de
 * consciencia, a la etapa de ese nivel (un nivel frío fuera de presentación resta). Sin nada que diga otra cosa,
 * presentación: lo que mejor funcionó es lo primero que ve quien no conoce la marca. Pura.
 */
export function encajeEnEtapa(p, c, { temporada = false } = {}) {
  const etapa = c?.etapa ?? "";
  let s = { presentacion: 6, evaluacion: 2, conversion: 0, ascension: -2, temporada: -5 }[etapa] ?? 0;
  const precio = p.deOferta || p.tipoArte === "promocion" || HABLA_DE_PRECIO.test(sinTildes([p.titulo, p.caption, p.post?.idea, p.post?.textoPieza].filter(Boolean).join(" ")));
  if (precio) s += ({ conversion: 40, ascension: 15, temporada: temporada ? 45 : -10, evaluacion: 5, presentacion: -40 })[etapa] ?? 0;
  else if (etapa === "temporada") s -= 20;
  const i = (c?.artes ?? []).indexOf(p.tipoArte);
  if (i >= 0) s += 20 - i;
  else if (p.tipoArte && tipoArteDe(p.tipoArte)?.etapas?.includes(etapa === "temporada" ? "conversion" : etapa)) s += 3;
  if (p.nivel) {
    if ((NIVELES_DE_ETAPA[etapa] ?? []).includes(p.nivel)) s += 25;
    else if (esNivelFrio(p.nivel) && etapa !== "presentacion") s -= 20;
  }
  return s;
}

/** El anuncio de un hueco de una campaña del plan (o null si está por producir). Pura. */
export const anuncioEn = (c, n) => c?.anuncios?.find((a) => a.n === n) ?? null;

// ------------------------------------------------------------
// La guía de montaje (C.3)
// ------------------------------------------------------------

const dinero = (n, moneda = "USD") => (n === null || n === undefined ? "—" : `${moneda === "USD" ? "$" : `${moneda} `}${Number(n).toFixed(2).replace(/\.00$/, "")}`);
/** «Desde el 1 nov · sin fecha de fin» o «Del 20 al 30 nov». Pura. */
export function textoCalendario(c) {
  const { inicio, fin } = c.calendario ?? {};
  if (fin) return `Del ${diaCorto(inicio)} al ${diaCorto(fin)} (termina con la fecha)`;
  return inicio ? `Desde el ${diaCorto(inicio)} · sin fecha de fin` : "Sin fecha de fin";
}
const textoPublico = (x) => [x.publico.texto, x.edad ? `Edad: ${edadDicha(x.edad)}.` : "", x.publico.nombres.length ? `Públicos: ${x.publico.nombres.join(", ")}.` : ""].filter(Boolean).join(" ");
/** La edad de un conjunto para la guía: la del perfil o del público del producto, o abierta. Pura. */
export const textoEdadConjunto = (x) => (x?.edad ? `${edadDicha(x.edad)} (la del público del estudio de mercado)` : "Abierta: de 18 a 65 o más (no se recorta)");
/** «Ángulo «Sin plancha» (Sofá cama)»: el ángulo de venta de un anuncio en una línea. Pura. */
export const textoAngulo = (a) => (a?.nombre ? `«${a.nombre}»${a.producto ? ` (${a.producto})` : ""}` : "");
const textoExcluye = (x) => (x.excluye.nombres.length ? `${x.excluye.nombres.join(", ")}.${x.excluye.nota ? ` ${x.excluye.nota}` : ""}` : x.excluye.nota || "Ninguna.");

/** Cómo se monta una pieza, en una línea (también para el Excel). Pura. */
export function textoDeLaPieza(a) {
  if (a?.nuevo) return "Anuncio nuevo: subir una pieza propia (no sale de una publicación del calendario)";
  if (!a?.pieza) return "";
  const p = a.pieza;
  const enlace = p.enlaces?.instagram || p.enlaces?.facebook || "";
  const base = `«${p.titulo}»${p.fecha ? ` (${diaCorto(p.fecha)})` : ""}${p.rinde ? ` · rindió ${String(p.rinde).replace(".", ",")}×` : ""}`;
  if (a.como === "publicacion") return enlace ? `${base} · usar la publicación: ${enlace}` : `${base} · usar la publicación cuando salga${p.sale ? ` (el ${diaCorto(p.sale)})` : ""}`;
  return `${base} · subir la pieza${p.sale ? ` (sale el ${diaCorto(p.sale)}; desde entonces se puede usar la publicación)` : ""}`;
}

/** De dónde salió la sugerencia de un anuncio, en palabras simples. Pura. */
export function origenDelAnuncio(a, moneda = "USD") {
  if (!a) return "";
  if (a.origen === "elegido") return "La escogiste tú";
  if (a.origen === "nuevo") return "Anuncio nuevo (sin publicación)";
  if (a.origen === "funciono") {
    const f = a.funciono;
    return `Ya funcionó como anuncio${f?.costo ? `: ${dinero(f.costo, moneda)} por ${singular(f.nombreResultado)} en 30 días` : ""}`;
  }
  if (a.origen === "publicada") return "Lo publicado que mejor funcionó";
  return "Marcada «Va a pauta»";
}
const singular = (nombre) => ({ conversaciones: "conversación", compras: "compra", "clientes potenciales": "cliente potencial", clics: "clic", resultados: "resultado" }[String(nombre ?? "").toLowerCase()] ?? "resultado");

/** Los campos de los textos de un anuncio para la guía (cada uno con su «Copiar»). */
function camposDeTextos(a, destino) {
  const campos = [];
  const t = a.textos;
  if (a.como === "publicacion") {
    campos.push({ etiqueta: "Texto principal", valor: a.caption ? `El de la publicación (no se cambia): ${a.caption}` : "El de la publicación (no se cambia)." });
  } else if (t?.textos?.length) {
    t.textos.forEach((x, k) => campos.push({ etiqueta: `Texto principal ${k + 1}`, valor: x, copiar: true }));
  } else {
    campos.push({ etiqueta: "Texto principal", valor: "Falta: «Escribir los textos» en el plan." });
  }
  if (t?.titulos?.length) t.titulos.forEach((x, k) => campos.push({ etiqueta: t.titulos.length > 1 ? `Título ${k + 1}` : "Título", valor: x, copiar: true }));
  else campos.push({ etiqueta: "Título", valor: "Falta: «Escribir los textos» en el plan." });
  if (t?.descripcion) campos.push({ etiqueta: "Descripción", valor: t.descripcion, copiar: true });
  else campos.push({ etiqueta: "Descripción", valor: "Falta: «Escribir los textos» en el plan." });
  campos.push({ etiqueta: "Botón", valor: nombreDeBoton(t?.boton) || nombreDeBoton(botonPorDefecto(destino)) });
  return campos;
}

/**
 * Los pasos para montar el plan en el Ads Manager, en su orden: lo de antes de empezar (los públicos personalizados,
 * el píxel en una web, las etiquetas de WhatsApp Business); y por campaña, la campaña, el primer conjunto, sus anuncios
 * con sus textos y los demás conjuntos (se duplica el primero y se cambia el público). Cada paso: { id, nivel, titulo,
 * campos: [{ etiqueta, valor, copiar }], nota?, ayuda? }. El `id` es estable (lo usa el progreso guardado):
 * «publico:<id>», «antes:pixel», «antes:etiquetas», «<campaña>:campana», «<campaña>:<conjunto>», «<campaña>:a<n>». Pura.
 */
export function guiaDeMontaje(plan) {
  if (!plan) return [];
  const pasos = [];
  const moneda = plan.moneda;
  const web = plan.destino === "web";
  if (web) {
    pasos.push({ id: "antes:pixel", nivel: "antes", grupo: "publicos", titulo: "Comprobar el píxel de Meta y la API de conversiones en la web",
      campos: [
        { etiqueta: "Qué es", valor: "El píxel es un código de Meta en la web que le cuenta quién la visitó, quién agregó al carrito y quién compró. Sin él Meta no sabe a quién mostrar los anuncios ni puede crear los públicos de la web." },
        { etiqueta: "Dónde", valor: "Administrador de eventos → el conjunto de datos de la web → «Probar eventos»: abre la web y mira que lleguen la visita y la compra (o el formulario enviado)." },
        { etiqueta: "Evento que se optimiza", valor: plan.objetivo === "clientes" ? "Cliente potencial (el formulario enviado)" : "Compra" },
      ] });
  } else {
    pasos.push({ id: "antes:etiquetas", nivel: "antes", grupo: "publicos", titulo: "Usar las etiquetas de WhatsApp Business",
      campos: [
        { etiqueta: "Qué es", valor: "Las etiquetas de WhatsApp Business son para Meta lo que el píxel es para una web: le dicen qué pasó en cada conversación." },
        { etiqueta: "Cuáles", valor: "Nuevo pedido · Pago pendiente · Pagado · Pedido finalizado (en la app de WhatsApp Business: Herramientas para la empresa → Etiquetas)." },
        { etiqueta: "Cuándo", valor: "Cada vez que avanza una conversación que vino de un anuncio: así Meta aprende quién compra." },
      ] });
  }
  for (const p of plan.publicos) {
    pasos.push({ id: `publico:${p.id}`, nivel: "publico", grupo: "publicos", titulo: `Crear el público «${p.nombre}»`,
      campos: [{ etiqueta: "Nombre", valor: p.nombre, copiar: true }, { etiqueta: "Quién entra", valor: p.que }, { etiqueta: "Cómo", valor: p.como }] });
  }
  for (const c of plan.campanas) {
    const enCampana = c.presupuesto.en === "campana";
    pasos.push({
      id: `${c.id}:campana`, nivel: "campana", grupo: c.id, titulo: `Crear la campaña de ${c.nombreEtapa.toLowerCase()}`,
      campos: [
        { etiqueta: "Nombre", valor: c.nombre, copiar: true },
        { etiqueta: "Objetivo", valor: c.nombreObjetivo },
        { etiqueta: "Prueba A/B", valor: "Desactivada" },
        { etiqueta: "Presupuesto de la campaña Advantage+", valor: enCampana ? `Activado: ${dinero(c.presupuesto.diario, moneda)} al día` : "Desactivado (el presupuesto va en cada conjunto)", copiar: enCampana },
        { etiqueta: "Presupuesto del mes", valor: dinero(c.presupuesto.mensual, moneda) },
      ],
      nota: c.para,
    });
    const conjuntoCampos = (x) => [
      { etiqueta: "Nombre", valor: x.nombre, copiar: true },
      ...(enCampana ? [] : [{ etiqueta: "Presupuesto diario", valor: dinero(x.presupuestoDiario, moneda), copiar: true }]),
      ...(c.appMensajes ? [{ etiqueta: "App de mensajes", valor: c.appMensajes }] : []),
      ...(web ? [{ etiqueta: "Conjunto de datos (píxel)", valor: `El de la web · evento: ${plan.objetivo === "clientes" ? "Cliente potencial" : "Compra"}` }] : []),
      { etiqueta: "Objetivo de rendimiento", valor: c.rendimiento },
      { etiqueta: "Puja", valor: "Automática (control de puja en blanco)" },
      { etiqueta: "Calendario", valor: textoCalendario(c) },
      { etiqueta: "Edad", valor: textoEdadConjunto(x) },
      { etiqueta: "Público", valor: textoPublico(x) },
      ...(x.tipo === "intereses" ? [{ etiqueta: "Segmentación detallada Advantage", valor: "Desactivada si Meta deja (así se prueban esos intereses tal cual); en algunos objetivos va siempre activada." }] : []),
      { etiqueta: "Excluir", valor: textoExcluye(x) },
      { etiqueta: "Público Advantage+", valor: x.publico.advantage ? "Activado" : "Desactivado" },
      { etiqueta: "Ubicaciones", valor: c.ubicaciones },
      { etiqueta: "Llegar a más personas con más probabilidad de clic", valor: "Desactivado" },
    ];
    const [primero, ...resto] = c.conjuntos;
    if (primero) pasos.push({ id: `${c.id}:${primero.id}`, nivel: "conjunto", grupo: c.id, titulo: `Crear el conjunto 1 · ${primero.nombreCorto}`, campos: conjuntoCampos(primero), nota: primero.nota ?? "" });
    for (let i = 0; i < c.anunciosPorConjunto; i++) {
      const a = anuncioEn(c, i + 1);
      const campos = [{ etiqueta: "Nombre", valor: a?.nombre ?? `${i + 1} · (por producir)`, copiar: Boolean(a) }];
      if (!a) {
        const nivel = c.nivelesAnuncios?.[i] ?? c.faltan?.nivel ?? "";
        campos.push({ etiqueta: "Pieza", valor: `Falta: producirla o escoger una publicación en el plan (${c.faltan?.artes?.slice(0, 3).map((x) => tipoArteDe(x)?.nombre).filter(Boolean).join(" o ") || "un tipo de arte distinto"}, nivel ${nombreDeNivel(nivel).toLowerCase() || "de su etapa"}).` });
      } else if (a.como === "publicacion") {
        const enlace = a.pieza.enlaces.instagram || a.pieza.enlaces.facebook || "";
        campos.push({ etiqueta: "Configuración del anuncio", valor: "Usar una publicación existente" });
        campos.push(enlace
          ? { etiqueta: "Publicación", valor: enlace, copiar: true, enlace: true }
          : { etiqueta: "Publicación", valor: `«${a.pieza.titulo}»: todavía no sale${a.pieza.sale ? ` (sale el ${diaCorto(a.pieza.sale)})` : ""}. Móntalo cuando salga.` });
        campos.push(...camposDeTextos(a, plan.destino));
      } else {
        campos.push({ etiqueta: "Configuración del anuncio", valor: "Crear anuncio (subir la pieza)" });
        campos.push({ etiqueta: "Pieza", valor: textoDeLaPieza(a) });
        campos.push(...camposDeTextos(a, plan.destino));
      }
      if (a?.angulo) campos.splice(1, 0, { etiqueta: "Ángulo de venta que prueba", valor: textoAngulo(conProducto(a.angulo, plan)) });
      if (a) campos.push({ etiqueta: "Multianunciante", valor: "Activado" });
      pasos.push({
        id: `${c.id}:a${i + 1}`, nivel: "anuncio", grupo: c.id,
        titulo: `Anuncio ${i + 1}${a?.nuevo ? " · anuncio nuevo" : a ? ` · ${a.pieza.titulo}` : " · por producir"}`, campos, pieza: a?.pieza ?? null,
        nota: a ? "Revisa cómo sale en historias y reels, y las mejoras automáticas de la pieza: activa sólo las que convengan." : "",
      });
    }
    resto.forEach((x) => pasos.push({ id: `${c.id}:${x.id}`, nivel: "conjunto", grupo: c.id, titulo: `Duplicar el conjunto 1 · ${x.nombreCorto}`,
      campos: conjuntoCampos(x), nota: `Duplica el conjunto 1 con sus anuncios y cambia el nombre, el público${enCampana ? "" : " y el presupuesto"}.${x.nota ? ` ${x.nota}` : ""}` }));
  }
  return pasos;
}

/** El progreso guardado, limpio: { id → { por, at } } sólo con ids de pasos que existen. Pura. */
export function limpiarProgreso(progreso, guia = null) {
  const validos = guia ? new Set(guia.map((p) => p.id)) : null;
  const salida = {};
  for (const [id, v] of Object.entries(esObjeto(progreso) ? progreso : {})) {
    if (!/^[\w:-]{3,60}$/.test(id) || (validos && !validos.has(id)) || !v) continue;
    salida[id] = { por: corto(v.por, 80), at: /^\d{4}-\d{2}-\d{2}T/.test(String(v.at ?? "")) ? String(v.at).slice(0, 30) : "" };
  }
  return salida;
}

/** Cuántos pasos están hechos: { hechos, total }. Pura. */
export const avanceDeGuia = (guia, progreso) => ({ hechos: guia.filter((p) => progreso?.[p.id]).length, total: guia.length });

// ------------------------------------------------------------
// El Excel de estrategia de la agencia (5 hojas y la de los textos)
// ------------------------------------------------------------

/** El nombre de cada hoja, como el Excel de la agencia (la quinta, la de temporada). */
export const HOJAS_EXCEL = Object.freeze({ presentacion: "Presentación", evaluacion: "Evaluación", conversion: "Conversión", ascension: "Ascensión", temporada: "Campaña Especial (temporada)" });
/** La hoja de los textos de los anuncios (la sexta). */
export const HOJA_TEXTOS = "Textos de los anuncios";
/** Las columnas de anuncios de cada hoja del Excel de la agencia cuando la campaña no va (la hoja se deja con su forma). */
const ANUNCIOS_DE_LA_HOJA = Object.freeze({ presentacion: 5, evaluacion: 4, conversion: 3, ascension: 4, temporada: 4 });

const col = (i) => {
  let n = i + 1;
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Una celda de anuncio del Excel: el nombre, la pieza y cómo se monta (los textos van en su hoja). */
function celdaDeAnuncio(c, n) {
  const a = anuncioEn(c, n);
  const ang = c.angulosHuecos?.[n - 1];
  const lineaAngulo = ang ? `\nÁngulo: «${ang.nombre}»` : "";
  if (!a) return `Falta: producirla o escoger una publicación${lineaAngulo}`;
  return `${a.nombre}\n${textoDeLaPieza(a)}${lineaAngulo}${faltanTextos(a) ? "\n(faltan sus textos)" : "\n(textos en la hoja «Textos de los anuncios»)"}`;
}

/** El ángulo con el nombre de su producto (el del plan). Pura. */
const conProducto = (a, plan) => (a ? { ...a, producto: a.producto || (plan?.angulos ?? []).find((x) => claveAngulo(x) === claveAngulo(a))?.producto || "" } : a);

/**
 * Las hojas del Excel de estrategia de la agencia, hoja por hoja como la suya (`estrategia.txt`): arriba el
 * presupuesto mensual; luego «Campaña / Conjunto de anuncios / Anuncios», las columnas y una fila por conjunto, con lo
 * que es de la campaña (y los anuncios, los mismos en todos los conjuntos) en celdas combinadas.
 *   · Presentación: A Objetivo, B «Presupuesto de la campaña Advantage+» (No), C App de mensajes, D Objetivo de
 *     rendimiento, E Presupuesto Diario (el de cada conjunto), F Calendario, G Público, H Exclusiones, I Ubicaciones.
 *   · Las demás: A Objetivo, B «Presupuesto de la campaña Advantage+» (Sí/No), C Presupuesto diario (el de la campaña),
 *     D App de mensajes, E Objetivo de rendimiento, F Calendario, G Público, H Exclusiones, I Ubicaciones.
 * Debajo, los nombres para el Ads Manager. Una campaña que el plan no trae sale con su hoja y el motivo. Y una sexta hoja,
 * «Textos de los anuncios»: campaña, conjuntos, anuncio, publicación, cómo se monta, texto principal, títulos,
 * descripción y botón. → [{ nombre, filas: [[celda]], combinadas: ["A3:B3"], anchos: [n], cabeceras }]. Pura.
 */
export function hojasDelPlan(plan) {
  const hojas = Object.entries(HOJAS_EXCEL).map(([id, nombre]) => {
    const c = plan?.campanas.find((x) => x.id === id) ?? null;
    const anuncios = c?.anunciosPorConjunto ?? ANUNCIOS_DE_LA_HOJA[id];
    const presentacion = id === "presentacion";
    const cabecera = presentacion
      ? ["Objetivo", "Presupuesto de la campaña Advantage+", "App de Mensajes", "Objetivo de rendimiento", "Presupuesto Diario", "Calendario", "Público", "Exclusiones", "Ubicaciones"]
      : ["Objetivo", "Presupuesto de la campaña Advantage+", "Presupuesto diario", "App de Mensajes", "Objetivo de rendimiento", "Calendario", "Público", "Exclusiones", "Ubicaciones"];
    const ancho = cabecera.length + anuncios;
    const filaGrupo = Array(ancho).fill("");
    const finCampana = presentacion ? 1 : 2;
    filaGrupo[0] = "Campaña";
    filaGrupo[finCampana + 1] = "Conjunto de Anuncios";
    filaGrupo[cabecera.length] = "Anuncios";
    const filas = [
      [`Presupuesto Mensual (${plan?.moneda ?? "USD"}):`, c?.presupuesto.mensual ?? ""],
      [],
      filaGrupo,
      [...cabecera, ...Array.from({ length: anuncios }, (_, i) => `Anuncio ${i + 1}`)],
    ];
    const combinadas = [`A3:${col(finCampana)}3`, `${col(finCampana + 1)}3:${col(cabecera.length - 1)}3`, `${col(cabecera.length)}3:${col(ancho - 1)}3`];
    if (!c) {
      filas.push([id === "temporada" ? "Este mes no trae oferta ni fecha comercial (o se quitó del plan)."
        : plan?.que?.campanas?.length ? "No va este mes: no se escogió en «¿Qué vas a hacer?»." : "No va este mes: la cuenta es nueva (presentación y evaluación primero)."]);
    } else {
      const enCampana = c.presupuesto.en === "campana";
      const piezas = Array.from({ length: anuncios }, (_, i) => celdaDeAnuncio(c, i + 1));
      const app = c.appMensajes || "No aplica (lleva a la web)";
      const advantage = enCampana ? "Sí" : "No";
      const primera = filas.length + 1;
      c.conjuntos.forEach((x, k) => {
        const resto = [textoCalendario(c), textoPublico(x), textoExcluye(x), c.ubicaciones];
        const fila = presentacion
          ? [k === 0 ? c.nombreObjetivo : "", k === 0 ? advantage : "", k === 0 ? app : "", c.rendimiento, x.presupuestoDiario ?? "", ...resto]
          : [k === 0 ? c.nombreObjetivo : "", k === 0 ? advantage : "", k === 0 ? c.presupuesto.diario ?? "" : "", k === 0 ? app : "", c.rendimiento, ...resto];
        filas.push([...fila, ...(k === 0 ? piezas : Array(anuncios).fill(""))]);
      });
      // Lo que es de la campaña (y los anuncios, los mismos en cada conjunto) va en celdas combinadas, como en su Excel.
      const ultima = primera + c.conjuntos.length - 1;
      if (ultima > primera) {
        const deCampana = presentacion ? [0, 1, 2, 5, 7, 8] : [0, 1, 2, 3, 5, 7, 8];
        for (const i of [...deCampana, ...Array.from({ length: anuncios }, (_, k) => cabecera.length + k)]) combinadas.push(`${col(i)}${primera}:${col(i)}${ultima}`);
      }
      filas.push([], ["Nombres para el Ads Manager"], ["Campaña", c.nombre]);
      c.conjuntos.forEach((x, k) => filas.push([`Conjunto ${k + 1}`, x.nombre]));
      c.anuncios.forEach((a) => filas.push([`Anuncio ${a.n}`, a.nombre]));
    }
    return {
      nombre,
      filas,
      combinadas,
      anchos: [...cabecera.map((h) => (["Público", "Exclusiones"].includes(h) ? 48 : h.length > 20 ? 26 : 18)), ...Array(anuncios).fill(40)],
      cabeceras: [3, 4],
    };
  });
  hojas.push(hojaDeTextos(plan));
  return hojas;
}

/** La hoja «Textos de los anuncios»: una fila por anuncio del plan con todo lo que se copia en el Ads Manager. Pura. */
export function hojaDeTextos(plan) {
  const cabecera = ["Campaña", "Conjuntos", "Anuncio", "Publicación", "Cómo se monta", "Nivel", "Ángulo de venta", "Texto principal", "Títulos", "Descripción", "Botón"];
  const filas = [[`Textos de los anuncios · ${plan?.cliente ?? ""} · ${plan?.nombreMes ?? ""}`], [], cabecera];
  for (const c of plan?.campanas ?? []) {
    for (const a of c.anuncios) {
      const t = a.textos;
      filas.push([
        c.nombre,
        c.conjuntos.map((x) => x.nombre).join("\n"),
        a.nombre,
        a.nuevo ? "Anuncio nuevo (sin publicación)" : `«${a.pieza.titulo}»${a.pieza.fecha ? ` (${diaCorto(a.pieza.fecha)})` : ""}${a.pieza.enlaces?.instagram || a.pieza.enlaces?.facebook ? `\n${a.pieza.enlaces.instagram || a.pieza.enlaces.facebook}` : ""}`,
        a.como === "publicacion" ? "Usar la publicación existente" : "Subir la pieza",
        nombreDeNivel(a.nivel),
        textoAngulo(conProducto(a.angulo, plan)) || "—",
        a.como === "publicacion" ? `(El de la publicación, no se cambia)\n${a.caption ?? ""}`.trim() : (t?.textos ?? []).map((x, i) => `${i + 1}) ${x}`).join("\n\n") || "Falta",
        (t?.titulos ?? []).join("\n") || "Falta",
        t?.descripcion || "Falta",
        nombreDeBoton(t?.boton) || nombreDeBoton(botonPorDefecto(plan.destino)),
      ]);
    }
  }
  if (filas.length === 3) filas.push(["Todavía no hay anuncios con su pieza: escógelos en el plan."]);
  return { nombre: HOJA_TEXTOS, filas, combinadas: [], anchos: [30, 30, 28, 34, 20, 16, 30, 60, 32, 24, 22], cabeceras: [3] };
}

// ------------------------------------------------------------
// En texto
// ------------------------------------------------------------

/** El plan entero en texto: para copiarlo y lo que lee Claude (`plan_de_campanas`). Pura. */
export function planATextoCiclo(plan) {
  if (!plan) return "";
  const l = [];
  const moneda = plan.moneda;
  l.push(`PLAN DE CAMPAÑAS${plan.cliente ? ` · ${plan.cliente}` : ""} · ${plan.nombreMes}`);
  l.push(`${tipoNegocioDe(plan.tipo)?.nombre ?? "Productos"} · ${plan.destino === "web" ? "a la web" : "a WhatsApp"} · ${plan.cuenta === "nueva" ? "cuenta nueva" : plan.cuenta === "historial" ? "cuenta con historial" : "cuenta sin decir"} · objetivo: ${plan.nombreObjetivo}`);
  l.push(plan.inversion ? `Inversión del ciclo: ${dinero(plan.inversion, moneda)} (${plan.reparto.map((r) => `${r.nombre} ${String(r.pct).replace(".", ",")} %`).join(" · ")}${plan.repartoAMano ? ", repartido a mano" : ""})` : "Inversión del mes: sin números del negocio.");
  if (textoDelTotal(plan)) l.push(`Total del mes: ${textoDelTotal(plan)}.`);
  if (plan.productos?.length) l.push(`Productos: ${plan.productos.map((p) => `${p.nombre}${p.precio ? ` (${p.precio})` : ""}`).join(", ")}`);
  if (plan.que?.logro) l.push(`Lo que se quiere lograr: ${plan.que.logro}`);
  if (plan.angulos?.length) l.push(`Ángulos de venta que se prueban: ${plan.angulos.map((a) => textoAngulo(a)).join(", ")}`);
  if (plan.avisos.length) l.push("", "AVISOS", ...plan.avisos.map((a) => `- ${a.grave ? "[!] " : ""}${a.texto}`));
  if (plan.publicos.length) l.push("", "PÚBLICOS PERSONALIZADOS A CREAR", ...plan.publicos.map((p) => `- ${p.nombre}: ${p.que}`));
  for (const c of plan.campanas) {
    l.push("", `${c.nombreEtapa.toUpperCase()} · ${c.nombre}`);
    if (c.para) l.push(c.para);
    l.push(`Objetivo: ${c.nombreObjetivo} · ${c.rendimiento}${c.appMensajes ? ` · app de mensajes: ${c.appMensajes}` : ""}`);
    l.push(`Presupuesto: ${dinero(c.presupuesto.mensual, moneda)} en el periodo · ${c.presupuesto.en === "campana" ? `en la campaña (Advantage+), ${dinero(c.presupuesto.diario, moneda)} al día` : `en cada conjunto, ${dinero(c.presupuesto.porConjunto, moneda)} al día`} · ${textoCalendario(c)}`);
    if (c.contenido) l.push(`Qué dicen sus anuncios: ${c.contenido}`);
    l.push(`Tipos de arte: ${c.artes.map((a) => tipoArteDe(a)?.nombre).filter(Boolean).join(", ") || "—"} · niveles: ${c.niveles.map(nombreDeNivel).filter(Boolean).join(", ")}`);
    c.conjuntos.forEach((x, k) => l.push(`  Conjunto ${k + 1} · ${x.nombre}${c.presupuesto.en === "conjunto" ? ` · ${dinero(x.presupuestoDiario, moneda)} al día` : ""}`, `    Público: ${textoPublico(x)}`, `    Excluir: ${textoExcluye(x)}`));
    l.push(`  Anuncios (${c.anunciosPorConjunto} por conjunto, los mismos en todos):`);
    for (let i = 0; i < c.anunciosPorConjunto; i++) {
      const a = anuncioEn(c, i + 1);
      const ang = a?.angulo ?? c.angulosHuecos?.[i];
      l.push(`    ${i + 1}. ${a ? `${a.nombre} — ${textoDeLaPieza(a)} · nivel ${nombreDeNivel(a.nivel).toLowerCase()}` : "por producir"}${ang ? ` · ángulo ${textoAngulo(conProducto(ang, plan))}` : ""}`);
      if (a) {
        const t = textosATexto(a.textos, { conCaption: a.como === "publicacion" ? a.caption || "(el de la publicación)" : "" });
        if (t) l.push(t.split("\n").map((x) => `       ${x}`).join("\n"));
        else l.push("       (faltan sus textos)");
      }
    }
  }
  return l.join("\n").trim();
}

/** El nombre de la etapa (también «temporada»). Pura. */
export const nombreDeEtapaDelPlan = (id) => (id === "temporada" ? "Temporada" : nombreEtapaCiclo(id) || etapaCiclo(idEtapaCiclo(id))?.nombre || "");
