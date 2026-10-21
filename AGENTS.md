# AGENTS.md

Landing de Sorbo Labs (`sorbolabs.com`): una sola pieza de marca — un viewport,
un titular, un form de lista de espera, un bloque de datos. No es un sitio de
marketing; las decisiones de composición viven en `docs/adr/` y el glosario en
`CONTEXT.md`.

## Frontera pública/privada

- `refs/` es material de trabajo **gitignored**: manual de marca, notas de
  stack, SVG maestro, research. Nunca se commitea ni se copia su contenido al
  tree público sin decisión explícita (ver `docs/adr/0003`).
- Si hay duda de qué entra al repo público, se consulta antes de actuar.

## Convenciones

- **Bun exclusivamente** — nada de npm/npx; `bunx` para herramientas.
- Español en UI y docs; voseo rioplatense seco, sin emojis.
- TypeScript 7 nativo. **No reinstalar ESLint ni typescript-eslint** — el lint
  es oxlint (`.oxlintrc.json`); ver `docs/adr/0004`.
- Marca: colores sólo desde los tokens de `src/styles.css` (oklch del manual);
  tipografía Archivo / Geist Mono; todo plano — sin gradientes, sombras,
  bordes redondeados ni animaciones. Doe (isotipo) aparece una vez, vía
  `src/components/doe.tsx`.
- `src/routeTree.gen.ts` y `convex/_generated/` son generados — no editar a
  mano (regenerar con `bun run dev` / `bunx convex dev`).

## Quality gates

Correr antes de commitear (o ante cualquier cambio que toque código):

```bash
bun run lint        # oxlint
bun run typecheck   # tsc --noEmit (TypeScript 7 nativo)
bun run build       # vite build
bun run audit       # bun audit — vulns en deps
bun run knip        # dead files/exports/deps
bun run test        # vitest + convex-test — lógica de contribuciones
```

Auditorías ad-hoc: `bunx fallow` (complejidad, duplicación, dead code),
`bunx jscpd` si sólo se quiere % duplicación.

## Deploy

Manual, auth del usuario: `bun run deploy` (wrangler → Cloudflare Workers
Static Assets + custom domains apex/www). Convex: `convex:dev` para desarrollo;
producción vive en `avid-ram-437` (URL en `.env.production`, gitignored).
