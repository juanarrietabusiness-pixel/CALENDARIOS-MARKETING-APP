// ============================================================
// La pestaña «Publicar» del panel de una publicación
//
// Antes, publicar era lo último del panel: las imágenes iban después de
// todo el texto, el botón al fondo, los errores lejos de lo que los
// causaba y ninguno traía su arreglo. Ahora es su propia pestaña, pensada
// en el orden en que se publica:
//
//   1. Dónde sale (las redes) y con qué (los medios, arrastrando o
//      pegando).
//   2. Cómo se va a ver, con el recorte de verdad de cada red.
//   3. El texto de cada red, sus hashtags y su primer comentario.
//   4. Lo que falta, cada cosa con su botón para arreglarla.
//   5. Una barra fija abajo con el día, la hora (y la sugerida) y los
//      botones de programar y publicar.
//
// Las reglas son las de `lib/publicacion.js`, las mismas que aplica el
// servidor al publicar: el aviso llega al escribir, no a la hora de salir.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import {
  revisarPublicacion, aplicarArreglo, REDES, AJUSTES, mediosDe, objetivoDe, necesitaAjuste, conMedios, destinoInstagram,
} from "../../lib/publicacion";
import { vistaAjuste } from "../../lib/medios";
import { horaSugerida } from "../../lib/resultados";
import { metricasCliente } from "../../lib/db";
import { EditorMedios, CamposRedes } from "./editorPublicacion";
import HistoriasDelPost from "./historiasPost";
import VistaRed from "./vistaRed";
import { TimePicker } from "./primitivas";
import { fmt12h } from "./formato";

/**
 * Una imagen que Instagram no acepta tal cual (la de Flow, 3:4): en vez de
 * un error sin salida, cómo se va a ajustar y cómo queda. Se ajusta sola
 * al programar; aquí sólo se elige la forma.
 */
