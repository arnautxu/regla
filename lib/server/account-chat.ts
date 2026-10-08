import { createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { google } from "@ai-sdk/google";
import { currentUser } from "./supabase";
import { limitedJson, privateJson, sameOrigin } from "./http";
import { chatSchema } from "./chat-input";
import { chatInstructions } from "./lilita-prompt";
import { reserve, settle } from "./ai-budget";
import { CHAT_MODEL, MAX_INPUT_BYTES, MAX_OUTPUT_TOKENS, textCost } from "@/lib/ai-limits";

export async function accountChat(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta para hablar con Lilita." }, 401);
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return privateJson({ error: "Lilita no está disponible ahora." }, 503);
  const parsed = chatSchema.safeParse(await limitedJson(req, 64_000).catch(() => null));
  if (!parsed.success) return privateJson({ error: "El mensaje es demasiado largo o no tiene un formato válido." }, 400);
  const messages = parsed.data.messages.map(m => ({ role: m.role, content: m.parts.map(p => p.text).join("\n") }));
  if (messages.at(-1)?.role !== "user") return privateJson({ error: "Escribe un mensaje para continuar." }, 400);
  const instructions = chatInstructions(parsed.data.context, { tools: false }).replaceAll("Lídia", "la usuaria").replaceAll("Lidia", "la usuaria").replaceAll("Arnau", "su pareja");
  // UTF-8 bytes conservatively bound tokenizer input; reserve includes protocol overhead.
  if (Buffer.byteLength(JSON.stringify({ instructions, messages }), "utf8") > MAX_INPUT_BYTES) {
    return privateJson({ error: "Esta conversación ocupa demasiado. Empieza un chat nuevo o acorta el mensaje." }, 400);
  }
  const reservation = await reserve(user.id, "chat");
  if (reservation.response) return reservation.response;
  const result = streamText({
    model: google(CHAT_MODEL), instructions, messages, maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0, abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]),
    onEnd: async ({ usage }) => {
      if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
        await settle(reservation.id!, textCost(usage.inputTokens, usage.outputTokens)).catch(() => {});
      }
    },
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream,
    onError: () => "No he podido terminar la respuesta. Prueba dentro de un momento.",
  }), headers: { "Cache-Control": "private, no-store" } });
}
