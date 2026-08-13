"use client";

/* Un interruptor de Ajustes.

   Vivía dentro de pill-panel.tsx y ahora lo usan dos paneles. Se
   saca aquí antes de que existan dos copias: cuando eso pasa, una de
   las dos se queda sin el arreglo que le hagas a la otra, y con un
   control de accesibilidad —role, aria-checked, el estado
   deshabilitado— eso se paga caro.

   La marca es un punto del acento, igual que el resto de Ajustes. Un
   interruptor de iOS aquí sería el único control del sistema en toda
   la app, y se notaría. */
export function SwitchRow({
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-[56px] w-full items-center justify-between gap-md py-3 text-left transition-opacity duration-150 disabled:opacity-40"
    >
      <span>
        <span
          className="block text-base"
          style={{
            color: on ? "var(--accent)" : "var(--fg)",
            fontWeight: on ? 600 : 400,
          }}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>

      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full transition-transform duration-150 ease-[var(--ease-out-quart)]"
        style={{
          background: on ? "var(--accent)" : "var(--border-strong)",
          transform: on ? "scale(1)" : "scale(0.6)",
        }}
      />
    </button>
  );
}
