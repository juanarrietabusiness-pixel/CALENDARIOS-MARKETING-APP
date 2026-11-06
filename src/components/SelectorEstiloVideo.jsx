import { useEffect, useId, useState } from "react";
import { listarEstilos } from "../lib/estilosVideoApi";

// ============================================================
// «Estilo del video»: escoger uno de los ESTILOS DE VIDEO guardados del cliente al crear un video (con canción o con voz
// en off). Lo usan CrearConCancion.jsx y CrearVideoAnimado.jsx (los dos, en diferido).
//
// `value` null = aún sin escoger: al cargar, se escoge el primero que sirva para este uso (el estilo es justo lo que la
// agencia guardó para que el siguiente salga igual); "" = ninguno (la IA diseña libre). `onChange(id, estilo)`.
// ============================================================

export default function SelectorEstiloVideo({ client, uso, value, onChange, disabled = false }) {
  const ids = useId();
  const [estilos, setEstilos] = useState(null);

  useEffect(() => {
    let vivo = true;
    const cargar = () => listarEstilos(client.id)
      .then((l) => { if (vivo) setEstilos(l.filter((e) => e.para === "todos" || e.para === uso)); })
      .catch(() => { if (vivo) setEstilos([]); });
    cargar();
    const alCambiar = (e) => { if (!e.detail?.clienteId || e.detail.clienteId === client.id) cargar(); };
    window.addEventListener("estilos-video", alCambiar);
    return () => { vivo = false; window.removeEventListener("estilos-video", alCambiar); };
  }, [client.id, uso]);

  // Sin escoger todavía: el primero que sirva (o ninguno).
  useEffect(() => {
    if (value === null && estilos) onChange(estilos[0]?.id ?? "", estilos[0] ?? null);
  }, [value, estilos, onChange]);

  if (!estilos) return null;
  if (!estilos.length) {
    return (
      <p className="hint">
        {client.name} no tiene estilos de video guardados{uso === "cancion" ? " para canciones" : ""}. Cuando un video quede como lo quieres, ábrelo y
        «Guardar como estilo»: el siguiente sale igual.
      </p>
    );
  }
  const escogido = estilos.find((e) => e.id === value) ?? null;
  return (
    <div className="va-estilo">
      <label htmlFor={`${ids}-estilo`}>Estilo del video</label>
      <select id={`${ids}-estilo`} className="input" value={value ?? ""} disabled={disabled}
        onChange={(e) => onChange(e.target.value, estilos.find((x) => x.id === e.target.value) ?? null)}>
        {estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        <option value="">Ninguno (la IA diseña libre)</option>
      </select>
      {escogido && (
        <details className="va-estilo-resumen">
          <summary>Qué hace «{escogido.nombre}»</summary>
          <ul>{(escogido.resumen ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
