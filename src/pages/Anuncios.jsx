import { lazy, Suspense, useId } from "react";
import BarraPestanas from "../components/BarraPestanas";
import { idDePestana, idDelPanel } from "../lib/pestanas";
import { navegar } from "../lib/rutas";
// Las pestañas van como píldoras, las mismas de las sub-secciones de un cliente.
import "../components/cliente/cliente.css";

// ============================================================
// «Anuncios»: las campañas de Meta y la Biblioteca de anuncios, como pestañas (fase 7)
//
// Eran dos secciones sueltas en la navegación —«Anuncios» y «Biblioteca de anuncios»—, con el mismo icono. Ahora es
// una con dos pestañas, y cada una conserva su dirección (`/campanas`, `/biblioteca`): los enlaces y las búsquedas
// guardadas de antes siguen abriendo lo suyo. Cada página se carga aparte, como antes.
// ============================================================

const Campanas = lazy(() => import("./Campanas"));
const Biblioteca = lazy(() => import("./Biblioteca"));

const PESTANAS = Object.freeze([
  ["campanas", "Campañas", "megaphone"],
  ["biblioteca", "Biblioteca de anuncios", "search"],
]);

export default function Anuncios({ vista = "campanas", clients = [], pulso = 0, yo = {}, onClienteNuevo = null }) {
  const ids = useId();
  const actual = vista === "biblioteca" ? "biblioteca" : "campanas";
  return (
    <div className="anuncios">
      <BarraPestanas
        etiqueta="Anuncios"
        pestanas={PESTANAS}
        actual={actual}
        base={ids}
        clase="subpestanas"
        claseItem="subpestana"
        onElegir={(id) => navegar(id === "biblioteca" ? "/biblioteca" : "/campanas")}
      />
      <div role="tabpanel" id={idDelPanel(ids)} aria-labelledby={idDePestana(ids, actual)} style={{ marginTop: "var(--sp-4)" }}>
        <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
          {actual === "biblioteca"
            ? <Biblioteca clients={clients} pulso={pulso} />
            : <Campanas clients={clients} pulso={pulso} yo={yo} onClienteNuevo={onClienteNuevo} />}
        </Suspense>
      </div>
    </div>
  );
}
