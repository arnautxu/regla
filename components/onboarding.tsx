"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "./lilita";
import { fromKey, startPeriod, toKey, todayKey, updateSettings } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";
import { capitalize } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING

   Tres pantallas, veinte segundos: nombre, última regla, duración
   media. Lo justo para que la primera pantalla de Hoy no salga en
   blanco ("día 1 de un ciclo de 28" inventado) — el resto lo aprende
   sola de lo que registre. Sin barra de progreso agresiva ni
   validación estricta: si no se acuerda de la fecha, se salta, y el
   nombre por defecto ya es el suyo.
   ═══════════════════════════════════════════════════════════════ */

const RELATIVOS = ["Hoy", "Ayer", "Hace 2 días", "Hace 3 días", "Hace 4 días"];
const DURACIONES = [24, 26, 28, 30, 32, 35];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [lastPeriod, setLastPeriod] = useState<string | "unsure" | null>(null);
  const [avgLength, setAvgLength] = useState(28);
  const [saving, setSaving] = useState(false);

  const base = fromKey(todayKey());

  async function finish() {
    if (saving) return;
    setSaving(true);
    haptic([18, 40, 26]);
    await updateSettings({
      name: name.trim() || "Lidia",
      avgCycleLength: avgLength,
      onboarded: true,
    });
    if (lastPeriod && lastPeriod !== "unsure") {
      await startPeriod(lastPeriod);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-between gap-xl px-safe pb-2xl pt-safe">
      <div className="flex justify-center gap-1.5 pt-lg" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-6 rounded-full transition-colors duration-200"
            style={{ background: i <= step ? "var(--accent)" : "var(--border)" }}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-lg">
          <Lilita mood="energica" size={128} />
          <div className="text-balance text-center">
            <h1 className="font-display text-xl font-bold leading-[1.15] tracking-[-0.03em]">
              Bienvenida al infierno mensual. Estoy aquí.
            </h1>
            <p className="mt-2 text-sm text-muted">¿Cómo te llamo?</p>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="Lidia"
            aria-label="Tu nombre"
            className="w-full rounded-2xl px-4 py-3.5 text-center font-display text-lg outline-none"
            style={{ background: "var(--surface)", boxShadow: "var(--depth-sm)" }}
          />
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-lg">
          <Lilita mood="neutral" size={116} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Cuándo te bajó la última vez?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Así me hago una idea de dónde vas. Si no te acuerdas, no pasa
              nada.
            </p>
          </div>

          <ul className="flex w-full flex-col gap-2">
            {RELATIVOS.map((label, i) => {
              const date = addDays(base, -i);
              const key = toKey(date);
              const active = lastPeriod === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic(10);
                      setLastPeriod(key);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-2xl px-4 text-left transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
                    style={
                      active
                        ? {
                            background: "var(--accent)",
                            color: "var(--on-accent)",
                            boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                          }
                        : { background: "var(--surface)", boxShadow: "var(--depth-sm)" }
                    }
                  >
                    <span className="font-display text-base font-bold">
                      {label}
                    </span>
                    <span className="text-sm" style={{ opacity: active ? 0.85 : 0.6 }}>
                      {capitalize(format(date, "EEEE d", { locale: es }))}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  setLastPeriod("unsure");
                }}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl px-4 text-sm transition-[transform,box-shadow] duration-150 active:scale-[0.98]"
                style={
                  lastPeriod === "unsure"
                    ? { background: "var(--accent-soft)", color: "var(--accent)", boxShadow: "var(--depth-sm)" }
                    : { background: "var(--surface)", boxShadow: "var(--depth-sm)", color: "var(--fg-muted)" }
                }
              >
                No me acuerdo bien
              </button>
            </li>
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-lg">
          <Lilita mood="cuidando" size={116} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Cada cuánto te suele venir?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Un cálculo aproximado. Lo voy afinando sola con lo que
              registres.
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            {DURACIONES.map((d) => {
              const active = avgLength === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    haptic(10);
                    setAvgLength(d);
                  }}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl transition-[transform,box-shadow] duration-150 active:scale-[0.96] active:translate-x-[1px] active:translate-y-[1px]"
                  style={
                    active
                      ? {
                          background: "var(--accent)",
                          color: "var(--on-accent)",
                          boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                        }
                      : { background: "var(--surface)", boxShadow: "var(--depth-sm)" }
                  }
                >
                  <span className="tnum font-display text-xl font-bold">{d}</span>
                  <span className="text-2xs" style={{ opacity: active ? 0.85 : 0.6 }}>
                    días
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-faint">
            No hace falta saberlo seguro: 28 es razonable si no tienes ni idea.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic(6);
              setStep((s) => s - 1);
            }}
            className="min-h-[52px] flex-1 rounded-full text-base font-bold"
            style={{ color: "var(--fg-muted)" }}
          >
            Atrás
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (step < 2) {
              haptic(10);
              setStep((s) => s + 1);
            } else {
              void finish();
            }
          }}
          className="min-h-[52px] flex-[2] rounded-full font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            boxShadow: "3px 3px 0 0 var(--depth-shadow)",
          }}
        >
          {step < 2 ? "Seguir" : "Empezar"}
        </button>
      </div>
    </div>
  );
}
