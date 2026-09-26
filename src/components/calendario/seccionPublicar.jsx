// ============================================================
// La pestaña «Publicar» del panel de una publicación
//
// Antes, publicar era lo último del panel: las imágenes iban después de
// todo el texto, el botón al fondo, los errores lejos de lo que los
// causaba y ninguno traía su arreglo. Ahora es su propia pestaña, pensada
// en el orden en que se publica:
//
//   1. Qué sale y dónde (formato y redes, cada una marcada o no y con
//      lo que sale en ella) y con qué (los medios, arrastrando o pegando).
//   2. Cómo se va a ver, con el recorte de verdad de cada red. En pantalla
//      ancha va en su propia columna, a la derecha y siempre a la vista:
//      en el panel estrecho de antes, configurar tapaba el resultado.
//   3. El texto de cada red, sus hashtags y su primer comentario.
//   4. Lo que falta, cada cosa con su botón para arreglarla.
//   5. Una barra fija abajo con el día, la hora (y la sugerida) y los
//      botones de programar y publicar.
//
// Las reglas son las de `lib/publicacion.js`, las mismas que aplica el
// servidor al publicar: el aviso llega al escribir, no a la hora de salir.
// ============================================================

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import {
  revisarPublicacion, aplicarArreglo, REDES, AJUSTES, mediosDe, objetivoDe, necesitaAjuste, conMedios, destinoInstagram,
} from "../../lib/publicacion";
import { vistaAjuste } from "../../lib/medios";
import { EditorMedios, CamposRedes } from "./editorPublicacion";
import HistoriasDelPost from "./historiasPost";
import VistaRed from "./vistaRed";
import CuandoSale from "./cuandoSale";
import DestinoRedes from "./destinoRedes";
import { escribirDesdeContenido } from "../../api";
import { rellenarDesdeContenido, tieneContenido, formatoDeMedios } from "../../lib/subir";

/**
 * Una imagen que Instagram no acepta tal cual (la de Flow, 3:4): en vez de
 * un error sin salida, cómo se va a ajustar y cómo queda. Se ajusta sola
 * al programar; aquí sólo se elige la forma.
 */
