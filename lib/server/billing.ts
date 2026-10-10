import "server-only";
import Stripe from "stripe";
import { adminDb } from "./supabase";
import type { Periodo, Plan } from "@/lib/plans";
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Pagos no configurados");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}
export function priceId(plan: "plus" | "voice", periodo: Periodo = "mensual") {
  if (plan === "voice") return periodo === "mensual" ? process.env.STRIPE_VOICE_PRICE_ID : undefined;
  return process.env[periodo === "anual" ? "STRIPE_PLUS_YEAR_PRICE_ID" : "STRIPE_PLUS_PRICE_ID"];
}
export function planForPrice(id: string): Plan | null {
  if (id === priceId("plus") || id === priceId("plus", "anual")) return "plus";
  if (id === priceId("voice")) return "voice";
  return null;
}
export async function billingAccount(userId: string) {
  const db = adminDb();
  const [row, grant] = await Promise.all([
    db.from("billing_accounts").select("*").eq("user_id", userId).maybeSingle(),
    db.rpc("granted_plan", { p_user: userId }),
  ]);
  if (row.error) throw row.error;
  // PGRST202: la migración de regalos aún no está en la base. Sin regalo, como antes.
  if (grant.error && grant.error.code !== "PGRST202") throw grant.error;
  const granted_plan = grant.error ? null : (grant.data as "plus" | "voice" | null);
  return row.data || granted_plan ? { ...row.data, granted_plan } : null;
}
const RANK: Record<Plan, number> = { free: 0, plus: 1, voice: 2 };
/** El plan que manda: lo pagado o lo regalado (plan_grants), lo que sea mejor. */
export function activePlan(account: Awaited<ReturnType<typeof billingAccount>>): Plan {
  const paid: Plan = account?.status === "active" && !account.billing_hold && Date.parse(account.paid_until ?? "") > Date.now() && ["plus", "voice"].includes(account.plan) ? account.plan : "free";
  const gift = account?.granted_plan as Plan | null | undefined;
  return gift && RANK[gift] > RANK[paid] ? gift : paid;
}
/** Las suscripciones del iPhone se guardan con este prefijo en vez de un cliente de Stripe. */
export const APPLE_PREFIX = "apple:";
export const billingStore = (account: Awaited<ReturnType<typeof billingAccount>>) =>
  !account?.customer_id ? null : account.customer_id.startsWith(APPLE_PREFIX) ? "apple" as const : "stripe" as const;
