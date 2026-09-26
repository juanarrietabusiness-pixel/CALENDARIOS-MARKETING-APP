// ============================================================
// Quién está dentro, para lo que no recibe `yo` por props
//
// Lo fija Workspace al pintar. Sirve a las piezas hondas (el panel de una
// publicación, «Subir») para saber el papel sin pasar `yo` por seis
// capas. Lo que decide de verdad es el servidor: esto sólo evita ofrecer
// un botón que va a contestar 403.
// ============================================================

let actual = null;

export const fijarYo = (u) => { actual = u ?? null; };
export const yoActual = () => actual;
export const esAdmin = () => actual?.rol === "admin";
export const soloLectura = () => Boolean(actual?.soloLectura);
