# Plan · Recompensa en café (ADR-0008)

Cada etapa termina con los quality gates de AGENTS.md en verde y un commit.
Las etapas 1–3 son backend y se pueden deployar sin que nadie vea nada; la
4 es la que hace pública la recompensa.

## Etapa 1 · Dominio y saldo (Convex, sin UI)

- `convex/_lib/recompensa.ts` (puro, sin Convex):
  - `cafesPorTotal(centavos)`: 0 bajo $5.000; 1 + ⌊(total − 5.000) / 10.000⌋;
    tope 10.
  - `normalizarEmail(email)`.
  - `codigoCorto()`: `JUJ-` + 6 de Crockford base32 sin 0/O/1/I/L.
  - `vencimiento(aperturaAt)`: apertura + 6 meses, hora de Argentina.
- Esquema:
  - `contribuciones`: índice `by_email` (sobre el email ya normalizado al
    guardar).
  - `recompensas`: `{ email, qrId, codigo, createdAt }`, índices por `email`,
    `qrId`, `codigo`. Una fila por persona, creada en la primera
    acreditación con email.
  - `canjes`: `{ recompensaId, cantidad, dispositivoId, at, deshechoAt? }`.
  - `campaigns`: `aperturaAt?`.
- `saldo(recompensa)`: suma de aportes aprobados del email → `cafesPorTotal`
  − canjes no deshechos. Estado: `reservado` (meta sin cumplir), `activo`
  (apertura fijada y no vencido), `vencido`, `anulado` (0 cafés por
  devoluciones).
- Normalizar email en `contribuir` y en el aviso cripto.
- `fijarApertura({ slug, aperturaAt })`: rechaza si no está cumplida.
- Tests (convex-test): tabla de `cafesPorTotal` (4.999 / 5.000 / 14.999 /
  15.000 / 95.000 / 500.000), agregación de dos aportes del mismo email,
  devolución que baja el saldo, aporte post-latch, cripto a MEP, email con
  mayúsculas, `fijarApertura` sin meta cumplida.

## Etapa 2 · Staff y canje (Convex + rutas)

- `dispositivos`: `{ nombre, tokenHash, creadoAt, venceAt, revocadoAt? }` y
  `intentosPin`: `{ clave, fallidos, bloqueadoHasta }`.
- `staff.ingresar({ pin, nombre })`: compara contra `STAFF_PIN` (env),
  5 fallidos → 15 min de bloqueo y push al admin; devuelve un token de
  sesión (se guarda hasheado; el cliente lo guarda en localStorage).
- `canje.ver({ qrId })` pública: saldo, vencimiento, estado. Sin email.
- `canje.verPorCodigo({ codigo, sesion })` solo staff.
- `canje.canjear({ qrId, cantidad, sesion })`: valida sesión, apertura
  fijada, no vencido, `cantidad ≤ saldo`; inserta en `canjes`.
- `canje.deshacer({ canjeId, sesion })`: solo dentro de 5 minutos.
- `revocarDispositivo`, `resumenRecompensas` (internas, por terminal).
- Rutas: `/canje/$id` (vista pública; con sesión muestra el selector 1..N y
  deshacer) y `/staff` (PIN, nombre del dispositivo, campo de código).
- Tests: PIN incorrecto ×5 bloquea, sesión revocada no canjea, canje antes
  de la apertura falla, canje mayor al saldo falla, doble canje concurrente
  no deja saldo negativo, deshacer fuera de ventana falla.

## Etapa 3 · Mails y QR

- Worker: `GET /qr/<qrId>.gif` con `encodeQR(url, "gif")` (lib `qr` ya
  instalada), cache largo.
- Plantillas (`mailPlantillas.ts`): la acreditación suma código, QR y saldo;
  la devolución dice qué se anuló y el saldo que queda; meta cumplida
  recuerda el código; nuevas `apertura` y `vence_pronto`.
- `fijarApertura` dispara el mail de apertura a todas las recompensas con
  saldo > 0; cron diario manda `vence_pronto` a 30 días del vencimiento
  (dedupe con `avisosAdmin` o una tabla propia).
- Tests: cada kind con y sin saldo; la devolución nunca manda código.

## Etapa 4 · Pieza `/jujuy` y `/jujuy/numeros`

- Bloque "Tu aporte vuelve en café." (titular 2) con filas mono: $5.000 ·
  1 café / cada $10.000 más · +1 / tope 10, y la línea de condiciones.
- Contribuir sobre banda Bruma (MP y cripto adentro).
- FormMp: línea en vivo "$25.000 · 3 cafés" o "Dejá tu email para recibir
  3 cafés"; label del email "Email · con email, tu aporte vuelve en café".
- Cripto: línea fija "Se cuenta en pesos al MEP del día · con email, misma
  regla de cafés".
- `SUGERIDOS_CENTAVOS` = 5.000 / 15.000 / 45.000 / 95.000.
- `/jujuy/numeros`: nota de que la recompensa se paga con la operación.
- Revisión visual (desktop y 390 px) y checklist del manual.

## Etapa 5 · Docs y salida

- Glosario: Recompensa, Saldo, Canje, Código; reemplazar "nunca lleva
  recompensa"; sumar las rutas `/canje` y `/staff`.
- Producción (lo corre el usuario): `bunx convex env set STAFF_PIN …`,
  `bunx convex deploy`, `bun run build && bun run deploy`.
- Verificación en vivo: un aporte de prueba con email, el mail con QR, la
  vista pública del QR y el canje bloqueado hasta la apertura.

## Fuera de alcance

Pantalla de admin, tarjeta física, eventos, transferencia de saldo entre
emails, unificación de alias de email.
