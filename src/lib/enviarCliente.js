// ============================================================
// «Enviar a cliente»: el enlace por WhatsApp y cuándo lo abrió (puro)
//
// Lo usa el diálogo de enviar (calendario/EnviarCliente.jsx, en diferido): no entra en la carga inicial.
// ============================================================

/**
 * El número de WhatsApp de la ficha del cliente, sólo con dígitos y con su código de país, o "" si no hay. Acepta lo
 * que se escribe a mano («+507 6123-4567», «6123 4567», un enlace wa.me). Un número de 8 cifras es de Panamá (la
 * agencia trabaja allí): se le pone el 507. Pura.
 */
export function numeroWhatsApp(valor = "") {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  const deEnlace = texto.match(/wa\.me\/(\d+)/i)?.[1] ?? texto.match(/phone=(\d+)/i)?.[1];
  const digitos = (deEnlace ?? texto).replace(/\D/g, "");
  if (digitos.length === 8) return `507${digitos}`;
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : "";
}

/** «Abrir en WhatsApp»: wa.me con el número (si lo hay) y el mensaje ya escrito. Pura. */
export function enlaceWhatsApp(numero = "", mensaje = "") {
  const n = numeroWhatsApp(numero);
  return `https://wa.me/${n}?text=${encodeURIComponent(String(mensaje ?? ""))}`;
}

const ZONA = "America/Panama";
const diaEnZona = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const horaEnZona = (d) => new Intl.DateTimeFormat("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }).format(d);

/**
 * Cuándo abrió el cliente su enlace, dicho como se dice: «hoy a las 9:12 a. m.», «ayer a las…», «el martes a las…» (en
 * la última semana) o «el 3 de noviembre a las…». La hora es la de Panamá. "" si no hay. Pura.
 */
export function cuandoLoAbrio(iso, ahora = new Date()) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const hoy = diaEnZona(ahora);
  const ayer = diaEnZona(new Date(ahora.getTime() - 86_400_000));
  const dia = diaEnZona(d);
  const hora = `a las ${horaEnZona(d)}`;
  if (dia === hoy) return `hoy ${hora}`;
  if (dia === ayer) return `ayer ${hora}`;
  if (ahora.getTime() - t < 6 * 86_400_000) {
    return `el ${new Intl.DateTimeFormat("es-PA", { timeZone: ZONA, weekday: "long" }).format(d)} ${hora}`;
  }
  return `el ${new Intl.DateTimeFormat("es-PA", { timeZone: ZONA, day: "numeric", month: "long" }).format(d)} ${hora}`;
}
