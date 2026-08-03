"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLilaila } from "@/lib/use-lilaila";
import { PinGate } from "./pin-gate";
import { ServiceWorker } from "./service-worker";
import { TabBar } from "./tab-bar";

/**
 * Sincroniza el <html> con el estado real: la fase manda sobre el
 * acento y los ajustes sobre el tema. Se hace en el elemento raíz y
 * no en un div para que el color llegue también al área segura y a
 * la barra de estado de iOS.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, settings } = useLilaila();
  const pathname = usePathname();

  // El chat ocupa la pantalla entera y trae su propio botón de
  // volver. La barra ahí solo se comería el campo de escribir.
  const fullscreen = pathname === "/chat";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phase = state.phase ?? "menstrual";
    root.dataset.theme = settings.theme === "auto" ? "auto" : settings.theme;
  }, [state.phase, settings.theme]);

  return (
    <PinGate>
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
        {/* flex-1 + flex col: las páginas se estiran hasta la tab bar y
            ni una más. Si la página pide min-h-dvh por su cuenta, suma
            la altura de la barra y el botón principal se va fuera. */}
        <main className="flex flex-1 flex-col">{children}</main>
        {!fullscreen && <TabBar />}
        <ServiceWorker />
      </div>
    </PinGate>
  );
}
