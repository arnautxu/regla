import { cookies, headers } from "next/headers";
import {
  SESSION_COOKIE,
  checkPin,
  clearAttempts,
  configProblem,
  cookieOptions,
  createSession,
  rateLimit,
  verifySession,
} from "@/lib/server/auth";

/**
 * ¿Sigue viva la sesión? Lo usa la app al arrancar.
 *
 * `configured` valida de verdad, no solo comprueba que las variables
 * existan: antes decía que sí con un secreto demasiado corto y el
 * login moría después con un 500 mudo.
 *
 * Distinguir "no ha entrado" de "esto no tiene servidor" importa
 * porque sin configurar Lilaila funciona igual: solo en el móvil,
 * sin copia. No queremos dejarla tras una puerta que nadie abre.
 */
export async function GET() {
  const problem = configProblem();
  const configured = !problem && Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (!configured) {
    if (problem) console.warn("[auth] configuración incompleta:", problem);
    return Response.json({ configured: false, authenticated: false });
  }

  const jar = await cookies();
  return Response.json({
    configured: true,
    authenticated: verifySession(jar.get(SESSION_COOKIE)?.value),
  });
}

export async function POST(req: Request) {
  // Un problema de configuración no es culpa de quien intenta entrar,
  // y merece un mensaje que diga qué arreglar.
  const problem = configProblem();
  if (problem) {
    console.error("[auth] configuración inválida:", problem);
    return Response.json(
      { error: `Configuración del servidor incompleta. ${problem}` },
      { status: 500 },
    );
  }

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

  try {
    clearAttempts(ip);
    const { token, maxAge } = createSession();
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    return Response.json({ authenticated: true });
  } catch (err) {
    console.error("[auth] fallo creando la sesión:", err);
    return Response.json(
      { error: "No he podido crear la sesión. Mira los logs del servidor." },
      { status: 500 },
    );
  }
}

/** Cerrar sesión. */
export async function DELETE() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
  return Response.json({ authenticated: false });
}
