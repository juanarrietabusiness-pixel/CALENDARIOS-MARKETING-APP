// ============================================================
// «¿Cuándo sale?»: la única pregunta para publicar
//
// Antes había tres caminos que parecían cosas distintas y eran la misma
// decisión: «Programar · fecha», «Publicar ahora» (los dos meten la
// publicación en la cola) y una casilla aparte, «la publico yo». El día no
// se podía cambiar. Ahora:
//
//   · Ahora        → «Publicar ahora»
//   · Programar    → día y hora; cambiar el día MUEVE la publicación en el
//                    calendario → «Programar para vie 3 · 9:00 a. m.»
//   · La publico yo→ la nota de qué poner a mano → «Guardar para publicar a mano»
//
// Un solo botón principal, que dice lo que va a pasar. Una vez programada,
// en su lugar una tarjeta de estado —«Programada para… · Cambiar ·
// Cancelar»—: así no quedan botones que inviten a programar dos veces.
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import HoraSugerida from "./horaSugerida";
import { TimePicker } from "./primitivas";
import { REDES, momentoPublicacion, piezasDe } from "../../lib/publicacion";
import { colaDe, clavePieza, fechaHora, TEXTO_ESTADO } from "../../lib/cola";
import { navegar } from "../../lib/rutas";

const MODOS = [["ahora", "Ahora", "send"], ["programar", "Programar", "clock"], ["mano", "La publico yo", "photo"]];

const irAIntegraciones = (e) => {
  e.preventDefault();
  navegar("/ajustes#integraciones");
};

