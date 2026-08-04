import { readDoc } from "@/lib/server/store";
import { readPushDoc, sendToAll, writePushDoc } from "@/lib/server/push";
import type { DayLog, Settings } from "@/lib/db";

/* ═══════════════════════════════════════════════════════════════
   EL AVISO DE LAS DIEZ

   Lo dispara un cron de Vercel (ver vercel.json). Los crons van en
   UTC y España cambia la hora dos veces al año, así que la hora NO se
   decide en el cron: se apuntan dos disparos —20:00 y 21:00 UTC, que
   son las 22:00 de Madrid en verano y en invierno respectivamente— y
   es este endpoint el que mira qué hora es allí de verdad.

   La marca `lastPillNudge` es lo que impide que suene dos veces: en
   verano el disparo de las 21:00 UTC llega a las 23:00 de Madrid, ve
   que el de hoy ya salió y se calla.

   Se usa `>=` y no `===` a propósito. Con `===`, cambiar la hora del
   aviso sin tocar el cron significaría que no suena NUNCA, y un
   recordatorio que falla en silencio es peor que no tenerlo. Así,
   como mucho, llega tarde.

   Nunca reventar: si no hay claves, si no hay suscripciones o si el
   documento está vacío, contesta 200 diciendo por qué. Un cron en
   rojo cada noche acaba siendo ruido que nadie mira.
   ═══════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const TZ = process.env.LILAILA_TZ || "Europe/Madrid";

/** Fecha y hora en el sitio donde vive ella, no donde corre esto. */
function localNow(now: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      // h23 y no hour12:false: con hour12:false, medianoche sale como
      // "24" en algunas versiones de ICU y la comparación se va al
      // garete justo el día que el aviso cae de madrugada.
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

/* Varias frases para que no sea el mismo aviso 365 noches. Se elige
   por la fecha y no al azar: así el aviso es el mismo si por lo que
   sea el cron se dispara dos veces, y no parece que la app tenga
   tics. Mismo tono que el banco de Lilita. */
const FRASES = [
  "Píldora. Esa que llevas todo el día diciendo que luego.",
  "La pastilla. Sí, ahora, no cuando te levantes a por agua.",
  "Es la hora. Sácala del blíster antes de dormirte con el móvil.",
  "Anticonceptiva. Un segundo y me callo.",
  "Pastillita. No me hagas volver mañana con el mismo tema.",
  "¿Te la has tomado? Porque yo no te he visto.",
  "La de cada noche. Que ya nos conocemos.",
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { date, hour } = localNow(new Date());

  const doc = await readDoc();
  // Lectura defensiva: este documento lo escribe el móvil y puede ser
  // de una versión anterior a que existiera la pastilla.
  const settings = doc.settings as Partial<Settings> | null;
  const pill = settings?.pill;

  if (!pill?.enabled || !pill.remind) {
    return Response.json({ skipped: "avisos apagados", date, hour });
  }

  if (hour < (pill.hour ?? 22)) {
    return Response.json({ skipped: "todavía no toca", date, hour });
  }

  const push = await readPushDoc();
  if (push.lastPillNudge === date) {
    return Response.json({ skipped: "ya avisado hoy", date, hour });
  }

  // Si ya la tiene marcada, no se avisa. La copia del móvil se sube
  // sola unos segundos después de tocar el botón, así que a las diez
  // de la noche esto suele estar al día; si no lo estuviera, el peor
  // caso es un aviso de más, no uno de menos.
  const days = (doc.days ?? []) as DayLog[];
  if (days.find((d) => d.date === date)?.pill === true) {
    // Se marca igualmente el día como avisado: no hay nada más que
    // hacer hoy, y así el segundo disparo ni lee.
    await writePushDoc({ ...push, lastPillNudge: date });
    return Response.json({ skipped: "ya tomada", date, hour });
  }

  const frase = FRASES[diaDelAnyo(date) % FRASES.length];
  const { sent, gone } = await sendToAll({
    title: "Lilaila",
    body: frase,
    tag: `pastilla-${date}`,
    url: "/",
    // La acción es lo que convierte el aviso en un registro: se marca
    // desde la propia notificación, sin abrir la app. Si hubiera que
    // abrirla, la mitad de las noches el aviso se descarta y ya.
    actions: [{ action: "pastilla-tomada", title: "Ya me la he tomado" }],
  });

  // Solo se sella si ha salido de verdad. Sellar tras un fallo de red
  // significaría perder el aviso de esa noche entera; así, el segundo
  // disparo de la noche lo reintenta.
  //
  // Y se RELEE antes de escribir: sendToAll borra por el camino las
  // suscripciones muertas, y guardar aquí la copia de hace un momento
  // las resucitaría a todas para volver a fallar mañana.
  if (sent > 0) {
    const fresco = await readPushDoc();
    await writePushDoc({ ...fresco, lastPillNudge: date });
  }

  return Response.json({ sent, gone, date, hour });
}

/** Índice estable para rotar la frase. No hace falta que sea exacto. */
function diaDelAnyo(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
