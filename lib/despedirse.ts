import { stopBackup } from "./backup";
import { DEMO } from "./cuenta";

/** Fuera de esta cuenta: este móvil vuelve a la puerta de entrada. */
export async function despedirse(f: () => Promise<void>) {
  stopBackup();
  const registration = await navigator.serviceWorker?.getRegistration();
  await registration?.pushManager.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => {});
  await f();
  if (!DEMO) localStorage.setItem("lilaila-account-owner", "guest");
  // Recarga entera a propósito: cada cuenta tiene su propia base de datos.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign("/");
}
