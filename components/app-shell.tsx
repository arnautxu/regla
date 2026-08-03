"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { updateSettings } from "@/lib/db";
import { useLilaila } from "@/lib/use-lilaila";
import { Onboarding } from "./onboarding";
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
  const { ready, state, settings, cycles } = useLilaila();
  const pathname = usePathname();

  // El chat ocupa la pantalla entera y trae su propio botón de
  // volver. La barra ahí solo se comería el campo de escribir.
  const fullscreen = pathname === "/chat";

  // "onboarded" existía en el esquema desde antes de que hubiera
  // onboarding: quien ya tiene ciclos registrados nunca lo puso a
  // true porque nada se lo preguntó. Sin el `cycles.length === 0`,
  // a Lídia —con meses de datos reales— le saldría el onboarding la
  // próxima vez que abra la app. Además, se sella solo la primera vez
  // que lo detecta, para no depender de este cálculo para siempre.
  const needsOnboarding = ready && !settings.onboarded && cycles.length === 0;

  useEffect(() => {
    if (ready && !settings.onboarded && cycles.length > 0) {
      void updateSettings({ onboarded: true });
    }
  }, [ready, settings.onboarded, cycles.length]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phase = state.phase ?? "menstrual";
    root.dataset.theme = settings.theme === "auto" ? "auto" : settings.theme;
  }, [state.phase, settings.theme]);

  // La barra de estado de iOS es un <meta> estático, no CSS: no le
  // llega [data-theme="auto"]. Sin esto, "black-translucent" fijo deja
  // la hora y la batería en blanco sobre el papel claro — invisibles,
  // y solo en la PWA instalada, nunca en un navegador de escritorio.
  useEffect(() => {
    const resolveDark = () =>
      settings.theme === "dark" ||
      (settings.theme === "auto" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const meta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    );
    const apply = () => {
      meta?.setAttribute("content", resolveDark() ? "black-translucent" : "default");
    };
    apply();

    if (settings.theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  return (
    <PinGate>
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
        {needsOnboarding ? (
          <Onboarding />
        ) : (
          <>
            {/* flex-1 + flex col: las páginas se estiran hasta la tab bar y
                ni una más. Si la página pide min-h-dvh por su cuenta, suma
                la altura de la barra y el botón principal se va fuera. */}
            <main className="flex flex-1 flex-col">{children}</main>
            {!fullscreen && <TabBar />}
          </>
        )}
        <ServiceWorker />
      </div>
    </PinGate>
  );
}
