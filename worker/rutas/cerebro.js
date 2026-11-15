// ============================================================
// /api/cerebro — el cerebro de cada cliente
//
//   GET    /<cliente>                    Las notas (sin su texto entero) y el estado
//   GET    /<cliente>/grafo              El mapa: las notas sin texto y sus conexiones (enlaces y menciones)
//   GET    /<cliente>/datos              «Datos que no cuadran»: teléfonos y correos de la ficha, las cifras, la ficha del
//                                        cliente y las memorias que ninguna nota dice (src/lib/datosCerebro.js)
//   GET    /<cliente>/nota/<id>          Una nota entera
//   PUT    /<cliente>/nota               Crear o editar una nota { id?, titulo, texto, tipo, interna }
//   DELETE /<cliente>/nota/<id>          Borrar una nota
//   GET    /<cliente>/buscar?q=&para=    Buscar por pasajes (para: texto | piezas | chat)
//   POST   /<cliente>/contexto           Lo que se le da a la IA para una tarea
//   POST   /<cliente>/texto-ia           El asistente reescribe el texto de { postIds }: no es una corrección
//   GET    /<cliente>/senales            Lo que ha pasado después de escribir (respuestas, resultados, correcciones)
//   POST   /<cliente>/aprender/historial Aprender de las respuestas que el cliente ya dio { desde? }
//   POST   /<cliente>/aprender/metricas  Comparar lo que rindió cada publicación en redes con las demás
//   POST   /<cliente>/aprender/reglas    La IA propone reglas a partir de lo que pasó { forzar? } (gasta)
//   GET    /<cliente>/propuestas         Las reglas que esperan una decisión
//   POST   /<cliente>/propuestas/<id>/aceptar   Aceptarla, con los cambios { titulo?, texto?, interna? }
//   POST   /<cliente>/propuestas/<id>/descartar Descartarla: no se vuelve a proponer
//   POST   /<cliente>/reindexar          Reconstruir el índice desde las notas
//   POST   /<cliente>/importar           Llenar el cerebro desde el repositorio, o ponerlo al día { carpeta?, actualizar?, pisar?,
//                                        auto? } (`auto`: la revisión al abrir la pestaña; no vuelve a GitHub si miró hace poco)
//   GET    /<cliente>/conflictos/<id>    Un conflicto con GitHub con los dos textos (la nota de aquí y la sección de allí)
//   POST   /<cliente>/conflictos         Resolverlos { ids, usar: "mia" | "github" }
//   DELETE /<cliente>/no-traer/<id>      Volver a traer de GitHub una sección que se había borrado aquí
//   POST   /<cliente>/preparar           La IA escribe la ficha técnica y las cifras { forzar? }
//   POST   /<cliente>/rubro              La IA PROPONE la nota «Saber del rubro» (no guarda; se guarda con PUT /nota)
//   POST   /<cliente>/lenguaje           La IA PROPONE la nota «Lenguaje del cliente» { texto?, competencia?, marcas? }: las
//                                        frases exactas de sus clientes (lo pegado, la Bandeja y la encuesta), comprobadas
//                                        por el código (no guarda; se guarda con PUT /nota)
//   GET    /<cliente>/voz-ugc            La nota «Voz UGC» ({ id, texto } o vacía): la lee el guion UGC del panel
//   POST   /<cliente>/voz-ugc            La IA PROPONE la «Voz UGC» desde sus guiones UGC (no guarda)
//
// Todo pasa por `clienteDe()`: el cliente tiene que ser de este espacio y,
// si quien pregunta es un colaborador, de los suyos. Un cliente ajeno da
// «no encontrado», igual que /api/media: no se dice que exista.
//
// Las lecturas son GET a propósito: alguien de sólo lectura puede mirar
// y buscar en el cerebro, que es lo único que este papel hace.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { textoEditado } from "../lib/cerebro/notas.js";
import { guardarNota, ErrorNota } from "../lib/cerebro/guardar.js";
import {
  USOS, leerNotas, leerNotasLigeras, reindexar, actualizarIndice, buscar, contexto, notasViejas, grafo,
} from "../lib/cerebro/cerebro.js";
import {
  sincronizarCerebro, listarConflictos, leerConflicto, resolverConflictos, listarNoTraer, marcarNoTraer, volverATraer,
} from "../lib/cerebro/sincronizar.js";
import { leerEstadoSync } from "../lib/cerebro/estadoSync.js";
import { registrarUsos, marcarTextoDeIA, leerSenales, aprenderDelHistorial, aprenderDeLasMetricas } from "../lib/cerebro/aprender.js";
import { proponerReglas, propuestasPendientes, aceptarPropuesta, descartarPropuesta } from "../lib/cerebro/proponer.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { ErrorRepositorio, enlaceDeArchivo, webDelRepositorio } from "../lib/cerebro/repositorio.js";
import { prepararFicha, ErrorPreparar, fichaDesactualizada } from "../lib/cerebro/preparar.js";
import { proponerRubro } from "../lib/cerebro/rubro.js";
import { proponerLenguaje } from "../lib/cerebro/lenguaje.js";
import { datosQueNoCuadran } from "../../src/lib/datosCerebro.js";
import { proponerVozUgc, vozUgcDe } from "../lib/cerebro/vozUgc.js";

