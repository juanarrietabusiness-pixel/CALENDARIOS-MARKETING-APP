import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import InformeVista from "./InformeVista";
import * as db from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { fechaEnZona, sumarDias } from "../lib/agenda";

// ============================================================
// Resultados → Informes mensuales
//
// El del mes anterior sale solo el día 1. Aquí se genera a mano (o se
// regenera), se revisa ANTES de mandarlo, y se comparte con un enlace
// que el cliente abre sin cuenta y puede guardar como PDF.
// ============================================================

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes) => { const [a, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${a}`; };

/** Los últimos seis meses cerrados, del más reciente al más viejo. */
function mesesCerrados() {
  const salida = [];
  let dia = `${fechaEnZona().slice(0, 7)}-01`;
  for (let i = 0; i < 6; i++) {
    dia = sumarDias(dia, -1);
    salida.push(dia.slice(0, 7));
    dia = `${dia.slice(0, 7)}-01`;
  }
  return salida;
}

function DialogoInforme({ informe, client, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  return (
    <div className="overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="dialog dialogo-informe">
        <div className="dialogo-informe-cabecera no-imprimir">
          <h2 id={`${ids}-t`}>Informe de {nombreMes(informe.mes)}</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Icon name="download" size={16} /> Imprimir o guardar PDF
          </button>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar el informe"><Icon name="close" /></button>
        </div>
        <InformeVista informe={informe.contenido} cliente={client} />
      </div>
    </div>
  );
}

export default function SeccionInformes({ client, pulso = 0 }) {
  const ids = useId();
  const clientId = client?.dbId || client?.id;
  const meses = mesesCerrados();
  const [informes, setInformes] = useState([]);
  const [mes, setMes] = useState(meses[0]);
  const [trabajando, setTrabajando] = useState("");
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(() => {
    db.listarInformes(clientId).then(setInformes).catch((e) => setFallo(e.message));
  }, [clientId]);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const hacer = async (clave, accion, ok = "") => {
    setTrabajando(clave);
    setFallo("");
    setAviso("");
    try {
      const r = await accion();
      if (ok) setAviso(ok);
      cargar();
      return r;
    } catch (e) {
      setFallo(e.message);
      return null;
    } finally {
      setTrabajando("");
    }
  };

  const enlaceDe = (t) => `${window.location.origin}/informe?t=${t}`;
  const copiar = async (texto) => {
    try { await navigator.clipboard.writeText(texto); setAviso("Enlace copiado: pégalo en el correo o WhatsApp del cliente."); } catch { setAviso(texto); }
  };
  const existente = informes.find((i) => i.mes === mes);

  return (
    <section className="resultados-tarjeta" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`}>Informes mensuales</h3>
      <p className="hint">
        El del mes anterior se prepara solo el día 1. La IA escribe el análisis con las cifras del mes; revísalo y compártelo
        con el cliente, que lo abre sin cuenta y puede guardarlo en PDF.
      </p>

      <div className="informes-generar">
        <label htmlFor={`${ids}-m`} className="sr-only">Mes del informe</label>
        <select id={`${ids}-m`} className="input" value={mes} onChange={(e) => setMes(e.target.value)} disabled={!!trabajando}>
          {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!!trabajando}
          onClick={() => {
            if (existente && !window.confirm(`Ya hay un informe de ${nombreMes(mes)}. ¿Volver a escribirlo? El enlace del cliente se mantiene.`)) return;
            void hacer("generar", () => db.generarInforme(clientId, mes), "Informe listo.");
          }}
        >
          <Icon name="sparkles" size={16} /> {trabajando === "generar" ? "Escribiendo el informe…" : existente ? "Regenerar" : "Generar informe"}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {trabajando === "generar" && <p className="hint">La IA está leyendo las cifras del mes. Tarda uno o dos minutos.</p>}
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {informes.length > 0 && (
        <ul className="informes-lista" aria-label="Informes de este cliente">
          {informes.map((inf) => (
            <li key={inf.id}>
              <span className="informes-mes">{nombreMes(inf.mes)}</span>
              <span className="informes-estado" data-estado={inf.estado}>
                {inf.estado === "listo" ? (inf.compartido ? "Compartido" : "Listo") : inf.estado === "generando" ? "Escribiéndose…" : "Falló"}
              </span>
              {inf.estado === "error" && <span className="informes-error">{inf.error}</span>}
              <span className="informes-acciones">
                {inf.estado === "listo" && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                    onClick={async () => { const d = await hacer(`v-${inf.id}`, () => db.leerInforme(inf.id)); if (d) setAbierto(d); }}>
                    <Icon name="file" size={14} /> Ver
                  </button>
                )}
                {inf.estado === "listo" && (inf.compartido ? (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copiar(enlaceDe(inf.testigo))}>
                      <Icon name="copy" size={14} /> Copiar enlace
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!!trabajando}
                      onClick={() => hacer(`d-${inf.id}`, () => db.dejarDeCompartirInforme(inf.id), "El enlace dejó de funcionar.")}>
                      Dejar de compartir
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!trabajando}
                    onClick={async () => { const r = await hacer(`c-${inf.id}`, () => db.compartirInforme(inf.id)); if (r?.testigo) await copiar(enlaceDe(r.testigo)); }}>
                    <Icon name="link" size={14} /> Compartir con el cliente
                  </button>
                ))}
                <button type="button" className="btn-icon" aria-label={`Borrar el informe de ${nombreMes(inf.mes)}`} disabled={!!trabajando}
                  onClick={() => { if (window.confirm(`¿Borrar el informe de ${nombreMes(inf.mes)}? Su enlace dejará de funcionar.`)) void hacer(`b-${inf.id}`, () => db.borrarInforme(inf.id)); }}>
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {abierto && <DialogoInforme informe={abierto} client={client} onClose={() => setAbierto(null)} />}
    </section>
  );
}
