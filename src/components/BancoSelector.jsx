import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as db from "../lib/db";
import { idDeCarpeta } from "../lib/drive";
import ExploradorDrive from "./ExploradorDrive";

/**
 * Escoger archivos de un cliente: de su carpeta de Google Drive, o del
 * banco de antes mientras no se haya pasado a Drive.
 *
 * `tipos` limita qué se ofrece («image», «video» o los dos) y `maximo`
 * cuántos se pueden marcar: con 1 se comporta como un selector simple y
 * elegir ya confirma.
 *
 * Devuelve SIEMPRE la misma forma, venga de donde venga:
 *   { fuente: "drive" | "banco", id, nombre, tipo: "imagen" | "video",
 *     url, fileId? (Drive), clave? (R2) }
 */
export default function BancoSelector({ clientId, driveFolder = "", tipos = ["image", "video"], maximo = 1, titulo = "Escoger contenido", onSelect, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const raiz = idDeCarpeta(driveFolder);
  const [todos, setTodos] = useState(null);
  const [error, setError] = useState("");
  const [marcados, setMarcados] = useState([]);
  const [verBanco, setVerBanco] = useState(!raiz);
  const items = todos?.filter((i) => tipos.includes(i.file_type)) ?? null;
  const tiposDrive = tipos.map((t) => (t === "image" ? "imagen" : "video"));

  useEffect(() => {
    let vivo = true;
    db.loadContentBank(clientId)
      .then((data) => { if (vivo) setTodos(data); })
      .catch(() => { if (vivo) setError("No se pudo cargar el banco de contenido."); });
    return () => { vivo = false; };
  }, [clientId]);

  const normalizar = (item) => ({
    fuente: "banco",
    id: item.id,
    nombre: item.file_name,
    tipo: item.file_type === "video" ? "video" : "imagen",
    clave: item.file_path,
    url: db.getContentBankUrl(item.file_path),
  });

  const alternar = (item) => {
    if (maximo === 1) { onSelect([normalizar(item)]); return; }
    setMarcados((prev) => prev.some((m) => m.id === item.id)
      ? prev.filter((m) => m.id !== item.id)
      : prev.length >= maximo ? prev : [...prev, item]);
  };

  const soloVideo = tipos.length === 1 && tipos[0] === "video";
  const soloImagen = tipos.length === 1 && tipos[0] === "image";
  const vacio = soloVideo ? "No hay videos en el banco anterior de este cliente."
    : soloImagen ? "No hay imágenes en el banco anterior de este cliente."
    : "El banco anterior de este cliente está vacío.";
  const hayBancoViejo = (todos?.length ?? 0) > 0;

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 820 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", flex: 1 }}>{titulo}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        {raiz && hayBancoViejo && (
          <div className="chat-mode-tabs" role="tablist" aria-label="De dónde escoger" style={{ margin: "0 var(--sp-4)" }}>
            <button type="button" role="tab" className="chat-mode-tab" aria-selected={!verBanco} onClick={() => setVerBanco(false)}>
              <Icon name="cloud" size={14} /> Google Drive
            </button>
            <button type="button" role="tab" className="chat-mode-tab" aria-selected={verBanco} onClick={() => setVerBanco(true)}>
              <Icon name="inbox" size={14} /> Banco anterior ({todos.length})
            </button>
          </div>
        )}

        <div className="sheet-body">
          {!verBanco && raiz ? (
            <ExploradorDrive
              clienteId={clientId}
              raiz={raiz}
              modo="escoger"
              tipos={tiposDrive}
              maximo={maximo}
              onSelect={onSelect}
            />
          ) : (
            <>
              {!raiz && (
                <p className="notice notice-warn" style={{ marginTop: 0 }}>
                  Este cliente todavía no tiene carpeta de Google Drive. Pégala en su ficha y todo su contenido aparecerá aquí.
                </p>
              )}
              {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--fs-xs)" }}>{error}</p>}
              {!error && items === null && <p className="hint" role="status">Cargando el banco…</p>}
              {items?.length === 0 && <p className="hint">{vacio}</p>}
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
            </>
          )}
        </div>

        {verBanco && maximo > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={!marcados.length} onClick={() => onSelect(marcados.map(normalizar))}>
              Adjuntar{marcados.length ? ` (${marcados.length})` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
