// ============================================================
// «Sonido» e «Historial» de un video animado (lazy: el chunk de VideoAnimado está en su tope)
//
//   · Sonido: los efectos (whoosh en las transiciones, pop en los sellos) y la MÚSICA de fondo de la galería del
//     cliente, con su volumen. Va aparte del guion: cambiarlo no sube la versión ni pide otra voz; se oye al volver a
//     renderizar (gratis). La música se puede GENERAR con Suno: el director musical escucha el video y propone el
//     pedido (worker/lib/estudio/directorMusical.js), y «Me gusta» guarda una que funcionó como música de la marca.
//   · Historial: las versiones de antes del guion; «Volver a esta» crea una versión nueva con ese guion, en borrador.
// ============================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { pedir } from "../lib/db";
import { limpiarSonido, VOLUMEN_MUSICA } from "../lib/sonidoVideo";
import { DURACION_MUSICA, TOPES_MUSICA } from "../lib/musica";

const base = (c, id = "") => `/videos/${encodeURIComponent(c)}${id ? `/${encodeURIComponent(id)}` : ""}`;
const avisar = (clienteId, id) => { try { window.dispatchEvent(new CustomEvent("videos", { detail: { local: true, clienteId, id } })); } catch { /* sin ventana */ } };
const fecha = (iso) => { try { return new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

export default function VideoSonido({ client, video, sucio, onCambio }) {
  return (
    <>
      <Sonido client={client} video={video} onCambio={onCambio} />
      <Historial client={client} video={video} sucio={sucio} onCambio={onCambio} />
    </>
  );
}

function Sonido({ client, video, onCambio }) {
  const ids = useId();
  const actual = limpiarSonido(video.sonido);
  const [efectos, setEfectos] = useState(actual.efectos);
  const [musicaId, setMusicaId] = useState(actual.musica?.archivoId ?? "");
  const [volumen, setVolumen] = useState(actual.musica?.volumen ?? 0);
  const [musicas, setMusicas] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState(null);
  const archivo = useRef(null);

  const cargar = useCallback(() => pedir(`${base(client.id)}/musicas`).then((r) => setMusicas(r?.musicas ?? [])).catch(() => setMusicas([])), [client.id]);
  useEffect(() => { cargar(); }, [cargar]);
  // Una música generada: se relee la lista y se escoge la primera versión (el servidor ya la puso en el video).
  const alLlegar = useCallback(async (id) => { await cargar(); if (id) setMusicaId(id); }, [cargar]);

  const cambiado = efectos !== actual.efectos || musicaId !== (actual.musica?.archivoId ?? "") || (musicaId && volumen !== (actual.musica?.volumen ?? 0));
  const renderizando = video.estado === "renderizando";

  const guardar = async () => {
    setOcupado("guardar"); setMsg(null);
    try {
      const r = await pedir(`${base(client.id, video.id)}/sonido`, { method: "PUT", body: JSON.stringify({ efectos, musica: musicaId ? { archivoId: musicaId, volumen } : null }) });
      onCambio(r.video); avisar(client.id, video.id);
      setMsg({ texto: video.render?.estado === "listo" ? "Guardado. El mp4 de ahora es de antes: vuelve a renderizar para oírlo (no gasta IA ni pide otra voz)." : "Guardado. Se oirá en el render." });
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(""); }
  };

  const subir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setOcupado("subir"); setMsg(null);
    try {
      const form = new FormData();
      form.append("archivo", f);
      const r = await pedir(`${base(client.id)}/musicas`, { method: "POST", body: form });
      await cargar();
      setMusicaId(r.musica.id);
      setMsg({ texto: r.repetido ? "Esa música ya estaba en la galería: queda escogida." : "Música subida y escogida. Guarda el sonido para usarla." });
    } catch (err) { setMsg({ error: true, texto: err.message }); } finally { setOcupado(""); }
  };

  const escogida = musicas?.find((m) => m.id === musicaId) ?? null;
  // «Me gusta esta»: lo que se le pidió a Suno pasa a ser referencia de la música de la marca (en el kit).
  const meGusta = async () => {
    setOcupado("gusta"); setMsg(null);
    try {
      await pedir(`${base(client.id)}/musicas/marca`, { method: "POST", body: JSON.stringify({ archivoId: escogida.id }) });
      setMsg({ texto: "Guardada como música de la marca: el director musical seguirá esta línea en los próximos videos (se ve en Marca → Kit y voz)." });
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(""); }
  };

  return (
    <details className="va-sonido">
      <summary>Sonido: efectos y música</summary>
      <p className="hint">Va aparte del guion: cambiarlo no pide otra voz. Se oye al volver a renderizar (gratis).</p>
      <label className="va-check">
        <input type="checkbox" checked={efectos} onChange={(e) => setEfectos(e.target.checked)} />
        Efectos de sonido bajitos (un whoosh en cada transición, un pop al entrar un sello o el llamado)
      </label>
      <label htmlFor={`${ids}-musica`}>Música de fondo</label>
      <select id={`${ids}-musica`} className="input" value={musicaId} onChange={(e) => setMusicaId(e.target.value)} disabled={musicas === null}>
        <option value="">Sin música</option>
        {(musicas ?? []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        {musicaId && musicas && !escogida && <option value={musicaId}>{actual.musica?.nombre || "La de antes"} (ya no está)</option>}
      </select>
      {escogida && <audio controls preload="none" src={escogida.src} className="va-audio" aria-label={`Escuchar ${escogida.nombre}`} />}
      {escogida?.estilo && (
        <div className="va-acciones">
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={meGusta}>
            <Icon name="heart" /> {ocupado === "gusta" ? "Guardando…" : "Me gusta: que sea la música de la marca"}
          </button>
        </div>
      )}
      {musicaId && (
        <>
          <label htmlFor={`${ids}-vol`}>Volumen de la música: {volumen > 0 ? `+${volumen}` : volumen} dB</label>
          <input id={`${ids}-vol`} type="range" min={VOLUMEN_MUSICA.min} max={VOLUMEN_MUSICA.max} step={1} value={volumen} onChange={(e) => setVolumen(Number(e.target.value))} />
          <p className="hint">Baja sola mientras se habla y sube en los huecos; entra y sale con fundido.</p>
        </>
      )}
      <div className="va-acciones">
        <button type="button" className="btn btn-primary btn-sm" disabled={!cambiado || Boolean(ocupado) || renderizando} onClick={guardar}>
          {ocupado === "guardar" ? "Guardando…" : "Guardar el sonido"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => archivo.current?.click()}>
          <Icon name="upload" /> {ocupado === "subir" ? "Subiendo…" : "Subir música (MP3 o WAV)"}
        </button>
        <input ref={archivo} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" hidden onChange={subir} aria-label="Subir música" />
      </div>
      <p className="hint">Sólo música con derechos para usarla en redes (la de tendencia de Instagram no se puede poner aquí).</p>
      {msg && <p className={msg.error ? "va-msg va-error" : "va-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>}
      <GenerarMusica client={client} video={video} onLista={alLlegar} onCambio={onCambio} />
    </details>
  );
}

/**
 * «Generar con IA (Suno)». Primero «Proponer la música para este video»: el DIRECTOR MUSICAL del servidor lee el video
 * guardado (escenas, cortes, silencios, el llamado, la voz) y la música de la marca, y escribe el pedido para Suno con
 * su porqué (es texto: no pide confirmación). El pedido se puede corregir; luego «Ver el costo» (el servidor contesta
 * 409 con el costo, no crea nada) y sólo con «Generar por …» se paga. Sin proponer y sin estilo, el servidor también se
 * lo pregunta al director: el 409 trae lo que pediría y aquí se enseña antes de pagar. Sigue el trabajo cada 6 s; al
 * terminar, las versiones salen en la lista y la primera queda puesta en el video.
 */
function GenerarMusica({ client, video, onLista, onCambio }) {
  const ids = useId();
  const delGuion = video.guion?.musica ?? {};
  const [estilo, setEstilo] = useState("");
  const [evitar, setEvitar] = useState("");
  const [titulo, setTitulo] = useState("");
  const [instrumental, setInstrumental] = useState(delGuion.instrumental !== false);
  const [letra, setLetra] = useState("");
  const [duracion, setDuracion] = useState("");
  const [propuesta, setPropuesta] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [precio, setPrecio] = useState(null);
  const [trabajo, setTrabajo] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState(null);

  const conVoz = video.locucion?.estado === "lista";
  const datos = () => ({
    ...(estilo.trim() ? { estilo } : {}), ...(evitar.trim() ? { evitar } : {}), ...(titulo.trim() ? { titulo } : {}), instrumental,
    ...(instrumental ? {} : { letra }), ...(duracion ? { duracion: Number(duracion) } : {}), videoId: video.id,
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
          await onLista(tr.archivos?.[0] ?? null);
          const v = await pedir(base(client.id, video.id)).catch(() => null);
          if (v?.video) onCambio(v.video);
          setMsg({ texto: `${tr.nota || "Música lista."} Si te gusta cómo quedó, márcala con «Me gusta» arriba: el próximo video saldrá en esa línea.` });
        } else if (tr.estado === "fallido" || tr.estado === "cancelado") setMsg({ error: true, texto: tr.error || "La música no se pudo generar." });
        setTrabajo({ id: tr.id, estado: tr.estado, nota: tr.nota });
      } catch { if (vivo) setTrabajo((x) => (x ? { ...x } : x)); }
    }, 6000);
    return () => { vivo = false; clearTimeout(t); };
  }, [trabajo, client.id, video.id, onLista, onCambio]);

  const enCurso = trabajo && ["en_cola", "en_marcha"].includes(trabajo.estado);
  const cifra = (n) => n.toLocaleString("es-PA", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return (
    <details className="va-generar">
      <summary>Generar la música con IA (Suno)</summary>
      <p className="hint">
        El director musical escucha este video (escenas, cortes, silencios, el llamado y la voz) y la música de la marca, y
        escribe el pedido para Suno. {conVoz ? "Ya tiene la voz: sabe lo que dura de verdad." : "Aún no tiene la voz: usa la duración estimada (mejor después de la locución)."} Proponer
        es texto (céntimos, sin confirmar); Suno entrega dos versiones y siempre ves su costo antes.
      </p>
      <div className="va-acciones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || enCurso} onClick={proponer}>
          <Icon name="sparkles" /> {ocupado === "proponer" ? "Escuchando el video…" : propuesta ? "Proponer otra" : "Proponer la música para este video"}
        </button>
      </div>
      <div aria-live="polite">
        {propuesta && (
          <div className="va-propuesta">
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
      </div>
      <label htmlFor={`${ids}-estilo`}>Estilo para Suno (vacío: lo escribe el director musical)</label>
      <textarea id={`${ids}-estilo`} className="input" rows={3} maxLength={TOPES_MUSICA.estilo} value={estilo} onChange={cambiar(setEstilo)}
        placeholder="warm acoustic folk, ukulele, soft claps, 100 BPM, builds at 0:08" />
      <label htmlFor={`${ids}-evitar`}>Que no lleve</label>
      <input id={`${ids}-evitar`} className="input" maxLength={TOPES_MUSICA.evitar} value={evitar} onChange={cambiar(setEvitar)} placeholder="heavy distortion, aggressive drops" />
      <label htmlFor={`${ids}-titulo`}>Nombre en la galería</label>
      <input id={`${ids}-titulo`} className="input" maxLength={TOPES_MUSICA.titulo} value={titulo} onChange={cambiar(setTitulo)} />
      <label className="va-check">
        <input type="checkbox" checked={instrumental} onChange={cambiar(setInstrumental)} /> Instrumental (sin voz cantada: no compite con la locución)
      </label>
      {!instrumental && (
        <>
          <label htmlFor={`${ids}-letra`}>Letra</label>
          <textarea id={`${ids}-letra`} className="input" rows={3} maxLength={TOPES_MUSICA.letra} value={letra} onChange={cambiar(setLetra)} placeholder="[Verse] …" />
        </>
      )}
      <label htmlFor={`${ids}-dur`}>Duración en segundos (vacío: lo que dura el video)</label>
      <input id={`${ids}-dur`} className="input" type="number" inputMode="numeric" min={DURACION_MUSICA.min} max={DURACION_MUSICA.max} value={duracion} onChange={cambiar(setDuracion)} />
      <div className="va-acciones">
        {precio ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupado)} onClick={() => pedirla(true)}>
              {ocupado === "generar" ? "Pidiendo…" : `Generar por ${precio.costo < 0.01 ? "menos de 1 ¢" : `${precio.costo.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`} (aprox.)`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado) || enCurso} onClick={() => pedirla(false)}>
            {ocupado === "cotizar" ? (estilo.trim() ? "Cotizando…" : "El director escucha el video…") : "Ver el costo"}
          </button>
        )}
      </div>
      {precio && <p className="va-msg" role="status">{precio.error}</p>}
      {enCurso && <p className="va-msg" role="status">Generando la música… {trabajo.nota || "Suele tardar de uno a tres minutos; sigue aunque cierres."}</p>}
      {msg && <p className={msg.error ? "va-msg va-error" : "va-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>}
    </details>
  );
}

function Historial({ client, video, sucio, onCambio }) {
  const [versiones, setVersiones] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [confirma, setConfirma] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    pedir(`${base(client.id, video.id)}/versiones`).then((r) => { if (vivo) setVersiones(r?.versiones ?? []); }).catch(() => { if (vivo) setVersiones([]); });
    return () => { vivo = false; };
  }, [abierto, client.id, video.id, video.version]);

  const volver = async (n) => {
    if (confirma !== n) { setConfirma(n); return; }
    setOcupado(n); setMsg(null);
    try {
      const r = await pedir(`${base(client.id, video.id)}/versiones`, { method: "POST", body: JSON.stringify({ version: video.version, aVersion: n }) });
      onCambio(r.video); avisar(client.id, video.id);
      setMsg({ texto: `Listo: el guion de la versión ${n} es ahora la versión ${r.video.version}, en borrador. Apruébalo otra vez; si lo que se dice coincide con la voz que ya hay, no hace falta pagar otra.` });
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(null); setConfirma(null); }
  };

  return (
    <details className="va-historial" onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary>Historial de versiones</summary>
      {versiones === null ? <p className="hint">Cargando…</p> : !versiones.length ? (
        <p className="hint">Aún no hay versiones de antes: el historial empieza con el primer cambio del guion.</p>
      ) : (
        <ul className="va-versiones" aria-label="Versiones de antes del guion">
          {versiones.map((v) => (
            <li key={v.version}>
              <div>
                <strong>v{v.version}</strong> <span className="hint">{fecha(v.fecha)}{v.por ? ` · ${v.por}` : ""} · {v.escenas} escenas · {v.segundos.toFixed(1)} s</span>
                {v.habla && <p className="hint">«{v.habla}»</p>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={sucio || ocupado !== null || video.estado === "renderizando"}
                title={sucio ? "Guarda o descarta los cambios antes" : undefined} onClick={() => volver(v.version)} onBlur={() => setConfirma(null)}>
                {ocupado === v.version ? "Volviendo…" : confirma === v.version ? "Toca otra vez para volver" : "Volver a esta"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className={msg.error ? "va-msg va-error" : "va-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>}
    </details>
  );
}
