import Stripe from "stripe";
import { adminDb } from "@/lib/server/supabase";
import { planForPrice, stripeClient } from "@/lib/server/billing";
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  const supported = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded", "charge.dispute.created"];
  if (!supported.includes(event.type)) return Response.json({ received: true });
  try {
    const object = event.data.object as unknown as { customer?: string; subscription?: string; id: string; refunded?: boolean };
    let customer = object.customer;
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = await stripe.charges.retrieve(typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id);
      customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
    }
    if (!customer) return Response.json({ received: true });
    const { data: account, error } = await adminDb().from("billing_accounts").select("user_id,subscription_id").eq("customer_id", customer).maybeSingle();
    if (error) throw error;
    if (!account) return Response.json({ received: true });
    const subscriptionId = event.type.startsWith("customer.subscription.") ? object.id : object.subscription ?? account.subscription_id;
    // Invoice events can arrive before Checkout. Retrieve by this server-owned customer.
    const sub = subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] })
      : (await stripe.subscriptions.list({ customer, status: "all", limit: 10, expand: ["data.latest_invoice"] })).data.find(s => s.metadata.user_id === account.user_id);
    if (!sub || sub.customer !== customer || sub.metadata.user_id !== account.user_id) throw new Error("Subscription ownership mismatch");
    const item = sub.items.data[0];
    const plan = item && planForPrice(item.price.id);
    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    const revoked = event.type === "charge.dispute.created" || event.type === "charge.refunded";
    const active = !revoked && sub.status === "active" && invoice?.status === "paid" && !!plan && sub.items.data.length === 1 && item.quantity === 1;
    const { error: updateError } = await adminDb().rpc("apply_billing", {
      p_event: event.id, p_created: event.created, p_customer: customer, p_subscription: sub.id,
      p_plan: plan ?? "free", p_status: revoked ? "revoked" : active ? "active" : "inactive",
      p_until: active ? new Date(item.current_period_end * 1000).toISOString() : null,
    });
    if (updateError) throw updateError;
    return Response.json({ received: true });
  } catch { return new Response("Reconciliation failed", { status: 500 }); }
}
