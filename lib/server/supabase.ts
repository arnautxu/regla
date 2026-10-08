import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function url() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("Supabase no configurado");
  return value;
}

export async function sessionClient() {
  const jar = await cookies();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Supabase no configurado");
  return createServerClient(url(), key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}

/** Used only after server authentication, never imported by client components. */
export function adminDb() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Supabase no configurado");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser() {
  const client = await sessionClient();
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) throw error;
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  return data.user;
}

export async function userId() {
  const user = await currentUser();
  if (!user) throw new Error("No autorizado");
  return user.id;
}

export async function partnerOwner(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await adminDb().from("partner_links").select("owner_id").eq("partner_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.owner_id ?? null;
}
