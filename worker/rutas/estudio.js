// ============================================================
// /api/estudio — el Estudio de imágenes de cada cliente
//
//   GET    /motores                                Qué motores tienen llave (nunca la llave)
//   GET    /<cliente>                              La galería, la papelera, las carpetas y los trabajos
//   POST   /<cliente>/trabajos                     Pedir { modelo, prompt, n, ajustes, medios, confirmado, calendarId?, postId? }
//   GET    /<cliente>/trabajos/<id>                Un trabajo (no lo avanza)
//   POST   /<cliente>/trabajos/<id>/avanzar        UN paso: una imagen
//   POST   /<cliente>/trabajos/<id>/cancelar
//   POST   /<cliente>/trabajos/<id>/reintentar
//   POST   /<cliente>/mejorar                      { idea, tipo, pieza? }: la IA devuelve la idea más clara (texto)
//   POST   /<cliente>/fichas                     { piezas, concepto? }: el director de arte, una ficha de diseño por pieza (texto)
//   POST   /<cliente>/versiones                    { idea, n, tipo }: 1–3 escenas distintas con la misma información (texto)
//   POST   /<cliente>/lote/ideas                   { modo: niveles|matriz|tipos, desde?, tamano?, … }: la producción en lote, por tandas (texto)
//   POST   /<cliente>/lote/mes                     { mes, dias, formato, desde?, tamano? }: una pieza por día del mes, con el ritmo y la matriz (texto)
//   POST   /<cliente>/ideas                        { tipo?, n?, video?, tema? }: «Dame ideas», variadas o de un tipo (texto)
//   POST   /<cliente>/carrusel/propuesta           { guion?, tema?, preset?, estilo?, productoId?, personajes? }: el plan por láminas (texto)
//   POST   /<cliente>/carrusel/ideas               { preset?, tema?, productoId?, n?, usados? }: ideas de carrusel con su guion (texto)
//   POST   /<cliente>/reel/ideas                   { preset?, tema?, productoId?, n?, usados?, segundos? }: ideas de reel IA (texto)
//   POST   /<cliente>/reel/guion                   { idea, segundos?, preset?, estilo?, productoId?, personajes? }: el guion por planos (texto)
//   POST   /<cliente>/guion-corto                  { idea, segundos, post? }: guion de un video de 8 o 10 s (texto)
//   PUT    /<cliente>/kit                          { kit }: guarda el kit de marca (paleta, presets, logo…)
//   POST   /<cliente>/kit/preparar                 La IA PROPONE el kit desde el cerebro (no guarda)
//   POST   /<cliente>/kit/aprender                 La IA MIRA los «Me gusta» y la papelera y PROPONE reglas visuales (no guarda)
//   POST   /<cliente>/revisar                      { archivoId } o { clave }: la IA mira la imagen contra el kit
//   POST   /<cliente>/archivos                     Subir a mano (multipart: archivo, carpetaId?, origenId?, plantilla?);
//                                                   la misma imagen dos veces → 200 con la ficha que había y `repetido`
//   POST   /<cliente>/archivos/<id>/cambiar        { favorito?, carpetaId? }
//   POST   /<cliente>/archivos/<id>/uso            { calendarId, postId }: lo usa una publicación
//   POST   /<cliente>/archivos/<id>/papelera       A la papelera
//   POST   /<cliente>/archivos/<id>/recuperar      De la papelera
//   POST   /<cliente>/archivos/<id>/perdido        Quitar la ficha de un archivo que ya no está en R2
//   DELETE /<cliente>/archivos/<id>?forzar=1       Borrar del todo (sólo desde la papelera)
//   POST   /<cliente>/papelera/vaciar
//   POST   /<cliente>/archivos/<id>/control         { texto? }: el control de calidad (la IA mira la pieza; queda en la ficha)
//   POST   /<cliente>/director                     { idea, formato, segundos, productoId }: la idea mejorada como director
//                                                   comercial, con qué cambió y por qué (no guarda)
//   GET    /<cliente>/voz/<voz>                    la muestra de una voz de Google (audio/wav; se pide una vez y queda en R2)
//   POST   /<cliente>/kit/fuente                   multipart «archivo»: la fuente de la marca (TTF, OTF, WOFF, WOFF2) → { clave }
//   POST   /<cliente>/kit/reglas                   { regla } → se suma a «Reglas que no se rompen» del kit
//   POST   /<cliente>/kit/plantillas               { archivoId, nombre?, uso? }: «Guardar como plantilla» (la IA saca su sistema)
//   DELETE /<cliente>/kit/plantillas/<id>          quita una plantilla del kit (la imagen se queda en la galería)
//   POST   /<cliente>/carpetas                     { nombre, tipo? } (tipo «carrusel» | «reel»: la galería la agrupa)
//   PUT    /<cliente>/carpetas/<id>                { nombre?, orden? } (orden: ids de sus piezas, en orden)
//   DELETE /<cliente>/carpetas/<id>
//
// Todo pasa por `clienteDe()`: el cliente tiene que ser de este espacio y, si
// quien pregunta es un colaborador, de los suyos. Uno ajeno da «no
// encontrado», igual que /api/media y /api/cerebro.
//
// Las lecturas son GET a propósito: alguien de sólo lectura puede mirar la
// galería, que es lo único que este papel hace. Pedir una imagen gasta, y
// eso ya lo corta `worker/index.js` antes de llegar aquí.
// ============================================================

