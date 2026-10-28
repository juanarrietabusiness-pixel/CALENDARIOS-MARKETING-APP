// ============================================================
// Las ESTRUCTURAS de un carrusel (puro)
//
// Todas las ideas de carrusel salían con la misma plantilla («Portada / Slide
// 1…5 / CTA») y los de un mismo tipo de contenido se parecían todos. Como la
// composición de un post, la estructura la pone el CÓDIGO: rota por tipo de
// contenido y no repite las dos últimas que ese cliente usó en ese tipo. Las
// lee el motor de ideas (lib/loteAnuncios.js: lote, «Planificar mes», «Mes
// completo»), «Dame ideas» del carrusel (lib/ideasFormato.js) y el director
// cuando sólo hay un tema (lib/director.js). Escritas con palabras propias.
// ============================================================

import { idDePilar } from "./pilares.js";

/** Cómo avanza un carrusel lámina a lámina. `laminas`: cuántas (con portada y cierre); `tipos`: con qué tipos encaja. */
export const ESTRUCTURAS_CARRUSEL = Object.freeze([
  { id: "errores", nombre: "Errores comunes", laminas: 6, tipos: ["educativo", "diferenciador", "maletas"], como: "la portada nombra cuántos errores; una lámina por error con por qué pasa y qué hacer en su lugar; el cierre lleva a la solución de la marca" },
  { id: "mitos", nombre: "Mito o realidad", laminas: 6, tipos: ["educativo", "diferenciador", "maletas"], como: "la portada cuestiona una creencia del rubro; cada lámina, un mito y su realidad, con un dato si lo hay; cierre" },
  { id: "pasos", nombre: "Paso a paso", laminas: 7, tipos: ["educativo", "servicios"], como: "la portada promete el resultado; una lámina por paso, numerado y que se pueda hacer; el cierre da el siguiente paso" },
  { id: "antes-despues", nombre: "Antes y después", laminas: 5, tipos: ["anuncio", "beneficios", "maletas"], como: "la portada enseña el contraste; el antes (el problema), el cambio, el después (el resultado); cierre" },
  { id: "comparacion", nombre: "Comparación", laminas: 6, tipos: ["anuncio", "beneficios", "diferenciador", "maletas"], como: "la portada plantea «A o B»; un criterio por lámina (uso, duración, precio…) con las dos opciones lado a lado; el veredicto según el caso; cierre" },
  { id: "checklist", nombre: "Lista para revisar", laminas: 6, tipos: ["educativo", "anuncio"], como: "la portada dice «antes de… revisa esto»; un punto por lámina con su casilla marcada; cierre" },
  { id: "senales", nombre: "Señales de que…", laminas: 6, tipos: ["educativo", "anuncio", "beneficios"], como: "la portada: cuántas señales de que se necesita algo; una señal por lámina, con cómo reconocerla; el cierre dice qué hacer" },
  { id: "preguntas", nombre: "Preguntas frecuentes", laminas: 6, tipos: ["servicios", "maletas", "humano", "beneficios"], como: "la portada: lo que más preguntan; una pregunta real y su respuesta corta por lámina; cierre" },
  { id: "caso", nombre: "Caso real", laminas: 6, tipos: ["maletas", "humano"], como: "sólo con un caso que esté en los datos: la portada con el resultado; la situación, el problema, lo que se hizo, el resultado; cierre" },
  { id: "incluye", nombre: "Qué incluye", laminas: 6, tipos: ["anuncio", "beneficios", "servicios"], como: "la portada presenta el producto o servicio; una cosa que incluye por lámina, con su beneficio; el precio exacto si está; cierre" },
  { id: "guia", nombre: "Guía para escoger", laminas: 6, tipos: ["servicios", "educativo"], como: "la portada pregunta «¿cuál te conviene?»; un perfil o una necesidad por lámina, con su opción; cierre" },
  { id: "detras", nombre: "Detrás de cámaras", laminas: 5, tipos: ["humano", "diferenciador", "servicios"], como: "la portada invita a ver cómo se hace; el proceso o el equipo, lámina a lámina; cierre cercano" },
  { id: "historia", nombre: "Historia en tres actos", laminas: 5, tipos: ["humano", "diferenciador"], como: "la portada abre con un gancho de historia; el conflicto, el giro, el final y la lección; cierre" },
  { id: "dato", nombre: "Un dato que sorprende", laminas: 5, tipos: ["educativo", "diferenciador"], como: "sólo con un dato que esté en los datos (con su fuente): la portada con la cifra; por qué importa; qué significa para quien lee; qué hacer; cierre" },
]);
export const estructuraDe = (id) => ESTRUCTURAS_CARRUSEL.find((x) => x.id === id) ?? null;

