import { useEffect, useId, useMemo, useState, useRef } from "react";
import { PLANS, FORMATS, FORMAT_ICONS, MONTHS, DAYS, DAYS_SHORT } from "../constants";
import { uid, daysInMonth, fmtDate, dayName } from "../utils";
import { callAI, buildClientContext } from "../api";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { semanaDelMes } from "../lib/semanas";
import { llevaGuion, llevaTextoPieza } from "../lib/reglasFormato";
import {
  claveBorrador, leerBorrador, guardarBorrador, borrarBorrador, semanasDelPlan, unoPorSemana, diasOcupados, publicacionDelPlan,
} from "../lib/planMes";
import { casillasDelPlan, ideasDelPlan, rellenarConIdea } from "../lib/ideaPublicacion";
import { avisoDeLoQueFalta } from "../lib/materialTipo";
import { objetivoDe, semanasConEtapa, embudoDelMes, limpiarEstrategia } from "../lib/estrategiaMes";
import { PasoEstrategia, EtapaSemana, BalanceDelMes } from "./EstrategiaMes";
import Icon from "./Icon";
import { fechasDelMes } from "../lib/fechasEspeciales";
import { leerMercado } from "../lib/mercado";
import { productosParaPlan, limpiarEstudio, estructuraATexto } from "../lib/estudioMercado";
import { leerPlantillas } from "../lib/plantillasApi";
import { conNotasDelDia } from "../lib/notasSemana";
import { configDeFormatos, resumenPlantilla, OBJETIVOS_PLAN } from "../lib/plantillasPlan";
import { plantillaDeLaSemana, ritmoDelCliente, notasDelCliente } from "../lib/planSemanal";
import {
  PILARES, ritmoDelMes, sugerenciasDeTemporada, asignarMatriz,
  nombreDePilar, resumenRitmo, fechaCorta, CAMPOS_MATRIZ, pilarDe,
} from "../lib/pilares";

// Sin paso de categorías: se quitaron del calendario. Las que haya en la
// ficha del cliente (Semanal) siguen informando a la IA sin preguntarse aquí.
// Las Ofertas van ANTES de la Estrategia: «Proponer la estrategia con IA» las
// lee, y en el orden de antes le llegaban vacías.
const STEP_LABELS = ["Plan", "Fechas y ritmo", "Ofertas", "Estrategia", "Conceptos", "Ideas"];
const PASO = Object.freeze({ plan: 0, fechas: 1, ofertas: 2, estrategia: 3, conceptos: 4, ideas: 5 });


const TEMPLATES_KEY = "jads-templates";
function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]"); } catch { return []; }
}
function saveTemplates(list) { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); }

function StepBar({ step, setStep }) {
  return (
    <nav className="wizard-steps" aria-label={`Paso ${step + 1} de ${STEP_LABELS.length}: ${STEP_LABELS[step]}`}>
      {STEP_LABELS.map((label, i) => (
        <button
          key={i}
          type="button"
          className={`wizard-step ${i === step ? "active" : i < step ? "done" : ""}`}
          aria-current={i === step ? "step" : undefined}
          /* Los pasos futuros ya no eran pulsables pero seguían recibiendo
             foco y no lo comunicaban: ahora se deshabilitan de verdad. */
          disabled={i > step}
          onClick={() => { if (i < step) setStep(i); }}
        >
          {i < step ? <Icon name="check" size={14} /> : <span aria-hidden="true">{i + 1}.</span>} {label}
        </button>
      ))}
    </nav>
  );
}

