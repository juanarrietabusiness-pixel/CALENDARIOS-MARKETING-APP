import { useState } from "react";

// ============================================================
// Ordenar una lista arrastrando (y con flechas)
//
// Lo usan «Hoy» de Mi día y del panel lateral: cinco tareas para el mismo
// día salían por orden de creación y no había forma de poner primero la
// que se va a hacer primero. Mientras se arrastra, el orden es provisional
// (sólo en pantalla); al soltar se entrega una vez a `onOrden`.
//
// Las flechas (`mover`) son lo mismo para el teclado, el lector de
// pantalla y el teléfono, donde el arrastre de HTML no funciona.
// ============================================================

export function useArrastrarOrden(items, clave, onOrden) {
  const [arrastrado, setArrastrado] = useState(null);
  const [orden, setOrden] = useState(null);
  const porClave = (k) => items.find((x) => clave(x) === k);
  const lista = orden ? orden.map(porClave).filter(Boolean) : items;

  const props = (item) => ({
    draggable: true,
    "data-arrastrable": "true",
    "data-arrastrando": arrastrado === clave(item) ? "true" : undefined,
    onDragStart: (e) => {
      setArrastrado(clave(item));
      setOrden(items.map(clave));
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    },
    onDragOver: (e) => {
      if (!arrastrado) return;
      e.preventDefault();
      const destino = clave(item);
      if (destino === arrastrado) return;
      setOrden((prev) => {
        const ks = [...(prev ?? items.map(clave))];
        const de = ks.indexOf(arrastrado);
        const a = ks.indexOf(destino);
        if (de < 0 || a < 0) return prev;
        ks.splice(de, 1);
        ks.splice(a, 0, arrastrado);
        return ks;
      });
    },
    onDrop: (e) => e.preventDefault(),
    onDragEnd: () => {
      if (orden) onOrden(orden.map(porClave).filter(Boolean));
      setArrastrado(null);
      setOrden(null);
    },
  });

  /** Una posición arriba (-1) o abajo (+1). */
  const mover = (item, d) => {
    const ks = items.map(clave);
    const i = ks.indexOf(clave(item));
    const j = i + d;
    if (i < 0 || j < 0 || j >= ks.length) return;
    [ks[i], ks[j]] = [ks[j], ks[i]];
    onOrden(ks.map(porClave));
  };

  return { lista, props, mover };
}
