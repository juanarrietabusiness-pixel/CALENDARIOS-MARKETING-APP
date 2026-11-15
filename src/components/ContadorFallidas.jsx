import { useState, useEffect } from "react";
import { listarFallidas } from "../lib/db";

// ============================================================
// El número rojo sobre «Programación»
//
// Cuántas publicaciones no se pudieron publicar. Lo que falla en la cola
// pasa sin nadie delante —la mueve el cron—, y el aviso del momento se
// pierde si nadie estaba mirando: esto se queda hasta que se reintenta o
// se descarta. Relee con cada `pulso`.
// ============================================================

// Hay dos montados a la vez (la barra lateral y la barra de abajo del teléfono): piden UNA vez por `pulso`.
let ultima = null;
const leer = (pulso) => {
  if (!ultima || ultima.pulso !== pulso || Date.now() - ultima.t > 3000) ultima = { pulso, t: Date.now(), promesa: listarFallidas() };
  return ultima.promesa;
};

export default function ContadorFallidas({ pulso = 0 }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let vivo = true;
    leer(pulso)
      .then((filas) => { if (vivo) setN(filas.length); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);

  if (!n) return null;
  return (
    <>
      <span className="contador-atrasadas" aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {n} sin publicar</span>
    </>
  );
}