function AjusteImagen({ post, sf, medio, objetivo, color }) {
  const ids = useId();
  const modo = post.ajusteIG || "difuminado";
  const [vista, setVista] = useState(null);
  useEffect(() => {
    let vivo = true;
    vistaAjuste(medio.src, objetivo, modo, color).then((v) => { if (vivo) setVista(v); }).catch(() => { if (vivo) setVista(null); });
    return () => { vivo = false; };
  }, [medio.src, objetivo, modo, color]);
  return (
    <div className="ajuste-imagen">
      <div className="ajuste-imagen-vista" data-objetivo={objetivo}>
        {vista ? <img src={vista} alt={`Cómo quedará en ${objetivo === "historia" ? "la historia" : "el feed"}`} /> : <span>Preparando la vista…</span>}
      </div>
      <div className="ajuste-imagen-opciones">
        <p>
          <strong>{medio.ancho}×{medio.alto}</strong> no cabe en {objetivo === "historia" ? "una historia (9:16)" : "el feed de Instagram (de 4:5 a 1.91:1)"}.
          Al programar se ajusta así; el original no se toca y Facebook y tu cliente lo ven tal cual.
        </p>
        <label className="sr-only" htmlFor={`${ids}-a`}>Cómo ajustar la imagen</label>
        <select id={`${ids}-a`} className="input" value={modo} onChange={(e) => sf("ajusteIG", e.target.value)}>
          {Object.entries(AJUSTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}

// Las publicaciones medidas de cada cliente, una vez por sesión: la hora
// sugerida no merece una petición cada vez que se abre una publicación.
const medidas = new Map();

/** El chip de la hora sugerida: la franja en que mejor responde la cuenta ese día. */
function HoraSugerida({ clientId, fecha, hora, onUsar }) {
  const [pubs, setPubs] = useState(() => medidas.get(clientId) ?? null);
  useEffect(() => {
    if (!clientId || medidas.has(clientId)) return undefined;
    let vivo = true;
    metricasCliente(clientId, 90)
      .then((d) => { const p = d?.publicaciones ?? []; medidas.set(clientId, p); if (vivo) setPubs(p); })
      .catch(() => { medidas.set(clientId, []); });
    return () => { vivo = false; };
  }, [clientId]);
  const s = pubs ? horaSugerida(pubs, fecha) : null;
  if (!s) return null;
  // La sugerida es la franja de tres horas que empieza una antes.
  const inicio = Number(s.hora.slice(0, 2)) - 1;
  const h = Number(String(hora).slice(0, 2));
  if (hora && h >= inicio && h < inicio + 3) {
    return <span className="hora-sugerida" data-dentro title={s.motivo}><Icon name="check" size={12} /> En su mejor franja</span>;
  }
  return (
    <button type="button" className="hora-sugerida" onClick={() => onUsar(s.hora)} title={s.motivo}>
      <Icon name="sparkles" size={12} /> Mejor a las {fmt12h(s.hora)}
      <span className="sr-only">. {s.motivo}</span>
    </button>
  );
}

const REDES_POR_DEFECTO = ["instagram"];

export default function PestanaPublicar({ post, sf, setForm, client, clientId, day, onError, acciones, children }) {
  const ids = useId();
  const entrada = useRef(null);
  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : REDES_POR_DEFECTO;
  const { errores, avisos, arreglos } = revisarPublicacion(post, redes, { navegador: true });
  const objetivo = redes.includes("instagram") ? objetivoDe(post, "instagram") : null;
  const fuera = objetivo ? mediosDe(post).find((m) => necesitaAjuste(m, objetivo)) : null;
  const alternar = (r) => sf("redes", redes.includes(r) ? redes.filter((x) => x !== r) : [...redes, r]);
  const esHistoria = post.format === "historia";
  const destino = destinoInstagram(post);
  const conImagen = mediosDe(post).some((m) => m.tipo === "imagen");
  const visibles = avisos.filter((a) => !(fuera && a.startsWith("Una imagen mide")));

  const arreglar = (texto) => {
    const a = arreglos[texto];
    if (!a) return;
    if (a.codigo === "medios") { entrada.current?.click(); return; }
    setForm((p) => aplicarArreglo(p, a.codigo));
  };

  const problema = (texto, tipo) => (
    <li key={texto} data-tipo={tipo}>
      <span>{tipo === "error" && <Icon name="alert" size={14} />} {texto}</span>
      {arreglos[texto] && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => arreglar(texto)}>
          <Icon name="wand" size={14} /> {arreglos[texto].etiqueta}
        </button>
      )}
    </li>
  );

  return (
    <div className="pestana-publicar">
      <div className="redes-destino" role="group" aria-label="Dónde se publica">
        {Object.entries(REDES).map(([id, r]) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={redes.includes(id)} onClick={() => alternar(id)}>
            <Icon name={r.icono} size={14} /> {r.nombre}
          </button>
        ))}
      </div>

      <EditorMedios
        post={post}
        clientId={clientId}
        driveFolder={client?.driveFolder}
        onChange={(medios) => setForm((p) => conMedios(p, medios))}
        onError={onError}
        entradaRef={entrada}
      />

      {fuera && <AjusteImagen post={post} sf={sf} medio={fuera} objetivo={objetivo} color={client?.primaryColor} />}

      <VistaRed post={{ ...post, redes }} redes={redes} client={client} />

      {esHistoria ? (
        <p className="notice notice-warn pestana-publicar-nota">
          Una historia no lleva texto, hashtags ni comentario: lo que diga va dentro de la imagen o el video.
          {post.format === "historia" && mediosDe(post).length > 1 && ` Salen ${mediosDe(post).length} historias seguidas, en este orden.`}
          {" "}El sticker de enlace, la música y las encuestas sólo se ponen desde la app de Instagram.
        </p>
      ) : (
        <>
          <div className="field">
            <label className="label" htmlFor={`${ids}-desc`}>Texto de la publicación</label>
            <textarea
              id={`${ids}-desc`}
              className="textarea"
              style={{ minHeight: 120 }}
              value={post.descripcion || post.script || ""}
              onChange={(e) => sf("descripcion", e.target.value)}
              placeholder="Caption / descripción del contenido…"
            />
          </div>
          <CamposRedes post={post} sf={sf} />
          {destino === "reel" && redes.includes("instagram") && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-audio`}>Nombre del audio original (opcional)</label>
              <input id={`${ids}-audio`} className="input" maxLength={100} value={post.audioNombre || ""} onChange={(e) => sf("audioNombre", e.target.value)} placeholder="Ej.: Sonido original de Café Luna" />
              <p className="hint">Cómo se llamará el audio del reel en Instagram. La música de la biblioteca sólo se pone desde la app.</p>
            </div>
          )}
          {conImagen && redes.includes("instagram") && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-alt`}>Texto alternativo (opcional)</label>
              <input id={`${ids}-alt`} className="input" maxLength={1000} value={post.altTexto || ""} onChange={(e) => sf("altTexto", e.target.value)} placeholder="Describe la imagen para quien no la ve" />
            </div>
          )}
        </>
      )}

      {!["historia", "live"].includes(post.format) && (
        <HistoriasDelPost post={post} sf={sf} clientId={clientId} colorMarca={client?.primaryColor} onError={onError} />
      )}

      <section className="revision" aria-label="Revisión antes de publicar">
        {errores.length > 0 && (
          <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
            {errores.map((e) => problema(e, "error"))}
          </ul>
        )}
        {visibles.length > 0 && (
          <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
            {visibles.map((a) => problema(a, "aviso"))}
          </ul>
        )}
        {!errores.length && <p className="revision-ok"><Icon name="check" size={14} /> Lista para publicar en {redes.map((r) => REDES[r].nombre).join(" y ")}.</p>}
      </section>

      <div className="barra-fija-publicar">
        <div className="bfp-cuando">
          <span className="bfp-dia"><Icon name="calendar" size={14} /> {day.dayName} {Number((day.date || "").split("-")[2])}</span>
          <label className="sr-only" htmlFor={`${ids}-hora`}>Hora de publicación</label>
          <TimePicker id={`${ids}-hora`} value={post.publishTime || ""} onChange={(v) => sf("publishTime", v)} />
          <HoraSugerida clientId={clientId} fecha={day.date} hora={post.publishTime || ""} onUsar={(h) => sf("publishTime", h)} />
        </div>
        {acciones}
        {children}
      </div>
    </div>
  );
}
