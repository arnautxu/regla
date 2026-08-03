import { cookies, headers } from "next/headers";
import {
  SESSION_COOKIE,
  checkPin,
  clearAttempts,
  cookieOptions,
  createSession,
  rateLimit,
  verifySession,
} from "@/lib/server/auth";

/**
 * ¿Sigue viva la sesión? Lo usa la app al arrancar.
 *
 * `configured` distingue "no ha entrado" de "esto todavía no tiene
 * servidor". Sin esa diferencia, arrancar el proyecto sin variables
 * de entorno dejaría la app tras una puerta que nadie puede abrir.
 * Sin configurar, Lilaila funciona igual: solo en el móvil, sin copia.
 */
export async function GET() {
  const configured = Boolean(
    process.env.LILAILA_PIN &&
      process.env.LILAILA_SECRET &&
      process.env.BLOB_READ_WRITE_TOKEN,
  );
  if (!configured) return Response.json({ configured: false, authenticated: false });

  const jar = await cookies();
  return Response.json({
    configured: true,
    authenticated: verifySession(jar.get(SESSION_COOKIE)?.value),
  });
}

export async function POST(req: Request) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "local";

  const limit = rateLimit(ip);
  if (!limit.ok) {
    return Response.json(
      {
        error: `Demasiados intentos. Prueba otra vez en ${Math.ceil(limit.retryIn / 60)} minutos.`,
      },
      { status: 429 },
    );
  }

  let pin = "";
  try {
    const body = (await req.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch {
    return Response.json({ error: "Petición mal formada." }, { status: 400 });
  }

  if (!(await checkPin(pin))) {
    return Response.json({ error: "Ese código no es." }, { status: 401 });
  }

  clearAttempts(ip);
  const { token, maxAge } = createSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(maxAge));

  return Response.json({ authenticated: true });
}

/** Cerrar sesión. */
export async function DELETE() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
  return Response.json({ authenticated: false });
}
