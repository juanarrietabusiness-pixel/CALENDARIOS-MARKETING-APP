// ============================================================
// «¿Qué sale y dónde?»: el formato y cada red, marcada o no
//
// Las redes eran chips con `aria-pressed`, y el CSS sólo pintaba la clase
// `.active`: lo elegido se veía IGUAL que lo no elegido. Encima no decía
// qué salía en cada red, así que una historia pensada sólo para Instagram
// salió también en Facebook sin que nadie lo viera venir.
//
// Ahora cada red es una tarjeta con su casilla, lo que sale en ella
// («historia», «reel», «publicación») y si el cliente tiene cuenta; y
// debajo, una frase con dónde sale y dónde NO. El panel de la publicación
// y el diálogo «Subir» usan esta misma pieza: deciden igual.
// ============================================================

import Icon from "../Icon";
import { REDES, conHistoria } from "../../lib/publicacion";
import { queSaleEn, resumenDestino } from "../../lib/subir";
import { FORMATS, FORMAT_ICONS } from "../../constants";

const FORMATOS_SUBIDA = ["post", "carrusel", "reel", "historia"];

/**
 * @param redes      las redes elegidas
 * @param onRedes    recibe la lista nueva
 * @param cuentas    las redes con cuenta conectada para este cliente; null
 *                   si aún no se sabe (entonces no se bloquea ninguna)
 * @param formato    el formato actual; con `onFormato`, se enseña su fila
 */
export default function DestinoRedes({ post, redes, onRedes, cuentas = null, formato = null, onFormato = null }) {
  const alternar = (r) => onRedes(redes.includes(r) ? redes.filter((x) => x !== r) : [...redes, r]);
  const conSuHistoria = conHistoria(post);

  return (
    <div className="destino">
      {onFormato && (
        <div className="destino-fila" role="group" aria-label="Formato">
          {FORMATOS_SUBIDA.map((k) => (
            <button key={k} type="button" className="filter-chip" aria-pressed={formato === k} onClick={() => onFormato(k)}>
              <Icon name={FORMAT_ICONS[k]} size={14} /> {FORMATS[k]?.label ?? k}
            </button>
          ))}
        </div>
      )}

      <div className="destino-redes" role="group" aria-label="Dónde se publica">
        {Object.entries(REDES).map(([id, r]) => {
          const activa = redes.includes(id);
          const sinCuenta = cuentas !== null && !cuentas.includes(id);
          // La última no se desmarca: sin ninguna, el servidor volvería a
          // Instagram por su cuenta, que es justo lo que no se quiere.
          const ultima = activa && redes.length === 1;
          const que = queSaleEn(post, id) + (activa && id !== "tiktok" && conSuHistoria ? " + historia" : "");
          return (
            <button
              key={id}
              type="button"
              className="destino-red"
              aria-pressed={activa}
              data-sin-cuenta={sinCuenta || undefined}
              disabled={ultima || (sinCuenta && !activa)}
              title={ultima ? "Tiene que salir en al menos una red" : sinCuenta && !activa ? "Este cliente no tiene esa cuenta conectada" : undefined}
              onClick={() => alternar(id)}
            >
              <span className="destino-casilla" aria-hidden="true">{activa && <Icon name="check" size={14} />}</span>
              <Icon name={r.icono} size={18} />
              <span className="destino-red-texto">
                <strong>{r.nombre}</strong>
                <span>{activa ? `${que}${sinCuenta ? " · sin cuenta conectada" : ""}` : sinCuenta ? "Sin cuenta conectada" : "No sale aquí"}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="destino-resumen" aria-live="polite">
        <Icon name="send" size={14} /> {resumenDestino(post, redes)}
      </p>
    </div>
  );
}
