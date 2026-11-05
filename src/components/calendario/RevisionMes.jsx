import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { Envoltura } from "./envolturaMes";
import { callAI } from "../../api";
import { leerMercado } from "../../lib/mercado";
import { limpiarEstudio } from "../../lib/estudioMercado";
import { fechasDelMes } from "../../lib/fechasEspeciales";
import { mediosDe } from "../../lib/publicacion";
import { revisarMarcaDeRuta } from "../../lib/estudio";
import { FORMATS } from "../../constants";
import { revisarMes, resumenRevision, aplicarArregloTexto, pedidoDeRevisionIA, leerRevisionIA } from "../../lib/revisionMes";
import { BalanceDelMes } from "../EstrategiaMes";
import { semanasDelMes } from "../../lib/campanas";
import { limpiarEstrategia } from "../../lib/estrategiaMes";
import { MAX_PIEZAS_SERIE } from "../../lib/piezasJuntas";
import "./RevisionMes.css";

// ============================================================
// «Revisar el mes»: antes de enviarlo al cliente
//
// Las reglas (precios fuera del catálogo, competencia, fechas delicadas,
// voseo, sin llamado a la acción, hashtags) salen al abrir y no cuestan
// nada. Dos pasadas opcionales, que sí cuestan: la IA lee los textos (lo
// que las reglas no ven) y mira las imágenes contra el kit de marca. Nada
// se cambia solo: cada arreglo es un botón, y «Abrir» lleva al panel.
// «Ver las piezas juntas» mira todas las imágenes A LA VEZ (una hoja numerada que arma el navegador, lib/hojaPiezas.js)
// y dice cuáles se salen de la serie: lo que la revisión de cada imagen sola no ve.
// ============================================================

const MAX_IMAGENES = 30;
const TANDA_IA = 12;

const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

