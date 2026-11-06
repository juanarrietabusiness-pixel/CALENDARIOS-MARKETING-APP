import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { limpiarKit, MAX_ESTILO_VIDEO, MAX_REFS_VIDEO } from "../lib/kitMarca";

// ============================================================
// El ESTILO DE LOS VIDEOS de la marca en el kit (Marca → Kit y voz, junto a la música; lazy)
//
// «Cómo se ven y se mueven los videos de esta marca» (`kit.estiloVideo`) y hasta seis imágenes de su galería como
// referencia de ese estilo (`kit.referenciasVideo`): la IA que escribe el guion de un video animado los recibe como ESTILO
// OBLIGATORIO (las imágenes, como imágenes: tipografía, composición, ritmo; no se copian), y el director los usa al crear
// las imágenes de fondo (src/lib/estiloVideo.js, src/lib/fondosVideo.js). Se guarda con el kit entero (`onGuardar`, el PUT
// de siempre); el servidor sólo acepta imágenes de ESTE cliente.
// ============================================================

/** Cuántas imágenes de la galería se ofrecen para escoger (las más nuevas). */
const MAX_OFRECIDAS = 60;

export default function EstiloVideoMarca({ kit, archivos = [], lectura = false, onGuardar }) {
  const ids = useId();
  const guardado = limpiarKit(kit);
  const [estilo, setEstilo] = useState(guardado.estiloVideo ?? "");
  const [refs, setRefs] = useState(guardado.referenciasVideo ?? []);
  const [escoger, setEscoger] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const imagenes = useMemo(() => archivos.filter((a) => a?.tipo === "imagen" && !a.borradoAt && a.clave).slice(0, MAX_OFRECIDAS), [archivos]);
  const porClave = useMemo(() => new Map(archivos.map((a) => [a.clave, a])), [archivos]);
  const cambiado = estilo.trim() !== (guardado.estiloVideo ?? "") || refs.join("|") !== (guardado.referenciasVideo ?? []).join("|");

  const alternar = (clave) => setRefs((r) => (r.includes(clave) ? r.filter((c) => c !== clave) : r.length >= MAX_REFS_VIDEO ? r : [...r, clave]));

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const nuevo = limpiarKit(await onGuardar({ ...kit, estiloVideo: estilo, referenciasVideo: refs }));
      setEstilo(nuevo.estiloVideo ?? ""); setRefs(nuevo.referenciasVideo ?? []);
      setAviso({ ok: true, texto: "Guardado: los próximos guiones de video lo siguen como estilo obligatorio." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="field">
      <span className="label">Estilo de los videos de la marca</span>
      <p className="hint" style={{ margin: 0 }}>
        Cómo se ven y se mueven sus videos animados: la tipografía, los fondos, el ritmo, lo que nunca sale. La IA que
        escribe cada guion lo sigue como estilo obligatorio (con la paleta, la letra y las reglas del kit), y el director lo
        usa para crear las imágenes de fondo.
      </p>
      <label className="label" htmlFor={`${ids}-estilo`}>Cómo son</label>
      <textarea id={`${ids}-estilo`} className="input" rows={5} maxLength={MAX_ESTILO_VIDEO} value={estilo} disabled={lectura || guardando}
        onChange={(e) => setEstilo(e.target.value)}
        placeholder={"Fondo negro dominante; dorado sólo de acento; texto en blanco.\nTitulares gigantes en mayúsculas, una o dos palabras por línea, la palabra clave en dorado.\nFondos de grabados antiguos en blanco y negro, oscurecidos, con grano y un zoom lento; el texto arriba o abajo, nunca encima de una cara.\nLas palabras entran de golpe cuando se cantan; líneas curvas doradas que se dibujan."} />
      <span className="hint">{estilo.length} / {MAX_ESTILO_VIDEO}</span>

      <span className="label">Referencias del estilo ({refs.length} de {MAX_REFS_VIDEO})</span>
      {refs.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }} aria-label="Referencias del estilo de los videos">
          {refs.map((clave) => (
            <li key={clave} style={{ display: "grid", gap: "var(--sp-1)", justifyItems: "center" }}>
              {porClave.get(clave)
                ? <img src={porClave.get(clave).src} alt="" width={72} height={72} style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                : <span className="hint" style={{ width: 72 }}>Ya no está en la galería</span>}
              {!lectura && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => alternar(clave)} aria-label="Quitar esta referencia">
                  <Icon name="close" size={14} /> Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!lectura && (
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={escoger} aria-controls={`${ids}-galeria`} onClick={() => setEscoger((x) => !x)}
          disabled={!imagenes.length}>
          <Icon name="image" /> {imagenes.length ? (escoger ? "Cerrar la galería" : "Escoger de la galería") : "La galería no tiene imágenes"}
        </button>
      )}
      {escoger && (
        <div id={`${ids}-galeria`} role="group" aria-label="Imágenes de la galería" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: "var(--sp-2)", maxHeight: 320, overflowY: "auto" }}>
          {imagenes.map((a) => {
            const puesta = refs.includes(a.clave);
            return (
              <button key={a.id} type="button" className="filter-chip" aria-pressed={puesta} disabled={guardando || (!puesta && refs.length >= MAX_REFS_VIDEO)}
                onClick={() => alternar(a.clave)} aria-label={`${puesta ? "Quitar" : "Usar"} de referencia${a.prompt ? `: ${String(a.prompt).slice(0, 60)}` : ""}`}
                style={{ padding: "var(--sp-1)", minHeight: "var(--tap)", height: "auto" }}>
                <img src={a.src} alt="" loading="lazy" width={68} height={68} style={{ objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block" }} />
              </button>
            );
          })}
        </div>
      )}
      {!lectura && (
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar el estilo de los videos"}
          </button>
        </div>
      )}
      <div aria-live="polite">{aviso && <p className={aviso.ok ? "hint" : "va-msg va-error"} role={aviso.ok ? "status" : "alert"}>{aviso.texto}</p>}</div>
    </div>
  );
}
