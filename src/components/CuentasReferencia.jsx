import { useId, useState } from "react";
import Icon from "./Icon";
import { MAX_CUENTAS, REDES_INSPIRACION, TIPOS_CUENTA, claveCuenta, cuentaDeTexto, cuentasDeReferencia, enlaceDePerfil } from "../lib/inspiracion";
import "./CuentasReferencia.css";

// ============================================================
// Las cuentas fijas de un cliente: competencia e inspiración
//
// Hasta MAX_CUENTAS (10) por cliente, de Instagram, YouTube o TikTok, cada
// una con su tipo y una nota. Viven en `clients.competidores` (lo que eran
// los @ sueltos de Resultados; lib/inspiracion.js lee las dos formas) y se
// guardan con la ficha del cliente (`onGuardar` recibe la lista entera).
// Las de Instagram de COMPETENCIA se miden además cada día en Resultados.
// ============================================================

export default function CuentasReferencia({ client, onGuardar, lectura = false }) {
  const ids = useId();
  const lista = cuentasDeReferencia(client?.competidores);
  const [texto, setTexto] = useState("");
  const [red, setRed] = useState("instagram");
  const [tipo, setTipo] = useState("competencia");
  const [error, setError] = useState("");
  const llena = lista.length >= MAX_CUENTAS;

  const guardar = (siguiente) => onGuardar?.(cuentasDeReferencia(siguiente));

  const anadir = (e) => {
    e.preventDefault();
    setError("");
    const c = cuentaDeTexto(texto, red);
    if (!c) { setError("Escribe el @ de la cuenta o pega el enlace de su perfil."); return; }
    if (lista.some((x) => claveCuenta(x) === claveCuenta(c))) { setError(`@${c.usuario} ya está en la lista.`); return; }
    if (llena) { setError(`Caben ${MAX_CUENTAS} cuentas por cliente: quita una para añadir otra.`); return; }
    guardar([...lista, { ...c, tipo, nota: "" }]);
    setTexto("");
  };
  const cambiar = (c, cambios) => guardar(lista.map((x) => (claveCuenta(x) === claveCuenta(c) ? { ...x, ...cambios } : x)));

  return (
    <div className="cuentas-ref">
      {!lectura && (
        <form className="cuentas-ref-form" onSubmit={anadir} noValidate>
          <label className="sr-only" htmlFor={`${ids}-red`}>Red</label>
          <select id={`${ids}-red`} className="input" value={red} onChange={(e) => setRed(e.target.value)}>
            {Object.entries(REDES_INSPIRACION).map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
          </select>
          <label className="sr-only" htmlFor={`${ids}-u`}>Cuenta (su @ o el enlace de su perfil)</label>
          <input id={`${ids}-u`} className="input" value={texto} onChange={(e) => { setTexto(e.target.value); setError(""); }}
            placeholder={llena ? `Ya hay ${MAX_CUENTAS} cuentas` : "@cuenta o enlace del perfil"} disabled={llena} autoComplete="off" />
          <label className="sr-only" htmlFor={`${ids}-t`}>Tipo</label>
          <select id={`${ids}-t`} className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS_CUENTA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!texto.trim() || llena}><Icon name="plus" size={14} /> Añadir</button>
        </form>
      )}
      {error && <p role="alert" className="cuentas-ref-error">{error}</p>}
      <p className="hint" style={{ margin: 0 }}>{lista.length} de {MAX_CUENTAS} cuentas.{lista.some((c) => c.red === "tiktok") && " De TikTok se guarda la cuenta, pero TikTok no deja ver su contenido desde aquí: se abre su perfil."}</p>
      {lista.length > 0 && (
        <ul className="cuentas-ref-lista" aria-label="Cuentas que sigue este cliente">
          {lista.map((c) => (
            <li key={claveCuenta(c)} className="cuentas-ref-item">
              <span className="cuentas-ref-red" title={REDES_INSPIRACION[c.red].nombre}><Icon name={REDES_INSPIRACION[c.red].icono} size={14} /><span className="sr-only">{REDES_INSPIRACION[c.red].nombre}</span></span>
              <a href={enlaceDePerfil(c)} target="_blank" rel="noopener noreferrer" className="cuentas-ref-usuario">@{c.usuario}</a>
              {lectura ? (
                <span className="cuentas-ref-tipo" data-tipo={c.tipo}>{TIPOS_CUENTA[c.tipo]}</span>
              ) : (
                <>
                  <label className="sr-only" htmlFor={`${ids}-${claveCuenta(c)}-t`}>Tipo de @{c.usuario}</label>
                  <select id={`${ids}-${claveCuenta(c)}-t`} className="input cuentas-ref-tipo-select" value={c.tipo} onChange={(e) => cambiar(c, { tipo: e.target.value })}>
                    {Object.entries(TIPOS_CUENTA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`${ids}-${claveCuenta(c)}-n`}>Nota sobre @{c.usuario}</label>
                  <input id={`${ids}-${claveCuenta(c)}-n`} className="input cuentas-ref-nota" defaultValue={c.nota} maxLength={200}
                    placeholder="Qué tiene de bueno (opcional)" onBlur={(e) => { if (e.target.value.trim() !== c.nota) cambiar(c, { nota: e.target.value }); }} />
                  <button type="button" className="btn-icon" aria-label={`Quitar @${c.usuario}`} onClick={() => guardar(lista.filter((x) => claveCuenta(x) !== claveCuenta(c)))}>
                    <Icon name="close" size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
