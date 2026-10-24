import { lazy, Suspense, useId, useRef, useState } from "react";
import Icon from "./Icon";
import {
  textoCosto, etiquetaDeCosto, costoUnitario, nombreDelModelo, NOMBRE_PROPORCION, MAX_PROMPT, maxPorPedido, duracionDe, modelosParaLista, creadoresDe, CRITERIOS_ORDEN, NOMBRE_CALIDAD, NOMBRE_MOTOR,
} from "../lib/estudioCatalogo";
import { ETIQUETA_AJUSTE, valorDeAjuste } from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, LINEA_LOGO } from "../lib/kitMarca";
import { TOMAS, MAX_NOTA } from "../lib/referencias";

// Sólo en el clip de video: aparte, que el chunk del Estudio va al límite (20 kB).
const GuionCorto = lazy(() => import("./EstudioGuionCorto"));

// ============================================================
// El compositor del Estudio: qué se quiere crear
//
// Sólo pinta: el estado (el formulario, la cola, los avisos) vive en Estudio.jsx.
// Sirve igual en la pestaña del cliente y en el diálogo «Crear con IA» del panel
// de una publicación.
//
// Lo que cambia entre imagen y video, dicho a la persona en vez de escondido:
//   · una imagen admite REFERENCIAS (las que dé el modelo);
//   · un video admite una imagen INICIAL, a veces una FINAL, a veces referencias,
//     y cuesta por segundo. Lo que un modelo no admite no se enseña.
// ============================================================

// «Clip rápido»: un prompt, un clip por API (animar una foto). El video con guion es el guiado «reel» (FlujoReel).
const TIPOS = [["imagen", "Imagen", "image"], ["video", "Video", "video"]];

// Las dos formas de hacer un video, dentro de la MISMA opción «Video». Antes eran dos chips sueltos («Video» y «Clip
// rápido») y no se entendía cuál era cuál; los dos sistemas siguen igual, sólo cambia cómo se escoge.
const FORMAS_VIDEO = [["reel", "Con guion", "Planos, sonido y Flow"], ["video", "Clip rápido", "Un prompt, un clip"]];

/**
 * «Qué crear»: Imagen, Carrusel y Video. El video tiene dos formas (con guion —el guiado «reel»— o clip rápido —el
 * compositor de video—) que se escogen debajo; arranca con guion. Lo comparten el compositor y los flujos guiados.
 */
export function QueCrear({ actual, onCambiar, guiados = [] }) {
  const conGuion = guiados.some(([t]) => t === "reel");
  const esVideo = actual === "video" || actual === "reel";
  const opciones = [TIPOS[0], ...guiados.filter(([t]) => t !== "reel"), TIPOS[1]];
  const elegir = (tipo) => onCambiar(tipo === "video" && conGuion ? "reel" : tipo);
  return (
    <>
      <div className="est-tipos" role="group" aria-label="Qué crear">
        {opciones.map(([tipo, nombre, icono]) => (
          <button key={tipo} type="button" className="filter-chip" aria-pressed={tipo === "video" ? esVideo : actual === tipo} onClick={() => elegir(tipo)}>
            <Icon name={icono} size={14} /> {nombre}
          </button>
        ))}
      </div>
      {conGuion && esVideo && (
        <div className="est-formas-video" role="radiogroup" aria-label="Cómo hacer el video">
          {FORMAS_VIDEO.map(([forma, nombre, ayuda]) => (
            <button key={forma} type="button" role="radio" aria-checked={actual === forma} className="est-forma-video" onClick={() => onCambiar(forma)}>
              <strong>{nombre}</strong>
              <span>{ayuda}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Una fila de imágenes puestas (miniatura + quitar), el botón de subir una y, con Drive, el de traerla de allí. */
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
        {archivos.length < max && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onSubir(rol)}>
            <Icon name="upload" size={16} /> {subiendo ? "Subiendo…" : rol === "video" ? "Subir un video" : "Subir una imagen"}
          </button>
        )}
        {archivos.length < max && onGaleria && rol !== "video" && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGaleria(rol)}>
            <Icon name="image" size={16} /> De la galería
          </button>
        )}
        {archivos.length < max && onDrive && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onDrive(rol)}>
            <Icon name="cloud" size={16} /> Desde Drive
          </button>
        )}
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
      <span className="label" id={`${ids}-reference`}>Imágenes de referencia</span>
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
        {archivos.length < max && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onSubir("reference")}>
            <Icon name="upload" size={16} /> {subiendo ? "Subiendo…" : "Subir una imagen"}
          </button>
        )}
        {archivos.length < max && onGaleria && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGaleria("reference")}>
            <Icon name="image" size={16} /> De la galería
          </button>
        )}
        {archivos.length < max && onDrive && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo} onClick={() => onDrive("reference")}>
            <Icon name="cloud" size={16} /> Desde Drive
          </button>
        )}
        <span className="hint">{archivos.length} de {max}.</span>
      </div>
    </div>
  );
}

