import { useEffect, useState } from "react";
import Icon from "./Icon";
import { loadClientTasks } from "../lib/db";
import { contarAtrasadas, fechaEnZona } from "../lib/agenda";
import { resumenCalendario } from "../lib/resumenCliente";

// ============================================================
// Lo que hay que atender en este cliente, en una fila
//
// Por aprobar, con cambios pedidos, a medias y tareas atrasadas del mes
// abierto. Cada cifra lleva a donde se resuelve.
// ============================================================

export default function ResumenCliente({ client, calendar, pulso = 0, onIr }) {
  const [atrasadas, setAtrasadas] = useState(0);
  const clientId = client?.dbId || client?.id;

  useEffect(() => {
    let vivo = true;
    loadClientTasks(clientId)
      .then((t) => { if (vivo) setAtrasadas(contarAtrasadas(t, fechaEnZona())); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [clientId, pulso]);

  const r = resumenCalendario(calendar);
  const cifras = [
    { clave: "aprobar", n: r.porAprobar, texto: "por aprobar", icono: "clock", ir: "calendario" },
    { clave: "cambios", n: r.conCambios, texto: "con cambios pedidos", icono: "alert", ir: "calendario", tono: "aviso" },
    { clave: "incompletas", n: r.incompletas, texto: "a medias", icono: "pencil", ir: "calendario" },
    { clave: "tareas", n: atrasadas, texto: `tarea${atrasadas === 1 ? "" : "s"} atrasada${atrasadas === 1 ? "" : "s"}`, icono: "clipboardCheck", ir: "tareas", tono: "peligro" },
  ];

  return (
    <ul className="resumen-cliente" aria-label={calendar ? "Resumen del mes abierto" : "Resumen del cliente"}>
      {calendar && (
        <li className="resumen-cliente-total">
          <strong>{r.aprobadas + r.publicadas}</strong> de {r.publicaciones} aprobadas
        </li>
      )}
      {cifras.filter((c) => c.n > 0 && (calendar || c.clave === "tareas")).map((c) => (
        <li key={c.clave}>
          <button type="button" className="resumen-cliente-cifra" data-tono={c.tono} onClick={() => onIr(c.ir)}>
            <Icon name={c.icono} size={14} />
            <strong>{c.n}</strong> {c.texto}
          </button>
        </li>
      ))}
      {calendar && r.publicaciones > 0 && !r.porAprobar && !r.conCambios && !r.incompletas && !atrasadas && (
        <li className="resumen-cliente-ok"><Icon name="check" size={14} /> Todo al día</li>
      )}
    </ul>
  );
}
