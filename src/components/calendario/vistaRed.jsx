// ============================================================
// La vista previa de verdad: lo que va a salir en cada red
//
// La vista previa de antes pintaba el medio tal cual en un marco fijo,
// así que no enseñaba lo que Instagram iba a cortar. Aquí cada imagen
// pasa por el MISMO ajuste que se hará al programar (`vistaAjuste`, el
// lienzo de lib/medios.js): la imagen de Flow sale con su fondo
// difuminado, la historia a 9:16, y lo que ya cabe, igual.
//
// En las verticales (historia, reel, TikTok) van marcadas las zonas que
// tapa la propia aplicación —el nombre de la cuenta arriba, la respuesta
// o el texto abajo—: lo importante de la imagen no debe caer ahí.
// ============================================================

import { useEffect, useState } from "react";
import Icon from "../Icon";
import { REDES, mediosDe, historiasDe, conHistoria, textoPara, primerComentario, destinoInstagram, objetivoDe } from "../../lib/publicacion";
import { vistaAjuste } from "../../lib/medios";

// Lo ya dibujado, por imagen, objetivo y ajuste: cambiar de pestaña no
// vuelve a pasar por el lienzo.
const dibujadas = new Map();

function useAjustada(src, objetivo, modo, color) {
  const clave = `${src}|${objetivo}|${modo}|${color}`;
  const [vista, setVista] = useState(() => dibujadas.get(clave) ?? null);
  useEffect(() => {
    if (!src || !objetivo) return undefined;
    if (dibujadas.has(clave)) { setVista(dibujadas.get(clave)); return undefined; }
    let vivo = true;
    setVista(null);
    vistaAjuste(src, objetivo, modo, color)
      .then((v) => { dibujadas.set(clave, v); if (vivo) setVista(v); })
      .catch(() => { if (vivo) setVista(src); });
    return () => { vivo = false; };
  }, [clave, src, objetivo, modo, color]);
  return objetivo ? vista : src;
}

/** Las piezas que se pueden previsualizar: una por red elegida y, si la hay, la historia del post. */
function piezasVista(post, redes) {
  const piezas = [];
  for (const red of redes) {
    if (red === "instagram") {
      const d = destinoInstagram(post);
      piezas.push({ clave: "instagram", red, nombre: `Instagram · ${{ imagen: "feed", carrusel: "carrusel", reel: "reel", historia: "historia" }[d]}` });
    } else {
      piezas.push({ clave: red, red, nombre: post.format === "historia" && red === "facebook" ? "Facebook · historia" : REDES[red].nombre });
    }
  }
  if (conHistoria(post) && redes.some((r) => r !== "tiktok")) piezas.push({ clave: "historia", red: "instagram", nombre: "Su historia", historia: true });
  return piezas;
}

function Medio({ medio, objetivo, vertical, modo, color }) {
  const ajustada = useAjustada(medio.tipo === "imagen" ? medio.src : null, medio.tipo === "imagen" ? objetivo : null, modo, color);
  if (medio.tipo === "video") return <video src={`${medio.src}#t=0.5`} muted playsInline controls preload="metadata" data-vertical={vertical || undefined} />;
  return ajustada ? <img src={ajustada} alt="" /> : <span className="vr-cargando">Preparando…</span>;
}

export default function VistaRed({ post, redes, client }) {
  const piezas = piezasVista(post, redes);
  const [elegida, setElegida] = useState(piezas[0]?.clave ?? "instagram");
  const [i, setI] = useState(0);
  const pieza = piezas.find((p) => p.clave === elegida) ?? piezas[0];
  useEffect(() => { setI(0); }, [elegida]);
  if (!pieza) return null;

  const esHistoria = pieza.historia || post.format === "historia";
  const medios = pieza.historia ? historiasDe(post) : mediosDe(post);
  const m = medios[Math.min(i, medios.length - 1)];
  // Qué forma tiene el marco: la de lo que sale en esa red.
  const objetivo = pieza.historia ? "historia" : objetivoDe(post, pieza.red);
  const vertical = esHistoria || pieza.red === "tiktok" || (pieza.red === "instagram" && destinoInstagram(post) === "reel");
  const usuario = (client?.instagram || client?.name || "cuenta").replace(/^@/, "");
  const texto = esHistoria ? "" : textoPara(post, pieza.red);
  const corto = pieza.red === "instagram" && texto.length > 125 ? `${texto.slice(0, 125).trimEnd()}… más` : texto;
  const comentario = pieza.red === "instagram" && !esHistoria ? primerComentario(post) : "";

  return (
    <section className="vista-red" aria-label="Vista previa">
      {piezas.length > 1 && (
        <div className="vista-red-piezas" role="group" aria-label="Qué previsualizar">
          {piezas.map((p) => (
            <button key={p.clave} type="button" className="filter-chip" aria-pressed={p.clave === pieza.clave} onClick={() => setElegida(p.clave)}>
              <Icon name={REDES[p.red]?.icono ?? "photo"} size={12} /> {p.nombre}
            </button>
          ))}
        </div>
      )}
      <div className="vista-red-telefono" data-red={pieza.red}>
        {!esHistoria && (
          <div className="vista-previa-autor">
            <span className="vista-previa-avatar">{client?.logo ? <img src={client.logo} alt="" /> : null}</span>
            <strong>{pieza.red === "instagram" ? usuario : client?.name}</strong>
          </div>
        )}
        <div className="vista-red-medio" data-vertical={vertical || undefined} data-libre={!vertical && !objetivo ? true : undefined}>
          {m ? <Medio medio={m} objetivo={objetivo} vertical={vertical} modo={post.ajusteIG || "difuminado"} color={client?.primaryColor} /> : <span>Sin imagen ni video</span>}
          {vertical && m && (
            <>
              <span className="vista-red-zona" data-lado="arriba" aria-hidden="true">{esHistoria ? usuario : ""}</span>
              <span className="vista-red-zona" data-lado="abajo" aria-hidden="true">{esHistoria ? "Enviar mensaje" : "Texto y botones"}</span>
            </>
          )}
          {medios.length > 1 && (
            <>
              <button type="button" className="vista-previa-flecha" data-lado="izq" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Anterior"><Icon name="chevronLeft" size={16} /></button>
              <button type="button" className="vista-previa-flecha" data-lado="der" disabled={i >= medios.length - 1} onClick={() => setI(i + 1)} aria-label="Siguiente"><Icon name="chevronRight" size={16} /></button>
              <span className="vista-previa-contador">{i + 1}/{medios.length}</span>
            </>
          )}
        </div>
        {!esHistoria && (
          <p className="vista-previa-texto">
            {pieza.red === "instagram" && <strong>{usuario} </strong>}
            {corto || <em>Sin texto</em>}
          </p>
        )}
        {comentario && <p className="vista-previa-comentario"><strong>{usuario}</strong> {comentario}</p>}
      </div>
      {vertical && <p className="hint">Las franjas marcadas las tapa la aplicación: que no caiga ahí nada importante.</p>}
    </section>
  );
}
