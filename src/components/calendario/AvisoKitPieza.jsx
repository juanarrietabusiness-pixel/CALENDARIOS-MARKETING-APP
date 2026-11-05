import { useEffect, useState } from "react";
import Icon from "../Icon";
import { navegar } from "../../lib/rutas";
import { avisoDeLaPieza } from "../../lib/semaforoKit";
import { estudioDelCliente } from "../../lib/semaforoKitApi";

// ============================================================
// El aviso del kit en la pestaña Pieza de una publicación (fase 7, lazy)
//
// Sólo lo CRÍTICO para esta pieza (lib/semaforoKit.js → `avisoDeLaPieza`): que el cliente no tenga logo, o que un
// producto que la publicación nombra no tenga fotos en el catálogo (el motor se imaginaría cómo es). Lee la galería del
// cliente recordada dos minutos (lib/semaforoKitApi.js): abrir paneles seguidos no la pide cada vez. Si falla, no dice
// nada: es un aviso, no puede tapar la pieza.
// ============================================================

export default function AvisoKitPieza({ clientId, post }) {
  const [estudio, setEstudio] = useState(null);
  useEffect(() => {
    let vivo = true;
    estudioDelCliente(clientId).then((d) => { if (vivo) setEstudio(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [clientId]);
  const avisos = avisoDeLaPieza({ estudio, post });
  if (!avisos.length) return null;
  // La pestaña Marca del cliente que se mira (la dirección empieza por /cliente/<slug>).
  const base = window.location.pathname.split("/").slice(0, 3).join("/");
  const conLogo = Boolean(estudio?.kit?.logo);
  return (
    <div className="notice notice-warn" role="note" style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", flexWrap: "wrap" }}>
      <Icon name="alert" size={16} />
      <span style={{ flex: "1 1 220px" }}>{avisos.join(" ")}</span>
      {base.startsWith("/cliente/") && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navegar(`${base}/marca/${conLogo ? "cerebro" : "kit"}`)}>
          {conLogo ? "Subir las fotos (Marca)" : "Arreglarlo en Marca"}
        </button>
      )}
    </div>
  );
}
