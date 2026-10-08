"use client";
import { useEffect, useState } from "react";
import { accountMode } from "@/lib/account-mode";
import { startBackup, stopBackup } from "@/lib/backup";
import { Lilita } from "./lilita";

export const OWNER_KEY = "lilaila-account-owner";
export function AccountGate({ children }: { children: React.ReactNode }) {
  if (!accountMode()) return children;
  return <Gate>{children}</Gate>;
}
function Gate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "login" | "ready">("loading");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const changed = (event: StorageEvent) => { if (event.key === OWNER_KEY) location.reload(); };
    window.addEventListener("storage", changed);
    fetch("/api/auth", { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error("No se ha podido comprobar tu cuenta.");
      const d = await r.json();
      if (!alive) return;
      const owner = d.user?.id ?? "guest";
      if ((localStorage.getItem(OWNER_KEY) ?? "guest") !== owner) {
        stopBackup(); localStorage.setItem(OWNER_KEY, owner); location.reload(); return;
      }
      if (d.authenticated) { await startBackup(); if (alive) setStatus("ready"); }
      else setStatus(sessionStorage.getItem("lilaila-guest") === "true" ? "ready" : "login");
    }).catch(() => {
      if (alive) { setError("Sin conexión. Puedes consultar el diario de este dispositivo."); setStatus("ready"); }
    });
    return () => { alive = false; stopBackup(); window.removeEventListener("storage", changed); };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(sent ? { token } : {}) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.authenticated) { sessionStorage.removeItem("lilaila-guest"); location.reload(); }
      else setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se ha podido entrar."); }
    finally { setBusy(false); }
  }
  if (status === "loading") return <div className="flex min-h-dvh items-center justify-center"><Lilita mood="dormida" size={100} /></div>;
  if (status === "ready") return children;
  return <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col justify-center gap-lg px-6 py-12">
    <Lilita mood="neutral" size={110} />
    <h1 className="font-display text-3xl font-bold">Tu ciclo. Tu espacio.</h1>
    <p className="text-muted">Entra con tu correo para guardar una copia privada y hablar con Lilita.</p>
    <form onSubmit={submit} className="flex flex-col gap-4">
      {sent && <p className="text-sm">Abre el enlace que te hemos enviado al correo en este navegador. Si el correo incluye un código, también puedes introducirlo aquí.</p>}
      <label className="flex flex-col gap-2">Correo electrónico<input className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" type="email" autoComplete="email" required value={email} disabled={sent} onChange={e => setEmail(e.target.value)} /></label>
      {sent && <label className="flex flex-col gap-2">Código del correo<input className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" required value={token} onChange={e => setToken(e.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="rounded-full bg-[var(--accent)] p-4 font-bold text-[var(--on-accent)] disabled:opacity-50">{busy ? "Un momento…" : sent ? "Entrar" : "Recibir código"}</button>
      {sent && <button type="button" className="p-2 underline" onClick={() => { setSent(false); setToken(""); }}>Cambiar correo o pedir otro código</button>}
    </form>
    <button className="p-3 underline" onClick={() => { sessionStorage.setItem("lilaila-guest", "true"); setStatus("ready"); }}>Continuar con mi diario en este móvil</button>
    <p className="text-xs text-muted">El diario local es gratis. Las conversaciones tienen un uso incluido que puedes consultar antes de suscribirte.</p>
  </main>;
}
