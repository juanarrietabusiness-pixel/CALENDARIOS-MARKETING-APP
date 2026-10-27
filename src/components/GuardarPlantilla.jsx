import { useId, useState } from "react";
import Icon from "./Icon";
import { guardarPlantilla } from "../lib/estudio";
import { USOS_PLANTILLA, NOMBRES_USO } from "../lib/director";

// ============================================================
// «Guardar como plantilla»: una pieza que quedó muy bien pasa al kit
//
// La IA la mira una vez y escribe su sistema de diseño (zonas, tamaños,
// colores, tipografía, logo); desde entonces cualquier pieza de este cliente
// puede repetir ese diseño con otro contenido: el director de arte, el
// asistente, el lote, «Producir el mes», el post y las historias.
// ============================================================

export default function GuardarPlantilla({ clienteId, archivo, onGuardada = null }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [uso, setUso] = useState(archivo?.ajustes?.aspectRatio === "9:16" ? "historia" : "post");
  const [estado, setEstado] = useState({ guardando: false, aviso: null });

  const guardar = async (e) => {
    e.preventDefault();
    setEstado({ guardando: true, aviso: null });
    try {
      const r = await guardarPlantilla(clienteId, { archivoId: archivo.id, nombre, uso });
      setEstado({ guardando: false, aviso: { ok: true, texto: `Guardada como plantilla «${r.plantilla.nombre}». Ya se puede escoger al crear (y el director la usa cuando encaja).` } });
      setAbierto(false);
      window.dispatchEvent(new Event("ia:gasto"));
      onGuardada?.(r);
    } catch (err) {
      setEstado({ guardando: false, aviso: { ok: false, texto: err.message } });
    }
  };

  return (
    <div className="est-plantilla">
      {!abierto ? (
        <button type="button" className="btn btn-secondary" onClick={() => setAbierto(true)} title="Repetir este diseño con otro contenido en las próximas piezas">
          <Icon name="layers" size={16} /> Guardar como plantilla
        </button>
      ) : (
        <form className="est-editar" onSubmit={guardar}>
          <label className="label" htmlFor={`${id}-n`}>Nombre de la plantilla</label>
          <input id={`${id}-n`} className="input" maxLength={60} value={nombre} placeholder="Ej.: Oferta con placa azul" onChange={(e) => setNombre(e.target.value)} />
          <label className="label" htmlFor={`${id}-u`}>Para qué sirve</label>
          <select id={`${id}-u`} className="input" value={uso} onChange={(e) => setUso(e.target.value)}>
            {USOS_PLANTILLA.map((u) => <option key={u} value={u}>{NOMBRES_USO[u]}</option>)}
          </select>
          <div className="est-editar-botones">
            <button type="submit" className="btn btn-primary btn-sm" disabled={estado.guardando}>{estado.guardando ? "La IA está leyendo su diseño…" : "Guardar en el kit"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={estado.guardando} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>La IA mira la pieza y apunta su sistema de diseño (céntimos, una sola vez).</p>
        </form>
      )}
      <div aria-live="polite">{estado.aviso && <p role={estado.aviso.ok ? "status" : "alert"} className={estado.aviso.ok ? "hint" : "cerebro-error"} style={{ margin: 0 }}>{estado.aviso.texto}</p>}</div>
    </div>
  );
}
