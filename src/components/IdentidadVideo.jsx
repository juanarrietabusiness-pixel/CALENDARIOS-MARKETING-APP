import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import "./IdentidadVideo.css";
import { leerIdentidad, guardarIdentidad, muestraDeSubtitulos, musicasDelCliente } from "../lib/identidadVideoApi";
import { listarEstilos } from "../lib/estilosVideoApi";
import { buscarEnCatalogo, efectoDelCatalogo, srcDeEfecto } from "../lib/catalogoEfectos";
import { ESTILOS_SUBTITULO, MOMENTOS_EFECTO, IDS_MOMENTO, MAX_MUSICAS_IDENTIDAD, MAX_EFECTOS_MOMENTO, limpiarIdentidad } from "../lib/identidadVideo";

// ============================================================
// La IDENTIDAD DE VIDEO del cliente en Marca → Kit y voz (en diferido): lo que comparten TODOS sus videos
//
// El estilo de la marca (uno de los estilos guardados), sus músicas (de la biblioteca de sonido), sus efectos por momento
// (del catálogo, con su «escuchar») y el estilo de sus subtítulos (con la muestra dibujada con su marca por el Container).
// Se guarda con un botón: el servidor comprueba lo que nombra. Se aplica a los videos que se creen desde ahora; los ya
// hechos no cambian.
// ============================================================

const NOMBRE_COLOR = { acento: "Acento", apoyo: "Apoyo", texto: "Texto", claro: "Claro", oscuro: "Oscuro", fondo: "Fondo", superficie: "Placas" };
const POSICIONES = [["abajo", "Abajo"], ["centro", "En el centro"], ["arriba", "Arriba"]];

/** Lo que se edita en la pantalla, desde lo guardado. */
const enEdicion = (i) => ({
  estiloId: i?.estiloId ?? "",
  musicas: (i?.musicas ?? []).map((m) => m.id),
  efectos: Object.fromEntries(IDS_MOMENTO.map((k) => [k, i?.efectos?.[k] ?? []])),
  subtitulos: { estilo: i?.subtitulos?.estilo ?? "", pos: i?.subtitulos?.pos ?? "", maxPalabras: i?.subtitulos?.maxPalabras ?? "", acento: i?.subtitulos?.acento ?? "", mayusculas: typeof i?.subtitulos?.mayusculas === "boolean" ? String(i.subtitulos.mayusculas) : "" },
});

/** Lo que se manda a guardar: cada parte, o null si quedó vacía. */
function paraGuardar(e) {
  const sub = e.subtitulos;
  const subtitulos = sub.estilo ? {
    estilo: sub.estilo, ...(sub.pos ? { pos: sub.pos } : {}), ...(sub.maxPalabras ? { maxPalabras: Number(sub.maxPalabras) } : {}),
    ...(sub.acento ? { acento: sub.acento } : {}), ...(sub.mayusculas ? { mayusculas: sub.mayusculas === "true" } : {}),
  } : null;
  const efectos = Object.fromEntries(Object.entries(e.efectos).filter(([, l]) => l.length));
  return { estiloId: e.estiloId || null, musicas: e.musicas.length ? e.musicas : null, efectos: Object.keys(efectos).length ? efectos : null, subtitulos };
}

