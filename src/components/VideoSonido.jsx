// ============================================================
// «Sonido» e «Historial» de un video animado (lazy: el chunk de VideoAnimado está en su tope)
//
//   · Sonido: los efectos (whoosh en las transiciones, pop en los sellos, o un efecto de la BIBLIOTECA DE SONIDO para
//     cada sitio) y la MÚSICA de fondo de la biblioteca del cliente o de la agencia, con su volumen. Va aparte del guion:
//     cambiarlo no sube la versión ni pide otra voz; se oye al volver a renderizar (gratis). La música se puede GENERAR
//     con Suno (GenerarMusica.jsx): el director musical escucha el video, propone el pedido y, si en la biblioteca ya hay
//     una que encaja, la ofrece antes de pagar; «Me gusta» guarda una que funcionó como música de la marca.
//   · Historial: las versiones de antes del guion; «Volver a esta» crea una versión nueva con ese guion, en borrador.
// ============================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { pedir } from "../lib/db";
import { limpiarSonido, VOLUMEN_MUSICA } from "../lib/sonidoVideo";
import { duracionDeArchivo } from "../lib/sonidosApi";
import GenerarMusica from "./GenerarMusica";

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
  // Un efecto de la biblioteca para las transiciones y otro para los sellos y llamados ("" = el de la aplicación).
  const [transicion, setTransicion] = useState(actual.efectosPropios?.transicion?.archivoId ?? "");
  const [sello, setSello] = useState(actual.efectosPropios?.sello?.archivoId ?? "");
  const [musicas, setMusicas] = useState(null);
  const [efectosLista, setEfectosLista] = useState([]);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState(null);
  const archivo = useRef(null);

  const cargar = useCallback(() => pedir(`${base(client.id)}/musicas`)
    .then((r) => { setMusicas(r?.musicas ?? []); setEfectosLista(r?.efectos ?? []); })
    .catch(() => setMusicas([])), [client.id]);
  useEffect(() => { cargar(); }, [cargar]);
  // La biblioteca cambió (aquí, en Marca → Música y efectos, o en Ajustes): se relee la lista.
  useEffect(() => {
    const alCambiar = () => { cargar(); };
    window.addEventListener("sonidos", alCambiar);
    return () => window.removeEventListener("sonidos", alCambiar);
  }, [cargar]);
  // Una música generada: se relee la lista y se escoge la primera versión (el servidor ya la puso en el video).
  const alLlegar = useCallback(async (id) => { await cargar(); if (id) setMusicaId(id); }, [cargar]);
  // «Usar esta (gratis)»: una de la biblioteca que encaja con lo que propone el director.
  const usar = (p) => { setMusicaId(p.id); setMsg({ texto: `Escogida «${p.nombre}»: guarda el sonido para usarla (no se paga nada).` }); };

  const cambiado = efectos !== actual.efectos || musicaId !== (actual.musica?.archivoId ?? "") || (musicaId && volumen !== (actual.musica?.volumen ?? 0))
    || transicion !== (actual.efectosPropios?.transicion?.archivoId ?? "") || sello !== (actual.efectosPropios?.sello?.archivoId ?? "");
  const renderizando = video.estado === "renderizando";

  const guardar = async () => {
    setOcupado("guardar"); setMsg(null);
    try {
      const r = await pedir(`${base(client.id, video.id)}/sonido`, {
        method: "PUT",
        body: JSON.stringify({ efectos, musica: musicaId ? { archivoId: musicaId, volumen } : null, efectosPropios: { transicion: transicion || null, sello: sello || null } }),
      });
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
      const duracion = await duracionDeArchivo(f);
      if (duracion) form.append("duracion", String(duracion));
      const r = await pedir(`${base(client.id)}/musicas`, { method: "POST", body: form });
      await cargar();
      setMusicaId(r.musica.id);
      setMsg({ texto: r.repetido ? "Esa música ya estaba en la biblioteca: queda escogida." : "Música subida a la biblioteca del cliente y escogida. Guarda el sonido para usarla." });
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
      {efectos && (
        <>
          <SelectorEfecto id={`${ids}-ef-t`} etiqueta="Efecto en las transiciones" porDefecto="El whoosh de la aplicación" valor={transicion}
            onCambio={setTransicion} lista={efectosLista} antes={actual.efectosPropios?.transicion} />
          <SelectorEfecto id={`${ids}-ef-s`} etiqueta="Efecto en los sellos y llamados" porDefecto="El pop de la aplicación" valor={sello}
            onCambio={setSello} lista={efectosLista} antes={actual.efectosPropios?.sello} />
          {!efectosLista.length && <p className="hint">Sube tus efectos (un whoosh, un ding…) en Marca → Música y efectos y escógelos aquí.</p>}
        </>
      )}
      <label htmlFor={`${ids}-musica`}>Música de fondo</label>
      <select id={`${ids}-musica`} className="input" value={musicaId} onChange={(e) => setMusicaId(e.target.value)} disabled={musicas === null}>
        <option value="">Sin música</option>
        <OpcionesDeSonido lista={musicas ?? []} cliente={client.name} />
        {musicaId && musicas && !escogida && <option value={musicaId}>{actual.musica?.nombre || "La de antes"} (ya no está)</option>}
      </select>
      {escogida && <audio controls preload="none" src={escogida.src} className="va-audio" aria-label={`Escuchar ${escogida.nombre}`} />}
      {escogida?.estilo && escogida.de !== "agencia" && (
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
          <Icon name="upload" /> {ocupado === "subir" ? "Subiendo…" : "Subir música (MP3, WAV o M4A)"}
        </button>
        <input ref={archivo} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a" hidden onChange={subir} aria-label="Subir música" />
      </div>
      <p className="hint">Sólo música con derechos para usarla en redes (la de tendencia de Instagram no se puede poner aquí).</p>
      {msg && <p className={msg.error ? "va-msg va-error" : "va-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>}
      <GenerarMusica client={client} video={video} onLista={alLlegar} onCambio={onCambio} onUsar={usar} />
    </details>
  );
}

/** Las pistas de la biblioteca como opciones: las del cliente y las de la agencia, cada una en su grupo. */
function OpcionesDeSonido({ lista, cliente }) {
  const suyas = lista.filter((p) => p.de !== "agencia");
  const agencia = lista.filter((p) => p.de === "agencia");
  const nombre = (p) => `${p.favorita && p.categoria === "musica" ? "★ " : ""}${p.nombre}${p.bpm ? ` · ${p.bpm} BPM` : ""}${p.etiquetas?.length ? ` · ${p.etiquetas.slice(0, 2).join(", ")}` : ""}`;
  return (
    <>
      {suyas.length > 0 && <optgroup label={`De ${cliente}`}>{suyas.map((p) => <option key={p.id} value={p.id}>{nombre(p)}</option>)}</optgroup>}
      {agencia.length > 0 && <optgroup label="De la agencia">{agencia.map((p) => <option key={p.id} value={p.id}>{nombre(p)}</option>)}</optgroup>}
    </>
  );
}

/** Un efecto de la biblioteca para un sitio (o el de la aplicación), con su muestra. */
function SelectorEfecto({ id, etiqueta, porDefecto, valor, onCambio, lista, antes }) {
  const escogido = lista.find((p) => p.id === valor) ?? null;
  return (
    <>
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} className="input" value={valor} onChange={(e) => onCambio(e.target.value)}>
        <option value="">{porDefecto}</option>
        <OpcionesDeSonido lista={lista} cliente="este cliente" />
        {valor && !escogido && <option value={valor}>{antes?.nombre || "El de antes"} (ya no está)</option>}
      </select>
      {escogido && <audio controls preload="none" src={escogido.src} className="va-audio" aria-label={`Escuchar ${escogido.nombre}`} />}
    </>
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
