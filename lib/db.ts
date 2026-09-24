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

export type CryReason =
  | "estres"
  | "discusion"
  | "dolor"
  | "tristeza"
  | "alegria"
  | "no-se"
  | "otro";

export interface CryEvent {
  id: string;
  /** Instante del episodio; la fecha del DayLog sigue siendo local. */
  at: string;
  reason: CryReason;
  /** 1 = suave, 2 = medio, 3 = intenso. Ausente si no se indicó. */
  intensity?: 1 | 2 | 3;
  note?: string;
}

/* Sexo. Se guarda en campos planos y no en un objeto anidado porque
   todo se escribe con upsertDay(fecha, parche) y un objeto obligaria
   a leer-fusionar-escribir a mano en cada toque de un chip. */

export type SexActivity =
  | "penetracion"
  | "oral"
  | "manos"
  | "juguetes"
  | "sola";

export type SexProtection =
  | "pastilla"
  | "condon"
  | "marcha-atras"
  | "nada";

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
  /** Puede haber varios episodios PAS en un mismo día. */
  cryEvents?: CryEvent[];
  /** Hubo sexo ese dia. Lo de abajo solo tiene sentido si es true. */
  sex?: boolean;
  sexActivities?: SexActivity[];
  sexProtection?: SexProtection[];
  sexOrgasm?: boolean;
  medication?: string[];
  /**
   * Anticonceptiva del dia. `true` = tomada, `false` = saltada a
   * conciencia, `undefined` = sin contestar todavia. Los tres estados
   * se distinguen a proposito: "no la he tomado" y "aun no lo se" son
   * cosas muy distintas cuando el recordatorio pregunta cada noche.
   */
  pill?: boolean;
  /** Hora real en que se marco, ISO. Sirve para "la tomaste a las 22:04". */
  pillAt?: string;
  /** Marca manual de "hoy no estoy para bromas" */
  badDay?: boolean;
  updatedAt?: string;
}

export type HumorLevel = "gamberro" | "suave" | "off";

export interface PillSettings {
  /** Lleva la cuenta de la anticonceptiva */
  enabled: boolean;
  /** Hora local del aviso, 0-23. Por defecto las diez de la noche. */
  hour: number;
  /** Manda el aviso a esa hora por push */
  remind: boolean;
}

/**
 * Qué le dejamos ver a Lilita.
 *
 * Las dos por separado y las dos apagables. Que se acuerde de lo que
 * le cuentas y que pueda leer tu diario son permisos distintos: se
 * puede querer una compañera con memoria sin darle además el cuaderno.
 */
export interface ChatSettings {
  /** Guarda lo que aprende de ella y se lo lleva a la siguiente charla */
  remembers: boolean;
  /** Puede leer las notas escritas en el diario */
  readsNotes: boolean;
}

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
  pill: PillSettings;
  chat: ChatSettings;
  theme: "auto" | "light" | "dark";
  onboarded: boolean;
}

/* ── Lo que Lilita recuerda ──────────────────────────────────────
   Frases sueltas que ella misma va guardando durante el chat: "el
   ibuprofeno no le hace nada", "en septiembre cambia de trabajo".

   Viven en el móvil como todo lo demás, y se pueden ver y borrar una
   a una desde Ajustes. Eso no es un extra: una app que guarda
   inferencias sobre alguien y no le enseña cuáles ha sacado está
   haciéndose un perfil a su espalda. ─────────────────────────── */

export interface Memory {
  id: string;
  /** Una frase, en tercera persona, tal y como la guardó Lilita */
  text: string;
  createdAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  name: "Lidia",
  avgCycleLength: 28,
  avgPeriodLength: 5,
  humorLevel: "gamberro",
  notifications: { enabled: false, daysBefore: 2, hourOfDay: 9 },
  pill: { enabled: false, hour: 22, remind: false },
  chat: { remembers: true, readsNotes: true },
  theme: "light",
  onboarded: false,
};

/**
 * Rellena lo que falte con los valores por defecto.
 *
 * Los ajustes se guardan como UN objeto entero, asi que una fila
 * escrita antes de que existiera `pill` no lo tiene — y leerla tal
 * cual reventaria en el primer `settings.pill.enabled`. Esto no es
 * una migracion: es la unica puerta por la que se leen los ajustes,
 * de modo que anyadir un campo nuevo nunca vuelve a hacer falta
 * tocar la version de Dexie.
 */
