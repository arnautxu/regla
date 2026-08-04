/**
 * Genera el par de claves VAPID para los avisos push.
 *
 * Se ejecuta UNA vez con `npm run vapid` y las dos líneas que imprime
 * se pegan en .env.local y en Vercel. Regenerarlas invalida todas las
 * suscripciones existentes: el móvil tendría que volver a activar los
 * avisos desde Ajustes, así que no se hace por gusto.
 *
 * La pública lleva NEXT_PUBLIC_ porque el navegador la necesita para
 * suscribirse — es pública de verdad, no es un descuido. La privada
 * no sale del servidor jamás.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Pega esto en .env.local (y mételo en Vercel con \`vercel env add\`):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:tu@correo.com
`);
