// ============================================================
// Las direcciones de la aplicación
//
// EL PROBLEMA QUE RESUELVE
//
// Hasta aquí todo el panel vivía en `/`. Qué cliente estabas mirando y
// qué calendario tenías abierto eran `useState`, así que:
//
//   · recargar la página te devolvía al principio, y si estabas a media
//     revisión de un mes, a buscarlo otra vez;
//   · el botón de atrás del navegador salía de la aplicación;
//   · no había forma de mandarle a nadie «mira esto». Con dos personas
//     en el equipo eso deja de ser un detalle: pasar un enlace es la
//     manera natural de señalar algo.
//
// Sin dependencias nuevas. Un router de verdad son 10 kB comprimidos
// para resolver cinco direcciones, y este repositorio sólo depende de
// react y react-dom a propósito. La API del navegador —`pushState`,
// `popstate`— ya hace lo que hace falta.
//
// POR QUÉ SLUGS Y NO IDS
//
// Porque `/cliente/baby-caleb` se lee y `/cliente/6f2a…` no. El id sigue
// valiendo como dirección —si un enlace viejo lo trae, resuelve—, pero
// lo que se escribe en la barra es el nombre.
//
// Y llevan el nombre YA NORMALIZADO, sin espacios ni tildes. En este
// repositorio eso no es cosmética: la ficha del ADN de un cliente
// guardaba la carpeta escapada («Baby%20Caleb/…»), no coincidía con
// ninguna del árbol de GitHub, y la lectura volvía vacía sólo para los
// clientes con un espacio en el nombre. Un slug no tiene espacios que
// escapar, así que ese fallo no puede repetirse aquí.
// ============================================================

/**
 * Nombre → trozo de dirección.
 *
 * Las tildes se descomponen y se quitan: `NFD` separa la letra de su
 * acento y el rango \u0300-\u036f es justo el de los acentos sueltos.
 * Va escrito como escape: los acentos sueltos, en crudo, se pegan al
 * corchete de al lado y cualquier editor puede normalizarlos sin avisar.
 */
