// ============================================================
// Resultados: lo que se lee de las métricas guardadas
//
//   GET  /api/metricas/clientes/:id?dias=30   Todo lo de un cliente
//   POST /api/metricas/cuentas/:id/actualizar Foto de una cuenta, ya
//   GET  /api/metricas/resumen                La agencia entera, 30 días
//   GET  /api/metricas/miniatura?u=…          La miniatura de una publicación
//
// Los números NO se calculan aquí: se mandan las filas y el navegador
// los resume con `src/lib/resultados.js`, que es puro y tiene sus casos.
// Aquí sólo se acota por espacio, por cliente y por fechas.
//
// LA MINIATURA PASA POR AQUÍ porque la CSP deja `img-src 'self'`: una
// imagen del CDN de Instagram no se pinta. Se sirve sólo desde los CDN
// de Meta, sólo si es imagen, y sin ejecutarse.
// ============================================================

import { json, error, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { fotografiarCuenta, fechaDeFoto } from "../lib/metricas.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CDN_META = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

const salidaSerie = (f) => {
  const datos = leerJSON(f.datos, {});
  return {
    cuentaId: f.cuenta_id, red: f.red, fecha: f.fecha, seguidores: f.seguidores, publicaciones: f.publicaciones,
    alcance: f.alcance, vistas: f.vistas, interacciones: f.interacciones, visitas: f.visitas_perfil,
    ...(datos.error ? { error: datos.error } : {}),
  };
};

const salidaPublicacion = (p, enCalendario) => ({
  id: p.id, cuentaId: p.cuenta_id, red: p.red, tipo: p.tipo, enlace: p.enlace, texto: p.texto,
  miniatura: p.miniatura ? `/api/metricas/miniatura?u=${encodeURIComponent(p.miniatura)}` : "",
  publicadaAt: p.publicada_at, meGusta: p.me_gusta, comentarios: p.comentarios, guardados: p.guardados,
  compartidos: p.compartidos, alcance: p.alcance, vistas: p.vistas, interacciones: p.interacciones,
  ...(enCalendario ? { postId: enCalendario.post_id, calendarId: enCalendario.calendar_id } : {}),
});

export async function rutasMetricas(req, env, { acceso, usuario, partes, metodo }) {
  const [, grupo, id, accion] = partes;
  const url = new URL(req.url);

  if (grupo === "miniatura" && metodo === "GET") {
    let destino;
    try { destino = new URL(url.searchParams.get("u") ?? ""); } catch { return noEncontrado("Imagen"); }
    if (destino.protocol !== "https:" || !CDN_META.test(destino.hostname)) return noEncontrado("Imagen");
    const r = await fetch(destino, { redirect: "follow" }).catch(() => null);
    const tipo = r?.headers.get("content-type") ?? "";
    if (!r?.ok || !/^image\/(jpeg|png|webp|gif)/.test(tipo)) return noEncontrado("Imagen");
    return new Response(r.body, {
      headers: {
        "Content-Type": tipo, "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
      },
    });
  }

  if (grupo === "clientes" && id && metodo === "GET") {
    const cliente = await acceso.leerUno("clients", { id });
    if (!cliente) return noEncontrado("Cliente");
    const dias = Math.min(365, Math.max(7, Number(url.searchParams.get("dias")) || 30));
    const hoy = fechaEnZona();
    // El doble de días: para comparar con el periodo anterior.
    const desdeComparar = sumarDias(hoy, -2 * dias);
    const desde = sumarDias(hoy, -dias);

    const [cuentas, serie, publicaciones, competencia, publicadas] = await Promise.all([
      acceso.leer("cuentas_sociales", { client_id: id }, "red asc"),
      acceso.leer("metricas_cuenta", { client_id: id }, "fecha asc"),
      acceso.leer("metricas_publicacion", { client_id: id }, "publicada_at desc"),
      acceso.leer("metricas_competencia", { client_id: id }, "fecha asc"),
      acceso.leer("publicaciones_programadas", { client_id: id, estado: "publicada" }),
    ]);
    const porExterno = new Map(publicadas.filter((f) => f.externo_id).map((f) => [f.externo_id, f]));

    // La audiencia es la de la foto más reciente que la traiga.
    const audiencia = {};
    for (const f of serie) {
      const a = leerJSON(f.datos, {}).audiencia;
      if (a && Object.keys(a).length) audiencia[f.cuenta_id] = a;
    }

    return json({
      dias,
      desde,
      cuentas: cuentas.filter((c) => c.red !== "tiktok" || c.token_cifrado).map((c) => ({
        id: c.id, red: c.red, nombre: c.nombre, usuario: c.usuario,
      })),
      serie: serie.filter((f) => f.fecha >= desdeComparar).map(salidaSerie),
      publicaciones: publicaciones
        .filter((p) => (p.publicada_at ?? "") >= `${desdeComparar}T00:00:00`)
        .map((p) => salidaPublicacion(p, porExterno.get(p.externo_id))),
      audiencia,
      competencia: competencia.filter((f) => f.fecha >= desdeComparar).map((f) => ({
        usuario: f.usuario, fecha: f.fecha, seguidores: f.seguidores, publicaciones: f.publicaciones,
        interaccionesPromedio: f.interacciones_promedio, datos: leerJSON(f.datos, {}),
      })),
      competidores: leerJSON(cliente.competidores ?? "[]", []),
      ultimaFoto: serie.at(-1)?.fecha ?? null,
    });
  }

  if (grupo === "cuentas" && id && accion === "actualizar" && metodo === "POST") {
    const cuenta = await acceso.leerUno("cuentas_sociales", { id });
    if (!cuenta) return noEncontrado("Cuenta");
    if (!cuenta.client_id) return error("Asigna la cuenta a un cliente antes de medirla.", 409);
    try {
      const fila = await fotografiarCuenta(env, acceso, cuenta, fechaDeFoto());
      difundir(env, acceso.ownerId, { tipo: "metricas", clientId: cuenta.client_id, por: firma(usuario, req) });
      return json({ ok: true, fecha: fila.fecha });
    } catch (e) {
      return error(e.message, 502);
    }
  }

  // La agencia entera: por cliente, seguidores hoy y hace 30 días, y lo
  // que movieron sus publicaciones del último mes.
  if (grupo === "resumen" && metodo === "GET") {
    const hoy = fechaEnZona();
    const hace30 = sumarDias(hoy, -30);
    const [clientes, serie, publicaciones] = await Promise.all([
      acceso.leer("clients", {}, "name asc"),
      acceso.leer("metricas_cuenta", {}, "fecha asc"),
      acceso.leer("metricas_publicacion", {}, "publicada_at desc"),
    ]);
    const salida = [];
    for (const c of clientes) {
      const filas = serie.filter((f) => f.client_id === c.id && f.seguidores !== null);
      if (!filas.length) continue;
      const porCuenta = new Map();
      for (const f of filas) {
        const e = porCuenta.get(f.cuenta_id) ?? { antes: null, ahora: null };
        if (f.fecha <= hace30 || e.antes === null) e.antes = f.seguidores;
        e.ahora = f.seguidores;
        porCuenta.set(f.cuenta_id, e);
      }
      const recientes = publicaciones.filter((p) => p.client_id === c.id && (p.publicada_at ?? "") >= `${hace30}T00:00:00`);
      const alcance = filas.filter((f) => f.fecha > hace30).reduce((a, f) => a + (f.alcance ?? 0), 0);
      salida.push({
        clientId: c.id, nombre: c.name,
        seguidores: [...porCuenta.values()].reduce((a, e) => a + (e.ahora ?? 0), 0),
        seguidoresAntes: [...porCuenta.values()].reduce((a, e) => a + (e.antes ?? 0), 0),
        alcance,
        publicaciones: recientes.length,
        interacciones: recientes.reduce((a, p) => a + (p.interacciones ?? 0), 0),
        ultimaFoto: filas.at(-1).fecha,
      });
    }
    return json({ desde: hace30, clientes: salida });
  }

  return noEncontrado("Ruta");
}