export function withDefaults(stored: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...stored?.notifications,
    },
    pill: { ...DEFAULT_SETTINGS.pill, ...stored?.pill },
    chat: { ...DEFAULT_SETTINGS.chat, ...stored?.chat },
    id: "singleton",
  };
}

const db = new Dexie("lilaila") as Dexie & {
  cycles: EntityTable<Cycle, "id">;
  days: EntityTable<DayLog, "date">;
  settings: EntityTable<Settings, "id">;
  memories: EntityTable<Memory, "id">;
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

      // Avance por dias de calendario, no sumando 86400000 ms: en el
      // cambio de hora de octubre el dia dura 25 h y el bucle de ms
      // repetia una fecha y se saltaba la siguiente.
      for (
        let cursor = new Date(ini);
        cursor.getTime() <= tope;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const k = clave(cursor.getTime());
        const previo = porFecha.get(k);
        // Lo que ella marco a mano manda sobre lo que deduzcamos.
        if (previo?.flow !== undefined) continue;
        const nuevo: DayLog = { ...previo, date: k, flow: 2, updatedAt: stamp };
        porFecha.set(k, nuevo);
        await tx.table("days").put(nuevo);
      }
    }
  });

/*
 * v4: lo que Lilita recuerda.
 *
 * Tabla nueva y nada que migrar: hasta ahora no se guardaba ni una
 * palabra de las conversaciones, así que no hay memorias viejas de
 * las que tirar.
 */
