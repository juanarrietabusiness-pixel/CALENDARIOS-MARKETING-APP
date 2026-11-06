// ============================================================
// El lote del Estudio abierto POR LA DIRECCIÓN (puro y pequeño)
//
//   ?lote=mes&mes=AAAA-MM                            «Producir el mes» del calendario: el lote en «Mes completo».
//   ?lote=pauta&etapa=…&nivel=…&n=…&producto=…&pide=…  «Producir los anuncios que faltan» del plan de campañas: el
//                                                    lote de anuncios por niveles con esa etapa del ciclo de ventas;
//                                                    las piezas llegan al calendario marcadas «Va a pauta».
//   ?lote=anuncios&niveles=a,b&etapa=…&pide=…        «Mejorar los ganchos» y «Anuncios nuevos» de la revisión 3Q: los
//                                                    niveles de la etapa de esa campaña (3 de cada uno) y, con su
//                                                    etapa, también marcadas «Va a pauta».
//
// La pantalla del Estudio la lee al montarse (src/components/Estudio.jsx) y quita la búsqueda. Vive aparte porque el
// chunk del Estudio está en su tope: aquí sólo se lee la dirección; lo que se valida (la etapa, el nivel, el producto)
// lo valida el lote y el servidor.
// ============================================================

/** Lo que el lote abre según la dirección: { alcance, … } o false. Pura. */
export function loteDeLaDireccion(q) {
  const lote = q?.get?.("lote");
  if (lote === "mes") return { alcance: "mes", mes: q.get("mes") ?? "" };
  if (lote !== "anuncios" && lote !== "pauta") return false;
  const etapa = String(q.get("etapa") ?? "").slice(0, 20);
  if (lote === "anuncios") {
    const niveles = String(q.get("niveles") ?? "").split(",").map((n) => n.trim().slice(0, 20)).filter(Boolean).slice(0, 5);
    return {
      alcance: "anuncios",
      ...(etapa ? { pauta: { etapa } } : {}),
      cuantas: niveles.length ? Object.fromEntries(niveles.map((n) => [n, 3])) : null,
      productoId: "",
      indicacion: String(q.get("pide") ?? "").slice(0, 400),
    };
  }
  if (lote !== "pauta") return false;
  const nivel = String(q.get("nivel") ?? "").slice(0, 20);
  const n = Math.max(1, Math.min(6, Math.floor(Number(q.get("n")) || 1)));
  return {
    alcance: "anuncios",
    pauta: { etapa, ...(nivel ? { nivel } : {}) },
    cuantas: nivel ? { [nivel]: n } : null,
    productoId: String(q.get("producto") ?? "").slice(0, 60),
    indicacion: String(q.get("pide") ?? "").slice(0, 400),
  };
}

/**
 * La dirección del lote de los anuncios que faltan de una campaña del plan: `base` es la de Crear → Galería del
 * cliente (`construirRuta`), `faltan` el de la campaña ({ n, etapa, nivel, productoId }) y `pide` la indicación para
 * toda la tanda (los tipos de arte que tocan y la diversidad). Pura.
 */
export function direccionDelLote(base, { n = 1, etapa = "", nivel = "", productoId = "" } = {}, pide = "") {
  const q = new URLSearchParams({ lote: "pauta", etapa, nivel, n: String(n) });
  if (productoId) q.set("producto", productoId);
  if (pide) q.set("pide", String(pide).slice(0, 400));
  return `${base}?${q}`;
}
