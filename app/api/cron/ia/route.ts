import { adminDb } from "@/lib/server/supabase";
import { voiceClient } from "@/lib/server/account-voice";
import { accountMode } from "@/lib/account-mode";
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  if (!accountMode()) return Response.json({ skipped: true });
  const db = adminDb();
  const { data, error } = await db.from("ai_reservations").select("id,agent_id").eq("kind", "voice").eq("agent_deleted", false).lt("expires_at", new Date().toISOString()).order("expires_at").limit(100);
  if (error) return new Response("Retry", { status: 503 });
  let deleted = 0;
  for (const row of data ?? []) {
    try {
      let agentId = row.agent_id;
      if (!agentId) {
        // Covers a timeout between provider creation and saving the returned ID.
        const page = await voiceClient().conversationalAi.agents.list({ search: `Lilaila session ${row.id}` });
        agentId = page.agents.find(agent => agent.name === `Lilaila session ${row.id}`)?.agentId;
        if (!agentId && page.hasMore) continue;
      }
      if (agentId) await voiceClient().conversationalAi.agents.delete(agentId);
      await db.from("ai_reservations").update({ agent_deleted: true }).eq("id", row.id);
      deleted++;
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) {
        await db.from("ai_reservations").update({ agent_deleted: true }).eq("id", row.id);
        deleted++;
      }
    }
  }
  return Response.json({ deleted });
}
