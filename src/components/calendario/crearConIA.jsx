import { lazy, Suspense, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { promptDePublicacion, proporcionParaFormato } from "../../lib/estudio";
import { presetDePilar } from "../../lib/pilares";

// ============================================================
// «Crear con IA» dentro del panel de una publicación
//
// El Estudio del cliente en un diálogo. Sale con el formato y la idea de la
// publicación ya puestos, y cada pieza tiene «Usar en la publicación», que la
// añade a sus medios sin pasar por la galería. Se carga aparte: quien no lo
// abre no lo descarga.
//
// Lo que se crea aquí queda TAMBIÉN en la galería del cliente (pestaña Estudio),
// con su prompt y lo que costó.
// ============================================================

const Estudio = lazy(() => import("../Estudio"));

/**
 * @param tipo    "imagen" | "video": con qué arranca el compositor.
 * @param inicio  un archivo del Estudio (`archivoDesdeSrc`) que será la imagen inicial del video («Animar»).
 * @param uso     { calendarId, postId }: para apuntar que esta publicación usa lo que se cree.
 * @param onUsar  recibe el archivo escogido.
 */
export default function CrearConIA({ client, post, tipo = "imagen", inicio = null, uso = null, onUsar, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  // Sólo cuenta al abrir: el compositor no se reinicia si la publicación cambia detrás.
  const [inicial] = useState(() => ({
    tipo,
    inicio,
    proporcion: proporcionParaFormato(post.format, tipo),
    // El estilo de la marca que le va a su tipo de contenido (Anuncio, Producto, Corporativo, Creativo).
    preset: presetDePilar(post.pilar),
    prompt: inicio
      ? `Anima esta imagen con un movimiento suave y natural: ${promptDePublicacion(post)}`.slice(0, 1500)
      : promptDePublicacion(post),
  }));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Crear con IA" className="sheet sheet-estudio">
        <Suspense fallback={<p role="status" className="est-nota" style={{ padding: "var(--sp-5)" }}>Abriendo el Estudio…</p>}>
          <Estudio client={client} modo="dialogo" inicial={inicial} uso={uso} onUsar={onUsar} onCerrar={onCerrar} />
        </Suspense>
      </div>
    </div>
  );
}