function AjusteImagen({ post, sf, medio, objetivo, color }) {
  const ids = useId();
  const modo = post.ajusteIG || "difuminado";
  const [vista, setVista] = useState(null);
  useEffect(() => {
    let vivo = true;
    vistaAjuste(medio.src, objetivo, modo, color).then((v) => { if (vivo) setVista(v); }).catch(() => { if (vivo) setVista(null); });
    return () => { vivo = false; };
  }, [medio.src, objetivo, modo, color]);
  return (
    <div className="ajuste-imagen">
      <div className="ajuste-imagen-vista" data-objetivo={objetivo}>
        {vista ? <img src={vista} alt={`Cómo quedará en ${objetivo === "historia" ? "la historia" : "el feed"}`} /> : <span>Preparando la vista…</span>}
      </div>
      <div className="ajuste-imagen-opciones">
        <p>
          <strong>{medio.ancho}×{medio.alto}</strong> no cabe en {objetivo === "historia" ? "una historia (9:16)" : "el feed de Instagram (de 4:5 a 1.91:1)"}.
          Al programar se ajusta así; el original no se toca y Facebook y tu cliente lo ven tal cual.
        </p>
        <label className="sr-only" htmlFor={`${ids}-a`}>Cómo ajustar la imagen</label>
        <select id={`${ids}-a`} className="input" value={modo} onChange={(e) => sf("ajusteIG", e.target.value)}>
          {Object.entries(AJUSTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}

const REDES_POR_DEFECTO = ["instagram"];

/**
 * @param formatoAuto  true cuando la publicación se creó con «Subir
 *                     contenido»: el formato sigue al archivo (una imagen,
 *                     post; varias, carrusel; un video, reel) hasta que se
 *                     escoja uno a mano.
 * @param ancho        pantalla ancha: la vista previa va en su columna.
 */
export default function PestanaPublicar({ post, sf, setForm, client, clientId, day, cal = null, onError, publicacion = null, children, enlaceAMano = null, formatoAuto = false, ancho = false }) {
  const ids = useId();
  const entrada = useRef(null);
  const auto = useRef(formatoAuto);
  const [escribiendo, setEscribiendo] = useState("");
  const [escrito, setEscrito] = useState("");

  // «Escribir a partir del contenido»: la IA mira lo subido y rellena lo
  // que esté vacío. Lo escrito a mano no se toca.
  const escribir = async () => {
    setEscrito("");
    setEscribiendo("Preparando…");
    try {
      const propuesta = await escribirDesdeContenido(client, post, { calendar: cal, fecha: day.date, alProgresar: setEscribiendo });
      // El aviso se calcula con lo de ahora; el cambio se aplica sobre lo que
      // haya cuando llegue (se pudo seguir escribiendo mientras la IA miraba).
      const { rellenados } = rellenarDesdeContenido(post, propuesta);
      setForm((p) => rellenarDesdeContenido(p, propuesta).post);
      setEscrito(rellenados.length ? "Listo: la IA escribió lo que faltaba. Revísalo y retócalo." : "Ya estaba todo escrito: no cambié nada. Vacía un campo si quieres que lo reescriba.");
    } catch (e) {
      onError?.(`No se pudo escribir a partir del contenido: ${e.message}`);
    }
    setEscribiendo("");
  };
  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : REDES_POR_DEFECTO;
  const { errores, avisos, arreglos } = revisarPublicacion(post, redes, { navegador: true });
  const objetivo = redes.includes("instagram") ? objetivoDe(post, "instagram") : null;
  const fuera = objetivo ? mediosDe(post).find((m) => necesitaAjuste(m, objetivo)) : null;
  const cuentas = useMemo(() => (publicacion?.estadoRedes
    ? [...new Set((publicacion.estadoRedes.cuentas ?? []).filter((c) => c.clientId === clientId).map((c) => c.red))]
    : null), [publicacion?.estadoRedes, clientId]);
  const elegirFormato = (k) => { auto.current = false; sf("format", k); };
  const alCambiarMedios = (medios) => setForm((p) => {
    const siguiente = conMedios(p, medios);
    return auto.current && medios.length ? { ...siguiente, format: formatoDeMedios(medios) ?? p.format } : siguiente;
  });
  const esHistoria = post.format === "historia";
  const destino = destinoInstagram(post);
  const conImagen = mediosDe(post).some((m) => m.tipo === "imagen");
  const visibles = avisos.filter((a) => !(fuera && a.startsWith("Una imagen mide")));

  const arreglar = (texto) => {
    const a = arreglos[texto];
    if (!a) return;
    if (a.codigo === "medios") { entrada.current?.click(); return; }
    setForm((p) => aplicarArreglo(p, a.codigo));
  };

  const problema = (texto, tipo) => (
    <li key={texto} data-tipo={tipo}>
      <span>{tipo === "error" && <Icon name="alert" size={14} />} {texto}</span>
      {arreglos[texto] && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => arreglar(texto)}>
          <Icon name="wand" size={14} /> {arreglos[texto].etiqueta}
        </button>
      )}
    </li>
  );

  const vista = <VistaRed post={{ ...post, redes }} redes={redes} client={client} />;
  const revision = (
    <section className="revision" aria-label="Revisión antes de publicar">
      {errores.length > 0 && (
        <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
          {errores.map((e) => problema(e, "error"))}
        </ul>
      )}
      {visibles.length > 0 && (
        <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
          {visibles.map((a) => problema(a, "aviso"))}
        </ul>
      )}
      {!errores.length && <p className="revision-ok"><Icon name="check" size={14} /> Lista para publicar en {redes.map((r) => REDES[r].nombre).join(" y ")}.</p>}
    </section>
  );

  return (
    <div className="pestana-publicar" data-ancho={ancho || undefined}>
      <div className="pp-columnas">
      <div className="pp-config">
      <section className="pp-bloque" aria-labelledby={`${ids}-que`}>
        <h3 id={`${ids}-que`} className="label">¿Qué sale y dónde?</h3>
        <DestinoRedes
          post={post}
          redes={redes}
          onRedes={(lista) => sf("redes", lista)}
          cuentas={cuentas}
          formato={post.format}
          onFormato={elegirFormato}
        />
      </section>

      <EditorMedios
        post={post}
        clientId={clientId}
        driveFolder={client?.driveFolder}
        onChange={alCambiarMedios}
        onError={onError}
        entradaRef={entrada}
      />

      <div className="escribir-contenido">
        <button type="button" className="btn btn-accent btn-sm" disabled={!tieneContenido(post) || !!escribiendo} onClick={escribir}>
          <Icon name="sparkles" size={16} /> {escribiendo || "Escribir a partir del contenido"}
        </button>
        <span className="hint">
          {tieneContenido(post)
            ? "La IA mira la imagen o el video y escribe el texto, los hashtags, el primer comentario y el texto alternativo que falten."
            : "Sube una imagen o un video y la IA escribe el texto mirándolo."}
        </span>
        <div role="status" aria-live="polite" className={escrito ? undefined : "sr-only"}>{escrito && <p className="notice notice-ok">{escrito}</p>}</div>
      </div>

      {fuera && <AjusteImagen post={post} sf={sf} medio={fuera} objetivo={objetivo} color={client?.primaryColor} />}

      {!ancho && vista}

      {esHistoria ? (
        <p className="notice notice-warn pestana-publicar-nota">
          Una historia no lleva texto, hashtags ni comentario: lo que diga va dentro de la imagen o el video.
          {post.format === "historia" && mediosDe(post).length > 1 && ` Salen ${mediosDe(post).length} historias seguidas, en este orden.`}
          {" "}El sticker de enlace, la música y las encuestas sólo se ponen desde la app de Instagram.
        </p>
      ) : (
        <>
          <div className="field">
            <label className="label" htmlFor={`${ids}-desc`}>Texto de la publicación</label>
            <textarea
              id={`${ids}-desc`}
              className="textarea"
              style={{ minHeight: 120 }}
              value={post.descripcion || post.script || ""}
              onChange={(e) => sf("descripcion", e.target.value)}
              placeholder="Caption / descripción del contenido…"
            />
          </div>
          <CamposRedes post={post} sf={sf} />
          {destino === "reel" && redes.includes("instagram") && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-audio`}>Nombre del audio original (opcional)</label>
              <input id={`${ids}-audio`} className="input" maxLength={100} value={post.audioNombre || ""} onChange={(e) => sf("audioNombre", e.target.value)} placeholder="Ej.: Sonido original de Café Luna" />
              <p className="hint">Cómo se llamará el audio del reel en Instagram. La música de la biblioteca sólo se pone desde la app.</p>
            </div>
          )}
          {conImagen && redes.includes("instagram") && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-alt`}>Texto alternativo (opcional)</label>
              <input id={`${ids}-alt`} className="input" maxLength={1000} value={post.altTexto || ""} onChange={(e) => sf("altTexto", e.target.value)} placeholder="Describe la imagen para quien no la ve" />
            </div>
          )}
        </>
      )}

      {!["historia", "live"].includes(post.format) && (
        <HistoriasDelPost post={post} sf={sf} clientId={clientId} colorMarca={client?.primaryColor} onError={onError} />
      )}

      {!ancho && revision}
      </div>

      {ancho && (
        <aside className="pp-vista" aria-label="Cómo se va a ver">
          <h3 className="label">Así se va a ver</h3>
          {vista}
          {revision}
        </aside>
      )}
      </div>

      <div className="barra-fija-publicar">
        <CuandoSale
          post={post}
          sf={sf}
          day={day}
          clientId={clientId}
          filas={publicacion?.filas ?? []}
          estadoRedes={publicacion?.estadoRedes ?? null}
          errores={errores}
          enlaceAMano={enlaceAMano}
          onPublicar={(op) => publicacion.onPublicar(post, setForm, op)}
          onCancelar={publicacion?.onCancelar}
          onReintentar={publicacion?.onReintentar}
        />
        {children}
      </div>
    </div>
  );
}
