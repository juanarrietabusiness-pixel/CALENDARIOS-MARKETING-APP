// ============================================================
// «Generar la música con IA (Suno)»: en «Sonido» de un video animado y en la BIBLIOTECA DE SONIDO del cliente (Marca →
// Música y efectos). Es lo mismo de siempre (POST /api/videos/<c>/musicas/generar), sacado de VideoSonido para usarlo
// en los dos sitios.
//
//   · Con un video: primero «Proponer la música para este video»: el DIRECTOR MUSICAL del servidor lee el video
//     guardado y la música de la marca y escribe el pedido para Suno con su porqué (es texto: no pide confirmación).
//   · Sin video (la biblioteca): el estilo que se escriba, o, vacío, la música de la marca del kit.
//   · Siempre «Ver el costo» (el servidor contesta 409 con el costo, no crea nada) y sólo con «Generar por …» se paga.
//     Si en la biblioteca ya hay una pista que encaja (`biblioteca` en la propuesta o en el 409), se ofrece ANTES:
//     reutilizarla es gratis («Usar esta», con `onUsar`).
//   · Sigue el trabajo cada 6 s; al terminar, las dos versiones quedan en la biblioteca (y, con video, la primera puesta).
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { pedir } from "../lib/db";
import { DURACION_MUSICA, TOPES_MUSICA } from "../lib/musica";
import "./GenerarMusica.css";

