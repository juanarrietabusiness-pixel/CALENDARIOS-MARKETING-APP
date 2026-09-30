// ============================================================
// /api/cerebro — el cerebro de cada cliente
//
//   GET    /<cliente>                    Las notas (sin su texto entero) y el estado
//   GET    /<cliente>/grafo              El mapa: las notas sin texto y sus conexiones (enlaces y menciones)
//   GET    /<cliente>/nota/<id>          Una nota entera
//   PUT    /<cliente>/nota               Crear o editar una nota { id?, titulo, texto, tipo, interna }
//   DELETE /<cliente>/nota/<id>          Borrar una nota
//   GET    /<cliente>/buscar?q=&para=    Buscar por pasajes (para: texto | piezas | chat)
//   POST   /<cliente>/contexto           Lo que se le da a la IA para una tarea
//   GET    /<cliente>/senales            Lo que ha pasado después de escribir (respuestas, resultados, correcciones)
//   POST   /<cliente>/aprender/historial Aprender de las respuestas que el cliente ya dio { desde? }
//   POST   /<cliente>/aprender/metricas  Comparar lo que rindió cada publicación en redes con las demás
//   POST   /<cliente>/aprender/reglas    La IA propone reglas a partir de lo que pasó { forzar? } (gasta)
//   GET    /<cliente>/propuestas         Las reglas que esperan una decisión
//   POST   /<cliente>/propuestas/<id>/aceptar   Aceptarla, con los cambios { titulo?, texto?, interna? }
//   POST   /<cliente>/propuestas/<id>/descartar Descartarla: no se vuelve a proponer
//   POST   /<cliente>/reindexar          Reconstruir el índice desde las notas
//   POST   /<cliente>/importar           Llenar el cerebro desde el repositorio { carpeta?, actualizar? }
//   POST   /<cliente>/preparar           La IA escribe la ficha técnica y las cifras { forzar? }
//
// Todo pasa por `clienteDe()`: el cliente tiene que ser de este espacio y,
// si quien pregunta es un colaborador, de los suyos. Un cliente ajeno da
// «no encontrado», igual que /api/media: no se dice que exista.
//
// Las lecturas son GET a propósito: alguien de sólo lectura puede mirar
// y buscar en el cerebro, que es lo único que este papel hace.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { limpiarNota, derivados, slug, rutaUnica, MAX_NOTAS_POR_CLIENTE } from "../lib/cerebro/notas.js";
import {
  USOS, leerNotasLigeras, reindexar, actualizarIndice, buscar, contexto, notasViejas, grafo,
} from "../lib/cerebro/cerebro.js";
import { importarDelRepositorio } from "../lib/cerebro/importar.js";
import { registrarUsos, leerSenales, aprenderDelHistorial, aprenderDeLasMetricas } from "../lib/cerebro/aprender.js";
import { proponerReglas, propuestasPendientes, aceptarPropuesta, descartarPropuesta } from "../lib/cerebro/proponer.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { ErrorRepositorio } from "../lib/cerebro/repositorio.js";
import { prepararFicha, ErrorPreparar } from "../lib/cerebro/preparar.js";

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
  interna: Boolean(n.interna), caracteres: conTexto ? n.texto.length : n.caracteres, actualizada: n.updated_at, creada: n.created_at,
  ...(conTexto ? { texto: n.texto } : { resumen: n.resumen }),
});

const uso = (v) => (USOS.includes(v) ? v : "texto");

