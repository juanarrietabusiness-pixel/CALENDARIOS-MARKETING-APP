// ============================================================
// «Plantillas de moda» del video animado (lazy): reels de movimiento gráfico armados por el código (src/lib/
// plantillasVideo.js), sin voz y sin IA. Se escoge la plantilla, se escriben sus textos y se escogen las fotos de la
// galería; el servidor crea el borrador (`POST /api/videos/<c>/plantilla`) y se abre con `onCreado` para retocarlo,
// ponerle música y renderizarlo.
// ============================================================

import { lazy, Suspense, useId, useState } from "react";
import Icon from "./Icon";
import { crearDesdePlantilla } from "../lib/videosApi";
import { PLANTILLAS_VIDEO } from "../lib/plantillasVideo";

const GaleriaSelector = lazy(() => import("./GaleriaSelector"));

/** Cuántas fotos pide cada plantilla (mín., máx.) y para qué. */
const FOTOS = {
  comentarios: [0, 1, "La foto del producto para el cierre (opcional)"],
  busqueda: [0, 1, "La foto del producto que aparece al final (opcional)"],
  producto: [1, 3, "Las fotos del producto (de 1 a 3; mejor con fondo liso o transparente)"],
  logo: [3, 12, "Las fotos de la marca que pasan detrás del logo (de 3 a 12)"],
};

const lineas = (t) => String(t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

export default function CrearConPlantilla({ client, publicacion = null, onCreado, onCancelar }) {
  const ids = useId();
  const [plantilla, setPlantilla] = useState("comentarios");
  const [campos, setCampos] = useState({ usuario: "", comentario: "", respuestas: "", busqueda: "", resultados: "", nombre: "", precio: "", textos: "", llamado: "" });
  const [fotos, setFotos] = useState([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [min, max, textoFotos] = FOTOS[plantilla];
  const campo = (k) => ({ value: campos[k], onChange: (e) => setCampos((c) => ({ ...c, [k]: e.target.value })) });

  const datos = () => {
    const f = fotos.map((a) => a.id);
    if (plantilla === "comentarios") return { usuario: campos.usuario, comentario: campos.comentario, respuestas: lineas(campos.respuestas), producto: f[0], llamado: campos.llamado };
    if (plantilla === "busqueda") return { busqueda: campos.busqueda, resultados: lineas(campos.resultados), producto: f[0], nombre: campos.nombre, precio: campos.precio, llamado: campos.llamado };
    if (plantilla === "producto") return { fotos: f, textos: lineas(campos.textos), precio: campos.precio, llamado: campos.llamado };
    return { fotos: f, llamado: campos.llamado };
  };

  const crear = async () => {
    setOcupado(true);
    setError("");
    try {
      const r = await crearDesdePlantilla(client.id, { plantilla, datos: datos(), calendarId: publicacion?.calendarId ?? null, postId: publicacion?.postId ?? null });
      onCreado(r.video, "Hecho con la plantilla: ponle música en «Sonido», míralo y renderízalo.");
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  return (
    <>
      <p className="hint">Reels de movimiento gráfico con el kit del cliente: sin grabar, sin voz y sin IA (no cuestan). Después le pones música y lo renderizas.</p>
      <fieldset className="va-opciones">
        <legend>Plantilla</legend>
        {PLANTILLAS_VIDEO.map((p) => (
          <button key={p.id} type="button" className="filter-chip" aria-pressed={plantilla === p.id} title={p.detalle} onClick={() => { setPlantilla(p.id); setFotos([]); }}>{p.nombre}</button>
        ))}
      </fieldset>
      <p className="hint" style={{ marginTop: 0 }}>{PLANTILLAS_VIDEO.find((p) => p.id === plantilla).detalle}</p>

      {plantilla === "comentarios" && (
        <>
          <label htmlFor={`${ids}-u`}>Quién comenta (sin @; opcional)</label>
          <input id={`${ids}-u`} className="input" maxLength={30} placeholder="maria.pty" {...campo("usuario")} />
          <label htmlFor={`${ids}-c`}>El comentario</label>
          <textarea id={`${ids}-c`} className="input" rows={2} maxLength={140} placeholder="¿Y eso no se daña con el agua?" {...campo("comentario")} />
          <label htmlFor={`${ids}-r`}>La respuesta: una frase corta por línea (hasta 4)</label>
          <textarea id={`${ids}-r`} className="input" rows={4} placeholder={"Para nada\nEs tela antimanchas\nSe limpia con un paño húmedo"} {...campo("respuestas")} />
        </>
      )}
      {plantilla === "busqueda" && (
        <>
          <label htmlFor={`${ids}-b`}>Lo que se busca</label>
          <input id={`${ids}-b`} className="input" maxLength={60} placeholder="colchón que no dé calor en Panamá" {...campo("busqueda")} />
          <label htmlFor={`${ids}-res`}>Los resultados, uno por línea (hasta 4; el último, el de la marca)</label>
          <textarea id={`${ids}-res`} className="input" rows={4} placeholder={"Colchón de resortes\nColchón de espuma\nColchón fresco de la marca"} {...campo("resultados")} />
          <label htmlFor={`${ids}-n`}>El nombre del producto (opcional)</label>
          <input id={`${ids}-n`} className="input" maxLength={60} {...campo("nombre")} />
        </>
      )}
      {plantilla === "producto" && (
        <>
          <label htmlFor={`${ids}-t`}>Las palabras que van saltando, una por línea (hasta 8; opcional)</label>
          <textarea id={`${ids}-t`} className="input" rows={3} placeholder={"Nuevo\nQueen\nEn caja"} {...campo("textos")} />
        </>
      )}
      {(plantilla === "busqueda" || plantilla === "producto") && (
        <>
          <label htmlFor={`${ids}-p`}>El precio (opcional, tal cual)</label>
          <input id={`${ids}-p`} className="input" maxLength={24} placeholder="$299" {...campo("precio")} />
        </>
      )}
      <label htmlFor={`${ids}-l`}>El llamado del cierre (opcional)</label>
      <input id={`${ids}-l`} className="input" maxLength={30} placeholder="Escríbenos" {...campo("llamado")} />

      <div className="va-opciones" role="group" aria-label={textoFotos}>
        <span className="label">{textoFotos}</span>
        {fotos.map((a) => <img key={a.id} src={a.src} alt="" width={56} height={56} style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }} />)}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEligiendo(true)}><Icon name="paperclip" size={14} /> {fotos.length ? "Cambiar las fotos" : "Escoger de la galería"}</button>
      </div>

      <div className="va-acciones">
        <button type="button" className="btn btn-primary" disabled={ocupado || fotos.length < min} onClick={crear}>
          <Icon name="sparkles" /> {ocupado ? "Creando…" : "Crear el video (gratis)"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
      {eligiendo && (
        <Suspense fallback={null}>
          <GaleriaSelector clienteId={client.id} maximo={max || 1} destino="la plantilla"
            onElegir={(lista) => { setEligiendo(false); setFotos(lista.filter((a) => a.tipo !== "video").slice(0, max || 1)); }} onCerrar={() => setEligiendo(false)} />
        </Suspense>
      )}
    </>
  );
}
