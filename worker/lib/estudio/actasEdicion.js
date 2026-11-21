// ============================================================
// Las ACTAS de las ediciones de videos grabados y las PROPUESTAS de lo que aprende el editor (D1, migración 0083)
//
// Lo puro (las guardas, aplicar una operación exacta, cómo se enseña) está en src/lib/aprendizajeEdicion.js; la
// herramienta, `acta_de_edicion` en herramientasEdicion.js. Aquí sólo lo que toca D1 y lo que aplica:
//   · una propuesta GENERAL cambia el MANUAL DEL EDITOR: una versión nueva (worker/lib/manualEditor.js), con la versión
//     leída como condición, como la pantalla. Sólo quien puede cambiar el manual (admin o editor de toda la agencia).
//   · una DE LA MARCA cambia un campo de texto de un ESTILO DE EDICIÓN del cliente (worker/lib/estudio/estilosEdicion.js);
//     si el cliente aún no tiene estilo para ese tipo de video, se crea con ella.
// Nada se aplica sin el «sí» (quien llama lo comprueba: `confirmado`).
// ============================================================

import { uuid, ahora } from "../ids.js";
import { NULO } from "../acceso.js";
import { versionVigente, guardarVersion } from "../manualEditor.js";
import { estilosEdicionDe, guardarEstiloEdicion } from "./estilosEdicion.js";
import { manualVigente, PARTES_EDITOR, TIPOS_VIDEO_GRABADO } from "../../../src/lib/manualEditor.js";
import { TIPOS_ESTILO_EDICION } from "../../../src/lib/estilosEdicion.js";
import {
  limpiarCorreccion, evaluarCorreccion, aplicarATexto, campoDelEstilo, conCampo, plano, MAX_CORRECCIONES,
} from "../../../src/lib/aprendizajeEdicion.js";

/** Un error de lo pedido. */
export class ErrorActa extends Error {}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };
const PARTES_MANUAL = PARTES_EDITOR.map((p) => p.id);
const TOPE = new Map(PARTES_EDITOR.map((p) => [p.id, p.tope]));
export const nombreDeParte = (id) => PARTES_EDITOR.find((p) => p.id === id)?.nombre ?? id;

/** Quien puede cambiar el manual de toda la agencia (lo mismo que la pantalla del manual). */
export const puedeCambiarManual = (usuario) => usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));

const deFila = (f) => ({
  id: f.id, clientId: f.client_id ?? null, actaId: f.acta_id, destino: f.destino, parte: f.parte, estiloId: f.estilo_id || "",
  operacion: f.operacion, antes: f.antes, texto: f.texto, cita: f.cita, estado: f.estado, motivo: f.motivo, cuando: f.created_at,
});

/** El estilo al que va lo de la marca: el que dice el acta, o el único de ese tipo de video; si no, ninguno (se creará). */
function estiloDestino(cliente, { estiloId = "", tipo = "" }) {
  const estilos = estilosEdicionDe(cliente);
  if (estiloId) return estilos.find((e) => e.id === estiloId) ?? null;
  const delTipo = estilos.filter((e) => e.tipo === tipo);
  return delTipo.length === 1 ? delTipo[0] : estilos.length === 1 && !estilos[0].tipo ? estilos[0] : null;
}

/**
 * Guarda el acta y, de cada corrección, la propuesta que pase las guardas. → { acta, propuestas, descartadas }.
 * `acta`: { tipo, estilo_id?, kit_version?, manual_version?, archivo_id?, resumen? }.
 */
