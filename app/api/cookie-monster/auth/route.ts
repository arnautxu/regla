import { cookies, headers } from "next/headers";
import {
  COOKIE_MONSTER_SESSION_COOKIE,
  checkCookieMonsterPin,
  clearAttempts,
  cookieMonsterConfigProblem,
  cookieOptions,
  createCookieMonsterSession,
  rateLimit,
  verifyCookieMonsterSession,
} from "@/lib/server/auth";

/** Puerta exclusiva del receptor: su PIN no da acceso a Lilaila. */
export async function GET() {
  const problem = cookieMonsterConfigProblem();
  if (problem) return Response.json({ configured: false, authenticated: false });

  const jar = await cookies();
  return Response.json({
    configured: true,
    authenticated: verifyCookieMonsterSession(
      jar.get(COOKIE_MONSTER_SESSION_COOKIE)?.value,
    ),
  });
}

export async function POST(req: Request) {
  const problem = cookieMonsterConfigProblem();
  if (problem) {
    return Response.json({ error: "El acceso de Cookie Monster no está configurado." }, { status: 500 });
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "local";
  const limit = rateLimit(`cookie-monster:${ip}`);
  if (!limit.ok) {
    return Response.json(
      { error: `Demasiados intentos. Prueba otra vez en ${Math.ceil(limit.retryIn / 60)} minutos.` },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!(await checkCookieMonsterPin(pin))) {
    return Response.json({ error: "Ese código no es." }, { status: 401 });
  }

  clearAttempts(`cookie-monster:${ip}`);
  const { token, maxAge } = createCookieMonsterSession();
  const jar = await cookies();
  jar.set(COOKIE_MONSTER_SESSION_COOKIE, token, cookieOptions(maxAge));
  return Response.json({ authenticated: true });
}
