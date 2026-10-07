import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import {
  pushConfigured,
  readPushDoc,
  writePushDoc,
  type AlertPrefs,
} from "@/lib/server/push";
import { isForecast } from "@/lib/forecast";

/* ═══════════════════════════════════════════════════════════════
   QUÉ AVISOS, Y LA FICHA DEL CICLO

   Dos cosas que sube el móvil de Lídia y que viven junto a las
   suscripciones, no en la copia del diario:

     · Qué avisos quiere (pastilla, regla, semana sensible, Arnau).
       Están aquí por lo mismo que la hora de la pastilla: la copia
       la reescribe entera cualquier móvil con una versión vieja, y
       un aviso que se apaga solo no se nota hasta que no suena.

     · La ficha del ciclo (lib/forecast.ts): fechas y longitudes,
       nada más. Es lo único que el cron y Arnau necesitan saber.

   Detrás de la sesión de Lídia. Arnau no puede escribir aquí.
   ═══════════════════════════════════════════════════════════════ */

async function guard(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

const DENIED = Response.json({ error: "No autorizado." }, { status: 401 });

const KEYS: (keyof AlertPrefs)[] = ["pill", "period", "sensitive", "arnauHeadsUp", "arnauView"];

export async function GET() {
  if (!(await guard())) return DENIED;
  if (!pushConfigured()) return Response.json({ configured: false, prefs: {} });
  const doc = await readPushDoc();
  return Response.json({ configured: true, prefs: doc.prefs ?? {} });
}

export async function POST(req: Request) {
  if (!(await guard())) return DENIED;
  if (!pushConfigured()) {
    return Response.json(
      { error: "El servidor no tiene los avisos configurados." },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    prefs?: Record<string, unknown>;
    forecast?: unknown;
  } | null;
  if (!body) return Response.json({ error: "JSON inválido." }, { status: 400 });

  const doc = await readPushDoc();
  const prefs: AlertPrefs = { ...doc.prefs };
  for (const k of KEYS) {
    const v = body.prefs?.[k];
    if (typeof v === "boolean") prefs[k] = v;
  }

  let forecast = doc.forecast;
  if (body.forecast === null) forecast = undefined;
  else if (body.forecast !== undefined) {
    if (!isForecast(body.forecast)) {
      return Response.json({ error: "Ficha del ciclo no válida." }, { status: 400 });
    }
    const f = body.forecast;
    // Se reconstruye campo a campo: nada que no sea de la ficha entra
    // en el documento aunque el móvil lo mandara.
    forecast = {
      cycleStart: f.cycleStart,
      length: f.length,
      periodLength: f.periodLength,
      spread: f.spread,
      sensitive: f.sensitive && { from: f.sensitive.from, to: f.sensitive.to },
      monster: f.monster && { from: f.monster.from, to: f.monster.to },
      updatedAt: new Date().toISOString(),
    };
  }

  await writePushDoc({ ...doc, prefs, forecast });
  return Response.json({ ok: true, prefs });
}
