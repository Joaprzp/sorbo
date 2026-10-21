# Stack React + Convex para una sola página

La landing es una pieza estática en apariencia, pero se construye sobre el stack propio documentado en `STACK a 14 de Agosto 2026.md` (Bun, Vite, React 19, TypeScript, TanStack Router, Tailwind v4 con tokens `oklch()`, Convex en Cloudflare Workers Static Assets) en vez de un `index.html` a mano.

Razones: (1) la lista de espera es una tabla real (`waitlist` en Convex) — los emails son un activo durable del negocio, no una bandeja de WhatsApp; (2) el stack propio ya tiene las convenciones de validación (Zod), deploy (Workers) y calidad (ESLint + `tsc --noEmit`) resueltas; (3) TanStack Router file-based deja el camino abierto a futuras rutas (`/menu`, `/session-01`) sin rehacer la base.

Costo aceptado: ~440 KB de JS para lo que podría ser HTML plano. Si la pieza quedara definitivamente estática y sin backend, el stack sería sobremotor.

_Parcialmente superado por ADR-0004: el lint pasó de ESLint a oxlint._
