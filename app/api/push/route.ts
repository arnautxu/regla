import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import {
  addSub,
  pushConfigured,
  readPushDoc,
  removeSub,
} from "@/lib/server/push";

/* Alta y baja del aviso de la pastilla.

   Detrás de la sesión, igual que /api/data: la suscripción es una URL
   que permite hacer sonar su móvil, y dejarla abierta a internet sería
   regalarle a cualquiera un canal directo a su pantalla de bloqueo. */

async function guard(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

const DENIED = Response.json({ error: "No autorizado." }, { status: 401 });

/** ¿Está el servidor en condiciones de mandar avisos? */
export async function GET() {
  if (!(await guard())) return DENIED;
  const doc = pushConfigured() ? await readPushDoc() : null;
  return Response.json({
    configured: pushConfigured(),
    devices: doc?.subs.length ?? 0,
  });
}

export async function POST(req: Request) {
  if (!(await guard())) return DENIED;
  if (!pushConfigured()) {
    return Response.json(
      { error: "El servidor no tiene claves de aviso configuradas." },
      { status: 501 },
    );
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Se valida antes de guardar: una suscripción a medias se acepta sin
  // ruido y luego falla cada noche en silencio dentro del cron, que es
  // el peor sitio posible para enterarse.
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return Response.json({ error: "Suscripción incompleta." }, { status: 400 });
  }
  if (!endpoint.startsWith("https://")) {
    return Response.json({ error: "Endpoint no válido." }, { status: 400 });
  }

  await addSub({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await guard())) return DENIED;

  let endpoint: string | undefined;
  try {
    ({ endpoint } = (await req.json()) as { endpoint?: string });
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!endpoint) {
    return Response.json({ error: "Falta el endpoint." }, { status: 400 });
  }

  await removeSub(endpoint);
  return Response.json({ ok: true });
}
