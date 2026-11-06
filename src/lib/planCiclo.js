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
import { limpiarReparto, limpiarAnunciosPorConjunto } from "./manualCiclo.js";
import { limpiarPauta, limpiarAnuncio, problemasDePauta, deLaOferta, etapaSugerida, NIVEL_POR_ETAPA, nombreDeBoton, botonPorDefecto, primeraLinea } from "./pauta.js";
import { nombreDeNivel } from "./consciencia.js";
import { fechasDelMes } from "./fechasEspeciales.js";
import { sumarDias, diasEntre } from "./agenda.js";
import { limpiarEstudio, productosActivos } from "./estudioMercado.js";
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

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const r2 = (n) => Math.round(n * 100) / 100;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

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

/** Dónde va el presupuesto en cada campaña (como las hojas del Excel de estrategia). */
export const PRESUPUESTO_EN = Object.freeze({ presentacion: "conjunto", evaluacion: "campana", conversion: "conjunto", ascension: "campana", temporada: "conjunto" });

/**
 * Los conjuntos de una etapa. Presentación: 3 públicos (con historial, intereses + similares + Advantage+; en una
 * cuenta nueva, dos de intereses —uno por perfil del estudio— y Advantage+ sólo de prueba). Evaluación: quien
 * interactuó en 30 y en 90 días, sin Advantage+. Conversión: quien escribió (o dejó el carrito). Ascensión: la lista
 * de clientes. Temporada: quien ya conoce la marca y la lista. Pura.
 */
export function conjuntosDeEtapa(etapa, { nueva = false, web = false, perfiles = [], rubro = "" } = {}) {
  const sobre = rubro ? ` relacionados con ${rubro.toLowerCase()}` : " relacionados con lo que se vende";
  const fria = { publicos: web ? ["interaccion-90", "visitas-30", "clientes"] : ["interaccion-90", "clientes"],
    nota: "Si los anuncios de presentación y de evaluación se parecen mucho, se pueden quitar estas exclusiones." };
  const c = (id, tipo, nombre, publico, excluye, nota = "") => ({ id, tipo, nombre, publico, excluye, ...(nota ? { nota } : {}) });
  if (etapa === "presentacion") {
    const intereses = (n, perfil) => c(`c${n}`, "intereses", perfil ? `Intereses · ${corto(perfil.nombre, 40)}` : nueva ? `Intereses · grupo ${n}` : "Intereses",
      { texto: `Segmentación detallada con intereses amplios${sobre}${perfil?.quien ? `, pensados para ${corto(perfil.quien, 120).replace(/\.$/, "")}` : ""}.`, publicos: [], advantage: false }, fria);
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
    const excluye = { publicos: ["mensajes-30", "clientes"] };
    return [
      c("c1", "interaccion", "Interactuaron · 30 días", { texto: `Quien interactuó en los últimos 30 días.${web ? " Y quien visitó la web." : ""} ${sinAdvantage}`, publicos: web ? ["interaccion-30", "visitas-30"] : ["interaccion-30"], advantage: false }, excluye),
      c("c2", "interaccion", "Interactuaron · 90 días", { texto: `Quien interactuó en los últimos 90 días. ${sinAdvantage}`, publicos: ["interaccion-90"], advantage: false }, excluye),
    ];
  }
  if (etapa === "conversion") {
    return [c("c1", "mensajes", web ? "Carrito y visitas · 30 días" : "Escribieron · 30 días", {
      texto: web ? `Quien dejó algo en el carrito o visitó la web en los últimos 30 días. ${sinAdvantage}` : `Quien escribió por mensaje en los últimos 30 días (y, si se quiere, quien interactuó con un anuncio: compite con evaluación). ${sinAdvantage}`,
      publicos: web ? ["carrito-30", "visitas-30"] : ["mensajes-30"], advantage: false,
    }, { publicos: ["clientes"] }, "Si estos públicos son pequeños (menos de unas 1.000 personas) o el presupuesto es poco, todavía no conviene hacerla.")];
  }
  if (etapa === "ascension") {
    return [c("c1", "clientes", "Lista de clientes", { texto: `La lista de clientes (quien ya compró). ${sinAdvantage}`, publicos: ["clientes"], advantage: false },
      { publicos: [], nota: "Sin exclusiones, salvo que se anuncie a quien compró un producto concreto." })];
  }
  // La temporada: una oferta con fecha cierra mejor con quien ya conoce la marca.
  return [c("c1", "temporada", "Ya te conocen · 90 días", { texto: "Quien interactuó en los últimos 90 días y la lista de clientes: la oferta con fecha cierra mejor con quien ya conoce la marca.", publicos: ["interaccion-90", "clientes"], advantage: false },
    { publicos: [] }, "Si el presupuesto lo aguanta, un segundo conjunto con intereses amplios lleva la oferta a gente nueva.")];
}

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
    nombre: corto(nombreFechas || campana || "La oferta del mes", 80),
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

