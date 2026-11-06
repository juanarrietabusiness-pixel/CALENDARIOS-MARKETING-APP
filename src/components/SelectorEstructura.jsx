import { lazy, Suspense, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { listarFormulas } from "../lib/formulasUgcApi";

// La lista entera de las estructuras (y escribir una): sólo al abrirla.
const FormulasUgc = lazy(() => import("./calendario/FormulasUgc"));

// ============================================================
// «Estructura del guion» al escribir una VOZ EN OFF (o un UGC)
//
// Las estructuras de guion son de la AGENCIA y valen para todos los clientes
// (lib/formulasUgc.js): aquí se escoge cuál sigue el guion que se va a
// escribir, o «La IA escoge la que encaje» (por defecto). Sólo se ofrecen las
// que sirven para `uso` («voz»: el video animado y el reel por planos;
// «ugc»: el guion para grabar). La escogida se queda aunque ya no sirva para
// ese uso: la escogió una persona. «Ver las estructuras» abre la lista de la
// agencia (con su filtro y para escribir una). El tono de cada marca va
// aparte: esto es la forma.
// ============================================================

const NOMBRE_USO = { voz: "voz en off", ugc: "UGC" };
// Estilos en línea con los tokens (sin hoja propia: cada CSS más es otro archivo en la lista de precarga del Estudio,
// que está en su tope).
const COLUMNA = { display: "flex", flexDirection: "column", gap: "var(--sp-1)" };
const FILA = { display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" };
const SELECT = { flex: "1 1 14rem", minHeight: "var(--tap-sm)" };

/**
 * @param uso       «voz» | «ugc».
 * @param value     el id de la escogida ("" = la IA escoge).
 * @param onChange  recibe el id ("" = la IA escoge).
 * @param sencilla  la etiqueta como las de alrededor sin la clase `label` (en «Video nuevo» van así).
 */
export default function SelectorEstructura({ uso = "voz", value = "", onChange, disabled = false, sencilla = false }) {
  const ids = useId();
  const [lista, setLista] = useState(null);
  const [ver, setVer] = useState(false);
  const [leida, setLeida] = useState(false); // la lista llegó del servidor (no es la vacía de un fallo)

  useEffect(() => {
    let vivo = true;
    const leer = () => listarFormulas()
      .then((l) => { if (vivo) { setLista(l); setLeida(true); } })
      .catch(() => { if (vivo) setLista((x) => x ?? []); });
    void leer();
    window.addEventListener("formulas-ugc", leer);
    return () => { vivo = false; window.removeEventListener("formulas-ugc", leer); };
  }, []);
  // Una escogida que alguien quitó de la agencia vuelve a «La IA escoge»: si no, el servidor contestaría que ya no está.
  // (Sólo con la lista leída bien: si no se pudo leer, la escogida se queda.)
  useEffect(() => {
    if (leida && lista && value && !lista.some((f) => f.id === value)) onChange("");
  }, [leida, lista, value, onChange]);

  // El servidor dice `para` en todas; sin él (una respuesta de antes), vale para las dos.
  const deUso = (lista ?? []).filter((f) => !Array.isArray(f.para) || f.para.includes(uso));
  const escogida = (lista ?? []).find((f) => f.id === value) ?? null;
  const nombreUso = NOMBRE_USO[uso] ?? uso;

  return (
    <div className="field" style={COLUMNA}>
      <label className={sencilla ? undefined : "label"} htmlFor={`${ids}-e`}>
        Estructura del guion <span className="hint">(de la agencia, para todos los clientes)</span>
      </label>
      <div style={FILA}>
        <select id={`${ids}-e`} className="input" style={SELECT} value={escogida ? escogida.id : value && lista ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={disabled || !lista}>
          <option value="">{!lista ? "Cargando…" : deUso.length ? "La IA escoge la que encaje" : `Sin estructuras de ${nombreUso} todavía`}</option>
          {deUso.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          {escogida && !deUso.includes(escogida) && <option value={escogida.id}>{escogida.nombre} (no es de {nombreUso})</option>}
          {value && lista && !escogida && <option value={value} disabled>(una estructura que ya no está)</option>}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVer(true)}>
          <Icon name="list" size={14} /> Ver las estructuras
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {escogida
          ? `${escogida.tramos.map((t) => t.funcion).join(" → ")}${escogida.cuando ? ` · Conviene: ${escogida.cuando}` : ""}`
          : "La forma del guion: el orden de los momentos de la voz. El tono de la marca va aparte."}
      </p>
      {ver && (
        <Suspense fallback={null}>
          <FormulasUgc uso={uso} onCerrar={() => setVer(false)} />
        </Suspense>
      )}
    </div>
  );
}
