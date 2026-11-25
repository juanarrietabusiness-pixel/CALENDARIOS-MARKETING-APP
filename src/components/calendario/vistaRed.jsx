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

import "./vistaRed.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../Icon";
import {
  REDES, mediosDe, historiasDe, conHistoria, textoPara, primerComentario, destinoInstagram, objetivoDe, claveAdaptado,
  conHistorias, esShortYouTube, tituloYouTube, descripcionYouTube,
} from "../../lib/publicacion";
import { useAjustada } from "../../hooks/useAjustada";

/** Las piezas que se pueden previsualizar: una por red elegida y, si la hay, la historia del post. */
function piezasVista(post, redes) {
  const piezas = [];
  for (const red of redes) {
    if (red === "instagram") {
      const d = destinoInstagram(post);
      piezas.push({ clave: "instagram", red, nombre: `Instagram · ${{ imagen: "feed", carrusel: "carrusel", reel: "reel", historia: "historia" }[d]}` });
    } else if (red === "youtube") {
      piezas.push({ clave: red, red, nombre: `YouTube · ${esShortYouTube(post) ? "Short" : "video"}` });
    } else {
      piezas.push({ clave: red, red, nombre: post.format === "historia" && red === "facebook" ? "Facebook · historia" : REDES[red].nombre });
    }
  }
  if (conHistoria(post) && redes.some(conHistorias)) piezas.push({ clave: "historia", red: "instagram", nombre: "Su historia", historia: true });
  return piezas;
}

function Medio({ medio, objetivo, vertical, modo, color, adaptados, portada, onForma }) {
  // Ampliada con IA: la copia ya tiene la forma de la red, se enseña tal cual.
  const copia = modo === "ia" && objetivo ? adaptados?.[claveAdaptado(objetivo, medio.src)] : null;
  const ajustada = useAjustada(medio.tipo === "imagen" && copia?.modo !== "ia" ? medio.src : null, medio.tipo === "imagen" ? objetivo : null, modo, color);
  // La forma de lo que se ve (ancho / alto), para que el teléfono quepa entero en la pantalla.
  const alCargar = (e) => { const x = e.currentTarget; if (x.naturalWidth && x.naturalHeight) onForma?.(x.naturalWidth / x.naturalHeight); };
  if (medio.tipo === "video") return <VideoVista src={medio.src} portada={portada} vertical={vertical} onForma={onForma} />;
  if (copia?.modo === "ia") return <img src={copia.src} alt="" onLoad={alCargar} />;
  return ajustada ? <img src={ajustada} alt="" onLoad={alCargar} /> : <span className="vr-cargando">Preparando…</span>;
}

/** El contenedor que se desplaza (overflow auto/scroll) más cercano, o null (la ventana). */
function conScroll(el) {
  for (let x = el?.parentElement; x && x !== document.body; x = x.parentElement) {
    const o = getComputedStyle(x).overflowY;
    if ((o === "auto" || o === "scroll") && x.clientHeight > 0) return x;
  }
  return null;
}

/**
 * El ALTO que puede tener la imagen o el video para que la publicación se vea ENTERA sin desplazarse ni achicar la
 * pantalla: el alto visible del contenedor que se desplaza, menos lo que va encima de la imagen desde `encajar` (el
 * bloque que tiene que caber: en «Ver el mes», la navegación y el teléfono; en el panel, «Así se va a ver») y lo que se
 * deja debajo (`reserva`). Se vuelve a medir al cambiar el tamaño. Antes la imagen iba siempre a todo el ancho del
 * teléfono (320–380 px) y, en el celular o en una laptop, se salía de la pantalla por abajo.
 */
function useAltoMedio(medio, encajar, reserva, clave) {
  const [alto, setAlto] = useState(null);
  useLayoutEffect(() => {
    const el = medio.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const cont = conScroll(el);
    const medir = () => {
      const desde = (encajar && el.closest(encajar)) || el.closest(".vista-red") || el;
      const estilo = cont ? getComputedStyle(cont) : null;
      const visible = cont ? cont.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom) : window.innerHeight;
      const arriba = el.getBoundingClientRect().top - desde.getBoundingClientRect().top;
      const nuevo = Math.max(220, Math.floor(visible - arriba - reserva));
      setAlto((a) => (a === nuevo ? a : nuevo));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(cont ?? document.documentElement);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [medio, encajar, reserva, clave]);
  return alto;
}

/**
 * El video de la vista previa. En el iPhone, `src="…#t=0.5"` con
 * `preload="metadata"` pintaba un fotograma y al darle a reproducir se
 * quedaba en negro o arrancaba a pantalla completa y volvía cortado:
 * Safari trata el fragmento como un rango y no siempre lo suelta. Ahora
 * va sin fragmento, con la portada como `poster`, `playsInline` y el
 * fotograma inicial buscado a mano sólo si no hay portada.
 */
function VideoVista({ src, portada, vertical, onForma }) {
  return (
    <video
      key={src}
      src={src}
      poster={portada || undefined}
      muted
      playsInline
      controls
      preload={portada ? "none" : "metadata"}
      data-vertical={vertical || undefined}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth && v.videoHeight) onForma?.(v.videoWidth / v.videoHeight);
        if (!portada && v.currentTime === 0) v.currentTime = 0.1;
      }}
    />
  );
}

