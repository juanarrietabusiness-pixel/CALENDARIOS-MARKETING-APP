import { useEffect, useMemo, useState } from "react";
import * as db from "../lib/db";
import { cargaDelEquipo } from "../lib/trabajo";
import { fechaEnZona, sumarDias } from "../lib/agenda";
import { Avatar } from "./Presencia";

// ============================================================
// La carga del equipo: qué tiene cada persona los próximos siete días
//
// Publicaciones que lleva (sin publicar) y tareas abiertas, por día, y
// cuántas van atrasadas. Sirve para repartir antes de que alguien se
// ahogue y otro esté mirando el techo. Lo que no lleva nadie sale al
// final, «Sin asignar»: es lo que más se pierde.
// ============================================================

const DIAS = 7;

export default function CargaEquipo({ clients = [], miembros = [], pulso = 0 }) {
  const [tareas, setTareas] = useState([]);
  const hoy = fechaEnZona();
  useEffect(() => {
    let vivo = true;
    db.loadAllTasks()
      .then(({ clientTasks = [], quickTasks = [] }) => { if (vivo) setTareas([...clientTasks, ...quickTasks]); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);

  const filas = useMemo(() => cargaDelEquipo({ miembros, clients, tareas, hoy, dias: DIAS }), [miembros, clients, tareas, hoy]);
  const dias = Array.from({ length: DIAS }, (_, i) => sumarDias(hoy, i));
  const maximo = Math.max(1, ...filas.flatMap((f) => dias.map((d) => f.porDia[d] ?? 0)));

  return (
    <section aria-labelledby="carga-equipo-t">
      <h2 className="label" id="carga-equipo-t">Carga de los próximos {DIAS} días</h2>
      <div className="carga-tabla-caja">
        <table className="carga-tabla">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              {dias.map((d) => (
                <th key={d} scope="col">{new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PA", { timeZone: "UTC", weekday: "short", day: "numeric" })}</th>
              ))}
              <th scope="col">Atrasadas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.userId ?? "sin"}>
                <th scope="row">
                  <span className="carga-quien">
                    {f.userId ? <Avatar persona={f} tamano={24} /> : null}
                    <span>{f.nombre}<span className="hint"> · {f.publicaciones} publ. · {f.tareas} tareas</span></span>
                  </span>
                </th>
                {dias.map((d) => {
                  const n = f.porDia[d] ?? 0;
                  return (
                    <td key={d} data-nivel={n === 0 ? 0 : n / maximo > 0.66 ? 3 : n / maximo > 0.33 ? 2 : 1}>
                      {n || ""}
                    </td>
                  );
                })}
                <td data-atraso={f.atrasadas > 0 || undefined}>{f.atrasadas || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Cuenta las publicaciones que cada persona lleva (sin publicar) y sus tareas abiertas con fecha.</p>
    </section>
  );
}
