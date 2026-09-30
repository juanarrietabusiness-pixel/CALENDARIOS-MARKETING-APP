// ============================================================
// Las piezas del panel de una publicación que existen para PUBLICAR
//
// El panel servía para presentar: una sola imagen, sin video, sin
// hashtags editables, sin límites y sin decir dónde se publica. Para
// programar y publicar desde aquí hace falta todo eso, y cada pieza vive
// en este fichero:
//
//   · EditorMedios: varias imágenes y videos, ordenables (carrusel,
//     reel, historia), desde el equipo, desde Drive o creados con IA
//     (el Estudio del cliente, en un diálogo; una imagen también se anima).
//   · CamposRedes: hashtags con su contador, primer comentario y el
//     texto propio de Facebook.
//   · ConversacionCliente: el hilo con el cliente de esa publicación.
//
// Las reglas (límites, qué se publica) no viven aquí: son las de
// `lib/publicacion.js`, las mismas que aplica el servidor al publicar.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import BancoSelector from "../BancoSelector";
import { subirImagenPublicacion, getContentBankUrl, medioDeDrive, loadComentarios, comentarComoAgencia } from "../../lib/db";
import { mediosDe, textoPara, contarHashtags, LIMITES } from "../../lib/publicacion";

const esVideoArchivo = (f) => f?.type?.startsWith("video/");

// ------------------------------------------------------------
// Medios
// ------------------------------------------------------------

