"use client";

import { useEffect, useState } from "react";
import type { AlertSettings, Settings } from "@/lib/db";
import { status, type PushStatus } from "@/lib/push";
import { toggleAlert } from "@/lib/alerts";
import { haptic } from "@/lib/use-lilaila";
import { SwitchRow } from "./switch-row";
import { accountMode } from "@/lib/account-mode";

/* ═══════════════════════════════════════════════════════════════
   AVISOS DEL CICLO Y LO QUE VE ARNAU

   Todo apagado de serie. Cada interruptor dice qué sale del móvil:
   para que avisen, el servidor tiene que saber en qué día del ciclo
   va, así que se sube una ficha con fechas y longitudes (nada de
   síntomas, notas ni PAS). Con todo apagado no se sube nada.
   ═══════════════════════════════════════════════════════════════ */

export function AlertsPanel({
  settings,
  hasSensitive,
  hasMonster,
}: {
  settings: Settings;
  /** Hay patrón de semana sensible (PAS) con que avisar */
  hasSensitive: boolean;
  /** Hay patrón de zona Cookie Monster */
  hasMonster: boolean;
}) {
  const [push, setPush] = useState<PushStatus | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void status().then(setPush);
  }, []);

  const a = settings.alerts;
  const puedeSonar = push === "apagado" || push === "encendido";

  async function cambiar(key: keyof AlertSettings) {
    if (ocupado) return;
    haptic(10);
    setOcupado(true);
    setAviso(null);
    try {
      const res = await toggleAlert(settings, key);
      if (!res.ok) setAviso(res.message);
      setPush(await status());
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Avisos del ciclo
        </h2>
        <div
          className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
          style={{ background: "var(--surface)" }}
        >
          <SwitchRow
            label="Dos días antes de la regla"
            hint="Para que no te pille en blanco."
            on={a.period && push === "encendido"}
            disabled={!puedeSonar || ocupado}
            onToggle={() => void cambiar("period")}
          />
          <SwitchRow
            label="Al empezar la semana sensible"
            hint={
              hasSensitive
                ? "Los días en que se te juntan los PAS."
                : "Cuando haya PAS suficientes para ver el patrón."
            }
            on={a.sensitive && push === "encendido"}
            disabled={!puedeSonar || ocupado}
            onToggle={() => void cambiar("sensitive")}
          />
        </div>
        {(aviso || (push && !puedeSonar)) && (
          <p className="mt-sm text-xs leading-relaxed text-faint" role="status">
            {aviso ??
              (push === "sin-soporte"
                ? "Para que suene, añade Lilaila a la pantalla de inicio."
                : push === "bloqueado"
                  ? "Las notificaciones están bloqueadas en los ajustes del móvil."
                  : "Este despliegue no tiene los avisos configurados.")}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          {accountMode() ? "Tu pareja" : "Arnau"}
        </h2>
        <div
          className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
          style={{ background: "var(--surface)" }}
        >
          <SwitchRow
            label="Que vea en qué fase estás"
            hint="En su pantalla de Cookie Monster: la fase y cuánto falta para la regla. Nada más."
            on={a.arnauView}
            disabled={ocupado}
            onToggle={() => void cambiar("arnauView")}
          />
          <SwitchRow
            label="Avisarle antes de la zona Cookie Monster"
            hint={
              hasMonster
                ? "Le llega un aviso unos días antes."
                : "Sin patrón de enfados todavía, le aviso dos días antes de la regla."
            }
            on={a.arnauHeadsUp}
            disabled={ocupado}
            onToggle={() => void cambiar("arnauHeadsUp")}
          />
        </div>
        <p className="mt-sm text-xs leading-relaxed text-faint">
          Para esto el servidor guarda cuándo empezó tu ciclo y cuánto suele
          durar. Ni síntomas, ni notas, ni PAS.
        </p>
      </section>
    </>
  );
}