export default function RevisionMes({ client, cal, onAbrir, onArreglar, onClose, incrustado = false }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const [mercado, setMercado] = useState(null);
  const [ia, setIa] = useState({}); // postId → [texto]
  const [marca, setMarca] = useState({}); // postId → { puntaje, falla, sugerencia } | { error }
  const [conImagenes, setConImagenes] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [serie, setSerie] = useState(null); // { puntaje, resumen, comun, fuera, porId: postId → { n, motivo, arreglo } }
  const clienteId = client?.dbId || client?.id;

  useEffect(() => { leerMercado(clienteId).then(setMercado).catch(() => setMercado({})); }, [clienteId]);

  const lista = useMemo(() => {
    const competidores = (limpiarEstudio(mercado?.estudio ?? mercado?.borrador)?.general?.competidores ?? []).map((c) => c.nombre);
    const delicadas = Object.fromEntries(
      fechasDelMes(cal.year, cal.month, client?.fechasEspeciales).filter((f) => f.delicada).map((f) => [f.fecha, f.nombre]),
    );
    return revisarMes(cal.days, { catalogo: mercado?.catalogo ?? [], competidores, delicadas });
  }, [cal.days, cal.year, cal.month, client?.fechasEspeciales, mercado]);

  const todas = useMemo(
    () => [...(cal.days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).flatMap((d) => (d.posts ?? []).map((post) => ({ date: d.date, post }))),
    [cal.days],
  );

  const revisarConIA = async () => {
    setTrabajando("ia");
    setAviso(null);
    try {
      const conTexto = todas.filter(({ post }) => String(post.descripcion || post.script || post.guion || "").trim());
      const salida = {};
      for (let i = 0; i < conTexto.length; i += TANDA_IA) {
        const tanda = conTexto.slice(i, i + TANDA_IA).map(({ date, post }) => ({ ...post, date }));
        setTrabajando(`ia ${Math.min(i + TANDA_IA, conTexto.length)}/${conTexto.length}`);
        const texto = await callAI(pedidoDeRevisionIA({ marca: client.name, publicaciones: tanda }), { funcion: "revisión de textos", clienteId, maxTokens: 3000 });
        Object.assign(salida, leerRevisionIA(typeof texto === "string" ? texto : texto?.texto, tanda.map((p) => p.id)) ?? {});
      }
      setIa(salida);
      const n = Object.values(salida).flat().length;
      setAviso({ ok: true, texto: n ? `La IA encontró ${n} ${n === 1 ? "cosa" : "cosas"} que revisar.` : "La IA no encontró nada más en los textos." });
      if (conImagenes) await revisarImagenes();
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setTrabajando("");
  };

  const revisarImagenes = async () => {
    const conImagen = todas
      .map(({ post }) => ({ post, src: mediosDe(post).find((m) => m.tipo !== "video" && String(m.src ?? "").startsWith("/api/media/"))?.src }))
      .filter((x) => x.src)
      .slice(0, MAX_IMAGENES);
    const salida = {};
    for (let i = 0; i < conImagen.length; i++) {
      setTrabajando(`imágenes ${i + 1}/${conImagen.length}`);
      try {
        salida[conImagen[i].post.id] = await revisarMarcaDeRuta(clienteId, conImagen[i].src);
      } catch (e) {
        salida[conImagen[i].post.id] = { error: e.message };
        if (/kit de marca/.test(e.message)) { setAviso({ ok: false, texto: e.message }); break; }
      }
      setMarca({ ...salida });
    }
    window.dispatchEvent(new Event("ia:gasto"));
  };

  // La imagen que representa a cada publicación en la hoja: la primera imagen, o la portada de un video.
  const piezasConImagen = useMemo(() => todas
    .map(({ date, post }) => ({ date, post, src: mediosDe(post).find((m) => m.tipo !== "video" && String(m.src ?? "").startsWith("/api/media/"))?.src || (String(post.portada ?? "").startsWith("/api/media/") ? post.portada : "") }))
    .filter((x) => x.src)
    .slice(0, MAX_PIEZAS_SERIE), [todas]);

  const verJuntas = async () => {
    setTrabajando("juntas");
    setAviso(null);
    try {
      const [{ hojaDePiezas }, { revisarSerie }] = await Promise.all([import("../../lib/hojaPiezas"), import("../../lib/revisionVideoApi")]);
      const { base64, total } = await hojaDePiezas(piezasConImagen.map((x) => x.src));
      const r = await revisarSerie(clienteId, base64, total);
      const porId = Object.fromEntries(r.fuera.map((f) => [piezasConImagen[f.n - 1]?.post.id, f]).filter(([id]) => id));
      setSerie({ ...r, porId });
      setAviso({ ok: true, texto: r.fuera.length ? `${r.fuera.length} ${r.fuera.length === 1 ? "pieza se sale" : "piezas se salen"} de la serie.` : "Las piezas se ven de la misma marca." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setTrabajando("");
  };

  // Lo que se ve: las reglas, y lo que digan la IA y la revisión de imágenes (aunque las reglas no vieran nada ahí).
  const filas = useMemo(() => {
    const porId = new Map(lista.map((x) => [x.post.id, x]));
    for (const { date, post } of todas) {
      if (!porId.has(post.id) && (ia[post.id]?.length || marca[post.id] || serie?.porId[post.id])) porId.set(post.id, { date, post, problemas: [], falta: [] });
    }
    return [...porId.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [lista, todas, ia, marca, serie]);

  const resumen = resumenRevision(lista);
  const ocupado = Boolean(trabajando);

  return (
    <Envoltura incrustado={incrustado} refDialogo={ref} titulo={`${ids}-t`}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Revisar el mes antes de enviarlo</h2>
            <p className="hint" style={{ margin: 0 }}>{mercado === null ? "Revisando…" : resumen || "Las reglas no encontraron nada."}</p>
          </div>
          {!incrustado && <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>}
        </div>
        <div className="sheet-body">
          <div className="revision-acciones">
            <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={revisarConIA}>
              <Icon name="sparkles" size={16} /> {trabajando.startsWith("ia") ? `Leyendo ${trabajando.slice(3)}…` : trabajando.startsWith("imágenes") ? `Mirando ${trabajando}…` : "Revisar también con IA"}
            </button>
            <label className="cerebro-casilla">
              <input type="checkbox" checked={conImagenes} disabled={ocupado} onChange={(e) => setConImagenes(e.target.checked)} />
              <span>y las imágenes contra el kit de marca (unos centavos cada una)</span>
            </label>
          </div>
          {piezasConImagen.length >= 2 && (
            <section className="revision-serie" aria-label="Las piezas juntas">
              <div className="revision-acciones" style={{ marginBottom: 0 }}>
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={verJuntas}>
                  <Icon name="grid" size={16} /> {trabajando === "juntas" ? "Mirando las piezas juntas…" : serie ? "Volver a verlas juntas" : "Ver las piezas juntas"}
                </button>
                <span className="hint">¿Parecen de la misma marca? Mira las {piezasConImagen.length} imágenes a la vez (unos centavos).</span>
              </div>
              {serie && (
                <div className="revision-serie-resultado">
                  <p style={{ margin: 0 }}><strong>Serie: {serie.puntaje}/10.</strong> {serie.resumen}</p>
                  {serie.comun.length > 0 && <p className="hint" style={{ margin: 0 }}>Lo que comparten: {serie.comun.join("; ")}.</p>}
                </div>
              )}
            </section>
          )}
          <div aria-live="polite">
            {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}
          </div>

          {/* Cómo queda repartido el mes (formatos, tipos, niveles) y lo que se descompensa: reglas, sin IA. */}
          <BalanceDelMes days={cal.days ?? []} objetivo={limpiarEstrategia(cal.opciones?.estrategia)?.objetivo ?? ""} foco={limpiarEstrategia(cal.opciones?.estrategia)?.foco ?? ""}
            semanas={Number.isInteger(cal.month) && cal.year ? semanasDelMes(cal.year, cal.month).map((w) => ({ n: w.numero, desde: w.desde, hasta: w.hasta })) : []} />

          {mercado !== null && !filas.length && (
            <p className="revision-vacio"><Icon name="checkCircle" size={18} /> Todo listo para enviar.</p>
          )}
          <ul className="revision-lista">
            {filas.map(({ date, post, problemas, falta }) => (
              <li key={post.id} className="revision-item">
                <div className="revision-cabeza">
                  <strong>{fechaCorta(date)} · {FORMATS[post.format]?.label ?? post.format}</strong>
                  <span className="hint">{String(post.title || post.idea || post.descripcion || "").slice(0, 70)}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAbrir(post.id)}>Abrir <Icon name="chevronRight" size={14} /></button>
                </div>
                {falta.length > 0 && (
                  <p className="revision-falta">Sin contenido todavía: le falta {falta.join(", ")} para que el cliente entienda qué va.</p>
                )}
                {problemas.map((p) => (
                  <p key={p.codigo} className="revision-problema">
                    {p.texto}
                    {p.arreglo && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                        onArreglar(date, aplicarArregloTexto(post, p.codigo));
                        // El botón desaparece con el aviso: el foco vuelve al diálogo (si no, Escape ya no lo cierra).
                        ref.current?.focus({ preventScroll: true });
                      }}>{p.arreglo}</button>
                    )}
                  </p>
                ))}
                {(ia[post.id] ?? []).map((t, i) => <p key={`ia${i}`} className="revision-problema revision-ia"><Icon name="sparkles" size={12} /> {t}</p>)}
                {serie?.porId[post.id] && (
                  <p className="revision-problema">
                    <Icon name="grid" size={12} /> Se sale de la serie (n.º {serie.porId[post.id].n}): {serie.porId[post.id].motivo}
                    {serie.porId[post.id].arreglo ? ` Para traerla de vuelta: ${serie.porId[post.id].arreglo}` : ""}
                  </p>
                )}
                {marca[post.id] && (
                  <p className={`revision-problema${marca[post.id].error || marca[post.id].falla?.length ? "" : " revision-ok"}`}>
                    <Icon name="palette" size={12} />{" "}
                    {marca[post.id].error
                      ? `Imagen: ${marca[post.id].error}`
                      : `Imagen: ${marca[post.id].puntaje}/10${marca[post.id].falla?.length ? ` · ${marca[post.id].falla.join("; ")}` : " · cumple con la marca"}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
    </Envoltura>
  );
}