export default function PlanWizard({ client, onGenerate, onClose, mesInicial = null }) {
  const clienteId = client?.dbId || client?.id;
  const almacen = typeof localStorage === "undefined" ? null : localStorage;
  const mes0 = { month: mesInicial?.month ?? new Date().getMonth(), year: mesInicial?.year ?? new Date().getFullYear() };
  // El BORRADOR de este cliente y este mes (lib/planMes.js): lo escrito y las ideas ya pagadas no se pierden al cerrar.
  const [borrador] = useState(() => leerBorrador(almacen, claveBorrador(clienteId, mes0.year, mes0.month)));
  const b = borrador ?? {};
  const [recuperado, setRecuperado] = useState(borrador?.guardadoAt ?? null);
  const [step, setStep] = useState(Number.isInteger(b.step) ? b.step : 0);
  const [month, setMonth] = useState(mes0.month);
  const [year, setYear] = useState(mes0.year);
  const [plan, setPlan] = useState(b.plan || "standard");
  const [formatConfig, setFormatConfig] = useState(() => {
    if (b.formatConfig && typeof b.formatConfig === "object") return b.formatConfig;
    const cfg = {};
    for (let dow = 0; dow < 7; dow++) {
      cfg[dow] = [{ format: "post" }, { format: "reel" }];
    }
    return cfg;
  });
  const [importantDates, setImportantDates] = useState(() => (Array.isArray(b.importantDates) ? b.importantDates.filter((d) => !d.auto) : []));
  // Las fechas especiales del mes entran solas (feriados, comerciales y lo
  // que eligió este cliente, lib/fechasEspeciales.js); las añadidas a mano
  // se quedan al cambiar de mes si son de ese mes.
  useEffect(() => {
    const prefijo = `${year}-${String(month + 1).padStart(2, "0")}`;
    const auto = fechasDelMes(year, month, client?.fechasEspeciales)
      .filter((f) => f.destacada || f.tipo !== "internacional")
      .map((f) => ({ date: f.fecha, name: f.delicada ? `${f.nombre} (fecha delicada: sin promociones)` : f.nombre, auto: true }));
    setImportantDates((prev) => [...prev.filter((d) => !d.auto && d.date.startsWith(prefijo)), ...auto]);
  }, [year, month, client?.fechasEspeciales]);
  // El ritmo de contenido del cliente (lunes Anuncio … sábado 7 maletas) y los cambios de temporada aceptados.
  const ritmo = ritmoDelCliente(client);
  const [aceptadas, setAceptadas] = useState(Array.isArray(b.aceptadas) ? b.aceptadas : []);
  const sugerencias = useMemo(
    () => sugerenciasDeTemporada({ year, month, ritmo: ritmoDelCliente(client), fechas: fechasDelMes(year, month, client?.fechasEspeciales) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, month, client?.ritmoContenido, client?.planSemanal, client?.fechasEspeciales],
  );
  // Al cambiar de mes se olvidan los cambios de temporada del otro (no al abrir: los del borrador se quedan).
  const mesVisto = useRef(`${year}-${month}`);
  useEffect(() => {
    if (mesVisto.current === `${year}-${month}`) return;
    mesVisto.current = `${year}-${month}`;
    setAceptadas([]);
  }, [year, month]);
  const ritmoMes = ritmoDelMes(year, month, ritmo, aceptadas);
  // El catálogo y el estudio de mercado: de ahí salen el producto, el deseo y el perfil de cada publicación.
  const [mercado, setMercado] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (client?.id) leerMercado(client.dbId || client.id).then((m) => { if (vivo) setMercado(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [client?.id, client?.dbId]);
  const [campaign, setCampaign] = useState(b.campaign || "");
  // Un concepto por SEMANA del mes, y la semana es la FILA de la rejilla (lunes a domingo): 5 o 6 según el mes.
  const numSemanas = semanasDelPlan(year, month).length;
  const [weekConcepts, setWeekConcepts] = useState(() => unoPorSemana(b.weekConcepts, numSemanas));
  useEffect(() => { setWeekConcepts((prev) => (prev.length === numSemanas ? prev : unoPorSemana(prev, numSemanas))); }, [numSemanas]);
  const [dayCategories, setDayCategories] = useState(() => {
    const cats = {};
    for (let dow = 0; dow < 7; dow++) cats[dow] = "";
    return cats;
  });
  const [offers, setOffers] = useState(b.offers || "");
  const [promoCode, setPromoCode] = useState(b.promoCode || "");
  // La estrategia del mes: objetivo, producto foco y la etapa del embudo de cada semana (src/lib/estrategiaMes.js).
  const [objetivo, setObjetivo] = useState(b.objetivo || "");
  const [focoId, setFocoId] = useState(b.focoId || "");
  const [etapas, setEtapas] = useState(Array.isArray(b.etapas) ? b.etapas : []);
  const [propuesta, setPropuesta] = useState(b.propuesta ? { ...b.propuesta, antes: null } : null); // { razon, ofertas, mejores, antes }
  const [ideas, setIdeas] = useState(b.ideas && typeof b.ideas === "object" ? b.ideas : {});
  // Si el mes ya tiene publicaciones, esos días NO reciben nuevas (salvo que se pida): no se ponen encima.
  const [llenarOcupados, setLlenarOcupados] = useState(Boolean(b.llenarOcupados));
  const ocupados = useMemo(() => diasOcupados(client?.calendars, year, month), [client?.calendars, year, month]);
  const [ideaMode, setIdeaMode] = useState("day");
  // Qué trozo del mes se genera: «mes» o el número de una semana. El mes
  // entero son treinta días por siete tandas; una semana cabe en una, y es
  // lo que se quiere cuando el calendario se va aprobando por partes.
  const [alcance, setAlcance] = useState(b.alcance || "mes");
  const [descLoading, setDescLoading] = useState(false);
  const [dowIdeas, setDowIdeas] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDateName, setNewDateName] = useState("");
  const generating = useRef(false);
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);
  const [templates, setTemplates] = useState(loadTemplates);
  const [tplName, setTplName] = useState("");
  const [tplPicker, setTplPicker] = useState(null);

  const allDays = daysInMonth(year, month);
  // Las plantillas de plan de la agencia: «Planificar mes» abre con la del cliente (la personalizada si la tiene).
  const [plantillas, setPlantillas] = useState(null);
  const [plantillaElegida, setPlantillaElegida] = useState(b.plantillaElegida || "");
  const aplicarPlantilla = (t) => {
    setPlan("custom");
    const cfg = configDeFormatos(t);
    setFormatConfig(Object.fromEntries(Object.entries(cfg).map(([dow, lista]) => [dow, lista.map((h) => ({ ...h, publishTime: h.hora || "" }))])));
  };
  useEffect(() => {
    let vivo = true;
    leerPlantillas().then((lista) => {
      if (!vivo) return;
      setPlantillas(lista);
      const delCliente = plantillaDeLaSemana(client, lista);
      // Con un borrador, sus formatos se quedan: la plantilla del cliente ya se aplicó cuando se empezó.
      if (delCliente && !borrador) {
        setPlantillaElegida(delCliente.personalizada ? "cliente" : delCliente.id);
        aplicarPlantilla(delCliente);
      }
    }).catch(() => { if (vivo) setPlantillas([]); });
    return () => { vivo = false; };
    // Sólo al abrir: elegir otra plantilla o tocar los formatos después no debe volver a la del cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const plantillaDelClienteActual = plantillas ? plantillaDeLaSemana(client, plantillas) : null;
  const elegirPlantilla = (id) => {
    setPlantillaElegida(id);
    const t = id === "cliente" ? plantillaDelClienteActual : (plantillas ?? []).find((p) => p.id === id);
    if (t) aplicarPlantilla(t);
  };
  const plantillaActual = plantillaElegida === "cliente" ? plantillaDelClienteActual : (plantillas ?? []).find((p) => p.id === plantillaElegida);

  // El borrador se guarda en cada cambio, con la clave del mes que se mira. Al cambiar de mes se recupera el de ese
  // mes si lo hay (y se espera a pintarlo antes de guardar: si no, se guardaría lo del otro mes con su clave).
  const clave = claveBorrador(clienteId, year, month);
  const claveCargada = useRef(clave);
  const restaurando = useRef(false);
  useEffect(() => {
    if (claveCargada.current === clave) return;
    claveCargada.current = clave;
    const otro = leerBorrador(almacen, clave);
    if (!otro) return;
    restaurando.current = true;
    setIdeas(otro.ideas ?? {});
    setCampaign(otro.campaign || "");
    setWeekConcepts(unoPorSemana(otro.weekConcepts, semanasDelPlan(year, month).length));
    setOffers(otro.offers || "");
    setPromoCode(otro.promoCode || "");
    setObjetivo(otro.objetivo || "");
    setFocoId(otro.focoId || "");
    setEtapas(Array.isArray(otro.etapas) ? otro.etapas : []);
    setAceptadas(Array.isArray(otro.aceptadas) ? otro.aceptadas : []);
    setRecuperado(otro.guardadoAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => {
    if (restaurando.current) { restaurando.current = false; return; }
    guardarBorrador(almacen, clave, {
      step, plan, formatConfig, plantillaElegida, aceptadas, importantDates: importantDates.filter((d) => !d.auto),
      campaign, weekConcepts, offers, promoCode, objetivo, focoId, etapas,
      propuesta: propuesta ? { razon: propuesta.razon, ofertas: propuesta.ofertas, mejores: propuesta.mejores } : null,
      ideas, alcance, llenarOcupados,
    });
  }, [almacen, clave, step, plan, formatConfig, plantillaElegida, aceptadas, importantDates, campaign, weekConcepts, offers, promoCode, objetivo, focoId, etapas, propuesta, ideas, alcance, llenarOcupados]);
  /** «Empezar de cero»: fuera el borrador y lo que traía (el plan y las fechas se quedan). */
  const empezarDeCero = () => {
    borrarBorrador(almacen, clave);
    setIdeas({}); setCampaign(""); setWeekConcepts(unoPorSemana([], numSemanas)); setOffers(""); setPromoCode("");
    setObjetivo(""); setFocoId(""); setEtapas([]); setPropuesta(null); setRecuperado(null);
  };

  // Las referencias de video de la competencia con su estructura: un guion puede seguir la misma forma.
  const estructuras = (mercado?.referencias ?? []).filter((r) => r.analisis?.estructura?.tramos?.length);

  const isCustom = plan === "custom";
  const postsPerDay = PLANS[plan]?.posts || 2;

  const goNext = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const saveTemplate = (type) => {
    const name = tplName.trim();
    if (!name) return;
    const tpl = { id: uid(), name, type, plan, createdAt: new Date().toISOString() };
    if (type === "formats" || type === "full") tpl.formatConfig = formatConfig;
    if (type === "categories" || type === "full") tpl.dayCategories = dayCategories;
    if (type === "full") {
      tpl.campaign = campaign;
      tpl.weekConcepts = weekConcepts;
      tpl.offers = offers;
      tpl.promoCode = promoCode;
    }
    const next = [...templates, tpl];
    setTemplates(next);
    saveTemplates(next);
    setTplName("");
    setTplPicker(null);
  };

  const applyTemplate = (tpl) => {
    if (tpl.formatConfig) {
      setFormatConfig(tpl.formatConfig);
      if (tpl.plan) setPlan(tpl.plan);
    }
    if (tpl.dayCategories) setDayCategories(tpl.dayCategories);
    if (tpl.campaign !== undefined) setCampaign(tpl.campaign);
    if (tpl.weekConcepts) setWeekConcepts(tpl.weekConcepts);
    if (tpl.offers !== undefined) setOffers(tpl.offers);
    if (tpl.promoCode !== undefined) setPromoCode(tpl.promoCode);
    setTplPicker(null);
  };

  const deleteTemplate = (tplId) => {
    const next = templates.filter((t) => t.id !== tplId);
    setTemplates(next);
    saveTemplates(next);
  };

  const suggestDates = async () => {
    setAiLoading(true);
    setAiStatus("Buscando fechas importantes...");
    try {
      const ctx = buildClientContext(client);
      const prompt = `${ctx}\n\nDame 5-8 fechas importantes para ${MONTHS[month]} ${year} en Panama relevantes para esta industria.
Formato JSON array: [{"date":"YYYY-MM-DD","name":"Nombre","relevant":true}]
Solo el JSON, nada mas.`;
      const txt = await callAI(prompt, { funcion: "calendario", clienteId: client?.id });
      const match = txt.match(/\[[\s\S]*?\]/);
      if (match) {
        const dates = JSON.parse(match[0]);
        setImportantDates((prev) => {
          const existing = new Set(prev.map((d) => d.date));
          return [...prev, ...dates.filter((d) => !existing.has(d.date))];
        });
      }
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const suggestConcepts = async () => {
    setAiLoading(true);
    setAiStatus("Generando conceptos semanales...");
    try {
      const ctx = buildClientContext(client, { campaign });
      // Las semanas son las filas de la rejilla (lunes a domingo): 5 o 6 según el mes.
      const numWeeks = numSemanas;
      const prompt = `${ctx}\n\nGenera ${numWeeks} conceptos semanales para el calendario de ${MONTHS[month]} ${year}.
Campana: ${campaign || "N/A"}
Formato: una linea por semana, solo el concepto. ${numWeeks} lineas exactas.`;
      const txt = await callAI(prompt, { funcion: "calendario", clienteId: client?.id });
      const lines = txt.split("\n").filter(Boolean).slice(0, numWeeks);
      setWeekConcepts((prev) => prev.map((c, i) => c || lines[i] || ""));
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const applyDowIdeas = () => {
    const newIdeas = { ...ideas };
    allDays.forEach((d) => {
      const date = fmtDate(d);
      const dow = d.getDay();
      const dowIdeaList = dowIdeas[dow];
      if (!dowIdeaList || dowIdeaList.length === 0) return;
      if (ocupados.has(date) && !llenarOcupados) return;
      const formats = isCustom ? (formatConfig[dow] || []) : (formatConfig[dow] || []).slice(0, postsPerDay);
      const existing = newIdeas[date] || [];
      newIdeas[date] = formats.map((f, j) => {
        const ex = existing[j];
        if (ex?.idea) return ex;
        const baseIdea = dowIdeaList[j % dowIdeaList.length]?.idea || "";
        return {
          id: ex?.id || uid(),
          format: f.format,
          idea: baseIdea,
          referenceLink: ex?.referenceLink || "",
          image: ex?.image || null,
          descripcion: ex?.descripcion || "",
          hashtagsFinales: ex?.hashtagsFinales || "",
          script: "",
          status: "pending",
          category: dayCategories[dow] || "",
        };
      });
    });
    setIdeas(newIdeas);
  };

  /**
   * La estructura del mes, día a día: qué formatos toca, de qué semana es
   * y qué ideas hay ya. La usan la generación de ideas, la de descripciones
   * y el recuento del selector, que antes la calculaban por separado.
   */
  const estructuraDelMes = () =>
    allDays.map((d) => {
      const date = fmtDate(d);
      const dow = d.getDay();
      // La semana es la FILA de la rejilla (lunes a domingo): la de la tarjeta de la campaña.
      const wk = semanaDelMes(date);
      const pilar = ritmoMes[date] || "";
      const cat = nombreDePilar(pilar) || dayCategories[dow] || "";
      const impDate = importantDates.find((id) => id.date === date);
      // Un día que ya tiene publicaciones en el calendario no recibe nuevas (salvo «Añadir también ahí»).
      const ocupado = ocupados.has(date) && !llenarOcupados;
      const formats = ocupado ? [] : isCustom ? (formatConfig[dow] || []) : (formatConfig[dow] || []).slice(0, postsPerDay);
      const existingIdeas = ideas[date] || [];
      return { date, dow, wk, cat, pilar, impDate, formats, existingIdeas, ocupado };
    });

  /**
   * La matriz del mes: a cada publicación su tipo, producto, nivel, deseo y perfil («fecha|índice» → campos). Se
   * calcula sobre el mes ENTERO aunque se genere una semana, para que la rotación de productos no empiece de cero.
   * Lo que ya trae una idea (elegido a mano o de una vuelta anterior) se respeta.
   */
  const matrizDelMes = () => {
    const general = limpiarEstudio(mercado?.estudio)?.general;
    const lista = [];
    for (const d of estructuraDelMes()) {
      d.formats.forEach((f, j) => {
        const previa = (ideas[d.date] || [])[j] || {};
        const propia = Object.fromEntries(CAMPOS_MATRIZ.filter((k) => previa[k]).map((k) => [k, previa[k]]));
        // El tipo de la publicación: el que diga la plantilla (un reel de contenido humano) o el del ritmo del día.
        lista.push({ clave: `${d.date}|${j}`, fecha: d.date, pilar: f.pilar || d.pilar, ...propia });
      });
    }
    const productos = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);
    // La nota fija del día («los lunes, muebles y camas»): si nombra un producto, ese día va con él (lib/notasSemana.js).
    const conNotas = conNotasDelDia(lista, notasDelCliente(client), productos).map(({ notaDia: _n, fecha: _f, ...c }) => c);
    const asignada = asignarMatriz(conNotas, {
      productos, deseos: general?.deseos ?? [], perfiles: general?.perfiles ?? [],
      foco: focoId,
    });
    return new Map(asignada.map(({ clave, ...m }) => [clave, Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, m[k] ?? ""]))]));
  };

  /** Los productos que pueden ser el foco del mes (los del plan: activos y, con inventario, no agotados). */
  const productosPlan = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);
  const focoNombre = productosPlan.find((p) => p.id === focoId)?.nombre ?? "";

  /** Las semanas del plan con sus fechas: las FILAS de la rejilla (lib/planMes.js). */
  const semanasPlan = () => semanasDelPlan(year, month);

  /** La estrategia que va al motor de ideas: campaña, ofertas, código, objetivo, foco y cada semana con su etapa. */
  const estrategiaParaElMotor = () => {
    const obj = objetivoDe(objetivo);
    return {
      campana: campaign, ofertas: offers, codigo: promoCode, semanas: semanasConEtapa(weekConcepts, etapas),
      ...(obj ? { objetivo: `${obj.nombre} — ${obj.ayuda}` } : {}),
      ...(focoNombre ? { foco: focoNombre, focoId } : {}),
    };
  };

  /** Lo que propone la IA se aplica entero (se puede deshacer): objetivo, foco, campaña, conceptos y etapas. */
  const aplicarPropuesta = (r) => {
    const e = r?.estrategia;
    if (!e) return;
    const antes = { objetivo, focoId, campaign, weekConcepts, etapas };
    setObjetivo(e.objetivo || objetivo);
    setFocoId(focoId || e.focoId || "");
    if (e.campana) setCampaign(e.campana);
    setWeekConcepts((prev) => prev.map((c, i) => e.semanas?.[i]?.concepto || c));
    setEtapas(weekConcepts.map((_, i) => e.semanas?.[i]?.etapa || ""));
    setPropuesta({ razon: e.razon, ofertas: e.ofertas, mejores: r.mejores ?? [], antes });
  };
  const deshacerPropuesta = () => {
    const a = propuesta?.antes;
    if (!a) return;
    setObjetivo(a.objetivo); setFocoId(a.focoId); setCampaign(a.campaign); setWeekConcepts(a.weekConcepts); setEtapas(a.etapas);
    setPropuesta((p) => ({ ...p, antes: null }));
  };

  /** El plan tal como está (formato, tipo, matriz e idea de cada publicación), para el balance. */
  const diasDelPlan = () => {
    const matriz = matrizDelMes();
    return estructuraDelMes().map((d) => ({
      date: d.date,
      posts: d.formats.map((f, j) => ({ ...matriz.get(`${d.date}|${j}`), ...(ideas[d.date] || [])[j], format: f.format, ...(f.rostro ? { rostro: true } : {}) })),
    }));
  };

  /** Las semanas que tiene este mes, para poblar el selector. */
  const semanas = [...new Set(estructuraDelMes().map((d) => d.wk))].sort((a, b) => a - b);

  /** Se queda con los días del alcance elegido: el mes entero o una semana. */
  const enAlcance = (lista) =>
    alcance === "mes" ? lista : lista.filter((d) => String(d.wk) === alcance);

  // «todo el mes» y no «el mes» para que las frases que la usan salgan
  // bien: «Generar ideas de todo el mes», «Generar ideas de la semana 2».
  const etiquetaAlcance = alcance === "mes" ? "todo el mes" : `la semana ${alcance}`;

  /** Cuántos días naturales caen en esa semana, para el selector. */
  const diasDeSemana = (w) => estructuraDelMes().filter((d) => d.wk === w).length;

  /** Ideas ya escritas dentro del alcance: sin ellas no hay qué describir. */
  const ideasEnAlcance = enAlcance(estructuraDelMes())
    .reduce((total, d) => total + (ideas[d.date] || []).filter((p) => p?.idea?.trim()).length, 0);

  /** Un solo botón a la vez: las dos generaciones comparten `generating`. */
  const ocupado = aiLoading || descLoading;

  /**
   * Las ideas del mes, por el MISMO motor que «Producir en lote» (modo «plan» de /lote/ideas): cada publicación con su
   * formato, su tipo y su matriz, la estrategia del mes (campaña, ofertas, el concepto de cada semana), el estudio de
   * mercado, el catálogo y el cerebro. Cada una vuelve con título, brief, qué se ve, el texto de la pieza (o el guion,
   * en carrusel y reel), el caption, los hashtags y la forma (composición y gancho). De TANDA en TANDA: cada tanda sabe
   * lo que ya salió. Lo escrito por una persona no se pisa: su idea se desarrolla y la de la IA queda al lado.
   */
  const generateIdeas = async () => {
    if (generating.current) return;
    generating.current = true;
    setAiLoading(true);
    setAiStatus("Preparando el plan del mes…");
    try {
      const daysList = enAlcance(estructuraDelMes());
      const matriz = matrizDelMes();
      const casillas = casillasDelPlan(daysList, { matriz, semanas: weekConcepts, ideas });
      if (!casillas.length) {
        setAiStatus("No hay publicaciones de un formato que la IA escriba (post, historia, carrusel o reel).");
        setTimeout(() => setAiStatus(""), 4000);
        return;
      }
      const estrategia = estrategiaParaElMotor();
      // Lo que ya hay en el mes (fuera del alcance también) para no repetirlo.
      let usados = Object.values(ideas).flat().map((p) => String(p?.title || p?.idea || "").trim().slice(0, 80)).filter(Boolean).slice(0, 30);
      const semilla = Math.floor(Math.random() * 1000);
      const TANDA = 6;
      const nuevas = { ...ideas };
      let escritas = 0;
      // Lo que al cerebro le falta para algún tipo (testimonios, garantía, saber del rubro…), de todas las tandas.
      const faltan = new Set();
      for (let desde = 0, total = casillas.length; desde < total; desde += TANDA) {
        setAiStatus(`Ideas ${desde + 1}–${Math.min(desde + TANDA, total)} de ${total}…`);
        const r = await ideasDelPlan(client.dbId || client.id, { casillas, estrategia, usados: usados.slice(0, 30), semilla, desde, tamano: TANDA });
        total = r.total ?? total;
        for (const k of r.faltan ?? []) faltan.add(k);
        for (const idea of r.ideas ?? []) {
          const [date, jTexto] = String(idea.clave ?? "").split("|");
          const j = Number(jTexto);
          const d = daysList.find((x) => x.date === date);
          if (!d || !Number.isInteger(j) || !d.formats[j]) continue;
          const dia = [...(nuevas[date] || [])];
          const previa = dia[j] || {};
          const propia = String(previa.idea ?? "").trim();
          const brief = String(idea.brief || idea.escena || "").trim();
          const { cambios } = rellenarConIdea({ ...previa, format: d.formats[j].format, idea: propia }, { ...idea, brief: propia ? "" : brief });
          dia[j] = {
            ...matriz.get(`${date}|${j}`),
            ...previa,
            ...cambios,
            id: previa.id || uid(),
            format: d.formats[j].format,
            idea: propia || brief,
            // La de la IA queda AL LADO de la de la persona («Usar esta» / «Quedarme con la mía»).
            sugerencia: propia && brief && brief !== propia ? brief : previa.sugerencia || "",
            ...(idea.productoId && !previa.productoId ? { productoId: idea.productoId, producto: idea.producto ?? "" } : {}),
            ...(idea.nivel && !previa.nivel ? { nivel: idea.nivel } : {}),
            ...(idea.deseo && !previa.deseo ? { deseo: idea.deseo } : {}),
            ...(idea.perfil && !previa.perfil ? { perfil: idea.perfil } : {}),
            ...(idea.pilarSub && !previa.pilarSub ? { pilarSub: idea.pilarSub } : {}),
            status: previa.status || "pending",
            category: previa.category || d.cat,
          };
          nuevas[date] = dia;
          escritas += 1;
          usados = [idea.titular || idea.titulo, ...usados].filter(Boolean);
        }
        setIdeas({ ...nuevas });
      }
      const falta = avisoDeLoQueFalta([...faltan]);
      setAiStatus(escritas ? `Listo: ${escritas} ${escritas === 1 ? "publicación" : "publicaciones"} con idea, texto y forma.${falta ? ` ${falta}` : ""}` : "La IA no devolvió ideas que se puedan leer. Inténtalo otra vez.");
      setTimeout(() => setAiStatus(""), falta ? 15000 : 4000);
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      setAiStatus("Error: " + e.message);
      setTimeout(() => setAiStatus(""), 5000);
    } finally {
      setAiLoading(false);
      generating.current = false;
    }
  };

  /**
   * Escribe lo que les falta a las ideas que ya están definidas: el guion (reel, carrusel, directo), el caption, el
   * texto de la pieza y los hashtags, según su formato (lib/reglasFormato.js: una historia no lleva guion ni caption).
   *
   * Es el segundo paso del asistente: primero se acuerdan las ideas —y se revisan a mano, que para eso están en
   * pantalla—, y sólo después se escribe. Va por el MISMO motor que todo lo demás (modo «campos» del servidor,
   * lib/escribirTextos.js): con lo ya escrito delante, la ficha del cliente y la estrategia del mes. Trabaja sobre el
   * mismo alcance que las ideas: el mes entero o una semana. Rellenar no es reescribir: lo escrito se queda.
   */
  const calendarioDelPlan = () => ({
    year, month, campaign, offers, promoCode, weekConcepts,
    opciones: { estrategia: limpiarEstrategia({ objetivo, focoId, foco: focoNombre, etapas }) },
    days: Object.entries(ideas).map(([date, posts]) => ({ date, posts })),
  });
  const generarDescripciones = async () => {
    if (generating.current) return;
    generating.current = true;
    setDescLoading(true);
    setAiStatus("Preparando guiones y descripciones…");
    try {
      const textos = await import("../lib/escribirTextos");
      const matriz = matrizDelMes();
      const pedidos = [];
      for (const d of enAlcance(estructuraDelMes())) {
        (ideas[d.date] || []).forEach((p, j) => {
          if (!p?.idea?.trim()) return;
          const post = { ...matriz.get(`${d.date}|${j}`), ...p, format: p.format || d.formats[j]?.format || "post" };
          if (textos.camposQueFaltan(post).length) pedidos.push({ post, day: { date: d.date, specialDate: d.impDate?.name ?? "" } });
        });
      }
      if (!pedidos.length) {
        setAiStatus(`No hay nada sin escribir en ${etiquetaAlcance}.`);
        setTimeout(() => setAiStatus(""), 3000);
        return;
      }
      let porId = new Map();
      let error = null;
      try {
        porId = await textos.escribirLoQueFalta(clienteId, calendarioDelPlan(), pedidos, {
          alProgresar: (i, total) => setAiStatus(`Textos ${i + 1}-${Math.min(i + 6, total)} de ${total}…`),
        });
      } catch (e) {
        // Lo que ya llegó se pone igual: está pagado.
        porId = e.parcial ?? porId;
        error = e;
      }
      setIdeas((prev) => Object.fromEntries(Object.entries(prev).map(([date, dia]) => [date, (dia || []).map((x) => {
        const t = x && porId.get(x.id);
        return t ? { ...x, ...textos.aplicarCampos(x, t).cambios } : x;
      })])));
      const quedan = pedidos.filter(({ post }) => !porId.has(post.id)).length;
      setAiStatus(error && !porId.size
        ? `Error: ${error.message}`
        : quedan
          ? `Listo, pero ${quedan} de ${pedidos.length} se quedaron a medias. Vuelve a pulsar para completarlas.`
          : `Listo: ${pedidos.length} ${pedidos.length === 1 ? "publicación escrita" : "publicaciones escritas"}.`);
      setTimeout(() => setAiStatus(""), 4000);
    } catch (e) {
      setAiStatus("Error: " + e.message);
      setTimeout(() => setAiStatus(""), 5000);
    } finally {
      // En `finally` porque hay una salida temprana cuando no queda nada
      // que escribir: sin esto, el botón se quedaba bloqueado.
      setDescLoading(false);
      generating.current = false;
    }
  };

  /**
   * «Mejorar»: la IA propone una versión mejor de UNA idea escrita a mano —con su tipo de contenido, su producto y
   * el estudio de mercado delante— y la deja al lado como propuesta; la persona elige cuál se queda.
   */
  const [mejorando, setMejorando] = useState("");
  const mejorarUna = async (date, j) => {
    const p = (ideas[date] || [])[j];
    if (!p?.idea?.trim() || generating.current) return;
    generating.current = true;
    setMejorando(`${date}|${j}`);
    try {
      // Por el motor (modo «campos»): la idea que había va como «la que tiene ahora: escribe una mejor que conserve su
      // intención», con su tipo, su producto, el estudio de mercado, la ficha del cliente y la estrategia del mes.
      const { textoDeUnCampo } = await import("../lib/escribirTextos");
      const d = estructuraDelMes().find((x) => x.date === date);
      const post = { ...matrizDelMes().get(`${date}|${j}`), ...p, format: p.format || d?.formats[j]?.format || "post" };
      const t = await textoDeUnCampo(clienteId, { post, day: { date, specialDate: d?.impDate?.name ?? "" }, cal: calendarioDelPlan(), campo: "idea" });
      const texto = String(t.campos.idea ?? "").trim().replace(/^[«"]|[»"]$/g, "");
      if (texto && texto !== p.idea.trim()) {
        setIdeas((prev) => {
          const dia = [...(prev[date] || [])];
          dia[j] = { ...dia[j], sugerencia: texto };
          return { ...prev, [date]: dia };
        });
      } else {
        setAiStatus("La IA no encontró cómo mejorarla: tu idea se queda.");
        setTimeout(() => setAiStatus(""), 3000);
      }
    } catch (e) {
      setAiStatus("Error: " + e.message);
      setTimeout(() => setAiStatus(""), 5000);
    } finally {
      setMejorando("");
      generating.current = false;
    }
  };

  /** «Usar esta» (la de la IA pasa a ser la idea) o «Quedarme con la mía» (se descarta la propuesta). */
  const decidirSugerencia = (date, j, usar) => {
    setIdeas((prev) => {
      const dia = [...(prev[date] || [])];
      const x = dia[j];
      dia[j] = { ...x, idea: usar ? x.sugerencia : x.idea, sugerencia: "" };
      return { ...prev, [date]: dia };
    });
  };

  const [creando, setCreando] = useState(false);
  const handleGenerate = async () => {
    if (creando) return;
    const matriz = matrizDelMes();
    const calDays = estructuraDelMes().map((d) => {
      const dayIdeas = ideas[d.date] || [];
      // Todo lo que escribió el motor llega al calendario, también la ficha de diseño ya pagada (lib/planMes.js). Los
      // días ocupados no traen publicaciones nuevas (`formats` vacío).
      const posts = d.formats.map((f, j) => publicacionDelPlan(dayIdeas[j], f, matriz.get(`${d.date}|${j}`) ?? {}, { id: uid(), cat: d.cat }));
      return {
        date: d.date,
        dayName: dayName(d.date),
        weekNumber: d.wk,
        concept: weekConcepts[d.wk - 1] || "",
        category: d.cat,
        specialDate: d.impDate?.name || "",
        posts,
      };
    });

    setCreando(true);
    const ok = await onGenerate({
      month,
      year,
      // El objetivo, el foco y las etapas viajan en `opciones.estrategia` del calendario (no las ve el cliente).
      estrategia: limpiarEstrategia({ objetivo, focoId, foco: focoNombre, razon: propuesta?.razon ?? "", etapas }),
      campaign,
      weekConcepts,
      offers: offers || "",
      promoCode: promoCode || "",
      days: calDays,
    });
    setCreando(false);
    // Ya está en el calendario: el borrador sobra. Si falló, se queda (y lo escrito también).
    if (ok !== false) borrarBorrador(almacen, clave);
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet">
        <div className="sheet-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Planificar calendario</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar planificador"><Icon name="close" /></button>
        </div>

        <StepBar step={step} setStep={setStep} />

        <div className="sheet-body">
          <div role="status" aria-live="polite" className="sr-only">{aiLoading ? aiStatus : ""}</div>
          {recuperado && (
            <div className="notice" style={{ marginBottom: "var(--sp-3)", display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <Icon name="check" size={14} /> Seguimos donde lo dejaste ({new Date(recuperado).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}): las ideas ya escritas no se pierden al cerrar.
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={empezarDeCero}>Empezar de cero</button>
            </div>
          )}
          {/* Step 0: Plan selection */}
          {step === 0 && (
            <div>
              <div style={{ display: "flex", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
                <div style={{ flex: 1 }}>
                  <label className="label" htmlFor={`${ids}-month`}>Mes</label>
                  <select id={`${ids}-month`} className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label className="label" htmlFor={`${ids}-year`}>Año</label>
                  <select id={`${ids}-year`} className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {[year - 1, year, year + 1, year + 2].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              {plantillas?.length > 0 && (
                <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
                  <label className="label" htmlFor={`${ids}-plantilla`}>Plantilla del plan</label>
                  <select id={`${ids}-plantilla`} className="input" value={plantillaElegida} onChange={(e) => elegirPlantilla(e.target.value)}>
                    <option value="">Ninguna (elegir abajo)</option>
                    {plantillaDelClienteActual?.personalizada && <option value="cliente">La de {client?.name || "este cliente"} (personalizada)</option>}
                    {OBJETIVOS_PLAN.map((o) => (
                      <optgroup key={o.id} label={o.nombre}>
                        {plantillas.filter((t) => t.objetivo === o.id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>
                    {plantillaActual
                      ? `${resumenPlantilla(plantillaActual)}. Puedes ajustar los formatos de este mes abajo sin cambiar la plantilla.`
                      : "Elige una plantilla de la agencia o arma el plan a mano. La del cliente se fija en su ficha (pestaña Semanal)."}
                  </p>
                </div>
              )}
              <fieldset style={{ border: "none", marginBottom: "var(--sp-4)" }}>
                <legend className="label">Plan de publicaciones</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {Object.entries(PLANS).map(([k, p]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={plan === k}
                    onClick={() => {
                      setPlan(k);
                      if (!p.custom) {
                        setFormatConfig((prev) => {
                          const cfg = {};
                          for (let dow = 0; dow < 7; dow++) {
                            const existing = prev[dow] || [];
                            cfg[dow] = Array.from({ length: p.posts }, (_, i) => existing[i] || { format: i === 0 ? "post" : "reel", publishTime: "" });
                          }
                          return cfg;
                        });
                      }
                    }}
                    style={{
                      padding: "var(--sp-4)",
                      borderRadius: "var(--radius)",
                      border: `2px solid ${plan === k ? "var(--accent)" : "var(--border)"}`,
                      cursor: "pointer",
                      background: plan === k ? "var(--accent-soft)" : "var(--bg)",
                      color: "#fff",
                      textAlign: "left",
                      minHeight: "var(--tap)",
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 700, fontSize: "var(--fs-sm)" }}>{p.label}</span>
                    <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginTop: 2 }}>{p.description}</span>
                  </button>
                ))}
              </div>
              </fieldset>

              <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTplPicker(tplPicker === "formats" ? null : "formats")}>
                  <Icon name="calendar" size={14} /> Formatos guardados en este navegador
                </button>
              </div>
              {tplPicker === "formats" && (
                <div style={{ background: "var(--surface)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-3)", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "var(--fs-xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Plantillas guardadas</p>
                  {templates.filter((t) => t.type === "formats" || t.type === "full").length === 0 && (
                    <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-2)" }}>Sin plantillas de formatos.</p>
                  )}
                  {templates.filter((t) => t.type === "formats" || t.type === "full").map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--sp-2)", background: "var(--bg)", borderRadius: "var(--radius-xs)", marginBottom: "var(--sp-1)" }}>
                      <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{t.name} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>({t.type})</span></span>
                      <div style={{ display: "flex", gap: "var(--sp-1)" }}>
                        <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: "var(--fs-3xs)" }} onClick={() => applyTemplate(t)}>Aplicar</button>
                        <button type="button" className="btn-remove" aria-label={`Eliminar plantilla ${t.name}`} onClick={() => deleteTemplate(t.id)}><Icon name="close" size={14} /></button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                    <input className="input" style={{ flex: 1, fontSize: "var(--fs-2xs)" }} placeholder="Nombre de la plantilla…" value={tplName} onChange={(e) => setTplName(e.target.value)} />
                    <button type="button" className="btn btn-accent btn-sm" style={{ fontSize: "var(--fs-3xs)" }} disabled={!tplName.trim()} onClick={() => saveTemplate("formats")}>Guardar formatos</button>
                  </div>
                </div>
              )}

              <fieldset style={{ border: "none" }}>
                <legend className="label">Formatos por día</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const slots = formatConfig[dow] || [];
                    return (
                    <div key={dow} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                        <p style={{ fontSize: "var(--fs-xs)", fontWeight: 700, margin: 0 }}>{DAYS[dow]}</p>
                        {isCustom && (
                          <div style={{ display: "flex", gap: "var(--sp-1)", alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Quitar publicación de ${DAYS[dow]}`}
                              disabled={slots.length === 0}
                              onClick={() => setFormatConfig((prev) => ({ ...prev, [dow]: prev[dow].slice(0, -1) }))}
                              style={{ width: 28, height: 28 }}
                            >
                              <Icon name="minus" size={14} />
                            </button>
                            <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 600, minWidth: 16, textAlign: "center" }}>{slots.length}</span>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Agregar publicación a ${DAYS[dow]}`}
                              disabled={slots.length >= 5}
                              onClick={() => setFormatConfig((prev) => ({ ...prev, [dow]: [...prev[dow], { format: "post", publishTime: "" }] }))}
                              style={{ width: 28, height: 28 }}
                            >
                              <Icon name="plus" size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      {slots.length === 0 && isCustom && (
                        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", fontStyle: "italic" }}>Sin publicaciones este día</p>
                      )}
                      {slots.map((slot, si) => (
                        <div key={si} role="group" aria-label={`${DAYS[dow]}, publicación ${si + 1}`} style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)", alignItems: "center" }}>
                          {Object.entries(FORMATS).map(([fk, f]) => (
                            <button
                              key={fk}
                              type="button"
                              aria-pressed={slot.format === fk}
                              onClick={() =>
                                setFormatConfig((prev) => ({
                                  ...prev,
                                  [dow]: prev[dow].map((s, j) => (j === si ? { ...s, format: fk } : s)),
                                }))
                              }
                              style={{
                                padding: "var(--sp-1) var(--sp-2)",
                                borderRadius: "var(--radius-xs)",
                                border: `1px solid ${slot.format === fk ? f.color : "var(--border)"}`,
                                cursor: "pointer",
                                background: slot.format === fk ? f.color + "33" : "transparent",
                                color: slot.format === fk ? f.color : "var(--text-dim)",
                                fontSize: "var(--fs-3xs)",
                                fontWeight: 600,
                                minHeight: "var(--tap-sm)",
                              }}
                            >
                              <Icon name={FORMAT_ICONS[fk]} size={14} /> {f.label}
                            </button>
                          ))}
                          <input
                            type="time"
                            className="input"
                            aria-label={`Hora de publicación, ${DAYS[dow]} publicación ${si + 1}`}
                            value={slot.publishTime || ""}
                            onChange={(e) =>
                              setFormatConfig((prev) => ({
                                ...prev,
                                [dow]: prev[dow].map((s, j) => (j === si ? { ...s, publishTime: e.target.value } : s)),
                              }))
                            }
                            style={{ width: 100, fontSize: "var(--fs-3xs)", padding: "var(--sp-1)" }}
                          />
                          <select
                            className="input"
                            aria-label={`Tipo de contenido, ${DAYS[dow]} publicación ${si + 1}`}
                            value={slot.pilar || ""}
                            onChange={(e) =>
                              setFormatConfig((prev) => ({
                                ...prev,
                                [dow]: prev[dow].map((s, j) => (j === si ? { ...s, pilar: e.target.value } : s)),
                              }))
                            }
                            style={{ width: "auto", maxWidth: 190, fontSize: "var(--fs-2xs)", padding: "var(--sp-1) var(--sp-2)" }}
                          >
                            <option value="">Tipo: del ritmo</option>
                            {PILARES.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {/* Step 1: Important dates */}
          {step === 1 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                <h3 className="label" style={{ margin: 0 }}>Fechas importantes</h3>
                <button className="btn btn-primary btn-sm" onClick={suggestDates} disabled={aiLoading}>
                  {aiLoading ? "Buscando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}

              {/* Antes estos dos campos se leían con document.getElementById y
                  se limpiaban mutando el DOM: React no conocía su valor. */}
              <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 140px" }}>
                  <label className="label" htmlFor={`${ids}-newdate`}>Fecha</label>
                  <input
                    id={`${ids}-newdate`}
                    className="input"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: "2 1 160px" }}>
                  <label className="label" htmlFor={`${ids}-newdatename`}>Nombre</label>
                  <input
                    id={`${ids}-newdatename`}
                    className="input"
                    value={newDateName}
                    onChange={(e) => setNewDateName(e.target.value)}
                    placeholder="Ej: Día de la Madre"
                  />
                </div>
                <button
                  className="btn btn-secondary"
                  disabled={!newDate || !newDateName}
                  onClick={() => {
                    setImportantDates((prev) => [...prev, { date: newDate, name: newDateName }]);
                    setNewDate("");
                    setNewDateName("");
                  }}
                >
                  Agregar
                </button>
              </div>

              {importantDates.length === 0 ? (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", textAlign: "center", padding: "var(--sp-5)" }}>
                  Sin fechas especiales. Usa «Sugerir con IA» o agrégalas a mano.
                </p>
              ) : (
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {importantDates.map((d, i) => (
                    <li key={`${d.date}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}>
                      <span>
                        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>{d.date}</span>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginLeft: "var(--sp-2)" }}>{d.name}</span>
                      </span>
                      <button
                        type="button"
                        className="btn-remove"
                        aria-label={`Quitar ${d.name} del ${d.date}`}
                        onClick={() => setImportantDates((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* El ritmo de contenido y lo que la temporada sugiere cambiar. */}
              <section className="wizard-ritmo" aria-labelledby={`${ids}-ritmo`}>
                <h3 id={`${ids}-ritmo`} className="label" style={{ margin: "var(--sp-5) 0 var(--sp-1)" }}>Ritmo de contenido</h3>
                <p className="hint" style={{ margin: "0 0 var(--sp-2)" }}>
                  {resumenRitmo(ritmo) || "Este cliente no tiene ritmo: las ideas salen libres."} Se cambia en la ficha del cliente (Semanal).
                </p>
                {sugerencias.length > 0 ? (
                  <>
                    <p className="hint" style={{ margin: "0 0 var(--sp-2)" }}>La temporada sugiere estos cambios (como mucho dos por semana). Marca los que quieras:</p>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      {sugerencias.map((c) => {
                        const activa = aceptadas.some((a) => a.id === c.id);
                        return (
                          <li key={c.id}>
                            <button type="button" className="filter-chip" aria-pressed={activa} style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal", minHeight: "var(--tap)" }}
                              onClick={() => setAceptadas((xs) => (activa ? xs.filter((a) => a.id !== c.id) : [...xs, c]))}>
                              <Icon name={activa ? "checkSquare" : "square"} size={16} />
                              <span><strong>{DAYS[new Date(`${c.fecha}T12:00:00Z`).getUTCDay()]} {fechaCorta(c.fecha)}</strong>: {pilarDe(c.de)?.nombre} → {pilarDe(c.a)?.nombre}. <span style={{ color: "var(--text-dim)" }}>{c.motivo}.</span></span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>Este mes la temporada no pide cambios: se sigue el ritmo tal cual.</p>
                )}
              </section>
            </div>
          )}

          {/* La estrategia, DESPUÉS de las ofertas: la propuesta de la IA las lee. */}
          {step === PASO.estrategia && (
            <PasoEstrategia
              client={client} month={month} year={year}
              objetivo={objetivo} setObjetivo={setObjetivo} focoId={focoId} setFocoId={setFocoId} productos={productosPlan}
              campaign={campaign} setCampaign={setCampaign} offers={offers}
              semanas={semanasPlan().map(({ desde, hasta }) => ({ desde, hasta }))}
              propuesta={propuesta} onPropuesta={aplicarPropuesta} onDeshacer={deshacerPropuesta}
            />
          )}

          {/* Los conceptos de cada semana (la FILA de la rejilla, lunes a domingo) y su etapa del embudo. */}
          {step === PASO.conceptos && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                <h3 className="label" style={{ margin: 0 }}>Conceptos semanales</h3>
                <button className="btn btn-primary btn-sm" onClick={suggestConcepts} disabled={aiLoading}>
                  {aiLoading ? "Generando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {weekConcepts.map((c, i) => (
                  <div key={i}>
                    <label className="label" htmlFor={`${ids}-wc-${i}`}>
                      Semana {i + 1}{semanasPlan()[i] ? ` · del ${+semanasPlan()[i].desde.slice(8)} al ${+semanasPlan()[i].hasta.slice(8)}` : ""}
                    </label>
                    <div className="estrategia-semana">
                      <input
                        id={`${ids}-wc-${i}`}
                        className="input"
                        value={c}
                        onChange={(e) => setWeekConcepts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                        placeholder={`Concepto de la semana ${i + 1}`}
                      />
                      <EtapaSemana semana={i + 1} valor={etapas[i] ?? ""} onCambiar={(v) => setEtapas(weekConcepts.map((_, j) => (j === i ? v : etapas[j] ?? "")))} />
                    </div>
                  </div>
                ))}
                {!etapas.some(Boolean) && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setEtapas(embudoDelMes(objetivo, weekConcepts.length))}>
                    Repartir las etapas del embudo según el objetivo
                  </button>
                )}
              </div>
            </div>
          )}

          {step === PASO.ofertas && (
            <div>
              <h3 className="label">Descuentos y ofertas del mes</h3>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                Si hay descuentos, promociones u ofertas especiales este mes, descríbelas aquí.
                Se usarán como contexto al generar el contenido con IA.
              </p>
              <div className="field">
                <label className="label" htmlFor={`${ids}-offers`}>Ofertas y promociones</label>
                <textarea
                  id={`${ids}-offers`}
                  className="textarea"
                  style={{ minHeight: 100 }}
                  value={offers}
                  onChange={(e) => setOffers(e.target.value)}
                  placeholder="Ej: 20% de descuento en todos los servicios, 2x1 en productos seleccionados, envío gratis por compras mayores a $50…"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-promo`}>Código promocional (opcional)</label>
                <input
                  id={`${ids}-promo`}
                  className="input"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Ej: VERANO2026"
                />
              </div>
            </div>
          )}

          {/* Las ideas del mes */}
          {step === PASO.ideas && (
            <div>
              <h3 className="label" style={{ marginBottom: "var(--sp-3)" }}>Ideas por día</h3>

              {/* Alcance: el mes entero o una semana suelta. Un mes son
                  siete tandas contra el modelo; una semana, una. */}
              <div className="field">
                <label className="label" htmlFor={`${ids}-alcance`}>Qué generar</label>
                <select
                  id={`${ids}-alcance`}
                  className="input"
                  value={alcance}
                  onChange={(e) => setAlcance(e.target.value)}
                  disabled={ocupado}
                >
                  <option value="mes">Todo el mes — {allDays.length} días</option>
                  {semanas.map((w) => (
                    <option key={w} value={String(w)}>
                      Semana {w}{weekConcepts[w - 1] ? ` · ${weekConcepts[w - 1]}` : ""} — {diasDeSemana(w)} {diasDeSemana(w) === 1 ? "día" : "días"}
                    </option>
                  ))}
                </select>
              </div>

              {/* El mes ya tiene publicaciones: esos días no reciben nuevas (no se ponen encima). */}
              {ocupados.size > 0 && (
                <div className="notice" style={{ marginBottom: "var(--sp-2)", display: "block" }}>
                  <p style={{ margin: 0 }}>
                    {MONTHS[month]} ya tiene publicaciones en {ocupados.size} {ocupados.size === 1 ? "día" : "días"}
                    {llenarOcupados ? ": también se añaden ahí." : ": esos días no se tocan y el plan va en los demás."}
                  </p>
                  <label htmlFor={`${ids}-ocupados`} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minHeight: "var(--tap-sm)", fontSize: "var(--fs-xs)" }}>
                    <input id={`${ids}-ocupados`} type="checkbox" checked={llenarOcupados} onChange={(e) => setLlenarOcupados(e.target.checked)} />
                    Añadir también en los días que ya tienen publicaciones
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
                <button className="btn btn-accent btn-sm" style={{ flex: 1, minWidth: 160 }} onClick={generateIdeas} disabled={ocupado}>
                  {aiLoading ? "Generando ideas…" : `Generar ideas de ${etiquetaAlcance}`}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minWidth: 160 }}
                  onClick={generarDescripciones}
                  disabled={ocupado || ideasEnAlcance === 0}
                  title={ideasEnAlcance === 0 ? "Primero hacen falta ideas" : undefined}
                >
                  {descLoading ? "Escribiendo…" : `Escribir guiones y descripciones de ${etiquetaAlcance}`}
                </button>
              </div>
              <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
                Escribe a mano las que tengas claras (basta una breve explicación) y pulsa «Generar ideas»: cada
                publicación sale con su idea, qué se ve, el texto de la pieza (o el guion, en carruseles y reels), el caption
                y los hashtags, con la campaña y el concepto de su semana. Donde escribiste tú, la propuesta de la IA sale al
                lado y eliges. «Escribir guiones y descripciones» completa lo que haya quedado vacío; lo escrito no se reescribe.
                Todo se guarda en este navegador mientras planificas: cerrar no tira nada.
              </p>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}

              {/* Cómo queda repartido el plan (formatos, tipos, niveles) y lo que se descompensa: reglas, sin IA. */}
              <BalanceDelMes days={diasDelPlan()} semanas={semanasPlan()} objetivo={objetivo} foco={focoNombre} titulo="Balance del plan" />

              {/* Idea entry mode toggle */}
              <div className="segmented" role="group" aria-label="Modo de entrada de ideas" style={{ marginBottom: "var(--sp-3)" }}>
                <button
                  type="button"
                  className={`segmented-btn ${ideaMode === "day" ? "active" : ""}`}
                  aria-pressed={ideaMode === "day"}
                  onClick={() => setIdeaMode("day")}
                >
                  Por día
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${ideaMode === "dow" ? "active" : ""}`}
                  aria-pressed={ideaMode === "dow"}
                  onClick={() => setIdeaMode("dow")}
                >
                  Por día de semana
                </button>
              </div>

              {/* By day-of-week mode */}
              {ideaMode === "dow" && (
                <div style={{ marginBottom: "var(--sp-4)" }}>
                  <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                    Define una idea base por día de la semana. Se duplicará en todas las fechas de
                    ese día; la IA generará después versiones únicas para cada una.
                  </p>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const formats = isCustom ? (formatConfig[dow] || []) : (formatConfig[dow] || []).slice(0, postsPerDay);
                    const dowIdea = dowIdeas[dow] || [];
                    return (
                      <div key={dow} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
                        <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>
                          {DAYS[dow]}
                          {dayCategories[dow] && <span style={{ color: "var(--accent-alt)", fontWeight: 400, marginLeft: "var(--sp-2)" }}>{dayCategories[dow]}</span>}
                        </p>
                        {formats.map((f, j) => (
                          <div key={j} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                            <Icon name={FORMAT_ICONS[f.format] || "formatPost"} size={16} style={{ color: FORMATS[f.format]?.color, width: 22 }} />
                            <input
                              className="input"
                              style={{ flex: 1 }}
                              aria-label={`Idea base de ${DAYS[dow]}, ${FORMATS[f.format]?.label || "publicación"} ${j + 1}`}
                              value={dowIdea[j]?.idea || ""}
                              onChange={(e) => {
                                setDowIdeas((prev) => {
                                  const current = [...(prev[dow] || [])];
                                  while (current.length <= j) current.push({ idea: "" });
                                  current[j] = { ...current[j], idea: e.target.value };
                                  return { ...prev, [dow]: current };
                                });
                              }}
                              placeholder="Idea base (se duplicará)…"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <button className="btn btn-primary" style={{ width: "100%", marginTop: "var(--sp-2)" }} onClick={applyDowIdeas}>
                    Aplicar a todos los días
                  </button>
                </div>
              )}

              {/* Mini calendario: sólo resumen visual del progreso */}
              <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2, marginBottom: "var(--sp-2)" }}>
                {DAYS_SHORT.map((d) => (
                  <div key={d} style={{ textAlign: "center", fontSize: "var(--fs-3xs)", fontWeight: 700, color: "var(--text-muted)", padding: "var(--sp-1)" }}>{d}</div>
                ))}
              </div>
              <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2, marginBottom: "var(--sp-2)" }}>
                {(() => {
                  const first = new Date(year, month, 1);
                  const pad = first.getDay();
                  const cells = [];
                  for (let i = 0; i < pad; i++) cells.push(<div key={`p${i}`} />);
                  allDays.forEach((d) => {
                    const date = fmtDate(d);
                    const hasIdeas = ideas[date]?.some((p) => p.idea);
                    const impDate = importantDates.find((id) => id.date === date);
                    cells.push(
                      <div
                        key={date}
                        style={{
                          padding: "var(--sp-1)",
                          textAlign: "center",
                          borderRadius: "var(--radius-xs)",
                          background: hasIdeas ? "var(--accent-soft)" : "var(--bg)",
                          border: `1px solid ${impDate ? "var(--accent-alt)" : hasIdeas ? "var(--accent)" : "var(--border-light)"}`,
                        }}
                      >
                        <div style={{ fontSize: "var(--fs-2xs)", fontWeight: 700 }}>{d.getDate()}</div>
                        <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
                          {ocupados.has(date) && !llenarOcupados ? "ya tiene" : `${(ideas[date] || []).filter((p) => p.idea).length}/${isCustom ? (formatConfig[d.getDay()] || []).length : postsPerDay}`}
                        </div>
                      </div>
                    );
                  });
                  return cells;
                })()}
              </div>
              <p role="status" className="hint" style={{ marginBottom: "var(--sp-4)" }}>
                {Object.values(ideas).flat().filter((p) => p?.idea).length} ideas definidas de {estructuraDelMes().reduce((t, d) => t + d.formats.length, 0)} publicaciones
                {" · "}
                {Object.values(ideas).flat().filter((p) => p?.descripcion).length} con descripción escrita
                {Object.values(ideas).flat().some((p) => p?.guion) ? ` · ${Object.values(ideas).flat().filter((p) => p?.guion).length} con guion` : ""}.
              </p>

              {/* Per-day idea list */}
              {ideaMode === "day" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {allDays.map((d) => {
                    const date = fmtDate(d);
                    const dayIdeas = ideas[date] || [];
                    if (!dayIdeas.length) return null;
                    return (
                      <div key={date} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)" }}>
                        <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>
                          {d.getDate()} {DAYS[d.getDay()]}
                        </p>
                        {dayIdeas.map((p, j) => (
                          <div key={j} style={{ marginBottom: "var(--sp-2)" }}>
                            <label
                              className="label"
                              style={{ textTransform: "none", color: FORMATS[p.format]?.color || "var(--accent)" }}
                              htmlFor={`${ids}-idea-${date}-${j}`}
                            >
                              <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={14} style={{ display: "inline-block", verticalAlign: "-2px" }} /> {FORMATS[p.format]?.label || "Publicación"} {j + 1}
                              {p.pilar && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {nombreDePilar(p.pilar, p.pilarSub)}{p.producto ? ` · ${p.producto}` : ""}</span>}
                            </label>
                            <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                              <input
                                id={`${ids}-idea-${date}-${j}`}
                                className="input"
                                style={{ flex: 1 }}
                                value={p.idea || ""}
                                onChange={(e) => {
                                  const newDayIdeas = [...dayIdeas];
                                  newDayIdeas[j] = { ...newDayIdeas[j], idea: e.target.value };
                                  setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                                }}
                                placeholder="Idea, o una breve explicación de lo que quieres…"
                              />
                              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado || Boolean(mejorando) || !p.idea?.trim()}
                                onClick={() => mejorarUna(date, j)} aria-label={`Mejorar con IA la idea del ${d.getDate()}, ${FORMATS[p.format]?.label || "publicación"} ${j + 1}`}>
                                <Icon name="sparkles" size={14} /> {mejorando === `${date}|${j}` ? "Mejorando…" : "Mejorar"}
                              </button>
                            </div>
                            {estructuras.length > 0 && llevaGuion(p.format) && (
                              <select className="input" style={{ marginTop: "var(--sp-1)", fontSize: "var(--fs-2xs)" }}
                                aria-label={`Estructura para el guion del ${d.getDate()}, ${FORMATS[p.format]?.label || "publicación"} ${j + 1}`}
                                value={p.referenciaId || ""}
                                onChange={(e) => {
                                  const ref = estructuras.find((x) => x.id === e.target.value);
                                  const newDayIdeas = [...dayIdeas];
                                  newDayIdeas[j] = { ...newDayIdeas[j], referenciaId: ref?.id ?? "", estructuraRef: ref ? estructuraATexto(ref.analisis.estructura) : "" };
                                  setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                                }}>
                                <option value="">Estructura del guion: libre</option>
                                {estructuras.map((x) => <option key={x.id} value={x.id}>Como el video de {x.competidor || "la competencia"}{x.analisis.gancho ? ` («${x.analisis.gancho.slice(0, 40)}»)` : ""}</option>)}
                              </select>
                            )}
                            {p.sugerencia && (
                              <div className="plan-sugerencia" role="group" aria-label="Propuesta de la IA">
                                <p style={{ margin: 0 }}><strong>Propuesta de la IA:</strong> {p.sugerencia}</p>
                                <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => decidirSugerencia(date, j, true)}>Usar esta</button>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => decidirSugerencia(date, j, false)}>Quedarme con la mía</button>
                                </div>
                              </div>
                            )}
                            {/* Lo que escribió el motor de ideas además de la idea: qué se ve y el texto de la pieza (plegado). */}
                            {(p.escena || p.textoPieza) && (
                              <details className="plan-pieza" style={{ marginTop: "var(--sp-1)" }}>
                                <summary style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", cursor: "pointer", minHeight: "var(--tap-sm)", display: "flex", alignItems: "center" }}>
                                  {p.title ? `«${p.title}» · ` : ""}qué se ve{p.textoPieza ? " y texto de la pieza" : ""}
                                </summary>
                                {[["escena", "Qué se ve"], ["textoPieza", "Texto en la pieza"]].filter(([k]) => p[k] !== undefined && (k !== "textoPieza" || llevaTextoPieza(p.format))).map(([k, nombre]) => (
                                  <div key={k} className="field" style={{ marginTop: "var(--sp-1)" }}>
                                    <label className="label" style={{ textTransform: "none", color: "var(--text-dim)" }} htmlFor={`${ids}-${k}-${date}-${j}`}>{nombre}</label>
                                    <textarea id={`${ids}-${k}-${date}-${j}`} className="textarea" style={{ minHeight: 56, fontSize: "var(--fs-2xs)" }} value={p[k] || ""}
                                      onChange={(e) => {
                                        const newDayIdeas = [...dayIdeas];
                                        newDayIdeas[j] = { ...newDayIdeas[j], [k]: e.target.value };
                                        setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                                      }} />
                                  </div>
                                ))}
                              </details>
                            )}
                            {p.guion && (
                              <>
                                <label className="label" style={{ textTransform: "none", marginTop: "var(--sp-2)", color: "var(--text-dim)" }} htmlFor={`${ids}-guion-${date}-${j}`}>
                                  Guion
                                </label>
                                <textarea
                                  id={`${ids}-guion-${date}-${j}`}
                                  className="textarea"
                                  style={{ minHeight: 90, fontSize: "var(--fs-2xs)" }}
                                  value={p.guion}
                                  onChange={(e) => {
                                    const newDayIdeas = [...dayIdeas];
                                    newDayIdeas[j] = { ...newDayIdeas[j], guion: e.target.value };
                                    setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                                  }}
                                />
                              </>
                            )}
                            {/* El caption aparece cuando existe: enseñarlo
                                vacío en todas las publicaciones del mes
                                convertía este paso en un muro de cajas. */}
                            {p.descripcion && (
                              <>
                                <label
                                  className="label"
                                  style={{ textTransform: "none", marginTop: "var(--sp-2)", color: "var(--text-dim)" }}
                                  htmlFor={`${ids}-desc-${date}-${j}`}
                                >
                                  Descripción
                                </label>
                                <textarea
                                  id={`${ids}-desc-${date}-${j}`}
                                  className="textarea"
                                  style={{ minHeight: 90, fontSize: "var(--fs-2xs)" }}
                                  value={p.descripcion}
                                  onChange={(e) => {
                                    const newDayIdeas = [...dayIdeas];
                                    newDayIdeas[j] = { ...newDayIdeas[j], descripcion: e.target.value };
                                    setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                                  }}
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {step === STEP_LABELS.length - 1 && (
          <div style={{ padding: "0 var(--sp-4) var(--sp-2)", display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <input className="input" style={{ flex: 1, minWidth: 140, fontSize: "var(--fs-2xs)" }} placeholder="Nombre de plantilla completa…" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "var(--fs-3xs)" }} disabled={!tplName.trim()} onClick={() => saveTemplate("full")}>
              <Icon name="calendar" size={14} /> Guardar como plantilla
            </button>
          </div>
        )}
        <div className="sheet-footer">
          {step > 0 && (
            <button className="btn btn-secondary" onClick={goBack}>
              Atrás
            </button>
          )}
          <button className="btn btn-secondary" style={{ flex: step > 0 ? undefined : 1 }} onClick={onClose}>
            Cancelar
          </button>
          {step < STEP_LABELS.length - 1 ? (
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={goNext}>
              Siguiente
            </button>
          ) : (
            <button className="btn btn-accent" style={{ flex: 2 }} onClick={handleGenerate} disabled={creando}>
              {creando ? "Creando…" : "Crear calendario"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
