import { currentUser, adminDb } from "@/lib/server/supabase";
import { activePlan, billingAccount, priceId } from "@/lib/server/billing";
import { privateJson } from "@/lib/server/http";
import { PLANS } from "@/lib/plans";
import { voiceReady } from "@/lib/server/account-voice";
export async function GET() {
  const user = await currentUser();
  if (!user) return privateJson({ authenticated: false }, 401);
  const account = await billingAccount(user.id);
  const plan = activePlan(account);
  const period = new Date(); period.setUTCDate(1); period.setUTCHours(0, 0, 0, 0);
  let query = adminDb().from("ai_reservations").select("kind,voice_seconds,status").eq("user_id", user.id);
  if (plan !== "free") query = query.gte("period", period.toISOString().slice(0, 10));
  const { data, error } = await query;
  if (error) return privateJson({ error: "No se ha podido leer el uso." }, 503);
  const next = new Date(period); next.setUTCMonth(next.getUTCMonth() + 1);
  return privateJson({ authenticated: true, email: user.email, plan, limits: PLANS[plan],
    usedMessages: data.filter(r => r.kind === "chat").length,
    usedSeconds: data.reduce((n, r) => n + r.voice_seconds, 0),
    resetsAt: plan === "free" ? null : next.toISOString(),
    billingReady: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && priceId("plus") && priceId("voice") && process.env.LILAILA_APP_URL),
    hasCustomer: !!account?.customer_id,
    voiceReady: voiceReady(),
  });
}
