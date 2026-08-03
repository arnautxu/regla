import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import {
  MODEL,
  aiConfigured,
  chatInstructions,
} from "@/lib/server/lilita-prompt";
import type { LilitaContext } from "@/lib/ai-context";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return Response.json({ error: "IA no configurada." }, { status: 503 });
  }

  if (process.env.LILAILA_PIN) {
    const jar = await cookies();
    if (!verifySession(jar.get(SESSION_COOKIE)?.value)) {
      return Response.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const { messages, context } = (await req.json()) as {
    messages: UIMessage[];
    context: LilitaContext;
  };

  const result = streamText({
    model: MODEL,
    instructions: chatInstructions(context),
    messages: await convertToModelMessages(messages),
    temperature: 0.9,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
