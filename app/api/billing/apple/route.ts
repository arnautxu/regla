import { timingSafeEqual } from "node:crypto";
import { currentUser } from "@/lib/server/supabase";
import { limitedJson, privateJson, sameOrigin } from "@/lib/server/http";
import { activePlan, billingAccount } from "@/lib/server/billing";
import { appleReady, syncApple } from "@/lib/server/apple-billing";
import { appleWebhookUsers } from "@/lib/server/apple-state";

/** El móvil acaba de comprar o restaurar: vuelve a leer el estado. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  if (!appleReady()) return privateJson({ error: "Las compras del iPhone aún no están abiertas." }, 503);
  try {
    await syncApple(user.id);
    return privateJson({ plan: activePlan(await billingAccount(user.id)) });
  } catch { return privateJson({ error: "No he podido comprobar tu compra. Prueba otra vez." }, 503); }
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhook de RevenueCat: solo dice a quién mirar. */
export async function POST(req: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !appleReady()) return new Response("Not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!sameSecret(auth.replace(/^Bearer\s+/i, ""), secret)) return new Response("Unauthorized", { status: 401 });
  const ids = appleWebhookUsers(await limitedJson(req, 64 * 1024).catch(() => null));
  if (!ids) return new Response("Invalid event", { status: 400 });
  // Las compras anónimas (sin cuenta) no tienen a quién ir.
  try {
    for (const id of new Set(ids)) await syncApple(id);
    return Response.json({ received: true });
  } catch { return new Response("Sync failed", { status: 500 }); }
}
