import { useId, useState } from "react";
import Icon from "./Icon";
import ElegirDia from "./ElegirDia";
import { useTareas, hecha, claveTarea, esDe } from "../hooks/useTareas";
import { clasificar, fechaEnZona, empresaDelPrefijo } from "../lib/agenda";
import { navegar } from "../lib/rutas";

// ============================================================
// «Tus tareas de hoy» en el inicio
//
// Aquí iba un panel de «Tareas rápidas» con su propia lista: lo que se
// apuntaba ahí no tenía día, así que en Mi día y en el panel lateral caía
// en un bloque plegado al fondo y nadie lo veía. Ahora el inicio enseña lo
// MISMO que Mi día —lo de hoy, de la persona y lo sin asignar— y lo que se
// apunta lleva su día (hoy por defecto). Una tarea sin empresa sigue
// siendo una tarea rápida; «Dcasa: revisar copys» la deja en Dcasa.
// ============================================================

export default function HoyInicio({ clients = [], yo = null, pulso = 0 }) {
  const t = useTareas(pulso);
  const hoy = fechaEnZona();
  const textoId = useId();
  const [texto, setTexto] = useState("");
  const [dia, setDia] = useState(hoy);
  const [enviando, setEnviando] = useState(false);
  const nombreDe = (id) => clients.find((c) => c.id === id || c.dbId === id)?.name ?? "";
  const visibles = t.todas.filter((x) => esDe(x, yo, { sinAsignar: true }));
  const bloques = clasificar(visibles, hoy);
  const nAtrasadas = bloques.atrasadas.length;
  const nSinDia = bloques.sinFecha.length;

  const enviar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    const { clienteId, titulo } = empresaDelPrefijo(limpio, clients);
    setEnviando(true);
    const fila = await t.crear({ titulo, empresa: clienteId ?? "", today_date: dia || null, assigned_to: yo?.nombre ?? "" });
    setEnviando(false);
    if (fila) setTexto("");
  };
  const abrir = (e) => { e.preventDefault(); navegar("/tareas"); };

  return (
    <section className="hoy-inicio" aria-labelledby={`${textoId}-t`}>
      <div className="hoy-inicio-cabecera">
        <h2 id={`${textoId}-t`}><Icon name="clock" size={18} /> Tus tareas de hoy{bloques.hoy.length ? ` · ${bloques.hoy.length}` : ""}</h2>
        <a href="/tareas" onClick={abrir}>Abrir Mi día</a>
      </div>
      {t.error && <p role="alert" className="notice notice-error">{t.error}</p>}
      {!t.loading && bloques.hoy.length === 0 && <p className="hint">Nada para hoy.</p>}
      {bloques.hoy.length > 0 && (
        <ul className="hoy-inicio-lista">
          {bloques.hoy.map(({ tarea }) => (
            <li key={claveTarea(tarea)}>
              <button type="button" className="dia-check" aria-pressed={hecha(tarea)} onClick={() => t.alternarHecha(tarea)} aria-label={`Completar: ${tarea.title}`}>
                <Icon name="square" size={18} />
              </button>
              <span className="hoy-inicio-titulo">{tarea.title}</span>
              {!tarea._rapida && nombreDe(tarea.client_id) && <span className="dia-empresa" style={{ cursor: "default" }}>{nombreDe(tarea.client_id)}</span>}
            </li>
          ))}
        </ul>
      )}
      {(nAtrasadas > 0 || nSinDia > 0) && (
        <p className="hint" style={{ margin: 0 }}>
          {[nAtrasadas && `${nAtrasadas} atrasada${nAtrasadas === 1 ? "" : "s"}`, nSinDia && `${nSinDia} por agendar`].filter(Boolean).join(" · ")}
          {" — "}<a href="/tareas" onClick={abrir}>verlas en Mi día</a>
        </p>
      )}
      {!yo?.soloLectura && (
        <form className="hoy-inicio-nueva" onSubmit={enviar}>
          <label htmlFor={textoId} className="sr-only">Nueva tarea</label>
          <input id={textoId} className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nueva tarea (o «Empresa: tarea»)" autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={!texto.trim() || enviando}><Icon name="plus" size={16} /> Añadir</button>
          <ElegirDia value={dia} onChange={setDia} etiqueta="¿Cuándo la haces?" />
        </form>
      )}
    </section>
  );
}
