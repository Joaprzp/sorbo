# 0006 · Cripto no vuelve

**Estado:** aceptada, 2026-10-22

## Contexto

La promesa de ADR-0005 (devolución automática a los 89 días) aplica a
contribuciones por Mercado Pago, donde un refund es una API call. En cripto
devolver significa enviar desde la wallet de Sorbo al `from` del contribuyente:
custodia activa, gas, y una operación manual o una hot wallet programada —
riesgo real para ahorrar un click.

## Decisión

**Las contribuciones en cripto no tienen devolución.** No es un feature
omitido: es una política del dominio, y se declara antes del QR:

```
USDC O USDT · BASE O POLYGON · MÍNIMO 5 · NO HAY DEVOLUCIÓN EN CRIPTO
```

Solamente se aceptan USDC/USDT en Base y Polygon (una sola address EVM, un
solo QR). El aporte cotiza a MEP al momento de la acreditación on-chain y el
tipo de cambio queda persistido en la contribución. Dust, assets o redes no
soportadas no cuentan.

## Consecuencias

- La promesa de devolución es asimétrica a propósito y visible — si el
  contribuyente la lee, la leyó antes de escanear, no en la letra chica.
- Wallet dedicada nueva: una address, un propósito, conciliación trivial, sin
  mezclar fondos personales.
- Si mañana cambia la política, la decisión es fácil de revertir hacia atrás
  (una devolución manual excepcional no rompe nada) pero imposible hacia
  adelante (no se puede "desdecir" lo que ya entró sin promesa).
- Solana quedó fuera por ahora: requeriría segunda address y segundo QR.