/** Hasta dónde enseña Instagram el texto antes de «… más». */
const CORTE_TEXTO = 125;

/**
 * `encajar`: el selector del bloque que tiene que caber entero en la pantalla (por defecto, la propia vista previa);
 * `reserva`: los px que se dejan debajo de la imagen (para que asome el texto).
 */
export default function VistaRed({ post, redes, client, encajar = "", reserva = 24 }) {
  const piezas = piezasVista(post, redes);
  const [elegida, setElegida] = useState(piezas[0]?.clave ?? "instagram");
  const [i, setI] = useState(0);
  // «… más» abre el texto entero, como en el teléfono.
  const [textoAbierto, setTextoAbierto] = useState(false);
  // El carrusel se desliza con el dedo (además de las flechas).
  const toque = useRef(null);
  const medioRef = useRef(null);
  // La forma de lo que se ve (ancho / alto): la de la imagen o el video cuando cargan.
  const [forma, setForma] = useState(null);
  const pieza = piezas.find((p) => p.clave === elegida) ?? piezas[0];
  const alto = useAltoMedio(medioRef, encajar, reserva, `${elegida}|${post?.id}`);
  useEffect(() => { setI(0); setTextoAbierto(false); }, [elegida]);
  if (!pieza) return null;

  const esHistoria = pieza.historia || post.format === "historia";
  const medios = pieza.historia ? historiasDe(post) : mediosDe(post);
  const m = medios[Math.min(i, medios.length - 1)];
  // Qué forma tiene el marco: la de lo que sale en esa red.
  const objetivo = pieza.historia ? "historia" : objetivoDe(post, pieza.red);
  const vertical = esHistoria || pieza.red === "tiktok" || (pieza.red === "instagram" && destinoInstagram(post) === "reel")
    || (pieza.red === "youtube" && esShortYouTube(post));
  const usuario = (client?.instagram || client?.name || "cuenta").replace(/^@/, "");
  // En YouTube, el título (la primera línea) y debajo la descripción entera.
  const texto = esHistoria && pieza.red !== "youtube" ? "" : pieza.red === "youtube" ? descripcionYouTube(post) : textoPara(post, pieza.red);
  const cortado = pieza.red === "instagram" && texto.length > CORTE_TEXTO && !textoAbierto;
  const corto = cortado ? `${texto.slice(0, CORTE_TEXTO).trimEnd()}…` : texto;
  const deslizar = {
    onTouchStart: (e) => { const t = e.touches[0]; toque.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e) => {
      const ini = toque.current;
      toque.current = null;
      const t = e.changedTouches[0];
      if (!ini || !t) return;
      const dx = t.clientX - ini.x;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(t.clientY - ini.y)) return;
      setI((n) => Math.max(0, Math.min(medios.length - 1, n + (dx < 0 ? 1 : -1))));
    },
  };
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
      {/* El teléfono, tan ancho como deje caber la imagen ENTERA en el alto que hay (con su forma: 9:16 las verticales). */}
      <div className="vista-red-telefono" data-red={pieza.red}
        style={alto ? { "--vr-ancho-max": `${Math.round(alto * (vertical ? 9 / 16 : forma ?? 4 / 5))}px` } : undefined}>
        {!esHistoria && (
          <div className="vista-previa-autor">
            <span className="vista-previa-avatar">{client?.logo ? <img src={client.logo} alt="" /> : null}</span>
            <strong>{pieza.red === "instagram" ? usuario : client?.name}</strong>
          </div>
        )}
        <div
          ref={medioRef}
          className="vista-red-medio"
          data-vertical={vertical || undefined}
          data-libre={!vertical && !objetivo ? true : undefined}
          data-carrusel={medios.length > 1 || undefined}
          {...(medios.length > 1 ? deslizar : {})}
        >
          {m ? <Medio medio={m} objetivo={objetivo} vertical={vertical} modo={post.ajusteIG || "difuminado"} color={client?.primaryColor} adaptados={post.adaptados} portada={post.portada} onForma={setForma} /> : <span>Sin imagen ni video</span>}
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
            {pieza.red === "youtube" && <strong className="vista-previa-titulo">{tituloYouTube(post) || "Sin título"}</strong>}
            {corto || <em>Sin texto</em>}
            {cortado && (
              <>
                {" "}
                <button type="button" className="vista-previa-mas" onClick={() => setTextoAbierto(true)}>más</button>
              </>
            )}
          </p>
        )}
        {comentario && <p className="vista-previa-comentario"><strong>{usuario}</strong> {comentario}</p>}
      </div>
      {vertical && <p className="hint">Las franjas marcadas las tapa la aplicación: que no caiga ahí nada importante.</p>}
    </section>
  );
}
