import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import { pushConfigured, readPushDoc, sendToAudience } from "@/lib/server/push";

/* «Ya se me ha pasado»: el final del enfado, del móvil de Lídia al
   de Cookie Monster. Solo sale la duración, que es del enfado y no
   de su ciclo; nada de fase ni de días. */

export async function POST(request: Request) {
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!pushConfigured()) {
    return Response.json({ error: "El servidor no tiene los avisos configurados." }, { status: 501 });
  }

  const push = await readPushDoc();
  if (!push.subs.some((sub) => sub.audience === "cookie-monster")) {
    return Response.json({ error: "Aún no hay un móvil de Cookie Monster activado." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { minutes?: unknown };
  const minutes =
    typeof body.minutes === "number" && Number.isFinite(body.minutes) && body.minutes > 0
      ? Math.min(Math.round(body.minutes), 60 * 48)
      : undefined;

  const result = await sendToAudience("cookie-monster", {
    title: "🤝 Cookie Monster",
    body: minutes
      ? `A Lidia ya se le ha pasado, después de ${duration(minutes)}. Paz firmada.`
      : "A Lidia ya se le ha pasado. Paz firmada.",
    tag: "cookie-monster",
    url: "/cookie-monster",
  });

  if (result.sent === 0) {
    return Response.json({ error: "No he podido entregar el aviso. Prueba otra vez." }, { status: 503 });
  }
  return Response.json({ ok: true });
}

function duration(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
