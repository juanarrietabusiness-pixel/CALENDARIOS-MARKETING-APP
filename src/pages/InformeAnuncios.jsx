import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import InformeAnunciosVista from "../components/anuncios/InformeAnunciosVista";
import { informeAnunciosPublico } from "../lib/db";

// ============================================================
// /informe-anuncios?t=… — el informe de publicidad que abre el cliente
//
// Sin sesión, como el informe de redes: el testigo del enlace es todo lo
// que hace falta, y sólo abre uno que la agencia haya compartido. Si la
// agencia no enseña el costo por resultado, el servidor ya no lo manda.
// ============================================================

export default function InformeAnuncios() {
  const testigo = new URLSearchParams(window.location.search).get("t") ?? "";
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    informeAnunciosPublico(testigo)
      .then((d) => {
        setDatos(d);
        document.title = `Publicidad de ${d.cliente?.name ?? "tu marca"} · ${d.cifras?.nombreMes ?? d.mes}`;
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
      <InformeAnunciosVista informe={datos} cliente={datos.cliente} />
    </main>
  );
}