const ID = /^[\w-]{1,80}$/;
const MAX_CONSULTA = 4000;

/** El cliente, si es de este espacio (y de los de esta persona). */
async function clienteDe(acceso, id) {
  if (!ID.test(String(id ?? ""))) return null;
  return acceso.leerUno("clients", { id });
}

/**
 * Una nota como la ve el navegador: sin `owner_id`. La lista trae filas LIGERAS —sin el texto—, con su resumen y su
 * tamaño ya calculados al escribirla; la nota abierta trae el texto y de él sale el tamaño.
 */
const publica = (n, { conTexto = false } = {}) => ({
  id: n.id, ruta: n.ruta, titulo: n.titulo, tipo: n.tipo, origen: n.origen, fuente: n.fuente,
  interna: Boolean(n.interna), corregida: textoEditado(n), caracteres: conTexto ? n.texto.length : n.caracteres, actualizada: n.updated_at, creada: n.created_at,
  ...(conTexto ? { texto: n.texto } : { resumen: n.resumen }),
});

const uso = (v) => (USOS.includes(v) ? v : "texto");

/** Lo que la pantalla enseña de cómo va el cerebro con GitHub (sin el manifiesto entero). */
const sincronia = (e) => ({
  revisadoAt: e.revisadoAt, sincronizadoAt: e.sincronizadoAt, pendientes: e.pendientes, error: e.error,
  fichaPendiente: e.fichaPendiente, fuera: e.fuera, archivos: Object.keys(e.archivos).length,
});

/** Un fallo de GitHub con su estado: 409 si otra sincronización está en marcha, 502 si no. */
const deGitHub = (e) => error(e.message, e.estado ?? 502, e.cause);

