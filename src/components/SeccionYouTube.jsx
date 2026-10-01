import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { urlConectarYouTube, enlaceYouTube, elegirCanalYouTube, privacidadYouTube, desconectarYouTube, PRIVACIDADES } from "../lib/youtube";

// ============================================================
// Ajustes → Integraciones → YouTube
//
// Igual que TikTok: cada canal se conecta entrando con la cuenta de
// Google que lo tiene. Por cliente, «Conectar aquí» o «Enlace para el
// cliente», que el cliente abre en su teléfono. Si esa cuenta trae varios
// canales, se elige cuál es el del cliente.
//
// Y la privacidad con la que sale cada canal. El aviso de Google va
// siempre a la vista: con el proyecto sin auditar, TODO lo subido por la
// API queda privado, se pida lo que se pida.
// ============================================================

function leerVuelta() {
  const p = new URLSearchParams(window.location.search);
  const y = p.get("youtube");
  if (!y) return null;
  const vuelta = { resultado: y, motivo: p.get("motivo") ?? "" };
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  return vuelta;
}

export default function SeccionYouTube({ clients = [], pulso = 0 }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [vuelta] = useState(leerVuelta);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [eleccion, setEleccion] = useState({});

  const cargar = useCallback(() => {
    db.estadoRedes().then(setEstado).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const copiar = async (texto, ok) => {
    try { await navigator.clipboard.writeText(texto); setAviso(ok); } catch { setAviso(texto); }
  };

  const hacer = async (clave, accion, ok = "") => {
    setTrabajando(clave);
    setFallo("");
    setAviso("");
    try {
      const r = await accion();
      if (ok) setAviso(ok);
      cargar();
      return r;
    } catch (e) {
      setFallo(e.message);
      return null;
    } finally {
      setTrabajando("");
    }
  };

  const yt = estado?.youtube;
  const cuentas = (estado?.cuentas ?? []).filter((c) => c.red === "youtube");
  const conectadas = cuentas.filter((c) => c.clientId);
  const deCliente = (id) => cuentas.find((x) => x.clientId === id);
  const porElegir = (id) => cuentas.filter((x) => x.elegirPara === id);

  return (
    <div className="integracion">
      <div className="integracion-cabecera">
        <span className="integracion-icono" aria-hidden="true"><Icon name="play" size={22} /></span>
        <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>YouTube</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Sube los videos al canal de cada cliente (los verticales cortos, como Shorts) y mide cómo les va.
          </p>
        </div>
        {yt && (
          <span className={`badge ${conectadas.length ? "badge-ok" : ""}`} data-estado={conectadas.length ? "ok" : yt.configurado ? "pendiente" : "sin-configurar"}>
            {conectadas.length ? `${conectadas.length} conectado${conectadas.length > 1 ? "s" : ""}` : yt.configurado ? "Sin canales" : "Pendiente de configurar"}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite">
        {vuelta?.resultado === "ok" && <p className="notice notice-ok">El canal de YouTube quedó conectado.</p>}
        {vuelta?.resultado === "elegir" && <p className="notice notice-ok">Esa cuenta tiene varios canales: elige abajo cuál es el del cliente.</p>}
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {vuelta?.resultado === "error" && <p role="alert" className="notice notice-error">No se conectó: {vuelta.motivo || "Google no dio el permiso."}</p>}
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {yt?.configurado && (
        <p className="notice notice-warn">
          Mientras Google no audite el proyecto de Google Cloud, <strong>todo video que se sube por la API queda en privado</strong>,
          elijas la privacidad que elijas: se cambia a mano en YouTube Studio. Se quita pidiendo la auditoría de la API de YouTube.
        </p>
      )}

      {yt && (
        <details className="integracion-pasos" open={!yt.configurado}>
          <summary style={{ fontSize: "var(--fs-2xs)", cursor: "pointer" }}>Qué activar en Google Cloud (una vez)</summary>
          <ol>
            <li>En <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noreferrer">console.cloud.google.com</a>, en el MISMO proyecto que Drive, activa <strong>YouTube Data API v3</strong> y <strong>YouTube Analytics API</strong>.</li>
            <li>
              En <strong>Pantalla de consentimiento → Acceso a los datos</strong>, añade los alcances <code>youtube.upload</code>,
              {" "}<code>youtube.readonly</code> y <code>yt-analytics.readonly</code>.
            </li>
            <li>
              En <strong>Credenciales</strong>, en el cliente OAuth de Drive, añade como <em>URI de redirección autorizada</em>:
              <span className="integracion-uri">
                <code>{yt.redireccion}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await copiar(yt.redireccion, ""); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }}>
                  <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
                </button>
              </span>
            </li>
            {!yt.configurado && <li>En Cloudflare → <strong>Variables and Secrets</strong>, los secretos <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> (los mismos de Drive).</li>}
            <li>Mientras la app de Google esté «en prueba», añade como usuarios de prueba las cuentas de Google de los clientes (y el permiso caduca a los 7 días): pásala a «en producción».</li>
          </ol>
        </details>
      )}

      {yt?.configurado && (
        <ul className="cuentas-sociales" aria-label="YouTube de cada cliente">
          {clients.map((c) => {
            const id = c.dbId || c.id;
            const cuenta = deCliente(id);
            const opciones = porElegir(id);
            const elegido = eleccion[id] ?? opciones[0]?.id ?? "";
            return (
              <li key={c.id} className="youtube-fila">
                <span className="cuentas-sociales-nombre">
                  <strong>{c.name}</strong>
                  {cuenta ? <span> · {cuenta.nombre}{cuenta.usuario ? ` (@${cuenta.usuario})` : ""}</span>
                    : opciones.length ? <span> · elige el canal</span> : <span> · sin conectar</span>}
                </span>
                {cuenta && (
                  <>
                    <label className="sr-only" htmlFor={`${ids}-p-${c.id}`}>Con qué privacidad sale en el YouTube de {c.name}</label>
                    <select id={`${ids}-p-${c.id}`} className="input cuentas-sociales-cliente" value={cuenta.privacidad ?? "public"} disabled={!!trabajando}
                      onChange={(e) => hacer(`p-${cuenta.id}`, () => privacidadYouTube(cuenta.id, e.target.value), "Privacidad guardada.")}>
                      {PRIVACIDADES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                      onClick={() => { if (window.confirm(`¿Desconectar el YouTube de ${c.name}?`)) void hacer(`d-${cuenta.id}`, () => desconectarYouTube(cuenta.id)); }}>
                      Desconectar
                    </button>
                  </>
                )}
                {!cuenta && opciones.length > 0 && (
                  <>
                    <label className="sr-only" htmlFor={`${ids}-e-${c.id}`}>Canal de {c.name}</label>
                    <select id={`${ids}-e-${c.id}`} className="input cuentas-sociales-cliente" value={elegido} disabled={!!trabajando}
                      onChange={(e) => setEleccion((x) => ({ ...x, [id]: e.target.value }))}>
                      {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}{o.usuario ? ` (@${o.usuario})` : ""}</option>)}
                    </select>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!!trabajando || !elegido}
                      onClick={() => hacer(`e-${id}`, () => elegirCanalYouTube(elegido), `Canal asignado a ${c.name}.`)}>
                      Usar este canal
                    </button>
                  </>
                )}
                {!cuenta && !opciones.length && (
                  <span className="youtube-acciones">
                    <a className="btn btn-secondary btn-sm" href={urlConectarYouTube(id)}>Conectar aquí</a>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                      onClick={async () => {
                        const r = await hacer(`l-${c.id}`, () => enlaceYouTube(id));
                        if (r?.url) await copiar(r.url, `Enlace copiado: mándaselo a ${c.name}. Vale una semana.`);
                      }}>
                      <Icon name="link" size={14} /> Enlace para el cliente
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {yt?.configurado && (
        <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
          «Conectar aquí» abre Google en esta pestaña: entra con la cuenta que administra el canal DEL CLIENTE. Con el enlace, el cliente
          conecta desde su teléfono sin darte su contraseña. Para poner una portada propia, el canal tiene que estar verificado en YouTube.
        </p>
      )}
    </div>
  );
}
