import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { FUENTES, FORMATOS_LO_MEJOR, REDES_LO_MEJOR, CAMINOS, ideaDeLoMejor } from "../lib/loMejor";
import { traerLoMejor, crearConClaudeLoMejor } from "../lib/loMejorApi";
import { haceCuanto } from "../lib/competencia";
import { fechaEnZona } from "../lib/agenda";
import "./LoMejor.css";

// Sólo al usarlos.
const RecrearLoMejor = lazy(() => import("./RecrearLoMejor"));
const ExtraerUgc = lazy(() => import("./calendario/ExtraerUgc"));

// ============================================================
// Las TARJETAS de «Lo mejor»: las usan la sección global (/lo-mejor) y la
// pestaña Inspiración de cada cliente (la misma vista, filtrada por él; también
// el ojo del calendario, que deja ARRASTRAR una tarjeta a un día).
//
// Cada tarjeta: la vista previa grande (el video se reproduce por el proxy de
// la API), la cifra de verdad de su fuente («rinde 4,1×», «63 días activo»,
// «tu mejor del mes»), el tipo y por qué funciona. La acción principal es
// «Recrear para [cliente]»; las demás: guardar en ideas (con su cifra y su
// miniatura), extraer el guion, la fórmula, crear con Claude, llevar a un día y
// ver el original. Lo de otra cuenta va siempre como REFERENCIA.
// ============================================================

/** El cliente con el que se trabaja una pieza: el fijo (pestaña de un cliente) o el primero que la sigue. */
const clienteDe = (p, clientes, fijo) => clientes.find((c) => (c.dbId || c.id) === (fijo || p.clientes?.[0])) ?? null;
const idDe = (c) => c?.dbId || c?.id || "";

