import { useId, useState } from "react";
import Icon from "./Icon";
import { textoCosto } from "../lib/estudioCatalogo";
import { textoDePieza } from "../lib/visorEstudio";
import { decidir } from "../lib/sinPreguntarApi";
import { ejesDeVariacion, EJES_VARIACION, MIN_VARIACIONES, MAX_VARIACIONES } from "../lib/variacionesAnuncio";

// ============================================================
// «Variaciones para anuncios» del visor (lazy: sólo se descarga al pulsarlo)
//
// La pieza que se mira es la MAESTRA: el director la mira y diseña de 3 a 5 más con su mismo ADN (paleta, luz, letra,
// acabado, producto), cambiando UNA cosa en cada una —el gancho si lleva texto, el ángulo, la composición, el fondo—
// para probarlas en un conjunto de anuncios de Meta. Antes de crear se ve qué cambia cada una y cuánto cuesta; desde
// 0,50 $ pide un segundo toque, salvo que la agencia fijara «Crear imágenes sin preguntar» (Ajustes → IA).
// ============================================================

export default function VariacionesAnuncio({ id, archivo: a, costo = null, estimado = false, ocupado = false, onCrear, onCerrar }) {
  const uid = useId();
  const [n, setN] = useState(MIN_VARIACIONES);
  const [confirmando, setConfirmando] = useState(false);
  const [mirando, setMirando] = useState(false);
  // Con el texto puesto por la plantilla encima (o sin texto), no hay titular que cambiar: los ejes son otros.
  const conTexto = !a.ajustes?.plantilla?.texto && Boolean(textoDePieza(a));
  const ejes = ejesDeVariacion(n, { conTexto });
  const total = costo == null ? null : Math.round(costo * n * 1000) / 1000;
  // «≈ 0,039 $» ya dice que es aproximado; el catálogo marca además los precios estimados.
  const precio = total == null ? "" : `${textoCosto(total)}${estimado ? " (precio aproximado)" : ""}`;

  const crear = async () => {
    if (ocupado || mirando) return;
    if (!confirmando && total != null) {
      setMirando(true);
      const d = await decidir({ costo: total, tipo: "imagen" }).catch(() => ({ preguntar: true }));
      setMirando(false);
      if (d.preguntar) { setConfirmando(true); return; }
    }
    setConfirmando(false);
    onCrear(n);
  };

  return (
    <section id={id} className="est-variaciones" aria-labelledby={`${uid}-t`}
      style={{ display: "grid", gap: "var(--sp-2)", padding: "var(--sp-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-2)" }}>
      <p className="label" id={`${uid}-t`} style={{ margin: 0 }}>Variaciones para un conjunto de anuncios</p>
      <p className="hint" style={{ margin: 0 }}>
        Esta pieza es la <strong>maestra</strong>: el director la mira y hace otras con su mismo estilo (colores, luz, letra y producto),
        cambiando una cosa en cada una para probarlas juntas en un conjunto de anuncios de Meta. Quedan juntas en una carpeta de la galería.
      </p>
      <div className="est-editar-atajos" role="group" aria-label="Cuántas variaciones">
        {Array.from({ length: MAX_VARIACIONES - MIN_VARIACIONES + 1 }, (_, i) => MIN_VARIACIONES + i).map((k) => (
          <button key={k} type="button" className="filter-chip" aria-pressed={n === k} onClick={() => { setN(k); setConfirmando(false); }}>{k}</button>
        ))}
      </div>
      <ol className="hint" style={{ margin: 0, paddingLeft: "var(--sp-4)" }} aria-label="Qué cambia cada una">
        {ejes.map((e) => <li key={e}>{EJES_VARIACION[e].nombre}</li>)}
      </ol>
      {!conTexto && <p className="hint" style={{ margin: 0 }}>No lleva un texto que escriba el motor: las variaciones cambian la imagen, no el gancho.</p>}
      <div role="status" className="hint" style={{ margin: 0 }}>
        {confirmando ? `Las ${n} cuestan ${precio} en total. ¿Las creo?` : precio ? `${n} imágenes nuevas: ${precio} en total.` : ""}
      </div>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        {/* `aria-disabled` y no `disabled`: el botón pulsado no suelta el foco (Escape seguiría cerrando el visor). */}
        <button type="button" className="btn btn-primary btn-sm" aria-disabled={ocupado || mirando || undefined} onClick={crear}>
          <Icon name="layers" size={14} /> {ocupado ? "Diseñando…" : confirmando ? `Sí, crear las ${n}` : `Crear ${n} variaciones`}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (confirmando ? setConfirmando(false) : onCerrar())}>{confirmando ? "No" : "Cerrar"}</button>
      </div>
    </section>
  );
}
