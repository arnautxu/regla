"use client";

import Link from "next/link";
import { CUENTAS_ACTIVAS, useCuenta } from "@/lib/cuenta";
import { PLANS } from "@/lib/plans";
import { Lilita } from "@/components/lilita";
import { FilaIndice, HUMOR, Segmentos } from "@/components/ajustes-ui";
import { DEFAULT_STEP_ORDER, updateSettings, type Settings } from "@/lib/db";
import { esMenor, nombrePareja } from "@/lib/pareja";
import { haptic, useLilaila } from "@/lib/use-lilaila";

const TEMAS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "auto", label: "Auto" },
];

/** Cuántas preguntas le salen al apuntar el día, sangrado incluido. */
function preguntas(s: Settings) {
  const visibles = DEFAULT_STEP_ORDER.filter(
    (p) =>
      !s.steps.hidden.includes(p) &&
      !(p === "pastilla" && !s.pill.enabled) &&
      !(p === "sexo" && esMenor(s)) &&
      !(p === "propias" && s.customTags.length === 0),
  );
  return visibles.length + 1;
}

function resumenAvisos(s: Settings) {
  if (s.pill.enabled && s.pill.remind) return `Pastilla ${String(s.pill.hour).padStart(2, "0")}:00`;
  const n = [s.alerts.period, s.alerts.sensitive].filter(Boolean).length;
  return n === 0 ? "Apagados" : n === 1 ? "1 activo" : `${n} activos`;
}

export default function Ajustes() {
  const { ready, settings } = useLilaila();
  const cuenta = useCuenta();
  if (!ready) return null;

  const menor = esMenor(settings);
  const pareja = nombrePareja(settings);

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-xl">
      <div className="flex items-center gap-2 pt-lg">
        <Lilita mood="neutral" size={38} className="shrink-0" />
        <h1 className="font-display text-xl font-bold tracking-[-0.03em]">
          Ajustes
        </h1>
      </div>

      {CUENTAS_ACTIVAS && cuenta && (
        <Link
          href="/ajustes/cuenta"
          className="sticker flex min-h-[64px] items-center gap-md rounded-2xl px-lg py-3"
          style={{ background: "var(--surface)" }}
        >
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full font-display text-lg font-bold uppercase"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            {(settings.name || cuenta.email).slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{settings.name || "Tu cuenta"}</span>
            <span className="mt-0.5 block truncate text-xs text-faint">
              {cuenta.email} · {cuenta.plan === "free" ? "Sin Plus" : PLANS[cuenta.plan].name}
            </span>
          </span>
          <span aria-hidden="true" className="text-faint">›</span>
        </Link>
      )}

      <Tarjeta>
        <FilaIndice
          href="/ajustes/lilita"
          icono="💬"
          label="Lilita"
          valor={HUMOR.find((h) => h.value === settings.humorLevel)?.label}
        />
        <FilaIndice href="/ajustes/dia" icono="📝" label="Tu día" valor={`${preguntas(settings)} preguntas`} />
        <FilaIndice href="/ajustes/avisos" icono="🔔" label="Avisos" valor={resumenAvisos(settings)} />
        {!menor && (
          <FilaIndice
            href="/ajustes/pareja"
            icono="🍪"
            label={pareja ?? "Tu pareja"}
            valor={!pareja ? "Añadir" : settings.alerts.arnauView ? "Ve tu fase" : undefined}
          />
        )}
      </Tarjeta>

      <Tarjeta>
        <FilaIndice href="/ajustes/datos" icono="🔒" label="Tus datos" valor="Copia y borrado" />
      </Tarjeta>

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Aspecto</h2>
        <div className="mt-sm">
          <Segmentos
            label="Aspecto"
            opciones={TEMAS}
            valor={settings.theme}
            onChange={(theme) => {
              haptic(10);
              void updateSettings({ theme });
            }}
          />
        </div>
      </section>

      <p className="text-xs leading-relaxed text-faint">
        Lilaila no es un dispositivo médico ni un método anticonceptivo.
      </p>
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticker divide-y divide-[var(--border)] rounded-2xl px-lg"
      style={{ background: "var(--surface)" }}
    >
      {children}
    </div>
  );
}
