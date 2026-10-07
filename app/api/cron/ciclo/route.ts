import { readPushDoc, sendToAudience, writePushDoc } from "@/lib/server/push";
import { localNow } from "@/lib/server/local-time";
import { readForecast } from "@/lib/forecast";

/* ═══════════════════════════════════════════════════════════════
   LOS AVISOS DEL CICLO

   Una vez al día, por la mañana (ver vercel.json). Lee la ficha que
   sube el móvil de Lídia —fechas y longitudes, nada más— y mira si
   hoy toca alguno de estos:

     · A ella, dos días antes de la regla prevista.
     · A ella, al entrar en su semana sensible (si hay patrón de PAS).
     · A Arnau, unos días antes de la zona Cookie Monster, o de la
       regla si todavía no hay patrón de enfados.

   Cada aviso sale UNA vez por ciclo: se apunta el inicio del ciclo
   para el que ya salió. Se mira con margen ("faltan dos días o
   menos") y no con un igual, para que un día sin cron o con el móvil
   apagado no se coma el aviso del mes entero.

   Si la ficha es vieja (no ha abierto la app en semanas), los días
   salen negativos y no se avisa de nada: mejor callar que anunciar
   una regla de hace un mes.
   ═══════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const A_ELLA = [
  "En un par de días llega la visita. Chocolate, ibuprofeno y bragas de guerra a mano.",
  "Aviso de Lilita: la regla viene de camino. Que no te pille en blanco.",
  "Dos días, más o menos. Ve dejando una compresa en cada bolso.",
];

const SENSIBLE = [
  "Empieza tu semana sensible. Si lloras con un anuncio, no eres tú: soy yo. Bueno, tus hormonas.",
  "Semana sensible a la vista. Trátate bonito, que el resto ya da guerra solo.",
];

const A_ARNAU_MONSTRUO = (d: number) =>
  d <= 0
    ? "Zona Cookie Monster desde hoy. Galletas, paciencia y cero comentarios graciosos."
    : `Zona Cookie Monster en ${d} ${d === 1 ? "día" : "días"}. Ve comprando galletas.`;

const A_ARNAU_REGLA = (d: number) =>
  d <= 0
    ? "A Lidia le baja hoy, más o menos. Mantita y chocolate."
    : `A Lidia le baja en ${d} ${d === 1 ? "día" : "días"}, más o menos. Ve preparando mantita y chocolate.`;

function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { date } = localNow(new Date());
  const push = await readPushDoc();
  const f = push.forecast;
  if (!f) return Response.json({ skipped: "sin ficha", date });

  const r = readForecast(f, date);
  const prefs = push.prefs ?? {};
  const done = { ...push.cycleNudges };
  const sent: string[] = [];

  if (prefs.period && done.period !== f.cycleStart && r.daysUntil >= 0 && r.daysUntil <= 2) {
    const res = await sendToAudience("lidia", {
      title: "Lilaila",
      body: pick(A_ELLA, date),
      tag: `regla-${f.cycleStart}`,
      url: "/",
    });
    if (res.sent > 0) {
      done.period = f.cycleStart;
      sent.push("regla");
    }
  }

  // Al entrar, o al día siguiente si ese día no hubo cron.
  if (
    prefs.sensitive &&
    f.sensitive &&
    done.sensitive !== f.cycleStart &&
    r.dayOfCycle >= f.sensitive.from &&
    r.dayOfCycle <= Math.min(f.sensitive.from + 1, f.sensitive.to)
  ) {
    const res = await sendToAudience("lidia", {
      title: "Lilaila",
      body: pick(SENSIBLE, date),
      tag: `sensible-${f.cycleStart}`,
      url: "/",
    });
    if (res.sent > 0) {
      done.sensitive = f.cycleStart;
      sent.push("sensible");
    }
  }

  if (prefs.arnauHeadsUp && done.arnau !== f.cycleStart) {
    // Con patrón de enfados, la zona Cookie Monster; sin él, la regla.
    const toMonster = f.monster
      ? r.monsterNow
        ? 0
        : r.monsterIn
      : undefined;
    const body =
      toMonster !== undefined && toMonster <= 3
        ? A_ARNAU_MONSTRUO(toMonster)
        : !f.monster && r.daysUntil >= 0 && r.daysUntil <= 2
          ? A_ARNAU_REGLA(r.daysUntil)
          : undefined;
    if (body) {
      const res = await sendToAudience("cookie-monster", {
        title: "🍪 Cookie Monster",
        body,
        tag: `aviso-arnau-${f.cycleStart}`,
        url: "/cookie-monster",
      });
      if (res.sent > 0) {
        done.arnau = f.cycleStart;
        sent.push("arnau");
      }
    }
  }

  if (sent.length) {
    // Se relee: sendToAudience puede haber limpiado suscripciones
    // muertas por el camino y no hay que resucitarlas.
    const fresco = await readPushDoc();
    await writePushDoc({ ...fresco, cycleNudges: done });
  }

  return Response.json({ date, dayOfCycle: r.dayOfCycle, daysUntil: r.daysUntil, sent });
}
