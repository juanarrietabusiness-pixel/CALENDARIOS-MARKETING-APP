// ============================================================
// CAMPAÑAS Y NÚMEROS por MCP (claude.ai): las cuentas y el plan de campañas de la agencia, sin calculadoras de fuera
//
//   · numeros_del_negocio       la ficha de «Números del negocio» (sólo lectura): cada dato con su origen, EL número
//                               mágico (`numeroMagicoDelCliente`, el único de la aplicación) o qué le falta, el
//                               equilibrio, cuánto invertir para la meta y su reparto, la tasa de cierre (la guardada, la
//                               del Manual y la MEDIDA por el enlace de ventas) y lo de Meta en 30 días. Con
//                               `proponer: true`, lo que propone la IA para lo que falta (`proponerNegocio`), SIN guardar.
//   · guardar_numeros_negocio   guarda datos de la ficha con la misma limpieza que la pantalla (`guardarNegocioSinPisar`:
//                               el `antes` contra otra persona). Sin `confirmado: true`, «NO SE GUARDÓ NADA.» con cada
//                               cambio (de → a) y cómo queda el número mágico.
//   · escribir_textos_anuncios  los textos de los ANUNCIOS del plan de campañas por la IA (`escribirTextosDelPlan`, lo
//                               mismo que «Escribir los textos» de la pantalla): una llamada de IA de hasta 8 anuncios por
//                               vez y «Quedan N»; se guardan en el plan y en `post.anuncio` sin pisar lo de una persona.
//   · ajustar_plan_campanas     lo que la pantalla del plan guarda con PUT …/ciclo: «¿Qué vas a hacer?», lo de un hueco de
//                               anuncio (`guardarCiclo`) y el reparto a mano del cliente (`guardarReparto`, que cambia
//                               cómo se reparte su dinero TODOS los meses: sólo con confirmación). Devuelve el plan.
//
// Nada de esto toca Meta ni crea campañas: se montan en el Ads Manager (la aplicación sólo planifica, escribe y vigila).
// Los módulos del Worker se importan en el momento: negocio.js y planCampanas.js llegan a mercado.js, que importa
// herramientasServidor.js (el ciclo de siempre si mcp.js los cargara de una vez).
// ============================================================

import { difundir } from "./vivo.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  CAMPOS_NEGOCIO, ORIGENES_DATO, MODOS_EQUILIBRIO, MAX_COSTOS, limpiarNegocio, valoresDe, objetivo, equilibrio, numeroMagicoDelCliente,
  repartoPorEtapas, palancasDelEquilibrio, conTasaMedida, avisoDeFraccion, dineroCorto, origenDe,
} from "../../src/lib/numerosNegocio.js";
import { TIPOS_NEGOCIO, DESTINOS_NEGOCIO, CUENTA_NEGOCIO, ETAPAS_CICLO } from "../../src/lib/cicloVentas.js";
import { CAMPANAS_DEL_PLAN, MODOS_PRODUCTOS, MAX_TEXTOS_POR_LLAMADA, huecoDeId, idDeHueco, limpiarQue, faltanTextos, textosATexto } from "../../src/lib/anunciosPlan.js";
import { mesDelPlan, anuncioEn, claveAngulo, nombreDeEtapaDelPlan, textoDeLaPieza } from "../../src/lib/planCiclo.js";
import { REPARTO_POR_DEFECTO } from "../../src/lib/manualCiclo.js";
import { nombreDeNivel } from "../../src/lib/consciencia.js";

/** Un error de lo pedido: vuelve a Claude con `isError`, no como fallo del servidor. */
export class ErrorCampanas extends Error {}

