import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { presetDePilar, nombreDePilar } from "../../lib/pilares";
import { textoPreset, componerPedido, ponerLogo, limpiarKit } from "../../lib/kitMarca";
import { modeloPorDefecto, validarPedido, ajustesDe, textoCosto, CONFIRMAR_DESDE } from "../../lib/estudioCatalogo";
import * as api from "../../lib/estudio";
import "./RevisionMes.css";

// ============================================================
// «Producir el mes con IA»: las piezas que faltan, de una vez
//
// Las publicaciones del mes que todavía no tienen contenido se piden al
// Estudio en lote, cada una con el estilo de la marca que le va a su tipo
// de contenido (el preset del kit) y su idea, en la proporción de su
// formato, y con el logo de referencia cuando el modelo lo admite. Antes
// de gastar se ve el costo total; nada se pide sin confirmar.
//
// Lo que llega NO se pone solo: se ve al lado de su publicación y se pone
// con un botón (o «Poner todas»). Todo queda además en la galería del
// cliente, como lo creado en el Estudio. Los reels van desmarcados: un
// video cuesta mucho más que una imagen y muchos se graban.
// ============================================================

const TERMINADO = new Set(["hecho", "fallido", "cancelado"]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

/** El tipo de pieza que le toca a un formato: un reel o un directo es video; lo demás, imagen. */
const tipoDe = (format) => (format === "reel" || format === "live" ? "video" : "imagen");
const proporcionDe = (format, tipo) => (format === "reel" || format === "historia" || tipo === "video" ? "9:16" : "4:5");

export default function ProducirMes({ client, cal, onPoner, onClose }) {
  const ids = useId();
  const [estudio, setEstudio] = useState(null); // { kit, motores }
  const [marcadas, setMarcadas] = useState(null); // Set de ids de publicación
  const [trabajos, setTrabajos] = useState([]); // [{ postId, date, id, estado, error }]
  const [piezas, setPiezas] = useState({}); // postId → archivo
  const [puestas, setPuestas] = useState(new Set());
  const [paso, setPaso] = useState("elegir"); // elegir | confirmar | creando | listo
  const [aviso, setAviso] = useState(null);
  const vivo = useRef(true);
  const creando = paso === "creando";
  // Mientras se piden y avanzan los trabajos, cerrar los dejaría a medias (el cron los termina igual, pero sin ponerlos).
  const ref = useDialogA11y(() => { if (!creando) onClose(); });
  const clienteId = client?.dbId || client?.id;

  useEffect(() => {
    vivo.current = true;
    Promise.all([api.leerEstudio(clienteId), api.leerMotores()])
      .then(([g, m]) => setEstudio({ kit: limpiarKit(g.kit), motores: m.motores ?? {} }))
      .catch((e) => setAviso({ ok: false, texto: e.message }));
    return () => { vivo.current = false; };
  }, [clienteId]);

  const activos = useMemo(() => Object.fromEntries(Object.entries(estudio?.motores ?? {}).map(([k, v]) => [k, v.activo])), [estudio]);

  /** Las publicaciones sin contenido, con lo que se pediría para cada una. */
  const candidatas = useMemo(() => {
    if (!estudio) return [];
    return [...(cal.days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).flatMap((d) => (d.posts ?? [])
      .filter((p) => p.status !== "published" && !mediosDe(p).length && String(p.idea || p.title || p.descripcion || "").trim())
      .map((post) => {
        const tipo = tipoDe(post.format);
        const modelo = modeloPorDefecto(activos, tipo);
        const preset = textoPreset(estudio.kit, presetDePilar(post.pilar) || "producto", { marca: client.name, rubro: client.industry ?? "" });
        const prompt = componerPedido({ idea: api.promptDePublicacion(post), preset, video: tipo === "video" }).slice(0, 4000);
        const referencia = ponerLogo({ kit: estudio.kit, tipo, modelo, referencias: [] }) ? [estudio.kit.logo] : [];
        const medios = referencia.length ? { reference: referencia } : {};
        const ajustes = ajustesDe(modelo, { aspectRatio: proporcionDe(post.format, tipo) }, medios);
        const v = validarPedido({ modelo: modelo.id, prompt, n: 1, ajustes, medios });
        return { date: d.date, post, tipo, modelo, pedido: { modelo: modelo.id, prompt, n: 1, ajustes, medios }, costo: v.ok ? v.pedido.costoEstimado : 0, error: v.ok ? "" : v.error };
      }));
  }, [estudio, cal.days, activos, client.name, client.industry]);

  useEffect(() => {
    if (estudio && marcadas === null) setMarcadas(new Set(candidatas.filter((c) => c.tipo === "imagen" && !c.error).map((c) => c.post.id)));
  }, [estudio, candidatas, marcadas]);

  const elegidas = candidatas.filter((c) => marcadas?.has(c.post.id));
  const total = elegidas.reduce((s, c) => s + c.costo, 0);
  const soloPrueba = elegidas.some((c) => c.modelo.motor === "prueba");

  const crear = async () => {
    setPaso("creando");
    setAviso(null);
    const creados = [];
    for (const c of elegidas) {
      if (!vivo.current) return;
      try {
        const { trabajo } = await api.pedirImagenes(clienteId, { ...c.pedido, confirmado: true, calendarId: cal.dbId || cal.id, postId: c.post.id });
        creados.push({ postId: c.post.id, date: c.date, format: c.post.format, titulo: c.post.title || c.post.idea || "", id: trabajo.id, estado: trabajo.estado, error: "" });
      } catch (e) {
        creados.push({ postId: c.post.id, date: c.date, format: c.post.format, titulo: c.post.title || c.post.idea || "", id: null, estado: "fallido", error: e.message });
        if (e.datos?.codigo === "presupuesto") { setAviso({ ok: false, texto: e.message }); break; }
      }
      setTrabajos([...creados]);
    }
    // Se avanzan desde aquí mientras se mira (el cron los termina igual si se cierra después).
    let pendientes = creados.filter((t) => t.id && !TERMINADO.has(t.estado));
    while (pendientes.length && vivo.current) {
      for (const t of pendientes) {
        try {
          const r = await api.avanzarTrabajo(clienteId, t.id);
          if (r?.trabajo) { t.estado = r.trabajo.estado; t.error = r.trabajo.error || ""; }
        } catch (e) {
          if (e.estado !== 409) { t.estado = "fallido"; t.error = e.message; }
        }
      }
      setTrabajos([...creados]);
      pendientes = creados.filter((t) => t.id && !TERMINADO.has(t.estado));
      if (pendientes.length) await dormir(2500);
    }
    if (!vivo.current) return;
    const g = await api.leerEstudio(clienteId).catch(() => null);
    const porTrabajo = new Map((g?.archivos ?? []).map((a) => [a.trabajoId, a]));
    const salida = {};
    for (const t of creados) if (t.id && porTrabajo.has(t.id)) salida[t.postId] = porTrabajo.get(t.id);
    setPiezas(salida);
    setPaso("listo");
    window.dispatchEvent(new Event("ia:gasto"));
    const n = Object.keys(salida).length;
    setAviso({ ok: n > 0, texto: n ? `Listas ${n} de ${creados.length}. Revisa cada una y ponla en su publicación.` : "No llegó ninguna pieza: mira el motivo de cada una." });
  };

  const poner = (lista) => {
    const porPost = new Map(lista.map(({ postId }) => [postId, piezas[postId]]));
    const ahora = new Date().toISOString();
    // `onPoner` recibe cómo cambiar cada publicación: la que tiene pieza nueva la suma a sus medios.
    onPoner((p) => (porPost.has(p.id)
      ? { ...conMedios(p, [...mediosDe(p), api.medioDeArchivo(porPost.get(p.id))]), mediosCambiadosAt: ahora }
      : p));
    setPuestas((s) => new Set([...s, ...lista.map((x) => x.postId)]));
    for (const { postId } of lista) api.apuntarUso(clienteId, piezas[postId].id, { calendarId: cal.dbId || cal.id, postId }).catch(() => {});
  };
  const porPoner = trabajos.filter((t) => piezas[t.postId] && !puestas.has(t.postId));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes">
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Producir el mes con IA</h2>
            <p className="hint" style={{ margin: 0 }}>Las publicaciones sin contenido, cada una con el estilo de su tipo y su idea. Queda todo en la galería.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={creando} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
          {!estudio && !aviso && <p className="hint">Cargando…</p>}
          {estudio && !candidatas.length && <p className="revision-vacio"><Icon name="checkCircle" size={18} /> Todas las publicaciones con idea ya tienen su contenido.</p>}
          {estudio && !estudio.kit.paleta.length && !estudio.kit.estilo && candidatas.length > 0 && (
            <p className="notice notice-warn" style={{ display: "block" }}>Este cliente no tiene kit de marca: las piezas saldrán sin su paleta ni su estilo. Prepáralo en el Estudio primero.</p>
          )}

          {paso !== "listo" && candidatas.length > 0 && (
            <ul className="revision-lista">
              {candidatas.map((c) => {
                const t = trabajos.find((x) => x.postId === c.post.id);
                return (
                  <li key={c.post.id} className="revision-item">
                    <label className="revision-cabeza cerebro-casilla">
                      <input type="checkbox" disabled={creando || Boolean(c.error)} checked={Boolean(marcadas?.has(c.post.id))}
                        onChange={(e) => setMarcadas((s) => { const n = new Set(s); if (e.target.checked) n.add(c.post.id); else n.delete(c.post.id); return n; })} />
                      <strong>{fechaCorta(c.date)} · {FORMATS[c.post.format]?.label ?? c.post.format}</strong>
                      <span className="hint">{[nombreDePilar(c.post.pilar, c.post.pilarSub), String(c.post.title || c.post.idea || "").slice(0, 60)].filter(Boolean).join(" · ")}</span>
                    </label>
                    <p className="revision-problema">
                      {c.error ? c.error : `${c.tipo === "video" ? "Video" : "Imagen"} con ${c.modelo.nombre} · ${textoCosto(c.costo)}`}
                      {t && ` · ${t.estado === "hecho" ? "lista" : t.estado === "fallido" ? `falló: ${t.error}` : "creando…"}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {paso === "listo" && (
            <ul className="revision-lista">
              {trabajos.map((t) => {
                // Lo que se apuntó al pedirla: al ponerla, la publicación deja de estar entre las candidatas.
                const a = piezas[t.postId];
                return (
                  <li key={t.postId} className="revision-item produccion-item">
                    {a && (a.tipo === "video"
                      ? <video src={a.src} muted controls playsInline preload="metadata" aria-label="Video creado" />
                      : <img src={a.src} alt={`Pieza para el ${fechaCorta(t.date)}`} loading="lazy" />)}
                    <div className="produccion-texto">
                      <strong>{fechaCorta(t.date)} · {FORMATS[t.format]?.label ?? t.format}</strong>
                      <span className="hint">{String(t.titulo).slice(0, 90)}</span>
                      {a ? (
                        puestas.has(t.postId)
                          ? <span className="hint"><Icon name="check" size={12} /> Puesta en la publicación</span>
                          : <button type="button" className="btn btn-secondary btn-sm" onClick={() => poner([{ postId: t.postId }])}>Poner en la publicación</button>
                      ) : <span className="revision-problema">{t.error || "No llegó."}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="sheet-footer">
          {paso === "listo" ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
              <button type="button" className="btn btn-primary" disabled={!porPoner.length} onClick={() => poner(porPoner)}>Poner todas ({porPoner.length})</button>
            </>
          ) : paso === "confirmar" ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setPaso("elegir")}>No</button>
              <button type="button" className="btn btn-primary" onClick={crear}>Sí, crear {elegidas.length} por {textoCosto(total)}</button>
            </>
          ) : (
            <>
              <span className="hint" style={{ flex: 1 }}>
                {elegidas.length} {elegidas.length === 1 ? "pieza" : "piezas"} · {textoCosto(total)} (aproximado){soloPrueba ? " · motor de prueba: tarjetas, no imágenes" : ""}
              </span>
              <button type="button" className="btn btn-primary" disabled={creando || !elegidas.length}
                onClick={() => (total >= CONFIRMAR_DESDE ? setPaso("confirmar") : crear())}>
                <Icon name="sparkles" size={16} /> {creando ? "Creando…" : `Crear ${elegidas.length}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