export default function CuandoSale({
  post, sf, day, clientId, filas = [], estadoRedes, errores = [], enlaceAMano = null,
  onPublicar, onCancelar, onReintentar,
}) {
  const ids = useId();
  const [modo, setModo] = useState(post.asistida ? "mano" : "programar");
  const [fecha, setFecha] = useState(day.date);
  const [cambiando, setCambiando] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [mensaje, setMensaje] = useState(null);
  useEffect(() => { setFecha(day.date); }, [day.date]);

  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : ["instagram"];
  const cola = colaDe(filas, post.id);
  const filasCola = Object.values(cola);
  const vivas = filasCola.filter((f) => ["programada", "procesando", "publicada"].includes(f.estado));
  const fallidas = filasCola.filter((f) => f.estado === "error");
  const pendientes = [...new Set(piezasDe(post, redes).filter((p) => {
    const f = cola[clavePieza(p.red, p.variante)];
    return !f || f.estado === "error";
  }).map((p) => p.red))];

  const conMeta = redes.some((r) => r === "instagram" || r === "facebook");
  const sinCuenta = redes.filter((r) => !(estadoRedes?.cuentas ?? []).some((c) => c.red === r && c.clientId === clientId));
  const bloqueo = !estadoRedes ? "" : conMeta && !estadoRedes.meta?.conectado ? "meta" : sinCuenta.length ? "cuenta" : "";

  const mismoMes = fecha.slice(0, 7) === day.date.slice(0, 7);
  const cuando = momentoPublicacion(fecha, post.publishTime);
  const yaPaso = cuando && Date.parse(cuando) < Date.now();

  const hacer = async (clave, accion, ok) => {
    setTrabajando(clave);
    setMensaje(null);
    try {
      await accion();
      if (ok) setMensaje({ tipo: "ok", texto: ok });
      setCambiando(false);
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
    setTrabajando("");
  };

  const confirmar = () => {
    if (modo === "mano") {
      sf("asistida", true);
      // Lo que estuviera en la cola ya no debe salir solo.
      const programadas = vivas.filter((f) => f.estado === "programada");
      return hacer("mano", async () => { for (const f of programadas) await onCancelar(f.id); },
        "Guardada para publicarla a mano: sale en Mi día y en Programación a su hora.");
    }
    if (modo === "ahora") {
      if (!window.confirm(`¿Publicar ahora en ${pendientes.map((r) => REDES[r].nombre).join(" y ")}?`)) return undefined;
      return hacer("ahora", () => onPublicar({ ahora: true, redes: pendientes, cambios: { asistida: false } }), "Publicando: en unos segundos sale.");
    }
    return hacer("programar", () => onPublicar({ ahora: false, redes: pendientes, fecha, cambios: { asistida: false } }), `Programada para ${fechaHora(cuando)}.`);
  };

  const etiqueta = modo === "ahora" ? "Publicar ahora"
    : modo === "mano" ? "Guardar para publicar a mano"
      : cuando ? `Programar para ${fechaHora(cuando)}` : "Programar";
  const deshabilitado = !!trabajando || (modo !== "mano" && (!!bloqueo || !estadoRedes || errores.length > 0 || !pendientes.length))
    || (modo === "programar" && (!mismoMes || !cuando || yaPaso));

  // Ya en la cola (o publicada): la tarjeta de estado en vez del selector.
  const tarjeta = vivas.length > 0 && !cambiando && !post.asistida;
  const todasPublicadas = vivas.length > 0 && vivas.every((f) => f.estado === "publicada");
  const proxima = vivas.filter((f) => f.estado !== "publicada").map((f) => f.programadaPara).sort()[0];

  return (
    <div className="cuando-sale">
      {tarjeta ? (
        <div className="cuando-tarjeta" data-estado={todasPublicadas ? "publicada" : "programada"}>
          <p className="cuando-tarjeta-titulo">
            <Icon name={todasPublicadas ? "check" : "clock"} size={18} />
            {todasPublicadas ? "Publicada" : vivas.some((f) => f.estado === "procesando") ? "Publicándose…" : `Programada para ${fechaHora(proxima)}`}
          </p>
          <ul className="cuando-redes">
            {vivas.map((f) => (
              <li key={f.id}>
                <Icon name={REDES[f.red]?.icono ?? "globe"} size={13} /> {REDES[f.red]?.nombre ?? f.red}
                {f.variante === "historia" && " (historia)"} · {TEXTO_ESTADO[f.estado]}
                {f.estado === "programada" && f.variante === "historia" && ` · ${fechaHora(f.programadaPara)}`}
                {f.enlace && <a href={f.enlace} target="_blank" rel="noreferrer"> Ver</a>}
                {f.aviso && <span className="cuando-aviso"> — {f.aviso}</span>}
              </li>
            ))}
          </ul>
          {!todasPublicadas && (
            <div className="cuando-botones">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setModo("programar"); setCambiando(true); }}>
                <Icon name="pencil" size={14} /> Cambiar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!!trabajando}
                onClick={() => {
                  if (!window.confirm("¿Sacarla de la cola? No saldrá.")) return;
                  void hacer("cancelar", async () => { for (const f of vivas.filter((x) => x.estado === "programada")) await onCancelar(f.id); }, "Se sacó de la cola.");
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : (
        <fieldset className="cuando-elegir">
          <legend className="label">¿Cuándo sale?</legend>
          <div className="segmented" role="radiogroup" aria-label="Cuándo sale">
            {MODOS.map(([k, nombre, icono]) => (
              <button key={k} type="button" role="radio" aria-checked={modo === k} className={`segmented-btn ${modo === k ? "active" : ""}`} onClick={() => setModo(k)}>
                <Icon name={icono} size={14} /> {nombre}
              </button>
            ))}
          </div>

          {modo === "programar" && (
            <div className="cuando-fecha">
              <SelectorFecha value={fecha} onChange={(f) => f && setFecha(f)} etiqueta="Día de publicación" vacio="Sin día" prefijo="El" />
              <label className="sr-only" htmlFor={`${ids}-hora`}>Hora de publicación</label>
              <TimePicker id={`${ids}-hora`} value={post.publishTime || ""} onChange={(v) => sf("publishTime", v)} />
              <HoraSugerida clientId={clientId} fecha={fecha} hora={post.publishTime || ""} onUsar={(h) => sf("publishTime", h)} />
            </div>
          )}
          {modo === "programar" && !mismoMes && (
            <p className="hint" role="alert">Ese día es de otro mes: para otro mes, créala en ese calendario (o con «Subir»).</p>
          )}
          {modo === "programar" && mismoMes && fecha !== day.date && (
            <p className="hint">Al programarla se mueve al {Number(fecha.slice(8))} en el calendario.</p>
          )}
          {modo === "programar" && yaPaso && <p className="hint">Esa hora ya pasó: cámbiala o elige «Ahora».</p>}
          {modo === "programar" && !post.publishTime && <p className="hint">Sin hora, sale a las 9:00 (Panamá).</p>}
          {modo === "mano" && (
            <>
              <p className="hint" style={{ margin: 0 }}>
                Para la música de Instagram, los stickers o las encuestas, que la API no deja poner. Te sale en Mi día y en Programación
                a su hora, con el archivo para guardar y el texto para copiar.
              </p>
              <label className="sr-only" htmlFor={`${ids}-nota`}>Qué hay que poner a mano</label>
              <input id={`${ids}-nota`} className="input" maxLength={300} value={post.notaAsistida || ""} onChange={(e) => sf("notaAsistida", e.target.value)} placeholder="Ej.: canción «…» desde el minuto 0:15; sticker de encuesta" />
              {post.asistida && enlaceAMano && (
                <a className="btn btn-secondary btn-sm" href={enlaceAMano} onClick={(e) => { e.preventDefault(); navegar(enlaceAMano); }}>
                  <Icon name="photo" size={14} /> Abrir la pantalla para publicarla
                </a>
              )}
            </>
          )}

          {modo !== "mano" && bloqueo === "meta" && (
            <p className="hint">Para publicar desde aquí, conecta Meta en <a href="/ajustes#integraciones" onClick={irAIntegraciones}>Ajustes → Integraciones</a>.</p>
          )}
          {modo !== "mano" && bloqueo === "cuenta" && (
            <p className="hint">
              Este cliente no tiene cuenta de {sinCuenta.map((r) => REDES[r].nombre).join(" ni de ")} asignada. Asígnala en{" "}
              <a href="/ajustes#integraciones" onClick={irAIntegraciones}>Ajustes → Integraciones</a>.
            </p>
          )}
          {modo !== "mano" && errores.length > 0 && <p className="hint">Arregla lo que falta (arriba) para poder publicarla.</p>}

          <div className="cuando-botones">
            <button type="button" className="btn btn-primary cuando-principal" disabled={deshabilitado} onClick={confirmar}>
              <Icon name={MODOS.find(([k]) => k === modo)[2]} size={16} />
              {trabajando ? "Un momento…" : etiqueta}
            </button>
            {cambiando && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCambiando(false)}>No cambiar</button>}
          </div>
        </fieldset>
      )}

      {fallidas.length > 0 && (
        <ul className="cola-lista" aria-label="Lo que no se publicó">
          {fallidas.map((f) => (
            <li key={f.id} className="cola-fila" data-estado="error">
              <span className="cola-red"><Icon name={REDES[f.red]?.icono ?? "globe"} size={14} /> {REDES[f.red]?.nombre ?? f.red}{f.variante === "historia" && " (historia)"}</span>
              <span className="cola-estado">No se publicó</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando} onClick={() => hacer(`r-${f.id}`, () => onReintentar(f.id), "Reintentando…")}>
                <Icon name="refresh" size={14} /> Reintentar
              </button>
              {f.error && <p className="cola-detalle" role="alert">{f.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <div role="status" aria-live="polite">
        {mensaje?.tipo === "ok" && <p className="notice notice-ok">{mensaje.texto}</p>}
      </div>
      {mensaje?.tipo === "error" && <p role="alert" className="notice notice-error">{mensaje.texto}</p>}
    </div>
  );
}
