# Lilaila: base multiusuari i preparació del llançament

## Estat verificat el 8 d'octubre de 2026

- Pull de `main` fins a `c766b4ead19c841b57c73a066f76aec357cf9d2b`; implementació local a `codex/market-launch-foundation`.
- Projecte **Lilaila** creat a **arnau@palsec.agency's Org**, regió Irlanda, ref `cuwpokwzeuqayastskhg`.
- Esquema aplicat amb migracions versionades; totes les taules de negoci tenen RLS. Les funcions de negoci només són executables pel servidor. La IA comença **apagada**.
- No hi ha dades personals importades, compres, trucades de pagament ni desplegament de l'app nou. El mode anterior continua disponible sense `NEXT_PUBLIC_ACCOUNT_MODE=true`.
- El connector Stripe demana tornar a autenticar. La connexió local Supabase ja està verificada a `.env.preview.local` (ignorat, permisos 0600). Encara cal configurar l’entorn del desplegament, SMTP, preus i webhooks i passar l'acceptació amb proveïdors reals.

## Base de dades

PostgreSQL a Supabase; Supabase Auth dóna l'identificador immutable `auth.users.id`. El navegador no envia un `user_id` per decidir de qui llegeix les dades: el servidor l'obté de la sessió verificada.

| Taula | Responsabilitat |
| --- | --- |
| `diary_state` | Preferències i revisió de cada diari; fila bloquejada durant les escriptures |
| `diary_days` | Un dia per usuari: clau composta `(user_id, date)` |
| `diary_cycles` | Historial de cicles, inclòs el llegat |
| `diary_memories` | Records seleccionats per la usuària |
| `billing_accounts` | Client/subscripció Stripe, dret vigent, període pagat i bloqueig per reemborsament |
| `billing_events` | Idempotència dels webhooks; sense informació de targeta |
| `ai_reservations` | Reserva anterior a cada petició, consum, model de cobrament i correlació amb el proveïdor |
| `ai_policy` | Interruptor global, pressupost i concurrència de veu |
| `partner_links`, `partner_invites` | Vincle revocable i invitacions amb hash, un sol ús i una hora de vida |
| `push_accounts`, `notification_claims` | Subscripcions per propietària i deduplicació de cron |

RLS permet a cada compte llegir només les seves files de diari/consum/facturació. No hi ha escriptures directes del navegador. La clau `SUPABASE_SECRET_KEY` evita RLS i **només pot ser al servidor**: totes les rutes comproven la sessió i l'accés abans d'usar-la. Les sis taules internes sense política de lectura intencionadament deneguen accés a anon/authenticated; l'avís informatiu de [Supabase RLS sense polítiques](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) és esperat en aquestes taules.

Cada compte també té una IndexedDB separada. El canvi de compte força un reinici abans de muntar el diari. Les pujades comproven propietari i revisió; un conflicte no substitueix cap còpia. A Ajustes es pot exportar la còpia local i recuperar la privada. Esborrar el diari deixa una revisió que impedeix que un dispositiu antic el ressusciti, revoca la parella i elimina els avisos; la subscripció es gestiona separadament.

El cos de cada dia és JSONB per conservar tots els camps del producte actual; usuari/data/claus són relacionals i indexades. Només es reescriuen les files amb canvis. És una primera versió amb instantànies per usuari: abans de grans historials o edició simultània contínua convé sincronització incremental amb registres de canvis. No es promet fusió automàtica entre dispositius.

## Oferta preparada (editable abans d'obrir vendes)

| Pla | Preu mensual proposat | Ús inclòs | Reserva màxima d'IA segons tarifes configurades |
| --- | ---: | --- | ---: |
| Gratis | 0 € | Diari local/privat i 10 respostes de prova no renovables | 0,06 USD per compte |
| Plus | 9,99 € | 300 respostes al mes | 1,80 USD/mes |
| Plus amb veu | 14,99 € | 300 respostes + 10 trucades de fins a 2 minuts | 4,80 USD/mes |

