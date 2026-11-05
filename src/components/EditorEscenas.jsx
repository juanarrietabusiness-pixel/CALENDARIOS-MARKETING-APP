// ============================================================
// «Editar los textos» del video animado (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// Lo que más se corrige de un guion —lo que se DICE, lo que se LEE, el tipo de escena y su pausa— sin tocar el JSON.
// También cambiar el orden, duplicar y quitar escenas. Cada cambio reescribe el guion entero (`onCambiar`) y la
// pantalla lo valida en vivo con el mismo validador que el servidor; las capas se quedan como estaban (se editan en el
// JSON o pidiéndoselo a Claude).
// ============================================================

import { useId } from "react";
import Icon from "./Icon";
import { NOMBRE_TIPO_ESCENA } from "../lib/videoEscenas";

const LARGO = Object.freeze({ habla: 400, pantalla: 80 });

/** Un id de escena que no está en la lista. */
function idNuevo(escenas) {
  const usados = new Set(escenas.map((e) => e.id));
  for (let n = escenas.length + 1; ; n++) if (!usados.has(`e${n}`)) return `e${n}`;
}

export default function EditorEscenas({ guion, onCambiar }) {
  const ids = useId();
  const escenas = guion.escenas ?? [];
  const poner = (lista) => onCambiar({ ...guion, escenas: lista });
  const cambiar = (i, campo, valor) => poner(escenas.map((e, k) => (k === i ? { ...e, [campo]: valor } : e)));
  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= escenas.length) return;
    const lista = [...escenas];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    poner(lista);
  };
  const duplicar = (i) => {
    const copia = { ...JSON.parse(JSON.stringify(escenas[i])), id: idNuevo(escenas) };
    poner([...escenas.slice(0, i + 1), copia, ...escenas.slice(i + 1)]);
  };
  const quitar = (i) => { if (escenas.length > 1) poner(escenas.filter((_, k) => k !== i)); };

  return (
    <ol className="va-editor" aria-label="Escenas del guion">
      {escenas.map((e, i) => {
        const p = `${ids}-${i}`;
        return (
          <li key={e.id} className="va-editor-escena">
            <div className="va-editor-cab">
              <strong>Escena {i + 1}</strong>
              <label htmlFor={`${p}-tipo`} className="sr-only">Tipo de la escena {i + 1}</label>
              <select id={`${p}-tipo`} className="input" value={e.tipo} onChange={(ev) => cambiar(i, "tipo", ev.target.value)}>
                {Object.entries(NOMBRE_TIPO_ESCENA).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
              <div className="va-editor-botones">
                <button type="button" className="btn-icon" aria-label={`Subir la escena ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}><Icon name="chevronUp" /></button>
                <button type="button" className="btn-icon" aria-label={`Bajar la escena ${i + 1}`} disabled={i === escenas.length - 1} onClick={() => mover(i, 1)}><Icon name="chevronDown" /></button>
                <button type="button" className="btn-icon" aria-label={`Duplicar la escena ${i + 1}`} onClick={() => duplicar(i)}><Icon name="copy" /></button>
                <button type="button" className="btn-icon" aria-label={`Quitar la escena ${i + 1}`} disabled={escenas.length === 1} onClick={() => quitar(i)}><Icon name="trash" /></button>
              </div>
            </div>
            <label htmlFor={`${p}-habla`}>Lo que se dice</label>
            <textarea id={`${p}-habla`} className="input" rows={2} maxLength={LARGO.habla} value={e.habla ?? ""} onChange={(ev) => cambiar(i, "habla", ev.target.value)} />
            <label htmlFor={`${p}-pantalla`}>Lo que se lee (texto principal)</label>
            <input id={`${p}-pantalla`} className="input" maxLength={LARGO.pantalla} value={e.pantalla ?? ""} onChange={(ev) => cambiar(i, "pantalla", ev.target.value)} />
            <label htmlFor={`${p}-pausa`}>Silencio después (s)</label>
            <input id={`${p}-pausa`} className="input va-editor-pausa" type="number" min={0} max={3} step={0.1} inputMode="decimal" value={e.pausa ?? 0}
              onChange={(ev) => cambiar(i, "pausa", ev.target.value === "" ? 0 : Number(ev.target.value))} />
          </li>
        );
      })}
    </ol>
  );
}
