// ============================================================
// La historia que acompaña al post
//
// Casi siempre el post también se sube a historias. La API de Instagram
// no deja «compartir el post en tu historia» como el teléfono, así que
// aquí se prepara la versión 9:16 y sale sola unos minutos después:
//
//   · «Usar la imagen del post»: la misma imagen, encajada a 9:16 con
//     fondo difuminado (o el ajuste elegido). Sin IA, sin coste.
//   · «Crear con IA»: tres historias NUEVAS que complementan el post con
//     su misma información —una pregunta, un beneficio o detalle y el
//     llamado a la acción—, con la imagen del post de referencia del
//     producto y del estilo. La misma imagen encajada ya la da el botón de
//     arriba, sin coste: pedírsela a la IA era pagar por verla tres veces.
//
// Lo que no se escoge se descarta (se borra de R2): generar y no usar no
// debe llenar la carpeta del cliente.
// ============================================================

import { useId, useState } from "react";
import Icon from "../Icon";
import { generateImage, getContentBankUrl, subirImagenPublicacion, feedbackImage } from "../../lib/db";
import { historiaDesdeImagen } from "../../lib/medios";
import { mediosDe, historiasDe, RETRASO_HISTORIA_MIN, LIMITES } from "../../lib/publicacion";

// Los mismos ids que VARIANTES_HISTORIA de worker/rutas/imagen.js.
const VARIANTES = [
  ["pregunta", "Pregunta"],
  ["beneficio", "Beneficio o detalle"],
  ["accion", "Llamado a la acción"],
];

/** Lo que la historia tiene que contar de otra forma: la información del post, no su imagen. */
const infoDelPost = (p) => ({
  titulo: p.title ?? "", producto: p.producto ?? "", textoPieza: p.textoPieza ?? "",
  idea: p.idea ?? "", descripcion: p.descripcion || p.script || "",
});
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
    // Las de una tanda anterior que no se escogieron se quedan; las nuevas van detrás, cada una con su id.
    const tanda = Date.now();
    const nuevas = VARIANTES.map(([variante, nombre]) => ({ id: `${tanda}-${variante}`, variante, nombre, estado: "creando" }));
    setCandidatas((c) => [...c, ...nuevas]);
    const poner1 = (id, cambio) => setCandidatas((c) => c.map((x) => (x.id === id ? { ...x, ...cambio } : x)));
    await Promise.all(nuevas.map(async ({ id, variante }) => {
      try {
        const { clave } = await generateImage({ clientId, historiaDe: { src: base.src, variante, post: infoDelPost(post) } });
        poner1(id, { estado: "lista", clave, src: getContentBankUrl(clave) });
      } catch (e) {
        poner1(id, { estado: "error", error: e.message });
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
            <li key={c.id}>
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
          <Icon name="sparkles" size={16} /> {trabajando === "ia" ? "Creando 3 propuestas…" : candidatas.length ? "Otras 3 con IA" : "Crear 3 con IA"}
        </button>
      </div>
      <p className="hint">
        {base
          ? "La historia sale sola a la hora elegida. «Usar la imagen del post» la encaja tal cual; con IA salen tres historias distintas que complementan el post con su misma información (una pregunta, un beneficio y el llamado a la acción). Los stickers se ponen desde el teléfono. Cada imagen con IA cuesta unos 4 céntimos."
          : "Primero añade una imagen al post: las historias se preparan a partir de ella."}
      </p>
    </section>
  );
}
