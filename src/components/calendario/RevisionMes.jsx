import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { revisarMes, resumenRevision, aplicarArregloTexto, pedidoDeRevisionIA, leerRevisionIA, revisarPauta, resumenPauta, aplicarArregloPauta } from "../../lib/revisionMes";
import { describirPauta } from "../../lib/pauta";
import { leerNegocio } from "../../lib/negocioApi";
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
// LO QUE VA A PAUTA sale aparte, con la revisión de anuncio (lib/pauta.js): lo que se arregla solo, con su botón
// (hashtags, el llamado); lo demás lo reescribe el motor como anuncio (unos céntimos) sobre la publicación de AHORA.
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
  // El destino del cliente (WhatsApp o web): cambia qué llamado se le pide a lo que va a pauta.
  const [destino, setDestino] = useState("");
  const calRef = useRef(cal);
  calRef.current = cal;

  useEffect(() => { leerMercado(clienteId).then(setMercado).catch(() => setMercado({})); }, [clienteId]);
  useEffect(() => {
    let vivo = true;
    if ((cal.days ?? []).some((d) => (d.posts ?? []).some((p) => p.pauta && typeof p.pauta === "object"))) {
      leerNegocio(clienteId, { meta: false }).then((r) => { if (vivo) setDestino(r?.negocio?.destino ?? ""); }).catch(() => {});
    }
    return () => { vivo = false; };
  }, [clienteId, cal.days]);
  const pauta = useMemo(() => revisarPauta(cal.days, { destino }), [cal.days, destino]);

  /**
   * Reescribe lo que va a pauta como anuncio por el motor (el caption o sus textos aparte) y lo pone sobre la publicación
   * de AHORA: la IA tarda, y mientras tanto alguien pudo tocarla.
   */
  const reescribir = async (date, post, campos, pide = "") => {
    setTrabajando(`pauta ${post.id}`);
    setAviso(null);
    try {
      const { reescribirComoAnuncio } = await import("../../lib/escribirTextos");
      const day = (calRef.current.days ?? []).find((d) => d.date === date) ?? { date };
      const cambios = await reescribirComoAnuncio(clienteId, { post, day, cal: calRef.current, campos, pide });
      const ahora = (calRef.current.days ?? []).flatMap((d) => d.posts ?? []).find((p) => p.id === post.id) ?? post;
      onArreglar(date, { ...ahora, ...cambios });
      setAviso({ ok: true, texto: campos.includes("anuncio") && !campos.includes("descripcion") ? "Listos sus textos de anuncio. Revísalos en la publicación." : "Reescrita como anuncio. Revísala antes de enviarla." });
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setTrabajando("");
    ref.current?.focus({ preventScroll: true });
  };

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

  const resumen = [resumenRevision(lista), resumenPauta(pauta)].filter(Boolean).join(" · ");
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

          {pauta.length > 0 && (
            <section className="revision-serie" aria-labelledby={`${ids}-pauta`}>
              <h3 id={`${ids}-pauta`} style={{ fontSize: "var(--fs-sm)", margin: 0, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                <Icon name="megaphone" size={16} /> Lo que va a pauta
              </h3>
              <p className="hint" style={{ margin: 0 }}>
                {resumenPauta(pauta)}. Su caption ES el texto principal del anuncio: en el Ads Manager ya no se cambia, así que se revisa como anuncio.
              </p>
              <ul className="revision-lista">
                {pauta.map(({ date, post, problemas }) => {
                  const iaCaption = problemas.some((p) => p.ia && p.codigo !== "textos");
                  const parecida = problemas.find((p) => p.codigo === "parecida");
                  const sinTextos = problemas.some((p) => p.codigo === "textos");
                  const ocupada = trabajando === `pauta ${post.id}`;
                  return (
                    <li key={post.id} className="revision-item">
                      <div className="revision-cabeza">
                        <strong>{fechaCorta(date)} · {FORMATS[post.format]?.label ?? post.format} · {describirPauta(post.pauta)}</strong>
                        <span className="hint">{String(post.title || post.idea || post.descripcion || "").slice(0, 70)}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAbrir(post.id)}>Abrir <Icon name="chevronRight" size={14} /></button>
                      </div>
                      {!problemas.length && <p className="revision-problema revision-ok"><Icon name="check" size={12} /> Lista como anuncio.</p>}
                      {problemas.map((p) => (
                        <p key={p.codigo} className="revision-problema">
                          {p.texto}
                          {p.arreglo && (
                            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => {
                              onArreglar(date, aplicarArregloPauta(post, p.codigo, { destino, whatsapp: client?.whatsapp ?? "" }));
                              ref.current?.focus({ preventScroll: true });
                            }}>{p.arreglo}</button>
                          )}
                        </p>
                      ))}
                      {(iaCaption || sinTextos) && (
                        <div className="revision-acciones" style={{ marginBottom: 0 }}>
                          {iaCaption && (
                            <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado}
                              onClick={() => reescribir(date, post, sinTextos ? ["descripcion", "anuncio"] : ["descripcion"], parecida ? `Que sea DISTINTA de esta otra de su misma etapa (otro gancho, otro ángulo): «${parecida.distintaDe}»` : "")}>
                              <Icon name="sparkles" size={14} /> {ocupada ? "Escribiendo…" : parecida ? "Escribir otra distinta (IA)" : "Reescribir el caption como anuncio (IA)"}
                            </button>
                          )}
                          {sinTextos && !iaCaption && (
                            <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => reescribir(date, post, ["anuncio"])}>
                              <Icon name="sparkles" size={14} /> {ocupada ? "Escribiendo…" : "Escribir sus textos de anuncio (IA)"}
                            </button>
                          )}
                          <span className="hint">Unos céntimos. Se pone en la publicación: revísala.</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {mercado !== null && !filas.length && !pauta.some((x) => x.problemas.length) && (
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
