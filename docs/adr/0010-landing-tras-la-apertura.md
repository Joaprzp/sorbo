# 0010 · La landing tras la apertura

**Estado:** aceptada, 2026-11-23

## Contexto

Abrió el local de Salta. La landing seguía diciendo «estamos armando algo» y
su única acción era anotarse en una lista de espera que ya no tiene sentido:
la promesa (avisar cuando abra) se cumplió. ADR-0001 sigue vigente — la pieza
es una — pero la idea y la acción quedaron viejas.

## Decisión

**La pieza pasa a «ya abrimos» y la acción a «cómo llegar».** El titular dice
*Ya abrimos*, la bajada publica el horario (lunes a sábados, 07–22 h) y el
botón lleva a Google Maps. La campaña de Jujuy queda como segunda acción, con
un link de menor jerarquía a `/jujuy`.

La lista de espera se retira de punta a punta: formulario del front, acción
pública `waitlist.join` (y su mutación interna), acción de Turnstile
`lista_espera` y su tope de tráfico — actualiza la decisión de ADR-0009, que
la nombraba entre los formularios protegidos. La tabla `waitlist` también se
borra: sólo tenía dos emails de prueba internos, nadie de afuera se anotó.

El horario y la dirección se publican también como datos estructurados
(JSON-LD `CafeOrCoffeeShop`) para buscadores.

## Consecuencias

- La acción principal sale de la pieza (Google Maps): es lo correcto cuando
  el objetivo es que vengan al local.
- No queda nada de la lista de espera: ni tabla ni datos. No hay a quién
  avisarle de la apertura por email.
- `react-hook-form` y `@hookform/resolvers` se fueron con el formulario; el
  único formulario que queda es el de la campaña, en `/jujuy`.
- El JSON-LD replica a mano lo que dice la pieza: si cambia el horario o la
  dirección, hay que tocar los dos lados.