export async function guardarActa(acceso, cliente, usuario, { acta = {}, correcciones = [] } = {}) {
  const tipo = String(acta.tipo ?? "");
  if (!TIPOS_VIDEO_GRABADO.includes(tipo)) throw new ErrorActa(`«acta.tipo»: el tipo de video (${TIPOS_VIDEO_GRABADO.join(", ")}).`);
  if (!Array.isArray(correcciones)) throw new ErrorActa("«correcciones» es una lista (puede ir vacía).");
  if (correcciones.length > MAX_CORRECCIONES) throw new ErrorActa(`Como mucho ${MAX_CORRECCIONES} correcciones por acta: junta las que digan lo mismo.`);
  const estiloId = String(acta.estilo_id ?? "");
  if (estiloId && !estilosEdicionDe(cliente).some((e) => e.id === estiloId)) throw new ErrorActa(`El estilo «${estiloId}» no es de ${cliente.name} (los ids salen de estilo_de_edicion).`);
  const archivoId = acta.archivo_id ? String(acta.archivo_id) : null;
  if (archivoId && !(await acceso.leerUno("estudio_archivos", { id: archivoId, client_id: cliente.id }))) {
    throw new ErrorActa(`El archivo «${archivoId}» no está en la galería de ${cliente.name} (el id sale de confirmar_subida).`);
  }
  const resumen = acta.resumen && typeof acta.resumen === "object" && !Array.isArray(acta.resumen) ? acta.resumen : {};
  if (JSON.stringify(resumen).length > 4000) throw new ErrorActa("El resumen del acta pasa de 4.000 caracteres: deja las medidas y lo que se hizo, no el plan entero.");

  const vigente = await versionVigente(acceso);
  const manual = manualVigente(vigente?.partes ?? {});
  const destinoEstilo = estiloDestino(cliente, { estiloId, tipo });
  const otras = (await acceso.leer("edicion_propuestas", {}, "created_at desc", 400)).map(deFila);
  const pendientes = {
    manual: otras.filter((p) => p.destino === "manual" && p.estado === "pendiente").length,
    estilo: otras.filter((p) => p.destino === "estilo" && p.estado === "pendiente" && p.clientId === cliente.id).length,
  };
  const actaId = uuid();
  const cuando = ahora();
  const limpias = [];
  const descartadas = [];
  const nuevas = [];
  for (const [i, c] of correcciones.entries()) {
    const l = limpiarCorreccion(c, { partesManual: PARTES_MANUAL });
    if (l.error) { descartadas.push({ n: i + 1, motivo: l.error }); continue; }
    limpias.push(l);
    if (l.alcance === "general" && Array.isArray(usuario?.clientes)) {
      descartadas.push({ n: i + 1, motivo: "Una general cambia el manual de toda la agencia: la propone quien la lleva entera. Guárdala como de la marca." });
      continue;
    }
    const textoActual = l.alcance === "general" ? manual[l.parte] ?? "" : campoDelEstilo(destinoEstilo, l.parte);
    const repetidaEn = l.alcance === "general"
      ? new Set(otras.filter((p) => p.clientId && p.clientId !== cliente.id && plano(p.texto) === plano(l.texto)).map((p) => p.clientId)).size
      : 0;
    const r = evaluarCorreccion(l, { textoActual, otras: [...otras, ...nuevas], repetidaEn, pendientes });
    if (r.descartada) { descartadas.push({ n: i + 1, motivo: r.descartada }); continue; }
    const p = {
      id: `pe-${uuid().replace(/-/g, "").slice(0, 10)}`, ...r.propuesta, clientId: r.propuesta.destino === "manual" ? null : cliente.id,
      estiloId: r.propuesta.destino === "estilo" ? destinoEstilo?.id ?? "" : "", estado: "pendiente",
    };
    nuevas.push(p);
    pendientes[p.destino] += 1;
  }

  await acceso.insertar("edicion_actas", {
    id: actaId, client_id: cliente.id, archivo_id: archivoId, tipo, estilo_id: estiloId, kit_version: String(acta.kit_version ?? "").slice(0, 20),
    manual_version: vigente?.version ?? 0, resumen: JSON.stringify(resumen), correcciones: JSON.stringify(limpias), por: usuario?.id ?? null, created_at: cuando,
  });
  for (const p of nuevas) {
    await acceso.insertar("edicion_propuestas", {
      id: p.id, client_id: p.clientId, acta_id: actaId, destino: p.destino, parte: p.parte, estilo_id: p.estiloId, operacion: p.operacion,
      antes: p.antes, texto: p.texto, cita: p.cita, estado: "pendiente", motivo: p.nota ?? "", created_at: cuando,
    });
  }
  return { acta: { id: actaId, tipo, manualVersion: vigente?.version ?? 0 }, propuestas: nuevas, descartadas, estilo: destinoEstilo };
}

/** Las propuestas pendientes: las generales y las de este cliente. */
export async function propuestasPendientes(acceso, cliente) {
  const generales = (await acceso.leer("edicion_propuestas", { estado: "pendiente", client_id: NULO }, "created_at asc", 50)).map(deFila);
  const deMarca = cliente ? (await acceso.leer("edicion_propuestas", { estado: "pendiente", client_id: cliente.id }, "created_at asc", 50)).map(deFila) : [];
  return { generales, deMarca };
}

async function resolver(acceso, id, estado, usuario, motivo = "") {
  await acceso.actualizar("edicion_propuestas", { id }, { estado, motivo: String(motivo).slice(0, 300), resuelta_por: usuario?.id ?? null, resuelta_at: ahora() });
}

/** Leer las propuestas pedidas (de este espacio; las de la marca, de ESTE cliente). */
async function lasPedidas(acceso, cliente, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new ErrorActa("Di qué propuestas (sus ids: [pe-…]).");
  const out = [];
  for (const id of [...new Set(ids.map(String))].slice(0, 20)) {
    const f = await acceso.leerUno("edicion_propuestas", { id });
    if (!f || (f.client_id && f.client_id !== cliente.id)) throw new ErrorActa(`No encuentro la propuesta ${id} (de ${cliente.name} o general).`);
    out.push(deFila(f));
  }
  return out;
}

/** Descarta propuestas pendientes. → [{ id, hecho }] */
export async function descartarPropuestas(acceso, cliente, usuario, ids) {
  const out = [];
  for (const p of await lasPedidas(acceso, cliente, ids)) {
    if (p.estado !== "pendiente") { out.push({ id: p.id, hecho: false, motivo: `ya estaba ${p.estado}` }); continue; }
    if (p.destino === "manual" && !puedeCambiarManual(usuario)) { out.push({ id: p.id, hecho: false, motivo: "las generales las decide quien puede cambiar el manual" }); continue; }
    await resolver(acceso, p.id, "descartada", usuario);
    out.push({ id: p.id, hecho: true });
  }
  return out;
}

