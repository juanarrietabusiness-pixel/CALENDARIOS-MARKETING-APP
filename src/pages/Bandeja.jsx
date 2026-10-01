import "./Bandeja.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import InterruptorBandeja from "../components/InterruptorBandeja";
import * as api from "../lib/bandeja";
import { REDES } from "../lib/publicacion";
import { navegar } from "../lib/rutas";
import { conversaciones, filtrarHilos, haceCuanto, ventanaMensajes, PARA_QUE_PERMISO, TOPE_RESPUESTA } from "../lib/bandejaVista";

// ============================================================
// /bandeja: comentarios y mensajes de Facebook e Instagram
//
// Sólo de los clientes con la bandeja ENCENDIDA (el interruptor está aquí
// arriba y en la ficha de cada cliente). Llegan solos por el webhook de
// Meta; «Actualizar» es el respaldo, por si Meta no avisó.
//
// Dos pestañas sobre los mismos filtros. Comentarios: cada uno con su
// publicación y sus respuestas debajo. Mensajes: la lista de hilos y el
// hilo abierto, con la ventana de 24 horas de Meta a la vista: fuera de
// ella el campo se desactiva y dice por qué (lo comprueba también el
// Worker antes de enviar).
//
// Se relee con cada `pulso`: el webhook avisa al espacio al guardar.
// ============================================================

const RED_MSJ = { instagram: "Instagram", facebook: "Messenger" };

function leerVuelta() {
  const p = new URLSearchParams(window.location.search);
  const meta = p.get("meta");
  if (!meta) return null;
  const vuelta = { ok: meta === "ok", motivo: p.get("motivo") ?? "" };
  window.history.replaceState({}, "", window.location.pathname);
  return vuelta;
}

function Publicacion({ p, red }) {
  if (!p?.id) return null;
  return (
    <div className="bnd-publicacion">
      <span className="bnd-miniatura" aria-hidden="true">
        {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" /> : <Icon name={REDES[red]?.icono ?? "photo"} size={16} />}
      </span>
      <span className="bnd-publicacion-texto">{p.texto || "Publicación sin texto"}</span>
      {/^https:\/\//.test(p.enlace ?? "") && (
        <a className="bnd-enlace" href={p.enlace} target="_blank" rel="noreferrer">
          Ver en {REDES[red]?.nombre ?? "la red"}<span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      )}
    </div>
  );
}

function Comentario({ c, principal = false }) {
  return (
    <div className="bnd-comentario" data-propio={c.propio ? "si" : undefined}>
      <p className="bnd-autor">
        <strong>{c.propio ? `${c.autor || "La cuenta"} (respuesta)` : c.autor || "Alguien"}</strong>
        <span className="bnd-cuando" title={new Date(c.creadoAt).toLocaleString("es-PA", { timeZone: "America/Panama" })}>{haceCuanto(c.creadoAt)}</span>
        {c.oculto && <span className="badge">Oculto</span>}
        {principal && c.atendido && !c.propio && <span className="badge badge-ok">Atendido</span>}
      </p>
      <p className="bnd-texto">{c.texto || <em>(sin texto)</em>}</p>
    </div>
  );
}

