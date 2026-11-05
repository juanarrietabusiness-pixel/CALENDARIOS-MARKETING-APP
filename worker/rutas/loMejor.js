// ============================================================
// /api/lo-mejor — «Lo mejor del momento»
//
//   GET  /?ventana=semana|mes|nuevo&cliente=&red=&formato=&tipo=&fuente=&pieza=
//                               Lo mejor de la ventana, ordenado (percentil dentro de su fuente)
//   POST /clasificar            { claves? }: la IA clasifica unas pocas piezas sin tipo (barata, una vez por pieza)
//   POST /recrear               { clave, clienteId, camino?, productoId?, confirmado }: crea la publicación en el
//                               próximo día libre con el original de REFERENCIA y lanza lo que la crea. Sin
//                               `confirmado: true`, 409 «confirmar» con el costo y el día
//   POST /traer                 { clave, clienteId, miniatura? }: el archivo del original a la galería del cliente
//                               (para «Extraer guion», «Fórmula»…); lo ya bajado no se baja otra vez
//   POST /claude                { clave, clienteId, recetaId? }: «Crear con Claude» con la pieza de referencia
//   GET  /creditos              El tope de créditos de Scrape Creators por semana, lo gastado y lo que ESPERA su
//                               lectura (cuentas de TikTok, palabras de tendencia, anuncios)
//   PUT  /creditos              { tope?, tendencias? }: el tope y el interruptor de las tendencias de TikTok; sólo
//                               quien administra
//   POST /anuncios              Releer YA los anuncios de las búsquedas guardadas (dentro del tope)
//   GET  /video?u=              El video de una pieza del CDN de Meta, por trozos (la CSP no deja verlo de fuera)
//
// Todo pasa por la capa de acceso: un colaborador sólo ve lo de sus clientes (la inspiración, las métricas y los
// anuncios llevan su cliente). Lo que no es GET lo corta la puerta para quien es de sólo lectura.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { scConfigurado } from "../lib/scrapeCreators.js";
import { crearHandoff } from "../lib/recetas.js";
import { recetasDelEspacio } from "../lib/recetas.js";
import {
  loMejor, clasificarPendientes, recrear, traerArchivo, piezasDelEspacio, creditosDeLaSemana, guardarTope, releerAnuncios, esperaDelEspacio,
  ErrorLoMejor,
} from "../lib/loMejor.js";
import { videoPermitido, cifraDe, nombreDelTipo } from "../../src/lib/loMejor.js";
import { esDeTikTok } from "../../src/lib/scrapeCreators.js";

const ID = /^[\w-]{1,80}$/;
const CLAVE = /^[\w:.-]{3,120}$/;
const MAX_VIDEO = 80 * 1024 * 1024;

function fallo(e) {
  if (e instanceof ErrorLoMejor) {
    const { estado, message, ...extra } = e;
    return json({ error: message, ...extra }, estado ?? 400);
  }
  throw e;
}

/**
 * El video de una pieza (sólo del CDN de Meta o de TikTok), pasando el `Range` del navegador: sin trozos, el iPhone no
 * lo reproduce. A TikTok se le pide como lo pediría su web (sin eso, su CDN suele negarse).
 */
async function servirVideo(req, url) {
  const u = url.searchParams.get("u") ?? "";
  if (!videoPermitido(u)) return noEncontrado("Video");
  const cabeceras = esDeTikTok(u) ? { Referer: "https://www.tiktok.com/", "User-Agent": "Mozilla/5.0 (compatible; JuancitoAdsCalendario/1.0)" } : {};
  const rango = req.headers.get("range");
  if (rango && /^bytes=\d*-\d*$/.test(rango)) cabeceras.Range = rango;
  const r = await fetch(u, { headers: cabeceras, redirect: "follow" }).catch(() => null);
  const tipo = (r?.headers.get("content-type") ?? "").split(";")[0];
  if (!r || !(r.status === 200 || r.status === 206) || !/^video\/(mp4|quicktime|webm)$/.test(tipo)) {
    return error("El video ya no está disponible (Meta y TikTok caducan sus direcciones): ábrelo en su red.", 404);
  }
  const largo = Number(r.headers.get("content-length") ?? 0);
  if (largo > MAX_VIDEO) return error("El video es demasiado grande para verlo aquí.", 413);
  const salida = new Headers({
    "Content-Type": tipo, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox", "Accept-Ranges": "bytes",
  });
  for (const k of ["content-length", "content-range"]) if (r.headers.get(k)) salida.set(k, r.headers.get(k));
  return new Response(r.body, { status: r.status, headers: salida });
}