const base = (c, id = "") => `/videos/${encodeURIComponent(c)}${id ? `/${encodeURIComponent(id)}` : ""}`;
const cifra = (n) => n.toLocaleString("es-PA", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Las pistas de la biblioteca que encajan con lo que se iba a pedir: gratis, antes de pagar. */
function LasQueEncajan({ lista, onUsar }) {
  if (!lista?.length) return null;
  return (
    <div className="gm-encaja" role="group" aria-label="Ya está en la biblioteca">
      <strong><Icon name="music" size={14} /> Antes de pagar: en la biblioteca ya {lista.length === 1 ? "hay una que encaja" : `hay ${lista.length} que encajan`} (gratis)</strong>
      <ul>
        {lista.map((p) => (
          <li key={p.id}>
            <span>
              «{p.nombre}»{p.de === "agencia" ? " · de la agencia" : ""}{p.motivo ? <span className="hint"> · {p.motivo}</span> : null}
            </span>
            <audio controls preload="none" src={p.src} aria-label={`Escuchar ${p.nombre}`} />
            {onUsar && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUsar(p)}>Usar esta (gratis)</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param client   el cliente (la música se guarda en su biblioteca)
 * @param video    el video animado (opcional): con él, el director musical propone y la primera versión queda puesta
 * @param onLista  (archivoId | null) → al terminar (para releer la lista)
 * @param onCambio (video) → con video, el video al día
 * @param onUsar   (pista) → «Usar esta» de una de la biblioteca que encaja (sin él, sólo se enseña)
 */
export default function GenerarMusica({ client, video = null, onLista, onCambio, onUsar = null }) {
  const ids = useId();
  const delGuion = video?.guion?.musica ?? {};
  const [estilo, setEstilo] = useState("");
  const [evitar, setEvitar] = useState("");
  const [titulo, setTitulo] = useState("");
  const [instrumental, setInstrumental] = useState(delGuion.instrumental !== false);
  const [letra, setLetra] = useState("");
  const [duracion, setDuracion] = useState("");
  const [propuesta, setPropuesta] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [biblioteca, setBiblioteca] = useState([]);
  const [precio, setPrecio] = useState(null);
  const [trabajo, setTrabajo] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState(null);

  const conVoz = video?.locucion?.estado === "lista";
  const videoId = video?.id ?? null;
  const datos = () => ({
    ...(estilo.trim() ? { estilo } : {}), ...(evitar.trim() ? { evitar } : {}), ...(titulo.trim() ? { titulo } : {}), instrumental,
    ...(instrumental ? {} : { letra }), ...(duracion ? { duracion: Number(duracion) } : {}), ...(video ? { videoId: video.id } : {}),
  });
  const cambiar = (f) => (e) => { f(e.target.type === "checkbox" ? e.target.checked : e.target.value); setPrecio(null); };
  // Lo que propuso el director (o lo que pediría el servidor) en los campos: es lo que se paga si no se cambia.
  const poner = (pedido, por) => {
    setEstilo(pedido.estilo ?? "");
    setEvitar(pedido.evitar ?? "");
    setTitulo(pedido.titulo ?? "");
    setInstrumental(pedido.instrumental !== false);
    if (pedido.duracion) setDuracion(String(pedido.duracion));
    if (por) setPropuesta(por);
  };

  const proponer = async () => {
    setOcupado("proponer"); setMsg(null); setPrecio(null);
    try {
      const r = await pedir(`${base(client.id, video.id)}/musica`, { method: "POST" });
      poner(r.propuesta, r.propuesta);
      setResumen(r.video ?? null);
      setBiblioteca(r.biblioteca ?? []);
      if (r.aviso) setMsg({ texto: r.aviso });
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(""); }
  };

  const pedirla = async (confirmado) => {
    setOcupado(confirmado ? "generar" : "cotizar"); setMsg(null);
    try {
      const r = await pedir(`${base(client.id)}/musicas/generar`, { method: "POST", body: JSON.stringify({ ...datos(), confirmado }) });
      setPrecio(null);
      setTrabajo({ id: r.trabajoId, estado: "en_cola", nota: "" });
    } catch (e) {
      if (e.estado === 409 && e.datos?.codigo === "confirmar") {
        // Sin estilo, el servidor se lo preguntó al director: se enseña lo que pediría antes de pagar.
        if (!estilo.trim() && e.datos.pedido) poner(e.datos.pedido, e.datos.propuesta ?? null);
        if (e.datos.aviso) setMsg({ texto: e.datos.aviso });
        if (e.datos.biblioteca?.length) setBiblioteca(e.datos.biblioteca);
        setPrecio(e.datos);
      } else setMsg({ error: true, texto: e.message });
    } finally { setOcupado(""); }
  };

  // Seguir el trabajo mientras está vivo.
  useEffect(() => {
    if (!trabajo || !["en_cola", "en_marcha"].includes(trabajo.estado)) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await pedir(`/estudio/${encodeURIComponent(client.id)}/trabajos/${encodeURIComponent(trabajo.id)}`);
        if (!vivo) return;
        const tr = r.trabajo;
        if (tr.estado === "hecho") {
          await onLista?.(tr.archivos?.[0] ?? null);
          if (videoId) {
            const v = await pedir(base(client.id, videoId)).catch(() => null);
            if (v?.video) onCambio?.(v.video);
          }
          setMsg({ texto: `${tr.nota || "Música lista."} ${videoId ? "Si te gusta cómo quedó, márcala con «Me gusta» arriba: el próximo video saldrá en esa línea." : "Ya está en la biblioteca: ponle etiquetas y, si es la de la marca, la estrella."}` });
        } else if (tr.estado === "fallido" || tr.estado === "cancelado") setMsg({ error: true, texto: tr.error || "La música no se pudo generar." });
        setTrabajo({ id: tr.id, estado: tr.estado, nota: tr.nota });
      } catch { if (vivo) setTrabajo((x) => (x ? { ...x } : x)); }
    }, 6000);
    return () => { vivo = false; clearTimeout(t); };
  }, [trabajo, client.id, videoId, onLista, onCambio]);

  const enCurso = trabajo && ["en_cola", "en_marcha"].includes(trabajo.estado);
  return (
    <details className="gm">
      <summary>Generar la música con IA (Suno)</summary>
      {video ? (
        <p className="hint">
          El director musical escucha este video (escenas, cortes, silencios, el llamado y la voz) y la música de la marca, y
          escribe el pedido para Suno. {conVoz ? "Ya tiene la voz: sabe lo que dura de verdad." : "Aún no tiene la voz: usa la duración estimada (mejor después de la locución)."} Proponer
          es texto (céntimos, sin confirmar); Suno entrega dos versiones y siempre ves su costo antes.
        </p>
      ) : (
        <p className="hint">
          Escribe cómo suena (vacío: la música de la marca del kit). Suno entrega dos versiones, que quedan en esta biblioteca; siempre
          ves su costo antes. Si ya hay una que encaja, se dice antes de pagar.
        </p>
      )}
      {video && (
        <div className="gm-acciones">
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || enCurso} onClick={proponer}>
            <Icon name="sparkles" /> {ocupado === "proponer" ? "Escuchando el video…" : propuesta ? "Proponer otra" : "Proponer la música para este video"}
          </button>
        </div>
      )}
      <div aria-live="polite">
        {propuesta && (
          <div className="gm-propuesta">
            <strong>{propuesta.deRespaldo ? "Propuesta sin el director (no respondió)" : "Lo que propone el director musical"}</strong>
            {(propuesta.genero || propuesta.bpm) && (
              <span>{[propuesta.genero, propuesta.bpm ? `${propuesta.bpm} BPM` : "", propuesta.instrumentos].filter(Boolean).join(" · ")}</span>
            )}
            {propuesta.energia && <span className="hint">{propuesta.energia}</span>}
            {propuesta.porque && <span className="hint">Por qué: {propuesta.porque}</span>}
            {resumen && (
              <span className="hint">
                El video: {cifra(resumen.segundos)} s {resumen.conVoz ? "(con la voz)" : "(estimado)"}, {resumen.escenas} escenas, una cada {cifra(resumen.segundosPorEscena)} s.
              </span>
            )}
          </div>
        )}
        <LasQueEncajan lista={biblioteca} onUsar={onUsar} />
      </div>
      <label htmlFor={`${ids}-estilo`}>{video ? "Estilo para Suno (vacío: lo escribe el director musical)" : "Estilo para Suno (vacío: la música de la marca)"}</label>
      <textarea id={`${ids}-estilo`} className="input" rows={3} maxLength={TOPES_MUSICA.estilo} value={estilo} onChange={cambiar(setEstilo)}
        placeholder="warm acoustic folk, ukulele, soft claps, 100 BPM, builds at 0:08" />
      <label htmlFor={`${ids}-evitar`}>Que no lleve</label>
      <input id={`${ids}-evitar`} className="input" maxLength={TOPES_MUSICA.evitar} value={evitar} onChange={cambiar(setEvitar)} placeholder="heavy distortion, aggressive drops" />
      <label htmlFor={`${ids}-titulo`}>Nombre en la biblioteca</label>
      <input id={`${ids}-titulo`} className="input" maxLength={TOPES_MUSICA.titulo} value={titulo} onChange={cambiar(setTitulo)} />
      <label className="gm-check">
        <input type="checkbox" checked={instrumental} onChange={cambiar(setInstrumental)} /> Instrumental (sin voz cantada: no compite con la locución)
      </label>
      {!instrumental && (
        <>
          <label htmlFor={`${ids}-letra`}>Letra</label>
          <textarea id={`${ids}-letra`} className="input" rows={3} maxLength={TOPES_MUSICA.letra} value={letra} onChange={cambiar(setLetra)} placeholder="[Verse] …" />
        </>
      )}
      <label htmlFor={`${ids}-dur`}>{video ? "Duración en segundos (vacío: lo que dura el video)" : `Duración en segundos (vacío: ${DURACION_MUSICA.porDefecto})`}</label>
      <input id={`${ids}-dur`} className="input" type="number" inputMode="numeric" min={DURACION_MUSICA.min} max={DURACION_MUSICA.max} value={duracion} onChange={cambiar(setDuracion)} />
      <div className="gm-acciones">
        {precio ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupado)} onClick={() => pedirla(true)}>
              {ocupado === "generar" ? "Pidiendo…" : `Generar por ${precio.costo < 0.01 ? "menos de 1 ¢" : `${precio.costo.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`} (aprox.)`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado) || enCurso} onClick={() => pedirla(false)}>
            {ocupado === "cotizar" ? (estilo.trim() || !video ? "Cotizando…" : "El director escucha el video…") : "Ver el costo"}
          </button>
        )}
      </div>
      {precio && <p className="gm-msg" role="status">{precio.error}</p>}
      {enCurso && <p className="gm-msg" role="status">Generando la música… {trabajo.nota || "Suele tardar de uno a tres minutos; sigue aunque cierres."}</p>}
      {msg && <p className={msg.error ? "gm-msg gm-error" : "gm-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>}
    </details>
  );
}
