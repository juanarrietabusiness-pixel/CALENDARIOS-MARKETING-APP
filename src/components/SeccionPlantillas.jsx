import { useEffect, useState } from "react";
import Icon from "./Icon";
import EditorPlantilla from "./EditorPlantilla";
import { leerPlantillas, guardarPlantilla, borrarPlantilla } from "../lib/plantillasApi";
import { resumenPlantilla, copiaDePlantilla, idNuevo, OBJETIVOS_PLAN, NEGOCIOS_PLAN, PLANTILLAS_BASE } from "../lib/plantillasPlan";
import { editaLaAgencia } from "../lib/sesionActual";

// ============================================================
// Ajustes → Plantillas de plan
//
// Las nueve de arranque (Centrado en ventas, Ventas y seguidores,
// Marketing 360 × productos, servicios, marca personal) y las que cree la
// agencia. Cambiar una de arranque la sustituye en todo el espacio;
// «Restaurar» la devuelve a como venía. La de un cliente concreto se
// personaliza en su ficha (pestaña Semanal), no aquí.
// ============================================================

const nombreObjetivo = (id) => OBJETIVOS_PLAN.find((o) => o.id === id)?.nombre ?? "";
const nombreNegocio = (id) => NEGOCIOS_PLAN.find((n) => n.id === id)?.nombre ?? "";

export default function SeccionPlantillas({ pulso = 0 }) {
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null); // { original, valor } mientras se edita una
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const puede = editaLaAgencia();

  useEffect(() => {
    leerPlantillas({ forzar: true }).then(setLista).catch((e) => setAviso({ ok: false, texto: e.message }));
  }, [pulso]);

  const hacer = async (accion, ok) => {
    setTrabajando(true);
    setAviso(null);
    try {
      setLista(await accion());
      setEditando(null);
      setAviso({ ok: true, texto: ok });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setTrabajando(false);
  };

  const nueva = () => {
    const id = idNuevo("Plantilla nueva", (lista ?? []).map((p) => p.id));
    setEditando({ original: null, valor: copiaDePlantilla(PLANTILLAS_BASE[0], { id, nombre: "Plantilla nueva" }) });
  };
  const duplicar = (p) => {
    const nombre = `${p.nombre} (copia)`;
    setEditando({ original: null, valor: copiaDePlantilla(p, { id: idNuevo(nombre, (lista ?? []).map((x) => x.id)), nombre }) });
  };

  return (
    <section id="plantillas" className="ajustes-seccion" aria-labelledby="ajustes-plantillas">
      <h2 className="ajustes-titulo" id="ajustes-plantillas">
        <Icon name="calendar" size={18} /> Plantillas de plan
      </h2>
      <p className="ajustes-intro">
        Qué se publica cada día según el plan del cliente. «Del ritmo del cliente» es el tipo que le toca ese día
        (lunes Anuncio, martes Beneficios…). Cada cliente elige la suya en su ficha (pestaña Semanal) y la puede
        personalizar para él solo; «Planificar mes» abre con ella.
      </p>
      {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}
      {!lista && !aviso && <p className="hint">Cargando…</p>}

      {editando && (
        <div className="card" style={{ padding: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
          <EditorPlantilla valor={editando.valor} onCambio={(valor) => setEditando((x) => ({ ...x, valor }))} />
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
            <button type="button" className="btn btn-primary" disabled={trabajando || !editando.valor.nombre.trim()}
              onClick={() => hacer(() => guardarPlantilla(editando.valor.id, editando.valor), `«${editando.valor.nombre.trim()}» guardada.`)}>
              {trabajando ? "Guardando…" : "Guardar plantilla"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={trabajando} onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {lista && (
        <ul className="plantillas-lista">
          {lista.map((p) => (
            <li key={p.id} className="plantillas-item">
              <div style={{ minWidth: 0 }}>
                <p className="plantillas-nombre">
                  {p.nombre}
                  {p.base && p.editada && <span className="filter-chip" style={{ marginLeft: "var(--sp-2)" }}>Cambiada</span>}
                  {!p.base && <span className="filter-chip" style={{ marginLeft: "var(--sp-2)" }}>De la agencia</span>}
                </p>
                <p className="hint" style={{ margin: 0 }}>{[nombreObjetivo(p.objetivo), nombreNegocio(p.negocio), resumenPlantilla(p)].filter(Boolean).join(" · ")}</p>
              </div>
              {puede && (
                <div className="plantillas-acciones">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={trabajando} onClick={() => setEditando({ original: p.id, valor: p })}>
                    <Icon name="pencil" size={14} /> Editar
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={trabajando} onClick={() => duplicar(p)}>
                    <Icon name="copy" size={14} /> Duplicar
                  </button>
                  {p.base && p.editada && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={trabajando} onClick={() => hacer(() => borrarPlantilla(p.id), `«${p.nombre}» volvió a como venía.`)}>
                      <Icon name="refresh" size={14} /> Restaurar
                    </button>
                  )}
                  {!p.base && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={trabajando} onClick={() => hacer(() => borrarPlantilla(p.id), `«${p.nombre}» borrada.`)}>
                      <Icon name="trash" size={14} /> Borrar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {puede && lista && !editando && (
        <button type="button" className="btn btn-secondary" onClick={nueva}><Icon name="plus" size={16} /> Nueva plantilla</button>
      )}
    </section>
  );
}
