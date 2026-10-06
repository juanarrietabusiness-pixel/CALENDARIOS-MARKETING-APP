import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { leerEstudio, subirImagen } from "../lib/estudio";
import { conAlfa, textoSobre } from "../lib/colores";
import { ICONOS_DESTACADO, LIMITES_PERFIL } from "../lib/auditoria";
import {
  PORTADA, FOTO, RADIO_SEGURO, ESTILOS_PORTADA, coloresDePortada, aclarar, cubrir, logoEnFoto, nombreDePortada,
} from "../lib/portadas";
import "./PiezasPerfil.css";

// ============================================================
// Las piezas del perfil, por plantilla (desde una auditoría)
//
// Portadas de destacados (1080 × 1920, lo importante dentro del círculo del
// centro) en seis estilos con la paleta del kit de marca, y la foto de
// perfil con el logo original. Se dibujan aquí, en un lienzo: uniformes y
// sin gastar en IA. Se descargan o se guardan en la galería del Estudio
// para subirlas a mano a Instagram, que no deja cambiarlas por la API.
// Lo puro (estilos, colores, medidas) está en lib/portadas.js.
// ============================================================

/**
 * Un icono del set como imagen (SVG), del color y grosor pedidos. El SVG se toma de los iconos pintados (ocultos)
 * en el propio diálogo: es el mismo dibujo que en la aplicación, sin otra copia de los trazos.
 */
