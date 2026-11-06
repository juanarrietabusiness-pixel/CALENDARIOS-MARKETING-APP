// ============================================================
// El CICLO DE VENTAS de la agencia (curso de campañas, Parte 1): las cuatro etapas, los tipos de negocio y los
// destinos. Puro y pequeño: lo leen el calendario (lo que va a pauta), la ficha «Números del negocio», el plan de
// campañas y el Worker. Las ideas del curso, con palabras propias (la licencia del método no deja copiar su texto).
//
// Las etapas de antes se siguen leyendo por alias: el embudo del mes (atraer, considerar, convertir, fidelizar) y
// el del estratega (frío, tibio, caliente). Nada guardado se reescribe: `etapaCiclo()` resuelve el id al leer.
// ============================================================

/** Las cuatro etapas, en orden. `niveles`: los de consciencia que toca (lib/consciencia.js); `reparto`: el % del
 *  presupuesto por defecto (editable en el Manual); `publico` y `excluye`: a quién se le habla y a quién no. */
export const ETAPAS_CICLO = Object.freeze([
  {
    id: "presentacion", nombre: "Presentación", corto: "Presentación",
    ayuda: "Gente que no conoce la marca: atraerla con la necesidad, el problema o lo más vendido.",
    niveles: ["inconsciente", "problema", "solucion"], reparto: 60,
    publico: "Intereses, públicos similares o segmentación abierta (gente nueva).",
    excluye: "Quien ya interactuó (evaluación), quien ya escribió (conversión) y quien ya compró (ascensión).",
  },
  {
    id: "evaluacion", nombre: "Evaluación", corto: "Evaluación",
    ayuda: "Quien ya vio a la marca y la compara: detalles, beneficios, pruebas y objeciones respondidas.",
    niveles: ["solucion", "producto"], reparto: 20,
    publico: "Quien interactuó con Facebook o Instagram, vio videos o visitó la web.",
    excluye: "Quien ya escribió (conversión) y quien ya compró (ascensión).",
  },
  {
    id: "conversion", nombre: "Conversión", corto: "Conversión",
    ayuda: "Quien ya decidió y necesita el empujón: testimonio, garantía, la oferta y un llamado claro.",
    niveles: ["producto"], reparto: 10,
    publico: "Quien escribió por mensaje, dio clic a un anuncio, abrió un formulario sin llenarlo o agregó al carrito.",
    excluye: "Quien ya compró (ascensión).",
  },
  {
    id: "ascension", nombre: "Ascensión", corto: "Ascensión",
    ayuda: "Quien ya compró: recompra, el segundo producto o el combo, y que lo recomiende.",
    niveles: ["decision"], reparto: 10,
    publico: "La lista de clientes y los compradores.",
    excluye: "Los compradores muy recientes.",
  },
]);

const POR_ID = new Map(ETAPAS_CICLO.map((e) => [e.id, e]));

/** Los ids de antes que se siguen leyendo: el embudo del mes y el del estratega. */
export const ALIAS_ETAPA = Object.freeze({
  atraer: "presentacion", considerar: "evaluacion", convertir: "conversion", fidelizar: "ascension",
  frio: "presentacion", tibio: "evaluacion", caliente: "conversion",
  // Sin tilde, con tilde o con mayúsculas: lo que escriba una persona o la IA.
  "presentación": "presentacion", "evaluación": "evaluacion", "conversión": "conversion", "ascensión": "ascension",
  "frío": "presentacion",
});

/** El id de etapa del ciclo para cualquier id de antes o nombre («Atraer», «tibio», «Ascensión»), o "". Pura. */
export function idEtapaCiclo(x) {
  const k = String(x ?? "").trim().toLowerCase();
  if (!k) return "";
  if (POR_ID.has(k)) return k;
  return ALIAS_ETAPA[k] ?? "";
}

/** La etapa del ciclo (el objeto) para un id o alias, o null. Pura. */
export const etapaCiclo = (x) => POR_ID.get(idEtapaCiclo(x)) ?? null;

/** El nombre de la etapa («Presentación») para un id o alias, o "". Pura. */
export const nombreEtapaCiclo = (x) => etapaCiclo(x)?.nombre ?? "";

/** Los tipos de negocio del curso: cada uno cambia qué pieza va en cada etapa. */
export const TIPOS_NEGOCIO = Object.freeze([
  { id: "productos", nombre: "Productos", ayuda: "Vende productos físicos (tienda, catálogo)." },
  { id: "servicios", nombre: "Servicios", ayuda: "Vende un servicio (clínica, taller, consultoría)." },
  { id: "segunda-necesidad", nombre: "Segunda necesidad", ayuda: "Lo que no se compra por urgencia: se antoja o se planea (decoración, viajes, joyería)." },
  { id: "suscripcion", nombre: "Suscripción", ayuda: "Un pago que se repite (membresía, gimnasio, plan mensual)." },
  { id: "nicho", nombre: "Nicho", ayuda: "Un público muy concreto que ya sabe lo que busca." },
  { id: "producto-nuevo", nombre: "Producto nuevo", ayuda: "Algo que el mercado aún no conoce: hay que explicarlo." },
  { id: "cursos", nombre: "Cursos y formación", ayuda: "Cursos, talleres, mentorías." },
]);
export const tipoNegocioDe = (id) => TIPOS_NEGOCIO.find((t) => t.id === id) ?? null;

/** A dónde lleva el anuncio: cambia el objetivo de la campaña y el número mágico. */
export const DESTINOS_NEGOCIO = Object.freeze([
  { id: "whatsapp", nombre: "WhatsApp", objetivo: "interaccion", metrica: "costo por conversación", ayuda: "La venta se cierra por mensaje." },
  { id: "web", nombre: "Tienda web", objetivo: "ventas", metrica: "ROAS", ayuda: "La venta se cierra en la web (e-commerce)." },
]);
export const destinoNegocioDe = (id) => DESTINOS_NEGOCIO.find((d) => d.id === id) ?? null;

/** ¿La cuenta publicitaria ya tiene historial? Una cuenta nueva arranca con presentación y evaluación. */
export const CUENTA_NEGOCIO = Object.freeze([
  { id: "nueva", nombre: "Cuenta nueva", ayuda: "Sin historial de campañas: presentación y evaluación primero." },
  { id: "historial", nombre: "Con historial", ayuda: "Ya tiene campañas y públicos: las cuatro etapas." },
]);
