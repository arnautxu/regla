import { z } from "zod";
import { voiceClient } from "@/lib/server/account-voice";
import { adminDb } from "@/lib/server/supabase";
import { settle } from "@/lib/server/ai-budget";
const schema = z.object({ type: z.literal("post_call_transcription"), data: z.object({ agent_id: z.string(), conversation_id: z.string(), metadata: z.object({ call_duration_secs: z.number().nonnegative().finite(), cost: z.number().nonnegative().optional() }) }) });
export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  let event: unknown;
  try { event = await voiceClient().webhooks.constructEvent(await req.text(), req.headers.get("elevenlabs-signature") ?? "", secret); }
  catch { return new Response("Invalid signature", { status: 401 }); }
  const parsed = schema.safeParse(event);
  if (!parsed.success) return Response.json({ received: true });
  const d = parsed.data.data;
  const { data: reservation, error } = await adminDb().from("ai_reservations").select("id,agent_id,reserved_micro_usd,status").eq("provider_id", d.conversation_id).maybeSingle();
  if (error) return new Response("Retry", { status: 503 });
  if (!reservation || reservation.agent_id !== d.agent_id) return Response.json({ received: true });
  // ElevenLabs metadata.cost is credits, NOT USD. Keep the conservative USD
  // reservation; record provider credits separately for invoice reconciliation.
  const { error: usageError } = await adminDb().from("ai_reservations").update({ provider_credits: d.metadata.cost ?? null }).eq("id", reservation.id);
  if (usageError) return new Response("Retry", { status: 503 });
  try { await settle(reservation.id, reservation.reserved_micro_usd, Math.ceil(d.metadata.call_duration_secs), d.conversation_id); }
  catch { return new Response("Retry", { status: 503 }); }
  try {
    await voiceClient().conversationalAi.agents.delete(d.agent_id);
    await adminDb().from("ai_reservations").update({ agent_deleted: true }).eq("id", reservation.id);
  }
  catch { /* scheduled cleanup retries only our temporary agents */ }
  return Response.json({ received: true });
}
