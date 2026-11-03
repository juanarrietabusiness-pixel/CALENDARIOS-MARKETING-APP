// ============================================================
// Llenar el cerebro de un cliente desde su repositorio
//
// El botón «Llenar desde el repositorio». Lee la carpeta del cliente
// (`repositorio.js`), parte cada archivo en notas (`notas.js`) y las
// guarda. Es mecánico —no llama a ningún modelo—: partir por encabezados
// no puede resumir mal ni perder una regla.
//
// QUÉ PASA AL VOLVER A IMPORTAR
//
//   · Un archivo cuyo SHA no cambió, no se descarga ni se toca.
//   · Un archivo nuevo entra como notas nuevas.
//   · Un archivo que CAMBIÓ en el repositorio se cuenta pero ni se descarga
//     ni se pisa, salvo con `actualizar`: alguien pudo corregir a mano esas notas, y
//     una importación no puede deshacerlo. Con `actualizar`, se reemplazan
//     las notas que nadie tocó (su `updated_at` sigue siendo el de su
//     creación) y las nuevas reciben las mismas rutas que las que se van,
//     para que los `[[enlaces]]` de otras notas sigan valiendo.
// ============================================================

import { dividirEnNotas, derivados, textoEditado, ajustada, EDITADA_AJUSTE } from "./notas.js";
import { leerRepositorio } from "./repositorio.js";
import { leerNotasLigeras, reindexar } from "./cerebro.js";
import { uuid } from "../ids.js";

const POR_LOTE = 40;

/**
 * @returns {{ archivos: {nuevos, cambiados, actualizados, iguales, omitidos, fallidos},
 *             notas: {creadas, reemplazadas, conservadas}, internas: string[], revisar: string[], truncado }}
 */
