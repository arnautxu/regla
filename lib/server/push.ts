import { get, put } from "@vercel/blob";
import webpush from "web-push";

/* ═══════════════════════════════════════════════════════════════
   AVISOS

   Un push necesita tres cosas: un par de claves VAPID (para que el
   servicio del navegador sepa quién manda), la suscripción del móvil
   (que solo se puede crear desde el propio móvil, con permiso dado a
   mano) y algo que dispare el envío a su hora — el cron.

   Sin las claves configuradas esto no revienta: se apaga. La app
   entera funciona igual sin avisos, así que un despliegue a medias
   tiene que degradar, no romper.

   Las suscripciones viven en su propio blob y NO en el documento de
   datos. Ese lo sobrescribe el móvil entero en cada copia: meter
   aquí la suscripción significaría que un móvil sin avisos borraría
   los del otro, y que un `endpoint` —que es una URL que identifica
   al dispositivo— viajaría dentro del fichero que ella exporta.
   ═══════════════════════════════════════════════════════════════ */

const PATH = "lilaila/push.json";

export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Quién debe recibir esta suscripción. Las antiguas eran de Lídia. */
  audience: PushAudience;
  /** Cuándo se dio de alta, para poder limpiar a ojo si hiciera falta */
  createdAt: string;
}

export type PushAudience = "lidia" | "cookie-monster";

export interface PushDoc {
  version: 1;
  subs: StoredSub[];
  /**
   * Último día (YYYY-MM-DD, hora local de ella) en que ya se mandó el
   * aviso de la pastilla. Es lo que permite que varios crons apunten
   * al mismo endpoint sin que suene el móvil dos veces.
   */
  lastPillNudge?: string;
  /**
   * Hora local a la que avisar, 0-23. Vive AQUÍ y no en los ajustes
   * del diario: aquel documento lo reescribe entero cualquier
   * dispositivo que abra la app, y un móvil con la versión vieja en
   * caché ya se llevó una vez por delante toda la configuración del
   * aviso sin que nadie se enterara hasta que no sonó.
   */
  reminderHour?: number;
}

const EMPTY: PushDoc = { version: 1, subs: [] };

/** Hay claves VAPID y por tanto se pueden mandar avisos. */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

function applyVapid(): void {
  webpush.setVapidDetails(
    // El `subject` es obligatorio en el estándar y sirve para que el
    // servicio de push tenga a quién quejarse. Un mailto vale.
    process.env.VAPID_SUBJECT || "mailto:lilaila@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export async function readPushDoc(): Promise<PushDoc> {
  try {
    const result = await get(PATH, { access: "private" });
    if (!result || result.statusCode !== 200) return EMPTY;
    const doc = (await new Response(result.stream).json()) as PushDoc;
    return {
      ...EMPTY,
      ...doc,
      // Antes de Cookie Monster todas las suscripciones eran para Lídia.
      // Migrarlas al leer evita que un móvil suyo reciba este aviso.
      subs: (doc.subs ?? []).map((sub) => ({
        ...sub,
        audience: sub.audience ?? "lidia",
      })),
    };
  } catch {
    // Primera ejecución: el blob todavía no existe.
    return EMPTY;
  }
}

export async function writePushDoc(doc: PushDoc): Promise<void> {
  await put(PATH, JSON.stringify(doc), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    addRandomSuffix: false,
  });
}

/** Alta idempotente: reinstalar la app no duplica el aviso. */
export async function addSub(
  sub: Omit<StoredSub, "createdAt">,
  hour?: number,
  audience: PushAudience = "lidia",
): Promise<void> {
  const doc = await readPushDoc();
  const otros = doc.subs.filter((s) => s.endpoint !== sub.endpoint);
  await writePushDoc({
    ...doc,
    subs: [
      ...otros,
      { ...sub, audience, createdAt: new Date().toISOString() },
    ],
    reminderHour: hour ?? doc.reminderHour,
  });
}

export async function removeSub(endpoint: string): Promise<void> {
  const doc = await readPushDoc();
  await writePushDoc({
    ...doc,
    subs: doc.subs.filter((s) => s.endpoint !== endpoint),
  });
}

export interface Notice {
  title: string;
  body: string;
  /** Identifica el aviso: uno nuevo sustituye al anterior en pantalla */
  tag: string;
  /** A dónde lleva el toque */
  url: string;
  actions?: { action: string; title: string }[];
}

/**
 * Manda el aviso a los dispositivos de Lídia dados de alta.
 *
 * Las suscripciones muertas se borran solas. El servicio de push
 * contesta 404 o 410 cuando el navegador ya no existe —app
 * desinstalada, permiso revocado, móvil reiniciado de fábrica—, y sin
 * limpiarlas el fichero crecería para siempre acumulando fantasmas a
 * los que se reintenta cada noche.
 */
export async function sendToAll(
  notice: Notice,
): Promise<{ sent: number; gone: number }> {
  return sendToAudience("lidia", notice);
}

/** Manda un aviso solo a un grupo de dispositivos registrado. */
export async function sendToAudience(
  audience: PushAudience,
  notice: Notice,
): Promise<{ sent: number; gone: number }> {
  if (!pushConfigured()) return { sent: 0, gone: 0 };
  applyVapid();

  const doc = await readPushDoc();
  const recipients = doc.subs.filter((sub) => sub.audience === audience);
  if (recipients.length === 0) return { sent: 0, gone: 0 };

  const payload = JSON.stringify(notice);
  const muertas: string[] = [];
  let sent = 0;

  await Promise.all(
    recipients.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) muertas.push(sub.endpoint);
        // Cualquier otro error (503, timeout) es temporal: se deja la
        // suscripción en paz y ya sonará mañana.
      }
    }),
  );

  if (muertas.length) {
    const fresco = await readPushDoc();
    await writePushDoc({
      ...fresco,
      subs: fresco.subs.filter((s) => !muertas.includes(s.endpoint)),
    });
  }

  return { sent, gone: muertas.length };
}
