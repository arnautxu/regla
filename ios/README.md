# Lilaila para iPhone (App Store)

La app nativa es la web de producción dentro de Capacitor (`capacitor.config.ts`, `server.url`). En la app nativa las cuentas (Supabase) y las compras de Apple (RevenueCat) se encienden solas; la PWA no cambia.

## Compilar
```
npm ci
npx cap sync ios        # CAP_SERVER_URL=https://… para apuntar a otra web
npx cap open ios        # en un Mac con Xcode
```
Xcode: equipo de firma, bundle id `app.lilaila` y la capacidad «Sign in with Apple».

## Lo que hay que crear fuera del código
- **Apple Developer** (99 $/año) y la app en App Store Connect con bundle `app.lilaila`.
- **Suscripciones** en App Store Connect, en un grupo «Plus»: `plus_mensual` (6,99 €) y `plus_anual` (49,99 €), las dos con 7 días de prueba gratis.
- **RevenueCat**: proyecto con la app de iOS, el derecho `plus` con los dos productos y una oferta actual con los paquetes mensual y anual. Su clave pública de iOS va en `NEXT_PUBLIC_REVENUECAT_IOS_KEY` (Vercel).
- **Supabase** (proyecto «Lilaila»), en Authentication:
  - Email: la plantilla del correo tiene que llevar `{{ .Token }}` (el código de 6 cifras), no solo el enlace.
  - Apple: activar el proveedor con el bundle id `app.lilaila` (y el Services ID si se quiere en la web).
  - Google: activar con un client ID de Google (solo web por ahora).
  - URL de redirección: el dominio de producción.
  - Un SMTP propio (Resend, Postmark…): el de Supabase solo manda unos pocos correos por hora.
