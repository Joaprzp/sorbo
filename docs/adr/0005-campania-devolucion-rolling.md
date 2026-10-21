# 0005 · La campaña devuelve por contribución, no por cierre

**Estado:** aceptada, 2026-10-22

## Contexto

La campaña de Jujuy no tiene fecha de cierre (decisión de dominio: una fecha
inventada es una promesa que no sabemos cumplir). El crowdfunding clásico
resuelve el riesgo del contribuyente con all-or-nothing: si la meta no se
cumple al deadline, se devuelve todo.

Sin deadline no hay momento natural de devolución masiva — y una devolución
masiva por API es justo lo que Mercado Pago hace más caro (fee no reembolsable,
raffle de errores, ventana de ~90 días por pago).

## Decisión

**Cada contribución aprobada (MP) tiene su propio reloj de 89 días.** El día
89 desde su acreditación, si la meta todavía no se cumplió, esa contribución
se devuelve sola (`POST /v1/orders/{id}/refund` con idempotency key estable
`refund-{token}`). Un cron diario procesa las que vencen — los refunds llegan
paulatinos, nunca en ráfaga.

La barra pública muestra lo recaudado **neto**: lo devuelto resta. Una vez que
la meta llega a 100% hay latch permanente — `cumplida` nunca vuelve a falso y
no hay más devoluciones, aunque aportes recientes cumplan 89 días después.

## Consecuencias

- La promesa está escrita en la pieza ("si tu aporte cumple 89 días y la meta
  no se cumplió, lo devolvemos solo") — es ejecutable, no declarativa.
- El reloj corre desde `acreditadaAt`, no desde el click: no se debe
  devolución de plata que nunca llegó (vouchers de efectivo).
- Contribuciones post-latch siguen entrando pero ya no son reembolsables —
  el latch protege al contribuyente, no a la meta.
- Difícil de revertir una vez publicada la promesa: si algún día la política
  cambia, las contribuciones anteriores conservan su derecho a devolución.
