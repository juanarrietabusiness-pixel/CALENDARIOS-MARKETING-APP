import { useCallback, useEffect, useRef, useState } from "react";
import { leerLoMejor, clasificarLoMejor } from "../lib/loMejorApi";

// ============================================================
// Lo que necesitan la sección «Lo mejor» y la pestaña Inspiración de cada
// cliente: leer la ventana con sus filtros, releer cuando otra persona (o el
// cron) cambió algo, y pedir que se clasifique SOLO lo que se está viendo y aún
// no tiene tipo (una vez por ventana abierta: es barato, pero no gratis).
// ============================================================

export function useLoMejor({ ventana = "semana", cliente = "", red = "", formato = "", tipo = "", fuente = "", pieza = "", pulso = 0, lectura = false } = {}) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const pedidas = useRef(new Set());

  const cargar = useCallback(async () => {
    try {
      const d = await leerLoMejor({ ventana, cliente, red, formato, tipo, fuente, pieza });
      setDatos(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setCargando(false);
    }
  }, [ventana, cliente, red, formato, tipo, fuente, pieza]);

  useEffect(() => { setCargando(true); void cargar(); }, [cargar, pulso]);

  // La clasificación que falta en lo que se ve (las primeras sin tipo), una vez por ventana.
  useEffect(() => {
    if (lectura || !datos?.piezas?.length) return;
    const clave = `${ventana}|${cliente}`;
    if (pedidas.current.has(clave)) return;
    const sinTipo = datos.piezas.filter((p) => !p.tipo).slice(0, 6).map((p) => p.clave);
    if (!sinTipo.length) return;
    pedidas.current.add(clave);
    clasificarLoMejor({ claves: sinTipo, clienteId: cliente })
      .then((r) => { if (r?.clasificadas) void cargar(); })
      .catch(() => { /* sin clasificar se ve igual: «Sin clasificar» */ });
  }, [datos, ventana, cliente, lectura, cargar]);

  // Otra persona guardó una referencia, el cron releyó anuncios o clasificó, o se puso al día una inspiración.
  useEffect(() => {
    const alCambiar = () => { void cargar(); };
    for (const ev of ["lo-mejor", "inspiracion", "banco-ideas"]) window.addEventListener(ev, alCambiar);
    return () => { for (const ev of ["lo-mejor", "inspiracion", "banco-ideas"]) window.removeEventListener(ev, alCambiar); };
  }, [cargar]);

  return { datos, cargando, error, cargar };
}
