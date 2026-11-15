// ============================================================
// Llenar el cerebro de un cliente desde su repositorio, y tenerlo al día
//
// «Llenar desde el repositorio», «Actualizar desde GitHub», la revisión al
// abrir Marca → Cerebro y la revisión diaria del cron pasan por aquí. Lee la
// carpeta del cliente (`repositorio.js`), parte cada archivo en notas
// (`notas.js`) y las pone al día. Es mecánico —no llama a ningún modelo—:
// partir por encabezados no puede resumir mal ni perder una regla.
//
// GITHUB MANDA EN EL CANON; LO CORREGIDO AQUÍ SE VIGILA
//
//   · Un archivo cuyo SHA no cambió (el manifiesto de `cerebro_sync`), no se
//     descarga ni se toca.
//   · Un archivo nuevo entra como notas nuevas, salvo las secciones que
//     alguien borró aquí (`cerebro_no_traer`): una nota borrada no vuelve.
//   · Un archivo que CAMBIÓ (sólo con `actualizar`) se compara SECCIÓN A
//     SECCIÓN (por su título, o por su ruta si alguien le cambió el título):
//       - la sección igual que antes: la nota se queda tal cual (ni se
//         reescribe ni cambia su fecha: si no, la ficha parecería vieja);
//       - la sección cambió y nadie tocó la nota: se reescribe en su sitio,
//         con su ruta y su id (los [[enlaces]] siguen valiendo);
//       - la sección cambió y la nota está CORREGIDA AQUÍ: no se pisa. Se
//         guarda el CONFLICTO con la versión de GitHub de ESA sección
//         (`cerebro_conflictos`), que la pantalla enseña con la diferencia y
//         una persona resuelve. Si la sección NO cambió en GitHub (la huella
//         de la base, `seccion_hash`, es la misma), no hay conflicto: la
//         corrección de una sección no choca con el cambio de otra;
//       - GitHub ya dice lo mismo que la corrección (la persona la pasó allí):
//         la nota deja de estar «corregida aquí» y el conflicto se va.
//   · Lo que YA NO ESTÁ en GitHub (se borró, se renombró o se movió) se quita:
//     las notas que nadie tocó se borran; las corregidas aquí quedan como
//     conflicto («el archivo ya no está»). Con el árbol CORTADO (`truncated`)
//     no se quita nada: no se sabe qué falta.
//   · Una nota corregida de un archivo que se fue y reaparece con OTRA ruta
//     (se movió de carpeta) se reconoce por su título y sigue al archivo.
//
// LÍMITES. Una petición para el árbol y una por archivo, como mucho 40 por
// llamada (`MAX_ARCHIVOS`); lo que no cabe queda en `pendientes` y la
// siguiente vuelta lo sigue sin repetir. El cerebro no pasa de
// `MAX_NOTAS_POR_CLIENTE` notas: un archivo que no cabe entero no entra.
// ============================================================

import {
  dividirEnNotas, derivados, textoEditado, ajustada, EDITADA_AJUSTE, EDITADA_TEXTO, MAX_NOTAS_POR_CLIENTE, huellaSeccion,
  textoComparable, rutaUnica, slug,
} from "./notas.js";
import { leerArbol, descargar, MAX_ARCHIVOS, ErrorRepositorio } from "./repositorio.js";
import { leerNotasLigeras, reindexar } from "./cerebro.js";
import { tomarSync, soltarSync } from "./estadoSync.js";
import { uuid, ahora } from "../ids.js";

const POR_LOTE = 40;

/** El sha de cada archivo según las notas (lo de antes de que existiera el manifiesto). Manda la de las no corregidas. */
function manifiestoDeNotas(delRepositorio) {
  const salida = {};
  for (const n of delRepositorio.filter((x) => x.fuente_sha && textoEditado(x))) salida[n.fuente] = n.fuente_sha;
  for (const n of delRepositorio.filter((x) => x.fuente_sha && !textoEditado(x))) salida[n.fuente] = n.fuente_sha;
  return salida;
}

/** Saca el primero de la lista de `clave` en un Map de listas. */
function sacar(mapa, clave) {
  const lista = mapa.get(clave);
  if (!lista?.length) return null;
  const v = lista.shift();
  return v;
}
const apuntar = (mapa, clave, v) => (mapa.get(clave) || mapa.set(clave, []).get(clave)).push(v);
const claveMarca = (fuente, titulo) => `${fuente}\u0000${titulo}`;

