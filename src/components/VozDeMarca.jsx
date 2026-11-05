import { lazy, Suspense, useId, useState } from "react";
import Icon from "./Icon";
import { VOCES_OMNI } from "../lib/estudioCatalogo";
import { limpiarLocucion, MODELOS_VOZ, VOCES_ELEVENLABS, VOCES_KIE } from "../lib/voces";

// ============================================================
// La VOZ DE LA MARCA en el kit: UNA sección
//
// Había dos voces de la marca en el kit y no se sabía cuál mandaba: `kit.locucion` (ElevenLabs, la del video animado)
// y `kit.voz` (una de las voces fijas de Google, las de Gemini Omni). Con el montaje del reel («Montarlo aquí»), la voz
// de TODO video la pone ElevenLabs con el tiempo de cada palabra: ésa es LA voz de la marca, y se escoge y se escucha
// aquí («Probar una voz», que la fija). La de Omni queda plegada debajo, sólo para quien pida un video de Omni con su
// propia voz (sin montaje).
// ============================================================

const ProbarVoz = lazy(() => import("./ProbarVoz"));
const nombreDeVoz = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export default function VozDeMarca({ client, kit, lectura = false, onGuardar }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const loc = limpiarLocucion(kit?.locucion);
  const fijada = loc.voz ? [...(loc.voces ?? []), ...VOCES_ELEVENLABS, ...VOCES_KIE].find((v) => v.id === loc.voz) : null;
  const [probar, setProbar] = useState(false);
  const [voz, setVoz] = useState(kit?.voz || "");
  const [oyendo, setOyendo] = useState(""); // la voz de Omni cuya muestra se está pidiendo
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

  const guardarOmni = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      await onGuardar({ ...kit, voz });
      setAviso({ ok: true, texto: voz ? `Fijada: un video de Omni con su propia voz saldrá con ${nombreDeVoz(voz)}.` : "Sin voz de Omni fija: la escoge el modelo." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="field">
      <span className="label">Voz de la marca (la locución de los videos)</span>
      <p className="hint" style={{ margin: 0 }}>
        {fijada
          ? <>Fijada: <strong>{fijada.nombre}</strong>{fijada.nota ? ` (${fijada.nota})` : ""} · {MODELOS_VOZ[loc.modelo]?.nombre ?? loc.modelo}.</>
          : loc.voz ? <>Fijada una voz propia de la cuenta · {MODELOS_VOZ[loc.modelo]?.nombre ?? loc.modelo}.</> : "Sin voz fijada todavía."}
        {" "}La pone ElevenLabs, con el tiempo de cada palabra, en el montaje del reel y en el video animado.
      </p>
      {!lectura && (
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={probar} onClick={() => setProbar((x) => !x)}>
          <Icon name="play" size={14} /> {probar ? "Cerrar" : loc.voz ? "Cambiar o escuchar la voz" : "Escoger y escuchar la voz"}
        </button>
      )}
      {probar && (
        <Suspense fallback={<p className="hint">Cargando…</p>}>
          <ProbarVoz client={{ ...client, id: clienteId }} />
        </Suspense>
      )}
      <details>
        <summary className="hint">Voz de Omni (sólo un video de Gemini Omni con su propia voz, sin montaje)</summary>
        <div className="lote-fila">
          <label className="sr-only" htmlFor={`${ids}-v`}>Voz de Omni</label>
          <select id={`${ids}-v`} className="input" value={voz} disabled={lectura || guardando} onChange={(e) => setVoz(e.target.value)}>
            <option value="">La que escoja el modelo</option>
            {Object.entries(VOCES_OMNI).map(([id, d]) => <option key={id} value={id}>{nombreDeVoz(id)} · {d}</option>)}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!voz || Boolean(oyendo)} onClick={() => escuchar(voz)}>
            <Icon name="play" size={14} /> {oyendo ? "Preparando…" : "Escuchar"}
          </button>
          {!lectura && voz !== (kit?.voz || "") && (
            <button type="button" className="btn btn-primary btn-sm" disabled={guardando} onClick={guardarOmni}>{guardando ? "Guardando…" : "Fijar esta voz"}</button>
          )}
        </div>
        <p className="hint">Voces de Google: el idioma lo da el texto. Seedance y Wan van sin voz.</p>
      </details>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
    </div>
  );
}
