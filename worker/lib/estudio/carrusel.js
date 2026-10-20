// ============================================================
// El carrusel: la contrapropuesta del director de arte (texto)
//
// Lo que hacía Flow antes de crear las láminas: leer el guion y devolver un
// plan que entiende mejor quien lo va a generar —qué se ve en cada lámina,
// el texto EXACTO con su jerarquía, la composición y el hilo visual que
// comparten todas—. Lo puro (el pedido y la lectura) en src/lib/carrusel.js.
// Es texto: no pide nada al motor de imagen. Una persona lo corrige antes
// de crear nada.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { pautasDe, bloqueDePautas } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { partirGuion, pedidoDePropuesta, leerPropuesta } from "../../../src/lib/carrusel.js";
import { nombreDePreset, lineaDeEstilo, estiloDeLaPieza, bloqueDeMarca } from "../../../src/lib/kitMarca.js";

/** `datos`: { guion?, tema?, preset?, estilo?, productoId?, personajes?: [ids] } → { hilo, laminas } */
export async function propuestaDeCarrusel(env, acceso, cliente, datos = {}) {
  const laminas = partirGuion(String(datos.guion ?? "").slice(0, 6000));
  const tema = String(datos.tema ?? "").slice(0, 400);
  if (laminas.length < 2 && !tema.trim()) throw Object.assign(new Error("Escribe el guion (una lámina por línea) o el tema del carrusel."), { estado: 400 });
  const kit = kitDe(cliente);
  const preset = String(datos.preset ?? "");
  let producto = "";
  if (datos.productoId) {
    try {
      const { catalogo, inventario } = await leerMercado(acceso, cliente.id);
      const p = productosActivos(catalogo).find((x) => x.id === datos.productoId);
      if (p) producto = lineaDeProducto(p, { inventario }).slice(2);
    } catch { /* sin catálogo, sin producto */ }
  }
  const ids = Array.isArray(datos.personajes) ? datos.personajes.map(String) : [];
  const personajes = kit.personajes.filter((p) => ids.includes(p.id)).map((p) => `${p.nombre}${p.descripcion ? `: ${p.descripcion}` : ""}`);
  // Las pautas para escribir del cerebro (la jerarquía, el tono de los textos de las láminas): detrás del pedido.
  const pautas = bloqueDePautas(await pautasDe(env, acceso, cliente.id));
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [pedidoDePropuesta({
      marca: cliente.name, rubro: cliente.industry ?? "", laminas, tema, producto, personajes,
      tipo: preset ? nombreDePreset(preset, kit) : "",
      estilo: lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, String(datos.estilo ?? ""))),
      identidad: bloqueDeMarca(kit),
    }), pautas].filter(Boolean).join("\n\n"),
    salida: 350 * Math.max(laminas.length, 7) + 600,
    funcion: "prompt de imagen",
  });
  const propuesta = leerPropuesta(r.texto);
  if (!propuesta) throw Object.assign(new Error("La IA no devolvió una propuesta que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { ...propuesta, modelo: r.modelo, aviso: r.aviso ?? null };
}