import { json, error, cuerpo, noEncontrado, CABECERAS_API } from "../lib/respuesta.js";
import { muestraDeVoz } from "../lib/estudio/voz.js";
import { revisarComoDirector } from "../lib/estudio/director.js";
import { firma, difundir } from "../lib/vivo.js";
import { estadoMotores } from "../lib/estudio/motores.js";
import { mejorarIdea, versionesDeIdea } from "../lib/estudio/prompt.js";
import { fichasDeDiseno } from "../lib/estudio/fichas.js";
import { guionCorto } from "../lib/estudio/guionCorto.js";
import { kitDe, guardarKit, prepararKit, revisarPieza, subirFuente } from "../lib/estudio/kit.js";
import { guardarPlantilla, quitarPlantilla } from "../lib/estudio/plantillas.js";
import { sistemaDePortada, controlarPieza } from "../lib/estudio/control.js";
import { aprenderDeLoVisual } from "../lib/estudio/aprender.js";
import { produccionDeLote } from "../lib/estudio/lote.js";
import { ideasDelEstudio } from "../lib/estudio/ideas.js";
import { propuestaDeCarrusel } from "../lib/estudio/carrusel.js";
import { guionDeReel } from "../lib/estudio/reel.js";
import { ideasDeFormato } from "../lib/estudio/ideasFormato.js";
import { estrategiaDelMes } from "../lib/estudio/estrategiaMes.js";
import { leerMercado } from "../lib/mercado.js";
import { angulosDeAnuncio, fotosDelCatalogo, productosActivos, lineaDeProducto } from "../../src/lib/estudioMercado.js";
import { MAX_REGLAS } from "../../src/lib/kitMarca.js";
import {
  crearTrabajo, avanzarTrabajo, cancelarTrabajo, reintentarTrabajo, trabajoPublico, ErrorEstudio,
} from "../lib/estudio/trabajos.js";
import {
  leerGaleria, subirArchivo, cambiarArchivo, marcarUso, enviarAPapelera, recuperar, borrarParaSiempre, quitarPerdido,
  vaciarPapelera, crearCarpeta, renombrarCarpeta, ordenarCarpeta, borrarCarpeta, archivoPublico,
} from "../lib/estudio/galeria.js";

const ID = /^[\w-]{1,80}$/;

/** Una respuesta de error de este módulo: lleva además el `codigo` y el costo, que la pantalla usa para pedir confirmación. */
const fallo = (e) => json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}), ...(e.costo != null ? { costo: e.costo } : {}), ...(e.usos != null ? { usos: e.usos } : {}) }, e.estado ?? 400);

