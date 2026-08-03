import { generateText } from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";
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

  // Detrás de la puerta en producción, siempre: un endpoint de modelo
  // abierto es la cuota de otro.
  const jar = await cookies();
  const denied = await requireSession(jar.get(SESSION_COOKIE)?.value);
  if (denied) return denied;

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
