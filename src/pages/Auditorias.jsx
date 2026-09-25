import "./Auditorias.css";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "../components/Icon";
import AuditoriaVista from "../components/AuditoriaVista";
import * as db from "../lib/db";
import { usuarioInstagram } from "../lib/auditoria";
import { capturaReducida } from "../lib/medios";

// ============================================================
// /auditorias — la auditoría del perfil de Instagram
//
// De un cliente (con su cuenta conectada se lee directo) o de un
// prospecto, escribiendo su usuario: la API deja leer cualquier cuenta de
// empresa o creador. Los destacados no los da la API nunca, y una cuenta
// personal no se puede leer: para eso están las capturas, que la IA mira.
//
// Lo que sale se comparte con un enlace (sin sesión, como el informe) o
// se descarga como PDF. Las portadas de los destacados se crean con Nano
// Banana en los colores del cliente.
// ============================================================

const MAX_CAPTURAS = 4;

function NuevaAuditoria({ clients, onCreada }) {
  const ids = useId();
  const entrada = useRef(null);
  const [tipo, setTipo] = useState("cliente");
  const [cliente, setCliente] = useState("");
  const [usuario, setUsuario] = useState("");
  const [capturas, setCapturas] = useState([]);
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState("");

  const elegido = clients.find((c) => c.id === cliente);
  const usuarioLimpio = usuarioInstagram(usuario || (tipo === "cliente" ? elegido?.instagram : ""));
  const puede = !trabajando && (tipo === "cliente" ? Boolean(cliente) : Boolean(usuarioLimpio) || capturas.length > 0);

  const anadir = async (archivos) => {
    const nuevas = [];
    for (const f of [...archivos].slice(0, MAX_CAPTURAS - capturas.length)) {
      try { nuevas.push(await capturaReducida(f)); } catch { setFallo(`No se pudo leer «${f.name}».`); }
    }
    setCapturas((c) => [...c, ...nuevas].slice(0, MAX_CAPTURAS));
  };

  const auditar = async (e) => {
    e.preventDefault();
    setFallo("");
    setTrabajando(true);
    try {
      const a = await db.crearAuditoria({
        clientId: tipo === "cliente" ? cliente : null,
        usuario: usuarioLimpio ?? "",
        capturas,
        nota,
      });
      setCapturas([]);
      setNota("");
      onCreada(a);
    } catch (err) {
      setFallo(err.message);
    }
    setTrabajando(false);
  };

  return (
    <form className="aud-nueva" onSubmit={auditar} aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`}>Nueva auditoría</h2>
      <div className="segmented" role="group" aria-label="De quién">
        <button type="button" className={`segmented-btn ${tipo === "cliente" ? "active" : ""}`} aria-pressed={tipo === "cliente"} onClick={() => setTipo("cliente")}>
          <Icon name="building" size={14} /> Un cliente
        </button>
        <button type="button" className={`segmented-btn ${tipo === "prospecto" ? "active" : ""}`} aria-pressed={tipo === "prospecto"} onClick={() => setTipo("prospecto")}>
          <Icon name="user" size={14} /> Un prospecto
        </button>
      </div>

      {tipo === "cliente" && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-c`}>Cliente</label>
          <select id={`${ids}-c`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Escoge un cliente</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.instagram ? ` (${c.instagram})` : ""}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor={`${ids}-u`}>
          {tipo === "cliente" ? "Usuario de Instagram (si no es el de su ficha)" : "Usuario de Instagram del prospecto"}
        </label>
        <input
          id={`${ids}-u`}
          className="input"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder={tipo === "cliente" ? elegido?.instagram || "@usuario" : "@usuario o el enlace del perfil"}
          autoComplete="off"
        />
        {usuario && !usuarioInstagram(usuario) && <p className="hint" role="alert">Eso no parece un usuario de Instagram.</p>}
      </div>

      <div className="field">
        <span className="label">Capturas del perfil (opcional, hasta {MAX_CAPTURAS})</span>
        <p className="hint">
          Los destacados no los da la API de Instagram: haz una captura del perfil en el teléfono y súbela aquí. También sirven para
          cuentas personales, que la API no deja leer.
        </p>
        {capturas.length > 0 && (
          <ul className="aud-capturas">
            {capturas.map((c, i) => (
              <li key={c.slice(-40)}>
                <img src={c} alt={`Captura ${i + 1}`} />
                <button type="button" className="btn-icon" onClick={() => setCapturas((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar la captura ${i + 1}`}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Capturas del perfil"
          onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void anadir(fs); }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={capturas.length >= MAX_CAPTURAS}>
          <Icon name="upload" size={16} /> Subir capturas
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-n`}>Algo que quieras que mire (opcional)</label>
        <textarea id={`${ids}-n`} className="textarea" style={{ minHeight: 56 }} value={nota} maxLength={600} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: quieren vender más por WhatsApp; el público es de Chiriquí…" />
      </div>

      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      <button type="submit" className="btn btn-primary" disabled={!puede}>
        <Icon name="search" size={16} /> {trabajando ? "Auditando… (uno o dos minutos)" : "Auditar el perfil"}
      </button>
      <p className="hint">La lee la IA con la foto, la rejilla y las capturas: cuenta en el gasto de IA del mes.</p>
    </form>
  );
}

export default function Auditorias({ clients = [], pulso = 0 }) {
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState("");
  const [portadas, setPortadas] = useState({});
  const nombreCliente = (id) => clients.find((c) => c.id === id)?.name ?? "";

  const cargar = useCallback(() => db.listarAuditorias().then(setLista).catch((e) => setAviso(e.message)), []);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const abrir = async (id) => {
    setAviso("");
    setPortadas({});
    try { setAbierta(await db.leerAuditoria(id)); } catch (e) { setAviso(e.message); }
  };

  const compartir = async () => {
    try {
      const { testigo } = await db.compartirAuditoria(abierta.id);
      const url = `${window.location.origin}/auditoria?t=${testigo}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      setAbierta((a) => ({ ...a, compartido: true, testigo }));
      setAviso(`Enlace copiado: ${url}`);
    } catch (e) { setAviso(e.message); }
  };
  const dejar = async () => {
    try {
      await db.dejarDeCompartirAuditoria(abierta.id);
      setAbierta((a) => ({ ...a, compartido: false }));
      setAviso("El enlace ya no abre la auditoría.");
    } catch (e) { setAviso(e.message); }
  };
  const borrar = async () => {
    if (!window.confirm(`¿Borrar la auditoría de @${abierta.usuario}? El enlace dejará de funcionar.`)) return;
    try {
      await db.borrarAuditoria(abierta.id);
      setAbierta(null);
      await cargar();
    } catch (e) { setAviso(e.message); }
  };
  const portada = async (d) => {
    try {
      const { clave } = await db.generateImage({ clientId: abierta.clientId, portada: d });
      setPortadas((p) => ({ ...p, [d.titulo]: db.getContentBankUrl(clave) }));
    } catch (e) { setAviso(`No se pudo crear la portada: ${e.message}`); }
  };

  const clienteDe = (a) => clients.find((c) => c.id === a?.clientId);

  return (
    <div className="auditorias">
      <div className="page-header">
        <h1 className="page-title">Auditorías</h1>
        <p className="page-meta">El perfil de Instagram de un cliente o de un prospecto: qué cambiar en la foto, el nombre, la biografía, el enlace, los destacados y la rejilla, y por dónde empezar.</p>
      </div>

      <div role="status" aria-live="polite" className={aviso ? undefined : "sr-only"}>
        {aviso && <p className="notice notice-ok" style={{ overflowWrap: "anywhere" }}>{aviso}</p>}
      </div>

      {abierta ? (
        <>
          <div className="aud-barra">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierta(null)}>
              <Icon name="chevronLeft" size={16} /> Todas las auditorías
            </button>
            <span className="toolbar-spacer" />
            {abierta.estado === "listo" && (abierta.compartido
              ? <button type="button" className="btn btn-secondary btn-sm" onClick={dejar}>Dejar de compartir</button>
              : <button type="button" className="btn btn-primary btn-sm" onClick={compartir}><Icon name="link" size={16} /> Compartir enlace</button>)}
            {abierta.compartido && <button type="button" className="btn btn-secondary btn-sm" onClick={compartir}><Icon name="copy" size={16} /> Copiar enlace</button>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}><Icon name="download" size={16} /> PDF</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={borrar} aria-label="Borrar la auditoría"><Icon name="trash" size={16} /></button>
          </div>
          {abierta.estado === "error" && <p role="alert" className="notice notice-error">{abierta.error}</p>}
          {abierta.estado === "generando" && <p role="status" className="hint">Todavía se está escribiendo…</p>}
          {abierta.estado === "listo" && (
            <AuditoriaVista
              auditoria={{ ...abierta.datos, analisis: abierta.analisis, usuario: abierta.usuario, actualizada: abierta.actualizada }}
              cliente={clienteDe(abierta) ? { name: clienteDe(abierta).name, primaryColor: clienteDe(abierta).primaryColor } : null}
              onPortada={abierta.clientId ? portada : null}
              portadas={portadas}
            />
          )}
        </>
      ) : (
        <div className="aud-rejilla">
          <NuevaAuditoria clients={clients} onCreada={(a) => { setAbierta(a); void cargar(); }} />
          <section className="aud-hechas" aria-label="Auditorías hechas">
            <h2>Hechas</h2>
            {!lista && <p className="hint">Cargando…</p>}
            {lista?.length === 0 && <p className="hint">Todavía no hay ninguna.</p>}
            <ul>
              {(lista ?? []).map((a) => (
                <li key={a.id}>
                  <button type="button" className="aud-item" onClick={() => abrir(a.id)} data-estado={a.estado}>
                    <span className="aud-item-usuario">@{a.usuario}</span>
                    <span className="aud-item-meta">
                      {a.clientId ? nombreCliente(a.clientId) || "Cliente" : "Prospecto"} · {new Date(a.creada).toLocaleDateString("es-PA", { day: "numeric", month: "short" })}
                      {a.compartido && " · compartida"}
                    </span>
                    <span className="aud-item-estado">
                      {a.estado === "listo" ? (a.puntuacion ?? "—") : a.estado === "generando" ? "Escribiendo…" : "Falló"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
