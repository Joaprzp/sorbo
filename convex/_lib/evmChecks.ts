import type { EvmTransfer } from "./ports";
import {
  CHAINS_SOPORTADAS,
  TOKEN_CONTRACTS,
  MIN_USD_CENTS,
  MIN_CONFIRMACIONES,
  ANTIGUEDAD_MAX_BLOQUES,
} from "./dominio";

// El contrato es la identidad del token; el símbolo que reporta el
// indexer es ruido (USDT0 puede llegar como USDT, USDt, etc.).
export function esContratoSoportado(chain: string, contract: string): boolean {
  return Object.values(TOKEN_CONTRACTS[chain] ?? {}).some(
    (c) => c.address === contract.toLowerCase(),
  );
}

export function esTransferValida(
  tx: EvmTransfer,
  address: string,
): boolean {
  if (
    CHAINS_SOPORTADAS.includes(tx.chain) &&
    ANTIGUEDAD_MAX_BLOQUES[tx.chain] === undefined
  ) {
    throw new Error(`falta ANTIGUEDAD_MAX_BLOQUES para ${tx.chain}`);
  }
  return (
    CHAINS_SOPORTADAS.includes(tx.chain) &&
    esContratoSoportado(tx.chain, tx.contract) &&
    tx.to.toLowerCase() === address.toLowerCase() &&
    tx.usdCents >= MIN_USD_CENTS &&
    tx.confirmations >= MIN_CONFIRMACIONES &&
    tx.confirmations <= (ANTIGUEDAD_MAX_BLOQUES[tx.chain] ?? 0)
  );
}

export function centavosPorUsd(usdCents: number, mepCentavosPorUsd: number): number {
  return Math.round((usdCents * mepCentavosPorUsd) / 100);
}