function iconoComoImagen(contenedor, nombre, color, grosor = 1.6) {
  const svg = contenedor?.querySelector(`[data-icono="${nombre}"] svg`);
  if (!svg) return Promise.reject(new Error("No se encontró el icono."));
  const marcado = svg.outerHTML
    .replace(/currentColor/g, color)
    .replace(/stroke-width="[^"]*"/, `stroke-width="${grosor}"`);
  return cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(marcado)}`);
}

function cargarImagen(src) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("No se pudo cargar la imagen."));
    img.src = src;
  });
}

const circulo = (ctx, cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); };

/** Dibuja una portada en un lienzo de 1080 × 1920. */
async function dibujarPortada(lienzo, { estilo, colores, icono, fondo, iconos }) {
  const { ancho: W, alto: H } = PORTADA;
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext("2d");
  const cx = W / 2;
  const cy = H / 2;
  const degradado = () => { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, colores.principal); g.addColorStop(1, colores.acento); return g; };
  let colorIcono = colores.icono;

  if (estilo === "solido") {
    ctx.fillStyle = colores.principal;
    ctx.fillRect(0, 0, W, H);
  } else if (estilo === "contorno") {
    ctx.fillStyle = colores.principal;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = colores.acento;
    ctx.lineWidth = 12;
    circulo(ctx, cx, cy, RADIO_SEGURO - 70);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = conAlfa(colores.acento, 0.6);
    circulo(ctx, cx, cy, RADIO_SEGURO - 30);
    ctx.stroke();
    colorIcono = colores.acento;
  } else if (estilo === "cristal") {
    ctx.fillStyle = degradado();
    ctx.fillRect(0, 0, W, H);
    const brillo = ctx.createRadialGradient(cx - 120, cy - 160, 20, cx, cy, RADIO_SEGURO);
    brillo.addColorStop(0, "rgba(255, 255, 255, 0.32)");
    brillo.addColorStop(1, "rgba(255, 255, 255, 0.08)");
    ctx.fillStyle = brillo;
    circulo(ctx, cx, cy, RADIO_SEGURO - 60);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 5;
    ctx.stroke();
    colorIcono = "#FFFFFF";
  } else if (estilo === "sello") {
    ctx.fillStyle = aclarar(colores.principal, 0.88);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colores.principal;
    circulo(ctx, cx, cy, RADIO_SEGURO - 50);
    ctx.fill();
    ctx.strokeStyle = colores.acento;
    ctx.lineWidth = 8;
    circulo(ctx, cx, cy, RADIO_SEGURO - 90);
    ctx.stroke();
    colorIcono = textoSobre(colores.principal);
  } else if (estilo === "foto" && fondo) {
    const r = cubrir(fondo.naturalWidth, fondo.naturalHeight, W, H);
    ctx.drawImage(fondo, r.x, r.y, r.w, r.h);
    ctx.fillStyle = conAlfa(colores.principal, 0.45);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 6;
    circulo(ctx, cx, cy, RADIO_SEGURO - 60);
    ctx.stroke();
    colorIcono = "#FFFFFF";
  } else {
    // «degradado» (y «foto» sin imagen elegida todavía).
    ctx.fillStyle = degradado();
    ctx.fillRect(0, 0, W, H);
    colorIcono = textoSobre(colores.principal);
  }

  const img = await iconoComoImagen(iconos, icono, colorIcono, estilo === "contorno" ? 1.4 : 1.6);
  const lado = 380;
  ctx.drawImage(img, cx - lado / 2, cy - lado / 2, lado, lado);
}

/** Dibuja la foto de perfil (1080 × 1080) con el logo. */
async function dibujarFoto(lienzo, { fondo, colores, logo }) {
  const L = FOTO.lado;
  lienzo.width = L;
  lienzo.height = L;
  const ctx = lienzo.getContext("2d");
  if (fondo === "degradado") {
    const g = ctx.createLinearGradient(0, 0, L, L);
    g.addColorStop(0, colores.principal);
    g.addColorStop(1, colores.acento);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = fondo === "principal" ? colores.principal : fondo === "acento" ? colores.acento : "#FFFFFF";
  }
  ctx.fillRect(0, 0, L, L);
  if (logo) {
    const r = logoEnFoto(logo.naturalWidth, logo.naturalHeight);
    ctx.drawImage(logo, r.x, r.y, r.w, r.h);
  }
}

const aBlob = (lienzo) => new Promise((ok) => lienzo.toBlob(ok, "image/png"));

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Una pieza pintada: el lienzo (escondido) y su vista en círculo, como la enseña Instagram. */
function Pieza({ dibujar, deps, nombre, etiqueta, onLista }) {
  const lienzo = useRef(null);
  const [vista, setVista] = useState("");
  const [fallo, setFallo] = useState("");
  useEffect(() => {
    let vivo = true;
    dibujar(lienzo.current)
      .then(() => { if (vivo) { setVista(lienzo.current.toDataURL("image/png")); setFallo(""); onLista?.(nombre, lienzo.current); } })
      .catch((e) => { if (vivo) setFallo(e.message); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <figure className="piezas-pieza">
      <canvas ref={lienzo} hidden />
      <span className="piezas-circulo">{vista ? <img src={vista} alt={etiqueta} /> : <Icon name="image" size={20} />}</span>
      {fallo && <figcaption role="alert" className="hint">{fallo}</figcaption>}
    </figure>
  );
}

export default function PiezasPerfil({ clientId, destacados = [], inicial = "destacados", onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [tab, setTab] = useState(inicial === "foto" ? "foto" : "destacados");
  const [kit, setKit] = useState(null);
  const [galeria, setGaleria] = useState([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [estilo, setEstilo] = useState("degradado");
  const [elegidos, setElegidos] = useState({});
  const [lista, setLista] = useState(() => (destacados.length ? destacados : [{ titulo: "Destacado", icono: "star" }]).map((d) => ({ titulo: d.titulo, icono: d.icono || "star" })));
  const [fondoId, setFondoId] = useState("");
  const [fondoImg, setFondoImg] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [fondoFoto, setFondoFoto] = useState("blanco");
  const lienzos = useRef(new Map());
  const iconos = useRef(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    leerEstudio(clientId).then((d) => {
      setKit(d.kit ?? {});
      setGaleria((d.archivos ?? []).filter((a) => a.tipo === "imagen" && !a.borrado && /^image\/(png|jpeg|webp)$/.test(a.mime ?? "")));
    }).catch((e) => setError(e.message));
  }, [clientId]);

  // El logo original del kit, para la foto de perfil.
  useEffect(() => {
    if (!kit?.logo) return;
    cargarImagen(`/api/media/${kit.logo}`).then(setLogoImg).catch(() => setAviso("No se pudo cargar el logo del kit."));
  }, [kit?.logo]);

  useEffect(() => {
    const a = galeria.find((x) => x.id === fondoId);
    if (!a) { setFondoImg(null); return; }
    cargarImagen(a.src ?? `/api/media/${a.clave}`).then(setFondoImg).catch(() => setFondoImg(null));
  }, [fondoId, galeria]);

  const paleta = kit?.paleta ?? [];
  const colores = coloresDePortada(paleta, elegidos);
  const guardarLienzo = useCallback((nombre, lienzo) => { lienzos.current.set(nombre, lienzo); }, []);

  const exportar = async (nombres, enGaleria) => {
    setOcupado(true);
    setAviso("");
    try {
      let n = 0;
      for (const nombre of nombres) {
        const lienzo = lienzos.current.get(nombre);
        if (!lienzo) continue;
        const blob = await aBlob(lienzo);
        if (enGaleria) await subirImagen(clientId, new File([blob], nombre, { type: "image/png" }));
        else descargar(blob, nombre);
        n++;
      }
      setAviso(enGaleria ? `${n} ${n === 1 ? "pieza guardada" : "piezas guardadas"} en la galería del Estudio.` : `${n} ${n === 1 ? "pieza descargada" : "piezas descargadas"}.`);
    } catch (e) {
      setAviso(e.message);
    }
    setOcupado(false);
  };

  const nombresPortadas = lista.map((d, i) => nombreDePortada(d.titulo, i));
  const sinLogo = !kit?.logo;

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet piezas-dialogo">
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Piezas del perfil</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          {/* Los iconos de las portadas, pintados y ocultos: de aquí se toma su SVG para dibujarlos en el lienzo. */}
          <div ref={iconos} hidden aria-hidden="true">
            {ICONOS_DESTACADO.map((n) => <span key={n} data-icono={n}><Icon name={n} size={240} /></span>)}
          </div>
          <div className="segmented" role="tablist" aria-label="Qué pieza" style={{ marginBottom: "var(--sp-3)" }}>
            {[["destacados", "Portadas de destacados"], ["foto", "Foto de perfil"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`segmented-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {error && <p role="alert" className="notice notice-error">{error}</p>}
          {!kit && !error && <p role="status" className="hint">Cargando el kit de marca…</p>}
          {kit && !paleta.length && <p className="notice">Este cliente no tiene paleta en su kit de marca (Estudio → Kit de marca): se usan colores de prueba.</p>}

          {kit && (
            <fieldset className="piezas-colores">
              <legend className="label">Colores (del kit de marca)</legend>
              {[["principal", "Principal"], ["acento", "Acento"]].map(([k, l]) => (
                <div key={k} className="piezas-color">
                  <span className="hint">{l}</span>
                  <div role="group" aria-label={`Color ${l.toLowerCase()}`} className="piezas-muestras">
                    {(paleta.length ? paleta.map((c) => c.hex) : [colores[k]]).map((hex) => (
                      <button key={hex} type="button" className="piezas-muestra" style={{ background: hex }} aria-pressed={colores[k].toUpperCase() === hex.toUpperCase()}
                        aria-label={`${l}: ${hex}`} onClick={() => setElegidos((e) => ({ ...e, [k]: hex }))} />
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          {kit && tab === "destacados" && (
            <>
              <div role="group" aria-label="Estilo de las portadas" className="piezas-estilos">
                {ESTILOS_PORTADA.map((e) => (
                  <button key={e.id} type="button" className="filter-chip" aria-pressed={estilo === e.id} title={e.ayuda} onClick={() => setEstilo(e.id)}>{e.nombre}</button>
                ))}
              </div>
              <p className="hint">{ESTILOS_PORTADA.find((e) => e.id === estilo)?.ayuda}</p>
              {estilo === "foto" && (
                <div className="field">
                  <label className="label" htmlFor={`${ids}-fondo`}>Imagen de fondo (de la galería del Estudio)</label>
                  <select id={`${ids}-fondo`} className="input" value={fondoId} onChange={(e) => setFondoId(e.target.value)}>
                    <option value="">{galeria.length ? "Escoge una imagen" : "La galería no tiene imágenes: crea un fondo en el Estudio"}</option>
                    {galeria.map((a) => <option key={a.id} value={a.id}>{(a.prompt || a.nombre || a.id).slice(0, 60)}</option>)}
                  </select>
                </div>
              )}
              <ul className="piezas-lista">
                {lista.map((d, i) => (
                  <li key={i} className="piezas-item">
                    <Pieza
                      nombre={nombresPortadas[i]}
                      etiqueta={`Portada de «${d.titulo}»`}
                      onLista={guardarLienzo}
                      deps={[estilo, colores.principal, colores.acento, colores.icono, d.icono, fondoImg]}
                      dibujar={(lienzo) => dibujarPortada(lienzo, { estilo, colores, icono: d.icono, fondo: fondoImg, iconos: iconos.current })}
                    />
                    <div className="piezas-campos">
                      <label className="label" htmlFor={`${ids}-t${i}`}>Título (en Instagram)</label>
                      <input id={`${ids}-t${i}`} className="input" maxLength={LIMITES_PERFIL.tituloDestacado} value={d.titulo}
                        onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                      <label className="label" htmlFor={`${ids}-i${i}`}>Icono</label>
                      <select id={`${ids}-i${i}`} className="input" value={d.icono} onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? { ...x, icono: e.target.value } : x)))}>
                        {ICONOS_DESTACADO.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLista((l) => [...l, { titulo: "Nuevo", icono: "star" }])} disabled={lista.length >= 12}>
                <Icon name="plus" size={14} /> Añadir destacado
              </button>
            </>
          )}

          {kit && tab === "foto" && (
            <>
              {sinLogo && <p className="notice">El kit de marca no tiene logo: en el Estudio, abre la imagen del logo original y pulsa «Usar como logo».</p>}
              <div role="group" aria-label="Fondo de la foto" className="piezas-estilos">
                {[["blanco", "Blanco"], ["principal", "Color principal"], ["acento", "Acento"], ["degradado", "Degradado"]].map(([k, l]) => (
                  <button key={k} type="button" className="filter-chip" aria-pressed={fondoFoto === k} onClick={() => setFondoFoto(k)}>{l}</button>
                ))}
              </div>
              <p className="hint">El logo ocupa como mucho el 62 % del círculo: en pequeño, lo que toca el borde se pierde.</p>
              <ul className="piezas-lista">
                <li className="piezas-item">
                  <Pieza nombre="foto-de-perfil.png" etiqueta="Foto de perfil" onLista={guardarLienzo}
                    deps={[fondoFoto, colores.principal, colores.acento, logoImg]}
                    dibujar={(lienzo) => dibujarFoto(lienzo, { fondo: fondoFoto, colores, logo: logoImg })} />
                </li>
              </ul>
            </>
          )}

          <div aria-live="polite">{aviso && <p role="status" className="hint" style={{ color: "var(--accent)" }}>{aviso}</p>}</div>
        </div>
        {kit && (
          <div className="sheet-footer" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => exportar(tab === "foto" ? ["foto-de-perfil.png"] : nombresPortadas, false)}>
              <Icon name="download" size={16} /> {tab === "foto" ? "Descargar" : "Descargar todas"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => exportar(tab === "foto" ? ["foto-de-perfil.png"] : nombresPortadas, true)}>
              <Icon name="upload" size={16} /> Guardar en la galería
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
