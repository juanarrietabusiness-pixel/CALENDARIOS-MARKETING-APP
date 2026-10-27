import { useEffect, useId, useState } from "react";
import * as api from "../../lib/estudio";
import { MODELOS, porPrecio, textoCosto, estimar } from "../../lib/estudioCatalogo";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, nombreDePreset } from "../../lib/kitMarca";
import { NOMBRES_USO } from "../../lib/director";

// ============================================================
// «Crear la imagen aquí»: escoger el tipo, el estilo, el modelo y la plantilla
//
// Por defecto sale como siempre: el tipo de la publicación, el estilo de ese
// tipo, el modelo fijado del cliente y ninguna plantilla. Aquí se cambia lo
// que se quiera; se recuerda por cliente en el navegador (lo guarda quien lo
// usa: seccionPublicar). Va aparte (lazy): arrastra el catálogo de modelos.
// ============================================================

/** `valor`: { preset, estilo, modelo, plantilla } ("" = el de siempre). `presetDelPost`: el que trae la publicación. */
export default function OpcionesCrearAqui({ clientId, valor, onCambiar, presetDelPost = "" }) {
  const ids = useId();
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([api.leerEstudio(clientId), api.leerMotores()])
      .then(([g, m]) => {
        if (!vivo) return;
        const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
        const kit = limpiarKit(g?.kit);
        const modelos = porPrecio(MODELOS.filter((x) => x.tipo === "imagen" && !x.necesitaImagen && activos[x.motor]), activos);
        setDatos({ kit, modelos, fijado: api.modeloPreferido(activos, "imagen", kit.modelos?.imagen) });
      })
      .catch(() => { if (vivo) setDatos({ kit: limpiarKit({}), modelos: [], fijado: null }); });
    return () => { vivo = false; };
  }, [clientId]);

  if (!datos) return <p className="hint" role="status">Cargando las opciones…</p>;
  const poner = (k, v) => onCambiar({ ...valor, [k]: v });
  const { kit, modelos, fijado } = datos;
  return (
    <div className="opciones-crear-aqui">
      <div className="field">
        <label className="label" htmlFor={`${ids}-tipo`}>Tipo de pieza</label>
        <select id={`${ids}-tipo`} className="input" value={valor.preset ?? ""} onChange={(e) => poner("preset", e.target.value)}>
          <option value="">El de la publicación{presetDelPost ? ` (${nombreDePreset(presetDelPost, kit)})` : ""}</option>
          {Object.entries(TIPOS_PRESET).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
          {kit.propios.map((p) => <option key={p.id} value={p.id}>{p.nombre} (propio)</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-estilo`}>Estilo visual</label>
        <select id={`${ids}-estilo`} className="input" value={valor.estilo ?? ""} onChange={(e) => poner("estilo", e.target.value)}>
          <option value="">El de ese tipo de pieza</option>
          {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
          {kit.estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-modelo`}>Modelo</label>
        <select id={`${ids}-modelo`} className="input" value={valor.modelo ?? ""} onChange={(e) => poner("modelo", e.target.value)}>
          <option value="">El del cliente{fijado ? ` (${fijado.nombre})` : ""}</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre} · {textoCosto(estimar(m, 1, {}))}</option>)}
        </select>
      </div>
      {kit.plantillas.length > 0 && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-plantilla`}>Plantilla</label>
          <select id={`${ids}-plantilla`} className="input" value={valor.plantilla ?? ""} onChange={(e) => poner("plantilla", e.target.value)}>
            <option value="">Ninguna: diseño libre</option>
            {kit.plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({NOMBRES_USO[p.uso] ?? p.uso})</option>)}
          </select>
          <p className="hint" style={{ margin: 0 }}>Repite el diseño de esa pieza con el contenido de esta publicación.</p>
        </div>
      )}
    </div>
  );
}
