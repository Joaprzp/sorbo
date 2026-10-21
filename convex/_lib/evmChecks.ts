import type { EvmTransfer } from "./ports";
import {
  CHAINS_SOPORTADAS,
  ASSETS_SOPORTADOS,
  TOKEN_CONTRACTS,
  MIN_USD_CENTS,
  MIN_CONFIRMACIONES,
} from "./dominio";

export function esTransferValida(
  tx: EvmTransfer,
  address: string,
): boolean {
  const contrato = TOKEN_CONTRACTS[tx.chain]?.[tx.asset];
  return (
    CHAINS_SOPORTADAS.includes(tx.chain) &&
    ASSETS_SOPORTADOS.includes(tx.asset) &&
    contrato !== undefined &&
    contrato.address === tx.contract.toLowerCase() &&
    tx.to.toLowerCase() === address.toLowerCase() &&
    tx.usdCents >= MIN_USD_CENTS &&
    tx.confirmations >= MIN_CONFIRMACIONES
  );
}

export function centavosPorUsd(usdCents: number, mepCentavosPorUsd: number): number {
  return Math.round((usdCents * mepCentavosPorUsd) / 100);
}
