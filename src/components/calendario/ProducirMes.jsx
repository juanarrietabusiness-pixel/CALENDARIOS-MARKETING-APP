import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { presetDePilar, nombreDePilar } from "../../lib/pilares";
import { textoPreset, componerPedido, ponerLogo, limpiarKit } from "../../lib/kitMarca";
import { modeloPorDefecto, validarPedido, ajustesDe, textoCosto, CONFIRMAR_DESDE } from "../../lib/estudioCatalogo";
import * as api from "../../lib/estudio";
import { partirGuion, costoCarrusel, coloresPlantilla, MODOS_TEXTO, PLANTILLAS_TEXTO } from "../../lib/carrusel";
import { crearCarrusel, modeloParaCarrusel } from "../../lib/carruselEstudio";
import { DIAS_SEMANA, diaDeLaSemana, semanasDe, diasDe, filtrarProduccion, ordenarProduccion } from "../../lib/produccion";
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
//
// Se escogen las SEMANAS y los DÍAS (lunes, martes…) a producir, y la
// lista va de lunes a domingo: el tipo de contenido va por día, así que
// todos los lunes salen juntos con el mismo estilo (lib/produccion.js).
//
// Un carrusel con guion se produce lámina a lámina (lib/carruselEstudio.js):
// después de las piezas sueltas, uno detrás de otro, con el texto de la IA
// o con la plantilla del kit, según se escoja aquí.
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
  const [semanas, setSemanas] = useState(() => new Set()); // vacío = todas
  const [dias, setDias] = useState(() => new Set());
  const [orden, setOrden] = useState("dia");
  const [modoTexto, setModoTexto] = useState("ia");
  const [plantilla, setPlantilla] = useState("banda");
  const vivo = useRef(true);
  const creando = paso === "creando";
  // Mientras se piden y avanzan los trabajos, cerrar los dejaría a medias (el cron los termina igual, pero sin ponerlos).
  const ref = useDialogA11y(() => { if (!creando) onClose(); });
  const clienteId = client?.dbId || client?.id;

  useEffect(() => {
    vivo.current = true;
    Promise.all([api.leerEstudio(clienteId), api.leerMotores()])
      .then(([g, m]) => setEstudio({ kit: limpiarKit(g.kit), motores: m.motores ?? {}, productos: g.productos ?? [] }))
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
        // Un carrusel con guion de dos láminas o más: lámina a lámina.
        const laminas = post.format === "carrusel" ? partirGuion(post.guion) : [];
        if (laminas.length >= 2) {
          const modelo = modeloParaCarrusel(activos);
          return { date: d.date, post, tipo: "carrusel", modelo, laminas, costo: costoCarrusel(laminas, modelo.costo), error: "" };
        }
        const tipo = tipoDe(post.format);
        const modelo = modeloPorDefecto(activos, tipo);
        const preset = textoPreset(estudio.kit, presetDePilar(post.pilar) || "producto", { marca: client.name, rubro: client.industry ?? "" });
        const prompt = componerPedido({ idea: api.promptDePublicacion(post, { conTexto: tipo !== "video" }), preset, video: tipo === "video" }).slice(0, 4000);
        // Las fotos del producto (catálogo) primero: que salga el producto real. Luego el logo, si cabe.
        const fotos = tipo === "imagen" ? api.fotosDelProducto(estudio.productos, post.productoId).map((f) => f.clave) : [];
        const conLogo = ponerLogo({ kit: estudio.kit, tipo, modelo, referencias: fotos });
        const referencia = [...fotos, ...(conLogo ? [estudio.kit.logo] : [])].slice(0, modelo.referencias || 0);
        const medios = referencia.length ? { reference: referencia } : {};
        const ajustes = ajustesDe(modelo, { aspectRatio: proporcionDe(post.format, tipo) }, medios);
        const v = validarPedido({ modelo: modelo.id, prompt, n: 1, ajustes, medios });
        return { date: d.date, post, tipo, modelo, pedido: { modelo: modelo.id, prompt, n: 1, ajustes, medios }, costo: v.ok ? v.pedido.costoEstimado : 0, error: v.ok ? "" : v.error };
      }));
  }, [estudio, cal.days, activos, client.name, client.industry]);

  useEffect(() => {
    if (estudio && marcadas === null) setMarcadas(new Set(candidatas.filter((c) => c.tipo !== "video" && !c.error).map((c) => c.post.id)));
  }, [estudio, candidatas, marcadas]);

  const alternar = (set, valor) => { const n = new Set(set); if (n.has(valor)) n.delete(valor); else n.add(valor); return n; };
  const visibles = useMemo(() => ordenarProduccion(filtrarProduccion(candidatas, { semanas, dias }), orden), [candidatas, semanas, dias, orden]);
  // Sólo cuenta lo que se ve: escoger «semana 2» no pide lo marcado de las otras.
  const elegidas = visibles.filter((c) => marcadas?.has(c.post.id));
  const total = elegidas.reduce((s, c) => s + c.costo, 0);
  const soloPrueba = elegidas.some((c) => c.modelo.motor === "prueba");

  const crear = async () => {
    setPaso("creando");
    setAviso(null);
    const creados = [];
    for (const c of elegidas.filter((x) => x.tipo !== "carrusel")) {
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

    // Los carruseles, después y uno a uno: cada lámina espera a la anterior.
    const comunes = {
      clienteId, modo: modoTexto, plantilla, logo: estudio.kit.logo, colores: coloresPlantilla(estudio.kit), familia: estudio.kit.tipografia,
      calendarId: cal.dbId || cal.id, seguir: () => vivo.current,
    };
    for (const c of elegidas.filter((x) => x.tipo === "carrusel")) {
      if (!vivo.current) return;
      const t = { postId: c.post.id, date: c.date, format: c.post.format, titulo: c.post.title || c.post.idea || "", id: null, estado: "en marcha", error: "", laminas: c.laminas.length, hechas: 0 };
      creados.push(t);
      setTrabajos([...creados]);
      const hechas = await crearCarrusel({
        ...comunes, modelo: c.modelo, laminas: c.laminas, postId: c.post.id, idea: c.post.idea || c.post.title || "",
        preset: textoPreset(estudio.kit, presetDePilar(c.post.pilar) || "producto", { marca: client.name, rubro: client.industry ?? "" }),
        fotos: api.fotosDelProducto(estudio.productos, c.post.productoId).map((f) => f.clave),
        alAvanzar: () => { t.hechas += 1; setTrabajos([...creados]); },
      });
      const finales = hechas.map((r) => r?.final).filter(Boolean);
      t.estado = finales.length ? "hecho" : "fallido";
      t.error = hechas.find((r) => r?.error)?.error ?? "";
      if (finales.length) salida[c.post.id] = finales;
      setTrabajos([...creados]);
    }
    if (!vivo.current) return;
    setPiezas(salida);
    setPaso("listo");
    window.dispatchEvent(new Event("ia:gasto"));
    const n = Object.keys(salida).length;
    setAviso({ ok: n > 0, texto: n ? `Listas ${n} de ${creados.length}. Revisa cada una y ponla en su publicación.` : "No llegó ninguna pieza: mira el motivo de cada una." });
  };

  // Una pieza suelta es un archivo; un carrusel, sus láminas en orden.
  const archivosDe = (postId) => [piezas[postId]].flat().filter(Boolean);
  const poner = (lista) => {
    const porPost = new Map(lista.map(({ postId }) => [postId, archivosDe(postId)]));
    const ahora = new Date().toISOString();
    // `onPoner` recibe cómo cambiar cada publicación: la que tiene pieza nueva la suma a sus medios.
    onPoner((p) => (porPost.has(p.id)
      ? { ...conMedios(p, [...mediosDe(p), ...porPost.get(p.id).map(api.medioDeArchivo)]), mediosCambiadosAt: ahora }
      : p));
    setPuestas((s) => new Set([...s, ...lista.map((x) => x.postId)]));
    for (const { postId } of lista) {
      for (const a of archivosDe(postId)) api.apuntarUso(clienteId, a.id, { calendarId: cal.dbId || cal.id, postId }).catch(() => {});
    }
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

          {paso === "elegir" && candidatas.length > 0 && (
            <div className="produccion-filtros">
              <div className="produccion-filtro" role="group" aria-label="Semanas a producir">
                <span className="hint">Semanas</span>
                <button type="button" className="filter-chip" aria-pressed={!semanas.size} onClick={() => setSemanas(new Set())}>Todas</button>
                {semanasDe(candidatas).map((n) => (
                  <button key={n} type="button" className="filter-chip" aria-pressed={semanas.has(n)} onClick={() => setSemanas((x) => alternar(x, n))}>Semana {n}</button>
                ))}
              </div>
              <div className="produccion-filtro" role="group" aria-label="Días a producir">
                <span className="hint">Días</span>
                <button type="button" className="filter-chip" aria-pressed={!dias.size} onClick={() => setDias(new Set())}>Todos</button>
                {diasDe(candidatas).map((d) => (
                  <button key={d.n} type="button" className="filter-chip" aria-pressed={dias.has(d.n)} onClick={() => setDias((x) => alternar(x, d.n))} aria-label={d.nombre}>{d.corto}</button>
                ))}
              </div>
              {visibles.some((c) => c.tipo === "carrusel") && (
                <div className="produccion-filtro" role="group" aria-label="Texto de los carruseles">
                  <span className="hint">Carruseles</span>
                  {Object.entries(MODOS_TEXTO).map(([k, v]) => (
                    <button key={k} type="button" className="filter-chip" aria-pressed={modoTexto === k} onClick={() => setModoTexto(k)} title={v.ayuda}>{v.nombre}</button>
                  ))}
                  {modoTexto === "plantilla" && (
                    <select className="input produccion-plantilla" aria-label="Dónde va el texto" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
                      {Object.entries(PLANTILLAS_TEXTO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="produccion-filtro" role="group" aria-label="Orden">
                <span className="hint">Orden</span>
                <button type="button" className="filter-chip" aria-pressed={orden === "dia"} onClick={() => setOrden("dia")}>De lunes a domingo</button>
                <button type="button" className="filter-chip" aria-pressed={orden === "fecha"} onClick={() => setOrden("fecha")}>Por fecha</button>
              </div>
            </div>
          )}
          {paso !== "listo" && candidatas.length > 0 && !visibles.length && <p className="hint">Nada sin contenido en esas semanas y días.</p>}

          {paso !== "listo" && visibles.length > 0 && (
            <ul className="revision-lista">
              {visibles.map((c, i) => {
                const t = trabajos.find((x) => x.postId === c.post.id);
                // De lunes a domingo, un título por día de la semana.
                const dia = orden === "dia" && (i === 0 || diaDeLaSemana(visibles[i - 1].date) !== diaDeLaSemana(c.date))
                  ? DIAS_SEMANA.find((d) => d.n === diaDeLaSemana(c.date)) : null;
                return (
                  <li key={c.post.id} className="revision-item">
                    {dia && <h3 className="produccion-dia">{dia.nombre}</h3>}
                    <label className="revision-cabeza cerebro-casilla">
                      <input type="checkbox" disabled={creando || Boolean(c.error)} checked={Boolean(marcadas?.has(c.post.id))}
                        onChange={(e) => setMarcadas((s) => { const n = new Set(s); if (e.target.checked) n.add(c.post.id); else n.delete(c.post.id); return n; })} />
                      <strong>{fechaCorta(c.date)} · {FORMATS[c.post.format]?.label ?? c.post.format}</strong>
                      <span className="hint">{[nombreDePilar(c.post.pilar, c.post.pilarSub), String(c.post.title || c.post.idea || "").slice(0, 60)].filter(Boolean).join(" · ")}</span>
                    </label>
                    <p className="revision-problema">
                      {c.error ? c.error : `${c.tipo === "carrusel" ? `Carrusel de ${c.laminas.length} láminas` : c.tipo === "video" ? "Video" : "Imagen"} con ${c.modelo.nombre} · ${textoCosto(c.costo)}`}
                      {t && ` · ${t.estado === "hecho" ? "lista" : t.estado === "fallido" ? `falló: ${t.error}` : t.laminas ? `lámina ${Math.min(t.hechas + 1, t.laminas)} de ${t.laminas}…` : "creando…"}`}
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
                const todas = archivosDe(t.postId);
                const a = todas[0];
                return (
                  <li key={t.postId} className="revision-item produccion-item">
                    {a && (a.tipo === "video"
                      ? <video src={a.src} muted controls playsInline preload="metadata" aria-label="Video creado" />
                      : <img src={a.src} alt={`Pieza para el ${fechaCorta(t.date)}`} loading="lazy" />)}
                    <div className="produccion-texto">
                      <strong>{fechaCorta(t.date)} · {FORMATS[t.format]?.label ?? t.format}</strong>
                      <span className="hint">{String(t.titulo).slice(0, 90)}{todas.length > 1 ? ` · ${todas.length} láminas` : ""}{t.laminas && todas.length < t.laminas ? ` (faltaron ${t.laminas - todas.length})` : ""}</span>
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
