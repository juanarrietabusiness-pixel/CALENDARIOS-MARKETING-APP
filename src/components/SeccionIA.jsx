import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { MODELOS_IA, NIVELES_IA, CONFIG_IA_POR_DEFECTO, formatoUSD } from "../lib/configIA";

// ============================================================
// Ajustes → Inteligencia artificial
//
// Un solo sitio para decidir con qué modelo y cuánto razonamiento
// escribe TODA la IA de texto: asistente, calendario, publicaciones y
// fichas. Lo cambia sólo el administrador; el editor lo ve, para saber
// con qué está trabajando. Debajo, lo que costó el mes con cifras
// reales: con ellas se decide el nivel, no con estimaciones.
// ============================================================

export default function SeccionIA({ esAdmin, pulso = 0 }) {
  const [config, setConfig] = useState(CONFIG_IA_POR_DEFECTO);
  const [modelos, setModelos] = useState(null);
  const [consumo, setConsumo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState("");
  const ids = useId();

  const cargar = useCallback(async () => {
    const [a, m, c] = await Promise.allSettled([db.loadAjustes(), db.loadModelosIA(), db.loadConsumoIA()]);
    if (a.status === "fulfilled" && a.value) setConfig({ ia_modelo: a.value.ia_modelo, ia_razonamiento: a.value.ia_razonamiento });
    if (m.status === "fulfilled") setModelos(m.value);
    if (c.status === "fulfilled") setConsumo(c.value);
  }, []);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const cambiar = async (campo, valor) => {
    if (!esAdmin || config[campo] === valor) return;
    setGuardando(true);
    setFallo("");
    setMensaje("");
    try {
      const nuevo = await db.saveAjustes({ [campo]: valor });
      setConfig({ ia_modelo: nuevo.ia_modelo, ia_razonamiento: nuevo.ia_razonamiento });
      setMensaje("Guardado. Se aplica desde la próxima respuesta.");
      setModelos(await db.loadModelosIA().catch(() => modelos));
    } catch (e) {
      setFallo(e.message || "No se pudo guardar.");
    }
    setGuardando(false);
  };

  const nivel = NIVELES_IA.find((n) => n.id === config.ia_razonamiento) ?? NIVELES_IA[2];
  const modelo = MODELOS_IA.find((m) => m.id === config.ia_modelo) ?? MODELOS_IA[0];
  const mesTexto = consumo?.mes
    ? new Date(`${consumo.mes}-15T12:00:00`).toLocaleDateString("es-PA", { month: "long", year: "numeric" })
    : "";

  return (
    <section aria-labelledby={`${ids}-titulo`}>
      <h2 className="label" id={`${ids}-titulo`}>Inteligencia artificial</h2>
      <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-3)" }}>
        Con qué modelo y cuánto razona toda la IA de texto: asistente, calendario, publicaciones y fichas.
        {!esAdmin && " Sólo el administrador puede cambiarlo."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <div>
          <p className="label" id={`${ids}-modelo`} style={{ marginBottom: "var(--sp-1)" }}>Modelo</p>
          <div className="segmented" role="group" aria-labelledby={`${ids}-modelo`}>
            {MODELOS_IA.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`segmented-btn ${config.ia_modelo === m.id ? "active" : ""}`}
                aria-pressed={config.ia_modelo === m.id}
                disabled={!esAdmin || guardando}
                onClick={() => cambiar("ia_modelo", m.id)}
              >
                {m.nombre}{m.id === "sonnet" ? " (recomendado)" : ""}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-1)" }}>{modelo.nota}</p>
        </div>

        <div>
          <p className="label" id={`${ids}-nivel`} style={{ marginBottom: "var(--sp-1)" }}>Nivel de razonamiento</p>
          <div className="segmented" role="group" aria-labelledby={`${ids}-nivel`}>
            {NIVELES_IA.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`segmented-btn ${config.ia_razonamiento === n.id ? "active" : ""}`}
                aria-pressed={config.ia_razonamiento === n.id}
                disabled={!esAdmin || guardando}
                onClick={() => cambiar("ia_razonamiento", n.id)}
              >
                {n.nombre}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-1)" }}>{nivel.nota}</p>
        </div>

        <div role="status" aria-live="polite">
          {mensaje && <p className="notice notice-ok" style={{ margin: 0 }}>{mensaje}</p>}
        </div>
        {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}

        {modelos && (
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            <p>
              <Icon name="sparkles" size={14} style={{ verticalAlign: -2 }} />{" "}
              Ahora responde <strong style={{ color: "var(--text)" }}>{modelos.enUso?.nombre}</strong>
              {" · "}{nivel.nombre}
            </p>
            {modelos.enUso?.aviso && <p className="notice notice-warn" style={{ marginTop: "var(--sp-2)" }}>{modelos.enUso.aviso}</p>}
            {modelos.listaCompleta && modelos.disponibles?.length > 0 && (
              <details style={{ marginTop: "var(--sp-2)" }}>
                <summary style={{ cursor: "pointer", minHeight: "var(--tap-sm)", display: "flex", alignItems: "center" }}>
                  Modelos disponibles en tu cuenta de Anthropic ({modelos.disponibles.length})
                </summary>
                <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "var(--sp-1)", paddingTop: "var(--sp-1)" }}>
                  {modelos.disponibles.map((m) => (
                    <li key={m.id} className="badge" style={{ background: "var(--surface-2)" }} title={m.id}>{m.nombre}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {consumo && (
          <div>
            <p className="label" style={{ marginBottom: "var(--sp-1)" }}>Consumo de {mesTexto}</p>
            <p style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>
              {formatoUSD(consumo.total)}
              <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 400, color: "var(--text-dim)", marginLeft: "var(--sp-2)" }}>
                en {consumo.llamadas} llamada{consumo.llamadas === 1 ? "" : "s"}
              </span>
            </p>
            {consumo.porFuncion?.length > 0 && (
              <table style={{ width: "100%", fontSize: "var(--fs-2xs)", borderCollapse: "collapse", marginTop: "var(--sp-2)" }}>
                <caption className="sr-only">Consumo por función</caption>
                <thead>
                  <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
                    <th scope="col" style={{ padding: "var(--sp-1) 0", fontWeight: 600 }}>Función</th>
                    <th scope="col" style={{ padding: "var(--sp-1) 0", fontWeight: 600, textAlign: "right" }}>Llamadas</th>
                    <th scope="col" style={{ padding: "var(--sp-1) 0", fontWeight: 600, textAlign: "right" }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.porFuncion.map((f) => (
                    <tr key={f.nombre} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "var(--sp-1) 0", textTransform: "capitalize" }}>{f.nombre}</td>
                      <td style={{ padding: "var(--sp-1) 0", textAlign: "right" }}>{f.llamadas}</td>
                      <td style={{ padding: "var(--sp-1) 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatoUSD(f.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", marginTop: "var(--sp-2)" }}>
              Calculado con la tarifa de Anthropic de cada modelo. Incluye sólo la IA de texto (Claude):
              imágenes y videos van con Gemini y no se cuentan aquí.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
