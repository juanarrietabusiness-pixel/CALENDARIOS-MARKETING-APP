import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

// ============================================================
// Ajustes → Integraciones → TikTok
//
// A diferencia de Meta, cada cuenta se conecta entrando con ELLA: no hay
// un usuario de agencia que vea las de todos. Por eso, por cliente, dos
// caminos: «Conectar aquí» (si la agencia tiene su acceso) o «Enlace
// para el cliente», que el cliente abre en su teléfono.
//
// Y el modo de cada cuenta: Borrador (llega a su bandeja de TikTok y lo
// publica con un toque; funciona siempre) o Directo (sale publicado, en
// privado hasta que TikTok revise la app).
// ============================================================

function leerVuelta() {
  const p = new URLSearchParams(window.location.search);
  const t = p.get("tiktok");
  if (!t) return null;
  const vuelta = { ok: t === "ok", motivo: p.get("motivo") ?? "" };
  window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  return vuelta;
}

export default function SeccionTikTok({ clients = [], pulso = 0 }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [vuelta] = useState(leerVuelta);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [copiado, setCopiado] = useState(false);

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

  const tk = estado?.tiktok;
  const cuentas = (estado?.cuentas ?? []).filter((c) => c.red === "tiktok");
  const deCliente = (c) => cuentas.find((x) => x.clientId === (c.dbId || c.id));

  return (
    <div className="integracion">
      <div className="integracion-cabecera">
        <span className="integracion-icono" aria-hidden="true"><Icon name="video" size={22} /></span>
        <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>TikTok</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Manda los videos a la cuenta de TikTok de cada cliente y mide cómo les va.
          </p>
        </div>
        {tk && (
          <span className={`badge ${cuentas.length ? "badge-ok" : ""}`} data-estado={cuentas.length ? "ok" : tk.configurado ? "pendiente" : "sin-configurar"}>
            {cuentas.length ? `${cuentas.length} conectada${cuentas.length > 1 ? "s" : ""}` : tk.configurado ? "Sin cuentas" : "Pendiente de configurar"}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite">
        {vuelta?.ok && <p className="notice notice-ok">La cuenta de TikTok quedó conectada.</p>}
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {vuelta && !vuelta.ok && <p role="alert" className="notice notice-error">No se conectó: {vuelta.motivo || "TikTok no dio el permiso."}</p>}
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {tk && !tk.configurado && (
        <div className="integracion-pasos">
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Falta crear la app de TikTok (unos 20 minutos, una vez):
          </p>
          <ol>
            <li>En <a href="https://developers.tiktok.com/apps" target="_blank" rel="noreferrer">developers.tiktok.com</a> → <strong>Manage apps → Connect an app</strong>, con la cuenta de la agencia.</li>
            <li>Añade los productos <strong>Login Kit</strong> y <strong>Content Posting API</strong> (activa «Direct Post» si quieres publicar sin pasar por la bandeja).</li>
            <li>
              En Login Kit, como <em>Redirect URI</em>:
              <span className="integracion-uri">
                <code>{tk.redireccion}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await copiar(tk.redireccion, ""); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }}>
                  <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
                </button>
              </span>
            </li>
            <li>Permisos (scopes): <code>user.info.basic</code>, <code>user.info.profile</code>, <code>user.info.stats</code>, <code>video.list</code>, <code>video.upload</code>, <code>video.publish</code>.</li>
            <li>Pon como política de privacidad <code>{tk.redireccion.replace(/\/api\/.*/, "/privacidad")}</code>.</li>
            <li>En Cloudflare → <strong>Variables and Secrets</strong>, añade como <strong>Secret</strong> <code>TIKTOK_CLIENT_KEY</code> y <code>TIKTOK_CLIENT_SECRET</code>.</li>
            <li>
              Mientras TikTok no la revise, la app funciona en <strong>Sandbox</strong>: añade ahí las cuentas de tus clientes como
              usuarios de prueba (hasta 10). Para más, envíala a revisión desde el mismo panel.
            </li>
          </ol>
        </div>
      )}

      {tk?.configurado && (
        <ul className="cuentas-sociales" aria-label="TikTok de cada cliente">
          {clients.map((c) => {
            const cuenta = deCliente(c);
            const id = c.dbId || c.id;
            return (
              <li key={c.id} className="tiktok-fila">
                <span className="cuentas-sociales-nombre">
                  <strong>{c.name}</strong>
                  {cuenta ? <span> · @{cuenta.usuario || cuenta.nombre}</span> : <span> · sin conectar</span>}
                </span>
                {cuenta ? (
                  <>
                    <label className="sr-only" htmlFor={`${ids}-${c.id}`}>Cómo se publica en el TikTok de {c.name}</label>
                    <select id={`${ids}-${c.id}`} className="input cuentas-sociales-cliente" value={cuenta.modo} disabled={!!trabajando}
                      onChange={(e) => hacer(`m-${cuenta.id}`, () => db.modoTikTok(cuenta.id, e.target.value), "Modo guardado.")}>
                      <option value="borrador">Borrador: a su bandeja de TikTok</option>
                      <option value="directo">Directo: sale publicado</option>
                    </select>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                      onClick={() => { if (window.confirm(`¿Desconectar el TikTok de ${c.name}?`)) void hacer(`d-${cuenta.id}`, () => db.desconectarTikTok(cuenta.id)); }}>
                      Desconectar
                    </button>
                  </>
                ) : (
                  <span className="tiktok-acciones">
                    <a className="btn btn-secondary btn-sm" href={db.urlConectarTikTok(id)}>Conectar aquí</a>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                      onClick={async () => {
                        const r = await hacer(`e-${c.id}`, () => db.enlaceTikTok(id));
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
      {tk?.configurado && (
        <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
          «Conectar aquí» abre TikTok en esta pestaña: entra con la cuenta DEL CLIENTE. Con el enlace, el cliente conecta desde su
          teléfono sin darte su contraseña. En modo Directo, hasta que TikTok revise la app, los videos salen en privado.
        </p>
      )}
    </div>
  );
}
