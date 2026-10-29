// ============================================================
// Una imagen que Instagram no acepta tal cual (la de Flow, 3:4)
//
// En vez de un error sin salida: cómo se va a ajustar y cómo queda. Tres
// ajustes se hacen solos al programar (difuminado, color, recorte) y el
// cuarto —GENERARLA de nuevo con IA en 4:5 o 9:16— se pide con su botón,
// porque cuesta dinero. Antes se le pedía a Nano Banana que la «ampliara»
// y la redibujaba más cerca, como un zoom; ahora recrea la escena en la
// proporción nueva con la original de referencia. La copia va en
// `post.adaptados`, como las otras. El original
// no se toca: Facebook, el cliente y la página de aprobación lo ven tal
// cual.
//
// En un carrusel cada imagen que no cabe tiene su FILA: se ve cómo queda,
// con qué modelo se generó y se regenera sola, sin tocar las demás. Antes
// sólo se enseñaba la primera («—y 2 más—») y el botón las rehacía todas.
// El motor (Muse Image o Nano Banana) se puede escoger para esta vez.
//
// Lo usan el panel de la publicación y «Subir»: por eso recibe
// `alCambiar(fn)` —un `setForm`/`setPost`— y no un `sf`.
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { AJUSTES, claveAdaptado, mediosDe, necesitaAjuste } from "../../lib/publicacion";
import { vistaAjuste, ampliarConIA } from "../../lib/medios";
import { generateImage, getContentBankUrl, subirImagenPublicacion, feedbackImage } from "../../lib/db";
import { leerMotores } from "../../lib/estudio";
import { nombreDelModelo } from "../../lib/estudioCatalogo";

/** Los dos motores que saben ampliar (worker/rutas/imagen.js, `adaptarDe.motor`). */
const MOTORES_AMPLIAR = [["meta", "Muse Image · unos 0,01 $"], ["google", "Nano Banana · unos 0,04 $"]];

