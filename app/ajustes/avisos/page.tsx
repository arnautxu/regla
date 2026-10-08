"use client";

import { Apartado } from "@/components/ajustes-ui";
import { AlertsPanel } from "@/components/alerts-panel";
import { PillPanel } from "@/components/pill-panel";
import { nombrePareja } from "@/lib/pareja";
import { useLilaila } from "@/lib/use-lilaila";

export default function AjustesAvisos() {
  const { ready, settings, windows } = useLilaila();
  if (!ready) return null;
  const pareja = nombrePareja(settings);

  return (
    <Apartado titulo="Avisos">
      <PillPanel settings={settings} />
      <AlertsPanel
        settings={settings}
        hasSensitive={!!windows.sensitive}
        hasMonster={!!windows.monster}
        solo="ciclo"
      />
      {pareja && (
        <p className="text-xs leading-relaxed text-faint">Lo que le llega a {pareja} está en su apartado.</p>
      )}
    </Apartado>
  );
}
