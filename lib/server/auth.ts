import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/* ═══════════════════════════════════════════════════════════════
   LA PUERTA

   Un solo usuario, un solo PIN. El PIN vive en una variable de
   entorno del servidor y NUNCA se guarda junto a los datos: aquí no
   se compara lo que manda el cliente contra nada almacenado, se
   compara contra el secreto del servidor.

   Tras acertar se emite una cookie de sesión firmada, de forma que
   el PIN viaja una vez y no en cada petición.

   Sobre la fuerza bruta: seis dígitos son un millón de combinaciones,
   que con una API abierta no es gran cosa. Por eso hay límite de
   intentos por IP y un retardo fijo en cada fallo. Para una app
   personal de una sola usuaria es proporcionado; si esto fuera
   multiusuario haría falta algo bastante más serio.
   ═══════════════════════════════════════════════════════════════ */

const SESSION_DAYS = 90;
export const SESSION_COOKIE = "lilaila_session";

function secret(): string {
  const s = process.env.LILAILA_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "Falta LILAILA_SECRET (mínimo 16 caracteres) en las variables de entorno.",
    );
  }
  return s;
}

function expectedPin(): string {
  const p = process.env.LILAILA_PIN;
  if (!p || p.length < 4) {
    throw new Error("Falta LILAILA_PIN (mínimo 4 dígitos).");
  }
  return p;
}

/** Comparación en tiempo constante: una comparación normal filtra
    cuántos caracteres iniciales has acertado. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // timingSafeEqual exige misma longitud; se compara contra sí mismo
    // para gastar el mismo tiempo antes de devolver false.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/* --- Límite de intentos ----------------------------------------
   En memoria del proceso. Con Fluid Compute las instancias se
   reutilizan, así que aguanta el caso real. No es un candado
   distribuido y no pretende serlo. */

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function rateLimit(ip: string): { ok: boolean; retryIn: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryIn: 0 };
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS) {
    return { ok: false, retryIn: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryIn: 0 };
}

export function clearAttempts(ip: string) {
  attempts.delete(ip);
}

export async function checkPin(pin: string): Promise<boolean> {
  // Retardo fijo en toda comprobación: aplana la señal temporal y
  // encarece cualquier intento de recorrer el espacio de PINs.
  await new Promise((r) => setTimeout(r, 250));
  return safeEqual(pin, expectedPin());
}

/* --- Sesión ----------------------------------------------------- */

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(): { token: string; maxAge: number } {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${randomBytes(12).toString("base64url")}.${expires}`;
  return {
    token: `${payload}.${sign(payload)}`,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [nonce, expires, mac] = parts;
  const payload = `${nonce}.${expires}`;
  if (!safeEqual(mac, sign(payload))) return false;

  const exp = Number(expires);
  return Number.isFinite(exp) && Date.now() < exp;
}

/**
 * Guarda para los endpoints que cuestan dinero (los de IA).
 *
 * En producción SIEMPRE exige sesión. Sin esto, desplegar con clave
 * del gateway pero sin PIN dejaría un endpoint de modelo abierto a
 * internet, y el primero que encuentre la URL se come la cuota.
 * En local se deja pasar para poder desarrollar sin montar la puerta.
 */
export async function requireSession(
  token: string | undefined,
): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production" && !process.env.LILAILA_PIN) {
    return null;
  }
  if (verifySession(token)) return null;

  return Response.json(
    { error: "No autorizado. Configura LILAILA_PIN y entra con tu código." },
    { status: 401 },
  );
}

/** Configuración de la cookie. httpOnly para que ni el propio JS
    de la app pueda leerla, y por tanto tampoco un XSS. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
