import { createHash, randomBytes } from "node:crypto";
import { adminDb, currentUser } from "@/lib/server/supabase";
import { privateJson, sameOrigin } from "@/lib/server/http";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  const token = randomBytes(16).toString("hex");
  const { error } = await adminDb().from("partner_invites").upsert({ owner_id: user.id, token_hash: createHash("sha256").update(token).digest("hex"), expires_at: new Date(Date.now() + 3600000).toISOString() }, { onConflict: "owner_id" });
  return privateJson(error ? { error: "No se ha podido crear la invitación." } : { token }, error ? 503 : 200);
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  const { error } = await adminDb().from("partner_links").delete().eq("owner_id", user.id);
  if (error) return privateJson({ error: "No se ha podido revocar el acceso." }, 503);
  await adminDb().from("partner_invites").delete().eq("owner_id", user.id);
  // Remove receiver endpoints too so future notifications cannot reach an ex-partner.
  const { readAccountPush, writeAccountPush } = await import("@/lib/server/account-push");
  const doc = await readAccountPush(user.id);
  if (doc.revision) await writeAccountPush({ ...doc, subs: doc.subs.filter(s => s.audience !== "cookie-monster") }, user.id);
  return privateJson({ ok: true });
}
