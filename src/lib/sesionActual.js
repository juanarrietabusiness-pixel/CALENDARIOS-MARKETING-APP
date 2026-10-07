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
/** Puede cambiar lo que vale para toda la agencia (las plantillas de plan): quien administra o un editor que no es colaborador. */
export const editaLaAgencia = () => !soloLectura() && (actual?.rol === "admin" || (actual?.rol === "editor" && !Array.isArray(actual?.clientes)));