/**
 * Aplica propuestas pendientes. Las del manual van JUNTAS en una versión nueva; las de la marca, cada una en su estilo.
 * Lo que ya no se puede aplicar exacto, caduca y se dice. → [{ id, hecho, motivo?, version?, estilo? }]
 */
export async function aplicarPropuestas(env, acceso, cliente, usuario, ids) {
  const pedidas = await lasPedidas(acceso, cliente, ids);
  const out = [];
  const delManual = [];
  for (const p of pedidas) {
    if (p.estado !== "pendiente") out.push({ id: p.id, hecho: false, motivo: `ya estaba ${p.estado}` });
    else if (p.destino === "manual" && !puedeCambiarManual(usuario)) out.push({ id: p.id, hecho: false, motivo: "el manual de toda la agencia lo cambia quien administra o un editor" });
    else if (p.destino === "manual") delManual.push(p);
  }

  // El manual: una versión nueva con todas, sobre la vigente (si otra persona guardó entretanto, se vuelve a leer una vez).
  for (let intento = 0; delManual.length && intento < 2; intento++) {
    const vigente = await versionVigente(acceso);
    const partes = { ...(vigente?.partes ?? {}) };
    const textos = manualVigente(vigente?.partes ?? {});
    const entran = [];
    for (const p of delManual) {
      const r = aplicarATexto(partes[p.parte] ?? textos[p.parte] ?? "", p);
      if (r.caduca) { await resolver(acceso, p.id, "caducada", usuario, r.caduca); out.push({ id: p.id, hecho: false, motivo: `caducó: ${r.caduca}` }); continue; }
      if (r.texto.length > (TOPE.get(p.parte) ?? 2000)) { out.push({ id: p.id, hecho: false, motivo: `no cabe: la parte pasaría de ${TOPE.get(p.parte)} caracteres (acorta otra cosa de esa parte en Ajustes)` }); continue; }
      partes[p.parte] = r.texto;
      entran.push(p);
    }
    delManual.length = 0;
    if (!entran.length) break;
    const r = await guardarVersion(acceso, { partes, leida: vigente?.version ?? 0, motivo: `Lo aprendido de una edición (${entran.map((p) => p.id).join(", ")})`, usuario });
    if (r.choque && intento === 0) { delManual.push(...entran); continue; }
    if (r.choque) { for (const p of entran) out.push({ id: p.id, hecho: false, motivo: "otra persona estaba guardando el manual: vuelve a intentarlo" }); break; }
    const nueva = (await versionVigente(acceso))?.version ?? 0;
    for (const p of entran) { await resolver(acceso, p.id, "aplicada", usuario); out.push({ id: p.id, hecho: true, version: nueva }); }
  }

  // Lo de la marca: cada una en su estilo (el que tenía al proponerse; si ya no está o no había, el del tipo, o uno nuevo).
  for (const p of pedidas.filter((x) => x.destino === "estilo" && x.estado === "pendiente")) {
    const filaCliente = await acceso.leerUno("clients", { id: cliente.id });
    const acta = await acceso.leerUno("edicion_actas", { id: p.actaId });
    const tipo = TIPOS_ESTILO_EDICION.includes(acta?.tipo) ? acta.tipo : undefined;
    const estilo = estiloDestino(filaCliente, { estiloId: estilosEdicionDe(filaCliente).some((e) => e.id === p.estiloId) ? p.estiloId : "", tipo: acta?.tipo })
      ?? { nombre: `${cliente.name} · ${tipo ?? "video grabado"}`.slice(0, 60), ...(tipo ? { tipo } : {}) };
    const r = aplicarATexto(campoDelEstilo(estilo, p.parte), p);
    if (r.caduca) { await resolver(acceso, p.id, "caducada", usuario, r.caduca); out.push({ id: p.id, hecho: false, motivo: `caducó: ${r.caduca}` }); continue; }
    try {
      const g = await guardarEstiloEdicion(env, acceso, filaCliente, conCampo(estilo, p.parte, r.texto));
      await resolver(acceso, p.id, "aplicada", usuario);
      out.push({ id: p.id, hecho: true, estilo: g.estilo.nombre });
    } catch (e) {
      out.push({ id: p.id, hecho: false, motivo: e.message });
    }
  }
  return out;
}

/** Las últimas actas de un cliente (para la guía: lo que se hizo la vez anterior). */
export async function ultimasActas(acceso, cliente, n = 3) {
  return (await acceso.leer("edicion_actas", { client_id: cliente.id }, "created_at desc", n)).map((f) => ({
    id: f.id, tipo: f.tipo, kitVersion: f.kit_version, cuando: f.created_at, resumen: leerJSON(f.resumen, {}), correcciones: leerJSON(f.correcciones, []),
  }));
}
