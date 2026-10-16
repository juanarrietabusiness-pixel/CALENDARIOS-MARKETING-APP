import { useId, useState } from "react";
import Icon from "../Icon";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { corregidaTrasCambios, instruccionDelCliente } from "../../lib/aprobacion";
import { archivoDesdeSrc, medioDeArchivo, apuntarUso } from "../../lib/estudio";

// ============================================================
// Lo que pidió cambiar el cliente, y rehacerlo
//
// El cliente recibe el calendario con todo creado; si pide cambios en una
// pieza, su comentario es la indicación: «Rehacer la imagen» EDITA la misma
// imagen con lo que dijo (la pieza que le gustó se conserva, sólo cambia lo
// pedido) en vez de pedir otra desde cero. La nueva sustituye a la que había
// en la publicación —la de antes se queda en la galería— y, al guardar, el
// enlace del cliente la enseña «Actualizada · revísala» con lo de antes al
// lado: revisa sólo eso.
//
//   · CambiosPedidos: una línea, en la pestaña Idea.
//   · CambiosDelCliente: el bloque de la pestaña Subir, con «Rehacer».
// ============================================================

/** La línea de la pestaña Idea: qué pidió y si ya se corrigió. */
export function CambiosPedidos({ post }) {
  if (post?.status !== "rejected") return null;
  const hecha = corregidaTrasCambios(post);
  return (
    <div className={`notice ${hecha ? "notice-ok" : "notice-warn"} aprobacion-estado`} role="status">
      <p><Icon name={hecha ? "check" : "alert"} size={16} /> <strong>{hecha ? "Corregida:" : "El cliente pidió cambios:"}</strong> {post.cambiosPedidos ? `«${post.cambiosPedidos}»` : "mira la conversación de abajo."}</p>
      {!hecha && <p className="hint">Rehaz la imagen con lo que dijo en la pestaña «Subir».</p>}
    </div>
  );
}

/**
 * El bloque de la pestaña Subir. `uso`: { calendarId, postId } para apuntar que la publicación usa la imagen nueva
 * (sin `usado_en`, la papelera de la galería podría llevársela).
 */
export default function CambiosDelCliente({ post, setForm, clientId, uso = null }) {
  const ids = useId();
  const imagenes = mediosDe(post).map((m, i) => ({ m, i })).filter(({ m }) => m.tipo === "imagen" && archivoDesdeSrc(m.src, clientId));
  const [cual, setCual] = useState(imagenes[0]?.i ?? 0);
  const [extra, setExtra] = useState("");
  const [estado, setEstado] = useState({ trabajando: false, aviso: "", error: "" });
  if (post?.status !== "rejected") return null;
  const hecha = corregidaTrasCambios(post);
  const indicacion = instruccionDelCliente(post.cambiosPedidos, extra);

  const rehacer = async () => {
    if (estado.trabajando || !indicacion) return;
    const medio = mediosDe(post)[cual];
    if (!medio) return;
    setEstado({ trabajando: true, aviso: "", error: "" });
    try {
      // Lazy: el control y el catálogo de modelos sólo se bajan si alguien rehace.
      const { rehacerConComentario } = await import("../../lib/controlEstudio");
      const nueva = await rehacerConComentario({ clienteId: clientId, src: medio.src, indicacion, medida: medio, texto: post.textoPieza || "" });
      setForm((p) => {
        const lista = [...mediosDe(p)];
        if (lista[cual]?.src !== medio.src) return p; // se movió o se quitó mientras tanto: no se pisa nada
        lista[cual] = medioDeArchivo(nueva);
        return { ...conMedios(p, lista), mediosCambiadosAt: new Date().toISOString() };
      });
      if (uso?.calendarId && uso?.postId) apuntarUso(clientId, nueva.id, uso).catch(() => {});
      window.dispatchEvent(new Event("ia:gasto"));
      setEstado({ trabajando: false, aviso: "Listo: la imagen nueva ya está en la publicación (la de antes sigue en la galería). Al cerrar, el cliente la ve «Actualizada».", error: "" });
    } catch (e) {
      setEstado({ trabajando: false, aviso: "", error: e.message });
    }
  };

  return (
    <section className={`notice ${hecha ? "notice-ok" : "notice-warn"} cambios-cliente`} aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} style={{ margin: 0 }}>
        <Icon name={hecha ? "check" : "alert"} size={16} /> <strong>{hecha ? "Ya la cambiaste" : "El cliente pidió cambios"}</strong>
        {post.cambiosPedidos ? <>: «{post.cambiosPedidos}»</> : ". No dejó comentario: mira la conversación con el cliente."}
      </p>
      {hecha && <p className="hint" style={{ margin: 0 }}>En su enlace sale «Actualizada · revísala», con lo de antes al lado.</p>}
      {imagenes.length > 0 && (
        <>
          {imagenes.length > 1 && (
            <div className="est-tipos" role="group" aria-label="Qué imagen rehacer">
              {imagenes.map(({ i }) => (
                <button key={i} type="button" className="filter-chip" aria-pressed={cual === i} onClick={() => setCual(i)}>Imagen {i + 1}</button>
              ))}
            </div>
          )}
          <label className="label" htmlFor={`${ids}-x`}>{post.cambiosPedidos ? "¿Algo más? (opcional)" : "¿Qué hay que cambiar?"}</label>
          <input id={`${ids}-x`} className="input" maxLength={400} value={extra} onChange={(e) => setExtra(e.target.value)}
            placeholder={post.cambiosPedidos ? "Ej.: y que el sofá sea gris" : "Ej.: más luz, sin la planta de la izquierda"} />
          <button type="button" className="btn btn-secondary btn-sm" aria-disabled={estado.trabajando || !indicacion} onClick={rehacer}>
            <Icon name="sparkles" size={14} /> {estado.trabajando ? "Rehaciendo… (unos segundos)" : `Rehacer ${imagenes.length > 1 ? `la imagen ${cual + 1}` : "la imagen"} con lo que pidió`}
          </button>
          <p className="hint" style={{ margin: 0 }}>Edita la MISMA imagen: sólo cambia lo pedido. Cuesta una imagen.</p>
        </>
      )}
      <div role="status" aria-live="polite" className={estado.aviso ? "hint" : "sr-only"}>{estado.aviso}</div>
      {estado.error && <p role="alert" className="cerebro-error" style={{ margin: 0 }}>{estado.error}</p>}
    </section>
  );
}
