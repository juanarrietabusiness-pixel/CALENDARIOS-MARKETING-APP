import { useEffect, useId, useState } from "react";
import { Plegable } from "./editorPublicacion";
import { leerMercado } from "../../lib/mercado";
import { productosActivos, limpiarEstudio } from "../../lib/estudioMercado";
import { NIVELES_CONSCIENCIA } from "../../lib/consciencia";
import { PILARES, SUBTIPOS_MALETAS, pilarDe, nombreDePilar } from "../../lib/pilares";

// ============================================================
// «Tipo de contenido» en el panel de una publicación
//
// Qué información lleva (el tipo: Anuncio, Beneficios, Servicios,
// Educativo, Diferenciador, 7 maletas), de qué producto del catálogo, a qué
// nivel de consciencia le habla y a quién (perfil y deseo del estudio de
// mercado). Lo pone «Planificar mes» con la matriz; aquí se ve y se cambia.
// La IA lo lee al escribir la idea, el guion y la descripción, y «Crear con
// IA» escoge con él el estilo de la marca.
// ============================================================

// El catálogo y el estudio, una vez por cliente mientras la página está abierta.
const cache = new Map();
function useMercado(clienteId) {
  const [m, setM] = useState(() => cache.get(clienteId) ?? null);
  useEffect(() => {
    if (!clienteId || cache.has(clienteId)) return undefined;
    let vivo = true;
    leerMercado(clienteId).then((r) => { cache.set(clienteId, r); if (vivo) setM(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [clienteId]);
  return m;
}

export function TipoContenido({ form, sf, clienteId, lectura = false }) {
  const ids = useId();
  const mercado = useMercado(clienteId);
  const productos = productosActivos(mercado?.catalogo ?? []);
  const general = limpiarEstudio(mercado?.estudio)?.general;
  const pilar = pilarDe(form.pilar);
  const resumen = pilar ? [nombreDePilar(form.pilar, form.pilarSub), form.producto].filter(Boolean).join(" · ") : "Sin tipo";
  const cambiarProducto = (id) => {
    const p = productos.find((x) => x.id === id);
    sf("productoId", p?.id ?? "");
    sf("producto", p?.nombre ?? "");
  };

  return (
    <Plegable titulo="Tipo de contenido" icono="bulb" resumen={resumen}>
      <div className="tipo-contenido">
        <div className="field">
          <label className="label" htmlFor={`${ids}-t`}>Tipo</label>
          <select id={`${ids}-t`} className="input" value={form.pilar || ""} disabled={lectura}
            onChange={(e) => { sf("pilar", e.target.value); if (e.target.value !== "maletas") sf("pilarSub", ""); }}>
            <option value="">Sin tipo</option>
            {PILARES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {pilar && <p className="hint">Lleva: {pilar.datos}.</p>}
        </div>
        {pilar?.id === "maletas" && (
          <div className="field">
            <label className="label" htmlFor={`${ids}-s`}>Maleta</label>
            <select id={`${ids}-s`} className="input" value={form.pilarSub || ""} disabled={lectura} onChange={(e) => sf("pilarSub", e.target.value)}>
              <option value="">Sin elegir</option>
              {SUBTIPOS_MALETAS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor={`${ids}-p`}>Producto o servicio</label>
          <select id={`${ids}-p`} className="input" value={productos.some((p) => p.id === form.productoId) ? form.productoId : ""} disabled={lectura} onChange={(e) => cambiarProducto(e.target.value)}>
            <option value="">{form.producto && !productos.some((p) => p.id === form.productoId) ? `${form.producto} (ya no está en el catálogo)` : "Ninguno"}</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.precio ? ` · ${p.precio}` : ""}{mercado?.inventario && p.stock === "agotado" ? " · agotado" : ""}
              </option>
            ))}
          </select>
          {!productos.length && <p className="hint">Este cliente no tiene catálogo todavía (Cerebro → Estudio de mercado).</p>}
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-n`}>Nivel de consciencia</label>
          <select id={`${ids}-n`} className="input" value={form.nivel || ""} disabled={lectura} onChange={(e) => sf("nivel", e.target.value)}>
            <option value="">Sin definir</option>
            {NIVELES_CONSCIENCIA.map((n) => <option key={n.clave} value={n.clave}>{n.nombre}</option>)}
          </select>
        </div>
        {(general?.perfiles?.length > 0 || form.perfil) && (
          <div className="field">
            <label className="label" htmlFor={`${ids}-pf`}>A quién le habla</label>
            <select id={`${ids}-pf`} className="input" value={form.perfil || ""} disabled={lectura} onChange={(e) => sf("perfil", e.target.value)}>
              <option value="">Sin elegir</option>
              {[...new Set([...(general?.perfiles ?? []).map((p) => p.nombre), form.perfil].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        {(general?.deseos?.length > 0 || form.deseo) && (
          <div className="field">
            <label className="label" htmlFor={`${ids}-d`}>Qué lo mueve</label>
            <select id={`${ids}-d`} className="input" value={form.deseo || ""} disabled={lectura} onChange={(e) => sf("deseo", e.target.value)}>
              <option value="">Sin elegir</option>
              {[...new Set([...(general?.deseos ?? []).map((d) => d.deseo), form.deseo].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>
    </Plegable>
  );
}
