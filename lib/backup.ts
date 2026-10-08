"use client";

import {
  db,
  localOwner,
  onLocalChange,
  type Cycle,
  type DayLog,
  type Memory,
  type Settings,
} from "./db";

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

let revision = 0;
let conflicted = false;
let pushing = false;
let pending = false;
const accountMode = () => process.env.NEXT_PUBLIC_ACCOUNT_MODE === "true";
const revisionKey = () => `lilaila-revision-${localOwner}`;

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
  const [cycles, days, settings, memories] = await Promise.all([
    db.cycles.toArray(),
    db.days.toArray(),
    db.settings.get("singleton"),
    db.memories.toArray(),
  ]);
  return { cycles, days, settings: settings ?? null, memories };
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
  if (!started || conflicted) return;
  if (pushing) { pending = true; return; }
  if (accountMode() && localStorage.getItem("lilaila-account-owner") !== localOwner) return;
  pushing = true;
  emit({ status: "saving" });
  try {
    const body = await collect();
    const res = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-lilaila-owner": localOwner },
      body: JSON.stringify({ version: 1, revision, ...body }),
    });

    if (res.status === 401) return emit({ status: "off" });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) conflicted = true;
      else scheduleRetry();
      return emit({
        status: "error",
        message: data.error ?? "El servidor no aceptó la copia.",
        savedAt: lastSavedAt,
      });
    }

    const { savedAt, revision: nextRevision } = (await res.json()) as { savedAt: string; revision?: number };
    if (!started) return;
    if (nextRevision !== undefined) { revision = nextRevision; localStorage.setItem(revisionKey(), String(revision)); }
    lastSavedAt = savedAt;
    if (retry) { clearTimeout(retry); retry = null; }
    emit({ status: "saved", savedAt });
  } catch {
    // Sin red: no es culpa de nadie y se reintenta sola.
    scheduleRetry();
    emit({ status: "offline", savedAt: lastSavedAt });
  } finally {
    pushing = false;
    if (pending) { pending = false; schedulePush(); }
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
  if (localCount > 0 && !accountMode()) return false;

  const res = await fetch("/api/data");
  if (!res.ok) throw new Error("No se ha podido comprobar la copia.");

  const doc = (await res.json()) as {
    revision?: number;
    cycles: Cycle[];
    days: DayLog[];
    settings: Settings | null;
    memories?: Memory[];
  };
  if (accountMode()) {
    const known = localStorage.getItem(revisionKey());
    revision = Number(known ?? 0);
    if (localCount > 0 && (doc.revision ?? 0) !== revision) {
      conflicted = true;
      emit({ status: "error", message: "Hay una copia más reciente en otro dispositivo. Exporta tus datos antes de restaurar.", savedAt: lastSavedAt });
      return true;
    }
    revision = doc.revision ?? 0;
    localStorage.setItem(revisionKey(), String(revision));
  }
  if (localCount > 0) return false;
  if (!doc.cycles?.length && !doc.days?.length && !doc.settings && !doc.memories?.length) return false;

  await db.transaction(
    "rw",
    db.cycles,
    db.days,
    db.settings,
    db.memories,
    async () => {
      await db.cycles.bulkPut(doc.cycles ?? []);
      await db.days.bulkPut(doc.days ?? []);
      await db.memories.bulkPut(doc.memories ?? []);
      if (doc.settings) await db.settings.put(doc.settings);
    },
  );
  return true;
}

let started = false;

/** Arranca la copia. Idempotente: llamarlo dos veces no duplica nada. */
export async function startBackup() {
  if (started) return;
  started = true;

  let restored: boolean;
  try { restored = await restoreIfEmpty(); }
  catch {
    emit({ status: "error", message: "No se ha podido comprobar la copia. No se sobrescribirá hasta reconectar." });
    // Retry the read before allowing ANY upload after an offline start.
    started = false;
    retry = setTimeout(() => { retry = null; void startBackup(); }, 60_000);
    return;
  }

  onLocalChange(schedulePush);

  // Tras restaurar no se sube: lo que hay aquí ya vino de allí.
  if (!restored) schedulePush();
}

export function stopBackup() {
  started = false;
  pending = false;
  onLocalChange(null);
  if (timer) clearTimeout(timer);
  if (retry) clearTimeout(retry);
  timer = null; retry = null;
  emit({ status: "off" });
}

/** Fuerza una subida ya, sin esperar al retardo. */
export function pushNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  return push();
}

/** Called only after the explicit diary deletion confirmation in Settings. */
export async function eraseCloudDiary() {
  if (!accountMode() || localOwner === "guest") return;
  stopBackup();
  const response = await fetch("/api/data", { method: "DELETE", headers: { "x-lilaila-owner": localOwner } });
  if (!response.ok) throw new Error("No se ha podido borrar la copia privada. No se ha borrado el diario del móvil.");
  const data = await response.json();
  localStorage.setItem(revisionKey(), String(data.revision));
}

export async function restoreCloudDiary() {
  if (!accountMode() || localOwner === "guest") throw new Error("Entra en tu cuenta primero.");
  const res = await fetch("/api/data", { cache: "no-store" });
  if (!res.ok) throw new Error("No se ha podido descargar tu copia.");
  const doc = await res.json();
  stopBackup();
  await db.transaction("rw", db.days, db.cycles, db.memories, db.settings, async () => {
    await Promise.all([db.days.clear(), db.cycles.clear(), db.memories.clear(), db.settings.clear()]);
    await db.days.bulkPut(doc.days); await db.cycles.bulkPut(doc.cycles); await db.memories.bulkPut(doc.memories ?? []);
    if (doc.settings) await db.settings.put({ ...doc.settings, id: "singleton" });
  });
  localStorage.setItem(revisionKey(), String(doc.revision));
  location.reload();
}