export function aSlug(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Un slug por elemento, garantizado único dentro de la lista.
 *
 * Dos clientes pueden llamarse igual —o distinto y normalizar igual:
 * «Café Luna» y «Cafe Luna»—, y dos calendarios del mismo cliente
 * todavía más fácil. El primero se queda el slug limpio y los
 * siguientes le añaden un trozo de su id. Se resuelve sobre la lista
 * entera y no elemento a elemento porque «¿soy yo el primero?» sólo se
 * puede contestar mirando a los demás.
 *
 * El orden de la lista es el de `created_at asc` que devuelve el
 * servidor, así que el slug de un cliente no cambia porque se cree otro
 * después: sólo cambiaría si se borrara uno anterior con el mismo
 * nombre, y ese enlace ya apuntaba a algo que ha dejado de existir.
 */
export function slugsUnicos(items = [], porDefecto = "sin-nombre", reservados = []) {
  // Los reservados cuentan como ya usados: un calendario que se llame
  // «Tareas» no puede quedarse la dirección de la pestaña de tareas.
  const usados = new Set(reservados);
  const salida = new Map();

  for (const it of items) {
    if (!it?.id) continue;
    const base = aSlug(it.name) || porDefecto;
    let slug = base;
    if (usados.has(slug)) slug = `${base}-${String(it.id).slice(0, 6)}`;
    // Y si hasta eso choca (ids recortados iguales), se alarga.
    while (usados.has(slug)) slug = `${slug}-x`;
    usados.add(slug);
    salida.set(it.id, slug);
  }
  return salida;
}

/**
 * Las pestañas del cliente que no son el calendario. Van en el mismo
 * sitio de la dirección que el mes —`/cliente/baby-caleb/contenido`—, así
 * que sus nombres quedan reservados para los slugs de los calendarios.
 */
export const PESTANAS_CLIENTE = Object.freeze(["tareas", "contenido", "ideas", "resultados", "ficha"]);

export const slugsDeClientes = (clientes = []) => slugsUnicos(clientes, "cliente");
export const slugsDeCalendarios = (cals = []) => slugsUnicos(cals, "calendario", PESTANAS_CLIENTE);

/**
 * De un trozo de dirección al elemento que nombra.
 *
 * Prueba primero por slug y después por id en crudo, porque un enlace
 * que alguien haya pegado en un mensaje puede traer cualquiera de los
 * dos —y porque un cliente al que le cambian el nombre cambia de slug,
 * mientras que su id no cambia nunca—.
 */
export function porRuta(items = [], slugs, trozo) {
  if (!trozo) return null;
  for (const it of items) if (slugs.get(it.id) === trozo) return it;
  return items.find((it) => it.id === trozo) ?? null;
}

/**
 * Lee la dirección actual.
 *
 * Devuelve SIEMPRE la misma forma —`vista` más lo que esa vista
 * necesite—, para que quien la use no tenga que preguntar si un campo
 * existe antes de mirarlo.
 */
export function analizarRuta(url = window.location) {
  const ruta = String(url.pathname ?? "/");
  const hash = String(url.hash ?? "");
  const partes = ruta.split("/").filter(Boolean).map(decodeURIComponent);

  // La página de aprobación se comprueba primero y también por el hash:
  // hay enlaces ya enviados con la forma vieja y no se pueden romper.
  if (partes[0] === "aprobar" || hash.includes("/aprobar")) return { vista: "aprobar" };

  if (partes[0] === "invitacion") return { vista: "invitacion", testigo: partes[1] ?? "" };
  if (partes[0] === "equipo") return { vista: "equipo" };
  if (partes[0] === "tareas") return { vista: "tareas" };
  if (partes[0] === "ajustes") return { vista: "ajustes" };
  if (partes[0] === "resultados") return { vista: "resultados" };

  if (partes[0] === "cliente" && partes[1]) {
    const pestana = PESTANAS_CLIENTE.includes(partes[2]) ? partes[2] : "calendario";
    return {
      vista: "panel",
      cliente: partes[1],
      calendario: pestana === "calendario" ? partes[2] ?? null : null,
      pestana,
    };
  }

  return { vista: "panel", cliente: null, calendario: null, pestana: "calendario" };
}

/** La dirección de una vista. El inverso exacto de `analizarRuta`. */
export function construirRuta({ vista = "panel", cliente = null, calendario = null, pestana = "calendario", testigo = "" } = {}) {
  if (vista === "equipo") return "/equipo";
  if (vista === "tareas") return "/tareas";
  if (vista === "ajustes") return "/ajustes";
  if (vista === "resultados") return "/resultados";
  if (vista === "invitacion") return `/invitacion/${encodeURIComponent(testigo)}`;
  if (!cliente) return "/";
  const base = `/cliente/${encodeURIComponent(cliente)}`;
  if (PESTANAS_CLIENTE.includes(pestana)) return `${base}/${pestana}`;
  return calendario ? `${base}/${encodeURIComponent(calendario)}` : base;
}

/**
 * Cambia de dirección sin recargar.
 *
 * `reemplazar` es para cuando la dirección se corrige sola —al entrar
 * en `/` y seleccionar el primer cliente, por ejemplo—: eso no es
 * navegar, y meterlo en el historial obligaría a pulsar «atrás» dos
 * veces para salir de donde nunca se pidió entrar.
 */
export function navegar(destino, { reemplazar = false } = {}) {
  if (destino === window.location.pathname + window.location.search) return;
  window.history[reemplazar ? "replaceState" : "pushState"]({}, "", destino);
  // `pushState` no dispara `popstate`: sin este aviso, quien escucha la
  // dirección no se entera de los cambios que hace la propia aplicación.
  window.dispatchEvent(new PopStateEvent("popstate"));
}
