import { useState } from "react";
import CrearConIA from "../components/calendario/crearConIA";
import { archivoDesdeSrc, promptDePublicacion } from "../lib/estudio";
import { mediosDe } from "../lib/publicacion";

/** Lo que se le dice al modelo de la pieza actual cuando se pide «Otra versión». */
const NOTA_VERSION = "es la pieza actual: haz OTRA versión con la misma información (producto, mensaje y texto), con otra composición y otro escenario";

/**
 * Lo que necesita quien tenga un editor de medios: `abrir({ tipo })` para crear, `abrir({ tipo: "video", desde })`
 * para animar una imagen que ya está puesta, y el `dialogo` que hay que pintar.
 *
 * `abrir({ abrir: archivo, accion, reemplaza, indicacion })`: el Estudio con ESA pieza de la galería ya abierta —en el
 * visor («version»: sus versiones; «editar»: ya en «Editar», con `indicacion` escrita) o en el recreador («recrear»)—;
 * lo que se escoja ahí (esa o cualquier otra de la galería) va al SITIO de `reemplaza` con `onReemplazar(medio,
 * archivo)`, no al final. `version` con `reemplaza`: el compositor con la pieza de referencia (una imagen que no salió
 * del Estudio no tiene pedido que repetir), y lo creado también va a su sitio.
 *
 * `onMejorada(idea)`: la idea que dejó «Mejorar idea» al abrir (la publicación la guarda como su pedido listo).
 * `onUsar(archivo)` recibe lo escogido; `onUsarVarias(archivos)`, un carrusel entero de la galería. El diálogo se cierra solo. Si la imagen a animar no está en el
 * almacén de ESTE cliente (una vieja en base64, una de otro cliente), no hay de dónde tomarla: se dice.
 */
export function useCrearConIA({ client, clientId, post, uso = null, onUsar, onUsarVarias = null, onReemplazar = null, onMejorada = null, onError }) {
  const [creando, setCreando] = useState(null); // { tipo, inicio, referencias, abrir, accion, reemplaza, indicacion }
  /** «Poner en la lámina 3» / «Poner en su sitio»: lo que dice el botón de usar cuando lo escogido reemplaza a algo. */
  const etiquetaPara = (medio) => {
    const lista = mediosDe(post);
    const n = lista.findIndex((m) => m.src === medio.src) + 1;
    return n > 0 && lista.length > 1 ? `Poner en la lámina ${n}` : "Poner en la publicación, en su sitio";
  };
  /** `version`: una imagen ya puesta de la que se quiere OTRA versión (va de referencia, con la nota de qué hacer). */
  const abrir = ({ tipo, desde = null, version = null, abrir: pieza = null, accion = "", reemplaza = null, indicacion = "" }) => {
    if (pieza) { setCreando({ tipo: "imagen", inicio: null, referencias: null, abrir: pieza, accion, reemplaza, indicacion }); return; }
    if (!desde && !version) { setCreando({ tipo, inicio: null, referencias: null }); return; }
    const archivo = archivoDesdeSrc((desde ?? version).src, clientId, promptDePublicacion(post));
    if (!archivo) {
      onError?.(`No se puede ${version ? "versionar" : "animar"} esa imagen: no está en el almacén de este cliente. Súbela de nuevo y prueba otra vez.`);
      return;
    }
    if (version) setCreando({ tipo: "imagen", inicio: null, referencias: [{ ...archivo, nota: NOTA_VERSION }], reemplaza });
    else setCreando({ tipo, inicio: archivo, referencias: null });
  };
  const reemplaza = creando?.reemplaza && onReemplazar ? creando.reemplaza : null;
  const dialogo = creando ? (
    <CrearConIA
      client={client} post={post} tipo={creando.tipo} inicio={creando.inicio} referencias={creando.referencias} uso={uso}
      abrir={creando.abrir ?? null} accion={creando.accion ?? ""} indicacion={creando.indicacion ?? ""} etiquetaUsar={reemplaza ? etiquetaPara(reemplaza) : null}
      onUsar={(archivo) => { setCreando(null); if (reemplaza) onReemplazar(reemplaza, archivo); else onUsar(archivo); }}
      onUsarVarias={onUsarVarias && !reemplaza ? (lista) => { setCreando(null); onUsarVarias(lista); } : null}
      onMejorada={onMejorada}
      onCerrar={() => setCreando(null)}
    />
  ) : null;
  return { abrir, dialogo };
}
