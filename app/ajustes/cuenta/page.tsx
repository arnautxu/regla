"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { Planes, queHaPasado } from "@/components/cuenta";
import { stopBackup } from "@/lib/backup";
import {
  CUENTAS_ACTIVAS,
  DEMO,
  NATIVA,
  borrarCuenta,
  gestionarSuscripcion,
  refrescarPlan,
  salir,
  useCuenta,
  type Metodo,
} from "@/lib/cuenta";
import { PLANS } from "@/lib/plans";
import { haptic } from "@/lib/use-lilaila";

const METODO: Record<Metodo, string> = {
  apple: "Entras con Apple",
  google: "Entras con Google",
  email: "Entras con tu correo",
};

const fecha = (iso: string) => format(new Date(iso), "d 'de' MMMM", { locale: es });

/** Fuera de esta cuenta: este móvil vuelve a la puerta de entrada. */
async function despedirse(f: () => Promise<void>) {
  stopBackup();
  const registration = await navigator.serviceWorker?.getRegistration();
  await registration?.pushManager.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => {});
  await f();
  if (!DEMO) localStorage.setItem("lilaila-account-owner", "guest");
  // Recarga entera a propósito: cada cuenta tiene su propia base de datos.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign("/");
}

export default function TuCuenta() {
  const cuenta = useCuenta();
  const [planes, setPlanes] = useState(false);
  const [aviso, setAviso] = useState("");
  const [ocupada, setOcupada] = useState(false);

  // Al volver del pago (o de los ajustes de Apple) el plan puede haber cambiado.
  useEffect(() => {
    void refrescarPlan();
    const alVolver = () => document.visibilityState === "visible" && void refrescarPlan();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  if (!CUENTAS_ACTIVAS || !cuenta) return null;

  const plan = PLANS[cuenta.plan];
  const conPlus = cuenta.plan !== "free";
  const restantes = Math.max(0, plan.messages - (cuenta.uso?.mensajes ?? 0));
  const llamadas = Math.max(0, Math.floor((plan.voiceSeconds - (cuenta.uso?.segundos ?? 0)) / 120));

  async function intentar(f: () => Promise<unknown>) {
    if (ocupada) return;
    setOcupada(true);
    setAviso("");
    try {
      await f();
    } catch (e) {
      setAviso(queHaPasado(e));
    } finally {
      setOcupada(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-xl">
      <Link href="/ajustes" className="self-start pt-lg text-sm font-semibold text-muted">
        ← Ajustes
      </Link>
      <h1 className="font-display text-xl font-bold tracking-[-0.03em]">Tu cuenta</h1>

      {conPlus ? (
        <div
          className="flex items-center gap-3 rounded-2xl px-lg py-md"
          style={{ background: "var(--accent-soft)", boxShadow: "inset 0 0 0 2px var(--accent), 3px 3px 0 0 var(--depth-shadow)" }}
        >
          <Lilita mood="energica" size={56} className="shrink-0" />
          <div>
            <p className="font-display text-base font-bold text-accent">{plan.name}</p>
            <p className="text-xs text-muted">
              {cuenta.hasta ? `Pagado hasta el ${fecha(cuenta.hasta)}.` : "Activo."}
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlanes(true)}
          className="sticker flex items-center gap-3 rounded-2xl px-lg py-md text-left"
          style={{ background: "var(--surface)" }}
        >
          <Lilita mood="flirty" size={56} className="shrink-0" />
          <div>
            <p className="font-display text-base font-bold">Sin Plus</p>
            <p className="text-xs text-muted">Toca para ver los planes y hablar conmigo sin mirar el contador.</p>
          </div>
        </button>
      )}

      <Group
        title="Lo que te queda"
        note={
          cuenta.uso?.renueva
            ? `Se renueva el ${fecha(cuenta.uso.renueva)}. Si llegas al tope, paro: nunca se cobra de más.`
            : "Las respuestas de prueba no se renuevan. Tu diario sigue gratis, siempre."
        }
      >
        <Row label="Respuestas de Lilita" value={`${restantes} de ${plan.messages}`} />
        {plan.voiceSeconds > 0 && <Row label="Llamadas" value={`${llamadas} de 10`} />}
      </Group>

      {conPlus && (
        <Group
          title="Suscripción"
          note={
            cuenta.tienda === "apple"
              ? "Los cobros los hace Apple: facturas y tarjeta están en los ajustes de tu cuenta de Apple."
              : "Las facturas y la tarjeta están en la página de pago."
          }
        >
          <Row
            label={cuenta.tienda === "apple" ? "Gestionar en el App Store" : "Cambiar o cancelar"}
            hint={
              cuenta.tienda === "apple" && !NATIVA
                ? "Desde el iPhone: Ajustes → tu nombre → Suscripciones"
                : "Sigues con Plus hasta que acabe lo pagado"
            }
            onClick={() => {
              haptic(10);
              void intentar(gestionarSuscripcion);
            }}
          />
        </Group>
      )}

      <Group title="Cuenta">
        <Row label={METODO[cuenta.metodo]} value={cuenta.email} />
        <Row
          label="Cerrar sesión"
          hint="Tu diario sigue en tu cuenta"
          onClick={() => {
            haptic(10);
            void intentar(() => despedirse(salir));
          }}
        />
        <Row
          label="Borrar cuenta"
          hint="Tu diario, tu copia y tu cuenta. Para siempre."
          danger
          onClick={() => {
            const apple =
              cuenta.tienda === "apple" && conPlus
                ? "\n\nTu suscripción de Apple no se cancela sola: cancélala en los ajustes del iPhone."
                : "";
            if (!window.confirm(`¿Borro tu cuenta, tu diario y la copia? No se puede deshacer.${apple}`)) return;
            haptic([18, 40, 26]);
            void intentar(() => despedirse(borrarCuenta));
          }}
        />
      </Group>

      {aviso && (
        <p role="alert" className="text-center text-sm" style={{ color: "var(--accent)" }}>
          {aviso}
        </p>
      )}

      {planes && <Planes onCerrar={() => setPlanes(false)} />}
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{title}</h2>
      <div className="flat mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg" style={{ background: "var(--surface)" }}>
        {children}
      </div>
      {note && <p className="mt-sm text-xs leading-relaxed text-faint">{note}</p>}
    </section>
  );
}

function Row({
  label,
  hint,
  value,
  danger,
  onClick,
}: {
  label: string;
  hint?: string;
  value?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className="flex min-h-[54px] w-full items-center justify-between gap-md py-3 text-left"
    >
      <span className="min-w-0">
        <span
          className="block text-base"
          style={{ color: danger ? "var(--accent)" : "var(--fg)", fontWeight: danger ? 600 : 400 }}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>
      {value ? (
        <span className="tnum shrink-0 truncate text-sm text-muted">{value}</span>
      ) : (
        <span className="text-faint">›</span>
      )}
    </Tag>
  );
}
