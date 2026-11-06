import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { MONTHS, FORMATS, DAYS_SHORT } from "../../constants";
import { uid } from "../../utils";
import { fechaEnZona } from "../../lib/agenda";
import { yoActual } from "../../lib/sesionActual";
import {
  PASOS_MES, PASO_MES, pasoQueToca, estadoDelMes, avanceDelMes, casillasDelMes, publicacionDeCasilla, conCasillas, conAsistente,
  limpiarAsistente, horasEnBloque, paraDisenar,
} from "../../lib/asistenteMes";
import { semanasDelPlan, unoPorSemana } from "../../lib/planMes";
import { limpiarEstrategia, estrategiaDelCalendario } from "../../lib/estrategiaMes";
import { PasoEstrategia, EtapaSemana, BalanceDelMes, AyudaEtapas } from "../EstrategiaMes";
import { leerPlantillas } from "../../lib/plantillasApi";
import { semanaDelCliente, lineasDeLaSemana, ritmoDelCliente, notasDelCliente, horaCorta } from "../../lib/planSemanal";
import { sugerenciasDeTemporada, ritmoDelMes, asignarMatriz, fechaCorta, nombreDePilar, CAMPOS_MATRIZ } from "../../lib/pilares";
import { fechasDelMes } from "../../lib/fechasEspeciales";
import { leerMercado } from "../../lib/mercado";
import { productosParaPlan, limpiarEstudio } from "../../lib/estudioMercado";
import { conNotasDelDia } from "../../lib/notasSemana";
import { casillasSinIdea, ideasDelPlan, rellenarConIdea } from "../../lib/ideaPublicacion";
import { avisoDeLoQueFalta } from "../../lib/materialTipo";
import { ideasDeRevision } from "../../lib/revisionIdeas";
import { semanaDelMes } from "../../lib/semanas";
import { mediosDe } from "../../lib/publicacion";
import { costoDeReels, lanzarReelDelMes, reelsLanzados, apuntarReels } from "../../lib/asistenteMesApi";
import { TimePicker } from "./primitivas";
import "./RevisionMes.css";
import "./AsistenteMes.css";

// ============================================================
// EL ASISTENTE DEL MES: el mes en un solo flujo (fase 6)
//
// El botón grande del calendario. Cinco pasos en una sola pantalla, con su
// avance arriba (lib/asistenteMes.js): Estrategia → Plan → Ideas → Diseñar →
// Revisar y enviar. Reúne lo que antes eran cinco puertas: «Planificar mes»,
// «Revisar las ideas», «Diseñar las que ya hay» (y ahora también los REELS),
// «Guiones para grabar», «Completar los textos» y «Revisar el mes».
//
// SE GUARDA EN EL CALENDARIO, no en el navegador: la estrategia en sus campos
// de siempre, el plan como publicaciones (casillas sin idea), las ideas al
// llegar cada tanda (lo pagado no se pierde), la aprobación interna en cada
// publicación y lo del asistente en `opciones.asistente`. Otra persona del
// equipo (o la misma en el teléfono) lo retoma donde está: se abre en el paso
// que le toca al mes (`pasoQueToca`). Todo lo escribe `escribir(cambiar)`, que
// parte del calendario MÁS NUEVO (lo de otras personas no se pisa) y va por el
// guardado agrupado de siempre (y sus avisos de tiempo real).
//
// Diseñar no escribe el calendario desde aquí: lo hace el SERVIDOR al terminar
// cada encargo (se ponen solas, worker/lib/estudio/ponerEnPost.js). Por eso en
// ese paso no se guarda nada más: un guardado del mes entero podría pisarlo.
// ============================================================

const RevisarIdeas = lazy(() => import("./RevisarIdeas"));
const ProducirMes = lazy(() => import("./ProducirMes"));
const RevisionMes = lazy(() => import("./RevisionMes"));
const PlanSemanal = lazy(() => import("./PlanSemanal"));
const GuionesParaGrabar = lazy(() => import("./GuionesParaGrabar"));

const cargando = (texto = "Cargando…") => <p className="hint" role="status">{texto}</p>;
const dos = (n) => String(n).padStart(2, "0");
const nada = () => {};

