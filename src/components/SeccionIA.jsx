import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { MODELOS_IA, NIVELES_IA, CONFIG_IA_POR_DEFECTO, MODELOS_FUNCION, FUNCIONES_IA, MOTORES_IMAGEN } from "../lib/configIA";

// ============================================================
// Ajustes → Inteligencia artificial
//
// Un solo sitio para decidir con qué modelo y cuánto razonamiento
// escribe la IA de texto. Hay DOS niveles:
//
//   · Escritura: calendario, guiones, descripciones, fichas y prompt
//     maestro. Es donde se nota la calidad.
//   · Asistente: el chat. Por defecto el mismo que la escritura; bajarlo
//     a Medio es la palanca de ahorro que menos se nota, porque cada
//     mensaje del chat lleva el calendario entero de contexto.
//
// Lo cambia sólo el administrador; el editor lo ve, para saber con qué
// está trabajando. Estaba al fondo de Equipo y nadie lo encontraba.
// ============================================================

function Segmentado({ etiquetaId, opciones, valor, onCambiar, deshabilitado }) {
  return (
    <div className="segmented" role="group" aria-labelledby={etiquetaId}>
      {opciones.map((o) => (
        <button
          key={o.id ?? "igual"}
          type="button"
          className={`segmented-btn ${valor === o.id ? "active" : ""}`}
          aria-pressed={valor === o.id}
          disabled={deshabilitado}
          onClick={() => onCambiar(o.id)}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

export default function SeccionIA({ esAdmin, pulso = 0 }) {
  const [config, setConfig] = useState(CONFIG_IA_POR_DEFECTO);
  const [modelos, setModelos] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState("");
  const ids = useId();

  const cargar = useCallback(async () => {
    const [a, m] = await Promise.allSettled([db.loadAjustes(), db.loadModelosIA()]);
    if (a.status === "fulfilled" && a.value) setConfig({ ...CONFIG_IA_POR_DEFECTO, ...a.value });
    if (m.status === "fulfilled") setModelos(m.value);
  }, []);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const cambiar = async (campo, valor) => {
    if (!esAdmin || (campo !== "ia_modelos" && config[campo] === valor)) return;
    setGuardando(true);
    setFallo("");
    setMensaje("");
    try {
      const nuevo = await db.saveAjustes({ [campo]: valor });
      setConfig({ ...CONFIG_IA_POR_DEFECTO, ...nuevo });
      setMensaje("Guardado. Se aplica desde la próxima respuesta.");
      setModelos(await db.loadModelosIA().catch(() => modelos));
    } catch (e) {
      setFallo(e.message || "No se pudo guardar.");
    }
    setGuardando(false);
  };

  const nivel = NIVELES_IA.find((n) => n.id === config.ia_razonamiento) ?? NIVELES_IA[2];
  const nivelChat = NIVELES_IA.find((n) => n.id === config.ia_razonamiento_chat) ?? null;
  const modelo = MODELOS_IA.find((m) => m.id === config.ia_modelo) ?? MODELOS_IA[0];
  const nota = { fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-1)" };

  return (
    <section id="ia" aria-labelledby={`${ids}-titulo`} className="ajustes-seccion">
      <h2 className="ajustes-titulo" id={`${ids}-titulo`}>
        <Icon name="sparkles" size={18} /> Inteligencia artificial
      </h2>
      <p className="ajustes-intro">
        Con qué modelo y cuánto razona la IA de texto.
        {!esAdmin && " Sólo el administrador puede cambiarlo."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <div>
          <p className="label" id={`${ids}-modelo`} style={{ marginBottom: "var(--sp-1)" }}>
            Modelo general <span style={{ fontWeight: 400, textTransform: "none" }}>· lo que no tenga uno propio abajo</span>
          </p>
          <Segmentado
            etiquetaId={`${ids}-modelo`}
            opciones={MODELOS_IA.map((m) => ({ id: m.id, nombre: m.id === "sonnet" ? `${m.nombre} (recomendado)` : m.nombre }))}
            valor={config.ia_modelo}
            onCambiar={(v) => cambiar("ia_modelo", v)}
            deshabilitado={!esAdmin || guardando}
          />
          <p style={nota}>{modelo.nota}</p>
        </div>

        <fieldset className="ia-funciones">
          <legend className="label">Un modelo por función</legend>
          <p style={{ ...nota, marginTop: 0 }}>
            {modelos?.meta?.conectado
              ? "Meta está conectado: redacción y guiones escriben con Muse Spark Contributor salvo que elijas otro."
              : "Para usar Muse Spark (Meta), pon la llave META_API_KEY en el servidor (ver DEPLOY.md)."}
          </p>
          {FUNCIONES_IA.map((f) => {
            const propio = config.ia_modelos?.[f.id] ?? "";
            const ahora = modelos?.funciones?.[f.id];
            return (
              <div key={f.id} className="ia-funcion">
                <label htmlFor={`${ids}-f-${f.id}`}>
                  <strong>{f.nombre}</strong>
                  <span>{f.nota}</span>
                </label>
                <select id={`${ids}-f-${f.id}`} className="input" value={propio} disabled={!esAdmin || guardando}
                  onChange={(e) => cambiar("ia_modelos", { [f.id]: e.target.value || null })}>
                  <option value="">Por defecto{ahora && !ahora.propio ? ` (${ahora.nombre})` : ""}</option>
                  {MODELOS_FUNCION.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
                {ahora?.aviso && <p className="notice notice-warn" style={{ margin: 0 }}>{ahora.aviso}</p>}
              </div>
            );
          })}
          {Object.values(modelos?.funciones ?? {}).some((x) => x.id === "muse-spark-1.2-contributor") && (
            <p className="notice notice-warn" style={{ margin: 0 }}>
              Con Muse Spark Contributor, Meta puede usar lo que se le manda (ADN de marca, ideas, textos) para entrenar sus modelos.
              Las notas internas del cerebro no viajan a la redacción ni a los guiones; al asistente, sí. Si no te conviene, elige otro modelo en esa función.
            </p>
          )}
          <div className="ia-funcion">
            <label htmlFor={`${ids}-img`}>
              <strong>Imágenes</strong>
              <span>Adaptar a 4:5 o 9:16 con IA</span>
            </label>
            <select id={`${ids}-img`} className="input" value={config.ia_modelos?.imagen ?? "auto"} disabled={!esAdmin || guardando}
              onChange={(e) => cambiar("ia_modelos", { imagen: e.target.value })}>
              {MOTORES_IMAGEN.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <p style={{ ...nota, margin: 0 }}>{MOTORES_IMAGEN.find((m) => m.id === (config.ia_modelos?.imagen ?? "auto"))?.nota}</p>
          </div>
        </fieldset>

        <div>
          <p className="label" id={`${ids}-nivel`} style={{ marginBottom: "var(--sp-1)" }}>
            Razonamiento al escribir <span style={{ fontWeight: 400, textTransform: "none" }}>· calendario, guiones, descripciones y fichas</span>
          </p>
          <Segmentado
            etiquetaId={`${ids}-nivel`}
            opciones={NIVELES_IA}
            valor={config.ia_razonamiento}
            onCambiar={(v) => cambiar("ia_razonamiento", v)}
            deshabilitado={!esAdmin || guardando}
          />
          <p style={nota}>{nivel.nota}</p>
        </div>

        <div>
          <p className="label" id={`${ids}-chat`} style={{ marginBottom: "var(--sp-1)" }}>
            Razonamiento del asistente <span style={{ fontWeight: 400, textTransform: "none" }}>· el chat</span>
          </p>
          <Segmentado
            etiquetaId={`${ids}-chat`}
            opciones={[{ id: null, nombre: "Igual que al escribir" }, ...NIVELES_IA]}
            valor={config.ia_razonamiento_chat}
            onCambiar={(v) => cambiar("ia_razonamiento_chat", v)}
            deshabilitado={!esAdmin || guardando}
          />
          <p style={nota}>
            {nivelChat
              ? nivelChat.nota
              : "Cada mensaje lleva el calendario entero como contexto. Si el gasto sube, bajar sólo el chat a Medio es lo que menos se nota."}
          </p>
        </div>

        <div role="status" aria-live="polite">
          {mensaje && <p className="notice notice-ok" style={{ margin: 0 }}>{mensaje}</p>}
        </div>
        {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}

        {modelos && (
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            <p>
              <Icon name="sparkles" size={14} style={{ verticalAlign: -2 }} />{" "}
              Ahora escribe <strong style={{ color: "var(--text)" }}>{modelos.enUso?.nombre}</strong>
              {" · "}{nivel.nombre}
              {nivelChat && <> · el asistente, en {nivelChat.nombre}</>}
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
      </div>
    </section>
  );
}
