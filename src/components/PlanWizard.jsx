import { useEffect, useId, useMemo, useState, useRef } from "react";
import { PLANS, FORMATS, FORMAT_ICONS, MONTHS, DAYS, DAYS_SHORT } from "../constants";
import { uid, daysInMonth, fmtDate, getWeekNumber, dayName } from "../utils";
import { callAI, buildClientContext, buildDescripcionesPrompt, buildScriptPrompt, loadADN, parseAIResponse, pasajesDeLaTanda } from "../api";
import { loadClientMemories } from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";
import Icon from "./Icon";
import { fechasDelMes } from "../lib/fechasEspeciales";
import { leerMercado } from "../lib/mercado";
import { productosParaPlan, limpiarEstudio, estructuraATexto } from "../lib/estudioMercado";
import { leerPlantillas } from "../lib/plantillasApi";
import { plantillaDelCliente, configDeFormatos, resumenPlantilla, OBJETIVOS_PLAN } from "../lib/plantillasPlan";
import {
  PILARES, limpiarRitmo, ritmoDelMes, sugerenciasDeTemporada, asignarMatriz, lineasDeContenido, reglasDeLosTipos,
  nombreDePilar, resumenRitmo, fechaCorta, CAMPOS_MATRIZ, pilarDe,
} from "../lib/pilares";

// Sin paso de categorías: se quitaron del calendario. Las que haya en la
// ficha del cliente (Semanal) siguen informando a la IA sin preguntarse aquí.
const STEP_LABELS = ["Plan", "Fechas y ritmo", "Campaña", "Conceptos", "Ofertas", "Ideas"];