export async function rutasCerebro(req, env, { acceso, usuario, partes, metodo }) {
  const [, clienteId, sub, notaId] = partes;
  const cliente = await clienteDe(acceso, clienteId);
  if (!cliente) return noEncontrado("Cliente");
  const url = new URL(req.url);

  // ---------- Las notas y el estado ----------
  if (!sub && metodo === "GET") {
    const [notas, sync, conflictos, noTraer] = await Promise.all([
      leerNotasLigeras(acceso, clienteId), leerEstadoSync(acceso, clienteId), listarConflictos(acceso, clienteId), listarNoTraer(acceso, clienteId),
    ]);
    return json({
      notas: notas.map((n) => publica(n)),
      // Lo que choca con GitHub y lo que no se trae: GUARDADO, para que no dependa de quién pulsó el botón ni de recargar.
      conflictos,
      noTraer: noTraer.map((m) => ({ id: m.id, fuente: m.fuente, titulo: m.titulo, por: m.por, fecha: m.created_at })),
      estado: {
        notas: notas.length,
        caracteres: notas.reduce((s, n) => s + n.caracteres, 0),
        conFicha: notas.some((n) => n.tipo === "ficha"),
        conCifras: notas.some((n) => n.tipo === "cifras"),
        internas: notas.filter((n) => n.interna).length,
        viejas: notasViejas(notas),
        // La ficha y las cifras van en TODO lo que escribe la IA: si alguna nota de la que salen cambió después, lo
        // que llega a la IA es lo de antes (el WhatsApp viejo de ROFER). La pantalla lo dice y ofrece renovarlas.
        fichaVieja: fichaDesactualizada(notas),
        ultima: notas.reduce((m, n) => (n.updated_at > m ? n.updated_at : m), ""),
        // Para que la pantalla sepa si el cliente tiene de dónde llenarlo.
        repositorio: Boolean(cliente.github_repo),
        repoWeb: webDelRepositorio(cliente.github_repo),
        delRepositorio: notas.filter((n) => n.origen === "repositorio").length,
        sync: sincronia(sync),
      },
    });
  }

  if (sub === "grafo" && metodo === "GET") return json(await grafo(env, acceso, clienteId));

  // ---------- «Datos que no cuadran» ----------
  // Sin IA: lo que va SIEMPRE (ficha técnica, cifras, ficha del cliente, memorias del asistente) contra lo que dicen
  // las notas. Las notas internas no cuentan (un teléfono de un proveedor no es el del cliente). El catálogo del estudio
  // de mercado (la nota de cifras que escribe) es la fuente de los precios: un precio de la ficha o de las cifras que no
  // dice no cuadra.
  if (sub === "datos" && metodo === "GET") {
    const [notas, memorias] = await Promise.all([
      leerNotas(acceso, clienteId),
      acceso.leer("client_memories", { client_id: clienteId }, "created_at desc", 100),
    ]);
    const fuentes = [
      ...notas.filter((n) => !n.interna).map((n) => ({
        fuente: n.tipo === "ficha" ? "ficha" : n.tipo === "cifras" ? (n.origen === "mercado" ? "catalogo" : "cifras") : "nota", titulo: n.titulo, texto: n.texto, id: n.id,
      })),
      { fuente: "cliente", titulo: "", texto: [cliente.phone, cliente.whatsapp].filter(Boolean).join("\n") },
      ...memorias.map((m) => ({ fuente: "memoria", titulo: "", texto: m.content, id: m.id })),
    ];
    return json({ datos: datosQueNoCuadran(fuentes) });
  }

  if (sub === "nota" && notaId && metodo === "GET") {
    const nota = await acceso.leerUno("cerebro_notas", { id: notaId, client_id: clienteId });
    if (!nota) return noEncontrado("Nota");
    // «Editar en GitHub»: el canon se cambia allí; lo corregido aquí queda como corrección local y se vigila.
    const github = nota.origen === "repositorio" ? enlaceDeArchivo(cliente.github_repo, nota.fuente) : "";
    return json({ ...publica(nota, { conTexto: true }), ...(github ? { github } : {}) });
  }

  // Crear o editar una nota: la MISMA función que `guardar_en_cerebro` de Claude (worker/lib/cerebro/guardar.js).
  if (sub === "nota" && !notaId && metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    try {
      const { guardada, previa } = await guardarNota(env, acceso, clienteId, b);
      return json(publica(guardada, { conTexto: true }), previa ? 200 : 201);
    } catch (e) {
      if (e instanceof ErrorNota) return e.estado === 404 ? noEncontrado("Nota") : error(e.message, e.estado);
      throw e;
    }
  }

  if (sub === "nota" && notaId && metodo === "DELETE") {
    const nota = await acceso.leerUno("cerebro_notas", { id: notaId, client_id: clienteId });
    if (!nota) return noEncontrado("Nota");
    // Si viene de GitHub, no se vuelve a traer al actualizar (se deshace en «No se traen de GitHub»): antes volvía sola.
    const noTraer = await marcarNoTraer(acceso, clienteId, nota, usuario?.nombre ?? "");
    await acceso.borrar("cerebro_notas", { id: notaId, client_id: clienteId });
    await actualizarIndice(env, acceso, clienteId, nota.ruta, null);
    return json({ ok: true, noTraer });
  }

  // ---------- Buscar y dar contexto ----------
  if (sub === "buscar" && metodo === "GET") {
    const q = String(url.searchParams.get("q") ?? "").slice(0, MAX_CONSULTA).trim();
    if (!q) return error("Falta lo que buscar");
    const n = Math.min(Math.max(Number(url.searchParams.get("n")) || 8, 1), 20);
    return json({ resultados: await buscar(env, acceso, clienteId, q, { para: uso(url.searchParams.get("para") ?? "chat"), n }) });
  }

  if (sub === "contexto" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const consulta = String(b.consulta ?? "").slice(0, MAX_CONSULTA);
    const presupuesto = Math.min(Math.max(Number(b.presupuesto) || 9000, 1000), 20_000);
    const c = await contexto(env, acceso, clienteId, consulta, { para: uso(b.para), presupuesto });
    // La generación dice para qué publicaciones pide esto: se apunta qué notas se le dieron, para saber después a qué
    // nota atribuirle un sí o un no del cliente. Es un apunte: si falla, el contexto sale igual.
    if (Array.isArray(b.postIds) && b.postIds.length && uso(b.para) === "texto") {
      try {
        await registrarUsos(acceso, clienteId, b.postIds, c.fuentes);
      } catch (e) {
        console.error("cerebro: no se pudo apuntar qué notas usó cada publicación", e);
      }
    }
    return json(c);
  }

  // El asistente va a reescribir textos de estas publicaciones: lo que llegue es de la IA, no una corrección.
  if (sub === "texto-ia" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    return json({ marcadas: await marcarTextoDeIA(acceso, clienteId, Array.isArray(b.postIds) ? b.postIds : []) });
  }

  if (sub === "senales" && metodo === "GET") {
    const tipo = String(url.searchParams.get("tipo") ?? "");
    const senales = await leerSenales(acceso, clienteId, { tipo: tipo || null, limite: 60 });
    return json({ senales: senales.map((s) => ({ id: s.id, tipo: s.tipo, postId: s.post_id, resultado: s.resultado, resumen: s.resumen, fecha: s.detalle?.fecha || String(s.updated_at).slice(0, 10) })) });
  }

  if (sub === "propuestas" && !notaId && metodo === "GET") {
    return json({ propuestas: await propuestasPendientes(acceso, clienteId) });
  }

  if (sub === "aprender" && notaId === "reglas" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    try {
      return json(await proponerReglas(env, acceso, cliente, { forzar: Boolean(b.forzar) }));
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado, e.cause);
      throw e;
    }
  }

  if (sub === "propuestas" && notaId && partes[4] === "aceptar" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const r = await aceptarPropuesta(env, acceso, clienteId, notaId, { titulo: b.titulo, texto: b.texto, interna: b.interna });
    return r.error ? error(r.error, r.estado) : json(r, 201);
  }

  if (sub === "propuestas" && notaId && partes[4] === "descartar" && metodo === "POST") {
    const r = await descartarPropuesta(acceso, clienteId, notaId);
    return r.error ? error(r.error, r.estado) : json({ ok: true });
  }

  if (sub === "aprender" && notaId === "metricas" && metodo === "POST") {
    return json(await aprenderDeLasMetricas(acceso, cliente));
  }

  if (sub === "aprender" && notaId === "historial" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    return json(await aprenderDelHistorial(env, acceso, cliente, { desde: b.desde }));
  }

  if (sub === "reindexar" && metodo === "POST") {
    const r = await reindexar(env, acceso, clienteId);
    return json({ ok: true, pasajes: r.ix.N, generado: r.generado });
  }

  // ---------- Llenarlo desde el repositorio y tenerlo al día ----------
  if (sub === "importar" && metodo === "POST") {
    if (!cliente.github_repo) return error("Este cliente no tiene un repositorio de GitHub en su ficha.");
    const b = (await cuerpo(req)) ?? {};
    const pisar = Array.isArray(b.pisar) ? b.pisar.slice(0, 200).map(String) : [];
    try {
      return json(await sincronizarCerebro(env, acceso, cliente, {
        carpeta: String(b.carpeta ?? ""), actualizar: Boolean(b.actualizar || pisar.length || b.auto), pisar, auto: Boolean(b.auto),
        por: usuario ? { userId: usuario.id, nombre: usuario.nombre } : null,
      }));
    } catch (e) {
      if (e instanceof ErrorRepositorio) return deGitHub(e);
      throw e;
    }
  }

  // ---------- Los conflictos con GitHub ----------
  if (sub === "conflictos" && notaId && metodo === "GET") {
    const c = await leerConflicto(acceso, clienteId, notaId);
    if (!c) return noEncontrado("Conflicto");
    return json({ ...c, enlace: enlaceDeArchivo(cliente.github_repo, c.fuente) });
  }
  if (sub === "conflictos" && !notaId && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!["mia", "github"].includes(b.usar)) return error("Di qué versión se queda: «mia» o «github».");
    if (!Array.isArray(b.ids) || !b.ids.length) return error("Faltan los conflictos que resolver.");
    return json(await resolverConflictos(env, acceso, clienteId, b.ids, b.usar));
  }

  // ---------- Lo que no se trae de GitHub ----------
  if (sub === "no-traer" && notaId && metodo === "DELETE") {
    try {
      const r = await volverATraer(env, acceso, cliente, notaId, { por: usuario ? { userId: usuario.id, nombre: usuario.nombre } : null });
      return r ? json(r) : noEncontrado("Marca");
    } catch (e) {
      if (e instanceof ErrorRepositorio) return deGitHub(e);
      throw e;
    }
  }

  // ---------- «Voz UGC»: cómo habla esta marca en sus videos (la IA la propone; se guarda con PUT /nota) ----------
  if (sub === "voz-ugc" && metodo === "GET") return json((await vozUgcDe(env, acceso, clienteId)) ?? { id: null, texto: "" });
  if (sub === "voz-ugc" && metodo === "POST") {
    try {
      return json(await proponerVozUgc(env, acceso, cliente));
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado ?? 502, e.cause);
      throw e;
    }
  }

  // ---------- «Saber del rubro»: la IA la PROPONE (la persona la guarda con PUT /nota) ----------
  if (sub === "rubro" && metodo === "POST") {
    try {
      return json(await proponerRubro(env, acceso, cliente));
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado ?? 502, e.cause);
      throw e;
    }
  }

  // ---------- «Lenguaje del cliente»: la IA la PROPONE y el código comprueba cada frase (se guarda con PUT /nota) ----------
  if (sub === "lenguaje" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    try {
      return json(await proponerLenguaje(env, acceso, cliente, {
        texto: String(b.texto ?? ""), competencia: String(b.competencia ?? ""), marcas: String(b.marcas ?? "").slice(0, 2000),
      }));
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado ?? 502, e.cause);
      throw e;
    }
  }

  // ---------- La ficha técnica y las cifras, escritas por la IA ----------
  if (sub === "preparar" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    try {
      return json(await prepararFicha(env, acceso, cliente, { forzar: Boolean(b.forzar) }));
    } catch (e) {
      if (e instanceof ErrorPreparar) return error(e.message, e.estado, e.cause);
      throw e;
    }
  }

  return noEncontrado("Ruta");
}
