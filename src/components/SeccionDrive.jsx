import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

// ============================================================
// Ajustes → Integraciones → Google Drive
//
// Tres estados, y cada uno dice qué hacer:
//
//   1. Sin configurar: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en
//      el Worker. Se enseñan los pasos y la dirección de vuelta EXACTA
//      que hay que registrar en Google Cloud —la que devuelve el
//      servidor, que sabe en qué dominio está—.
//   2. Configurado y sin conectar: el botón de conectar. Conectar es
//      NAVEGAR a Google, no un fetch.
//   3. Conectado: con qué cuenta, y desconectar.
// ============================================================

/** Lo que Google dejó en la dirección al volver: se lee una vez y se limpia. */
function leerVuelta() {
  const p = new URLSearchParams(window.location.search);
  const drive = p.get("drive");
  if (!drive) return null;
  const vuelta = { ok: drive === "ok", motivo: p.get("motivo") ?? "" };
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  return vuelta;
}

export default function SeccionDrive({ esAdmin, pulso = 0, children = null }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [vuelta] = useState(leerVuelta);
  const [fallo, setFallo] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    db.estadoDrive().then(setEstado).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* sin portapapeles: el texto está seleccionable */ }
  };

  const desconectar = async () => {
    setTrabajando(true);
    try {
      await db.desconectarDrive();
      cargar();
    } catch (e) {
      setFallo(e.message);
    }
    setTrabajando(false);
  };

  return (
    <section id="integraciones" className="ajustes-seccion" aria-labelledby={`${ids}-t`}>
      <h2 className="ajustes-titulo" id={`${ids}-t`}>
        <Icon name="plug" size={18} /> Integraciones
      </h2>

      <div className="integracion">
        <div className="integracion-cabecera">
          <span className="integracion-icono" aria-hidden="true"><Icon name="cloud" size={22} /></span>
          <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
            <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Google Drive</p>
            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
              El banco de contenido de cada cliente es su carpeta de Drive: escoger, subir, adjuntar al chat y
              poner en publicaciones.
            </p>
          </div>
          {estado && (
            <span className={`badge ${estado.conectado ? "badge-ok" : ""}`} data-estado={estado.conectado ? "ok" : estado.configurado ? "pendiente" : "sin-configurar"}>
              {estado.conectado ? "Conectado" : estado.configurado ? "Sin conectar" : "Pendiente de configurar"}
            </span>
          )}
        </div>

        <div role="status" aria-live="polite">
          {vuelta?.ok && <p className="notice notice-ok">Google Drive quedó conectado.</p>}
        </div>
        {vuelta && !vuelta.ok && (
          <p role="alert" className="notice notice-error">No se conectó: {vuelta.motivo || "Google no dio el permiso."}</p>
        )}
        {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

        {estado && !estado.configurado && (
          <div className="integracion-pasos">
            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
              Falta crear el acceso en Google Cloud (unos 15 minutos, una sola vez, con la cuenta de Google de la agencia):
            </p>
            <ol>
              <li>En <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">console.cloud.google.com</a>, crea un proyecto.</li>
              <li><strong>APIs y servicios → Biblioteca</strong> → «Google Drive API» → <strong>Habilitar</strong>.</li>
              <li>
                <strong>Pantalla de consentimiento de OAuth</strong>: tipo <strong>Externo</strong>, y en <strong>Público</strong> pulsa
                <strong> Publicar app</strong> («En producción»). En modo de prueba Google corta la conexión cada 7 días.
              </li>
              <li>
                <strong>Clientes → Crear cliente → Aplicación web</strong>, con esta dirección en
                «URI de redireccionamiento autorizados»:
                <span className="integracion-uri">
                  <code>{estado.redireccion}</code>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(estado.redireccion)}>
                    <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
                  </button>
                </span>
              </li>
              <li>
                En Cloudflare → <strong>Workers &amp; Pages → calendarios → Settings → Variables and Secrets</strong>, añade
                como <strong>Secret</strong> <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code>.
              </li>
              <li>Vuelve aquí y pulsa <strong>Conectar Google Drive</strong>.</li>
            </ol>
          </div>
        )}

        {estado?.configurado && !estado.conectado && (
          esAdmin ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", alignItems: "flex-start" }}>
              <a className="btn btn-primary" href={db.urlConectarDrive()}>
                <Icon name="cloud" size={18} /> Conectar Google Drive
              </a>
              <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
                Entra con la cuenta de Google de la AGENCIA. Si Google avisa de que «no verificó esta app», es porque es
                tuya y privada: pulsa «Configuración avanzada» → «Ir a…».
              </p>
            </div>
          ) : (
            <p className="hint">Sólo el administrador puede conectar Google Drive.</p>
          )
        )}

        {estado?.conectado && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <p style={{ fontSize: "var(--fs-2xs)", flex: 1, minWidth: 200 }}>
              Conectado como <strong>{estado.email || "la cuenta de la agencia"}</strong>. Para cada cliente, comparte su
              carpeta con esa cuenta (como Editor) y pega el enlace en la <strong>Ficha</strong> del cliente.
            </p>
            {esAdmin && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={desconectar} disabled={trabajando}>
                Desconectar
              </button>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
