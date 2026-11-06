// ============================================================
// El SEMÁFORO del kit: qué le falta a un cliente para que el diseño salga bien (puro)
//
// Fase 7 (docs/propuesta-lo-mejor-y-creacion.md). Una pieza sale bien si el motor tiene con qué: el logo de la marca,
// las fotos REALES de lo que vende, las plantillas y los «Me gusta» que el director mira, la ficha técnica que la IA
// lee en todo lo que escribe y la voz de los videos. Cuando falta algo, el motor se lo inventa (un logo, una caja) o
// sale genérico, y nadie sabía por qué.
//
// Se calcula con lo que YA devuelve GET /api/estudio (kit, productos con fotos, `sinFotos`, archivos con su «Me gusta»,
// `perdidas`) y, si se tiene, el estado del cerebro (GET /api/cerebro/<c>: `conFicha`, `fichaVieja`): ninguna consulta
// nueva. Cada punto lleva su arreglo, a un toque: a dónde ir (`ir`: [pestaña, sub-sección]) o qué hacer (`accion`).
// Desde el curso de campañas (entrega 8), también el ESTUDIO DE MERCADO, que se revisa una vez al mes
// (`estudioMercado` de la misma respuesta: cuándo se aprobó y si hay un borrador).
// ============================================================

export const ESTADOS_SEMAFORO = Object.freeze({
  verde: { nombre: "Listo", icono: "check" },
  ambar: { nombre: "Mejorable", icono: "alert" },
  rojo: { nombre: "Falta", icono: "alert" },
});

/** Cuántos «Me gusta» hacen falta para que el director tenga de dónde aprender el gusto de la agencia. */
export const MIN_GUSTOS = 3;

/**
 * Cada cuántos días se revisa el estudio de mercado (curso de campañas, módulo 3: la competencia, las objeciones y lo
 * que dicen los clientes cambian; se mira al menos una vez al mes).
 */
export const DIAS_REVISAR_ESTUDIO = 30;

const lista = (x) => (Array.isArray(x) ? x : []);
const nombres = (xs, max = 3) => {
  const n = xs.map((p) => `«${p.nombre}»`);
  return n.length > max ? `${n.slice(0, max).join(", ")} y ${n.length - max} más` : n.join(n.length === 2 ? " y " : ", ");
};

/** ¿El kit tiene algo de la marca (paleta, letra, estilo…)? Lo mismo que `kitVacio` en lo que importa aquí, sin cargarlo. */
export const kitConMarca = (kit) => Boolean(lista(kit?.paleta).length || kit?.tipografia || kit?.estilo || kit?.luz || lista(kit?.reglas).length);

/**
 * Los puntos del semáforo: [{ id, nombre, estado («verde» | «ambar» | «rojo»), texto, arreglo }]. Sin `estudio` (aún no
 * se leyó), lista vacía. Sin `cerebro`, la ficha técnica no sale (no se sabe). Pura.
 */