/** Una conversación de comentarios: el comentario, sus respuestas y lo que se puede hacer. */
function TarjetaComentario({ h, cliente, onHecho, onFallo }) {
  const ids = useId();
  const [respondiendo, setRespondiendo] = useState(false);
  const [texto, setTexto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const red = REDES[h.red]?.nombre ?? h.red;
  const pendientes = [h, ...h.respuestas].filter((c) => !c.propio && !c.atendido);

  const hacer = async (clave, accion, ok) => {
    setOcupado(clave);
    try {
      await accion();
      onHecho(ok);
      return true;
    } catch (e) {
      onFallo(e.message);
      return false;
    } finally {
      setOcupado("");
    }
  };

  const enviar = async (e) => {
    e.preventDefault();
    const hecho = await hacer("responder", () => api.responderComentario(h.id, texto), `Respuesta publicada en ${red}.`);
    if (hecho) { setTexto(""); setRespondiendo(false); }
  };

  return (
    <li className="bnd-tarjeta" data-pendiente={pendientes.length ? "si" : undefined}>
      <p className="bnd-origen">
        <span className="bnd-cliente">{cliente?.name ?? "Cliente"}</span>
        <span className="bnd-red"><Icon name={REDES[h.red]?.icono ?? "globe"} size={13} /> {red}</span>
      </p>
      <Publicacion p={h.publicacion} red={h.red} />
      <Comentario c={h} principal />
      {h.respuestas.length > 0 && (
        <ul className="bnd-respuestas" aria-label="Respuestas">
          {h.respuestas.map((r) => <li key={r.id}><Comentario c={r} /></li>)}
        </ul>
      )}

      {respondiendo && (
        <form className="bnd-responder" onSubmit={enviar}>
          <label className="sr-only" htmlFor={`${ids}-r`}>Respuesta pública a {h.autor || "este comentario"}</label>
          <textarea
            id={`${ids}-r`}
            className="input"
            rows={2}
            maxLength={TOPE_RESPUESTA}
            value={texto}
            placeholder={`Responder en ${red} (se ve en público)`}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
          />
          <div className="bnd-acciones">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim() || ocupado === "responder"}>
              <Icon name="send" size={14} /> {ocupado === "responder" ? "Publicando…" : "Publicar respuesta"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRespondiendo(false); setTexto(""); }}>Cancelar</button>
          </div>
        </form>
      )}

      {confirmar ? (
        <div className="bnd-confirmar" role="group" aria-label="Confirmar borrado">
          <p>¿Borrar este comentario en {red}? No se puede deshacer.</p>
          <div className="bnd-acciones">
            <button type="button" className="btn btn-danger btn-sm" disabled={ocupado === "borrar"}
              onClick={() => hacer("borrar", () => api.borrarComentario(h.id), "Comentario borrado.")}>
              <Icon name="trash" size={14} /> {ocupado === "borrar" ? "Borrando…" : "Sí, borrar"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmar(false)}>No</button>
          </div>
        </div>
      ) : !respondiendo && (
        <div className="bnd-acciones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRespondiendo(true)}>
            <Icon name="messageCircle" size={14} /> Responder
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado}
            onClick={() => hacer("ocultar", () => api.ocultarComentario(h.id, !h.oculto), h.oculto ? "El comentario vuelve a verse." : "Comentario oculto: sólo lo ven quien lo escribió y sus amigos.")}>
            <Icon name={h.oculto ? "eye" : "eyeOff"} size={14} /> {h.oculto ? "Mostrar" : "Ocultar"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => setConfirmar(true)}>
            <Icon name="trash" size={14} /> Borrar
          </button>
          {pendientes.length ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado}
              onClick={() => hacer("atender", () => Promise.all(pendientes.map((c) => api.atenderComentario(c.id, true))), "Marcado como atendido.")}>
              <Icon name="check" size={14} /> Marcar atendido
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado}
              onClick={() => hacer("atender", () => api.atenderComentario(h.id, false), "Vuelve a pendientes.")}>
              <Icon name="undo" size={14} /> Volver a pendientes
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** El hilo abierto: los mensajes y la respuesta, con la ventana de 24 h. */
function Hilo({ hiloId, cliente, pulso, onVolver, onHecho, onFallo }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const lista = useRef(null);

  useEffect(() => {
    let vivo = true;
    api.leerHilo(hiloId).then((d) => { if (vivo) setDatos(d); }).catch((e) => onFallo(e.message));
    return () => { vivo = false; };
  }, [hiloId, pulso, onFallo]);
  // La ventana se cierra sola: se vuelve a mirar cada minuto.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Al último mensaje, desplazando sólo la lista (no la página entera).
  useEffect(() => { if (lista.current) lista.current.scrollTop = lista.current.scrollHeight; }, [datos]);

  if (!datos) return <p role="status" className="hint">Cargando la conversación…</p>;
  const { hilo, mensajes } = datos;
  const ventana = ventanaMensajes(hilo.ultimoUsuarioAt, ahora, hilo.red);

  const enviar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await api.responderHilo(hilo.id, texto);
      setTexto("");
      onHecho("Mensaje enviado.");
    } catch (err) {
      onFallo(err.message);
    }
    setOcupado(false);
  };

  return (
    <section className="bnd-hilo" aria-labelledby={`${ids}-t`}>
      <div className="bnd-hilo-cabecera">
        <button type="button" className="btn btn-ghost btn-sm bnd-volver" onClick={onVolver}>
          <Icon name="chevronLeft" size={16} /> Conversaciones
        </button>
        <h2 id={`${ids}-t`} className="bnd-hilo-titulo">
          {hilo.usuario || `Persona de ${RED_MSJ[hilo.red]}`}
          <span className="bnd-hilo-sub">{cliente?.name ?? "Cliente"} · {RED_MSJ[hilo.red]}</span>
        </h2>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => api.atenderHilo(hilo.id, !hilo.atendido).then(() => onHecho(hilo.atendido ? "Vuelve a pendientes." : "Marcada como atendida.")).catch((err) => onFallo(err.message))}>
          <Icon name={hilo.atendido ? "undo" : "check"} size={14} /> {hilo.atendido ? "Volver a pendientes" : "Marcar atendida"}
        </button>
      </div>

      <ol ref={lista} className="bnd-mensajes" aria-label="Mensajes">
        {mensajes.map((m) => (
          <li key={m.id} className="bnd-mensaje" data-propio={m.propio ? "si" : undefined}>
            <span className="sr-only">{m.propio ? "La cuenta" : hilo.usuario || "La persona"}: </span>
            {m.texto || (m.adjuntos?.length ? "(archivo adjunto)" : "")}
            <span className="bnd-mensaje-hora">{haceCuanto(m.enviadoAt, ahora)}</span>
          </li>
        ))}
      </ol>

      <form className="bnd-responder" onSubmit={enviar}>
        <label className="sr-only" htmlFor={`${ids}-m`}>Responder a {hilo.usuario || "esta persona"}</label>
        <textarea
          id={`${ids}-m`}
          className="input"
          rows={2}
          maxLength={TOPE_RESPUESTA}
          value={texto}
          disabled={!ventana.abierta || ocupado}
          aria-describedby={`${ids}-v`}
          placeholder={ventana.abierta ? `Escribe por ${RED_MSJ[hilo.red]}…` : "No se puede responder desde aquí"}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p id={`${ids}-v`} className={`bnd-ventana${ventana.abierta ? "" : " is-cerrada"}`}>
          <Icon name={ventana.abierta ? "clock" : "lock"} size={13} />{" "}
          {ventana.abierta ? (ventana.aviso || "Puedes responder: la persona escribió en las últimas 24 horas.") : ventana.motivo}
        </p>
        <div className="bnd-acciones">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!ventana.abierta || !texto.trim() || ocupado}>
            <Icon name="send" size={14} /> {ocupado ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function Bandeja({ clients = [], pulso = 0, yo }) {
  const ids = useId();
  const [vuelta] = useState(leerVuelta);
  const [estado, setEstado] = useState(null);
  const [comentarios, setComentarios] = useState(null);
  const [hilos, setHilos] = useState(null);
  const [pestana, setPestana] = useState("comentarios");
  const [cliente, setCliente] = useState("");
  const [red, setRed] = useState("");
  const [filtro, setFiltro] = useState("pendientes");
  const [abierto, setAbierto] = useState(null);
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");
  const [actualizando, setActualizando] = useState(false);
  const esAdmin = yo?.rol === "admin";

  const cargar = useCallback(() => {
    api.estadoBandeja().then(setEstado).catch((e) => setFallo(e.message));
    api.listarComentarios().then(setComentarios).catch((e) => setFallo(e.message));
    api.listarHilos().then(setHilos).catch((e) => setFallo(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const porId = useMemo(() => new Map(clients.map((c) => [c.dbId || c.id, c])), [clients]);
  const encendidos = useMemo(() => (estado?.clientes ?? []).filter((c) => c.activa), [estado]);
  const vistaComentarios = useMemo(() => conversaciones(comentarios ?? [], { cliente, red, estado: filtro }), [comentarios, cliente, red, filtro]);
  const vistaHilos = useMemo(() => filtrarHilos(hilos ?? [], { cliente, red, estado: filtro === "ocultos" ? "todos" : filtro }), [hilos, cliente, red, filtro]);
  const nComentarios = useMemo(() => conversaciones(comentarios ?? [], { cliente, red }).length, [comentarios, cliente, red]);
  const nHilos = useMemo(() => filtrarHilos(hilos ?? [], { cliente, red }).length, [hilos, cliente, red]);

  const hecho = useCallback((texto) => { setFallo(""); setAviso(texto); cargar(); }, [cargar]);
  const fallar = useCallback((texto) => { setAviso(""); setFallo(texto); }, []);

  const actualizar = async () => {
    const lista = cliente ? encendidos.filter((c) => c.clientId === cliente) : encendidos;
    if (!lista.length) return;
    setActualizando(true);
    setAviso("");
    setFallo("");
    const avisos = [];
    let nuevos = 0;
    for (const c of lista) {
      try {
        const r = await api.actualizarBandeja(c.clientId);
        nuevos += (r.comentarios ?? 0) + (r.mensajes ?? 0);
        for (const a of r.avisos ?? []) avisos.push(`${porId.get(c.clientId)?.name ?? "Cliente"} — ${a}`);
      } catch (e) {
        avisos.push(`${porId.get(c.clientId)?.name ?? "Cliente"} — ${e.message}`);
      }
    }
    setActualizando(false);
    if (avisos.length) setFallo(avisos.join(" · "));
    setAviso(`Actualizado. ${nuevos ? `${nuevos} ${nuevos === 1 ? "cosa leída" : "cosas leídas"} de Meta.` : "Nada nuevo."}`);
    cargar();
  };

  const meta = estado?.meta;
  const faltan = meta?.faltan ?? null;
  const vacio = pestana === "comentarios" ? vistaComentarios.length === 0 : vistaHilos.length === 0;

  return (
    <div className="bandeja">
      <div className="page-header">
        <div className="page-header-top">
          <h1 className="page-title">Bandeja</h1>
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" disabled={actualizando || !encendidos.length} onClick={actualizar}>
              <Icon name="refresh" size={18} /> {actualizando ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>
        <p className="page-meta">
          Comentarios y mensajes de Facebook e Instagram de los clientes con la bandeja encendida. Llegan solos; «Actualizar» lee
          lo último de Meta por si alguno no llegó.
        </p>
      </div>

      <div role="status" aria-live="polite">
        {vuelta?.ok && <p className="notice notice-ok">Meta quedó conectado con los permisos de la bandeja.{vuelta.motivo ? ` ${vuelta.motivo}` : ""}</p>}
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {vuelta && !vuelta.ok && <p role="alert" className="notice notice-error">No se concedieron: {vuelta.motivo || "Facebook no dio el permiso."}</p>}
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {meta && !meta.conectado && (
        <p className="notice notice-warn">
          <Icon name="plug" size={14} /> Meta no está conectado. Conéctalo en <a href="/ajustes#integraciones" onClick={(e) => { e.preventDefault(); navegar("/ajustes#integraciones"); }}>Ajustes → Integraciones</a> y asigna las cuentas a cada cliente.
        </p>
      )}
      {meta?.conectado && faltan?.length > 0 && (
        <div className="notice notice-warn bnd-permisos">
          <p>
            <Icon name="alert" size={14} /> Para que la bandeja funcione entera, Meta tiene que conceder:
          </p>
          <ul>
            {faltan.map((p) => <li key={p}><code>{p}</code> — {PARA_QUE_PERMISO[p] ?? ""}</li>)}
          </ul>
          {esAdmin ? (
            meta.puedePedirPermisos ? (
              <a className="btn btn-primary btn-sm" href={api.urlPermisosBandeja()}>
                <Icon name="lock" size={14} /> Conceder permisos de comentarios y mensajes
              </a>
            ) : (
              <p className="hint">Falta el secreto <code>META_CONFIG_ID_BANDEJA</code> en el Worker (la configuración de inicio de sesión con estos permisos). Ver DEPLOY.md.</p>
            )
          ) : (
            <p className="hint">Sólo el administrador puede concederlos.</p>
          )}
          <p className="hint">Estos permisos pasan por la revisión de Meta (App Review): hasta que la aprueben, sólo funcionan con las personas que tienen un rol en la app.</p>
        </div>
      )}
      {meta?.conectado && faltan === null && (
        <p className="hint">Pulsa «Actualizar cuentas» en Ajustes → Integraciones para saber qué permisos trae el token.</p>
      )}
      {meta?.conectado && !meta.webhook && (
        <p className="hint">Los avisos al momento de Meta no están configurados en el servidor: los comentarios llegan al pulsar «Actualizar».</p>
      )}

      <details className="bnd-clientes" open={estado && !encendidos.length ? true : undefined}>
        <summary>
          Clientes con bandeja <span className="bnd-cuenta">{encendidos.length} de {estado?.clientes?.length ?? 0} con cuentas de Meta</span>
        </summary>
        {estado?.clientes?.length ? (
          <div className="bnd-interruptores">
            {estado.clientes.map((c) => (
              <InterruptorBandeja key={c.clientId} clientId={c.clientId} estado={c} nombreCliente={porId.get(c.clientId)?.name ?? ""}
                onCambio={(r) => hecho(r.activa ? "Bandeja encendida." : "Bandeja apagada: ya no se lee ni se guarda nada de ese cliente.")} />
            ))}
          </div>
        ) : estado ? (
          <p className="hint">Ningún cliente tiene cuentas de Facebook o Instagram asignadas. Asígnalas en Ajustes → Integraciones.</p>
        ) : null}
      </details>

      <div className="segmented bnd-pestanas" role="tablist" aria-label="Qué mirar">
        {[["comentarios", "Comentarios", nComentarios], ["mensajes", "Mensajes", nHilos]].map(([k, nombre, n]) => (
          <button key={k} type="button" role="tab" id={`${ids}-tab-${k}`} aria-selected={pestana === k} aria-controls={`${ids}-panel`}
            tabIndex={pestana === k ? 0 : -1} className={`segmented-btn ${pestana === k ? "active" : ""}`}
            onClick={() => { setPestana(k); setAbierto(null); if (k === "mensajes" && filtro === "ocultos") setFiltro("pendientes"); }}>
            {nombre} <span className="bnd-cuenta">{n}</span>
          </button>
        ))}
      </div>

      <div className="bnd-filtros">
        <label className="sr-only" htmlFor={`${ids}-c`}>Cliente</label>
        <select id={`${ids}-c`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {encendidos.map((c) => <option key={c.clientId} value={c.clientId}>{porId.get(c.clientId)?.name ?? "Cliente"}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-r`}>Red</label>
        <select id={`${ids}-r`} className="input" value={red} onChange={(e) => setRed(e.target.value)}>
          <option value="">Facebook e Instagram</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <div className="segmented" role="group" aria-label="Cuáles">
          {[["pendientes", "Pendientes"], ["todos", "Todos"], ...(pestana === "comentarios" ? [["ocultos", "Ocultos"]] : [])].map(([k, nombre]) => (
            <button key={k} type="button" aria-pressed={filtro === k} className={`segmented-btn ${filtro === k ? "active" : ""}`} onClick={() => setFiltro(k)}>
              {nombre}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${pestana}`}>
        {(pestana === "comentarios" ? !comentarios : !hilos) && !fallo && <p role="status" className="hint">Cargando…</p>}

        {(pestana === "comentarios" ? comentarios : hilos) && vacio && !(pestana === "mensajes" && abierto) && (
          <div className="bnd-vacio">
            <Icon name="inbox" size={28} />
            <p>
              {!encendidos.length
                ? "Ningún cliente tiene la bandeja encendida. Enciéndela arriba o en la ficha del cliente."
                : filtro === "pendientes"
                  ? `Nada pendiente. ${pestana === "comentarios" ? "Cada comentario nuevo" : "Cada mensaje nuevo"} aparece aquí solo.`
                  : "Nada con estos filtros."}
            </p>
          </div>
        )}

        {pestana === "comentarios" && vistaComentarios.length > 0 && (
          <ul className="bnd-lista">
            {vistaComentarios.map((h) => (
              <TarjetaComentario key={h.id} h={h} cliente={porId.get(h.clientId)} onHecho={hecho} onFallo={fallar} />
            ))}
          </ul>
        )}

        {pestana === "mensajes" && (vistaHilos.length > 0 || abierto) && (
          <div className="bnd-mensajeria" data-abierto={abierto ? "si" : undefined}>
            <ul className="bnd-hilos" aria-label="Conversaciones">
              {vistaHilos.map((h) => (
                <li key={h.id}>
                  <button type="button" className="bnd-hilo-item" aria-current={abierto === h.id ? "true" : undefined} onClick={() => setAbierto(h.id)}>
                    <span className="bnd-hilo-nombre">
                      <Icon name={REDES[h.red]?.icono ?? "globe"} size={14} />
                      <strong>{h.usuario || `Persona de ${RED_MSJ[h.red]}`}</strong>
                      {h.sinLeer > 0 && <span className="contador-atrasadas" aria-label={`${h.sinLeer} sin leer`}>{h.sinLeer}</span>}
                    </span>
                    <span className="bnd-hilo-sub">{porId.get(h.clientId)?.name ?? "Cliente"} · {haceCuanto(h.ultimoAt)}</span>
                    <span className="bnd-hilo-ultimo">{h.ultimoTexto}</span>
                  </button>
                </li>
              ))}
            </ul>
            {abierto ? (
              <Hilo hiloId={abierto} cliente={porId.get((hilos ?? []).find((h) => h.id === abierto)?.clientId)} pulso={pulso}
                onVolver={() => setAbierto(null)} onHecho={hecho} onFallo={fallar} />
            ) : (
              <p className="bnd-elige hint">Elige una conversación.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
