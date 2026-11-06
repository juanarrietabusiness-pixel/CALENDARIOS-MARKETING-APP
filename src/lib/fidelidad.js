// ============================================================
// Un video FIEL a la marca: los precios salen sólo del producto que aparece en él (puro: el Worker y las pruebas)
//
// Método de agencia: a unos wipes se les atribuyeron las «fibras de bambú» de los pañales de la misma marca. Que un
// beneficio sea de otro producto no lo puede saber el código; un PRECIO sí: cada cantidad de dinero que dice o enseña
// el video tiene que estar en el precio o la oferta del producto del video (o en la idea que escribió la persona). Lo
// que no, es un error grave: la IA que escribe el guion lo corrige en su segunda vuelta, y si no, no se guarda.
// ============================================================

/** Las cantidades de dinero de un texto, normalizadas («$45», «B/. 45.00», «45 dólares» → «45»; «20 %» → «20%»). Pura. */
export function cantidadesDe(texto) {
  const t = String(texto ?? "");
  const salida = new Set();
  const norma = (n) => String(Number(String(n).replace(/,(?=\d{3}\b)/g, "").replace(",", ".")));
  for (const m of t.matchAll(/(?:\$|B\/\.?|USD)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi)) salida.add(norma(m[1]));
  for (const m of t.matchAll(/(\d+(?:[.,]\d{1,2})?)\s?(?:d[oó]lares|balboas|usd)\b/gi)) salida.add(norma(m[1]));
  for (const m of t.matchAll(/(\d{1,3})\s?%/g)) salida.add(`${Number(m[1])}%`);
  return [...salida].filter((x) => x !== "NaN");
}

/** Las cantidades de DINERO de un texto («$45», «B/. 45.00», «45 dólares» → «45»); sin porcentajes («100 % algodón»). Pura. */
export const dineroDe = (texto) => cantidadesDe(texto).filter((c) => !c.endsWith("%"));

/** Todo lo que se dice y se lee en un guion de video animado. Pura. */
export function textosDelGuion(guion) {
  const salida = [];
  for (const e of guion?.escenas ?? []) {
    salida.push(e.habla ?? "", e.pantalla ?? "");
    for (const c of e.capas ?? []) {
      for (const k of ["texto", "etiqueta", "textoAntes", "textoDespues", "notificacion"]) if (typeof c[k] === "string") salida.push(c[k]);
      if (c.tipo === "cifra" && c.prefijo && /\$|B\/|USD/i.test(c.prefijo)) salida.push(`${c.prefijo}${c.valor}`);
      for (const it of c.items ?? []) if (typeof it === "string") salida.push(it);
      for (const m of c.mensajes ?? []) if (typeof m?.texto === "string") salida.push(m.texto);
    }
  }
  return salida.filter(Boolean);
}

/**
 * Los precios que dice un guion y que NO están en lo permitido (el precio y la oferta del producto del video, y lo que
 * escribió la persona en la idea). → [cantidad]. Pura.
 */
export function preciosInventados(textos = [], permitidos = new Set()) {
  const ok = new Set([...permitidos].map(String));
  return [...new Set(textos.flatMap((t) => dineroDe(t)))].filter((c) => !ok.has(c));
}

/** Los precios permitidos de unos productos del catálogo (precio y oferta) y de unos textos (la idea). Pura. */
export function preciosPermitidos(productos = [], textos = []) {
  return new Set([
    ...productos.flatMap((p) => dineroDe(`${p?.precio ?? ""} ${p?.oferta ?? ""}`)),
    ...textos.flatMap((t) => dineroDe(t)),
  ]);
}

/** El error para el validador (con su sitio), si el guion dice un precio que no es del producto. Pura. */
export function erroresDePrecio(guion, permitidos) {
  const raros = preciosInventados(textosDelGuion(guion), permitidos);
  return raros.length ? [{
    donde: "precio",
    mensaje: `Dice ${raros.map((c) => `$${c}`).join(", ")}, que no es el precio del producto de este video: usa el precio EXACTO de su catálogo (o no digas precio). Nunca el de otro producto de la marca.`,
  }] : [];
}
