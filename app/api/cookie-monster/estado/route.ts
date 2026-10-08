import { accountMode } from "@/lib/account-mode";
import { partnerOwner } from "@/lib/server/supabase";
import { cookies } from "next/headers";
import {
  COOKIE_MONSTER_SESSION_COOKIE,
  verifyCookieMonsterSession,
} from "@/lib/server/auth";
import { pushConfigured, readPushDoc } from "@/lib/server/push";
import { localNow } from "@/lib/server/local-time";
import { readForecast } from "@/lib/forecast";

/* Lo que ve Arnau, si ella lo ha encendido: la fase, el día del ciclo
   y cuánto falta. Sale de la ficha del ciclo (lib/forecast.ts), que
   no lleva ni un síntoma ni una nota, así que aunque quisiera no
   habría nada más que enseñar.

   Con el interruptor apagado contesta `shared: false` y nada más: ni
   siquiera si hay ficha o no. */

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  if (!await verifyCookieMonsterSession(jar.get(COOKIE_MONSTER_SESSION_COOKIE)?.value)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!pushConfigured()) return Response.json({ shared: false });

  const owner = accountMode() ? (await partnerOwner())! : undefined;
  const push = await readPushDoc(owner);
  if (!push.prefs?.arnauView || !push.forecast) return Response.json({ shared: false });

  const { date } = localNow(new Date());
  const r = readForecast(push.forecast, date);
  return Response.json({
    shared: true,
    phase: r.phase,
    dayOfCycle: r.dayOfCycle,
    daysUntil: r.daysUntil,
    spread: push.forecast.spread,
    monsterNow: r.monsterNow,
    monsterIn: r.monsterIn,
    updatedAt: push.forecast.updatedAt,
  });
}
