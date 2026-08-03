import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { cookies } from "next/headers";
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

  const result = streamText({
    model: resolveModel(),
    instructions: chatInstructions(context),
    messages: await convertToModelMessages(messages),
    temperature: 0.9,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
