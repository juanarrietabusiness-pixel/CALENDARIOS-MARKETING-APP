import { useId, useState } from "react";
import Icon from "./Icon";
import { lexicoDeTexto, textoDeLexico, limpiarLexico, MAX_REGLAS } from "../lib/lexico";

// ============================================================
// El LÉXICO de la marca en el kit (Marca → Kit y voz, en diferido)
//
// Cómo se dice algo y qué no se dice nunca, una regla por línea: «fibras de bambú ← bambú, 100% bambú». La aplicación
// lo aplica SOLA a lo que se dice y a lo que se lee en todos los videos del cliente (src/lib/lexico.js); «nunca: barato»
// (una palabra prohibida sin reemplazo) no se cambia sola: se avisa. Se guarda por su ruta (PUT …/kit/lexico): el PUT
// del kit entero lo conserva.
// ============================================================

export default function LexicoMarca({ client, kit, lectura = false, onCambio }) {
  const id = useId();
  const guardado = textoDeLexico(kit?.lexico ?? []);
  const [texto, setTexto] = useState(guardado);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const reglas = lexicoDeTexto(texto);
  const sucio = textoDeLexico(reglas) !== textoDeLexico(limpiarLexico(kit?.lexico ?? []));

  const guardar = async () => {
    setOcupado(true); setError(""); setAviso("");
    try {
      const { guardarLexico } = await import("../lib/estudio");
      const r = await guardarLexico(client.id, reglas);
      setTexto(textoDeLexico(r.kit?.lexico ?? []));
      setAviso(reglas.length ? `Guardado: ${reglas.length} regla${reglas.length === 1 ? "" : "s"}. Se aplica sola a lo que se dice y se lee en sus videos.` : "Sin léxico: no se cambia nada.");
      await onCambio?.();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  return (
    <div className="field">
      <label htmlFor={`${id}-lexico`} className="label">Léxico de la marca</label>
      <p className="hint" style={{ margin: 0 }}>
        Cómo dice la marca las cosas, una regla por línea: <code>fibras de bambú ← bambú, 100% bambú</code> (lo de la
        izquierda es cómo se dice; lo de la derecha, lo que nunca). <code>nunca: barato</code> es una palabra prohibida: no se
        cambia sola, se avisa. Se aplica solo a lo que se dice y se lee en todos sus videos. Hasta {MAX_REGLAS} reglas.
      </p>
      <textarea id={`${id}-lexico`} className="input" rows={4} value={texto} disabled={lectura || ocupado}
        onChange={(e) => setTexto(e.target.value)} placeholder={"fibras de bambú ← bambú, 100% bambú\nnunca: barato"} />
      {!lectura && (
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !sucio} onClick={guardar}>
            <Icon name="check" size={14} /> {ocupado ? "Guardando…" : "Guardar el léxico"}
          </button>
        </div>
      )}
      <div aria-live="polite">
        {aviso && <p className="hint" role="status">{aviso}</p>}
        {error && <p className="va-msg va-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
