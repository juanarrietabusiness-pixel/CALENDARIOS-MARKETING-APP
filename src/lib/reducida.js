/**
 * La COPIA REDUCIDA (~480 px, JPEG) de una imagen de R2: lo que pintan el chip del mes, la cuadrícula del perfil y la
 * página del cliente, que antes descargaban el original (piezas de 2K de 4 a 8 MB cada una). Es la misma ruta con
 * `?mini=1`: el servidor comprueba el permiso del original y, si la copia aún no existe, redirige al original y la hace
 * para la próxima vez (worker/lib/estudio/miniaturas.js). El visor y lo que se publica siguen con el original.
 * Lo que no es de R2 (un `data:` de antes, una dirección de fuera) se queda como está. Puro y sin importaciones: va
 * en la carga inicial y en la página del cliente.
 */
export const reducida = (src) => (typeof src === "string" && src.startsWith("/api/media/clientes/") && !src.includes("?") ? `${src}?mini=1` : src);
