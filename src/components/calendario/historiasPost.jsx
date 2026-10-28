// ============================================================
// La historia que acompaña al post
//
// Casi siempre el post también se sube a historias. La API de Instagram
// no deja «compartir el post en tu historia» como el teléfono, así que
// aquí se prepara la versión 9:16 y sale sola unos minutos después:
//
//   · «Usar la imagen del post»: la misma imagen, encajada a 9:16 con
//     fondo difuminado (o el ajuste elegido). Sin IA, sin coste.
//   · «Crear 3 con IA»: tres historias NUEVAS que complementan el post con
//     su misma información —una pregunta, un beneficio o detalle y el
//     llamado a la acción—, por el camino del Estudio (lib/historiasEstudio.js):
//     el director de arte escribe el texto exacto (antes lo inventaba el motor
//     de imagen, y de ahí las faltas), el modelo y el kit del cliente, y el
//     control de calidad corrige la letra que salga mal.
//
// SIEMPRE ACTIVO (decisión de la agencia: casi todo post va también a
// historias): al poner la primera imagen del post se prepara sola la
// ENCAJADA (la misma imagen en 9:16, gratis) y se marca «Publicar también
// como historia»; si la imagen del post cambia (otra versión, corregida…), la
// encajada se rehace con la nueva, así la historia es la del post que se
// aprueba. Las tres con IA, SÓLO con su botón (cuestan: un post que no gusta
// no las paga), con el modelo que se escoja aquí para el cliente. Se apaga
// por navegador.
//
// Lo que no se escoge va a la papelera del Estudio.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { subirImagenPublicacion } from "../../lib/db";
import { historiaDesdeImagen } from "../../lib/medios";
import { mediosDe, historiasDe, queHacerConLaEncajada, RETRASO_HISTORIA_MIN, LIMITES } from "../../lib/publicacion";

const RETRASOS = [0, 5, 15, 30, 60, 120];

/** ¿Crear las historias solas al poner la imagen del post? Por navegador; encendido por defecto. */
const CLAVE_SOLAS = "historias-solas";
const leerSolas = () => { try { return localStorage.getItem(CLAVE_SOLAS) !== "0"; } catch { return true; } };

