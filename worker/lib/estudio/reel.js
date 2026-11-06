// ============================================================
// El reel con IA: el guion por planos (texto)
//
// De la idea central (la promoción, el beneficio o la idea) a un guion por planos —qué se ve y la cámara de cada uno,
// y con montaje lo que se DICE y se LEE en cada uno, el gancho y el llamado—, el hilo que comparten, el sonido y la
// descripción. El contexto (el producto con su precio EXACTO, el cerebro para escribir sin lo interno, el criterio
// comercial y la publicación con el guion que YA tiene) lo junta `contextoDeGuion`, el mismo de todos los guiones de
// video. Lo puro en src/lib/reel.js. Es texto: no pide nada al motor de video.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { leerMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { estructuraATexto } from "../../../src/lib/estudioMercado.js";
import { nombreDePreset, lineaDeEstilo, estiloDeLaPieza, bloqueDeMarca } from "../../../src/lib/kitMarca.js";
import { pedidoDeReel, leerReel } from "../../../src/lib/reel.js";
import { DURACIONES_OBJETIVO } from "../../../src/lib/duracionesVideo.js";
import { contextoDeGuion } from "./guionVideo.js";
import { estructuraDeVoz, usadaEn, ErrorEstructura } from "../estructurasGuion.js";

/** Las duraciones que se escriben (las de siempre y las de la tabla por ruta). */
const SEGUNDOS = new Set([4, 6, 8, 10, 15, 20, 30, 40, ...DURACIONES_OBJETIVO]);

/**
 * `datos`: { idea, segundos?, preset?, estilo?, productoId?, personajes?: [ids], musica?, locucion?, referenciaId?,
 * postId?, guionPost?, montaje? } → { hilo, planos, musica, locucion, efectos, descripcion, gancho, llamado }.
 * `referenciaId`: un anuncio de la competencia ya analizado (estudio de mercado): el guion sigue su ESTRUCTURA.
 * `postId` / `guionPost`: la publicación de la que sale: el guion que ya tiene se SIGUE (antes se ignoraba).
 * `montaje` (por defecto, sí): pide lo que se dice y se lee por plano, el gancho y el llamado.
 * `estructuraId` (o `formulaId`): la ESTRUCTURA de guion de la agencia que sigue la voz en off; sin ella, la IA escoge
 * entre las de voz. La que siguió vuelve en `estructuraId` y `estructuraNombre`.
 */
export async function guionDeReel(env, acceso, cliente, datos = {}) {
  let idea = String(datos.idea ?? "").trim().slice(0, 1500);
  // El anuncio que ya funciona: su estructura tramo a tramo (o, sin ella, su gancho y por qué funciona).
  let estructura = "";
  if (datos.referenciaId) {
    try {
      const { referencias } = await leerMercado(acceso, cliente.id);
      const ref = referencias.find((r) => r.id === String(datos.referenciaId));
      const a = ref?.analisis;
      if (a) {
        estructura = [estructuraATexto(a.estructura), a.gancho && `Gancho: ${a.gancho}`, a.porQueFunciona && `Por qué funciona: ${a.porQueFunciona}`].filter(Boolean).join(". ");
        if (!idea) idea = a.ideaParaNosotros || "Adapta este anuncio a nuestra marca y producto.";
      }
    } catch { /* sin estudio de mercado */ }
  }
  const ctx = await contextoDeGuion(env, acceso, cliente, {
    productoId: datos.productoId ?? "", consulta: `${idea} contacto whatsapp beneficios`, postId: datos.postId ?? "",
    guionPost: String(datos.guionPost ?? "").slice(0, 3000),
  });
  // Sin idea escrita, la de la publicación (su idea o su guion): no se pide escribir lo que ya está.
  if (!idea && ctx.post) idea = String(ctx.post.idea || ctx.post.title || ctx.post.titulo || "").trim().slice(0, 1500);
  if (!idea && ctx.guionPost) idea = "El reel de esta publicación, con su guion.";
  if (!idea) throw Object.assign(new Error("Escribe la idea central: la promoción, el beneficio o lo que quieres contar."), { estado: 400 });
  const segundos = SEGUNDOS.has(Number(datos.segundos)) ? Number(datos.segundos) : 10;
  // La ESTRUCTURA de guion de la agencia que sigue la voz en off: la escogida o, sin escoger, la que escoja la IA entre
  // las de voz (y diga en su JSON). Una escogida que ya no está es un 400.
  let eleccion;
  try {
    eleccion = await estructuraDeVoz(acceso, { estructuraId: datos.estructuraId ?? datos.formulaId ?? "", segundos });
  } catch (e) {
    if (e instanceof ErrorEstructura) throw Object.assign(new Error(e.message), { estado: e.estado });
    throw e;
  }
  const kit = kitDe(cliente);
  const preset = String(datos.preset ?? "");
  const ids = Array.isArray(datos.personajes) ? datos.personajes.map(String) : [];
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeReel({
      marca: cliente.name, rubro: cliente.industry ?? "", idea, segundos, producto: ctx.producto, contexto: ctx.contexto,
      tipo: preset ? nombreDePreset(preset, kit) : "",
      estilo: lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, String(datos.estilo ?? ""))),
      personajes: kit.personajes.filter((p) => ids.includes(p.id)).map((p) => `${p.nombre}${p.descripcion ? `: ${p.descripcion}` : ""}`),
      identidad: bloqueDeMarca(kit),
      musica: String(datos.musica ?? "").slice(0, 300), locucion: String(datos.locucion ?? "").slice(0, 500), estructura,
      // El criterio comercial de la agencia va en TODO guion de video (lib/directorVideo.js).
      criterio: ctx.criterio, guionPost: ctx.guionPost, montaje: datos.montaje !== false,
      estructuraGuion: eleccion.texto, campoEstructura: !eleccion.elegida && Boolean(eleccion.texto),
    }),
    salida: segundos > 10 ? 2400 + segundos * 140 : 2600,
    funcion: "guion de video",
  });
  const leido = leerReel(r.texto, segundos);
  if (!leido) throw Object.assign(new Error("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  const { estructura: nombre = "", ...guion } = leido;
  const usada = usadaEn(eleccion, nombre);
  return {
    ...guion, segundos, modelo: r.modelo, aviso: r.aviso ?? null,
    // La estructura que siguió (viaja con el guion al encargo, y de ahí al montaje y a la publicación).
    ...(usada ? { estructuraId: usada.id, estructuraNombre: usada.nombre } : {}),
  };
}
