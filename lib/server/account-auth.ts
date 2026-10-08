import { z } from "zod";
import { currentUser, sessionClient } from "./supabase";
import { limitedJson, privateJson, sameOrigin } from "./http";

export async function accountStatus() {
  try {
    const user = await currentUser();
    const provider = user?.app_metadata?.provider;
    return privateJson({ configured: true, mode: "account", authenticated: !!user, user: user && {
      id: user.id, email: user.email,
      method: provider === "apple" || provider === "google" ? provider : "email",
    } });
  } catch { return privateJson({ error: "El acceso está temporalmente fuera de servicio." }, 503); }
}

const loginSchema = z.union([
  z.object({ email: z.email().max(254), token: z.string().regex(/^\d{6,8}$/).optional() }),
  // Inicio de sesión nativo de Apple en el iPhone: el token firmado por
  // Apple y el nonce en claro con el que se pidió.
  z.object({ provider: z.literal("apple"), idToken: z.string().min(20).max(8192), nonce: z.string().min(16).max(128) }),
  // Apple o Google en la web: el servidor prepara la redirección.
  z.object({ provider: z.enum(["apple", "google"]), redirect: z.literal(true) }),
]);

export async function accountLogin(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const body = loginSchema.safeParse(await limitedJson(req, 16384).catch(() => null));
  if (!body.success) return privateJson({ error: "Revisa el correo y el código." }, 400);
  const origin = process.env.LILAILA_APP_URL ?? new URL(req.url).origin;
  try {
    const client = await sessionClient();
    const data = body.data;
    if ("idToken" in data) {
      const { error } = await client.auth.signInWithIdToken({ provider: "apple", token: data.idToken, nonce: data.nonce });
      if (error) return privateJson({ error: "Apple no me ha dejado entrar. Prueba otra vez." }, 400);
      return privateJson({ authenticated: true });
    }
    if ("redirect" in data) {
      const { data: oauth, error } = await client.auth.signInWithOAuth({
        provider: data.provider, options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
      });
      if (error || !oauth.url) return privateJson({ error: "No se ha podido abrir el inicio de sesión." }, 400);
      return privateJson({ url: oauth.url });
    }
    const result = data.token
      ? await client.auth.verifyOtp({ email: data.email, token: data.token, type: "email" })
      : await client.auth.signInWithOtp({ email: data.email, options: { shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback`,
      } });
    if (result.error) return privateJson({ error: "No se ha podido completar. Revisa el código o espera un momento.", code: result.error.code }, 400);
    return privateJson({ sent: !data.token, authenticated: !!data.token });
  } catch { return privateJson({ error: "No se ha podido conectar. Prueba más tarde." }, 503); }
}

export async function accountLogout(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const { error } = await (await sessionClient()).auth.signOut();
  return privateJson(error ? { error: "No se ha podido cerrar la sesión." } : { authenticated: false }, error ? 503 : 200);
}
