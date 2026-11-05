// ============================================================
// «Sonido» e «Historial» de un video animado (lazy: el chunk de VideoAnimado está en su tope)
//
//   · Sonido: los efectos (whoosh en las transiciones, pop en los sellos) y la MÚSICA de fondo de la galería del
//     cliente, con su volumen. Va aparte del guion: cambiarlo no sube la versión ni pide otra voz; se oye al volver a
//     renderizar (gratis).
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
 * «Generar con IA (Suno)»: describe la música, cotiza (el servidor contesta 409 con el costo, no crea nada) y sólo con
 * «Generar por …» la paga. Sigue el trabajo cada 6 s; al terminar, las versiones salen en la lista y la primera queda
 * puesta en el video.
 */
function GenerarMusica({ client, video, onLista, onCambio }) {
  const ids = useId();
  const delGuion = video.guion?.musica ?? {};
  const [estilo, setEstilo] = useState(delGuion.estilo ?? "");
  const [instrumental, setInstrumental] = useState(delGuion.instrumental !== false);
  const [letra, setLetra] = useState("");
  const [duracion, setDuracion] = useState("");
  const [precio, setPrecio] = useState(null);
  const [trabajo, setTrabajo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);

  const datos = () => ({ estilo, instrumental, ...(instrumental ? {} : { letra }), ...(duracion ? { duracion: Number(duracion) } : {}), videoId: video.id });
  const cambiar = (f) => (e) => { f(e.target.type === "checkbox" ? e.target.checked : e.target.value); setPrecio(null); };

  const pedirla = async (confirmado) => {
    setOcupado(true); setMsg(null);
    try {
      const r = await pedir(`${base(client.id)}/musicas/generar`, { method: "POST", body: JSON.stringify({ ...datos(), confirmado }) });
      setPrecio(null);
      setTrabajo({ id: r.trabajoId, estado: "en_cola", nota: "" });
    } catch (e) {
      if (e.estado === 409 && e.datos?.codigo === "confirmar") setPrecio(e.datos);
      else setMsg({ error: true, texto: e.message });
    } finally { setOcupado(false); }
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
          setMsg({ texto: tr.nota || "Música lista." });
        } else if (tr.estado === "fallido" || tr.estado === "cancelado") setMsg({ error: true, texto: tr.error || "La música no se pudo generar." });
        setTrabajo({ id: tr.id, estado: tr.estado, nota: tr.nota });
      } catch { if (vivo) setTrabajo((x) => (x ? { ...x } : x)); }
    }, 6000);
    return () => { vivo = false; clearTimeout(t); };
  }, [trabajo, client.id, video.id, onLista, onCambio]);

  const enCurso = trabajo && ["en_cola", "en_marcha"].includes(trabajo.estado);
  return (
    <details className="va-generar">
      <summary>Generar la música con IA (Suno)</summary>
      <p className="hint">Suno entrega dos versiones: las dos quedan en la galería y la primera, puesta en este video. Siempre ves el costo antes.</p>
      <label htmlFor={`${ids}-estilo`}>Qué música (género, instrumentos, ánimo, tempo)</label>
      <textarea id={`${ids}-estilo`} className="input" rows={2} maxLength={TOPES_MUSICA.estilo} value={estilo} onChange={cambiar(setEstilo)}
        placeholder="Acústica alegre con ukelele y palmas, cálida, 100 bpm" />
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
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => pedirla(true)}>
              {ocupado ? "Pidiendo…" : `Generar por ${precio.costo < 0.01 ? "menos de 1 ¢" : `${precio.costo.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`} (aprox.)`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado || enCurso || !estilo.trim()} onClick={() => pedirla(false)}>
            {ocupado ? "Cotizando…" : "Ver el costo"}
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
