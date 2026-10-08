"use client";

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

/* ═══════════════════════════════════════════════════════════════
   COMPRAS DE APPLE (RevenueCat)

   En la App Store las suscripciones se cobran con las compras de
   Apple. RevenueCat habla con StoreKit; después el servidor le
   pregunta a RevenueCat qué tiene la cuenta y lo apunta en su sitio
   (billing_accounts), igual que con Stripe. El móvil no decide nada.

   Oferta «default» en RevenueCat: paquete anual, mensual y uno
   personalizado «voz» con Plus con voz.
   ═══════════════════════════════════════════════════════════════ */

const API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "";

export type OpcionId = "anual" | "mensual" | "voz";

export function comprasDisponibles(): boolean {
  return Capacitor.isNativePlatform() && API_KEY !== "";
}

let listo: Promise<typeof import("@revenuecat/purchases-capacitor")["Purchases"]> | null = null;

/** Configura RevenueCat con el id de la cuenta, para que la
    suscripción siga a la persona y no al móvil. */
export function iniciarCompras(userId: string) {
  if (!comprasDisponibles()) return null;
  listo ??= import("@revenuecat/purchases-capacitor").then(async ({ Purchases }) => {
    await Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    return Purchases;
  });
  return listo;
}

async function rc() {
  if (!listo) throw new Error("Las compras no están iniciadas");
  return listo;
}

/** Los paquetes de la oferta actual, con el precio que pone Apple en
    la moneda de cada país. */
export async function paquetes(): Promise<Partial<Record<OpcionId, PurchasesPackage>>> {
  const { current } = await (await rc()).getOfferings();
  return {
    anual: current?.annual ?? undefined,
    mensual: current?.monthly ?? undefined,
    voz: current?.availablePackages.find((p) => p.identifier === "voz"),
  };
}

export async function comprar(p: PurchasesPackage) {
  await (await rc()).purchasePackage({ aPackage: p });
}

export async function restaurar() {
  await (await rc()).restorePurchases();
}

/** Cambiar o cancelar se hace en los ajustes de Apple: es la regla. */
export function abrirSuscripcionesApple() {
  window.open("https://apps.apple.com/account/subscriptions", "_blank");
}
