import Dexie from "dexie";
import { accountMode } from "./account-mode";
import { db, type DayLog, type Memory, type Settings } from "./db";

/* ═══════════════════════════════════════════════════════════════
   EL DIARIO DE ANTES DE LAS CUENTAS

   Sin cuentas, el diario vive en la base "lilaila" del móvil. Con
   cuentas, cada una tiene la suya ("lilaila-account-<id>") y empieza
   vacía. Quien ya usaba la app perdería de vista todo su historial
   al entrar por primera vez.

   Esto lo trae, una sola vez y en el propio móvil: nada viaja a
   ningún sitio que no sea su copia privada, y nadie más que quien
   tiene el móvil en la mano puede decir que sí. La base vieja no se
   borra: si algo saliera mal, sigue ahí.
   ═══════════════════════════════════════════════════════════════ */

const HECHO = "lilaila:diario-anterior";
const VIEJA = "lilaila";

async function existeVieja(): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return true;
  const dbs = await indexedDB.databases();
  return dbs.some((d) => d.name === VIEJA);
}

/** Devuelve true si ha traído algo. */
export async function traerDiarioAnterior(): Promise<boolean> {
  if (!accountMode() || db.name === VIEJA) return false;
  if (localStorage.getItem(HECHO)) return false;
  if ((await db.days.count()) > 0 || !(await existeVieja())) {
    localStorage.setItem(HECHO, "nada");
    return false;
  }

  const vieja = new Dexie(VIEJA);
  try {
    await vieja.open();
    const tablas = vieja.tables.map((t) => t.name);
    const lee = <T,>(t: string) => (tablas.includes(t) ? vieja.table<T>(t).toArray() : Promise.resolve([] as T[]));
    const [days, memories, settings] = await Promise.all([
      lee<DayLog>("days"),
      lee<Memory>("memories"),
      lee<Partial<Settings>>("settings"),
    ]);
    if (days.length === 0) {
      localStorage.setItem(HECHO, "nada");
      return false;
    }

    const si = window.confirm(
      `En este móvil hay un diario de antes de las cuentas (${days.length} días apuntados). ¿Lo paso a tu cuenta?`,
    );
    if (!si) {
      localStorage.setItem(HECHO, "no");
      return false;
    }

    const anteriores = settings.find((s) => s.id === "singleton");
    const actuales = await db.settings.get("singleton");
    await db.transaction("rw", db.days, db.memories, db.settings, async () => {
      await db.days.bulkPut(days);
      await db.memories.bulkPut(memories);
      // Si ya ha hecho el onboarding con la cuenta, sus ajustes nuevos mandan.
      if (anteriores && !actuales?.onboarded) {
        await db.settings.put({
          ...anteriores,
          // Antes de poder elegirla, la pareja era siempre Arnau.
          partnerName: anteriores.partnerName !== undefined ? anteriores.partnerName : "Arnau",
          id: "singleton",
        } as Settings);
      }
    });
    localStorage.setItem(HECHO, "traido");
    return true;
  } finally {
    vieja.close();
  }
}
