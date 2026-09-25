// ============================================================
// Lo que la sección de IA de Ajustes necesita saber
//
//   · /api/ia/modelos: qué modelos tiene la cuenta de Anthropic y cuál
//     se usaría con la configuración actual. Es la respuesta a «¿cuál es
//     el más potente que tengo?», sacada de la cuenta y no supuesta.
//   · /api/ia/consumo: lo que costó la IA en un mes, por función, modelo,
//     proveedor, día y cliente, y las llamadas más caras.
//   · /api/ia/gasto: lo justo para el medidor de la cabecera —gastado,
//     presupuesto y estado—. Se pide en cada pulso: una sola suma.
// ============================================================

import { json, error } from "../lib/respuesta.js";
import {
  modelosDeLaCuenta, leerConfigIA, resolverIA, etiquetaModelo,
  gastoDelMes, estadoPresupuesto, mesActual,
} from "../lib/configIA.js";

export async function rutaGasto(req, env, { acceso }) {
  const config = await leerConfigIA(acceso);
  const mes = mesActual();
  const total = await gastoDelMes(acceso, mes);
  return json({
    mes,
    total,
    presupuesto: config.presupuesto_usd,
    alLimite: config.al_limite,
    ...estadoPresupuesto(total, config.presupuesto_usd),
  });
}

export async function rutaModelos(req, env, { acceso }) {
  if (!env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);
  const ids = await modelosDeLaCuenta(env);
  const config = await leerConfigIA(acceso);
  const ia = await resolverIA(env, config);
  return json({
    disponibles: (ids ?? []).map((id) => ({ id, nombre: etiquetaModelo(id) })),
    listaCompleta: Boolean(ids),
    enUso: { id: ia.modelo, nombre: etiquetaModelo(ia.modelo), esfuerzo: ia.esfuerzo, aviso: ia.aviso },
  });
}

export async function rutaConsumo(req, env, { acceso }) {
  const url = new URL(req.url);
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get("mes") ?? "")
    ? url.searchParams.get("mes")
    : mesActual();
  const [filas, config, clientes] = await Promise.all([
    acceso.leer("consumo_ia", { mes }, "created_at asc"),
    leerConfigIA(acceso),
    acceso.leer("clients", {}, "name asc"),
  ]);
  const nombres = new Map(clientes.map((c) => [c.id, c.name]));

  const sumar = (clave) => {
    const grupos = new Map();
    for (const f of filas) {
      const k = f[clave] || (clave === "client_id" ? "" : "otro");
      const nombre = clave === "modelo" ? etiquetaModelo(k)
        : clave === "client_id" ? (k ? nombres.get(k) ?? "Cliente borrado" : "Sin cliente")
        : k;
      const g = grupos.get(k) ?? { id: k, nombre, llamadas: 0, costo: 0, entrada: 0, salida: 0 };
      g.llamadas += 1;
      g.costo += Number(f.costo_usd ?? 0);
      g.entrada += Number(f.entrada ?? 0) + Number(f.cache_leido ?? 0) + Number(f.cache_escrito ?? 0);
      g.salida += Number(f.salida ?? 0);
      grupos.set(k, g);
    }
    return [...grupos.values()].sort((a, b) => b.costo - a.costo);
  };

  // Un punto por día del mes, aunque ese día no se gastara nada: una
  // gráfica con huecos esconde justo los días tranquilos.
  const [anio, numMes] = mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const porDia = Array.from({ length: diasDelMes }, (_, i) => ({
    dia: `${mes}-${String(i + 1).padStart(2, "0")}`, costo: 0, llamadas: 0,
  }));
  for (const f of filas) {
    // Los apuntes de antes de 0010 no traen día: sale del instante UTC.
    const dia = f.dia || String(f.created_at ?? "").slice(0, 10);
    const punto = porDia[Number(dia.slice(8, 10)) - 1];
    if (punto && dia.startsWith(mes)) {
      punto.costo += Number(f.costo_usd ?? 0);
      punto.llamadas += 1;
    }
  }

  const total = filas.reduce((s, f) => s + Number(f.costo_usd ?? 0), 0);
  return json({
    mes,
    total,
    llamadas: filas.length,
    busquedas: filas.reduce((s, f) => s + Number(f.busquedas ?? 0), 0),
    presupuesto: config.presupuesto_usd,
    alLimite: config.al_limite,
    ...estadoPresupuesto(total, config.presupuesto_usd),
    porFuncion: sumar("funcion"),
    porModelo: sumar("modelo"),
    porProveedor: sumar("proveedor"),
    porCliente: sumar("client_id"),
    porDia,
    masCaras: [...filas]
      .sort((a, b) => Number(b.costo_usd ?? 0) - Number(a.costo_usd ?? 0))
      .slice(0, 10)
      .map((f) => ({
        fecha: f.created_at,
        funcion: f.funcion,
        modelo: etiquetaModelo(f.modelo),
        cliente: f.client_id ? nombres.get(f.client_id) ?? "Cliente borrado" : "",
        entrada: Number(f.entrada ?? 0) + Number(f.cache_leido ?? 0) + Number(f.cache_escrito ?? 0),
        salida: Number(f.salida ?? 0),
        busquedas: Number(f.busquedas ?? 0),
        costo: Number(f.costo_usd ?? 0),
      })),
  });
}