/**
 * La estructura de un carrusel de tipo `pilar`: las que encajan con ese tipo (si no hay, todas), rotando desde
 * `semilla + indice`, SIN las dos últimas que ese cliente usó en ese tipo (`usadas`, de la más vieja a la más nueva:
 * [{ pilar, estructura }]). Pura.
 */
export function estructuraPara(pilar, { usadas = [], semilla = 0, indice = 0 } = {}) {
  const id = idDePilar(pilar) || "";
  const deTipo = ESTRUCTURAS_CARRUSEL.filter((x) => x.tipos.includes(id));
  const lista = deTipo.length >= 3 ? deTipo : ESTRUCTURAS_CARRUSEL;
  const recientes = usadas.filter((u) => (idDePilar(u?.pilar) || "") === id).map((u) => u.estructura).slice(-2);
  const libres = lista.filter((x) => !recientes.includes(x.id));
  const opciones = libres.length ? libres : lista;
  return opciones[(Math.abs(Math.floor(Number(semilla) || 0)) + indice) % opciones.length].id;
}

/** Las estructuras recientes que manda el navegador, limpias (ids que existen). Pura. */
export const limpiarEstructurasRecientes = (lista) => (Array.isArray(lista) ? lista : [])
  .filter((u) => estructuraDe(u?.estructura))
  .map((u) => ({ pilar: String(u.pilar ?? "").slice(0, 40), estructura: u.estructura }))
  .slice(-40);

/**
 * Las estructuras que ya usó un cliente en sus carruseles, de la más vieja a la más nueva: [{ pilar, estructura }]
 * sacadas de sus calendarios (`days[].posts[]` con `estructura`). Pura.
 */
export function estructurasDeCalendarios(calendarios = []) {
  const filas = [];
  for (const cal of calendarios ?? []) {
    const dias = Array.isArray(cal?.days) ? cal.days : [];
    for (const d of dias) {
      for (const p of d?.posts ?? []) {
        if (p?.format === "carrusel" && estructuraDe(p.estructura)) filas.push({ fecha: String(d.date ?? ""), pilar: p.pilar ?? "", estructura: p.estructura });
      }
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(({ pilar, estructura }) => ({ pilar, estructura })).slice(-40);
}

/** La línea que lee la IA: «estructura del carrusel: Errores comunes, 6 láminas: …». Pura. */
export function lineaDeEstructura(id) {
  const e = estructuraDe(id);
  return e ? `estructura del carrusel: ${e.nombre}, ${e.laminas} láminas: ${e.como}` : "";
}

/** `n` estructuras DISTINTAS para el tipo `pilar` (para «Dame ideas»: una por idea). Pura. */
export function estructurasDistintas(pilar, n, { usadas = [], semilla = 0 } = {}) {
  const salida = [];
  const vistas = [...limpiarEstructurasRecientes(usadas)];
  for (let i = 0; i < n; i++) {
    let id = estructuraPara(pilar, { usadas: vistas, semilla, indice: i });
    // Sin repetir dentro de la tanda: si ya salió, la siguiente libre de la lista entera.
    if (salida.includes(id)) id = ESTRUCTURAS_CARRUSEL.map((x) => x.id).find((x) => !salida.includes(x)) ?? id;
    salida.push(id);
    vistas.push({ pilar: pilar ?? "", estructura: id });
  }
  return salida;
}
