import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function ContentBankPanel({ client, pulso = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [urls, setUrls] = useState({});
  const fileRef = useRef(null);
  const clientId = client.dbId || client.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db.loadContentBank(clientId)
      .then(async (data) => {
        if (!alive) return;
        setItems(data);
        const urlMap = {};
        await Promise.all(
          data.map(async (item) => {
            try {
              urlMap[item.id] = await db.getContentBankSignedUrl(item.file_path);
            } catch { /* la URL falla silenciosamente */ }
          }),
        );
        if (alive) setUrls(urlMap);
      })
      .catch(() => { if (alive) setError("No se pudo cargar el banco de contenido."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Ver la nota de `pulso` en TaskPanel.
  }, [clientId, pulso]);

  const handleUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError("");

    for (const file of files) {
      try {
        const item = await db.uploadContentBankItem(clientId, file);
        const url = await db.getContentBankSignedUrl(item.file_path).catch(() => "");
        setItems((prev) => [item, ...prev]);
        setUrls((prev) => ({ ...prev, [item.id]: url }));
      } catch (err) {
        setError(`Error al subir ${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [clientId]);

  const handleDelete = useCallback(async (item) => {
    try {
      await db.deleteContentBankItem(item);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setUrls((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      if (previewItem?.id === item.id) {
        setPreviewItem(null);
        setPreviewUrl("");
      }
    } catch {
      setError("No se pudo eliminar el archivo.");
    }
  }, [previewItem]);

  const openPreview = useCallback(async (item) => {
    setPreviewItem(item);
    const url = urls[item.id] || await db.getContentBankSignedUrl(item.file_path).catch(() => "");
    setPreviewUrl(url);
  }, [urls]);

  const totalSize = items.reduce((acc, i) => acc + (i.size_bytes || 0), 0);

  return (
    <section style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          padding: "var(--sp-3) var(--sp-4)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
          fontSize: "var(--fs-sm)",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={16} />
        <Icon name="folder" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ flex: 1 }}>Banco de contenido</span>
        {items.length > 0 && (
          <span style={{
            fontSize: "var(--fs-3xs)",
            color: "var(--text-faint)",
          }}>
            {items.length} · {formatBytes(totalSize)}
          </span>
        )}
      </button>

      {!collapsed && (
        <div style={{ padding: "0 var(--sp-4) var(--sp-3)" }}>
          {error && (
            <p role="alert" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)", padding: "var(--sp-1) 0" }}>
              {error}
            </p>
          )}

          {loading ? (
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", padding: "var(--sp-2) 0" }}>
              Cargando…
            </p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", padding: "var(--sp-2) 0" }}>
              Sin archivos. Sube imágenes o vídeos de referencia.
            </p>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
              gap: "var(--sp-2)",
              marginBottom: "var(--sp-2)",
            }}>
              {items.map((item) => (
                <ContentThumb
                  key={item.id}
                  item={item}
                  url={urls[item.id]}
                  onPreview={() => openPreview(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleUpload}
            style={{ display: "none" }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              background: "none",
              border: "1px dashed var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              width: "100%",
              padding: "var(--sp-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--sp-1)",
              fontSize: "var(--fs-3xs)",
              color: "var(--text-dim)",
            }}
          >
            <Icon name={uploading ? "refresh" : "upload"} size={14} />
            {uploading ? "Subiendo…" : "Subir archivos"}
          </button>
        </div>
      )}

      {/* Vista previa */}
      {previewItem && (
        <ContentPreviewModal
          item={previewItem}
          url={previewUrl}
          onClose={() => { setPreviewItem(null); setPreviewUrl(""); }}
          onDelete={() => handleDelete(previewItem)}
        />
      )}
    </section>
  );
}

function ContentThumb({ item, url, onPreview, onDelete }) {
  const isVideo = item.file_type === "video";
  return (
    <div style={{
      position: "relative",
      aspectRatio: "1",
      borderRadius: "var(--radius-sm)",
      overflow: "hidden",
      background: "var(--surface-2)",
      cursor: "pointer",
      border: "1px solid var(--border)",
    }}>
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Ver ${item.file_name}`}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          padding: 0,
          background: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url && !isVideo ? (
          <img
            src={url}
            alt={item.file_name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            color: "var(--text-faint)",
          }}>
            <Icon name={isVideo ? "formatReel" : "image"} size={24} />
            <span style={{ fontSize: 9, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.file_name}
            </span>
          </div>
        )}
      </button>
      <button
        type="button"
        className="btn-icon"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label={`Eliminar ${item.file_name}`}
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 22,
          height: 22,
          minHeight: 22,
          background: "rgba(0,0,0,.55)",
          color: "#fff",
          borderRadius: "50%",
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function ContentPreviewModal({ item, url, onClose, onDelete }) {
  const isVideo = item.file_type === "video";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2,6,16,.8)",
        backdropFilter: "blur(4px)",
      }}
    >
      <button
        type="button"
        aria-label="Cerrar vista previa"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "pointer" }}
      />
      <div style={{
        position: "relative",
        maxWidth: "90vw",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-3)",
        alignItems: "center",
        zIndex: 1,
      }}>
        {url && !isVideo && (
          <img src={url} alt={item.file_name} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)", objectFit: "contain" }} />
        )}
        {url && isVideo && (
          <video src={url} controls style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)" }} />
        )}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-3)",
          color: "#fff",
          fontSize: "var(--fs-xs)",
        }}>
          <span style={{ opacity: 0.8 }}>{item.file_name}</span>
          <span style={{ opacity: 0.5, fontSize: "var(--fs-3xs)" }}>{formatBytes(item.size_bytes)}</span>
          <button
            className="btn"
            onClick={onDelete}
            style={{
              background: "rgba(255,80,80,.2)",
              color: "#ff6b6b",
              border: "1px solid rgba(255,80,80,.3)",
              fontSize: "var(--fs-3xs)",
              padding: "var(--sp-1) var(--sp-3)",
            }}
          >
            <Icon name="trash" size={14} />
            Eliminar
          </button>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar" style={{ color: "#fff" }}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
