import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { GLOSARIO, filtrarGlosario } from "../lib/glosario";

// ============================================================
// «¿Qué es cada cosa?»: el glosario, en un diálogo
//
// Lo abre el menú de la cuenta (MenuCuenta.jsx) y va en su chunk: no pesa en la carga inicial. Cada término dice qué
// hace y dónde está; se busca sin tildes. Los términos salen de src/lib/glosario.js. Va en un PORTAL: el menú vive en la
// cabecera, que es `sticky` con su propio z-index, y dentro de ella el diálogo quedaría debajo de lo demás.
// ============================================================

export default function Glosario({ onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const [texto, setTexto] = useState("");
  const grupos = useMemo(() => filtrarGlosario(texto), [texto]);
  const total = grupos.reduce((n, g) => n + g.terminos.length, 0);

  return createPortal(
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" tabIndex={-1} style={{ maxWidth: 720 }}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>¿Qué es cada cosa?</h2>
            <p className="hint" style={{ margin: 0 }}>Lo que hace cada nombre de la aplicación y dónde está.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor={`${ids}-q`}>Buscar</label>
            <input
              id={`${ids}-q`} className="input" type="search" value={texto} autoComplete="off"
              placeholder="Por ejemplo: corregir, número mágico, cerebro…" onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <p role="status" className="sr-only">{texto ? `${total} ${total === 1 ? "resultado" : "resultados"}` : ""}</p>
          {!grupos.length && <p className="hint">Nada con «{texto}». Prueba con otra palabra.</p>}
          {grupos.map((g, i) => (
            <section key={g.grupo} aria-labelledby={`${ids}-g${i}`}>
              <h3 id={`${ids}-g${i}`} style={{ fontSize: "var(--fs-sm)", margin: "0 0 var(--sp-2)", color: "var(--text-muted)" }}>{g.grupo}</h3>
              <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {g.terminos.map((t) => (
                  <div key={t.termino}>
                    <dt style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>{t.termino}</dt>
                    <dd style={{ margin: "var(--sp-1) 0 0", fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
                      {t.que}
                      {t.donde && <span className="hint" style={{ display: "block", marginTop: 2 }}><Icon name="chevronRight" size={12} /> {t.donde}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {!texto && <p className="hint" style={{ margin: 0 }}>{GLOSARIO.reduce((n, g) => n + g.terminos.length, 0)} términos.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
