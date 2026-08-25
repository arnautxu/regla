import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  verifySession,
} from "@/lib/server/auth";
import {
  pushConfigured,
  readPushDoc,
  sendToAudience,
} from "@/lib/server/push";

/* El botón vive en el móvil de Lídia, pero el aviso solo sale hacia el
   dispositivo que se haya registrado expresamente como Cookie Monster.
   Nunca se reutiliza sendToAll: eso mezclaría el aviso con sus propios
   recordatorios de salud. */
async function lidiaGuard(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function POST() {
  if (!(await lidiaGuard())) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!pushConfigured()) {
    return Response.json(
      { error: "El servidor no tiene los avisos configurados." },
      { status: 501 },
    );
  }

  const push = await readPushDoc();
  if (!push.subs.some((sub) => sub.audience === "cookie-monster")) {
    return Response.json(
      { error: "Aún no hay un móvil de Cookie Monster activado." },
      { status: 409 },
    );
  }

  const result = await sendToAudience("cookie-monster", {
    title: "🍪 Cookie Monster",
    body: "Lidia ha activado Cookie Monster.",
    tag: "cookie-monster",
    url: "/cookie-monster",
  });

  if (result.sent === 0) {
    return Response.json(
      { error: "No he podido entregar el aviso. Prueba otra vez." },
      { status: 503 },
    );
  }

  return Response.json({ ok: true });
}
