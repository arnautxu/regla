import { createHash } from "node:crypto";
import { adminDb, currentUser, partnerOwner } from "@/lib/server/supabase";
import { limitedJson, privateJson, sameOrigin } from "@/lib/server/http";
export async function partnerStatus() {
  return privateJson({ configured: true, authenticated: !!await partnerOwner() });
}
export async function partnerLogin(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra primero con tu correo." }, 401);
  const body = await limitedJson(req, 1024).catch(() => null) as { pin?: string } | null;
  if (typeof body?.pin !== "string" || body.pin.length < 16) return privateJson({ error: "Introduce el código de invitación de tu pareja." }, 400);
  const hash = createHash("sha256").update(body.pin.trim()).digest("hex");
  const { data, error } = await adminDb().rpc("accept_partner", { p_partner: user.id, p_hash: hash });
  return privateJson(error || !data ? { error: "La invitación ha caducado o ya está usada." } : { authenticated: true }, error || !data ? 400 : 200);
}
