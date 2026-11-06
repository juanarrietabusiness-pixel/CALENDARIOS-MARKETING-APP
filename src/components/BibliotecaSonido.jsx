// ============================================================
// La BIBLIOTECA DE SONIDO en pantalla: Marca → «Música y efectos» de un cliente y, sin cliente, la de la AGENCIA en
// Ajustes → «Cómo trabajamos» (lazy en los dos sitios)
//
// Dos listas, Música y Efectos; cada pista con su reproductor, su nombre (editable), sus etiquetas (ánimo, ritmo), su
// BPM, la estrella (en la música, «la música de la marca»: la que se propone primero y la que llevan sus videos nuevos)
// y «Quitar» con segundo toque (si un video la usa, lo dice antes). Arriba de cada lista, «Subir» (MP3, WAV o M4A;
// hasta 15 MB la música y 2 MB un efecto). En la de un cliente, además: «Usar de la agencia» (escoger una de la general
// y copiarla aquí), «Pasar a la agencia» (para reutilizar lo de Suno con todos los clientes) y «Generar con Suno» (lo
// de siempre, GenerarMusica.jsx).
//
// Lo de la agencia lo cambian quien administra y los editores sin clientes asignados (el servidor da 403 a los demás):
// a quien no puede, se le enseña sólo para escuchar.
// ============================================================

import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import {
  leerBiblioteca, subirSonido, cambiarSonido, quitarSonido, recuperarSonido, usarDeLaAgencia, pasarALaAgencia, avisarSonidos,
} from "../lib/sonidosApi";
import { ETIQUETAS_SUGERIDAS, MAX_BYTES_SONIDO, MAX_ETIQUETAS, duracionCorta, limpiarEtiquetas } from "../lib/bibliotecaSonido";
import "./BibliotecaSonido.css";

const GenerarMusica = lazy(() => import("./GenerarMusica"));

const ORIGEN = Object.freeze({ suno: "Generada con Suno", subida: "Subida", agencia: "De la agencia", cliente: "De un cliente" });
const ACEPTA = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a";

/**
 * @param client   el cliente; sin él, la biblioteca de la AGENCIA
 * @param lectura  sólo mirar (papel de sólo lectura)
 */
