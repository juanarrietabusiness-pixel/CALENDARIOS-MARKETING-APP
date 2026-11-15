import { lazy, Suspense, useId, useRef, useState } from "react";
import Icon from "./Icon";
import {
  textoCosto, etiquetaDeCosto, costoUnitario, nombreDelModelo, NOMBRE_PROPORCION, MAX_PROMPT, maxPorPedido, duracionDe, modelosParaLista, creadoresDe, CRITERIOS_ORDEN, NOMBRE_CALIDAD, NOMBRE_MOTOR,
} from "../lib/estudioCatalogo";
import { ETIQUETA_AJUSTE, valorDeAjuste } from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, LINEA_LOGO } from "../lib/kitMarca";
import { TOMAS, MAX_NOTA } from "../lib/referencias";
import "./EstudioCompositor.css";

// Sólo en el clip de video: aparte.
const GuionCorto = lazy(() => import("./EstudioGuionCorto"));

// ============================================================
// El compositor del Estudio: crear A MANO
//
// Sólo pinta: el estado (el formulario, la cola, los avisos) vive en Estudio.jsx. Va en su chunk (lazy): el del
// Estudio estaba en su tope. Sirve igual en Crear → «A mano» y en el diálogo «Crear en el Estudio» de una publicación.
//
// En TRES bloques, en el orden en que se decide (antes eran unos 40 controles en una columna con lo que más se toca
// —el formato, el producto, las referencias— debajo del modelo):
//   1. QUÉ: el formato (post 4:5, historia 9:16, carrusel, video; el formato fija la proporción), la idea y el texto
//      exacto en su campo, con «Dame ideas» y «Ver la ficha del director».
//   2. CON QUÉ: los productos (sus fotos van solas), las referencias de la galería con «¿Qué tomo?», los personajes, el
//      logo y los «Me gusta».
//   3. AJUSTES, plegados con su resumen en una línea («Kit · Nano Banana 2 · 4:5 · 1 imagen · ≈ 0,04 $»): el tipo de
//      pieza, el estilo, la plantilla, el modelo, la cantidad y la resolución.
// Nada desapareció: se reordenó y se plegó. Lo que un modelo no admite no se enseña.
// ============================================================

/** Los formatos de «Qué»: el de una imagen fija su proporción (Estudio.jsx la pone en el pedido). */
const FORMATOS_A_MANO = Object.freeze([
  ["post", "Post", "formatPost", "4:5"],
  ["historia", "Historia", "formatHistoria", "9:16"],
  ["carrusel", "Carrusel", "formatCarrusel", ""],
  ["video", "Video", "video", ""],
]);

/**
 * Los tipos de video, en UN solo selector (antes: «Guiado / Clip rápido» y, dentro de «Guiado», otras cuatro formas).
 * «clip» es el compositor de un prompt; los demás, el flujo guiado del reel (FlujoReel) en esa forma.
 */
const TIPOS_VIDEO = Object.freeze([
  ["guion", "Con guion por planos", "La idea, el storyboard, el video y el montaje con voz, texto y logo"],
  ["clip", "Clip rápido", "Un prompt, un clip: anima una foto o una escena corta"],
  ["producto", "Del producto", "10–15 s que terminan en su foto real y el logo"],
  ["animado", "Animado con código", "Escenas dibujadas, una locución y subtítulos"],
  ["cancion", "Con tu canción", "Tu canción ya grabada con su letra sincronizada"],
]);

/**
 * «Qué crear»: Post, Historia, Carrusel y Video y, en video, sus cinco tipos. Lo comparten el compositor y los flujos
 * guiados (el carrusel y el reel lo llevan de cabecera). Sin `conGuiados` (el diálogo de una publicación) no hay
 * carrusel y el video es el clip.
 */
