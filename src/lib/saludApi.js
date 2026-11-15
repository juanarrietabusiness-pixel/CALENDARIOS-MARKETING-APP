// ============================================================
// Cliente de /api/salud y de los avisos en el teléfono (/api/avisos/push)
//
// Lo carga sólo Ajustes → Salud y avisos (en diferido): ni la salud ni la suscripción a los avisos entran en la carga
// inicial. Suscribirse pide el permiso de notificaciones, se suscribe con la llave pública VAPID del servidor (el
// service worker de siempre, public/sw.js, enseña lo que llega) y le manda al servidor su dirección y sus llaves.
// ============================================================

import { pedir } from "./db";

const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });

/** Las tareas del cron, los proveedores y las integraciones (sólo el administrador). */
export const leerSalud = () => pedir("/salud");
/** Los saldos que se leen gratis (Kie, ElevenLabs). `otraVez`: sin lo recordado. */
export const leerSaldos = (otraVez = false) => pedir(`/salud/saldos${otraVez ? "?otraVez=1" : ""}`);

/** ¿Este navegador puede recibir avisos (service worker, PushManager y notificaciones)? */
export function soportaPush() {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** ¿Es un iPhone o iPad con la aplicación SIN instalar? Ahí los avisos sólo funcionan desde la pantalla de inicio. */
export function esIPhoneSinInstalar() {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) || navigator.standalone === true;
  return ios && !instalada;
}

/** Un nombre corto para el dispositivo («iPhone · Safari»): sólo para reconocerlo en la lista. */
export function nombreDelDispositivo(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const sistema = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const navegador = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

/** La llave pública (base64url) como la pide `pushManager.subscribe`. Pura. */
export function llaveDeBase64Url(texto) {
  const b = String(texto ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro() {
  // main.jsx ya lo registra al cargar; si aún no, se registra aquí (es el mismo /sw.js).
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

/**
 * Cómo está ESTE dispositivo: { soportado, permiso («default», «granted», «denied»), suscrito, dispositivos (los de
 * esta persona en el servidor), clave }. Si el navegador está suscrito y el servidor no lo tiene (otra persona entró,
 * se borró), se lo vuelve a mandar.
 */
export async function estadoPush() {
  const servidor = await pedir("/avisos/push");
  if (!soportaPush()) return { soportado: false, permiso: "default", suscrito: false, ...servidor };
  const reg = await registro().catch(() => null);
  const sus = await reg?.pushManager?.getSubscription?.().catch(() => null);
  let suscrito = false;
  if (sus && Notification.permission === "granted") {
    suscrito = servidor.dispositivos?.some((d) => d.endpoint === sus.endpoint) ?? false;
    if (!suscrito) {
      await pedir("/avisos/push", post({ ...sus.toJSON(), dispositivo: nombreDelDispositivo() }));
      suscrito = true;
    }
  }
  return { soportado: true, permiso: Notification.permission, suscrito, ...servidor };
}

/** Pide el permiso, suscribe este dispositivo y se lo dice al servidor. Lanza con un motivo para la persona. */
export async function activarPush(clave) {
  if (!soportaPush()) throw new Error("Este navegador no puede recibir avisos.");
  if (!clave) throw new Error("El servidor no tiene las llaves de los avisos todavía. Vuelve a intentarlo en un momento.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error(permiso === "denied"
      ? "El navegador tiene los avisos bloqueados para esta aplicación: permítelos en sus ajustes y vuelve a intentarlo."
      : "Hace falta permitir los avisos para recibirlos.");
  }
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const vieja = await reg.pushManager.getSubscription();
  const sus = vieja ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveDeBase64Url(clave) });
  await pedir("/avisos/push", post({ ...sus.toJSON(), dispositivo: nombreDelDispositivo() }));
}

/** Deja de recibirlos en este dispositivo (en el navegador y en el servidor). */
export async function desactivarPush() {
  const reg = await registro().catch(() => null);
  const sus = await reg?.pushManager?.getSubscription?.().catch(() => null);
  if (sus) {
    await pedir("/avisos/push/quitar", post({ endpoint: sus.endpoint }));
    await sus.unsubscribe().catch(() => {});
  }
}

/** Quita un dispositivo de la lista (otro teléfono que ya no se usa). */
export const quitarDispositivo = (endpoint) => pedir("/avisos/push/quitar", post({ endpoint }));
/** Un aviso de prueba a los dispositivos de esta persona. → { enviados, quitados, fallidos }. */
export const probarPush = () => pedir("/avisos/push/prueba", post({}));
