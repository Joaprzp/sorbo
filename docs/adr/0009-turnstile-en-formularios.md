# 0009 · Turnstile en los formularios públicos

**Estado:** aceptada, 2026-10-26

## Contexto

Los tres formularios que escriben desde afuera —aporte por Mercado Pago, aviso
de cripto y lista de espera— tenían campo trampa y topes de tráfico
(`convex/limites.ts`). Los topes frenan el volumen, pero un bot que respeta el
ritmo igual crea órdenes en MP, reclama wallets ajenas o llena la lista, y
consume el cupo que es de las personas.

## Decisión

**Cloudflare Turnstile, verificado en el backend, antes que todo lo demás.**
Cada formulario renderiza un widget invisible (`interaction-only`) con su
acción: `contribuir_mp`, `aviso_cripto`, `lista_espera`. La función de Convex
llama a siteverify y exige `success`, la acción del formulario y un hostname
de `TURNSTILE_HOSTNAMES`. Recién después corren los topes y la escritura.

Falla cerrado: sin secreto, sin hostnames o sin respuesta de Cloudflare, no
pasa nadie. La lista de espera pasó de mutación a acción, porque una mutación
no puede salir a la red.

Las claves de prueba de Cloudflare se aceptan solo con
`TURNSTILE_PERMITIR_PRUEBA=1`, que existe en el deployment de desarrollo y
nunca en producción.

## Consecuencias

- La pieza carga un script de `challenges.cloudflare.com` en los formularios.
  Si no carga, el formulario avisa que la verificación no está disponible: es
  preferible a aceptar envíos sin verificar.
- Un token sirve una vez; tras un error el widget se reinicia solo.
- Cuando Cloudflare pide interacción, el widget aparece con su propio estilo
  (iframe: bordes, spinner). Es la única excepción a la pieza plana y se
  acepta: no se puede estilar y aparece solo ante un visitante sospechoso.
- Si Cloudflare no responde, el visitante lee "no disponible", no "no sos
  persona": el error es nuestro, no suyo.
- El widget del dashboard de Cloudflare autoriza solo `sorbolabs.com`. En
  local, el front usa la sitekey de prueba.