/** El reparto del Manual sobre las etapas que tocan, que vuelve a sumar 100 (75/25 en una cuenta nueva). Pura. */
export function repartoDelPlan(reparto, cuenta) {
  const r = limpiarReparto(reparto);
  const etapas = etapasDeLaCuenta(cuenta);
  const suma = etapas.reduce((s, e) => s + r[e.id], 0) || 1;
  return etapas.map((e) => ({ etapa: e.id, nombre: e.nombre, pct: Math.round((r[e.id] / suma) * 1000) / 10 }));
}

/**
 * El plan del ciclo (C.1). `negocio`: los números del negocio (limpios o no); `numeros`: { tasaDefecto?, inversion? }
 * (una inversión del mes escrita a mano manda sobre la de la meta); `manual`: el Manual de campañas; `mes`: «AAAA-MM»;
 * `calendario`: el de ese mes ({ offers, promoCode, campaign, opciones }); `kit`: el de la marca (sus tipos de arte);
 * `estudio`: el estudio de mercado (aprobado o borrador); `catalogo`; `temporada`: la de `temporadaDelMes` (o null) y
 * `ajustes.temporada` ({ incluir, diario }) lo que decidió la agencia de ella; `cliente`: { nombre, rubro }. Pura.
 */
export function planDelCiclo({
  negocio = null, numeros = {}, manual = null, mes = "", calendario = null, kit = null, estudio = null, catalogo = null,
  temporada = null, ajustes = {}, cliente = {}, moneda = "USD",
} = {}) {
  const n = limpiarNegocio(negocio);
  const m = limpiarManual(manual ?? {});
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

  const etapas = etapasDeLaCuenta(cuenta);
  const reparto = repartoDelPlan(m.reparto, cuenta);
  const anuncios = limpiarAnunciosPorConjunto(m.anunciosPorConjunto);
  const e = limpiarEstudio(estudio);
  const perfiles = e?.general?.perfiles ?? [];
  const artesMarca = limpiarTiposArte(kit?.tiposArte);
  const est = esObjeto(calendario?.opciones?.estrategia) ? calendario.opciones.estrategia : null;
  const productos = productosActivos(catalogo);
  const foco = productos.find((p) => p.id === est?.focoId) ?? null;
  const datosNombre = (nombreEtapa) => ({
    cliente: corto(cliente?.nombre, 60), etapa: nombreEtapa, objetivo: `${ciclo.nombreObjetivo}${web ? "" : " WhatsApp"}`,
    producto: foco?.nombre ?? "", mes: nombreDelMes(mes),
  });
  const nombreCampana = (datos) => nombreConPlantilla(plantillaConEtapa(m.nomenclatura.campana), datos);
  const primerDia = mesDelPlan(mes) ? `${mesDelPlan(mes).texto}-01` : "";

  const campana = ({ id, etapa, nombreEtapa, pct, mensual, inicio, fin = "", contenido = "", lleva = "", artes, niveles, extra = {} }) => {
    const conjuntos = conjuntosDeEtapa(etapa === "temporada" ? "temporada" : etapa, { nueva: cuenta === "nueva", web, perfiles, rubro: cliente?.rubro ?? "" });
    const en = PRESUPUESTO_EN[etapa] ?? "conjunto";
    const dias = fin ? diasEntre(inicio, fin) + 1 : DIAS_DEL_MES;
    const diario = mensual > 0 ? r2(mensual / dias) : null;
    const porConjunto = en === "conjunto" && diario ? r2(diario / conjuntos.length) : null;
    const nombre = nombreCampana(datosNombre(nombreEtapa));
    const conNombres = conjuntos.map((x) => ({
      ...x,
      nombre: nombreConPlantilla(m.nomenclatura.conjunto, { tipo: x.nombre, edad: "18-65+", lugar: "", etapa: nombreEtapa }) || x.nombre,
      nombreCorto: x.nombre,
      presupuestoDiario: porConjunto,
      publico: { ...x.publico, nombres: nombresDe(x.publico.publicos) },
      excluye: { ...x.excluye, nombres: nombresDe(x.excluye.publicos) },
    }));
    // Los tipos de arte: los de la etapa en este negocio, primero los de la marca (kit.tiposArte); los de la marca que
    // la etapa no trae no se fuerzan.
    const deLaEtapa = limpiarTiposArte(artes);
    const ordenados = [...deLaEtapa.filter((a) => artesMarca.includes(a)), ...deLaEtapa.filter((a) => !artesMarca.includes(a))];
    return {
      id, etapa, nombreEtapa, nombre, objetivo: ciclo.objetivo, nombreObjetivo: ciclo.nombreObjetivo, objetivoMeta: ciclo.objetivoMeta,
      rendimiento: RENDIMIENTO[ciclo.objetivo] ?? RENDIMIENTO.interaccion,
      appMensajes: web ? "" : "WhatsApp",
      pct, presupuesto: { mensual: mensual > 0 ? r2(mensual) : null, diario, en, porConjunto, dias },
      calendario: { inicio, fin },
      ubicaciones: "Advantage+ (automáticas)",
      contenido, lleva, artes: ordenados, niveles,
      conjuntos: conNombres, anunciosPorConjunto: anuncios,
      anuncios: [], faltan: null,
      ...extra,
    };
  };

  const campanas = etapas.map((et) => {
    const r = reparto.find((x) => x.etapa === et.id);
    const delCiclo = ciclo.etapas.find((x) => x.id === et.id);
    return campana({
      id: et.id, etapa: et.id, nombreEtapa: et.nombre, pct: r?.pct ?? 0,
      mensual: inversion ? (inversion * (r?.pct ?? 0)) / 100 : 0, inicio: primerDia,
      contenido: delCiclo?.contenido ?? "", lleva: delCiclo?.lleva ?? "", artes: delCiclo?.artes ?? [], niveles: et.niveles,
    });
  });

  // La temporada: opcional, con su presupuesto APARTE del reparto y lo que dura su fecha.
  const ajT = esObjeto(ajustes?.temporada) ? ajustes.temporada : {};
  let tempo = temporada;
  if (!tempo && ajT.incluir === true && mesDelPlan(mes)) {
    const mm = mesDelPlan(mes);
    tempo = { nombre: "Temporada", motivo: "La pidió la agencia", fechas: [], inicio: primerDia, fin: ultimoDia(mm), dias: diasEntre(primerDia, ultimoDia(mm)) + 1, ofertas: "", codigo: "" };
  }
  const conTemporada = Boolean(tempo) && ajT.incluir !== false;
  if (conTemporada) {
    const diarioEscrito = numero(ajT.diario);
    const diario = diarioEscrito > 0 ? r2(diarioEscrito) : inversion ? r2((inversion * PCT_TEMPORADA) / 100 / DIAS_DEL_MES) : null;
    const conversion = ciclo.etapas.find((x) => x.id === "conversion");
    campanas.push(campana({
      id: "temporada", etapa: "temporada", nombreEtapa: "Temporada", pct: null,
      mensual: diario ? diario * tempo.dias : 0, inicio: tempo.inicio, fin: tempo.fin,
      contenido: `${tempo.nombre}: la oferta con fecha${tempo.ofertas ? ` (${tempo.ofertas})` : ""}, dicha sin rodeos y con su fecha de fin.`,
      lleva: conversion?.lleva ?? "", artes: ["promocion", "producto", "testimonio"], niveles: ["producto", "decision"],
      extra: { temporada: { ...tempo, diarioSugerido: !(diarioEscrito > 0) } },
    }));
  } else if (tempo && ajT.incluir === false) {
    avisos.push({ codigo: "temporada-quitada", grave: false, texto: `El mes trae ${tempo.nombre}: la campaña de temporada se quitó del plan (se vuelve a poner con «Incluir la de temporada»).` });
  }

  // Presupuestos que casi no salen.
  for (const c of campanas) {
    const d = c.presupuesto.en === "conjunto" ? c.presupuesto.porConjunto : c.presupuesto.diario;
    if (d !== null && d < MIN_DIARIO) {
      avisos.push({ codigo: "presupuesto-bajo", grave: false, campana: c.id, texto: `${c.nombreEtapa}: ${c.presupuesto.en === "conjunto" ? "cada conjunto" : "la campaña"} queda con ${dinero(d, moneda)} al día, por debajo de ${dinero(MIN_DIARIO, moneda)}: Meta casi no la va a mostrar. Junta conjuntos o sube el presupuesto.` });
    }
  }
  const conv = campanas.find((c) => c.id === "conversion");
  if (conv && conv.presupuesto.mensual !== null && conv.presupuesto.mensual < 60) {
    avisos.push({ codigo: "conversion-chica", grave: false, campana: "conversion", texto: "Conversión con poco presupuesto: si los públicos de quien escribió son pequeños, todavía no conviene hacerla (su parte puede ir a presentación)." });
  }

  // Las 7 maletas del producto foco (o de los activos, si no hay foco): si falta una, no se lanza.
  const aMirar = foco ? [foco] : productos.slice(0, 3);
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

  return {
    v: 1, mes, nombreMes: nombreDelMes(mes), cliente: corto(cliente?.nombre, 80), moneda,
    tipo: ciclo.tipo, destino: ciclo.destino, cuenta, objetivo: ciclo.objetivo, nombreObjetivo: ciclo.nombreObjetivo,
    inversion, inversionDe, reparto, anunciosPorConjunto: anuncios, nomenclaturaAnuncio: m.nomenclatura.anuncio,
    temporada: tempo ? { ...tempo, incluida: conTemporada } : null,
    foco: foco ? { id: foco.id, nombre: foco.nombre } : null,
    campanas, publicos, maletas, avisos,
  };
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
 * year, month, days }]; `cola`: las filas de `publicaciones_programadas` (red, estado, variante, calendar_id, post_id,
 * externo_id, enlace); `metricas`: las de `metricas_publicacion` del cliente. Lo PUBLICADO entra con su «rinde» (la
 * cuenta de «Lo mejor») y si su texto sirve para pauta; lo marcado «Va a pauta», con su etapa. → [{ calendarId,
 * postId, fecha, titulo, formato, publicada, enlaces, rinde, pauta, tipoArte, composicion, nivel, productoId, medios,
 * textos, sirve, motivo }]. Pura.
 */