export async function rutasCerebro(req, env, { acceso, partes, metodo }) {
  const [, clienteId, sub, notaId] = partes;
  const cliente = await clienteDe(acceso, clienteId);
  if (!cliente) return noEncontrado("Cliente");
  const url = new URL(req.url);

  // ---------- Las notas y el estado ----------
  if (!sub && metodo === "GET") {
    const notas = await leerNotasLigeras(acceso, clienteId);
    return json({
      notas: notas.map((n) => publica(n)),
      estado: {
        notas: notas.length,
        caracteres: notas.reduce((s, n) => s + n.caracteres, 0),
        conFicha: notas.some((n) => n.tipo === "ficha"),
        conCifras: notas.some((n) => n.tipo === "cifras"),
        internas: notas.filter((n) => n.interna).length,
        viejas: notasViejas(notas),
        ultima: notas.reduce((m, n) => (n.updated_at > m ? n.updated_at : m), ""),
        // Para que la pantalla sepa si el cliente tiene de dónde llenarlo.
        repositorio: Boolean(cliente.github_repo),
      },
    });
  }

  if (sub === "grafo" && metodo === "GET") return json(await grafo(env, acceso, clienteId));

  if (sub === "nota" && notaId && metodo === "GET") {
    const nota = await acceso.leerUno("cerebro_notas", { id: notaId, client_id: clienteId });
    return nota ? json(publica(nota, { conTexto: true })) : noEncontrado("Nota");
  }

  if (sub === "nota" && !notaId && metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const { nota, error: motivo } = limpiarNota(b);
    if (motivo) return error(motivo);

    let previa = null;
    let ruta;
    if (b.id) {
      previa = await acceso.leerUno("cerebro_notas", { id: String(b.id), client_id: clienteId });
      if (!previa) return noEncontrado("Nota");
      ruta = previa.ruta; // los [[enlaces]] de otras notas dependen de ella: no cambia al editar
    } else {
      // Sólo las rutas: para repartir una libre y contar. El texto de cada nota no hace falta para eso.
      const existentes = await acceso.leerColumnas("cerebro_notas", ["ruta"], { client_id: clienteId });
      if (existentes.length >= MAX_NOTAS_POR_CLIENTE) {
        return error(`Este cliente ya tiene ${MAX_NOTAS_POR_CLIENTE} notas. Borra las que no sirvan antes de añadir más.`, 409);
      }
      ruta = rutaUnica(slug(nota.titulo), new Set(existentes.map((n) => n.ruta)));
    }

    const t = ahora();
    const fila = {
      id: previa?.id ?? uuid(), client_id: clienteId, ruta, ...nota, ...derivados(nota.texto),
      // De dónde salió una nota no lo cambia quien la edita: sin esto, corregir una nota importada le borraba el
      // origen y el archivo, y una nueva importación ya no la reconocía como suya.
      origen: previa?.origen ?? nota.origen,
      fuente: previa?.fuente ?? nota.fuente,
      // De qué versión del archivo salió (si salió de uno): no cambia al editar. Que la nota se tocó lo dice
      // su `updated_at`, y es lo que mira una nueva importación para no pisarla.
      fuente_sha: previa?.fuente_sha ?? "",
      created_at: previa?.created_at ?? t, updated_at: t,
    };
    // Que una nota está «editada a mano» se sabe porque su `updated_at` ya no es su `created_at` (importar.js, preparar.js
    // y las notas automáticas lo miran para no pisarla). Por eso:
    //   · una nota NUEVA entra con `insertar`, que respeta las dos fechas, iguales: con `guardar`, `updated_at` salía un
    //     milisegundo después y una nota sin tocar parecía editada;
    //   · una EDICIÓN queda siempre ESTRICTAMENTE después de la creación, aunque caiga en el mismo milisegundo: sin eso,
    //     corregir una nota recién escrita la dejaba «sin tocar» y la siguiente importación la pisaba. Se escribe con
    //     `actualizar`, que no vuelve a fechar (`guardar` sí).
    // Lo que se indexa es lo que quedó en D1: por eso `guardada` lleva la fecha que se escribió, no `t`.
    let guardada;
    if (previa) {
      const editada = new Date(Math.max(Date.now(), Date.parse(previa.created_at) + 1)).toJSON();
      const { id: _id, client_id: _cliente, created_at: _creada, ...cambios } = { ...fila, updated_at: editada };
      await acceso.actualizar("cerebro_notas", { id: previa.id, client_id: clienteId }, cambios);
      guardada = { ...fila, updated_at: editada };
    } else {
      guardada = await acceso.insertar("cerebro_notas", fila);
    }
    await actualizarIndice(env, acceso, clienteId, ruta, guardada);
    return json(publica(guardada, { conTexto: true }), previa ? 200 : 201);
  }

  if (sub === "nota" && notaId && metodo === "DELETE") {
    const nota = await acceso.leerUno("cerebro_notas", { id: notaId, client_id: clienteId });
    if (!nota) return noEncontrado("Nota");
    await acceso.borrar("cerebro_notas", { id: notaId, client_id: clienteId });
    await actualizarIndice(env, acceso, clienteId, nota.ruta, null);
    return json({ ok: true });
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

  // ---------- Llenarlo desde el repositorio ----------
  if (sub === "importar" && metodo === "POST") {
    if (!cliente.github_repo) return error("Este cliente no tiene un repositorio de GitHub en su ficha.");
    const b = (await cuerpo(req)) ?? {};
    try {
      return json(await importarDelRepositorio(env, acceso, cliente, { carpeta: String(b.carpeta ?? ""), actualizar: Boolean(b.actualizar) }));
    } catch (e) {
      if (e instanceof ErrorRepositorio) return error(e.message, 502, e.cause);
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
