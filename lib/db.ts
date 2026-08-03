import Dexie, { type EntityTable } from "dexie";
import { daysToFill, derivedCycles } from "./period-days";

/* ---------------------------------------------------------------
   Todo vive en el iPhone de Lidia. Nada de esto sale del dispositivo.
   Las fechas se guardan como 'YYYY-MM-DD' en local, nunca como Date
   ni como ISO con zona horaria: un ciclo es un dia del calendario,
   no un instante, y los timestamps UTC descuadran el dia al viajar.
   --------------------------------------------------------------- */

export type MoodTag =
  | "feliz"
  | "irritada"
  | "llorona"
  | "cachonda"
  | "apatica"
  | "gremlin"
  | "tranquila";

export type SymptomTag =
  | "retortijones"
  | "dolor-lumbar"
  | "tetas-doloridas"
  | "migrana"
  | "hinchazon"
  | "acne"
  | "insomnio"
  | "cagalera"
  | "antojos"
  | "cansancio";

/** 0 = nada, 4 = escena de Tarantino */
export type FlowLevel = 0 | 1 | 2 | 3 | 4;

export interface Cycle {
  id: string;
  /** Primer dia de sangrado, 'YYYY-MM-DD' */
  startDate: string;
  /** Ultimo dia de sangrado. undefined = regla en curso */
  endDate?: string;
  /** Marca de ultima modificacion */
  updatedAt?: string;
}

export interface DayLog {
  /** PK, 'YYYY-MM-DD' */
  date: string;
  flow?: FlowLevel;
  mood?: MoodTag[];
  symptoms?: SymptomTag[];
  /** 0-10 */
  painLevel?: number;
  note?: string;
  sex?: boolean;
  medication?: string[];
  /** Marca manual de "hoy no estoy para bromas" */
  badDay?: boolean;
  updatedAt?: string;
}

export type HumorLevel = "gamberro" | "suave" | "off";

export interface Settings {
  id: "singleton";
  name: string;
  avgCycleLength: number;
  avgPeriodLength: number;
  humorLevel: HumorLevel;
  notifications: {
    enabled: boolean;
    daysBefore: number;
    hourOfDay: number;
  };
  theme: "auto" | "light" | "dark";
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  name: "Lidia",
  avgCycleLength: 28,
  avgPeriodLength: 5,
  humorLevel: "gamberro",
  notifications: { enabled: false, daysBefore: 2, hourOfDay: 9 },
  theme: "light",
  onboarded: false,
};

const db = new Dexie("lilaila") as Dexie & {
  cycles: EntityTable<Cycle, "id">;
  days: EntityTable<DayLog, "date">;
  settings: EntityTable<Settings, "id">;
};

db.version(1).stores({
  cycles: "id, startDate, endDate",
  days: "date",
  settings: "id",
});

// v2: marcas de tiempo y borrado lógico para poder sincronizar.
db.version(2)
  .stores({
    cycles: "id, startDate, endDate, updatedAt",
    days: "date, updatedAt",
    settings: "id",
  })
  .upgrade(async (tx) => {
    const now = new Date().toISOString();
    await tx
      .table("cycles")
      .toCollection()
      .modify((c) => {
        c.updatedAt = now;
      });
    await tx
      .table("days")
      .toCollection()
      .modify((d) => {
        d.updatedAt = now;
      });
  });

/*
 * v3: el dia pasa a ser la verdad.
 *
 * Cada ciclo guardado se convierte en dias con flujo. La tabla vieja
 * NO se borra: si esta conversion tuviera un fallo, tirarla seria
 * perder el historial entero sin vuelta atras. Se queda como copia
 * muerta y deja de leerse.
 */
