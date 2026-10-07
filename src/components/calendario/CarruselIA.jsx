import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { mediosDe } from "../../lib/publicacion";
import { presetDePilar } from "../../lib/pilares";
import { textoPreset, limpiarKit } from "../../lib/kitMarca";
import { textoCosto, CONFIRMAR_DESDE } from "../../lib/estudioCatalogo";
import * as api from "../../lib/estudio";
import { partirGuion, MODOS_TEXTO, PLANTILLAS_TEXTO, MAX_LAMINAS, coloresPlantilla, costoCarrusel } from "../../lib/carrusel";
import { crearCarrusel, crearLamina, modelosParaCarrusel } from "../../lib/carruselEstudio";
import "./RevisionMes.css";
import "./CarruselIA.css";

// ============================================================
// «Crear carrusel con IA»: el guion partido en láminas, una a una
//
// Cada lámina lleva de referencia la anterior y la portada (la serie se
// ve igual de principio a fin), las fotos del producto y el logo si
// caben. El texto lo pone la IA o una plantilla con los colores del kit
// (exacto). Se puede editar el texto de cada lámina antes de pedir y
// rehacer una sola después. Nada se pone en la publicación sin un botón.
// ============================================================

const ROL = { portada: "Portada", contenido: "Contenido", cierre: "Cierre" };
const renumerar = (lista) => lista.map((l, i) => ({ ...l, n: i + 1, rol: i === 0 ? "portada" : l.rol === "portada" ? "contenido" : l.rol }));

