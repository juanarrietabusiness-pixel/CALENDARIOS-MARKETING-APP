// ============================================================
// «Ver el mes como se verá»: la vista previa del mes de un cliente
//
// La agencia revisa el mes MIRÁNDOLO —sin marcar nada como «revisado»— y hay
// clientes que no piden revisión: lo que ya está listo se programa de una
// vez. Una pantalla completa con tres vistas sobre el MISMO mes:
//
//   · Perfil: la cuadrícula de Instagram con lo del mes arriba (lo más nuevo
//     primero) en el recorte 3:4 del perfil, y debajo lo ya publicado. Para
//     ver si el mes se ve parejo, si dos seguidas se parecen.
//   · Feed: cada publicación como en el teléfono, una a una (flechas, teclado
//     y deslizando), con la vista previa de siempre (vistaRed.jsx: el MISMO
//     lienzo que lo programado).
//   · Detalles: lo que la revisión automática encuentra en cada una, sin IA.
//     Tocar un aviso abre el panel de esa publicación y, al cerrarlo, se
//     vuelve aquí, a la misma.
//
// «Programar todo lo listo» va por el MISMO camino que «Programar lo
// aprobado» (lib/programarAprobadas.js, que llega como `onProgramar`): cada
// una se prepara por su lado, se guarda y se programa en lote. No pide la
// aprobación del cliente: es para los clientes que no revisan.
//
// Lo que decide cada cosa es puro y tiene sus casos: lib/vistaMes.js.
// ============================================================

import "./VistaMes.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import BarraPestanas from "../BarraPestanas";
import VistaRed from "./vistaRed";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useAjustada } from "../../hooks/useAjustada";
import { idDePestana, idDelPanel } from "../../lib/pestanas";
import { FORMATS, FORMAT_ICONS, MONTHS } from "../../constants";
import { necesitaAjuste } from "../../lib/publicacion";
import { fechaHora } from "../../lib/cola";
import { metricasCliente } from "../../lib/db";
import { leerMercado } from "../../lib/mercado";
import { limpiarEstudio } from "../../lib/estudioMercado";
import { fechasDelMes } from "../../lib/fechasEspeciales";
import { revisarMes } from "../../lib/revisionMes";
import {
  cuadriculaDelMes, yaPublicadasEnInstagram, inicioDelMes, feedDelMes, loListoDelMes, confirmacionDeProgramar, detallesDe,
  pasaFiltroDetalles, FILTROS_DETALLES, NOMBRE_ESTADO_PROGRAMAR, tituloCorto,
} from "../../lib/vistaMes";

const VISTAS = [["perfil", "Perfil", "grid"], ["feed", "Feed", "image"], ["detalles", "Detalles", "clipboardCheck"]];

/** «sáb 7 nov, 9:00 a. m.» o, sin momento, la fecha. */
const cuandoTexto = (cuando, fecha) => (cuando ? fechaHora(cuando) : fecha || "");

/** Los controles que se quedan con las flechas (no se pasa de publicación con ellas). */
const SUYAS_LAS_FLECHAS = 'input, textarea, select, video, [role="tablist"], [contenteditable="true"]';

/**
 * @param cola        las filas de la cola del calendario (CalendarView las relee con `pulso`)
 * @param estadoRedes lo que hay conectado (`/api/redes/estado`): las cuentas del cliente y su foto de perfil
 * @param inicial     { vista, postId, filtro }: al volver del panel de una publicación, donde se estaba
 * @param onAbrirPost (postId, volver) → abre el panel; `volver` es lo que hay que pasar de vuelta en `inicial`
 * @param onProgramar (lista, avisar) → { programadas, fallidas } (el de «Programar lo aprobado»)
 */
