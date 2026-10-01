// ============================================================
// Biblioteca de anuncios de Meta
//
//   GET    /api/biblioteca                    Si Meta está conectado + los filtros guardados
//   GET    /api/biblioteca/buscar?c=<json>&after=<cursor>&pagina=<n>
//                                            Una búsqueda: UNA llamada a /ads_archive
//   POST   /api/biblioteca/filtros            { nombre, clientId?, consulta }
//   PATCH  /api/biblioteca/filtros/:id        { nombre?, clientId?, consulta? }
//   DELETE /api/biblioteca/filtros/:id
//
// Buscar es un GET a propósito: no cambia nada, así que también puede
// buscar quien tiene papel de sólo lectura (worker/index.js corta todo lo
// que no es GET para ese papel). Guardar, renombrar y borrar filtros, no.
//
// Relanzar un filtro es cosa del navegador: carga su consulta y busca.
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { uuid, ahora } from "../lib/ids.js";
import { metaConfigurado } from "../lib/meta.js";
import { buscarAnuncios, ErrorBiblioteca } from "../lib/biblioteca.js";
import { normalizarConsulta, filtroDeFila } from "../../src/lib/biblioteca.js";

const nombreLimpio = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** El cliente de un filtro: null (de la agencia) o uno de este espacio. `undefined` si no existe. */
async function clienteDelFiltro(acceso, clientId) {
  if (clientId === null || clientId === undefined || clientId === "") return null;
  const c = await acceso.leerUno("clients", { id: String(clientId) });
  return c ? c.id : undefined;
}

/** La consulta de un filtro: guardable si se puede buscar con ella. */
function consultaGuardable(entrada) {
  const { consulta, errores } = normalizarConsulta(entrada);
  if (errores.length) throw new ErrorBiblioteca(errores.join(" "));
  return consulta;
}

export async function rutasBiblioteca(req, env, { acceso, usuario, partes, metodo }) {
  const [, grupo, id] = partes;
  const avisar = () => difundir(env, acceso.ownerId, { tipo: "biblioteca", por: firma(usuario, req) });

  try {
    if (!grupo && metodo === "GET") {
      const fila = metaConfigurado(env) ? await acceso.leerUno("integracion_meta", { id: acceso.ownerId }) : null;
      const filtros = await acceso.leer("biblioteca_filtros", {}, "nombre collate nocase asc");
      return json({
        meta: { configurado: metaConfigurado(env), conectado: Boolean(fila), nombre: fila?.nombre ?? "" },
        filtros: filtros.map(filtroDeFila),
      });
    }

    if (grupo === "buscar" && !id && metodo === "GET") {
      const url = new URL(req.url);
      let entrada;
      try { entrada = JSON.parse(url.searchParams.get("c") ?? "{}"); } catch { return error("La búsqueda no se entiende."); }
      return json(await buscarAnuncios(env, acceso, entrada, {
        after: url.searchParams.get("after") ?? "",
        pagina: url.searchParams.get("pagina") ?? 1,
      }));
    }

    if (grupo === "filtros" && !id && metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const nombre = nombreLimpio(b.nombre);
      if (!nombre) return error("Ponle un nombre al filtro.");
      const clientId = await clienteDelFiltro(acceso, b.clientId);
      if (clientId === undefined) return noEncontrado("Cliente");
      const consulta = consultaGuardable(b.consulta);
      const momento = ahora();
      const fila = await acceso.insertar("biblioteca_filtros", {
        id: uuid(), client_id: clientId, nombre, consulta: JSON.stringify(consulta),
        creado_por: usuario.id, created_at: momento, updated_at: momento,
      });
      avisar();
      return json(filtroDeFila(fila), 201);
    }

    if (grupo === "filtros" && id) {
      const fila = await acceso.leerUno("biblioteca_filtros", { id });
      if (!fila) return noEncontrado("Filtro");

      if (metodo === "DELETE") {
        await acceso.borrar("biblioteca_filtros", { id });
        avisar();
        return sinContenido();
      }

      if (metodo === "PATCH") {
        const b = (await cuerpo(req)) ?? {};
        const cambios = { updated_at: ahora() };
        if ("nombre" in b) {
          const nombre = nombreLimpio(b.nombre);
          if (!nombre) return error("Ponle un nombre al filtro.");
          cambios.nombre = nombre;
        }
        if ("clientId" in b) {
          const clientId = await clienteDelFiltro(acceso, b.clientId);
          if (clientId === undefined) return noEncontrado("Cliente");
          // Un colaborador no puede sacar un filtro a un cliente que no lleva (ni dejarlo sin cliente).
          if (acceso.clientes && !acceso.clientes.includes(String(clientId))) return error("No tienes acceso a ese cliente.", 403);
          cambios.client_id = clientId;
        }
        if ("consulta" in b) cambios.consulta = JSON.stringify(consultaGuardable(b.consulta));
        await acceso.actualizar("biblioteca_filtros", { id }, cambios);
        avisar();
        return json(filtroDeFila({ ...fila, ...cambios }));
      }
    }
  } catch (e) {
    if (e instanceof ErrorBiblioteca) return error(e.message, e.estado);
    throw e;
  }

  return noEncontrado("Ruta");
}
