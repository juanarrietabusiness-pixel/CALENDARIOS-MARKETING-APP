// ============================================================
// El CONTEXTO común de todo guion de video (lo puro, en src/lib/guionVideo.js)
//
// Lo que cada generador de guion juntaba por su cuenta (worker/lib/estudio/reel.js, guionCorto.js, guionAnimado.js y
// director.js), en UNA función: el producto con su precio EXACTO del catálogo, el cerebro para escribir (nunca lo
// interno), el criterio comercial de la agencia y la publicación de la que sale (con el guion que YA tiene, que el
// nuevo sigue). Cada parte que falla se queda vacía: un guion sale igual sin catálogo o sin cerebro.
// ============================================================

import { contexto as contextoCerebro, textoParaEscribir } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { criterioDelEspacio } from "./director.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** La publicación del cliente por su id, en cualquiera de sus meses → el post o null. */
export async function publicacionDelGuion(acceso, clienteId, postId) {
  if (!postId) return null;
  const cals = await acceso.leerColumnas("calendars", ["id", "days"], { client_id: clienteId });
  for (const cal of cals) {
    for (const d of leerJSON(cal.days, []) ?? []) {
      const p = (d?.posts ?? []).find((x) => x?.id === postId);
      if (p) return p;
    }
  }
  return null;
}

/**
 * → { producto (la línea del catálogo, sin la viñeta), productoFila, contexto, criterio, post, guionPost }.
 * `productoId` (o el nombre `producto`), `consulta` (lo que se busca en el cerebro), `postId` (la publicación),
 * `guionPost` (el guion que manda la pantalla: gana sobre el de la publicación guardada), `criterio` (false: sin él).
 */
export async function contextoDeGuion(env, acceso, cliente, { productoId = "", producto = "", consulta = "", postId = "", guionPost = "", criterio = true, presupuesto = 3000 } = {}) {
  const [mercado, cerebro, linea, post] = await Promise.all([
    productoId || producto ? leerMercado(acceso, cliente.id).catch(() => null) : null,
    consulta ? contextoCerebro(env, acceso, cliente.id, consulta, { para: "texto", presupuesto }).catch(() => null) : null,
    criterio ? criterioDelEspacio(acceso).catch(() => "") : "",
    postId ? publicacionDelGuion(acceso, cliente.id, String(postId)).catch(() => null) : null,
  ]);
  const productoFila = mercado ? productosActivos(mercado.catalogo).find((x) => (productoId && x.id === String(productoId)) || (producto && x.nombre === producto)) ?? null : null;
  return {
    producto: productoFila ? lineaDeProducto(productoFila, { inventario: mercado.inventario }).slice(2) : "",
    productoFila,
    inventario: Boolean(mercado?.inventario),
    contexto: cerebro ? textoParaEscribir(cerebro) : "",
    criterio: linea || "",
    post,
    guionPost: String(guionPost ?? "").trim() || String(post?.guion ?? "").trim(),
  };
}
