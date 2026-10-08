import "server-only";
import Stripe from "stripe";
import { adminDb } from "./supabase";
import type { Plan } from "@/lib/plans";
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Pagos no configurados");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}
export const priceId = (plan: "plus" | "voice") => process.env[plan === "plus" ? "STRIPE_PLUS_PRICE_ID" : "STRIPE_VOICE_PRICE_ID"];
export function planForPrice(id: string): Plan | null {
  if (id === priceId("plus")) return "plus";
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
