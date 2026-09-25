import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { idDeCarpeta, enlaceCarpeta } from "../lib/drive";
import { navegar } from "../lib/rutas";
import ExploradorDrive from "./ExploradorDrive";
import ContentBankPanel from "./ContentBankPanel";

// ============================================================
// La pestaña «Contenido» de un cliente: su carpeta de Google Drive
//
// Sustituye al banco de contenido. Mientras al cliente le queden
// archivos en el banco de antes (R2), se ven debajo con un botón para
// pasarlos todos a Drive, que va por tandas hasta vaciarlo.
// ============================================================

export default function PestanaContenido({ client, pulso = 0, onPersistClient }) {
  const ids = useId();
  const clientId = client?.dbId || client?.id;
  const raiz = idDeCarpeta(client?.driveFolder);
  const [estado, setEstado] = useState(null);
  const [bancoViejo, setBancoViejo] = useState([]);
  const [enlace, setEnlace] = useState("");
  const [editando, setEditando] = useState(false);
  const [fallo, setFallo] = useState("");
  const [migrando, setMigrando] = useState("");

  useEffect(() => {
    db.estadoDrive().then(setEstado).catch(() => setEstado({ configurado: false, conectado: false }));
  }, [pulso]);

  const cargarViejo = useCallback(() => {
    db.loadContentBank(clientId).then(setBancoViejo).catch(() => setBancoViejo([]));
  }, [clientId]);
  useEffect(() => { cargarViejo(); }, [cargarViejo, pulso]);

  const guardarCarpeta = async (e) => {
    e.preventDefault();
    const id = idDeCarpeta(enlace);
    if (!id) { setFallo("Eso no parece un enlace de carpeta de Drive. Copia el enlace desde la barra de direcciones de la carpeta."); return; }
    setFallo("");
    await onPersistClient?.({ ...client, driveFolder: id });
    setEditando(false);
    setEnlace("");
  };

  const migrar = async () => {
    setFallo("");
    let total = 0;
    try {
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        setMigrando(`Pasando a Drive… ${total} de ${bancoViejo.length}`);
        const r = await db.migrarBancoADrive(clientId);
        total += r.migrados;
        if (!r.quedan || (!r.migrados && r.fallos?.length)) {
          if (r.fallos?.length) setFallo(`No se pudieron pasar: ${r.fallos.join(", ")}`);
          break;
        }
      }
      setMigrando(`Listo: ${total} archivo${total === 1 ? "" : "s"} en la carpeta «Banco de la app» de Drive.`);
    } catch (e) {
      setFallo(e.message);
      setMigrando("");
    }
    cargarViejo();
  };

  const listo = estado?.conectado && raiz;
  const formulario = (
    <form onSubmit={guardarCarpeta} className="contenido-carpeta">
      <label htmlFor={`${ids}-enlace`} className="label">Enlace de la carpeta de Drive del cliente</label>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <input
          id={`${ids}-enlace`}
          className="input"
          style={{ flex: "1 1 280px" }}
          placeholder="https://drive.google.com/drive/folders/…"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">Guardar</button>
        {editando && <button type="button" className="btn btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>}
      </div>
      <p className="hint">
        La carpeta tiene que estar compartida con la cuenta de Google de la agencia
        {estado?.email ? <> (<strong>{estado.email}</strong>)</> : ""}, como Editor.
      </p>
    </form>
  );

  return (
    <div className="pestana-contenido">
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {estado && !estado.conectado && (
        <div className="notice notice-warn" style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <Icon name="cloud" size={20} />
          <span style={{ flex: 1, minWidth: 200 }}>
            {estado.configurado
              ? "Google Drive todavía no está conectado."
              : "Google Drive está pendiente de configurar."}{" "}
            Se hace una vez, en Ajustes → Integraciones.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navegar("/ajustes#integraciones")}>
            Ir a Integraciones
          </button>
        </div>
      )}

      {(!raiz || editando) ? (
        <div className="tarjeta">{formulario}</div>
      ) : listo ? (
        <>
          <div className="contenido-cabecera">
            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
              <Icon name="cloud" size={14} /> Carpeta de Google Drive de {client.name}
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>Cambiar carpeta</button>
          </div>
          <ExploradorDrive clienteId={clientId} raiz={raiz} modo="gestionar" pulso={pulso} />
        </>
      ) : (
        <p className="hint">
          Carpeta guardada: <a href={enlaceCarpeta(raiz)} target="_blank" rel="noreferrer">abrir en Drive</a>. Se verá aquí en
          cuanto Google Drive esté conectado.
        </p>
      )}

      {bancoViejo.length > 0 && (
        <details className="banco-anterior" open={!listo}>
          <summary>
            <Icon name="inbox" size={16} /> Banco anterior · {bancoViejo.length} archivo{bancoViejo.length === 1 ? "" : "s"}
          </summary>
          {listo && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", margin: "var(--sp-3) 0" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={migrar} disabled={Boolean(migrando) && !migrando.startsWith("Listo")}>
                <Icon name="upload" size={16} /> Pasar todo a Drive
              </button>
              <span role="status" aria-live="polite" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>{migrando}</span>
            </div>
          )}
          <p className="hint">
            Se copian a la carpeta «Banco de la app» dentro de la de Drive del cliente. Las publicaciones que ya usan una
            imagen del banco la siguen viendo.
          </p>
          <ContentBankPanel client={client} pulso={pulso} />
        </details>
      )}
    </div>
  );
}
