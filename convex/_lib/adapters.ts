// Adapters de producción: HTTP delgado, sin lógica — toda decisión vive
// en las internal functions y en las funciones puras de _lib.
import type {
  MpPort,
  MpOrderRequest,
  MpOrderSnapshot,
  MpRefundResult,
  EvmPort,
  EvmTransfer,
  FxPort,
  MailPort,
  MailKind,
} from "./ports";
import { TOKEN_CONTRACTS } from "./dominio";
import { MAIL_SUBJECTS, mailHtml, mailText } from "./mailPlantillas";

const MP_API = "https://api.mercadopago.com";

function centavosADecimal(c: number): string {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

function parseMonto(s: unknown): number | undefined {
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export class MpOrdersHttp implements MpPort {
  constructor(private token: string) {}

  private async req(path: string, init: RequestInit) {
    const res = await fetch(`${MP_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return { status: res.status, body };
  }

  async createOrder(req: MpOrderRequest, idempotencyKey: string) {
    const { status, body } = await this.req("/v1/orders", {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        total_amount: centavosADecimal(req.totalCentavos),
        external_reference: req.externalReference,
        items: [
          {
            title: "Contribución Sorbo · Jujuy",
            unit_price: centavosADecimal(req.totalCentavos),
            quantity: 1,
          },
        ],
        expiration_time: `PT${req.expirationMinutes}M`,
        config: {
          online: {
            success_url: req.successUrl,
            pending_url: req.pendingUrl,
            failure_url: req.failureUrl,
            auto_return: "approved",
          },
        },
      }),
    });
    if (status >= 400 || !body.id || !body.checkout_url) {
      throw new Error(
        `MP_CREATE_ORDER:${status}:${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    return { id: String(body.id), checkoutUrl: String(body.checkout_url) };
  }

  async getOrder(id: string): Promise<MpOrderSnapshot> {
    const { status, body } = await this.req(`/v1/orders/${id}`, { method: "GET" });
    if (status >= 400) throw new Error("MP_GET_ORDER");
    return {
      id: String(body.id),
      status: String(body.status),
      statusDetail: body.status_detail ? String(body.status_detail) : undefined,
      externalReference: body.external_reference
        ? String(body.external_reference)
        : undefined,
      totalPaidCentavos: parseMonto(body.total_paid_amount),
    };
  }

  async cancelOrder(id: string): Promise<void> {
    const { status } = await this.req(`/v1/orders/${id}/cancel`, {
      method: "POST",
      headers: { "X-Idempotency-Key": `cancel-${id}` },
      body: "{}",
    });
    if (status >= 400) throw new Error(`MP_CANCEL_ORDER:${status}`);
  }

  async refundOrder(id: string, idempotencyKey: string): Promise<MpRefundResult> {
    try {
      const { status, body } = await this.req(`/v1/orders/${id}/refund`, {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: "{}",
      });
      if (status >= 500 || status === 429) return "transient";
      if (status >= 400) return "rejected";
      return String(body.status ?? "") === "refunded" || status < 300
        ? "done"
        : "transient";
    } catch {
      return "transient";
    }
  }
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export class EvmIndexerHttp implements EvmPort {
  constructor(private apiKey: string) {}

  private url(chain: string) {
    const net = chain === "polygon" ? "polygon-mainnet" : "base-mainnet";
    return `https://${net}.g.alchemy.com/v2/${this.apiKey}`;
  }

  private async rpc(chain: string, method: string, params: unknown[]) {
    const res = await fetch(this.url(chain), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json: { result?: unknown } = await res.json();
    return json.result;
  }

  async inboundTransfers(address: string, chain: string, cursor?: string) {
    const r = (await this.rpc(chain, "alchemy_getAssetTransfers", [
      {
        toAddress: address,
        category: ["erc20"],
        withMetadata: false,
        excludeZeroValue: true,
        maxCount: "0x64",
        ...(cursor ? { pageKey: cursor } : {}),
        order: "asc",
      },
    ])) as {
      transfers?: {
        hash: string;
        asset?: string;
        value?: number | string;
        blockNum?: string;
        to?: string;
        rawContract?: { address?: string; value?: string; decimal?: string };
      }[];
      pageKey?: string;
    } | undefined;
    const head = (await this.rpc(chain, "eth_blockNumber", [])) as string;
    const confs = (blockNum?: string) =>
      blockNum && head ? Math.max(1, parseInt(head, 16) - parseInt(blockNum, 16) + 1) : 0;
    // Reporta hechos on-chain (contrato incluido); la validez la decide el dominio.
    const out: EvmTransfer[] = (r?.transfers ?? [])
      .filter((t) => t.asset === "USDC" || t.asset === "USDT")
      .map((t) => ({
        chain,
        txHash: String(t.hash),
        to: t.to ?? address,
        asset: String(t.asset),
        contract: String(t.rawContract?.address ?? "").toLowerCase(),
        usdCents: Math.round(Number(t.value ?? 0) * 100),
        confirmations: confs(t.blockNum),
      }));
    return { transfers: out, cursor: r?.pageKey };
  }

  // Verificación de un hash: receipt + log Transfer del token conocido.
  async getTx(chain: string, txHash: string): Promise<EvmTransfer | null> {
    const receipt = (await this.rpc(chain, "eth_getTransactionReceipt", [
      txHash,
    ])) as {
      status?: string;
      blockNumber?: string;
      logs?: { address: string; topics: string[]; data: string }[];
    } | null;
    if (!receipt || receipt.status !== "0x1") return null;
    const tokens = TOKEN_CONTRACTS[chain] ?? {};
    const head = (await this.rpc(chain, "eth_blockNumber", [])) as string;
    const confs = receipt.blockNumber && head
      ? parseInt(head, 16) - parseInt(receipt.blockNumber, 16) + 1
      : 0;
    for (const log of receipt.logs ?? []) {
      const contract = String(log.address).toLowerCase();
      for (const [asset, info] of Object.entries(tokens)) {
        if (contract !== info.address) continue;
        const topics: string[] = log.topics ?? [];
        if (topics[0] !== TRANSFER_TOPIC || topics.length < 3) continue;
        const to = `0x${topics[2].slice(-40)}`;
        const raw = BigInt(log.data);
        const usdCents = Math.round(Number(raw) * 100 / 10 ** info.decimals);
        return { chain, txHash, to, asset, contract, usdCents, confirmations: confs };
      }
    }
    return null;
  }
}

export class FxHttp implements FxPort {
  async mepCentavosPorUsd(): Promise<number> {
    const res = await fetch("https://dolarapi.com/v1/dolares/bolsa");
    const json: { venta?: unknown } = await res.json();
    const venta = Number(json.venta);
    if (!Number.isFinite(venta) || venta <= 0) throw new Error("FX_FALLO");
    return Math.round(venta * 100);
  }
}

export class ResendHttp implements MailPort {
  constructor(private apiKey: string) {}
  async send(
    kind: MailKind,
    to: string,
    data: { montoCentavos?: number },
  ) {
    const base = process.env.SITE_URL ?? "https://sorbolabs.com";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sorbo <campana@sorbolabs.com>",
        to,
        subject: MAIL_SUBJECTS[kind],
        text: mailText(kind, data, base),
        html: mailHtml(kind, data, base),
      }),
    });
    if (!res.ok) throw new Error("MAIL_FALLO");
  }
}
