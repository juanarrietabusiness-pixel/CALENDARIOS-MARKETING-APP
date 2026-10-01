// ============================================================
// La Biblioteca de anuncios de Meta, del lado del Worker
//
// Una búsqueda es UNA llamada a `GET /ads_archive`, con el token de la
// persona que conectó Meta (`integracion_meta`, el mismo que lista las
// páginas). No hace falta ningún permiso de la app: lo que exige Meta es
// que ESA persona haya confirmado su identidad en facebook.com/ID. Si no,
// contesta un (#10) con el subcódigo 2332002, que aquí se traduce.
//
// Lo que NO sale al navegador:
//   · el token, claro;
//   · `paging.next`, que es una dirección con el token dentro: sólo el
//     cursor `after`;
//   · `ad_snapshot_url` tal cual, que también lleva el token (ver
//     `enlaceDelAnuncio` en src/lib/biblioteca.js).
//
// No se ha probado contra el servicio real: los tests usan un `fetch` de
// mentira que contesta como la documentación de `/ads_archive`.
// ============================================================

import { graph, descifrarMeta, metaConfigurado, mensajeMeta, ErrorMeta } from "./meta.js";
import { normalizarConsulta, parametrosAdsArchive, tarjetaDeAnuncio, cursorValido, urlBibliotecaWeb, MAX_PAGINAS, AVISO_COBERTURA } from "../../src/lib/biblioteca.js";

export const MENSAJE_IDENTIDAD = "Verifica tu identidad en facebook.com/ID y vuelve a intentar.";

/** Lo que se le enseña a la agencia cuando la búsqueda no sale. En español y con qué hacer. */
export function mensajeBiblioteca(e) {
  if (e instanceof ErrorMeta) {
    const texto = `${e.message} ${e.detalle} ${e.titulo}`;
    // (#10) + 2332002: quien conectó Meta no ha confirmado su identidad para la Biblioteca.
    if (e.subcodigo === 2332002 || /facebook\.com\/ID\b|confirm (?:your )?identity|identity confirmation/i.test(texto)) return MENSAJE_IDENTIDAD;
    if (e.codigo === 10) return MENSAJE_IDENTIDAD;
    if ([4, 17, 32, 613].includes(e.codigo)) return "Meta limitó las búsquedas en la Biblioteca por un rato. Espera unos minutos y vuelve a intentar.";
    if (e.codigo === 100) return `Meta no aceptó la búsqueda: ${e.detalle || e.message}`;
  }
  return mensajeMeta(e);
}

export class ErrorBiblioteca extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.name = "ErrorBiblioteca";
    this.estado = estado;
  }
}

/**
 * Busca. `entrada` es la consulta tal como llega (se normaliza aquí otra
 * vez: lo que diga el navegador no se cree), `after` el cursor y `pagina`
 * cuántas lleva ya esta búsqueda (tope `MAX_PAGINAS`).
 */
export async function buscarAnuncios(env, acceso, entrada, { after = "", pagina = 1 } = {}) {
  const { consulta, cobertura, errores, avisos } = normalizarConsulta(entrada);
  if (errores.length) throw new ErrorBiblioteca(errores.join(" "));
  const n = Math.max(1, Math.trunc(Number(pagina)) || 1);
  if (n > MAX_PAGINAS) throw new ErrorBiblioteca(`Llegaste a ${MAX_PAGINAS} páginas de esta búsqueda: afínala con más palabras, fechas o un país.`);
  if (after && !cursorValido(after)) throw new ErrorBiblioteca("El cursor de la página siguiente no es válido. Vuelve a buscar.");

  if (!metaConfigurado(env)) throw new ErrorBiblioteca("Falta configurar META_APP_ID y META_APP_SECRET en el Worker.", 503);
  const fila = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
  if (!fila) throw new ErrorBiblioteca("Meta no está conectado. Conéctalo en Ajustes → Integraciones.", 409);

  let datos;
  try {
    const token = await descifrarMeta(env, fila.token_cifrado);
    datos = await graph(env, token, "/ads_archive", { params: parametrosAdsArchive(consulta, { after }) });
  } catch (e) {
    throw new ErrorBiblioteca(mensajeBiblioteca(e), 502);
  }

  const siguiente = datos?.paging?.next && cursorValido(datos?.paging?.cursors?.after) ? datos.paging.cursors.after : null;
  return {
    anuncios: (Array.isArray(datos?.data) ? datos.data : []).map(tarjetaDeAnuncio),
    siguiente: n < MAX_PAGINAS ? siguiente : null,
    pagina: n,
    consulta,
    cobertura,
    avisos: cobertura === "ue" ? avisos : [...avisos, AVISO_COBERTURA],
    web: urlBibliotecaWeb(consulta),
  };
}