export async function rutasEstudio(req, env, { acceso, usuario, partes, metodo }) {
  const [, a, b, c, d] = partes;

  if (a === "motores" && !b && metodo === "GET") return json({ motores: estadoMotores(env) });

  if (!ID.test(String(a ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: a });
  if (!cliente) return noEncontrado("Cliente");
  const por = firma(usuario, req);
  const avisar = () => difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por });

  try {
    // ---------- La galería ----------
    if (!b && metodo === "GET") {
      // Los ganchos del estudio de mercado aprobado, para escoger uno con el preset de anuncio (con su precio).
      const mercado = await leerMercado(acceso, cliente.id).catch(() => null);
      return json({
        ...(await leerGaleria(env, acceso, cliente.id)), kit: kitDe(cliente),
        angulos: mercado ? angulosDeAnuncio(mercado.estudio, mercado.catalogo) : [],
        // Las fotos de cada producto, para ponerlas de referencia (las de una publicación de ese producto, solas).
        productos: mercado ? fotosDelCatalogo(mercado.catalogo) : [],
      });
    }

    // ---------- «Revisar como director comercial»: la idea de un video, mejorada y con su porqué (no guarda) ----------
    if (b === "director" && !c && metodo === "POST") {
      const datos = (await cuerpo(req)) ?? {};
      let producto = "";
      if (datos.productoId) {
        const mercado = await leerMercado(acceso, cliente.id).catch(() => null);
        const p = mercado ? productosActivos(mercado.catalogo).find((x) => x.id === String(datos.productoId)) : null;
        if (p) producto = lineaDeProducto(p, { inventario: mercado.inventario }).slice(2);
      }
      return json(await revisarComoDirector(env, acceso, cliente, {
        idea: String(datos.idea ?? "").slice(0, 2000), formato: String(datos.formato ?? "reel"), segundos: Number(datos.segundos) || 10, producto,
      }));
    }

    // ---------- Escuchar una voz de la marca (la misma para toda la agencia; se paga una vez) ----------
    if (b === "voz" && c && !d && metodo === "GET") {
      const { cuerpo: audio } = await muestraDeVoz(env, acceso, String(c));
      return new Response(audio, {
        headers: { ...CABECERAS_API, "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
      });
    }

    // ---------- El kit de marca ----------
    if (b === "kit") {
      if (!c && metodo === "PUT") {
        const datos = await cuerpo(req);
        if (!datos?.kit) return error("Falta el kit");
        const kit = await guardarKit(env, acceso, cliente, datos.kit);
        avisar();
        return json({ kit });
      }
      // «Guardar como regla»: una corrección que se repite pasa a las reglas del kit (sobre el kit GUARDADO, no el que
      // tenga abierto la pantalla: así no pisa lo que otra persona cambió).
      if (c === "reglas" && metodo === "POST") {
        const datos = await cuerpo(req);
        const regla = String(datos?.regla ?? "").replace(/\s+/g, " ").trim();
        if (!regla) return error("Escribe la regla.");
        const actual = kitDe(cliente);
        if (actual.reglas.length >= MAX_REGLAS && !actual.reglas.some((r) => r.toLowerCase() === regla.toLowerCase().replace(/[.\s]+$/, ""))) {
          return error(`El kit ya tiene ${MAX_REGLAS} reglas: quita alguna en el kit de marca.`, 409);
        }
        const kit = await guardarKit(env, acceso, cliente, { ...actual, reglas: [...actual.reglas, regla] });
        avisar();
        return json({ kit });
      }
      // La fuente de la marca: se guarda el archivo (no el kit); la pantalla dibuja la muestra y guarda el kit con las dos.
      if (c === "fuente" && metodo === "POST") {
        const form = await req.formData().catch(() => null);
        return json(await subirFuente(env, cliente, form?.get("archivo")), 201);
      }
      // «Guardar como plantilla»: la pieza pasa al kit con su sistema de diseño (la IA la mira una vez).
      if (c === "plantillas" && !d && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        const r = await guardarPlantilla(env, acceso, cliente, { archivoId: datos.archivoId, nombre: datos.nombre, uso: datos.uso });
        avisar();
        return json(r, 201);
      }
      if (c === "plantillas" && d && metodo === "DELETE") {
        const r = await quitarPlantilla(env, acceso, cliente, String(d));
        avisar();
        return json(r);
      }
      if (c === "preparar" && metodo === "POST") return json(await prepararKit(env, acceso, cliente));
      if (c === "aprender" && metodo === "POST") return json(await aprenderDeLoVisual(env, acceso, cliente));
    }
    if (b === "revisar" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      return json(await revisarPieza(env, acceso, cliente, datos?.archivoId, { clave: typeof datos?.clave === "string" ? datos.clave : null }));
    }

    // ---------- Los trabajos ----------
    if (b === "trabajos") {
      if (!c && metodo === "POST") {
        const datos = await cuerpo(req);
        if (!datos) return error("JSON inválido");
        const fila = await crearTrabajo(env, acceso, cliente, datos, { usuario, por });
        return json({ trabajo: trabajoPublico(fila) }, 201);
      }
      if (!ID.test(String(c ?? ""))) return noEncontrado("Trabajo");
      const fila = await acceso.leerUno("estudio_trabajos", { id: c, client_id: cliente.id });
      if (!fila) return noEncontrado("Trabajo");

      if (!d && metodo === "GET") return json({ trabajo: trabajoPublico(fila) });
      if (d === "avanzar" && metodo === "POST") {
        const r = await avanzarTrabajo(env, acceso, c, { por });
        if (!r) return noEncontrado("Trabajo");
        return json({ trabajo: trabajoPublico(r.trabajo), ocupado: r.ocupado, espera: r.espera ?? 0 });
      }
      if (d === "cancelar" && metodo === "POST") return json({ trabajo: trabajoPublico(await cancelarTrabajo(env, acceso, c, { por })) });
      if (d === "reintentar" && metodo === "POST") return json({ trabajo: trabajoPublico(await reintentarTrabajo(env, acceso, c, { por })) });
      return error(`Método ${metodo} no permitido aquí`, 405);
    }

    // ---------- Mejorar la idea (texto: no pide nada al motor) ----------
    if (b === "mejorar" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await mejorarIdea(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- El director de arte: la ficha de diseño de cada pieza de una tanda (texto: no pide nada al motor) ----------
    if (b === "fichas" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos || !Array.isArray(datos.piezas)) return error("Faltan las piezas");
      try {
        return json(await fichasDeDiseno(env, acceso, cliente, { piezas: datos.piezas, concepto: String(datos.concepto ?? "") }));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- El lote de anuncios: las ideas (texto: no pide nada al motor) ----------
    if (b === "lote" && c === "ideas" && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      return json(await produccionDeLote(env, acceso, cliente, datos));
    }

    // ---------- El lote del mes completo: las ideas (texto: no pide nada al motor) ----------
    if (b === "lote" && c === "mes" && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      return json(await produccionDeLote(env, acceso, cliente, { ...datos, modo: "mes" }));
    }

    // ---------- «Dame ideas» (texto: no pide nada al motor) ----------
    if (b === "ideas" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      return json(await ideasDelEstudio(env, acceso, cliente, datos));
    }

    // ---------- «Proponer la estrategia con IA» de «Planificar mes» (texto: propone, no guarda) ----------
    if (b === "estrategia" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await estrategiaDelMes(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- «Dame ideas» de carrusel o de reel IA (texto: no pide nada al motor) ----------
    if ((b === "carrusel" || b === "reel") && c === "ideas" && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await ideasDeFormato(env, acceso, cliente, b, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- El carrusel: la contrapropuesta del director de arte (texto: no pide nada al motor) ----------
    if (b === "carrusel" && c === "propuesta" && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await propuestaDeCarrusel(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- El reel con IA: el guion por planos (texto: no pide nada al motor) ----------
    if (b === "reel" && c === "guion" && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await guionDeReel(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- «Otra versión distinta»: otras escenas (texto: no pide nada al motor) ----------
    if (b === "versiones" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await versionesDeIdea(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- El guion de un video corto (texto: no pide nada al motor) ----------
    if (b === "guion-corto" && !c && metodo === "POST") {
      const datos = await cuerpo(req);
      if (!datos) return error("JSON inválido");
      try {
        return json(await guionCorto(env, acceso, cliente, datos));
      } catch (e) {
        if (e?.estado) return error(e.message, e.estado);
        throw e;
      }
    }

    // ---------- Los archivos ----------
    if (b === "archivos") {
      if (!c && metodo === "POST") {
        const form = await req.formData().catch(() => null);
        const archivo = await subirArchivo(env, acceso, cliente, form?.get("archivo"), {
          carpetaId: form?.get("carpetaId") || null, origenId: form?.get("origenId") || null, plantilla: form?.get("plantilla") || null,
        });
        if (archivo.repetido) {
          // «Ya estaba en la galería»: no se guardó otra copia; se devuelve la que había.
          const { repetido, ...esa } = archivo;
          avisar();
          return json({ archivo: esa, repetido }, 200);
        }
        avisar();
        return json({ archivo }, 201);
      }
      if (!ID.test(String(c ?? ""))) return noEncontrado("Archivo");

      if (d === "cambiar" && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        const f = await cambiarArchivo(acceso, cliente.id, c, {
          favorito: "favorito" in datos ? Boolean(datos.favorito) : undefined,
          carpetaId: "carpetaId" in datos ? (datos.carpetaId ? String(datos.carpetaId) : null) : undefined,
        });
        if (!f) return noEncontrado("Archivo");
        avisar();
        return json({ archivo: f });
      }
      if (d === "uso" && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        const f = await marcarUso(acceso, cliente.id, c, { calendarId: datos.calendarId, postId: datos.postId });
        return f ? json({ archivo: f }) : noEncontrado("Archivo");
      }
      if (d === "papelera" && metodo === "POST") {
        const f = await enviarAPapelera(acceso, cliente.id, c);
        if (!f) return noEncontrado("Archivo");
        avisar();
        return json({ archivo: f });
      }
      if (d === "perdido" && metodo === "POST") {
        const hecho = await quitarPerdido(env, acceso, cliente.id, c);
        if (!hecho) return noEncontrado("Archivo");
        avisar();
        return json({ ok: true });
      }
      if (d === "control" && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        return json(await controlarPieza(env, acceso, cliente, c, {
          texto: typeof datos.texto === "string" ? datos.texto : null,
          sistema: datos.sistema && typeof datos.sistema === "object" ? datos.sistema : null,
        }));
      }
      // El sistema de diseño de la portada de un carrusel (la IA la mira; se apunta en la ficha).
      if (d === "sistema" && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        return json(await sistemaDePortada(env, acceso, cliente, c, { texto: typeof datos.texto === "string" ? datos.texto : "" }));
      }
      if (d === "recuperar" && metodo === "POST") {
        const f = await recuperar(acceso, cliente.id, c);
        if (!f) return noEncontrado("Archivo");
        avisar();
        return json({ archivo: f });
      }
      if (!d && metodo === "DELETE") {
        const url = new URL(req.url);
        const hecho = await borrarParaSiempre(env, acceso, cliente.id, c, { forzar: url.searchParams.get("forzar") === "1" });
        if (!hecho) return noEncontrado("Archivo");
        avisar();
        return json({ ok: true });
      }
      if (!d && metodo === "GET") {
        const f = await acceso.leerUno("estudio_archivos", { id: c, client_id: cliente.id });
        return f ? json({ archivo: archivoPublico(f) }) : noEncontrado("Archivo");
      }
      return error(`Método ${metodo} no permitido aquí`, 405);
    }

    // ---------- La papelera ----------
    if (b === "papelera" && c === "vaciar" && metodo === "POST") {
      const borrados = await vaciarPapelera(env, acceso, cliente.id);
      avisar();
      return json({ borrados });
    }

    // ---------- Las carpetas ----------
    if (b === "carpetas") {
      if (!c && metodo === "POST") {
        const datos = (await cuerpo(req)) ?? {};
        const carpeta = await crearCarpeta(acceso, cliente.id, datos.nombre, { tipo: datos.tipo });
        avisar();
        return json({ carpeta }, 201);
      }
      if (!ID.test(String(c ?? ""))) return noEncontrado("Carpeta");
      if (metodo === "PUT") {
        const datos = (await cuerpo(req)) ?? {};
        // { nombre } renombra; { orden } guarda las piezas de un carrusel o un reel, en orden.
        let carpeta = datos.nombre !== undefined ? await renombrarCarpeta(acceso, cliente.id, c, datos.nombre) : true;
        if (carpeta && datos.orden !== undefined) carpeta = await ordenarCarpeta(acceso, cliente.id, c, datos.orden);
        if (!carpeta || carpeta === true) return noEncontrado("Carpeta");
        avisar();
        return json({ carpeta });
      }
      if (metodo === "DELETE") {
        if (!(await borrarCarpeta(acceso, cliente.id, c))) return noEncontrado("Carpeta");
        avisar();
        return json({ ok: true });
      }
    }

    return noEncontrado("Ruta");
  } catch (e) {
    if (e instanceof ErrorEstudio) return fallo(e);
    // Los de la IA (kit, revisión) traen su estado: sin cuota, sin respuesta a tiempo…
    if (e?.estado) return error(e.message, e.estado);
    throw e;
  }
}
