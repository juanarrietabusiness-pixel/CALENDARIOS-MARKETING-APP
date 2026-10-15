import { useId, useState } from "react";
import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { textoDeGrupo, nombresParaZip, estaUsado } from "../lib/estudio";
import { crearZip } from "../lib/zip";
import "./VisorGrupo.css";

/** El nombre del ZIP a partir del de la carpeta («Carrusel · Caleb · 14 oct» → «carrusel-caleb-14-oct.zip»). */
const nombreZip = (carpeta) =>
  `${String(carpeta?.nombre || "carrusel").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "carrusel"}.zip`;

/**
 * Un carrusel o un reel de la galería, con todas sus piezas en orden. Tocar una la abre en el visor de siempre (para
 * corregirla, descargarla sola o usarla); «Descargar el carrusel» baja todas en un ZIP hecho aquí mismo (lib/zip.js);
 * «Ver sueltas» filtra la galería por su carpeta.
 *
 *   todas       TODO lo de su carpeta, también las crudas sin texto y las versiones viejas: es lo que va a la papelera
 *   onUsar      (piezas) => void: desde una publicación, «Usar el carrusel en la publicación» (en un reel, el video)
 *   onPapelera  (ids) => Promise: «Mandar el carrusel a la papelera», con un segundo toque que dice qué se va
 */
export default function VisorGrupo({ grupo, todas = null, onCerrar, onAbrir, onSueltas, onUsar = null, onPapelera = null }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const { carpeta, piezas } = grupo;
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const reel = carpeta.tipo === "reel";
  const cuales = todas?.length ? todas : piezas;
  const usadas = cuales.filter(estaUsado).length;
  const crudas = cuales.length - piezas.length;
  // En un reel lo que va en la publicación es el video (el más nuevo); los fotogramas son su storyboard.
  const paraUsar = reel ? piezas.filter((a) => a.tipo === "video").slice(0, 1) : piezas.filter((a) => a.tipo !== "video");

  const aPapelera = async () => {
    setQuitando(true);
    setError("");
    try {
      await onPapelera(cuales.map((a) => a.id));
    } catch (e) {
      setError(e.message);
      setQuitando(false);
    }
  };

  const descargar = async () => {
    setBajando(true);
    setError("");
    try {
      const nombres = nombresParaZip(carpeta, piezas);
      const archivos = await Promise.all(piezas.map(async (a, i) => {
        const r = await fetch(a.src, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`No se pudo bajar la pieza ${i + 1}.`);
        return { nombre: nombres[i], datos: new Uint8Array(await r.arrayBuffer()) };
      }));
      const url = URL.createObjectURL(new Blob([crearZip(archivos)], { type: "application/zip" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreZip(carpeta);
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog visor-grupo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="visor-grupo-cabecera">
          <div>
            <h3 id={`${ids}-t`}>{textoDeGrupo(carpeta, piezas)}</h3>
            <p className="hint" style={{ margin: 0 }}>{carpeta.nombre}</p>
          </div>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <ol className={`visor-grupo-piezas${reel ? " visor-grupo-reel" : ""}`}>
          {piezas.map((a, i) => (
            <li key={a.id}>
              <button type="button" className="visor-grupo-pieza" aria-label={`Abrir ${reel ? (a.tipo === "video" ? "el video" : "el fotograma") : "la lámina"} ${i + 1}`} onClick={() => onAbrir(a)}>
                <Pieza archivo={a} />
                <span className="visor-grupo-num">{i + 1}</span>
                {estaUsado(a) && <span className="visor-grupo-usada">Usada</span>}
              </button>
            </li>
          ))}
        </ol>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {confirmando ? (
          <div className="visor-grupo-confirmar" role="group" aria-labelledby={`${ids}-c`}>
            <p id={`${ids}-c`} style={{ margin: 0 }}>
              <strong>¿Mandar {reel ? "el reel" : "el carrusel"} entero a la papelera?</strong>{" "}
              Se van {cuales.length} pieza{cuales.length === 1 ? "" : "s"}
              {crudas > 0 ? `: las ${piezas.length} que ves y ${crudas} más de su carpeta (las versiones sin texto y las anteriores)` : ""}.
              {" "}Puedes recuperarlas 30 días.
            </p>
            {usadas > 0 && (
              <p className="notice notice-warn" style={{ margin: 0 }}>
                {usadas === 1 ? "Una está puesta" : `${usadas} están puestas`} en una publicación: {usadas === 1 ? "seguirá" : "seguirán"} viéndose ahí y la papelera no {usadas === 1 ? "la" : "las"} borra del todo mientras se use{usadas === 1 ? "" : "n"}.
              </p>
            )}
            <div className="visor-grupo-pie">
              <button type="button" className="btn btn-ghost" disabled={quitando} onClick={() => setConfirmando(false)}>Cancelar</button>
              <button type="button" className="btn btn-danger" disabled={quitando} onClick={aPapelera}>
                <Icon name="trash" size={16} /> {quitando ? "Mandando…" : `Sí, mandar ${cuales.length} a la papelera`}
              </button>
            </div>
          </div>
        ) : (
          <div className="visor-grupo-pie">
            {onPapelera && (
              <button type="button" className="btn btn-ghost visor-grupo-borrar" onClick={() => setConfirmando(true)}>
                <Icon name="trash" size={16} /> {reel ? "Mandar el reel a la papelera" : "Mandar el carrusel a la papelera"}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onSueltas}><Icon name="folder" size={16} /> Ver sueltas</button>
            <button type="button" className={`btn ${onUsar ? "btn-secondary" : "btn-primary"}`} disabled={bajando} onClick={descargar}>
              <Icon name="download" size={18} /> {bajando ? "Preparando el archivo…" : reel ? "Descargar el reel" : "Descargar el carrusel"}
            </button>
            {onUsar && paraUsar.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => onUsar(paraUsar)}>
                <Icon name="check" size={18} /> {reel ? "Usar el video en la publicación" : `Usar el carrusel en la publicación (${paraUsar.length})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
