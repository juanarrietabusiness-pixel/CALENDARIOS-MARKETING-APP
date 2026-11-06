import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { enPautaDelCliente } from "../../lib/enPautaApi";
import { analizarRuta, construirRuta, navegar } from "../../lib/rutas";

// ============================================================
// «En pauta» en la pestaña Idea de una publicación (curso de campañas, entrega 7)
//
// «Se va a pautar» (pautaPublicacion.jsx) es lo que la agencia DECIDE; esto es lo que CORRE: la última revisión de
// sus campañas (Resultados → Anuncios, o el repaso diario del cron) casó cada anuncio del Ads Manager con su
// publicación del calendario por el id que Meta le dio al publicarla (worker/lib/enPauta.js). Una publicación puede
// estar en pauta sin que nadie la marcara, y al revés.
//
// Lo lee de lo guardado (GET …/en-pauta, ni una llamada a Meta), una vez por cliente cada dos minutos. Sin nada en
// pauta, no pinta nada.
// ============================================================

const fecha = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }) : "";
};

export function EnPautaPublicacion({ clienteId, calId, postId }) {
  const [e, setE] = useState(null);
  useEffect(() => {
    if (!clienteId || !calId || !postId) return undefined;
    let vivo = true;
    enPautaDelCliente(clienteId)
      .then((d) => {
        if (!vivo) return;
        const x = (d?.publicaciones ?? []).find((p) => String(p.calendarId) === String(calId) && String(p.postId) === String(postId));
        setE(x ? { ...x, leidoAt: d.leidoAt, moneda: d.moneda } : null);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [clienteId, calId, postId]);
  return e ? <TarjetaEnPauta e={e} clienteId={clienteId} /> : null;
}

/** La tarjeta, con lo leído (`e`: una publicación de GET …/en-pauta, con `leidoAt`). */
export function TarjetaEnPauta({ e, clienteId }) {
  const ids = useId();
  const principal = e.anuncios?.[0];
  const mas = Math.max(0, (e.anuncios?.length ?? 0) - 1);
  const campanas = [...new Set((e.anuncios ?? []).map((a) => a.campana).filter(Boolean))];
  const revision = construirRuta({ cliente: analizarRuta().cliente || clienteId, pestana: "resultados", seccion: "anuncios" });
  const irALaRevision = (ev) => {
    ev.preventDefault();
    navegar(revision);
  };

  return (
    <section aria-labelledby={`${ids}-t`} style={{
      border: "1px solid var(--accent-line)", background: "var(--accent-soft)", borderRadius: "var(--radius-sm)",
      padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-1)",
    }}>
      <p id={`${ids}-t`} style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 600, display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
        <Icon name="megaphone" size={16} /> {e.linea}
      </p>
      <p className="hint" style={{ margin: 0 }}>
        {campanas.length ? `${campanas.length === 1 ? "Campaña" : "Campañas"} ${campanas.map((c) => `«${c}»`).join(", ")}` : ""}
        {mas ? ` · en ${mas + 1} anuncios` : ""}
        {e.d30?.gasto > 0 ? ` · 30 días: ${e.d30.resultados} ${e.nombreResultado || "resultados"}` : ""}
        {e.leidoAt ? ` · leído del Ads Manager el ${fecha(e.leidoAt)}` : ""}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        {principal?.enlace && (
          <a className="btn btn-ghost btn-sm" href={principal.enlace} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} /> Abrir en el Ads Manager<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
        <a className="btn btn-ghost btn-sm" href={revision} onClick={irALaRevision}>
          <Icon name="chart" size={14} /> Ver la revisión
        </a>
      </div>
    </section>
  );
}
