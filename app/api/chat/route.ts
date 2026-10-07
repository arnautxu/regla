import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";
import {
  aiConfigured,
  chatInstructions,
  modelChain,
  type Candidate,
} from "@/lib/server/lilita-prompt";
import type { LilitaContext } from "@/lib/ai-context";
import { firstThatAnswers } from "@/lib/server/first-answer";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return Response.json({ error: "IA no configurada." }, { status: 503 });
  }

  const jar = await cookies();
  const denied = await requireSession(jar.get(SESSION_COOKIE)?.value);
  if (denied) return denied;

  const { messages, context } = (await req.json()) as {
    messages: UIMessage[];
    context: LilitaContext;
  };

  /* Las dos herramientas van SIN `execute`.
     ──────────────────────────────────────
     Eso hace que la llamada se reenvíe al cliente en vez de correr
     aquí, y es justo lo que hace falta: las memorias viven en el
     IndexedDB de su móvil, que este servidor no ve ni tiene por qué
     ver. El servidor propone y el móvil guarda.

     Se declaran solo si puede recordar. Si el interruptor está
     apagado no existen, así que no hay forma de que las llame por
     error. */
  const tools = context.puedeRecordar
    ? {
        recordar: {
          description:
            "Guarda algo que has aprendido de ella y que seguirá siendo verdad dentro de un mes.",
          inputSchema: z.object({
            dato: z
              .string()
              .describe(
                "Una frase corta y en tercera persona, como una nota: 'el ibuprofeno no le hace nada'.",
              ),
          }),
        },
        olvidar: {
          description:
            "Borra algo que recordabas porque ha dejado de ser verdad o porque ella te lo ha pedido.",
          inputSchema: z.object({
            id: z
              .string()
              .describe("El id entre corchetes de la lista de lo que sabes."),
          }),
        },
      }
    : undefined;

  const instructions = chatInstructions(context);
  const modelMessages = await convertToModelMessages(messages);
  const start = (c: Candidate, last: boolean) =>
    streamText({
      model: c.model,
      instructions,
      messages: modelMessages,
      maxOutputTokens: 320,
      temperature: 0.9,
      // Si hay recambio, no se insiste: mejor otro modelo ya que el
      // mismo dentro de unos segundos.
      maxRetries: last ? 2 : 0,
      // Gemini 3.6 Flash razona en nivel medio por defecto. Para las
      // respuestas cortas de Lilita ese trabajo oculto solo retrasa el
      // primer texto; "minimal" mantiene las herramientas y la calidad
      // conversacional sin hacer una reflexión larga antes de contestar.
      providerOptions: c.gemini
        ? {
            google: {
              thinkingConfig: {
                thinkingLevel: "minimal",
                includeThoughts: false,
              },
            } satisfies GoogleLanguageModelOptions,
          }
        : undefined,
      tools,
    });

  const stream = await firstThatAnswers(modelChain(), (c, last) => start(c, last).stream);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream, onError: explain }),
  });
}

/**
 * El fallo del modelo, dicho de forma que Arnau sepa qué tocar. Sin
 * esto el móvil solo recibe "An error occurred" y Lilita se queda
 * "sin palabras" sin que nadie sepa por qué.
 */
function explain(error: unknown): string {
  console.error("chat", error);
  const e = error as { statusCode?: number; message?: string };
  const status = e?.statusCode;
  const message = String(e?.message ?? error).slice(0, 160);
  if (status === 429 || /quota|rate limit|resource.?exhausted/i.test(message))
    return "Gemini dice que se ha pasado de cuota. Prueba en un rato o revisa la facturación de la clave.";
  if (status === 401 || status === 403 || /api key|permission|unauthori/i.test(message))
    return "El modelo no acepta la clave. Revisa GOOGLE_GENERATIVE_AI_API_KEY en Vercel.";
  if (status === 404 || /not found|model/i.test(message))
    return `El modelo no responde (${message}). Revisa LILAILA_MODEL en Vercel.`;
  return `El modelo ha fallado${status ? ` (${status})` : ""}: ${message}`;
}
