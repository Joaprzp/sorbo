# Oxlint en lugar de ESLint + typescript-eslint

El repo usa **TypeScript 7** (compilador nativo) para `typecheck`, y typescript-eslint no soporta TS7 — rompe al cargar el módulo, y su backend nativo recién llega con la API de TS 7.1 (draft PR #12803, sin release). En vez de mantener un split-brain con dos TypeScript (TS6 para el parser de ESLint, TS7 para tsc), se migró el lint a **oxlint** (`@oxlint/migrate` generó `.oxlintrc.json` desde el flat config: 97 reglas, mismas severidades e ignores). El research que lo fundamenta vive en `refs/research/2026-10-20-ts7-eslint.md` (local, fuera del repo público).

Se pierde: `react-hooks/config` y `react-hooks/gating` (las únicas dos reglas de `eslint-plugin-react-hooks@7` que oxlint no implementa) y el ecosistema de plugins de ESLint. Se gana: una sola versión de TypeScript y la superficie de reglas del repo cubierta casi completa. Si algún día hacen falta reglas type-aware, `bun add -d oxlint-tsgolint` + flag `--type-aware` — corren sobre el mismo TS7 nativo.

Si typescript-eslint publica el backend nativo y la convención vuelve a ser ESLint, revertir es barato: el `.oxlintrc.json` documenta exactamente qué reglas estaban activas.