const soloLectura = { readOnlyHint: true, openWorldHint: false };
const escribe = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const clienteP = { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." };
const mesP = { type: "string", description: "AAAA-MM. Si se omite, el de este mes." };
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const n2 = (v, d = 2) => String(Math.round(Number(v) * 10 ** d) / 10 ** d).replace(".", ",");
const pct = (v, d = 1) => `${n2(v, d)} %`;

// ------------------------------------------------------------
// Las definiciones
// ------------------------------------------------------------

/** Un número de la ficha: un número suelto (con el `origen` de la llamada) o { valor, origen, nota }; null lo quita. */
const datoP = (descripcion) => ({
  description: `${descripcion} Un número, o { valor, origen, nota }. null lo quita.`,
  anyOf: [
    { type: "number" },
    { type: "string" },
    { type: "object", properties: { valor: { type: "number" }, origen: { type: "string", enum: ["cliente", "agencia", "estimado", "medida"] }, nota: { type: "string" } }, required: ["valor"] },
    { type: "null" },
  ],
});
const CAMPO = Object.fromEntries(CAMPOS_NEGOCIO.map((c) => [c.id, c]));

const huecoP = {
  type: "object",
  description: "Un hueco de anuncio del plan: qué va en él, cómo se monta y qué ángulo prueba.",
  properties: {
    hueco: { type: "string", description: "El hueco, como lo da plan_de_campanas: «[hueco presentacion:a2]» → presentacion:a2." },
    publicacion_id: { type: "string", description: "La publicación del cliente que va en ese anuncio (de cualquier mes, publicada o no): su ID de ver_calendario o del plan." },
    nuevo: { type: "boolean", description: "true: «anuncio nuevo», sin publicación (la agencia sube una pieza propia)." },
    como: { type: "string", enum: ["publicacion", "subir"], description: "publicacion: usar la publicación ya subida (su texto principal es su caption); subir: subir la pieza con textos propios." },
    angulo: { type: "string", description: "El ángulo de venta que prueba: su nombre o su clave «producto:ángulo» (las da plan_de_campanas); «ninguno» para ninguno; «sugerido» para volver al que sugiere el plan." },
    sugerido: { type: "boolean", description: "true: el hueco vuelve entero a lo que sugiere el plan (se olvida lo escogido)." },
  },
  required: ["hueco"],
};

export const DEFINICIONES_CAMPANAS = Object.freeze([
  {
    name: "numeros_del_negocio",
    description: "Los NÚMEROS DEL NEGOCIO de un cliente con las cuentas de la agencia (las mismas de la ficha «Números del negocio», " +
      "la revisión de campañas, el plan de campañas y el estratega): cada dato con su ORIGEN (del cliente, de la agencia, estimado " +
      "por la IA, de Meta o medido), EL NÚMERO MÁGICO —lo máximo que se puede pagar por una conversación de WhatsApp (o por una " +
      "compra en la web) sin perder dinero y respetando lo que se decidió invertir por venta— o qué le falta para tenerlo, el " +
      "equilibrio (a partir de dónde se pierde dinero), cuánto invertir para la meta del mes y su reparto por etapa, la tasa de " +
      "cierre (la guardada, la del Manual o la medida por el enlace de ventas) y lo gastado en Meta en 30 días (sólo de referencia). " +
      "Úsala SIEMPRE que se hable de presupuesto, cuánto pagar por resultado, ROAS, rentabilidad o si una campaña pierde dinero: no " +
      "calcules con otras calculadoras ni con fórmulas propias, estas cifras son las que usa toda la aplicación. Con proponer: true, " +
      "la IA propone lo que falta (ticket, costos, devoluciones, % a invertir) como «estimado» y NO se guarda: enséñaselo a la " +
      "persona y, para guardarlo, guardar_numeros_negocio.",
    inputSchema: {
      type: "object",
      properties: { cliente: clienteP, proponer: { type: "boolean", description: "true: además, la IA propone lo que falta (una llamada de IA; no guarda nada)." } },
      required: ["cliente"],
    },
    annotations: soloLectura,
  },
  {
    name: "guardar_numeros_negocio",
    description: "Guarda datos de los NÚMEROS DEL NEGOCIO de un cliente (los mismos campos y la misma limpieza que la ficha de la " +
      "aplicación). Sin confirmado: true NO guarda nada: devuelve cada cambio (de → a) y cómo queda el número mágico; enséñaselo a " +
      "la persona y, con su sí, vuelve a llamar con lo mismo, confirmado: true y el «antes» que te dio (así no se pisa lo que otra " +
      "persona guardó entre medias). Nunca pongas confirmado: true por tu cuenta, y nunca inventes un número: salen de la persona, " +
      "del cliente o de lo que propuso la IA en numeros_del_negocio (entonces con origen «estimado»). Los costos variables " +
      "reemplazan la lista entera.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP,
        datos: {
          type: "object",
          description: "Sólo lo que cambia. Los porcentajes van enteros (15 es el 15 %), el dinero en la moneda de la cuenta del cliente.",
          properties: {
            tipo: { type: "string", enum: TIPOS_NEGOCIO.map((t) => t.id), description: "Qué vende." },
            destino: { type: "string", enum: DESTINOS_NEGOCIO.map((d) => d.id), description: "Dónde se cierra la venta: whatsapp o web." },
            cuenta: { type: "string", enum: CUENTA_NEGOCIO.map((c) => c.id), description: "La cuenta publicitaria: nueva o con historial." },
            modo: { type: "string", enum: MODOS_EQUILIBRIO.map((m) => m.id), description: "Cómo se mide el equilibrio: negocio (todo el negocio) o plataforma (sólo la pauta)." },
            ...Object.fromEntries(CAMPOS_NEGOCIO.map((c) => [c.id, datoP(`${c.nombre}${c.unidad === "%" ? " (%)" : ""}: ${c.ayuda}`)])),
            costos: {
              type: "array",
              description: `Los costos variables en % de la venta neta (hasta ${MAX_COSTOS}): reemplazan la lista entera; [] la vacía.`,
              items: { type: "object", properties: { nombre: { type: "string" }, pct: { type: "number" }, origen: { type: "string", enum: ["cliente", "agencia", "estimado"] }, nota: { type: "string" } }, required: ["nombre", "pct"] },
            },
          },
        },
        origen: { type: "string", enum: ["cliente", "agencia", "estimado"], description: "De quién son los números que mandas sueltos: cliente (te los dio el cliente), agencia (los decidió la agencia) o estimado (los propuso la IA y nadie los confirmó). Por defecto, agencia." },
        antes: { type: "string", description: "El «antes» que devolvió la llamada sin confirmar (\"\" si no había nada guardado)." },
        confirmado: { type: "boolean", description: "Sólo con el sí de la persona, tras enseñarle los cambios." },
      },
      required: ["cliente", "datos"],
    },
    annotations: escribe,
  },
  {
    name: "escribir_textos_anuncios",
    description: "Escribe los TEXTOS de los anuncios del PLAN DE CAMPAÑAS de un mes con el motor de la agencia: cada uno con el nivel " +
      "de consciencia de su hueco y cómo hablarle, su ángulo de venta, la publicación escogida, los productos con su precio exacto, " +
      "lo que la agencia quiere lograr y la regla del anuncio. Con la publicación ya subida, sólo título y descripción (el texto " +
      "principal es su caption); subiendo la pieza, de 3 a 5 textos principales, títulos, descripción y botón. Es lo mismo que " +
      "«Escribir los textos» de Anuncios → Plan de campañas, y es MEJOR que escribirlos tú: úsala en vez de redactarlos a mano. Sin " +
      "hueco ni campana, escribe los que faltan (hasta 8 por llamada: si dice «Quedan N», vuelve a llamar con lo mismo). Guarda en el " +
      "plan y en los textos de anuncio de cada publicación SIN pisar lo que ya tenía; lo que escribió una persona no se reescribe " +
      "salvo con reescribir: true (sólo si la persona lo pidió). Devuelve los textos: enséñaselos a la persona para que los revise.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, mes: mesP,
        campana: { type: "string", enum: CAMPANAS_DEL_PLAN, description: "Sólo los anuncios de esa campaña." },
        hueco: { type: "string", description: "Sólo ese anuncio: su hueco de plan_de_campanas (p. ej. presentacion:a2)." },
        reescribir: { type: "boolean", description: "true: escribe otra vez los que ya tienen textos (también los de una persona). Con hueco o campana." },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
  {
    name: "ajustar_plan_campanas",
    description: "Cambia el PLAN DE CAMPAÑAS de un cliente y un mes, lo mismo que la pantalla Anuncios → Plan de campañas: «¿Qué vas a " +
      "hacer?» (qué campañas, de qué productos y lo que se quiere lograr), lo que va en un hueco de anuncio (una publicación del " +
      "cliente por su ID o «anuncio nuevo», cómo se monta y su ángulo de venta) y el reparto del presupuesto por etapa del cliente. " +
      "Los huecos y los ángulos se nombran como los da plan_de_campanas. «que» y los anuncios se guardan al momento; el REPARTO cambia " +
      "cómo se reparte el dinero de ese cliente TODOS los meses: sin confirmado: true no se guarda nada (te dice de qué a qué cambia; " +
      "enséñaselo a la persona y, con su sí, vuelve a llamar con confirmado: true; nunca lo pongas por tu cuenta). Devuelve el plan como " +
      "queda. Nada se crea en Meta: el plan se monta en el Ads Manager. Para los textos de los anuncios, escribir_textos_anuncios.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, mes: mesP,
        que: {
          type: "object",
          description: "«¿Qué vas a hacer?». Sólo lo que cambia: lo demás se queda como estaba.",
          properties: {
            campanas: { type: "array", items: { type: "string", enum: CAMPANAS_DEL_PLAN }, description: "Las campañas que se montan; [] = el ciclo completo que toca a la cuenta." },
            productos: { type: "string", enum: MODOS_PRODUCTOS.map((m) => m.id), description: "foco (un producto), varios o todos (el catálogo entero)." },
            producto_ids: { type: "array", items: { type: "string" }, description: "Los productos (su ID o su nombre del catálogo): uno con foco, varios con varios." },
            logro: { type: "string", description: "Lo que se quiere lograr este mes (lo lee la IA al escribir los textos)." },
          },
        },
        anuncio: huecoP,
        anuncios: { type: "array", items: huecoP, description: "Varios huecos a la vez (hasta 10), en vez de anuncio." },
        reparto: {
          description: "El reparto a mano por etapa en % enteros que suman 100 (presentacion, evaluacion, conversion, ascension); null vuelve al estándar del Manual. Pide confirmación.",
          anyOf: [
            { type: "object", properties: Object.fromEntries(ETAPAS_CICLO.map((e) => [e.id, { type: "number" }])), required: ETAPAS_CICLO.map((e) => e.id) },
            { type: "null" },
          ],
        },
        confirmado: { type: "boolean", description: "Sólo con el sí de la persona al reparto, tras enseñárselo." },
      },
      required: ["cliente"],
    },
    annotations: escribe,
  },
]);

