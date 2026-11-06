import "./PonerEnPublicacion.css";
import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { publicacionesParaPoner, ponerEnPublicacion, direccionDePublicacion, modoDePoner } from "../lib/ponerPiezas";
import { fechaEnZona } from "../lib/agenda";
import { navegar } from "../lib/rutas";

// ============================================================
// «Poner en una publicación…»: lo hecho en el Estudio, a un post de cualquier mes del cliente (lazy)
//
// Desde el visor (una pieza), el visor de un carrusel (entero, en su orden) y la galería con varias escogidas. Se
// escoge la publicación y, si ya tiene archivos, si se reemplazan (lo de antes sigue en la galería) o se añaden al
// final; UNA imagen a un reel con su video va, por defecto, «Como portada del video» (un reel no lleva imágenes). Lo
// pone el servidor (lib/ponerPiezas.js): no crea ni cobra nada y apunta el uso de cada pieza.
// ============================================================

/**
 * @param cliente     el cliente (con sus meses: `calendars`).
 * @param archivoIds  las piezas sueltas, en su orden; o `carpetaId` para un carrusel (o reel) entero.
 * @param descripcion qué se pone, en palabras («esta imagen», «el carrusel «Sofá» (5 láminas)»).
 * @param tipo        «imagen» | «video» | «carrusel»: ordena primero las publicaciones donde encaja.
 */
export default function PonerEnPublicacion({ cliente, archivoIds = [], carpetaId = "", descripcion = "esta pieza", tipo = "imagen", onCerrar, onPuesto = null }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const [buscar, setBuscar] = useState("");
  const [elegida, setElegida] = useState(null);
  // null: el de por defecto (`modoDePoner`); cambia al escoger otra publicación.
  const [modo, setModo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(null);
  const hoy = fechaEnZona();
  const lista = useMemo(() => publicacionesParaPoner(cliente?.calendars ?? [], { hoy, tipo, buscar }), [cliente?.calendars, hoy, tipo, buscar]);
  const sel = lista.find((p) => p.postId === elegida) ?? null;
  const unaImagen = !carpetaId && archivoIds.length === 1 && tipo === "imagen";
  const portadaPosible = Boolean(unaImagen && sel?.llevaPortada);
  const pedido = modoDePoner({ unaImagen, llevaPortada: Boolean(sel?.llevaPortada), medios: sel?.medios ?? 0, escogido: modo });
  const efectivo = pedido.como === "portada" ? "portada" : pedido.modo;

  const poner = async () => {
    if (!sel || ocupado) return;
    setOcupado(true);
    setError("");
    try {
      const r = await ponerEnPublicacion(cliente.dbId || cliente.id, {
        postId: sel.postId, calendarId: sel.calendarId, ...pedido,
        ...(carpetaId ? { carpetaId } : { archivoIds }),
      });
      setHecho({ ...r, etiqueta: sel.etiqueta });
      onPuesto?.(r);
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog poner-publicacion" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="poner-publicacion-cabecera">
          <h3 id={`${id}-t`}>Poner en una publicación</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        {hecho ? (
          <div role="status" className="poner-publicacion-hecho">
            <p><Icon name="checkCircle" size={16} /> {hecho.portada ? "Puesta como portada del video en " : "Puesto en "}<strong>{hecho.etiqueta}</strong>{hecho.formato === "carrusel" && !hecho.portada ? " (ahora es un carrusel)" : ""}. Queda lista para revisar y programar.</p>
            <div className="poner-publicacion-botones">
              <button type="button" className="btn btn-primary" onClick={() => { onCerrar(); navegar(direccionDePublicacion(cliente.id, hecho.calendarId, hecho.postId)); }}>
                <Icon name="calendar" size={16} /> Abrir la publicación
              </button>
              <button type="button" className="btn btn-secondary" onClick={onCerrar}>Seguir en el Estudio</button>
            </div>
          </div>
        ) : (
          <>
            <p className="hint" style={{ margin: 0 }}>Escoge dónde va {descripcion}. No crea ni cobra nada.</p>
            <div className="field">
              <label className="label" htmlFor={`${id}-b`}>Buscar</label>
              <input id={`${id}-b`} className="input" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Una fecha, el formato o el título (también lo pasado)" />
            </div>
            {lista.length ? (
              <fieldset className="poner-publicacion-lista" aria-describedby={`${id}-n`}>
                <legend className="sr-only">Publicaciones del cliente</legend>
                {lista.map((p) => (
                  <label key={`${p.calendarId}-${p.postId}`} className="poner-publicacion-opcion" data-elegida={p.postId === elegida || undefined}>
                    <input type="radio" name={`${id}-p`} value={p.postId} checked={p.postId === elegida} onChange={() => { setElegida(p.postId); setModo(null); }} />
                    <span>{p.etiqueta}</span>
                    {p.medios > 0 && <small className="hint">ya tiene {p.medios} archivo{p.medios === 1 ? "" : "s"}</small>}
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="hint" id={`${id}-n`}>{buscar ? "Ninguna publicación coincide." : "Este cliente no tiene publicaciones desde la semana pasada: créala en el calendario o busca una fecha."}</p>
            )}
            {sel?.medios > 0 && (
              <fieldset className="poner-publicacion-modo">
                <legend className="label">{portadaPosible ? "Ya tiene su video" : "Ya tiene archivos"}</legend>
                {/* Un reel es UN video: la imagen que se le pone es su portada (su cover en Instagram), no un archivo más. */}
                {portadaPosible && (
                  <label><input type="radio" name={`${id}-m`} checked={efectivo === "portada"} onChange={() => setModo("portada")} /> Como portada del video</label>
                )}
                <label><input type="radio" name={`${id}-m`} checked={efectivo === "reemplazar"} onChange={() => setModo("reemplazar")} /> {portadaPosible ? "Reemplazar el video por la imagen" : "Reemplazarlos (lo de antes sigue en la galería)"}</label>
                {!(portadaPosible && sel.formato === "reel") && (
                  <label><input type="radio" name={`${id}-m`} checked={efectivo === "anadir"} onChange={() => setModo("anadir")} /> Añadirlo al final</label>
                )}
              </fieldset>
            )}
            {error && <p role="alert" className="cerebro-error">{error}</p>}
            <div className="poner-publicacion-botones">
              <button type="button" className="btn btn-primary" disabled={!sel || ocupado} onClick={poner} aria-busy={ocupado || undefined}>
                <Icon name="send" size={16} /> {ocupado ? "Poniendo…" : "Poner aquí"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
