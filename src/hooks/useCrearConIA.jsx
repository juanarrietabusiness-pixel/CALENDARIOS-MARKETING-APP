import { useState } from "react";
import CrearConIA from "../components/calendario/crearConIA";
import { archivoDesdeSrc, promptDePublicacion } from "../lib/estudio";

/**
 * Lo que necesita quien tenga un editor de medios: `abrir({ tipo })` para crear, `abrir({ tipo: "video", desde })`
 * para animar una imagen que ya está puesta, y el `dialogo` que hay que pintar.
 *
 * `onUsar(archivo)` recibe lo escogido; el diálogo se cierra solo. Si la imagen a animar no está en el
 * almacén de ESTE cliente (una vieja en base64, una de otro cliente), no hay de dónde tomarla: se dice.
 */
export function useCrearConIA({ client, clientId, post, uso = null, onUsar, onError }) {
  const [creando, setCreando] = useState(null); // { tipo, inicio }
  const abrir = ({ tipo, desde = null }) => {
    if (!desde) { setCreando({ tipo, inicio: null }); return; }
    const inicio = archivoDesdeSrc(desde.src, clientId, promptDePublicacion(post));
    if (!inicio) {
      onError?.("No se puede animar esa imagen: no está en el almacén de este cliente. Súbela de nuevo y prueba otra vez.");
      return;
    }
    setCreando({ tipo, inicio });
  };
  const dialogo = creando ? (
    <CrearConIA
      client={client} post={post} tipo={creando.tipo} inicio={creando.inicio} uso={uso}
      onUsar={(archivo) => { setCreando(null); onUsar(archivo); }}
      onCerrar={() => setCreando(null)}
    />
  ) : null;
  return { abrir, dialogo };
}
