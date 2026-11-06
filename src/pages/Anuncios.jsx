import { lazy, Suspense, useId } from "react";
import BarraPestanas from "../components/BarraPestanas";
import { idDePestana, idDelPanel } from "../lib/pestanas";
import { navegar } from "../lib/rutas";
// Las pestañas van como píldoras, las mismas de las sub-secciones de un cliente.
import "../components/cliente/cliente.css";

// ============================================================
// «Anuncios»: las campañas de Meta, el plan de campañas y la Biblioteca de anuncios, como pestañas (fase 7)
//
// Eran dos secciones sueltas en la navegación —«Anuncios» y «Biblioteca de anuncios»—, con el mismo icono. Ahora es
// una con pestañas, y cada una conserva su dirección (`/campanas`, `/plan-campanas`, `/biblioteca`): los enlaces y las
// búsquedas guardadas de antes siguen abriendo lo suyo. Cada página se carga aparte, como antes. El plan de campañas
// (el ciclo entero para montar en el Ads Manager) es de la entrega 6 del curso de campañas.
// ============================================================

const Campanas = lazy(() => import("./Campanas"));
const Biblioteca = lazy(() => import("./Biblioteca"));
const PlanCampanas = lazy(() => import("./PlanCampanas"));

const PESTANAS = Object.freeze([
  ["campanas", "Campañas", "megaphone"],
  ["plan-campanas", "Plan de campañas", "layers"],
  ["biblioteca", "Biblioteca de anuncios", "search"],
]);
const RUTA = { campanas: "/campanas", "plan-campanas": "/plan-campanas", biblioteca: "/biblioteca" };

export default function Anuncios({ vista = "campanas", clients = [], pulso = 0, yo = {}, onClienteNuevo = null }) {
  const ids = useId();
  const actual = RUTA[vista] ? vista : "campanas";
  return (
    <div className="anuncios">
      <BarraPestanas
        etiqueta="Anuncios"
        pestanas={PESTANAS}
        actual={actual}
        base={ids}
        clase="subpestanas"
        claseItem="subpestana"
        onElegir={(id) => navegar(RUTA[id] ?? "/campanas")}
      />
      <div role="tabpanel" id={idDelPanel(ids)} aria-labelledby={idDePestana(ids, actual)} style={{ marginTop: "var(--sp-4)" }}>
        <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
          {actual === "biblioteca"
            ? <Biblioteca clients={clients} pulso={pulso} />
            : actual === "plan-campanas"
              ? <PlanCampanas clients={clients} pulso={pulso} yo={yo} onClienteNuevo={onClienteNuevo} />
              : <Campanas clients={clients} pulso={pulso} yo={yo} onClienteNuevo={onClienteNuevo} />}
        </Suspense>
      </div>
    </div>
  );
}
