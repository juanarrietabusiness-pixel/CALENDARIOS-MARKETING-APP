import { useId, useRef, useState } from "react";
import Icon from "./Icon";
import * as api from "../lib/estudio";
import { dibujarMuestra } from "../lib/muestraFuente";

/**
 * La fuente de la marca en el kit: se sube el archivo (TTF, OTF, WOFF, WOFF2), el navegador dibuja una muestra con
 * ella y las dos se guardan en el kit. La muestra va de referencia «toma la tipografía de aquí» en toda pieza donde el
 * modelo escribe el texto; la plantilla de texto escribe con la letra real.
 */
export default function FuenteDeMarca({ client, kit, lectura = false, onGuardar }) {
  const ids = useId();
  const entrada = useRef(null);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const f = kit.fuente;

  const subir = async (archivo) => {
    setError("");
    try {
      setOcupado("Subiendo la fuente…");
      const { clave, nombre } = await api.subirFuente(client.id, archivo);
      setOcupado("Dibujando la muestra…");
      const png = await dibujarMuestra({ fuente: { clave, nombre }, marca: client.name });
      const { archivo: muestra } = await api.subirImagen(client.id, new File([png], `tipografia-${nombre || "marca"}.png`, { type: "image/png" }));
      setOcupado("Guardando en el kit…");
      await onGuardar({ ...kit, fuente: { clave, nombre: nombre || "la tipografía de la marca", muestra: muestra.clave } });
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado("");
    }
  };

  return (
    <div className="est-kit-fuente">
      {f ? (
        <>
          <img src={`/api/media/${f.muestra}`} alt={`Muestra de la tipografía ${f.nombre}`} className="est-kit-fuente-muestra" />
          <span className="hint">{f.nombre}: va de referencia cuando el modelo escribe el texto, y la plantilla escribe con ella.</span>
        </>
      ) : (
        <span className="hint">Sin subir: el modelo escoge la letra. Sube el archivo de la fuente del cliente y cada pieza sale con SU letra, sin perder el diseño.</span>
      )}
      {!lectura && (
        <div className="est-kit-fuente-botones">
          <input
            ref={entrada} id={`${ids}-f`} type="file" className="sr-only" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            aria-label="Archivo de la fuente de la marca"
            onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subir(a); }}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} onClick={() => entrada.current?.click()}>
            <Icon name="upload" size={14} /> {f ? "Cambiar la fuente" : "Subir la fuente"}
          </button>
          {f && <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => onGuardar({ ...kit, fuente: null })}>Quitarla</button>}
        </div>
      )}
      <div role="status" aria-live="polite" className={ocupado ? "hint" : "sr-only"}>{ocupado}</div>
      {error && <p role="alert" className="cerebro-error">{error}</p>}
    </div>
  );
}