export async function importarDelRepositorio(env, acceso, cliente, { carpeta = "", actualizar = false, pisar = [] } = {}) {
  const clientId = cliente.id;
  // Sin el texto: aquí sólo hacen falta las fechas, el archivo de origen y su versión.
  const existentes = await leerNotasLigeras(acceso, clientId);

  const delRepositorio = existentes.filter((n) => n.origen === "repositorio" && n.fuente);
  const importadas = new Set(delRepositorio.map((n) => n.fuente));
  // «Usar la del repositorio»: notas corregidas aquí que la persona decidió reemplazar por la versión de GitHub.
  const aPisar = new Set(actualizar ? pisar.map(String) : []);
  // La versión de cada archivo que ya está en el cerebro. La de una nota corregida a mano se queda en la versión
  // de cuando se importó: manda la de las que no se tocaron (las de esa versión entran primero y las pisan).
  const conocidos = new Map(
    [...delRepositorio.filter((n) => n.fuente_sha && textoEditado(n)), ...delRepositorio.filter((n) => n.fuente_sha && !textoEditado(n))]
      .map((n) => [n.fuente, n.fuente_sha]),
  );
  // El archivo de una nota que se va a pisar se baja aunque no haya cambiado.
  for (const n of delRepositorio) if (aPisar.has(n.id)) conocidos.delete(n.fuente);

  const leido = await leerRepositorio(env, {
    repoUrl: cliente.github_repo,
    carpeta: carpeta || cliente.github_folder,
  }, conocidos, { actualizar });

  const usadas = new Set(existentes.map((n) => n.ruta));
  const cuenta = { nuevos: 0, actualizados: 0 };
  const notas = { creadas: 0, reemplazadas: 0, conservadas: 0 };
  const internas = [];
  const revisar = [];
  const filas = [];
  const porBorrar = [];
  // Las que no se pisaron por estar corregidas aquí: la pantalla ofrece «Usar la del repositorio» en cada una.
  const sinActualizar = [];

  for (const archivo of leido.archivos) {
    const yaEstaba = importadas.has(archivo.ruta);
    // Sin `actualizar` sólo entran archivos nuevos: el lector ya no baja los cambiados, y esto guarda contra el
    // que llegara igual (un archivo con notas nuestras pero sin versión anotada).
    if (yaEstaba && !actualizar) continue;

    // Las secciones que alguien corrigió a mano en una importación anterior: su versión gana.
    let corregidas = new Set();
    // Tipo y candado que una persona escogió para una sección: el texto nuevo los conserva (por su ruta).
    const ajustes = new Map();
    if (yaEstaba) {
      // Sólo se conserva una nota a la que le cambiaron el TEXTO (`textoEditado`). Marcarla interna o cambiarle el
      // tipo no la congela: antes sí, y una sección con un teléfono viejo se quedaba así para siempre.
      const propias = delRepositorio.filter((n) => n.fuente === archivo.ruta);
      const conservar = (n) => textoEditado(n) && !aPisar.has(n.id);
      const sinTocar = propias.filter((n) => !conservar(n));
      for (const n of sinTocar) if (ajustada(n)) ajustes.set(n.ruta, { tipo: n.tipo, interna: n.interna ? 1 : 0 });
      corregidas = new Set(propias.filter(conservar).map((n) => n.ruta));
      sinActualizar.push(...propias.filter(conservar).map((n) => ({ id: n.id, titulo: n.titulo, fuente: n.fuente })));
      notas.conservadas += corregidas.size;
      notas.reemplazadas += sinTocar.length;
      porBorrar.push(...sinTocar.map((n) => n.id));
      // Sus rutas quedan libres: las nuevas las heredan y los enlaces siguen valiendo.
      for (const n of sinTocar) usadas.delete(n.ruta);
      cuenta.actualizados++;
    } else {
      cuenta.nuevos++;
    }

    // Con las rutas de lo corregido a mano libres, la sección que le corresponde sale con la MISMA ruta y se
    // reconoce: no se crea otra copia al lado de la que alguien ya arregló.
    const libres = new Set([...usadas].filter((r) => !corregidas.has(r)));
    for (const n of dividirEnNotas(archivo.ruta, archivo.texto, libres)) {
      if (corregidas.has(n.ruta)) continue;
      usadas.add(n.ruta);
      const ajuste = ajustes.get(n.ruta);
      filas.push({
        id: uuid(), client_id: clientId, ruta: n.ruta, titulo: n.titulo, texto: n.texto, ...derivados(n.texto), tipo: ajuste?.tipo ?? n.tipo,
        origen: "repositorio", fuente: archivo.ruta, fuente_sha: archivo.sha,
        // Interna si la sección lo pide o si alguien la marcó: un candado puesto a mano no se quita al actualizar.
        interna: n.interna || ajuste?.interna ? 1 : 0,
        editada: ajuste ? EDITADA_AJUSTE : 0,
        // Sin `created_at` ni `updated_at`: los pone la base, con el mismo instante en las dos. Si los
        // pusiera esto, `guardarVarios` cambiaría `updated_at` por su cuenta y toda nota importada
        // parecería editada a mano, que es justo lo que una nueva importación no debe pisar.
      });
      notas.creadas++;
      if (n.interna && n.tipo !== "borrador") internas.push(n.titulo);
      if (n.revisar) revisar.push(n.titulo);
    }
  }

  // Un solo borrado para todos los archivos (van de 50 en 50 ids), no uno por archivo: el plan gratuito cuenta las
  // consultas por invocación.
  if (porBorrar.length) await acceso.borrarVarios("cerebro_notas", porBorrar);
  for (let i = 0; i < filas.length; i += POR_LOTE) await acceso.guardarVarios("cerebro_notas", filas.slice(i, i + POR_LOTE));
  if (filas.length || cuenta.actualizados) await reindexar(env, acceso, clientId);

  return {
    archivos: { ...cuenta, cambiados: leido.cambiados, iguales: leido.iguales, omitidos: leido.omitidos, fallidos: leido.fallidos },
    notas, internas, revisar, truncado: leido.truncado, sinActualizar,
  };
}