export default function VistaMes({
  client, cal, cola = [], estadoRedes = null, soloLectura = false, inicial = null, onAbrirPost, onProgramar, onClose,
}) {
  const ids = useId();
  const base = `${ids}-vm`;
  const [vista, setVista] = useState(inicial?.vista ?? "perfil");
  const [filtro, setFiltro] = useState(inicial?.filtro ?? "todas");
  // «ver» | «confirmar» | «programando» | «resultado»
  const [paso, setPaso] = useState("ver");
  const [avance, setAvance] = useState("");
  const [resultado, setResultado] = useState(null);
  const [mercado, setMercado] = useState(null);
  const [publicadas, setPublicadas] = useState(null);
  const [avatarRoto, setAvatarRoto] = useState(false);
  // El reloj de «ya pasó»: se lee al abrir y cada vez que cambian el mes o la cola (no en cada pintado).
  const [ahora, setAhora] = useState(() => Date.now());
  const pasoRef = useRef(paso);
  pasoRef.current = paso;
  // Escape: desde la confirmación, vuelve a la vista; mientras programa, no cierra (se perdería el resultado).
  const ref = useDialogA11y(() => {
    if (pasoRef.current === "programando") return;
    if (pasoRef.current === "confirmar") { setPaso("ver"); return; }
    onClose();
  });

  const clienteDb = client?.dbId || client?.id;
  const mesNombre = MONTHS[cal.month] ?? "";
  const virtual = Boolean(cal?.virtual) || !cal?.days?.length;
  const conectadas = useMemo(
    () => [...new Set((estadoRedes?.cuentas ?? []).filter((c) => c.clientId === clienteDb).map((c) => c.red))],
    [estadoRedes, clienteDb],
  );
  // La cuenta de Instagram del cliente: su @ y su foto (del CDN de Meta: pasa por el proxy, la CSP no la deja pintar).
  const cuentaIG = (estadoRedes?.cuentas ?? []).find((c) => c.clientId === clienteDb && c.red === "instagram") ?? null;
  const avatar = !avatarRoto && /^https:\/\//.test(cuentaIG?.avatar ?? "")
    ? `/api/metricas/miniatura?u=${encodeURIComponent(cuentaIG.avatar)}` : client?.logo || "";
  const usuario = String(cuentaIG?.usuario || client?.instagram || client?.name || "cuenta").replace(/^@/, "");
  // La vista previa de cada red pinta el @ y la foto de la cuenta de verdad, si se conocen.
  const clienteVista = useMemo(() => ({ ...client, instagram: usuario, logo: avatar }), [client, usuario, avatar]);

  useEffect(() => { setAhora(Date.now()); }, [cola, cal.days]);

  // El catálogo y la competencia del estudio de mercado: lo que necesita la revisión de los textos (precios y nombres).
  useEffect(() => {
    if (!clienteDb) return undefined;
    let vivo = true;
    leerMercado(clienteDb).then((m) => { if (vivo) setMercado(m ?? {}); }).catch(() => { if (vivo) setMercado({}); });
    return () => { vivo = false; };
  }, [clienteDb]);

  // Lo ya publicado en Instagram, para debajo de la cuadrícula: sólo al abrir el perfil (son las métricas guardadas).
  useEffect(() => {
    if (vista !== "perfil" || publicadas || !clienteDb) return undefined;
    let vivo = true;
    metricasCliente(clienteDb, 45)
      .then((r) => { if (vivo) setPublicadas(yaPublicadasEnInstagram(r?.publicaciones, { antesDe: inicioDelMes(cal.year, cal.month) })); })
      .catch(() => { if (vivo) setPublicadas([]); });
    return () => { vivo = false; };
  }, [vista, publicadas, clienteDb, cal.year, cal.month]);

  const cuadricula = useMemo(() => cuadriculaDelMes(cal.days, { conectadas, cola }), [cal.days, conectadas, cola]);
  const feed = useMemo(() => feedDelMes(cal.days, { conectadas }), [cal.days, conectadas]);
  const listo = useMemo(() => loListoDelMes(cal.days, { conectadas, cola, ahora }), [cal.days, conectadas, cola, ahora]);
  const problemas = useMemo(() => {
    const competidores = (limpiarEstudio(mercado?.estudio ?? mercado?.borrador)?.general?.competidores ?? []).map((c) => c.nombre);
    const delicadas = Object.fromEntries(
      fechasDelMes(cal.year, cal.month, client?.fechasEspeciales).filter((f) => f.delicada).map((f) => [f.fecha, f.nombre]),
    );
    return new Map(revisarMes(cal.days, { catalogo: mercado?.catalogo ?? [], competidores, delicadas, ...(mercado ? { estudio: mercado.estudio ?? mercado.borrador ?? null } : {}) }).map((x) => [x.post.id, x.problemas]));
  }, [cal.days, cal.year, cal.month, client?.fechasEspeciales, mercado]);
  const detalles = useMemo(() => feed.map((f) => ({
    ...f,
    ...detallesDe(f.post, f.fecha, { conectadas, cola, ahora, problemasTexto: problemas.get(f.post.id) ?? [] }),
  })), [feed, conectadas, cola, ahora, problemas]);
  const detallePorId = useMemo(() => new Map(detalles.map((d) => [d.post.id, d])), [detalles]);

  // El feed, una a una: empieza en la publicación de la que se venía (o en la primera).
  const [indice, setIndice] = useState(() => Math.max(0, feed.findIndex((f) => f.post.id === inicial?.postId)));
  const actual = feed[Math.min(indice, feed.length - 1)] ?? null;

  const abrir = (postId) => onAbrirPost?.(postId, { vista, filtro, postId });
  const irAlFeed = (postId) => {
    const i = feed.findIndex((f) => f.post.id === postId);
    if (i >= 0) setIndice(i);
    setVista("feed");
  };
  const verNoListas = () => { setFiltro("no-listas"); setVista("detalles"); };

  // Al volver del panel, la publicación de la que se venía, a la vista.
  useEffect(() => {
    if (!inicial?.postId) return;
    const el = document.getElementById(`${base}-p-${inicial.postId}`);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus?.({ preventScroll: true });
  }, [inicial, base]);

  // El título de la confirmación recibe el foco (lo que cambia es el contenido, no hay otro diálogo).
  const tituloPaso = useRef(null);
  useEffect(() => { if (paso !== "ver") tituloPaso.current?.focus({ preventScroll: false }); }, [paso]);

  const n = listo.listas.length;
  const puedeProgramar = !soloLectura && !virtual && Boolean(onProgramar);
  const confirmacion = useMemo(() => confirmacionDeProgramar(listo.listas, mesNombre.toLowerCase()), [listo.listas, mesNombre]);

  const programar = async () => {
    setPaso("programando");
    setResultado(null);
    try {
      const r = await onProgramar(listo.listas.map(({ post, redes }) => ({ post, redes })), setAvance);
      setResultado(r);
    } catch (e) {
      setResultado({ error: e?.message || "No se pudo programar." });
    }
    setAvance("");
    setPaso("resultado");
  };

  const botonProgramar = (donde) => (puedeProgramar ? (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={!n || paso === "programando"}
      onClick={() => setPaso("confirmar")}
      title={!n ? "No hay nada listo: mira en Detalles qué le falta a cada una." : undefined}
      data-donde={donde}
    >
      <Icon name="clock" size={16} /> Programar todo lo listo ({n})
    </button>
  ) : null);

  const resumen = [
    `${n} ${n === 1 ? "lista" : "listas"} para programar`,
    listo.cuentas["en-cola"] && `${listo.cuentas["en-cola"]} ya en la cola`,
    listo.cuentas.publicada && `${listo.cuentas.publicada} ${listo.cuentas.publicada === 1 ? "publicada" : "publicadas"}`,
    listo.cuentas["a-mano"] && `${listo.cuentas["a-mano"]} las publicas tú`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="overlay overlay-sheet vista-mes-overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet vista-mes" tabIndex={-1}>
        <div className="sheet-header">
          <div className="vista-mes-cabeza">
            <h2 id={`${ids}-t`}>Así se verá {mesNombre.toLowerCase()} {cal.year}</h2>
            <p className="hint">{client?.name}: el mes como sale en Instagram. Mirarlo es revisarlo: no hay que marcar nada.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar" disabled={paso === "programando"}><Icon name="close" /></button>
        </div>

        <div className="vista-mes-barra">
          <BarraPestanas
            etiqueta="Cómo ver el mes"
            pestanas={VISTAS}
            actual={vista}
            onElegir={(v) => { setVista(v); if (paso === "resultado") setPaso("ver"); }}
            base={base}
            clase="vista-mes-pestanas"
            claseItem="vista-mes-pestana"
          />
          <div className="vista-mes-programar">
            <p className="vista-mes-resumen">
              {resumen}
              {listo.noListas.length > 0 && (
                <>
                  {" · "}
                  <button type="button" className="vista-mes-enlace" onClick={verNoListas}>
                    {listo.noListas.length} {listo.noListas.length === 1 ? "no está lista" : "no están listas"}
                  </button>
                </>
              )}
            </p>
            {paso === "ver" && botonProgramar("arriba")}
          </div>
        </div>

        <div
          className="sheet-body vista-mes-cuerpo"
          role="tabpanel"
          id={idDelPanel(base)}
          aria-labelledby={idDePestana(base, vista)}
        >
          {paso !== "ver" ? (
            <Programar
              idTitulo={`${ids}-prog`}
              paso={paso}
              confirmacion={confirmacion}
              noListas={listo.noListas.length}
              avance={avance}
              resultado={resultado}
              tituloRef={tituloPaso}
              onConfirmar={programar}
              onVolver={() => setPaso("ver")}
              onAbrir={abrir}
              onVerNoListas={() => { setPaso("ver"); verNoListas(); }}
            />
          ) : vista === "perfil" ? (
            <Perfil
              base={base}
              items={cuadricula}
              publicadas={publicadas}
              usuario={usuario}
              nombre={cuentaIG?.nombre || client?.name}
              avatar={avatar}
              onAvatarRoto={() => setAvatarRoto(true)}
              mesNombre={mesNombre}
              client={client}
              onElegir={irAlFeed}
            />
          ) : vista === "feed" ? (
            <Feed
              base={base}
              feed={feed}
              indice={Math.min(indice, Math.max(0, feed.length - 1))}
              actual={actual}
              detalle={actual ? detallePorId.get(actual.post.id) : null}
              client={clienteVista}
              onIr={setIndice}
              onAbrir={abrir}
              onDetalles={() => { setFiltro("todas"); setVista("detalles"); }}
            />
          ) : (
            <Detalles
              base={base}
              detalles={detalles}
              filtro={filtro}
              onFiltro={setFiltro}
              onAbrir={abrir}
            />
          )}
        </div>

        <div className="sheet-footer vista-mes-pie">
          <span className="hint vista-mes-pie-texto">
            {soloLectura ? "Con acceso de sólo lectura no se programa." : virtual ? "Este mes aún no tiene publicaciones." : "Sale a su día y hora, en sus redes, sin pasar por el cliente."}
          </span>
          {paso === "ver" && botonProgramar("abajo")}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={paso === "programando"}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Una miniatura de la cuadrícula: el recorte 3:4 del centro, como el perfil
// ------------------------------------------------------------

function Miniatura({ miniatura, tipo, formato, titulo, modo, color }) {
  const m = miniatura;
  // Una imagen que no cabe en el feed sale ajustada (4:5 con su fondo): se enseña así, con el MISMO lienzo.
  const objetivo = m?.tipo === "imagen" && tipo !== "reel" && m.ancho && necesitaAjuste({ tipo: "imagen", ancho: m.ancho, alto: m.alto }, "feed") ? "feed" : null;
  const src = useAjustada(m?.tipo === "imagen" ? m.src : null, objetivo, modo, color);
  if (!m) {
    return (
      <span className="vm-mini-vacia">
        <Icon name={FORMAT_ICONS[formato] || "formatPost"} size={20} />
        <span>{titulo}</span>
        <em>Sin pieza</em>
      </span>
    );
  }
  if (m.tipo === "video") {
    return (
      <video
        src={m.src}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        onLoadedMetadata={(e) => { e.currentTarget.currentTime = m.segundo > 0 ? m.segundo : 0.1; }}
      />
    );
  }
  return src ? <img src={src} alt="" loading="lazy" /> : <span className="vm-mini-cargando">Preparando…</span>;
}

// ------------------------------------------------------------
// Perfil
// ------------------------------------------------------------

function Perfil({ base, items, publicadas, usuario, nombre, avatar, onAvatarRoto, mesNombre, client, onElegir }) {
  return (
    <section className="vm-perfil" aria-label="El perfil de Instagram">
      <div className="vm-perfil-cabecera">
        <span className="vm-avatar">
          {avatar ? <img src={avatar} alt="" onError={onAvatarRoto} /> : <Icon name="building" size={24} />}
        </span>
        <div>
          <strong>{usuario}</strong>
          <span>{nombre}</span>
          <span>{items.length} {items.length === 1 ? "publicación nueva" : "publicaciones nuevas"} en {mesNombre.toLowerCase()}</span>
        </div>
      </div>
      <p className="hint vm-perfil-nota">
        Lo de {mesNombre.toLowerCase()} arriba, lo más nuevo primero, con el recorte 3:4 que enseña el perfil. Toca una para verla en el feed.
      </p>
      {!items.length && <p className="vm-vacio">Este mes aún no tiene nada que salga en el perfil de Instagram.</p>}
      <ul className="vm-rejilla">
        {items.map((it) => (
          <li key={it.post.id}>
            <button
              type="button"
              id={`${base}-p-${it.post.id}`}
              className="vm-celda"
              onClick={() => onElegir(it.post.id)}
              aria-label={[
                cuandoTexto(it.cuando, it.fecha), FORMATS[it.post.format]?.label ?? "Publicación", tituloCorto(it.post),
                it.aMano && "la publicas tú", it.estado === "publicada" && "publicada", it.estado === "programada" && "programada",
                !it.miniatura && "sin pieza",
              ].filter(Boolean).join(", ")}
            >
              <Miniatura miniatura={it.miniatura} tipo={it.tipo} formato={it.post.format} titulo={tituloCorto(it.post)}
                modo={it.post.ajusteIG || "difuminado"} color={client?.primaryColor} />
              {(it.tipo === "reel" || it.tipo === "carrusel") && (
                <span className="vm-celda-icono" aria-hidden="true"><Icon name={it.tipo === "reel" ? "play" : "copy"} size={14} /></span>
              )}
              {it.aMano && <span className="vm-celda-marca" aria-hidden="true">A mano</span>}
              <span className="vm-celda-fecha" aria-hidden="true" data-estado={it.estado || undefined}>
                {it.estado === "publicada" && <Icon name="check" size={11} />}
                {it.estado === "programada" && <Icon name="clock" size={11} />}
                {it.estado === "error" && <Icon name="alert" size={11} />}
                {Number(it.fecha?.slice(8))} {mesNombre.slice(0, 3).toLowerCase()}
              </span>
            </button>
          </li>
        ))}
        {publicadas?.length > 0 && (
          <li className="vm-rejilla-separador" aria-hidden="true">Ya publicado en Instagram</li>
        )}
        {(publicadas ?? []).map((p) => (
          <li key={p.id} className="vm-celda-pasada">
            {p.enlace ? (
              <a className="vm-celda" href={p.enlace} target="_blank" rel="noopener noreferrer"
                aria-label={`Ya publicada el ${new Date(p.publicadaAt).toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "long" })} (se abre en Instagram)`}>
                <img src={p.miniatura} alt="" loading="lazy" />
              </a>
            ) : (
              <span className="vm-celda"><img src={p.miniatura} alt="Ya publicada" loading="lazy" /></span>
            )}
          </li>
        ))}
      </ul>
      {publicadas === null && <p className="hint">Buscando lo ya publicado…</p>}
    </section>
  );
}

// ------------------------------------------------------------
// Feed: una a una, como en el teléfono
// ------------------------------------------------------------

function Feed({ base, feed, indice, actual, detalle, client, onIr, onAbrir, onDetalles }) {
  const toque = useRef(null);
  const tira = useRef(null);
  const total = feed.length;
  const ir = (i) => onIr(Math.max(0, Math.min(total - 1, i)));
  // La miniatura escogida, a la vista en la tira.
  useEffect(() => {
    tira.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [indice]);

  if (!actual) return <p className="vm-vacio">Este mes aún no tiene publicaciones.</p>;
  const { post } = actual;
  const avisos = detalle ? detalle.motivos.length + detalle.avisos.length : 0;

  const alTeclear = (e) => {
    if (e.target.closest?.(SUYAS_LAS_FLECHAS)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); ir(indice + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(indice - 1); }
  };
  // Deslizar pasa de publicación; dentro de un carrusel, el gesto es del carrusel (vistaRed.jsx).
  const alTocar = (e) => {
    if (e.target.closest?.("[data-carrusel], video, .vm-feed-tira")) { toque.current = null; return; }
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY };
  };
  const alSoltar = (e) => {
    const ini = toque.current;
    toque.current = null;
    const t = e.changedTouches[0];
    if (!ini || !t) return;
    const dx = t.clientX - ini.x;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(t.clientY - ini.y)) return;
    ir(indice + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      className="vm-feed"
      aria-roledescription="carrusel"
      aria-label="Las publicaciones del mes, una a una (flechas del teclado para pasar)"
      tabIndex={0}
      onKeyDown={alTeclear}
      onTouchStart={alTocar}
      onTouchEnd={alSoltar}
    >
      <div className="vm-feed-nav">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ir(indice - 1)} disabled={indice === 0} aria-label="Publicación anterior">
          <Icon name="chevronLeft" size={16} />
        </button>
        <p className="vm-feed-donde" aria-live="polite">
          <strong>{indice + 1} de {total}</strong>
          <span>{cuandoTexto(actual.cuando, actual.fecha)} · {FORMATS[post.format]?.label ?? "Publicación"}</span>
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ir(indice + 1)} disabled={indice >= total - 1} aria-label="Publicación siguiente">
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div className="vm-feed-pieza" id={`${base}-p-${post.id}`} tabIndex={-1}>
        <div className="vm-feed-marcas">
          {actual.esHistoria && <span className="vm-marca" data-tipo="historia"><Icon name="formatHistoria" size={12} /> Historia (9:16): sale en las historias, no en el perfil</span>}
          {actual.conHistoria && <span className="vm-marca"><Icon name="formatHistoria" size={12} /> Sale también como historia</span>}
          {actual.aMano && <span className="vm-marca" data-tipo="mano"><Icon name="photo" size={12} /> La publicas tú desde el teléfono</span>}
          {detalle && <span className="vm-marca" data-estado={detalle.estado}>{NOMBRE_ESTADO_PROGRAMAR[detalle.estado]}</span>}
        </div>
        <VistaRed key={post.id} post={post} redes={actual.redes} client={client} />
        <div className="vm-feed-acciones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAbrir(post.id)}>
            <Icon name="pencil" size={14} /> Abrir la publicación
          </button>
          {avisos > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onDetalles}>
              <Icon name="alert" size={14} /> {avisos} {avisos === 1 ? "cosa que mirar" : "cosas que mirar"}
            </button>
          )}
        </div>
      </div>

      <ol ref={tira} className="vm-feed-tira" aria-label="Ir a una publicación">
        {feed.map((f, i) => (
          <li key={f.post.id}>
            <button
              type="button"
              aria-current={i === indice ? "true" : undefined}
              onClick={() => ir(i)}
              aria-label={`${i + 1}: ${cuandoTexto(f.cuando, f.fecha)}, ${tituloCorto(f.post)}`}
            >
              <TiraMini post={f.post} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** La miniatura de la tira: la primera imagen (o la portada), sin ajustar; sin imagen, el icono del formato. */
function TiraMini({ post }) {
  const imagen = typeof post.portada === "string" && post.portada
    ? post.portada
    : (post.medios ?? []).find((m) => m?.src && m.tipo !== "video" && !/\.(mp4|mov|webm)(\?|$)/i.test(m.src))?.src || post.image || "";
  return imagen ? <img src={imagen} alt="" loading="lazy" /> : <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={16} />;
}

// ------------------------------------------------------------
// Detalles: lo que la revisión automática encuentra, sin IA
// ------------------------------------------------------------

function Detalles({ base, detalles, filtro, onFiltro, onAbrir }) {
  const cuenta = (f) => detalles.filter((d) => pasaFiltroDetalles(d, f)).length;
  const lista = detalles.filter((d) => pasaFiltroDetalles(d, filtro));
  return (
    <section className="vm-detalles" aria-label="Lo que hay que mirar en cada publicación">
      <div className="vm-filtros" role="group" aria-label="Qué publicaciones enseñar">
        {FILTROS_DETALLES.map(([id, nombre]) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={filtro === id} onClick={() => onFiltro(id)}>
            {nombre} ({cuenta(id)})
          </button>
        ))}
      </div>
      <p className="hint">
        La revisión de siempre, sin IA: lo que impide programarla, los avisos del panel y los de los textos (precios fuera del
        catálogo, la competencia, el voseo, el llamado a la acción, los hashtags). Toca uno para abrir la publicación.
      </p>
      {!lista.length && (
        <p className="vm-vacio">
          <Icon name="checkCircle" size={18} /> {detalles.length ? "Nada que mirar con este filtro." : "Este mes aún no tiene publicaciones."}
        </p>
      )}
      <ol className="vm-det-lista">
        {lista.map((d) => (
          <li key={d.post.id} className="vm-det" data-estado={d.estado}>
            <div className="vm-det-cabeza">
              <span className="vm-det-mini" aria-hidden="true"><TiraMini post={d.post} /></span>
              <div className="vm-det-texto">
                <strong>{cuandoTexto(d.cuando, d.fecha)}</strong>
                <span>{FORMATS[d.post.format]?.label ?? "Publicación"} · {tituloCorto(d.post)}</span>
              </div>
              <span className="vm-chip" data-estado={d.estado}>{NOMBRE_ESTADO_PROGRAMAR[d.estado]}</span>
              <button type="button" id={`${base}-p-${d.post.id}`} className="btn btn-secondary btn-sm" onClick={() => onAbrir(d.post.id)}>
                Abrir
              </button>
            </div>
            {d.nota && <p className="hint vm-det-nota">{d.nota}</p>}
            {(d.motivos.length > 0 || d.avisos.length > 0) && (
              <ul className="vm-det-avisos">
                {d.motivos.map((m) => (
                  <li key={`m-${m}`}>
                    <button type="button" className="vm-aviso" data-tipo="impide" onClick={() => onAbrir(d.post.id)}>
                      <Icon name="alert" size={14} /> <span><strong>Impide programarla:</strong> {m}</span>
                    </button>
                  </li>
                ))}
                {d.avisos.map((a) => (
                  <li key={`a-${a}`}>
                    <button type="button" className="vm-aviso" data-tipo="aviso" onClick={() => onAbrir(d.post.id)}>
                      <Icon name="info" size={14} /> <span>{a}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!d.motivos.length && !d.avisos.length && !d.nota && <p className="vm-det-bien"><Icon name="check" size={14} /> Nada que mirar.</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------
// «Programar todo lo listo»: confirmar, programar y lo que pasó
// ------------------------------------------------------------

function Programar({ idTitulo, paso, confirmacion, noListas, avance, resultado, tituloRef, onConfirmar, onVolver, onAbrir, onVerNoListas }) {
  if (paso === "confirmar") {
    return (
      <section className="vm-programar" aria-labelledby={idTitulo}>
        <h3 id={idTitulo} ref={tituloRef} tabIndex={-1}>{confirmacion.titulo}</h3>
        <p className="hint">
          Cada una sale a su día y hora en sus redes, sin pedir la aprobación del cliente. Antes se preparan sus imágenes (JPEG,
          4:5, la copia de TikTok) como al programar una a una.
        </p>
        {confirmacion.pendientesCliente > 0 && (
          <p className="notice notice-warn">
            {confirmacion.pendientesCliente === 1 ? "Una la tiene" : `${confirmacion.pendientesCliente} las tiene`} el cliente sin
            responder: se programan igual. Si pide cambios en alguna, sale sola de la cola.
          </p>
        )}
        <ul className="vm-programar-lista">
          {confirmacion.lineas.map((l) => (
            <li key={l.id}><span>{l.texto}</span>{l.redes && <em>{l.redes}</em>}</li>
          ))}
        </ul>
        {confirmacion.mas > 0 && <p className="hint">y {confirmacion.mas} más.</p>}
        {noListas > 0 && (
          <p className="hint">
            {noListas} {noListas === 1 ? "no está lista y se queda fuera" : "no están listas y se quedan fuera"}.{" "}
            <button type="button" className="vista-mes-enlace" onClick={onVerNoListas}>Ver por qué</button>
          </p>
        )}
        <div className="dialog-acciones">
          <button type="button" className="btn btn-secondary" onClick={onVolver}>Volver</button>
          <button type="button" className="btn btn-primary" onClick={onConfirmar}>
            <Icon name="clock" size={16} /> {confirmacion.titulo.replace(/ de .*$/, "")}
          </button>
        </div>
      </section>
    );
  }
  if (paso === "programando") {
    return (
      <section className="vm-programar" aria-labelledby={idTitulo} aria-busy="true">
        <h3 id={idTitulo} ref={tituloRef} tabIndex={-1}>Programando…</h3>
        <p role="status" aria-live="polite" className="hint">{avance || "Empezando…"}</p>
      </section>
    );
  }
  const fallidas = resultado?.fallidas ?? [];
  return (
    <section className="vm-programar" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} ref={tituloRef} tabIndex={-1}>
        {resultado?.error ? "No se pudo programar" : resultado?.programadas ? `Programadas ${resultado.programadas} ${resultado.programadas === 1 ? "pieza" : "piezas"}` : "No se programó nada"}
      </h3>
      <div role="status" aria-live="polite">
        {resultado?.error && <p className="notice notice-error">{resultado.error}</p>}
        {!resultado?.error && resultado?.programadas > 0 && (
          <p className="notice notice-ok">Ya están en la cola: salen a su hora. Puedes verlas en Producción.</p>
        )}
      </div>
      {fallidas.length > 0 && (
        <>
          <p className="hint">Éstas no se programaron:</p>
          <ul className="vm-programar-lista">
            {fallidas.map((f) => (
              <li key={f.postId}>
                <span><strong>{f.titulo}:</strong> {f.motivo}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAbrir(f.postId)}>Abrir</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="dialog-acciones">
        <button type="button" className="btn btn-primary" onClick={onVolver}>Volver a la vista previa</button>
      </div>
    </section>
  );
}
