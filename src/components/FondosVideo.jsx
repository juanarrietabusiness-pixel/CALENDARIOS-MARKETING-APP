// ============================================================
// «Imágenes de fondo» del video animado (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// El guion guardado puede llevar FONDOS POR CREAR (capas de imagen a sangre con «pide» y sin archivo: los pone la IA con
// «Con imágenes de fondo»; src/lib/fondosVideo.js). Mientras no existen, la vista previa enseña el fondo de la escena.
// Aquí se crean con el DIRECTOR de la agencia (un encargo del servidor: 9:16, sin texto ni logo, con el kit y el estilo
// del video): «Ver el costo» pregunta (409 con la cifra; no crea nada) y sólo «Crear por …» paga. Al terminar, el
// servidor las pone en el guion guardado y avisa (`videos`); aquí se mira cada pocos segundos mientras se crean.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { leerVideo, estadoDeFondos, crearFondosVideo } from "../lib/videosApi";
import { fondosPendientes } from "../lib/fondosVideo";

const CADA_MS = 6000;

export default function FondosVideo({ client, video, sucio, onCambio }) {
  const pendientes = useMemo(() => fondosPendientes(video.guion), [video.guion]);
  const [estado, setEstado] = useState(null);
  const [precio, setPrecio] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const enCurso = Boolean(estado?.enCurso);
  // La pantalla pasa funciones nuevas en cada pintada: el intervalo lee las de ahora sin volver a armarse.
  const actual = useRef({ sucio, onCambio });
  useEffect(() => { actual.current = { sucio, onCambio }; });

  // Cuántos faltan, su costo y si ya se están creando (sólo si el guion guardado tiene alguno).
  useEffect(() => {
    if (!pendientes.length) return undefined;
    let vivo = true;
    estadoDeFondos(client.id, video.id).then((e) => { if (vivo) setEstado(e); }).catch(() => {});
    return () => { vivo = false; };
  }, [client.id, video.id, video.version, pendientes.length]);

  // Mientras se crean: cuando el encargo cierra, el video vuelve con sus fondos puestos.
  useEffect(() => {
    if (!enCurso) return undefined;
    const t = setInterval(async () => {
      const e = await estadoDeFondos(client.id, video.id).catch(() => null);
      if (!e || e.enCurso) return;
      setEstado(e);
      const v = await leerVideo(client.id, video.id).catch(() => null);
      if (!v) return;
      if (actual.current.sucio) setAviso("Los fondos quedaron puestos en el guion guardado: guarda o descarta tus cambios para verlos.");
      else { actual.current.onCambio(v); setAviso(fondosPendientes(v.guion).length ? "Algunos fondos no salieron: puedes volver a crearlos." : "Los fondos ya están puestos en el video."); }
    }, CADA_MS);
    return () => clearInterval(t);
  }, [enCurso, client.id, video.id]);

  if (!pendientes.length && !aviso) return null;

  const crear = async (confirmado) => {
    setOcupado(true); setError(""); setAviso("");
    try {
      const r = await crearFondosVideo(client.id, video.id, { confirmado });
      if (r?.confirmar) { setPrecio(r.confirmar); return; }
      setPrecio(null);
      setEstado((e) => ({ ...(e ?? {}), enCurso: r.encargo }));
      setAviso(r.sinPreguntar || "El director está creando los fondos: tardan unos minutos y se ponen solos en el video (también si cierras esto).");
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  return (
    <div className="va-locucion" aria-live="polite">
      <h4><Icon name="image" /> Imágenes de fondo</h4>
      {pendientes.length > 0 && (
        <p className="hint">
          {pendientes.length === 1 ? "Falta 1 imagen de fondo" : `Faltan ${pendientes.length} imágenes de fondo`} (una por sección). Mientras no estén, se ve el fondo de la escena.
          {" "}Las crea el director de la agencia con el kit y el estilo del video: 9:16, sin texto ni logo.
        </p>
      )}
      {pendientes.length > 0 && !enCurso && (
        <div className="va-acciones">
          {precio ? (
            <>
              <button type="button" className="btn btn-accent" disabled={ocupado || sucio} onClick={() => crear(true)}>
                <Icon name="sparkles" /> {ocupado ? "Pidiendo…" : `Crear por unos ${precio.texto ?? ""}`}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => setPrecio(null)}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={ocupado || sucio} onClick={() => crear(false)}
              title={sucio ? "Guarda el guion antes: se crean los del guion guardado" : undefined}>
              <Icon name="sparkles" /> {ocupado ? "Calculando…" : `Crear ${pendientes.length === 1 ? "la imagen" : `las ${pendientes.length} imágenes`} (ver el costo${estado?.texto ? `: unos ${estado.texto}` : ""})`}
            </button>
          )}
        </div>
      )}
      {enCurso && <p className="hint" role="status">Se están creando ({estado.enCurso?.nota || "en cola"}). Se ponen solas al terminar.</p>}
      {sucio && pendientes.length > 0 && !enCurso && <p className="hint">Guarda el guion antes: se crean los fondos del guion guardado.</p>}
      {precio?.error && <p className="va-msg" role="status">{precio.error}{precio.aviso ? ` ${precio.aviso}` : ""}</p>}
      {aviso && <p className="va-msg" role="status">{aviso}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </div>
  );
}
