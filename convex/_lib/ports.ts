// Puertos para dependencias externas (cat. 4 — true external).
// Producción: adapters HTTP. Tests: fakes in-memory vía setPortsForTesting.
// Si una env falta, el puerto es null → el rail se oculta en `progreso`;
// Turnstile, en cambio, falla cerrado (convex/humano.ts).
import { MpOrdersHttp, EvmIndexerHttp, FxHttp, ResendHttp, BrrrHttp, TurnstileHttp } from "./adapters";

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
  blockAt?: number; // hora del bloque (ms): decide si el aviso fue antes del pago
  from?: string; // wallet que mandó, en minúsculas: ata el aviso a la transfer
}

export interface EvmPort {
  // soloSoportados=true filtra por contrato en el indexer: el feed de
  // acreditación no puede ser starveado por spam de tokens.
  inboundTransfers(address: string, chain: string, cursor?: string, soloSoportados?: boolean): Promise<{ transfers: EvmTransfer[]; cursor?: string }>;
  getTx(chain: string, txHash: string, address?: string): Promise<EvmTransfer | null>;
}

export interface FxPort {
  mepCentavosPorUsd(): Promise<number>;
}

import type { EstadoRecompensa } from "./recompensa";

export type MailKind =
  | "acreditacion"
  | "devolucion"
  | "meta_cumplida"
  | "apertura"
  | "vence_pronto";

// ADR-0008: lo que el mail necesita saber de la recompensa de esa persona.
export type RecompensaMail = {
  codigo: string;
  qrId: string;
  saldo: number;
  estado: EstadoRecompensa;
  aperturaAt?: number;
  venceAt?: number;
};

export type MailData = { montoCentavos?: number; recompensa?: RecompensaMail };

export interface MailPort {
  send(kind: MailKind, to: string, data: MailData): Promise<void>;
}

// Push al cel del admin (brrr). Distinto del mail transaccional: esto es
// operación interna, no comunicación con el contribuyente.
export type PushAviso = {
  title: string;
  message: string;
  threadId?: string;
  sound?: string;
  openUrl?: string;
  interruptionLevel?: "active" | "time-sensitive";
};

export interface PushPort {
  push(aviso: PushAviso): Promise<void>;
}

// Cloudflare Turnstile: la respuesta de siteverify, tal cual la da Cloudflare.
export type TurnstileResultado = {
  success: boolean;
  action?: string;
  hostname?: string;
  metadata?: { result_with_testing_key?: boolean };
};

export interface TurnstilePort {
  siteverify(token: string): Promise<TurnstileResultado>;
}

export interface Ports {
  mp: MpPort | null;
  evm: EvmPort | null;
  fx: FxPort | null;
  mail: MailPort | null;
  push: PushPort | null;
  turnstile: TurnstilePort | null;
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
  const turnstileSecret = process.env.TURNSTILE_SECRET;
  return {
    mp: mpToken ? new MpOrdersHttp(mpToken) : null,
    evm: indexerKey ? new EvmIndexerHttp(indexerKey) : null,
    // Sin indexer no hay rail cripto y el FX no se usa para nada más.
    fx: indexerKey ? new FxHttp() : null,
    mail: resendKey ? new ResendHttp(resendKey) : null,
    push: brrrKey ? new BrrrHttp(brrrKey) : null,
    turnstile: turnstileSecret ? new TurnstileHttp(turnstileSecret) : null,
  };
}
