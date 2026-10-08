import { z } from "zod";
import { currentUser, sessionClient } from "./supabase";
import { limitedJson, privateJson, sameOrigin } from "./http";

export async function accountStatus() {
  try {
    const user = await currentUser();
    return privateJson({ configured: true, mode: "account", authenticated: !!user, user: user && { id: user.id, email: user.email } });
  } catch { return privateJson({ error: "El acceso está temporalmente fuera de servicio." }, 503); }
}

export async function accountLogin(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const body = z.object({ email: z.email().max(254), token: z.string().regex(/^\d{6,8}$/).optional() })
    .safeParse(await limitedJson(req, 2048).catch(() => null));
  if (!body.success) return privateJson({ error: "Revisa el correo y el código." }, 400);
  try {
    const client = await sessionClient();
    const result = body.data.token
      ? await client.auth.verifyOtp({ email: body.data.email, token: body.data.token, type: "email" })
      : await client.auth.signInWithOtp({ email: body.data.email, options: { shouldCreateUser: true,
        emailRedirectTo: `${process.env.LILAILA_APP_URL ?? new URL(req.url).origin}/auth/callback`,
      } });
    if (result.error) return privateJson({ error: "No se ha podido completar. Revisa el código o espera un momento." }, 400);
    return privateJson({ sent: !body.data.token, authenticated: !!body.data.token });
  } catch { return privateJson({ error: "No se ha podido conectar. Prueba más tarde." }, 503); }
}

export async function accountLogout(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const { error } = await (await sessionClient()).auth.signOut();
  return privateJson(error ? { error: "No se ha podido cerrar la sesión." } : { authenticated: false }, error ? 503 : 200);
}