// ------------------------------------------------------------
// En texto
// ------------------------------------------------------------

const nombreDe = (lista, id) => lista.find((x) => x.id === id)?.nombre ?? "";

/** Un dato de la ficha dicho: «20,00 US$ (Del cliente)», «7 % (Por defecto)» o «sin dato». */
function datoDicho(n, campo, { moneda = "USD", tasaDefecto } = {}) {
  const d = n[campo.id];
  const v = valoresDe(n, { tasaDefecto })[campo.id];
  const origen = origenDe(n, campo.id);
  if (!d && origen !== "defecto") return "sin dato";
  const valor = campo.unidad === "%" ? pct(v ?? 0) : dineroCorto(v, moneda);
  return `${valor} (${ORIGENES_DATO[origen] ?? origen}${d?.nota ? ` · ${d.nota}` : ""})`;
}
const costosDichos = (n) => (n.costos.length ? n.costos.map((c) => `${c.nombre} ${pct(c.pct)} (${ORIGENES_DATO[c.origen] ?? c.origen})`).join(", ") : "ninguno");

/** EL número mágico dicho, o lo que le falta. */
function magicoDicho(m, moneda) {
  if (m?.valor > 0) return `${dineroCorto(m.valor, moneda)} por ${m.resultado} (${m.nombreMetrica.toLowerCase()})`;
  return `sin número mágico todavía${m?.falta?.length ? ` (falta: ${m.falta.map((f) => f.id).join(", ")})` : ""}`;
}