db.version(4).stores({
  cycles: "id, startDate, endDate, updatedAt",
  days: "date, updatedAt",
  settings: "id",
  memories: "id, createdAt",
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
  if (stored) return withDefaults(stored);
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

/* ── La pastilla ─────────────────────────────────────────────────
   Una anticonceptiva se toma TODOS los dias, sangre o no. Por eso no
   cuelga del ciclo ni de la racha de regla: es su propia columna del
   dia, y el unico registro de esta app que tiene hora ademas de
   fecha — "¿me la he tomado ya?" a las 23:50 es una pregunta real.
   ─────────────────────────────────────────────────────────────── */

export async function setPill(
  date: string,
  taken: boolean | undefined,
  /**
   * Momento real de la toma. Se omite a proposito al rellenar dias
   * atrasados: sellar las 14:32 de hoy en el martes pasado seria
   * apuntar la hora en que se acordo, no la hora en que se la tomo,
   * y luego se lee como si fuera lo segundo.
   */
  at?: Date,
): Promise<void> {
  const previo = await db.days.get(date);
  await db.days.put({
    ...previo,
    date,
    pill: taken,
    // La hora solo se sella al TOMARLA. Saltarsela o desmarcarla no
    // deja hora: una hora sin pastilla detras no significa nada.
    pillAt: taken && at ? at.toISOString() : undefined,
    updatedAt: now(),
  });
  touch();
}

/** Cuántos dias seguidos hasta `date` (incluido) lleva tomandola. */
export function pillStreak(days: DayLog[], date: string): number {
  const porFecha = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  // Por dias de calendario, no restando 86400000 ms: en el cambio de
  // hora el dia dura 25 h y la resta en ms repite fecha.
  for (const cursor = fromKey(date); ; cursor.setDate(cursor.getDate() - 1)) {
    if (porFecha.get(toKey(cursor))?.pill !== true) return n;
    n++;
    if (n > 400) return n; // freno: un año seguido ya es suficiente elogio
  }
}

/** Marca, desmarca o deja sin contestar. Solo el "sí" conserva el detalle. */
export async function setSex(
  date: string,
  yes: boolean | undefined,
): Promise<void> {
  const previo = await db.days.get(date);
  await db.days.put({
    ...previo,
    date,
    sex: yes,
    // Sin esto, decir "no, hoy nada" dejaba las etiquetas de ayer
    // colgando invisibles en la base de datos, listas para reaparecer
    // en cuanto se volviera a marcar el dia.
    sexActivities: yes ? previo?.sexActivities : undefined,
    sexProtection: yes ? previo?.sexProtection : undefined,
    sexOrgasm: yes ? previo?.sexOrgasm : undefined,
    updatedAt: now(),
  });
  touch();
}

/* ── Memoria ─────────────────────────────────────────────────────
   Las escribe Lilita desde el chat, llamando a una herramienta. Se
   guardan aquí y no en el servidor a propósito: el resto del diario
   vive en este móvil y no había razón para que lo que le cuenta a
   Lilita fuera la excepción. ─────────────────────────────────── */

/** Tope de memorias. Pasado eso, cae la más vieja. */
const MAX_MEMORIAS = 60;

export async function getMemories(): Promise<Memory[]> {
  const all = await db.memories.toArray();
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addMemory(text: string): Promise<Memory | null> {
  const limpio = text.trim();
  if (!limpio) return null;

  const existentes = await getMemories();

  // Nada de duplicados: el modelo tiende a reguardar lo mismo con
  // otras palabras cada vez que sale el tema, y en tres charlas la
  // lista sería la misma frase quince veces.
  const yaEsta = existentes.some(
    (m) => m.text.toLowerCase() === limpio.toLowerCase(),
  );
  if (yaEsta) return null;

  const memoria: Memory = {
    id: crypto.randomUUID(),
    text: limpio.slice(0, 240),
    createdAt: now(),
  };
  await db.memories.put(memoria);

  // El tope se aplica por antigüedad. No es un gran algoritmo, pero
  // el caso que evita es real: una lista que crece sin fin acaba
  // comiéndose el prompt entero y dejando sitio para nada más.
  if (existentes.length + 1 > MAX_MEMORIAS) {
    const sobran = existentes.slice(0, existentes.length + 1 - MAX_MEMORIAS);
    await db.memories.bulkDelete(sobran.map((m) => m.id));
  }

  touch();
  return memoria;
}

export async function removeMemory(id: string): Promise<void> {
  await db.memories.delete(id);
  touch();
}

export async function wipeMemories(): Promise<void> {
  await db.memories.clear();
  touch();
}

export async function upsertDay(
  date: string,
  patch: Partial<Omit<DayLog, "date">>,
): Promise<void> {
  const existing = await db.days.get(date);
  await db.days.put({ ...existing, ...patch, date, updatedAt: now() });
  touch();
}

/** El append se hace dentro de una transacción para no perder otro PAS del día. */
export async function addCryEvent(event: CryEvent): Promise<void> {
  const date = toKey(new Date(event.at));
  await db.transaction("rw", db.days, async () => {
    const existing = await db.days.get(date);
    await db.days.put({
      ...existing,
      date,
      cryEvents: [...(existing?.cryEvents ?? []), event],
      updatedAt: now(),
    });
  });
  touch();
}

export async function removeCryEvent(date: string, id: string): Promise<void> {
  await db.transaction("rw", db.days, async () => {
    const existing = await db.days.get(date);
    if (!existing) return;
    await db.days.put({
      ...existing,
      cryEvents: existing.cryEvents?.filter((event) => event.id !== id),
      updatedAt: now(),
    });
  });
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
  /** Opcional: las copias hechas antes de que existiera no lo traen */
  memories?: Memory[];
}

export async function exportBackup(): Promise<Backup> {
  const [cycles, days, settings, memories] = await Promise.all([
    db.cycles.toArray(),
    db.days.toArray(),
    getSettings(),
    db.memories.toArray(),
  ]);
  return {
    format: "lilaila-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    cycles,
    days,
    settings,
    memories,
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

  await db.transaction(
    "rw",
    db.cycles,
    db.days,
    db.settings,
    db.memories,
    async () => {
      await Promise.all([
        db.cycles.clear(),
        db.days.clear(),
        db.memories.clear(),
      ]);
      await db.cycles.bulkPut(data.cycles ?? []);
      await db.days.bulkPut(data.days ?? []);
      await db.memories.bulkPut(data.memories ?? []);
      if (data.settings) {
        await db.settings.put({ ...data.settings, id: "singleton" });
      }
    },
  );
}

export async function wipeEverything(): Promise<void> {
  await db.transaction(
    "rw",
    db.cycles,
    db.days,
    db.settings,
    db.memories,
    async () => {
      await Promise.all([
        db.cycles.clear(),
        db.days.clear(),
        db.settings.clear(),
        // Si no, "borrar todos mis datos" dejaba a Lilita acordándose
        // de todo lo que le habías contado. Es lo último que quieres
        // que sobreviva a ese botón.
        db.memories.clear(),
      ]);
    },
  );
}