export function semaforoDelKit({ estudio = null, cerebro = null, ahora = Date.now() } = {}) {
  if (!estudio) return [];
  const kit = estudio.kit ?? {};
  const conFotos = lista(estudio.productos);
  const sinFotos = lista(estudio.sinFotos);
  const perdidas = lista(estudio.perdidas);
  const gustos = lista(estudio.archivos).filter((a) => a.favorito && a.tipo === "imagen").length;
  const plantillas = lista(kit.plantillas).length;
  const puntos = [];

  puntos.push(kitConMarca(kit)
    ? { id: "kit", nombre: "Kit de marca", estado: "verde", texto: "Paleta, letra y estilo: van en cada pieza." }
    : { id: "kit", nombre: "Kit de marca", estado: "rojo", texto: "Sin paleta ni estilo: las piezas no saben cómo se ve la marca.", arreglo: { etiqueta: "Preparar el kit", ir: ["marca", "kit"] } });

  puntos.push(kit.logo
    ? { id: "logo", nombre: "Logo", estado: "verde", texto: kit.logoModo === "estampado" ? "Lo estampa la aplicación encima." : "Va de referencia: lo integra la IA." }
    : { id: "logo", nombre: "Logo", estado: "rojo", texto: "Sin logo: las piezas salen sin firma.", arreglo: { etiqueta: "Subir el logo", accion: "logo" } });

  if (perdidas.length) {
    puntos.push({
      id: "perdidas", nombre: "Imágenes de la marca", estado: "rojo",
      texto: `${perdidas.length === 1 ? "Una ya no está" : `${perdidas.length} ya no están`} en la galería: las piezas salen sin ${perdidas.length === 1 ? "ella" : "ellas"}.`,
      arreglo: { etiqueta: "Revisar el kit", ir: ["marca", "kit"] },
    });
  }

  if (!conFotos.length && !sinFotos.length) {
    puntos.push({ id: "fotos", nombre: "Fotos del catálogo", estado: "ambar", texto: "Sin catálogo: el motor no sabe qué vende ni cómo es.", arreglo: { etiqueta: "Abrir el catálogo", ir: ["marca", "cerebro"], mercado: "catalogo" } });
  } else if (!conFotos.length) {
    puntos.push({ id: "fotos", nombre: "Fotos del catálogo", estado: "rojo", texto: "Ningún producto tiene fotos: el motor se imagina cómo son.", arreglo: { etiqueta: "Subir las fotos", ir: ["marca", "cerebro"], mercado: "catalogo" } });
  } else if (sinFotos.length) {
    puntos.push({ id: "fotos", nombre: "Fotos del catálogo", estado: "ambar", texto: `Sin fotos: ${nombres(sinFotos)}.`, arreglo: { etiqueta: "Subir las fotos", ir: ["marca", "cerebro"], mercado: "catalogo" } });
  } else {
    puntos.push({ id: "fotos", nombre: "Fotos del catálogo", estado: "verde", texto: `${conFotos.length === 1 ? "El producto tiene" : `Los ${conFotos.length} productos tienen`} sus fotos reales.` });
  }

  puntos.push(plantillas
    ? { id: "plantillas", nombre: "Plantillas", estado: "verde", texto: `${plantillas} ${plantillas === 1 ? "plantilla" : "plantillas"} de la marca.` }
    : { id: "plantillas", nombre: "Plantillas", estado: "ambar", texto: "Sin plantillas: abre una pieza que funcione y pulsa «Guardar como plantilla».", arreglo: { etiqueta: "Ir a la galería", ir: ["crear", "galeria"] } });

  puntos.push(gustos >= MIN_GUSTOS
    ? { id: "gustos", nombre: "«Me gusta»", estado: "verde", texto: `${gustos} piezas que gustaron: el director las mira.` }
    : { id: "gustos", nombre: "«Me gusta»", estado: "ambar", texto: gustos ? `Sólo ${gustos}: marca al menos ${MIN_GUSTOS} de las que gustan.` : `Ninguna: marca al menos ${MIN_GUSTOS} de las que gustan.`, arreglo: { etiqueta: "Ir a la galería", ir: ["crear", "galeria"] } });

  if (cerebro) {
    puntos.push(!cerebro.conFicha
      ? { id: "ficha", nombre: "Ficha técnica del cerebro", estado: "rojo", texto: "Sin ficha: la IA escribe sin lo esencial de la marca.", arreglo: { etiqueta: "Preparar la ficha", ir: ["marca", "cerebro"] } }
      : cerebro.fichaVieja
        ? { id: "ficha", nombre: "Ficha técnica del cerebro", estado: "ambar", texto: "Desactualizada: cambiaron notas después de escribirla.", arreglo: { etiqueta: "Renovarla", ir: ["marca", "cerebro"] } }
        : { id: "ficha", nombre: "Ficha técnica del cerebro", estado: "verde", texto: "Al día: la IA la lee en todo lo que escribe." });
  }

  // El estudio de mercado, revisado una vez al mes (sólo si GET /api/estudio lo trae: `estudioMercado`).
  if (estudio.estudioMercado !== undefined) puntos.push(puntoDelEstudio(estudio.estudioMercado, ahora));

  puntos.push(kit.locucion?.voz
    ? { id: "voz", nombre: "Voz de la marca", estado: "verde", texto: "Fijada: la de sus videos." }
    : { id: "voz", nombre: "Voz de la marca", estado: "ambar", texto: "Sin voz fijada: cada video sale con la que se escoja.", arreglo: { etiqueta: "Escoger la voz", ir: ["marca", "kit"] } });

  return puntos;
}