/**
 * Sincroniza el cerebro de `cliente` con su repositorio (ver la cabecera).
 * `actualizar`: además de lo nuevo, trae lo que cambió y quita lo que ya no está (la pantalla y el cron lo piden
 * siempre; sin él es el primer llenado). `pisar`: notas corregidas aquí que se reemplazan por GitHub aunque choquen.
 * `forzar`: archivos que se bajan aunque no hayan cambiado (volver a traer una sección que se había borrado).
 * `soloSiCambio`: si la carpeta de GitHub no cambió desde la última vez, no lee nada más (la revisión diaria).
 * Lanza `ErrorRepositorio` (con `estado` 409 si otra sincronización está en marcha).
 * @returns {{ archivos, notas, conflictos: { nuevos, total, avisar: object[] }, internas: string[], revisar: string[],
 *             truncado: boolean, fuera: object, sinSitio: string[], trajo: boolean, sinCambios?: boolean, sinActualizar: [] }}
 */
export async function importarDelRepositorio(env, acceso, cliente, { carpeta = "", actualizar = false, pisar = [], forzar = [], soloSiCambio = false } = {}) {
  const clientId = cliente.id;
  const estado = await tomarSync(acceso, clientId);
  if (!estado) {
    const e = new ErrorRepositorio("Este cerebro ya se está poniendo al día con GitHub. Espera un momento y vuelve a mirar.");
    e.estado = 409;
    throw e;
  }
  try {
    const { resultado, cambios } = await sincronizar(env, acceso, cliente, estado, { carpeta, actualizar, pisar, forzar, soloSiCambio });
    await soltarSync(acceso, clientId, cambios);
    return resultado;
  } catch (e) {
    // Revisado, aunque fallara: si no, el cron lo volvería a intentar cada minuto. Lo que quedaba pendiente se suelta
    // (si GitHub falla, seguir en la siguiente vuelta fallaría igual) y el motivo queda para la pantalla.
    await soltarSync(acceso, clientId, { revisado_at: ahora(), pendientes: 0, error: String(e?.message ?? e).slice(0, 300) });
    throw e;
  }
}

