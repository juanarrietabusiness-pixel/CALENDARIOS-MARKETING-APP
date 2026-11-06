import { lazy, Suspense, useCallback, useEffect, useId, useState } from "react";
import Icon from "../Icon";
import BarraPestanas from "../BarraPestanas";
import SemaforoKit from "./SemaforoKit";
import { idDePestana, idDelPanel } from "../../lib/pestanas";
import { semaforoDelKit } from "../../lib/semaforoKit";
import { estudioDelCliente } from "../../lib/semaforoKitApi";
import { listarCerebro } from "../../lib/cerebro";
import { MONTHS } from "../../constants";
import { fechaEnZona } from "../../lib/agenda";
import { mesDeFecha } from "../../lib/meses";
import { catalogoDelAnio, preferenciasFechas, TIPOS_FECHA } from "../../lib/fechasEspeciales";
import "./cliente.css";

// ============================================================
// La pestaña «Marca» de un cliente (fase 7)
//
// Lo que se define una vez y vale en todo lo que se hace para él, que antes vivía en seis sitios: la ficha (pestaña
// Ficha), el kit de marca y la voz (al fondo del Estudio), el cerebro con su estudio de mercado (pestaña Cerebro), el
// plan semanal y las fechas especiales (el menú «⋯» del calendario) y su carpeta de Drive (pestaña Contenido). Cada
// uno es una sub-sección con su dirección (`/cliente/x/marca/kit`…); las de antes (`/ficha`, `/cerebro`, `/contenido`)
// llevan aquí.
//
// Arriba, el SEMÁFORO del kit (lib/semaforoKit.js): qué le falta para que el diseño salga bien, con el arreglo a un
// toque. Se calcula con GET /api/estudio (que también usa el kit) y el estado del cerebro: ninguna consulta nueva.
// Con el curso de campañas suma el estudio de mercado (revisarlo cada mes) y la sub-sección «WhatsApp»: el kit de
// WhatsApp Business y la voz de sus clientes (negocio/KitWhatsApp.jsx). «Música y efectos» es su BIBLIOTECA DE SONIDO
// (BibliotecaSonido.jsx): lo de Suno, lo subido y sus efectos, y lo que toma de la de la agencia.
// ============================================================

const FichaCliente = lazy(() => import("../FichaCliente"));
const EstudioKit = lazy(() => import("../EstudioKit"));
const VozDeMarca = lazy(() => import("../VozDeMarca"));
const MusicaDeMarca = lazy(() => import("../MusicaDeMarca"));
// El estilo de los videos animados de la marca y sus imágenes de referencia (lo sigue la IA del guion como obligatorio).
const EstiloVideoMarca = lazy(() => import("../EstiloVideoMarca"));
// La biblioteca de sonido del cliente: su música (Suno, subidas) y sus efectos, con «Usar de la agencia».
const BibliotecaSonido = lazy(() => import("../BibliotecaSonido"));
// Las canciones de Instagram que le van (para lo que se publica a mano con su música: src/lib/cancionesInstagram.js).
const CancionesInstagram = lazy(() => import("../CancionesInstagram"));
const Cerebro = lazy(() => import("../Cerebro"));
const PestanaContenido = lazy(() => import("../PestanaContenido"));
const EditorSemana = lazy(() => import("../calendario/PlanSemanal").then((m) => ({ default: m.EditorSemana })));
const FechasEspecialesDialog = lazy(() => import("../calendario/fechasEspeciales").then((m) => ({ default: m.FechasEspecialesDialog })));
const NumerosNegocio = lazy(() => import("../negocio/NumerosNegocio"));
// El kit de WhatsApp Business y la voz de sus clientes (curso de campañas, entrega 8).
const KitWhatsApp = lazy(() => import("../negocio/KitWhatsApp"));

const SUBPESTANAS_MARCA = Object.freeze([
  ["ficha", "Ficha", "building"],
  ["kit", "Kit y voz", "palette"],
  ["sonido", "Música y efectos", "music"],
  ["negocio", "Números del negocio", "calculator"],
  ["whatsapp", "WhatsApp", "messageCircle"],
  ["cerebro", "Cerebro", "brain"],
  ["plan", "Plan semanal", "grid"],
  ["fechas", "Fechas", "calendar"],
  ["drive", "Drive", "cloud"],
]);

