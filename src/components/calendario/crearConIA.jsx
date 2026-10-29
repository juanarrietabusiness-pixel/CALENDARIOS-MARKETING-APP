import { lazy, Suspense, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { promptDePublicacion, proporcionParaFormato } from "../../lib/estudio";
import { presetDePilar, CAMPOS_MATRIZ } from "../../lib/pilares";
import { promptListo } from "../../lib/promptImagen";

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
 * @param referencias  archivos que van de referencia («Otra versión» de una imagen ya puesta, con su nota).
 * @param uso     { calendarId, postId }: para apuntar que esta publicación usa lo que se cree.
 * @param onUsar  recibe el archivo escogido.
 * @param onUsarVarias  recibe un carrusel entero de la galería (o el video de un reel), en orden.
 * @param onMejorada  recibe la idea que dejó «Mejorar idea» al abrir: la publicación la guarda como su pedido listo.
 * @param abrir   una pieza de la galería que se abre YA: en el visor (`accion` «version» o «editar», con `indicacion`
 *                escrita en «¿Qué cambio?») o en el recreador («recrear»). Se viene a corregir, no a crear: la idea
 *                de la publicación no se mejora sola.
 * @param etiquetaUsar  lo que dice «Usar en la publicación» cuando lo escogido va al sitio de una pieza («Poner en la lámina 3»).
 */
export default function CrearConIA({ client, post, tipo = "imagen", inicio = null, referencias = null, uso = null, abrir = null, accion = "", indicacion = "", etiquetaUsar = null, onUsar, onUsarVarias = null, onMejorada = null, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  // El pedido de la imagen que ya escribió el motor de ideas (o una mejora anterior): no hace falta mejorarlo otra vez.
  const listo = tipo === "imagen" && !inicio ? promptListo(post) : "";
  // Sólo cuenta al abrir: el compositor no se reinicia si la publicación cambia detrás.
  const [inicial] = useState(() => ({
    ...(listo || abrir ? { listo: true } : {}),
    ...(abrir ? { abrir, accion, indicacion } : {}),
    ...(etiquetaUsar ? { etiquetaUsar } : {}),
    ...(onMejorada ? { alMejorar: onMejorada } : {}),
    tipo,
    inicio,
    ...(referencias?.length ? { referencias } : {}),
    proporcion: proporcionParaFormato(post.format, tipo),
    // El preset de su tipo de contenido (Anuncio, Beneficios, Producto / Servicio…; en las 7 maletas, el de la suya).
    preset: presetDePilar(post.pilar, post.pilarSub),
    // Su tipo de contenido y su producto, para el guion de un video corto.
    post: Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, post[k] ?? ""])),
    prompt: inicio
      ? `Anima esta imagen con un movimiento suave y natural: ${promptDePublicacion(post, { conTexto: false })}`.slice(0, 1500)
      : listo || promptDePublicacion(post, { conTexto: tipo !== "video" }),
  }));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={abrir ? "Estudio: corregir la pieza" : "Crear con IA"} className="sheet sheet-estudio">
        <Suspense fallback={<p role="status" className="est-nota" style={{ padding: "var(--sp-5)" }}>Abriendo el Estudio…</p>}>
          <Estudio client={client} modo="dialogo" inicial={inicial} uso={uso} onUsar={onUsar} onUsarVarias={onUsarVarias} onCerrar={onCerrar} />
        </Suspense>
      </div>
    </div>
  );
}
