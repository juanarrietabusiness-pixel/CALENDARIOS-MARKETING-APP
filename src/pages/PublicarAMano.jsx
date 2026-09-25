import "./PublicarAMano.css";
import { useState } from "react";
import Icon from "../components/Icon";
import { saveCalendar } from "../lib/db";
import { navegar } from "../lib/rutas";
import { mediosDe, historiasDe, textoPara, primerComentario, momentoPublicacion } from "../lib/publicacion";
import { fechaHora } from "../lib/cola";

// ============================================================
// /a-mano/<calendario>/<publicación> — publicar desde el teléfono
//
// La música de Instagram, los stickers y las encuestas no se pueden poner
// por API: ninguna herramienta puede. Lo que sí se puede es que hacerlo a
// mano no cueste nada: esta pantalla, pensada para el teléfono, tiene la
// imagen o el video listos para guardar (o para compartir directo con
// Instagram), el texto para copiar con un toque, la nota de qué poner
// —«canción X»— y, al volver, «Ya la publiqué».
// ============================================================

function Copiar({ texto, que }) {
  const [hecho, setHecho] = useState(false);
  if (!texto) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => navigator.clipboard?.writeText(texto).then(() => { setHecho(true); setTimeout(() => setHecho(false), 1500); })}
    >
      <Icon name={hecho ? "check" : "copy"} size={18} /> {hecho ? "Copiado" : `Copiar ${que}`}
    </button>
  );
}

/** Compartir el archivo con Instagram (u otra app) desde el menú del teléfono, si el navegador puede. */
async function compartir(medios, setAviso) {
  try {
    const archivos = await Promise.all(medios.map(async (m, i) => {
      const blob = await (await fetch(m.src, { credentials: "same-origin" })).blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      return new File([blob], m.nombre || `publicacion-${i + 1}.${ext}`, { type: blob.type });
    }));
    if (!navigator.canShare?.({ files: archivos })) {
      setAviso("Este navegador no deja compartir archivos: usa «Guardar» y súbela desde Instagram.");
      return;
    }
    await navigator.share({ files: archivos });
  } catch (e) {
    if (e?.name !== "AbortError") setAviso(`No se pudo compartir: ${e.message}`);
  }
}

export default function PublicarAMano({ clients = [], ruta, onGuardado }) {
  const [aviso, setAviso] = useState("");
  const [hecha, setHecha] = useState(false);
  const [guardando, setGuardando] = useState(false);

  let hallado = null;
  for (const c of clients) {
    for (const cal of c.calendars ?? []) {
      if ((cal.dbId || cal.id) !== ruta.calendario && cal.id !== ruta.calendario) continue;
      for (const d of cal.days ?? []) {
        const p = (d.posts ?? []).find((x) => x.id === ruta.publicacion);
        if (p) hallado = { cliente: c, cal, dia: d, post: p };
      }
    }
  }
  if (!hallado) {
    return (
      <div className="a-mano">
        <p role="alert" className="notice notice-error">No encuentro esa publicación: puede que la hayan movido o borrado.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navegar("/programacion")}>Ir a Programación</button>
      </div>
    );
  }

  const { cliente, cal, dia, post } = hallado;
  const esHistoria = post.format === "historia";
  const medios = mediosDe(post);
  const historias = !esHistoria && post.historiaTambien ? historiasDe(post) : [];
  const texto = esHistoria ? "" : textoPara(post, "instagram");
  const comentario = esHistoria ? "" : primerComentario(post);
  const cuando = momentoPublicacion(dia.date, post.publishTime);
  const publicada = post.status === "published" || hecha;

  const yaPublicada = async () => {
    setGuardando(true);
    setAviso("");
    const ahora = new Date().toJSON();
    const nuevo = {
      ...cal,
      days: cal.days.map((d) => ({ ...d, posts: (d.posts ?? []).map((p) => (p.id === post.id ? { ...p, status: "published", publicadaAMano: ahora } : p)) })),
    };
    try {
      await saveCalendar(nuevo, cliente.dbId || cliente.id);
      onGuardado?.(cal.id, nuevo);
      setHecha(true);
    } catch (e) {
      setAviso(`No se pudo guardar: ${e.message}`);
    }
    setGuardando(false);
  };

  const bloqueMedios = (lista, titulo) => lista.length > 0 && (
    <section className="a-mano-bloque" aria-label={titulo}>
      <h2>{titulo}</h2>
      <ul className="a-mano-medios">
        {lista.map((m, i) => (
          <li key={`${m.src}-${i}`}>
            {m.tipo === "video" ? <video src={m.src} controls playsInline preload="metadata" /> : <img src={m.src} alt={`${titulo} ${i + 1}`} />}
            <a className="btn btn-secondary btn-sm" href={m.src} download={m.nombre || `${cliente.name}-${dia.date}-${i + 1}`}>
              <Icon name="download" size={16} /> Guardar
            </a>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={() => compartir(lista, setAviso)}>
        <Icon name="send" size={18} /> Compartir {lista.length > 1 ? "todo" : ""} con Instagram
      </button>
    </section>
  );

  return (
    <div className="a-mano">
      <header className="a-mano-cabecera">
        <p className="a-mano-cliente">{cliente.name} · {post.format}</p>
        <h1>{post.title || post.idea || "Publicación"}</h1>
        <p className="a-mano-cuando"><Icon name="clock" size={16} /> {cuando ? fechaHora(cuando) : dia.date}</p>
      </header>

      {post.notaAsistida && (
        <p className="a-mano-nota"><Icon name="bulb" size={18} /> <span><strong>A mano:</strong> {post.notaAsistida}</span></p>
      )}

      {bloqueMedios(medios, esHistoria ? "Historias" : "Imagen o video")}
      {!medios.length && <p className="notice notice-warn">Esta publicación no tiene imagen ni video todavía.</p>}

      {(texto || comentario) && (
        <section className="a-mano-bloque" aria-label="Texto">
          <h2>Texto</h2>
          {texto && <p className="a-mano-texto">{texto}</p>}
          <div className="a-mano-botones">
            <Copiar texto={texto} que="el texto" />
            <Copiar texto={comentario} que="el primer comentario" />
          </div>
        </section>
      )}

      {bloqueMedios(historias, "También en historias")}

      <div role="status" aria-live="polite">{aviso && <p className="notice notice-warn">{aviso}</p>}</div>

      <div className="a-mano-final">
        <a className="btn btn-secondary" href="https://www.instagram.com/" target="_blank" rel="noreferrer">
          <Icon name="photo" size={18} /> Abrir Instagram
        </a>
        {publicada ? (
          <p className="notice notice-ok"><Icon name="check" size={16} /> Marcada como publicada.</p>
        ) : (
          <button type="button" className="btn btn-primary" disabled={guardando} onClick={yaPublicada}>
            <Icon name="check" size={18} /> {guardando ? "Guardando…" : "Ya la publiqué"}
          </button>
        )}
      </div>
    </div>
  );
}
