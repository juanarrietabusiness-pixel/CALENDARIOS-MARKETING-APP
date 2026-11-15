import { useEffect, useState } from "react";
import { buscarEnGaleria, palabrasDeBusqueda } from "../lib/estudio";

/**
 * Buscar también lo que la galería aún NO cargó (va por páginas de 300): mientras quede alguna página por cargar, lo
 * escrito se pregunta al servidor —con la MISMA regla que filtra lo cargado, src/lib/galeriaVistas.js— y lo que vuelve
 * se suma a lo que se ve. Con todo cargado, no pregunta nada. `version` (lo que cambia cuando la galería se relee) vuelve
 * a buscar: si no, una pieza mandada a la papelera seguiría saliendo en los resultados.
 * → { extra: [archivos], buscando, aviso }.
 */
export function useBusquedaGaleria(clienteId, texto, { todoCargado = false, version = 0 } = {}) {
  const q = String(texto ?? "").trim();
  const preguntar = Boolean(q) && !todoCargado && palabrasDeBusqueda(q).length > 0;
  const [r, setR] = useState(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    if (!preguntar) return undefined;
    let vivo = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarEnGaleria(clienteId, q)
        .then((res) => { if (vivo) setR({ q, ...res }); })
        .catch(() => { if (vivo) setR({ q, archivos: [], error: true }); })
        .finally(() => { if (vivo) setBuscando(false); });
    }, 400);
    return () => { vivo = false; clearTimeout(espera); };
  }, [clienteId, q, preguntar, version]);
  const vigente = preguntar && r?.q === q;
  const aviso = !vigente ? "" : r.error ? "No se pudo buscar en lo que no está cargado: sólo se ve lo cargado."
    : !r.completa ? `Se buscó en las ${r.buscadas} más recientes.`
      : r.total > r.archivos.length ? `Hay ${r.total}: se ven las ${r.archivos.length} más recientes. Escribe algo más concreto.` : "";
  return { extra: vigente ? r.archivos : [], buscando: preguntar && buscando, aviso };
}
