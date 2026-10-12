import { useState } from "react";
import CrearConIA from "../components/calendario/crearConIA";
import { archivoDesdeSrc, promptDePublicacion } from "../lib/estudio";

/** Lo que se le dice al modelo de la pieza actual cuando se pide «Otra versión». */
const NOTA_VERSION = "es la pieza actual: haz OTRA versión con la misma información (producto, mensaje y texto), con otra composición y otro escenario";

/**
 * Lo que necesita quien tenga un editor de medios: `abrir({ tipo })` para crear, `abrir({ tipo: "video", desde })`
 * para animar una imagen que ya está puesta, y el `dialogo` que hay que pintar.
 *
 * `onUsar(archivo)` recibe lo escogido; el diálogo se cierra solo. Si la imagen a animar no está en el
 * almacén de ESTE cliente (una vieja en base64, una de otro cliente), no hay de dónde tomarla: se dice.
 */
export function useCrearConIA({ client, clientId, post, uso = null, onUsar, onError }) {
  const [creando, setCreando] = useState(null); // { tipo, inicio, referencias }
  /** `version`: una imagen ya puesta de la que se quiere OTRA versión (va de referencia, con la nota de qué hacer). */
  const abrir = ({ tipo, desde = null, version = null }) => {
    if (!desde && !version) { setCreando({ tipo, inicio: null, referencias: null }); return; }
    const archivo = archivoDesdeSrc((desde ?? version).src, clientId, promptDePublicacion(post));
    if (!archivo) {
      onError?.(`No se puede ${version ? "versionar" : "animar"} esa imagen: no está en el almacén de este cliente. Súbela de nuevo y prueba otra vez.`);
      return;
    }
    if (version) setCreando({ tipo: "imagen", inicio: null, referencias: [{ ...archivo, nota: NOTA_VERSION }] });
    else setCreando({ tipo, inicio: archivo, referencias: null });
  };
  const dialogo = creando ? (
    <CrearConIA
      client={client} post={post} tipo={creando.tipo} inicio={creando.inicio} referencias={creando.referencias} uso={uso}
      onUsar={(archivo) => { setCreando(null); onUsar(archivo); }}
      onCerrar={() => setCreando(null)}
    />
  ) : null;
  return { abrir, dialogo };
}
