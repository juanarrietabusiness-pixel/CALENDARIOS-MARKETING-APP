import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { presetDePilar, nombreDePilar, productosDelPost } from "../../lib/pilares";
import { estiloDeMarca, limpiarKit, nombreDePreset } from "../../lib/kitMarca";
import { apoyosDePieza, pedidoDePieza } from "../../lib/pieza";
import { validarPedido, textoCosto, CONFIRMAR_DESDE, modeloPorId } from "../../lib/estudioCatalogo";
import * as api from "../../lib/estudio";
import { partirGuion, costoCarrusel, MODOS_TEXTO, PLANTILLAS_TEXTO } from "../../lib/carrusel";
import { modeloParaCarrusel } from "../../lib/carruselEstudio";
import { crearEncargo, lanzarCarrusel, seguirEncargo, terminarEncargo } from "../../lib/encargosApi";
import { ESCENA } from "../../lib/encargos";
import { estampaSola } from "../../lib/logoEstudio";
import { controlEncendido, encenderControl } from "../../lib/controlEstudio";
import { resumenControl } from "../../lib/control";
import { referenciaDeTipografia } from "../../lib/kitMarca";
import { aprobadaPorDentro } from "../../lib/revisionIdeas";
import { promptListo, conPromptListo } from "../../lib/promptImagen";
import { DIAS_SEMANA, diaDeLaSemana, semanasDe, diasDe, filtrarProduccion, ordenarProduccion, resultadosDeProduccion } from "../../lib/produccion";
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
// Un carrusel con guion se produce lámina a lámina, con el texto de la IA o
// con la plantilla del kit, según se escoja aquí.
//
// Lo lleva el SERVIDOR (lib/encargosApi.js): las imágenes en un encargo, cada
// carrusel en el suyo, con el director, el control y la corrección. Se puede
// cerrar: los encargos quedan apuntados en este navegador (`producir-mes:<mes>`,
// tres días) y al volver a abrir esto se ve lo que salió, para ponerlo.
// ============================================================

const DIAS_GUARDADO = 3;
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

/** El tipo de pieza que le toca a un formato: un reel o un directo es video; lo demás, imagen. */
const tipoDe = (format) => (format === "reel" || format === "live" ? "video" : "imagen");
const proporcionDe = (format, tipo) => (format === "reel" || format === "historia" || tipo === "video" ? "9:16" : "4:5");