export default function AjusteImagen({ post, alCambiar, clientId, objetivo, color, onError }) {
  const ids = useId();
  const medios = mediosDe(post);
  const fuera = medios.map((m, i) => ({ ...m, n: i + 1 })).filter((m) => necesitaAjuste(m, objetivo));
  const [elegida, setElegida] = useState(0);
  const medio = fuera[Math.min(elegida, fuera.length - 1)];
  const modo = post.ajusteIG || "difuminado";
  const copiaDe = (m) => post.adaptados?.[claveAdaptado(objetivo, m.src)];
  const conIADe = (m) => copiaDe(m)?.modo === "ia";
  const copia = medio ? copiaDe(medio) : null;
  const conIA = modo === "ia" && conIADe(medio ?? {});
  const faltan = fuera.filter((m) => !conIADe(m));
  const [vista, setVista] = useState(null);
  const [ampliando, setAmpliando] = useState(null); // { src } de la que se está generando, o { todas }
  const [motor, setMotor] = useState(""); // "" = el que escoja el espacio
  const [motores, setMotores] = useState(null);

  useEffect(() => {
    if (!medio?.src || conIA) return undefined;
    let vivo = true;
    vistaAjuste(medio.src, objetivo, modo, color).then((v) => { if (vivo) setVista(v); }).catch(() => { if (vivo) setVista(null); });
    return () => { vivo = false; };
  }, [medio?.src, objetivo, modo, color, conIA]);

  // Con las dos llaves se puede escoger con cuál ampliar; con una, no hay nada que escoger.
  useEffect(() => {
    let vivo = true;
    leerMotores().then((r) => { if (vivo) setMotores(r?.motores ?? {}); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!medio) return null;
  const destino = objetivo === "historia" ? "9:16" : "4:5";
  const carrusel = medios.length > 1;
  const nombre = (m) => `${carrusel ? (objetivo === "historia" ? "Historia" : "Lámina") : "Imagen"} ${m.n}`;
  const ocupado = Boolean(ampliando);

  const ampliar = async (lista, todas = false) => {
    onError?.("");
    for (const [i, m] of lista.entries()) {
      setAmpliando({ src: m.src, todas, texto: lista.length > 1 ? `Generando ${i + 1} de ${lista.length}…` : "Generando con IA…" });
      try {
        let modelo = "";
        const copiaNueva = await ampliarConIA(m.src, objetivo, {
          generar: async (proporcion) => {
            const r = await generateImage({ clientId, adaptarDe: { src: m.src, proporcion, ...(motor ? { motor } : {}) } });
            modelo = r.modelo ?? "";
            return { clave: r.clave, src: getContentBankUrl(r.clave) };
          },
          subir: (f) => subirImagenPublicacion(clientId, f),
          descartar: (clave) => feedbackImage(clientId, clave, false).catch(() => {}),
        });
        // Cada una se pone en cuanto sale: si la siguiente falla, la anterior no se pierde.
        alCambiar((p) => ({ ...p, ajusteIG: "ia", adaptados: { ...(p.adaptados ?? {}), [claveAdaptado(objetivo, m.src)]: { ...copiaNueva, modelo } } }));
      } catch (e) {
        onError?.(`No se pudo generar ${carrusel ? `la ${nombre(m).toLowerCase()}` : "la imagen"} con IA: ${e.message}`);
        break;
      }
    }
    setAmpliando(null);
  };

  const src = conIA ? copia.src : vista;
  const dosMotores = motores?.meta?.activo && motores?.gemini?.activo;
  return (
    <div className="ajuste-imagen">
      <div className="ajuste-imagen-cabecera">
        <div className="ajuste-imagen-vista" data-objetivo={objetivo}>
          {src ? <img src={src} alt={`Cómo quedará ${nombre(medio).toLowerCase()} en ${objetivo === "historia" ? "la historia" : "el feed"}`} /> : <span>{ampliando?.texto || "Preparando la vista…"}</span>}
        </div>
        <div className="ajuste-imagen-opciones">
          <p>
            {fuera.length > 1
              ? <><strong>{fuera.length} imágenes</strong> no caben</>
              : <><strong>{medio.ancho}×{medio.alto}</strong> no cabe</>}
            {" "}en {objetivo === "historia" ? "una historia (9:16)" : "el feed de Instagram (de 4:5 a 1.91:1)"}.
            {" "}El original no se toca: Facebook y tu cliente lo ven tal cual.
          </p>
          <label className="sr-only" htmlFor={`${ids}-a`}>Cómo ajustar las imágenes</label>
          <select id={`${ids}-a`} className="input" value={modo} onChange={(e) => alCambiar((p) => ({ ...p, ajusteIG: e.target.value }))} disabled={ocupado}>
            {Object.entries(AJUSTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {dosMotores && (
            <>
              <label className="label" htmlFor={`${ids}-m`}>Generar con</label>
              <select id={`${ids}-m`} className="input" value={motor} onChange={(e) => setMotor(e.target.value)} disabled={ocupado}>
                <option value="">El que tenga el espacio (Ajustes → IA)</option>
                {MOTORES_AMPLIAR.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </>
          )}
          {fuera.length === 1 ? (
            <button type="button" className="btn btn-accent btn-sm" disabled={ocupado || !clientId} onClick={() => ampliar([medio])}>
              <Icon name="sparkles" size={14} /> {ampliando?.texto || (conIADe(medio) ? "Volver a generar con IA" : `Generar en ${destino} con IA`)}
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-sm" disabled={ocupado || !clientId} onClick={() => ampliar(faltan.length ? faltan : fuera, true)}>
              <Icon name="sparkles" size={14} /> {ampliando?.todas ? ampliando.texto : faltan.length ? `Generar las ${faltan.length} que faltan` : `Volver a generar las ${fuera.length}`}
            </button>
          )}
          <p className="hint">
            {modo === "ia"
              ? faltan.length
                ? `Falta generar ${faltan.length === 1 ? "una imagen" : `${faltan.length} imágenes`}: sin la copia, sale con fondo difuminado. Unos 4 céntimos por imagen (1 con Muse).`
                : "La IA las recreó en la proporción nueva, sin acercarlas. Si una no te convence, vuelve a generar sólo esa o elige otro ajuste."
              : `La IA recrea la misma escena en ${destino}, con un plano igual o más abierto: sin zoom ni bandas. Unos 4 céntimos por imagen (1 con Muse). Los otros ajustes se hacen solos al programar.`}
          </p>
        </div>
      </div>

      {/* Una fila por imagen que no cabe: se ve, se sabe con qué se generó y se regenera sola. */}
      {fuera.length > 1 && (
        <ul className="ajuste-imagen-lista" aria-label={`Las imágenes que no caben en ${destino}`}>
          {fuera.map((m, i) => {
            const c = copiaDe(m);
            const hecha = c?.modo === "ia";
            const aqui = ampliando?.src === m.src;
            return (
              <li key={m.src} data-elegida={m.src === medio.src || undefined}>
                <button type="button" className="ajuste-imagen-mini" aria-pressed={m.src === medio.src} onClick={() => setElegida(i)} aria-label={`Ver cómo queda ${nombre(m).toLowerCase()}`}>
                  <img src={hecha && modo === "ia" ? c.src : m.src} alt="" />
                </button>
                <div className="ajuste-imagen-fila">
                  <strong>{nombre(m)}</strong>
                  <span className="hint">
                    {aqui ? ampliando.texto : hecha ? `Generada en ${destino}${c.modelo ? ` con ${nombreDelModelo(c.modelo)}` : ""}` : `${m.ancho}×${m.alto} · sin generar`}
                  </span>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !clientId} onClick={() => { setElegida(i); ampliar([m]); }}>
                  <Icon name={hecha ? "refresh" : "sparkles"} size={14} /> {aqui ? "Generando…" : hecha ? "Otra vez" : "Generar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
