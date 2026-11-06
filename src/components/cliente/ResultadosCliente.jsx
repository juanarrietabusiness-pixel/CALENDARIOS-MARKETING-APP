import { lazy, Suspense, useId } from "react";
import BarraPestanas from "../BarraPestanas";
import { idDePestana, idDelPanel } from "../../lib/pestanas";
import "./cliente.css";

// ============================================================
// La pestaña «Resultados» de un cliente, con sus dos sub-secciones (curso de campañas, entrega 5)
//
//   · Redes    — lo de siempre (pages/Resultados.jsx): lo que pasó después de publicar en sus redes.
//   · Anuncios — la REVISIÓN 3Q de lo que corre en su cuenta del Ads Manager (anuncios/Revision3Q.jsx): el número
//                mágico frente a lo real, cada campaña con su etapa y qué hacer. Abrirla cuenta como «revisada» para Mi
//                día. Al cliente no se le enseña nada de esto.
//
// Cada una en su chunk: la revisión no se descarga hasta que se abre.
// ============================================================

const Redes = lazy(() => import("../../pages/Resultados"));
const Revision3Q = lazy(() => import("../anuncios/Revision3Q"));

const SUBPESTANAS_RESULTADOS = Object.freeze([
  ["redes", "Redes", "chart"],
  ["anuncios", "Anuncios", "megaphone"],
]);

/**
 * @param seccion  «redes» | «anuncios» | null (la de entrada: redes)
 * @param onIr     (pestaña, sub-sección) → navega
 */
export default function ResultadosCliente({ client, seccion = null, pulso = 0, yo = {}, onIr, onPersistClient }) {
  const ids = useId();
  const actual = seccion === "anuncios" ? "anuncios" : "redes";
  return (
    <div className="subseccion resultados-cliente">
      <BarraPestanas
        etiqueta={`Resultados de ${client.name}`}
        pestanas={SUBPESTANAS_RESULTADOS}
        actual={actual}
        base={ids}
        clase="subpestanas"
        claseItem="subpestana"
        onElegir={(id) => onIr?.("resultados", id)}
      />
      <div role="tabpanel" id={idDelPanel(ids)} aria-labelledby={idDePestana(ids, actual)} className="subseccion-panel">
        <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
          {actual === "redes" && <Redes client={client} pulso={pulso} onPersistClient={onPersistClient} />}
          {actual === "anuncios" && (
            <Revision3Q key={client.id} client={client} esAdmin={yo?.rol === "admin"} soloLectura={Boolean(yo?.soloLectura)} />
          )}
        </Suspense>
      </div>
    </div>
  );
}
