// Qué componente pinta cada tipo de pieza (los tipos: src/lib/escenaEdicion.js, TIPOS_PIEZA).
import { Titular, Gigante, Tachado, Trio, Cinta, TarjetaLogo, Ficha, Lista, Sello, Preguntas, BotonWhatsApp } from "./Piezas.jsx";

export const PIEZAS_DETRAS = { titular: Titular, gigante: Gigante, tachado: Tachado, trio: Trio };
export const PIEZAS_DELANTE = { cinta: Cinta, logo: TarjetaLogo, ficha: Ficha, lista: Lista, sello: Sello, preguntas: Preguntas, whatsapp: BotonWhatsApp };
