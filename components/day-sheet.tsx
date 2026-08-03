"use client";

import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db, markCycleStart, unmarkCycleStart } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";
import { FlowRow } from "./flow-row";
import { MoodRow } from "./mood-row";
import type { DayCell } from "@/lib/calendar";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DaySheet({
  cell,
  onClose,
}: {
  cell: DayCell | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // <dialog> nativo: da trampa de foco, Escape y scroll bloqueado sin
  // escribirlos a mano, y todos suelen salir mal escritos a mano.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (cell && !el.open) el.showModal();
    if (!cell && el.open) el.close();
  }, [cell]);

  const log = useLiveQuery(
    async () => (cell ? ((await db.days.get(cell.key)) ?? null) : null),
    [cell?.key],
  );

  const isCycleStart = useLiveQuery(
    async () =>
      cell
        ? (await db.cycles.where("startDate").equals(cell.key).count()) > 0
        : false,
    [cell?.key],
  );

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clic en el backdrop (el propio <dialog>, fuera del panel)
        if (e.target === ref.current) ref.current?.close();
      }}
      className="sheet"
      aria-label={cell ? format(cell.date, "d 'de' MMMM", { locale: es }) : ""}
    >
      {cell && (
        <div className="sheet-panel flex flex-col gap-lg px-lg pt-md">
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: "var(--border-strong)" }}
          />

          <header>
            <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
              {/* date-fns da los días en minúscula en es; en un título
                  eso se lee como una errata. */}
              {capitalize(format(cell.date, "EEEE d 'de' MMMM", { locale: es }))}
            </h2>
            {cell.isToday && (
              <p className="text-xs text-faint">Hoy</p>
            )}
          </header>

          {cell.isFuture ? (
            <p className="text-sm leading-relaxed text-muted">
              Este día todavía no ha pasado. Cuando llegue me cuentas.
            </p>
          ) : (
            <>
              <FlowRow day={log ?? undefined} dateKey={cell.key} />
              <MoodRow day={log ?? undefined} dateKey={cell.key} />

              <button
                type="button"
                onClick={() => {
                  haptic([14, 30, 20]);
                  void (isCycleStart
                    ? unmarkCycleStart(cell.key)
                    : markCycleStart(cell.key));
                }}
                className="min-h-[52px] w-full rounded-full px-lg font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color] duration-150 active:scale-[0.98]"
                style={
                  isCycleStart
                    ? {
                        background: "transparent",
                        color: "var(--fg-muted)",
                        boxShadow: "inset 0 0 0 1px var(--border-strong)",
                      }
                    : {
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                      }
                }
              >
                {isCycleStart
                  ? "Quitar como primer día"
                  : "Fue mi primer día de regla"}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-[44px] text-sm text-faint"
          >
            Cerrar
          </button>
        </div>
      )}
    </dialog>
  );
}
