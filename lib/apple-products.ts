/** Contrato compartido con App Store Connect y RevenueCat. Solo Plus en iOS. */
export const APPLE_ENTITLEMENT = "plus";
export const APPLE_PRODUCTS = {
  mensual: "plus_mensual",
  anual: "plus_anual",
} as const;
export type AppleOption = keyof typeof APPLE_PRODUCTS;

export function isAppleProduct(product: string): boolean {
  return Object.values(APPLE_PRODUCTS).some(id => id === product);
}

/** No basta con que RevenueCat llame al paquete «monthly» o «annual». */
export function applePackages<T extends { product: { identifier: string } }>(packages: readonly T[]) {
  return {
    mensual: packages.find(p => p.product.identifier === APPLE_PRODUCTS.mensual),
    anual: packages.find(p => p.product.identifier === APPLE_PRODUCTS.anual),
  };
}