async function sincronizar(env, acceso, cliente, estado, { carpeta, actualizar, pisar, forzar, soloSiCambio }) {
  const clientId = cliente.id;
  const t = ahora();
  // Otra carpeta que la de la ficha (la ruta lo admite): nada de lo de la carpeta de siempre se da por borrado.
  const otraCarpeta = Boolean(carpeta) && carpeta !== cliente.github_folder;
  const arbol = await leerArbol(env, { repoUrl: cliente.github_repo, carpeta: carpeta || cliente.github_folder });
  const aPisar = new Set(actualizar ? pisar.map(String) : []);
  const forzadas = new Set(forzar.map(String));

  const fuera = { ...arbol.fuera, truncado: arbol.truncado };
  if (soloSiCambio && estado.huella && estado.huella === arbol.huella && !estado.pendientes && !aPisar.size && !forzadas.size) {
    return {
      resultado: { sinCambios: true, ...vacio(), truncado: arbol.truncado, fuera: { ...estado.fuera, ...fuera } },
      cambios: { revisado_at: t, error: "", fuera: { ...estado.fuera, ...fuera } },
    };
  }

  // Sin el texto: aquí hacen falta las fechas, el archivo de origen, su versión y la huella de su sección.
  const existentes = await leerNotasLigeras(acceso, clientId);
  const [marcas, conflictosAntes] = await Promise.all([
    acceso.leerColumnas("cerebro_no_traer", ["id", "fuente", "titulo"], { client_id: clientId }),
    acceso.leerColumnas("cerebro_conflictos", ["id", "nota_id", "tipo", "seccion_hash", "avisado_hash"], { client_id: clientId }),
  ]);
  const conflictoDe = new Map(conflictosAntes.map((c) => [c.nota_id, c]));
  const delRepositorio = existentes.filter((n) => n.origen === "repositorio" && n.fuente);
  const porFuente = new Map();
  for (const n of delRepositorio) apuntar(porFuente, n.fuente, n);
  // El manifiesto: lo que ya se trajo. Sin él (la primera vez con esto), lo que dicen las notas.
  const manifiesto = Object.keys(estado.archivos).length ? { ...estado.archivos } : manifiestoDeNotas(delRepositorio);
  const conocido = (ruta) => ruta in manifiesto || porFuente.has(ruta);
  // El archivo de una nota que se va a pisar se baja aunque no haya cambiado.
  for (const n of delRepositorio) if (aPisar.has(n.id)) forzadas.add(n.fuente);

  const usadas = new Set(existentes.map((n) => n.ruta));
  const marcadas = new Set(marcas.map((m) => claveMarca(m.fuente, m.titulo)));
  const cuenta = { nuevos: 0, actualizados: 0, borrados: 0 };
  const notas = { creadas: 0, reemplazadas: 0, conservadas: 0, iguales: 0, borradas: 0, alcanzadas: 0, saltadas: 0 };
  const internas = [];
  const revisar = [];
  const filas = [];               // notas nuevas
  const porBorrar = [];           // ids de notas
  const cambiosNotas = [];        // [{ where, cambios }]
  const conflictosGuardar = new Map(); // nota_id → fila
  const conflictosQuitar = new Set();  // ids de conflictos
  const marcasQuitar = [];
  const sinSitio = [];
  let total = existentes.length;

  const conflicto = (nota, tipo, { texto = "", hash = "", sha = "", fuente = nota.fuente } = {}) => {
    const antes = conflictoDe.get(nota.id);
    // El mismo choque de antes (mismo tipo y misma versión de GitHub): ya está guardado y ya se avisó.
    if (antes && antes.tipo === tipo && antes.seccion_hash === hash) return;
    conflictosGuardar.set(nota.id, {
      id: antes?.id ?? uuid(), client_id: clientId, nota_id: nota.id, tipo, fuente, texto, seccion_hash: hash, fuente_sha: sha,
      avisado_hash: antes?.avisado_hash ?? "", updated_at: t, ...(antes ? {} : { created_at: t }),
    });
  };
  const sinConflicto = (nota) => {
    conflictosGuardar.delete(nota.id);
    const antes = conflictoDe.get(nota.id);
    if (antes) conflictosQuitar.add(antes.id);
  };

  // ---------- Lo que ya no está en GitHub ----------
  // Las notas corregidas de lo que se fue, por título: si el archivo reaparece en otra ruta (se movió), lo siguen.
  const huerfanas = new Map();
  // Las corregidas que ya encontraron su sección en esta vuelta: una nota no puede seguir a dos archivos.
  const consumidas = new Set();
  for (const n of delRepositorio) if (conflictoDe.get(n.id)?.tipo === "archivo" && textoEditado(n)) apuntar(huerfanas, n.titulo, n);
  // Si la carpeta de la ficha cambió, la revisión automática no quita lo de la anterior (podría ser un error al
  // escribirla): lo hace «Actualizar desde GitHub», que pulsa una persona.
  const carpetaCambio = Boolean(estado.carpeta) && estado.carpeta !== arbol.base;
  if (actualizar && !arbol.truncado && !otraCarpeta && !(carpetaCambio && soloSiCambio)) {
    const fuentes = new Set([...porFuente.keys(), ...Object.keys(manifiesto), ...marcas.map((m) => m.fuente)]);
    for (const fuente of fuentes) {
      if (arbol.presentes.has(fuente)) continue;
      const propias = porFuente.get(fuente) ?? [];
      for (const n of propias) {
        if (textoEditado(n) && !aPisar.has(n.id)) {
          conflicto(n, "archivo", { fuente });
          if (!huerfanas.get(n.titulo)?.includes(n)) apuntar(huerfanas, n.titulo, n);
        } else {
          porBorrar.push(n.id);
          usadas.delete(n.ruta);
          notas.borradas++;
        }
      }
      if (propias.length || fuente in manifiesto) cuenta.borrados++;
      delete manifiesto[fuente];
      porFuente.delete(fuente);
      marcasQuitar.push(...marcas.filter((m) => m.fuente === fuente).map((m) => m.id));
    }
    total -= notas.borradas;
  }

  // ---------- Lo nuevo y lo que cambió ----------
  const distintos = arbol.candidatos.filter((n) => manifiesto[n.path] !== n.sha || forzadas.has(n.path));
  const cambiados = distintos.filter((n) => conocido(n.path));
  const pendientesTodos = actualizar ? distintos : distintos.filter((n) => !conocido(n.path) || forzadas.has(n.path));
  // Lo que se pidió a mano va primero: si no cabe todo, que sea lo que la persona está esperando.
  pendientesTodos.sort((a, b) => Number(forzadas.has(b.path)) - Number(forzadas.has(a.path)));
  const aLeer = pendientesTodos.slice(0, MAX_ARCHIVOS);
  const { archivos, fallidos } = await descargar(env, arbol, aLeer);

  // El texto de las notas de estos archivos que hace falta comparar: las que no tienen la huella de su sección (las de
  // antes de 0079) y las corregidas aquí (¿GitHub ya dice lo mismo que la corrección?).
  const bajadas = new Set(archivos.map((a) => a.ruta));
  const sinHuella = delRepositorio.filter((n) => bajadas.has(n.fuente) && (!n.seccion_hash || textoEditado(n)));
  const huerfanasIds = [...huerfanas.values()].flat().map((n) => n.id);
  const textos = new Map();
  const ids = [...new Set([...sinHuella.map((n) => n.id), ...huerfanasIds])];
  if (ids.length) for (const f of await acceso.leerVarios("cerebro_notas", ["id", "texto"], "id", ids, { client_id: clientId })) textos.set(f.id, f.texto);
  const igualQue = (nota, s, hash) => (nota.seccion_hash
    ? nota.seccion_hash === hash
    : textos.has(nota.id) && textoComparable(textos.get(nota.id)) === textoComparable(s.texto));

  for (const archivo of archivos) {
    const propias = porFuente.get(archivo.ruta) ?? [];
    const yaEstaba = propias.length > 0 || archivo.ruta in manifiesto;
    // Sin `actualizar` sólo entran archivos nuevos (y los que se pidió volver a traer).
    if (yaEstaba && !actualizar && !forzadas.has(archivo.ruta)) continue;

    // Las secciones con sus rutas «naturales» dentro del archivo (sin mirar las del resto del cerebro).
    const secciones = dividirEnNotas(archivo.ruta, archivo.texto, new Set()).map((s) => ({ ...s, hash: huellaSeccion(s.texto) }));
    const corregidas = propias.filter((n) => textoEditado(n) && !aPisar.has(n.id) && !consumidas.has(n.id));
    const sinTocar = propias.filter((n) => !corregidas.includes(n) && !consumidas.has(n.id));
    const porTitulo = { c: new Map(), u: new Map() };
    for (const n of corregidas) apuntar(porTitulo.c, n.titulo, n);
    for (const n of sinTocar) apuntar(porTitulo.u, n.titulo, n);
    const tomada = new Set();
    const buscar = (mapa, lista, s) => {
      const porNombre = sacar(mapa, s.titulo);
      if (porNombre) return porNombre;
      // Le cambiaron el título aquí: su ruta es la de la sección.
      const porRuta = lista.find((n) => !tomada.has(n.id) && n.ruta === s.ruta);
      if (porRuta) { const l = mapa.get(porRuta.titulo); if (l) l.splice(l.indexOf(porRuta), 1); }
      return porRuta ?? null;
    };

    // El plan de este archivo, sin tocar nada todavía: si no cabe en el cerebro, no entra nada de él.
    const plan = [];
    for (const s of secciones) {
      const c = buscar(porTitulo.c, corregidas, s);
      if (c) { tomada.add(c.id); consumidas.add(c.id); plan.push({ s, corregida: c }); continue; }
      const u = buscar(porTitulo.u, sinTocar, s);
      if (u) { tomada.add(u.id); plan.push({ s, sinTocar: u }); continue; }
      if (marcadas.has(claveMarca(archivo.ruta, s.titulo))) { notas.saltadas++; continue; }
      // Una corregida de un archivo que se fue y que aquí reaparece con su título: se movió de carpeta.
      let h = !yaEstaba ? sacar(huerfanas, s.titulo) : null;
      while (h && consumidas.has(h.id)) h = sacar(huerfanas, s.titulo);
      if (h) consumidas.add(h.id);
      if (h) { plan.push({ s, corregida: h, movida: true }); continue; }
      plan.push({ s, nueva: true });
    }
    const sobran = sinTocar.filter((n) => !tomada.has(n.id));
    const delta = plan.filter((p) => p.nueva).length - sobran.length;
    if (total + delta > MAX_NOTAS_POR_CLIENTE) { sinSitio.push(archivo.ruta); continue; }
    total += delta;
    if (yaEstaba) cuenta.actualizados++; else cuenta.nuevos++;

    // Lo que ya no tiene sección: se borra si nadie lo tocó; si está corregido, choca.
    for (const n of sobran) { porBorrar.push(n.id); usadas.delete(n.ruta); notas.borradas++; }
    for (const n of corregidas.filter((x) => !tomada.has(x.id))) conflicto(n, "seccion", { sha: archivo.sha });

    for (const p of plan) {
      const { s } = p;
      if (p.corregida) {
        const n = p.corregida;
        const base = { fuente_sha: archivo.sha, ...(p.movida ? { fuente: archivo.ruta } : {}) };
        if (textos.has(n.id) && textoComparable(textos.get(n.id)) === textoComparable(s.texto)) {
          // GitHub ya dice lo que se corrigió aquí: deja de estar «corregida aquí».
          cambiosNotas.push({ where: { id: n.id, client_id: clientId }, cambios: { ...base, seccion_hash: s.hash, editada: Number(n.editada ?? 0) & ~EDITADA_TEXTO } });
          sinConflicto(n);
          notas.alcanzadas++;
        } else if (!p.movida && n.seccion_hash && n.seccion_hash === s.hash) {
          // Esa sección no cambió en GitHub: la corrección no choca con lo que cambió en otra.
          if (n.fuente_sha !== archivo.sha) cambiosNotas.push({ where: { id: n.id, client_id: clientId }, cambios: base });
          sinConflicto(n);
          notas.conservadas++;
        } else {
          if (n.fuente_sha !== archivo.sha || p.movida) cambiosNotas.push({ where: { id: n.id, client_id: clientId }, cambios: base });
          if (p.movida && n.seccion_hash === s.hash) sinConflicto(n);
          else conflicto(n, "cambio", { texto: s.texto, hash: s.hash, sha: archivo.sha, fuente: archivo.ruta });
          notas.conservadas++;
        }
        continue;
      }
      if (p.sinTocar) {
        const n = p.sinTocar;
        // «Usar la de GitHub» (`pisar`): se reescribe aunque la sección no haya cambiado (lo distinto es la corrección).
        if (!aPisar.has(n.id) && igualQue(n, s, s.hash)) {
          // La misma sección: ni se reescribe ni cambia su fecha (la ficha no tiene por qué parecer vieja).
          if (n.fuente_sha !== archivo.sha || n.seccion_hash !== s.hash) {
            cambiosNotas.push({ where: { id: n.id, client_id: clientId }, cambios: { fuente_sha: archivo.sha, seccion_hash: s.hash } });
          }
          if (conflictoDe.has(n.id)) sinConflicto(n);
          notas.iguales++;
          continue;
        }
        // Cambió y nadie la tocó: se reescribe EN SU SITIO (su id y su ruta), «sin tocar» (las dos fechas iguales).
        // Tipo y candado que una persona escogió se conservan.
        cambiosNotas.push({
          where: { id: n.id, client_id: clientId },
          cambios: {
            titulo: s.titulo, texto: s.texto, ...derivados(s.texto),
            tipo: ajustada(n) ? n.tipo : s.tipo,
            interna: (ajustada(n) ? n.interna : 0) || s.interna ? 1 : 0,
            editada: ajustada(n) ? EDITADA_AJUSTE : 0,
            fuente_sha: archivo.sha, seccion_hash: s.hash, created_at: t, updated_at: t,
          },
        });
        sinConflicto(n);
        notas.reemplazadas++;
        if (s.interna && s.tipo !== "borrador" && !ajustada(n)) internas.push(s.titulo);
        if (s.revisar) revisar.push(s.titulo);
        continue;
      }
      const ruta = usadas.has(s.ruta) ? rutaUnica(slug(s.titulo), usadas) : s.ruta;
      usadas.add(ruta);
      filas.push({
        id: uuid(), client_id: clientId, ruta, titulo: s.titulo, texto: s.texto, ...derivados(s.texto), tipo: s.tipo,
        origen: "repositorio", fuente: archivo.ruta, fuente_sha: archivo.sha, seccion_hash: s.hash,
        interna: s.interna ? 1 : 0, editada: 0,
        // Sin `created_at` ni `updated_at`: los pone la base, con el mismo instante en las dos. Si los pusiera esto,
        // `guardarVarios` cambiaría `updated_at` por su cuenta y toda nota importada parecería editada a mano.
      });
      notas.creadas++;
      if (s.interna && s.tipo !== "borrador") internas.push(s.titulo);
      if (s.revisar) revisar.push(s.titulo);
    }
    manifiesto[archivo.ruta] = archivo.sha;
  }

  // ---------- Escribir ----------
  // Los conflictos de las notas que se van, primero (la clave ajena también los quitaría).
  for (const id of porBorrar) { const c = conflictoDe.get(id); if (c) conflictosQuitar.add(c.id); conflictosGuardar.delete(id); }
  // Un solo borrado para todos los archivos (van de 50 en 50 ids), no uno por archivo: el plan gratuito cuenta las
  // consultas por invocación.
  if (conflictosQuitar.size) await acceso.borrarVarios("cerebro_conflictos", [...conflictosQuitar]);
  if (porBorrar.length) await acceso.borrarVarios("cerebro_notas", porBorrar);
  for (let i = 0; i < filas.length; i += POR_LOTE) await acceso.guardarVarios("cerebro_notas", filas.slice(i, i + POR_LOTE));
  for (let i = 0; i < cambiosNotas.length; i += POR_LOTE) await acceso.actualizarVarios("cerebro_notas", cambiosNotas.slice(i, i + POR_LOTE));
  const nuevosConflictos = [...conflictosGuardar.values()];
  // Lo que hay que avisar: lo que choca por primera vez o con otra versión de GitHub. Se apunta aquí mismo como avisado
  // (lo avisa quien llama): un aviso que se pierde es un fallo menor; dos veces el mismo, ruido.
  const avisar = nuevosConflictos.filter((c) => c.avisado_hash !== `${c.tipo}:${c.seccion_hash}`);
  for (const c of avisar) c.avisado_hash = `${c.tipo}:${c.seccion_hash}`;
  for (let i = 0; i < nuevosConflictos.length; i += POR_LOTE) await acceso.guardarVarios("cerebro_conflictos", nuevosConflictos.slice(i, i + POR_LOTE));
  if (marcasQuitar.length) await acceso.borrarVarios("cerebro_no_traer", marcasQuitar);
  const tocadas = filas.length || porBorrar.length || notas.reemplazadas || cambiosNotas.length;
  if (tocadas) await reindexar(env, acceso, clientId);

  const omitidos = pendientesTodos.length - aLeer.length;
  const totalConflictos = new Set([...conflictosAntes.filter((c) => !conflictosQuitar.has(c.id)).map((c) => c.nota_id), ...conflictosGuardar.keys()]).size;
  const trajo = notas.creadas + notas.reemplazadas + notas.borradas > 0;
  // Con la carpeta cambiada y sin quitar lo de la anterior, se sigue apuntando la anterior: la siguiente revisión
  // automática tampoco la quitará, hasta que una persona pulse «Actualizar desde GitHub».
  const esperaCarpeta = carpetaCambio && soloSiCambio;
  const completa = actualizar && !otraCarpeta && !esperaCarpeta && !omitidos && !fallidos.length && !sinSitio.length;
  const fichaDeLaIA = existentes.some((n) => n.origen === "ia" && n.tipo === "ficha");
  const fueraAhora = { ...fuera, fallidos: fallidos.slice(0, 20), sinSitio: sinSitio.slice(0, 20) };

  return {
    resultado: {
      archivos: {
        nuevos: cuenta.nuevos, actualizados: cuenta.actualizados, borrados: cuenta.borrados,
        cambiados: actualizar ? 0 : cambiados.filter((n) => !forzadas.has(n.path)).length,
        iguales: arbol.candidatos.length - distintos.length, omitidos, fallidos: fallidos.length,
      },
      notas, internas, revisar, truncado: arbol.truncado, fuera: fueraAhora, sinSitio, carpetaCambio: esperaCarpeta,
      conflictos: { nuevos: avisar.length, total: totalConflictos, avisar },
      trajo,
      // De antes: la pantalla de antes ofrecía «Usar la versión de GitHub» con esta lista; ahora los conflictos se guardan.
      sinActualizar: [],
    },
    cambios: {
      carpeta: esperaCarpeta || otraCarpeta ? estado.carpeta : arbol.base, archivos: manifiesto, fuera: fueraAhora, error: "", revisado_at: t,
      pendientes: actualizar ? omitidos : 0,
      // La huella sólo cuando todo lo de esta carpeta quedó al día: si no, la revisión diaria se saltaría lo pendiente.
      ...(completa ? { huella: arbol.huella } : {}),
      ...(trajo ? { sincronizado_at: t } : {}),
      ...(trajo && fichaDeLaIA ? { ficha_pendiente: 1 } : {}),
    },
  };
}

function vacio() {
  return {
    archivos: { nuevos: 0, actualizados: 0, borrados: 0, cambiados: 0, iguales: 0, omitidos: 0, fallidos: 0 },
    notas: { creadas: 0, reemplazadas: 0, conservadas: 0, iguales: 0, borradas: 0, alcanzadas: 0, saltadas: 0 },
    internas: [], revisar: [], sinSitio: [], conflictos: { nuevos: 0, total: 0, avisar: [] }, trajo: false, sinActualizar: [],
  };
}
