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

const ANIMOS = [
  "Lidia, Arnau te manda ánimos. Hoy también cuenta, aunque vaya regular.",
  "Un aviso de Arnau: respira, baja el ritmo si lo necesitas y cuídate mucho.",
  "Lidia, Arnau está contigo. Un paso cada vez.",
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

  const result = await sendToAudience("lidia", {
    title: "De Arnau para Lidia",
    body: ANIMOS[Math.floor(Math.random() * ANIMOS.length)],
    tag: "animos-de-arnau",
    url: "/",
  });
  if (result.sent === 0) {
    return Response.json({ error: "No he podido entregar el ánimo. Prueba otra vez." }, { status: 503 });
  }
  return Response.json({ ok: true });
}
