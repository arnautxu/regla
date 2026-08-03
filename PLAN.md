# Lilaila — Plan de proyecto

Webapp (PWA) para iPhone para que Lídia lleve el control de su periodo.
Mascota: **Lilita**. Tono: gamberro, sin filtro.
Datos: **en su móvil, con copia privada tras un PIN**.

---

## 0. Decisiones ya tomadas

| Decisión | Elección | Consecuencia |
|---|---|---|
| Almacenamiento | IndexedDB en el móvil + copia en Vercel Blob | El móvil manda; el servidor guarda una copia. Un solo dispositivo, sin fusión |
| Acceso | PIN de 6 dígitos + cookie de sesión firmada | Sin PIN configurado, la app corre en local sin copia |
| Inteligencia | Modelo vía Vercel AI Gateway, con banco de frases local de reserva | Solo salen del móvil resúmenes derivados, nunca el registro diario ni sus notas |
| Notificaciones | Web Push (iOS 16.4+, requiere "Añadir a pantalla de inicio") | Pendiente (ver §5) |
| Tono | Gamberro sin filtro | Lilita dice barbaridades. Con una línea roja (ver §3) |

> **Nota (revisión posterior).** El plan original era local puro y sin IA. Ambas
> cosas cambiaron a petición de Arnau: los datos ahora tienen copia en servidor
> tras un PIN, y Lilita habla con un modelo. Lo que NO cambió es el freno de
> mano ni el criterio de qué sale del dispositivo.

---

## 1. Stack

- **Next.js 15 (App Router) + TypeScript** — desplegado en Vercel.
- **Tailwind CSS v4** + variables CSS para los temas de fase.
- **Dexie.js** sobre IndexedDB — persistencia local, robusta y con migraciones.
- **PWA**: `manifest.json` + service worker (`next-pwa` o SW a mano), `display: standalone`,
  `apple-mobile-web-app-capable`, splash screens y viewport con `viewport-fit=cover`
  (safe areas del notch/Dynamic Island).
- **Motion (Framer Motion)** para las animaciones de Lilita.
- **date-fns** para toda la aritmética de fechas (con `es` locale).

Sin base de datos, sin ORM, sin auth. Todo el "backend" es una única función serverless
para el push (§5), que no ve ni un solo dato de salud.

---

## 2. Modelo de datos (local)

```ts
// Dexie: db.cycles, db.days, db.settings

type Cycle = {
  id: string
  startDate: string        // ISO 'YYYY-MM-DD' — primer día de sangrado
  endDate?: string         // último día de sangrado (null = en curso)
}

type DayLog = {
  date: string             // PK, 'YYYY-MM-DD'
  flow?: 0 | 1 | 2 | 3 | 4         // nada → hemorragia nivel Tarantino
  mood?: MoodTag[]         // 'feliz' | 'irritada' | 'llorona' | 'cachonda' | 'apática' | 'gremlin'
  symptoms?: SymptomTag[]  // 'retortijones' | 'dolor-lumbar' | 'tetas-doloridas' | 'migraña'
                           // | 'hinchazón' | 'acné' | 'insomnio' | 'cagalera' | 'antojos'
  painLevel?: 0..10
  note?: string
  sex?: boolean
  medication?: string[]
}

type Settings = {
  name: string             // 'Lídia'
  avgCycleLength: number   // default 28, se recalcula solo
  avgPeriodLength: number  // default 5
  humorLevel: 'gamberro' | 'suave' | 'off'   // interruptor de emergencia
  notifications: { enabled, daysBefore, hourOfDay }
  theme: 'auto' | 'light' | 'dark'
}
```

**Predicción** (simple y honesta, sin fingir ser un médico):
media móvil de los últimos 6 ciclos + desviación estándar → se muestra como *rango*
("entre el 12 y el 15"), nunca como fecha exacta. Con < 3 ciclos registrados,
Lilita admite abiertamente que se lo está inventando.

