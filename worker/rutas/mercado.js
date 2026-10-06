// ============================================================
// /api/mercado — el estudio de mercado de cada cliente
//
//   GET    /<cliente>                              Catálogo, estudio aprobado, borrador y referencias
//   PUT    /<cliente>/catalogo                     { catalogo }: guardarlo (y su nota de cifras en el cerebro)
//   POST   /<cliente>/catalogo/proponer            La IA lo PROPONE desde el cerebro (no guarda)
//   POST   /<cliente>/estudio/general              { material }: paso 1, lo general del mercado (con búsqueda web)
//   POST   /<cliente>/estudio/producto             { productoId, material }: un producto o servicio
//   PUT    /<cliente>/estudio/borrador             { borrador }: lo corregido a mano; null lo descarta
//   POST   /<cliente>/estudio/aprobar              Pasa a vigente, va al cerebro y a Drive
//   POST   /<cliente>/referencias                  { archivoId, competidor, enlace, desde, nota }: añadir y analizar
//   POST   /<cliente>/referencias/<id>/analizar    Volver a analizar
//   DELETE /<cliente>/referencias/<id>
//
// El cliente tiene que ser de este espacio (y, si es un colaborador, de los
// suyos): uno ajeno da «no encontrado». Lo que gasta IA lo corta además la
// puerta para quien es de sólo lectura (no es GET).
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import {
  leerMercado, guardarCatalogo, proponerCatalogo, estudiarGeneral, estudiarProducto, guardarBorrador,
  aprobarEstudio, agregarReferencia, reanalizarReferencia, borrarReferencia, ErrorMercado,
} from "../lib/mercado.js";

const ID = /^[\w-]{1,80}$/;

/** Un fallo que se le puede decir a la persona, con su estado; lo demás sigue hacia el 500 genérico. */
function fallo(e) {
  if (e instanceof ErrorMercado || e instanceof ErrorIA) return error(e.message, e.estado ?? 400);
  throw e;
}

export async function rutasMercado(req, env, { acceso, partes, metodo }) {
  const [, clienteId, a, b, c] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  try {
    if (!a && metodo === "GET") return json(await leerMercado(acceso, clienteId));

    if (a === "catalogo" && !b && metodo === "PUT") {
      const d = (await cuerpo(req)) ?? {};
      if (!Array.isArray(d.catalogo)) return error("Falta el catálogo.");
      return json({ catalogo: await guardarCatalogo(env, acceso, cliente, d.catalogo) });
    }
    if (a === "catalogo" && b === "proponer" && metodo === "POST") return json(await proponerCatalogo(env, acceso, cliente));

    if (a === "estudio" && b === "general" && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      return json(await estudiarGeneral(env, acceso, cliente, { material: d.material }));
    }
    if (a === "estudio" && b === "producto" && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      if (!ID.test(String(d.productoId ?? ""))) return error("Falta el producto.");
      return json(await estudiarProducto(env, acceso, cliente, { productoId: String(d.productoId), material: d.material }));
    }
    if (a === "estudio" && b === "borrador" && metodo === "PUT") {
      const d = (await cuerpo(req)) ?? {};
      return json({ borrador: await guardarBorrador(acceso, cliente, d.borrador ?? null) });
    }
    if (a === "estudio" && b === "aprobar" && metodo === "POST") return json(await aprobarEstudio(env, acceso, cliente));

    if (a === "referencias" && !b && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      if (!ID.test(String(d.archivoId ?? ""))) return error("Falta la captura.");
      return json(await agregarReferencia(env, acceso, cliente, d), 201);
    }
    if (a === "referencias" && ID.test(String(b ?? "")) && c === "analizar" && metodo === "POST") {
      return json({ referencia: await reanalizarReferencia(env, acceso, cliente, b) });
    }
    if (a === "referencias" && ID.test(String(b ?? "")) && !c && metodo === "DELETE") {
      return (await borrarReferencia(env, acceso, cliente, b)) ? json({ ok: true }) : noEncontrado("Referencia");
    }
  } catch (e) {
    return fallo(e);
  }

  return noEncontrado("Ruta");
}
