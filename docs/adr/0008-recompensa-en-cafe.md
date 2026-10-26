# 0008 · El aporte con email vuelve en café

**Estado:** aceptada, 2026-10-26. Revierte la regla "una contribución nunca
lleva recompensa" del glosario.

## Contexto

En el primer grilling de la campaña se descartaron las recompensas: sin
fecha de cierre ni local elegido, prometer algo físico parecía una promesa
sin respaldo. La meta pasó de 16M a 75M (ADR-0007) y hace falta una razón
concreta para aportar más allá del mínimo. Sorbo ya tiene qué dar sin
inventar nada: café.

La regla sale del costo real por taza (los números viven fuera del repo, en
las notas privadas): tres cafés por el aporte mínimo costaban más que lo
que llega después del cobro, y la campaña perdía plata en cada mínimo. La
relación elegida deja el costo de la recompensa dentro del rango habitual
de un crowdfunding con recompensas.

## Decisión

**Con $5.000 se recibe 1 café; por encima, cada $10.000 suma 1; tope de 10
cafés por persona.** Entran todos los cafés de la carta y se canjean
durante los 6 meses siguientes a la apertura. Nada más: sin eventos, sin
nombres en la pared, sin merch.

- **Por persona.** Se agrupa por email normalizado (minúsculas, sin
  espacios) sobre la suma de aportes aprobados, MP y cripto (cripto en
  pesos a MEP del día de acreditación). Un código y un QR por persona.
- **Con email.** Sin email no hay recompensa; el aporte anónimo sigue
  existiendo.
- **Atada a la meta.** Una devolución (ADR-0005) anula la parte de ese
  aporte. Los aportes posteriores al latch también la tienen.
- **Saldo calculado, no guardado.** Saldo = cafés que dan los aportes
  aprobados − canjes registrados. Solo los canjes son estado propio.
- **Al portador.** El QR (`/canje/<id>`, id largo e imposible de adivinar)
  y el código corto `JUJ-XXXXXX` son el mismo derecho y son transferibles.
- **Canje solo con staff y después de la apertura.** `fijarApertura` exige
  la meta cumplida, así que no puede haber un canje sobre un aporte que
  después se devuelve. El staff entra con un PIN de 5 o más caracteres una vez
  por dispositivo (sesión de 90 días, revocable) y descuenta de 1 a N cafés,
  con deshacer por 5 minutos. El servidor no puede identificar dispositivos:
  el bloqueo de 5 intentos por dispositivo frena errores, y lo que frena un
  ataque es un tope global de 5 fallidos por día con 24 horas de bloqueo.
  Ese tope deja trabar los ingresos nuevos por un día (`desbloquearPin` lo
  levanta por terminal); las sesiones abiertas siguen.

El presupuesto no cambia: los cafés de recompensa se pagan con la operación,
no con la meta. El peor caso (toda la meta con email y canjeada entera) está
calculado y aceptado en las notas privadas.

**Cripto:** el hash de una transfer es público apenas entra al bloque. Un
aporte cripto da cafés solo si el aviso con email se dejó antes del bloque;
si no, suma a la meta pero no a la recompensa.

## Consecuencias

- La pieza `/jujuy` gana un segundo bloque (recompensa) y el de contribuir
  pasa a una banda Bruma: dos tamaños de titular, el máximo del manual.
- Los montos sugeridos pasan a $5.000 · $15.000 · $45.000 · $95.000
  (1, 2, 5 y 10 cafés): con la regla nueva, $10.000 daba lo mismo que $5.000.
- Las contribuciones ya aprobadas con email tienen recompensa (no hay fecha
  de corte), incluidas las de prueba.
- Si algún día cambia la regla, los aportes anteriores conservan lo que se
  les prometió: el cálculo del saldo tiene que poder versionarse.
