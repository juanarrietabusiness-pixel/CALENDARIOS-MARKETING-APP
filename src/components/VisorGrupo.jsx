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
 */
export default function VisorGrupo({ grupo, onCerrar, onAbrir, onSueltas }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const { carpeta, piezas } = grupo;
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");
  const reel = carpeta.tipo === "reel";

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
        <div className="visor-grupo-pie">
          <button type="button" className="btn btn-ghost" onClick={onSueltas}><Icon name="folder" size={16} /> Ver sueltas</button>
          <button type="button" className="btn btn-primary" disabled={bajando} onClick={descargar}>
            <Icon name="download" size={18} /> {bajando ? "Preparando el archivo…" : reel ? "Descargar el reel" : "Descargar el carrusel"}
          </button>
        </div>
      </div>
    </div>
  );
}
