import "./Aprobar.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FORMATS, FORMAT_ICONS, MONTHS } from "../constants";
import Icon from "../components/Icon";
import logoMark from "../assets/logo-mark.png";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { mediosDe, textoPara, primerComentario, historiasDe } from "../lib/publicacion";
import { normalizarColor, textoSobre, conAlfa } from "../lib/colores";
import { fechaEnZona } from "../lib/agenda";

// ============================================================
// La página que ve el cliente final
//
// QUÉ CAMBIÓ Y POR QUÉ
//
// La página de antes obligaba a pulsar «Ver contenido» en CADA
// publicación para leer el copy —que es justo lo que hay que revisar—,
// enseñaba cajas de texto en vez de la publicación, mostraba lo interno
// (la idea para la IA, la categoría y, sin querer, el comentario interno
// de la agencia), no sabía quién aprobaba y no tenía final: la agencia
// no se enteraba de cuándo el cliente había terminado.
//
// Ahora:
//   · Portada con la marca DEL CLIENTE —su logo, sus colores—, el mes,
//     el mensaje de la agencia y la fecha límite. Tema claro: es un
//     documento para el cliente, no la herramienta de la agencia.
//   · Tres vistas: feed (cada publicación como en Instagram, con el
//     texto completo), calendario del mes y rejilla del perfil.
//   · Revisión rápida en el móvil: una publicación a pantalla completa,
//     Aprobar o Pedir cambio, y pasa sola a la siguiente.
//   · Pedir un cambio con atajos (imagen, texto, fecha) y una
//     conversación por publicación que la agencia contesta.
//   · «Actualizada»: lo que la agencia corrigió vuelve con lo de antes
//     tachado, para no releer todo.
//   · «Enviar mi revisión» al terminar: la agencia lo ve al momento.
//
// Sin sesión: quien acota es el testigo, y el servidor comprueba que
// cada publicación y cada medio pertenezcan a ESTE calendario.
// ============================================================

async function publico(ruta, opciones = {}) {
  const res = await fetch(`/api/publico${ruta}`, {
    ...opciones,
    headers: opciones.body ? { "Content-Type": "application/json" } : undefined,
  });
  let datos = null;
  try { datos = await res.json(); } catch { /* el borde no siempre devuelve JSON */ }
  if (!res.ok) throw new Error(datos?.error || `El servidor respondió ${res.status}.`);
  return datos;
}

/**
 * Quien abre el enlace no tiene sesión: `/api/media/…` le devolvería
 * 401. Los medios se piden por la ruta pública del enlace, que comprueba
 * que pertenezcan a este calendario.
 */
function srcPublico(src, token) {
  if (typeof src !== "string" || !src.startsWith("/api/media/")) return src;
  return `/api/publico/${encodeURIComponent(token)}/media/${src.slice("/api/media/".length)}`;
}

function hora12(value) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const sufijo = h >= 12 ? "p. m." : "a. m.";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${sufijo}`;
}

// Sólo la primera letra en mayúscula: con `text-transform: capitalize`
// salía «Viernes, 25 De Septiembre · 9:00 A. M.».
const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
const fechaLarga = (f) => (f
  ? mayuscula(new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }))
  : "");
const fechaCorta = (f) => (f
  ? mayuscula(new Date(`${f}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }))
  : "");

// El nombre de quien revisa se pide una vez y se recuerda en ESTE
// navegador. localStorage puede no estar (modo privado): nunca rompe.
const CLAVE_REVISOR = "aprobar:revisor";
const leerRevisor = () => { try { return localStorage.getItem(CLAVE_REVISOR) || ""; } catch { return ""; } };
const guardarRevisor = (n) => { try { localStorage.setItem(CLAVE_REVISOR, n); } catch { /* sin almacenamiento */ } };

const ATAJOS_CAMBIO = ["Imagen o video", "Texto", "Fecha u hora", "Hashtags", "Otro"];

/** En qué punto está una publicación para el cliente. */
function estadoDe(post, aprobacion) {
  if (!aprobacion) return "pendiente";
  if (aprobacion.estado === "cambios" && post.actualizadaAt && post.actualizadaAt > (aprobacion.timestamp || "")) {
    return "actualizada";
  }
  return aprobacion.estado === "aprobado" ? "aprobada" : "cambios";
}

const ETIQUETA_ESTADO = {
  pendiente: "Por revisar",
  aprobada: "Aprobada",
  cambios: "Cambios pedidos",
  actualizada: "Actualizada · revísala",
};