/** Los formatos que llevan guion además de descripción (los demás, sólo caption). */
const FORMATOS_CON_GUION = new Set(["reel", "carrusel", "historia", "live"]);

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
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState(mesInicial?.month ?? new Date().getMonth());
  const [year, setYear] = useState(mesInicial?.year ?? new Date().getFullYear());
  const [plan, setPlan] = useState("standard");
  const [formatConfig, setFormatConfig] = useState(() => {
    const cfg = {};
    for (let dow = 0; dow < 7; dow++) {
      cfg[dow] = [{ format: "post" }, { format: "reel" }];
    }
    return cfg;
  });
  const [importantDates, setImportantDates] = useState([]);
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
  const ritmo = limpiarRitmo(client?.ritmoContenido);
  const [aceptadas, setAceptadas] = useState([]);
  const sugerencias = useMemo(
    () => sugerenciasDeTemporada({ year, month, ritmo: client?.ritmoContenido, fechas: fechasDelMes(year, month, client?.fechasEspeciales) }),
    [year, month, client?.ritmoContenido, client?.fechasEspeciales],
  );
  useEffect(() => { setAceptadas([]); }, [year, month]);
  const ritmoMes = ritmoDelMes(year, month, ritmo, aceptadas);
  // El catálogo y el estudio de mercado: de ahí salen el producto, el deseo y el perfil de cada publicación.
  const [mercado, setMercado] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (client?.id) leerMercado(client.dbId || client.id).then((m) => { if (vivo) setMercado(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [client?.id, client?.dbId]);
  const [campaign, setCampaign] = useState("");
  const [weekConcepts, setWeekConcepts] = useState(["", "", "", "", ""]);
  const [dayCategories, setDayCategories] = useState(() => {
    const cats = {};
    for (let dow = 0; dow < 7; dow++) cats[dow] = "";
    return cats;
  });
  const [offers, setOffers] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [ideas, setIdeas] = useState({});
  const [ideaMode, setIdeaMode] = useState("day");
  // Qué trozo del mes se genera: «mes» o el número de una semana. El mes
  // entero son treinta días por siete tandas; una semana cabe en una, y es
  // lo que se quiere cuando el calendario se va aprobando por partes.
  const [alcance, setAlcance] = useState("mes");
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
  const [plantillaElegida, setPlantillaElegida] = useState("");
  const aplicarPlantilla = (t) => {
    setPlan("custom");
    const cfg = configDeFormatos(t);
    setFormatConfig(Object.fromEntries(Object.entries(cfg).map(([dow, lista]) => [dow, lista.map((h) => ({ ...h, publishTime: "" }))])));
  };
  useEffect(() => {
    let vivo = true;
    leerPlantillas().then((lista) => {
      if (!vivo) return;
      setPlantillas(lista);
      const delCliente = plantillaDelCliente(client?.planContenido, lista);
      if (delCliente) {
        setPlantillaElegida(delCliente.personalizada ? "cliente" : delCliente.id);
        aplicarPlantilla(delCliente);
      }
    }).catch(() => { if (vivo) setPlantillas([]); });
    return () => { vivo = false; };
    // Sólo al abrir: elegir otra plantilla o tocar los formatos después no debe volver a la del cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const plantillaDelClienteActual = plantillas ? plantillaDelCliente(client?.planContenido, plantillas) : null;
  const elegirPlantilla = (id) => {
    setPlantillaElegida(id);
    const t = id === "cliente" ? plantillaDelClienteActual : (plantillas ?? []).find((p) => p.id === id);
    if (t) aplicarPlantilla(t);
  };
  const plantillaActual = plantillaElegida === "cliente" ? plantillaDelClienteActual : (plantillas ?? []).find((p) => p.id === plantillaElegida);

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

  const suggestCampaign = async () => {
    setAiLoading(true);
    setAiStatus("Generando sugerencias de campana...");
    try {
      const ctx = buildClientContext(client);
      const prompt = `${ctx}\n\nSugiere 3 temas de campana para ${MONTHS[month]} ${year}. Una linea por sugerencia. Solo las sugerencias, nada mas.`;
      const txt = await callAI(prompt, { funcion: "calendario", clienteId: client?.id });
      setCampaign(txt.split("\n").filter(Boolean)[0] || "");
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
      const numWeeks = Math.ceil(allDays.length / 7);
      const prompt = `${ctx}\n\nGenera ${numWeeks} conceptos semanales para el calendario de ${MONTHS[month]} ${year}.
Campana: ${campaign || "N/A"}
Formato: una linea por semana, solo el concepto. ${numWeeks} lineas exactas.`;
      const txt = await callAI(prompt, { funcion: "calendario", clienteId: client?.id });
      const lines = txt.split("\n").filter(Boolean).slice(0, 5);
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
      const wk = getWeekNumber(date, fmtDate(allDays[0]));
      const pilar = ritmoMes[date] || "";
      const cat = nombreDePilar(pilar) || dayCategories[dow] || "";
      const impDate = importantDates.find((id) => id.date === date);
      const formats = isCustom ? (formatConfig[dow] || []) : (formatConfig[dow] || []).slice(0, postsPerDay);
      const existingIdeas = ideas[date] || [];
      return { date, dow, wk, cat, pilar, impDate, formats, existingIdeas };
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
        // El tipo de la publicación: el que diga la plantilla (un reel viral, la comunidad) o el del ritmo del día.
        lista.push({ clave: `${d.date}|${j}`, pilar: f.pilar || d.pilar, ...propia });
      });
    }
    const asignada = asignarMatriz(lista, {
      productos: productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario), deseos: general?.deseos ?? [], perfiles: general?.perfiles ?? [],
    });
    return new Map(asignada.map(({ clave, ...m }) => [clave, Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, m[k] ?? ""]))]));
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

  const generateIdeas = async () => {
    if (generating.current) return;
    generating.current = true;
    setAiLoading(true);
    setAiStatus("Generando ideas...");
    try {
      if (!client.githubContext && client.githubRepo) setAiStatus("Cargando ADN desde GitHub...");
      const adn = await loadADN(client);
      const adnExtra = adn.content;
      const daysList = enAlcance(estructuraDelMes());
      const matriz = matrizDelMes();
      const conTipos = daysList.some((d) => d.pilar);

      const BATCH = 7;
      const newIdeas = { ...ideas };
      for (let i = 0; i < daysList.length; i += BATCH) {
        const batch = daysList.slice(i, i + BATCH);
        setAiStatus(`Ideas ${i + 1}-${Math.min(i + BATCH, daysList.length)} de ${daysList.length} días…`);
        const daysDesc = batch
          .map((d) => {
            const fmts = d.formats.map((f) => f.format).join(", ");
            const existing = d.existingIdeas
              .filter((e) => e.idea)
              .map((e, j) => `  Post ${j + 1}: ${e.idea}`)
              .join("\n");
            // Por publicación, su tipo de contenido, producto, nivel y a quién le habla (la matriz del mes).
            const porPost = d.formats
              .map((f, j) => { const m = lineasDeContenido(matriz.get(`${d.date}|${j}`)); return m ? `  Post ${j + 1} (${f.format}): ${m.replace(/\n/g, " | ")}` : ""; })
              .filter(Boolean).join("\n");
            return `${d.date} (${DAYS[d.dow]}) | Cat: ${d.cat || "libre"} | Semana ${d.wk}: ${weekConcepts[d.wk - 1] || "libre"} | Formatos: ${fmts}${d.impDate ? ` | FECHA ESPECIAL: ${d.impDate.name}` : ""}${porPost ? `\n${porPost}` : ""}${existing ? `\n  Ideas existentes:\n${existing}` : ""}`;
          })
          .join("\n");

        // Lo estable (ADN o ficha y cifras) se cachea; los pasajes son de ESTA tanda de días.
        const pasajes = await pasajesDeLaTanda(client, adn, { campaign }, batch.map((d) => ({
          idea: (d.existingIdeas || []).map((e) => e.idea).filter(Boolean).join(" "),
          category: d.cat,
          format: d.formats.map((f) => f.format).join(" "),
          _concept: weekConcepts[d.wk - 1] || "",
        })));
        const ctx = buildClientContext(client, { campaign }, adnExtra, adn.cerebro ? { pasajes } : null);
        const prompt = `${ctx}

CAMPANA: ${campaign || "N/A"}

Genera ideas UNICAS para cada publicacion de estos dias.
IMPORTANTE: Cada idea debe ser DIFERENTE incluso si el dia de la semana es el mismo.
${conTipos ? `Cada publicación dice su TIPO DE CONTENIDO, su PRODUCTO, su NIVEL DE CONSCIENCIA y a quién le habla: la idea los cumple, con ojo de marketing profesional (un gancho claro y una razón para actuar).\n\n${reglasDeLosTipos()}\n` : ""}
Si ya hay idea existente, la escribió una persona (a veces con una breve explicación de lo que quiere): MEJÓRALA conservando su intención —el mismo tema, producto y enfoque—, más clara y con mejor gancho. Si no hay, genera una nueva.
Cada idea: 1-2 oraciones claras y accionables, sin guion ni descripción.

FORMATO DE RESPUESTA (respeta exactamente):
===DIA===
FECHA: YYYY-MM-DD
===POST===
FORMATO: formato
IDEA:
idea aqui
===POST===
FORMATO: formato
IDEA:
idea aqui
===FIN===

DIAS:
${daysDesc}`;

        const txt = await callAI(prompt, { funcion: "calendario", clienteId: client?.id });
        for (const block of txt.split("===DIA===").slice(1)) {
          const dateMatch = block.match(/FECHA:\s*([\d-]+)/);
          if (!dateMatch) continue;
          const date = dateMatch[1].trim();
          const posts = [];
          for (const pb of block.split("===POST===").slice(1)) {
            const fm = pb.match(/FORMATO:\s*(\S+)/);
            const im = pb.match(/IDEA:\n?([\s\S]*?)(?:===|$)/);
            if (im) {
              posts.push({
                format: (fm?.[1] || "post").toLowerCase().trim(),
                idea: im[1].trim(),
              });
            }
          }
          const dayData = daysList.find((d) => d.date === date);
          if (dayData) {
            const merged = dayData.formats.map((f, j) => {
              const existing = (newIdeas[date] || [])[j];
              const aiIdea = posts[j];
              // Lo escrito por una persona no se pisa: la versión de la IA queda AL LADO como propuesta
              // («Usar esta» / «Quedarme con la mía»). Antes se pedía mejorarla y la mejora se tiraba.
              const propia = existing?.idea?.trim();
              const propuesta = propia && aiIdea?.idea && aiIdea.idea.trim() !== propia ? aiIdea.idea.trim() : "";
              return {
                ...matriz.get(`${date}|${j}`),
                id: existing?.id || uid(),
                format: f.format,
                idea: existing?.idea || aiIdea?.idea || "",
                sugerencia: propuesta || existing?.sugerencia || "",
                guion: existing?.guion || "",
                referenciaId: existing?.referenciaId || "",
                estructuraRef: existing?.estructuraRef || "",
                referenceLink: existing?.referenceLink || "",
                image: existing?.image || null,
                // La descripción sobrevive a una regeneración de ideas: si
                // la idea no cambió, tirar su caption es tirar una llamada
                // al modelo por nada.
                descripcion: existing?.descripcion || "",
                hashtagsFinales: existing?.hashtagsFinales || "",
                textoPieza: existing?.textoPieza || "",
                script: "",
                status: "pending",
                category: dayData.cat,
              };
            });
            newIdeas[date] = merged;
          }
        }
        setIdeas({ ...newIdeas });
      }
    } catch (e) {
      setAiStatus("Error: " + e.message);
      setTimeout(() => setAiStatus(""), 3000);
    }
    setAiLoading(false);
    setAiStatus("");
    generating.current = false;
  };

  /**
   * Escribe los guiones y las descripciones de las ideas que ya están definidas.
   *
   * Es el segundo paso del asistente: primero se acuerdan las ideas —y se
   * revisan a mano, que para eso están en pantalla—, y sólo después se
   * escribe. Un reel, carrusel, historia o directo sin guion pide guion Y
   * descripción en la misma llamada (`buildScriptPrompt`); lo que sólo
   * necesita caption va por `buildDescripcionesPrompt`, que gasta la mitad.
   * Trabaja sobre el mismo alcance que las ideas: el mes entero o una semana.
   *
   * Salta lo que ya está escrito, para que volver a pulsar el botón complete
   * lo que faltó en vez de reescribir el mes: rellenar no es reescribir.
   */
  const generarDescripciones = async () => {
    if (generating.current) return;
    generating.current = true;
    setDescLoading(true);
    setAiStatus("Preparando guiones y descripciones…");
    try {
      if (!client.githubContext && client.githubRepo) setAiStatus("Cargando ADN desde GitHub…");
      const [adn, wizMems] = await Promise.all([
        loadADN(client),
        loadClientMemories(client.dbId || client.id).catch(() => []),
      ]);
      const adnExtra = adn.content;

      // Se aplana a lista de publicaciones: la tanda se mide en
      // publicaciones, no en días, porque un día premium lleva tres.
      const conGuion = [];
      const soloDescripcion = [];
      const matriz = matrizDelMes();
      for (const d of enAlcance(estructuraDelMes())) {
        (ideas[d.date] || []).forEach((p, j) => {
          if (!p?.idea?.trim()) return;
          const format = p.format || d.formats[j]?.format || "post";
          const faltaGuion = FORMATOS_CON_GUION.has(format) && !p.guion?.trim();
          if (!faltaGuion && p.descripcion?.trim()) return;
          (faltaGuion ? conGuion : soloDescripcion).push({
            ...matriz.get(`${d.date}|${j}`),
            ...p,
            _date: d.date,
            _dayName: DAYS[d.dow],
            _weekNumber: d.wk,
            _concept: weekConcepts[d.wk - 1] || "",
            _indice: j,
            format,
            category: p.category || d.cat,
          });
        });
      }
      const total = conGuion.length + soloDescripcion.length;

      if (!total) {
        setAiStatus(`No hay nada sin escribir en ${etiquetaAlcance}.`);
        setTimeout(() => setAiStatus(""), 3000);
        return;
      }

      const calendarioParcial = { campaign, offers, promoCode, weekConcepts };
      const BATCH = 6;
      const escritas = { ...ideas };
      let hechas = 0;

      for (const [lista, conGuiones] of [[conGuion, true], [soloDescripcion, false]]) {
        for (let i = 0; i < lista.length; i += BATCH) {
          const tanda = lista.slice(i, i + BATCH);
          setAiStatus(`${conGuiones ? "Guiones" : "Descripciones"} ${hechas + 1}-${hechas + tanda.length} de ${total}…`);

          const pasajes = await pasajesDeLaTanda(client, adn, calendarioParcial, tanda);
          const cerebro = adn.cerebro ? { pasajes } : null;
          const prompt = conGuiones
            ? buildScriptPrompt(client, calendarioParcial, tanda, adnExtra, wizMems, cerebro)
            : buildDescripcionesPrompt(client, calendarioParcial, tanda, adnExtra, wizMems, cerebro);
          // `tolerarCorte` porque una tanda que se corta en la última
          // publicación trae las cinco anteriores enteras: rechazarla entera
          // obligaba a repetir el mes por una descripción.
          const { texto } = await callAI([{ type: "text", text: prompt }], { maxTokens: 8000, tolerarCorte: true, funcion: conGuiones ? "guiones" : "descripciones", clienteId: client?.id });
          const leidas = parseAIResponse(texto);

          for (const p of tanda) {
            const r = leidas[p.id];
            if (!r?.descripcion && !r?.guion) continue;
            const dia = [...(escritas[p._date] || [])];
            const actual = dia[p._indice] || {};
            dia[p._indice] = {
              ...actual,
              // Lo que ya tenía texto gana sobre lo que devuelve el modelo.
              guion: actual.guion?.trim() || !conGuiones ? (actual.guion || "") : (r.guion || ""),
              descripcion: actual.descripcion?.trim() ? actual.descripcion : (r.descripcion || ""),
              hashtagsFinales: r.hashtagsFinales || actual.hashtagsFinales || "",
              textoPieza: actual.textoPieza?.trim() ? actual.textoPieza : (r.textoPieza || ""),
            };
            escritas[p._date] = dia;
          }
          hechas += tanda.length;
          setIdeas({ ...escritas });
        }
      }

      const sinEscribir = [...conGuion, ...soloDescripcion].filter((p) => {
        const x = escritas[p._date]?.[p._indice];
        return !x?.descripcion?.trim() || (FORMATOS_CON_GUION.has(p.format) && !x?.guion?.trim());
      });
      setAiStatus(
        sinEscribir.length
          ? `Listo, pero ${sinEscribir.length} de ${total} se quedaron a medias. Vuelve a pulsar para completarlas.`
          : `Listo: ${total} ${total === 1 ? "publicación escrita" : "publicaciones escritas"}${conGuion.length ? ` (${conGuion.length} con guion)` : ""}.`
      );
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
      const adn = await loadADN(client);
      const d = estructuraDelMes().find((x) => x.date === date);
      const tipo = lineasDeContenido({ ...matrizDelMes().get(`${date}|${j}`), ...Object.fromEntries(CAMPOS_MATRIZ.filter((k) => p[k]).map((k) => [k, p[k]])) });
      const pasajes = await pasajesDeLaTanda(client, adn, { campaign }, [{ idea: p.idea, category: d?.cat, format: p.format, _concept: weekConcepts[(d?.wk ?? 1) - 1] || "" }]);
      const ctx = buildClientContext(client, { campaign }, adn.content, adn.cerebro ? { pasajes } : null);
      const prompt = `${ctx}

Una persona de la agencia escribió esta idea (a veces es una breve explicación de lo que quiere) para el ${date} (${DAYS[d?.dow ?? 0]}), formato ${p.format}:
«${p.idea.trim()}»
${tipo ? `\n${tipo}\n` : ""}${d?.impDate ? `FECHA ESPECIAL: ${d.impDate.name}\n` : ""}${weekConcepts[(d?.wk ?? 1) - 1] ? `CONCEPTO DE LA SEMANA: ${weekConcepts[(d?.wk ?? 1) - 1]}\n` : ""}
Mejórala con ojo de marketing profesional: conserva su intención (el mismo tema, producto y enfoque), dale un gancho claro y una razón para actuar. Sin inventar precios, descuentos, garantías ni testimonios.
Responde SOLO con la idea mejorada, en 1-2 oraciones, sin comillas ni explicación.`;
      const texto = String(await callAI(prompt, { funcion: "calendario", clienteId: client?.id }) ?? "").trim().replace(/^[«"]|[»"]$/g, "");
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

  const handleGenerate = () => {
    const matriz = matrizDelMes();
    const calDays = allDays.map((d) => {
      const date = fmtDate(d);
      const dow = d.getDay();
      const wk = getWeekNumber(date, fmtDate(allDays[0]));
      const cat = nombreDePilar(ritmoMes[date]) || dayCategories[dow] || "";
      const impDate = importantDates.find((id) => id.date === date);
      const formats = isCustom ? (formatConfig[dow] || []) : (formatConfig[dow] || []).slice(0, postsPerDay);
      const dayIdeas = ideas[date] || [];

      const posts = formats.map((f, j) => {
        const idea = dayIdeas[j];
        const m = matriz.get(`${date}|${j}`) ?? {};
        return {
          ...Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, idea?.[k] || m[k] || ""])),
          id: idea?.id || uid(),
          format: f.format,
          idea: idea?.idea || "",
          referenceLink: idea?.referenceLink || "",
          image: idea?.image || null,
          guion: idea?.guion || "",
          ...(idea?.estructuraRef ? { estructuraRef: idea.estructuraRef } : {}),
          descripcion: idea?.descripcion || "",
          hashtagsFinales: idea?.hashtagsFinales || "",
          ...(idea?.textoPieza ? { textoPieza: idea.textoPieza } : {}),
          script: idea?.descripcion || idea?.script || "",
          status: idea?.status || "pending",
          category: nombreDePilar(idea?.pilar || m.pilar) || cat,
          comment: "",
          publishTime: f.publishTime || "",
        };
      });

      return {
        date,
        dayName: dayName(date),
        weekNumber: wk,
        concept: weekConcepts[wk - 1] || "",
        category: cat,
        specialDate: impDate?.name || "",
        posts,
      };
    });

    onGenerate({
      month,
      year,
      campaign,
      weekConcepts,
      offers: offers || "",
      promoCode: promoCode || "",
      days: calDays,
    });
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

          {/* Step 2: Campaign theme */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
                <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-campaign`}>Tema de campaña del mes</label>
                <button className="btn btn-primary btn-sm" onClick={suggestCampaign} disabled={aiLoading}>
                  {aiLoading ? "Generando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}
              <textarea
                id={`${ids}-campaign`}
                className="textarea"
                style={{ minHeight: 100 }}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Ej: Promoción de Regreso a Clases"
              />
            </div>
          )}

          {/* Step 3: Weekly concepts */}
          {step === 3 && (
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
                    <label className="label" htmlFor={`${ids}-wc-${i}`}>Semana {i + 1}</label>
                    <input
                      id={`${ids}-wc-${i}`}
                      className="input"
                      value={c}
                      onChange={(e) => setWeekConcepts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      placeholder={`Concepto de la semana ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
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

          {/* Step 6: Ideas review */}
          {step === 5 && (
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
                      Semana {w}{weekConcepts[w - 1] ? ` · ${weekConcepts[w - 1]}` : ""} — {diasDeSemana(w)} días
                    </option>
                  ))}
                </select>
              </div>

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
                Primero las ideas: escribe a mano las que tengas claras (basta una breve explicación) y pulsa «Mejorar»
                o «Generar ideas»; la propuesta de la IA sale al lado de la tuya y tú eliges. Cuando estén revisadas,
                «Escribir guiones y descripciones»: reels, carruseles, historias y directos llevan guion; los posts,
                sólo caption. Lo que ya está escrito no se reescribe.
              </p>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}

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
                        <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{(ideas[date] || []).filter((p) => p.idea).length}/{isCustom ? (formatConfig[d.getDay()] || []).length : postsPerDay}</div>
                      </div>
                    );
                  });
                  return cells;
                })()}
              </div>
              <p role="status" className="hint" style={{ marginBottom: "var(--sp-4)" }}>
                {Object.values(ideas).flat().filter((p) => p?.idea).length} ideas definidas de {isCustom ? allDays.reduce((t, d) => t + (formatConfig[d.getDay()] || []).length, 0) : allDays.length * postsPerDay} publicaciones
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
                            {estructuras.length > 0 && FORMATOS_CON_GUION.has(p.format) && (
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
            <button className="btn btn-accent" style={{ flex: 2 }} onClick={handleGenerate}>
              Crear calendario
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
