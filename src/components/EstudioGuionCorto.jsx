import Icon from "./Icon";
import { NOMBRE_TRAMO } from "../lib/videoCorto";
import { CopyButton } from "./calendario/primitivas";

/**
 * El guion de un video corto (8 o 10 s según el modelo): gancho, beneficio y cierre en una sola toma. La IA
 * lo escribe; la persona lo mira y lo usa como pedido. Lo que va en edición (texto largo, logo) se dice aparte.
 */
export default function GuionCorto({ segundos, escribiendo, resultado, onEscribir, onUsar, onDescartar }) {
  const g = resultado?.guion;
  return (
    <div className="est-guion">
      <div className="est-acciones-idea">
        <button type="button" className="btn btn-secondary btn-sm" disabled={escribiendo} onClick={onEscribir}>
          <Icon name="video" size={14} /> {escribiendo ? "Escribiendo el guion…" : `Guion de ${segundos} s con IA`}
        </button>
        <p className="hint" style={{ margin: 0 }}>Gancho, beneficio y cierre en una sola toma. El texto largo y el logo van en edición.</p>
      </div>
      {g && (
        <div className="est-guion-tarjeta">
          {g.escena && <p><strong>Escena:</strong> {g.escena}</p>}
          <ol className="est-guion-tramos">
            {g.tramos.map((t) => <li key={t.clave}><strong>{t.desde}–{t.hasta} s · {NOMBRE_TRAMO[t.clave]}:</strong> {t.accion}</li>)}
          </ol>
          {g.camara && <p><strong>Cámara:</strong> {g.camara}</p>}
          <p><strong>Texto en pantalla:</strong> {g.textoPantalla ? `«${g.textoPantalla}»` : "ninguno"}</p>
          {g.textoEdicion && <p><strong>Para edición (CapCut o Canva):</strong> {g.textoEdicion}</p>}
          {g.sonido && <p><strong>Sonido:</strong> {g.sonido}</p>}
          {g.descripcion && (
            <div className="est-guion-desc">
              <p><strong>Descripción del post:</strong></p>
              <p className="est-guion-caption">{g.descripcion}</p>
              <CopyButton text={g.descripcion} describes="la descripción" />
            </div>
          )}
          <div className="est-acciones-idea">
            <button type="button" className="btn btn-primary btn-sm" onClick={onUsar}><Icon name="check" size={14} /> Usar como pedido</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDescartar}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}

