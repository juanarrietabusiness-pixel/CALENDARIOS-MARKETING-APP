import { useId, useRef, useState } from "react";
import Icon from "../Icon";
import { pedir } from "../../lib/db";
import { ESTADOS_SEMAFORO, resumenSemaforo, loCritico } from "../../lib/semaforoKit";

// ============================================================
// El semáforo del kit, en pantalla (lib/semaforoKit.js)
//
// `SemaforoKit`: la lista entera, arriba de Marca, con el arreglo de cada punto a un toque (ir a donde se arregla
// o, el logo, subirlo ahí mismo). `AvisoDelKit`: sólo lo crítico, en una línea, arriba de Crear.
// ============================================================

/** «Subir el logo»: a la galería del cliente y al kit, de una vez (lo mismo que «Usar como logo» del visor). */
function SubirLogo({ client, kit, onHecho, onError }) {
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubiendo(true);
    try {
      const form = new FormData();
      form.set("archivo", f);
      const r = await pedir(`/estudio/${encodeURIComponent(client.id)}/archivos`, { method: "POST", body: form });
      await pedir(`/estudio/${encodeURIComponent(client.id)}/kit`, { method: "PUT", body: JSON.stringify({ kit: { ...(kit ?? {}), logo: r.archivo.clave } }) });
      onHecho?.("Logo guardado: va en cada pieza del cliente.");
    } catch (err) {
      onError?.(err.message || "No se pudo subir el logo.");
    }
    setSubiendo(false);
  };
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" disabled={subiendo} onClick={() => entrada.current?.click()}>
        <Icon name="upload" size={14} /> {subiendo ? "Subiendo…" : "Subir el logo"}
      </button>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Escoger el archivo del logo (PNG, JPG o WEBP)" onChange={subir} />
    </>
  );
}

/**
 * @param puntos  los de `semaforoDelKit`
 * @param onIr    (pestaña, sub-sección, { mercado }) → a donde se arregla
 */
export default function SemaforoKit({ client, kit, puntos, lectura = false, onIr, onCambio }) {
  const ids = useId();
  const [aviso, setAviso] = useState(null);
  const r = resumenSemaforo(puntos);
  if (!puntos.length) return null;
  return (
    <section className="semaforo card" aria-labelledby={`${ids}-t`} data-estado={r.estado}>
      <h2 id={`${ids}-t`} className="semaforo-titulo">
        <Icon name="palette" size={18} /> Lo que tiene {client.name} para que el diseño salga bien
        <span className="semaforo-resumen">
          {r.rojos ? `${r.rojos} ${r.rojos === 1 ? "falta" : "faltan"}` : r.ambar ? `${r.ambar} por mejorar` : "Todo listo"}
        </span>
      </h2>
      <ul className="semaforo-lista">
        {puntos.map((p) => (
          <li key={p.id} className="semaforo-punto" data-estado={p.estado}>
            <span className="semaforo-luz" aria-hidden="true"><Icon name={ESTADOS_SEMAFORO[p.estado].icono} size={14} /></span>
            <span className="semaforo-texto">
              <strong>{p.nombre}</strong> <span className="sr-only">({ESTADOS_SEMAFORO[p.estado].nombre})</span>
              <span className="hint">{p.texto}</span>
            </span>
            {p.arreglo && !lectura && (p.arreglo.accion === "logo"
              ? <SubirLogo client={client} kit={kit} onHecho={(t) => { setAviso({ ok: true, texto: t }); onCambio?.(); }} onError={(t) => setAviso({ ok: false, texto: t })} />
              : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onIr(p.arreglo.ir[0], p.arreglo.ir[1], { mercado: p.arreglo.mercado })}>
                  {p.arreglo.etiqueta}
                </button>
              ))}
          </li>
        ))}
      </ul>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"}>{aviso.texto}</p>}</div>
    </section>
  );
}

/** Lo crítico, en una línea (arriba de Crear): con qué saldrán mal las piezas y a un toque de arreglarlo, en Marca. */
export function AvisoDelKit({ puntos, onIr }) {
  const criticos = loCritico(puntos);
  if (!criticos.length) return null;
  return (
    <div className="notice notice-warn semaforo-aviso" role="note">
      <Icon name="alert" size={16} />
      <span>
        <strong>Al diseño de este cliente le falta:</strong> {criticos.map((p) => p.nombre.toLowerCase()).join(", ")}. {criticos[0].texto}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onIr("marca", null)}>Ver en Marca</button>
    </div>
  );
}
