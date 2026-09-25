import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import InformeVista from "../components/InformeVista";
import { informePublico } from "../lib/db";

// ============================================================
// /informe?t=… — el informe mensual que abre el cliente
//
// Sin sesión, como la página de aprobación: el testigo del enlace es
// todo lo que hace falta, y sólo abre un informe que la agencia haya
// compartido. «Descargar PDF» es imprimir: el navegador guarda como PDF.
// ============================================================

export default function Informe() {
  const testigo = new URLSearchParams(window.location.search).get("t") ?? "";
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    informePublico(testigo)
      .then((d) => {
        setDatos(d);
        document.title = `Informe de ${d.cliente?.name ?? "redes"} · ${d.cifras?.nombreMes ?? d.mes}`;
      })
      .catch((e) => setFallo(/no encontrado/i.test(e.message) ? "Este enlace no existe o ya no está disponible." : e.message));
  }, [testigo]);

  if (fallo) return <main className="informe-pagina"><p role="alert" className="notice notice-error">{fallo}</p></main>;
  if (!datos) return <main className="informe-pagina"><p role="status" className="hint">Cargando el informe…</p></main>;

  return (
    <main className="informe-pagina">
      <div className="informe-acciones no-imprimir">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="download" size={16} /> Descargar PDF
        </button>
      </div>
      <InformeVista informe={datos} cliente={datos.cliente} />
    </main>
  );
}
