# 0007 · Los números de la campaña son una pieza de lectura

**Estado:** aceptada, 2026-10-26

## Contexto

ADR-0001 fija que cada pieza web es un viewport con una sola acción. La
campaña de Jujuy pide ahora una meta de $75.000.000 — casi cinco veces la
anterior — y quien aporta tiene que poder ver en qué se va cada peso. Eso no
entra en un viewport sin volverse una tabla ilegible, y meterlo en `/jujuy`
le saca el foco a la única acción de esa pieza: contribuir.

## Decisión

**`/jujuy/numeros` es una pieza aparte, de lectura larga**, sobre Nieve (el
fondo que el manual reserva para lo que se lee más de diez segundos). Se
compone con la convención de menú del manual: rubro a la izquierda, montos
en Geist Mono alineados a la derecha, línea fina entre ítems. Las fotos van
a sangre con su banda azul — nunca texto sobre foto — y se rotulan
«Imagen conceptual».

`/jujuy` sigue siendo un viewport con una acción y suma un solo link a la
pieza de números; la pieza de números cierra devolviendo a `/jujuy`.

El presupuesto vive en `src/lib/presupuesto.ts` como única fuente; un test
exige que los rubros sumen exactamente `META_PESOS`. La meta en Convex se
mueve con `contributionsInternal:fijarMeta`, que no reabre una campaña
cumplida ni baja la meta por debajo de lo recaudado.

Las imágenes conceptuales del local no llevan branding — ni cartel, ni
logo, ni azul Sorbo en objetos. El local se reconoce por lo que es, no por
lo que dice. Salón y barra se recortan de una misma panorámica generada
desde la planta maestra, para que sean continuos entre sí.

## Consecuencias

- ADR-0001 sigue valiendo para las piezas de acción; la excepción es para
  piezas de dato que no caben en un viewport, y cada una se declara así.
- Cambiar un monto obliga a mover la meta en dos lugares: el archivo de
  presupuesto (y su test) y `fijarMeta` en producción.
- Las imágenes son conceptuales y pueden no coincidir con el local que se
  alquile; la pieza lo dice en cada foto.
- Los insumos de generación (referencias, descartes) viven en `refs/`, fuera
  del repo público (ADR-0003); solo las cinco imágenes finales se commitean.