/** La ficha entera en texto, para que Claude la relate. */
function fichaEnTexto(cliente, ficha, { medida = null } = {}) {
  const n = limpiarNegocio(ficha.negocio);
  const moneda = ficha.cuenta?.moneda || "USD";
  const op = { tasaDefecto: ficha.tasaDefecto };
  const m = ficha.numeroMagico;
  const l = [`NÚMEROS DEL NEGOCIO · ${cliente.name}`, "Las cuentas de la agencia: las mismas de la ficha, la revisión de campañas, el plan y el estratega. Usa ESTAS cifras."];

  l.push("", "EL NÚMERO MÁGICO (lo máximo que se puede pagar por un resultado sin perder dinero y respetando lo que se decidió invertir)");
  if (m?.valor > 0) {
    l.push(`· ${magicoDicho(m, moneda)} — ${m.limitadoPor === "objetivo" ? "lo que se decidió invertir, dentro del límite" : "el límite para no perder dinero"}.`);
    for (const x of m.explicacion ?? []) l.push(`  ${x}`);
    if (m.alarma) l.push(`· [!] ${m.textoAlarma}`);
    l.push("· Si un anuncio cuesta más que eso por resultado, se pierde dinero (o se gana menos de lo decidido). Lo usan la revisión 3Q, el plan de campañas y el informe.");
  } else {
    l.push("· Todavía no hay número mágico: sin él no se juzga ninguna campaña contra una cifra inventada. Lo que falta:");
    for (const f of m?.falta ?? []) l.push(`  - ${f.texto}`);
    l.push("  Pídeselo a la persona, o llama con proponer: true para que la IA proponga lo que falta (estimado, sin guardar).");
  }

  l.push("", "EL PERFIL");
  l.push(`· Vende: ${nombreDe(TIPOS_NEGOCIO, n.tipo) || "sin decir"} · cierra por: ${nombreDe(DESTINOS_NEGOCIO, n.destino) || "sin decir (se toma WhatsApp)"} · cuenta: ${nombreDe(CUENTA_NEGOCIO, n.cuenta) || "sin decir"} · equilibrio: ${nombreDe(MODOS_EQUILIBRIO, n.modo) || `${nombreDe(MODOS_EQUILIBRIO, n.destino === "web" ? "plataforma" : "negocio")} (el de su destino)`}`);

  l.push("", "LOS DATOS (cada uno con de dónde sale)");
  for (const c of CAMPOS_NEGOCIO) l.push(`· ${c.nombre}: ${datoDicho(n, c, { moneda, ...op })}`);
  l.push(`· Costos variables (% de la venta neta): ${costosDichos(n)}`);
  if (n.actualizado) l.push(`· Guardado el ${n.actualizado.slice(0, 10)}${n.por ? ` por ${n.por}` : ""}.`);

  const e = equilibrio(n, op);
  l.push("", "EL EQUILIBRIO (a partir de dónde se pierde dinero)");
  if (e.roas > 0) {
    l.push(`· Margen efectivo por venta: ${pct(e.margenEfectivo)} · ROAS de equilibrio: ${n2(e.roas)} (vender ${n2(e.roas)} veces lo que se invierte)`);
    l.push(`· Lo máximo por venta: ${dineroCorto(e.cac, moneda)} · por conversación: ${e.costoConversacion > 0 ? dineroCorto(e.costoConversacion, moneda) : "—"}`);
    if (e.presupuesto) l.push(`· Con el presupuesto de ${dineroCorto(e.presupuesto, moneda)} (${e.presupuestoDe === "negocio" ? "el escrito" : e.presupuestoDe === "objetivo" ? "la inversión que pide la meta" : "sin fijos: no depende del presupuesto"}).`);
    if (e.cargaTodosLosFijos) l.push("· Aviso: midiendo sólo la pauta y sin ventas de otros canales, la pauta carga sola todos los costos fijos.");
  } else {
    l.push(`· Sin calcular: falta ${e.faltan.map((id) => (id === "costos" ? "los costos variables" : CAMPO[id]?.nombre.toLowerCase() ?? id)).join(", ") || "algún dato"}.`);
  }

  const o = objetivo(n, op);
  l.push("", "CUÁNTO INVERTIR PARA LA META DEL MES");
  if (o.inversion > 0) {
    l.push(`· Meta ${dineroCorto(valoresDe(n, op).metaVentas, moneda)} → ${n2(o.ventasNecesarias, 1)} ventas · inversión del mes ${dineroCorto(o.inversion, moneda)} · ROAS objetivo ${n2(o.roas)} · por venta ${dineroCorto(o.costoCompra, moneda)}${o.costoConversacion > 0 ? ` · por conversación ${dineroCorto(o.costoConversacion, moneda)}` : ""}`);
    const reparto = repartoPorEtapas(o.inversion, { cuenta: n.cuenta, reparto: ficha.reparto?.reparto ?? null });
    if (reparto.length) l.push(`· Por etapa (${ficha.reparto?.aMano ? "el reparto a mano del cliente" : "el estándar del Manual"}): ${reparto.map((r) => `${r.nombre} ${pct(r.pct, 0)} = ${dineroCorto(r.monto, moneda)}`).join(" · ")}`);
  } else {
    l.push(`· Sin calcular: falta ${o.faltan.map((id) => CAMPO[id]?.nombre.toLowerCase() ?? id).join(", ")}.`);
  }
  for (const a of o.avisos) l.push(`· [!] ${a.texto}`);

  l.push("", "LA TASA DE CIERRE (de cada 100 conversaciones, cuántas compran)");
  l.push(`· Se usa ${pct(valoresDe(n, op).tasaCierre)} (${n.tasaCierre ? ORIGENES_DATO[n.tasaCierre.origen] : `la del Manual de campañas`}). La del Manual: ${pct(ficha.tasaDefecto)}.`);
  if (medida?.tasa != null) {
    const pm = medida.tasa * 100;
    if (medida.suficiente) {
      const conMedida = numeroMagicoDelCliente(conTasaMedida(n, { tasa: pm, ventas: medida.ventas, conversaciones: medida.conversaciones }), { tasaDefecto: ficha.tasaDefecto, nombre: cliente.name, moneda });
      const igual = n.tasaCierre?.origen === "medida" && Math.abs(n.tasaCierre.valor - pm) < 0.01;
      l.push(`· Medida por el enlace de ventas: ${pct(pm)} (${medida.ventas} ventas de ${medida.conversaciones} conversaciones).${igual ? " Es la guardada." : ` Con ella, el número mágico sería ${magicoDicho(conMedida, moneda)}: si la persona quiere, guárdala con guardar_numeros_negocio (tasaCierre: { valor: ${n2(pm)}, origen: "medida" }); el plan y la revisión usan la guardada.`}`);
    } else {
      l.push(`· Medida hasta ahora por el enlace de ventas: ${pct(pm)}, con pocos datos todavía: no sustituye a la de arriba.`);
    }
    if (medida.aviso) l.push(`· [!] ${medida.aviso}`);
  }

  l.push("", "LO DE META (últimos 30 días; sólo de referencia, no entra en las cuentas)");
  const lec = ficha.lectura;
  if (lec) {
    l.push(`· Gastó ${dineroCorto(lec.gasto, moneda)}${lec.conversaciones ? ` · ${lec.conversaciones} conversaciones a ${dineroCorto(lec.costoConversacion, moneda)} cada una` : ""}${lec.compras ? ` · ${lec.compras} compras (ROAS ${n2(lec.roas ?? 0)})` : ""}${lec.ctrUnico != null ? ` · CTR único ${pct(lec.ctrUnico, 2)}` : ""}${lec.cpm != null ? ` · CPM ${dineroCorto(lec.cpm, moneda)}` : ""}`);
    if (m?.valor > 0 && m.metrica === "conversacion" && lec.costoConversacion > 0) {
      l.push(`· Frente al número mágico: cada conversación costó ${dineroCorto(lec.costoConversacion, moneda)} contra ${dineroCorto(m.valor, moneda)} ${lec.costoConversacion > m.valor ? "→ POR ENCIMA: se pierde dinero" : "→ dentro"}.`);
    }
  } else {
    l.push(`· ${ficha.avisoMeta || "Sin cifras de Meta."}`);
  }

  const palancas = palancasDelEquilibrio(n, { ...op, moneda });
  if (palancas.length) {
    l.push("", "LAS 3 PALANCAS PARA MEJORAR EL EQUILIBRIO");
    for (const p of palancas) l.push(`· ${p.titulo}: ${p.texto}`);
  }
  return l.join("\n");
}

/** Lo que propuso la IA, en texto y con el pedido listo para guardar_numeros_negocio. */
function propuestaEnTexto(p, moneda) {
  const l = ["", "LO QUE PROPONE LA IA (estimado; NO SE GUARDÓ NADA)"];
  const datos = {};
  for (const [id, d] of Object.entries(p.datos ?? {})) {
    const c = CAMPO[id];
    l.push(`· ${c?.nombre ?? id}: ${c?.unidad === "%" ? pct(d.valor) : dineroCorto(d.valor, moneda)}${d.nota ? ` — ${d.nota}` : ""}`);
    datos[id] = d.valor;
  }
  if (p.costos?.length) {
    l.push(`· Costos variables: ${p.costos.map((c) => `${c.nombre} ${pct(c.pct)}${c.nota ? ` (${c.nota})` : ""}`).join("; ")}`);
    datos.costos = p.costos.map((c) => ({ nombre: c.nombre, pct: c.pct }));
  }
  if (p.ticketCatalogo) l.push(`· Promedio de los precios del catálogo: ${dineroCorto(p.ticketCatalogo.valor, moneda)} (${p.ticketCatalogo.precios} precios).`);
  for (const a of p.avisos ?? []) l.push(`· ${a}`);
  if (p.aviso) l.push(`· ${p.aviso}`);
  if (Object.keys(datos).length) {
    l.push("Enséñaselo a la persona. Si lo quiere, guardar_numeros_negocio con datos " + JSON.stringify(datos) +
      " y origen \"estimado\" (o \"cliente\"/\"agencia\" si la persona lo confirma), primero sin confirmado para que vea cómo queda el número mágico.");
  }
  return l.join("\n");
}

// ------------------------------------------------------------
// Las herramientas
// ------------------------------------------------------------

/** El mes pedido («2026-11») o el de hoy en Panamá; uno que no se entiende es un error del pedido. */
function mesDe(texto) {
  if (texto === undefined || texto === null || texto === "") return fechaEnZona().slice(0, 7);
  const m = mesDelPlan(texto)?.texto;
  if (!m) throw new ErrorCampanas(`No entiendo el mes «${texto}»: va como AAAA-MM.`);
  return m;
}

