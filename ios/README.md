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
  - Apple: proveedor activado y configuración guardada verificada el 2026-10-08, con `app.lilaila` para el acceso nativo del iPhone. El acceso OAuth desde la web requiere configurar por separado un Services ID y su secreto.
  - Google: activar con un client ID de Google (solo web por ahora).
  - URL de redirección: el dominio de producción.
  - Un SMTP propio (Resend, Postmark…): el de Supabase solo manda unos pocos correos por hora.

## Verificación sin cobros ni publicación

El plan gratuito conserva el diario, con **0 respuestas de Lilita**. El cliente muestra Plus desde el primer intento y `reserve` lo rechaza antes de reservar consumo. La migración `20261008113950_free_diary_without_chat.sql` está aplicada en Supabase (proyecto «Lilaila») y deja también el límite de `reserve_ai` a cero. El 2026-10-08 se comprobó que devuelve `plus_required` sin crear reservas, mediante una prueba transaccional revertida, y que solo `service_role` conserva permiso para ejecutarla.

El interruptor general `ai_policy.enabled` se activó el 2026-10-08 por indicación de Arnau, manteniendo el presupuesto de 100 USD/mes. Las credenciales de Supabase, `LILAILA_APP_URL` y `NEXT_PUBLIC_ACCOUNT_MODE=true` están configuradas en Vercel Production. Arnau aprobó el PNG y la sustitución del acceso con PIN por cuentas; el diario antiguo se conserva y requiere una importación explícita al propietario correcto.

**Plus con voz** permanece en los datos del plan, pero se muestra como «Próximamente», sin precio ni selección de compra, en iPhone y web. Tanto el cliente como el checkout web rechazan comprarlo; su disponibilidad no depende de activar las llamadas. Las suscripciones Plus y los derechos ya existentes conservan su gestión.

`npm test`, `npm run lint` y `npm run build` comprueban la lógica y la web. `npx cap sync ios` sincroniza los dos complementos nativos sin subir una build. El 2026-10-08 se compiló e instaló una build Debug en el iPhone con el equipo de Iratxe (`53KAF5V263`), sin subirla a Apple. El inicio de sesión nativo con Apple quedó verificado tanto en el dispositivo como en Supabase.

En producción se verificaron el acceso con un código sintético, la sesión, el bloqueo gratuito con `plus_required`, la sincronización autenticada con RevenueCat y una respuesta real con un Plus temporal de prueba. Se eliminó la cuenta sintética al terminar; el consumo quedó liquidado en el registro de presupuesto. Dos eventos enviados desde el panel de RevenueCat recibieron `200 {"received":true}`, incluido el enviado después de activar las cuentas.

Antes de aceptar la integración en dispositivo quedan las pruebas de compra/restauración con Sandbox, sin compras reales ni envío a revisión. Las claves de RevenueCat están configuradas en Vercel Production. APNs sigue pendiente.