export default function IdentidadVideo({ client, lectura = false }) {
  const ids = useId();
  const [guardada, setGuardada] = useState(undefined);
  const [resumen, setResumen] = useState([]);
  const [edicion, setEdicion] = useState(() => enEdicion(null));
  const [estilos, setEstilos] = useState([]);
  const [musicas, setMusicas] = useState([]);
  const [muestras, setMuestras] = useState(null);
  const [cargandoMuestra, setCargandoMuestra] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const audio = useRef(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([leerIdentidad(client.id), listarEstilos(client.id).catch(() => []), musicasDelCliente(client.id).catch(() => [])])
      .then(([r, e, m]) => {
        if (!vivo) return;
        setGuardada(r.identidad ?? null); setResumen(r.resumen ?? []); setEdicion(enEdicion(r.identidad)); setEstilos(e); setMusicas(m);
      })
      .catch((e) => { if (vivo) { setGuardada(null); setAviso({ ok: false, texto: e.message }); } });
    return () => { vivo = false; };
  }, [client.id]);

  if (guardada === undefined) return <p role="status" className="hint">Cargando la identidad de video…</p>;

  const cambiado = JSON.stringify(paraGuardar(edicion)) !== JSON.stringify(paraGuardar(enEdicion(guardada)));
  const poner = (parte, valor) => setEdicion((e) => ({ ...e, [parte]: valor }));
  const ponerSub = (k, v) => setEdicion((e) => ({ ...e, subtitulos: { ...e.subtitulos, [k]: v } }));
  const escuchar = (src) => {
    try { if (audio.current) { audio.current.src = src; audio.current.currentTime = 0; audio.current.play().catch(() => {}); } } catch { /* sin audio */ }
  };

  const guardar = async () => {
    setGuardando(true); setAviso(null);
    try {
      const r = await guardarIdentidad(client.id, paraGuardar(edicion));
      const limpia = limpiarIdentidad(r.identidad);
      setGuardada(limpia); setResumen(r.resumen ?? []); setEdicion(enEdicion(limpia));
      setAviso({ ok: true, texto: "Guardada: los videos que se creen desde ahora la siguen." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const verMuestra = async () => {
    setCargandoMuestra(true); setAviso(null);
    try { setMuestras(await muestraDeSubtitulos(client.id)); } catch (e) { setAviso({ ok: false, texto: `No se pudo dibujar la muestra: ${e.message}` }); } finally { setCargandoMuestra(false); }
  };

  const bloqueado = lectura || guardando;
  return (
    <div className="field identidad-video">
      <span className="label">Identidad de video</span>
      <p className="hint" style={{ margin: 0 }}>
        Lo que comparten todos los videos de {client.name}: su estilo, sus músicas, sus efectos y sus subtítulos. Se aplica
        a los videos que se creen desde ahora (también los que hace Claude); los ya hechos no cambian.
      </p>
      {resumen.length > 0 && (
        <ul className="hint" style={{ margin: 0, paddingLeft: "var(--sp-4)" }} aria-label="La identidad guardada">
          {resumen.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {/* El que suena al escuchar un efecto: uno para todos (un efecto corto, sin palabras). */}
      <audio ref={audio} preload="none" hidden />

      <label className="label" htmlFor={`${ids}-estilo`}>Estilo de la marca</label>
      <select id={`${ids}-estilo`} className="input" value={edicion.estiloId} disabled={bloqueado} onChange={(e) => poner("estiloId", e.target.value)}>
        <option value="">Ninguno (cada video con el que se escoja)</option>
        {estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select>
      {!estilos.length && <p className="hint" style={{ margin: 0 }}>Todavía no hay estilos guardados: se guardan desde un video que quedó bien («Estilo del video» → «Guardar como estilo»).</p>}

      <fieldset className="identidad-grupo">
        <legend className="label">Músicas ({edicion.musicas.length} de {MAX_MUSICAS_IDENTIDAD})</legend>
        {!musicas.length && <p className="hint" style={{ margin: 0 }}>La biblioteca de sonido está vacía: se suben en Marca → Música y efectos.</p>}
        <ul className="identidad-lista">
          {musicas.map((m) => {
            const marcada = edicion.musicas.includes(m.id);
            return (
              <li key={m.id} className="identidad-fila">
                <label className="identidad-casilla">
                  <input type="checkbox" checked={marcada} disabled={bloqueado || (!marcada && edicion.musicas.length >= MAX_MUSICAS_IDENTIDAD)}
                    onChange={() => poner("musicas", marcada ? edicion.musicas.filter((x) => x !== m.id) : [...edicion.musicas, m.id])} />
                  <span>{m.nombre}{m.de === "agencia" ? " · de la agencia" : ""}</span>
                </label>
                <audio controls preload="none" src={m.src} aria-label={`Escuchar ${m.nombre}`} />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="identidad-grupo">
        <legend className="label">Efectos por momento</legend>
        <p className="hint" style={{ margin: 0 }}>Hasta {MAX_EFECTOS_MOMENTO} por momento; rotan entre ellos. Un momento sin efectos suena como siempre.</p>
        {IDS_MOMENTO.map((k) => {
          const elegidos = edicion.efectos[k];
          const opciones = buscarEnCatalogo({ papel: MOMENTOS_EFECTO[k].papeles }).filter((e) => !elegidos.includes(e.id));
          return (
            <div key={k} className="identidad-momento">
              <span className="identidad-momento-nombre">{MOMENTOS_EFECTO[k].nombre}<span className="hint"> — {MOMENTOS_EFECTO[k].para}</span></span>
              <ul className="identidad-chips" aria-label={`Efectos de ${MOMENTOS_EFECTO[k].nombre.toLowerCase()}`}>
                {elegidos.map((id) => {
                  const e = efectoDelCatalogo(id);
                  return (
                    <li key={id} className="identidad-chip">
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Escuchar ${e?.nombre ?? id}`} disabled={!e} onClick={() => e && escuchar(srcDeEfecto(e))}>
                        <Icon name="play" />
                      </button>
                      <span>{e?.nombre ?? id}</span>
                      {!lectura && (
                        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar ${e?.nombre ?? id}`} disabled={guardando}
                          onClick={() => poner("efectos", { ...edicion.efectos, [k]: elegidos.filter((x) => x !== id) })}>
                          <Icon name="close" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!lectura && elegidos.length < MAX_EFECTOS_MOMENTO && (
                <select className="input" aria-label={`Añadir un efecto a ${MOMENTOS_EFECTO[k].nombre.toLowerCase()}`} value="" disabled={guardando}
                  onChange={(ev) => { const id = ev.target.value; if (!id) return; poner("efectos", { ...edicion.efectos, [k]: [...elegidos, id] }); const e = efectoDelCatalogo(id); if (e) escuchar(srcDeEfecto(e)); }}>
                  <option value="">Añadir un efecto…</option>
                  {opciones.map((e) => <option key={e.id} value={e.id}>{e.nombre} — {e.para}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="identidad-grupo">
        <legend className="label">Subtítulos</legend>
        <div role="radiogroup" aria-label="Estilo de los subtítulos" className="identidad-estilos">
          <label className="identidad-casilla">
            <input type="radio" name={`${ids}-sub`} checked={!edicion.subtitulos.estilo} disabled={bloqueado} onChange={() => ponerSub("estilo", "")} />
            <span>Sin elegir (cada video con el suyo)</span>
          </label>
          {Object.entries(ESTILOS_SUBTITULO).map(([k, v]) => (
            <label key={k} className="identidad-casilla">
              <input type="radio" name={`${ids}-sub`} checked={edicion.subtitulos.estilo === k} disabled={bloqueado} onChange={() => ponerSub("estilo", k)} />
              <span><strong>{v.nombre}</strong> — <span className="hint">{v.descripcion}</span></span>
            </label>
          ))}
        </div>
        <div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={cargandoMuestra} onClick={verMuestra}>
            {cargandoMuestra ? "Dibujando…" : "Ver los estilos con su marca"}
          </button>
        </div>
        {muestras?.length > 0 && (
          <ul className="identidad-muestras" aria-label="Muestra de los estilos de subtítulos">
            {muestras.map((m) => (
              <li key={m.estilo}>
                <img src={`data:${m.mime};base64,${m.datos}`} alt={`Subtítulos «${m.nombre}» con la marca de ${client.name}`} />
                <span className="hint">{m.nombre}</span>
              </li>
            ))}
          </ul>
        )}
        {edicion.subtitulos.estilo && (
          <div className="identidad-opciones">
            <label className="label" htmlFor={`${ids}-pos`}>Dónde</label>
            <select id={`${ids}-pos`} className="input" value={edicion.subtitulos.pos} disabled={bloqueado} onChange={(e) => ponerSub("pos", e.target.value)}>
              <option value="">Lo que diga el video</option>
              {POSICIONES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-pal`}>Palabras por grupo</label>
            <select id={`${ids}-pal`} className="input" value={edicion.subtitulos.maxPalabras} disabled={bloqueado} onChange={(e) => ponerSub("maxPalabras", e.target.value)}>
              <option value="">Lo que diga el video</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-acento`}>Color de la palabra clave</label>
            <select id={`${ids}-acento`} className="input" value={edicion.subtitulos.acento} disabled={bloqueado} onChange={(e) => ponerSub("acento", e.target.value)}>
              <option value="">El acento (por defecto)</option>
              {Object.entries(NOMBRE_COLOR).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <label className="label" htmlFor={`${ids}-may`}>Mayúsculas</label>
            <select id={`${ids}-may`} className="input" value={edicion.subtitulos.mayusculas} disabled={bloqueado} onChange={(e) => ponerSub("mayusculas", e.target.value)}>
              <option value="">Según el estilo</option>
              <option value="true">Siempre en mayúsculas</option>
              <option value="false">Como se escribe</option>
            </select>
          </div>
        )}
      </fieldset>

      {!lectura && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar la identidad de video"}
          </button>
        </div>
      )}
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
    </div>
  );
}
