import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { leerManual, guardarManual } from "../lib/anunciosApi";
import { editaLaAgencia } from "../lib/sesionActual";

// ============================================================
// Ajustes → Manual de campañas de la agencia
//
// Las reglas de la casa que el estratega de campañas sigue SIEMPRE (van
// delante de todo lo demás en su pedido): presupuestos mínimos, a dónde se
// llevan las ventas, lo que nunca se promete… Más cómo se nombra cada cosa
// en Meta y cuántas conversaciones suelen acabar en venta, que entra en las
// cuentas del costo máximo por resultado.
// ============================================================

const AYUDA_NOMBRES = "Se rellena {cliente}, {objetivo}, {producto}, {mes} · {tipo}, {edad}, {lugar} · {numero}, {formato}, {angulo}.";
const EJEMPLO = `Ejemplos:
- Las ventas van a WhatsApp, nunca a la web si el cliente no tiene píxel.
- Mínimo 5 $ al día por conjunto; con menos de 15 $ al día, un solo conjunto Advantage+.
- Siempre de 4 a 6 anuncios: foto del producto, reel, carrusel y un testimonio.
- Nunca prometer resultados en días.`;

export default function SeccionManualCampanas({ pulso = 0 }) {
  const ids = useId();
  const [m, setM] = useState(null);
  const [cambiado, setCambiado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const puede = editaLaAgencia();

  useEffect(() => { leerManual().then((x) => { setM(x); setCambiado(false); }).catch((e) => setAviso({ ok: false, texto: e.message })); }, [pulso]);

  const poner = (cambios) => { setM((x) => ({ ...x, ...cambios })); setCambiado(true); };
  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      setM(await guardarManual(m));
      setCambiado(false);
      setAviso({ ok: true, texto: "Guardado. El estratega lo sigue desde el próximo plan." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setGuardando(false);
  };

  return (
    <section id="manual-campanas" className="ajustes-seccion" aria-labelledby="ajustes-manual">
      <h2 className="ajustes-titulo" id="ajustes-manual">
        <Icon name="megaphone" size={18} /> Manual de campañas
      </h2>
      <p className="ajustes-intro">
        Las reglas de la agencia para los anuncios. El estratega de campañas (en Anuncios) las sigue siempre, por encima
        de lo que proponga él.
      </p>
      {!m ? <p className="hint">{aviso?.texto ?? "Cargando…"}</p> : (
        <>
          <div className="field">
            <label className="label" htmlFor={`${ids}-reglas`}>Reglas</label>
            <textarea id={`${ids}-reglas`} className="textarea" rows={7} maxLength={6000} value={m.reglas} readOnly={!puede}
              onChange={(e) => poner({ reglas: e.target.value })} placeholder={EJEMPLO} />
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)", minWidth: 0 }}>
            <legend className="label">Cómo se nombra cada cosa en Meta</legend>
            {[["campana", "Campaña"], ["conjunto", "Conjunto"], ["anuncio", "Anuncio"]].map(([k, nombre]) => (
              <div className="field" key={k}>
                <label className="label" htmlFor={`${ids}-${k}`}>{nombre}</label>
                <input id={`${ids}-${k}`} className="input" value={m.nomenclatura[k]} maxLength={160} readOnly={!puede}
                  onChange={(e) => poner({ nomenclatura: { ...m.nomenclatura, [k]: e.target.value } })} />
              </div>
            ))}
            <p className="hint" style={{ margin: 0 }}>{AYUDA_NOMBRES}</p>
          </fieldset>
          <div className="field">
            <label className="label" htmlFor={`${ids}-tasa`}>De cada 100 conversaciones, ¿cuántas suelen comprar?</label>
            <input id={`${ids}-tasa`} className="input" type="number" inputMode="decimal" min="1" max="100" style={{ maxWidth: 140 }} value={m.tasaCierre} readOnly={!puede}
              onChange={(e) => poner({ tasaCierre: e.target.value })} />
            <p className="hint" style={{ margin: 0 }}>Con esto y el margen sale el costo máximo que aguanta cada conversación. Se cambia en cada plan si un cliente es distinto.</p>
          </div>
          <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>
          {puede ? (
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={!cambiado || guardando}>{guardando ? "Guardando…" : "Guardar el manual"}</button>
          ) : <p className="hint">Lo cambian el administrador y los editores de la agencia.</p>}
        </>
      )}
    </section>
  );
}
