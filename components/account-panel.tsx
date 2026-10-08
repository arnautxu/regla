"use client";
import { useEffect, useState } from "react";
import { accountMode } from "@/lib/account-mode";
import { PLANS, type Plan } from "@/lib/plans";
import { stopBackup } from "@/lib/backup";

type Account = { plan: Plan; email: string; usedMessages: number; usedSeconds: number; resetsAt: string | null; billingReady: boolean; voiceReady: boolean; hasCustomer: boolean };
export function AccountPanel() {
  if (!accountMode()) return null;
  return <Panel />;
}
function Panel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  useEffect(() => {
    fetch("/api/account", { cache: "no-store" }).then(async r => { if (r.ok) setAccount(await r.json()); else if (r.status !== 401) setError("No se ha podido leer tu plan."); }).catch(() => setError("Sin conexión para consultar tu plan."));
  }, []);
  async function action(url: string, body?: unknown, method = "POST") {
    setBusy(true); setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) location.assign(d.url);
      if (d.token) setInvite(d.token);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "No se ha podido completar."); return false; }
    finally { setBusy(false); }
  }
  async function logout() {
    stopBackup();
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.pushManager.getSubscription().then(sub => sub?.unsubscribe()).catch(() => {});
    if (await action("/api/auth", undefined, "DELETE")) {
      localStorage.setItem("lilaila-account-owner", "guest"); sessionStorage.removeItem("lilaila-guest"); location.reload();
    }
  }
  if (!account) return <section className="sticker rounded-2xl p-5"><h2 className="font-display text-lg font-bold">Tu cuenta</h2><p className="my-3 text-sm">Tu diario se guarda en este móvil. Entra con tu correo para tener una copia privada.</p>{error && <p role="alert">{error}</p>}<button className="min-h-12 underline" onClick={() => { sessionStorage.removeItem("lilaila-guest"); location.reload(); }}>Entrar o crear cuenta</button></section>;
  const plan = PLANS[account.plan];
  return <section className="flex flex-col gap-4" aria-labelledby="account-heading">
    <div><h2 id="account-heading" className="font-display text-xl font-bold">Tu cuenta · {plan.name}</h2><p className="break-all text-sm text-muted">{account.email}</p></div>
    <div className="sticker rounded-2xl p-5">
      <p>{Math.max(0, plan.messages - account.usedMessages)} de {plan.messages} respuestas disponibles</p>
      {plan.voiceSeconds > 0 && <p className="mt-2">{Math.max(0, Math.floor((plan.voiceSeconds - account.usedSeconds) / 120))} de 10 llamadas disponibles</p>}
      <p className="mt-3 text-xs text-muted">{account.resetsAt ? `El uso se renueva el ${new Date(account.resetsAt).toLocaleDateString("es-ES", { timeZone: "UTC" })}.` : "Las 10 respuestas de prueba no se renuevan."} Cada llamada usa una de las incluidas, aunque termine antes de 2 minutos. Sin cargos por superar el uso incluido.</p>
    </div>
    {account.plan === "free" && (["plus", "voice"] as const).map(id => <div key={id} className="sticker rounded-2xl p-5">
      <h3 className="font-display text-lg font-bold">{PLANS[id].name} · {PLANS[id].euros.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/mes</h3>
      <p className="mt-2 text-sm text-muted">{PLANS[id].description} Cancela cuando quieras.</p>
      <button className="mt-4 min-h-12 w-full rounded-full bg-[var(--accent)] px-4 font-bold text-[var(--on-accent)] disabled:opacity-50" disabled={busy || !account.billingReady || (id === "voice" && !account.voiceReady)} onClick={() => void action("/api/billing/checkout", { plan: id })}>{account.billingReady && (id !== "voice" || account.voiceReady) ? `Elegir ${PLANS[id].name}` : "Próximamente"}</button>
    </div>)}
    {account.hasCustomer && <button className="min-h-12 underline" disabled={busy} onClick={() => void action("/api/billing/portal")}>Gestionar o cancelar suscripción</button>}
    <details className="sticker rounded-2xl p-5"><summary className="min-h-10 cursor-pointer font-bold">Conectar con mi pareja</summary><p className="my-3 text-sm text-muted">La invitación permite recibir y responder avisos. Tu diario y tus notas siguen siendo privados. Decide qué compartir en Avisos.</p>
      <button className="min-h-12 underline" disabled={busy} onClick={() => void action("/api/partner")}>Crear invitación de una hora</button>
      {invite && <div><p className="break-all rounded-xl bg-[var(--surface)] p-3 font-mono text-sm">{invite}</p><p className="mt-2 text-sm">Tu pareja debe entrar con su correo y abrir /cookie-monster para introducirlo.</p></div>}
      <button className="block min-h-12 underline" disabled={busy} onClick={() => void action("/api/partner", undefined, "DELETE").then(ok => { if (ok) setInvite(""); })}>Revocar el acceso de mi pareja</button>
    </details>
    {error && <p role="alert" className="text-sm">{error}</p>}
    <button className="min-h-12 underline" disabled={busy} onClick={() => void logout()}>Cerrar sesión en este dispositivo</button>
  </section>;
}
