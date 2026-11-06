// ============================================================
// Crear las IMÁGENES DE FONDO de un video animado (lo puro, en src/lib/fondosVideo.js)
//
// El guion guardado lleva sus fondos por crear (capas `imagen` a sangre con `pide` y sin `archivo`). Aquí se crean por el
// camino de siempre de una pieza: un ENCARGO del servidor (worker/lib/estudio/encargos.js) donde el DIRECTOR de arte
// diseña cada fondo con el kit y el estilo del video de la marca (`kit.estiloVideo`), en 9:16, SIN texto y SIN logo (los
// pone el video encima), con el modelo de imagen del cliente. No hace falta ninguna imagen subida por la agencia.
//
//   · El costo se dice ANTES: sin `confirmado`, 409 `confirmar` con lo que costará; «Crear imágenes sin preguntar» del
//     espacio aplica igual que en toda pieza (una imagen con el modelo del cliente dentro del tope sale directa).
//   · Al CERRARSE el encargo, `ponerFondosEnVideo` le pone su `archivo` a cada capa con su `pide` en el guion GUARDADO, con
//     la versión que se leyó como condición (si otra persona guardó entremedias, se relee una vez). Lo que una persona ya
//     cambió (con su archivo, o con otro `pide`) no se toca, y un video que se está renderizando no se edita (se dice).
//   · Un segundo pedido mientras el primero sigue en marcha: 409 `en_curso` (pagaría dos veces lo mismo).
// ============================================================

import { crearEncargo, encargoPublico } from "./encargos.js";
import { estadoMotores } from "./motores.js";
import { kitDe } from "./kit.js";
import { difundir } from "../vivo.js";
import { topeSinPreguntar } from "../configIA.js";
import { guardarProyecto, ErrorVideo } from "../videosProyectos.js";
import { modeloPorId, modeloPorDefecto, estimar, textoCosto, nombreDelModelo } from "../../../src/lib/estudioCatalogo.js";
import { pedidoDePieza } from "../../../src/lib/pieza.js";
import { ESCENA } from "../../../src/lib/encargos.js";
import { decidirConfirmacion, textoSinPreguntar } from "../../../src/lib/sinPreguntar.js";
import { fondosPendientes, conFondosPuestos, encargoDeFondo } from "../../../src/lib/fondosVideo.js";
// El tope de imágenes por encargo es el de un estilo guardado (16): un guion escrito sin estilo pide como mucho 8 (la IA lo
// corrige), y uno con estilo, una cada N escenas. Antes se cortaba en 8 y un video largo necesitaba dos encargos.
import { TOPE_FONDOS_ESTILO } from "../../../src/lib/estilosVideo.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));

/** El modelo de imagen del cliente: el fijado en su kit si tiene llave; si no, el predeterminado. */
function modeloDelCliente(activos, kit) {
  const fijado = String(kit?.modelos?.imagen ?? "");
  const m = fijado ? modeloPorId(fijado) : null;
  return m && m.tipo === "imagen" && (m.motor === "prueba" || activos[m.motor]) ? m : modeloPorDefecto(activos, "imagen");
}

/** ¿Hay ya un encargo de fondos de este video en marcha? */
async function encargoEnCurso(acceso, clienteId, videoId) {
  const filas = await acceso.leer("estudio_encargos", { client_id: clienteId, estado: "en_marcha" }, "created_at desc", 20).catch(() => []);
  return filas.find((f) => leerJSON(f.datos, {}).fondosVideo?.videoId === videoId) ?? null;
}

/**
 * El plan de los fondos de un video: cada `pide` distinto con su pedido (el MISMO armado que una pieza del director, sin
 * logo y en 9:16) y su costo. → { pendientes, pasos, costo, modelo }. Sin crear nada.
 */
export function planDeFondos(env, cliente, guion) {
  const kit = kitDe(cliente);
  const activos = activosDe(env);
  const modelo = modeloDelCliente(activos, kit);
  const pendientes = fondosPendientes(guion).slice(0, TOPE_FONDOS_ESTILO);
  if (!modelo) return { pendientes, pasos: [], costo: 0, modelo: null };
  let costo = 0;
  let usado = modelo;
  const pasos = pendientes.map((f, i) => {
    // Sin referencias (un fondo no lleva el producto ni el logo) y sin el logo del kit: el video lo pone encima.
    const pedido = pedidoDePieza({
      kit, idea: ESCENA, apoyos: [], modelo, marca: cliente.name, rubro: cliente.industry ?? "", proporcion: "9:16", activos, conLogo: false,
    });
    usado = modeloPorId(pedido.modelo) ?? modelo;
    costo += estimar(usado, 1, pedido.ajustes);
    const encargo = encargoDeFondo(f.pide, { estiloVideo: kit.estiloVideo ?? "", marca: cliente.name });
    return {
      id: `f${i + 1}`, titulo: `Fondo ${i + 1}`, pedido, escena: "",
      // Si el director no responde, la escena sale de lo que pide la capa (y el estilo del video).
      sinMejorar: [f.pide, kit.estiloVideo ? `Estilo: ${String(kit.estiloVideo).replace(/\s+/g, " ").slice(0, 400)}` : "", "Sin ningún texto ni logo."].filter(Boolean).join(" "),
      encargo, mejora: { ...encargo, idea: f.pide, tipo: "imagen", pieza: "" },
      texto: "", controlar: false, navegador: null,
    };
  });
  return { pendientes, pasos, costo, modelo: usado };
}

