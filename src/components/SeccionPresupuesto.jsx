import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { ACCIONES_LIMITE, CONFIG_IA_POR_DEFECTO, formatoUSD } from "../lib/configIA";
import { EVENTO_GASTO } from "./MedidorIA";
import { fechaEnZona } from "../lib/agenda";

// ============================================================
// Ajustes → Presupuesto y consumo
//
// El tope del mes y qué hacer al llegar, y debajo en qué se fue cada
// dólar: por día, por función, por cliente y las llamadas más caras.
// Cuenta TODO lo que pasa por la aplicación —texto de Claude, búsquedas
// web, imágenes y videos de Gemini—. Lo que no ve es lo que otras
// aplicaciones gasten con la misma clave: eso sólo lo sabe la consola
// de Anthropic, y por eso se enlaza.
// ============================================================

const mesDe = (mes, n) => {
  let [a, m] = mes.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; a -= 1; }
  while (m > 12) { m -= 12; a += 1; }
  return `${a}-${String(m).padStart(2, "0")}`;
};
const mayus = (t = "") => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const nombreMes = (mes) => {
  const t = new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-PA", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Una barra por día. Una sola serie: sin leyenda, el título la nombra. */
function GraficaDias({ dias, presupuesto }) {
  const [activo, setActivo] = useState(null);
  const max = Math.max(...dias.map((d) => d.costo), 0.0001);
  const ancho = 100 / dias.length;
  const promedioDiario = presupuesto > 0 ? presupuesto / dias.length : 0;

  return (
    <figure className="grafica-dias" style={{ margin: 0 }}>
      <figcaption className="label" style={{ marginBottom: "var(--sp-2)" }}>Gasto por día</figcaption>
      <div className="grafica-dias-lienzo" onPointerLeave={() => setActivo(null)}>
        {promedioDiario > 0 && promedioDiario <= max && (
          <div
            className="grafica-dias-guia"
            style={{ bottom: `${(promedioDiario / max) * 100}%` }}
            aria-hidden="true"
          >
            <span>ritmo del presupuesto</span>
          </div>
        )}
        {dias.map((d, i) => (
          <button
            key={d.dia}
            type="button"
            className="grafica-dias-columna"
            style={{ left: `${i * ancho}%`, width: `${ancho}%` }}
            onPointerEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            aria-label={`${+d.dia.slice(8, 10)}: ${formatoUSD(d.costo)} en ${d.llamadas} llamada${d.llamadas === 1 ? "" : "s"}`}
          >
            <span
              className="grafica-dias-barra"
              data-activa={activo === i}
              style={{ height: d.costo > 0 ? `max(2px, ${(d.costo / max) * 100}%)` : 0 }}
            />
          </button>
        ))}
        {activo !== null && (
          <div
            className="grafica-dias-pista"
            role="presentation"
            style={{ left: `${Math.min(Math.max((activo + 0.5) * ancho, 12), 88)}%` }}
          >
            <strong>{formatoUSD(dias[activo].costo)}</strong>
            <span>
              {+dias[activo].dia.slice(8, 10)} · {dias[activo].llamadas} llamada{dias[activo].llamadas === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
      <div className="grafica-dias-eje" aria-hidden="true">
        <span>1</span>
        <span>{Math.ceil(dias.length / 2)}</span>
        <span>{dias.length}</span>
      </div>
    </figure>
  );
}

function Tabla({ titulo, filas, conLlamadas = true }) {
  if (!filas?.length) return null;
  const celda = { padding: "var(--sp-1) 0" };
  return (
    <table className="tabla-consumo">
      <caption className="tabla-consumo-titulo">{titulo}</caption>
      <thead>
        <tr>
          <th scope="col" style={celda}>Qué</th>
          {conLlamadas && <th scope="col" style={{ ...celda, textAlign: "right" }}>Llamadas</th>}
          <th scope="col" style={{ ...celda, textAlign: "right" }}>Costo</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.id ?? f.nombre}>
            <td style={celda}>{mayus(f.nombre)}</td>
            {conLlamadas && <td style={{ ...celda, textAlign: "right" }}>{f.llamadas}</td>}
            <td style={{ ...celda, textAlign: "right" }}>{formatoUSD(f.costo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SeccionPresupuesto({ esAdmin, pulso = 0 }) {
  const [config, setConfig] = useState(CONFIG_IA_POR_DEFECTO);
  const [borrador, setBorrador] = useState("");
  const [mes, setMes] = useState(null);
  const [consumo, setConsumo] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [fallo, setFallo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ids = useId();

  const cargar = useCallback(async () => {
    const [a, c] = await Promise.allSettled([db.loadAjustes(), db.loadConsumoIA(mes ?? "")]);
    if (a.status === "fulfilled" && a.value) {
      setConfig({ ...CONFIG_IA_POR_DEFECTO, ...a.value });
      setBorrador(String(a.value.presupuesto_usd ?? CONFIG_IA_POR_DEFECTO.presupuesto_usd));
    }
    if (c.status === "fulfilled") {
      setConsumo(c.value);
      if (!mes) setMes(c.value.mes);
    }
  }, [mes]);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const guardar = async (cambios, texto) => {
    setGuardando(true);
    setFallo("");
    setMensaje("");
    try {
      const nuevo = await db.saveAjustes(cambios);
      setConfig({ ...CONFIG_IA_POR_DEFECTO, ...nuevo });
      setMensaje(texto);
      window.dispatchEvent(new Event(EVENTO_GASTO));
      setConsumo(await db.loadConsumoIA(mes ?? "").catch(() => consumo));
    } catch (e) {
      setFallo(e.message || "No se pudo guardar.");
    }
    setGuardando(false);
  };

  const guardarPresupuesto = (e) => {
    e.preventDefault();
    const v = Number(String(borrador).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) { setFallo("Escribe una cantidad en dólares, o 0 para no poner tope."); return; }
    void guardar({ presupuesto_usd: v }, v > 0 ? `Presupuesto del mes: ${formatoUSD(v)}.` : "Sin tope: la IA no se limita.");
  };

  const esEsteMes = consumo?.mes === fechaEnZona().slice(0, 7);
  const porcentaje = consumo?.porcentaje ?? 0;
  const estado = consumo?.estado ?? "libre";

  return (
    <section id="presupuesto" aria-labelledby={`${ids}-titulo`} className="ajustes-seccion">
      <h2 className="ajustes-titulo" id={`${ids}-titulo`}>
        <Icon name="chart" size={18} /> Presupuesto y consumo
      </h2>
      <p className="ajustes-intro">
        El tope del mes en dólares y qué pasa al llegar. Cuenta el texto de Claude, las búsquedas web y
        las imágenes y videos de Gemini.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        <form onSubmit={guardarPresupuesto} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "0 1 200px", marginBottom: 0 }}>
            <label className="label" htmlFor={`${ids}-tope`}>Presupuesto mensual (US$)</label>
            <input
              id={`${ids}-tope`}
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={borrador}
              disabled={!esAdmin || guardando}
              onChange={(e) => setBorrador(e.target.value)}
            />
          </div>
          {esAdmin && (
            <button className="btn btn-secondary" type="submit" disabled={guardando}>
              <Icon name="check" size={18} /> Guardar
            </button>
          )}
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", flexBasis: "100%" }}>
            0 = sin tope. Avisa en ámbar desde el 80 % y en rojo al llegar.
          </p>
        </form>

        <div>
          <p className="label" id={`${ids}-limite`} style={{ marginBottom: "var(--sp-1)" }}>Al llegar al presupuesto</p>
          <div className="segmented" role="group" aria-labelledby={`${ids}-limite`}>
            {ACCIONES_LIMITE.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`segmented-btn ${config.al_limite === a.id ? "active" : ""}`}
                aria-pressed={config.al_limite === a.id}
                disabled={!esAdmin || guardando}
                onClick={() => config.al_limite !== a.id && guardar({ al_limite: a.id }, "Guardado.")}
              >
                {a.nombre}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginTop: "var(--sp-1)" }}>
            {ACCIONES_LIMITE.find((a) => a.id === config.al_limite)?.nota}
          </p>
        </div>

        <div role="status" aria-live="polite">
          {mensaje && <p className="notice notice-ok" style={{ margin: 0 }}>{mensaje}</p>}
        </div>
        {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}

        {consumo && (
          <div className="ajustes-consumo">
            <div className="ajustes-consumo-cabecera">
              <button type="button" className="btn-icon" aria-label="Mes anterior" onClick={() => setMes(mesDe(consumo.mes, -1))}>
                <Icon name="chevronLeft" size={18} />
              </button>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--fs-sm)", minWidth: 150, textAlign: "center" }} aria-live="polite">{nombreMes(consumo.mes)}</p>
              <button type="button" className="btn-icon" aria-label="Mes siguiente" onClick={() => setMes(mesDe(consumo.mes, 1))}>
                <Icon name="chevronRight" size={18} />
              </button>
            </div>

            <div className="ajustes-cifra">
              <span className="ajustes-cifra-grande">{formatoUSD(consumo.total)}</span>
              {consumo.presupuesto > 0 && (
                <span className="ajustes-cifra-de">de {formatoUSD(consumo.presupuesto)}</span>
              )}
            </div>
            {consumo.presupuesto > 0 && (
              <div className="barra-presupuesto" data-estado={estado} role="img"
                aria-label={`${Math.round(porcentaje)} % del presupuesto`}>
                <span style={{ width: `${Math.min(porcentaje, 100)}%` }} />
              </div>
            )}
            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
              {consumo.llamadas} llamada{consumo.llamadas === 1 ? "" : "s"}
              {consumo.busquedas > 0 && <> · {consumo.busquedas} búsqueda{consumo.busquedas === 1 ? "" : "s"} web</>}
              {esEsteMes && estado === "agotado" && <strong style={{ color: "var(--danger)" }}> · Presupuesto alcanzado</strong>}
              {esEsteMes && estado === "aviso" && <strong style={{ color: "var(--accent-alt)" }}> · Cerca del presupuesto</strong>}
            </p>

            {consumo.porDia?.length > 0 && <GraficaDias dias={consumo.porDia} presupuesto={consumo.presupuesto} />}

            <div className="ajustes-tablas">
              <Tabla titulo="Por función" filas={consumo.porFuncion} />
              <Tabla titulo="Por cliente" filas={consumo.porCliente} />
              <Tabla
                titulo="Por proveedor"
                filas={(consumo.porProveedor ?? []).map((p) => ({ ...p, nombre: p.id === "gemini" ? "Gemini (imágenes y video)" : "Anthropic (texto)" }))}
              />
              <Tabla titulo="Por modelo" filas={consumo.porModelo} />
            </div>

            {consumo.masCaras?.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", minHeight: "var(--tap-sm)", display: "flex", alignItems: "center", fontSize: "var(--fs-2xs)" }}>
                  Las {consumo.masCaras.length} llamadas más caras del mes
                </summary>
                <div style={{ overflowX: "auto" }}>
                  <table className="tabla-consumo">
                    <caption className="sr-only">Llamadas más caras</caption>
                    <thead>
                      <tr>
                        <th scope="col">Cuándo</th>
                        <th scope="col">Qué</th>
                        <th scope="col">Cliente</th>
                        <th scope="col" style={{ textAlign: "right" }}>Tokens</th>
                        <th scope="col" style={{ textAlign: "right" }}>Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumo.masCaras.map((c, i) => (
                        <tr key={i}>
                          <td>{new Date(c.fecha).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                          <td>{mayus(c.funcion)} · {c.modelo}{c.busquedas ? ` · ${c.busquedas} búsq.` : ""}</td>
                          <td>{c.cliente || "—"}</td>
                          <td style={{ textAlign: "right" }}>{(c.entrada + c.salida).toLocaleString("es-PA")}</td>
                          <td style={{ textAlign: "right" }}>{formatoUSD(c.costo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              Calculado con la tarifa de cada modelo. El registro empezó el 24 de septiembre de 2026: lo de antes,
              y lo que gasten otras aplicaciones con la misma clave, sólo aparece en la{" "}
              <a href="https://console.anthropic.com/usage" target="_blank" rel="noreferrer">consola de Anthropic</a>
              {" "}(y lo de Gemini, en{" "}
              <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer">Google AI Studio</a>).
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
