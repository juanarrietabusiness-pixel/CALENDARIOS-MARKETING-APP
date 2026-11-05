// ============================================================
// El envoltorio de las pantallas del mes que viven DOS veces: sueltas, como
// diálogo (si alguien las abre por su cuenta), e INCRUSTADAS como un paso del
// asistente del mes (calendario/AsistenteMes.jsx): «Revisar las ideas»,
// «Diseñar las aprobadas» y «Revisar el mes».
//
// Incrustada no es un diálogo: no atrapa el foco ni oscurece el fondo (eso ya
// lo hace el asistente) y no lleva su propio «Cerrar». La ref del diálogo no se
// pone: `useDialogA11y` sin nodo no hace nada.
// ============================================================

export function Envoltura({ incrustado = false, refDialogo, titulo, children }) {
  if (incrustado) {
    return (
      <section className="revision-mes mes-incrustado" aria-labelledby={titulo}>
        {children}
      </section>
    );
  }
  return (
    <div className="overlay overlay-sheet">
      <div ref={refDialogo} role="dialog" aria-modal="true" aria-labelledby={titulo} className="sheet revision-mes" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