export default function Aprobar() {
  const token = new URLSearchParams(window.location.search).get("t");
  const [datos, setDatos] = useState(null);
  const [approvals, setApprovals] = useState({});
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");
  const [guardando, setGuardando] = useState({});
  const [revisor, setRevisor] = useState(leerRevisor);
  const [nombreBorrador, setNombreBorrador] = useState("");
  const [vista, setVista] = useState("feed");
  const [filtro, setFiltro] = useState("todas");
  const [rapida, setRapida] = useState(false);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [confirmarTodo, setConfirmarTodo] = useState(false);
  const [enfocar, setEnfocar] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const d = await publico(`/${encodeURIComponent(token)}`).catch(() => null);
      if (!d?.calendar) {
        setError("Este enlace no es válido, se desactivó o caducó. Pide uno nuevo a tu agencia.");
      } else {
        setDatos(d.calendar);
        setApprovals(d.approvals || {});
        setComentarios(d.comentarios || []);
      }
    } catch (e) {
      setError(`No se pudo cargar el calendario: ${e.message}`);
    }
    setCargando(false);
  }, [token]);

  useEffect(() => {
    if (!token) { setError("Al enlace le falta el identificador del calendario."); setCargando(false); return; }
    void cargar();
  }, [token, cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const publicaciones = useMemo(() => (datos?.calendar?.days ?? [])
    .flatMap((d) => (d.posts ?? []).map((p) => ({ ...p, _fecha: d.date, _dia: d })))
    .sort((a, b) => (a._fecha + (a.publishTime || "")).localeCompare(b._fecha + (b.publishTime || ""))),
  [datos]);

  const estados = useMemo(() => Object.fromEntries(publicaciones.map((p) => [p.id, estadoDe(p, approvals[p.id])])), [publicaciones, approvals]);
  const cuenta = (e) => Object.values(estados).filter((x) => x === e).length;
  const revisadas = publicaciones.filter((p) => estados[p.id] === "aprobada" || estados[p.id] === "cambios").length;
  const porRevisar = publicaciones.filter((p) => estados[p.id] === "pendiente" || estados[p.id] === "actualizada");

  const responder = async (postId, estado, comentario = "") => {
    setGuardando((g) => ({ ...g, [postId]: true }));
    setFallo("");
    try {
      await publico(`/${encodeURIComponent(token)}/aprobacion`, {
        method: "POST",
        body: JSON.stringify({ postId, estado, comentario, revisor }),
      });
      setApprovals((a) => ({ ...a, [postId]: { estado, comentario, revisor, timestamp: new Date().toISOString() } }));
      if (comentario) {
        const r = await publico(`/${encodeURIComponent(token)}/comentario`, {
          method: "POST",
          body: JSON.stringify({ postId, texto: comentario, nombre: revisor }),
        }).catch(() => null);
        if (r?.comentario) setComentarios((c) => [...c, r.comentario]);
      }
      setAviso(estado === "aprobado" ? "Aprobada. ¡Gracias!" : "Enviamos tu pedido de cambio a la agencia.");
      return true;
    } catch (e) {
      setFallo(`No se pudo guardar tu respuesta (${e.message}). Revisa tu conexión e inténtalo otra vez.`);
      return false;
    } finally {
      setGuardando((g) => ({ ...g, [postId]: false }));
    }
  };

  const comentar = async (postId, texto) => {
    try {
      const r = await publico(`/${encodeURIComponent(token)}/comentario`, {
        method: "POST",
        body: JSON.stringify({ postId, texto, nombre: revisor }),
      });
      setComentarios((c) => [...c, r.comentario]);
      return true;
    } catch (e) {
      setFallo(`No se pudo enviar el comentario (${e.message}).`);
      return false;
    }
  };

  const sugerirTexto = async (postId, campo, valor) => {
    try {
      await publico(`/${encodeURIComponent(token)}/publicacion/${encodeURIComponent(postId)}`, {
        method: "PATCH",
        body: JSON.stringify({ [campo]: valor }),
      });
      setDatos((d) => ({
        ...d,
        calendar: {
          ...d.calendar,
          days: d.calendar.days.map((dia) => ({ ...dia, posts: dia.posts.map((p) => (p.id === postId ? { ...p, [campo]: valor } : p)) })),
        },
      }));
      setAviso("Guardamos tu cambio en el texto.");
      return true;
    } catch (e) {
      setFallo(`No se pudo guardar el texto (${e.message}).`);
      return false;
    }
  };

  const aprobarTodo = async () => {
    setConfirmarTodo(false);
    for (const p of porRevisar) {
      if (!(await responder(p.id, "aprobado"))) break;
    }
    setAviso("Aprobamos todas las publicaciones que faltaban.");
  };

  const enviarRevision = async () => {
    setConfirmarEnvio(false);
    try {
      const r = await publico(`/${encodeURIComponent(token)}/revision`, { method: "POST", body: JSON.stringify({ revisor }) });
      setDatos((d) => ({ ...d, calendar: { ...d.calendar, revisionEnviada: r.fecha, revisionRevisor: revisor } }));
      setAviso("¡Listo! Tu agencia ya tiene tu revisión.");
    } catch (e) {
      setFallo(`No se pudo enviar la revisión (${e.message}).`);
    }
  };

  const irAPublicacion = (id) => { setVista("feed"); setFiltro("todas"); setEnfocar(id); };

  // ---------- Pantallas de carga y error ----------
  if (cargando) {
    return (
      <div className="aprobar aprobar-centro">
        <p role="status"><Icon name="calendar" size={36} /> Cargando tu calendario…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="aprobar aprobar-centro">
        <p role="alert" style={{ maxWidth: 420 }}><Icon name="alert" size={36} /> {error}</p>
        {token && <button className="btn btn-secondary" onClick={cargar}>Reintentar</button>}
      </div>
    );
  }

  const { client, calendar } = datos;
  const marca = normalizarColor(client?.primaryColor) || "#1E90FF";
  const estiloMarca = {
    "--marca": marca,
    "--marca-texto": textoSobre(marca),
    "--marca-suave": conAlfa(marca, 0.1),
    "--marca-linea": conAlfa(marca, 0.35),
    "--marca-2": normalizarColor(client?.secondaryColor) || marca,
  };
  const mes = calendar.name || `${MONTHS[calendar.month] ?? ""} ${calendar.year ?? ""}`;
  const usuario = (client?.instagram || client?.name || "").replace(/^@/, "");
  const hoy = fechaEnZona();
  const vencida = calendar.fechaLimite && calendar.fechaLimite < hoy;
  const lista = publicaciones.filter((p) => filtro === "todas" || estados[p.id] === filtro ||
    (filtro === "pendiente" && estados[p.id] === "actualizada"));
  const refs = calendar.visualReferences ?? [];

  // ---------- Bienvenida: el nombre, una sola vez ----------
  if (!revisor) {
    return (
      <div className="aprobar" style={estiloMarca}>
        <main className="aprobar-bienvenida">
          <Portada client={client} mes={mes} calendar={calendar} vencida={vencida} />
          <form
            className="aprobar-tarjeta aprobar-nombre"
            onSubmit={(e) => {
              e.preventDefault();
              const n = nombreBorrador.trim();
              if (!n) return;
              guardarRevisor(n);
              setRevisor(n);
            }}
          >
            <h2>¡Hola! Antes de empezar</h2>
            <p>Así tu agencia sabe quién aprobó cada publicación.</p>
            <label htmlFor="aprobar-nombre" className="label">Tu nombre</label>
            <input
              id="aprobar-nombre"
              className="input"
              autoComplete="name"
              value={nombreBorrador}
              onChange={(e) => setNombreBorrador(e.target.value)}
              placeholder="Ej.: María"
            />
            <button type="submit" className="btn aprobar-btn-marca" disabled={!nombreBorrador.trim()}>
              Empezar a revisar <Icon name="chevronRight" size={18} />
            </button>
            <p className="aprobar-meta">
              {publicaciones.length} publicaciones · {porRevisar.length} por revisar
            </p>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="aprobar" style={estiloMarca}>
      <a className="skip-link" href="#publicaciones">Saltar a las publicaciones</a>
      <Portada client={client} mes={mes} calendar={calendar} vencida={vencida} />

      <div role="status" aria-live="polite" className={aviso ? "aprobar-aviso" : "sr-only"}>{aviso}</div>
      {fallo && <p role="alert" className="aprobar-fallo">{fallo}</p>}

      {calendar.revisionEnviada && (
        <p className="aprobar-enviada">
          <Icon name="check" size={16} /> {calendar.revisionRevisor || "Tu equipo"} envió la revisión el{" "}
          {new Date(calendar.revisionEnviada).toLocaleDateString("es-PA", { day: "numeric", month: "long" })}.
          {porRevisar.length > 0 && " Hay publicaciones nuevas o actualizadas por revisar."}
        </p>
      )}

      <div className="aprobar-barra">
        <div className="aprobar-vistas" role="group" aria-label="Cómo ver el calendario">
          {[["feed", "Publicaciones", "list"], ["calendario", "Calendario", "calendar"], ["perfil", "Perfil", "grid"]].map(([id, nombre, icono]) => (
            <button key={id} type="button" aria-pressed={vista === id} onClick={() => setVista(id)}>
              <Icon name={icono} size={16} /> {nombre}
            </button>
          ))}
        </div>
        {vista === "feed" && (
          <div className="aprobar-filtros" role="group" aria-label="Filtrar publicaciones">
            {[
              ["todas", `Todas · ${publicaciones.length}`],
              ["pendiente", `Por revisar · ${porRevisar.length}`],
              ["cambios", `Con cambios · ${cuenta("cambios")}`],
              ["aprobada", `Aprobadas · ${cuenta("aprobada")}`],
            ].map(([id, nombre]) => (
              <button key={id} type="button" className="filter-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                {nombre}
              </button>
            ))}
          </div>
        )}
        {porRevisar.length > 0 && (
          <button type="button" className="btn aprobar-btn-marca aprobar-rapida-btn" onClick={() => setRapida(true)}>
            <Icon name="bolt" size={18} /> Revisión rápida ({porRevisar.length})
          </button>
        )}
      </div>

      <main id="publicaciones" className="aprobar-contenido">
        {vista === "feed" && (
          lista.length === 0 ? (
            <p className="aprobar-vacio">No hay publicaciones con este filtro.</p>
          ) : (
            <ul className="aprobar-feed" aria-label="Publicaciones del mes">
              {lista.map((p) => (
                <li key={p.id}>
                  <TarjetaPublicacion
                    post={p}
                    token={token}
                    usuario={usuario}
                    logo={client?.logo}
                    estado={estados[p.id]}
                    aprobacion={approvals[p.id]}
                    comentarios={comentarios.filter((c) => c.postId === p.id)}
                    guardando={!!guardando[p.id]}
                    permiteEditar={!!calendar.allowEditing}
                    enfocar={enfocar === p.id}
                    onEnfocado={() => setEnfocar(null)}
                    onResponder={responder}
                    onComentar={comentar}
                    onSugerir={sugerirTexto}
                  />
                </li>
              ))}
            </ul>
          )
        )}

        {vista === "calendario" && (
          <MesCalendario calendar={calendar} estados={estados} token={token} onElegir={irAPublicacion} />
        )}

        {vista === "perfil" && (
          <RejillaPerfil publicaciones={publicaciones} estados={estados} token={token} usuario={usuario} logo={client?.logo} nombre={client?.name} onElegir={irAPublicacion} />
        )}

        {refs.length > 0 && (
          <Referencias refs={refs} token={token} approvals={approvals} guardando={guardando} onResponder={responder} />
        )}
      </main>

      <footer className="aprobar-pie">
        <img src={logoMark} alt="" width={32} height={32} />
        Juancito Ads · Calendario de contenido
      </footer>

      <div className="aprobar-fija">
        <div className="aprobar-progreso">
          <span id="aprobar-progreso">{revisadas} de {publicaciones.length} revisadas</span>
          <div className="aprobar-progreso-barra" role="progressbar" aria-labelledby="aprobar-progreso"
            aria-valuenow={revisadas} aria-valuemin={0} aria-valuemax={publicaciones.length}>
            <span style={{ width: `${publicaciones.length ? (revisadas / publicaciones.length) * 100 : 0}%` }} />
          </div>
        </div>
        {confirmarTodo ? (
          <div className="aprobar-confirmar" role="group" aria-label="Confirmar aprobar todas">
            <span>¿Aprobar las {porRevisar.length} que faltan?</span>
            <button type="button" className="btn aprobar-btn-ok" onClick={aprobarTodo}>Sí, aprobar</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmarTodo(false)}>Cancelar</button>
          </div>
        ) : confirmarEnvio ? (
          <div className="aprobar-confirmar" role="group" aria-label="Confirmar envío de la revisión">
            <span>Te quedan {porRevisar.length} sin revisar. ¿Enviar igual?</span>
            <button type="button" className="btn aprobar-btn-marca" onClick={enviarRevision}>Enviar</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmarEnvio(false)}>Seguir revisando</button>
          </div>
        ) : (
          <div className="aprobar-acciones-fijas">
            {porRevisar.length > 1 && (
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmarTodo(true)}>
                Aprobar todas
              </button>
            )}
            <button
              type="button"
              className="btn aprobar-btn-marca"
              onClick={() => (porRevisar.length ? setConfirmarEnvio(true) : enviarRevision())}
            >
              <Icon name="send" size={18} /> Enviar mi revisión
            </button>
          </div>
        )}
      </div>

      {rapida && (
        <RevisionRapida
          pendientes={porRevisar}
          token={token}
          usuario={usuario}
          onResponder={responder}
          onCerrar={() => setRapida(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Portada
// ------------------------------------------------------------

function Portada({ client, mes, calendar, vencida }) {
  return (
    <header className="aprobar-portada">
      <div className="aprobar-portada-marca">
        {client?.logo ? (
          <img src={client.logo} alt={`Logo de ${client.name || "la marca"}`} />
        ) : (
          <span aria-hidden="true">{(client?.name || "?").slice(0, 1)}</span>
        )}
      </div>
      <p className="aprobar-portada-cliente">{client?.name}</p>
      <h1>Calendario de {mes}</h1>
      {calendar.campaign && <p className="aprobar-portada-campana">{calendar.campaign}</p>}
      {calendar.mensaje && <p className="aprobar-portada-mensaje">{calendar.mensaje}</p>}
      {calendar.fechaLimite && (
        <p className="aprobar-portada-limite" data-vencida={vencida || undefined}>
          <Icon name="clock" size={16} /> {vencida ? "La fecha para revisar era el" : "Revisa antes del"} {fechaLarga(calendar.fechaLimite)}
        </p>
      )}
    </header>
  );
}

// ------------------------------------------------------------
// Una publicación, como se verá
// ------------------------------------------------------------

function Medios({ post, token, compacto = false }) {
  const medios = mediosDe(post);
  const pista = useRef(null);
  const [actual, setActual] = useState(0);
  const id = useId();
  if (!medios.length) {
    return (
      <div className="aprobar-sin-medio">
        <Icon name={FORMAT_ICONS[post.format] || "image"} size={32} />
        <span>La imagen o el video llegan pronto</span>
      </div>
    );
  }
  const ir = (i) => {
    const n = Math.max(0, Math.min(medios.length - 1, i));
    pista.current?.children[n]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActual(n);
  };
  return (
    <div className="aprobar-medios" data-formato={post.format}>
      <div
        ref={pista}
        className="aprobar-medios-pista"
        onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        aria-roledescription={medios.length > 1 ? "carrusel" : undefined}
        aria-label={medios.length > 1 ? `${medios.length} elementos` : undefined}
      >
        {medios.map((m, i) => (
          <div key={`${m.src}-${i}`} className="aprobar-medio" id={`${id}-${i}`}>
            {m.tipo === "video" ? (
              <video src={srcPublico(m.src, token)} controls={!compacto} muted={compacto} playsInline preload="metadata"
                poster={post.portada ? srcPublico(post.portada, token) : undefined} />
            ) : (
              <img src={srcPublico(m.src, token)} alt={i === 0 ? (post.title || "Imagen de la publicación") : `Imagen ${i + 1}`} loading="lazy" />
            )}
          </div>
        ))}
      </div>
      {medios.length > 1 && !compacto && (
        <>
          <button type="button" className="aprobar-medios-flecha" data-lado="izq" onClick={() => ir(actual - 1)} disabled={actual === 0} aria-label="Anterior">
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="aprobar-medios-flecha" data-lado="der" onClick={() => ir(actual + 1)} disabled={actual === medios.length - 1} aria-label="Siguiente">
            <Icon name="chevronRight" size={18} />
          </button>
          <span className="aprobar-medios-puntos" aria-hidden="true">
            {medios.map((m, i) => <span key={i} data-activo={i === actual} />)}
          </span>
        </>
      )}
    </div>
  );
}

function Texto({ texto, limite = 280 }) {
  const [abierto, setAbierto] = useState(false);
  if (!texto) return null;
  const largo = texto.length > limite;
  return (
    <p className="aprobar-texto">
      {largo && !abierto ? `${texto.slice(0, limite).trimEnd()}… ` : texto}
      {largo && (
        <button type="button" className="aprobar-ver-mas" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          {abierto ? " ver menos" : "ver más"}
        </button>
      )}
    </p>
  );
}

function TarjetaPublicacion({
  post, token, usuario, logo, estado, aprobacion, comentarios, guardando, permiteEditar,
  enfocar, onEnfocado, onResponder, onComentar, onSugerir,
}) {
  const ids = useId();
  const ref = useRef(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [atajos, setAtajos] = useState([]);
  const [motivo, setMotivo] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const f = FORMATS[post.format] || FORMATS.post;
  const texto = textoPara(post, "instagram");
  const comentario1 = primerComentario(post);

  useEffect(() => {
    if (!enfocar) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    ref.current?.focus({ preventScroll: true });
    onEnfocado?.();
  }, [enfocar, onEnfocado]);

  const pedirCambio = async (e) => {
    e.preventDefault();
    const cuerpo = [atajos.length ? `[${atajos.join(", ")}]` : "", motivo.trim()].filter(Boolean).join(" ");
    if (!cuerpo) return;
    if (await onResponder(post.id, "cambios", cuerpo)) {
      setPidiendo(false);
      setAtajos([]);
      setMotivo("");
    }
  };

  return (
    <article ref={ref} tabIndex={-1} className="aprobar-post" data-estado={estado} aria-labelledby={`${ids}-t`}>
      <header className="aprobar-post-cabecera">
        <span className="aprobar-avatar">{logo ? <img src={logo} alt="" /> : <Icon name="building" size={16} />}</span>
        <span className="aprobar-post-quien">
          <strong id={`${ids}-t`}>{fechaLarga(post._fecha)}{post.publishTime ? ` · ${hora12(post.publishTime)}` : ""}</strong>
          <span>@{usuario} · <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={12} /> {f.label}</span>
        </span>
        <span className="aprobar-estado" data-estado={estado}>{ETIQUETA_ESTADO[estado]}</span>
      </header>

      {post.aprobacion === "idea" && (
        <p className="aprobar-tipo" data-tipo="idea">
          <Icon name="bulb" size={16} />
          <span><strong>Idea para aprobar.</strong> Apruebas el concepto; la pieza final te la mandamos después.</span>
        </p>
      )}

      <Medios post={post} token={token} />

      {post.historiaTambien && historiasDe(post).length > 0 && (
        <div className="aprobar-historias">
          <p><Icon name="photo" size={14} /> También sale en historias:</p>
          <ul aria-label="Historias que acompañan a esta publicación">
            {historiasDe(post).map((h, i) => (
              <li key={`${h.src}-${i}`}><img src={srcPublico(h.src, token)} alt={`Historia ${i + 1}`} loading="lazy" /></li>
            ))}
          </ul>
        </div>
      )}

      <div className="aprobar-post-cuerpo">
        {estado === "actualizada" && post.anterior && (
          <div className="aprobar-cambio">
            <p className="aprobar-cambio-titulo"><Icon name="refresh" size={14} /> La agencia hizo los cambios que pediste</p>
            {post.anterior.descripcion && post.anterior.descripcion !== post.descripcion && (
              <p className="aprobar-cambio-antes"><span>Antes:</span> <del>{post.anterior.descripcion}</del></p>
            )}
            {post.anterior.publishTime && post.anterior.publishTime !== post.publishTime && (
              <p className="aprobar-cambio-antes"><span>Hora antes:</span> <del>{hora12(post.anterior.publishTime)}</del></p>
            )}
          </div>
        )}

        {editando ? (
          <div className="aprobar-editar">
            <label htmlFor={`${ids}-edit`} className="label">Tu versión del texto</label>
            <textarea id={`${ids}-edit`} className="textarea" value={borrador} onChange={(e) => setBorrador(e.target.value)} />
            <div className="aprobar-fila">
              <button type="button" className="btn aprobar-btn-marca" onClick={async () => { if (await onSugerir(post.id, "descripcion", borrador)) setEditando(false); }}>
                Guardar texto
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditando(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <Texto texto={post.format === "historia" ? "" : texto} />
            {post.format === "historia" && texto && (
              <p className="aprobar-nota">En las historias el texto va dentro de la imagen o el video.</p>
            )}
          </>
        )}

        {comentario1 && (
          <p className="aprobar-comentario1"><span>Primer comentario:</span> {comentario1}</p>
        )}

        {post.guion && post.format !== "post" && (
          <details className="aprobar-guion" open={post.aprobacion === "idea"}>
            <summary>Ver el guion</summary>
            <p>{post.guion}</p>
          </details>
        )}

        {comentarios.length > 0 && (
          <ul className="aprobar-hilo" aria-label="Conversación con la agencia">
            {comentarios.map((c) => (
              <li key={c.id} data-autor={c.autor}>
                <strong>{c.autor === "agencia" ? `${c.nombre} · agencia` : c.nombre}</strong>
                <span>{c.texto}</span>
              </li>
            ))}
          </ul>
        )}

        {aprobacion?.estado === "cambios" && estado === "cambios" && (
          <form
            className="aprobar-responder"
            onSubmit={async (e) => { e.preventDefault(); if (respuesta.trim() && await onComentar(post.id, respuesta.trim())) setRespuesta(""); }}
          >
            <label htmlFor={`${ids}-resp`} className="sr-only">Añadir un comentario</label>
            <input id={`${ids}-resp`} className="input" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Añadir un comentario…" />
            <button type="submit" className="btn-icon" aria-label="Enviar comentario" disabled={!respuesta.trim()}><Icon name="send" size={18} /></button>
          </form>
        )}

        {pidiendo ? (
          <form className="aprobar-pedir" onSubmit={pedirCambio}>
            <p className="label" id={`${ids}-que`}>¿Qué quieres cambiar?</p>
            <div className="aprobar-atajos" role="group" aria-labelledby={`${ids}-que`}>
              {ATAJOS_CAMBIO.map((a) => (
                <button key={a} type="button" className="filter-chip" aria-pressed={atajos.includes(a)}
                  onClick={() => setAtajos((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>
                  {a}
                </button>
              ))}
            </div>
            <label htmlFor={`${ids}-motivo`} className="sr-only">Cuéntanos el cambio</label>
            <textarea id={`${ids}-motivo`} className="textarea" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cuéntanos qué cambiarías (opcional si elegiste arriba)" />
            <div className="aprobar-fila">
              <button type="submit" className="btn aprobar-btn-cambios" disabled={guardando || (!atajos.length && !motivo.trim())}>
                Enviar el cambio
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPidiendo(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="aprobar-acciones">
            <button type="button" className="btn aprobar-btn-ok" disabled={guardando} aria-pressed={estado === "aprobada"}
              onClick={() => onResponder(post.id, "aprobado")}>
              <Icon name="check" size={18} /> {estado === "aprobada" ? "Aprobada" : post.aprobacion === "idea" ? "Aprobar la idea" : "Aprobar"}
            </button>
            <button type="button" className="btn aprobar-btn-cambios" disabled={guardando} aria-expanded={pidiendo}
              onClick={() => setPidiendo(true)}>
              <Icon name="pencil" size={18} /> Pedir cambio
            </button>
            {permiteEditar && (
              <button type="button" className="btn btn-ghost" onClick={() => { setBorrador(post.descripcion || ""); setEditando(true); }}>
                Editar el texto
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ------------------------------------------------------------
// Revisión rápida: una a una, a pantalla completa
// ------------------------------------------------------------

function RevisionRapida({ pendientes, token, usuario, onResponder, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  // La lista se congela al abrir: si se recalculara, cada respuesta
  // sacaría la publicación de la lista y el índice saltaría una.
  const [cola] = useState(pendientes);
  const [i, setI] = useState(0);
  const [pidiendo, setPidiendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [atajos, setAtajos] = useState([]);
  const post = cola[i];
  const ids = useId();

  const siguiente = () => { setPidiendo(false); setMotivo(""); setAtajos([]); setI((n) => n + 1); };

  return (
    <div className="overlay aprobar-rapida-capa">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="aprobar aprobar-rapida">
        <header className="aprobar-rapida-cabecera">
          <h2 id={`${ids}-t`}>{post ? `${i + 1} de ${cola.length}` : "¡Terminaste!"}</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar la revisión rápida"><Icon name="close" /></button>
        </header>
        {post ? (
          <>
            <div className="aprobar-rapida-cuerpo">
              <p className="aprobar-rapida-fecha">{fechaCorta(post._fecha)}{post.publishTime ? ` · ${hora12(post.publishTime)}` : ""} · @{usuario}</p>
              {post.aprobacion === "idea" && (
                <p className="aprobar-tipo" data-tipo="idea"><Icon name="bulb" size={16} /> <span><strong>Idea:</strong> apruebas el concepto, no la pieza final.</span></p>
              )}
              <Medios post={post} token={token} />
              <Texto texto={post.format === "historia" ? "" : textoPara(post, "instagram")} limite={400} />
              {pidiendo && (
                <div className="aprobar-pedir">
                  <div className="aprobar-atajos" role="group" aria-label="Qué cambiar">
                    {ATAJOS_CAMBIO.map((a) => (
                      <button key={a} type="button" className="filter-chip" aria-pressed={atajos.includes(a)}
                        onClick={() => setAtajos((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>{a}</button>
                    ))}
                  </div>
                  <label htmlFor={`${ids}-m`} className="sr-only">Cuéntanos el cambio</label>
                  <textarea id={`${ids}-m`} className="textarea" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Cuéntanos qué cambiarías" />
                </div>
              )}
            </div>
            <footer className="aprobar-rapida-pie">
              {pidiendo ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setPidiendo(false)}>Volver</button>
                  <button type="button" className="btn aprobar-btn-cambios" disabled={!atajos.length && !motivo.trim()}
                    onClick={async () => {
                      const cuerpo = [atajos.length ? `[${atajos.join(", ")}]` : "", motivo.trim()].filter(Boolean).join(" ");
                      if (await onResponder(post.id, "cambios", cuerpo)) siguiente();
                    }}>
                    Enviar cambio
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn aprobar-btn-cambios" onClick={() => setPidiendo(true)}>
                    <Icon name="pencil" size={20} /> Pedir cambio
                  </button>
                  <button type="button" className="btn aprobar-btn-ok" onClick={async () => { if (await onResponder(post.id, "aprobado")) siguiente(); }}>
                    <Icon name="check" size={20} /> {post.aprobacion === "idea" ? "Aprobar la idea" : "Aprobar"}
                  </button>
                </>
              )}
            </footer>
          </>
        ) : (
          <div className="aprobar-rapida-fin">
            <Icon name="check" size={40} />
            <p>Revisaste todas las publicaciones pendientes.</p>
            <p>Cuando quieras, pulsa <strong>Enviar mi revisión</strong> abajo para avisar a tu agencia.</p>
            <button type="button" className="btn aprobar-btn-marca" onClick={onCerrar}>Volver al calendario</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Calendario del mes y rejilla del perfil
// ------------------------------------------------------------

function MesCalendario({ calendar, estados, token, onElegir }) {
  const dias = calendar.days ?? [];
  if (!dias.length) return <p className="aprobar-vacio">Este calendario no tiene días.</p>;
  const primero = `${calendar.year}-${String(Number(calendar.month) + 1).padStart(2, "0")}-01`;
  const hueco = (new Date(`${primero}T12:00:00Z`).getUTCDay() + 6) % 7;
  const ultimo = new Date(Date.UTC(Number(calendar.year), Number(calendar.month) + 1, 0)).getUTCDate();
  const porFecha = Object.fromEntries(dias.map((d) => [d.date, d]));
  const celdas = [...Array(hueco).fill(null), ...Array.from({ length: ultimo }, (_, i) => `${primero.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="aprobar-mes">
      <div className="aprobar-mes-semana" aria-hidden="true">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <ol className="aprobar-mes-dias" aria-label="Días del mes">
        {celdas.map((f, i) => {
          if (!f) return <li key={`h${i}`} aria-hidden="true" />;
          const posts = porFecha[f]?.posts ?? [];
          return (
            <li key={f} className="aprobar-mes-dia" data-vacio={!posts.length || undefined}>
              <span className="aprobar-mes-num">{Number(f.slice(8))}</span>
              {posts.map((p) => {
                const m = mediosDe(p)[0];
                return (
                  <button key={p.id} type="button" className="aprobar-mes-post" data-estado={estados[p.id]}
                    onClick={() => onElegir(p.id)} aria-label={`${fechaCorta(f)}, ${FORMATS[p.format]?.label ?? "publicación"}: ${ETIQUETA_ESTADO[estados[p.id]]}`}>
                    {m?.tipo === "imagen" ? <img src={srcPublico(m.src, token)} alt="" loading="lazy" /> : <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={16} />}
                  </button>
                );
              })}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RejillaPerfil({ publicaciones, estados, token, usuario, logo, nombre, onElegir }) {
  // Como en Instagram: lo más reciente arriba, y sin las historias, que
  // no se quedan en el perfil.
  const enPerfil = publicaciones.filter((p) => p.format !== "historia" && p.format !== "live").slice().reverse();
  return (
    <section className="aprobar-perfil" aria-label="Así se verá tu perfil">
      <div className="aprobar-perfil-cabecera">
        <span className="aprobar-avatar aprobar-avatar-grande">{logo ? <img src={logo} alt="" /> : <Icon name="building" size={24} />}</span>
        <div>
          <strong>@{usuario}</strong>
          <span>{nombre}</span>
        </div>
      </div>
      <ul className="aprobar-perfil-rejilla">
        {enPerfil.map((p) => {
          const medios = mediosDe(p);
          const m = medios[0];
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onElegir(p.id)} data-estado={estados[p.id]}
                aria-label={`${fechaCorta(p._fecha)}: ${ETIQUETA_ESTADO[estados[p.id]]}`}>
                {m?.tipo === "imagen" ? (
                  <img src={srcPublico(m.src, token)} alt="" loading="lazy" />
                ) : m?.tipo === "video" ? (
                  <video src={srcPublico(m.src, token)} muted playsInline preload="metadata" aria-hidden="true" />
                ) : (
                  <span className="aprobar-perfil-vacio"><Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={22} /></span>
                )}
                {(medios.length > 1 || p.format === "reel") && (
                  <span className="aprobar-perfil-icono" aria-hidden="true">
                    <Icon name={p.format === "reel" ? "play" : "copy"} size={14} />
                  </span>
                )}
                <span className="aprobar-perfil-estado" data-estado={estados[p.id]} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------
// Referencias visuales (también se aprueban)
// ------------------------------------------------------------

function Referencias({ refs, token, approvals, guardando, onResponder }) {
  return (
    <section className="aprobar-refs" aria-labelledby="aprobar-refs-t">
      <h2 id="aprobar-refs-t">Referencias visuales</h2>
      <p>El estilo que proponemos para las piezas del mes.</p>
      <ul>
        {refs.map((r) => {
          const a = approvals[r.id]?.estado;
          // La referencia guarda la clave de R2 a secas o la ruta de medios.
          const src = r.url?.startsWith("clientes/") ? srcPublico(`/api/media/${r.url}`, token) : srcPublico(r.url, token);
          const esImagen = /^(\/api\/|clientes\/)/.test(r.url || "") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(r.url || "");
          return (
            <li key={r.id} data-estado={a === "aprobado" ? "aprobada" : a === "cambios" ? "cambios" : "pendiente"}>
              {esImagen
                ? <img src={src} alt={r.name || "Referencia"} loading="lazy" />
                : <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name || r.url}</a>}
              <div className="aprobar-fila">
                <button type="button" className="btn aprobar-btn-ok" disabled={guardando[r.id]} aria-pressed={a === "aprobado"}
                  onClick={() => onResponder(r.id, "aprobado")} aria-label={`Aprobar referencia ${r.name || ""}`}>
                  <Icon name="check" size={16} />
                </button>
                <button type="button" className="btn aprobar-btn-cambios" disabled={guardando[r.id]} aria-pressed={a === "cambios"}
                  onClick={() => onResponder(r.id, "cambios")} aria-label={`No me gusta la referencia ${r.name || ""}`}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
