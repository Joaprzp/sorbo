# Frontera público/privado del repo

El repo es público (`github.com/Joaprzp/sorbo`). Se decidió que **commitea código y assets de producción**, y que el material de trabajo vive en `refs/` **gitignored**: el Manual de Marca v2.1 (PDF), `STACK a 14 de Agosto 2026.md`, el SVG maestro `sorbo-iso.svg` y las notas de research (`refs/research/`).

Consecuencia práctica: quien clona el repo no tiene `refs/` ni el archivo maestro — es intencional. La copia usable de Doe vive inline en `src/components/doe.tsx` con `fill="currentColor"` para teñirse según el fondo; `public/favicon.svg` lo lleva en Azul Sorbo. `.env.local` (la `VITE_CONVEX_URL` que genera `convex dev`) también queda fuera aunque su valor sea público por diseño — es configuración de entorno, no código.

Regla operativa acordada: ante cualquier duda de si algo entra al repo público, se consulta con pro y contras antes de commitear.
