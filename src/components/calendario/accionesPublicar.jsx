// ============================================================
// Publicar y programar desde el panel de una publicación
//
// Lo que ya hay en la cola para esta publicación (por red, con su estado
// y qué hacer), y los dos botones: «Programar» a su día y hora, o
// «Publicar ahora». Si falta algo para poder hacerlo —Meta sin conectar,
// una red sin cuenta asignada al cliente— se dice aquí, con el camino.
//
// El trabajo (convertir a JPEG, guardar, llamar a la API) lo hace
// CalendarView: esto sólo pinta y avisa.
// ============================================================

import { useEffect, useState } from "react";
import Icon from "../Icon";
import { REDES, revisarPublicacion, momentoPublicacion, piezasDe } from "../../lib/publicacion";
import { colaDe, clavePieza, fechaHora, TEXTO_ESTADO } from "../../lib/cola";
import { navegar } from "../../lib/rutas";

const irAIntegraciones = (e) => {
  e.preventDefault();
  navegar("/ajustes#integraciones");
};

export default function AccionesPublicar({ post, fecha, filas, estadoRedes, clientId, onPublicar, onCancelar, onReintentar }) {
  const [trabajando, setTrabajando] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : ["instagram"];
  const cola = colaDe(filas, post.id);
  const { errores } = revisarPublicacion(post, redes, { navegador: true });

  const meta = estadoRedes?.meta;
  const conMeta = redes.some((r) => r === "instagram" || r === "facebook");
  const sinCuenta = redes.filter((r) => !(estadoRedes?.cuentas ?? []).some((c) => c.red === r && c.clientId === clientId));
  // Lo que falta por salir: cada red y, si la hay, su historia. Se manda
  // la lista de redes; el servidor programa las piezas que falten.
  const piezasPendientes = piezasDe(post, redes).filter((p) => {
    const f = cola[clavePieza(p.red, p.variante)];
    return !f || f.estado === "error";
  });
  const pendientes = [...new Set(piezasPendientes.map((p) => p.red))];
  const cuando = momentoPublicacion(fecha, post.publishTime);
  const yaPaso = cuando && Date.parse(cuando) < Date.now();

  // Cuando la cola cambia (el servidor publicó o falló), el estado de
  // cada red ya lo dice: el «Publicando…» de antes dejaría de ser verdad.
  const firmaCola = Object.values(cola).map((f) => `${f.id}:${f.estado}`).join();
  useEffect(() => { setMensaje((m) => (m?.tipo === "ok" ? null : m)); }, [firmaCola]);

  const hacer = async (clave, accion, ok) => {
    setTrabajando(clave);
    setMensaje(null);
    try {
      await accion();
      if (ok) setMensaje({ tipo: "ok", texto: ok });
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
    setTrabajando("");
  };

  let bloqueo = "";
  if (!estadoRedes) bloqueo = "";
  else if (conMeta && !meta?.conectado) bloqueo = "meta";
  else if (sinCuenta.length) bloqueo = "cuenta";

  return (
    <div className="acciones-publicar">
      {Object.keys(cola).length > 0 && (
        <ul className="cola-lista" aria-label="Estado en cada red">
          {Object.values(cola).map((f) => (
            <li key={f.id} className="cola-fila" data-estado={f.estado}>
              <span className="cola-red">
                <Icon name={REDES[f.red]?.icono ?? "globe"} size={14} /> {REDES[f.red]?.nombre ?? f.red}
                {f.variante === "historia" && <span className="cola-variante">historia</span>}
              </span>
              <span className="cola-estado">
                {TEXTO_ESTADO[f.estado] ?? f.estado}
                {f.estado === "programada" && <> · {f.ahoraMismo ? "en un momento" : fechaHora(f.programadaPara)}</>}
                {f.estado === "publicada" && f.publicadaAt && <> · {fechaHora(f.publicadaAt)}</>}
              </span>
              {f.estado === "publicada" && f.enlace && (
                <a className="btn btn-ghost btn-sm" href={f.enlace} target="_blank" rel="noreferrer">
                  Ver <Icon name="link" size={14} />
                </a>
              )}
              {(f.estado === "programada" || (f.estado === "procesando" && !f.enlace)) && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                  onClick={() => hacer(`c-${f.id}`, () => onCancelar(f.id), "Se sacó de la cola.")}>
                  Cancelar
                </button>
              )}
              {f.estado === "error" && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                  onClick={() => hacer(`r-${f.id}`, () => onReintentar(f.id), "Reintentando…")}>
                  <Icon name="refresh" size={14} /> Reintentar
                </button>
              )}
              {(f.error && f.estado !== "cancelada") && <p className="cola-detalle" role={f.estado === "error" ? "alert" : undefined}>{f.error}</p>}
              {f.aviso && <p className="cola-detalle">{f.aviso}</p>}
            </li>
          ))}
        </ul>
      )}

      {bloqueo === "meta" && (
        <p className="hint">
          Para publicar desde aquí, conecta Meta en{" "}
          <a href="/ajustes#integraciones" onClick={irAIntegraciones}>Ajustes → Integraciones</a>.
        </p>
      )}
      {bloqueo === "cuenta" && (
        <p className="hint">
          Este cliente no tiene cuenta de {sinCuenta.map((r) => REDES[r].nombre).join(" ni de ")} asignada. Asígnala en{" "}
          <a href="/ajustes#integraciones" onClick={irAIntegraciones}>Ajustes → Integraciones</a>.
        </p>
      )}

      {!bloqueo && estadoRedes && pendientes.length > 0 && (
        <div className="acciones-publicar-botones">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!!trabajando || errores.length > 0 || !cuando || yaPaso}
            title={yaPaso ? "Esa hora ya pasó: cámbiala o publica ahora." : undefined}
            onClick={() => hacer("programar", () => onPublicar({ ahora: false, redes: pendientes }), `Programada para ${fechaHora(cuando)}.`)}
          >
            <Icon name="clock" size={16} /> {trabajando === "programar" ? "Programando…" : cuando ? `Programar · ${fechaHora(cuando)}` : "Programar"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!!trabajando || errores.length > 0}
            onClick={() => {
              if (!window.confirm(`¿Publicar ahora en ${pendientes.map((r) => REDES[r].nombre).join(" y ")}?`)) return;
              void hacer("ahora", () => onPublicar({ ahora: true, redes: pendientes }), "Publicando: en unos segundos sale.");
            }}
          >
            <Icon name="send" size={16} /> {trabajando === "ahora" ? "Enviando…" : "Publicar ahora"}
          </button>
        </div>
      )}
      {!post.publishTime && !bloqueo && pendientes.length > 0 && (
        <p className="hint">Sin hora, se programa a las 9:00 (Panamá).</p>
      )}

      <div role="status" aria-live="polite">
        {mensaje?.tipo === "ok" && <p className="notice notice-ok">{mensaje.texto}</p>}
      </div>
      {mensaje?.tipo === "error" && <p role="alert" className="notice notice-error">{mensaje.texto}</p>}
    </div>
  );
}
