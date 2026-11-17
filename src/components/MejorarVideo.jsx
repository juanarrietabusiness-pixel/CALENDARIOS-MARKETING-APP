import "./MejorarVideo.css";
import { Suspense, lazy, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { mejorarVideo, seguirEncargo, muestraDeColor } from "../lib/encargosApi";
import { textoDePaso } from "../lib/encargos";
import { LOOKS, ANGULOS, NOMBRE_MODO, MODOS_DE_MEJORAR, MIN_ANGULOS, MAX_ANGULOS, MAX_REFERENCIAS_MEJORA, ALARGAR, textoDeMejora } from "../lib/mejoraVideo";
import { COLORES } from "../lib/coloresVideo";

const GaleriaSelector = lazy(() => import("./GaleriaSelector"));
const PonerEnPublicacion = lazy(() => import("./PonerEnPublicacion"));

// ============================================================
// «Mejorar mi video» y «Varios ángulos de una toma» (lazy): sobre un video de la galería del cliente.
//
// Se escoge qué hacer, se pide el COSTO (el servidor lo calcula y contesta 409: un video pregunta siempre) y, con el
// sí, el servidor lo hace como un encargo (worker/lib/estudio/mejoraVideo.js) aunque se cierre esto: la campana avisa.
// Lo que sale lleva SIEMPRE el audio original y queda en la galería como versión del video.
// ============================================================

const DESCRIPCION = {
  color: "Cambia el color con un grade, sin IA: gratis, no toca la escena y vale para cualquier duración.",
  alargar: "Unos segundos más al final (o al principio) que siguen la misma escena. Para que llegue a la duración que necesitas.",
  escalar: "El mismo video, ampliado y más nítido (Topaz). Cualquier duración, hasta 50 MB.",
  look: "Sólo cambia la luz y el color, con uno de nuestros looks. Hasta 30 s.",
  cambiar: "Cambia algo de la escena con tus palabras (y, si quieres, una foto del producto). Hasta 30 s.",
  angulos: `De ${MIN_ANGULOS} a ${MAX_ANGULOS} cámaras nuevas de la misma toma, montadas solas con tu audio. Hasta 30 s.`,
};

/**
 * @param clienteId  el cliente.
 * @param archivo    el video de la galería ({ id, src }) o, desde una publicación, `{ clave }` (su dirección /api/media/…).
 * @param cliente    para «Poner en una publicación…» (con sus meses).
 * @param onPoner    (archivo) => void: «Poner en esta publicación» desde la pestaña Pieza (sustituye el video).
 * @param onListo    (archivo) => void: salió (la galería lo vuelve a leer).
 */
export default function MejorarVideo({ clienteId, archivo, cliente = null, onCerrar, onPoner = null, onListo = null }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const [modo, setModo] = useState("color");
  const [color, setColor] = useState(COLORES[0].id);
  const [muestras, setMuestras] = useState({});
  const [segundos, setSegundos] = useState(6);
  const [hacia, setHacia] = useState("final");
  const [idea, setIdea] = useState("");
  const [factor, setFactor] = useState("2");
  const [look, setLook] = useState(LOOKS[0].id);
  const [instruccion, setInstruccion] = useState("");
  const [fotos, setFotos] = useState([]);
  const [angulos, setAngulos] = useState(["cerca", "lateral", "general"]);
  const [eligiendo, setEligiendo] = useState(false);
  const [poniendo, setPoniendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [costo, setCosto] = useState(null); // { costo, resumen, aviso }
  const [encargo, setEncargo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [puesto, setPuesto] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  // Las muestras de color: un cuadro del video con cada grade (gratis, por el Container), una vez, al abrir «Color».
  // Sin `muestras` en las dependencias: guardar la primera volvía a correr el efecto y su limpieza cortaba las demás.
  const pedidas = useRef(false);
  useEffect(() => {
    if (modo !== "color" || !clienteId || pedidas.current) return;
    pedidas.current = true;
    const base = archivo?.id ? { archivoId: archivo.id } : { clave: archivo?.clave ?? archivo?.src ?? "" };
    let sigue = true;
    (async () => {
      for (const c of [{ id: "" }, ...COLORES]) {
        try {
          const url = await muestraDeColor(clienteId, { ...base, color: c.id });
          if (!sigue) return;
          setMuestras((m) => ({ ...m, [c.id || "original"]: url }));
        } catch {
          if (sigue) setMuestras((m) => ({ ...m, error: true }));
          return;
        }
      }
    })();
    return () => { sigue = false; pedidas.current = false; };
  }, [modo, clienteId, archivo]);

  const cuerpo = () => ({
    ...(archivo?.id ? { archivoId: archivo.id } : { clave: archivo?.clave ?? archivo?.src ?? "" }),
    modo, factor, look, instruccion, angulos, referencias: fotos.map((f) => f.id), seguido: true,
    color, segundos, hacia, idea,
  });
  // Cambiar lo escogido deja el costo de antes sin valor.
  const cambiar = (fn) => (...args) => { setCosto(null); setError(""); fn(...args); };

  const pedirCosto = async () => {
    if (ocupado) return;
    setOcupado(true);
    setError("");
    try {
      // Sin `confirmado`, el servidor nunca crea nada que cueste: contesta 409 con el costo. Lo gratis (el color) se hace ya.
      const r = await mejorarVideo(clienteId, cuerpo());
      if (r?.encargo) { setOcupado(false); return seguir(r.encargo); }
    } catch (e) {
      if (e?.estado === 409 && e.datos?.codigo === "confirmar") setCosto({ costo: e.datos.costo, resumen: e.datos.resumen ?? e.message, aviso: e.datos.aviso ?? null });
      else setError(e.message);
    }
    setOcupado(false);
  };

  const confirmar = async () => {
    if (ocupado) return;
    setOcupado(true);
    setError("");
    try {
      const r = await mejorarVideo(clienteId, { ...cuerpo(), confirmado: true });
      await seguir(r.encargo);
    } catch (e) {
      if (vivo.current) setError(e.message);
    }
    if (vivo.current) setOcupado(false);
  };

  /** Sigue el encargo hasta que termina y enseña el resultado. */
  async function seguir(e0) {
    setOcupado(true);
    try {
      setEncargo(e0);
      const fin = await seguirEncargo({
        clienteId, id: e0.id, seguir: () => vivo.current,
        alCambio: (e, archivos) => {
          if (!vivo.current) return;
          setEncargo(e);
          const nuevo = e.mejora?.union?.archivoIds?.length ? archivos.get(e.mejora.union.archivoIds[0]) : null;
          const delModelo = e.pasos.map((p) => archivos.get(p.opciones?.[0]?.id)).find(Boolean);
          if (e.estado !== "en_marcha") setResultado(nuevo ?? delModelo ?? null);
        },
      });
      if (fin && vivo.current && fin.estado !== "fallido") onListo?.();
    } catch (e) {
      if (vivo.current) setError(e.message);
    }
    if (vivo.current) setOcupado(false);
  }

  const elegirFotos = (lista) => {
    setEligiendo(false);
    setCosto(null);
    setFotos(lista.filter((a) => a.tipo !== "video").slice(0, MAX_REFERENCIAS_MEJORA));
  };
  const alternarAngulo = cambiar((a) => setAngulos((l) => (l.includes(a) ? l.filter((x) => x !== a) : l.length >= MAX_ANGULOS ? l : [...l, a])));

  const enMarcha = encargo && encargo.estado === "en_marcha";
  const progreso = encargo ? [
    ...encargo.pasos.map((p) => `${p.titulo}: ${p.fase === "hecho" ? "listo" : p.fase === "fallido" ? (p.error || "no salió") : textoDePaso(p) || "en cola"}`),
    textoDeMejora(encargo.mejora),
  ].filter(Boolean) : [];
  const listo = encargo && encargo.estado !== "en_marcha";
  const puedePedir = modo !== "angulos" || (angulos.length >= MIN_ANGULOS && angulos.length <= MAX_ANGULOS);

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog mejorar-video" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="mejorar-video-cabecera">
          <h3 id={`${id}-t`}>Mejorar mi video</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>

        {!encargo && (
          <>
            {archivo?.src && <video className="mejorar-video-vista" src={archivo.src} muted playsInline controls preload="metadata" aria-label="El video que se mejora" />}
            <fieldset className="mejorar-video-modos">
              <legend className="label">¿Qué quieres hacer?</legend>
              {MODOS_DE_MEJORAR.map((m) => (
                <label key={m} className="mejorar-video-modo" data-elegido={modo === m || undefined}>
                  <input type="radio" name={`${id}-modo`} value={m} checked={modo === m} onChange={cambiar(() => setModo(m))} />
                  <span><strong>{NOMBRE_MODO[m]}</strong><small>{DESCRIPCION[m]}</small></span>
                </label>
              ))}
            </fieldset>

            {modo === "color" && (
              <fieldset className="mejorar-video-colores">
                <legend className="label">El color</legend>
                {muestras.error && <p className="hint" style={{ margin: 0, gridColumn: "1 / -1" }}>No se pudieron sacar las muestras; el color se aplica igual.</p>}
                {COLORES.map((c) => (
                  <label key={c.id} className="mejorar-video-color" data-elegido={color === c.id || undefined}>
                    <input type="radio" name={`${id}-color`} checked={color === c.id} onChange={cambiar(() => setColor(c.id))} className="sr-only" />
                    {muestras[c.id] ? <img src={muestras[c.id]} alt="" /> : <span className="mejorar-video-color-vacio" aria-hidden="true" />}
                    <strong>{c.nombre}</strong>
                    <small>{c.texto}</small>
                  </label>
                ))}
              </fieldset>
            )}

            {modo === "alargar" && (
              <>
                <fieldset className="mejorar-video-opciones">
                  <legend className="label">Cuánto más</legend>
                  {ALARGAR.map((s) => (
                    <label key={s}><input type="radio" name={`${id}-s`} checked={segundos === s} onChange={cambiar(() => setSegundos(s))} /> {s} s</label>
                  ))}
                </fieldset>
                <fieldset className="mejorar-video-opciones">
                  <legend className="label">Dónde</legend>
                  <label><input type="radio" name={`${id}-h`} checked={hacia === "final"} onChange={cambiar(() => setHacia("final"))} /> Al final (sigue desde el último cuadro)</label>
                  <label><input type="radio" name={`${id}-h`} checked={hacia === "inicio"} onChange={cambiar(() => setHacia("inicio"))} /> Al principio (termina en el primer cuadro)</label>
                </fieldset>
                <div className="field">
                  <label className="label" htmlFor={`${id}-idea`}>Qué pasa en lo nuevo (opcional)</label>
                  <input id={`${id}-idea`} className="input" maxLength={500} value={idea} onChange={(e) => cambiar(setIdea)(e.target.value)} placeholder="Ej.: la cámara se aleja despacio y se ve toda la habitación" />
                </div>
              </>
            )}

            {modo === "escalar" && (
              <fieldset className="mejorar-video-opciones">
                <legend className="label">Cuánto ampliarlo</legend>
                {[["2", "× 2"], ["4", "× 4 (cuesta el doble)"], ["1", "Igual de grande, sólo limpiar"]].map(([v, t]) => (
                  <label key={v}><input type="radio" name={`${id}-f`} checked={factor === v} onChange={cambiar(() => setFactor(v))} /> {t}</label>
                ))}
              </fieldset>
            )}

            {modo === "look" && (
              <fieldset className="mejorar-video-rejilla">
                <legend className="label">El look</legend>
                {LOOKS.map((l) => (
                  <label key={l.id} className="mejorar-video-ficha" data-elegido={look === l.id || undefined}>
                    <input type="radio" name={`${id}-look`} checked={look === l.id} onChange={cambiar(() => setLook(l.id))} />
                    <span><strong>{l.nombre}</strong><small>{l.texto}</small></span>
                  </label>
                ))}
              </fieldset>
            )}

            {modo === "cambiar" && (
              <>
                <div className="field">
                  <label className="label" htmlFor={`${id}-i`}>¿Qué cambio?</label>
                  <textarea id={`${id}-i`} className="input" rows={3} maxLength={600} value={instruccion} onChange={(e) => cambiar(setInstruccion)(e.target.value)}
                    placeholder="Ej.: que la taza sea la de la foto; cambia el fondo por una cocina luminosa." />
                </div>
                <div className="mejorar-video-fotos">
                  <span className="label">Fotos de referencia (opcional, hasta {MAX_REFERENCIAS_MEJORA})</span>
                  {fotos.length > 0 && (
                    <ul className="mejorar-video-chips">
                      {fotos.map((f) => (
                        <li key={f.id}>
                          <img src={f.src} alt="" />
                          <button type="button" className="btn-icon" aria-label="Quitar esta foto" onClick={cambiar(() => setFotos((l) => l.filter((x) => x.id !== f.id)))}><Icon name="close" size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEligiendo(true)}><Icon name="paperclip" size={14} /> {fotos.length ? "Cambiar las fotos" : "Escoger de la galería"}</button>
                </div>
              </>
            )}

            {modo === "angulos" && (
              <fieldset className="mejorar-video-rejilla" aria-describedby={`${id}-a`}>
                <legend className="label">Los ángulos ({angulos.length} de {MIN_ANGULOS} a {MAX_ANGULOS})</legend>
                {ANGULOS.map((a) => (
                  <label key={a.id} className="mejorar-video-ficha" data-elegido={angulos.includes(a.id) || undefined}>
                    <input type="checkbox" checked={angulos.includes(a.id)} onChange={() => alternarAngulo(a.id)} disabled={!angulos.includes(a.id) && angulos.length >= MAX_ANGULOS} />
                    <span><strong>{a.nombre}</strong><small>{a.texto}</small></span>
                  </label>
                ))}
                <p id={`${id}-a`} className="hint" style={{ margin: 0 }}>Si en el video alguien habla a cámara, en los ángulos nuevos la boca no coincidirá con la voz: va mejor con producto, ambiente o acción.</p>
              </fieldset>
            )}

            {costo ? (
              <div className="mejorar-video-costo" role="alertdialog" aria-labelledby={`${id}-c`}>
                <p id={`${id}-c`} style={{ margin: 0 }}><strong>{costo.resumen}</strong></p>
                {costo.aviso && <p className="hint" style={{ margin: 0 }}>{costo.aviso}</p>}
                <div className="mejorar-video-botones">
                  <button type="button" className="btn btn-primary" onClick={confirmar} disabled={ocupado} aria-busy={ocupado || undefined}><Icon name="check" size={16} /> Sí, hacerlo</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setCosto(null)} disabled={ocupado}>Cambiar algo</button>
                </div>
              </div>
            ) : (
              <div className="mejorar-video-botones">
                <button type="button" className="btn btn-primary" onClick={pedirCosto} disabled={ocupado || !puedePedir} aria-busy={ocupado || undefined}>
                  <Icon name="sparkles" size={16} /> {modo === "color" ? (ocupado ? "Poniendo el color…" : "Poner el color (gratis)") : ocupado ? "Calculando…" : "Ver cuánto cuesta"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
              </div>
            )}
          </>
        )}

        {encargo && (
          <div className="mejorar-video-progreso">
            <div role="status" aria-live="polite">
              {enMarcha && <p className="hint" style={{ margin: 0 }}><Icon name="sparkles" size={14} /> Trabajando en el servidor: puedes cerrar esto, la campana te avisa al terminar.</p>}
              <ul>{progreso.map((t) => <li key={t}>{t}</li>)}</ul>
              {listo && encargo.estado === "fallido" && <p className="form-error" role="alert">{encargo.error || "No salió."}</p>}
            </div>
            {listo && resultado && (
              <>
                <video className="mejorar-video-vista" src={resultado.src} controls playsInline preload="metadata" aria-label="El video mejorado" />
                <div className="mejorar-video-botones">
                  {onPoner && !puesto && <button type="button" className="btn btn-primary" onClick={() => { onPoner(resultado); setPuesto(true); }}><Icon name="check" size={16} /> Poner en la publicación</button>}
                  {!onPoner && cliente && <button type="button" className="btn btn-primary" onClick={() => setPoniendo(true)}><Icon name="send" size={16} /> Poner en una publicación…</button>}
                  <a className="btn btn-secondary" href={resultado.src} download><Icon name="download" size={16} /> Descargar</a>
                  <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
                </div>
                {puesto && <p role="status" className="notice notice-ok" style={{ margin: 0 }}>Puesto en la publicación (el de antes sigue en la galería).</p>}
              </>
            )}
          </div>
        )}
        {error && <p role="alert" className="form-error" style={{ margin: 0 }}>{error}</p>}
      </div>
      {eligiendo && (
        <Suspense fallback={null}>
          <GaleriaSelector clienteId={clienteId} maximo={MAX_REFERENCIAS_MEJORA} onElegir={elegirFotos} onCerrar={() => setEligiendo(false)} destino="la mejora" />
        </Suspense>
      )}
      {poniendo && resultado && (
        <Suspense fallback={null}>
          <PonerEnPublicacion cliente={cliente} archivoIds={[resultado.id]} tipo="video" descripcion="el video mejorado" onCerrar={() => setPoniendo(false)} />
        </Suspense>
      )}
    </div>
  );
}