export default function AsistenteMes({
  client, cal, escribir, onGuardarPlan, onCompletarTextos, completando = false, estadoCompletar = "", onEnviar, onAbrirPost, onArreglar,
  onProducirEnLote, onPlanificarAMano, onClose, pasoInicial = null,
}) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  // El paso que le toca al mes (lo que falta), salvo que se abra en uno («Revisar» o «Diseñar» del envío).
  const [paso, setPaso] = useState(() => pasoInicial ?? pasoQueToca(cal));
  const mesNombre = `${MONTHS[cal.month]} ${cal.year}`;
  const avance = avanceDelMes(cal);
  const a = limpiarAsistente(cal.opciones?.asistente);
  const por = yoActual()?.nombre || "";
  const ir = (n) => {
    setPaso(n);
    ref.current?.querySelector(".sheet-body")?.scrollTo?.({ top: 0 });
  };
  /** Un hito del asistente queda en el calendario (el paso al que se llegó y quién): así se retoma desde otro lado. */
  const conHito = (c, n, extra = {}) => conAsistente(c, { ...extra, paso: n }, { por });

  const guardarEstrategia = (e) => {
    escribir((c) => conHito({
      ...c, campaign: e.campaign, offers: e.offers, promoCode: e.promoCode, weekConcepts: e.weekConcepts,
      opciones: { ...(c.opciones ?? {}), estrategia: e.estrategia },
    }, PASO_MES.plan));
    ir(PASO_MES.plan);
  };
  const ponerPlan = (publicaciones, extra) => {
    escribir((c) => conHito(conCasillas(c, publicaciones), PASO_MES.ideas, extra));
    ir(PASO_MES.ideas);
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet asistente-mes" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Producir {mesNombre.toLowerCase()}</h2>
            <p className="hint" style={{ margin: 0 }}>
              De la estrategia al envío, en orden. Se guarda en el calendario: lo retoma cualquiera del equipo.
              {a.por ? ` Último paso guardado por ${a.por}.` : ""}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <nav className="asistente-mes-pasos" aria-label="Pasos del mes">
          <ol>
            {PASOS_MES.map((p, i) => (
              <li key={p.id}>
                <button type="button" aria-current={i === paso ? "step" : undefined} onClick={() => ir(i)}>
                  <span className="asistente-mes-num" aria-hidden="true">{i + 1}</span>
                  <span className="asistente-mes-nombre">{p.nombre}</span>
                  <span className="asistente-mes-avance">{avance[i]}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="sheet-body">
          {paso === PASO_MES.estrategia && <PasoEstrategiaMes client={client} cal={cal} onGuardar={guardarEstrategia} />}
          {paso === PASO_MES.plan && (
            <PasoPlan client={client} cal={cal} onGuardarPlan={onGuardarPlan} onPoner={ponerPlan}
              onPlanificarAMano={onPlanificarAMano} onProducirEnLote={onProducirEnLote} onSeguir={() => ir(PASO_MES.ideas)} />
          )}
          {paso === PASO_MES.ideas && (
            <PasoIdeas client={client} cal={cal} escribir={escribir} onCompletarTextos={onCompletarTextos}
              completando={completando} estadoCompletar={estadoCompletar} />
          )}
          {paso === PASO_MES.disenar && <PasoDisenar client={client} cal={cal} escribir={escribir} />}
          {paso === PASO_MES.enviar && (
            <PasoEnviar client={client} cal={cal} escribir={escribir} onEnviar={onEnviar} onAbrirPost={onAbrirPost} onArreglar={onArreglar} />
          )}
        </div>

        <div className="sheet-footer">
          <button type="button" className="btn btn-secondary" disabled={paso === 0} onClick={() => ir(paso - 1)}>
            <Icon name="chevronLeft" size={16} /> Anterior
          </button>
          <span className="hint asistente-mes-donde">Paso {paso + 1} de {PASOS_MES.length}</span>
          {paso < PASOS_MES.length - 1
            ? <button type="button" className="btn btn-primary" onClick={() => ir(paso + 1)}>Siguiente: {PASOS_MES[paso + 1].nombre} <Icon name="chevronRight" size={16} /></button>
            : <button type="button" className="btn btn-primary" onClick={onClose}>Terminar</button>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 1. Estrategia: precargada del mes (o del anterior) y UNA sola IA
// ------------------------------------------------------------

function PasoEstrategiaMes({ client, cal, onGuardar }) {
  const ids = useId();
  const semanas = useMemo(() => semanasDelPlan(cal.year, cal.month), [cal.year, cal.month]);
  // Precargada: la de este mes; si no tiene, el objetivo y el foco del mes anterior (lo demás cambia cada mes).
  const anterior = (client.calendars ?? []).find((k) => (cal.month === 0 ? k.year === cal.year - 1 && k.month === 11 : k.year === cal.year && k.month === cal.month - 1));
  const e0 = limpiarEstrategia(cal.opciones?.estrategia) ?? limpiarEstrategia(anterior?.opciones?.estrategia);
  const [objetivo, setObjetivo] = useState(e0?.objetivo ?? "");
  const [focoId, setFocoId] = useState(e0?.focoId ?? "");
  const [campaign, setCampaign] = useState(cal.campaign ?? "");
  const [offers, setOffers] = useState(cal.offers ?? "");
  const [promoCode, setPromoCode] = useState(cal.promoCode ?? "");
  const [conceptos, setConceptos] = useState(() => unoPorSemana(cal.weekConcepts, semanas.length));
  const [etapas, setEtapas] = useState(() => unoPorSemana(limpiarEstrategia(cal.opciones?.estrategia)?.etapas, semanas.length));
  const [razon, setRazon] = useState(e0?.razon ?? "");
  const [propuesta, setPropuesta] = useState(null);
  const [mercado, setMercado] = useState(null);
  useEffect(() => {
    let vivo = true;
    leerMercado(client.dbId || client.id).then((m) => { if (vivo) setMercado(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [client.dbId, client.id]);
  const productos = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);

  /** Lo que propone la IA se aplica entero (se puede deshacer): objetivo, foco, campaña, conceptos y etapas. */
  const aplicar = (r) => {
    const e = r?.estrategia;
    if (!e) return;
    const antes = { objetivo, focoId, campaign, conceptos, etapas, razon };
    setObjetivo(e.objetivo || objetivo);
    setFocoId(focoId || e.focoId || "");
    if (e.campana) setCampaign(e.campana);
    setConceptos((prev) => prev.map((c, i) => e.semanas?.[i]?.concepto || c));
    setEtapas(conceptos.map((_, i) => e.semanas?.[i]?.etapa || etapas[i] || ""));
    setRazon(e.razon || razon);
    setPropuesta({ razon: e.razon, ofertas: e.ofertas, mejores: r.mejores ?? [], antes });
  };
  const deshacer = () => {
    const x = propuesta?.antes;
    if (!x) return;
    setObjetivo(x.objetivo); setFocoId(x.focoId); setCampaign(x.campaign); setConceptos(x.conceptos); setEtapas(x.etapas); setRazon(x.razon);
    setPropuesta((p) => ({ ...p, antes: null }));
  };
  const guardar = () => onGuardar({
    campaign, offers, promoCode, weekConcepts: conceptos,
    estrategia: limpiarEstrategia({ objetivo, focoId, foco: productos.find((p) => p.id === focoId)?.nombre ?? "", razon, etapas }),
  });

  return (
    <div className="asistente-mes-paso">
      {/* Las ofertas ANTES de la estrategia: la IA las lee. */}
      <div className="asistente-mes-fila">
        <div className="field">
          <label className="label" htmlFor={`${ids}-of`}>Ofertas del mes (sólo las reales)</label>
          <textarea id={`${ids}-of`} className="textarea" style={{ minHeight: 64 }} value={offers} onChange={(e) => setOffers(e.target.value)}
            placeholder="Ej.: 15 % en sofás cama hasta el 30" />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-cod`}>Código de descuento</label>
          <input id={`${ids}-cod`} className="input" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      <PasoEstrategia client={client} month={cal.month} year={cal.year} objetivo={objetivo} setObjetivo={setObjetivo} focoId={focoId}
        setFocoId={setFocoId} productos={productos} campaign={campaign} setCampaign={setCampaign} offers={offers} semanas={semanas}
        propuesta={propuesta} onPropuesta={aplicar} onDeshacer={deshacer} />
      <fieldset className="asistente-mes-semanas">
        <legend className="label">Cada semana (las filas del calendario)</legend>
        {semanas.map((s, i) => (
          <div key={s.n} className="asistente-mes-semana">
            <label className="label" htmlFor={`${ids}-s${i}`}>Semana {s.n} · {fechaCorta(s.desde)} a {fechaCorta(s.hasta)}</label>
            <div className="asistente-mes-semana-fila">
              <input id={`${ids}-s${i}`} className="input" value={conceptos[i] ?? ""} placeholder="El concepto de la semana"
                onChange={(e) => setConceptos((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
              <EtapaSemana semana={s.n} valor={etapas[i] ?? ""} onCambiar={(v) => setEtapas((l) => l.map((x, j) => (j === i ? v : x)))} />
            </div>
          </div>
        ))}
        <AyudaEtapas />
      </fieldset>
      <div className="asistente-mes-acciones">
        <button type="button" className="btn btn-primary" onClick={guardar}><Icon name="check" size={16} /> Guardar la estrategia y seguir</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 2. Plan: del plan semanal de la empresa, con las fechas y la temporada
// ------------------------------------------------------------

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

function PasoPlan({ client, cal, onGuardarPlan, onPoner, onPlanificarAMano, onProducirEnLote, onSeguir }) {
  const ids = useId();
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(false);
  const a = limpiarAsistente(cal.opciones?.asistente);
  const [aceptadas, setAceptadas] = useState(a.aceptadas);
  const [llenar, setLlenar] = useState(a.llenarOcupados);
  const [mercado, setMercado] = useState(undefined);
  useEffect(() => { leerPlantillas().catch(() => []).then(setLista); }, []);
  useEffect(() => {
    let vivo = true;
    leerMercado(client.dbId || client.id).then((m) => { if (vivo) setMercado(m); }).catch(() => { if (vivo) setMercado(null); });
    return () => { vivo = false; };
  }, [client.dbId, client.id]);

  const { year, month } = cal;
  const mes = `${year}-${dos(month + 1)}`;
  const hoy = fechaEnZona();
  const pasado = mes < hoy.slice(0, 7);
  const semana = useMemo(() => (lista ? semanaDelCliente(client, lista) : null), [client, lista]);
  const lineas = lista ? lineasDeLaSemana(client, lista) : {};
  const notas = notasDelCliente(client) ?? {};
  const todasLasFechas = useMemo(() => fechasDelMes(year, month, client.fechasEspeciales), [year, month, client.fechasEspeciales]);
  const fechas = todasLasFechas.filter((f) => f.destacada || f.tipo !== "internacional");
  const ritmo = ritmoDelCliente(client);
  const sugerencias = useMemo(() => sugerenciasDeTemporada({ year, month, ritmo, fechas: todasLasFechas }), [year, month, ritmo, todasLasFechas]);
  const ocupados = useMemo(() => new Set((cal.days ?? []).filter((d) => (d.posts ?? []).length).map((d) => d.date)), [cal.days]);
  const casillas = semana ? casillasDelMes({
    year, month, semana, ritmoMes: ritmoDelMes(year, month, ritmo, aceptadas), ocupados, llenarOcupados: llenar,
    desde: mes === hoy.slice(0, 7) ? hoy : "", fechas: fechas.map((f) => ({ fecha: f.fecha, nombre: f.delicada ? `${f.nombre} (fecha delicada: sin promociones)` : f.nombre })),
  }) : [];
  const porSemana = casillas.reduce((m, c) => { const n = semanaDelMes(c.fecha); (m[n] = m[n] ?? []).push(c); return m; }, {});
  const aceptada = (s) => aceptadas.some((x) => x.fecha === s.fecha);

  /** La matriz (producto, nivel, deseo, perfil) sobre el plan ENTERO, como «Planificar mes»; la nota del día manda su producto. */
  const poner = () => {
    const general = limpiarEstudio(mercado?.estudio)?.general;
    const productos = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);
    const conNotas = conNotasDelDia(casillas.map((c) => ({ clave: c.clave, fecha: c.fecha, pilar: c.pilar })), notas, productos)
      .map(({ notaDia: _n, fecha: _f, ...c }) => c);
    const foco = limpiarEstrategia(cal.opciones?.estrategia)?.focoId ?? "";
    const matriz = new Map(asignarMatriz(conNotas, { productos, deseos: general?.deseos ?? [], perfiles: general?.perfiles ?? [], foco })
      .map(({ clave, ...m }) => [clave, Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, m[k] ?? ""]))]));
    onPoner(
      casillas.map((c) => ({ fecha: c.fecha, especial: c.especial ?? "", post: publicacionDeCasilla(c, { id: uid(), matriz: matriz.get(c.clave) ?? {} }) })),
      { aceptadas: aceptadas.map((s) => ({ id: s.id, fecha: s.fecha, de: s.de, a: s.a, motivo: s.motivo })), llenarOcupados: llenar },
    );
  };

  return (
    <div className="asistente-mes-paso">
      <section className="asistente-mes-bloque" aria-labelledby={`${ids}-sem`}>
        <div className="asistente-mes-bloque-cabeza">
          <h3 id={`${ids}-sem`}>El plan semanal de {client.name}</h3>
          {onGuardarPlan && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando(true)}><Icon name="pencil" size={14} /> Editar el plan semanal</button>}
        </div>
        <p className="hint" style={{ margin: 0 }}>Formato, tipo, hora y nota de cada día, fijo todos los meses: de aquí salen las publicaciones del mes.</p>
        {!lista ? cargando() : (
          <ul className="asistente-mes-semana-plan">
            {ORDEN_DIAS.map((dow) => (
              <li key={dow}>
                <strong>{DAYS_SHORT[dow]}</strong>
                <span>{(lineas[dow] ?? []).join(" · ") || <span className="hint">No se publica</span>}</span>
                {notas[dow] && <span className="hint">Tema: {notas[dow]}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {fechas.length > 0 && (
        <section className="asistente-mes-bloque" aria-labelledby={`${ids}-fe`}>
          <h3 id={`${ids}-fe`}>Fechas especiales de {MONTHS[month].toLowerCase()}</h3>
          <ul className="asistente-mes-chips">
            {fechas.map((f) => <li key={f.id ?? f.fecha + f.nombre} data-delicada={f.delicada || undefined}>{fechaCorta(f.fecha)} · {f.nombre}{f.delicada ? " (sin promociones)" : ""}</li>)}
          </ul>
        </section>
      )}

      {sugerencias.length > 0 && (
        <fieldset className="asistente-mes-bloque">
          <legend className="label">Ajustes de temporada (opcionales)</legend>
          {sugerencias.map((s) => (
            <label key={s.id} className="asistente-mes-casilla">
              <input type="checkbox" checked={aceptada(s)} onChange={(e) => setAceptadas((l) => (e.target.checked ? [...l, s] : l.filter((x) => x.fecha !== s.fecha)))} />
              {fechaCorta(s.fecha)}: {nombreDePilar(s.de)} → {nombreDePilar(s.a)} <span className="hint">({s.motivo})</span>
            </label>
          ))}
        </fieldset>
      )}

      <section className="asistente-mes-bloque" aria-labelledby={`${ids}-pl`}>
        <h3 id={`${ids}-pl`}>Lo que entra en el calendario</h3>
        {pasado && <p className="notice notice-warn" style={{ display: "block" }}>Este mes ya pasó: el plan no pone nada en él.</p>}
        {ocupados.size > 0 && (
          <label className="asistente-mes-casilla">
            <input type="checkbox" checked={llenar} onChange={(e) => setLlenar(e.target.checked)} />
            Añadir también en los {ocupados.size} días que ya tienen publicaciones (si no, el plan sólo llena los días libres)
          </label>
        )}
        {lista && !casillas.length && !pasado && (
          <p className="revision-vacio"><Icon name="checkCircle" size={18} /> {ocupados.size ? "Los días del plan ya tienen sus publicaciones." : "El plan semanal no tiene publicaciones: edítalo arriba."}</p>
        )}
        {!pasado && Object.entries(porSemana).map(([n, l]) => (
          <div key={n} className="asistente-mes-plan-semana">
            <p className="label" style={{ margin: 0 }}>Semana {n}</p>
            <ul>
              {l.map((c) => (
                <li key={c.clave}>
                  <span>{fechaCorta(c.fecha)}</span>
                  <span>{c.rostro ? "UGC" : FORMATS[c.format]?.label ?? c.format}</span>
                  <span>{nombreDePilar(c.pilar)}</span>
                  {c.hora && <span className="hint">{horaCorta(c.hora)}</span>}
                  {c.especial && <span className="hint">· {c.especial}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div className="asistente-mes-acciones">
        {!pasado && casillas.length > 0 && (
          <button type="button" className="btn btn-primary" disabled={mercado === undefined} onClick={poner}>
            <Icon name="calendar" size={16} /> {mercado === undefined ? "Leyendo el catálogo…" : `Poner las ${casillas.length} en el calendario`}
          </button>
        )}
        {(pasado || !casillas.length) && <button type="button" className="btn btn-primary" onClick={onSeguir}>Seguir con las ideas</button>}
        <p className="hint" style={{ margin: 0, flexBasis: "100%" }}>
          Entran como ideas sin escribir (su formato, su tipo, su hora y su producto): el paso siguiente las escribe. Nada se cobra aquí.
        </p>
        <details className="asistente-mes-mas">
          <summary className="hint">Otras formas de planificar</summary>
          <div className="asistente-mes-acciones">
            {onPlanificarAMano && <button type="button" className="btn btn-ghost btn-sm" onClick={onPlanificarAMano}>Planificar a mano (día por día, con plantillas propias)</button>}
            {onProducirEnLote && !pasado && <button type="button" className="btn btn-ghost btn-sm" onClick={onProducirEnLote}>Crear el mes entero en lote en el Estudio</button>}
          </div>
        </details>
      </div>

      {editando && (
        <Suspense fallback={null}>
          <PlanSemanal client={client} onGuardar={onGuardarPlan} onClose={() => setEditando(false)} />
        </Suspense>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 3. Ideas: el motor del servidor y la aprobación interna en la misma lista
// ------------------------------------------------------------

/** Lo que trae una idea del motor, puesto en su publicación (sólo rellena; la matriz, si la publicación no la tenía). */
function conIdea(p, idea) {
  const extra = Object.fromEntries(["productoId", "producto", "nivel", "deseo", "perfil", "pilarSub"].filter((k) => idea[k] && !p[k]).map((k) => [k, idea[k]]));
  return { ...p, ...rellenarConIdea(p, idea).cambios, ...extra };
}

function PasoIdeas({ client, cal, escribir, onCompletarTextos, completando, estadoCompletar }) {
  const clienteId = client.dbId || client.id;
  const [estado, setEstado] = useState({ cargando: false, texto: "", error: "" });
  const generando = useRef(false);
  const sinIdea = casillasSinIdea(cal);
  // La lista de la aprobación sólo con ideas escritas (las casillas sin idea se escriben arriba).
  const hayIdeas = ideasDeRevision(cal).length > 0;
  const e = limpiarEstrategia(cal.opciones?.estrategia);
  const semanas = semanasDelPlan(cal.year, cal.month);
  const calVivo = useRef(cal);
  useEffect(() => { calVivo.current = cal; }, [cal]);
  // La función de escribir MÁS NUEVA: las tandas vuelven tarde y, si el mes no tenía cajón al empezar, ya lo tiene.
  const escribirVivo = useRef(escribir);
  useEffect(() => { escribirVivo.current = escribir; }, [escribir]);

  /**
   * Las ideas del mes por el MOTOR del servidor (modo «plan»: la marca, el catálogo, el estudio de mercado, el cerebro, la
   * estrategia del mes y la nota de cada día), de 6 en 6. Cada tanda se guarda en el calendario EN CUANTO llega: cerrar
   * a la mitad no pierde lo pagado, y la siguiente vez sólo se escriben las que falten.
   */
  const escribirIdeas = async () => {
    if (generando.current) return;
    generando.current = true;
    const casillas = casillasSinIdea(calVivo.current);
    let usados = (calVivo.current.days ?? []).flatMap((d) => (d.posts ?? []).map((p) => String(p.title || p.idea || "").trim().slice(0, 80))).filter(Boolean).slice(0, 30);
    const semilla = Math.floor(Math.random() * 1000);
    const faltan = new Set();
    let escritas = 0;
    setEstado({ cargando: true, texto: "Preparando…", error: "" });
    try {
      for (let desde = 0, total = casillas.length; desde < total; desde += 6) {
        setEstado({ cargando: true, texto: `Ideas ${desde + 1}–${Math.min(desde + 6, total)} de ${total}…`, error: "" });
        const r = await ideasDelPlan(clienteId, { casillas, estrategia: estrategiaDelCalendario(calVivo.current), usados: usados.slice(0, 30), semilla, desde, tamano: 6 });
        total = r.total ?? total;
        for (const k of r.faltan ?? []) faltan.add(k);
        const porId = Object.fromEntries((r.ideas ?? []).map((i) => [i.clave, i]));
        if (Object.keys(porId).length) {
          escribirVivo.current((c) => ({ ...c, days: (c.days ?? []).map((d) => ({ ...d, posts: (d.posts ?? []).map((p) => (porId[p.id] && !String(p.idea ?? "").trim() ? conIdea(p, porId[p.id]) : p)) })) }));
          escritas += Object.keys(porId).length;
          usados = [...(r.ideas ?? []).map((i) => i.titular || i.titulo).filter(Boolean), ...usados];
        }
      }
      const falta = avisoDeLoQueFalta([...faltan]);
      setEstado({ cargando: false, texto: escritas ? `Listo: ${escritas} ${escritas === 1 ? "idea escrita" : "ideas escritas"}. Revísalas abajo.${falta ? ` ${falta}` : ""}` : "La IA no devolvió ideas que se puedan leer. Inténtalo otra vez.", error: "" });
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (err) {
      // Lo que llegó antes del fallo ya está guardado en el calendario.
      setEstado({ cargando: false, texto: "", error: `${err.message}${escritas ? ` (las ${escritas} que llegaron ya están guardadas)` : ""}` });
    } finally {
      generando.current = false;
    }
  };

  return (
    <div className="asistente-mes-paso">
      {sinIdea.length > 0 && (
        <section className="notice asistente-mes-bloque" style={{ display: "block" }}>
          <p style={{ margin: 0 }}><strong>{sinIdea.length} {sinIdea.length === 1 ? "publicación del plan sin idea" : "publicaciones del plan sin idea"}.</strong></p>
          <p className="hint" style={{ margin: 0 }}>
            El motor de ideas escribe cada una con su formato, su tipo y la estrategia del mes: título, qué se ve, texto de la pieza o
            guion, caption y hashtags. Es texto (céntimos). Cada tanda se guarda al llegar.
          </p>
          <button type="button" className="btn btn-primary btn-sm" aria-disabled={estado.cargando} onClick={() => !estado.cargando && escribirIdeas()}>
            <Icon name="sparkles" size={14} /> {estado.cargando ? estado.texto : `Escribir las ${sinIdea.length} ideas`}
          </button>
        </section>
      )}
      <div role="status" aria-live="polite" className={estado.texto && !estado.cargando ? "hint" : "sr-only"}>{estado.cargando ? estado.texto : estado.texto}</div>
      {estado.error && <p role="alert" className="cerebro-error">{estado.error}</p>}

      <BalanceDelMes days={cal.days ?? []} semanas={semanas} objetivo={e?.objetivo ?? ""} foco={e?.foco ?? ""} />

      {hayIdeas && <Suspense fallback={cargando("Abriendo las ideas…")}>
        <RevisarIdeas incrustado client={client} cal={cal} onAplicar={(cambiar) => escribir((c) => ({ ...c, days: cambiar(c.days ?? []) }))} onClose={nada} />
      </Suspense>}
      {!hayIdeas && !sinIdea.length && <p className="revision-vacio"><Icon name="checkCircle" size={18} /> Este mes no tiene ideas por revisar: todo lo que tiene ya lleva su pieza (o está vacío; empieza por el plan).</p>}

      <details className="asistente-mes-mas">
        <summary className="hint">Más: completar los textos que faltan</summary>
        <p className="hint">Para las publicaciones con idea a las que les falta el caption, el guion, el texto de la pieza o los hashtags (sólo rellena).</p>
        <button type="button" className="btn btn-secondary btn-sm" disabled={completando || !onCompletarTextos} onClick={() => onCompletarTextos?.()}>
          <Icon name="sparkles" size={14} /> {completando ? estadoCompletar || "Escribiendo…" : "Completar los textos que faltan"}
        </button>
      </details>
    </div>
  );
}

// ------------------------------------------------------------
// 4. Diseñar las aprobadas: imágenes y carruseles, reels, y los UGC para grabar
// ------------------------------------------------------------

function PasoDisenar({ client, cal, escribir }) {
  const [grabar, setGrabar] = useState(false);
  const e = estadoDelMes(cal);
  const aplicar = (cambiar) => escribir((c) => ({ ...c, days: cambiar(c.days ?? []) }));
  return (
    <div className="asistente-mes-paso">
      <p className="hint" style={{ margin: 0 }}>
        Sólo las ideas APROBADAS (paso anterior). Lo lleva el servidor con el director y el control de calidad: puedes cerrar, y cada
        pieza se pone SOLA en su publicación al terminar (también queda en la galería).
      </p>
      {!e.porDisenar && e.porAprobar > 0 && (
        <p className="notice notice-warn" style={{ display: "block" }}>Todavía no hay ideas aprobadas: {e.porAprobar} esperan en el paso de las ideas.</p>
      )}
      <Suspense fallback={cargando("Abriendo el diseño…")}>
        <ProducirMes incrustado ponerSolas sinReels client={client} cal={cal}
          onPoner={(cambiar) => escribir((c) => ({ ...c, days: (c.days ?? []).map((d) => ({ ...d, posts: (d.posts ?? []).map(cambiar) })) }))} onClose={nada} />
      </Suspense>
      <ReelsDelMes client={client} cal={cal} />
      {e.paraGrabar > 0 && (
        <section className="asistente-mes-bloque">
          <h3>UGC para grabar · {e.paraGrabar}</h3>
          <p className="hint" style={{ margin: 0 }}>Los videos con rostro los graba una persona: el guion de cada uno en un mensaje, para la sesión de grabación.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGrabar(true)}><Icon name="video" size={14} /> Guiones para grabar</button>
        </section>
      )}
      {grabar && (
        <Suspense fallback={null}>
          <GuionesParaGrabar client={client} cal={cal} onAplicar={aplicar} onClose={() => setGrabar(false)} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Los REELS aprobados (hechos con IA, no los UGC), por el encargo del reel por planos de siempre: primero el costo (no
 * se crea nada), con el «sí» cada uno en su encargo, y lo que sale se pone SOLO en su publicación. La voz del montaje
 * se confirma aparte, con su costo, cuando el encargo llega a ella.
 */
function ReelsDelMes({ client, cal }) {
  const clienteId = client.dbId || client.id;
  const calId = cal.dbId || cal.id;
  const [lanzados, setLanzados] = useState(() => reelsLanzados(calId));
  const [segui, setSegui] = useState({}); // encargoId → encargo
  const candidatos = (cal.days ?? []).flatMap((d) => (d.posts ?? []).filter((p) => p.format === "reel" && !p.rostro && paraDisenar(p) && !mediosDe(p).length
    && !lanzados.some((l) => l.postId === p.id)).map((post) => ({ post, date: d.date })));
  const [marcados, setMarcados] = useState(null);
  const elegidos = candidatos.filter(({ post }) => (marcados ?? new Set(candidatos.map((c) => c.post.id))).has(post.id));
  const [costo, setCosto] = useState(null);
  const [montar, setMontar] = useState(true);
  const [estado, setEstado] = useState({ cargando: false, texto: "", error: "" });

  // Cómo van los lanzados (cada 5 s mientras alguno no ha terminado).
  useEffect(() => {
    if (!lanzados.length) return undefined;
    let vivo = true;
    let t = null;
    const mirar = async () => {
      const { leerEncargo } = await import("../../lib/encargosApi");
      const nuevos = {};
      for (const l of lanzados) {
        try { nuevos[l.encargoId] = (await leerEncargo(clienteId, l.encargoId))?.encargo ?? null; } catch { /* se mira otra vez */ }
      }
      if (!vivo) return;
      setSegui((m) => ({ ...m, ...nuevos }));
      if (Object.values(nuevos).some((e) => e?.estado === "en_marcha")) t = setTimeout(mirar, 5000);
    };
    void mirar();
    return () => { vivo = false; clearTimeout(t); };
  }, [lanzados, clienteId]);

  if (!candidatos.length && !lanzados.length) return null;

  const verCosto = async () => {
    setEstado({ cargando: true, texto: "Calculando…", error: "" });
    try {
      setCosto(await costoDeReels(clienteId, { calendarId: calId, postIds: elegidos.map((c) => c.post.id) }));
      setEstado({ cargando: false, texto: "", error: "" });
    } catch (e) {
      setEstado({ cargando: false, texto: "", error: e.message });
    }
  };
  const crear = async () => {
    const ok = (costo?.reels ?? []).filter((r) => !r.error);
    const nuevos = [...lanzados];
    setEstado({ cargando: true, texto: "", error: "" });
    for (const [i, r] of ok.entries()) {
      setEstado({ cargando: true, texto: `Escribiendo el guion y lanzando el reel ${i + 1} de ${ok.length}…`, error: "" });
      try {
        const x = await lanzarReelDelMes(clienteId, { calendarId: calId, postId: r.postId, montar });
        nuevos.push({ postId: r.postId, encargoId: x.encargoId });
        apuntarReels(calId, nuevos);
        setLanzados([...nuevos]);
      } catch (e) {
        setEstado({ cargando: false, texto: "", error: e.message });
        return;
      }
    }
    setCosto(null);
    setEstado({ cargando: false, texto: "Los reels se están creando en el servidor: puedes cerrar. Cada uno se pondrá solo en su publicación.", error: "" });
    window.dispatchEvent(new Event("ia:gasto"));
  };
  const confirmarVoz = async (encargoId) => {
    try {
      const { montarReel } = await import("../../lib/encargosApi");
      await montarReel(clienteId, encargoId, { automatico: true, confirmadoVoz: true });
      setLanzados((l) => [...l]);
    } catch (e) {
      setEstado({ cargando: false, texto: "", error: e.message });
    }
  };
  const titulo = (postId) => {
    for (const d of cal.days ?? []) {
      const p = (d.posts ?? []).find((x) => x.id === postId);
      if (p) return `${fechaCorta(d.date)} · ${String(p.title || p.idea || "Reel").slice(0, 60)}`;
    }
    return "Reel";
  };

  return (
    <section className="asistente-mes-bloque" aria-label="Reels del mes">
      <h3>Reels · {candidatos.length + lanzados.length}</h3>
      {candidatos.length > 0 && (
        <>
          <p className="hint" style={{ margin: 0 }}>Cada reel aprobado por planos: el storyboard, el video y el montaje con la voz de la marca, el gancho, los subtítulos y el logo. El guion sigue el de la publicación.</p>
          <ul className="revision-lista">
            {candidatos.map(({ post, date }) => {
              const r = costo?.reels?.find((x) => x.postId === post.id);
              return (
                <li key={post.id} className="revision-item">
                  <label className="revision-cabeza asistente-mes-casilla">
                    <input type="checkbox" checked={elegidos.some((c) => c.post.id === post.id)} disabled={estado.cargando}
                      onChange={(e) => { setCosto(null); setMarcados((s) => { const n = new Set(s ?? candidatos.map((c) => c.post.id)); if (e.target.checked) n.add(post.id); else n.delete(post.id); return n; }); }} />
                    <strong>{fechaCorta(date)}</strong>
                    <span className="hint">{String(post.title || post.idea || "").slice(0, 70)}</span>
                  </label>
                  {r && <p className="revision-problema">{r.error || `${r.planos} planos, ${r.segundos} s con ${r.modelo} · ${r.costoTexto}`}</p>}
                </li>
              );
            })}
          </ul>
          <label className="asistente-mes-casilla">
            <input type="checkbox" checked={montar} onChange={(e) => setMontar(e.target.checked)} /> Montarlos con la voz de la marca, el texto y el logo (la voz se confirma aparte, con su costo)
          </label>
          <div className="asistente-mes-acciones">
            {!costo
              ? <button type="button" className="btn btn-secondary btn-sm" disabled={!elegidos.length || estado.cargando} onClick={verCosto}>Ver el costo de {elegidos.length}</button>
              : (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={estado.cargando || !costo.reels.some((r) => !r.error)} onClick={crear}>
                    <Icon name="sparkles" size={14} /> Sí, crear {costo.reels.filter((r) => !r.error).length} por {costo.totalTexto} (aproximado)
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={estado.cargando} onClick={() => setCosto(null)}>No</button>
                </>
              )}
          </div>
        </>
      )}
      <div role="status" aria-live="polite" className={estado.texto ? "hint" : "sr-only"}>{estado.texto}</div>
      {estado.error && <p role="alert" className="cerebro-error">{estado.error}</p>}
      {lanzados.length > 0 && (
        <ul className="revision-lista">
          {lanzados.map((l) => {
            const e = segui[l.encargoId];
            const m = e?.reel?.montaje;
            return (
              <li key={l.encargoId} className="revision-item">
                <strong>{titulo(l.postId)}</strong>
                <p className="revision-problema">
                  {!e ? "Mirando…" : e.estado === "fallido" ? `Falló: ${e.error || e.nota}` : e.estado === "hecho" ? "Listo: está en su publicación." : e.nota || "Creándose en el servidor…"}
                </p>
                {m?.fase === "confirmar" && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => confirmarVoz(l.encargoId)}>
                    Sí, generar la voz del montaje{m.costoTexto ? ` por ${m.costoTexto}` : ""}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// 5. Revisar y enviar: las horas en bloque, la revisión del mes y el envío
// ------------------------------------------------------------

function PasoEnviar({ client, cal, escribir, onEnviar, onAbrirPost, onArreglar }) {
  const ids = useId();
  const [lista, setLista] = useState(null);
  const [porDefecto, setPorDefecto] = useState("09:00");
  const [aviso, setAviso] = useState("");
  useEffect(() => { leerPlantillas().catch(() => []).then(setLista); }, []);
  const semana = lista ? semanaDelCliente(client, lista) : null;
  const e = estadoDelMes(cal);
  const ponerHoras = () => {
    let n = 0;
    escribir((c) => {
      const r = horasEnBloque(c.days ?? [], { semana, porDefecto });
      n = r.cambiadas;
      return { ...c, days: r.days };
    });
    setAviso(n ? `Hora puesta a ${n} ${n === 1 ? "publicación" : "publicaciones"}.` : "No había ninguna sin hora.");
  };
  return (
    <div className="asistente-mes-paso">
      <section className="asistente-mes-bloque" aria-labelledby={`${ids}-h`}>
        <h3 id={`${ids}-h`}>Las horas, en bloque</h3>
        {e.sinHora ? (
          <>
            <p className="hint" style={{ margin: 0 }}>
              {e.sinHora} {e.sinHora === 1 ? "publicación no tiene" : "publicaciones no tienen"} hora: aprobadas no se podrían programar sin tocarlas. Se les pone
              la del plan semanal para su día y su formato y, si el plan no la dice, ésta:
            </p>
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor={`${ids}-hd`}>Hora por defecto</label>
              <TimePicker id={`${ids}-hd`} atajos value={porDefecto} onChange={setPorDefecto} />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!lista} onClick={ponerHoras}>
              <Icon name="clock" size={14} /> Poner la hora a las {e.sinHora}
            </button>
          </>
        ) : <p className="revision-vacio"><Icon name="checkCircle" size={18} /> Todas tienen su hora.</p>}
        <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>
      </section>

      <Suspense fallback={cargando("Revisando el mes…")}>
        <RevisionMes incrustado client={client} cal={cal} onAbrir={onAbrirPost} onArreglar={onArreglar} onClose={nada} />
      </Suspense>

      <section className="asistente-mes-bloque asistente-mes-enviar">
        <h3>Enviar al cliente</h3>
        <p className="hint" style={{ margin: 0 }}>
          {e.enviado ? "Este mes ya se envió: puedes volver a mandar el enlace con lo corregido." : "El cliente recibe el enlace del mes con todo creado para aprobarlo."}
        </p>
        <button type="button" className="btn btn-primary" disabled={!e.publicaciones} onClick={onEnviar}><Icon name="send" size={16} /> Enviar al cliente</button>
      </section>
    </div>
  );
}
