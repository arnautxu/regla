<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Novedades en cada despliegue

Lídia ve una hoja de novedades la primera vez que abre la app después de una actualización. Sale de `lib/novedades.ts`.

- Todo cambio que ella vaya a notar (pantallas, textos, cómo responde Lilita, cosas nuevas o que desaparecen) añade una entrada **arriba del todo** de `NOVEDADES` en el mismo PR.
- `id`: la fecha del despliegue (`"2026-10-07"`), con sufijo si ya hay otra ese día (`"2026-10-07-b"`). Nunca cambies ni borres el id de una entrada ya publicada.
- `titulo` y `cambios` en boca de Lilita, tono gamberro, una frase por cambio, sin jerga técnica (nada de "modelo", "API", "PR").
- Si el PR solo toca cosas internas (refactors, logs, infraestructura que no se nota), no añadas entrada: le saltaría una hoja vacía de contenido.