export function EditorMedios({ post, clientId, driveFolder, onChange, onError, entradaRef = null, onPortada = null, onCrearConIA = null }) {
  const ids = useId();
  const [eligiendoPortada, setEligiendoPortada] = useState(null);
  const propia = useRef(null);
  const entrada = entradaRef ?? propia;
  const [subiendo, setSubiendo] = useState("");
  const [escogiendo, setEscogiendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const arrastrado = useRef(null);
  const medios = mediosDe(post);
  const maximo = LIMITES.instagram.carruselMax;

  const poner = (lista) => onChange(lista.slice(0, maximo));

  const subir = async (archivos) => {
    const lista = [...archivos].slice(0, maximo - medios.length);
    let nuevos = [...medios];
    for (const f of lista) {
      setSubiendo(`Subiendo «${f.name}»…`);
      try {
        const src = await subirImagenPublicacion(clientId, f);
        // Las medidas, para avisar YA si Instagram no aceptará la
        // proporción, y no a la hora de publicar.
        let medidas = {};
        if (!esVideoArchivo(f)) {
          try {
            const b = await createImageBitmap(f);
            medidas = { ancho: b.width, alto: b.height };
            b.close?.();
          } catch { /* sin medidas: se toman al programar */ }
        }
        nuevos = [...nuevos, { src, tipo: esVideoArchivo(f) ? "video" : "imagen", nombre: f.name, ...medidas }];
        poner(nuevos);
      } catch (e) {
        onError?.(`No se pudo subir «${f.name}»: ${e.message}`);
      }
    }
    setSubiendo("");
  };

  const desdeSelector = async (items) => {
    setEscogiendo(false);
    let nuevos = [...medios];
    for (const it of items) {
      try {
        if (it.fuente === "drive") {
          setSubiendo(`Trayendo «${it.nombre}» de Drive…`);
          nuevos = [...nuevos, await medioDeDrive(clientId, it.fileId)];
        } else {
          nuevos = [...nuevos, { src: getContentBankUrl(it.clave), tipo: it.tipo, nombre: it.nombre }];
        }
        poner(nuevos);
      } catch (e) {
        onError?.(`No se pudo traer «${it.nombre}»: ${e.message}`);
      }
    }
    setSubiendo("");
  };

  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= medios.length) return;
    const lista = [...medios];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    poner(lista);
  };

  // Reordenar arrastrando: se saca de su sitio y se mete delante del que
  // recibe. Las flechas siguen ahí: con teclado o lector de pantalla no
  // se arrastra.
  const soltarEn = (j) => {
    const i = arrastrado.current;
    arrastrado.current = null;
    if (i === null || i === j) return;
    const lista = [...medios];
    const [m] = lista.splice(i, 1);
    lista.splice(j, 0, m);
    poner(lista);
  };

  // Pegar con Ctrl+V una imagen copiada (una captura, una imagen de la
  // web). Sólo si lo pegado trae archivos: pegar texto en un campo sigue
  // siendo pegar texto.
  useEffect(() => {
    const alPegar = (e) => {
      const archivos = [...(e.clipboardData?.files ?? [])].filter((f) => /^(image|video)\//.test(f.type));
      if (!archivos.length || subiendo) return;
      e.preventDefault();
      void subir(archivos);
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  });

  const alSoltarArchivos = (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setEncima(false);
    const archivos = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type));
    if (archivos.length) void subir(archivos);
  };

  return (
    <div
      className="field editor-medios-zona"
      data-encima={encima || undefined}
      onDragOver={(e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) { e.preventDefault(); setEncima(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false); }}
      onDrop={alSoltarArchivos}
    >
      <span className="label" id={`${ids}-t`}>
        Imágenes y videos <span className="editor-medios-cuenta">{medios.length}/{maximo}</span>
      </span>
      {medios.length > 0 && (
        <ol className="editor-medios" aria-labelledby={`${ids}-t`}>
          {medios.map((m, i) => (
            <li
              key={`${m.src}-${i}`}
              draggable
              onDragStart={(e) => { arrastrado.current = i; e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (arrastrado.current !== null) e.preventDefault(); }}
              onDrop={(e) => { if (arrastrado.current !== null) { e.preventDefault(); e.stopPropagation(); soltarEn(i); } }}
            >
              <div className="editor-medios-vista">
                {m.tipo === "video"
                  ? (post.portada && i === 0
                    ? <img src={post.portada} alt="" />
                    : <video src={m.src} muted playsInline preload="metadata" aria-hidden="true" onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }} />)
                  : <img src={m.src} alt="" />}
                {medios.length > 1 && <span className="editor-medios-orden" aria-hidden="true">{i + 1}</span>}
                {m.tipo === "video" && <span className="editor-medios-tipo" aria-hidden="true"><Icon name="play" size={12} /></span>}
                {/* Borrar a la vista y a tamaño de dedo: el de antes era un
                    icono gris de 14 px entre las flechas y casi no se veía. */}
                <button type="button" className="editor-medios-quitar" onClick={() => poner(medios.filter((_, j) => j !== i))} aria-label={`Quitar el elemento ${i + 1}`} title="Quitar">
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="editor-medios-acciones">
                {medios.length > 1 && (
                  <>
                    <button type="button" className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Mover el elemento ${i + 1} antes`}>
                      <Icon name="chevronLeft" size={14} />
                    </button>
                    <button type="button" className="btn-icon" onClick={() => mover(i, 1)} disabled={i === medios.length - 1} aria-label={`Mover el elemento ${i + 1} después`}>
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </>
                )}
                {m.tipo === "imagen" && onCrearConIA && (
                  <button type="button" className="editor-medios-portada-btn" onClick={() => onCrearConIA({ tipo: "video", desde: m })} title="Convertir esta imagen en un video con IA">
                    <Icon name="video" size={13} /> Animar
                  </button>
                )}
                {m.tipo === "video" && i === 0 && onPortada && (
                  <button
                    type="button"
                    className="editor-medios-portada-btn"
                    aria-expanded={eligiendoPortada === i}
                    aria-controls={`${ids}-portada`}
                    onClick={() => setEligiendoPortada(eligiendoPortada === i ? null : i)}
                  >
                    <Icon name="image" size={13} /> Portada
                  </button>
                )}
              </div>
            </li>
          ))}
          {medios.length < maximo && (
            <li className="editor-medios-mas">
              <button type="button" onClick={() => entrada.current?.click()} disabled={!!subiendo} aria-label="Añadir imágenes o videos">
                <Icon name="plus" size={22} />
                <span>Añadir</span>
              </button>
            </li>
          )}
        </ol>
      )}
      {eligiendoPortada !== null && medios[eligiendoPortada]?.tipo === "video" && (
        <PortadaVideo
          id={`${ids}-portada`}
          video={medios[eligiendoPortada]}
          post={post}
          clientId={clientId}
          onPortada={onPortada}
          onError={onError}
          onCerrar={() => setEligiendoPortada(null)}
        />
      )}
      <input
        ref={entrada}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        aria-label="Imágenes o videos para la publicación"
        // Copiar ANTES de vaciar: `files` es la misma lista que se vacía al
        // resetear el campo, y la subida no llegaba a salir.
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void subir(fs); }}
      />
      <div className="editor-medios-botones">
        {/* Con archivos ya puestos, subir más es la ficha «Añadir» de la rejilla. */}
        {!medios.length && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => entrada.current?.click()} disabled={!!subiendo}>
            <Icon name="upload" size={16} /> Subir imagen o video
          </button>
        )}
        {clientId && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEscogiendo(true)} disabled={!!subiendo || medios.length >= maximo}>
            <Icon name="folder" size={16} /> {driveFolder ? "De Drive" : "Del banco"}
          </button>
        )}
        {clientId && onCrearConIA && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCrearConIA({ tipo: "imagen" })} disabled={!!subiendo || medios.length >= maximo}>
            <Icon name="sparkles" size={16} /> Crear con IA
          </button>
        )}
      </div>
      <p className="hint editor-medios-ayuda">
        {medios.length > 1 ? "Arrastra las miniaturas para cambiar el orden. " : ""}También puedes arrastrarlos aquí o pegarlos con Ctrl+V.
      </p>
      <div role="status" aria-live="polite" className={subiendo ? "hint" : "sr-only"}>{subiendo}</div>
      {escogiendo && (
        <BancoSelector
          clientId={clientId}
          driveFolder={driveFolder}
          tipos={["image", "video"]}
          maximo={maximo - medios.length}
          titulo={driveFolder ? "Escoger de Google Drive" : "Escoger del banco"}
          onSelect={desdeSelector}
          onClose={() => setEscogiendo(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// La portada del video (reel y TikTok)
// ------------------------------------------------------------
//
// Instagram deja poner una imagen de portada (`cover_url`) o un
// fotograma (`thumb_offset`); TikTok, sólo el fotograma
// (`video_cover_timestamp_ms`). Aquí se escoge el fotograma con una
// barra —se guarda como imagen Y como milisegundo, para que valga en las
// dos redes y en la página del cliente— o se sube una imagen aparte.

/** El fotograma actual del video, en JPEG de 1080 px de ancho como mucho. */
async function fotogramaDe(video) {
  const escala = Math.min(1, 1080 / (video.videoWidth || 1080));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round((video.videoWidth || 1080) * escala);
  lienzo.height = Math.round((video.videoHeight || 1920) * escala);
  lienzo.getContext("2d").drawImage(video, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) throw new Error("No se pudo sacar el fotograma.");
  return new File([blob], "portada.jpg", { type: "image/jpeg" });
}

export function PortadaVideo({ id, video, post, clientId, onPortada, onError, onCerrar }) {
  const ids = useId();
  const ref = useRef(null);
  const archivo = useRef(null);
  const [duracion, setDuracion] = useState(0);
  const [segundo, setSegundo] = useState(Number.isFinite(post.portadaMs) ? post.portadaMs / 1000 : 0);
  const [guardando, setGuardando] = useState("");

  const ir = (t) => {
    setSegundo(t);
    if (ref.current) ref.current.currentTime = t;
  };

  const usarFotograma = async () => {
    setGuardando("Guardando la portada…");
    try {
      const src = await subirImagenPublicacion(clientId, await fotogramaDe(ref.current));
      onPortada({ portada: src, portadaMs: Math.round(segundo * 1000) });
      onCerrar();
    } catch (e) {
      onError?.(`No se pudo guardar la portada: ${e.message}`);
    }
    setGuardando("");
  };

  const subirImagen = async (f) => {
    setGuardando("Subiendo la portada…");
    try {
      onPortada({ portada: await subirImagenPublicacion(clientId, f), portadaMs: null });
      onCerrar();
    } catch (e) {
      onError?.(`No se pudo subir la portada: ${e.message}`);
    }
    setGuardando("");
  };

  return (
    <div id={id} className="portada-video" role="group" aria-labelledby={`${ids}-t`}>
      <div className="portada-video-cabecera">
        <h4 id={`${ids}-t`} className="label">Portada del video</h4>
        <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar la portada"><Icon name="close" size={16} /></button>
      </div>
      <div className="portada-video-cuerpo">
        <video
          ref={ref}
          src={video.src}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => { setDuracion(e.currentTarget.duration || 0); e.currentTarget.currentTime = segundo || 0.1; }}
        />
        <div className="portada-video-opciones">
          <label className="label" htmlFor={`${ids}-s`}>Elige el fotograma · {segundo.toFixed(1)} s</label>
          <input
            id={`${ids}-s`}
            type="range"
            min={0}
            max={Math.max(0.1, duracion)}
            step={0.1}
            value={segundo}
            onChange={(e) => ir(Number(e.target.value))}
            disabled={!duracion || !!guardando}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={usarFotograma} disabled={!duracion || !!guardando}>
            <Icon name="check" size={14} /> {guardando || "Usar este fotograma"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => archivo.current?.click()} disabled={!!guardando}>
            <Icon name="upload" size={14} /> Subir una imagen
          </button>
          {post.portada && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onPortada({ portada: null, portadaMs: null }); onCerrar(); }} disabled={!!guardando}>
              Quitar la portada
            </button>
          )}
          <input
            ref={archivo}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Imagen de portada"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirImagen(f); }}
          />
          <p className="hint">Instagram usa la imagen o el fotograma; TikTok, el fotograma (sólo al publicar directo).</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Una sección plegable, como los desplegables de Metricool
// ------------------------------------------------------------
//
// `<details>` de verdad: se abre con teclado y lo anuncia el lector de
// pantalla sin nada más. `resumen` va a la derecha del título (lo que ya
// está puesto), para no tener que abrir la sección para saberlo.

export function Plegable({ titulo, icono, resumen = null, abierta = false, tono = null, children }) {
  return (
    <details className="plegable" open={abierta || undefined} data-tono={tono || undefined}>
      <summary>
        {icono && <Icon name={icono} size={16} />}
        <span className="plegable-titulo">{titulo}</span>
        {resumen && <span className="plegable-resumen">{resumen}</span>}
        <Icon name="chevronDown" size={16} className="plegable-flecha" />
      </summary>
      <div className="plegable-cuerpo">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------
// Hashtags, primer comentario y texto de Facebook
// ------------------------------------------------------------

function Contador({ valor, maximo, etiqueta }) {
  const pasa = valor > maximo;
  return (
    <span className="contador" data-pasa={pasa || undefined} aria-label={`${etiqueta}: ${valor} de ${maximo}`}>
      {valor}/{maximo}
    </span>
  );
}

export function ContadoresTexto({ post }) {
  const texto = textoPara(post, "instagram");
  const hashtags = contarHashtags(texto) + (post.hashtagsEnComentario ? contarHashtags(post.hashtagsFinales) : 0);
  return (
    <p className="contadores">
      Instagram: <Contador valor={texto.length} maximo={LIMITES.instagram.caracteres} etiqueta="Caracteres" /> caracteres ·{" "}
      <Contador valor={hashtags} maximo={LIMITES.instagram.hashtags} etiqueta="Hashtags" /> hashtags
    </p>
  );
}

export function CamposRedes({ post, sf, partes = ["instagram", "facebook"] }) {
  const ids = useId();
  const [fb, setFb] = useState(Boolean(post.textoFacebook));
  const ig = partes.includes("instagram");
  return (
    <>
      {ig && <div className="field">
        <label className="label" htmlFor={`${ids}-hash`}>Hashtags</label>
        <textarea
          id={`${ids}-hash`}
          className="textarea"
          style={{ minHeight: 56 }}
          value={post.hashtagsFinales || ""}
          onChange={(e) => sf("hashtagsFinales", e.target.value)}
          placeholder="#panama #cafe …"
        />
        <label className="casilla">
          <input type="checkbox" checked={!!post.hashtagsEnComentario} onChange={(e) => sf("hashtagsEnComentario", e.target.checked)} />
          Poner los hashtags en el primer comentario (Instagram)
        </label>
        <ContadoresTexto post={post} />
      </div>}
      {ig && <div className="field">
        <label className="label" htmlFor={`${ids}-c1`}>Primer comentario (opcional)</label>
        <textarea
          id={`${ids}-c1`}
          className="textarea"
          style={{ minHeight: 56 }}
          value={post.primerComentario || ""}
          onChange={(e) => sf("primerComentario", e.target.value)}
          placeholder="Se publica como comentario justo después del post"
        />
      </div>}
      {ig && <div className="field">
        <label className="label" htmlFor={`${ids}-colab`}>Colaboradores de Instagram (opcional)</label>
        <input
          id={`${ids}-colab`}
          className="input"
          value={Array.isArray(post.colaboradores) ? post.colaboradores.join(", ") : post.colaboradores || ""}
          onChange={(e) => sf("colaboradores", e.target.value)}
          placeholder="@marca_amiga, @otra_cuenta"
        />
        <p className="hint">Hasta 3 cuentas públicas. Sale en los dos perfiles cuando la otra cuenta acepta la invitación desde su app. No aplica a historias.</p>
      </div>}
      {partes.includes("facebook") && <div className="field">
        <label className="casilla">
          <input type="checkbox" checked={fb} onChange={(e) => { setFb(e.target.checked); if (!e.target.checked) sf("textoFacebook", ""); }} />
          Texto distinto para Facebook
        </label>
        {fb && (
          <textarea
            className="textarea"
            aria-label="Texto para Facebook"
            value={post.textoFacebook || ""}
            onChange={(e) => sf("textoFacebook", e.target.value)}
            placeholder="Si lo dejas vacío, Facebook usa la descripción"
          />
        )}
      </div>}
    </>
  );
}

// ------------------------------------------------------------
// La conversación con el cliente de esta publicación
// ------------------------------------------------------------

export function ConversacionCliente({ calId, postId, pulso = 0 }) {
  const ids = useId();
  const [hilo, setHilo] = useState(null);
  const [texto, setTexto] = useState("");
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    let vivo = true;
    loadComentarios(calId)
      .then((todos) => { if (vivo) setHilo(todos.filter((c) => c.post_id === postId)); })
      .catch(() => { if (vivo) setHilo([]); });
    return () => { vivo = false; };
  }, [calId, postId, pulso]);

  const enviar = async (e) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setFallo("");
    try {
      const fila = await comentarComoAgencia(calId, postId, t);
      setHilo((h) => [...(h ?? []), fila]);
      setTexto("");
    } catch (err) {
      setFallo(err.message);
    }
  };

  if (hilo === null) return null;
  return (
    <div className="field conversacion">
      <span className="label">Conversación con el cliente</span>
      {hilo.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Todavía no hay mensajes. Lo que escribas aquí lo ve el cliente en su enlace.</p>
      ) : (
        <ul className="conversacion-hilo">
          {hilo.map((c) => (
            <li key={c.id} data-autor={c.autor}>
              <strong>{c.autor === "agencia" ? c.nombre || "Agencia" : `${c.nombre || "Cliente"} · cliente`}</strong>
              <span>{c.texto}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={enviar} className="conversacion-form">
        <label htmlFor={`${ids}-r`} className="sr-only">Responder al cliente</label>
        <input id={`${ids}-r`} className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder al cliente…" />
        <button type="submit" className="btn-icon" aria-label="Enviar respuesta" disabled={!texto.trim()}><Icon name="send" size={18} /></button>
      </form>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
    </div>
  );
}
