import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { presetDePilar } from "../../lib/pilares";
import { limpiarKit } from "../../lib/kitMarca";
import * as api from "../../lib/estudio";
import "./RevisionMes.css";
import "./CarruselIA.css";

const FlujoReel = lazy(() => import("../FlujoReel"));

// ============================================================
// «Crear reel con IA» desde una publicación de formato reel
//
// El mismo flujo que la pestaña Estudio («Reel IA», components/FlujoReel.jsx):
// idea → planos → fotogramas → video, con «corregir un tramo». Arranca con la
// idea, el tipo y el producto de la publicación, y el video se PONE en ella
// con un botón.
// ============================================================

export default function ReelIA({ client, post, cal = null, onPoner, onCerrar }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [estudio, setEstudio] = useState(null);
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

  const idea = [post.idea || post.title || "", post.textoPieza ? `Texto: ${post.textoPieza}` : ""].filter(Boolean).join("\n");

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes carrusel-ia" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Crear reel con IA</h2>
            <p className="hint" style={{ margin: 0 }}>Guion de 10 s por planos, el storyboard para revisar y el video; luego se corrige por tramos.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={creando} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          {error && <p role="alert" className="cerebro-error">{error}</p>}
          {!estudio && !error && <p className="hint">Cargando…</p>}
          {estudio && (
            <Suspense fallback={<p className="hint">Cargando…</p>}>
              <FlujoReel
                client={client} estudio={estudio} onCreando={setCreando}
                inicial={{ idea, preset: presetDePilar(post.pilar, post.pilarSub) || "", productoId: post.productoId ?? "", postId: post.id ?? null, calendarId: cal ? cal.dbId || cal.id : null }}
                onPoner={(archivos, opciones) => { onPoner(archivos, opciones); onCerrar(); }}
                onListo={onCerrar}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
