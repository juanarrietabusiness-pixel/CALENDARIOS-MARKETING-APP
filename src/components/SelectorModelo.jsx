import { useEffect, useId, useMemo, useState } from "react";
import { estimar, textoCosto, modeloPorId, modelosParaAccion, relevoDe } from "../lib/estudioCatalogo";
import { modelosDeLaGaleria, leerMotores } from "../lib/estudio";

// ============================================================
// «¿Con qué modelo?» para UNA acción: otra versión, editar, crear aquí
//
// Sin fijar nada: vacío es «el de siempre» (el del cliente, el de la pieza o
// el de editar, según quien lo use) y lo escogido vale sólo para lo que se va a
// hacer. Sólo salen los modelos de imagen con llave, del más barato al más caro.
//
// Un modelo que no hace la proporción que tiene que salir (GPT Image, Seedream e
// Imagen no tienen 4:5) se marca en la lista con el que lo releva: antes se
// cambiaba solo y en silencio, y por eso la galería se llenaba de Nano Banana sin
// que nadie lo escogiera.
// ============================================================

/**
 * @param valor       el id escogido ("" = el de siempre).
 * @param vacio       cómo se llama «el de siempre» aquí («El del cliente (Muse Image)»).
 * @param proporcion  la que TIENE que salir («4:5», «9:16»), para marcar los que no la hacen.
 */
export default function SelectorModelo({ activos = {}, valor = "", onCambiar, proporcion = "", conReferencias = false, etiqueta = "Modelo", vacio = "El de siempre", disabled = false }) {
  const id = useId();
  const lista = modelosParaAccion(activos, { conReferencias });
  const relevo = valor ? relevoDe(valor, activos, proporcion, conReferencias) : null;
  return (
    <div className="field selector-modelo" style={{ margin: 0 }}>
      <label className="label" htmlFor={id}>{etiqueta}</label>
      <select id={id} className="input" value={valor} disabled={disabled} onChange={(e) => onCambiar(e.target.value)} aria-describedby={relevo ? `${id}-r` : undefined}>
        <option value="">{vacio}</option>
        {lista.map((m) => {
          const otro = relevoDe(m.id, activos, proporcion, conReferencias);
          return <option key={m.id} value={m.id}>{m.nombre} · {textoCosto(estimar(m, 1, {}))}{otro ? ` · no hace ${proporcion}` : ""}</option>;
        })}
      </select>
      {relevo && (
        <p id={`${id}-r`} className="hint" style={{ margin: 0 }}>
          {modeloPorId(valor)?.nombre} no hace {proporcion}{conReferencias ? " con imágenes de referencia" : ""}: esta saldría con {relevo.nombre}.
        </p>
      )}
    </div>
  );
}

/**
 * El filtro «Modelo» de la galería: qué hizo cada uno («Muse Image (12)», «Nano Banana (30)»…). Con uno solo no sale.
 * Vive aquí y no en Estudio.jsx: el chunk del Estudio está en su tope (rendimiento.bundle.test.js).
 */
export function FiltroDeModelo({ archivos = [], valor = "", onCambiar }) {
  const modelos = useMemo(() => modelosDeLaGaleria(archivos), [archivos]);
  if (modelos.length < 2 && !valor) return null;
  return (
    <select className="input" aria-label="Filtrar por modelo" value={valor} onChange={(e) => onCambiar(e.target.value)}>
      <option value="">Todos los modelos</option>
      {modelos.map((x) => <option key={x.nombre} value={x.nombre}>{x.nombre} ({x.n})</option>)}
    </select>
  );
}

/**
 * El mismo selector, pero preguntando él qué motores tienen llave (para quien no lo sabe: el panel de una
 * publicación). Mientras no lo sabe, no enseña nada.
 */
export function SelectorModeloDelEspacio(props) {
  const [activos, setActivos] = useState(null);
  useEffect(() => {
    let vivo = true;
    leerMotores()
      .then((r) => { if (vivo) setActivos(Object.fromEntries(Object.entries(r?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]))); })
      .catch(() => { if (vivo) setActivos({}); });
    return () => { vivo = false; };
  }, []);
  return activos ? <SelectorModelo {...props} activos={activos} /> : null;
}
