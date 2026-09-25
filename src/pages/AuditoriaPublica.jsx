import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import AuditoriaVista from "../components/AuditoriaVista";
import { auditoriaPublica } from "../lib/db";

// ============================================================
// /auditoria?t=… — la auditoría de perfil que abre el cliente o el
// prospecto
//
// Sin sesión, como el informe: el testigo del enlace es todo lo que hace
// falta, y sólo abre una auditoría que la agencia haya compartido.
// «Descargar PDF» es imprimir.
// ============================================================

export default function AuditoriaPublica() {
  const testigo = new URLSearchParams(window.location.search).get("t") ?? "";
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    auditoriaPublica(testigo)
      .then((d) => {
        setDatos(d);
        document.title = `Auditoría de @${d.usuario} · Juancito Ads`;
      })
      .catch((e) => setFallo(/no encontrad/i.test(e.message) ? "Este enlace no existe o ya no está disponible." : e.message));
  }, [testigo]);

  if (fallo) return <main className="auditoria-pagina"><p role="alert" className="notice notice-error">{fallo}</p></main>;
  if (!datos) return <main className="auditoria-pagina"><p role="status" className="hint">Cargando la auditoría…</p></main>;

  return (
    <main className="auditoria-pagina">
      <div className="auditoria-acciones no-imprimir">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="download" size={16} /> Descargar PDF
        </button>
      </div>
      <AuditoriaVista auditoria={datos} cliente={datos.cliente} />
    </main>
  );
}
