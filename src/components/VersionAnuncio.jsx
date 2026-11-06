import { useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { CopyButton } from "./calendario/primitivas";
import { ETAPAS_CICLO, etapaCiclo } from "../lib/cicloVentas";
import { limpiarPauta, etapaSugerida, limpiarAnuncio, anuncioATexto, nombreDeBoton, primeraLinea, PRIMERA_LINEA } from "../lib/pauta";

// ============================================================
// «Versión para anuncio» de una publicación YA publicada (Producción → Publicadas)
//
// Lo publicado no se puede cambiar en Instagram desde la API, y en el Ads
// Manager el texto de una publicación ya hecha tampoco. Para pautarla, el motor
// de textos (lib/escribirTextos.js `reescribirComoAnuncio`, la regla de
// lib/pauta.js) escribe para ESA pieza su caption como anuncio —para montarla
// como anuncio nuevo o para pegarlo a mano en Instagram («Editar») antes de
// pautarla— y sus textos de anuncio aparte. No guarda nada: se copia.
// ============================================================

export default function VersionAnuncio({ client, cal, post, day, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const [etapa, setEtapa] = useState(() => limpiarPauta(post?.pauta)?.etapa || etapaSugerida(post));
  const [estado, setEstado] = useState({ trabajando: false, error: "" });
  const [resultado, setResultado] = useState(null);
  const clienteId = client?.dbId || client?.id;
  const e = etapaCiclo(etapa);

  const escribir = async () => {
    setEstado({ trabajando: true, error: "" });
    try {
      const { reescribirComoAnuncio } = await import("../lib/escribirTextos");
      const cambios = await reescribirComoAnuncio(clienteId, {
        post: { ...post, pauta: { etapa, como: "anuncio" } }, day: day ?? {}, cal, campos: ["descripcion", "anuncio"],
      });
      setResultado({ descripcion: cambios.descripcion ?? "", anuncio: limpiarAnuncio(cambios.anuncio) });
      setEstado({ trabajando: false, error: "" });
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (err) {
      setEstado({ trabajando: false, error: err.message });
    }
  };

  const a = resultado?.anuncio;
  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" tabIndex={-1} style={{ maxWidth: 680 }}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Versión para anuncio</h2>
            <p className="hint" style={{ margin: 0 }}>{client?.name ?? ""} · {String(post?.title || post?.idea || primeraLinea(post?.descripcion) || "").slice(0, 70)}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          <p className="hint" style={{ margin: 0 }}>
            Ya está publicada: su texto en Instagram no se cambia desde aquí, y en el Ads Manager el de una publicación ya hecha
            tampoco. La IA escribe, para esta pieza, el texto como anuncio (para montarla subiendo la pieza o para pegarlo a mano en
            Instagram con «Editar» antes de pautarla) y sus textos de anuncio aparte. No se guarda nada: se copia.
          </p>
          <div className="field">
            <label className="label" htmlFor={`${ids}-e`}>Etapa del ciclo de ventas</label>
            <select id={`${ids}-e`} className="input" value={etapa} onChange={(ev) => { setEtapa(ev.target.value); setResultado(null); }}>
              {ETAPAS_CICLO.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            {e && <p className="hint" style={{ margin: 0 }}>{e.ayuda}</p>}
          </div>
          <div>
            <button type="button" className="btn btn-primary" disabled={estado.trabajando || !clienteId} onClick={escribir}>
              <Icon name="sparkles" size={16} /> {estado.trabajando ? "Escribiendo…" : resultado ? "Escribir otra versión" : "Escribir la versión para anuncio"}
            </button>
            <span className="hint" style={{ marginLeft: "var(--sp-2)" }}>Unos céntimos.</span>
          </div>
          <div aria-live="polite">
            {estado.error && <p role="alert" className="notice notice-error">{estado.error}</p>}
          </div>

          {resultado && (
            <>
              {resultado.descripcion && (
                <section className="field" aria-labelledby={`${ids}-cap`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)" }}>
                    <h3 id={`${ids}-cap`} className="label" style={{ margin: 0 }}>Texto del anuncio (o para pegar en Instagram)</h3>
                    <CopyButton text={resultado.descripcion} describes="el texto del anuncio" />
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", margin: 0, padding: "var(--sp-3)", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: "var(--fs-sm)" }}>{resultado.descripcion}</p>
                  {primeraLinea(resultado.descripcion).length > PRIMERA_LINEA && (
                    <p className="hint" style={{ margin: 0 }}>La primera línea pasa de {PRIMERA_LINEA} caracteres: revisa que el gancho se vea antes de «más».</p>
                  )}
                </section>
              )}
              {a && (
                <section className="field" aria-labelledby={`${ids}-anu`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)" }}>
                    <h3 id={`${ids}-anu`} className="label" style={{ margin: 0 }}>Para montarlo subiendo la pieza</h3>
                    <CopyButton text={anuncioATexto(a)} label="Copiar todo" describes="todos los textos del anuncio" />
                  </div>
                  <ol style={{ margin: 0, paddingLeft: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {a.textos.map((t, i) => (
                      <li key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-2)", alignItems: "flex-start" }}>
                          <span style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-sm)" }}>{t}</span>
                          <CopyButton text={t} describes={`el texto principal ${i + 1}`} />
                        </div>
                      </li>
                    ))}
                  </ol>
                  {a.titulos.length > 0 && (
                    <>
                      <p className="label" style={{ margin: 0 }}>Títulos</p>
                      <ul style={{ margin: 0, paddingLeft: "var(--sp-4)" }}>
                        {a.titulos.map((t, i) => (
                          <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-2)", alignItems: "center", fontSize: "var(--fs-sm)" }}>
                            {t} <CopyButton text={t} describes={`el título ${i + 1}`} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {a.descripcion && <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}><strong>Descripción:</strong> {a.descripcion} <CopyButton text={a.descripcion} describes="la descripción" /></p>}
                  <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}><strong>Botón:</strong> {nombreDeBoton(a.boton)}</p>
                </section>
              )}
            </>
          )}
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
