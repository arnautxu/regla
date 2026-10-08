"use client";

import { Apartado } from "@/components/ajustes-ui";
import { StepsPanel } from "@/components/steps-panel";
import { useLilaila } from "@/lib/use-lilaila";

export default function AjustesDia() {
  const { ready, settings } = useLilaila();
  if (!ready) return null;

  return (
    <Apartado titulo="Tu día">
      <StepsPanel settings={settings} />
    </Apartado>
  );
}
