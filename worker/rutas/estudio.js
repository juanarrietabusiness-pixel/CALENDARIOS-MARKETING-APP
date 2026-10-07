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
//   POST   /<cliente>/mejorar                      { idea, tipo }: la IA devuelve la idea más clara (texto)
//   POST   /<cliente>/guion-corto                  { idea, segundos, post? }: guion de un video de 8 o 10 s (texto)
//   PUT    /<cliente>/kit                          { kit }: guarda el kit de marca (paleta, presets, logo…)
//   POST   /<cliente>/kit/preparar                 La IA PROPONE el kit desde el cerebro (no guarda)
//   POST   /<cliente>/revisar                      { archivoId } o { clave }: la IA mira la imagen contra el kit
//   POST   /<cliente>/archivos                     Subir a mano (multipart: archivo, carpetaId?)
//   POST   /<cliente>/archivos/<id>/cambiar        { favorito?, carpetaId? }
//   POST   /<cliente>/archivos/<id>/uso            { calendarId, postId }: lo usa una publicación
//   POST   /<cliente>/archivos/<id>/papelera       A la papelera
//   POST   /<cliente>/archivos/<id>/recuperar      De la papelera
//   DELETE /<cliente>/archivos/<id>?forzar=1       Borrar del todo (sólo desde la papelera)
//   POST   /<cliente>/papelera/vaciar
//   POST   /<cliente>/carpetas                     { nombre }
//   PUT    /<cliente>/carpetas/<id>                { nombre }
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

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { firma, difundir } from "../lib/vivo.js";
import { estadoMotores } from "../lib/estudio/motores.js";
import { mejorarIdea } from "../lib/estudio/prompt.js";
import { guionCorto } from "../lib/estudio/guionCorto.js";
import { kitDe, guardarKit, prepararKit, revisarPieza } from "../lib/estudio/kit.js";
import { leerMercado } from "../lib/mercado.js";
import { angulosDeAnuncio } from "../../src/lib/estudioMercado.js";
import {
  crearTrabajo, avanzarTrabajo, cancelarTrabajo, reintentarTrabajo, trabajoPublico, ErrorEstudio,
} from "../lib/estudio/trabajos.js";
import {
  leerGaleria, subirArchivo, cambiarArchivo, marcarUso, enviarAPapelera, recuperar, borrarParaSiempre,
  vaciarPapelera, crearCarpeta, renombrarCarpeta, borrarCarpeta, archivoPublico,
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
      if (c === "preparar" && metodo === "POST") return json(await prepararKit(env, acceso, cliente));
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
        const archivo = await subirArchivo(env, acceso, cliente, form?.get("archivo"), { carpetaId: form?.get("carpetaId") || null });
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
        const carpeta = await crearCarpeta(acceso, cliente.id, datos.nombre);
        avisar();
        return json({ carpeta }, 201);
      }
      if (!ID.test(String(c ?? ""))) return noEncontrado("Carpeta");
      if (metodo === "PUT") {
        const datos = (await cuerpo(req)) ?? {};
        const carpeta = await renombrarCarpeta(acceso, cliente.id, c, datos.nombre);
        if (!carpeta) return noEncontrado("Carpeta");
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