/** El kit de marca y la voz, con lo que ya leyó Marca de la galería (`estudio`). */
function KitYVoz({ client, estudio, lectura, onCambio, onError }) {
  const guardar = async (nuevo) => {
    const { guardarKit } = await import("../../lib/estudio");
    const r = await guardarKit(client.id, nuevo);
    await onCambio();
    return r.kit;
  };
  if (!estudio) return <p role="status" className="hint">Cargando el kit…</p>;
  return (
    <div className="marca-kit">
      <section className="card" aria-label="Voz de la marca">
        <VozDeMarca client={client} kit={estudio.kit} lectura={lectura} onGuardar={guardar} />
      </section>
      <section className="card" aria-label="Música de la marca">
        <MusicaDeMarca kit={estudio.kit} lectura={lectura} onGuardar={guardar} />
      </section>
      <section className="card" aria-label="Estilo de los videos">
        <EstiloVideoMarca kit={estudio.kit} archivos={estudio.archivos ?? []} lectura={lectura} onGuardar={guardar} />
      </section>
      <section className="card" aria-label="Canciones de Instagram">
        <CancionesInstagram kit={estudio.kit} lectura={lectura} onGuardar={guardar} />
      </section>
      <EstudioKit
        client={client}
        kit={estudio.kit}
        archivos={estudio.archivos ?? []}
        perdidas={estudio.perdidas ?? []}
        lectura={lectura}
        onCambio={onCambio}
        onPreparar={async () => (await import("../../lib/estudio")).prepararKit(client.id)}
        onGuardar={(nuevo) => guardar(nuevo).catch((e) => { onError(e.message); throw e; })}
      />
    </div>
  );
}

/** El plan semanal: el MISMO editor de la barra de los días y de la ficha, en la página. */
function PlanDeLaSemana({ client, lectura, onGuardarPlan }) {
  // Lo que se edita no se reinicia si otra persona cambia algo del cliente mientras tanto: arranca con el de ahora y
  // recibe lo que se guarda aquí (como en la ficha).
  const [clientePlan, setClientePlan] = useState(client);
  const [guardado, setGuardado] = useState(false);
  if (lectura || !onGuardarPlan) return <p className="hint">Tu papel no permite cambiar el plan semanal. Se ve en la barra de los días del calendario.</p>;
  return (
    <section className="card" aria-label={`Plan semanal de ${client.name}`}>
      <p className="hint" style={{ marginTop: 0 }}>
        Lo que sale cada día, fijo todos los meses: formato, tipo, hora y la nota del día. Es lo que leen el asistente del
        mes, «Planificar mes», el lote del Estudio y la IA. En el calendario, la barra de los días lo enseña y lo edita.
      </p>
      <EditorSemana
        client={clientePlan}
        onGuardar={async (cambio) => {
          setGuardado(false);
          const g = await onGuardarPlan(cambio, client.id);
          if (g) setClientePlan((c) => ({ ...c, ...g }));
          setGuardado(true);
        }}
      />
      <div aria-live="polite">{guardado && <p role="status" className="hint">Guardado: vale desde ya en todo lo que se planifica.</p>}</div>
    </section>
  );
}