export default function BibliotecaSonido({ client = null, lectura = false }) {
  const ids = useId();
  const clienteId = client?.id ?? null;
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await leerBiblioteca(clienteId));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [clienteId]);
  useEffect(() => { void cargar(); }, [cargar]);
  // Lo que cambia otra pantalla (o otra persona del equipo): se relee.
  useEffect(() => {
    const alCambiar = () => { void cargar(); };
    window.addEventListener("sonidos", alCambiar);
    return () => window.removeEventListener("sonidos", alCambiar);
  }, [cargar]);

  const deAgencia = !clienteId;
  const puedeCambiar = !lectura && (deAgencia ? Boolean(datos?.puedeCambiar) : true);
  const hecho = async (texto, extra = null) => {
    setMsg(texto ? { texto, ...extra } : null);
    avisarSonidos(clienteId);
    await cargar();
  };
  const fallo = (e) => setMsg({ error: true, texto: e.message });

  return (
    <section className={deAgencia ? "bson" : "card bson"} aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`} className="bson-titulo">
        <Icon name="music" size={18} /> {deAgencia ? "Música y efectos de la agencia" : `Música y efectos de ${client.name}`}
      </h3>
      <p className="hint bson-intro">
        {deAgencia
          ? "Para todos los clientes: lo que se sube aquí se puede poner en los videos de cualquiera sin volver a generarlo. Una música de Suno que funcionó con un cliente se pasa aquí desde su biblioteca («Pasar a la agencia»)."
          : "Lo de este cliente: las músicas de Suno, las que subes y sus efectos (un whoosh, un ding) para las transiciones y los sellos de sus videos. Reutilizar una es gratis; la estrella marca la música de la marca, la que llevan sus videos nuevos."}
      </p>
      {deAgencia && datos && !datos.puedeCambiar && !lectura && (
        <p className="hint">La cambian quien administra y los editores sin clientes asignados; tú puedes escucharla y usarla.</p>
      )}
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {!datos && !error && <p role="status" className="hint">Cargando la biblioteca…</p>}
      {datos && (
        <>
          <Lista
            categoria="musica" titulo="Música" pistas={datos.musica} clienteId={clienteId} client={client} puedeCambiar={puedeCambiar}
            agencia={datos.agencia?.musica ?? []} puedeCambiarAgencia={Boolean(datos.puedeCambiarAgencia) && !lectura}
            onHecho={hecho} onFallo={fallo} onRecargar={cargar}
          />
          <Lista
            categoria="efecto" titulo="Efectos" pistas={datos.efectos} clienteId={clienteId} client={client} puedeCambiar={puedeCambiar}
            agencia={datos.agencia?.efectos ?? []} puedeCambiarAgencia={Boolean(datos.puedeCambiarAgencia) && !lectura}
            onHecho={hecho} onFallo={fallo} onRecargar={cargar}
          />
        </>
      )}
      <div aria-live="polite">
        {msg && (
          <p className={msg.error ? "bson-msg bson-error" : "bson-msg"} role={msg.error ? "alert" : "status"}>
            {msg.texto}
            {msg.deshacer && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                try { await recuperarSonido(clienteId, msg.deshacer); await hecho("Ha vuelto a la biblioteca."); } catch (e) { fallo(e); }
              }}>
                <Icon name="undo" size={14} /> Deshacer
              </button>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/** Una de las dos listas (Música o Efectos), con sus acciones arriba. */
function Lista({ categoria, titulo, pistas, clienteId, client, puedeCambiar, agencia, puedeCambiarAgencia, onHecho, onFallo, onRecargar }) {
  const ids = useId();
  const archivo = useRef(null);
  const [abierto, setAbierto] = useState("");
  const [ocupado, setOcupado] = useState("");
  const tope = MAX_BYTES_SONIDO[categoria];
  const esMusica = categoria === "musica";

  const subir = async (e) => {
    const lista = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!lista.length) return;
    setOcupado("subir");
    try {
      let subidas = 0;
      let repetidas = 0;
      for (const f of lista) {
        if (f.size > tope) throw new Error(`«${f.name}» pesa más de ${esMusica ? "15" : "2"} MB${esMusica ? "" : ": un efecto es un sonido corto"}.`);
        const r = await subirSonido(clienteId, f, { categoria });
        if (r.repetido) repetidas++; else subidas++;
      }
      await onHecho([
        subidas ? `${subidas === 1 ? "Subida" : `${subidas} subidas`} a ${esMusica ? "la música" : "los efectos"}.` : "",
        repetidas ? `${repetidas === 1 ? "Una ya estaba" : `${repetidas} ya estaban`} en la biblioteca.` : "",
        subidas ? "Ponle etiquetas (ánimo, ritmo): así el director musical la encuentra antes de pagar otra." : "",
      ].filter(Boolean).join(" "));
    } catch (err) { onFallo(err); } finally { setOcupado(""); }
  };

  const usar = async (p) => {
    setOcupado(p.id);
    try {
      const r = await usarDeLaAgencia(clienteId, p.id);
      await onHecho(r.repetido ? `«${p.nombre}» ya estaba en la biblioteca de ${client.name}.` : `«${p.nombre}» ya es de ${client.name}: ponle su estrella o sus etiquetas.`);
      setAbierto("");
    } catch (err) { onFallo(err); } finally { setOcupado(""); }
  };

  const idLista = `${ids}-lista`;
  return (
    <div className="bson-lista" role="group" aria-labelledby={`${ids}-h`}>
      <div className="bson-cabeza">
        <h4 id={`${ids}-h`}>{titulo} <span className="hint">({pistas.length})</span></h4>
        {puedeCambiar && (
          <div className="bson-acciones">
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} onClick={() => archivo.current?.click()}>
              <Icon name="upload" size={14} /> {ocupado === "subir" ? "Subiendo…" : esMusica ? "Subir música" : "Subir efecto"}
            </button>
            <input ref={archivo} type="file" accept={ACEPTA} multiple hidden onChange={subir} aria-label={esMusica ? "Subir música" : "Subir efecto"} />
            {clienteId && (
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierto === "agencia"} aria-controls={`${ids}-agencia`}
                onClick={() => setAbierto((x) => (x === "agencia" ? "" : "agencia"))}>
                <Icon name="layers" size={14} /> Usar de la agencia
              </button>
            )}
            {clienteId && esMusica && (
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierto === "suno"} aria-controls={`${ids}-suno`}
                onClick={() => setAbierto((x) => (x === "suno" ? "" : "suno"))}>
                <Icon name="sparkles" size={14} /> Generar con Suno
              </button>
            )}
          </div>
        )}
      </div>
      <p className="hint bson-nota">MP3, WAV o M4A, hasta {esMusica ? "15" : "2"} MB. {esMusica ? "Sólo música con derechos para usarla en redes." : "Sonidos cortos: se usan hasta 4 segundos."}</p>

      {clienteId && abierto === "agencia" && (
        <div id={`${ids}-agencia`} className="bson-agencia">
          {agencia.length ? (
            <ul aria-label={`${titulo} de la agencia`}>
              {agencia.map((p) => (
                <li key={p.id}>
                  <span className="bson-agencia-nombre">«{p.nombre}» <span className="hint">{[p.bpm ? `${p.bpm} BPM` : "", p.etiquetas.join(", "), duracionCorta(p.duracion)].filter(Boolean).join(" · ")}</span></span>
                  <audio controls preload="none" src={p.src} aria-label={`Escuchar ${p.nombre}`} />
                  <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupado)} onClick={() => usar(p)}>
                    {ocupado === p.id ? "Copiando…" : `Usar para ${client.name}`}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="hint">La agencia aún no tiene {esMusica ? "música" : "efectos"}: se suben en Ajustes → Cómo trabajamos.</p>}
        </div>
      )}
      {clienteId && esMusica && abierto === "suno" && (
        <div id={`${ids}-suno`}>
          <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
            <GenerarMusica client={client} onLista={onRecargar} />
          </Suspense>
        </div>
      )}

      {pistas.length ? (
        <ul id={idLista} className="bson-pistas">
          {pistas.map((p) => (
            <Pista key={`${p.id}:${p.nombre}:${p.etiquetas.join(",")}:${p.bpm ?? ""}:${p.favorita}`} pista={p} clienteId={clienteId} puedeCambiar={puedeCambiar}
              puedeCambiarAgencia={puedeCambiarAgencia} onHecho={onHecho} onFallo={onFallo} />
          ))}
        </ul>
      ) : (
        <p className="hint">{esMusica ? "Sin música todavía." : "Sin efectos todavía: los videos usan el whoosh y el pop de la aplicación."}</p>
      )}
    </div>
  );
}

/** Una pista: escuchar, nombre, etiquetas, BPM, la estrella y quitar. */
function Pista({ pista: p, clienteId, puedeCambiar, puedeCambiarAgencia, onHecho, onFallo }) {
  const ids = useId();
  const [nombre, setNombre] = useState(p.nombre);
  const [bpm, setBpm] = useState(p.bpm ?? "");
  const [etiqueta, setEtiqueta] = useState("");
  const [ocupado, setOcupado] = useState("");
  // Quitar: un primer toque pide el segundo; si un video la usa, el servidor lo dice y se pide otro más.
  const [quitar, setQuitar] = useState(null);
  const esMusica = p.categoria === "musica";

  const cambiar = async (cambios, texto = "") => {
    setOcupado("cambiar");
    try { await cambiarSonido(clienteId, p.id, cambios); await onHecho(texto); } catch (e) { onFallo(e); } finally { setOcupado(""); }
  };
  const guardarNombre = () => { if (nombre.trim() && nombre.trim() !== p.nombre) void cambiar({ nombre }); };
  const guardarBpm = () => { if (String(bpm) !== String(p.bpm ?? "")) void cambiar({ bpm: bpm === "" ? null : Number(bpm) }); };
  const anadir = () => {
    const nuevas = limpiarEtiquetas([...p.etiquetas, ...etiqueta.split(",")]);
    setEtiqueta("");
    if (nuevas.length !== p.etiquetas.length) void cambiar({ etiquetas: nuevas });
  };

  const alQuitar = async () => {
    if (!quitar) { setQuitar({ paso: "confirmar" }); return; }
    setOcupado("quitar");
    try {
      const r = await quitarSonido(clienteId, p.id, { forzar: quitar.paso === "forzar" });
      await onHecho(`Quitada «${p.nombre}».`, r?.papelera ? { deshacer: p.id } : null);
    } catch (e) {
      if (e.estado === 409 && e.datos?.codigo === "en_uso") setQuitar({ paso: "forzar", aviso: e.message });
      else { onFallo(e); setQuitar(null); }
    } finally { setOcupado(""); }
  };

  const pasar = async () => {
    setOcupado("agencia");
    try {
      const r = await pasarALaAgencia(clienteId, p.id);
      await onHecho(r.repetido ? `«${p.nombre}» ya estaba en la biblioteca de la agencia.` : `«${p.nombre}» ya está en la biblioteca de la agencia: se puede usar con todos los clientes.`);
    } catch (e) { onFallo(e); } finally { setOcupado(""); }
  };

  const datos = [ORIGEN[p.origen] ?? "", duracionCorta(p.duracion), p.bpm ? `${p.bpm} BPM` : ""].filter(Boolean).join(" · ");
  return (
    <li className="bson-pista">
      <div className="bson-fila">
        {puedeCambiar ? (
          <input className="input bson-nombre" aria-label="Nombre" value={nombre} maxLength={80}
            onChange={(e) => setNombre(e.target.value)} onBlur={guardarNombre} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        ) : <strong className="bson-nombre">{p.nombre}</strong>}
        <button type="button" className={`btn-icon bson-estrella${p.favorita ? " activa" : ""}`} aria-pressed={p.favorita} disabled={!puedeCambiar || Boolean(ocupado)}
          aria-label={esMusica ? "Música de la marca" : "Favorito"} title={esMusica ? "La música de la marca: la que se propone primero y llevan sus videos nuevos" : "Favorito: se propone primero"}
          onClick={() => cambiar({ favorita: !p.favorita }, !p.favorita && esMusica ? `«${p.nombre}» es ahora la música de la marca.` : "")}>
          <Icon name="star" size={18} />
        </button>
      </div>
      <p className="hint bson-datos">{datos}{p.favorita && esMusica ? " · Música de la marca" : ""}</p>
      <audio controls preload="none" src={p.src} className="bson-audio" aria-label={`Escuchar ${p.nombre}`} />
      <div className="bson-etiquetas">
        {p.etiquetas.length > 0 && (
          <ul aria-label="Etiquetas">
            {p.etiquetas.map((t) => (
              <li key={t} className="bson-chip">
                {t}
                {puedeCambiar && (
                  <button type="button" className="bson-chip-quitar" aria-label={`Quitar la etiqueta ${t}`} disabled={Boolean(ocupado)}
                    onClick={() => cambiar({ etiquetas: p.etiquetas.filter((x) => x !== t) })}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {puedeCambiar && p.etiquetas.length < MAX_ETIQUETAS && (
          <>
            <input className="input bson-etiqueta" aria-label={`Añadir etiquetas a ${p.nombre}`} placeholder={esMusica ? "alegre, acústica…" : "whoosh, ding…"} value={etiqueta}
              list={`${ids}-sug`} onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); anadir(); } }} onBlur={() => { if (etiqueta.trim()) anadir(); }} />
            <datalist id={`${ids}-sug`}>{ETIQUETAS_SUGERIDAS[p.categoria].map((t) => <option key={t} value={t} />)}</datalist>
          </>
        )}
        {puedeCambiar && esMusica && (
          <input className="input bson-bpm" type="number" inputMode="numeric" min={40} max={240} aria-label={`BPM de ${p.nombre}`} placeholder="BPM" value={bpm}
            onChange={(e) => setBpm(e.target.value)} onBlur={guardarBpm} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        )}
      </div>
      {puedeCambiar && (
        <div className="bson-acciones">
          {clienteId && puedeCambiarAgencia && p.de === "cliente" && p.origen !== "agencia" && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={pasar}>
              <Icon name="layers" size={14} /> {ocupado === "agencia" ? "Pasando…" : "Pasar a la agencia"}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm bson-quitar" disabled={Boolean(ocupado) && ocupado !== "quitar"} onClick={alQuitar} onBlur={() => { if (quitar?.paso === "confirmar") setQuitar(null); }}>
            <Icon name="trash" size={14} /> {ocupado === "quitar" ? "Quitando…" : quitar?.paso === "forzar" ? "Quitarla igual" : quitar ? "Toca otra vez para quitarla" : "Quitar"}
          </button>
          {quitar?.paso === "forzar" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitar(null)}>Mejor no</button>
          )}
        </div>
      )}
      {quitar?.aviso && <p className="bson-msg" role="alert">{quitar.aviso}</p>}
    </li>
  );
}
