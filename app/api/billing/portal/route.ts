import { currentUser } from "@/lib/server/supabase";
import { privateJson, sameOrigin } from "@/lib/server/http";
import { billingAccount, billingStore, stripeClient } from "@/lib/server/billing";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  const account = await billingAccount(user.id);
  if (!account?.customer_id || !process.env.LILAILA_APP_URL) return privateJson({ error: "No hay una suscripción que gestionar." }, 400);
  if (billingStore(account) === "apple") return privateJson({ error: "Tu suscripción va con Apple: se gestiona en los ajustes del iPhone." }, 409);
  try {
    const session = await stripeClient().billingPortal.sessions.create({ customer: account.customer_id, return_url: `${process.env.LILAILA_APP_URL}/ajustes` });
    return privateJson({ url: session.url });
  } catch { return privateJson({ error: "No se ha podido abrir tu suscripción." }, 503); }
}