/**
 * QUÉ clase de pieza es —un tipo de contenido del calendario, o uno propio del cliente—. Va ANTES de la idea: cambia lo
 * que propone «Dame ideas» y cómo se mejora la idea. No dice cómo se ve: eso es el estilo visual, más abajo.
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
        {preset && sinIdea ? "El tipo no inventa el contenido: escribe la idea abajo o pídela con «Dame ideas»." : "Dice QUÉ comunica la pieza; cómo se ve lo decide el estilo visual."}
      </p>
    </div>
  );
}

/**
 * CÓMO se ve: el kit de la marca (sus colores, en toda pieza mientras esté encendido), el ESTILO VISUAL —con su línea
 * de acabado profesional; por defecto el del tipo de pieza— y lo que se pone de referencia (las del tipo, los «Me
 * gusta», el logo, las fotos de productos). Lo que se suma a la idea se ve antes de pedir.
 */
function EstiloDeMarca({
  ids, preset, kitListo, kit, marca = "", textoPreset, bloqueMarca = "", usarKit = true, onUsarKit,
  estilo = "", estiloResuelto = "", nombreEstilo = "", lineaEstilo = "", onEstilo, fijadoTipo = "", onFijarEstilo = null,
  conLogo, onConLogo, puedeLogo, estampa = false, esVideo, angulos = [], onAngulo, productos = [], onProducto, gustos = null, refsTipo = [], personajes = null,
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
        {kitListo ? (
          <label className="est-marca-usar">
            <input type="checkbox" checked={usarKit} onChange={(e) => onUsarKit(e.target.checked)} /> Usar el kit en esta pieza
          </label>
        ) : (
          <span className="hint">Prepáralo en la pestaña Estudio del cliente: sin kit, la IA no conoce sus colores ni su estilo.</span>
        )}
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
      {(familia === "anuncio" || familia === "beneficios") && !esVideo && angulos.length > 0 && onAngulo && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-angulo`}>Desde el estudio de mercado</label>
          <select id={`${ids}-angulo`} className="input" defaultValue="" onChange={(e) => { const a = angulos.find((x) => x.id === e.target.value); if (a) onAngulo(a); e.target.value = ""; }}>
            <option value="">Escoge un producto y un gancho…</option>
            {[...new Set(angulos.map((a) => a.producto))].map((producto) => (
              <optgroup key={producto} label={`${producto}${angulos.find((a) => a.producto === producto)?.precio ? ` · ${angulos.find((a) => a.producto === producto).precio}` : ""}`}>
                {angulos.filter((a) => a.producto === producto).map((a) => <option key={a.id} value={a.id}>{a.nombreNivel}: {a.gancho}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="hint">Escribe la idea con el gancho y el precio exactos del catálogo; la escena la ajustas tú.</p>
        </div>
      )}
      {!esVideo && productos.length > 0 && onProducto && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-producto`}>Fotos de productos</label>
          <select id={`${ids}-producto`} className="input" defaultValue="" onChange={(e) => { if (e.target.value) onProducto(e.target.value); e.target.value = ""; }}>
            <option value="">Poner de referencia las fotos de…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.fotos.length} {p.fotos.length === 1 ? "foto" : "fotos"})</option>)}
          </select>
          <p className="hint">Las del catálogo: así sale el producto real y no uno parecido. Escoge varios para una pieza con varios productos: se reparten los huecos.</p>
        </div>
      )}
      {personajes && (
        <div className="field">
          <span className="label" id={`${ids}-pers`}>Personajes de la marca</span>
          <div className="est-tipos" role="group" aria-labelledby={`${ids}-pers`}>
            {personajes.lista.map((p) => (
              <button key={p.id} type="button" className="filter-chip" aria-pressed={personajes.escogidos.includes(p.id)} title={p.descripcion}
                onClick={() => personajes.onCambiar(personajes.escogidos.includes(p.id) ? personajes.escogidos.filter((x) => x !== p.id) : [...personajes.escogidos, p.id])}>
                {p.nombre}
              </button>
            ))}
          </div>
          {personajes.escogidos.length > 0 && (
            <p className="hint">{personajes.van ? `Van ${personajes.van === 1 ? "su imagen" : `${personajes.van} imágenes`} de referencia: sale igual (cara, pelo, ropa).` : "No queda hueco de referencia en este modelo: quita alguna."}</p>
          )}
        </div>
      )}
      {gustos && !esVideo && (
        <div className="est-gustos">
          <label className="est-logo-casilla">
            <input type="checkbox" checked={gustos.activo} onChange={(e) => gustos.onCambiar(e.target.checked)} /> Usar mis «Me gusta» como referencia de estilo
          </label>
          {gustos.activo && (
            <p className="hint">
              {gustos.van ? `Van ${gustos.van === 1 ? "la última" : `las ${gustos.van} últimas`} que te gustaron, sólo por su estilo.` : "No queda hueco de referencia en este modelo: quita alguna para que vayan."}
            </p>
          )}
        </div>
      )}
      {puedeLogo && (
        <label className="est-logo-casilla">
          <input type="checkbox" checked={conLogo} onChange={(e) => onConLogo(e.target.checked)} /> Poner el logo de la marca como referencia
        </label>
      )}
      {estampa && (
        <label className="est-logo-casilla">
          <input type="checkbox" checked={conLogo} onChange={(e) => onConLogo(e.target.checked)} /> Estampar el logo encima al terminar (el original, en su esquina)
        </label>
      )}
      {usarKit && kitListo && esVideo && <p className="hint">En video el logo no va de referencia: el video empezaría en él.</p>}
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
 * pieza escogido; si ya hay algo escrito, sobre eso. Cada una con «Usar», que la pone en el pedido con su tipo y las
 * fotos de su producto. Es texto: no gasta en el motor.
 */