export default function HistoriasDelPost({ post, sf, clientId, cliente = null, calendarId = null, colorMarca, onError }) {
  const ids = useId();
  const [trabajando, setTrabajando] = useState("");
  const [candidatas, setCandidatas] = useState([]);
  const [solas, setSolasEstado] = useState(leerSolas);
  const setSolas = (v) => { setSolasEstado(v); try { localStorage.setItem(CLAVE_SOLAS, v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  const historias = historiasDe(post);
  const base = mediosDe(post).find((m) => m.tipo === "imagen" && m.src.startsWith("/api/media/clientes/"));
  const maximo = LIMITES.instagram.carruselMax;
  const retraso = Number.isFinite(Number(post.historiaRetraso)) ? Number(post.historiaRetraso) : RETRASO_HISTORIA_MIN;

  const poner = (lista) => {
    sf("historias", lista.slice(0, maximo));
    if (lista.length) sf("historiaTambien", true);
  };

  // La encajada recuerda de qué imagen salió (`encajadaDe`): si la del post cambia, se rehace en su sitio.
  const usarLaDelPost = async (antes = historias, reemplaza = "") => {
    setTrabajando("post");
    try {
      const h = await historiaDesdeImagen(base.src, (f) => subirImagenPublicacion(clientId, f), post.ajusteIG || "difuminado", colorMarca);
      poner(reemplaza ? antes.map((x) => (x.src === reemplaza ? h : x)) : [...antes, h]);
      sf("encajadaDe", { de: base.src, src: h.src });
    } catch (e) {
      onError?.(`No se pudo preparar la historia: ${e.message}`);
    }
    setTrabajando("");
  };

  const crearConIA = async () => {
    if (!cliente) return;
    setTrabajando("ia");
    // Las de una tanda anterior que no se escogieron se quedan; las nuevas van detrás, cada una con su id.
    const tanda = Date.now();
    const { crearHistorias, VARIANTES } = await import("../../lib/historiasEstudio");
    const nuevas = VARIANTES.map((v) => ({ id: `${tanda}-${v.id}`, variante: v.id, nombre: v.nombre, estado: "creando", paso: "Diseñando…" }));
    setCandidatas((c) => [...c, ...nuevas]);
    const poner1 = (variante, cambio) => setCandidatas((c) => c.map((x) => (x.id === `${tanda}-${variante}` ? { ...x, ...cambio } : x)));
    try {
      await crearHistorias({
        client: cliente, post, base: base.src,
        alAvanzar: (variante, r) => poner1(variante, r.archivo ? { estado: "lista", archivo: r.archivo, src: r.archivo.src } : r.error ? { estado: "error", error: r.error } : { paso: r.paso }),
      });
    } catch (e) {
      setCandidatas((c) => c.map((x) => (x.id.startsWith(`${tanda}-`) && x.estado === "creando" ? { ...x, estado: "error", error: e.message } : x)));
    }
    window.dispatchEvent(new Event("ia:gasto"));
    setTrabajando("");
  };

  // SIEMPRE ACTIVO: cuando el post RECIBE su primera imagen (no al abrir uno que ya la tenía), la encajada en el acto; si
  // la imagen cambia y la encajada sigue puesta, se rehace con la nueva. Las tres con IA, sólo con su botón.
  const formatoSinHistoria = ["historia", "live", "reel", "carrusel"].includes(post.format);
  const baseAntes = useRef(base?.src ?? null);
  useEffect(() => {
    const antes = baseAntes.current;
    baseAntes.current = base?.src ?? null;
    if (!solas || trabajando || formatoSinHistoria) return;
    const que = queHacerConLaEncajada({ antes, ahora: base?.src ?? null, historias, encajada: post.encajadaDe });
    if (que === "crear") void usarLaDelPost([]);
    if (que === "rehacer") void usarLaDelPost(historias, post.encajadaDe.src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.src]);

  // El modelo de las tres con IA: el fijado para las historias de este cliente (lo comparte el equipo) o el de siempre.
  const [modelos, setModelos] = useState(null);
  useEffect(() => {
    if (!cliente || !base || formatoSinHistoria) return;
    let vivo = true;
    import("../../lib/historiasEstudio").then((m) => m.modelosParaHistorias(clientId)).then((r) => { if (vivo) setModelos(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [cliente, clientId, Boolean(base), formatoSinHistoria]); // eslint-disable-line react-hooks/exhaustive-deps
  const fijarModelo = async (id) => {
    setModelos((m) => ({ ...m, fijado: id }));
    try {
      const { fijarModeloHistorias } = await import("../../lib/historiasEstudio");
      await fijarModeloHistorias(clientId, id);
    } catch (e) {
      onError?.(`No se pudo guardar el modelo: ${e.message}`);
    }
  };

  const elegir = (c) => {
    poner([...historias, { src: c.src, tipo: "imagen", nombre: `${c.variante}.png`, ancho: c.archivo?.ancho || 1080, alto: c.archivo?.alto || 1920 }]);
    setCandidatas((l) => l.filter((x) => x !== c));
    // Que la papelera del Estudio sepa que la usa esta publicación.
    if (c.archivo?.id && calendarId && post.id) import("../../lib/estudio").then((api) => api.apuntarUso(clientId, c.archivo.id, { calendarId, postId: post.id })).catch(() => {});
  };

  const descartar = (c) => {
    setCandidatas((l) => l.filter((x) => x !== c));
    // Lo que no se escoge, a la papelera del Estudio (se puede recuperar 30 días).
    if (c.archivo?.id) import("../../lib/estudio").then((api) => api.mandarAPapelera(clientId, c.archivo.id)).catch(() => {});
  };

  const quitar = (i) => {
    const lista = historias.filter((_, j) => j !== i);
    sf("historias", lista);
    if (!lista.length) sf("historiaTambien", false);
    // Quitada a mano, la encajada ya no se rehace sola.
    if (historias[i]?.src && historias[i].src === post.encajadaDe?.src) sf("encajadaDe", null);
  };

  return (
    <section className="historias-post" aria-labelledby={`${ids}-t`}>
      <div className="historias-post-cabecera">
        <h3 id={`${ids}-t`} className="label">También en historias</h3>
        <label className="casilla">
          <input
            type="checkbox"
            checked={!!post.historiaTambien}
            disabled={!historias.length}
            onChange={(e) => sf("historiaTambien", e.target.checked)}
          />
          Publicar también como historia
        </label>
        {post.historiaTambien && (
          <>
            <label className="sr-only" htmlFor={`${ids}-r`}>Cuándo sale la historia</label>
            <select id={`${ids}-r`} className="input historias-post-retraso" value={retraso} onChange={(e) => sf("historiaRetraso", Number(e.target.value))}>
              {RETRASOS.map((m) => <option key={m} value={m}>{m === 0 ? "a la vez que el post" : `${m} min después del post`}</option>)}
            </select>
          </>
        )}
      </div>

      {historias.length > 0 && (
        <ol className="historias-post-lista" aria-label="Historias que acompañan al post">
          {historias.map((h, i) => (
            <li key={`${h.src}-${i}`}>
              <img src={h.src} alt={`Historia ${i + 1}`} />
              <button type="button" className="btn-icon" onClick={() => quitar(i)} aria-label={`Quitar la historia ${i + 1}`}>
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {candidatas.length > 0 && (
        <ul className="historias-post-candidatas" aria-label="Propuestas de la IA">
          {candidatas.map((c) => (
            <li key={c.id}>
              <div className="historias-post-marco" data-estado={c.estado}>
                {c.estado === "lista" ? <img src={c.src} alt={c.nombre} /> : c.estado === "creando" ? <span>{c.paso || "Creando…"}</span> : <span>{c.error}</span>}
              </div>
              <p>{c.nombre}</p>
              {c.estado !== "creando" && (
                <span className="historias-post-acciones">
                  {c.estado === "lista" && <button type="button" className="btn btn-primary btn-sm" onClick={() => elegir(c)}>Usar</button>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => descartar(c)}>{c.estado === "lista" ? "Descartar" : "Quitar"}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="historias-post-botones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!base || !!trabajando || historias.length >= maximo} onClick={() => usarLaDelPost()}>
          <Icon name="image" size={16} /> {trabajando === "post" ? "Preparando…" : "Usar la imagen del post"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!base || !cliente || !!trabajando || historias.length >= maximo} onClick={crearConIA}>
          <Icon name="sparkles" size={16} /> {trabajando === "ia" ? "Creando 3 propuestas…" : candidatas.length ? "Otras 3 con IA" : "Crear 3 con IA"}
        </button>
      </div>
      <label className="casilla">
        <input type="checkbox" checked={solas} onChange={(e) => setSolas(e.target.checked)} />
        Al poner la imagen del post, preparar sola su historia (la misma imagen en vertical, sin costo)
      </label>
      {cliente && base && modelos?.opciones?.length > 0 && (
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${ids}-m`}>Modelo de las 3 con IA</label>
          <select id={`${ids}-m`} className="input" value={modelos.fijado} onChange={(e) => fijarModelo(e.target.value)} disabled={!!trabajando}>
            <option value="">{modelos.porDefecto ? `El de siempre (${modelos.porDefecto})` : "El de siempre"}</option>
            {modelos.opciones.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {m.costo}</option>)}
          </select>
        </div>
      )}
      <p className="hint">
        {base
          ? "La historia sale sola a la hora elegida. «Usar la imagen del post» la encaja tal cual (se hace sola al poner la imagen y sigue a la imagen si cambia). «Crear 3 con IA» sólo se hace al pulsarlo: tres historias distintas que complementan el post con su misma información (una pregunta, un beneficio y el llamado a la acción), con el texto escrito por el director de arte y revisado; mejor cuando el post ya está aprobado. El modelo se escoge arriba y vale para este cliente. Los stickers se ponen desde el teléfono."
          : "Primero añade una imagen al post: las historias se preparan a partir de ella."}
      </p>
    </section>
  );
}
