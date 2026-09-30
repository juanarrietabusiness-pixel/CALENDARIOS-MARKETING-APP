// ============================================================
// La pestaña «Subir» del panel de una publicación
//
// Pensada como el «Crear publicación» de Metricool, que es lo que la
// agencia usa de referencia:
//
//   · A la IZQUIERDA se configura, y es lo único que desplaza. Arriba,
//     qué sale y dónde; debajo, el compositor: los archivos (con borrar a
//     la vista y la portada del video) y el texto, con la IA al lado.
//     Lo de cada red va PLEGADO —«Configuración de Instagram», «de
//     Facebook», «Historia»—, con un resumen de lo puesto en el título:
//     antes todo iba abierto y había que bajar mucho para llegar al final.
//     La revisión son dos filas, «N errores» y «N avisos», que se abren.
//   · La barra con el día, la hora y el botón va pegada ABAJO DE LA
//     IZQUIERDA, no de la ventana entera: tapaba media vista previa. Y
//     lleva dentro las acciones del pie del panel (borrar, al banco,
//     cerrar), que a lo ancho no tiene pie propio: eran dos barras
//     apiladas y a 800 px de alto dejaban una rendija para configurar.
//   · A la DERECHA, la vista previa a toda la altura, con su propio
//     desplazamiento. Siempre entera, siempre a la vista.
//
// En el teléfono todo va en una columna, y la barra al final.
//
// Las reglas son las de `lib/publicacion.js`, las mismas que aplica el
// servidor al publicar: el aviso llega al escribir, no a la hora de salir.
// ============================================================

import { useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import {
  revisarPublicacion, aplicarArreglo, REDES, mediosDe, objetivoDe, necesitaAjuste, conMedios, destinoInstagram,
  historiasDe, contarHashtags, colaboradoresDe, LIMITES,
} from "../../lib/publicacion";
import { EditorMedios, CamposRedes, Plegable } from "./editorPublicacion";
import AjusteImagen from "./ajusteImagen";
import HistoriasDelPost from "./historiasPost";
import VistaRed from "./vistaRed";
import CuandoSale from "./cuandoSale";
import { EstadoAprobacion } from "./aprobacionCliente";
import DestinoRedes from "./destinoRedes";
import { escribirDesdeContenido } from "../../api";
import { rellenarDesdeContenido, tieneContenido, formatoDeMedios } from "../../lib/subir";
import { medioDeArchivo } from "../../lib/estudio";
import { useCrearConIA } from "../../hooks/useCrearConIA";

const REDES_POR_DEFECTO = ["instagram"];

/**
 * @param formatoAuto  true cuando la publicación se creó con «Subir
 *                     contenido»: el formato sigue al archivo (una imagen,
 *                     post; varias, carrusel; un video, reel) hasta que se
 *                     escoja uno a mano.
 * @param ancho        pantalla ancha: la vista previa va en su columna.
 */
export default function PestanaPublicar({ post, sf, setForm, client, clientId, day, cal = null, onError, publicacion = null, children, acciones = null, enlaceAMano = null, formatoAuto = false, ancho = false }) {
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
  // `mediosCambiadosAt` deja saber si los archivos cambiaron DESPUÉS de
  // que el cliente aprobara la pieza (lib/aprobacion.js). Convertir a JPEG
  // al programar no pasa por aquí, así que no cuenta como cambio.
  const alCambiarMedios = (medios) => setForm((p) => {
    const siguiente = { ...conMedios(p, medios), mediosCambiadosAt: new Date().toISOString() };
    return auto.current && medios.length ? { ...siguiente, format: formatoDeMedios(medios) ?? p.format } : siguiente;
  });

  // «Crear con IA»: el Estudio del cliente en un diálogo. Lo creado se AÑADE a los medios (nunca reemplaza),
  // y con un cambio funcional: el diálogo puede tardar y `post` se habría quedado atrás.
  const { abrir: abrirCreacion, dialogo: dialogoCreacion } = useCrearConIA({
    client, clientId, post, onError,
    uso: cal && post.id ? { calendarId: cal.dbId || cal.id, postId: post.id } : null,
    onUsar: (archivo) => {
      setForm((p) => {
        const actuales = mediosDe(p);
        if (actuales.length >= LIMITES.instagram.carruselMax) return p;
        const siguiente = { ...conMedios(p, [...actuales, medioDeArchivo(archivo)]), mediosCambiadosAt: new Date().toISOString() };
        return auto.current ? { ...siguiente, format: formatoDeMedios(mediosDe(siguiente)) ?? p.format } : siguiente;
      });
      setEscrito("Añadido a la publicación. Puedes escribir el texto con IA cuando quieras.");
    },
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
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const revision = (
    <div className="revision" aria-label="Revisión antes de publicar">
      {errores.length > 0 && (
        <Plegable titulo={plural(errores.length, "error", "errores")} icono="alert" tono="error" abierta={!ancho}>
          <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
            {errores.map((e) => problema(e, "error"))}
          </ul>
        </Plegable>
      )}
      {visibles.length > 0 && (
        <Plegable titulo={plural(visibles.length, "aviso", "avisos")} icono="info" tono="aviso">
          <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
            {visibles.map((a) => problema(a, "aviso"))}
          </ul>
        </Plegable>
      )}
      {!errores.length && <p className="revision-ok"><Icon name="check" size={14} /> Lista para publicar en {redes.map((r) => REDES[r].nombre).join(" y ")}.</p>}
    </div>
  );

  // Lo puesto en cada sección, para no tener que abrirla para saberlo.
  const hashtags = contarHashtags(post.hashtagsFinales);
  const resumenIG = [
    hashtags && plural(hashtags, "hashtag", "hashtags"),
    String(post.primerComentario ?? "").trim() && "1.er comentario",
    colaboradoresDe(post).length && plural(colaboradoresDe(post).length, "colaborador", "colaboradores"),
    String(post.altTexto ?? "").trim() && "texto alternativo",
  ].filter(Boolean).join(" · ") || null;
  const historias = historiasDe(post);
  const resumenHistoria = post.historiaTambien && historias.length ? plural(historias.length, "historia", "historias") : null;
  const conPortada = mediosDe(post).some((m) => m.tipo === "video");

  return (
    <div className="pestana-publicar" data-ancho={ancho || undefined}>
      <div className="pp-izquierda">
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

      {/* El compositor: archivos y texto en una misma tarjeta. */}
      <section className="compositor" aria-label="Contenido de la publicación">
        <EditorMedios
          post={post}
          clientId={clientId}
          driveFolder={client?.driveFolder}
          onChange={alCambiarMedios}
          onError={onError}
          entradaRef={entrada}
          onPortada={conPortada ? (c) => setForm((p) => ({ ...p, ...c })) : null}
          onCrearConIA={abrirCreacion}
        />

        {esHistoria ? (
          <p className="notice notice-warn pestana-publicar-nota">
            Una historia no lleva texto, hashtags ni comentario: lo que diga va dentro de la imagen o el video.
            {mediosDe(post).length > 1 && ` Salen ${mediosDe(post).length} historias seguidas, en este orden.`}
            {" "}El sticker de enlace, la música y las encuestas sólo se ponen desde la app de Instagram.
          </p>
        ) : (
          <div className="field compositor-texto">
            <div className="compositor-texto-cabecera">
              <label className="label" htmlFor={`${ids}-desc`}>Texto de la publicación</label>
              <button type="button" className="btn-ai" disabled={!tieneContenido(post) || !!escribiendo} onClick={escribir}
                title={tieneContenido(post) ? "La IA mira la imagen o el video y escribe el texto, los hashtags, el primer comentario y el texto alternativo que falten." : "Sube una imagen o un video primero"}>
                <Icon name="sparkles" size={14} /> {escribiendo || "Escribir con IA"}
              </button>
            </div>
            <textarea
              id={`${ids}-desc`}
              className="textarea"
              style={{ minHeight: 120 }}
              value={post.descripcion || post.script || ""}
              onChange={(e) => sf("descripcion", e.target.value)}
              placeholder="Caption / descripción del contenido…"
            />
            <div role="status" aria-live="polite" className={escrito ? undefined : "sr-only"}>{escrito && <p className="notice notice-ok">{escrito}</p>}</div>
          </div>
        )}
      </section>

      {fuera && <AjusteImagen post={post} alCambiar={setForm} clientId={clientId} objetivo={objetivo} color={client?.primaryColor} onError={onError} />}

      {!ancho && vista}

      {!esHistoria && (
        <div className="plegables">
          {redes.includes("instagram") && (
            <Plegable titulo="Configuración de Instagram" icono="photo" resumen={resumenIG}>
              <CamposRedes post={post} sf={sf} partes={["instagram"]} />
              {destino === "reel" && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-audio`}>Nombre del audio original (opcional)</label>
                  <input id={`${ids}-audio`} className="input" maxLength={100} value={post.audioNombre || ""} onChange={(e) => sf("audioNombre", e.target.value)} placeholder="Ej.: Sonido original de Café Luna" />
                  <p className="hint">Cómo se llamará el audio del reel en Instagram. La música de la biblioteca sólo se pone desde la app.</p>
                </div>
              )}
              {conImagen && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-alt`}>Texto alternativo (opcional)</label>
                  <input id={`${ids}-alt`} className="input" maxLength={1000} value={post.altTexto || ""} onChange={(e) => sf("altTexto", e.target.value)} placeholder="Describe la imagen para quien no la ve" />
                </div>
              )}
            </Plegable>
          )}
          {redes.includes("facebook") && (
            <Plegable titulo="Configuración de Facebook" icono="globe" resumen={post.textoFacebook ? "texto propio" : "mismo texto"}>
              <CamposRedes post={post} sf={sf} partes={["facebook"]} />
            </Plegable>
          )}
          {post.format !== "live" && (
            <Plegable titulo="También en historias" icono="formatHistoria" resumen={resumenHistoria}>
              <HistoriasDelPost post={post} sf={sf} clientId={clientId} colorMarca={client?.primaryColor} onError={onError} />
            </Plegable>
          )}
        </div>
      )}

      {!ancho && revision}
      </div>

      <div className="barra-fija-publicar">
        {ancho && revision}
        <EstadoAprobacion post={post} setForm={setForm} />
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
          inicio={ancho ? <>{acciones}{children}</> : null}
        />
        {!ancho && children}
      </div>
      </div>

      {ancho && (
        <aside className="pp-vista" aria-label="Cómo se va a ver">
          <h3 className="label">Así se va a ver</h3>
          {vista}
        </aside>
      )}

      {dialogoCreacion}
    </div>
  );
}