/** El cliente de un id de publicación cuando no llega `buscarPublicacion` (el del MCP). */
async function buscarEnCalendarios(acceso, postId) {
  const cals = await acceso.leer("calendars", {}, "year desc, month desc");
  for (const cal of cals) {
    let days = [];
    try { days = JSON.parse(cal.days ?? "[]"); } catch { days = []; }
    for (const d of Array.isArray(days) ? days : []) {
      const post = (d.posts ?? []).find((p) => p?.id === postId);
      if (post) return { cal, dia: d, post };
    }
  }
  throw new ErrorCampanas(`No encontré la publicación «${postId}». Usa ver_calendario para ver los IDs.`);
}

/** El reparto de un plan dicho: «Presentación 60 % · Evaluación 20 % …» (con su monto si hay inversión). */
function repartoDicho(r, inversion, moneda) {
  return ETAPAS_CICLO.map((e) => `${e.nombre} ${Number(r?.[e.id]) || 0} %${inversion ? ` (${dineroCorto((inversion * (Number(r?.[e.id]) || 0)) / 100, moneda)} al mes)` : ""}`).join(" · ");
}

/** `escribir_textos_anuncios` de un anuncio del plan, en texto. */
function anuncioEnTexto(c, a) {
  const cabeza = `${c.nombreEtapa.toUpperCase()} · anuncio ${a.n} [hueco ${a.slot}] — ${textoDeLaPieza(a) || "anuncio nuevo"}${a.pieza?.postId ? ` · publicación ${a.pieza.postId}` : ""} · nivel ${nombreDeNivel(a.nivel).toLowerCase()}${a.angulo?.nombre ? ` · ángulo «${a.angulo.nombre}»` : ""}`;
  const t = textosATexto(a.textos, { conCaption: a.como === "publicacion" ? a.caption || "(el de la publicación)" : "" });
  return `${cabeza}\n${t ? t.split("\n").map((x) => `   ${x}`).join("\n") : "   (sin textos)"}`;
}

/**
 * Las herramientas. `por`: la firma de quien escribe (la del MCP: «Claude (persona)», sin pestaña);
 * `buscarPublicacion(postId)` → { cal, dia, post } (la del MCP).
 */
