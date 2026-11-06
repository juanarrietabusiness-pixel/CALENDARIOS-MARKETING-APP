import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { TIPOS_NEGOCIO, DESTINOS_NEGOCIO, CUENTA_NEGOCIO } from "../../lib/cicloVentas";
import {
  CAMPOS_NEGOCIO, COSTOS_SUGERIDOS, MAX_COSTOS, MODOS_EQUILIBRIO, OBJETIVOS_CAMPANA, MODOS_SIMULADOR, CAMPOS_SIMULADOR,
  ORIGENES_DATO, limpiarNegocio, modoDe, origenDe, objetivo, equilibrio, numeroMagico, aUnRoas, tablaUtilidad,
  escenarios, entradasDelSimulador, conLecturaMeta, conTasaMedida, repartoPorEtapas, modoSimuladorDe, numero,
} from "../../lib/numerosNegocio";
import { leerNegocio, guardarNegocio, proponerNegocio } from "../../lib/negocioApi";
import "./NumerosNegocio.css";

// ============================================================
// Marca → «Números del negocio» de un cliente (curso de campañas, entrega 3)
//
// La ficha con los números (cada uno con su ayuda y de dónde sale) y las tres calculadoras de la agencia, con las
// MISMAS cuentas (src/lib/numerosNegocio.js): el número mágico (objetivo frente a equilibrio, con la alarma),
// «Cuánto invertir» (la Calculadora de presupuesto), «El equilibrio» (deeplook, en sus dos modos) y «Simular» (los 5
// modos del Simulador, prellenado con lo que la cuenta hizo en Meta en 30 días). La IA PROPONE lo que falta y queda
// «estimado» hasta que una persona lo confirma; nada se guarda hasta «Guardar los números».
//
// Lo que no se ve: lo de Meta (el presupuesto) y la tasa medida por el enlace de ventas entran en el formulario al
// abrirlo, con su origen; si otra persona guarda mientras se edita, no se pisa lo de nadie (aviso y «Releer»).
// ============================================================

const aTexto = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "" : String(Math.round(Number(n) * 10000) / 10000).replace(".", ","));

