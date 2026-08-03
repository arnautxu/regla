"use client";

import { db, onLocalChange, type Cycle, type DayLog, type Settings } from "./db";

/* ═══════════════════════════════════════════════════════════════
   COPIA DE SEGURIDAD

   Un solo dispositivo, así que esto no es sincronización: el móvil
   manda y el servidor guarda una copia. Sin fusión, sin conflictos.

   · Al arrancar, si el móvil está vacío y el servidor tiene datos,
     se restaura. Ese es el caso "Safari purgó el almacenamiento" o
     "móvil nuevo", y es el único momento en que se baja algo.

   · En cada cambio, se sube todo con un retardo de 3 s. Marcar cinco
     chips seguidos no dispara cinco subidas.

   · Si no hay red, no pasa nada: la app funciona igual y la copia
     sale en el siguiente cambio. IndexedDB nunca deja de ser la
     copia de trabajo.
   ═══════════════════════════════════════════════════════════════ */

const DEBOUNCE_MS = 3000;

/* Los estados se distinguen a proposito. Antes un fallo de red y un
   "no hay nada que hacer" emitian los dos `idle`, asi que ninguna
   pantalla podia avisar de que la copia llevaba dias sin subirse. */
export type BackupState =
  | { status: "off" }
  | { status: "saving" }
  | { status: "saved"; savedAt: string }
  | { status: "offline"; savedAt?: string }
  | { status: "error"; message: string; savedAt?: string };

let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: BackupState) => void>();
let current: BackupState = { status: "off" };
/** Ultima copia confirmada. Sobrevive a los fallos para poder decir
    "la ultima fue el martes" mientras la de hoy falla. */
let lastSavedAt: string | undefined;
let retry: ReturnType<typeof setTimeout> | null = null;

function emit(s: BackupState) {
  current = s;
  for (const l of listeners) l(s);
}

export function subscribeBackup(fn: (s: BackupState) => void) {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

async function collect() {
  // Los ciclos ya no se guardan: se derivan de los dias. Se sigue
  // subiendo la tabla vieja tal cual por si hiciera falta volver
  // atras, pero lo que importa son los dias.
  const [cycles, days, settings] = await Promise.all([
    db.cycles.toArray(),
    db.days.toArray(),
    db.settings.get("singleton"),
  ]);
  return { cycles, days, settings: settings ?? null };
}

/** Reintento unico y tardio. Si falla la red, sin esto la copia se
    quedaba esperando al siguiente cambio, que puede tardar dias. */
function scheduleRetry() {
  if (retry) clearTimeout(retry);
  retry = setTimeout(() => {
    retry = null;
    void push();
  }, 60_000);
}

async function push() {
  emit({ status: "saving" });
  try {
    const body = await collect();
    const res = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, ...body }),
    });

    if (res.status === 401) return emit({ status: "off" });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      scheduleRetry();
      return emit({
        status: "error",
        message: data.error ?? "El servidor no aceptó la copia.",
        savedAt: lastSavedAt,
      });
    }

    const { savedAt } = (await res.json()) as { savedAt: string };
    lastSavedAt = savedAt;
    if (retry) { clearTimeout(retry); retry = null; }
    emit({ status: "saved", savedAt });
  } catch {
    // Sin red: no es culpa de nadie y se reintenta sola.
    scheduleRetry();
    emit({ status: "offline", savedAt: lastSavedAt });
  }
}

function schedulePush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push();
  }, DEBOUNCE_MS);
}

/** Baja del servidor solo si aquí no hay nada. Nunca pisa datos locales. */
async function restoreIfEmpty(): Promise<boolean> {
  // Vacio = sin dias registrados. La tabla de ciclos es legado.
  const localCount = await db.days.count();
  if (localCount > 0) return false;

  const res = await fetch("/api/data");
  if (!res.ok) return false;

  const doc = (await res.json()) as {
    cycles: Cycle[];
    days: DayLog[];
    settings: Settings | null;
  };
  if (!doc.cycles?.length && !doc.days?.length) return false;

  await db.transaction("rw", db.cycles, db.days, db.settings, async () => {
    await db.cycles.bulkPut(doc.cycles ?? []);
    await db.days.bulkPut(doc.days ?? []);
    if (doc.settings) await db.settings.put(doc.settings);
  });
  return true;
}

let started = false;

/** Arranca la copia. Idempotente: llamarlo dos veces no duplica nada. */
export async function startBackup() {
  if (started) return;
  started = true;

  const restored = await restoreIfEmpty().catch(() => false);

  onLocalChange(schedulePush);

  // Tras restaurar no se sube: lo que hay aquí ya vino de allí.
  if (!restored) schedulePush();
}

export function stopBackup() {
  started = false;
  onLocalChange(null);
  if (timer) clearTimeout(timer);
  emit({ status: "off" });
}

/** Fuerza una subida ya, sin esperar al retardo. */
export function pushNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  return push();
}