export function crearHerramientasCampanas({ env, acceso, resolverCliente, usuario = null, por = null, buscarPublicacion = null }) {
  const firma = por ?? { userId: usuario?.id ?? "", nombre: `Claude (${usuario?.nombre ?? ""})`, tab: null };
  const quien = { id: usuario?.id ?? "", nombre: firma.nombre };
  const buscar = buscarPublicacion ?? ((id) => buscarEnCalendarios(acceso, id));
  /** Los errores del pedido (con `estado`: los de las rutas y la IA) vuelven a Claude con su motivo. */
  const conErrores = async (f) => {
    try { return await f(); } catch (e) {
      if (e?.estado && !(e instanceof ErrorCampanas)) throw new ErrorCampanas(e.message);
      throw e;
    }
  };
  async function cuentaDe(c) {
    const { clienteYCuenta } = await import("./anuncios.js");
    return (await clienteYCuenta(acceso, c.id, { exigirCuenta: false })).cuenta;
  }
  /** La tasa de cierre medida por el enlace de ventas (`tasaDeCierreMedida`), o null si el cliente no apuntó nada. */
  async function tasaMedida(c) {
    const hay = await acceso.leerColumnas("ventas_semana", ["id"], { client_id: c.id }, "semana desc", 1).catch(() => []);
    if (!hay.length) return null;
    try {
      const { ventasDelCliente } = await import("./ventas.js");
      return (await ventasDelCliente(env, acceso, c.id))?.resumen?.tasa ?? null;
    } catch (e) {
      console.warn("numeros_del_negocio: las ventas no respondieron", e?.message);
      return null;
    }
  }

  return {
    async numeros_del_negocio({ cliente, proponer = false } = {}) {
      const c = await resolverCliente(cliente);
      if (proponer === true && usuario?.soloLectura) throw new ErrorCampanas("Tu papel es de sólo lectura: la propuesta de la IA cuesta y sólo la pide quien puede cambiar los números.");
      const { fichaDeNegocio, proponerNegocio } = await import("./negocio.js");
      const cuenta = await cuentaDe(c);
      // Lo de Meta nunca bloquea la ficha: si falla, sin cifras de Meta y con su motivo.
      let ficha;
      try {
        ficha = await fichaDeNegocio(env, acceso, c, cuenta);
      } catch (e) {
        console.warn("numeros_del_negocio: Meta no respondió", e?.message);
        ficha = { ...(await fichaDeNegocio(env, acceso, c, cuenta, { meta: false })), avisoMeta: "Meta no respondió: la ficha va sin sus cifras." };
      }
      const medida = await tasaMedida(c);
      let texto = fichaEnTexto(c, ficha, { medida });
      if (proponer === true) {
        const p = await conErrores(() => proponerNegocio(env, acceso, c, ficha.negocio));
        texto += `\n${propuestaEnTexto(p, ficha.cuenta?.moneda || "USD")}`;
      }
      return texto;
    },

    async guardar_numeros_negocio({ cliente, datos, origen = "agencia", antes, confirmado = false } = {}) {
      const c = await resolverCliente(cliente);
      if (!datos || typeof datos !== "object" || Array.isArray(datos) || !Object.keys(datos).length) throw new ErrorCampanas("Di qué datos cambian (datos: { ticket: 25, … }).");
      if (!["cliente", "agencia", "estimado"].includes(origen)) throw new ErrorCampanas("«origen» es cliente, agencia o estimado.");
      const { leerNegocio, tasaDelManual, guardarNegocioSinPisar } = await import("./negocio.js");
      const [actual, tasaDefecto, cuenta] = await Promise.all([leerNegocio(acceso, c.id), tasaDelManual(acceso), cuentaDe(c)]);
      const moneda = cuenta?.moneda || "USD";

      // Lo que llega, sobre lo guardado: sólo cambia lo que se nombra (null lo quita).
      const PERFIL = { tipo: TIPOS_NEGOCIO, destino: DESTINOS_NEGOCIO, cuenta: CUENTA_NEGOCIO, modo: MODOS_EQUILIBRIO };
      const junto = { ...actual };
      const avisos = [];
      const ignorados = [];
      for (const [k, v] of Object.entries(datos)) {
        if (PERFIL[k]) {
          if (v === null || v === "") { junto[k] = ""; continue; }
          if (!PERFIL[k].some((x) => x.id === v)) throw new ErrorCampanas(`«${k}» es uno de: ${PERFIL[k].map((x) => x.id).join(", ")}.`);
          junto[k] = v;
        } else if (CAMPO[k]) {
          if (v === null) { delete junto[k]; continue; }
          const d = v && typeof v === "object" ? { ...v, origen: v.origen ?? origen } : { valor: v, origen };
          junto[k] = d;
          const aviso = avisoDeFraccion(k, d.valor);
          if (aviso) avisos.push(`${CAMPO[k].nombre}: ${aviso}`);
        } else if (k === "costos") {
          if (!Array.isArray(v)) throw new ErrorCampanas("«costos» es una lista: [{ nombre, pct }].");
          if (v.length > MAX_COSTOS) throw new ErrorCampanas(`Como mucho ${MAX_COSTOS} costos variables.`);
          junto.costos = v.map((x) => ({ ...(x && typeof x === "object" ? x : {}), origen: x?.origen ?? origen }));
        } else {
          ignorados.push(k);
        }
      }
      const nuevo = limpiarNegocio(junto);
      // Lo que no se entiende se quitaría en silencio: mejor decirlo.
      for (const [k, v] of Object.entries(datos)) {
        if (CAMPO[k] && v !== null && !nuevo[k]) throw new ErrorCampanas(`No entiendo «${typeof v === "object" ? JSON.stringify(v) : v}» como ${CAMPO[k].nombre.toLowerCase()}: va un número.`);
      }
      if (Array.isArray(datos.costos) && nuevo.costos.length !== datos.costos.length) throw new ErrorCampanas("Cada costo variable lleva su nombre y su % (un número): alguno no se entendió.");

      // Lo que cambia, de → a.
      const cambios = [];
      for (const [k, lista] of Object.entries(PERFIL)) {
        if (actual[k] !== nuevo[k]) cambios.push(`· ${{ tipo: "Vende", destino: "Cierra por", cuenta: "Cuenta publicitaria", modo: "Equilibrio" }[k]}: ${nombreDe(lista, actual[k]) || "sin decir"} → ${nombreDe(lista, nuevo[k]) || "sin decir"}`);
      }
      for (const campo of CAMPOS_NEGOCIO) {
        const a = actual[campo.id];
        const b = nuevo[campo.id];
        if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
        cambios.push(`· ${campo.nombre}: ${datoDicho(actual, campo, { moneda, tasaDefecto })} → ${datoDicho(nuevo, campo, { moneda, tasaDefecto })}`);
      }
      if (JSON.stringify(actual.costos) !== JSON.stringify(nuevo.costos)) cambios.push(`· Costos variables: ${costosDichos(actual)} → ${costosDichos(nuevo)}`);
      const extra = [
        ...avisos.map((a) => `· [!] ${a}`),
        ignorados.length ? `· No se entendió (no se guarda): ${ignorados.join(", ")}. Los campos son: tipo, destino, cuenta, modo, ${CAMPOS_NEGOCIO.map((x) => x.id).join(", ")} y costos.` : "",
      ].filter(Boolean);
      if (!cambios.length) return [`No cambia nada en los números de ${c.name}: ya está así.`, ...extra].join("\n");

      const op = { tasaDefecto, nombre: c.name, moneda };
      const antesM = numeroMagicoDelCliente(actual, op);
      const despuesM = numeroMagicoDelCliente(nuevo, op);
      const magico = `El número mágico: ${magicoDicho(antesM, moneda)} → ${magicoDicho(despuesM, moneda)}.${despuesM.alarma ? ` [!] ${despuesM.textoAlarma}` : ""}`;

      if (confirmado !== true) {
        return [
          "NO SE GUARDÓ NADA.",
          `Esto cambiaría en los números del negocio de ${c.name}:`,
          ...cambios,
          magico,
          ...extra,
          "",
          `Enséñaselo a la persona y, con su sí, vuelve a llamar con lo mismo, confirmado: true y antes: "${actual.actualizado ?? ""}".`,
        ].join("\n");
      }

      const r = await guardarNegocioSinPisar(acceso, c.id, nuevo, quien, antes === undefined ? {} : { antes: antes || null });
      if (r.conflicto) throw new ErrorCampanas(`${r.conflicto} (Vuelve a llamar sin confirmado para ver lo de ahora.)`);
      difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: c.id, por: firma });
      return [
        `Guardado en los números del negocio de ${c.name}:`,
        ...cambios,
        magico,
        ...extra,
        "La revisión de campañas, el plan de campañas y el estratega ya usan estos números.",
      ].join("\n");
    },

    async escribir_textos_anuncios({ cliente, mes, campana, hueco, reescribir = false } = {}) {
      const c = await resolverCliente(cliente);
      const m = mesDe(mes);
      if (campana && !CAMPANAS_DEL_PLAN.includes(campana)) throw new ErrorCampanas(`«campana» es una de: ${CAMPANAS_DEL_PLAN.join(", ")}.`);
      const cuenta = await cuentaDe(c);
      const { cicloDelCliente, escribirTextosDelPlan } = await import("./planCampanas.js");
      const { plan } = await cicloDelCliente(env, acceso, c, m, { cuenta });
      const enPlan = (id) => plan.campanas.find((x) => x.id === id);
      if (campana && !enPlan(campana)) throw new ErrorCampanas(`La campaña de ${nombreDeEtapaDelPlan(campana).toLowerCase()} no está en el plan de ${m}. Están: ${plan.campanas.map((x) => x.id).join(", ")}.`);
      const campanas = campana ? [enPlan(campana)] : plan.campanas;
      const porProducir = campanas.flatMap((x) => Array.from({ length: x.anunciosPorConjunto }, (_, i) => (anuncioEn(x, i + 1) ? null : idDeHueco(x.id, i + 1))).filter(Boolean));

      let slots;
      if (hueco) {
        const h = huecoDeId(hueco);
        const k = h && enPlan(h.campana);
        if (!h) throw new ErrorCampanas(`«${hueco}» no es un hueco: van como presentacion:a2 (los da plan_de_campanas).`);
        if (!k || h.n > k.anunciosPorConjunto) throw new ErrorCampanas(`El hueco ${hueco} no está en el plan de ${m}. Usa plan_de_campanas para ver los huecos.`);
        const a = anuncioEn(k, h.n);
        if (!a) throw new ErrorCampanas(`El hueco ${hueco} está por producir: escoge antes qué va (una publicación o «anuncio nuevo») con ajustar_plan_campanas.`);
        if (a.editado && reescribir !== true) throw new ErrorCampanas(`Los textos de ${hueco} los escribió una persona: sólo se reescriben con reescribir: true, si la persona lo pidió.`);
        slots = [a.slot];
      } else if (reescribir === true) {
        if (!campana) throw new ErrorCampanas("Para reescribir, di qué campaña (campana) o qué anuncio (hueco).");
        slots = campanas.flatMap((x) => x.anuncios.map((a) => a.slot));
      } else {
        slots = campanas.flatMap((x) => x.anuncios.filter((a) => faltanTextos(a) && !a.editado).map((a) => a.slot));
      }
      if (!slots.length) {
        return [
          `No hay anuncios sin textos en el plan de ${c.name} de ${m}${campana ? ` (campaña de ${nombreDeEtapaDelPlan(campana).toLowerCase()})` : ""}.`,
          porProducir.length ? `Por producir (sin publicación escogida): ${porProducir.join(", ")}. Escoge qué va en cada uno con ajustar_plan_campanas.` : "",
          "Para escribir otra vez los de una campaña: campana y reescribir: true (sólo si la persona lo pidió).",
        ].filter(Boolean).join("\n");
      }

      const tanda = slots.slice(0, MAX_TEXTOS_POR_LLAMADA);
      const r = await conErrores(() => escribirTextosDelPlan(env, acceso, c, m, tanda, { cuenta, reescribir: reescribir === true, usuario: quien, por: firma }));
      difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: c.id, por: firma });

      const { plan: nuevo } = await cicloDelCliente(env, acceso, c, m, { cuenta });
      const deTanda = nuevo.campanas.flatMap((x) => x.anuncios.filter((a) => tanda.includes(a.slot)).map((a) => ({ x, a })));
      const escritos = deTanda.filter(({ a }) => !faltanTextos(a)).map(({ x, a }) => anuncioEnTexto(x, a));
      // Lo que la IA no devolvió se dice: volver a llamar lo reintenta (y no se confunde con «quedan»).
      const sinVolver = deTanda.filter(({ a }) => faltanTextos(a)).map(({ a }) => a.slot);
      const quedan = hueco || reescribir === true
        ? 0
        : (campana ? nuevo.campanas.filter((x) => x.id === campana) : nuevo.campanas).flatMap((x) => x.anuncios.filter((a) => faltanTextos(a) && !a.editado && !tanda.includes(a.slot))).length;
      return [
        `Escritos los textos de ${r.escritos} ${r.escritos === 1 ? "anuncio" : "anuncios"} del plan de ${c.name} (${nuevo.nombreMes}). Se guardaron en el plan${r.enPublicaciones ? ` y en los textos de anuncio de ${r.enPublicaciones} ${r.enPublicaciones === 1 ? "publicación" : "publicaciones"} (sin pisar lo que ya tenían)` : ""}.`,
        r.aviso ? `Aviso: ${r.aviso}` : "",
        "",
        ...escritos,
        "",
        sinVolver.length ? `La IA no devolvió textos completos de: ${sinVolver.join(", ")}. Vuelve a llamar para reintentarlo.` : "",
        quedan ? `Quedan ${quedan} sin textos: vuelve a llamar a escribir_textos_anuncios con lo mismo.` : "",
        porProducir.length ? `Por producir (sin publicación escogida): ${porProducir.join(", ")}.` : "",
        "Enséñaselos a la persona para que los revise antes de montarlos en el Ads Manager. Para otra versión de uno: hueco y reescribir: true.",
      ].filter((x, i, t) => x !== "" || t[i - 1] !== "").join("\n").trim();
    },

    async ajustar_plan_campanas({ cliente, mes, que, anuncio, anuncios, reparto, confirmado = false } = {}) {
      const c = await resolverCliente(cliente);
      const m = mesDe(mes);
      const conReparto = reparto !== undefined;
      const huecos = [...(anuncio ? [anuncio] : []), ...(Array.isArray(anuncios) ? anuncios : [])];
      if (huecos.length > 10) throw new ErrorCampanas("Como mucho 10 huecos por llamada.");
      if (!que && !huecos.length && !conReparto) throw new ErrorCampanas("Di qué cambiar: que, anuncio (o anuncios) o reparto.");
      const cuenta = await cuentaDe(c);
      const moneda = cuenta?.moneda || "USD";
      const { cicloDelCliente, leerGuardado, guardarCiclo, guardarReparto, errorDeReparto, textoDelPlan } = await import("./planCampanas.js");
      const { plan } = await cicloDelCliente(env, acceso, c, m, { cuenta });
      const lineas = [];

      // «¿Qué vas a hacer?»: sólo cambia lo que se nombra.
      let ajustes;
      if (que !== undefined) {
        if (!que || typeof que !== "object") throw new ErrorCampanas("«que» es { campanas, productos, producto_ids, logro }.");
        const guardado = await leerGuardado(acceso, c.id, m);
        const antesQue = limpiarQue(guardado.ajustes.que);
        const x = { ...antesQue };
        if (que.campanas !== undefined) {
          if (!Array.isArray(que.campanas) || que.campanas.some((k) => !CAMPANAS_DEL_PLAN.includes(k))) throw new ErrorCampanas(`«campanas» es una lista de: ${CAMPANAS_DEL_PLAN.join(", ")} ([] = el ciclo completo).`);
          x.campanas = que.campanas;
        }
        if (que.productos !== undefined) {
          if (!MODOS_PRODUCTOS.some((p) => p.id === que.productos)) throw new ErrorCampanas(`«productos» es ${MODOS_PRODUCTOS.map((p) => p.id).join(", ")}.`);
          x.productos = que.productos;
          if (que.productos === "todos") x.productoIds = [];
        }
        const ids = que.producto_ids ?? que.productoIds;
        if (ids !== undefined) {
          const catalogo = plan.catalogo ?? [];
          x.productoIds = (Array.isArray(ids) ? ids : [ids]).map((id) => {
            const p = catalogo.find((k) => k.id === id) ?? catalogo.find((k) => sinTildes(k.nombre) === sinTildes(id));
            if (!p) throw new ErrorCampanas(`«${id}» no está en el catálogo de ${c.name}${catalogo.length ? `: ${catalogo.map((k) => `${k.nombre} (${k.id})`).join(", ")}` : " (no tiene catálogo)"}.`);
            return p.id;
          });
        }
        if (x.productos === "foco") x.productoIds = x.productoIds.slice(0, 1);
        if (que.logro !== undefined) x.logro = String(que.logro ?? "");
        const limpio = limpiarQue(x);
        if (JSON.stringify(limpio) !== JSON.stringify(antesQue)) {
          ajustes = { ...guardado.ajustes, que: limpio };
          lineas.push(`· ¿Qué vas a hacer?: ${limpio.campanas.length ? `sólo ${limpio.campanas.map((k) => nombreDeEtapaDelPlan(k).toLowerCase()).join(", ")}` : "el ciclo completo"} · ${nombreDe(MODOS_PRODUCTOS, limpio.productos).toLowerCase()}${limpio.productoIds.length ? ` (${limpio.productoIds.map((id) => (plan.catalogo ?? []).find((k) => k.id === id)?.nombre ?? id).join(", ")})` : ""}${limpio.logro ? ` · lo que se quiere lograr: ${limpio.logro}` : ""}`);
        }
      }

      // Los huecos de anuncio: lo mismo que «Cambiar», «Anuncio nuevo», «Cómo se monta» y el ángulo de la pantalla.
      const cambiosAnuncios = {};
      for (const e of huecos) {
        const h = huecoDeId(e?.hueco);
        if (!h) throw new ErrorCampanas(`«${e?.hueco ?? ""}» no es un hueco: van como presentacion:a2 (los da plan_de_campanas).`);
        const k = plan.campanas.find((x) => x.id === h.campana);
        if (!k || h.n > k.anunciosPorConjunto) throw new ErrorCampanas(`El hueco ${e.hueco} no está en el plan de ${m}${k ? ` (la campaña tiene ${k.anunciosPorConjunto} anuncios)` : `: las campañas son ${plan.campanas.map((x) => x.id).join(", ")}`}.`);
        const slot = idDeHueco(h.campana, h.n);
        if (e.sugerido === true) { cambiosAnuncios[slot] = null; lineas.push(`· ${slot}: vuelve a lo que sugiere el plan.`); continue; }
        const entrada = {};
        const dicho = [];
        if (e.publicacion_id && e.nuevo === true) throw new ErrorCampanas(`${slot}: o una publicación o «anuncio nuevo», no las dos.`);
        if (e.publicacion_id) {
          const { cal, post } = await buscar(String(e.publicacion_id));
          if (cal.client_id !== c.id) throw new ErrorCampanas(`La publicación ${e.publicacion_id} no es de ${c.name}.`);
          if (post.format === "live") throw new ErrorCampanas("Un directo no se pauta: escoge otra publicación.");
          entrada.pieza = { calendarId: cal.id, postId: post.id };
          dicho.push(`la publicación «${post.title || post.idea || post.id}»`);
        } else if (e.nuevo === true) {
          entrada.nuevo = true;
          dicho.push("anuncio nuevo (sin publicación)");
        }
        if (e.como !== undefined) {
          if (!["publicacion", "subir"].includes(e.como)) throw new ErrorCampanas("«como» es publicacion o subir.");
          entrada.como = e.como;
          // Como la pantalla: cambiar sólo el modo fija la pieza que tiene el hueco.
          const a = anuncioEn(k, h.n);
          if (!entrada.pieza && !entrada.nuevo && a?.pieza) entrada.pieza = { calendarId: a.pieza.calendarId, postId: a.pieza.postId };
          dicho.push(e.como === "publicacion" ? "se monta con la publicación ya subida" : "se monta subiendo la pieza");
        }
        if (e.angulo !== undefined) {
          const v = e.angulo;
          if (v === null || sinTildes(v) === "sugerido") { entrada.angulo = null; dicho.push("el ángulo que sugiere el plan"); }
          else if (v === false || sinTildes(v) === "ninguno") { entrada.angulo = false; dicho.push("sin ángulo"); }
          else {
            const pool = plan.angulos ?? [];
            const x = pool.find((a) => claveAngulo(a) === String(v)) ?? pool.find((a) => sinTildes(a.nombre) === sinTildes(v));
            if (!x) throw new ErrorCampanas(`No hay un ángulo «${v}» en el estudio aprobado${pool.length ? `. Los que hay: ${pool.map((a) => `«${a.nombre}» [${claveAngulo(a)}]`).join(", ")}` : " (no tiene ángulos aprobados)"}.`);
            entrada.angulo = { productoId: x.productoId, id: x.id, nombre: x.nombre };
            dicho.push(`ángulo «${x.nombre}»`);
          }
        }
        if (!Object.keys(entrada).length) throw new ErrorCampanas(`${slot}: di qué cambia (publicacion_id, nuevo, como, angulo o sugerido).`);
        cambiosAnuncios[slot] = entrada;
        lineas.push(`· ${slot}: ${dicho.join(" · ")}.`);
      }

      const antes = plan.repartoBase ?? REPARTO_POR_DEFECTO;
      if (conReparto) {
        const fallo = errorDeReparto(reparto);
        if (fallo) throw new ErrorCampanas(fallo);
      }
      // Volver al estándar sin tenerlo a mano, o el mismo reparto que ya tiene, no cambia nada (y no pregunta).
      const mismoReparto = conReparto && (reparto === null ? !plan.repartoAMano : plan.repartoAMano && ETAPAS_CICLO.every((e) => Number(reparto[e.id]) === Number(antes[e.id])));
      if (conReparto && !mismoReparto) {
        const linea = reparto === null
          ? `· Reparto de ${c.name}: ${repartoDicho(antes, plan.inversion, moneda)} (a mano) → el estándar del Manual (${repartoDicho(REPARTO_POR_DEFECTO, null, moneda)}).`
          : `· Reparto de ${c.name}: ${repartoDicho(antes, plan.inversion, moneda)} (${plan.repartoAMano ? "a mano" : "el estándar del Manual"}) → ${repartoDicho(reparto, plan.inversion, moneda)}. Se queda para los meses siguientes hasta volver al estándar.`;
        if (confirmado !== true) {
          return [
            "NO SE GUARDÓ NADA.",
            `Esto cambiaría en el plan de campañas de ${c.name} (${plan.nombreMes}):`,
            linea,
            ...lineas,
            "",
            "El reparto cambia cómo se reparte el dinero de este cliente TODOS los meses. Enséñaselo a la persona y, con su sí, vuelve a llamar con lo mismo y confirmado: true.",
          ].join("\n");
        }
        await guardarReparto(acceso, c.id, reparto);
        lineas.unshift(linea);
      }
      if (ajustes || Object.keys(cambiosAnuncios).length) {
        await guardarCiclo(acceso, c, m, { ...(ajustes ? { ajustes } : {}), ...(Object.keys(cambiosAnuncios).length ? { anuncios: cambiosAnuncios } : {}) }, quien);
      }
      const despues = await cicloDelCliente(env, acceso, c, m, { cuenta });
      const texto = textoDelPlan(despues.plan, despues.avance);
      if (!lineas.length) return `No cambia nada en el plan de ${c.name} de ${m}: ya está así.\n\n${texto}`;
      difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: c.id, por: firma });
      // «Con la publicación ya subida» sólo vale si la publicación salió (o va a salir): si no, el plan la monta subiendo la pieza.
      const notas = Object.entries(cambiosAnuncios).filter(([, v]) => v?.como === "publicacion").flatMap(([slot]) => {
        const h = huecoDeId(slot);
        const a = anuncioEn(despues.plan.campanas.find((x) => x.id === h.campana), h.n);
        return a && a.como !== "publicacion" ? [`· ${slot}: esa publicación todavía no se puede usar ya subida (no ha salido ni tiene día): se monta subiendo la pieza.`] : [];
      });
      return [`Guardado en el plan de campañas de ${c.name}:`, ...lineas, ...notas, "", "EL PLAN COMO QUEDA:", "", texto].join("\n");
    },
  };
}