export function candidatasDelCalendario({ calendarios = [], cola = [], metricas = [], destino = "", artesMarca = [] } = {}) {
  const enCola = new Map();
  for (const f of cola) {
    if (f?.variante && f.variante !== "post") continue;
    if (f?.estado !== "publicada") continue;
    const k = `${f.calendar_id}|${f.post_id}`;
    if (!enCola.has(k)) enCola.set(k, []);
    enCola.get(k).push(f);
  }
  const rindes = rindesDePropias(metricas);
  const porExterno = new Map(metricas.map((f) => [`${f.red}:${f.externo_id}`, f]));
  const salida = [];
  for (const cal of calendarios) {
    for (const d of cal.days ?? []) {
      for (const post of d.posts ?? []) {
        if (!post?.id || post.format === "live") continue;
        const filas = enCola.get(`${cal.id}|${post.id}`) ?? [];
        const publicada = filas.length > 0 || post.status === "published";
        const pauta = limpiarPauta(post.pauta);
        if (!publicada && !pauta) continue;
        // Una historia publicada ya no está: sólo sirve si alguien la marcó para pauta (se sube la pieza).
        if (post.format === "historia" && !pauta) continue;
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
          calendarId: cal.id, postId: post.id, fecha: d.date ?? "", titulo: corto(post.title || primeraLinea(post.idea) || primeraLinea(post.descripcion), 80) || "(sin título)",
          formato: post.format ?? "post", publicada, enlaces, rinde, senal, pauta,
          tipoArte: tipoArteDePost(post, artesMarca), composicion: post.composicion ?? "", nivel: post.nivel ?? "", productoId: post.productoId ?? "",
          medios, textos: limpiarAnuncio(post.anuncio, { destino }), sirve: !impiden.length, motivo: impiden[0]?.texto ?? "",
          deOferta: false, post,
        });
      }
    }
  }
  return salida;
}

