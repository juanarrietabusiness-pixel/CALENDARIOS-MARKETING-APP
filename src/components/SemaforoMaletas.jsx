import { useId, useState } from "react";
import Icon from "./Icon";
import { saveClientTask } from "../lib/db";
import { EVENTO_CAMBIO } from "../lib/agenda";
import { fmtDate } from "../utils";
import { semaforoMaletas, resumenDeMaletas, tareaParaElCliente } from "../lib/maletas";
// Sus estilos van con el componente: lo usa el estudio de mercado y lo podrá usar el plan de campañas.
import "./SemaforoMaletas.css";

// ============================================================
// El semáforo de las 7 maletas, en pantalla (lib/maletas.js)
//
//   · MaletasDeProducto: las siete de un producto del estudio de mercado,
//     cada una con su color y su arreglo, y el aviso «si falta una, no
//     lances». Va dentro de la revisión del estudio, por producto.
//   · ResumenMaletas: un renglón por producto (cuántos se pueden anunciar y
//     qué falta), en la tarjeta del estudio de Marca → Cerebro.
//
// Lo que sólo puede dar el cliente (testimonios, garantía) lleva «Pedírselo
// al cliente»: una tarea suya con el mensaje listo para mandarle.
// ============================================================

const NOMBRE_ESTADO = { verde: "Lista", ambar: "Floja", rojo: "Falta" };
const ICONO_ESTADO = { verde: "check", ambar: "alert", rojo: "close" };

/** «Pedírselo al cliente»: crea la tarea del cliente con el mensaje listo (una vez por pantalla). */
function PedirAlCliente({ client, producto = "", claves = [], lectura = false }) {
  const [estado, setEstado] = useState(""); // "", "creando", "hecha", o el error
  const tarea = tareaParaElCliente({ marca: client?.name ?? "", producto, claves });
  if (!tarea || lectura) return null;
  const crear = async () => {
    if (estado === "creando" || estado === "hecha") return;
    setEstado("creando");
    try {
      await saveClientTask({ client_id: client.dbId || client.id, ...tarea, recurrence: "none", today_date: fmtDate(new Date()) });
      // El contador de atrasadas y Mi día releen con esto (el eco de la propia pestaña no llega por el socket).
      window.dispatchEvent(new Event(EVENTO_CAMBIO));
      setEstado("hecha");
    } catch (e) {
      setEstado(e.message || "No se pudo crear la tarea.");
    }
  };
  return (
    <span className="maletas-pedir">
      {/* `aria-disabled` y no `disabled`: un botón que se desactiva con el foco encima lo suelta al <body>, y dentro del
          diálogo del estudio Escape y Tab dejaban de funcionar. */}
      <button type="button" className="btn btn-secondary btn-sm" aria-disabled={estado === "creando" || estado === "hecha"} onClick={crear}>
        <Icon name="send" size={14} /> {estado === "creando" ? "Creando la tarea…" : estado === "hecha" ? "Tarea creada" : "Pedírselo al cliente"}
      </button>
      <span role="status" className="hint">
        {estado === "hecha" ? `En las tareas de ${client.name}, para hoy, con el mensaje listo.` : estado && estado !== "creando" ? estado : ""}
      </span>
    </span>
  );
}

/** Las 7 maletas de un producto del estudio, con su color, su arreglo y el aviso. */
export function MaletasDeProducto({ client, estudio, producto = "", lectura = false }) {
  const ids = useId();
  const s = semaforoMaletas(estudio);
  const delCliente = s.maletas.filter((m) => m.delCliente && m.estado !== "verde").map((m) => m.clave);
  return (
    <section className="maletas" data-estado={s.estado} aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="maletas-aviso">
        <span className="maletas-luz" aria-hidden="true"><Icon name={ICONO_ESTADO[s.estado]} size={12} /></span>
        <strong>Las 7 maletas:</strong> {s.aviso}
      </p>
      <ul className="maletas-lista">
        {s.maletas.map((m) => (
          <li key={m.clave} data-estado={m.estado}>
            <span className="maletas-luz" aria-hidden="true"><Icon name={ICONO_ESTADO[m.estado]} size={12} /></span>
            <span className="maletas-texto">
              <span><strong>{m.titulo}</strong> <span className="hint">· {NOMBRE_ESTADO[m.estado]}{m.estado !== "verde" ? `: ${m.motivo}` : ""}</span></span>
              {m.arreglo && <span className="hint">{m.arreglo}</span>}
            </span>
          </li>
        ))}
      </ul>
      {delCliente.length > 0 && <PedirAlCliente client={client} producto={producto} claves={delCliente} lectura={lectura} />}
    </section>
  );
}

/** El resumen de las maletas de todos los productos activos (la tarjeta del estudio de mercado). */
export function ResumenMaletas({ client, estudio, catalogo = [], lectura = false }) {
  const ids = useId();
  const r = resumenDeMaletas(estudio, catalogo);
  if (!r.total) return null;
  const sinEstudio = r.productos.every((p) => p.sinEstudio);
  return (
    <section className="maletas-resumen" aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="maletas-resumen-titulo">
        <strong>Las 7 maletas:</strong>
        <span className="hint"> {sinEstudio ? "sin estudio de mercado todavía" : `${r.listos} de ${r.total} ${r.total === 1 ? "producto se puede anunciar" : "productos se pueden anunciar"}`} (si falta una maleta, no se lanza)</span>
      </p>
      {!sinEstudio && (
        <ul className="maletas-resumen-lista">
          {r.productos.map((p) => (
            <li key={p.id} data-estado={p.estado}>
              <span className="maletas-luz" aria-hidden="true"><Icon name={ICONO_ESTADO[p.estado]} size={12} /></span>
              <span className="maletas-texto">
                <strong>{p.nombre}</strong>
                <span className="hint">{p.sinEstudio ? "Sin estudio: haz su paso del estudio de mercado." : p.aviso}</span>
              </span>
              {!p.sinEstudio && p.delCliente.length > 0 && <PedirAlCliente client={client} producto={p.nombre} claves={p.delCliente} lectura={lectura} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
