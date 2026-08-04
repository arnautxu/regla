"use client";

/* ═══════════════════════════════════════════════════════════════
   AVISOS, DESDE EL MÓVIL

   Tres condiciones tienen que darse a la vez, y las tres fallan de
   maneras distintas que hay que saber contar:

     1. El navegador tiene push. En iOS eso significa la app INSTALADA
        en la pantalla de inicio: desde Safari, ni existe la API.
     2. Ella da permiso, y solo se lo puede pedir un toque suyo.
     3. El servidor tiene claves VAPID configuradas.

   Un "no se puede activar" a secas dejaría el diagnóstico en manos de
   quien menos herramientas tiene para hacerlo, así que cada estado
   trae su frase.
   ═══════════════════════════════════════════════════════════════ */

export type PushStatus =
  /** iOS sin instalar, o navegador sin push */
  | "sin-soporte"
  /** Se puede, pero no está activado */
  | "apagado"
  /** Activado y suscrito */
  | "encendido"
  /** Dijo que no. Solo se arregla desde los ajustes del sistema */
  | "bloqueado"
  /** El servidor no tiene claves: no hay nada que activar */
  | "sin-servidor";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** El estándar quiere bytes; VAPID viaja en base64url. */
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Sobre el ArrayBuffer explícito: `new Uint8Array(n)` se tipa como
  // Uint8Array<ArrayBufferLike>, que incluye SharedArrayBuffer, y
  // applicationServerKey solo acepta buffers normales.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** En iOS solo hay push si la app está en la pantalla de inicio. */
export function installed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS no implementa display-mode y usa esto en su lugar.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function status(): Promise<PushStatus> {
  if (!supported()) return "sin-soporte";
  if (!PUBLIC_KEY) return "sin-servidor";
  if (Notification.permission === "denied") return "bloqueado";

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "encendido" : "apagado";
}

/**
 * Enciende los avisos. Tiene que llamarse desde un toque suyo:
 * requestPermission() fuera de un gesto lo rechazan todos los
 * navegadores sin decir nada útil.
 */
export async function enable(): Promise<{ ok: boolean; message: string }> {
  if (!supported()) {
    return {
      ok: false,
      message: installed()
        ? "Este navegador no sabe mandar avisos."
        : "Para que suene, primero añade Lilaila a la pantalla de inicio.",
    };
  }
  if (!PUBLIC_KEY) {
    return { ok: false, message: "El servidor no tiene avisos configurados." };
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return {
      ok: false,
      message:
        permiso === "denied"
          ? "Has dicho que no. Se cambia en los ajustes del móvil, no aquí."
          : "Sin permiso no hay aviso.",
    };
  }

  // `ready` y no `getRegistration`: recién instalada, el worker puede
  // estar todavía activándose y suscribirse contra él falla.
  const reg = await navigator.serviceWorker.ready;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Obligatorio: sin esto, cualquiera con el endpoint podría
      // mandarle notificaciones.
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(PUBLIC_KEY),
    }));

  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });

  if (!res.ok) {
    // Si el servidor no la guarda, la suscripción local sobra: dejarla
    // puesta diría "encendido" para un aviso que no va a llegar nunca.
    await sub.unsubscribe().catch(() => {});
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      message:
        res.status === 401
          ? "Entra con tu código y vuelve a intentarlo."
          : (data.error ?? "El servidor no ha aceptado el aviso."),
    };
  }

  return { ok: true, message: "Listo. Te aviso." };
}

export async function disable(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  // Primero el servidor: si se da de baja aquí y la petición falla, el
  // endpoint se queda huérfano en el blob y no hay forma de volver a
  // nombrarlo para borrarlo.
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});

  await sub.unsubscribe().catch(() => {});
}