Fases calculadas: `menstrual` → `folicular` → `ovulación` (rango fértil estimado) → `lútea`.
Cada fase tiene su paleta de color y su personalidad de Lilita.

---

## 3. Lilita — biblia del personaje

**Qué es**: una gota de sangre con patas. Ojos saltones, ceja levantada, actitud de
compañera de piso que lo ha visto todo. Vive en la app, tiene opiniones y ninguna vergüenza.

**Personalidad**: cínica, dramática, solidaria. Es la amiga que te trae chocolate a las 3 de
la madrugada mientras se caga en el sistema reproductivo entero.

**Registro por fase**:

| Fase | Estado de Lilita | Ejemplo de línea |
|---|---|---|
| Menstrual | Sofá, manta, guerrera caída | *"Día 2. El útero está haciendo obras sin licencia. Ibuprofeno y a la mierda el mundo."* |
| Folicular | Energía sospechosa | *"Te noto con ganas de reorganizar la cocina. Aprovecha, esto dura tres días."* |
| Ovulación | Modo horny, sin disimular | *"Fértil como un campo de trigo. Si follas, ponte algo. Yo solo digo cosas."* |
| Lútea | Gremlin premenstrual | *"Si hoy lloras con un anuncio de seguros, es normal. Si le gritas a Arnau, también."* |
| Retraso | Pánico teatral | *"Tres días tarde. Ni respires. Puede no ser nada. PUEDE NO SER NADA."* |

**Reglas de humor (las únicas líneas rojas)**:
1. El chiste va contra el útero, contra las hormonas, contra el mundo, contra **Arnau**.
   Nunca contra Lídia ni contra su dolor.
2. Si registra dolor ≥ 8 o marca "día de mierda", Lilita baja el volumen sola:
   deja de hacer gracias y pasa a modo cuidados (ibuprofeno, bolsa de agua, cero comentarios).
3. Botón `humorLevel` en ajustes. Si un día no está para tonterías, un toque y Lilita se calla.
4. Nada de diagnósticos. Ante síntomas raros, Lilita dice "esto se lo cuentas a un médico,
   no a una gota de sangre animada".

**Implementación**: `lib/lilita/lines.ts` — un banco de frases indexado por
`{ fase, día, ánimo, dolor, eventos }`, con selección aleatoria sin repetir la última.
Objetivo: ~150 frases al lanzamiento para que no se haga repetitiva.

**Arte**: SVG hecho a mano, un único componente `<Lilita mood="..." />` con capas
(cuerpo, ojos, boca, props) animadas con Motion. Sin imágenes rasterizadas → pesa nada
y escala perfecto en pantalla Retina.

---

## 4. Pantallas

1. **Hoy** (home)
   - Lilita grande, animada, con la frase del día.
   - Anillo de ciclo: día X de Y, fase actual, cuenta atrás al siguiente periodo.
   - Botón gigante **"Me ha bajado"** / **"Se ha ido"** (el 90% del uso es esto).
   - Registro rápido: flujo, ánimo, dolor, síntomas — todo a un toque, sin formularios.

2. **Calendario**
   - Mes con puntos de color por flujo, franja de predicción sombreada, ventana fértil.
   - Tocar un día → hoja inferior para editar/registrar retroactivamente.

3. **Historial / Stats**
   - Duración media de ciclo y regla, regularidad, síntoma más frecuente.
   - "Tu ciclo más corto / más largo", racha de registro.
   - Lilita comenta cada estadística con maldad gratuita.

4. **Ajustes**
   - Nombre, nivel de humor, notificaciones, tema.
   - **Exportar / importar JSON** — la única forma de backup, bien visible.
   - Borrar todo (con doble confirmación).

**Navegación**: tab bar inferior de 4 iconos, respetando el safe area.
Interacciones a una mano, todo pulsable con el pulgar.

---

## 5. Notificaciones push (la parte con truco)

