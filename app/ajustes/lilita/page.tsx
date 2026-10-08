"use client";

import { Apartado, HUMOR, Segmentos } from "@/components/ajustes-ui";
import { MemoryPanel } from "@/components/memory-panel";
import { updateSettings } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function AjustesLilita() {
  const { ready, settings } = useLilaila();
  if (!ready) return null;
  const humor = HUMOR.find((h) => h.value === settings.humorLevel) ?? HUMOR[0];

  return (
    <Apartado titulo="Lilita">
      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Cómo te habla</h2>
        <div className="mt-sm">
          <Segmentos
            label="Cómo te habla"
            opciones={HUMOR}
            valor={settings.humorLevel}
            onChange={(humorLevel) => {
              haptic(10);
              void updateSettings({ humorLevel });
            }}
          />
        </div>
        <p className="mt-sm text-xs leading-relaxed text-faint">
          {humor.hint} Si marcas un día «de mierda» o mucho dolor, se calla sola.
        </p>
      </section>

      <MemoryPanel chat={settings.chat} />
    </Apartado>
  );
}
