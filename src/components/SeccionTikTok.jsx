import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

// ============================================================
// Ajustes → Integraciones → TikTok (por PostPeer)
//
// La app propia de TikTok nunca pasó la auditoría y sólo dejaba
// borradores; ahora se publica por PostPeer, que tiene la suya auditada.
// Por cliente: «Conectar con PostPeer» crea su perfil allí y da la
// dirección del permiso, que se abre ENTRANDO CON LA CUENTA DEL CLIENTE;
// al volver, «Ya la conecté» trae la cuenta. Si eso falla, se puede pegar
// el id de la cuenta que enseña el panel de PostPeer.
//
// El perfil de PostPeer de cada cliente se recuerda en este navegador:
// pulsar dos veces «Conectar» no crea dos perfiles.
// ============================================================

const clavePerfil = (clientId) => `postpeer-perfil:${clientId}`;
const leerPerfil = (clientId) => { try { return localStorage.getItem(clavePerfil(clientId)); } catch { return null; } };
const guardarPerfil = (clientId, perfil) => { try { localStorage.setItem(clavePerfil(clientId), perfil); } catch { /* se creará otro la próxima vez */ } };

export default function SeccionTikTok({ clients = [], pulso = 0 }) {
  const ids = useId();
  const [estado, setEstado] = useState(null);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState("");
  // Por cliente: { url, profileId } mientras se autoriza en PostPeer.
  const [enCurso, setEnCurso] = useState({});
  // Por cliente: el campo de «Pegar el id» abierto y lo escrito.
  const [pegando, setPegando] = useState({});
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(() => {
    db.estadoRedes().then(setEstado).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

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
  const conectadas = cuentas.filter((c) => c.clientId).length;

  const conectar = async (c) => {
    const id = c.dbId || c.id;
    const r = await hacer(`c-${id}`, () => db.conectarPostPeer(id, leerPerfil(id)));
    if (!r?.url) return;
    guardarPerfil(id, r.profileId);
    setEnCurso((p) => ({ ...p, [id]: r }));
  };

  const vincular = async (c, extra) => {
    const id = c.dbId || c.id;
    const r = await hacer(`v-${id}`, () => db.vincularPostPeer(id, extra), `El TikTok de ${c.name} quedó conectado por PostPeer.`);
    if (!r) return;
    setEnCurso((p) => { const n = { ...p }; delete n[id]; return n; });
    setPegando((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const copiarWebhook = async () => {
    try { await navigator.clipboard.writeText(tk.urlWebhook); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setAviso(tk.urlWebhook); }
  };

  return (
    <div className="integracion">
      <div className="integracion-cabecera">
        <span className="integracion-icono" aria-hidden="true"><Icon name="video" size={22} /></span>
        <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
          <p style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>TikTok (PostPeer)</p>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            Publica videos, fotos y carruseles en el TikTok de cada cliente, en público, a la hora del calendario.
          </p>
        </div>
        {tk && (
          <span className={`badge ${conectadas ? "badge-ok" : ""}`} data-estado={conectadas ? "ok" : tk.configurado ? "pendiente" : "sin-configurar"}>
            {conectadas ? `${conectadas} conectada${conectadas > 1 ? "s" : ""}` : tk.configurado ? "Sin cuentas" : "Pendiente de configurar"}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite">
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {tk && !tk.configurado && (
        <div className="integracion-pasos">
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>Falta la llave de PostPeer (una vez):</p>
          <ol>
            <li>En <a href="https://www.postpeer.dev" target="_blank" rel="noreferrer">postpeer.dev</a>, con la cuenta de la agencia, crea una llave en <strong>Claves de acceso</strong>.</li>
            <li>En Cloudflare → Worker → <strong>Settings → Variables and Secrets</strong>, añádela como <strong>Secret</strong> con el nombre <code>POSTPEER_API_KEY</code>.</li>
          </ol>
        </div>
      )}

      {tk?.configurado && (
        <>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
              onClick={() => hacer("llave", () => db.comprobarPostPeer(), "La llave de PostPeer funciona.")}>
              <Icon name="check" size={14} /> Comprobar la llave
            </button>
            {!tk.webhook && (
              <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
                Sin webhook: el estado se consulta cada minuto, que también sirve.
              </span>
            )}
          </div>
          {!tk.webhook && (
            <div className="integracion-pasos">
              <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                Para enterarse al momento (opcional): registra en PostPeer un webhook con esta dirección y guarda su secreto en
                Cloudflare como <code>POSTPEER_WEBHOOK_SECRET</code>.
              </p>
              <span className="integracion-uri">
                <code>{tk.urlWebhook}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={copiarWebhook}>
                  <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
                </button>
              </span>
            </div>
          )}

          <ul className="cuentas-sociales" aria-label="TikTok de cada cliente">
            {clients.map((c) => {
              const id = c.dbId || c.id;
              const cuenta = deCliente(c);
              const lista = Boolean(cuenta);
              const curso = enCurso[id];
              const pegado = pegando[id];
              return (
                <li key={c.id} className="tiktok-fila">
                  <span className="cuentas-sociales-nombre">
                    <strong>{c.name}</strong>
                    {lista ? <span> · {cuenta.usuario ? `@${cuenta.usuario}` : cuenta.nombre || "conectada"} · PostPeer</span>
                      : <span> · sin conectar</span>}
                  </span>
                  <span className="tiktok-acciones">
                    {!lista && !curso && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando} onClick={() => conectar(c)}>
                        Conectar con PostPeer
                      </button>
                    )}
                    {curso && (
                      <>
                        <a className="btn btn-secondary btn-sm" href={curso.url} target="_blank" rel="noreferrer">
                          <Icon name="link" size={14} /> Abrir el permiso
                        </a>
                        <button type="button" className="btn btn-primary btn-sm" disabled={!!trabajando}
                          onClick={() => vincular(c, { profileId: curso.profileId })}>
                          Ya la conecté
                        </button>
                      </>
                    )}
                    {!lista && (
                      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={Boolean(pegado)} aria-controls={`${ids}-${c.id}-pegar`}
                        onClick={() => setPegando((p) => ({ ...p, [id]: p[id] ? undefined : { texto: "" } }))}>
                        Pegar el id
                      </button>
                    )}
                    {cuenta && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                        onClick={() => { if (window.confirm(`¿Quitar el TikTok de ${c.name} de la aplicación? En PostPeer sigue conectado.`)) void hacer(`d-${cuenta.id}`, () => db.desconectarTikTok(cuenta.id)); }}>
                        Quitar
                      </button>
                    )}
                  </span>
                  {pegado && (
                    <form id={`${ids}-${c.id}-pegar`} className="tiktok-acciones" style={{ gridColumn: "1 / -1" }}
                      onSubmit={(e) => { e.preventDefault(); if (pegado.texto.trim()) void vincular(c, { accountId: pegado.texto.trim(), profileId: leerPerfil(id) }); }}>
                      <label className="sr-only" htmlFor={`${ids}-${c.id}-id`}>Id de la cuenta de TikTok en PostPeer para {c.name}</label>
                      <input id={`${ids}-${c.id}-id`} className="input" placeholder="Id de la cuenta en PostPeer" value={pegado.texto} autoComplete="off"
                        onChange={(e) => setPegando((p) => ({ ...p, [id]: { texto: e.target.value } }))} />
                      <button type="submit" className="btn btn-secondary btn-sm" disabled={!!trabajando || !pegado.texto.trim()}>Guardar</button>
                    </form>
                  )}
                  {curso && (
                    <p style={{ gridColumn: "1 / -1", fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
                      Abre el permiso, entra con la cuenta de TikTok DE {c.name.toUpperCase()} y acepta. Al volver, pulsa «Ya la conecté».
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
            Video, o fotos: una sola o un carrusel de hasta 32, todas con la misma proporción (sale con música).
            En las publicaciones de fotos TikTok se marca a mano. Cada publicación gasta créditos de PostPeer.
          </p>
        </>
      )}
    </div>
  );
}
