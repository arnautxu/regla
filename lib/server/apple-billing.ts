import "server-only";
import { adminDb } from "./supabase";
import { APPLE_PREFIX, billingAccount, billingStore } from "./billing";
import type { Plan } from "@/lib/plans";

/* Compras de Apple a través de RevenueCat.

   No nos fiamos de lo que cuente el móvil ni del cuerpo del webhook:
   los dos solo sirven de aviso, y el estado se pregunta siempre a la
   API de RevenueCat con la clave de servidor. Como cada sincronización
   lee la verdad completa, el orden en que lleguen los avisos da igual. */

type Entitlement = { expires_date: string | null; product_identifier: string };
type Subscriber = { subscriber: { entitlements: Record<string, Entitlement> } };

export const appleReady = () => !!process.env.REVENUECAT_SECRET_KEY;

/** El producto de App Store Connect decide el plan: los de voz llevan «voz». */
export function planForProduct(product: string): Exclude<Plan, "free"> {
  return /voz|voice/i.test(product) ? "voice" : "plus";
}

/** Lo que dice RevenueCat de esta persona, reducido a plan y fecha. */
export function appleEntitlement(data: Subscriber, now = Date.now()): { plan: Plan; until: string | null } {
  let best: { plan: Plan; until: string | null } = { plan: "free", until: null };
  for (const e of Object.values(data.subscriber.entitlements ?? {})) {
    const until = e.expires_date ? Date.parse(e.expires_date) : Infinity;
    if (!(until > now)) continue;
    const plan = planForProduct(e.product_identifier);
    if (best.plan === "free" || (plan === "voice" && best.plan === "plus"))
      best = { plan, until: Number.isFinite(until) ? new Date(until).toISOString() : null };
  }
  return best;
}

export async function syncApple(userId: string) {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("Compras de Apple no configuradas");
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store",
  });
  if (!r.ok) throw new Error(`RevenueCat ${r.status}`);
  const { plan, until } = appleEntitlement(await r.json());

  const db = adminDb();
  const { error: insertError } = await db.from("billing_accounts").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  // 23503: ese id no es una cuenta (borrada, o de otro sitio). Nada que hacer.
  if (insertError?.code === "23503") return "free";
  if (insertError) throw insertError;
  const account = await billingAccount(userId);
  // Una suscripción web viva manda: no la pisa un aviso de Apple.
  if (billingStore(account) === "stripe" && account?.status === "active" && Date.parse(account.paid_until ?? "") > Date.now()) return plan;
  if (billingStore(account) === "stripe" && plan === "free") return plan;
  const active = plan !== "free";
  const { error } = await db.from("billing_accounts").update({
    customer_id: `${APPLE_PREFIX}${userId}`, subscription_id: null,
    plan, status: active ? "active" : "inactive",
    // Sin fecha de fin (compra vitalicia) se revisa cada año.
    paid_until: active ? until ?? new Date(Date.now() + 365 * 864e5).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw error;
  return plan;
}
