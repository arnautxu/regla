# Lilaila para iPhone (App Store)

La app nativa es la web de producción dentro de Capacitor (`capacitor.config.ts`, `server.url`). En la app nativa las cuentas (Supabase) y las compras de Apple (RevenueCat) se encienden solas; la PWA no cambia.

## Compilar
```
npm ci
npx cap sync ios        # CAP_SERVER_URL=https://… para apuntar a otra web
npx cap open ios        # en un Mac con Xcode
```
Xcode: elegir el equipo de firma. El proyecto ya declara el bundle id `app.lilaila` y las capacidades **Sign in with Apple**, **In-App Purchase** y **Time Sensitive Notifications**. `App/App.entitlements` se usa tanto en Debug como en Release; In-App Purchase se declara en el proyecto, sin un entitlement adicional.

Time Sensitive Notifications solo habilita la capacidad: no registra el dispositivo en APNs ni pide permisos. Push queda pendiente de la clave APNs y su integración.

## Lo que hay que crear fuera del código
- **Apple Developer** (99 $/año) y la app en App Store Connect con bundle `app.lilaila`.
- **Suscripciones** en App Store Connect, en un grupo «Plus»: `plus_mensual` (6,99 €) y `plus_anual` (49,99 €), las dos con 7 días de prueba gratis.
- **RevenueCat**: proyecto con la app de iOS, el derecho `plus` con los dos productos y una oferta actual con los paquetes mensual y anual. Su clave pública de iOS va en `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (Vercel).
  - El código solo admite `plus_mensual` y `plus_anual`; no hay productos ni paquetes de voz en iOS. Los precios localizados los devuelve Apple.
  - El servidor necesita `REVENUECAT_SECRET_KEY` con permiso de lectura de clientes en la API v1 y `REVENUECAT_WEBHOOK_SECRET` (solo servidor; la clave pública no los sustituye).
  - Configurar el webhook de RevenueCat en `https://lilaila.vercel.app/api/billing/apple`, con `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`. Envía los eventos de suscripción, incluidas expiraciones, devoluciones y transferencias.
  - Tras comprar o restaurar, la app llama a `PUT /api/billing/apple` con la sesión de Supabase. El webhook llama a `POST` en la misma ruta. Ambos consultan el estado a RevenueCat, sin fiarse del plan que diga el móvil o el aviso. Una suscripción web activa conserva la prioridad.
- **Supabase** (proyecto «Lilaila»), en Authentication:
  - Email: la plantilla del correo tiene que llevar `{{ .Token }}` (el código de 6 cifras), no solo el enlace.
  - Apple: activar el proveedor con el bundle id `app.lilaila` (y el Services ID si se quiere en la web).
  - Google: activar con un client ID de Google (solo web por ahora).
  - URL de redirección: el dominio de producción.
  - Un SMTP propio (Resend, Postmark…): el de Supabase solo manda unos pocos correos por hora.

## Verificación sin cobros ni publicación

`npm test`, `npm run lint` y `npm run build` comprueban la lógica y la web. `npx cap sync ios` sincroniza los dos complementos nativos sin subir una build. La revisión del código de acceso confirma `clientId: "app.lilaila"`, nonce y `signInWithIdToken({ provider: "apple" })`; no puede confirmar que el proveedor esté activado en el panel de Supabase.

Antes de aceptar la integración en dispositivo quedan las pruebas de compra/restauración con Sandbox y la recepción del webhook, sin compras reales ni envío a revisión. Esta tarea no configura Supabase, APNs ni los secretos del servidor.