function formatos(moneda = "USD") {
  let dinero;
  try {
    const f = new Intl.NumberFormat("es", { style: "currency", currency: moneda || "USD", maximumFractionDigits: 2 });
    dinero = (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : f.format(n));
  } catch {
    dinero = (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toFixed(2)} ${moneda}`);
  }
  const numeroF = new Intl.NumberFormat("es", { maximumFractionDigits: 0 });
  let redondo;
  try {
    const g = new Intl.NumberFormat("es", { style: "currency", currency: moneda || "USD", maximumFractionDigits: 0 });
    redondo = (n) => (Number.isFinite(n) ? g.format(n) : "—");
  } catch {
    redondo = (n) => (Number.isFinite(n) ? `${Math.round(n)} ${moneda}` : "—");
  }
  return {
    dinero,
    redondo,
    entero: (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : numeroF.format(n)),
    veces: (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(Math.round(n * 100) / 100).toLocaleString("es")} ×`),
    pct: (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(Math.round(n * 10) / 10).toLocaleString("es")} %`),
  };
}

/** «6 de noviembre, 3:06 p. m.», en la hora de Panamá. */
const cuando = (iso) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/** El formulario: cada número como texto (se escribe «12,5» sin que salte), con su origen. */
function formDe(negocio) {
  const n = limpiarNegocio(negocio);
  const campos = {};
  for (const c of CAMPOS_NEGOCIO) {
    campos[c.id] = n[c.id] ? { texto: aTexto(n[c.id].valor), origen: n[c.id].origen, nota: n[c.id].nota ?? "" } : { texto: "", origen: null, nota: "" };
  }
  const costos = n.costos.length
    ? n.costos.map((c) => ({ nombre: c.nombre, texto: aTexto(c.pct), origen: c.origen, nota: c.nota ?? "" }))
    : COSTOS_SUGERIDOS.map((nombre) => ({ nombre, texto: "", origen: null, nota: "" }));
  return { tipo: n.tipo, destino: n.destino, cuenta: n.cuenta, modo: n.modo, campos, costos };
}

function negocioDe(f) {
  const datos = {};
  for (const [id, c] of Object.entries(f.campos)) datos[id] = c.texto.trim() ? { valor: c.texto, origen: c.origen ?? "agencia", nota: c.nota } : null;
  return limpiarNegocio({
    tipo: f.tipo, destino: f.destino, cuenta: f.cuenta, modo: f.modo, ...datos,
    costos: f.costos.map((c) => ({ nombre: c.nombre, pct: c.texto, origen: c.origen ?? "agencia", nota: c.nota })),
  });
}

/** Lo que se compara para saber si hay cambios sin guardar (sin quién ni cuándo). */
const huella = (n) => {
  const { actualizado: _a, por: _p, ...resto } = limpiarNegocio(n);
  return JSON.stringify(resto);
};

function Origen({ origen }) {
  if (!origen) return null;
  return <span className="nn-origen" data-origen={origen}>{ORIGENES_DATO[origen] ?? origen}</span>;
}

/** Un grupo de opciones como radios con aspecto de píldora (cada una de 44 px). */
function Opciones({ legend, nombre, opciones, valor, onCambiar, deshabilitado, ayuda }) {
  return (
    <fieldset className="nn-grupo" disabled={deshabilitado}>
      <legend className="label">{legend}</legend>
      <div className="nn-opciones">
        {opciones.map((o) => (
          <label key={o.id || "auto"} className="nn-opcion" data-activa={valor === o.id ? "si" : undefined}>
            <input type="radio" name={nombre} value={o.id} checked={valor === o.id} onChange={() => onCambiar(o.id)} />
            <span>{o.nombre}</span>
          </label>
        ))}
      </div>
      {ayuda && <p className="hint">{ayuda}</p>}
    </fieldset>
  );
}

function Ayuda({ campo }) {
  return (
    <details className="nn-ayuda">
      <summary>¿Qué es?</summary>
      <p>{campo.ayuda}</p>
      {campo.como && <p><strong>Cómo sacarlo:</strong> {campo.como}</p>}
    </details>
  );
}

/** Una fila de cifras: nombre y valor. */
const Cifra = ({ nombre, valor, nota, fuerte }) => (
  <div className="nn-cifra" data-fuerte={fuerte ? "si" : undefined}>
    <dt>{nombre}</dt>
    <dd>{valor}{nota && <span className="hint"> · {nota}</span>}</dd>
  </div>
);

const NOMBRE_FALTA = Object.fromEntries([...CAMPOS_NEGOCIO.map((c) => [c.id, c.nombre.toLowerCase()]), ["costos", "los costos variables"]]);
const faltanTexto = (lista) => lista.map((id) => NOMBRE_FALTA[id] ?? id).join(", ");

/**
 * @param client   el cliente (para su id y su nombre)
 * @param lectura  sólo lectura: se ve, no se cambia
 * @param pulso    sube cuando alguien del espacio cambia algo de anuncios (para releer)
 */
export default function NumerosNegocio({ client, lectura = false, pulso = 0 }) {
  const ids = useId();
  const [datos, setDatos] = useState(null); // lo que dio el servidor
  const [form, setForm] = useState(null);
  const [base, setBase] = useState(""); // la huella al abrir o al guardar
  const [quien, setQuien] = useState("cliente"); // lo que se escribe cuenta como dato del cliente o de la agencia
  const [estado, setEstado] = useState({ cargando: true, guardando: false, proponiendo: false });
  const [aviso, setAviso] = useState(null); // { tipo: "ok"|"error"|"otro", texto }
  const [propuesta, setPropuesta] = useState(null);
  const [objetivoCampana, setObjetivoCampana] = useState("");
  const [roasPrueba, setRoasPrueba] = useState("");
  const [simModo, setSimModo] = useState("");
  const [simTextos, setSimTextos] = useState({}); // modo → campo → texto
  const pulsoVisto = useRef(pulso);
  const meta = useRef({ lectura: null, avisoMeta: null }); // lo último que se leyó de Meta

  // `conMeta: false` relee sólo lo guardado y se queda con lo que ya se leyó de Meta (no se le pregunta cada vez
  // que alguien del equipo toca algo).
  const cargar = useCallback(async ({ conMeta = true } = {}) => {
    setEstado((e) => ({ ...e, cargando: true }));
    try {
      const leido = await leerNegocio(client.id, { meta: conMeta });
      if (conMeta) meta.current = { lectura: leido.lectura, avisoMeta: leido.avisoMeta };
      const r = { ...leido, ...meta.current };
      setDatos(r);
      // Lo de Meta (presupuesto) y lo medido (tasa de cierre) entran en el formulario con su origen.
      const inicial = conTasaMedida(conLecturaMeta(r.negocio, r.lectura), r.medida);
      const f = formDe(inicial);
      setForm(f);
      setBase(huella(negocioDe(f)));
      setPropuesta(null);
      setAviso(null);
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
    setEstado((e) => ({ ...e, cargando: false }));
  }, [client.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const negocio = useMemo(() => (form ? negocioDe(form) : null), [form]);
  const sucio = Boolean(negocio) && huella(negocio) !== base;

  // Otra persona cambió algo: se relee si no hay nada a medias; si lo hay, se avisa y no se pisa. El efecto corre
  // también al cambiar `sucio`, pero sólo hace algo cuando el pulso es nuevo.
  useEffect(() => {
    if (pulso === pulsoVisto.current) return;
    pulsoVisto.current = pulso;
    if (estado.guardando) return;
    if (sucio) setAviso({ tipo: "otro", texto: "Alguien del equipo cambió algo en la aplicación mientras editabas. Lo tuyo sigue aquí; «Releer» trae lo guardado." });
    else void cargar({ conMeta: false });
  }, [pulso, sucio, cargar, estado.guardando]);

  const moneda = datos?.cuenta?.moneda ?? "USD";
  const f = useMemo(() => formatos(moneda), [moneda]);
  const opciones = useMemo(() => ({ tasaDefecto: datos?.tasaDefecto }), [datos?.tasaDefecto]);
  const destino = negocio?.destino ?? "";
  const objCampana = objetivoCampana || (destino === "web" ? "ventas" : "mensajes");
  const modoSim = simModo || modoSimuladorDe(destino);

  const calculos = useMemo(() => {
    if (!negocio) return null;
    const o = objetivo(negocio, opciones);
    const e = equilibrio(negocio, opciones);
    const magico = numeroMagico(negocio, { ...opciones, objetivoCampana: objCampana, lectura: datos?.lectura });
    const roasEnsayo = numero(roasPrueba) > 0 ? numero(roasPrueba) : o.roas ?? (e.roas ? e.roas * 1.2 : null);
    return {
      o, e, magico, roasEnsayo,
      ensayo: roasEnsayo ? aUnRoas(negocio, roasEnsayo, opciones) : null,
      tabla: tablaUtilidad(negocio, { ...opciones, roas: o.roas, costo: o.costoConversacion }),
      reparto: repartoPorEtapas(o.inversion, { cuenta: negocio.cuenta }),
    };
  }, [negocio, opciones, objCampana, datos?.lectura, roasPrueba]);

  const prellenado = useMemo(() => entradasDelSimulador(modoSim, datos?.lectura, negocio ?? {}), [modoSim, datos?.lectura, negocio]);
  const defSim = MODOS_SIMULADOR.find((m) => m.id === modoSim) ?? MODOS_SIMULADOR[0];
  const textoSim = (campo) => simTextos[modoSim]?.[campo] ?? aTexto(prellenado.valores[campo]);
  const filasSim = useMemo(() => {
    const entradas = Object.fromEntries(defSim.campos.map((c) => [c, numero(simTextos[modoSim]?.[c] ?? prellenado.valores[c])]));
    return escenarios(modoSim, entradas);
  }, [defSim, modoSim, simTextos, prellenado]);

  if (!form) {
    return (
      <section className="card nn" aria-label={`Números del negocio de ${client.name}`}>
        {estado.cargando ? <p role="status" className="hint">Cargando los números…</p> : aviso && <p role="alert" className="notice notice-error">{aviso.texto}</p>}
      </section>
    );
  }

  const puede = !lectura;
  const cambiar = (cambios) => setForm((x) => ({ ...x, ...cambios }));
  const setCampo = (id, texto) => setForm((x) => ({ ...x, campos: { ...x.campos, [id]: { texto, origen: quien, nota: "" } } }));
  const confirmar = (id) => setForm((x) => ({ ...x, campos: { ...x.campos, [id]: { ...x.campos[id], origen: quien } } }));
  const setCosto = (i, cambios) => setForm((x) => ({ ...x, costos: x.costos.map((c, j) => (j === i ? { ...c, ...cambios, origen: quien, nota: "" } : c)) }));
  const confirmarCostos = () => setForm((x) => ({ ...x, costos: x.costos.map((c) => (c.origen === "estimado" ? { ...c, origen: quien } : c)) }));
  const hayCostosEstimados = form.costos.some((c) => c.origen === "estimado" && c.texto.trim());

  const guardar = async () => {
    setEstado((e) => ({ ...e, guardando: true }));
    setAviso(null);
    try {
      const r = await guardarNegocio(client.id, negocio, datos?.negocio?.actualizado ?? null);
      setDatos((d) => ({ ...d, negocio: r.negocio }));
      const g = formDe(conTasaMedida(r.negocio, datos?.medida));
      setForm(g);
      setBase(huella(negocioDe(g)));
      setAviso({ tipo: "ok", texto: "Guardado: el diagnóstico y el estratega ya los usan." });
    } catch (e) {
      if (e.estado === 409 && e.datos?.negocio) {
        setAviso({ tipo: "otro", texto: e.message });
      } else {
        setAviso({ tipo: "error", texto: e.message });
      }
    }
    setEstado((e) => ({ ...e, guardando: false }));
  };

  const proponer = async () => {
    setEstado((e) => ({ ...e, proponiendo: true }));
    setAviso(null);
    try {
      const r = await proponerNegocio(client.id, negocio);
      setPropuesta(r);
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    }
    setEstado((e) => ({ ...e, proponiendo: false }));
  };

  /** Pone en el formulario lo propuesto (como «estimado»): `que` es la lista de ids («costos» para los costos). */
  const usar = (que) => {
    if (!propuesta) return;
    setForm((x) => {
      const g = { ...x, campos: { ...x.campos } };
      for (const [id, d] of Object.entries(propuesta.datos ?? {})) {
        if (que.includes(id)) g.campos[id] = { texto: aTexto(d.valor), origen: "estimado", nota: d.nota ?? "" };
      }
      if (que.includes("costos") && propuesta.costos?.length) {
        g.costos = [
          ...x.costos.filter((c) => c.texto.trim() && c.origen !== "estimado"),
          ...propuesta.costos.map((c) => ({ nombre: c.nombre, texto: aTexto(c.pct), origen: "estimado", nota: c.nota ?? "" })),
        ].slice(0, MAX_COSTOS);
      }
      return g;
    });
    setPropuesta((p) => {
      const datosRestantes = Object.fromEntries(Object.entries(p.datos ?? {}).filter(([id]) => !que.includes(id)));
      return { ...p, datos: datosRestantes, costos: que.includes("costos") ? [] : p.costos };
    });
  };
  const propuestos = propuesta ? [...Object.keys(propuesta.datos ?? {}), ...(propuesta.costos?.length ? ["costos"] : [])] : [];

  const { o, e, magico, ensayo, tabla, reparto, roasEnsayo } = calculos;
  const formatoMagico = (v) => (magico.unidad === "veces" ? f.veces(v) : f.dinero(v));
  const modoUsado = modoDe(negocio);
  const destinoNombre = DESTINOS_NEGOCIO.find((d) => d.id === destino)?.nombre;

  return (
    <div className="nn">
      {/* ---- El número mágico ---- */}
      <section className="card nn-magico" aria-labelledby={`${ids}-magico`} data-alarma={magico.alarma ? "si" : undefined}>
        <div className="nn-cabecera">
          <h3 id={`${ids}-magico`} className="crear-titulo"><Icon name="calculator" size={18} /> El número mágico de {client.name}</h3>
          <div className="field nn-campo-corto">
            <label className="label" htmlFor={`${ids}-objc`}>Para qué campaña</label>
            <select id={`${ids}-objc`} className="input" value={objCampana} onChange={(ev) => setObjetivoCampana(ev.target.value)}>
              {OBJETIVOS_CAMPANA.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="nn-magico-cuerpo">
          <p className="nn-metrica">{magico.metrica}</p>
          <div className="nn-magico-cifras">
            <div><span className="nn-etiqueta">Objetivo</span><strong className="nn-grande">{formatoMagico(magico.objetivo)}</strong></div>
            <div><span className="nn-etiqueta">Equilibrio</span><strong className="nn-mediano">{formatoMagico(magico.equilibrio)}</strong></div>
            {magico.real !== null && <div><span className="nn-etiqueta">Últimos 30 días en Meta</span><strong className="nn-mediano">{formatoMagico(magico.real)}</strong></div>}
          </div>
          {magico.alterna && (
            <p className="hint">{magico.alterna.metrica}: objetivo {f.dinero(magico.alterna.objetivo)} · equilibrio {f.dinero(magico.alterna.equilibrio)}{magico.alterna.real !== null ? ` · en Meta ${f.dinero(magico.alterna.real)}` : ""}</p>
          )}
          <div role="status">
            {magico.alarma && <p className="notice notice-error nn-alarma"><Icon name="alert" size={16} /> {magico.textoAlarma}</p>}
            {!magico.alarma && magico.objetivo !== null && magico.equilibrio !== null && (
              <p className="hint">{magico.sentido === "mas" ? "Mientras el ROAS esté por encima del de equilibrio, se gana." : "Mientras cueste menos que el equilibrio, se gana; el objetivo deja la ganancia que se buscó."}</p>
            )}
          </div>
          {magico.nota && <p className="hint">{magico.nota}</p>}
          {magico.faltan.length > 0 && <p className="hint">Para calcularlo falta: {faltanTexto(magico.faltan)}.</p>}
        </div>
      </section>

      {/* ---- El negocio ---- */}
      <section className="card" aria-labelledby={`${ids}-perfil`}>
        <h3 id={`${ids}-perfil`} className="crear-titulo">El negocio</h3>
        <div className="nn-perfil">
          <div className="field">
            <label className="label" htmlFor={`${ids}-tipo`}>Tipo de negocio</label>
            <select id={`${ids}-tipo`} className="input" value={form.tipo} disabled={!puede} onChange={(ev) => cambiar({ tipo: ev.target.value })}>
              <option value="">Sin escoger</option>
              {TIPOS_NEGOCIO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            {form.tipo && <p className="hint">{TIPOS_NEGOCIO.find((t) => t.id === form.tipo)?.ayuda}</p>}
          </div>
          <Opciones legend="Dónde cierra la venta" nombre={`${ids}-destino`} opciones={DESTINOS_NEGOCIO} valor={form.destino} deshabilitado={!puede}
            onCambiar={(v) => cambiar({ destino: v })} ayuda={DESTINOS_NEGOCIO.find((d) => d.id === form.destino)?.ayuda} />
          <Opciones legend="La cuenta publicitaria" nombre={`${ids}-cuenta`} opciones={CUENTA_NEGOCIO} valor={form.cuenta} deshabilitado={!puede}
            onCambiar={(v) => cambiar({ cuenta: v })} ayuda={CUENTA_NEGOCIO.find((c) => c.id === form.cuenta)?.ayuda} />
          <Opciones legend="Qué se mide en el equilibrio" nombre={`${ids}-modo`}
            opciones={[{ id: "", nombre: `Según el destino (${MODOS_EQUILIBRIO.find((m) => m.id === modoUsado)?.nombre.toLowerCase()})` }, ...MODOS_EQUILIBRIO]}
            valor={form.modo} deshabilitado={!puede} onCambiar={(v) => cambiar({ modo: v })}
            ayuda={MODOS_EQUILIBRIO.find((m) => m.id === modoUsado)?.ayuda} />
        </div>
      </section>

      {/* ---- Los números ---- */}
      <section className="card" aria-labelledby={`${ids}-numeros`}>
        <div className="nn-cabecera">
          <h3 id={`${ids}-numeros`} className="crear-titulo">Los números</h3>
          {puede && (
            <button type="button" className="btn btn-ai" onClick={proponer} disabled={estado.proponiendo}>
              <Icon name="sparkles" size={16} /> {estado.proponiendo ? "Pensando…" : "Proponer lo que falta con IA"}
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Lo que propone la IA queda «estimado» hasta que alguien lo confirma: nunca vale como dato del cliente.
          {datos?.avisoMeta ? ` ${datos.avisoMeta}` : datos?.lectura ? " Lo de Meta son los últimos 30 días de su cuenta publicitaria." : ""}
        </p>
        {puede && (
          <Opciones legend="Lo que escribas cuenta como" nombre={`${ids}-quien`} valor={quien} onCambiar={setQuien}
            opciones={[{ id: "cliente", nombre: "Dato del cliente" }, { id: "agencia", nombre: "Decisión de la agencia" }]} />
        )}

        {propuesta && (
          <div className="nn-propuesta" role="region" aria-label="Lo que propone la IA">
            <p className="nn-propuesta-titulo"><Icon name="sparkles" size={14} /> Lo que propone la IA (aún no está puesto)</p>
            {propuestos.length === 0 && <p className="hint">Nada más que proponer.</p>}
            <ul className="nn-propuesta-lista">
              {Object.entries(propuesta.datos ?? {}).map(([id, d]) => {
                const c = CAMPOS_NEGOCIO.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <span><strong>{c?.nombre}:</strong> {c?.unidad === "%" ? f.pct(d.valor) : f.dinero(d.valor)}{d.nota && <span className="hint"> · {d.nota}</span>}</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => usar([id])}>Usar</button>
                  </li>
                );
              })}
              {propuesta.costos?.length > 0 && (
                <li>
                  <span><strong>Costos variables:</strong>{" "}
                    {propuesta.costos.map((c, i) => (
                      <span key={i}>{i > 0 && " · "}{c.nombre} {f.pct(c.pct)}{c.nota && <span className="hint"> ({c.nota})</span>}</span>
                    ))}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => usar(["costos"])}>Usar</button>
                </li>
              )}
            </ul>
            {propuesta.avisos?.map((a, i) => <p key={i} className="hint">{a}</p>)}
            {propuesta.aviso && <p className="hint">{propuesta.aviso}</p>}
            <div className="nn-botones">
              {propuestos.length > 1 && <button type="button" className="btn btn-primary btn-sm" onClick={() => usar(propuestos)}>Usar todo</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPropuesta(null)}>Cerrar</button>
            </div>
          </div>
        )}

        <div className="nn-campos">
          {CAMPOS_NEGOCIO.map((c) => {
            const v = form.campos[c.id];
            const origen = v.texto.trim() ? v.origen ?? quien : origenDe(negocio, c.id);
            const id = `${ids}-${c.id}`;
            return (
              <div key={c.id} className="nn-campo">
                <label className="label" htmlFor={id}>{c.nombre}</label>
                <div className="nn-entrada">
                  {c.unidad === "dinero" && <span className="nn-unidad" aria-hidden="true">{moneda}</span>}
                  <input id={id} className="input" type="text" inputMode="decimal" autoComplete="off" value={v.texto} readOnly={!puede}
                    placeholder={c.defecto !== undefined ? aTexto(c.id === "tasaCierre" ? datos?.tasaDefecto ?? c.defecto : c.defecto) : ""}
                    aria-describedby={`${id}-o`} onChange={(ev) => setCampo(c.id, ev.target.value)} />
                  {c.unidad === "%" && <span className="nn-unidad" aria-hidden="true">%</span>}
                </div>
                <div id={`${id}-o`} className="nn-campo-pie">
                  <Origen origen={origen} />
                  {v.origen === "estimado" && v.texto.trim() && puede && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirmar(c.id)}>
                      <Icon name="check" size={14} /> Confirmar
                    </button>
                  )}
                  {v.nota && <span className="hint">{v.nota}</span>}
                </div>
                <Ayuda campo={c} />
              </div>
            );
          })}
        </div>

        <fieldset className="nn-costos" disabled={!puede}>
          <legend className="label">Costos variables (% de la venta neta)</legend>
          <p className="hint" style={{ marginTop: 0 }}>De cada 100 de venta, ya sin ITBMS ni devoluciones, lo que se va en producir, enviar y cobrar. Lo que queda es el margen bruto.</p>
          <ul className="nn-costos-lista">
            {form.costos.map((c, i) => (
              <li key={i} className="nn-costo">
                <div className="field">
                  <label className="label" htmlFor={`${ids}-cn${i}`}>Costo {i + 1}</label>
                  <input id={`${ids}-cn${i}`} className="input" value={c.nombre} maxLength={40} onChange={(ev) => setCosto(i, { nombre: ev.target.value })} />
                </div>
                <div className="field nn-costo-pct">
                  <label className="label" htmlFor={`${ids}-cp${i}`}>%</label>
                  <input id={`${ids}-cp${i}`} className="input" type="text" inputMode="decimal" autoComplete="off" value={c.texto} onChange={(ev) => setCosto(i, { texto: ev.target.value })} />
                </div>
                <div className="nn-costo-pie">
                  {c.texto.trim() && <Origen origen={c.origen ?? quien} />}
                  {c.nota && <span className="hint nn-costo-nota">{c.nota}</span>}
                  {puede && (
                    <button type="button" className="btn-icon nn-quitar" aria-label={`Quitar ${c.nombre || `el costo ${i + 1}`}`}
                      onClick={() => setForm((x) => ({ ...x, costos: x.costos.filter((_, j) => j !== i) }))}>
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="nn-botones">
            {puede && form.costos.length < MAX_COSTOS && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((x) => ({ ...x, costos: [...x.costos, { nombre: "", texto: "", origen: null, nota: "" }] }))}>
                <Icon name="plus" size={14} /> Añadir otro costo
              </button>
            )}
            {puede && hayCostosEstimados && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={confirmarCostos}><Icon name="check" size={14} /> Confirmar los costos</button>
            )}
          </div>
          <p className="hint">Costos variables: <strong>{f.pct(e.costosVariables)}</strong> · margen bruto: <strong>{f.pct(e.margenBruto)}</strong>
            {e.margenEfectivo !== null ? <> · margen efectivo: <strong>{f.pct(e.margenEfectivo)}</strong></> : null}</p>
          {e.sinMargen && <p className="notice notice-warn">Los costos variables suman el 100 % o más: no queda margen para pagar fijos ni pauta. Revisa que no haya un costo fijo aquí.</p>}
        </fieldset>

        {puede && (
          <div className="nn-guardar">
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={!sucio || estado.guardando}>
              <Icon name="check" size={16} /> {estado.guardando ? "Guardando…" : "Guardar los números"}
            </button>
            {aviso?.tipo === "otro" && <button type="button" className="btn btn-secondary" onClick={() => cargar({ conMeta: false })}><Icon name="refresh" size={16} /> Releer (se pierde lo no guardado)</button>}
            <span className="hint">{sucio ? "Hay cambios sin guardar." : datos?.negocio?.actualizado ? `Guardado${datos.negocio.por ? ` por ${datos.negocio.por}` : ""} · ${cuando(datos.negocio.actualizado)}` : "Todavía sin guardar."}</span>
          </div>
        )}
        <div aria-live="polite">
          {aviso && aviso.tipo !== "error" && <p role="status" className={`notice ${aviso.tipo === "ok" ? "notice-ok" : "notice-warn"}`}>{aviso.texto}</p>}
          {aviso?.tipo === "error" && <p role="alert" className="notice notice-error">{aviso.texto}</p>}
        </div>
      </section>

      {/*
        AQUÍ: VentasSemana — «Tus ventas de la semana» y la tasa de cierre MEDIDA (entrega 4, components/negocio/VentasSemana.jsx).
        Se monta en este sitio, entre los números y las calculadoras, en su propio chunk:
          const VentasSemana = lazy(() => import("./VentasSemana"));
          <Suspense fallback={null}><VentasSemana clientId={client.id} cliente={client} lectura={lectura} /></Suspense>
        La tasa medida entra en las cuentas por `conTasaMedida(negocio, medida)` (src/lib/numerosNegocio.js): el GET de
        /negocio ya devuelve `medida` (null hasta la entrega 4) y `cargar()` la aplica al abrir. Si VentasSemana la
        calcula en la pantalla, que la pase con una prop (`onTasaMedida`) y aquí se aplica igual sobre el formulario.
      */}

      {/* ---- Cuánto invertir ---- */}
      <section className="card" aria-labelledby={`${ids}-objetivo`}>
        <h3 id={`${ids}-objetivo`} className="crear-titulo">Cuánto invertir</h3>
        <p className="hint" style={{ marginTop: 0 }}>Con la meta de ventas, el ticket y el % de cada venta que se invierte: lo que se está dispuesto a pagar.</p>
        <dl className="nn-cifras">
          <Cifra nombre="Ventas necesarias" valor={o.ventasNecesarias !== null ? f.entero(Math.ceil(o.ventasNecesarias - 1e-9)) : "—"} />
          <Cifra nombre="Costo por compra objetivo" valor={f.dinero(o.costoCompra)} />
          <Cifra nombre="Inversión del mes" valor={f.dinero(o.inversion)} fuerte />
          <Cifra nombre="ROAS objetivo" valor={f.veces(o.roas)} />
          <Cifra nombre="Costo por conversación objetivo" valor={f.dinero(o.costoConversacion)} nota={`con una tasa de cierre del ${f.pct(o.tasaCierre)}`} />
        </dl>
        {o.faltan.length > 0 && <p className="hint">Para la cuenta entera falta: {faltanTexto(o.faltan)}.</p>}
        {o.avisos.map((a) => <p key={a.codigo} className="notice notice-warn">{a.texto}</p>)}
        {reparto.length > 0 && (
          <>
            <p className="label" style={{ marginTop: "var(--sp-3)" }}>Por etapa del ciclo de ventas</p>
            <ul className="nn-reparto">
              {reparto.map((r) => <li key={r.id}><span>{r.nombre}</span><span>{f.pct(r.pct)} · {f.dinero(r.monto)}</span></li>)}
            </ul>
            {negocio.cuenta === "nueva" && <p className="hint">Cuenta nueva: se arranca con presentación y evaluación.</p>}
          </>
        )}
      </section>

      {/* ---- El equilibrio ---- */}
      <section className="card" aria-labelledby={`${ids}-eq`}>
        <h3 id={`${ids}-eq`} className="crear-titulo">El equilibrio</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          A partir de qué número se pierde dinero · {MODOS_EQUILIBRIO.find((m) => m.id === modoUsado)?.nombre}
          {destinoNombre ? ` (${destinoNombre})` : ""}.
        </p>
        <dl className="nn-cifras">
          <Cifra nombre="Margen efectivo" valor={f.pct(e.margenEfectivo)} nota="después de ITBMS y devoluciones" />
          <Cifra nombre="Piso" valor={f.veces(e.piso)} nota="sin contar los fijos: por debajo, cada dólar de pauta pierde" />
          <Cifra nombre="ROAS de equilibrio" valor={f.veces(e.roas)} fuerte />
          <Cifra nombre="CAC de equilibrio" valor={f.dinero(e.cac)} nota="lo máximo por cliente" />
          <Cifra nombre="Costo por conversación de equilibrio" valor={f.dinero(e.costoConversacion)} nota={`con una tasa de cierre del ${f.pct(e.tasaCierre)}`} />
          <Cifra nombre="Con un presupuesto de" valor={f.dinero(e.presupuesto)}
            nota={e.presupuestoDe === "objetivo" ? "la inversión que pide la meta (no hay presupuesto escrito)" : e.presupuestoDe ? "el del mes" : ""} />
        </dl>
        {e.faltan.length > 0 && <p className="hint">Para calcularlo falta: {faltanTexto(e.faltan)}.</p>}
        {e.pisoManda && <p className="hint">Las ventas de otros canales ya pagan los costos fijos: a la pauta sólo se le pide pagarse sola (el piso).</p>}
        {e.cargaTodosLosFijos && (
          <p className="notice notice-warn">Así sale el caso más exigente: la pauta carga sola todos los costos fijos. Añade las ventas de tienda u otros canales, o deja los fijos en 0 para ver el piso.</p>
        )}
        {e.roas !== null && (
          <div className="nn-ensayo">
            <div className="field nn-campo-corto">
              <label className="label" htmlFor={`${ids}-roas`}>Si se logra un ROAS de</label>
              <input id={`${ids}-roas`} className="input" type="text" inputMode="decimal" value={roasPrueba} placeholder={aTexto(roasEnsayo)}
                onChange={(ev) => setRoasPrueba(ev.target.value)} />
            </div>
            {ensayo && (
              <p role="status" className="nn-ensayo-texto" data-signo={ensayo.utilidad >= 0 ? "mas" : "menos"}>
                {ensayo.utilidad >= 0 ? "Se ganan" : "Se pierden"} <strong>{f.dinero(Math.abs(ensayo.utilidad))}</strong> al mes ·
                ventas por pauta {f.dinero(ensayo.ventas)} · {f.entero(ensayo.clientes)} clientes a {f.dinero(ensayo.cac)}
                {ensayo.conversaciones !== null ? ` · ${f.entero(ensayo.conversaciones)} conversaciones a ${f.dinero(ensayo.costoConversacion)}` : ""}
              </p>
            )}
          </div>
        )}
        {tabla && (
          <details className="nn-tabla-plegable">
            <summary>La utilidad del mes según el presupuesto y el {tabla.eje === "costo" ? "costo por conversación" : "ROAS"}</summary>
            <div className="nn-tabla-caja" tabIndex={0} role="region" aria-label="Tabla de utilidad (se desliza)">
              <table className="nn-tabla">
                <caption className="sr-only">Utilidad mensual por presupuesto (columnas) y {tabla.eje === "costo" ? "costo por conversación" : "ROAS"} (filas)</caption>
                <thead>
                  <tr>
                    <th scope="col">{tabla.eje === "costo" ? "Costo / conv." : "ROAS"}</th>
                    {tabla.columnas.map((c, i) => <th key={i} scope="col" data-actual={c.actual ? "si" : undefined}>{f.redondo(c.presupuesto)}{c.actual ? " (el de hoy)" : ""}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tabla.filas.map((fila, i) => (
                    <tr key={i} data-actual={fila.actual ? "si" : undefined}>
                      <th scope="row">{tabla.eje === "costo" ? f.dinero(fila.valor) : f.veces(fila.valor)}</th>
                      {fila.celdas.map((u, j) => <td key={j} data-signo={u >= 0 ? "mas" : "menos"} data-actual={fila.actual && tabla.columnas[j].actual ? "si" : undefined}>{f.redondo(u)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">Verde, se gana; rojo, se pierde. La fila marcada es la más cercana al objetivo.</p>
          </details>
        )}
      </section>

      {/* ---- Simular ---- */}
      <section className="card" aria-labelledby={`${ids}-sim`}>
        <div className="nn-cabecera">
          <h3 id={`${ids}-sim`} className="crear-titulo">Simular</h3>
          <div className="field nn-campo-corto">
            <label className="label" htmlFor={`${ids}-simm`}>Qué se simula</label>
            <select id={`${ids}-simm`} className="input" value={modoSim} onChange={(ev) => setSimModo(ev.target.value)}>
              {MODOS_SIMULADOR.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>{datos?.lectura ? "Prellenado con lo que hizo la cuenta en los últimos 30 días; cámbialo para probar." : "Escribe las métricas (las de su cuenta, o las de un cliente parecido)."}</p>
        <div className="nn-sim-entradas">
          {defSim.campos.map((c) => {
            const def = CAMPOS_SIMULADOR[c];
            const id = `${ids}-s-${c}`;
            const editado = simTextos[modoSim]?.[c] !== undefined;
            return (
              <div key={c} className="field">
                <label className="label" htmlFor={id}>{def.nombre}{def.unidad === "%" ? " (%)" : def.unidad === "dinero" ? ` (${moneda})` : ""}</label>
                <input id={id} className="input" type="text" inputMode="decimal" autoComplete="off" value={textoSim(c)}
                  onChange={(ev) => setSimTextos((s) => ({ ...s, [modoSim]: { ...(s[modoSim] ?? {}), [c]: ev.target.value } }))} />
                {!editado && prellenado.origen[c] === "meta" && <Origen origen="meta" />}
                {!editado && prellenado.origen[c] === "negocio" && <span className="nn-origen" data-origen="agencia">De los números de arriba</span>}
              </div>
            );
          })}
        </div>
        {simTextos[modoSim] && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSimTextos((s) => ({ ...s, [modoSim]: undefined }))}>
            <Icon name="undo" size={14} /> Volver a lo de la cuenta
          </button>
        )}
        <div className="nn-tabla-caja" tabIndex={0} role="region" aria-label="Escenarios del simulador">
          <table className="nn-tabla nn-tabla-sim">
            <caption className="sr-only">Resultados de los tres escenarios</caption>
            <thead>
              <tr><th scope="col">Resultado</th>{filasSim.map((x) => <th key={x.id} scope="col">{x.nombre}</th>)}</tr>
            </thead>
            <tbody>
              {filasSim[1].filas.map((fila, i) => (
                <tr key={fila.id} data-principal={fila.id === defSim.principal ? "si" : undefined}>
                  <th scope="row">{fila.nombre}</th>
                  {filasSim.map((x) => {
                    const v = x.filas[i].valor;
                    return <td key={x.id}>{fila.unidad === "dinero" ? f.dinero(v) : fila.unidad === "veces" ? f.veces(v) : f.entero(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Conservador: {filasSim[0].como}. Optimista: {filasSim[2].como}.</p>
      </section>
    </div>
  );
}
