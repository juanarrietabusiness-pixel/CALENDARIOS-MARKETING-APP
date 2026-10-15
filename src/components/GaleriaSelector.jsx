import { useEffect, useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { leerEstudio, agruparGaleria, textoDeGrupo, estaUsado } from "../lib/estudio";
import "./VisorGrupo.css";

/**
 * «De la galería» del panel de una publicación: lo que ya está hecho en el Estudio del cliente, sin crearlo otra vez.
 * Un carrusel o un reel es UNA tarjeta, como en la galería: tocarla escoge TODAS sus piezas en su orden. Una imagen
 * suelta se escoge y se quita con un toque. El orden en que se tocan es el de la publicación.
 *
 *   maximo      cuántas caben (Instagram: 10)
 *   yaTiene     cuántas tiene ya la publicación (entonces se pregunta añadir o reemplazar)
 *   onElegir    (archivos, { reemplazar }) => void
 */
export default function GaleriaSelector({ clienteId, maximo = 10, yaTiene = 0, onElegir, onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [elegidas, setElegidas] = useState([]); // archivos, en orden
  const [reemplazar, setReemplazar] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerEstudio(clienteId).then((d) => { if (vivo) setDatos(d); }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [clienteId]);

  const archivos = useMemo(() => (datos?.archivos ?? []).filter((a) => !a.borradoAt), [datos]);
  const vista = useMemo(() => agruparGaleria(archivos, datos?.carpetas ?? [], archivos), [archivos, datos]);
  const caben = reemplazar || !yaTiene ? maximo : Math.max(0, maximo - yaTiene);
  const marcada = (a) => elegidas.some((x) => x.id === a.id);
  const alternar = (a) => setElegidas((l) => (l.some((x) => x.id === a.id) ? l.filter((x) => x.id !== a.id) : [...l, a]));
  const alternarGrupo = (piezas) => setElegidas((l) => (piezas.every((p) => l.some((x) => x.id === p.id))
    ? l.filter((x) => !piezas.some((p) => p.id === x.id))
    : [...l, ...piezas.filter((p) => !l.some((x) => x.id === p.id))]));
  const sobran = elegidas.length > caben;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog visor-grupo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="visor-grupo-cabecera">
          <div>
            <h3 id={`${ids}-t`}>Escoger de la galería</h3>
            <p className="hint" style={{ margin: 0 }}>Toca un carrusel para ponerlo entero y en orden, o las imágenes una a una.</p>
          </div>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {!datos && !error && <p role="status" className="hint">Abriendo la galería…</p>}
        {datos && !vista.length && <p className="hint">La galería de este cliente está vacía. Crea algo en el Estudio o con «Crear con IA».</p>}
        {vista.length > 0 && (
          <ul className="visor-grupo-piezas galeria-selector">
            {vista.map((x) => {
              if (x.grupo) {
                const { carpeta, piezas, portada } = x.grupo;
                const todas = piezas.every(marcada);
                const nombre = textoDeGrupo(carpeta, piezas);
                return (
                  <li key={x.id}>
                    <button type="button" className="visor-grupo-pieza" aria-pressed={todas} aria-label={`${nombre}: ${carpeta.nombre}`} onClick={() => alternarGrupo(piezas)}>
                      <Pieza archivo={portada} />
                      <span className="visor-grupo-num">{todas ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />}</span>
                      <span className="galeria-selector-pie">{nombre}</span>
                    </button>
                  </li>
                );
              }
              const i = elegidas.findIndex((e) => e.id === x.id);
              return (
                <li key={x.id}>
                  <button type="button" className="visor-grupo-pieza" aria-pressed={i >= 0} aria-label={`${i >= 0 ? "Quitar" : "Escoger"}: ${x.prompt || "pieza"}`} onClick={() => alternar(x)}>
                    <Pieza archivo={x} />
                    {i >= 0 && <span className="visor-grupo-num">{i + 1}</span>}
                    {estaUsado(x) && <span className="visor-grupo-usada">Usada</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="visor-grupo-pie">
          {yaTiene > 0 && (
            <label className="galeria-selector-reemplazar">
              <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} /> Reemplazar lo que ya tiene ({yaTiene})
            </label>
          )}
          {sobran && <p role="alert" className="hint" style={{ margin: 0 }}>Caben {caben}: Instagram admite {maximo} por publicación.</p>}
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!elegidas.length || sobran} onClick={() => onElegir(elegidas, { reemplazar })}>
            <Icon name="check" size={18} /> {elegidas.length ? `Poner ${elegidas.length} en la publicación` : "Escoge algo"}
          </button>
        </div>
      </div>
    </div>
  );
}
