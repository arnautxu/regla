"use client";

import { Apartado } from "@/components/ajustes-ui";
import { AlertsPanel } from "@/components/alerts-panel";
import { ParejaPanel } from "@/components/pareja-panel";
import { nombrePareja } from "@/lib/pareja";
import { useLilaila } from "@/lib/use-lilaila";

export default function AjustesPareja() {
  const { ready, settings, windows } = useLilaila();
  if (!ready) return null;

  return (
    <Apartado titulo={nombrePareja(settings) ?? "Tu pareja"}>
      <ParejaPanel settings={settings} />
      <AlertsPanel
        settings={settings}
        hasSensitive={!!windows.sensitive}
        hasMonster={!!windows.monster}
        solo="pareja"
      />
    </Apartado>
  );
}
