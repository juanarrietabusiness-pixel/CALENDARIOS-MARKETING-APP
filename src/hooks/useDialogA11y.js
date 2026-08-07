import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Accesibilidad de diálogos modales.
 *
 * - Cierra con Escape.
 * - Atrapa el foco dentro del diálogo (Tab / Shift+Tab hacen ciclo).
 * - Mueve el foco al primer control al abrir.
 * - Devuelve el foco al elemento que abrió el diálogo al cerrar.
 * - Bloquea el desplazamiento del fondo mientras está abierto.
 *
 * Devuelve la ref que hay que colocar en el contenedor del diálogo.
 */
export function useDialogA11y(onClose) {
  const ref = useRef(null);
  // onClose suele ser una función nueva en cada render; la guardamos en
  // una ref para no re-suscribir el listener en cada uno.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement;

    // Foco inicial: primer control interactivo, o el propio contenedor.
    const focusables = node.querySelectorAll(FOCUSABLE);
    const first = focusables[0];
    if (first) {
      first.focus({ preventScroll: true });
    } else {
      node.setAttribute("tabindex", "-1");
      node.focus({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      // Se recalcula en cada Tab: el contenido del diálogo cambia
      // (campos condicionales, listas que crecen).
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      node.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return ref;
}
