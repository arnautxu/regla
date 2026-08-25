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

const MAX_LENGTH = 180;

export async function POST(req: Request) {
  const jar = await cookies();
  if (!verifyCookieMonsterSession(jar.get(COOKIE_MONSTER_SESSION_COOKIE)?.value)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return Response.json({ error: "Escribe un mensaje primero." }, { status: 400 });
  if (text.length > MAX_LENGTH) {
    return Response.json({ error: `El mensaje puede tener hasta ${MAX_LENGTH} caracteres.` }, { status: 400 });
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
    body: text,
    tag: "mensaje-de-arnau",
    url: "/",
  });
  if (result.sent === 0) {
    return Response.json({ error: "No he podido entregar el mensaje. Prueba otra vez." }, { status: 503 });
  }
  return Response.json({ ok: true });
}