export default function CarruselIA({ client, post, cal = null, onPoner, onCerrar }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [estudio, setEstudio] = useState(null); // { kit, productos, activos }
  const [laminas, setLaminas] = useState(() => partirGuion(post.guion));
  const [modo, setModo] = useState("ia");
  const [plantilla, setPlantilla] = useState("banda");
  const [modeloId, setModeloId] = useState("");
  const [paso, setPaso] = useState("elegir"); // elegir | confirmar | creando | listo
  const [resultados, setResultados] = useState([]); // por lámina: { crudo, final } | { error } | { cargando }
  const [aviso, setAviso] = useState(null);
  const vivo = useRef(true);
  const creando = paso === "creando" || resultados.some((r) => r?.cargando);
  const ref = useDialogA11y(() => { if (!creando) onCerrar(); });

  useEffect(() => {
    vivo.current = true;
    Promise.all([api.leerEstudio(clienteId), api.leerMotores()])
      .then(([g, m]) => setEstudio({
        kit: limpiarKit(g.kit), productos: g.productos ?? [],
        activos: Object.fromEntries(Object.entries(m.motores ?? {}).map(([k, v]) => [k, v.activo])),
      }))
      .catch((e) => setAviso({ ok: false, texto: e.message }));
    return () => { vivo.current = false; };
  }, [clienteId]);

  const modelos = useMemo(() => (estudio ? modelosParaCarrusel(estudio.activos) : []), [estudio]);
  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos[0] ?? null;
  const total = costoCarrusel(laminas, modelo?.costo);

  /** Lo común a todas las láminas: el estilo de la marca, las fotos del producto, el logo, los colores. */
  const comun = () => ({
    clienteId, modelo, modo, plantilla, idea: post.idea || post.title || "",
    preset: textoPreset(estudio.kit, presetDePilar(post.pilar) || "producto", { marca: client.name, rubro: client.industry ?? "" }),
    fotos: api.fotosDelProducto(estudio.productos, post.productoId).map((f) => f.clave),
    logo: estudio.kit.logo, colores: coloresPlantilla(estudio.kit), familia: estudio.kit.tipografia,
    calendarId: cal ? cal.dbId || cal.id : null, postId: post.id ?? null, seguir: () => vivo.current,
  });

  const crear = async () => {
    setPaso("creando");
    setAviso(null);
    setResultados(laminas.map(() => ({ cargando: true })));
    const salida = await crearCarrusel({
      ...comun(), laminas,
      alAvanzar: (i, r) => { if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? r : y))); },
    });
    if (!vivo.current) return;
    setResultados(laminas.map((_, i) => salida[i] ?? { error: "No se pidió." }));
    setPaso("listo");
    window.dispatchEvent(new Event("ia:gasto"));
    const bien = salida.filter((r) => r?.final).length;
    setAviso({ ok: bien > 0, texto: bien === laminas.length ? "Listas. Revisa cada lámina; rehaz la que no te guste." : `Salieron ${bien} de ${laminas.length}. Rehaz las que fallaron.` });
  };

  /** Rehacer una sola: con la de antes de referencia (o, si es la portada, la siguiente) para no romper la serie. */
  const rehacer = async (i) => {
    setResultados((x) => x.map((y, j) => (j === i ? { cargando: true } : y)));
    const vecina = i > 0 ? resultados[i - 1]?.crudo : resultados[1]?.crudo;
    try {
      const r = await crearLamina({ ...comun(), lamina: laminas[i], total: laminas.length, anterior: vecina ?? null, portada: i > 1 ? resultados[0]?.crudo ?? null : null });
      if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? r : y)));
    } catch (e) {
      if (vivo.current) setResultados((x) => x.map((y, j) => (j === i ? { error: e.message } : y)));
    }
    window.dispatchEvent(new Event("ia:gasto"));
  };

  const finales = resultados.map((r) => r?.final).filter(Boolean);
  const yaTiene = mediosDe(post).length > 0;
  const poner = (reemplazar) => { onPoner(finales, { reemplazar }); onCerrar(); };

  const cambiarTexto = (i, texto) => setLaminas((l) => l.map((x, j) => (j === i ? { ...x, texto } : x)));
  const quitar = (i) => { setLaminas((l) => renumerar(l.filter((_, j) => j !== i))); setResultados((r) => r.filter((_, j) => j !== i)); };
  const anadir = () => setLaminas((l) => renumerar([...l, { n: l.length + 1, rol: "contenido", texto: "" }]));
  const listas = laminas.length >= 2 && laminas.every((l) => l.texto.trim());

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes carrusel-ia" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Crear carrusel con IA</h2>
            <p className="hint" style={{ margin: 0 }}>Una lámina a la vez, cada una con la anterior de referencia: el mismo estilo de principio a fin.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={creando} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
          {!estudio && !aviso && <p className="hint">Cargando…</p>}

          {estudio && paso === "elegir" && (
            <div className="carrusel-opciones">
              {!laminas.length && <p className="notice notice-warn" style={{ display: "block" }}>Este carrusel no tiene guion. Escríbelo en «Idea» (una lámina por línea con «Portada:», «Slide 1:»…) o añade las láminas aquí.</p>}
              <div className="produccion-filtro" role="group" aria-label="Quién escribe el texto">
                <span className="hint">Texto</span>
                {Object.entries(MODOS_TEXTO).map(([k, v]) => (
                  <button key={k} type="button" className="filter-chip" aria-pressed={modo === k} onClick={() => setModo(k)}>{v.nombre}</button>
                ))}
              </div>
              <p className="hint" style={{ margin: 0 }}>{MODOS_TEXTO[modo].ayuda}</p>
              {modo === "plantilla" && (
                <div className="produccion-filtro" role="group" aria-label="Dónde va el texto">
                  <span className="hint">Plantilla</span>
                  {Object.entries(PLANTILLAS_TEXTO).map(([k, v]) => (
                    <button key={k} type="button" className="filter-chip" aria-pressed={plantilla === k} onClick={() => setPlantilla(k)}>{v.nombre}</button>
                  ))}
                </div>
              )}
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor={`${ids}-modelo`}>Modelo</label>
                <select id={`${ids}-modelo`} className="input" value={modelo?.id ?? ""} onChange={(e) => setModeloId(e.target.value)}>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${textoCosto(m.costo)} por lámina`}</option>)}
                </select>
              </div>
              {api.fotosDelProducto(estudio.productos, post.productoId).length > 0 && (
                <p className="hint" style={{ margin: 0 }}><Icon name="check" size={12} /> Van de referencia las fotos de «{post.producto}» del catálogo.</p>
              )}
            </div>
          )}

          <ol className="carrusel-laminas">
            {laminas.map((l, i) => {
              const r = resultados[i];
              return (
                <li key={i} className="revision-item carrusel-lamina">
                  <div className="carrusel-lamina-vista">
                    {r?.final ? <img src={r.final.src} alt={`Lámina ${l.n}`} loading="lazy" />
                      : <span className="hint">{r?.cargando ? "Creando…" : r?.error ? "Falló" : l.n}</span>}
                  </div>
                  <div className="carrusel-lamina-texto">
                    <strong>{l.n}. {ROL[l.rol]}</strong>
                    {paso === "elegir" ? (
                      <textarea className="textarea" rows={2} maxLength={400} value={l.texto} aria-label={`Texto de la lámina ${l.n}`} onChange={(e) => cambiarTexto(i, e.target.value)} />
                    ) : <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{l.texto}</p>}
                    {r?.error && <p className="revision-problema">{r.error}</p>}
                    <div className="carrusel-lamina-acciones">
                      {paso === "elegir" && laminas.length > 1 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(i)}><Icon name="trash" size={14} /> Quitar</button>
                      )}
                      {paso === "listo" && !r?.cargando && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => rehacer(i)} disabled={creando}>
                          <Icon name="refresh" size={14} /> {r?.error ? "Intentar otra vez" : "Rehacer esta"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {paso === "elegir" && laminas.length < MAX_LAMINAS && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={anadir}><Icon name="plus" size={14} /> Añadir lámina</button>
          )}
        </div>
        <div className="sheet-footer">
          {paso === "listo" ? (
            <>
              <span className="hint" style={{ flex: 1 }}>{finales.length} de {laminas.length} listas · todas quedan en la galería</span>
              {yaTiene && <button type="button" className="btn btn-secondary" disabled={!finales.length || creando} onClick={() => poner(false)}>Añadir al final</button>}
              <button type="button" className="btn btn-primary" disabled={!finales.length || creando} onClick={() => poner(true)}>
                {yaTiene ? "Reemplazar lo que hay" : `Poner las ${finales.length} en la publicación`}
              </button>
            </>
          ) : paso === "confirmar" ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setPaso("elegir")}>No</button>
              <button type="button" className="btn btn-primary" onClick={crear}>Sí, crear {laminas.length} láminas por {textoCosto(total)}</button>
            </>
          ) : (
            <>
              <span className="hint" style={{ flex: 1 }}>
                {paso === "creando"
                  ? `Creando lámina ${Math.min(resultados.filter((r) => r && !r.cargando).length + 1, laminas.length)} de ${laminas.length}… no cierres esta ventana`
                  : `${laminas.length} láminas · ${textoCosto(total)} (aproximado)${modelo?.motor === "prueba" ? " · motor de prueba: tarjetas, no imágenes" : ""}`}
              </span>
              <button type="button" className="btn btn-primary" disabled={!estudio || !modelo || !listas || creando}
                onClick={() => (total >= CONFIRMAR_DESDE ? setPaso("confirmar") : crear())}>
                <Icon name="sparkles" size={16} /> {creando ? "Creando…" : `Crear ${laminas.length} láminas`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
