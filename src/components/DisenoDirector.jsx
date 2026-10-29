import { lazy, Suspense } from "react";

// ============================================================
// La pestaña «Diseño»: el director creativo del cliente
//
// Es el MISMO asistente de siempre (ChatPanel), en la página y no flotando,
// con sus conversaciones de diseño (tema «diseno»: las ve todo el equipo,
// también desde el chat, con su etiqueta). Se le dice lo que se quiere con
// palabras sencillas; él razona el concepto y la composición de cada pieza
// (src/lib/director.js), enseña el plan con su costo, crea en lote, revisa
// cada imagen y la corrige (src/lib/disenoChat.js). Lo que aprende —reglas,
// plantillas— va al kit del cliente: vale en todas partes.
//
// Los atajos dejan escrito el encargo para completarlo con lo de cada uno.
// ============================================================

import { ATAJOS_DIRECTOR } from "../lib/director";

const ChatPanel = lazy(() => import("./ChatPanel"));



/** `asistente`: lo que el chat necesita del calendario abierto ({ calendar, calId, clients, onUpdateCal, onCrearEnOtroMes }). */
export default function DisenoDirector({ client, asistente }) {
  return (
    <section aria-label={`Diseño con el director creativo de ${client.name}`}>
      <p className="hint" style={{ margin: "0 0 var(--sp-2)" }}>
        Dile qué quieres con tus palabras. Él diseña la tanda, te enseña el plan con su costo, crea al pulsar «Crear», revisa
        cada imagen y corrige las que salgan mal. Lo creado queda en el Estudio; lo que va a una publicación, en ella.
      </p>
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
        />
      </Suspense>
    </section>
  );
}
