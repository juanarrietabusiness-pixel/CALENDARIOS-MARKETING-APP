import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { mediosDe, conMedios } from "../../lib/publicacion";
import { presetDePilar, nombreDePilar } from "../../lib/pilares";
import { estiloDeMarca, limpiarKit, nombreDePreset } from "../../lib/kitMarca";
import { apoyosDePieza, pedidoDePieza } from "../../lib/pieza";
import { validarPedido, textoCosto, CONFIRMAR_DESDE, modeloPorId } from "../../lib/estudioCatalogo";
import * as api from "../../lib/estudio";
import { partirGuion, costoCarrusel, coloresPlantilla, MODOS_TEXTO, PLANTILLAS_TEXTO } from "../../lib/carrusel";
import { crearCarrusel, modeloParaCarrusel } from "../../lib/carruselEstudio";
import { estampaSola, conLogoSiToca } from "../../lib/logoEstudio";
import { controlarYCorregir, controlEncendido, encenderControl } from "../../lib/controlEstudio";
import { resumenControl } from "../../lib/control";
import { referenciaDeTipografia } from "../../lib/kitMarca";
import { aprobadaPorDentro } from "../../lib/revisionIdeas";
import { promptListo, conPromptListo } from "../../lib/promptImagen";
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
  // El director de arte diseña cada imagen (la ficha de diseño), como «Crear con IA» desde una publicación.
  const [mejorar, setMejorar] = useState(true);
  // El control de calidad de cada pieza al llegar (y corregir el texto solo): se recuerda por navegador.
  const [controlar, setControlar] = useState(controlEncendido);
  const [controles, setControles] = useState({}); // postId → control
  // Cuántas versiones de cada imagen (para escoger) y las que llegaron: postId → [archivos].
  const [versiones, setVersiones] = useState(2);
  const [opciones, setOpciones] = useState({});
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
          ? apoyosDePieza({ kit: estudio.kit, preset, archivos: estudio.archivos, fotos: api.fotosDelProducto(estudio.productos, post.productoId), modelo })
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
    const creados = [];
    // El director de arte diseña las imágenes como una SERIE, en tandas de 6: la ficha que ya traía la publicación (su
    // pedido listo) se usa tal cual; las demás se diseñan juntas y la ficha se guarda en el post (`onFicha`).
    const fichas = {};
    const nuevas = {};
    if (mejorar) {
      const sueltas = elegidas.filter((x) => x.tipo === "imagen");
      for (const c of sueltas) { const l = promptListo(c.post); if (l) fichas[c.post.id] = l; }
      const faltan = sueltas.filter((c) => !fichas[c.post.id]);
      let concepto = "";
      for (let k = 0; k < faltan.length && vivo.current; k += 6) {
        const tanda = faltan.slice(k, k + 6);
        setAviso({ ok: true, texto: `El director de arte está diseñando ${k + tanda.length} de ${faltan.length}…` });
        const r = await api.fichasDeDiseno(clienteId, {
          concepto,
          piezas: tanda.map((c, j) => ({
            n: j + 1, formato: c.post.format === "historia" ? "historia" : "post", proporcion: proporcionDe(c.post.format, "imagen"),
            tipo: c.pieza, idea: [c.post.title, c.post.idea].filter(Boolean).join(" — "), escena: c.post.escena ?? "",
            texto: c.post.textoPieza ?? "", productoId: c.post.productoId ?? "", composicion: c.post.composicion ?? "", fecha: c.date,
          })),
        }).catch(() => null);
        concepto ||= r?.concepto ?? "";
        tanda.forEach((c, j) => {
          const f = r?.fichas?.[j + 1]?.ficha;
          if (f) { fichas[c.post.id] = f; nuevas[c.post.id] = f; }
        });
      }
      // Las fichas nuevas se quedan en su publicación, todas de una vez: la próxima vez salen al instante.
      if (Object.keys(nuevas).length) onPoner((p) => (nuevas[p.id] ? conPromptListo(p, nuevas[p.id]) : p));
      setAviso(null);
    }
    for (const c of elegidas.filter((x) => x.tipo !== "carrusel")) {
      if (!vivo.current) return;
      try {
        let pedido = c.pedido;
        if (mejorar && c.tipo === "imagen" && fichas[c.post.id]) pedido = c.armar(fichas[c.post.id]);
        const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, ...(c.tipo === "imagen" ? { n: versiones } : {}), confirmado: true, calendarId: cal.dbId || cal.id, postId: c.post.id });
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
    // Cada trabajo con TODAS sus versiones (la galería trae la más nueva primero: se ordenan por fecha).
    const porTrabajo = new Map();
    for (const a of [...(g?.archivos ?? [])].reverse()) if (a.trabajoId) porTrabajo.set(a.trabajoId, [...(porTrabajo.get(a.trabajoId) ?? []), a]);
    const salida = {};
    const versionesDe = {};
    for (const t of creados) if (t.id && porTrabajo.has(t.id)) { versionesDe[t.postId] = porTrabajo.get(t.id); salida[t.postId] = versionesDe[t.postId][0]; }
    // El control de calidad, antes de estampar el logo: si sólo falla una letra, se corrige editando la misma imagen.
    if (controlar) {
      const vistos = {};
      for (const t of creados) {
        const a = salida[t.postId];
        const c = elegidas.find((x) => x.post.id === t.postId);
        if (!a || a.tipo === "video" || !vivo.current) continue;
        t.estado = "revisando";
        setTrabajos([...creados]);
        // Cada versión pasa por el control; la primera que salga bien es la que se propone.
        const revisadas = [];
        for (const v of versionesDe[t.postId] ?? [a]) {
          const r = await controlarYCorregir({ clienteId, archivo: v, texto: c?.post?.textoPieza ?? null, activos, seguir: () => vivo.current });
          revisadas.push(r);
        }
        versionesDe[t.postId] = revisadas.map((r) => r.archivo);
        const mejor = revisadas.find((r) => r.control?.estado === "ok") ?? revisadas[0];
        salida[t.postId] = mejor.archivo;
        if (mejor.control) vistos[t.postId] = mejor.control;
        t.estado = "hecho";
      }
      setControles((m) => ({ ...m, ...vistos }));
    }
    // Con el logo estampado (kit), la pieza que se pone es la que lo lleva encima.
    if (estampaSola(estudio.kit)) {
      for (const k of Object.keys(salida)) salida[k] = await conLogoSiToca({ clienteId, archivo: salida[k], kit: estudio.kit });
    }

    // Los carruseles, después y uno a uno: cada lámina espera a la anterior.
    const comunes = {
      clienteId, modo: modoTexto, plantilla, logo: estampaSola(estudio.kit) ? "" : estudio.kit.logo, estampar: estampaSola(estudio.kit) ? estudio.kit : null, colores: coloresPlantilla(estudio.kit), familia: estudio.kit.tipografia, fuente: estudio.kit.fuente,
      calendarId: cal.dbId || cal.id, seguir: () => vivo.current,
      tipografia: referenciaDeTipografia(estudio.kit), controlar, activos,
    };
    for (const c of elegidas.filter((x) => x.tipo === "carrusel")) {
      if (!vivo.current) return;
      const t = { postId: c.post.id, date: c.date, format: c.post.format, titulo: c.post.title || c.post.idea || "", id: null, estado: "en marcha", error: "", laminas: c.laminas.length, hechas: 0 };
      creados.push(t);
      setTrabajos([...creados]);
      // El director diseña la serie (la ficha de cada lámina y el sistema) a partir del guion, como en «Carrusel con
      // IA»; si no responde, las láminas del guion tal cual.
      const preset = presetDePilar(c.post.pilar, c.post.pilarSub) || "servicios";
      const propuesta = mejorar
        ? await api.proponerCarrusel(clienteId, { guion: c.post.guion ?? "", tema: c.post.idea || c.post.title || "", preset, productoId: c.post.productoId || undefined }).catch(() => null)
        : null;
      const hechas = await crearCarrusel({
        ...comunes, modelo: c.modelo, laminas: propuesta?.laminas ?? c.laminas, hilo: propuesta?.hilo ?? "", postId: c.post.id, idea: c.post.idea || c.post.title || "",
        preset: estiloDeMarca(estudio.kit, preset, { marca: client.name, rubro: client.industry ?? "" }),
        fotos: api.fotosDelProducto(estudio.productos, c.post.productoId).map((f) => f.clave),
        alAvanzar: () => { t.hechas += 1; setTrabajos([...creados]); },
      });
      const finales = hechas.map((r) => r?.final).filter(Boolean);
      // El control de la serie: si alguna lámina quedó por revisar, la del carrusel es la peor.
      const malas = hechas.map((r) => r?.control).filter((x) => x?.estado === "revisar");
      if (hechas.some((r) => r?.control)) setControles((m) => ({ ...m, [c.post.id]: malas[0] ?? { estado: "ok" } }));
      t.estado = finales.length ? "hecho" : "fallido";
      t.error = hechas.find((r) => r?.error)?.error ?? "";
      if (finales.length) salida[c.post.id] = finales;
      setTrabajos([...creados]);
    }
    if (!vivo.current) return;
    setPiezas(salida);
    setOpciones(versionesDe);
    setPaso("listo");
    // El botón de crear desaparece: el foco vuelve al diálogo (si no, Escape ya no lo cierra).
    ref.current?.focus({ preventScroll: true });
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
