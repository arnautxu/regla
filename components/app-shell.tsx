"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { updateSettings } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
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
    // reducedMotion="user": lee prefers-reduced-motion del sistema y
    // recorta toda animación de motion/react por debajo de esto sin
    // que cada componente tenga que comprobarlo por su cuenta. La
    // regla CSS de globals.css cubre las transiciones normales; esta
    // cubre las que mueve JS (páginas, mensajes, Lilita, el mes).
    <MotionConfig reducedMotion="user">
      <PinGate>
        <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
          {needsOnboarding ? (
            <Onboarding />
          ) : (
            <>
              {/* Entra desde abajo al cambiar de pestaña: la salida no se
                  anima —Next desmonta la página vieja antes de que
                  pudiéramos animarla— pero la entrada sola ya da la
                  sensación de "una hoja de papel más", no un salto seco.
                  flex-1 + flex col: las páginas se estiran hasta la tab
                  bar y ni una más. */}
              <motion.main
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.slow, ease: EASE_OUT_QUART }}
                className="flex flex-1 flex-col"
              >
                {children}
              </motion.main>
              {!fullscreen && <TabBar />}
            </>
          )}
          <ServiceWorker />
        </div>
      </PinGate>
    </MotionConfig>
  );
}