iOS solo permite Web Push si la app está **añadida a la pantalla de inicio**. Además, iOS no
soporta la Notification Triggers API, así que no se pueden programar notificaciones 100% locales.

**Solución mínima y respetuosa** — `POST /api/push/register` guarda en Vercel KV/Upstash:

```
{ endpoint, keys, nextNotifyAt: '2026-08-14T09:00:00Z', kind: 'pre-period' | 'late', tone: 'gamberro' }
```

Nada más. Sin historial, sin síntomas, sin nombre. El servidor no puede reconstruir su ciclo:
solo sabe "a este dispositivo anónimo, mándale un mensaje tipo X tal día".
Un cron de Vercel cada hora dispara los que tocan. El texto de la notificación se elige
en el momento del banco de frases del servidor.

Notificaciones previstas:
- 2 días antes: *"Aviso: llega en dos días. Compra compresas y paciencia."*
- Día previsto: *"Hoy es el día. O no. El útero es un artista, no un tren suizo."*
- 3 días de retraso: *"Vas tarde. Respira. Si sigue así, test."*
- Onboarding del día 1: *"Bienvenida al infierno mensual. Estoy aquí."*

Si dice que no a los permisos, todo sigue funcionando: los avisos aparecen al abrir la app.

---

## 6. Fases de construcción

| Fase | Qué se hace | Resultado |
|---|---|---|
| **1. Esqueleto** | Next.js + Tailwind + Dexie + PWA manifest + tab bar | Se instala en su iPhone y arranca offline |
| **2. Núcleo** | Modelo de datos, botón "me ha bajado", cálculo de fases y predicción, Hoy + Calendario | Ya es usable de verdad |
| **3. Lilita** | SVG del personaje, estados de ánimo, motor de frases, animaciones | Ya es *la* app |
| **4. Datos** | Stats, historial, export/import JSON | Confianza a largo plazo |
| **5. Push** | Service worker, permisos, endpoint + cron | Avisos proactivos |
| **6. Pulido** | Haptics (`navigator.vibrate`), transiciones, modo oscuro, easter eggs, accesibilidad | Regalo presentable |

Cada fase se despliega en Vercel y se prueba en el iPhone real (el simulador miente con
las safe areas y con el gesto de swipe-back).

---

## 7. Detalles que marcan la diferencia

- **Haptics** al pulsar "Me ha bajado". Pequeño, pero se nota.
- **Easter eggs**: tocar a Lilita 10 seguidas y se enfada. Modo konami que la pone a bailar.
- **Onboarding** de 3 pantallas: nombre, última regla, duración media. 20 segundos, con Lilita
  presentándose fatal.
- **Estados vacíos** escritos por Lilita, no genéricos.
- **Accesibilidad**: contraste AA, targets de 44px, `prefers-reduced-motion` respetado,
  labels reales en los controles.
- **Rendimiento**: sin dependencias pesadas, todo el SVG inline, LCP por debajo de 1s.

---

## 8. Riesgos conocidos

1. **Pérdida de datos**: resuelto con la copia en servidor. El endpoint rechaza
   una copia vacía si el servidor tiene datos — ese caso no es "borró todo", es
   Safari purgando el almacenamiento, y sobrescribir ahí sería el desastre que
   la copia existe para evitar.
2. **iOS y el almacenamiento**: Safari puede purgar IndexedDB de webs sin uso a los 7 días.
   **Instalada en la pantalla de inicio esto no aplica** — por eso el onboarding insiste
   en instalarla, no en usarla desde Safari.
3. **Humor mal calibrado**: es un regalo, y el chiste tiene que ser suyo. El interruptor
   de `humorLevel` y el modo "día malo" son innegociables.
4. **Nada de esto es un dispositivo médico** ni un método anticonceptivo. Va escrito en
   ajustes, en pequeño, sin dramatizar.

---

## 9. Siguiente paso

Fase 1: montar el esqueleto, que se instale en su iPhone y que Lilita ya diga hola.
