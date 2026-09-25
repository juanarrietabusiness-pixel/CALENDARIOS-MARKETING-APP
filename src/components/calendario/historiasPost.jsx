// ============================================================
// La historia que acompaña al post
//
// Casi siempre el post también se sube a historias. La API de Instagram
// no deja «compartir el post en tu historia» como el teléfono, así que
// aquí se prepara la versión 9:16 y sale sola unos minutos después:
//
//   · «Usar la imagen del post»: la misma imagen, encajada a 9:16 con
//     fondo difuminado (o el ajuste elegido). Sin IA, sin coste.
//   · «Crear con IA»: tres variantes de Nano Banana a partir de la imagen
//     del post —adaptación, anuncio del post y detalle— para escoger.
//
// Lo que no se escoge se descarta (se borra de R2): generar y no usar no
// debe llenar la carpeta del cliente.
// ============================================================

import { useId, useState } from "react";
import Icon from "../Icon";
import { generateImage, getContentBankUrl, subirImagenPublicacion, feedbackImage } from "../../lib/db";
import { historiaDesdeImagen } from "../../lib/medios";
import { mediosDe, historiasDe, RETRASO_HISTORIA_MIN, LIMITES } from "../../lib/publicacion";

const VARIANTES = [
  ["adaptacion", "Adaptación 9:16"],
  ["anuncio", "Anuncio del post"],
  ["detalle", "Detalle"],
];
const RETRASOS = [0, 5, 15, 30, 60, 120];

export default function HistoriasDelPost({ post, sf, clientId, colorMarca, onError }) {
  const ids = useId();
  const [trabajando, setTrabajando] = useState("");
  const [candidatas, setCandidatas] = useState([]);
  const historias = historiasDe(post);
  const base = mediosDe(post).find((m) => m.tipo === "imagen" && m.src.startsWith("/api/media/clientes/"));
  const maximo = LIMITES.instagram.carruselMax;
  const retraso = Number.isFinite(Number(post.historiaRetraso)) ? Number(post.historiaRetraso) : RETRASO_HISTORIA_MIN;

  const poner = (lista) => {
    sf("historias", lista.slice(0, maximo));
    if (lista.length) sf("historiaTambien", true);
  };

  const usarLaDelPost = async () => {
    setTrabajando("post");
    try {
      const h = await historiaDesdeImagen(base.src, (f) => subirImagenPublicacion(clientId, f), post.ajusteIG || "difuminado", colorMarca);
      poner([...historias, h]);
    } catch (e) {
      onError?.(`No se pudo preparar la historia: ${e.message}`);
    }
    setTrabajando("");
  };

  const crearConIA = async () => {
    setTrabajando("ia");
    setCandidatas(VARIANTES.map(([variante, nombre]) => ({ variante, nombre, estado: "creando" })));
    await Promise.all(VARIANTES.map(async ([variante], i) => {
      try {
        const { clave } = await generateImage({ clientId, historiaDe: { src: base.src, variante } });
        setCandidatas((c) => c.map((x, j) => (j === i ? { ...x, estado: "lista", clave, src: getContentBankUrl(clave) } : x)));
      } catch (e) {
        setCandidatas((c) => c.map((x, j) => (j === i ? { ...x, estado: "error", error: e.message } : x)));
      }
    }));
    setTrabajando("");
  };

  const elegir = (c) => {
    poner([...historias, { src: c.src, tipo: "imagen", nombre: `${c.variante}.png`, ancho: 1080, alto: 1920 }]);
    setCandidatas((l) => l.filter((x) => x !== c));
  };

  const descartar = (c) => {
    setCandidatas((l) => l.filter((x) => x !== c));
    if (c.clave) feedbackImage(clientId, c.clave, false).catch(() => {});
  };

  const quitar = (i) => {
    const lista = historias.filter((_, j) => j !== i);
    sf("historias", lista);
    if (!lista.length) sf("historiaTambien", false);
  };

  return (
    <section className="historias-post" aria-labelledby={`${ids}-t`}>
      <div className="historias-post-cabecera">
        <h3 id={`${ids}-t`} className="label">También en historias</h3>
        <label className="casilla">
          <input
            type="checkbox"
            checked={!!post.historiaTambien}
            disabled={!historias.length}
            onChange={(e) => sf("historiaTambien", e.target.checked)}
          />
          Publicar también como historia
        </label>
        {post.historiaTambien && (
          <>
            <label className="sr-only" htmlFor={`${ids}-r`}>Cuándo sale la historia</label>
            <select id={`${ids}-r`} className="input historias-post-retraso" value={retraso} onChange={(e) => sf("historiaRetraso", Number(e.target.value))}>
              {RETRASOS.map((m) => <option key={m} value={m}>{m === 0 ? "a la vez que el post" : `${m} min después del post`}</option>)}
            </select>
          </>
        )}
      </div>

      {historias.length > 0 && (
        <ol className="historias-post-lista" aria-label="Historias que acompañan al post">
          {historias.map((h, i) => (
            <li key={`${h.src}-${i}`}>
              <img src={h.src} alt={`Historia ${i + 1}`} />
              <button type="button" className="btn-icon" onClick={() => quitar(i)} aria-label={`Quitar la historia ${i + 1}`}>
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {candidatas.length > 0 && (
        <ul className="historias-post-candidatas" aria-label="Propuestas de la IA">
          {candidatas.map((c) => (
            <li key={c.variante}>
              <div className="historias-post-marco" data-estado={c.estado}>
                {c.estado === "lista" ? <img src={c.src} alt={c.nombre} /> : c.estado === "creando" ? <span>Creando…</span> : <span>{c.error}</span>}
              </div>
              <p>{c.nombre}</p>
              {c.estado !== "creando" && (
                <span className="historias-post-acciones">
                  {c.estado === "lista" && <button type="button" className="btn btn-primary btn-sm" onClick={() => elegir(c)}>Usar</button>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => descartar(c)}>{c.estado === "lista" ? "Descartar" : "Quitar"}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="historias-post-botones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!base || !!trabajando || historias.length >= maximo} onClick={usarLaDelPost}>
          <Icon name="image" size={16} /> {trabajando === "post" ? "Preparando…" : "Usar la imagen del post"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!base || !!trabajando || historias.length >= maximo} onClick={crearConIA}>
          <Icon name="sparkles" size={16} /> {trabajando === "ia" ? "Creando 3 propuestas…" : "Crear 3 con IA"}
        </button>
      </div>
      <p className="hint">
        {base
          ? "La historia sale sola a la hora elegida. Deja espacio arriba y abajo para el nombre de la cuenta y los stickers, que se ponen desde el teléfono. Cada imagen con IA cuesta unos 4 céntimos."
          : "Primero añade una imagen al post: las historias se preparan a partir de ella."}
      </p>
    </section>
  );
}
