import { useId, useState } from "react";
import Icon from "./Icon";
import { limpiarMusicaDeMarca } from "../lib/kitMarca";

// ============================================================
// La MÚSICA DE LA MARCA en el kit (Marca → Kit y voz, junto a la voz; lazy)
//
// Lo que la agencia escribe una vez de cómo suena la marca y lo que nunca debe sonar (`kit.musica`), y las músicas
// generadas que gustaron («Me gusta» en «Sonido» del video animado: lo que se le pidió a Suno). El DIRECTOR MUSICAL lo
// respeta por encima de todo al proponer la música de cada video (worker/lib/estudio/directorMusical.js).
// Se guarda con el kit entero (`onGuardar`, el PUT de siempre); el servidor lo limpia en `guardarKit`.
// ============================================================

export default function MusicaDeMarca({ kit, lectura = false, onGuardar }) {
  const ids = useId();
  const guardada = limpiarMusicaDeMarca(kit?.musica);
  const [estilo, setEstilo] = useState(guardada.estilo);
  const [evitar, setEvitar] = useState(guardada.evitar);
  const [referencias, setReferencias] = useState(guardada.referencias);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cambiado = estilo !== guardada.estilo || evitar !== guardada.evitar || referencias.length !== guardada.referencias.length;

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const nuevo = await onGuardar({ ...kit, musica: { estilo, evitar, referencias } });
      const m = limpiarMusicaDeMarca(nuevo?.musica ?? { estilo, evitar, referencias });
      setEstilo(m.estilo); setEvitar(m.evitar); setReferencias(m.referencias);
      setAviso({ ok: true, texto: "Guardada: el director musical la sigue en los próximos videos." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="field">
      <span className="label">Música de la marca (la de fondo de los videos)</span>
      <p className="hint" style={{ margin: 0 }}>
        Cómo suena la marca y lo que nunca debe sonar. El director musical lo respeta por encima de todo al proponer la
        música de cada video (en «Sonido» del video animado), y sigue la línea de las que marcaste con «Me gusta».
      </p>
      <label className="label" htmlFor={`${ids}-estilo`}>Cómo suena</label>
      <textarea id={`${ids}-estilo`} className="input" rows={2} maxLength={400} value={estilo} disabled={lectura || guardando}
        onChange={(e) => setEstilo(e.target.value)} placeholder="Acústica cálida y tierna: ukelele, palmas, piano suave; nada electrónico" />
      <label className="label" htmlFor={`${ids}-evitar`}>Que nunca suene</label>
      <input id={`${ids}-evitar`} className="input" maxLength={200} value={evitar} disabled={lectura || guardando}
        onChange={(e) => setEvitar(e.target.value)} placeholder="trap, reguetón, guitarras distorsionadas" />
      {referencias.length > 0 && (
        <>
          <span className="label">Las que gustaron (su pedido a Suno)</span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--sp-1)" }} aria-label="Músicas que gustaron a la marca">
            {referencias.map((r) => (
              <li key={r.estilo} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", justifyContent: "space-between" }}>
                <span className="hint">{r.titulo ? <strong>{r.titulo}: </strong> : null}{r.estilo}</span>
                {!lectura && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar ${r.titulo || "esta música"} de las que gustaron`}
                    disabled={guardando} onClick={() => setReferencias((lista) => lista.filter((x) => x.estilo !== r.estilo))}>
                    <Icon name="close" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!lectura && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar la música de la marca"}
          </button>
        </div>
      )}
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
    </div>
  );
}
