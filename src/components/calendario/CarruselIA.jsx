import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { mediosDe } from "../../lib/publicacion";
import { presetDePilar, productosDelPost } from "../../lib/pilares";
import { limpiarKit } from "../../lib/kitMarca";
import * as api from "../../lib/estudio";
import "./RevisionMes.css";
import "./CarruselIA.css";

const FlujoCarrusel = lazy(() => import("../FlujoCarrusel"));

// ============================================================
// «Crear carrusel con IA» desde una publicación
//
// El mismo flujo que la pestaña Estudio («Carrusel», components/FlujoCarrusel.jsx):
// guion → propuesta del director de arte → láminas una a una, con
// «Corregir esta» y «Rehacer esta». Aquí arranca con el guion, la idea, el
// tipo y el producto de la publicación, y lo hecho se PONE en ella con un
// botón. Nada se pone solo.
// ============================================================

export default function CarruselIA({ client, post, cal = null, onPoner, onCerrar }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [estudio, setEstudio] = useState(null); // { kit, productos, activos, archivos }
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const vivo = useRef(true);
  const ref = useDialogA11y(() => { if (!creando) onCerrar(); });

  useEffect(() => {
    vivo.current = true;
    Promise.all([api.leerEstudio(clienteId), api.leerMotores()])
      .then(([g, m]) => {
        if (!vivo.current) return;
        setEstudio({
          kit: limpiarKit(g.kit), productos: g.productos ?? [], archivos: g.archivos ?? [],
          activos: Object.fromEntries(Object.entries(m.motores ?? {}).map(([k, v]) => [k, v.activo])),
        });
      })
      .catch((e) => setError(e.message));
    return () => { vivo.current = false; };
  }, [clienteId]);

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes carrusel-ia" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Crear carrusel con IA</h2>
            <p className="hint" style={{ margin: 0 }}>La IA propone cada lámina; tú la corriges y se crean una a una, con el mismo estilo de principio a fin.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={creando} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          {error && <p role="alert" className="cerebro-error">{error}</p>}
          {!estudio && !error && <p className="hint">Cargando…</p>}
          {estudio && (
            <Suspense fallback={<p className="hint">Cargando…</p>}>
              <FlujoCarrusel
                client={client} estudio={estudio} yaTiene={mediosDe(post).length > 0} onCreando={setCreando}
                inicial={{
                  guion: post.guion ?? "", tema: post.idea || post.title || "", preset: presetDePilar(post.pilar, post.pilarSub) || "",
                  productoId: post.productoId ?? "", productoIds: productosDelPost(post), postId: post.id ?? null, calendarId: cal ? cal.dbId || cal.id : null,
                }}
                onPoner={(finales, opciones) => { onPoner(finales, opciones); onCerrar(); }}
                onListo={onCerrar}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
