import { generateText } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import {
  MODEL,
  aiConfigured,
  lineInstructions,
} from "@/lib/server/lilita-prompt";
import type { LilitaContext } from "@/lib/ai-context";

export const maxDuration = 30;

/**
 * La frase del día. Si esto falla o no hay clave, el cliente se queda
 * con el banco de frases local — Lilita nunca se queda muda por un
 * problema de infraestructura.
 */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return Response.json({ error: "IA no configurada." }, { status: 503 });
  }

  // Si hay servidor con PIN, el endpoint va detrás de la puerta: si
  // no, cualquiera podría gastar la cuota del gateway.
  if (process.env.LILAILA_PIN) {
    const jar = await cookies();
    if (!verifySession(jar.get(SESSION_COOKIE)?.value)) {
      return Response.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  let context: LilitaContext;
  try {
    context = ((await req.json()) as { context: LilitaContext }).context;
    if (!context || typeof context !== "object") throw new Error();
  } catch {
    return Response.json({ error: "Contexto inválido." }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions: lineInstructions(context),
      prompt:
        "Escribe la intervención de hoy. Solo el texto, nada más.",
      temperature: 1,
      maxOutputTokens: 160,
    });

    const line = text.trim().replace(/^["“”']|["“”']$/g, "");
    if (!line) throw new Error("respuesta vacía");

    return Response.json({ line });
  } catch {
    return Response.json({ error: "El modelo no contestó." }, { status: 502 });
  }
}
