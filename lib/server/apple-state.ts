import { z } from "zod";
import { APPLE_ENTITLEMENT, isAppleProduct } from "../apple-products";

const subscriberSchema = z.object({ subscriber: z.object({
  entitlements: z.record(z.string(), z.object({
    expires_date: z.string().nullable(),
    product_identifier: z.string(),
  })),
}) });

/** Solo el derecho «plus» y los dos productos de esta fase conceden acceso.
 * Una respuesta inválida falla antes de escribir en la cuenta. */
export function appleEntitlement(data: unknown, now = Date.now()): { plan: "free" | "plus"; until: string | null } {
  const e = subscriberSchema.parse(data).subscriber.entitlements[APPLE_ENTITLEMENT];
  const until = e?.expires_date ? Date.parse(e.expires_date) : NaN;
  if (!e || !isAppleProduct(e.product_identifier) || !Number.isFinite(until) || until <= now)
    return { plan: "free", until: null };
  return { plan: "plus", until: new Date(until).toISOString() };
}

const webhookSchema = z.object({ event: z.object({
  app_user_id: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  transferred_from: z.array(z.string()).optional(),
  transferred_to: z.array(z.string()).optional(),
}) });
const uuid = z.uuid();

/** TRANSFER no trae app_user_id: hay que revisar origen y destino. */
export function appleWebhookUsers(body: unknown): string[] | null {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return null;
  const e = parsed.data.event;
  return [...new Set([e.app_user_id, ...(e.aliases ?? []), ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])]
    .filter((id): id is string => typeof id === "string" && uuid.safeParse(id).success))];
}
