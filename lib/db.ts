import Dexie, { type EntityTable } from "dexie";

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

/** El ciclo mas reciente por fecha de inicio. */
export async function getLatestCycle(): Promise<Cycle | undefined> {
  return db.cycles.orderBy("startDate").last();
}

export async function getAllCycles(): Promise<Cycle[]> {
  return db.cycles.orderBy("startDate").toArray();
}

/**
 * "Me ha bajado". Ahora acepta cualquier fecha, no solo hoy.
 *
 * Con fechas libres aparece un problema que con el interruptor de
 * antes no existia: decir "me bajo el viernes" cuando ya hay un ciclo
 * apuntado el domingo NO son dos reglas, es la misma mal fechada. Si
 * se anyadiera sin mas quedarian ciclos solapados y las medias se
 * irian a la basura.
 *
 * Regla: dos inicios a menos de MIN_GAP dias son el mismo periodo, y
 * el nuevo dato CORRIGE al viejo. Mas lejos, es una regla nueva.
 */
const MIN_GAP = 10;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (fromKey(a).getTime() - fromKey(b).getTime()) / 86400000,
  );
}

export async function startPeriod(date = todayKey()): Promise<void> {
  const all = await getAllCycles();

  const near = all.find((c) => Math.abs(daysBetween(c.startDate, date)) < MIN_GAP);
  if (near) {
    await db.cycles.update(near.id, {
      startDate: date,
      // Si la correccion deja el fin antes del inicio, el fin deja de
      // tener sentido y se borra: mejor sin dato que con uno imposible.
      endDate: near.endDate && near.endDate < date ? undefined : near.endDate,
      updatedAt: now(),
    });
    touch();
    return;
  }

  // Cierra cualquier regla que siguiera abierta. El cierre va el dia
  // ANTERIOR al nuevo inicio: cerrarla el mismo dia solaparia las dos
  // y ese dia contaria por partida doble.
  const open = all.filter((c) => !c.endDate && c.startDate < date);
  for (const c of open) {
    const dayBefore = toKey(new Date(fromKey(date).getTime() - 86400000));
    await db.cycles.update(c.id, {
      endDate: dayBefore >= c.startDate ? dayBefore : c.startDate,
      updatedAt: now(),
    });
  }

  await db.cycles.add({
    id: crypto.randomUUID(),
    startDate: date,
    updatedAt: now(),
  });
  touch();
}

/** "Se ha ido" — cierra el ciclo abierto. */
export async function endPeriod(date = todayKey()): Promise<void> {
  const latest = await getLatestCycle();
  if (!latest || latest.endDate) return;
  await db.cycles.update(latest.id, { endDate: date, updatedAt: now() });
  touch();
}

/** Deshace un "me ha bajado" pulsado sin querer. */
export async function deleteCycle(id: string): Promise<void> {
  await db.cycles.delete(id);
  touch();
}

/**
 * Marca un día cualquiera como primer día de regla, desde el
 * calendario. A diferencia de startPeriod() no cierra el ciclo
 * anterior: aquí se están rellenando días atrasados y cerrar por
 * nuestra cuenta un ciclo del pasado sería inventarse un dato.
 */
export async function markCycleStart(date: string): Promise<void> {
  // Misma logica que el boton de Hoy: el calendario no puede tener
  // reglas propias sobre lo que es un ciclo valido.
  await startPeriod(date);
}

export async function unmarkCycleStart(date: string): Promise<void> {
  const existing = await db.cycles.where("startDate").equals(date).first();
  if (existing) await deleteCycle(existing.id);
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
