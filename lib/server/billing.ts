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
  const { data, error } = await adminDb().from("billing_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
export function activePlan(account: Awaited<ReturnType<typeof billingAccount>>): Plan {
  return account?.status === "active" && !account.billing_hold && Date.parse(account.paid_until ?? "") > Date.now() && ["plus", "voice"].includes(account.plan) ? account.plan : "free";
}
/** Las suscripciones del iPhone se guardan con este prefijo en vez de un cliente de Stripe. */
export const APPLE_PREFIX = "apple:";
export const billingStore = (account: Awaited<ReturnType<typeof billingAccount>>) =>
  !account?.customer_id ? null : account.customer_id.startsWith(APPLE_PREFIX) ? "apple" as const : "stripe" as const;
