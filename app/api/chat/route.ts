import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";
import {
  resolveModel,
  aiConfigured,
  chatInstructions,
} from "@/lib/server/lilita-prompt";
import type { LilitaContext } from "@/lib/ai-context";

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

  const result = streamText({
    model: resolveModel(),
    instructions: chatInstructions(context),
    messages: await convertToModelMessages(messages),
    temperature: 0.9,
    tools,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
