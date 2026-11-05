import { lazy, Suspense, useEffect, useState } from "react";
import Icon from "./Icon";

// ============================================================
// «¿Qué quieres crear?»: el director creativo del cliente, arriba de la pestaña Crear (fase 7; era la pestaña «Diseño»)
//
// Es el MISMO asistente de siempre (ChatPanel), en la página y no flotando,
// con sus conversaciones de diseño (tema «diseno»: las ve todo el equipo,
// también desde el chat, con su etiqueta). Se le dice lo que se quiere con
// palabras sencillas; él razona el concepto y la composición de cada pieza
// (src/lib/director.js), enseña el plan con su costo, crea en lote, revisa
// cada imagen y la corrige (src/lib/disenoChat.js). Lo que aprende —reglas,
// plantillas— va al kit del cliente: vale en todas partes.
//
// Los atajos dejan escrito el encargo para completarlo con lo de cada uno. Las RECETAS (src/lib/recetas.js) también:
// «Crear aquí» deja «/receta <id>» y el director la lee con su herramienta `receta`. Una receta puede llegar por la
// dirección (`?receta=<id>&post=<id>`, desde una publicación): se escribe y la dirección se limpia.
// ============================================================

import { ATAJOS_DIRECTOR } from "../lib/director";

/** El mismo comando que `mensajeParaElAsistente` (lib/recetas.js), aquí sin importarlo: arrastraría todas las recetas. */
const encargoDeReceta = (id, extra = "") => [`/receta ${id}`, String(extra ?? "").trim()].filter(Boolean).join(" — ");

const ChatPanel = lazy(() => import("./ChatPanel"));
const Recetas = lazy(() => import("./Recetas"));

/** El encargo de una receta que llega por la dirección, o null. La dirección se limpia (no se repite al recargar). */
function recetaDeLaDireccion() {
  const q = new URLSearchParams(window.location.search);
  const receta = q.get("receta");
  if (!receta || !/^[a-z0-9-]{2,60}$/.test(receta)) return null;
  const post = q.get("post");
  const pide = (q.get("pide") ?? "").slice(0, 300);
  window.history.replaceState(window.history.state, "", window.location.pathname);
  const para = post && /^[\w-]{1,80}$/.test(post) ? `para la publicación ${post}` : "";
  return { texto: encargoDeReceta(receta, [para, pide].filter(Boolean).join(": ")), n: 1 };
}

/** `asistente`: lo que el chat necesita del calendario abierto ({ calendar, calId, clients, onUpdateCal, onCrearEnOtroMes }). */
export default function DisenoDirector({ client, asistente }) {
  const [borrador, setBorrador] = useState(null);
  const [recetas, setRecetas] = useState(false);
  useEffect(() => { const b = recetaDeLaDireccion(); if (b) setBorrador(b); }, []);

  return (
    <section aria-label={`Diseño con el director creativo de ${client.name}`}>
      <div className="diseno-cabecera" style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", justifyContent: "space-between", flexWrap: "wrap", margin: "0 0 var(--sp-2)" }}>
        <p className="hint" style={{ margin: 0, flex: "1 1 320px" }}>
          Dile qué quieres con tus palabras. Él diseña la tanda, te enseña el plan con su costo, crea al pulsar «Crear», revisa
          cada imagen y corrige las que salgan mal. Lo creado queda en la galería, aquí debajo; lo que va a una publicación, en ella.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecetas(true)}>
          <Icon name="list" size={16} /> Recetas
        </button>
      </div>
      <Suspense fallback={<p role="status" className="hint">Abriendo el director…</p>}>
        <ChatPanel
          client={client}
          calendar={asistente?.calendar ?? null}
          calId={asistente?.calId ?? null}
          clients={asistente?.clients ?? []}
          onUpdateCal={asistente?.onUpdateCal}
          onCrearEnOtroMes={asistente?.onCrearEnOtroMes ?? null}
          onCambiarPublicacion={asistente?.onCambiarPublicacion ?? null}
          onClose={null}
          defaultMode="client"
          incrustado
          tema="diseno"
          atajos={ATAJOS_DIRECTOR}
          borrador={borrador}
        />
      </Suspense>
      {recetas && (
        <Suspense fallback={null}>
          <Recetas
            clienteId={client.id}
            onCrearAqui={(r) => { setBorrador((b) => ({ texto: encargoDeReceta(r.id), n: (b?.n ?? 0) + 1 })); setRecetas(false); }}
            onCerrar={() => setRecetas(false)}
          />
        </Suspense>
      )}
    </section>
  );
}
