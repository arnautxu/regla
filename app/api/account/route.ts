import { currentUser, adminDb } from "@/lib/server/supabase";
import { activePlan, billingAccount, billingStore, priceId, stripeClient } from "@/lib/server/billing";
import { privateJson, sameOrigin } from "@/lib/server/http";
import { appleReady } from "@/lib/server/apple-billing";
import { PLANS } from "@/lib/plans";
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
    billingReady: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && priceId("plus") && process.env.LILAILA_APP_URL),
    hasCustomer: billingStore(account) === "stripe",
    store: plan === "free" ? null : billingStore(account),
    paidUntil: plan === "free" ? null : account?.paid_until ?? null,
    gift: plan !== "free" && account?.granted_plan === plan,
    annualReady: !!priceId("plus", "anual"),
    appleReady: appleReady(),
    voiceReady: false,
  });
}

/**
 * Borrar la cuenta entera, como pide Apple: diario, pareja, avisos y la
 * propia cuenta. Una suscripción web se cancela aquí; la de Apple solo
 * la puede cancelar ella desde el iPhone, y se lo decimos antes.
 */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  try {
    const account = await billingAccount(user.id);
    if (billingStore(account) === "stripe" && account?.subscription_id) {
      const stripe = stripeClient();
      const sub = await stripe.subscriptions.retrieve(account.subscription_id);
      if (!["canceled", "incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id);
    }
    const db = adminDb();
    const { error: eraseError } = await db.rpc("erase_diary", { p_user: user.id });
    if (eraseError) throw eraseError;
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return privateJson({ deleted: true });
  } catch { return privateJson({ error: "No he podido borrar la cuenta. Prueba otra vez o escríbenos." }, 503); }
}