const claveDiversidad = (p) => (p.tipoArte && p.composicion ? `${p.tipoArte}|${p.composicion}` : "");

/**
 * Pone las piezas en cada campaña (C.2) y dice lo que falta. Primero lo PUBLICADO que rindió (RINDE_PARA_PAUTA o más)
 * y cuyo texto sirve para pauta: a su etapa si va a pauta, si no a presentación (o evaluación si presentación ya está
 * llena); luego lo marcado «Va a pauta» con esa etapa (las del mes del plan primero). En la de temporada, lo de la
 * oferta. Una pieza va en UNA campaña. Dos con el mismo tipo de arte y la misma composición son una para Meta: la
 * segunda no se pone y se avisa. `ofertas`/`codigo`: los del calendario del mes. Pura.
 */
export function conPiezas(plan, candidatas = [], { ofertas = "", codigo = "", hoy = "", aprendido = null } = {}) {
  if (!plan) return plan;
  const usadas = new Set();
  const avisos = [...plan.avisos.filter((a) => a.codigo !== "diversidad" && a.codigo !== "faltan-piezas" && a.codigo !== "aprendido")];
  // Lo que se aprendió de sus anuncios (lib/aprenderAnuncios.js): el tipo de arte más barato va primero en lo que falta
  // y el más caro, al final. Sólo ordena: los tipos de cada etapa no cambian.
  const deArte = (lista) => (Array.isArray(aprendido?.[lista]) ? aprendido[lista] : []).filter((x) => x?.rasgo === "tipoArte").map((x) => x.id);
  const masBarato = deArte("mejores");
  const masCaro = deArte("peores");
  const peso = (a) => (masBarato.includes(a) ? 0 : masCaro.includes(a) ? 2 : 1);
  const mes = plan.mes;
  const ids = new Set(plan.campanas.map((c) => c.id));
  const llenas = new Map(plan.campanas.map((c) => [c.id, []]));
  const parecidas = [];
  const clave = (p) => `${p.calendarId}|${p.postId}`;
  const poner = (campanaId, p, origen) => {
    const c = plan.campanas.find((x) => x.id === campanaId);
    const ya = llenas.get(campanaId);
    if (!c || ya.length >= c.anunciosPorConjunto || usadas.has(clave(p))) return false;
    const k = claveDiversidad(p);
    const igual = k && ya.find((x) => claveDiversidad(x.pieza) === k);
    if (igual) { parecidas.push({ campana: c, pieza: p, igual: igual.pieza }); return false; }
    ya.push({ pieza: p, origen });
    usadas.add(clave(p));
    return true;
  };
  const conOferta = candidatas.map((p) => ({ ...p, deOferta: deLaOferta(p.post ?? {}, { ofertas, codigo }) }));

  // 1. Lo publicado que mejor funcionó en orgánico.
  const buenas = conOferta.filter((p) => p.publicada && p.sirve && p.rinde !== null && p.rinde >= RINDE_PARA_PAUTA && p.formato !== "historia")
    .sort((a, b) => (b.senal ?? 0) - (a.senal ?? 0));
  for (const p of buenas) {
    // A su etapa si va a pauta; si no, la que pide su nivel (lo del producto, a evaluación) y, por defecto,
    // presentación: lo que mejor funcionó en orgánico es lo primero que ve quien no conoce la marca.
    const suya = p.pauta?.etapa && ids.has(p.pauta.etapa) ? p.pauta.etapa : null;
    if (suya) { poner(suya, p, "publicada"); continue; }
    const sugerida = etapaSugerida(p.post ?? {});
    if (sugerida !== "presentacion" && ids.has(sugerida) && poner(sugerida, p, "publicada")) continue;
    if (!poner("presentacion", p, "publicada")) poner("evaluacion", p, "publicada");
  }
  // 2. Lo marcado «Va a pauta»: las del mes del plan primero, en el orden del calendario.
  const marcadas = conOferta.filter((p) => p.pauta && !usadas.has(clave(p)))
    .sort((a, b) => Number(b.fecha.startsWith(mes)) - Number(a.fecha.startsWith(mes)) || (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const temporada = plan.campanas.find((c) => c.id === "temporada");
  for (const p of marcadas) {
    // La oferta del mes va primero a la temporada (si la hay y la pieza cae en sus fechas o es del mes).
    if (temporada && p.deOferta && (p.fecha.startsWith(mes) || (p.fecha >= temporada.calendario.inicio && p.fecha <= temporada.calendario.fin))) {
      if (poner("temporada", p, "pauta")) continue;
    }
    if (ids.has(p.pauta.etapa)) poner(p.pauta.etapa, p, "pauta");
  }

  const campanas = plan.campanas.map((c) => {
    const puestas = llenas.get(c.id);
    const anuncios = puestas.map((x, i) => ({ n: i + 1, ...anuncioDe(x.pieza, x.origen, c, plan, i, hoy) }));
    const n = c.anunciosPorConjunto - anuncios.length;
    const cubiertos = new Set(puestas.map((x) => x.pieza.tipoArte).filter(Boolean));
    const porPeso = (lista) => [...lista].sort((a, b) => peso(a) - peso(b));
    const artes = [...porPeso(c.artes.filter((a) => !cubiertos.has(a))), ...porPeso(c.artes.filter((a) => cubiertos.has(a)))];
    const nivel = c.etapa === "temporada" ? "producto" : NIVEL_POR_ETAPA[c.etapa] ?? "";
    return { ...c, anuncios, faltan: n > 0 ? { n, etapa: c.etapa === "temporada" ? "conversion" : c.etapa, nivel, artes, productoId: plan.foco?.id ?? "" } : null };
  });
  for (const x of parecidas) {
    avisos.push({ codigo: "diversidad", grave: false, campana: x.campana.id,
      texto: `${x.campana.nombreEtapa}: «${x.pieza.titulo}» (${diaCorto(x.pieza.fecha)}) tiene el mismo tipo de arte y la misma composición que «${x.igual.titulo}» (${diaCorto(x.igual.fecha)}). Para Meta serían UN solo anuncio: se dejó una y la otra se pide nueva.` });
  }
  const faltan = campanas.reduce((s, c) => s + (c.faltan?.n ?? 0), 0);
  if (faltan) avisos.push({ codigo: "faltan-piezas", grave: false, texto: `Faltan ${faltan} ${faltan === 1 ? "pieza" : "piezas"} para completar los anuncios: «Producir los anuncios que faltan» las pide al lote ya marcadas «Va a pauta».` });
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

/** Un anuncio con su pieza: cómo se monta (la publicación existente o subiendo la pieza), su nombre y sus textos. */
function anuncioDe(p, origen, c, plan, i, hoy) {
  const enlace = p.enlaces.instagram || p.enlaces.facebook || "";
  const comoMontar = p.publicada && enlace && p.sirve && (p.pauta?.como ?? "") !== "anuncio" ? "publicacion" : "subir";
  const formato = p.formato === "carrusel" ? "Carrusel" : p.formato === "reel" ? "Reel" : p.formato === "historia" ? "Historia" : "Pieza";
  const tipoArte = tipoArteDe(p.tipoArte)?.nombre ?? "";
  const nombre = nombreConPlantilla(plan.nomenclaturaAnuncio || limpiarManual({}).nomenclatura.anuncio, { numero: String(i + 1), formato, angulo: tipoArte || corto(p.titulo, 30), etapa: c.nombreEtapa });
  const futura = !p.publicada && p.fecha && hoy && p.fecha >= hoy;
  return {
    nombre, origen, como: comoMontar,
    pieza: {
      calendarId: p.calendarId, postId: p.postId, fecha: p.fecha, titulo: p.titulo, formato: p.formato, tipoArte: p.tipoArte, composicion: p.composicion,
      nivel: p.nivel, rinde: p.rinde, enlaces: p.enlaces, medios: p.medios.slice(0, 10), textos: p.textos,
      boton: p.textos?.boton ?? botonPorDefecto(plan.destino), motivo: p.motivo,
      ...(futura ? { sale: p.fecha } : {}),
    },
  };
}

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
const textoPublico = (x) => [x.publico.texto, x.publico.nombres.length ? `Públicos: ${x.publico.nombres.join(", ")}.` : ""].filter(Boolean).join(" ");
const textoExcluye = (x) => (x.excluye.nombres.length ? `${x.excluye.nombres.join(", ")}.${x.excluye.nota ? ` ${x.excluye.nota}` : ""}` : x.excluye.nota || "Ninguna.");

/** Cómo se monta una pieza, en una línea (también para el Excel). Pura. */
export function textoDeLaPieza(a) {
  if (!a?.pieza) return "";
  const p = a.pieza;
  const enlace = p.enlaces?.instagram || p.enlaces?.facebook || "";
  const base = `«${p.titulo}»${p.fecha ? ` (${diaCorto(p.fecha)})` : ""}${p.rinde ? ` · rindió ${String(p.rinde).replace(".", ",")}×` : ""}`;
  if (a.como === "publicacion") return `${base} · usar la publicación: ${enlace}`;
  return `${base} · subir la pieza${p.sale ? ` (sale el ${diaCorto(p.sale)}; desde entonces se puede usar la publicación)` : ""}`;
}

/**
 * Los pasos para montar el plan en el Ads Manager, en su orden: los públicos personalizados; y por campaña, la
 * campaña, el primer conjunto, sus anuncios y los demás conjuntos (se duplica el primero y se cambia el público). Cada
 * paso: { id, nivel, titulo, campos: [{ etiqueta, valor, copiar }], nota? }. El `id` es estable (lo usa el progreso
 * guardado): «publico:<id>», «<campaña>:campana», «<campaña>:<conjunto>», «<campaña>:a<n>». Pura.
 */
export function guiaDeMontaje(plan) {
  if (!plan) return [];
  const pasos = [];
  const moneda = plan.moneda;
  for (const p of plan.publicos) {
    pasos.push({ id: `publico:${p.id}`, nivel: "publico", grupo: "publicos", titulo: `Crear el público «${p.nombre}»`,
      campos: [{ etiqueta: "Nombre", valor: p.nombre, copiar: true }, { etiqueta: "Quién entra", valor: p.que }, { etiqueta: "Cómo", valor: p.como }] });
  }
  for (const c of plan.campanas) {
    const enCampana = c.presupuesto.en === "campana";
    pasos.push({
      id: `${c.id}:campana`, nivel: "campana", grupo: c.id, titulo: `Campaña de ${c.nombreEtapa.toLowerCase()}`,
      campos: [
        { etiqueta: "Nombre", valor: c.nombre, copiar: true },
        { etiqueta: "Objetivo", valor: c.nombreObjetivo },
        { etiqueta: "Prueba A/B", valor: "Desactivada" },
        { etiqueta: "Presupuesto de la campaña Advantage+", valor: enCampana ? `Activado: ${dinero(c.presupuesto.diario, moneda)} al día` : "Desactivado (el presupuesto va en cada conjunto)", copiar: enCampana },
        { etiqueta: "Presupuesto del mes", valor: dinero(c.presupuesto.mensual, moneda) },
      ],
      nota: c.contenido ? `Qué dicen sus anuncios: ${c.contenido}` : "",
    });
    const conjuntoCampos = (x) => [
      { etiqueta: "Nombre", valor: x.nombre, copiar: true },
      ...(enCampana ? [] : [{ etiqueta: "Presupuesto diario", valor: dinero(x.presupuestoDiario, moneda), copiar: true }]),
      ...(c.appMensajes ? [{ etiqueta: "App de mensajes", valor: c.appMensajes }] : []),
      { etiqueta: "Objetivo de rendimiento", valor: c.rendimiento },
      { etiqueta: "Puja", valor: "Automática (control de puja en blanco)" },
      { etiqueta: "Calendario", valor: textoCalendario(c) },
      { etiqueta: "Público", valor: textoPublico(x) },
      { etiqueta: "Excluir", valor: textoExcluye(x) },
      { etiqueta: "Público Advantage+", valor: x.publico.advantage ? "Activado" : "Desactivado" },
      { etiqueta: "Ubicaciones", valor: c.ubicaciones },
    ];
    const [primero, ...resto] = c.conjuntos;
    if (primero) pasos.push({ id: `${c.id}:${primero.id}`, nivel: "conjunto", grupo: c.id, titulo: `Conjunto 1 · ${primero.nombreCorto}`, campos: conjuntoCampos(primero), nota: primero.nota ?? "" });
    for (let i = 0; i < c.anunciosPorConjunto; i++) {
      const a = c.anuncios[i];
      const campos = [{ etiqueta: "Nombre", valor: a?.nombre ?? `${i + 1} · (por producir)`, copiar: Boolean(a) }];
      if (!a) {
        campos.push({ etiqueta: "Pieza", valor: `Falta: producirla (${c.artes.slice(0, 3).map((x) => tipoArteDe(x)?.nombre).filter(Boolean).join(" o ") || "un tipo de arte distinto"}, nivel ${nombreDeNivel(c.faltan?.nivel ?? "").toLowerCase() || "de su etapa"}).` });
      } else if (a.como === "publicacion") {
        campos.push({ etiqueta: "Configuración del anuncio", valor: "Usar una publicación existente" });
        campos.push({ etiqueta: "Publicación", valor: a.pieza.enlaces.instagram || a.pieza.enlaces.facebook, copiar: true, enlace: true });
      } else {
        campos.push({ etiqueta: "Configuración del anuncio", valor: "Crear anuncio (subir la pieza)" });
        campos.push({ etiqueta: "Pieza", valor: textoDeLaPieza(a) });
        a.pieza.textos?.textos?.forEach((t, k) => campos.push({ etiqueta: `Texto principal ${k + 1}`, valor: t, copiar: true }));
        a.pieza.textos?.titulos?.forEach((t, k) => campos.push({ etiqueta: `Título ${k + 1}`, valor: t, copiar: true }));
        if (a.pieza.textos?.descripcion) campos.push({ etiqueta: "Descripción", valor: a.pieza.textos.descripcion, copiar: true });
        if (!a.pieza.textos) campos.push({ etiqueta: "Textos", valor: "Le faltan sus textos de anuncio: se escriben en la publicación («Va a pauta»)." });
      }
      if (a) {
        campos.push({ etiqueta: "Botón", valor: nombreDeBoton(a.pieza.boton) || nombreDeBoton(botonPorDefecto(plan.destino)) });
        campos.push({ etiqueta: "Multianunciante", valor: "Activado" });
      }
      pasos.push({ id: `${c.id}:a${i + 1}`, nivel: "anuncio", grupo: c.id, titulo: `Anuncio ${i + 1}${a ? ` · ${a.pieza.titulo}` : " · por producir"}`, campos, pieza: a?.pieza ?? null,
        nota: a ? "Revisa cómo sale en historias y reels, y las mejoras automáticas de la pieza: activa sólo las que convengan." : "" });
    }
    resto.forEach((x, k) => pasos.push({ id: `${c.id}:${x.id}`, nivel: "conjunto", grupo: c.id, titulo: `Conjunto ${k + 2} · ${x.nombreCorto}`,
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
// El Excel de estrategia de la agencia (5 hojas)
// ------------------------------------------------------------

/** El nombre de cada hoja, como el Excel de la agencia (la quinta, la de temporada). */
export const HOJAS_EXCEL = Object.freeze({ presentacion: "Presentación", evaluacion: "Evaluación", conversion: "Conversión", ascension: "Ascensión", temporada: "Campaña Especial (temporada)" });

/**
 * Las 5 hojas con las columnas del Excel de estrategia de la agencia, llenas con el plan: arriba el presupuesto mensual,
 * luego «Campaña / Conjunto de anuncios / Anuncios», las columnas y una fila por conjunto; debajo, los nombres para el
 * Ads Manager. Una campaña que el plan no trae (cuenta nueva) sale con su hoja y el motivo. → [{ nombre, filas: [[celda]],
 * combinadas: ["A3:B3"], anchos: [n] }]; una celda es texto o número. Pura.
 */
export function hojasDelPlan(plan) {
  return Object.entries(HOJAS_EXCEL).map(([id, nombre]) => {
    const c = plan?.campanas.find((x) => x.id === id) ?? null;
    const anuncios = c?.anunciosPorConjunto ?? plan?.anunciosPorConjunto ?? 4;
    // Presentación pone «App de mensajes» y «Objetivo de rendimiento» antes del presupuesto diario (como la hoja de la agencia).
    const presentacion = id === "presentacion";
    const cabecera = presentacion
      ? ["Objetivo", "Presupuesto de la campaña Advantage+", "App de Mensajes", "Objetivo de rendimiento", "Presupuesto Diario", "Calendario", "Público", "Exclusiones", "Ubicaciones"]
      : ["Objetivo", "Presupuesto de la campaña Advantage+", "Presupuesto diario", "App de Mensajes", "Objetivo de rendimiento", "Calendario", "Público", "Exclusiones", "Ubicaciones"];
    const ancho = cabecera.length + anuncios;
    const filaGrupo = Array(ancho).fill("");
    filaGrupo[0] = "Campaña";
    filaGrupo[presentacion ? 2 : 3] = "Conjunto de Anuncios";
    filaGrupo[cabecera.length] = "Anuncios";
    const filas = [
      [`Presupuesto Mensual (${plan?.moneda ?? "USD"}):`, c?.presupuesto.mensual ?? ""],
      [],
      filaGrupo,
      [...cabecera, ...Array.from({ length: anuncios }, (_, i) => `Anuncio ${i + 1}`)],
    ];
    if (!c) {
      filas.push([id === "temporada" ? "Este mes no trae oferta ni fecha comercial (o se quitó del plan)." : "No va este mes: la cuenta es nueva (presentación y evaluación primero)."]);
    } else {
      const enCampana = c.presupuesto.en === "campana";
      const piezas = Array.from({ length: anuncios }, (_, i) => (c.anuncios[i] ? textoDeLaPieza(c.anuncios[i]) : "Falta: producirla"));
      c.conjuntos.forEach((x, k) => {
        const presupuestoCampana = enCampana ? (k === 0 ? c.presupuesto.diario ?? "" : "") : "Desactivado";
        const diario = enCampana ? "" : x.presupuestoDiario ?? "";
        const app = c.appMensajes || "No aplica (lleva a la web)";
        const resto = [textoCalendario(c), textoPublico(x), textoExcluye(x), c.ubicaciones];
        const fila = presentacion
          ? [k === 0 ? c.nombreObjetivo : "", presupuestoCampana, app, c.rendimiento, diario, ...resto]
          : [k === 0 ? c.nombreObjetivo : "", presupuestoCampana, diario, app, c.rendimiento, ...resto];
        filas.push([...fila, ...piezas]);
      });
      filas.push([], ["Nombres para el Ads Manager"], ["Campaña", c.nombre]);
      c.conjuntos.forEach((x, k) => filas.push([`Conjunto ${k + 1}`, x.nombre]));
      c.anuncios.forEach((a, k) => filas.push([`Anuncio ${k + 1}`, a.nombre]));
    }
    const col = (i) => String.fromCharCode(65 + i);
    const finConjunto = cabecera.length - 1;
    return {
      nombre,
      filas,
      combinadas: [`A3:${col(presentacion ? 1 : 2)}3`, `${col(presentacion ? 2 : 3)}3:${col(finConjunto)}3`, `${col(cabecera.length)}3:${col(ancho - 1)}3`],
      anchos: [...cabecera.map((h) => (["Público", "Exclusiones"].includes(h) ? 48 : h.length > 20 ? 26 : 18)), ...Array(anuncios).fill(40)],
      cabeceras: [3, 4],
    };
  });
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
  l.push(plan.inversion ? `Inversión del mes: ${dinero(plan.inversion, moneda)} (${plan.reparto.map((r) => `${r.nombre} ${String(r.pct).replace(".", ",")} %`).join(" · ")})` : "Inversión del mes: sin números del negocio.");
  if (plan.avisos.length) l.push("", "AVISOS", ...plan.avisos.map((a) => `- ${a.grave ? "[!] " : ""}${a.texto}`));
  if (plan.publicos.length) l.push("", "PÚBLICOS PERSONALIZADOS A CREAR", ...plan.publicos.map((p) => `- ${p.nombre}: ${p.que}`));
  for (const c of plan.campanas) {
    l.push("", `${c.nombreEtapa.toUpperCase()} · ${c.nombre}`);
    l.push(`Objetivo: ${c.nombreObjetivo} · ${c.rendimiento}${c.appMensajes ? ` · app de mensajes: ${c.appMensajes}` : ""}`);
    l.push(`Presupuesto: ${dinero(c.presupuesto.mensual, moneda)} en el periodo · ${c.presupuesto.en === "campana" ? `en la campaña (Advantage+), ${dinero(c.presupuesto.diario, moneda)} al día` : `en cada conjunto, ${dinero(c.presupuesto.porConjunto, moneda)} al día`} · ${textoCalendario(c)}`);
    if (c.contenido) l.push(`Qué dicen sus anuncios: ${c.contenido}`);
    l.push(`Tipos de arte: ${c.artes.map((a) => tipoArteDe(a)?.nombre).filter(Boolean).join(", ") || "—"} · niveles: ${c.niveles.map(nombreDeNivel).filter(Boolean).join(", ")}`);
    c.conjuntos.forEach((x, k) => l.push(`  Conjunto ${k + 1} · ${x.nombre}${c.presupuesto.en === "conjunto" ? ` · ${dinero(x.presupuestoDiario, moneda)} al día` : ""}`, `    Público: ${textoPublico(x)}`, `    Excluir: ${textoExcluye(x)}`));
    l.push(`  Anuncios (${c.anunciosPorConjunto} por conjunto, los mismos en todos):`);
    for (let i = 0; i < c.anunciosPorConjunto; i++) {
      const a = c.anuncios[i];
      l.push(`    ${i + 1}. ${a ? `${a.nombre} — ${textoDeLaPieza(a)}` : "por producir"}`);
    }
  }
  return l.join("\n").trim();
}

/** El nombre de la etapa (también «temporada»). Pura. */
export const nombreDeEtapaDelPlan = (id) => (id === "temporada" ? "Temporada" : nombreEtapaCiclo(id) || etapaCiclo(idEtapaCiclo(id))?.nombre || "");
