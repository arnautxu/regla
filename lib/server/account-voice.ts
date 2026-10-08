import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { z } from "zod";
import { currentUser, adminDb } from "./supabase";
import { contextSchema } from "./chat-input";
import { limitedJson, privateJson, sameOrigin } from "./http";
import { liveInstructions } from "./lilita-prompt";
import { voiceId } from "./elevenlabs";
import { reserve } from "./ai-budget";
import { VOICE_SECONDS_PER_CALL } from "@/lib/ai-limits";

export function voiceClient() {
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
}
export function voiceReady() {
  return !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_WEBHOOK_SECRET && process.env.LILAILA_VOICE_ENABLED === "true");
}
export async function accountVoice(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  if (!voiceReady()) return privateJson({ error: "Las llamadas todavía no están disponibles." }, 503);
  const parsed = z.object({ context: contextSchema }).safeParse(await limitedJson(req, 32_000).catch(() => null));
  if (!parsed.success) return privateJson({ error: "No se ha podido preparar la llamada." }, 400);
  const prompt = liveInstructions(parsed.data.context).replaceAll("Lídia", "la usuaria").replaceAll("Lidia", "la usuaria").replaceAll("Arnau", "su pareja");
  if (Buffer.byteLength(prompt) > 12_000) return privateJson({ error: "Hay demasiados datos para esta llamada." }, 400);
  const reservation = await reserve(user.id, "voice");
  if (reservation.response) return reservation.response;
  const client = voiceClient();
  let createdAgentId: string | undefined;
  try {
    // A private agent per reservation: the browser cannot override the prompt,
    // model, token cap or duration, or start unlimited calls on a shared agent.
    const created = await client.conversationalAi.agents.create({
      name: `Lilaila session ${reservation.id}`,
      conversationConfig: {
        agent: { language: "es", firstMessage: "Aquí estoy. Cuéntame.",
          maxConversationDurationMessage: "Cerramos esta llamada. Puedes seguir por escrito o volver a llamar si te quedan minutos.",
          prompt: { prompt, llm: "gemini-2.5-flash-lite", maxTokens: 160, thinkingBudget: 0, backupLlmConfig: { preference: "disabled" }, toolIds: [], tools: [] } },
        tts: { modelId: "eleven_flash_v2_5", voiceId: voiceId() },
        conversation: { maxDurationSeconds: VOICE_SECONDS_PER_CALL, clientEvents: ["audio", "agent_response", "user_transcript", "interruption"] },
      },
      platformSettings: {
        auth: { enableAuth: true },
        callLimits: { agentConcurrencyLimit: 1, dailyLimit: 1, burstingEnabled: false },
        privacy: { recordVoice: false, retentionDays: 1, deleteTranscriptAndPii: true, deleteAudio: true },
        overrides: { conversationConfigOverride: { conversation: { maxDurationSeconds: false }, agent: { prompt: { prompt: false, llm: false }, firstMessage: false, language: false } }, customLlmExtraBody: false },
      },
    }, { maxRetries: 0 });
    createdAgentId = created.agentId;
    const { error: saved } = await adminDb().from("ai_reservations").update({ agent_id: created.agentId }).eq("id", reservation.id!);
    if (saved) throw saved;
    const configured = await client.conversationalAi.agents.get(created.agentId);
    if (configured.conversationConfig.conversation?.maxDurationSeconds !== VOICE_SECONDS_PER_CALL
      || configured.conversationConfig.agent?.prompt?.maxTokens !== 160
      || configured.conversationConfig.agent?.prompt?.llm !== "gemini-2.5-flash-lite"
      || !configured.platformSettings?.auth?.enableAuth
      || configured.platformSettings?.callLimits?.dailyLimit !== 1
      || configured.platformSettings?.callLimits?.agentConcurrencyLimit !== 1
      || configured.platformSettings?.callLimits?.burstingEnabled !== false
      || configured.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.llm !== false
      || configured.platformSettings?.overrides?.conversationConfigOverride?.conversation?.maxDurationSeconds !== false) throw new Error("Unsafe agent configuration");
    const token = await client.conversationalAi.conversations.getWebrtcToken({ agentId: created.agentId }, { maxRetries: 0 });
    const { error } = await adminDb().from("ai_reservations").update({ provider_id: token.conversationId }).eq("id", reservation.id!);
    if (error || !token.conversationId) throw new Error("Conversation not bound to reservation");
    return privateJson({ token: token.token, limited: true, maxSeconds: VOICE_SECONDS_PER_CALL });
  } catch {
    // Ambiguous provider failures retain the reservation. Reconciliation/cleanup
    // does not refund money unless provider usage is known.
    if (createdAgentId) {
      try {
        await client.conversationalAi.agents.delete(createdAgentId);
        await adminDb().from("ai_reservations").update({ agent_id: createdAgentId, agent_deleted: true }).eq("id", reservation.id!);
      } catch { /* The scheduled cleanup also discovers agents by reservation ID. */ }
    }
    return privateJson({ error: "No se ha podido iniciar la llamada. La llamada reservada queda pendiente de revisión." }, 503);
  }
}
