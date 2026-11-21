// ============================================================
// `guia_de_edicion`: TODO lo que hay que saber antes de editar un video grabado de un cliente, en una sola llamada
//
// El manual del editor (lo común y lo del tipo, en la versión vigente del espacio), la marca resumida (identidad de video,
// léxico, letra y colores, el contacto DE LA NOTA de datos del negocio con lo que no coincide), los estilos de edición del
// cliente, lo que dijo la persona la última vez, lo que espera su «sí», la lista de control y la versión vigente del kit.
// Lo puro, en src/lib/guiaEdicion.js. Sólo lee. Tope: ~3.500 tokens (el manual compacto es lo más largo).
// ============================================================

import { kitDe } from "./kit.js";
import { identidadDelCliente } from "./identidadVideo.js";
import { estilosEdicionDe, buscarEstiloEdicion } from "./estilosEdicion.js";
import { ultimasActas, propuestasPendientes } from "./actasEdicion.js";
import { versionVigente } from "../manualEditor.js";
import { RUTA_FICHA } from "../cerebro/preparar.js";
import { manualParaClaude, TIPOS_VIDEO_GRABADO } from "../../../src/lib/manualEditor.js";
import { resumenEstiloEdicion } from "../../../src/lib/estilosEdicion.js";
import { contactoParaElVideo, esNotaDeDatos, listaDeControl } from "../../../src/lib/guiaEdicion.js";
import { textoDeLexico } from "../../../src/lib/lexico.js";
import { KIT_EDICION } from "../../../src/lib/kitEdicionVersion.js";

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** La guía en texto. `tipo`: uno de TIPOS_VIDEO_GRABADO (sin él, el manual pide reconocerlo primero). `estilo`: uno entero. */
export async function guiaDeEdicion(acceso, cliente, { tipo = "", estilo = "" } = {}) {
  const tipoValido = TIPOS_VIDEO_GRABADO.includes(tipo) ? tipo : "";
  const vigente = await versionVigente(acceso);
  const kit = kitDe(cliente);
  const bloques = [manualParaClaude({ partes: vigente?.partes ?? {}, version: vigente?.version ?? 0 }, tipoValido)];
  if (tipo && !tipoValido) bloques.unshift(`OJO: «${tipo}» no es un tipo de video grabado (${TIPOS_VIDEO_GRABADO.join(", ")}).`);

  // La MARCA.
  const marca = [`## LA MARCA: ${cliente.name}`];
  const { resumen } = identidadDelCliente(cliente);
  marca.push(resumen.length ? `Identidad de video (subtítulos, músicas, efectos):\n${resumen.map((x) => `- ${x}`).join("\n")}` : "Sin identidad de video: subtítulos clásicos y la música de su biblioteca (musicas) o de Suno; nunca compuesta.");
  if (kit.paleta.length) marca.push(`Colores: ${kit.paleta.map((c) => `${c.hex}${c.rol ? ` (${c.rol})` : c.nombre ? ` (${c.nombre})` : ""}`).join(", ")}.`);
  const letra = kit.fuente?.nombre || kit.tipografia;
  if (letra) marca.push(`Letra: ${corto(letra, 120)}${kit.fuente?.clave ? " (el archivo va en el ZIP de la marca: kit_descargable)" : ""}.`);
  marca.push(kit.logo ? "Logo: en el ZIP de la marca (kit_descargable)." : "OJO: el kit no tiene logo.");
  if (kit.reglas.length) marca.push(`Reglas que no se rompen: ${kit.reglas.join(" · ")}.`);
  const lexico = textoDeLexico(kit.lexico ?? []);
  if (lexico) marca.push(`Léxico (lo ESCRITO en el video; lo que dice la persona se deja como lo dijo):\n${lexico}`);

  // El CONTACTO: de la nota de datos del negocio, nunca del resumen.
  const notas = await acceso.leerColumnas("cerebro_notas", ["ruta", "titulo", "texto", "updated_at"], { client_id: cliente.id }, "updated_at desc", 400).catch(() => []);
  const notaDatos = notas.find((n) => esNotaDeDatos(n.titulo)) ?? null;
  const ficha = notas.find((n) => n.ruta === RUTA_FICHA);
  const contacto = contactoParaElVideo({ notaDatos, fichaTecnica: ficha?.texto ?? "", cliente });
  marca.push(`CONTACTO para el video (de ${contacto.fuente}): ${[...contacto.telefonos.map((t) => `WhatsApp ${t.escrito}`), ...contacto.usuarios.map((u) => `@${u}`)].join(" · ") || "ninguno"}.`);
  for (const a of contacto.avisos) marca.push(`OJO: ${a}`);
  bloques.push(marca.join("\n"));

  // Los ESTILOS DE EDICIÓN.
  const estilos = estilosEdicionDe(cliente);
  if (estilo) {
    const e = buscarEstiloEdicion(estilos, estilo);
    bloques.push(e ? `## ESTILO DE EDICIÓN «${e.nombre}» [${e.id}] (manda sobre el manual en lo que diga)\n${JSON.stringify(e, null, 1)}` : `## ESTILO DE EDICIÓN\nNo encuentro «${estilo}» en ${cliente.name}.`);
  } else if (estilos.length) {
    const delTipo = estilos.filter((e) => !tipoValido || !e.tipo || e.tipo === tipoValido);
    bloques.push([`## ESTILOS DE EDICIÓN de ${cliente.name} (mandan sobre el manual en lo que digan; el entero, con estilo)`,
      ...(delTipo.length ? delTipo : estilos).map((e) => `«${e.nombre}» [${e.id}]${e.tipo ? ` · ${e.tipo}` : ""}\n${resumenEstiloEdicion(e).map((x) => `- ${x}`).join("\n")}`)].join("\n"));
  } else {
    bloques.push("## ESTILOS DE EDICIÓN\nNinguno todavía: edita con el manual. Si a la persona le gusta el resultado, propón guardarlo como estilo (estilo_de_edicion) con su sí.");
  }

  // Lo de la VEZ ANTERIOR y lo que espera el sí.
  const actas = await ultimasActas(acceso, cliente, 2).catch(() => []);
  const conCorrecciones = actas.filter((a) => a.correcciones.length);
  if (conCorrecciones.length) {
    bloques.push(["## LO QUE DIJO LA PERSONA LAS ÚLTIMAS VECES (que no vuelva a pasar)",
      ...conCorrecciones.flatMap((a) => a.correcciones.map((c) => `- «${corto(c.cita, 200)}» → ${corto(c.texto || c.antes, 200)}`))].join("\n"));
  }
  const { generales, deMarca } = await propuestasPendientes(acceso, cliente).catch(() => ({ generales: [], deMarca: [] }));
  if (generales.length || deMarca.length) {
    bloques.push(`## ESPERAN EL SÍ: ${generales.length} propuestas para el manual y ${deMarca.length} para el estilo de ${cliente.name} (acta_de_edicion sin nada más las enseña). Recuérdaselo a la persona al terminar.`);
  }

  bloques.push(`## ANTES DE ENTREGAR\n${listaDeControl().map((x) => `- ${x}`).join("\n")}`);
  bloques.push(`## EL KIT\nVersión vigente: ${KIT_EDICION.version} (huella ${KIT_EDICION.huella}). Si \`node ~/kit/kit.mjs version\` dice otra, vuelve a bajarlo con kit_edicion. La marca, con kit_descargable. Al terminar: acta_de_edicion.`);
  return bloques.join("\n\n");
}