/**
 * «Crear las imágenes de fondo» de un video guardado. `confirmado`: el sí a lo que cuesta (sin él, y si el espacio no
 * deja crear sin preguntar, 409 `confirmar` con el costo). → { encargo, fondos, costo, sinPreguntar }.
 */
export async function pedirFondos(env, acceso, cliente, fila, { confirmado = false, usuario = null } = {}) {
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine para crear los fondos.", 409);
  const guion = leerJSON(fila.guion, {});
  const total = fondosPendientes(guion).length;
  if (!total) throw new ErrorVideo("Este video no tiene fondos por crear (capas de imagen con «pide» y sin archivo).", 409, { codigo: "sin_fondos" });
  if (await encargoEnCurso(acceso, cliente.id, fila.id)) {
    throw new ErrorVideo("Los fondos de este video ya se están creando: espera a que terminen.", 409, { codigo: "en_curso" });
  }
  const plan = planDeFondos(env, cliente, guion);
  if (!plan.modelo || !plan.pasos.length) throw new ErrorVideo("No hay ningún modelo de imagen con llave (Ajustes → IA).", 409, { codigo: "sin_modelo" });
  const tope = confirmado === true ? 0 : await topeSinPreguntar(acceso);
  const decision = decidirConfirmacion({ tope, costo: plan.costo, tipo: "imagen", siempre: true });
  const base = { fondos: plan.pasos.length, costo: plan.costo, texto: textoCosto(plan.costo), modelo: nombreDelModelo(plan.modelo.id) };
  if (confirmado !== true && decision.preguntar) {
    throw new ErrorVideo(
      `Crear ${plan.pasos.length === 1 ? "la imagen de fondo" : `las ${plan.pasos.length} imágenes de fondo`} cuesta unos ${base.texto} (${base.modelo}). ¿Las creo?`,
      409, { codigo: "confirmar", ...base, ...(total > plan.pasos.length ? { aviso: `Pide ${total} fondos distintos: sólo se crean los ${plan.pasos.length} primeros.` } : {}) },
    );
  }
  const encargo = await crearEncargo(env, acceso, cliente, {
    tipo: "lote", titulo: `Fondos · ${String(fila.titulo ?? "video").slice(0, 100)}`, pasos: plan.pasos, mejorar: true, paralelo: 2,
    fondosVideo: { videoId: fila.id, pides: Object.fromEntries(plan.pasos.map((p, i) => [p.id, plan.pendientes[i].pide])) },
  }, { usuario });
  return { encargo: encargoPublico(encargo), ...base, sinPreguntar: decision.sinPreguntar ? textoSinPreguntar(tope) : null };
}

/**
 * Al cerrarse el encargo: pone el `archivo` de cada fondo que salió en el guion GUARDADO del video (lo llama encargos.js).
 * → { n, aviso? }. Nunca lanza: los fondos ya están en la galería y se pueden poner a mano.
 */
export async function ponerFondosEnVideo(env, acceso, encargo, pasos, datos) {
  const fv = datos?.fondosVideo ?? {};
  const puestos = {};
  for (const p of pasos) {
    const id = p.fase === "hecho" ? (p.finales?.[0] ?? p.opciones?.find((o) => o.id)?.id) : null;
    if (id && fv.pides?.[p.id]) puestos[fv.pides[p.id]] = id;
  }
  if (!Object.keys(puestos).length) return { n: 0, aviso: "No salió ningún fondo." };
  const cliente = await acceso.leerUno("clients", { id: encargo.client_id });
  if (!cliente) return { n: 0 };
  for (let intento = 0; intento < 2; intento++) {
    const video = await acceso.leerUno("videos_proyectos", { id: String(fv.videoId ?? ""), client_id: cliente.id });
    if (!video) return { n: 0, aviso: "El video ya no existe: los fondos quedaron en la galería." };
    if (video.estado === "renderizando") return { n: 0, aviso: "El video se estaba renderizando: los fondos quedaron en la galería." };
    const { guion, n } = conFondosPuestos(leerJSON(video.guion, {}), puestos);
    if (!n) return { n: 0, aviso: "Las capas de fondo ya no estaban (alguien cambió el guion): los fondos quedaron en la galería." };
    try {
      await guardarProyecto(acceso, cliente, video, { guion, version: video.version, por: "Estudio" });
      difundir(env, acceso.ownerId, { tipo: "videos", clienteId: cliente.id, id: video.id, por: { userId: "sistema", nombre: "Estudio", color: "", tab: null } });
      return { n };
    } catch (e) {
      // Otra persona guardó entremedias: se relee una vez y se pone sobre lo suyo.
      if (e instanceof ErrorVideo && e.estado === 409 && intento === 0) continue;
      console.error("fondos: poner en el video", e);
      return { n: 0, aviso: e?.message ?? "No se pudieron poner en el video." };
    }
  }
  return { n: 0, aviso: "Otra persona cambiaba el video: los fondos quedaron en la galería." };
}

/** Lo que la pantalla enseña de los fondos de un video: cuántos faltan y si se están creando. */
export async function estadoDeFondos(env, acceso, cliente, fila) {
  const guion = leerJSON(fila.guion, {});
  const pendientes = fondosPendientes(guion);
  const enCurso = pendientes.length ? await encargoEnCurso(acceso, cliente.id, fila.id) : null;
  const plan = pendientes.length ? planDeFondos(env, cliente, guion) : null;
  return {
    pendientes: pendientes.length, enCurso: enCurso ? encargoPublico(enCurso) : null,
    costo: plan?.costo ?? 0, texto: textoCosto(plan?.costo ?? 0), modelo: plan?.modelo ? nombreDelModelo(plan.modelo.id) : null,
  };
}