function DameIdeas({ ids, generando, lista = [], deTipo = "", conTema = false, onGenerar, onUsar, onCerrar, nombreDeTipo, nombreDeProducto }) {
  // Con un tipo escogido arriba, las ideas son de ese tipo salvo que se pidan variadas.
  const [variadas, setVariadas] = useState(false);
  const soloTipo = Boolean(deTipo) && !variadas;
  return (
    <div className="est-ideas">
      <div className="est-acciones-idea">
        <button type="button" className="btn btn-secondary btn-sm" disabled={generando} onClick={() => onGenerar(soloTipo && deTipo ? deTipo : "")}>
          <Icon name="sparkles" size={14} /> {generando ? "Pensando ideas…" : lista.length ? "Otras ideas" : "Dame ideas"}
        </button>
        {deTipo && (
          <label className="est-logo-casilla">
            <input type="checkbox" checked={variadas} onChange={(e) => setVariadas(e.target.checked)} /> Variadas (no sólo «{nombreDeTipo(deTipo)}»)
          </label>
        )}
        {lista.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Cerrar las ideas</button>}
        <p className="hint" style={{ margin: 0, flexBasis: "100%" }}>
          {conTema ? "Sobre lo que escribiste arriba. " : ""}{soloTipo && deTipo ? "Todas de ese tipo de pieza" : "Variadas: cada una de un tipo de contenido distinto"}, con el catálogo y el cerebro. No crea nada todavía.
        </p>
      </div>
      {lista.length > 0 && (
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
      )}
      <span id={`${ids}-ideas-usar`} className="sr-only">La pone en el pedido con su tipo de pieza y las fotos de su producto.</span>
    </div>
  );
}

