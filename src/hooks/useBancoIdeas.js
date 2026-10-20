import { useCallback, useEffect, useRef, useState } from "react";
import { listarBanco, anadirAlBanco, cambiarEnBanco, quitarDelBanco } from "../lib/bancoIdeasApi";

// ============================================================
// El banco de ideas único, para una pantalla
//
// Se lee ENTERO (son decenas o cientos de ideas) y cada vista lo filtra con
// `filtrarBanco`: el banco del calendario, la pestaña Ideas y el contador del
// botón. Se relee con el aviso `banco-ideas` (otra persona por el socket, u
// otra parte de esta pestaña) y con `pulso`.
//
// Escribir el texto de una idea llega con cada tecla: se guarda agrupado por
// idea (`ESPERA` ms) y el estado cambia ya. Añadir, quitar y asignar
// cliente van al momento.
// ============================================================

const ESPERA = 600;

export function useBancoIdeas({ pulso = 0, onError = null } = {}) {
  const [ideas, setIdeas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const timers = useRef(new Map());
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const fallo = (accion) => (e) => errorRef.current?.(`No se pudo ${accion}: ${e.message}`);

  const releer = useCallback(async () => {
    try {
      const lista = await listarBanco();
      // Lo que se está escribiendo (guardado pendiente) gana sobre lo que trae la lectura.
      setIdeas((prev) => lista.map((i) => (timers.current.has(i.id) ? prev.find((p) => p.id === i.id) ?? i : i)));
    } catch (e) {
      errorRef.current?.(`No se pudo leer el banco de ideas: ${e.message}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { releer(); }, [releer, pulso]);

  useEffect(() => {
    const alAviso = () => { releer(); };
    window.addEventListener("banco-ideas", alAviso);
    return () => window.removeEventListener("banco-ideas", alAviso);
  }, [releer]);

  // Lo pendiente sale al desmontar: cerrar el banco no pierde lo último que se escribió.
  useEffect(() => () => {
    for (const [, t] of timers.current) { clearTimeout(t.id); t.guardar(); }
    timers.current.clear();
  }, []);

  const anadir = useCallback(async (idea, clienteId) => {
    const provisional = { ...idea, clientId: clienteId || null };
    setIdeas((prev) => [provisional, ...prev.filter((p) => p.id !== idea.id)]);
    try {
      const guardada = await anadirAlBanco(idea, clienteId);
      if (guardada) setIdeas((prev) => prev.map((p) => (p.id === idea.id ? guardada : p)));
      return guardada;
    } catch (e) {
      setIdeas((prev) => prev.filter((p) => p.id !== idea.id));
      fallo("guardar la idea")(e);
      return null;
    }
  }, []);

  const cambiar = useCallback((idea) => {
    setIdeas((prev) => prev.map((p) => (p.id === idea.id ? { ...idea, clientId: p.clientId } : p)));
    const previo = timers.current.get(idea.id);
    if (previo) clearTimeout(previo.id);
    const guardar = () => cambiarEnBanco(idea).catch(fallo("guardar la idea"));
    timers.current.set(idea.id, {
      guardar,
      id: setTimeout(() => { timers.current.delete(idea.id); guardar(); }, ESPERA),
    });
  }, []);

  const asignar = useCallback(async (id, clienteId) => {
    const idea = ideas.find((p) => p.id === id);
    if (!idea) return;
    const pendiente = timers.current.get(id);
    if (pendiente) { clearTimeout(pendiente.id); timers.current.delete(id); }
    setIdeas((prev) => prev.map((p) => (p.id === id ? { ...p, clientId: clienteId || null } : p)));
    try {
      await cambiarEnBanco(idea, { clienteId });
    } catch (e) {
      fallo("cambiar la empresa de la idea")(e);
      releer();
    }
  }, [ideas, releer]);

  const quitar = useCallback(async (id) => {
    const pendiente = timers.current.get(id);
    if (pendiente) { clearTimeout(pendiente.id); timers.current.delete(id); }
    const antes = ideas;
    setIdeas((prev) => prev.filter((p) => p.id !== id));
    try {
      await quitarDelBanco(id);
      return true;
    } catch (e) {
      setIdeas(antes);
      fallo("quitar la idea del banco")(e);
      return false;
    }
  }, [ideas]);

  return { ideas, cargando, anadir, cambiar, asignar, quitar, releer };
}