export async function rutasLoMejor(req, env, { acceso, usuario, partes, metodo }) {
  const [, accion] = partes;
  const url = new URL(req.url);

  try {
    if (!accion && metodo === "GET") {
      const q = (k) => String(url.searchParams.get(k) ?? "").slice(0, 120);
      const cliente = q("cliente");
      if (cliente && (!ID.test(cliente) || !(await acceso.leerUno("clients", { id: cliente })))) return noEncontrado("Cliente");
      const r = await loMejor(env, acceso, {
        ventana: q("ventana"), cliente, red: q("red"), formato: q("formato"), tipo: q("tipo"), fuente: q("fuente"),
        pieza: CLAVE.test(q("pieza")) ? q("pieza") : "",
      });
      return json({ ...r, sc: scConfigurado(env) });
    }

    if (accion === "video" && metodo === "GET") return await servirVideo(req, url);

    if (accion === "clasificar" && metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const claves = Array.isArray(b.claves) ? b.claves.map(String).filter((c) => CLAVE.test(c)).slice(0, 12) : null;
      const cliente = typeof b.clienteId === "string" && ID.test(b.clienteId) ? b.clienteId : "";
      return json(await clasificarPendientes(env, acceso, { claves, cliente }));
    }

    if (accion === "recrear" && metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      if (!CLAVE.test(String(b.clave ?? ""))) return error("Falta la pieza.");
      const r = await recrear(env, acceso, usuario, {
        clave: String(b.clave), clienteId: String(b.clienteId ?? ""), camino: String(b.camino ?? ""),
        productoId: typeof b.productoId === "string" ? b.productoId.slice(0, 80) : "", confirmado: b.confirmado === true,
      });
      return json(r, 201);
    }

    if ((accion === "traer" || accion === "claude") && metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const cliente = ID.test(String(b.clienteId ?? "")) ? await acceso.leerUno("clients", { id: String(b.clienteId) }) : null;
      if (!cliente) return noEncontrado("Cliente");
      const p = (await piezasDelEspacio(env, acceso, { sinFecha: true })).find((x) => x.clave === String(b.clave ?? ""));
      if (!p) return noEncontrado("Pieza");
      const archivo = await traerArchivo(env, acceso, cliente, p, { miniatura: b.miniatura === true }).catch((e) => {
        if (accion === "claude") return null; // Claude puede trabajar con el enlace y la idea
        throw e;
      });
      if (accion === "traer") {
        if (!archivo) return error(p.red === "youtube" ? "YouTube no deja bajar sus videos: su guion se saca por el enlace." : "No hay archivo que traer de esta pieza.", 409);
        return json({ archivo }, 201);
      }
      const recetas = await recetasDelEspacio(acceso);
      const receta = recetas.find((x) => x.id === String(b.recetaId || "recrear-referencia")) ?? recetas.find((x) => x.id === "recrear-referencia");
      if (!receta) return noEncontrado("Receta");
      const cifra = cifraDe(p);
      const r = await crearHandoff(acceso, usuario, receta, {
        clienteId: cliente.id,
        referencias: archivo?.id ? [archivo.id] : [],
        referencia: { enlace: p.enlace ?? "", cuenta: p.cuenta ?? "", cifra: [cifra.texto, cifra.detalle].filter(Boolean).join(" · "), tipo: nombreDelTipo(p), idea: p.idea ?? "", texto: p.texto ?? "" },
        indicacion: `Recrear para ${cliente.name} esta pieza de «Lo mejor» (${cifra.texto}): la misma idea con su marca, sin copiarla.`,
      });
      if (r.error) return error(r.error, r.estado ?? 400);
      return json(r, 201);
    }

    if (accion === "creditos") {
      if (metodo === "GET") return json({ ...(await creditosDeLaSemana(acceso)), espera: await esperaDelEspacio(acceso), sc: scConfigurado(env) });
      if (metodo === "PUT") {
        if (usuario?.rol !== "admin") return error("Sólo quien administra cambia el tope de créditos.", 403);
        const b = (await cuerpo(req)) ?? {};
        if (b.tope === undefined && typeof b.tendencias !== "boolean") return error("Falta qué cambiar.");
        const r = await guardarTope(acceso, b.tope, typeof b.tendencias === "boolean" ? { tendencias: b.tendencias } : {});
        difundir(env, acceso.ownerId, { tipo: "lo-mejor", que: "creditos", por: firma(usuario, req) });
        return json({ ...r, espera: await esperaDelEspacio(acceso), sc: scConfigurado(env) });
      }
    }

    if (accion === "anuncios" && metodo === "POST") return json(await releerAnuncios(env, acceso, { fuente: "manual" }));
  } catch (e) {
    return fallo(e);
  }
  return noEncontrado("Ruta");
}