/**
 * «Mejorar idea»: la IA devuelve la idea más clara y sencilla en el mismo campo, y
 * «Volver a mi idea» la deshace.
 */
function MejorarIdea({ mejorando, onMejorar, onVolverIdea, mejorarSolo = null }) {
  return (
    <div className="est-mejorar">
      <button type="button" className="btn btn-accent btn-sm" disabled={mejorando} onClick={onMejorar}>
        <Icon name="wand" size={16} /> {mejorando ? "Mejorando la idea…" : "Mejorar idea"}
      </button>
      {onVolverIdea && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={mejorando} onClick={onVolverIdea}>
          Volver a mi idea
        </button>
      )}
      <p className="hint">La reescribe más clara y sencilla para que la IA la entienda. No crea nada todavía.</p>
      {mejorarSolo && (
        <label className="est-logo-casilla">
          <input type="checkbox" checked={mejorarSolo.activo} onChange={(e) => mejorarSolo.onCambiar(e.target.checked)} /> Mejorarla sola al abrir desde una publicación
        </label>
      )}
    </div>
  );
}

export default function Compositor({
  ids, form, setForm, modelo, motores, costo, confirmando, enviando, subiendo,
  onEnviar, onConfirmar, onNo, onModelo, onTipo, onQuitarMedio, onMarcarReferencia, onSubirArchivos, onDrive = null, onGaleria = null, promptRef, etiquetaPrompt = "¿Qué quieres crear?",
  nombrado = null,
  mejorando = false, onMejorar = null, onVolverIdea = null, mejorarSolo = null,
  estilo = null,
  guionCorto = null,
  fijado = "", onFijar = null,
  ideas = null, guiados = [], onGuiado = null,
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
      <QueCrear actual={form.tipo} guiados={guiados} onCambiar={(t) => (TIPOS.some(([x]) => x === t) ? onTipo(t) : onGuiado?.(t))} />

      {estilo && <TipoDePieza ids={ids} preset={estilo.preset} onPreset={estilo.onPreset} kit={estilo.kit} sinIdea={estilo.sinIdea} />}

      <div className="field">
        <label className="label" htmlFor={`${ids}-p`}>{etiquetaPrompt}</label>
        <textarea
          id={`${ids}-p`} ref={promptRef} className="input est-prompt-campo" rows={4} maxLength={MAX_PROMPT}
          placeholder={esVideo
            ? "El sofá gira despacio mientras la luz de la tarde cruza la sala; cámara fija, sin texto…"
            : "Una taza de café humeante sobre una mesa de madera, luz de la mañana, estilo fotografía de producto…"}
          value={form.prompt}
          onChange={(e) => { onNo(); setForm({ ...form, prompt: e.target.value }); }}
        />
        <p className="hint">Sin texto dentro {esVideo ? "del video" : "de la imagen"}, salvo que lo pidas. {form.prompt.length > 3500 ? `${form.prompt.length} de ${MAX_PROMPT} caracteres.` : ""}</p>
      </div>

      {ideas && <DameIdeas ids={ids} {...ideas} />}

      {onMejorar && <MejorarIdea mejorando={mejorando} onMejorar={onMejorar} onVolverIdea={onVolverIdea} mejorarSolo={mejorarSolo} />}

      {esVideo && guionCorto && <Suspense fallback={null}><GuionCorto {...guionCorto} /></Suspense>}

      {estilo && <EstiloDeMarca ids={ids} esVideo={esVideo} {...estilo} />}

      <div className="est-fila">
        <div className="field">
          <label className="label" htmlFor={`${ids}-m`}>Modelo</label>
          <select id={`${ids}-m`} className="input" value={form.modelo} onChange={(e) => onModelo(e.target.value)}>
            {/* Sólo los que se pueden pedir: los de un proveedor sin llave (Higgsfield, fal…) no salen. Si el
                escogido no tiene llave, Estudio.jsx lo cambia al preferido. */}
            {modelosParaLista(form.tipo, { orden, creador, activos, seleccionado: form.modelo }).filter((m) => activo(m) || m.motor === "prueba").map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}{m.motor === "prueba" ? "" : ` · ${NOMBRE_MOTOR[m.motor] ?? m.motor}`} · {etiquetaDeCosto(m)}
              </option>
            ))}
          </select>
        </div>
        {Object.entries(modelo.ajustes).map(([nombre, def]) => (
          <div className="field" key={nombre}>
            <label className="label" htmlFor={`${ids}-a-${nombre}`}>{ETIQUETA_AJUSTE[nombre] ?? nombre}</label>
            <select id={`${ids}-a-${nombre}`} className="input" value={form.ajustes[nombre]} onChange={(e) => cambiarAjuste(nombre, e.target.value)}>
              {def.valores.map((v) => (
                <option key={v} value={v}>{nombre === "aspectRatio" ? `${NOMBRE_PROPORCION[v] ?? v} (${v})` : valorDeAjuste(nombre, v)}</option>
              ))}
            </select>
          </div>
        ))}
        <div className="field">
          <label className="label" htmlFor={`${ids}-n`}>Cuántos</label>
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

      {modelo.video > 0 && (
        <Ranura ids={ids} rol="video" titulo="Video de referencia" max={1} archivos={medios.video ?? []} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
          ayuda={modelo.inicial
            ? "El movimiento de este video pasa a tu imagen inicial (MP4, MOV o WebM, hasta 50 MB)."
            : "El modelo sigue sus planos, su ritmo y su movimiento con tu marca (MP4, MOV o WebM, hasta 50 MB). Puede ser el de la competencia."} />
      )}
      {modelo.necesitaImagen && (
        <p className="notice notice-warn est-necesita" role="note">
          {modelo.nombre} no crea desde texto solo: necesita {conInicial ? "una imagen inicial" : "al menos una imagen de referencia"}.
        </p>
      )}
      {conInicial && (
        <Ranura ids={ids} rol="start" titulo="Imagen inicial" max={1} archivos={medios.start} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
          ayuda="El video arranca de esta imagen. También puedes usar «Animar» en cualquiera de la galería." />
      )}
      {conFinal && (
        <Ranura ids={ids} rol="end" titulo="Imagen final" max={1} archivos={medios.end} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
          ayuda="Opcional: el video termina en esta imagen." />
      )}
      {modelo.referencias > 0 ? (
        <Referencias ids={ids} max={modelo.referencias} archivos={medios.reference} subiendo={subiendo} onQuitar={onQuitarMedio} onSubir={abrirSubida} onDrive={onDrive} onGaleria={onGaleria}
          onMarcar={onMarcarReferencia} nombrado={nombrado} />
      ) : !conInicial && (
        <p className="hint">{modelo.nombre} no admite imágenes de referencia.</p>
      )}
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" multiple className="est-archivo" tabIndex={-1} aria-hidden="true" onChange={alElegir} />

      <div className="est-pie-compositor">
        <p className="est-costo">
          Costo: <strong>{textoCosto(costo)}</strong>
          {esVideo && costo > 0 ? ` · ${segundos} s × ${form.n} × ${textoCosto(costoUnitario(modelo, form.ajustes)).replace("≈ ", "")}/s` : ""}
          {modelo.estimado && costo > 0 ? " · precio aproximado" : ""}
        </p>
        {confirmando != null ? (
          <div className="est-confirmar" role="alert">
            <span>Este pedido cuesta <strong>{textoCosto(confirmando)}</strong>. ¿Seguimos?</span>
            <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => onConfirmar()}>Sí, crear</button>
            <button type="button" className="btn btn-ghost" onClick={onNo}>No</button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={enviando || !activo(modelo)}>
            <Icon name={esVideo ? "video" : "sparkles"} size={18} /> {enviando ? "Pidiendo…" : `Crear ${nombreDeTipo}`}
          </button>
        )}
      </div>
    </form>
  );
}
