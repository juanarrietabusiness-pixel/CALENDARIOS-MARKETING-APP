import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as db from "../lib/db";

/**
 * Escoger archivos del banco de contenido de un cliente.
 *
 * `tipos` limita qué se ofrece («image», «video» o los dos) y `maximo`
 * cuántos se pueden marcar: con 1 se comporta como un selector simple y
 * elegir ya confirma.
 */
export default function BancoSelector({ clientId, tipos = ["image", "video"], maximo = 1, titulo = "Escoger del banco", onSelect, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [todos, setTodos] = useState(null);
  const [error, setError] = useState("");
  const [marcados, setMarcados] = useState([]);
  const items = todos?.filter((i) => tipos.includes(i.file_type)) ?? null;

  useEffect(() => {
    let vivo = true;
    db.loadContentBank(clientId)
      .then((data) => { if (vivo) setTodos(data); })
      .catch(() => { if (vivo) setError("No se pudo cargar el banco de contenido."); });
    return () => { vivo = false; };
  }, [clientId]);

  const alternar = (item) => {
    if (maximo === 1) { onSelect([item]); return; }
    setMarcados((prev) => prev.some((m) => m.id === item.id)
      ? prev.filter((m) => m.id !== item.id)
      : prev.length >= maximo ? prev : [...prev, item]);
  };

  const soloVideo = tipos.length === 1 && tipos[0] === "video";
  const soloImagen = tipos.length === 1 && tipos[0] === "image";
  const vacio = soloVideo ? "No hay videos en el banco de este cliente."
    : soloImagen ? "No hay imágenes en el banco de este cliente."
    : "El banco de este cliente está vacío.";

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 640 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", flex: 1 }}>{titulo}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className="sheet-body">
          {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--fs-xs)" }}>{error}</p>}
          {!error && items === null && <p className="hint" role="status">Cargando el banco…</p>}
          {items?.length === 0 && <p className="hint">{vacio} Súbelo desde la ficha del cliente, en «Banco de contenido».</p>}
          {maximo > 1 && items?.length > 0 && (
            <p className="hint" style={{ marginTop: 0 }}>Marca hasta {maximo}.</p>
          )}

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "var(--sp-2)" }}>
            {items?.map((item) => {
              const url = db.getContentBankUrl(item.file_path);
              const marcado = marcados.some((m) => m.id === item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => alternar(item)}
                    aria-pressed={maximo > 1 ? marcado : undefined}
                    aria-label={`${item.file_type === "video" ? "Video" : "Imagen"}: ${item.file_name}`}
                    style={{
                      display: "block", width: "100%", padding: 0, cursor: "pointer",
                      background: "var(--surface-2)", borderRadius: "var(--radius-sm)", overflow: "hidden",
                      border: `2px solid ${marcado ? "var(--accent)" : "var(--border)"}`, position: "relative",
                    }}
                  >
                    {item.file_type === "video" ? (
                      <video src={`${url}#t=0.5`} muted preload="metadata" aria-hidden="true" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    ) : (
                      <img src={url} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    )}
                    {item.file_type === "video" && (
                      <span aria-hidden="true" style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: "var(--radius-pill)", padding: "2px 6px", display: "flex" }}>
                        <Icon name="play" size={12} />
                      </span>
                    )}
                    {marcado && (
                      <span aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, background: "var(--accent)", color: "#fff", borderRadius: "var(--radius-pill)", padding: 2, display: "flex" }}>
                        <Icon name="check" size={14} />
                      </span>
                    )}
                    <span style={{ display: "block", padding: "4px 6px", fontSize: "var(--fs-3xs)", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
                      {item.file_name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {maximo > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={!marcados.length} onClick={() => onSelect(marcados)}>
              Adjuntar{marcados.length ? ` (${marcados.length})` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