db.version(3)
  .stores({
    cycles: "id, startDate, endDate, updatedAt",
    days: "date, updatedAt",
    settings: "id",
  })
  .upgrade(async (tx) => {
    const stamp = new Date().toISOString();
    const cycles = (await tx.table("cycles").toArray()) as Cycle[];
    const days = (await tx.table("days").toArray()) as DayLog[];
    const porFecha = new Map(days.map((d) => [d.date, d]));

    const DIA = 86400000;
    const clave = (t: number) => {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    for (const c of cycles) {
      const ini = new Date(
        Number(c.startDate.slice(0, 4)),
        Number(c.startDate.slice(5, 7)) - 1,
        Number(c.startDate.slice(8, 10)),
      ).getTime();
      // Sin fin declarado se asume la duracion por defecto: es lo que
      // la app ya venia mostrando, asi que no cambia nada de lo visto.
      const finKey = c.endDate ?? clave(ini + 4 * DIA);
      const fin = new Date(
        Number(finKey.slice(0, 4)),
        Number(finKey.slice(5, 7)) - 1,
        Number(finKey.slice(8, 10)),
      ).getTime();

      // Nunca hacia el futuro: una regla abierta se rellenaba cinco
      // dias a ciegas y dejaba apuntado que manyana sangro.
      const hoy = new Date();
      const tope = Math.min(
        fin,
        new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime(),
      );

      for (let t = ini; t <= tope; t += DIA) {
        const k = clave(t);
        const previo = porFecha.get(k);
        // Lo que ella marco a mano manda sobre lo que deduzcamos.
        if (previo?.flow !== undefined) continue;
        const nuevo: DayLog = { ...previo, date: k, flow: 2, updatedAt: stamp };
        porFecha.set(k, nuevo);
        await tx.table("days").put(nuevo);
      }
    }
  });

export { db };

/* --- Helpers de fecha ------------------------------------------- */

/** 'YYYY-MM-DD' en hora local, sin sustos de zona horaria. */
export function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

/* --- Operaciones ------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get("singleton");
  if (stored) return stored;
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "singleton" });
  touch();
}

/* Toda escritura sella la hora: es lo que permite fusionar dos
   dispositivos sin que el ultimo en sincronizar pise al otro. */
const now = () => new Date().toISOString();

/** Avisa a la capa de sincronizacion de que hay algo que subir. */
let onChange: (() => void) | null = null;
export function onLocalChange(fn: (() => void) | null) {
  onChange = fn;
}
function touch() {
  onChange?.();
}

/* Los ciclos ya no se guardan: se calculan a partir de los dias. */
export async function getAllCycles(): Promise<Cycle[]> {
  return derivedCycles(await db.days.toArray(), todayKey());
}

export async function getLatestCycle(): Promise<Cycle | undefined> {
  return (await getAllCycles()).at(-1);
}

/* ── Registro de sangrado ────────────────────────────────────────
   Todo esto escribe DIAS. Los ciclos se derivan de ellos (ver
   period-days.ts), asi que ya no hay dos verdades que puedan
   contradecirse. ──────────────────────────────────────────────── */

/** Flujo por defecto cuando lo marca el boton y no ella a mano. */
const FLUJO_POR_DEFECTO: FlowLevel = 2;

/**
 * "Me bajo el dia X". Marca desde X hasta hoy: si dice que le bajo
 * hace tres dias, lleva tres dias sangrando. Respeta los dias que ya
 * tengan un flujo puesto a mano.
 */
export async function startPeriod(date = todayKey()): Promise<void> {
  const existentes = await db.days.toArray();
  const mapa = new Map(existentes.map((d) => [d.date, d]));
  const stamp = now();

  // El dia ELEGIDO siempre se marca, aunque ya tuviera un flujo (por
  // ejemplo "Nada" de un registro anterior). Es una orden explicita:
  // si no, decir "me bajo hoy" tras haber marcado que no no haria
  // nada y pareceria que el boton esta roto.
  const elegido = mapa.get(date);
  await db.days.put({
    ...elegido,
    date,
    flow: elegido?.flow ? elegido.flow : FLUJO_POR_DEFECTO,
    updatedAt: stamp,
  });

  // Los dias intermedios solo si no tienen nada puesto: lo que ella
  // haya marcado a mano manda sobre lo que deduzca la app.
  for (const key of daysToFill(date, todayKey(), mapa)) {
    if (key === date) continue;
    const previo = mapa.get(key);
    await db.days.put({
      ...previo,
      date: key,
      flow: FLUJO_POR_DEFECTO,
      updatedAt: stamp,
    });
  }
  touch();
}

/**
 * "El ultimo dia que manche fue X."
 *
 * Con el modelo por dias, cerrar una regla es quitar el sangrado de
 * los dias POSTERIORES a X, no marcar X. Si dice que el ultimo fue
 * anteayer, ayer y hoy no cuentan.
 */
export async function endPeriod(date = todayKey()): Promise<void> {
  const all = await db.days.toArray();
  const stamp = now();
  const hoy = todayKey();

  for (const d of all) {
    if (d.date > date && d.date <= hoy && d.flow !== undefined) {
      await db.days.put({ ...d, flow: undefined, updatedAt: stamp });
    }
  }
  // Y el dia elegido si que sangro, por si no estaba marcado.
  const ultimo = all.find((d) => d.date === date);
  if (!ultimo?.flow) {
    await db.days.put({
      ...ultimo,
      date,
      flow: ultimo?.flow || FLUJO_POR_DEFECTO,
      updatedAt: stamp,
    });
  }
  touch();
}

/** Quita el sangrado de toda la racha que contiene ese dia. */
export async function clearPeriodAround(date: string): Promise<void> {
  const all = await db.days.toArray();
  const cycle = derivedCycles(all, todayKey()).find(
    (c) => c.startDate <= date && (c.endDate ?? todayKey()) >= date,
  );
  if (!cycle) return;

  const hasta = cycle.endDate ?? todayKey();
  const stamp = now();
  for (const d of all) {
    if (d.date >= cycle.startDate && d.date <= hasta && d.flow !== undefined) {
      await db.days.put({ ...d, flow: undefined, updatedAt: stamp });
    }
  }
  touch();
}

/** Marca o desmarca un dia suelto como dia de regla. */
export async function setBleeding(
  date: string,
  yes: boolean,
): Promise<void> {
  const previo = await db.days.get(date);
  await db.days.put({
    ...previo,
    date,
    flow: yes ? (previo?.flow || FLUJO_POR_DEFECTO) : undefined,
    updatedAt: now(),
  });
  touch();
}

export async function getDay(date: string): Promise<DayLog | undefined> {
  return db.days.get(date);
}

export async function upsertDay(
  date: string,
  patch: Partial<Omit<DayLog, "date">>,
): Promise<void> {
  const existing = await db.days.get(date);
  await db.days.put({ ...existing, ...patch, date, updatedAt: now() });
  touch();
}

/* --- Backup ------------------------------------------------------ */

export interface Backup {
  format: "lilaila-backup";
  version: 1;
  exportedAt: string;
  cycles: Cycle[];
  days: DayLog[];
  settings: Settings;
}

export async function exportBackup(): Promise<Backup> {
  const [cycles, days, settings] = await Promise.all([
    db.cycles.toArray(),
    db.days.toArray(),
    getSettings(),
  ]);
  return {
    format: "lilaila-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    cycles,
    days,
    settings,
  };
}

export async function importBackup(backup: unknown): Promise<void> {
  if (
    !backup ||
    typeof backup !== "object" ||
    (backup as Backup).format !== "lilaila-backup"
  ) {
    throw new Error("Esto no es un backup de Lilaila.");
  }
  const data = backup as Backup;

  await db.transaction("rw", db.cycles, db.days, db.settings, async () => {
    await Promise.all([db.cycles.clear(), db.days.clear()]);
    await db.cycles.bulkPut(data.cycles ?? []);
    await db.days.bulkPut(data.days ?? []);
    if (data.settings) {
      await db.settings.put({ ...data.settings, id: "singleton" });
    }
  });
}

export async function wipeEverything(): Promise<void> {
  await db.transaction("rw", db.cycles, db.days, db.settings, async () => {
    await Promise.all([db.cycles.clear(), db.days.clear(), db.settings.clear()]);
  });
}
