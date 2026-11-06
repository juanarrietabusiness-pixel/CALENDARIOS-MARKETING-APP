// ============================================================
// Qué aprueba el cliente, y en qué quedó
//
// `QueAprueba` va en la pestaña Idea: se elige si al cliente se le pide la
// idea o la pieza final (sin elegir, pieza si ya hay archivo). Y debajo,
// `EstadoAprobacion` dice en qué quedó y qué toca:
//
//   · idea aprobada          → falta producir; pedir la aprobación de la pieza
//   · idea aprobada que ya tiene su pieza → «El cliente vio la pieza: contarla
//                              como aprobada» (o mandársela)
//   · pieza aprobada         → lista para programar (el paso final es tuyo)
//   · pieza aprobada y luego retocada → aviso, y reenviar si hace falta
//
// La regla vive en lib/aprobacion.js; aquí sólo se pinta. Lo que escoge una
// PERSONA en «¿Qué aprueba el cliente?» lleva su marca (`elegirAprobacion`):
// es lo único que se respeta cuando la publicación ya tiene archivo.
// ============================================================

import { useId, useRef, useState } from "react";
import Icon from "../Icon";
import {
  TIPOS_APROBACION, tipoAprobacion, porProducir, avisoCambios, pedirAprobacion, elegirAprobacion, aprobacionAutomatica,
  contadaComoPieza,
} from "../../lib/aprobacion";
import { mediosDe } from "../../lib/publicacion";
import { contarComoPieza } from "../../lib/db";
import { CambiosPedidos } from "./cambiosCliente";

const ahora = () => new Date().toISOString();

/**
 * El cliente aprobó la publicación cuando era una IDEA y ya tiene su pieza (la marca «idea» del sistema no se iba con
 * el archivo: lo de antes del arreglo). Si la vio así, se cuenta como pieza aprobada en el servidor (pasa a «por
 * programar»; no se programa sola); si no, se le manda.
 */
function IdeaAprobadaConPieza({ post, setForm, calId }) {
  const caja = useRef(null);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState("");

  async function contar() {
    if (ocupado) return;
    if (!calId) { setFallo("No se sabe de qué calendario es: cierra la publicación y vuelve a abrirla."); return; }
    setOcupado(true);
    setFallo("");
    // El aviso desaparece al contarla y el botón pulsado con él: sin esto el foco caería al <body> y el panel (un
    // diálogo) dejaría de oír Escape y Tab. Va al aviso nuevo, que ocupa el mismo sitio.
    const contenedor = caja.current?.parentElement ?? null;
    try {
      const r = await contarComoPieza(calId, post.id);
      setForm((p) => contadaComoPieza(p, { huella: r?.huella ?? null, timestamp: r?.updated_at ?? null }));
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        contenedor?.querySelector?.(".aprobacion-estado")?.focus?.();
      });
    } catch (e) {
      setFallo(e?.message || "No se pudo contar como aprobada. Inténtalo otra vez.");
      setOcupado(false);
    }
  }

  return (
    <div ref={caja} className="notice notice-warn aprobacion-estado" role="status">
      <p><Icon name="alert" size={16} /> <strong>El cliente aprobó esta publicación cuando era una idea, pero ya tiene su pieza.</strong></p>
      <p className="hint">Si la vio así, cuéntala como aprobada; si no, mándasela.</p>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        {/* `aria-disabled` y no `disabled`: un botón que se desactiva con el foco encima lo suelta al <body>. */}
        <button type="button" className="btn btn-primary btn-sm" aria-disabled={ocupado || undefined} aria-busy={ocupado || undefined} onClick={contar}>
          <Icon name="check" size={14} /> {ocupado ? "Contándola como aprobada…" : "El cliente vio la pieza: contarla como aprobada"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((p) => pedirAprobacion(p, ahora(), "pieza"))}>
          <Icon name="send" size={14} /> Pedir aprobación de la pieza
        </button>
      </div>
      {fallo && <p role="alert" className="hint" style={{ color: "var(--danger)" }}>{fallo}</p>}
    </div>
  );
}

export function EstadoAprobacion({ post, setForm, calId = null }) {
  if (post.status === "published") return null;

  if (porProducir(post)) {
    if (mediosDe(post).length > 0) return <IdeaAprobadaConPieza post={post} setForm={setForm} calId={calId} />;
    return (
      <div className="notice notice-warn aprobacion-estado" role="status">
        <p><Icon name="bulb" size={16} /> <strong>El cliente aprobó la idea.</strong> Falta producir la pieza.</p>
        <p className="hint">Pon la imagen o el video en la pestaña «Pieza».</p>
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
      <p className="notice notice-ok aprobacion-estado" role="status" tabIndex={-1}>
        <Icon name="check" size={16} /> El cliente aprobó la pieza final: lista para programar.
      </p>
    );
  }
  return null;
}

export function QueAprueba({ post, setForm, calId = null }) {
  const ids = useId();
  const tipo = tipoAprobacion(post);
  return (
    <div className="que-aprueba">
      <span className="label" id={`${ids}-que`}>¿Qué aprueba el cliente?</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`${ids}-que`}>
        {Object.entries(TIPOS_APROBACION).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={tipo === k} className={`segmented-btn ${tipo === k ? "active" : ""}`} onClick={() => setForm((p) => elegirAprobacion(p, k))}>
            <Icon name={k === "idea" ? "bulb" : "image"} size={14} /> {t.nombre}
          </button>
        ))}
      </div>
      <p className="hint">{TIPOS_APROBACION[tipo].ayuda}{aprobacionAutomatica(post) && " (Elegido solo: cámbialo si hace falta.)"}</p>
      <EstadoAprobacion post={post} setForm={setForm} calId={calId} />
      <CambiosPedidos post={post} />
    </div>
  );
}