/**
 * El punto del estudio de mercado: ámbar si no hay uno aprobado o si se aprobó hace más de DIAS_REVISAR_ESTUDIO días,
 * con su arreglo (Marca → Cerebro, abierto en el estudio). Pura.
 */
export function puntoDelEstudio(m, ahora = Date.now()) {
  const arreglo = (etiqueta) => ({ etiqueta, ir: ["marca", "cerebro"], mercado: "estudio" });
  const base = { id: "mercado", nombre: "Estudio de mercado" };
  const t = Date.parse(m?.aprobadoAt ?? "");
  if (!Number.isFinite(t)) {
    return m?.conBorrador
      ? { ...base, estado: "ambar", texto: "Hay un borrador sin aprobar: hasta aprobarlo, la IA no lo usa.", arreglo: arreglo("Revisarlo y aprobarlo") }
      : { ...base, estado: "ambar", texto: "Sin estudio aprobado: los anuncios y el kit de WhatsApp salen sin las 7 maletas.", arreglo: arreglo("Hacer el estudio") };
  }
  const dias = Math.max(0, Math.floor((ahora - t) / 86_400_000));
  if (dias > DIAS_REVISAR_ESTUDIO) {
    return { ...base, estado: "ambar", texto: `Aprobado hace ${dias} días: toca revisarlo (la competencia, las objeciones y lo que dicen los clientes cambian).`, arreglo: arreglo("Revisarlo") };
  }
  return { ...base, estado: "verde", texto: dias === 0 ? "Aprobado hoy." : `Aprobado hace ${dias === 1 ? "1 día" : `${dias} días`}: se revisa cada mes.` };
}

/** El resumen: { rojos, ambar, verdes, estado } (el peor de todos). Pura. */
export function resumenSemaforo(puntos = []) {
  const cuenta = (e) => puntos.filter((p) => p.estado === e).length;
  const rojos = cuenta("rojo");
  const ambar = cuenta("ambar");
  return { rojos, ambar, verdes: cuenta("verde"), estado: rojos ? "rojo" : ambar ? "ambar" : "verde" };
}

/** Lo CRÍTICO, para el aviso corto de Crear: los puntos en rojo (sin la ficha, que no es del diseño). Pura. */
export const loCritico = (puntos = []) => puntos.filter((p) => p.estado === "rojo" && p.id !== "ficha");

/**
 * El aviso de UNA publicación (pestaña Pieza del panel): sólo lo crítico para ESA pieza — el logo, y las fotos de los
 * productos que nombra (`productoId`, `productoIds`). → [texto]. Pura.
 */
export function avisoDeLaPieza({ estudio = null, post = null } = {}) {
  if (!estudio || !post) return [];
  const avisos = [];
  if (!estudio.kit?.logo) avisos.push("Este cliente no tiene logo en el kit: la pieza sale sin él.");
  const ids = [...new Set([post.productoId, ...lista(post.productoIds)].filter(Boolean).map(String))];
  const conFotos = new Set(lista(estudio.productos).map((p) => String(p.id)));
  const sin = lista(estudio.sinFotos).filter((p) => ids.includes(String(p.id)) && !conFotos.has(String(p.id)));
  if (sin.length) avisos.push(`${sin.length === 1 ? `${nombres(sin)} no tiene` : `${nombres(sin)} no tienen`} fotos en el catálogo: el motor se imaginará cómo ${sin.length === 1 ? "es" : "son"}.`);
  return avisos;
}