export function QueCrear({ formato, tipoVideo = "guion", onFormato, onTipoVideo, conGuiados = true }) {
  const ids = useId();
  const opciones = FORMATOS_A_MANO.filter(([id]) => conGuiados || id !== "carrusel");
  return (
    <div className="est-que-crear">
      <div className="est-tipos" role="radiogroup" aria-label="Qué crear">
        {opciones.map(([id, nombre, icono, proporcion]) => (
          <button key={id} type="button" role="radio" aria-checked={formato === id} className="filter-chip est-formato" onClick={() => onFormato(id)}>
            <Icon name={icono} size={14} /> {nombre}{proporcion && <span className="est-formato-prop"> {proporcion}</span>}
          </button>
        ))}
      </div>
      {conGuiados && formato === "video" && (
        <div className="est-formas-video" role="radiogroup" aria-labelledby={`${ids}-tv`}>
          <span id={`${ids}-tv`} className="sr-only">Qué video</span>
          {TIPOS_VIDEO.map(([id, nombre, ayuda]) => (
            <button key={id} type="button" role="radio" aria-checked={tipoVideo === id} className="est-forma-video" onClick={() => onTipoVideo(id)}>
              <strong>{nombre}</strong>
              <span>{ayuda}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Un bloque con su título («1 · Qué»). */
function Bloque({ numero, titulo, ayuda = "", children }) {
  const id = useId();
  return (
    <div className="est-bloque" role="group" aria-labelledby={id}>
      <p className="est-bloque-titulo" id={id}><span className="est-bloque-numero" aria-hidden="true">{numero}</span> {titulo}</p>
      {ayuda && <p className="hint est-bloque-ayuda">{ayuda}</p>}
      {children}
    </div>
  );
}

/** Los botones para traer un archivo a un sitio del pedido: subir, de la galería (un diálogo, sin saltos) y de Drive. */
function Traer({ rol, subiendo, onSubir, onGaleria, onDrive, quedan }) {
  if (quedan <= 0) return null;
  return (
    <>
      {onGaleria && rol !== "video" && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGaleria(rol)}>
          <Icon name="image" size={16} /> De la galería
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onSubir(rol)}>
        <Icon name="upload" size={16} /> {subiendo ? "Subiendo…" : rol === "video" ? "Subir un video" : "Subir"}
      </button>
      {onDrive && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onDrive(rol)}>
          <Icon name="cloud" size={16} /> Drive
        </button>
      )}
    </>
  );
}

/** Una fila de imágenes puestas (miniatura + quitar) y cómo traer otra: la imagen inicial, la final, el video. */
function Ranura({ titulo, ayuda, archivos, max, rol, subiendo, onQuitar, onSubir, onDrive = null, onGaleria = null, ids }) {
  return (
    <div className="field">
      <span className="label" id={`${ids}-${rol}`}>{titulo}</span>
      <div className="est-refs" role="group" aria-labelledby={`${ids}-${rol}`}>
        {archivos.map((r) => (
          <span key={r.id} className="est-ref">
            {r.tipo === "video" ? <video src={r.src} muted playsInline preload="metadata" aria-hidden="true" /> : <img src={r.src} alt="" />}
            <span className="est-ref-nombre">{r.prompt || (r.tipo === "video" ? "Video" : "Imagen")}</span>
            <button type="button" className="btn-icon est-ref-quitar" aria-label={`Quitar: ${r.prompt || (r.tipo === "video" ? "video" : "imagen")}`} onClick={() => onQuitar(rol, r)}><Icon name="close" size={14} /></button>
          </span>
        ))}
        <Traer rol={rol} subiendo={subiendo} onSubir={onSubir} onGaleria={onGaleria} onDrive={onDrive} quedan={max - archivos.length} />
        <span className="hint">{archivos.length} de {max}. {ayuda}</span>
      </div>
    </div>
  );
}

/**
 * Las imágenes de referencia, cada una con QUÉ se toma de ella (estilo, composición, producto…) y una nota: sin
 * decirlo, el modelo copia de más —el producto de otro, su texto, sus logos—. Las fotos del catálogo no se marcan:
 * son el producto real y se copian tal cual (si es de otra marca, se dice y no lleva el logo del cliente).
 */
function Referencias({ ids, archivos, max, subiendo, onQuitar, onSubir, onDrive = null, onGaleria = null, onMarcar, nombrado = null }) {
  const alternar = (r, id) => {
    const actual = r.toma ?? [];
    onMarcar(r, { toma: actual.includes(id) ? actual.filter((t) => t !== id) : [...actual, id] });
  };
  return (
    <div className="field">
      <span className="label" id={`${ids}-reference`}>Referencias <span className="est-cuenta">{archivos.length} de {max}</span></span>
      {archivos.length > 0 && (
        <ul className="est-refs-lista" aria-labelledby={`${ids}-reference`}>
          {archivos.map((r, i) => {
            const nombre = r.prompt || (r.tipo === "video" ? "Video" : "Imagen");
            const toma = r.toma ?? [];
            const resumen = toma.length ? TOMAS.filter(([id]) => toma.includes(id)).map(([, n]) => n).join(", ") : "Todo";
            return (
              <li key={r.id} className="est-ref-fila">
                <div className="est-ref-cabeza">
                  {r.tipo === "video" ? <video src={r.src} muted playsInline preload="metadata" aria-hidden="true" /> : <img src={r.src} alt="" />}
                  <div className="est-ref-texto">
                    {r.producto ? (
                      <>
                        <span className="est-ref-insignia">Producto real</span>
                        <span className="est-ref-titulo">{r.producto.nombre}{r.producto.marca ? ` · de ${r.producto.marca}` : ""}</span>
                        <span className="hint">Se copia tal cual{r.producto.marca ? ", con su empaque y sin tu logo encima" : ""}.</span>
                      </>
                    ) : (
                      <>
                        <span className="est-ref-titulo">{i + 1}. {nombre}</span>
                        <span className="hint">Se toma: {resumen}{r.nota ? ` · «${r.nota}»` : ""}</span>
                      </>
                    )}
                  </div>
                  <button type="button" className="btn-icon est-ref-quitar" aria-label={`Quitar: ${r.producto?.nombre ?? nombre}`} onClick={() => onQuitar("reference", r)}><Icon name="close" size={14} /></button>
                </div>
                {!r.producto && (
                  <details className="est-ref-que">
                    <summary>¿Qué tomo de aquí?</summary>
                    <div className="est-tipos" role="group" aria-label={`Qué se toma de la referencia ${i + 1}`}>
                      <button type="button" className="filter-chip" aria-pressed={!toma.length} onClick={() => onMarcar(r, { toma: [] })}>Todo</button>
                      {TOMAS.map(([id, n]) => (
                        <button key={id} type="button" className="filter-chip" aria-pressed={toma.includes(id)} onClick={() => alternar(r, id)}>{n}</button>
                      ))}
                    </div>
                    <label className="label" htmlFor={`${ids}-nota-${r.id}`}>Comentario (opcional)</label>
                    <input
                      id={`${ids}-nota-${r.id}`} className="input" maxLength={MAX_NOTA} value={r.nota ?? ""}
                      placeholder="Me gusta cómo cae la luz sobre la mesa…"
                      onChange={(e) => onMarcar(r, { nota: e.target.value })}
                    />
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {nombrado && (
        <p className="notice est-nombrado" role="note">
          Tu idea nombra {nombrado.nombres.map((n) => `«${n}»`).join(" y ")}: al crear se suma{nombrado.fotos === 1 ? " 1 foto" : `n ${nombrado.fotos} fotos`} del catálogo{nombrado.nombres.length > 1 ? " (una de cada uno primero)" : ""} para que salga el producto real.
          {nombrado.sinHueco > 0 && ` ${nombrado.sinHueco === 1 ? "Otro producto nombrado no cabe" : `${nombrado.sinHueco} productos nombrados no caben`}: quita alguna referencia o usa un modelo que admita más.`}
        </p>
      )}
      <div className="est-refs">
        <Traer rol="reference" subiendo={subiendo} onSubir={onSubir} onGaleria={onGaleria} onDrive={onDrive} quedan={max - archivos.length} />
        {archivos.length >= max && <span className="hint">No caben más en este modelo: quita alguna o escoge otro en «Ajustes».</span>}
      </div>
    </div>
  );
}

/**
 * Los productos del catálogo con fotos, como chips: tocar uno pone SUS fotos de referencia (el producto real, no uno
 * parecido); otra vez, las quita. Con varios, los huecos se reparten (una foto de cada uno primero).
 */
function Productos({ ids, productos, puestos, onPoner, onQuitar }) {
  return (
    <div className="field">
      <span className="label" id={`${ids}-prod`}>Productos</span>
      <div className="est-tipos est-productos" role="group" aria-labelledby={`${ids}-prod`}>
        {productos.map((p) => {
          const va = puestos.includes(p.nombre);
          return (
            <button key={p.id} type="button" className="filter-chip" aria-pressed={va} onClick={() => (va ? onQuitar(p.id) : onPoner(p.id))}
              title={`${p.fotos.length} ${p.fotos.length === 1 ? "foto" : "fotos"} en el catálogo`}>
              {va && <Icon name="check" size={13} />} {p.nombre}
            </button>
          );
        })}
      </div>
      <p className="hint">Sus fotos van de referencia solas: así sale el producto real.</p>
    </div>
  );
}

/**
 * QUÉ clase de pieza es —un tipo de contenido del calendario, o uno propio del cliente—. Cambia lo que propone «Dame
 * ideas» y cómo se diseña la idea. No dice cómo se ve: eso es el estilo visual.
 */
function TipoDePieza({ ids, preset, onPreset, kit, sinIdea = false }) {
  const [familia, sub] = String(preset ?? "").split("-");
  const subtipos = TIPOS_PRESET[familia]?.subtipos ?? null;
  const propios = kit?.propios ?? [];
  return (
    <div className="field est-tipo-pieza">
      <span className="label" id={`${ids}-tipo`}>Tipo de pieza</span>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-tipo`}>
        <button type="button" className="filter-chip" aria-pressed={!preset} onClick={() => onPreset("")}>Sin tipo</button>
        {Object.entries(TIPOS_PRESET).map(([tipo, def]) => (
          <button key={tipo} type="button" className="filter-chip" aria-pressed={familia === tipo} onClick={() => onPreset(tipo)} title={def.ayuda}>{def.nombre}</button>
        ))}
        {propios.map((p) => (
          <button key={p.id} type="button" className="filter-chip" aria-pressed={preset === p.id} onClick={() => onPreset(p.id)}>{p.nombre}</button>
        ))}
      </div>
      {subtipos && (
        <div className="est-tipos est-subtipos" role="group" aria-label={`Cuál de ${TIPOS_PRESET[familia].nombre}`}>
          <button type="button" className="filter-chip" aria-pressed={!sub} onClick={() => onPreset(familia)}>General</button>
          {Object.entries(subtipos).map(([id, d]) => (
            <button key={id} type="button" className="filter-chip" aria-pressed={sub === id} onClick={() => onPreset(`${familia}-${id}`)}>{d.nombre}</button>
          ))}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        {preset && TIPOS_PRESET[familia] ? `${TIPOS_PRESET[familia].ayuda} ` : ""}
        {preset && sinIdea ? "El tipo no inventa el contenido: escribe la idea o pídela con «Dame ideas»." : "Dice QUÉ comunica la pieza; cómo se ve lo decide el estilo visual."}
      </p>
    </div>
  );
}

/**
 * CÓMO se ve: el kit de la marca (sus colores, en toda pieza), el ESTILO VISUAL —con su línea de acabado profesional;
 * por defecto el del tipo de pieza— y lo que se suma a la idea (se ve antes de pedir).
 */
function EstiloVisual({
  ids, preset, kitListo, kit, marca = "", textoPreset, bloqueMarca = "",
  estilo = "", estiloResuelto = "", nombreEstilo = "", lineaEstilo = "", onEstilo, fijadoTipo = "", onFijarEstilo = null,
  conLogo, puedeLogo, esVideo, refsTipo = [],
}) {
  const [familia] = String(preset ?? "").split("-");
  const esTipoBase = Boolean(TIPOS_PRESET[familia]);
  const estilos = kit?.estilos ?? [];
  const paleta = kit?.paleta ?? [];
  const lineas = [textoPreset, lineaEstilo, bloqueMarca, puedeLogo && conLogo ? LINEA_LOGO : ""].filter(Boolean);
  return (
    <div className="field est-estilo">
      <span className="label est-estilo-titulo" id={`${ids}-estilo`}>Estilo visual</span>
      <div className="est-marca-linea">
        <span className="est-marca-nombre">
          {kitListo ? <>Kit de marca{marca ? ` de ${marca}` : ""}</> : "Sin kit de marca"}
          {kitListo && paleta.length > 0 && (
            <span className="est-marca-colores" aria-label={`Colores: ${paleta.map((c) => c.nombre || c.hex).join(", ")}`}>
              {paleta.map((c) => <span key={c.hex} className="est-marca-color" style={{ background: c.hex }} title={`${c.nombre ? `${c.nombre} ` : ""}${c.hex}${c.rol ? ` · ${c.rol}` : ""}`} />)}
            </span>
          )}
        </span>
        {!kitListo && <span className="hint">Prepáralo en Marca → Kit y voz: sin kit, la IA no conoce sus colores ni su estilo.</span>}
      </div>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-estilo`}>
        <button type="button" className="filter-chip" aria-pressed={!estilo} onClick={() => onEstilo("")}>
          {esTipoBase ? `El del tipo${nombreEstilo && !estilo ? ` (${nombreEstilo})` : ""}` : "Ninguno"}
        </button>
        {Object.entries(ESTILOS_VISUALES).map(([id, d]) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={estilo === id} onClick={() => onEstilo(id)} title={d.ayuda}>{d.nombre}</button>
        ))}
        {estilos.map((e) => (
          <button key={e.id} type="button" className="filter-chip" aria-pressed={estilo === e.id} onClick={() => onEstilo(e.id)} title={e.texto}>{e.nombre} (propio)</button>
        ))}
      </div>
      {onFijarEstilo && esTipoBase && estilo && (
        <label className="est-logo-casilla">
          <input type="checkbox" checked={fijadoTipo === estilo} onChange={(e) => onFijarEstilo(familia, e.target.checked ? estilo : "")} />
          {" "}Usar siempre {nombreEstilo} en «{TIPOS_PRESET[familia].nombre}» de este cliente
        </label>
      )}
      {estiloResuelto && lineaEstilo && <p className="hint est-estilo-linea">{lineaEstilo}</p>}
      {refsTipo.length > 0 && !esVideo && (
        <p className="hint est-refs-tipo">
          {refsTipo.map((a) => <img key={a.id} src={a.src} alt="" className="est-refs-tipo-img" />)}
          Va{refsTipo.length === 1 ? " la imagen" : `n las ${refsTipo.length} imágenes`} de referencia de este tipo o estilo (su estilo y su composición).
        </p>
      )}
      {lineas.length > 0 && (
        <details className="est-preset-vista">
          <summary>Lo que se suma a tu idea</summary>
          {lineas.map((l) => <p key={l}>{l}</p>)}
        </details>
      )}
      {kitListo && esVideo && <p className="hint">En video el logo no va de referencia: el video empezaría en él.</p>}
    </div>
  );
}

/** Lo que se sabe del modelo escogido: quién lo hace, qué tan bueno es, cuánto tarda y para qué sirve. */
function FichaDelModelo({ modelo }) {
  const calidad = modelo.calidad ?? 2;
  return (
    <div className="est-ficha">
      <p className="hint est-modelo-nota">{modelo.nota}</p>
      <ul className="est-ficha-datos" aria-label="Sobre este modelo">
        {modelo.creador && <li><span className="est-dato-t">Lo hace</span> {modelo.creador}</li>}
        <li>
          <span className="est-dato-t">Calidad</span>{" "}
          <span className="est-puntos" role="img" aria-label={`${calidad} de 4: ${NOMBRE_CALIDAD[calidad]}`}>
            {[1, 2, 3, 4].map((n) => <span key={n} className="est-punto" data-lleno={n <= calidad || undefined} />)}
          </span>
        </li>
        {modelo.velocidad && <li><span className="est-dato-t">Velocidad</span> {modelo.velocidad}</li>}
        {modelo.para?.length > 0 && <li><span className="est-dato-t">Sirve para</span> {modelo.para.join(", ")}</li>}
      </ul>
    </div>
  );
}

/**
 * «Dame ideas»: para cuando la mente está en blanco. Variadas (un tipo de contenido distinto cada una) o del tipo de
 * pieza escogido; si ya hay algo escrito, sobre eso. Cada una con «Usar», que la pone en el pedido con su texto, su
 * tipo y las fotos de su producto. Es texto: no gasta en el motor.
 */
function DameIdeas({ ids, generando, lista = [], deTipo = "", conTema = false, onGenerar, onUsar, onCerrar, nombreDeTipo, nombreDeProducto }) {
  const [variadas, setVariadas] = useState(false);
  const soloTipo = Boolean(deTipo) && !variadas;
  return (
    <div className="est-ideas">
      <div className="est-acciones-idea">
        <button type="button" className="btn btn-secondary btn-sm" disabled={generando} onClick={() => onGenerar(soloTipo && deTipo ? deTipo : "")}>
          <Icon name="bulb" size={14} /> {generando ? "Pensando ideas…" : lista.length ? "Otras ideas" : "Dame ideas"}
        </button>
        {deTipo && (
          <label className="est-logo-casilla">
            <input type="checkbox" checked={variadas} onChange={(e) => setVariadas(e.target.checked)} /> Variadas (no sólo «{nombreDeTipo(deTipo)}»)
          </label>
        )}
        {lista.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Cerrar las ideas</button>}
      </div>
      {lista.length > 0 && (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {conTema ? "Sobre lo que escribiste. " : ""}{soloTipo && deTipo ? "Todas de ese tipo de pieza" : "Variadas: cada una de un tipo de contenido distinto"}, con el catálogo y el cerebro. No crea nada todavía.
          </p>
          <ul className="est-ideas-lista" aria-label="Ideas propuestas">
            {lista.map((i) => (
              <li key={i.id} className="est-idea-tarjeta">
                <span className="est-ref-insignia">{nombreDeTipo(i.tipo)}</span>
                <strong>{i.titulo}</strong>
                <p>{i.escena}</p>
                {i.texto && <p className="est-idea-texto">«{i.texto.split("\n").join(" · ")}»</p>}
                {i.productoId && nombreDeProducto(i.productoId) && <p className="hint" style={{ margin: 0 }}>Producto: {nombreDeProducto(i.productoId)}</p>}
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onUsar(i)} aria-describedby={`${ids}-ideas-usar`}>
                  <Icon name="check" size={14} /> Usar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <span id={`${ids}-ideas-usar`} className="sr-only">La pone en el pedido con su texto, su tipo de pieza y las fotos de su producto.</span>
    </div>
  );
}

/** El resumen de los ajustes, en una línea: lo que va sin abrirlos. */
function resumenDeAjustes({ estilo, modelo, form, costo, esVideo }) {
  const a = form.ajustes ?? {};
  const cuanto = esVideo ? (form.n > 1 ? `${form.n} videos` : "1 video") : (form.n > 1 ? `${form.n} imágenes` : "1 imagen");
  const plantilla = estilo?.plantillas?.escogida ? estilo.plantillas.lista.find((p) => p.id === estilo.plantillas.escogida)?.nombre : "";
  return [
    estilo ? (estilo.kitListo ? "Kit" : "Sin kit") : "",
    estilo?.nombrePieza ?? "",
    estilo?.estilo ? estilo.nombreEstilo : "",
    modelo.nombre,
    a.aspectRatio ?? "",
    a.resolution ? valorDeAjuste("resolution", a.resolution) : a.imageSize ? valorDeAjuste("imageSize", a.imageSize) : "",
    a.duration ? valorDeAjuste("duration", a.duration) : "",
    cuanto,
    plantilla ? `plantilla ${plantilla}` : "",
    textoCosto(costo),
  ].filter(Boolean).join(" · ");
}

export default function Compositor({
  ids, form, setForm, modelo, motores, costo, confirmando, enviando, subiendo,
  onEnviar, onConfirmar, onNo, onModelo, onQuitarMedio, onMarcarReferencia, onSubirArchivos, onDrive = null, onGaleria = null, promptRef, etiquetaPrompt = "La idea",
  queCrear = null, nombrado = null,
  mejorando = false, onMejorar = null, onVolverIdea = null,
  estilo = null,
  guionCorto = null,
  fijado = "", onFijar = null,
  ideas = null, ultimas = [], onAbrir = null,
}) {
  const entrada = useRef(null);
  const rolSubida = useRef("reference");
  // Del más barato al más caro, como todas las listas del Estudio (se puede cambiar).
  const [orden, setOrden] = useState("barato");
  const [creador, setCreador] = useState("");
  const idsLista = useId();
  const activo = (m) => Boolean(motores?.[m.motor]?.activo);
  const activos = Object.fromEntries(Object.entries(motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
  const esVideo = form.tipo === "video";
  const medios = form.medios;
  const conInicial = Boolean(modelo.inicial);
  const conFinal = Boolean(modelo.final) && medios.start.length > 0;
  const nombreDeTipo = esVideo ? (form.n > 1 ? `${form.n} videos` : "video") : (form.n > 1 ? `${form.n} imágenes` : "imagen");
  const cantidades = esVideo ? [1, 2] : [1, 2, 3, 4, 6, 8].filter((n) => n <= maxPorPedido(modelo));
  const segundos = esVideo ? duracionDe(modelo, form.ajustes) : 0;
  const familia = String(estilo?.preset ?? "").split("-")[0];
  const productosPuestos = [...new Set(medios.reference.filter((x) => x.producto).map((x) => x.producto.nombre))];
  const conRefs = modelo.referencias > 0;

  const abrirSubida = (rol) => {
    rolSubida.current = rol;
    if (entrada.current) entrada.current.accept = rol === "video" ? "video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp";
    entrada.current?.click();
  };
  const alElegir = (e) => {
    // Copiar ANTES de resetear: vaciar el campo vacía también su lista de archivos.
    const archivos = [...e.target.files];
    e.target.value = "";
    if (archivos.length) onSubirArchivos(archivos, rolSubida.current);
  };
  const cambiarAjuste = (nombre, valor) => setForm((f) => ({ ...f, ajustes: { ...f.ajustes, [nombre]: valor } }));

  return (
    <form className="card est-compositor" onSubmit={(e) => { e.preventDefault(); onEnviar(false); }}>
      {/* ---------- 1 · Qué ---------- */}
      <Bloque numero="1" titulo="Qué">
        {queCrear}
        <div className="field">
          <label className="label" htmlFor={`${ids}-p`}>{etiquetaPrompt}</label>
          <textarea
            id={`${ids}-p`} ref={promptRef} className="input est-prompt-campo" rows={4} maxLength={MAX_PROMPT}
            placeholder={esVideo
              ? "El sofá gira despacio mientras la luz de la tarde cruza la sala; cámara fija, sin texto…"
              : "Una taza de café humeante sobre una mesa de madera, luz de la mañana, foto de producto…"}
            value={form.prompt}
            onChange={(e) => { onNo(); setForm({ ...form, prompt: e.target.value }); }}
          />
          {form.prompt.length > 3500 && <p className="hint">{form.prompt.length} de {MAX_PROMPT} caracteres.</p>}
        </div>
        {!esVideo && (
          <div className="field">
            <label className="label" htmlFor={`${ids}-tx`}>Texto exacto en la pieza <span className="hint">(opcional)</span></label>
            <textarea
              id={`${ids}-tx`} className="input est-texto-campo" rows={2} maxLength={300} value={form.texto ?? ""}
              placeholder={"Sofá cama Lisboa\nDesde 499 $"}
              onChange={(e) => { onNo(); setForm({ ...form, texto: e.target.value }); }}
            />
            <p className="hint">Lo que va escrito encima, letra por letra (una línea por renglón). El control lo revisa al terminar. Vacío: sin texto, salvo que la idea lo pida.</p>
          </div>
        )}
        {esVideo && <p className="hint">El video va limpio: sin texto dentro.</p>}
        {ideas && <DameIdeas ids={ids} {...ideas} />}
        {(familia === "anuncio" || familia === "beneficios") && !esVideo && estilo?.angulos?.length > 0 && estilo.onAngulo && (
          <div className="field">
            <label className="label" htmlFor={`${ids}-angulo`}>Desde el estudio de mercado</label>
            <select id={`${ids}-angulo`} className="input" defaultValue="" onChange={(e) => { const a = estilo.angulos.find((x) => x.id === e.target.value); if (a) estilo.onAngulo(a); e.target.value = ""; }}>
              <option value="">Escoge un producto y un gancho…</option>
              {[...new Set(estilo.angulos.map((a) => a.producto))].map((producto) => (
                <optgroup key={producto} label={`${producto}${estilo.angulos.find((a) => a.producto === producto)?.precio ? ` · ${estilo.angulos.find((a) => a.producto === producto).precio}` : ""}`}>
                  {estilo.angulos.filter((a) => a.producto === producto).map((a) => <option key={a.id} value={a.id}>{a.nombreNivel}: {a.gancho}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {onMejorar && (
          <div className="est-mejorar">
            <button type="button" className="btn btn-accent btn-sm" disabled={mejorando} onClick={() => onMejorar()}>
              <Icon name="wand" size={16} /> {mejorando ? "El director está diseñando…" : "Ver la ficha del director"}
            </button>
            {onVolverIdea && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={mejorando} onClick={onVolverIdea}>Volver a mi idea</button>
            )}
            <p className="hint">{esVideo ? "Te deja la idea más clara en el mismo campo." : "Escribe la ficha de diseño (composición, colores, texto exacto) en el campo de la idea, para revisarla antes de crear."} No crea nada todavía.</p>
          </div>
        )}
        {esVideo && guionCorto && <Suspense fallback={null}><GuionCorto {...guionCorto} /></Suspense>}
      </Bloque>

      {/* ---------- 2 · Con qué ---------- */}
      <Bloque numero="2" titulo="Con qué" ayuda={!conRefs && !conInicial && !modelo.video ? `${modelo.nombre} no admite imágenes de apoyo: escoge otro modelo en «Ajustes» para poner referencias.` : ""}>
        {!esVideo && conRefs && estilo?.productos?.length > 0 && estilo.onProducto && (
          <Productos ids={ids} productos={estilo.productos} puestos={productosPuestos} onPoner={estilo.onProducto} onQuitar={estilo.onQuitarProducto} />
        )}
        {modelo.video > 0 && (
          <Ranura ids={ids} rol="video" titulo="Video de referencia" max={1} archivos={medios.video ?? []} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
            ayuda={modelo.inicial
              ? "El movimiento de este video pasa a tu imagen inicial (MP4, MOV o WebM, hasta 50 MB)."
              : "El modelo sigue sus planos, su ritmo y su movimiento con tu marca (MP4, MOV o WebM, hasta 50 MB)."} />
        )}
        {modelo.necesitaImagen && (
          <p className="notice notice-warn est-necesita" role="note">
            {modelo.nombre} no crea desde texto solo: necesita {conInicial ? "una imagen inicial" : "al menos una imagen de referencia"}.
          </p>
        )}
        {conInicial && (
          <Ranura ids={ids} rol="start" titulo="Imagen inicial" max={1} archivos={medios.start} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
            ayuda="El video arranca de esta imagen (también: «Animar» en cualquiera de la galería)." />
        )}
        {conFinal && (
          <Ranura ids={ids} rol="end" titulo="Imagen final" max={1} archivos={medios.end} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
            ayuda="Opcional: el video termina en esta imagen." />
        )}
        {conRefs && (
          <Referencias ids={ids} max={modelo.referencias} archivos={medios.reference} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
            onMarcar={onMarcarReferencia} nombrado={nombrado} />
        )}
        {conRefs && estilo?.personajes && (
          <div className="field">
            <span className="label" id={`${ids}-pers`}>Personajes de la marca</span>
            <div className="est-tipos" role="group" aria-labelledby={`${ids}-pers`}>
              {estilo.personajes.lista.map((p) => (
                <button key={p.id} type="button" className="filter-chip" aria-pressed={estilo.personajes.escogidos.includes(p.id)} title={p.descripcion}
                  onClick={() => estilo.personajes.onCambiar(estilo.personajes.escogidos.includes(p.id) ? estilo.personajes.escogidos.filter((x) => x !== p.id) : [...estilo.personajes.escogidos, p.id])}>
                  {p.nombre}
                </button>
              ))}
            </div>
            {estilo.personajes.escogidos.length > 0 && (
              <p className="hint">{estilo.personajes.van ? `Van ${estilo.personajes.van === 1 ? "su imagen" : `${estilo.personajes.van} imágenes`} de referencia: sale igual (cara, pelo, ropa).` : "No queda hueco de referencia en este modelo: quita alguna."}</p>
            )}
          </div>
        )}
        {estilo?.puedeLogo && (
          <label className="est-logo-casilla">
            <input type="checkbox" checked={estilo.conLogo} onChange={(e) => estilo.onConLogo(e.target.checked)} /> Con el logo de la marca (de referencia)
          </label>
        )}
        {estilo?.estampa && (
          <label className="est-logo-casilla">
            <input type="checkbox" checked={estilo.conLogo} onChange={(e) => estilo.onConLogo(e.target.checked)} /> Estampar el logo encima al terminar (el original, en su esquina)
          </label>
        )}
        {estilo?.gustos && !esVideo && (
          <div className="est-gustos">
            <label className="est-logo-casilla">
              <input type="checkbox" checked={estilo.gustos.activo} onChange={(e) => estilo.gustos.onCambiar(e.target.checked)} /> Usar mis «Me gusta» como referencia de estilo
            </label>
            {estilo.gustos.activo && (
              <p className="hint">
                {estilo.gustos.van ? `Van ${estilo.gustos.van === 1 ? "la última" : `las ${estilo.gustos.van} últimas`} que te gustaron, sólo por su estilo.` : "No queda hueco de referencia en este modelo: quita alguna para que vayan."}
              </p>
            )}
          </div>
        )}
      </Bloque>

      {/* ---------- 3 · Ajustes, plegados con su resumen ---------- */}
      <details className="est-bloque est-ajustes">
        <summary>
          <span className="est-bloque-titulo"><span className="est-bloque-numero" aria-hidden="true">3</span> Ajustes</span>
          <span className="est-ajustes-resumen">{resumenDeAjustes({ estilo, modelo, form, costo, esVideo })}</span>
        </summary>
        <div className="est-ajustes-cuerpo">
          {estilo && <TipoDePieza ids={ids} preset={estilo.preset} onPreset={estilo.onPreset} kit={estilo.kit} sinIdea={estilo.sinIdea} />}
          {estilo && <EstiloVisual ids={ids} esVideo={esVideo} {...estilo} />}
          {estilo?.plantillas && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-plantilla`}>Plantilla</label>
              <select id={`${ids}-plantilla`} className="input" value={estilo.plantillas.escogida} onChange={(e) => estilo.plantillas.onCambiar(e.target.value)}>
                <option value="">Ninguna: diseño libre</option>
                {estilo.plantillas.lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="est-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-m`}>Modelo</label>
              <select id={`${ids}-m`} className="input" value={form.modelo} onChange={(e) => onModelo(e.target.value)}>
                {/* Sólo los que se pueden pedir: los de un proveedor sin llave no salen. Si el escogido no tiene llave,
                    Estudio.jsx lo cambia al preferido. */}
                {modelosParaLista(form.tipo, { orden, creador, activos, seleccionado: form.modelo }).filter((m) => activo(m) || m.motor === "prueba").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}{m.motor === "prueba" ? "" : ` · ${NOMBRE_MOTOR[m.motor] ?? m.motor}`} · {etiquetaDeCosto(m)}
                  </option>
                ))}
              </select>
            </div>
            {Object.entries(modelo.ajustes).map(([nombre, def]) => (
              <div className="field" key={nombre}>
                <label className="label" htmlFor={`${ids}-a-${nombre}`}>{nombre === "aspectRatio" ? "Proporción" : ETIQUETA_AJUSTE[nombre] ?? nombre}</label>
                <select id={`${ids}-a-${nombre}`} className="input" value={form.ajustes[nombre]} onChange={(e) => cambiarAjuste(nombre, e.target.value)}>
                  {def.valores.map((v) => (
                    <option key={v} value={v}>{nombre === "aspectRatio" ? `${NOMBRE_PROPORCION[v] ?? v} (${v})` : valorDeAjuste(nombre, v)}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="field">
              <label className="label" htmlFor={`${ids}-n`}>Cuántas</label>
              <select id={`${ids}-n`} className="input" value={form.n} onChange={(e) => { onNo(); setForm({ ...form, n: Number(e.target.value) }); }}>
                {cantidades.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <details className="est-lista-opciones">
            <summary>Ordenar y filtrar la lista de modelos</summary>
            <div className="est-fila est-fila-lista">
              <div className="field">
                <label className="label" htmlFor={`${idsLista}-o`}>Ordenar por</label>
                <select id={`${idsLista}-o`} className="input" value={orden} onChange={(e) => setOrden(e.target.value)}>
                  {CRITERIOS_ORDEN.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${idsLista}-c`}>Creador</label>
                <select id={`${idsLista}-c`} className="input" value={creador} onChange={(e) => setCreador(e.target.value)}>
                  <option value="">Todos</option>
                  {creadoresDe(form.tipo).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </details>
          {onFijar && (
            <label className="est-logo-casilla est-fijar">
              <input type="checkbox" checked={fijado === modelo.id} onChange={(e) => onFijar(e.target.checked ? modelo.id : "")} />
              {" "}Fijar {modelo.nombre} para {esVideo ? "los videos" : "las imágenes"} de este cliente
              {fijado && fijado !== modelo.id && <span className="hint"> (ahora está fijado {nombreDelModelo(fijado) || "otro"})</span>}
            </label>
          )}
          <FichaDelModelo modelo={modelo} />
        </div>
      </details>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" multiple className="est-archivo" tabIndex={-1} aria-hidden="true" onChange={alElegir} />

      <div className="est-pie-compositor">
        {confirmando != null ? (
          <div className="est-confirmar" role="alert">
            <span>Este pedido cuesta <strong>{textoCosto(confirmando)}</strong>. ¿Seguimos?</span>
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => onConfirmar()}>Sí, crear</button>
            <button type="button" className="btn btn-ghost" onClick={onNo}>No</button>
          </div>
        ) : (
          <>
            {esVideo && costo > 0 && (
              <p className="est-costo">{segundos} s × {form.n} × {textoCosto(costoUnitario(modelo, form.ajustes)).replace("≈ ", "")}/s{modelo.estimado ? " · precio aproximado" : ""}</p>
            )}
            <button type="submit" className="btn btn-primary est-crear" disabled={enviando || !activo(modelo)}>
              <Icon name={esVideo ? "video" : "sparkles"} size={18} /> {enviando ? "Pidiendo…" : `Crear ${nombreDeTipo} · ${textoCosto(costo)}`}
            </button>
          </>
        )}
      </div>
      {/* Lo último que salió de aquí: ahí mismo, con su visor (Corregir, Otra versión, Poner en una publicación…). */}
      {ultimas.length > 0 && onAbrir && (
        <div className="est-ultimas" role="group" aria-label="Lo que acabas de crear">
          <span className="hint">Lista:</span>
          {ultimas.map((a) => (
            <button key={a.id} type="button" className="est-ultima" onClick={() => onAbrir(a)} aria-label={`Abrir la que acabas de crear: ${a.prompt?.slice(0, 60) || "imagen"}`}>
              {a.tipo === "video" ? <Icon name="video" size={18} /> : <img src={a.src} alt="" />}
            </button>
          ))}
          <span className="hint">Ábrela para corregirla, hacer otra versión o ponerla en una publicación.</span>
        </div>
      )}
    </form>
  );
}
