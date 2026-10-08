import { z } from "zod";
import { currentUser, adminDb } from "@/lib/server/supabase";
import { limitedJson, privateJson, sameOrigin } from "@/lib/server/http";
import { billingAccount, priceId, stripeClient } from "@/lib/server/billing";
import { PLANS } from "@/lib/plans";
import { voiceReady } from "@/lib/server/account-voice";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  const body = z.object({ plan: z.enum(["plus", "voice"]) }).safeParse(await limitedJson(req, 1024).catch(() => null));
  if (!body.success) return privateJson({ error: "Elige un plan." }, 400);
  if (body.data.plan === "voice" && !voiceReady()) return privateJson({ error: "El plan con llamadas aún no está abierto." }, 503);
  const price = priceId(body.data.plan);
  const appUrl = process.env.LILAILA_APP_URL;
  if (!price || !appUrl || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return privateJson({ error: "Las suscripciones aún no están abiertas." }, 503);
  try {
    const stripe = stripeClient();
    const productPrice = await stripe.prices.retrieve(price);
    if (!productPrice.active || productPrice.currency !== "eur" || productPrice.unit_amount !== Math.round(PLANS[body.data.plan].euros * 100) || productPrice.recurring?.interval !== "month" || productPrice.recurring.interval_count !== 1 || productPrice.recurring.usage_type !== "licensed") throw new Error("Price mismatch");
    const { data: claimed, error } = await adminDb().rpc("claim_checkout", { p_user: user.id });
    if (error) throw error;
    let account = await billingAccount(user.id);
    if (!claimed) {
      if (account?.checkout_session && Date.parse(account.checkout_until) > Date.now()) {
        const existing = await stripe.checkout.sessions.retrieve(account.checkout_session);
        if (existing.status === "open" && existing.url) return privateJson({ url: existing.url });
      }
      return privateJson({ error: "Ya tienes un pago en curso o un plan activo. Gestiona tu suscripción desde Ajustes." }, 409);
    }
    if (!account?.customer_id) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } }, { idempotencyKey: `lilaila-customer-${user.id}` });
      const { error } = await adminDb().from("billing_accounts").update({ customer_id: customer.id }).eq("user_id", user.id);
      if (error) throw error;
      account = { ...account, customer_id: customer.id };
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: account.customer_id, line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id, subscription_data: { metadata: { user_id: user.id } },
      integration_identifier: "lilaila-subscription-mqzptnva",
      success_url: `${appUrl}/ajustes?subscription=success`, cancel_url: `${appUrl}/ajustes?subscription=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    }, { idempotencyKey: `lilaila-checkout-${user.id}-${account.checkout_until}` });
    const { error: saveError } = await adminDb().from("billing_accounts").update({ checkout_session: session.id }).eq("user_id", user.id);
    if (saveError) throw saveError;
    return privateJson({ url: session.url });
  } catch { return privateJson({ error: "No se ha podido abrir el pago. Prueba más tarde." }, 503); }
}
