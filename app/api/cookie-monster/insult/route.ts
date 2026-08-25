import { cookies } from "next/headers";
import {
  COOKIE_MONSTER_SESSION_COOKIE,
  verifyCookieMonsterSession,
} from "@/lib/server/auth";
import {
  pushConfigured,
  readPushDoc,
  sendToAudience,
} from "@/lib/server/push";

/* Pullas pequeñas y consentidas, no mensajes escritos a mano. Así este
   botón no se convierte en un canal libre para hostigar a nadie. */
const PULLAS = [
  "Lidia, Cookie Monster dice que eres un monstruo de las galletas.",
  "Lidia, Cookie Monster dice que eres una imbécil por esconder las galletas.",
  "Lidia: comparte una galleta, monstruo.",
];

export async function POST() {
  const jar = await cookies();
  if (!verifyCookieMonsterSession(jar.get(COOKIE_MONSTER_SESSION_COOKIE)?.value)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!pushConfigured()) {
    return Response.json({ error: "El servidor no tiene los avisos configurados." }, { status: 501 });
  }

  const push = await readPushDoc();
  if (!push.subs.some((sub) => sub.audience === "lidia")) {
    return Response.json(
      { error: "Lidia aún no tiene los avisos activados en su móvil." },
      { status: 409 },
    );
  }

  const body = PULLAS[Math.floor(Math.random() * PULLAS.length)];
  const result = await sendToAudience("lidia", {
    title: "🍪 Cookie Monster",
    body,
    tag: "cookie-monster-pulla",
    url: "/",
  });

  if (result.sent === 0) {
    return Response.json({ error: "No he podido entregar la pulla. Prueba otra vez." }, { status: 503 });
  }
  return Response.json({ ok: true });
}
