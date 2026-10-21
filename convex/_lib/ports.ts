// Puertos para dependencias externas (cat. 4 — true external).
// Producción: adapters HTTP. Tests: fakes in-memory vía setPortsForTesting.
// Si una env falta, el puerto es null → el rail se oculta en `progreso`.
import { MpOrdersHttp, EvmIndexerHttp, FxHttp, ResendHttp, BrrrHttp } from "./adapters";

export interface MpOrderRequest {
  externalReference: string;
  totalCentavos: number;
  successUrl: string;
  pendingUrl: string;
  failureUrl: string;
  expirationMinutes: number;
}

export interface MpOrderSnapshot {
  id: string;
  status: string;
  statusDetail?: string;
  externalReference?: string;
  totalPaidCentavos?: number;
}

export type MpRefundResult = "done" | "transient" | "rejected";

export interface MpPort {
  createOrder(req: MpOrderRequest, idempotencyKey: string): Promise<{ id: string; checkoutUrl: string }>;
  getOrder(id: string): Promise<MpOrderSnapshot>;
  cancelOrder(id: string): Promise<void>;
  refundOrder(id: string, idempotencyKey: string): Promise<MpRefundResult>;
}

export interface EvmTransfer {
  chain: string;
  txHash: string;
  to: string;
  asset: string; // símbolo reportado por el indexer — no identidad
  contract: string; // contrato ERC-20 visto on-chain — el símbolo no se cree
  usdCents: number;
  confirmations: number;
}

export interface EvmPort {
  inboundTransfers(address: string, chain: string, cursor?: string): Promise<{ transfers: EvmTransfer[]; cursor?: string }>;
  getTx(chain: string, txHash: string, address?: string): Promise<EvmTransfer | null>;
}

export interface FxPort {
  mepCentavosPorUsd(): Promise<number>;
}

export type MailKind = "acreditacion" | "devolucion" | "meta_cumplida";

export interface MailPort {
  send(
    kind: MailKind,
    to: string,
    data: { montoCentavos?: number },
  ): Promise<void>;
}

// Push al cel del admin (brrr). Distinto del mail transaccional: esto es
// operación interna, no comunicación con el contribuyente.
export interface PushPort {
  push(n: {
    title: string;
    message: string;
    threadId?: string;
    sound?: string;
    openUrl?: string;
    interruptionLevel?: "active" | "time-sensitive";
  }): Promise<void>;
}

export interface Ports {
  mp: MpPort | null;
  evm: EvmPort | null;
  fx: FxPort | null;
  mail: MailPort | null;
  push: PushPort | null;
}

let overrides: Ports | null = null;

export function setPortsForTesting(p: Ports) {
  overrides = p;
}

export function resolvePorts(): Ports {
  if (overrides) return overrides;
  const mpToken = process.env.MP_ACCESS_TOKEN;
  const indexerKey = process.env.INDEXER_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const brrrKey = process.env.BRRR_KEY;
  return {
    mp: mpToken ? new MpOrdersHttp(mpToken) : null,
    evm: indexerKey ? new EvmIndexerHttp(indexerKey) : null,
    fx: indexerKey ? new FxHttp() : null,
    mail: resendKey ? new ResendHttp(resendKey) : null,
    push: brrrKey ? new BrrrHttp(brrrKey) : null,
  };
}
