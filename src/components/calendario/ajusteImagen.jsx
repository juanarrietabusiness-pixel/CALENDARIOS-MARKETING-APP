// ============================================================
// Una imagen que Instagram no acepta tal cual (la de Flow, 3:4)
//
// En vez de un error sin salida: cómo se va a ajustar y cómo queda. Tres
// ajustes se hacen solos al programar (difuminado, color, recorte) y el
// cuarto —AMPLIAR con IA, lo que Metricool llama «expandir»— se pide con
// su botón, porque cuesta dinero: Nano Banana dibuja el fondo que falta
// y la copia se guarda en `post.adaptados`, como las otras. El original
// no se toca: Facebook, el cliente y la página de aprobación lo ven tal
// cual.
//
// Lo usan el panel de la publicación y «Subir»: por eso recibe
// `alCambiar(fn)` —un `setForm`/`setPost`— y no un `sf`.
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { AJUSTES, claveAdaptado, mediosDe, necesitaAjuste } from "../../lib/publicacion";
import { vistaAjuste, ampliarConIA } from "../../lib/medios";
import { generateImage, getContentBankUrl, subirImagenPublicacion, feedbackImage } from "../../lib/db";

export default function AjusteImagen({ post, alCambiar, clientId, objetivo, color, onError }) {
  const ids = useId();
  const fuera = mediosDe(post).filter((m) => necesitaAjuste(m, objetivo));
  const medio = fuera[0];
  const modo = post.ajusteIG || "difuminado";
  const copia = medio ? post.adaptados?.[claveAdaptado(objetivo, medio.src)] : null;
  const conIA = modo === "ia" && copia?.modo === "ia";
  const faltan = fuera.filter((m) => post.adaptados?.[claveAdaptado(objetivo, m.src)]?.modo !== "ia");
  const [vista, setVista] = useState(null);
  const [ampliando, setAmpliando] = useState("");

  useEffect(() => {
    if (!medio?.src || conIA) return undefined;
    let vivo = true;
    vistaAjuste(medio.src, objetivo, modo, color).then((v) => { if (vivo) setVista(v); }).catch(() => { if (vivo) setVista(null); });
    return () => { vivo = false; };
  }, [medio?.src, objetivo, modo, color, conIA]);

  if (!medio) return null;
  const destino = objetivo === "historia" ? "9:16" : "4:5";

  const ampliar = async (lista) => {
    onError?.("");
    const hechas = {};
    for (const [i, m] of lista.entries()) {
      setAmpliando(lista.length > 1 ? `Ampliando ${i + 1} de ${lista.length}…` : "Ampliando con IA…");
      try {
        hechas[claveAdaptado(objetivo, m.src)] = await ampliarConIA(m.src, objetivo, {
          generar: async (proporcion) => {
            const { clave } = await generateImage({ clientId, adaptarDe: { src: m.src, proporcion } });
            return { clave, src: getContentBankUrl(clave) };
          },
          subir: (f) => subirImagenPublicacion(clientId, f),
          descartar: (clave) => feedbackImage(clientId, clave, false).catch(() => {}),
        });
      } catch (e) {
        onError?.(`No se pudo ampliar la imagen con IA: ${e.message}`);
        break;
      }
    }
    if (Object.keys(hechas).length) {
      alCambiar((p) => ({ ...p, ajusteIG: "ia", adaptados: { ...(p.adaptados ?? {}), ...hechas } }));
    }
    setAmpliando("");
  };

  const src = conIA ? copia.src : vista;
  return (
    <div className="ajuste-imagen">
      <div className="ajuste-imagen-vista" data-objetivo={objetivo}>
        {src ? <img src={src} alt={`Cómo quedará en ${objetivo === "historia" ? "la historia" : "el feed"}`} /> : <span>{ampliando || "Preparando la vista…"}</span>}
      </div>
      <div className="ajuste-imagen-opciones">
        <p>
          <strong>{medio.ancho}×{medio.alto}</strong> no cabe en {objetivo === "historia" ? "una historia (9:16)" : "el feed de Instagram (de 4:5 a 1.91:1)"}
          {fuera.length > 1 && <> —y {fuera.length - 1} más—</>}.
          {" "}El original no se toca: Facebook y tu cliente lo ven tal cual.
        </p>
        <label className="sr-only" htmlFor={`${ids}-a`}>Cómo ajustar la imagen</label>
        <select id={`${ids}-a`} className="input" value={modo} onChange={(e) => alCambiar((p) => ({ ...p, ajusteIG: e.target.value }))} disabled={!!ampliando}>
          {Object.entries(AJUSTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn btn-accent btn-sm" disabled={!!ampliando || !clientId} onClick={() => ampliar(faltan.length ? faltan : fuera)}>
          <Icon name="sparkles" size={14} /> {ampliando || (conIA && !faltan.length ? "Volver a ampliar con IA" : `Ampliar a ${destino} con IA`)}
        </button>
        <p className="hint">
          {modo === "ia"
            ? faltan.length
              ? `Falta ampliar ${faltan.length === 1 ? "esta imagen" : `${faltan.length} imágenes`}: sin la copia, sale con fondo difuminado. Unos 4 céntimos por imagen.`
              : "La IA completó el fondo. Si no te convence, vuelve a ampliarla o elige otro ajuste."
            : `La IA dibuja el fondo que falta hasta ${destino}, sin bandas. Unos 4 céntimos por imagen. Los otros ajustes se hacen solos al programar.`}
        </p>
      </div>
    </div>
  );
}