export default function ProducirMes({ client, cal, onPoner, onClose }) {
  const ids = useId();
  const [estudio, setEstudio] = useState(null); // { kit, motores }
  const [marcadas, setMarcadas] = useState(null); // Set de ids de publicación
  // Los encargos lanzados (los guarda este navegador: al volver se retoman) y lo que se sabe de cada uno.
  const claveGuardado = `producir-mes:${cal.dbId || cal.id}`;
  const [metas, setMetas] = useState(() => {
    try {
      const g = JSON.parse(localStorage.getItem(claveGuardado) ?? "null");
      return g?.metas?.length && Date.now() - (g.t ?? 0) < DIAS_GUARDADO * 86_400_000 ? g.metas : [];
    } catch { return []; }
  });
  const [estados, setEstados] = useState({}); // id → { encargo, archivos, fin }
  const [escogidas, setEscogidas] = useState({}); // postId → la versión escogida a mano
  const [puestas, setPuestas] = useState(new Set());
  const [paso, setPaso] = useState("elegir"); // elegir | confirmar | creando | listo
  const [aviso, setAviso] = useState(null);
  const [semanas, setSemanas] = useState(() => new Set()); // vacío = todas
  const [dias, setDias] = useState(() => new Set());
  const [orden, setOrden] = useState("dia");
  // El director de arte diseña cada imagen (la ficha de diseño), como «Crear con IA» desde una publicación.
  const [mejorar, setMejorar] = useState(true);
  // El control de calidad de cada pieza al llegar (y corregir el texto solo): se recuerda por navegador.
  const [controlar, setControlar] = useState(controlEncendido);
  // Cuántas versiones de cada imagen (para escoger).
  const [versiones, setVersiones] = useState(2);
  const [modoTexto, setModoTexto] = useState("ia");
  const [plantilla, setPlantilla] = useState("banda");
  const vivo = useRef(true);
  // Lo de esta pantalla mientras se piden los encargos (segundos). Después, lo lleva el servidor: se puede cerrar.
  const [lanzando, setLanzando] = useState(false);
  const creando = lanzando;
  const ref = useDialogA11y(() => { if (!creando) onClose(); });
  const clienteId = client?.dbId || client?.id;

  // Las publicaciones del mes por id (para nombrar lo que sale) y lo que sale de los encargos.
  const posts = useMemo(() => new Map((cal.days ?? []).flatMap((d) => (d.posts ?? []).map((p) => [p.id, { post: p, date: d.date }]))), [cal.days]);
  const r = useMemo(() => resultadosDeProduccion(metas, estados, posts), [metas, estados, posts]);
  const trabajos = r.trabajos;
  const opciones = r.versiones;
  const controles = r.controles;
  const piezas = useMemo(() => ({ ...r.mejores, ...escogidas }), [r.mejores, escogidas]);
  const setPiezas = (f) => setEscogidas((m) => ({ ...m, ...f(piezas) }));

  // Con encargos de antes (se cerró mientras se creaban), se vuelve a lo que salió.
  useEffect(() => { if (metas.length && paso === "elegir") setPaso("creando"); }, [metas.length, paso]);
  // Seguir cada encargo; lo que necesita lienzo (el logo estampado, el texto de la plantilla), según sale.
  const siguiendo = useRef(new Set());
  useEffect(() => {
    if (!estudio) return;
    for (const m of metas) {
      if (siguiendo.current.has(m.id)) continue;
      siguiendo.current.add(m.id);
      void seguirEncargo({
        clienteId, id: m.id, seguir: () => vivo.current,
        alCambio: (e, archivos) => {
          if (!vivo.current) return;
          setEstados((x) => ({ ...x, [m.id]: { ...x[m.id], encargo: e, archivos } }));
          void terminarEncargo({ clienteId, encargo: e, archivos, kit: estudio.kit });
        },
      }).then((e) => { if (vivo.current) setEstados((x) => ({ ...x, [m.id]: { ...x[m.id], ...(e ? { encargo: e } : {}), fin: true } })); });
    }
  }, [metas, estudio, clienteId]);
  // Todo listo: a escoger y poner. Las fichas nuevas del director se quedan en su publicación (la próxima vez, al
  // instante), una sola vez.
  const fichasGuardadas = useRef(false);
  useEffect(() => {
    if (!r.listo || paso === "listo") return;
    setPaso("listo");
    ref.current?.focus({ preventScroll: true });
    window.dispatchEvent(new Event("ia:gasto"));
    const n = Object.keys(r.mejores).length;
    setAviso({ ok: n > 0, texto: n ? `Listas ${n} de ${trabajos.length}. Revisa cada una y ponla en su publicación.` : "No llegó ninguna pieza: mira el motivo de cada una." });
    if (!fichasGuardadas.current && Object.keys(r.fichas).length) {
      fichasGuardadas.current = true;
      onPoner((p) => (r.fichas[p.id] && !promptListo(p) ? conPromptListo(p, r.fichas[p.id]) : p));
    }
  }, [r, paso, trabajos.length, onPoner, ref]);

  useEffect(() => {
    vivo.current = true;
    Promise.all([api.leerEstudio(clienteId), api.leerMotores()])
      .then(([g, m]) => setEstudio({ kit: limpiarKit(g.kit), motores: m.motores ?? {}, productos: g.productos ?? [], archivos: g.archivos ?? [] }))
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
        const modelo = api.modeloPreferido(activos, tipo, estudio.kit?.modelos?.[tipo]);
        const preset = presetDePilar(post.pilar, post.pilarSub) || "servicios";
        // El MISMO camino que una pieza hecha a mano (lib/pieza.js): las fotos REALES del producto primero, las
        // referencias del tipo, el logo si cabe, el estilo visual del tipo con su acabado, en alta resolución.
        const apoyos = tipo === "imagen"
          ? apoyosDePieza({ kit: estudio.kit, preset, archivos: estudio.archivos, fotos: api.fotosDelPost(estudio.productos, post), modelo })
          : [];
        const ideaBase = api.promptDePublicacion(post, { conTexto: tipo !== "video" });
        const armar = (idea) => pedidoDePieza({
          kit: estudio.kit, idea, preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
          video: tipo === "video", aspectRatio: proporcionDe(post.format, tipo),
          ...(tipo === "imagen" ? { proporcion: proporcionDe(post.format, tipo), activos } : {}),
        });
        const pedido = armar(ideaBase);
        const v = validarPedido(pedido);
        return {
          date: d.date, post, tipo, modelo: modeloPorId(pedido.modelo) ?? modelo, pedido, armar, ideaBase, pieza: nombreDePreset(preset, estudio.kit),
          costo: v.ok ? v.pedido.costoEstimado : 0, error: v.ok ? "" : v.error,
        };
      }));
  }, [estudio, cal.days, activos, client.name, client.industry]);

  // Marcadas de entrada: las APROBADAS por dentro («Revisar las ideas»), si hay alguna; si no, todas las que se pueden.
  useEffect(() => {
    if (!estudio || marcadas !== null) return;
    const posibles = candidatas.filter((c) => c.tipo !== "video" && !c.error);
    const aprobadas = posibles.filter((c) => aprobadaPorDentro(c.post));
    setMarcadas(new Set((aprobadas.length ? aprobadas : posibles).map((c) => c.post.id)));
  }, [estudio, candidatas, marcadas]);

  const alternar = (set, valor) => { const n = new Set(set); if (n.has(valor)) n.delete(valor); else n.add(valor); return n; };
  const visibles = useMemo(() => ordenarProduccion(filtrarProduccion(candidatas, { semanas, dias }), orden), [candidatas, semanas, dias, orden]);
  // Sólo cuenta lo que se ve: escoger «semana 2» no pide lo marcado de las otras.
  const elegidas = visibles.filter((c) => marcadas?.has(c.post.id));
  const total = elegidas.reduce((s, c) => s + c.costo * (c.tipo === "imagen" ? versiones : 1), 0);
  const soloPrueba = elegidas.some((c) => c.modelo.motor === "prueba");

  const crear = async () => {
    setPaso("creando");
    setAviso(null);
    setLanzando(true);
    const kit = estudio.kit;
    const calendarId = cal.dbId || cal.id;
    const nuevas = [];
    // Las imágenes (y los videos) en UN encargo: el director las diseña como una SERIE, cada una en su llamada; las que
    // ya traían su ficha del director (el pedido listo) no esperan. Cada pedido va armado por el mismo camino de siempre, con el hueco de la escena.
    const sueltas = elegidas.filter((x) => x.tipo !== "carrusel");
    if (sueltas.length) {
      const pasos = sueltas.map((c) => {
        const imagen = c.tipo === "imagen";
        // Sólo la ficha del DIRECTOR se salta su diseño; el borrador del motor de ideas queda de respaldo.
        const lista = imagen ? promptListo(c.post) : "";
        const disenar = mejorar && imagen && !lista;
        return {
          id: c.post.id, titulo: c.post.title || c.post.idea || "",
          pedido: { ...c.armar(ESCENA), ...(imagen ? { n: versiones } : {}), calendarId, postId: c.post.id },
          escena: mejorar && imagen ? lista : c.ideaBase, sinMejorar: (imagen && promptListo(c.post, { cualquiera: true })) || c.ideaBase,
          encargo: disenar ? {
            formato: c.post.format === "historia" ? "historia" : "post", proporcion: proporcionDe(c.post.format, "imagen"),
            tipo: c.pieza, idea: [c.post.title, c.post.idea].filter(Boolean).join(" — "), escena: c.post.escena ?? "",
            texto: c.post.textoPieza ?? "", productoId: c.post.productoId ?? "", productoIds: productosDelPost(c.post), composicion: c.post.composicion ?? "", fecha: c.date,
          } : null,
          texto: c.post.textoPieza ?? "", controlar: controlar && imagen,
          navegador: imagen && estampaSola(kit) ? { logo: true } : null,
        };
      });
      try {
        const vistas = mejorar ? await api.vistasDelCliente(clienteId).catch(() => []) : [];
        const { encargo } = await crearEncargo(clienteId, { tipo: "lote", titulo: "Producir el mes", pasos, mejorar, controlar, paralelo: 2, vistas });
        nuevas.push({ id: encargo.id, tipo: "lote" });
      } catch (e) {
        setAviso({ ok: false, texto: e.message });
      }
    }
    // Cada carrusel, el suyo: el director diseña la serie (la ficha de cada lámina) a partir del guion, en el servidor;
    // si no responde, las láminas del guion tal cual. Cada uno en su carpeta: la galería lo enseña como una tarjeta.
    for (const c of elegidas.filter((x) => x.tipo === "carrusel")) {
      const preset = presetDePilar(c.post.pilar, c.post.pilarSub) || "servicios";
      try {
        const carpetaId = await api.carpetaDeGrupo(clienteId, "carrusel", c.post.title || c.post.idea || "");
        const { encargo } = await lanzarCarrusel({
          clienteId, carpetaId, controlar, logoEstampado: estampaSola(kit), titulo: c.post.title || "Carrusel",
          comun: {
            modelo: c.modelo, modo: modoTexto, plantilla, idea: c.post.idea || c.post.title || "",
            preset: estiloDeMarca(kit, preset, { marca: client.name, rubro: client.industry ?? "" }),
            fotos: api.fotosDelPost(estudio.productos, c.post, 6).map((f) => f.clave),
            logo: estampaSola(kit) ? "" : kit.logo, tipografia: referenciaDeTipografia(kit), calendarId, postId: c.post.id,
          },
          propuesta: mejorar ? { guion: c.post.guion ?? "", tema: c.post.idea || c.post.title || "", preset, productoId: c.post.productoId || undefined, productoIds: productosDelPost(c.post), estructura: c.post.estructura || undefined } : null,
          laminas: c.laminas,
        });
        nuevas.push({ id: encargo.id, tipo: "carrusel", postId: c.post.id, laminas: c.laminas.length });
      } catch (e) {
        setAviso({ ok: false, texto: e.message });
        if (e.datos?.codigo === "presupuesto") break;
      }
    }
    setLanzando(false);
    if (!nuevas.length) { setPaso("elegir"); return; }
    const todas = [...metas, ...nuevas];
    setMetas(todas);
    try { localStorage.setItem(claveGuardado, JSON.stringify({ metas: todas, t: Date.now() })); } catch { /* sin almacenamiento: se sigue aquí */ }
    setAviso({ ok: true, texto: "Se está creando en el servidor: puedes cerrar. Al volver a abrir «Diseñar las que ya hay» verás lo que salió para ponerlo; también queda en la galería." });
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
    setPuestas((s) => {
      const n = new Set([...s, ...lista.map((x) => x.postId)]);
      // Todo puesto: los encargos ya no hace falta recordarlos al volver.
      if (trabajos.every((t) => !piezas[t.postId] || n.has(t.postId))) { try { localStorage.removeItem(claveGuardado); } catch { /* nada */ } }
      return n;
    });
    for (const { postId } of lista) {
      for (const a of archivosDe(postId)) api.apuntarUso(clienteId, a.id, { calendarId: cal.dbId || cal.id, postId }).catch(() => {});
    }
  };
  const porPoner = trabajos.filter((t) => piezas[t.postId] && !puestas.has(t.postId));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes" tabIndex={-1}>
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
              <label className="est-logo-casilla">
                <input type="checkbox" checked={mejorar} onChange={(e) => setMejorar(e.target.checked)} /> Que el director diseñe cada imagen y cada carrusel antes de crear (recomendado: una ficha de diseño por pieza o lámina, todas como una serie; las que ya la tienen no esperan; costo de texto mínimo)
              </label>
              <label className="cerebro-casilla">
                <input type="checkbox" checked={controlar} onChange={(e) => { setControlar(e.target.checked); encenderControl(e.target.checked); }} /> Revisar cada pieza al llegar y corregir solo el texto mal escrito (recomendado; céntimos por pieza)
              </label>
              <div className="produccion-filtro" role="group" aria-label="Versiones de cada imagen">
                <span className="hint">Versiones</span>
                {[1, 2].map((n) => <button key={n} type="button" className="filter-chip" aria-pressed={versiones === n} onClick={() => setVersiones(n)}>{n === 1 ? "Una" : "Dos para escoger"}</button>)}
              </div>
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
                      {aprobadaPorDentro(c.post) && <span className="revisar-idea-ok"><Icon name="check" size={12} /> Aprobada</span>}
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
                    {(opciones[t.postId]?.length ?? 0) > 1 && !puestas.has(t.postId) && (
                      <div className="lote-opciones" role="group" aria-label={`Escoger la versión del ${fechaCorta(t.date)}`}>
                        {opciones[t.postId].map((o, k) => (
                          <button key={o.id} type="button" className="lote-opcion" aria-pressed={piezas[t.postId]?.id === o.id} aria-label={`Versión ${k + 1}`}
                            onClick={() => setPiezas((m) => ({ ...m, [t.postId]: o }))}>
                            <img src={o.src} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="produccion-texto">
                      <strong>{fechaCorta(t.date)} · {FORMATS[t.format]?.label ?? t.format}</strong>
                      <span className="hint">{String(t.titulo).slice(0, 90)}{todas.length > 1 ? ` · ${todas.length} láminas` : ""}{t.laminas && todas.length < t.laminas ? ` (faltaron ${t.laminas - todas.length})` : ""}</span>
                      {controles[t.postId] && (
                        <span className="lote-control" data-estado={controles[t.postId].estado}>
                          <Icon name={controles[t.postId].estado === "ok" ? "checkCircle" : "alert"} size={12} /> {resumenControl(controles[t.postId])}
                        </span>
                      )}
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
