// ============================================================
// Las piezas del panel de una publicación que existen para PUBLICAR
//
// El panel servía para presentar: una sola imagen, sin video, sin
// hashtags editables, sin límites y sin decir dónde se publica. Para
// programar y publicar desde aquí hace falta todo eso, y cada pieza vive
// en este fichero:
//
//   · EditorMedios: varias imágenes y videos, ordenables (carrusel,
//     reel, historia), desde el equipo o desde Drive.
//   · CamposRedes: hashtags con su contador, primer comentario y el
//     texto propio de Facebook.
//   · VistaPrevia: cómo se verá en Instagram y en Facebook.
//   · ConversacionCliente: el hilo con el cliente de esa publicación.
//
// Las reglas (límites, qué se publica) no viven aquí: son las de
// `lib/publicacion.js`, las mismas que aplica el servidor al publicar.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import BancoSelector from "../BancoSelector";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { subirImagenPublicacion, getContentBankUrl, medioDeDrive, loadComentarios, comentarComoAgencia } from "../../lib/db";
import { mediosDe, textoPara, primerComentario, contarHashtags, LIMITES, REDES } from "../../lib/publicacion";

const esVideoArchivo = (f) => f?.type?.startsWith("video/");

// ------------------------------------------------------------
// Medios
// ------------------------------------------------------------

export function EditorMedios({ post, clientId, driveFolder, onChange, onError }) {
  const ids = useId();
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState("");
  const [escogiendo, setEscogiendo] = useState(false);
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

  return (
    <div className="field">
      <span className="label" id={`${ids}-t`}>
        Imágenes y videos <span className="editor-medios-cuenta">{medios.length}/{maximo}</span>
      </span>
      {medios.length > 0 && (
        <ol className="editor-medios" aria-labelledby={`${ids}-t`}>
          {medios.map((m, i) => (
            <li key={`${m.src}-${i}`}>
              <div className="editor-medios-vista">
                {m.tipo === "video"
                  ? <video src={`${m.src}#t=0.5`} muted preload="metadata" aria-hidden="true" />
                  : <img src={m.src} alt="" />}
                {i === 0 && <span className="editor-medios-portada">Portada</span>}
                {m.tipo === "video" && <span className="editor-medios-tipo" aria-hidden="true"><Icon name="play" size={12} /></span>}
              </div>
              <div className="editor-medios-acciones">
                <button type="button" className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Mover el elemento ${i + 1} antes`}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                <button type="button" className="btn-icon" onClick={() => mover(i, 1)} disabled={i === medios.length - 1} aria-label={`Mover el elemento ${i + 1} después`}>
                  <Icon name="chevronRight" size={14} />
                </button>
                <button type="button" className="btn-icon" onClick={() => poner(medios.filter((_, j) => j !== i))} aria-label={`Quitar el elemento ${i + 1}`}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={!!subiendo || medios.length >= maximo}>
          <Icon name="upload" size={16} /> Subir
        </button>
        {clientId && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEscogiendo(true)} disabled={!!subiendo || medios.length >= maximo}>
            <Icon name="folder" size={16} /> {driveFolder ? "De Drive" : "Del banco"}
          </button>
        )}
      </div>
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

export function CamposRedes({ post, sf }) {
  const ids = useId();
  const [fb, setFb] = useState(Boolean(post.textoFacebook));
  return (
    <>
      <div className="field">
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
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-c1`}>Primer comentario (opcional)</label>
        <textarea
          id={`${ids}-c1`}
          className="textarea"
          style={{ minHeight: 56 }}
          value={post.primerComentario || ""}
          onChange={(e) => sf("primerComentario", e.target.value)}
          placeholder="Se publica como comentario justo después del post"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-colab`}>Colaboradores de Instagram (opcional)</label>
        <input
          id={`${ids}-colab`}
          className="input"
          value={Array.isArray(post.colaboradores) ? post.colaboradores.join(", ") : post.colaboradores || ""}
          onChange={(e) => sf("colaboradores", e.target.value)}
          placeholder="@marca_amiga, @otra_cuenta"
        />
        <p className="hint">Hasta 3 cuentas públicas. Sale en los dos perfiles cuando la otra cuenta acepta la invitación desde su app. No aplica a historias.</p>
      </div>
      <div className="field">
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
      </div>
    </>
  );
}

// ------------------------------------------------------------
// Vista previa
// ------------------------------------------------------------

export function VistaPrevia({ post, client, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [red, setRed] = useState("instagram");
  const [i, setI] = useState(0);
  const medios = mediosDe(post);
  const m = medios[Math.min(i, medios.length - 1)];
  const usuario = (client?.instagram || client?.name || "").replace(/^@/, "");
  const texto = textoPara(post, red);
  const comentario = red === "instagram" ? primerComentario(post) : "";
  const vertical = post.format === "reel" || post.format === "historia";

  return (
    <div className="overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="dialog vista-previa">
        <div className="vista-previa-cabecera">
          <h2 id={`${ids}-t`}>Vista previa</h2>
          <div className="segmented" role="group" aria-label="Red">
            {["instagram", "facebook"].map((r) => (
              <button key={r} type="button" className={`segmented-btn ${red === r ? "active" : ""}`} aria-pressed={red === r} onClick={() => setRed(r)}>
                {REDES[r].nombre}
              </button>
            ))}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar la vista previa"><Icon name="close" /></button>
        </div>
        <div className="vista-previa-telefono" data-red={red}>
          <div className="vista-previa-autor">
            <span className="vista-previa-avatar">{client?.logo ? <img src={client.logo} alt="" /> : null}</span>
            <strong>{red === "instagram" ? usuario : client?.name}</strong>
          </div>
          <div className="vista-previa-medio" data-vertical={vertical || undefined}>
            {!m ? <span>Sin imagen ni video</span>
              : m.tipo === "video" ? <video src={m.src} controls playsInline preload="metadata" />
                : <img src={m.src} alt="" />}
            {medios.length > 1 && (
              <>
                <button type="button" className="vista-previa-flecha" data-lado="izq" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Anterior"><Icon name="chevronLeft" size={16} /></button>
                <button type="button" className="vista-previa-flecha" data-lado="der" disabled={i >= medios.length - 1} onClick={() => setI(i + 1)} aria-label="Siguiente"><Icon name="chevronRight" size={16} /></button>
                <span className="vista-previa-contador">{i + 1}/{medios.length}</span>
              </>
            )}
          </div>
          {post.format === "historia" && red === "instagram" ? (
            <p className="vista-previa-nota">Las historias no muestran el texto.</p>
          ) : (
            <p className="vista-previa-texto">
              {red === "instagram" && <strong>{usuario} </strong>}
              {texto || <em>Sin texto</em>}
            </p>
          )}
          {comentario && <p className="vista-previa-comentario"><strong>{usuario}</strong> {comentario}</p>}
        </div>
      </div>
    </div>
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
