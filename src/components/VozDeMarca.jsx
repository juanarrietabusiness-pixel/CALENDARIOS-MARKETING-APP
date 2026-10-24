import { useId, useState } from "react";
import Icon from "./Icon";
import { VOCES_OMNI } from "../lib/estudioCatalogo";

// ============================================================
// La voz de la marca en el kit: una de las voces fijas de Google (las de
// Gemini Omni). Se escucha ANTES de fijarla —el servidor pide una frase corta
// con esa voz una sola vez y la guarda (worker/lib/estudio/voz.js)— y queda en
// el kit: los videos con locución de ese cliente salen con ella.
// ============================================================

const nombreDeVoz = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export default function VozDeMarca({ client, kit, lectura = false, onGuardar }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [voz, setVoz] = useState(kit?.voz || "");
  const [oyendo, setOyendo] = useState(""); // la voz cuya muestra se está pidiendo
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const escuchar = (id) => {
    if (!id) return;
    setAviso(null);
    setOyendo(id);
    // La primera vez tarda unos segundos (se pide a Google); después sale guardada.
    const audio = new Audio(`/api/estudio/${encodeURIComponent(clienteId)}/voz/${encodeURIComponent(id)}`);
    audio.addEventListener("playing", () => setOyendo(""), { once: true });
    audio.addEventListener("error", () => { setOyendo(""); setAviso({ ok: false, texto: "No se pudo escuchar esa voz. Inténtalo otra vez." }); }, { once: true });
    audio.play().catch(() => setOyendo(""));
  };

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      await onGuardar({ ...kit, voz });
      setAviso({ ok: true, texto: voz ? `Fijada: los videos con locución de ${client.name} saldrán con ${nombreDeVoz(voz)}.` : "Sin voz fija: la escoge el modelo." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="field">
      <label className="label" htmlFor={`${ids}-v`}>Voz de la marca (locución de los videos)</label>
      <div className="lote-fila">
        <select id={`${ids}-v`} className="input" value={voz} disabled={lectura || guardando} onChange={(e) => setVoz(e.target.value)}>
          <option value="">La que escoja el modelo</option>
          {Object.entries(VOCES_OMNI).map(([id, d]) => <option key={id} value={id}>{nombreDeVoz(id)} · {d}</option>)}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!voz || Boolean(oyendo)} onClick={() => escuchar(voz)}>
          <Icon name="play" size={14} /> {oyendo ? "Preparando…" : "Escuchar"}
        </button>
        {!lectura && voz !== (kit?.voz || "") && (
          <button type="button" className="btn btn-primary btn-sm" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Fijar esta voz"}</button>
        )}
      </div>
      <p className="hint">Voces de Google, las mismas de Gemini Omni: el idioma lo da el texto. La locución es opcional; Seedance y Wan van sin voz.</p>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
    </div>
  );
}
