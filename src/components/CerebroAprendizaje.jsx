import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { leerSenales, aprenderDelHistorial } from "../lib/cerebro";
import {
  NOMBRE_SENAL, etiquetaDeResultado, describirSenales, acumularHistorial, describirHistorial,
} from "../lib/cerebroAprendizaje";

// ============================================================
// Lo que el cerebro aprende de lo que pasa después de escribir
//
// Cuando el cliente aprueba o pide cambios, el cerebro lo apunta: las
// notas que se usaron al escribir esa publicación suben o bajan en la
// búsqueda, y lo que el cliente dijo con sus palabras queda como una nota
// de tipo Decisión. Aquí se ve qué ha aprendido y se le puede pedir que
// aprenda también de lo que el cliente ya respondió antes.
// ============================================================

const fecha = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" }) : "");
const MOSTRAR = 8;

export default function CerebroAprendizaje({ client, lectura, version, onCambio }) {
  const ids = useId();
  const [senales, setSenales] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null); // { ok, texto }

  const cargar = useCallback(async () => {
    try {
      setSenales((await leerSenales(client.id)).senales);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [client.id]);

  useEffect(() => { cargar(); }, [cargar, version]);

  const aprenderHistorial = async () => {
    setAviso(null);
    let acum = null;
    let desde = 0;
    try {
      do {
        setTrabajando(acum?.total ? `Leyendo calendarios: ${Math.min(acum.leidos, acum.total)} de ${acum.total}…` : "Leyendo calendarios…");
        const r = await aprenderDelHistorial(client.id, desde);
        acum = acumularHistorial(acum, r);
        desde = r.siguiente;
      } while (desde !== null);
      setAviso({ ok: true, texto: describirHistorial(acum) });
    } catch (e) {
      setAviso({ ok: false, texto: `${acum?.leidos ? `Alcanzó a leer ${acum.leidos} calendarios. ` : ""}${e.message}` });
    } finally {
      setTrabajando("");
      await cargar();
      if (onCambio) await onCambio();
    }
  };

  const lista = senales ?? [];
  return (
    <details className="cerebro-aprende card">
      <summary>
        <Icon name="sparkles" size={16} /> Lo que aprende de lo que pasa después de escribir
        {senales && <span className="cerebro-cuenta">{lista.length}</span>}
      </summary>

      <div className="cerebro-aprende-cuerpo">
        <p className="hint">
          Cuando el cliente aprueba o pide cambios, las notas que se usaron para escribir esa publicación suben o bajan en la búsqueda,
          y lo que dijo con sus palabras queda como una nota de tipo Decisión. El silencio no cuenta: sin respuesta, no se aprende nada.
        </p>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {senales && <p className="cerebro-aprende-resumen" role="status">{describirSenales(lista)}</p>}

        {lista.length > 0 && (
          <ul className="cerebro-senales" aria-label="Lo último que ha aprendido">
            {lista.slice(0, MOSTRAR).map((s) => {
              const e = etiquetaDeResultado(s.resultado);
              return (
                <li key={s.id} className="cerebro-senal">
                  <span className={`cerebro-senal-marca cerebro-senal-${e.nivel}`} aria-hidden="true" />
                  <span className="cerebro-senal-texto">
                    <span className="sr-only">{e.texto}: </span>{s.resumen}
                  </span>
                  <span className="cerebro-senal-meta">{NOMBRE_SENAL[s.tipo] ?? "Señal"}{s.fecha ? ` · ${fecha(s.fecha)}` : ""}</span>
                </li>
              );
            })}
            {lista.length > MOSTRAR && <li className="hint">Y {lista.length - MOSTRAR} más.</li>}
          </ul>
        )}

        {!lectura && (
          <div className="cerebro-acciones" role="group" aria-label="Aprender">
            <button type="button" className="btn btn-secondary" disabled={Boolean(trabajando)} onClick={aprenderHistorial} aria-describedby={`${ids}-h`}>
              <Icon name="refresh" size={18} /> {trabajando || "Aprender de lo que ya respondió"}
            </button>
          </div>
        )}
        <p id={`${ids}-h`} className="hint">
          Lee las respuestas que el cliente ya dio en sus calendarios y las apunta. No mueve lo que sube o baja en la búsqueda —de lo de antes no se sabe qué notas se usaron—: eso empieza con lo que se escriba desde ahora.
        </p>
        {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>{aviso.texto}</p>}
      </div>
    </details>
  );
}
