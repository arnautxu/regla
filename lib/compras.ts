"use client";

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { applePackages, isAppleProduct, type AppleOption } from "./apple-products";

/* ═══════════════════════════════════════════════════════════════
   COMPRAS DE APPLE (RevenueCat)

   En la App Store las suscripciones se cobran con las compras de
   Apple. RevenueCat habla con StoreKit; después el servidor le
   pregunta a RevenueCat qué tiene la cuenta y lo apunta en su sitio
   (billing_accounts), igual que con Stripe. El móvil no decide nada.

   Oferta actual en RevenueCat: plus_anual y plus_mensual, ambos
   con el derecho «plus». No se vende voz en iOS en esta fase.
   ═══════════════════════════════════════════════════════════════ */

const API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "";

export type OpcionId = "anual" | "mensual" | "voz";

export function comprasDisponibles(): boolean {
  return Capacitor.getPlatform() === "ios" && API_KEY.startsWith("appl_");
}

let listo: Promise<typeof import("@revenuecat/purchases-capacitor")["Purchases"]> | null = null;
let configurado = false;

/** Configura RevenueCat con el id de la cuenta, para que la
    suscripción siga a la persona y no al móvil. */
export function iniciarCompras(userId: string) {
  if (!comprasDisponibles()) return null;
  // Serializa los cambios de cuenta; un intento fallido puede repetirse.
  listo = (listo ?? Promise.resolve()).catch(() => {}).then(async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    if (!configurado) {
      await Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configurado = true;
    } else if ((await Purchases.getAppUserID()).appUserID !== userId) {
      await Purchases.logIn({ appUserID: userId });
    }
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
export async function paquetes(): Promise<Partial<Record<AppleOption, PurchasesPackage>>> {
  const { current } = await (await rc()).getOfferings();
  return applePackages(current?.availablePackages ?? []);
}

export async function comprar(p: PurchasesPackage) {
  if (!isAppleProduct(p.product.identifier)) throw new Error("Este producto no está disponible en el iPhone.");
  await (await rc()).purchasePackage({ aPackage: p });
}

export async function restaurar() {
  await (await rc()).restorePurchases();
}

/** Cambiar o cancelar se hace en los ajustes de Apple: es la regla. */
export function abrirSuscripcionesApple() {
  window.open("https://apps.apple.com/account/subscriptions", "_blank");
}