function Tarjeta({ p, clientes, clienteFijo, lectura, onLlevar, arrastrable, ocupado, onAccion, destacar }) {
  const ref = useRef(null);
  const [llevando, setLlevando] = useState(false);
  const [fecha, setFecha] = useState(fechaEnZona());
  // Si el video no se puede reproducir (su dirección caducó, o TikTok no lo sirve sin su web), queda la miniatura.
  const [sinVideo, setSinVideo] = useState(false);
  const cliente = clienteDe(p, clientes, clienteFijo);
  const nombres = (p.clientes ?? []).map((id) => clientes.find((c) => idDe(c) === id)?.name).filter(Boolean);
  const alto = (p.percentil ?? 0) >= 90;

  useEffect(() => {
    if (destacar && ref.current) ref.current.scrollIntoView({ block: "center" });
  }, [destacar]);

  return (
    <li ref={ref} className="lo-mejor-tarjeta" data-destacada={destacar || undefined} data-fuente={p.fuente}
      draggable={arrastrable && !lectura}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", JSON.stringify({ inspiracionId: p.clave })); }}>
      <div className="lo-mejor-vista">
        {p.video && !sinVideo ? (
          <video src={p.video} poster={p.miniatura || undefined} controls playsInline preload="none" aria-label={`Video de ${p.cuenta || "la pieza"}`} onError={() => setSinVideo(true)} />
        ) : p.miniatura ? (
          <img src={p.miniatura} alt="" loading="lazy" />
        ) : (
          <span className="lo-mejor-sin-vista"><Icon name={REDES_LO_MEJOR[p.red]?.icono ?? "link"} size={28} /><span className="hint">Sin vista previa</span></span>
        )}
        <span className="lo-mejor-etiqueta lo-mejor-etiqueta-fuente"><Icon name={FUENTES[p.fuente]?.icono ?? "star"} size={11} /> {FUENTES[p.fuente]?.nombre}</span>
        <span className="lo-mejor-etiqueta lo-mejor-etiqueta-formato">{FORMATOS_LO_MEJOR[p.formato]}</span>
      </div>
      <div className="lo-mejor-cuerpo">
        <p className="lo-mejor-cifra" data-alto={alto || undefined}>{p.cifra?.texto}</p>
        {p.cifra?.detalle && <p className="lo-mejor-detalle">{p.cifra.detalle}</p>}
        <p className="lo-mejor-de">
          {p.tipoNombre ? <span className="lo-mejor-tipo">{p.tipoNombre}</span> : <span className="lo-mejor-tipo lo-mejor-tipo-falta">Sin clasificar</span>}
          <Icon name={REDES_LO_MEJOR[p.red]?.icono ?? "link"} size={12} />
          {p.cuenta && <strong>{p.cuenta}</strong>}
          <span className="hint">{haceCuanto(p.fecha)}</span>
        </p>
        {!clienteFijo && nombres.length > 0 && <p className="lo-mejor-clientes hint">Para: {nombres.join(", ")}</p>}
        {p.idea ? <p className="lo-mejor-idea">{p.idea}</p> : p.texto ? <p className="lo-mejor-texto">{p.texto}</p> : null}
        {p.sinArchivo && p.red === "instagram" && <p className="hint" style={{ margin: 0 }}>Con música de Instagram: Meta no da su video (se trabaja con su miniatura y su texto).</p>}
        {p.sinArchivo && p.red === "tiktok" && p.formato === "video" && <p className="hint" style={{ margin: 0 }}>TikTok no da su video sin Scrape Creators: se trabaja con su miniatura y su texto.</p>}
        {sinVideo && <p className="hint" style={{ margin: 0 }}>El video no se puede ver aquí (su dirección caducó): «Ver el original».</p>}

        {!lectura && (
          <div className="lo-mejor-acciones">
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => onAccion("recrear", p, cliente)}>
              <Icon name="wand" size={14} /> {cliente ? `Recrear para ${cliente.name}` : "Recrear…"}
            </button>
            <span className="hint lo-mejor-camino-sugerido">{CAMINOS[p.caminoSugerido]?.corto}</span>
          </div>
        )}
        <div className="lo-mejor-acciones lo-mejor-secundarias">
          {!lectura && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAccion("ideas", p, cliente)}>
              <Icon name="bulb" size={13} /> Guardar en ideas
            </button>
          )}
          {!lectura && p.conVideo && cliente && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAccion("guion", p, cliente)}>
              <Icon name="user" size={13} /> Extraer guion
            </button>
          )}
          {!lectura && p.conVideo && cliente && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAccion("formula", p, cliente)}
              title="La receta del video, sin su contenido, para la biblioteca de fórmulas UGC de la agencia">
              <Icon name="list" size={13} /> Fórmula
            </button>
          )}
          {!lectura && cliente && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAccion("claude", p, cliente)}>
              <Icon name="sparkles" size={13} /> Crear con Claude
            </button>
          )}
          {!lectura && onLlevar && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} aria-expanded={llevando} onClick={() => setLlevando((v) => !v)}>
              <Icon name="calendar" size={13} /> Llevar a un día
            </button>
          )}
          {p.enlace && <a className="btn btn-ghost btn-sm" href={p.enlace} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} /> Ver el original</a>}
        </div>
        {llevando && (
          <div className="lo-mejor-llevar">
            <SelectorFecha value={fecha} onChange={(f) => setFecha(f || fechaEnZona())} etiqueta="Día" vacio="Escoge el día" prefijo="El" />
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => { setLlevando(false); onAccion("llevar", p, cliente, fecha); }}>Llevar</button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * @param piezas      las de `/api/lo-mejor` (ya ordenadas).
 * @param clientes    los clientes del espacio (para los nombres y «Recrear para…»).
 * @param clienteFijo el id del cliente si la vista es la de uno (la pestaña Inspiración).
 * @param onLlevar    (idea, día) → si entró en el calendario: «Llevar a un día» y el arrastre al mes.
 * @param llevarRef   lo que el mes llama al SOLTAR una tarjeta en un día (el ojo del calendario).
 * @param destacada   la clave de la pieza que viene de un aviso: se ve primero y se señala.
 */
export default function LoMejorTarjetas({ piezas = [], clientes = [], clienteFijo = "", lectura = false, onLlevar = null, llevarRef = null, destacada = "", onAviso = () => {}, onError = () => {} }) {
  const [trabajando, setTrabajando] = useState("");
  const [recreando, setRecreando] = useState(null); // { pieza, cliente }
  const [extraer, setExtraer] = useState(null); // { client, inicial, formula }

  const conTrabajo = async (clave, hacer) => {
    if (trabajando) return;
    setTrabajando(clave);
    onError("");
    onAviso("");
    try { await hacer(); } catch (e) { onError(e.message); }
    setTrabajando("");
  };

  /** El original en la galería del cliente (para la referencia o para ver su video). null si no se puede (YouTube). */
  const traer = async (p, cliente, opciones) => {
    if (p.archivo?.id && (p.clientes ?? []).includes(idDe(cliente))) return p.archivo;
    if (p.red === "youtube") return null;
    return (await traerLoMejor(p.clave, idDe(cliente), opciones)).archivo;
  };

  const llevar = async (p, cliente, dia) => {
    if (!onLlevar) return false;
    let archivo = null;
    if (cliente) {
      try { archivo = await traer(p, cliente, { miniatura: p.formato !== "video" || p.sinArchivo }); } catch (e) { onAviso(`Va sin el archivo: ${e.message}`); }
    }
    const ok = await onLlevar(ideaDeLoMejor(p, { id: crypto.randomUUID().slice(0, 8), archivo }), dia);
    if (ok) onAviso(`En el calendario el ${dia}: ${archivo ? "con el original como referencia (no se publica)" : "con el enlace de referencia"}.`);
    return ok;
  };

  // Lo que se suelta en un día del calendario (MonthGrid) llega por aquí, por la clave de la tarjeta.
  useEffect(() => {
    if (!llevarRef) return undefined;
    llevarRef.current = (clave, dia) => {
      const p = piezas.find((x) => x.clave === clave);
      if (!p) return;
      void conTrabajo(p.clave, () => llevar(p, clienteDe(p, clientes, clienteFijo), dia));
    };
    return () => { llevarRef.current = null; };
  });

  const accion = (que, p, cliente, extra) => {
    if (que === "recrear") { setRecreando({ pieza: p, cliente }); return; }
    if (que === "llevar") { void conTrabajo(p.clave, () => llevar(p, cliente, extra)); return; }
    void conTrabajo(p.clave, async () => {
      if (que === "ideas") {
        const [{ anadirAlBanco }] = await Promise.all([import("../lib/bancoIdeasApi")]);
        let archivo = null;
        if (cliente && p.archivo?.id && (p.clientes ?? []).includes(idDe(cliente))) archivo = p.archivo;
        await anadirAlBanco({ ...ideaDeLoMejor(p, { id: crypto.randomUUID(), archivo }), _addedAt: new Date().toISOString() }, clienteFijo || (p.clientes?.length === 1 ? p.clientes[0] : null));
        onAviso(`Guardada en el banco de ideas${cliente && (clienteFijo || p.clientes?.length === 1) ? ` de ${cliente.name}` : " (general)"}, con su cifra y su vista.`);
        return;
      }
      if (que === "guion" || que === "formula") {
        const formula = que === "formula";
        if (p.red === "youtube") {
          setExtraer({ client: cliente, formula, inicial: { youtube: p.enlace, nombre: `Video de ${p.cuenta || "YouTube"}`, cuenta: p.cuenta, enlace: p.enlace } });
          return;
        }
        const archivo = await traer(p, cliente);
        if (!archivo || archivo.tipo !== "video") throw new Error("No hay video que ver de esta pieza.");
        setExtraer({ client: cliente, formula, inicial: { id: archivo.id, src: archivo.src, nombre: `Video de ${p.cuenta || "referencia"}`, cuenta: p.cuenta, enlace: p.enlace } });
        return;
      }
      if (que === "claude") {
        const r = await crearConClaudeLoMejor(p.clave, idDe(cliente));
        onAviso(r.copiado ? `Abierto en Claude (el mensaje también está copiado): ${r.mensaje}` : `Abierto en Claude. Si no se escribió solo, pega esto: ${r.mensaje}`);
      }
    });
  };

  return (
    <>
      <ul className="lo-mejor-tarjetas">
        {piezas.map((p) => (
          <Tarjeta key={p.clave} p={p} clientes={clientes} clienteFijo={clienteFijo} lectura={lectura} onLlevar={onLlevar}
            arrastrable={Boolean(llevarRef)} ocupado={Boolean(trabajando)} onAccion={accion} destacar={p.clave === destacada} />
        ))}
      </ul>
      {trabajando && <p role="status" className="hint lo-mejor-trabajando">Trabajando…</p>}
      <Suspense fallback={null}>
        {recreando && (
          <RecrearLoMejor pieza={recreando.pieza} clientes={clienteFijo ? clientes.filter((c) => idDe(c) === clienteFijo) : clientes}
            clienteInicial={idDe(recreando.cliente)} onCerrar={() => setRecreando(null)} />
        )}
        {extraer?.client && (
          <ExtraerUgc client={extraer.client} inicial={extraer.inicial} formula={extraer.formula} onCerrar={() => setExtraer(null)} />
        )}
      </Suspense>
    </>
  );
}
