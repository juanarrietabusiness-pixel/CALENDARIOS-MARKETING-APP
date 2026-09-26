// ============================================================
// Qué aprueba el cliente, y en qué quedó
//
// `QueAprueba` va en la pestaña Idea: se elige si al cliente se le pide la
// idea o la pieza final (sin elegir, pieza si ya hay archivo). Y debajo,
// `EstadoAprobacion` dice en qué quedó y qué toca:
//
//   · idea aprobada          → falta producir; pedir la aprobación de la pieza
//   · pieza aprobada         → lista para programar (el paso final es tuyo)
//   · pieza aprobada y luego retocada → aviso, y reenviar si hace falta
//
// La regla vive en lib/aprobacion.js; aquí sólo se pinta.
// ============================================================

import { useId } from "react";
import Icon from "../Icon";
import { TIPOS_APROBACION, tipoAprobacion, porProducir, avisoCambios, pedirAprobacion } from "../../lib/aprobacion";
import { mediosDe } from "../../lib/publicacion";

export function EstadoAprobacion({ post, setForm }) {
  const ahora = () => new Date().toISOString();
  if (post.status === "published") return null;

  if (porProducir(post)) {
    const conArchivo = mediosDe(post).length > 0;
    return (
      <div className="notice notice-warn aprobacion-estado" role="status">
        <p><Icon name="bulb" size={16} /> <strong>El cliente aprobó la idea.</strong> Falta producir la pieza.</p>
        {conArchivo ? (
          <>
            <p className="hint">Ya tiene archivo: mándale la pieza para que la vea como saldrá, o prográmala tú si no hace falta.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((p) => pedirAprobacion(p, ahora(), "pieza"))}>
              <Icon name="send" size={14} /> Pedir aprobación de la pieza
            </button>
          </>
        ) : (
          <p className="hint">Sube la imagen o el video en «Subir».</p>
        )}
      </div>
    );
  }

  if (post.status === "approved" && post.aprobadaComo === "pieza") {
    const aviso = avisoCambios(post);
    return aviso ? (
      <div className="notice notice-warn aprobacion-estado" role="status">
        <p><Icon name="alert" size={16} /> {aviso}</p>
        <p className="hint">Puedes programarla igual o volver a pedirle que la apruebe.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((p) => pedirAprobacion(p, ahora(), "pieza"))}>
          <Icon name="send" size={14} /> Reenviar al cliente
        </button>
      </div>
    ) : (
      <p className="notice notice-ok aprobacion-estado" role="status">
        <Icon name="check" size={16} /> El cliente aprobó la pieza final: lista para programar.
      </p>
    );
  }
  return null;
}

export function QueAprueba({ post, sf, setForm }) {
  const ids = useId();
  const tipo = tipoAprobacion(post);
  return (
    <div className="que-aprueba">
      <span className="label" id={`${ids}-que`}>¿Qué aprueba el cliente?</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`${ids}-que`}>
        {Object.entries(TIPOS_APROBACION).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={tipo === k} className={`segmented-btn ${tipo === k ? "active" : ""}`} onClick={() => sf("aprobacion", k)}>
            <Icon name={k === "idea" ? "bulb" : "image"} size={14} /> {t.nombre}
          </button>
        ))}
      </div>
      <p className="hint">{TIPOS_APROBACION[tipo].ayuda}{!post.aprobacion && " (Elegido solo: cámbialo si hace falta.)"}</p>
      <EstadoAprobacion post={post} setForm={setForm} />
    </div>
  );
}
