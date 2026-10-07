"use client";

import { useEffect } from "react";
import { updateSettings, type AlertSettings, type Settings } from "./db";
import { disable, enable, status } from "./push";
import type { Forecast } from "./forecast";
import type { Lilaila } from "./use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   AVISOS: QUÉ QUIERE Y LA FICHA DEL CICLO

   Una sola suscripción de push en su móvil sirve para varios avisos
   (pastilla, regla, semana sensible). Por eso apagar uno ya no da de
   baja el móvil: se apaga ESE aviso en el servidor, y la suscripción
   solo se borra cuando no queda ninguno encendido.

   Lo que se manda al servidor es siempre la lista entera, sacada de
   los ajustes. Mandar solo el que cambia dejaría el de la pastilla
   sin decir, y una suscripción nueva sin decir nada se lee como
   "quiere la pastilla" (así eran todas antes de esto).
   ═══════════════════════════════════════════════════════════════ */

/** Los avisos que suenan en SU móvil y necesitan la suscripción. */
function needsLidiaPush(s: Settings): boolean {
  return (s.pill.enabled && s.pill.remind) || s.alerts.period || s.alerts.sensitive;
}

function prefsOf(s: Settings) {
  return {
    pill: s.pill.enabled && s.pill.remind,
    period: s.alerts.period,
    sensitive: s.alerts.sensitive,
    arnauHeadsUp: s.alerts.arnauHeadsUp,
    arnauView: s.alerts.arnauView,
  };
}

async function post(body: object): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      message:
        res.status === 401
          ? "Entra con tu código y vuelve a intentarlo."
          : (data.error ?? "El servidor no lo ha aceptado."),
    };
  } catch {
    return { ok: false, message: "Sin conexión. Prueba otra vez." };
  }
}

/**
 * Aplica unos ajustes nuevos: suscribe si hace falta, manda la lista
 * al servidor, y da de baja el móvil si ya no queda nada que suene.
 * Los ajustes solo se guardan si el servidor ha dicho que sí: un
 * interruptor encendido con un aviso que no va a llegar es mentir.
 */
export async function applyAlerts(
  current: Settings,
  next: Settings,
): Promise<{ ok: boolean; message: string }> {
  const pushNow = await status();
  if (needsLidiaPush(next) && pushNow !== "encendido") {
    const res = await enable(next.pill.hour, "lidia");
    if (!res.ok) return res;
  }

  const n = next.alerts;
  const needsForecast = n.period || n.sensitive || n.arnauHeadsUp || n.arnauView;
  // Con todo apagado, la ficha se borra del servidor: si nada la usa,
  // no tiene por qué estar allí.
  const saved = await post({
    prefs: prefsOf(next),
    ...(needsForecast ? {} : { forecast: null }),
  });
  if (!saved.ok) return { ok: false, message: saved.message ?? "No se ha guardado." };

  if (!needsLidiaPush(next) && needsLidiaPush(current)) await disable();

  await updateSettings({ pill: next.pill, alerts: next.alerts });
  // La ficha sale ya, sin esperar al siguiente cambio del ciclo.
  forget();
  return { ok: true, message: "Hecho." };
}

export async function toggleAlert(
  settings: Settings,
  key: keyof AlertSettings,
): Promise<{ ok: boolean; message: string }> {
  return applyAlerts(settings, {
    ...settings,
    alerts: { ...settings.alerts, [key]: !settings.alerts[key] },
  });
}

/* ── La ficha del ciclo ──────────────────────────────────────── */

const SENT_KEY = "lilaila:ficha-enviada";
/** Se reenvía aunque no cambie, para que el servidor la sepa viva. */
const REFRESH_MS = 3 * 86400000;

function forget() {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {}
}

function forecastOf(l: Lilaila): Omit<Forecast, "updatedAt"> | null {
  const latest = l.cycles.at(-1);
  if (!latest) return null;
  const win = (w?: { from: number; to: number }) => (w ? { from: w.from, to: w.to } : undefined);
  return {
    cycleStart: latest.startDate,
    length: l.state.avgLength,
    periodLength: l.state.model.periodLength,
    spread: l.state.model.spread,
    sensitive: win(l.windows.sensitive),
    monster: win(l.windows.monster),
  };
}

/**
 * Sube la ficha cuando cambia, solo si algún aviso o la vista de
 * Arnau la necesita. Con todo apagado no sale nada del móvil.
 */
export function useForecastSync(l: Lilaila, allowed = true) {
  const a = l.settings.alerts;
  const wanted = allowed && l.ready && (a.period || a.sensitive || a.arnauHeadsUp || a.arnauView);
  const ficha = l.ready ? forecastOf(l) : null;
  const json = JSON.stringify(ficha);

  useEffect(() => {
    if (!wanted) return;
    let last: { json: string; at: number } | null = null;
    try {
      last = JSON.parse(localStorage.getItem(SENT_KEY) ?? "null");
    } catch {}
    if (last && last.json === json && Date.now() - last.at < REFRESH_MS) return;

    void post({ forecast: JSON.parse(json) }).then((r) => {
      if (!r.ok) return;
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify({ json, at: Date.now() }));
      } catch {}
    });
  }, [wanted, json]);
}