/** Las fechas especiales del cliente: lo que eligió y, por mes, el diálogo de siempre para escogerlas. */
function FechasDelCliente({ client, lectura, onGuardarFechas }) {
  const ids = useId();
  const hoy = mesDeFecha(fechaEnZona());
  const [mes, setMes] = useState(hoy);
  const [abierto, setAbierto] = useState(false);
  const pref = preferenciasFechas(client.fechasEspeciales);
  const porId = new Map(catalogoDelAnio(mes.year).map((f) => [f.id, f]));
  const importantes = pref.elegidas.map((id) => porId.get(id)).filter(Boolean).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const mover = (d) => setMes(({ year, month }) => ({ year: year + Math.floor((month + d) / 12), month: (month + d + 12) % 12 }));
  return (
    <section className="card marca-fechas" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`} className="crear-titulo">Fechas especiales de {client.name}</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Los feriados de Panamá y las fechas comerciales salen solos en el calendario. Aquí se marca cuáles le importan (se
        destacan y la IA las usa al planificar), cuáles ocultar y las suyas. Es del cliente: vale todos los años.
      </p>
      <p className="hint">
        {pref.elegidas.length} importantes · {pref.ocultas.length} ocultas · {pref.propias.length} propias.
      </p>
      {importantes.length > 0 && (
        <ul className="fechas-lista" aria-label={`Importantes en ${mes.year}`}>
          {importantes.map((f) => (
            <li key={f.id} className="fechas-fila">
              <span className="fechas-fila-dia">{Number(f.fecha.slice(8))} {MONTHS[Number(f.fecha.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}</span>
              <span className="fechas-fila-texto"><span>{f.nombre}</span><span className="fechas-fila-tipo">{TIPOS_FECHA[f.tipo]}</span></span>
            </li>
          ))}
        </ul>
      )}
      {pref.propias.length > 0 && (
        <ul className="fechas-lista" aria-label="Las suyas" style={{ marginTop: "var(--sp-2)" }}>
          {pref.propias.map((p) => (
            <li key={p.id} className="fechas-fila">
              <span className="fechas-fila-dia">{p.dia ?? p.fecha}</span>
              <span className="fechas-fila-texto"><span>{p.nombre}</span><span className="fechas-fila-tipo">{p.verificar ? "Propuesta por la IA: verifícala" : TIPOS_FECHA.propia}</span></span>
            </li>
          ))}
        </ul>
      )}
      {!lectura && onGuardarFechas && (
        <div className="marca-fechas-mes" role="group" aria-label="Escoger las fechas de un mes">
          <button type="button" className="btn-icon" aria-label="Mes anterior" onClick={() => mover(-1)}><Icon name="chevronLeft" size={18} /></button>
          <span className="marca-fechas-nombre" aria-live="polite">{MONTHS[mes.month]} {mes.year}</span>
          <button type="button" className="btn-icon" aria-label="Mes siguiente" onClick={() => mover(1)}><Icon name="chevronRight" size={18} /></button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAbierto(true)}>
            <Icon name="calendar" size={14} /> Escoger las de {MONTHS[mes.month].toLowerCase()}
          </button>
        </div>
      )}
      {abierto && (
        <Suspense fallback={null}>
          <FechasEspecialesDialog client={client} year={mes.year} month={mes.month} onGuardar={onGuardarFechas} onClose={() => setAbierto(false)} />
        </Suspense>
      )}
    </section>
  );
}

/**
 * @param seccion  la sub-sección (`SUBPESTANAS_MARCA`), o null: la ficha
 * @param onIr     (pestaña, sub-sección) → navega
 */
export default function Marca({ client, seccion = null, pulso = 0, lectura = false, onIr, onEditar, onPersistClient, onGuardarPlan, onGuardarFechas }) {
  const ids = useId();
  const actual = seccion ?? "ficha";
  const [estudio, setEstudio] = useState(null);
  const [cerebro, setCerebro] = useState(null);
  const [error, setError] = useState("");
  // «Subir las fotos» del semáforo: el estudio de mercado del cerebro, abierto en el catálogo.
  const [abrirMercado, setAbrirMercado] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setEstudio(await estudioDelCliente(client.id, { fresco: true }));
      setError("");
    } catch (e) {
      setError(e.message);
    }
    listarCerebro(client.id).then((r) => setCerebro(r?.estado ?? null)).catch(() => setCerebro(null));
  }, [client.id]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const irDesdeSemaforo = (p, s, opciones = {}) => {
    if (opciones.mercado) setAbrirMercado((x) => ({ tab: opciones.mercado, n: (x?.n ?? 0) + 1 }));
    onIr(p, s);
  };

  return (
    <div className="subseccion marca">
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      <SemaforoKit client={client} kit={estudio?.kit} puntos={semaforoDelKit({ estudio, cerebro })} lectura={lectura} onIr={irDesdeSemaforo} onCambio={cargar} />

      <BarraPestanas
        etiqueta={`Marca de ${client.name}`}
        pestanas={SUBPESTANAS_MARCA}
        actual={actual}
        base={ids}
        clase="subpestanas"
        claseItem="subpestana"
        onElegir={(id) => onIr("marca", id)}
      />
      <div role="tabpanel" id={idDelPanel(ids)} aria-labelledby={idDePestana(ids, actual)} className="subseccion-panel">
        <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
          {actual === "ficha" && <FichaCliente client={client} onEditar={onEditar} />}
          {actual === "kit" && <KitYVoz client={client} estudio={estudio} lectura={lectura} onCambio={cargar} onError={setError} />}
          {actual === "sonido" && <BibliotecaSonido key={client.id} client={client} lectura={lectura} />}
          {actual === "negocio" && <NumerosNegocio key={client.id} client={client} lectura={lectura} pulso={pulso} />}
          {actual === "whatsapp" && <KitWhatsApp key={client.id} client={client} lectura={lectura} />}
          {actual === "cerebro" && <Cerebro client={client} abrirMercado={abrirMercado} />}
          {actual === "plan" && <PlanDeLaSemana client={client} lectura={lectura} onGuardarPlan={onGuardarPlan} />}
          {actual === "fechas" && <FechasDelCliente client={client} lectura={lectura} onGuardarFechas={onGuardarFechas} />}
          {actual === "drive" && <PestanaContenido client={client} pulso={pulso} onPersistClient={onPersistClient} />}
        </Suspense>
      </div>
    </div>
  );
}