No es factura cap petició a l'usuari ni hi ha sobrecostos automàtics. Una trucada consumeix una de les deu incloses encara que acabi abans de dos minuts. Els límits d'ús mensual es renoven el dia 1 a les 00:00 UTC; la subscripció es cobra en el seu aniversari. És una decisió explícita d'aquesta primera versió, mostrada a Ajustes.

**Aquests imports són un model conservador de cost variable, no una garantia de benefici.** Cal restar IVA segons mercat, comissions de cobrament, infraestructura, correu, devolucions i suport; comparar EUR/USD i revisar les tarifes. El cost fix mensual d'ElevenLabs també compta. Els comptes gratuïts tenen cost: el pressupost global limita l'exposició, però no evita que un abús deixi temporalment la IA en pausa.

Fonts revisades: [preus Gemini](https://ai.google.dev/gemini-api/docs/pricing) i [preus ElevenAgents](https://elevenlabs.io/pricing/agents). Gemini 3.5 Flash-Lite: 0,30 USD/milió d'entrada i 2,50 USD/milió de sortida. ElevenLabs factura minuts i també pot facturar l'LLM; el camp `metadata.cost` del webhook són **crèdits**, no USD. No s'interpreta com si fossin diners.

## Proteccions de despesa

1. Autenticació, origen de la petició, esquema, mida i pla es comproven abans de pagar al proveïdor.
2. PostgreSQL reserva amb bloqueig transaccional global: també compta les peticions simultànies, en altres instàncies i pendents de confirmar.
3. Xat: 16 kB d'entrada efectiva, 320 tokens de sortida, model fix, una sola crida, sense reintents ni fallback automàtic. Reserva de 0,006 USD; s'ajusta amb tokens reals si arriben.
4. No s'activen eines automàtiques que encadenin crides. Els records es poden escriure i esborrar manualment a Ajustes i es llegeixen amb permís.
5. Veu: agent privat i temporal per reserva, màxim 120 segons al proveïdor, una conversa/dia per agent, concurrència 1 i burst desactivat. El servidor rellegeix aquesta configuració abans d'emetre el token. El navegador no pot modificar durada, model o instruccions. Reserva de 0,30 USD per trucada.
6. Si falta confirmació del consum, es manté la reserva. Un error ambigu no genera un reemborsament que permeti gastar sense límit. Es conserven els IDs per investigar-ho.
7. Els webhooks signats són idempotents. Un excés conegut sobre la reserva apaga globalment la IA. Les liquidacions de veu conserven la reserva en USD i registren durada/crèdits per conciliar amb la factura.
8. Pressupost inicial: **100 USD/mes**, IA desactivada, una trucada simultània com a màxim. Els imports són micro-USD enters. Les reserves persisteixen encara que s'elimini el compte.

La veu necessita una prova facturada i conciliació de tarifa/crèdits abans d'activar-la. El sostre del llibre intern no limita una pujada inesperada de tarifes, altres apps que comparteixin clau, costos fixos ni serveis fora d'aquest flux. Configura també límits al proveïdor i claus/projectes dedicats; cap botó de l'app pot garantir marge si canvia el preu extern.

## Connexió i desplegament

1. Desa claus en `.env.local` (ignorat per Git) i a l'entorn del desplegament. Copia els noms de `.env.example`. La clau pública és `sb_publishable_...`; la clau de servidor és `sb_secret_...`. Cap clau privada duu `NEXT_PUBLIC_`.
2. Configura Supabase Auth: URL del lloc i redirect exacte `/auth/callback`, proveïdor de correu propi i plantilles. El flux accepta l'enllaç PKCE al mateix navegador i codis numèrics si la plantilla mostra `{{ .Token }}`. Verifica lliurament amb dues adreces reals i els límits antiabús; el correu de prova de Supabase no és un servei de producció.
3. Configura Stripe en **test primer**: dos preus recurrents mensuals en EUR (999 i 1499 cèntims), Portal amb cancel·lació habilitada i sense canvis a productes aliens. La ruta valida preu/import/periodicitat. No s'activa Stripe Tax sense configurar-ne abans les obligacions fiscals. Decideix explícitament si els preus mostrats inclouen impostos abans de vendre.
4. Webhook Stripe a `/api/billing/webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`. Desa la clau de signatura al servidor. El retorn de Checkout no dóna accés: ho fa un webhook amb factura pagada i propietat validada.
5. Webhook ElevenLabs `post_call_transcription` a `/api/voz/webhook`, amb signatura. La clau necessita Agents; confirma que l'agent privat hereta el webhook. `LILAILA_VOICE_ENABLED=false` fins a provar-ne la durada, el reús del token i la factura. La neteja només elimina els agents creats per aquesta app i vinculats al registre.
6. Activa `CRON_SECRET`, claus VAPID i el calendari de `vercel.json`. Els crons d'avisos inicials segueixen Europe/Madrid i les hores actuals; no es garanteixen horaris arbitraris ni qualsevol zona. Per molts usuaris, passa'ls a lots en cua abans d'excedir el temps màxim de la funció.
7. Fes còpia del diari antic i usa `scripts/import-legacy.mjs --file export.json --user UUID` (dry-run); `--apply` només després de comprovar la propietària. No s'importa a la primera persona que es registra. Es conserven el Blob original i l'exportació.
8. Construeix el preview amb `NEXT_PUBLIC_ACCOUNT_MODE=true`. Executa `npm run check:launch` i les proves. Configura còpia externa i prova una restauració; el projecte Free acabat de crear encara no té backups operatius verificats.
9. Valida la informació/consentiment de tractament del diari i transferències a Gemini/ElevenLabs abans d'obrir al públic. El mode local existeix sense conversa ni còpia al núvol; la IA no diagnostica ni substitueix l'atenció professional.
10. Desplega només després de l'acceptació. Per habilitar la IA, modifica `ai_policy.enabled` al projecte dedicat, amb un pressupost conscient. Per parar-la: `update public.ai_policy set enabled=false where id=true;`. El diari continua funcionant.

Un reemborsament o disputa estableix `billing_hold=true` i impedeix reactivar accés amb un webhook tardà. Revisa la subscripció i el pagament abans de resoldre manualment el bloqueig; assegura't de cancel·lar cobraments futurs quan correspongui al reemborsament.

## Verificació i límits de les proves

- `npm test`: esquema PostgreSQL amb PGlite, RLS, privilegis, pressupostos, plans caducats, liquidació idempotent, reemborsaments, esborrament i invitacions; signatures Stripe/ElevenLabs i validació d'entrada.
- `npm run test:postgres`: PostgreSQL temporal local, 12 connexions reals competint per l'última reserva i 8 checkouts simultanis. No toca el projecte remot.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: comprovats en mode personal i multiusuari.
- `node --env-file=.env.preview.local scripts/test-account-http.mjs`: dues identitats sintètiques reals a Supabase contra el servidor local, sense enviar correus ni cridar IA; prova login, aïllament, conflictes, CSRF, invitació/revocació, configuració absent, esborrament i logout. Esborra les seves identitats en acabar.
- UI d’entrada, onboarding i plans comprovats a 390 i 320 px. El clic visual de logout va quedar sense verificar per una fallada del controlador del navegador; la ruta HTTP de logout sí que passa.
- Cal acceptació real addicional: compra/reemborsament/cancel·lació en Stripe test, webhook duplicat, trucada completa/interrompuda/reutilització de token, canvi de compte amb push, restauració d'una còpia i mòbil iOS/Android.
- El control pressupostari és una primera fase centralitzada. Per escalar, mesura latència, cua, cost per usuari i percentils de consum; passa agregats mensuals a files de comptadors quan el volum del llibre de reserves ho justifiqui. No cal començar amb microserveis.

L’auditoria `npm audit --omit=dev` dona zero vulnerabilitats conegudes. L’auditoria completa manté cinc avisos al grup de dependències de desenvolupament d’ESLint (`braces`/`micromatch`/`fast-glob`); la correcció automàtica proposa un downgrade incompatible, que no s’ha aplicat.
