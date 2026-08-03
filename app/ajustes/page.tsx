"use client";

import { Lilita } from "@/components/lilita";
import { BackupPanel } from "@/components/backup-panel";
import { updateSettings, type HumorLevel, type Settings } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

const HUMOR: { value: HumorLevel; label: string; hint: string }[] = [
  {
    value: "gamberro",
    label: "Gamberra",
    hint: "Lilita dice lo que piensa, sin filtro.",
  },
  {
    value: "suave",
    label: "Suave",
    hint: "Sigue estando, pero baja el volumen.",
  },
  { value: "off", label: "Callada", hint: "Solo los datos. Cero comentarios." },
];

const TEMAS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "auto", label: "Automático" },
];

export default function Ajustes() {
  const { ready, settings } = useLilaila();
  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col gap-2xl px-safe pt-safe pb-xl">
      <div className="flex items-center gap-2 pt-lg">
        <Lilita mood="neutral" size={38} className="shrink-0" />
        <h1 className="font-display text-xl font-bold tracking-[-0.03em]">
          Ajustes
        </h1>
      </div>

      <Group
        title="El humor de Lilita"
        note="Al margen de esto, si marcas un día como «de mierda» o registras mucho dolor, se calla sola."
      >
        {HUMOR.map((opt) => (
          <Choice
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            selected={settings.humorLevel === opt.value}
            onSelect={() => {
              haptic(10);
              void updateSettings({ humorLevel: opt.value });
            }}
          />
        ))}
      </Group>

      <Group title="Aspecto">
        {TEMAS.map((opt) => (
          <Choice
            key={opt.value}
            label={opt.label}
            selected={settings.theme === opt.value}
            onSelect={() => {
              haptic(10);
              void updateSettings({ theme: opt.value });
            }}
          />
        ))}
      </Group>

      <BackupPanel />

      <p className="text-xs leading-relaxed text-faint">
        Lo que registras vive en este móvil. Si has puesto código, además se
        guarda una copia privada. Lilaila no es un dispositivo médico ni un
        método anticonceptivo.
      </p>
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {title}
      </h2>
      <div
        className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
        style={{ background: "var(--surface)" }}
      >
        {children}
      </div>
      {note && (
        <p className="mt-sm text-xs leading-relaxed text-faint">{note}</p>
      )}
    </section>
  );
}

function Choice({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex min-h-[56px] w-full items-center justify-between gap-md py-3 text-left transition-colors duration-150"
    >
      <span>
        <span
          className="block text-base"
          style={{
            color: selected ? "var(--accent)" : "var(--fg)",
            fontWeight: selected ? 600 : 400,
          }}
        >
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs text-faint">{hint}</span>
        )}
      </span>

      {/* Marca de selección: un punto del acento. Un check flotando en
          un círculo gris es el mueble de IKEA de la UI. */}
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full transition-transform duration-150 ease-[var(--ease-out-quart)]"
        style={{
          background: selected ? "var(--accent)" : "var(--border-strong)",
          transform: selected ? "scale(1)" : "scale(0.6)",
        }}
      />
    </button>
  );
}
