import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../components/Icon";
import LoMejorTarjetas from "../components/LoMejorTarjetas";
import { useLoMejor } from "../hooks/useLoMejor";
import { VENTANAS, FUENTES, REDES_LO_MEJOR, FORMATOS_LO_MEJOR, TIPOS_LO_MEJOR } from "../lib/loMejor";
import { leerCreditosSC } from "../lib/loMejorApi";
import { abrirGuardarReferencia } from "../lib/bancoIdeasApi";
import { navegar } from "../lib/rutas";
import "../components/LoMejor.css";

// ============================================================
// /lo-mejor: «Lo mejor del momento», de todos los clientes
//
// Lo que MEJOR está funcionando, en una galería: la inspiración de todos los
// clientes (sin repetir cuentas), las referencias que guardó el equipo, lo mejor
// propio de cada cliente y los anuncios de las búsquedas guardadas de Scrape
// Creators (releídos una vez por semana). Cada fuente se ordena por el
// percentil de su señal y la tarjeta dice la cifra de verdad. Desde cada una:
// «Recrear para [cliente]» —con IA o para grabar—, guardarla en ideas, sacarle
// el guion o la fórmula, o abrir el original. «Pegar un enlace» guarda una
// referencia nueva (lo que en el teléfono era el botón «Enlace»).
// ============================================================

const leerQuery = () => {
  try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
};

export default function LoMejor({ clients = [], pulso = 0, yo = null }) {
  const ids = useId();
  const lectura = Boolean(yo?.soloLectura);
  const [inicial] = useState(leerQuery);
  const [ventana, setVentana] = useState(VENTANAS.some((v) => v.id === inicial.get("ventana")) ? inicial.get("ventana") : "semana");
  const [cliente, setCliente] = useState(inicial.get("cliente") ?? "");
  const [red, setRed] = useState("");
  const [formato, setFormato] = useState("");
  const [tipo, setTipo] = useState("");
  const [fuente, setFuente] = useState("");
  const [pieza] = useState(inicial.get("pieza") ?? "");
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");
  const [creditos, setCreditos] = useState(null);
  const { datos, cargando, error } = useLoMejor({ ventana, cliente, red, formato, tipo, fuente, pieza, pulso, lectura });

  // La pieza de un aviso se señala una vez: después la dirección queda limpia.
  useEffect(() => {
    if (inicial.get("pieza")) navegar("/lo-mejor", { reemplazar: true });
  }, [inicial]);

  useEffect(() => {
    let vivo = true;
    leerCreditosSC().then((c) => { if (vivo) setCreditos(c); }).catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);

  const clientesPorId = useMemo(() => clients.map((c) => ({ ...c, id: c.dbId || c.id })), [clients]);
  const piezas = datos?.piezas ?? [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-top">
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title"><Icon name="trending" size={22} /> Lo mejor del momento</h1>
            <p className="page-meta">Lo que mejor funciona en la competencia, la inspiración, los anuncios y lo tuyo, para recrearlo con la marca de cada cliente.</p>
          </div>
          {!lectura && (
            <button type="button" className="btn btn-secondary" onClick={() => abrirGuardarReferencia(cliente || null)}>
              <Icon name="link" size={16} /> Pegar un enlace
            </button>
          )}
        </div>
        <div className="lo-mejor-pestanas" role="group" aria-label="Qué ventana">
          {VENTANAS.map((v) => (
            <button key={v.id} type="button" className="filter-chip" aria-pressed={ventana === v.id} onClick={() => setVentana(v.id)}>
              {v.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="lo-mejor-filtros" role="group" aria-label="Filtros">
        <label className="sr-only" htmlFor={`${ids}-cliente`}>Cliente</label>
        <select id={`${ids}-cliente`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientesPorId.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-tipo`}>Tipo</label>
        <select id={`${ids}-tipo`} className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS_LO_MEJOR.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-formato`}>Formato</label>
        <select id={`${ids}-formato`} className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
          <option value="">Todos los formatos</option>
          {Object.entries(FORMATOS_LO_MEJOR).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-red`}>Red</label>
        <select id={`${ids}-red`} className="input" value={red} onChange={(e) => setRed(e.target.value)}>
          <option value="">Todas las redes</option>
          {Object.entries(REDES_LO_MEJOR).map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-fuente`}>De dónde</label>
        <select id={`${ids}-fuente`} className="input" value={fuente} onChange={(e) => setFuente(e.target.value)}>
          <option value="">De todas partes</option>
          {Object.entries(FUENTES).map(([id, f]) => <option key={id} value={id}>{f.nombre}</option>)}
        </select>
      </div>

      {creditos?.sc && (
        <p className="lo-mejor-nota">
          <Icon name="megaphone" size={12} /> Los anuncios de tus búsquedas guardadas (Biblioteca) se releen una vez por semana:
          {` ${creditos.total} de ${creditos.tope} créditos de Scrape Creators esta semana`} (lo buscado a mano también cuenta). El tope se cambia en Ajustes.
        </p>
      )}

      {(error || fallo) && <p role="alert" className="lo-mejor-error">{error || fallo}</p>}
      <div role="status" aria-live="polite" className={aviso ? "lo-mejor-aviso" : "sr-only"}>{aviso}</div>

      {cargando && !datos && <p className="lo-mejor-vacio">Cargando…</p>}
      {!cargando && datos && !piezas.length && (
        <p className="lo-mejor-vacio">
          Nada con estos filtros {ventana === "semana" ? "esta semana" : "en el último mes"}. Añade cuentas de competencia o inspiración a cada cliente
          (Referencias → Lo mejor), guarda referencias con «Pegar un enlace» o búsquedas en la Biblioteca de anuncios.
        </p>
      )}
      {datos?.total > piezas.length && <p className="lo-mejor-nota">Las {piezas.length} mejores de {datos.total}.</p>}

      <LoMejorTarjetas piezas={piezas} clientes={clientesPorId} lectura={lectura} destacada={pieza} onAviso={setAviso} onError={setFallo} />
    </div>
  );
}
