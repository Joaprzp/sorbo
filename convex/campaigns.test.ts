import { test, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { setPortsForTesting, type MpPort, type EvmPort, type FxPort, type MailData, type MailPort, type PushPort, type Ports } from "./_lib/ports";
import { CHAINS_SOPORTADAS } from "./_lib/dominio";
import { esContratoSoportado } from "./_lib/evmChecks";

const modules = import.meta.glob("./**/*.ts");

function nuevoTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

class MpFake implements MpPort {
  orders = new Map<string, { externalReference: string; totalCentavos: number; status: string; statusDetail?: string; totalPaidCentavos?: number }>();
  keys = new Set<string>();
  private n = 0;

  async createOrder(req: { externalReference: string; totalCentavos: number }, key: string) {
    if (this.keys.has(key)) throw new Error("reused idempotency key");
    this.keys.add(key);
    const id = `ORD-${++this.n}`;
    this.orders.set(id, {
      externalReference: req.externalReference,
      totalCentavos: req.totalCentavos,
      status: "created",
    });
    return { id, checkoutUrl: `https://mp.test/checkout/${id}` };
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    return { id, ...o };
  }
  async cancelOrder(id: string) {
    const o = this.orders.get(id);
    if (o) o.status = "cancelled";
  }
  async refundOrder(_id: string, _key: string) {
    return "done" as const;
  }
  pay(id: string) {
    const o = this.orders.get(id)!;
    o.status = "processed";
    o.statusDetail = "accredited";
    o.totalPaidCentavos = o.totalCentavos;
  }
}

const fxFija: FxPort = { mepCentavosPorUsd: async () => 120000 };
const mailMemoria: MailPort & {
  enviados: { kind: string; to: string }[];
  conDatos: { kind: string; to: string; data: MailData }[];
} = {
  enviados: [],
  conDatos: [],
  async send(kind, to, data) {
    this.enviados.push({ kind, to });
    this.conDatos.push({ kind, to, data });
  },
};
class EvmFake implements EvmPort {
  transfers: import("./_lib/ports").EvmTransfer[] = [];
  async inboundTransfers(_address: string, chain: string, _cursor?: string, soloSoportados?: boolean) {
    return {
      transfers: this.transfers.filter(
        (t) => t.chain === chain && (!soloSoportados || esContratoSoportado(chain, t.contract)),
      ),
    };
  }
  async getTx(chain: string, txHash: string) {
    return (
      this.transfers.find((t) => t.txHash === txHash && t.chain === chain) ??
      null
    );
  }
}

const evmVacio: EvmPort = new EvmFake();

export const pushMemoria: PushPort & { enviados: { title: string; message: string }[] } = {
  enviados: [],
  async push(n) {
    this.enviados.push({ title: n.title, message: n.message });
  },
};

export function puertos(mp: MpPort | null, evm?: EvmPort): Ports {
  return { mp, evm: evm ?? evmVacio, fx: fxFija, mail: mailMemoria, push: pushMemoria };
}

async function campania(t: ReturnType<typeof convexTest>, slug = "jujuy") {
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug,
      metaCentavos: 1_000_000_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
}

test("harness: convex-test levanta el schema", async () => {
  const t = nuevoTest();
  await campania(t);
});

test("contribuir mp: crea contribución pendiente y devuelve redirect a MP", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000, email: "ana@ejemplo.com" },
  });

  expect(r.intent.kind).toBe("redirect");
  expect(r.intent).toMatchObject({ url: "https://mp.test/checkout/ORD-1" });
  expect(r.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s).toMatchObject({ estado: "pendiente", via: "mp" });
  expect(mp.orders.get("ORD-1")!.externalReference).toBe(r.token);
});

test("contribuir mp: rechaza monto bajo el mínimo", async () => {
  const t = nuevoTest();
  await campania(t);
  setPortsForTesting(puertos(new MpFake()));

  await expect(
    t.action(api.contributions.contribuir, {
      slug: "jujuy",
      via: { rail: "mp", montoCentavos: 100_00 },
    }),
  ).rejects.toThrowError(/MONTO/);
});

// --- slice 2: webhook → acreditar → progreso ---

process.env.MP_WEBHOOK_SECRET = "secreto-test";

async function firma(dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("secreto-test"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ts=${ts},v1=${hex}`;
}

async function webhook(t: ReturnType<typeof convexTest>, dataId: string, opts?: { badSig?: boolean }) {
  const ts = String(Date.now());
  const requestId = `req-${dataId}`;
  const sig = opts?.badSig ? `ts=${ts},v1=deadbeef` : await firma(dataId, requestId, ts);
  const res = await t.fetch(`/mp/webhook?data.id=${dataId}&type=order`, {
    method: "POST",
    headers: { "x-signature": sig, "x-request-id": requestId },
    body: JSON.stringify({ type: "order", action: "order.processed", data: { id: dataId } }),
  });
  return res;
}

async function drenar(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  } finally {
    vi.useRealTimers();
  }
}

test("pago verificado por webhook acredita y suma al progreso", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000, email: "ana@ejemplo.com" },
  });
  mp.pay("ORD-1");

  const res = await webhook(t, "ORD-1");
  expect(res.status).toBe(200);
  await drenar(t);

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(500_000);
  expect(p!.contribuyentes).toBe(1);
});

test("webhook duplicado no duplica la acreditación", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));

  await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.pay("ORD-1");
  await webhook(t, "ORD-1");
  await drenar(t);
  await webhook(t, "ORD-1");
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(500_000);
  expect(p!.contribuyentes).toBe(1);
});

test("webhook con firma inválida no agenda nada", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.pay("ORD-1");

  const res = await webhook(t, "ORD-1", { badSig: true });
  expect(res.status).toBe(401);
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(0);
});

// --- slice 3: reconciliar al volver de MP ---

test("reconciliar al volver acredita sin esperar al webhook", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.pay("ORD-1");

  await t.action(api.contributions.reconciliar, { token: r.token });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");
});

test("reconciliar con token inválido no rompe nada", async () => {
  const t = nuevoTest();
  await campania(t);
  setPortsForTesting(puertos(new MpFake()));

  await t.action(api.contributions.reconciliar, { token: "inexistente" });
});

// --- slice 4: expiración de órdenes MP + pago tardío ---

const HORA = 3_600_000;

test("sweep expira una orden que MP dio por vencida", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.orders.get("ORD-1")!.status = "expired";

  await t.action(internal.contributionsInternal.barrerExpiracionMp, {
    ahora: Date.now() + 2 * HORA,
  });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("expirada");
});

test("sweep no expira un pago en proceso (ticket en camino)", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.orders.get("ORD-1")!.status = "processing";

  await t.action(internal.contributionsInternal.barrerExpiracionMp, {
    ahora: Date.now() + 2 * HORA,
  });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("pendiente");
});

test("sweep cancela en MP una orden aún creada", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });

  await t.action(internal.contributionsInternal.barrerExpiracionMp, {
    ahora: Date.now() + 2 * HORA,
  });

  expect(mp.orders.get("ORD-1")!.status).toBe("cancelled");
  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("expirada");
});

test("pago tardío verificado sobre fila expirada igual acredita", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000 },
  });
  mp.orders.get("ORD-1")!.status = "expired";
  await t.action(internal.contributionsInternal.barrerExpiracionMp, {
    ahora: Date.now() + 2 * HORA,
  });

  mp.pay("ORD-1");
  await webhook(t, "ORD-1");
  await drenar(t);

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(500_000);
});

// --- slice 5: devolución automática a los 89 días ---

const DIA = 86_400_000;

async function acreditar(
  t: ReturnType<typeof convexTest>,
  montoCentavos: number,
  opts?: { email?: string; diasAtras?: number; mp?: MpFake },
) {
  const mp = opts?.mp ?? new MpFake();
  setPortsForTesting(puertos(mp));
  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos, email: opts?.email },
  });
  const orderId = [...mp.orders.keys()].at(-1)!;
  mp.pay(orderId);
  await t.action(api.contributions.reconciliar, { token: r.token });
  if (opts?.diasAtras) {
    await t.run(async (ctx) => {
      const c = await ctx.db
        .query("contribuciones")
        .filter((q) => q.eq(q.field("token"), r.token))
        .unique();
      await ctx.db.patch(c!._id, {
        acreditadaAt: Date.now() - opts.diasAtras! * DIA,
      });
    });
  }
  return { mp, token: r.token };
}

test("contribución de 90 días con meta incompleta se devuelve sola", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp, token } = await acreditar(t, 500_000, { email: "a@b.com", diasAtras: 90 });
  const reembolsos: string[] = [];
  const orig = mp.refundOrder.bind(mp);
  mp.refundOrder = async (id, key) => { reembolsos.push(`${id}:${key}`); return orig(id, key); };

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);

  expect(reembolsos).toEqual([`ORD-1:refund-${token}`]);
  const s = await t.query(api.contributions.seguimiento, { token });
  expect(s!.estado).toBe("devuelta");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(0);
  expect(p!.contribuyentes).toBe(0);
});

test("contribución de 30 días no se devuelve todavía", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp } = await acreditar(t, 500_000, { diasAtras: 30 });
  let llamadas = 0;
  const orig = mp.refundOrder.bind(mp);
  mp.refundOrder = async (id, key) => { llamadas++; return orig(id, key); };

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  expect(llamadas).toBe(0);
});

test("con meta cumplida no hay devoluciones (latch)", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp } = await acreditar(t, 500_000, { diasAtras: 90 });
  await t.run(async (ctx) => {
    const camp = await ctx.db.query("campaigns").first();
    await ctx.db.patch(camp!._id, { cumplidaAt: Date.now() - 10 * DIA });
  });
  let llamadas = 0;
  const orig = mp.refundOrder.bind(mp);
  mp.refundOrder = async (id, key) => { llamadas++; return orig(id, key); };

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  expect(llamadas).toBe(0);
});

test("el barrido de devoluciones es idempotente", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp } = await acreditar(t, 500_000, { diasAtras: 90 });
  let llamadas = 0;
  const orig = mp.refundOrder.bind(mp);
  mp.refundOrder = async (id, key) => { llamadas++; return orig(id, key); };

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  expect(llamadas).toBe(1);
});

// --- slice 6: cripto ---

process.env.EVM_ADDRESS = "0xSORBOEVM";

const txBase = (over: Partial<import("./_lib/ports").EvmTransfer> = {}) => ({
  chain: "base",
  txHash: "0xabc1",
  to: "0xSORBOEVM",
  asset: "USDC",
  contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  usdCents: 1000, // 10 USDC
  confirmations: 12,
  blockAt: Date.now() + 60_000, // por defecto, la transfer llega después del aviso
  ...over,
});

test("contribuir crypto devuelve el intent de depósito", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  setPortsForTesting(puertos(null, evm));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base" },
  });
  expect(r.intent).toMatchObject({
    kind: "deposit",
    address: "0xSORBOEVM",
    chains: CHAINS_SOPORTADAS,
  });
  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s).toMatchObject({ estado: "pendiente", via: "crypto" });
});

test("scan acredita una transferencia USDC válida a cotización MEP", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase());
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  // 10 USD × 120000 centavos/USD = 1.200.000 centavos ARS
  expect(p!.recaudadoNetoCentavos).toBe(1_200_000);
  expect(p!.contribuyentes).toBe(1);
});

test("scan ignora dust, asset no soportado, contrato falso y otra address", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(
    txBase({ txHash: "0xdust", usdCents: 300 }),          // < 5 USD
    txBase({ txHash: "0xdai", asset: "DAI", contract: "0xDAI" }), // asset no soportado
    txBase({ txHash: "0xfalso", contract: "0xFAKE" }),    // símbolo USDC, contrato trucho
    txBase({ txHash: "0xotra", to: "0xOTRA" }),           // otro destino
  );
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(0);
  expect(p!.contribuyentes).toBe(0);
});

test("scan acredita USDT0 omnichain aunque el símbolo reportado varíe", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(
    txBase({
      chain: "monad",
      txHash: "0xmonadt0",
      asset: "USDT0",
      contract: "0xe7cd86e13ac4309349f30b3435a9d337750fc82d",
    }),
    txBase({
      chain: "optimism",
      txHash: "0xopt0",
      // El indexer puede reportar "USDT" aunque el contrato sea USDT0:
      // la validación va por contrato, no por símbolo.
      asset: "USDT",
      contract: "0x01bff41798a0bcf287b996046ca68b395dbc1071",
    }),
  );
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(2);
});

test("scan ignora un depósito anterior a la campaña (wallet con historia)", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  // La wallet aceptaba depósitos antes de la campaña: confirmaciones muy
  // por encima de la ventana de antigüedad = historia, no aporte.
  evm.transfers.push(
    txBase({
      chain: "bsc",
      txHash: "0xviejo",
      asset: "USDT",
      contract: "0x55d398326f99059ff775485246999027b3197955",
      usdCents: 4967,
      confirmations: 90_000_000,
    }),
  );
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(0);
});

test("claim por hash rechaza un depósito anterior a la campaña", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(
    txBase({
      chain: "bsc",
      txHash: "0xviejo",
      asset: "USDT",
      contract: "0x55d398326f99059ff775485246999027b3197955",
      usdCents: 4967,
      confirmations: 90_000_000,
    }),
  );
  setPortsForTesting(puertos(null, evm));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "bsc" },
  });
  await t.action(api.contributions.reconciliar, {
    token: r.token,
    txHash: "0xviejo",
  });
  await drenar(t);

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("pendiente");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(0);
});

test("aporte acreditado avisa al admin por push", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase());
  setPortsForTesting(puertos(null, evm));
  pushMemoria.enviados.length = 0;

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  expect(pushMemoria.enviados).toHaveLength(1);
  expect(pushMemoria.enviados[0].title).toBe("SORBO · APORTE");
  expect(pushMemoria.enviados[0].message).toContain("cripto");
});

test("transfer inválida a la wallet avisa una sola vez", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  // Token no soportado: 8 USD de "DAI" — plata real que la campaña no cuenta.
  evm.transfers.push(
    txBase({ asset: "DAI", contract: "0x6b175474e89094c44da98b954eedeac495271d0f", usdCents: 800 }),
  );
  setPortsForTesting(puertos(null, evm));
  pushMemoria.enviados.length = 0;

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  expect(pushMemoria.enviados).toHaveLength(1);
  expect(pushMemoria.enviados[0].title).toBe("SORBO · LLEGÓ ALGO QUE NO CUENTA");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(0);
});

test("dust rechazado no avisa", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(
    txBase({ asset: "DAI", contract: "0x6b175474e89094c44da98b954eedeac495271d0f", usdCents: 150 }),
  );
  setPortsForTesting(puertos(null, evm));
  pushMemoria.enviados.length = 0;

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  expect(pushMemoria.enviados).toHaveLength(0);
});

test("scan es idempotente por txHash", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase());
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(1);
});

test("contribuyente que pega su txHash acredita al instante", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase());
  setPortsForTesting(puertos(null, evm));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base" },
  });
  await t.action(api.contributions.reconciliar, { token: r.token, txHash: "0xabc1" });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(1_200_000);
});

test("txHash inexistente no acredita ni rompe", async () => {
  const t = nuevoTest();
  await campania(t);
  setPortsForTesting(puertos(null, new EvmFake()));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base" },
  });
  await t.action(api.contributions.reconciliar, { token: r.token, txHash: "0xnoexiste" });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("pendiente");
});

// --- slice 7: notificaciones ---

test("acreditar con email dispara notificación de acreditación", async () => {
  const t = nuevoTest();
  await campania(t);
  const mp = new MpFake();
  setPortsForTesting(puertos(mp));
  mailMemoria.enviados.length = 0;

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "mp", montoCentavos: 500_000, email: "ana@ejemplo.com" },
  });
  mp.pay("ORD-1");
  await t.action(api.contributions.reconciliar, { token: r.token });
  await drenar(t);

  expect(mailMemoria.enviados).toEqual([{ kind: "acreditacion", to: "ana@ejemplo.com" }]);
});

test("devolución automática avisa por email", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 500_000, { email: "a@b.com", diasAtras: 90 });
  mailMemoria.enviados.length = 0;

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);

  expect(mailMemoria.enviados).toContainEqual({ kind: "devolucion", to: "a@b.com" });
});

test("la meta cumplida hace latch y avisa a contribuyentes con email", async () => {
  const t = nuevoTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 800_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
  mailMemoria.enviados.length = 0;

  const { mp } = await acreditar(t, 500_000, { email: "a@b.com" });
  await acreditar(t, 500_000, { email: "c@d.com", mp });
  await drenar(t);

  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.cumplida).toBe(true);
  expect(p!.recaudadoNetoCentavos).toBe(1_000_000);
  expect(mailMemoria.enviados).toContainEqual({ kind: "meta_cumplida", to: "a@b.com" });
  expect(mailMemoria.enviados).toContainEqual({ kind: "meta_cumplida", to: "c@d.com" });
});

test("fijarMeta mueve la meta de una campaña abierta", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 500_000);
  await drenar(t);

  await t.mutation(internal.contributionsInternal.fijarMeta, {
    slug: "jujuy",
    metaCentavos: 7_500_000_000,
  });
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.metaCentavos).toBe(7_500_000_000);
  expect(p!.recaudadoNetoCentavos).toBe(500_000);

  await expect(
    t.mutation(internal.contributionsInternal.fijarMeta, { slug: "jujuy", metaCentavos: 500_000 }),
  ).rejects.toThrow("META_INVALIDA");
});

test("fijarMeta no reabre una campaña cumplida", async () => {
  const t = nuevoTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 500_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
  await acreditar(t, 500_000);
  await drenar(t);

  await expect(
    t.mutation(internal.contributionsInternal.fijarMeta, { slug: "jujuy", metaCentavos: 7_500_000_000 }),
  ).rejects.toThrow("CAMPANIA_CUMPLIDA");
});

// --- fixes del review ---

test("hash ya acreditado por scan deja el intent en aprobada, sin duplicar", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase());
  setPortsForTesting(puertos(null, evm));

  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base" },
  });
  await t.action(api.contributions.reconciliar, { token: r.token, txHash: "0xabc1" });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.contribuyentes).toBe(1);
});

test("txHash en otra red soportada acredita igual", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(
    txBase({
      chain: "polygon",
      contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    }),
  );
  setPortsForTesting(puertos(null, evm));

  const r = await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base" },
  });
  await t.action(api.contributions.reconciliar, { token: r.token, txHash: "0xabc1" });

  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s!.estado).toBe("aprobada");
});

test("refund marcado antes del latch no se ejecuta después", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp } = await acreditar(t, 500_000, { diasAtras: 90 });
  await t.run(async (ctx) => {
    const c = await ctx.db.query("contribuciones").first();
    await ctx.db.patch(c!._id, { refundEstado: "pendiente" });
    const camp = await ctx.db.query("campaigns").first();
    await ctx.db.patch(camp!._id, { cumplidaAt: Date.now() });
  });
  let llamadas = 0;
  const orig = mp.refundOrder.bind(mp);
  mp.refundOrder = async (id, key) => { llamadas++; return orig(id, key); };

  await t.action(internal.contributionsInternal.barrerReembolsos, { ahora: Date.now() });
  await drenar(t);

  expect(llamadas).toBe(0);
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(500_000);
});

// --- recompensa en café (ADR-0008) ---

async function recompensaDe(t: ReturnType<typeof convexTest>, email: string) {
  return await t.query(internal.recompensas.porEmail, { slug: "jujuy", email });
}

test("recompensa: se suma por email y aplica la regla sobre el total", async () => {
  const t = nuevoTest();
  await campania(t);
  const { mp } = await acreditar(t, 500_000, { email: "Ana@Mail.com " });
  let r = await recompensaDe(t, "ana@mail.com");
  expect(r).toMatchObject({ cafes: 1, saldo: 1, estado: "reservado" });
  expect(r!.codigo).toMatch(/^JUJ-/);

  await acreditar(t, 1_000_000, { email: "ana@mail.com", mp });
  r = await recompensaDe(t, "ana@mail.com");
  expect(r).toMatchObject({ cafes: 2, saldo: 2 }); // $15.000 en total, un solo código
  const filas = await t.run((ctx) => ctx.db.query("recompensas").collect());
  expect(filas).toHaveLength(1);
});

test("recompensa: sin email no hay recompensa", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 9_500_000);
  const filas = await t.run((ctx) => ctx.db.query("recompensas").collect());
  expect(filas).toHaveLength(0);
});

test("recompensa: la devolución anula los cafés de ese aporte", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 500_000, { email: "b@b.com", diasAtras: 90 });
  await drenar(t);
  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  expect(await recompensaDe(t, "b@b.com")).toMatchObject({ cafes: 0, estado: "anulado" });
});

test("recompensa: el aporte posterior a la meta también suma, y la apertura la activa", async () => {
  const t = nuevoTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 500_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
  const { mp } = await acreditar(t, 500_000, { email: "c@c.com" });
  await acreditar(t, 1_000_000, { email: "c@c.com", mp }); // ya con la meta cumplida
  await drenar(t);
  expect(await recompensaDe(t, "c@c.com")).toMatchObject({ cafes: 2, estado: "confirmado" });

  await t.mutation(internal.recompensas.fijarApertura, {
    slug: "jujuy",
    aperturaAt: Date.now() - 1000,
  });
  const r = await recompensaDe(t, "c@c.com");
  expect(r).toMatchObject({ estado: "activo" });
  expect(r!.venceAt).toBeGreaterThan(Date.now());
});

test("recompensa: fijarApertura exige la meta cumplida", async () => {
  const t = nuevoTest();
  await campania(t);
  await expect(
    t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() }),
  ).rejects.toThrow("META_NO_CUMPLIDA");
});

test("recompensa: cripto cuenta en pesos a MEP del día", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase({ txHash: "0xcafe", usdCents: 5000 })); // 50 USDC
  setPortsForTesting(puertos(null, evm));
  await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base", txHash: "0xcafe", email: "d@d.com" },
  });
  await drenar(t);
  // 50 USD × $1.200 = $60.000 → 1 + 5 = 6 cafés
  expect(await recompensaDe(t, "d@d.com")).toMatchObject({ cafes: 6 });
});

test("recompensa: completarRecompensas cubre aportes previos con email", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 500_000, { email: "e@e.com" });
  await t.run(async (ctx) => {
    for (const r of await ctx.db.query("recompensas").collect()) await ctx.db.delete(r._id);
  });
  expect(await recompensaDe(t, "e@e.com")).toBeNull();
  const n = await t.mutation(internal.recompensas.completarRecompensas, { slug: "jujuy" });
  expect(n).toBe(1);
  expect(await recompensaDe(t, "e@e.com")).toMatchObject({ cafes: 1 });
});

// --- staff y canje (ADR-0008) ---

async function conApertura(t: ReturnType<typeof convexTest>, email = "s@s.com", monto = 2_500_000) {
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 500_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
  await acreditar(t, monto, { email });
  await drenar(t);
  await t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() - 1000 });
  await drenar(t);
  const r = await t.query(internal.recompensas.porEmail, { slug: "jujuy", email });
  return r!;
}

async function sesionStaff(t: ReturnType<typeof convexTest>, clave = "tablet") {
  const r = await t.mutation(api.staff.ingresar, { pin: "482193", nombre: "Tablet barra", clave });
  if (!r.token) throw new Error(r.error);
  return r.token;
}

test("staff: PIN correcto abre sesión; el QR público no muestra el código", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  const r = await conApertura(t);
  const publico = await t.query(api.staff.ver, { qrId: r.qrId });
  expect(publico).toMatchObject({ saldo: 3, cumplida: true, staff: null });
  expect(publico!.aperturaAt).toBeDefined();
  expect(publico).not.toHaveProperty("codigo");
  const token = await sesionStaff(t);
  expect(await t.query(api.staff.sesion, { token })).toMatchObject({ nombre: "Tablet barra" });
  const conStaff = await t.query(api.staff.ver, { qrId: r.qrId, token });
  expect(conStaff!.staff!.codigo).toBe(r.codigo);
});

test("staff: 5 PIN incorrectos bloquean el dispositivo y avisan al admin", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  setPortsForTesting(puertos(null));
  pushMemoria.enviados.length = 0;
  for (let i = 0; i < 5; i++) {
    expect(await t.mutation(api.staff.ingresar, { pin: "0000", nombre: "x", clave: "cel" })).toEqual({
      error: "PIN_INCORRECTO",
    });
  }
  expect(await t.mutation(api.staff.ingresar, { pin: "482193", nombre: "x", clave: "cel" })).toEqual({
    error: "PIN_BLOQUEADO",
  });
  // Con el tope global de 5 por día, también se traba otro dispositivo.
  expect(await t.mutation(api.staff.ingresar, { pin: "482193", nombre: "x", clave: "otro" })).toEqual({
    error: "PIN_BLOQUEADO",
  });
  await drenar(t);
  expect(pushMemoria.enviados.map((p) => p.title)).toContain("SORBO · PIN BLOQUEADO");
});

test("canje: descuenta, no deja pasar del saldo y se puede deshacer", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  const r = await conApertura(t); // $25.000 → 3 cafés
  const token = await sesionStaff(t);
  expect(await t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 2, token })).toEqual({ saldo: 1 });
  await expect(
    t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 2, token }),
  ).rejects.toThrow("CANTIDAD_INVALIDA");
  const v = await t.query(api.staff.ver, { qrId: r.qrId, token });
  expect(v!.saldo).toBe(1);
  await t.mutation(api.staff.deshacer, { canjeId: v!.staff!.canjes[0].id, token });
  expect((await t.query(api.staff.ver, { qrId: r.qrId }))!.saldo).toBe(3);
});

test("canje: sin sesión, revocada o antes de la apertura no se puede", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  await campania(t); // meta lejos: sin apertura posible
  await acreditar(t, 500_000, { email: "z@z.com" });
  const r = (await t.query(internal.recompensas.porEmail, { slug: "jujuy", email: "z@z.com" }))!;
  const token = await sesionStaff(t);
  await expect(t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 1, token })).rejects.toThrow("NO_ACTIVO");
  await expect(
    t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 1, token: "falso" }),
  ).rejects.toThrow("SIN_SESION");
  await t.mutation(internal.staff.revocarDispositivo, { nombre: "Tablet barra" });
  expect(await t.query(api.staff.sesion, { token })).toBeNull();
});

test("canje: el código corto encuentra el QR solo con sesión", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  const r = await conApertura(t);
  await expect(t.query(api.staff.buscarCodigo, { codigo: r.codigo, token: "x" })).rejects.toThrow("SIN_SESION");
  const token = await sesionStaff(t);
  const sinPrefijo = r.codigo.replace("JUJ-", "").toLowerCase();
  expect(await t.query(api.staff.buscarCodigo, { codigo: sinPrefijo, token })).toBe(r.qrId);
  expect(await t.action(internal.staff.resumenRecompensas, { slug: "jujuy" })).toMatchObject({
    personas: 1,
    emitidos: 3,
    canjeados: 0,
  });
});

// --- mails de recompensa (ADR-0008) ---

test("mail: la acreditación con email lleva la recompensa; la devolución, el saldo", async () => {
  const t = nuevoTest();
  await campania(t);
  mailMemoria.conDatos.length = 0;
  await acreditar(t, 1_500_000, { email: "m@m.com", diasAtras: 90 });
  await drenar(t);
  const acred = mailMemoria.conDatos.find((m) => m.kind === "acreditacion")!;
  expect(acred.data.recompensa).toMatchObject({ saldo: 2, estado: "reservado" });
  expect(acred.data.recompensa!.codigo).toMatch(/^JUJ-/);

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);
  const dev = mailMemoria.conDatos.find((m) => m.kind === "devolucion")!;
  expect(dev.data.recompensa).toMatchObject({ saldo: 0, estado: "anulado" });
});

test("mail: fijarApertura avisa a quien tiene cafés; el vencimiento avisa una sola vez", async () => {
  const t = nuevoTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 500_000,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  });
  const { mp } = await acreditar(t, 500_000, { email: "n@n.com" });
  await acreditar(t, 500_000, { mp }); // sin email: sin recompensa
  await drenar(t);
  mailMemoria.conDatos.length = 0;
  const apertura = Date.now() - 1000;
  await t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: apertura });
  await drenar(t);
  const ap = mailMemoria.conDatos.filter((m) => m.kind === "apertura");
  expect(ap).toHaveLength(1);
  expect(ap[0]).toMatchObject({ to: "n@n.com", data: { recompensa: { saldo: 1, estado: "activo" } } });

  const DIA_MS = 24 * 60 * 60 * 1000;
  const casiVence = apertura + 170 * DIA_MS;
  await t.action(internal.recompensas.avisarVencimientos, { ahora: casiVence });
  await drenar(t);
  await t.action(internal.recompensas.avisarVencimientos, { ahora: casiVence + DIA_MS });
  await drenar(t);
  expect(mailMemoria.conDatos.filter((m) => m.kind === "vence_pronto")).toHaveLength(1);
  // Lejos del vencimiento no avisa.
  mailMemoria.conDatos.length = 0;
  await t.action(internal.recompensas.avisarVencimientos, { ahora: apertura + 10 * DIA_MS });
  await drenar(t);
  expect(mailMemoria.conDatos).toHaveLength(0);
});

// --- correcciones del review de recompensas ---

test("recompensa: dos reclamos de la misma transfer no duplican cafés", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase({ txHash: "0xdoble", usdCents: 5000 })); // 50 USD → 6 cafés
  setPortsForTesting(puertos(null, evm));
  await t.action(internal.contributionsInternal.escanearCrypto, {}); // el scan llega primero
  await drenar(t);
  for (const email of ["p@p.com", "p@p.com", "q@q.com"]) {
    await t.action(api.contributions.contribuir, {
      slug: "jujuy",
      via: { rail: "crypto", chainId: "base", txHash: "0xdoble", email },
    });
    await drenar(t);
  }
  expect(await recompensaDe(t, "p@p.com")).toMatchObject({ cafes: 6 });
  expect((await recompensaDe(t, "q@q.com"))?.cafes ?? 0).toBe(0);
});

test("recompensa: una devolución en curso ya no suma cafés", async () => {
  const t = nuevoTest();
  await campania(t);
  await acreditar(t, 500_000, { email: "r@r.com" });
  await t.run(async (ctx) => {
    const c = (await ctx.db.query("contribuciones").collect()).find((x) => x.email === "r@r.com")!;
    await ctx.db.patch(c._id, { refundEstado: "pendiente" });
  });
  expect(await recompensaDe(t, "r@r.com")).toMatchObject({ cafes: 0 });
});

test("fijarApertura: la segunda vez exige corregir y no reenvía mails", async () => {
  const t = nuevoTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("campaigns", { slug: "jujuy", metaCentavos: 500_000, recaudadoNetoCentavos: 0, contribuyentes: 0 });
  });
  await acreditar(t, 500_000, { email: "u@u.com" });
  await drenar(t);
  await t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() });
  await drenar(t);
  await expect(
    t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() + 1 }),
  ).rejects.toThrow("APERTURA_YA_FIJADA");
  mailMemoria.conDatos.length = 0;
  await t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() + 1, corregir: true });
  await drenar(t);
  expect(mailMemoria.conDatos).toHaveLength(0);
});

test("staff: un PIN de menos de 5 caracteres deja el acceso deshabilitado", async () => {
  process.env.STAFF_PIN = "4821";
  const t = nuevoTest();
  await expect(
    t.mutation(api.staff.ingresar, { pin: "4821", nombre: "x", clave: "c" }),
  ).rejects.toThrow("STAFF_NO_CONFIGURADO");
  process.env.STAFF_PIN = "482193";
});

test("escala: la apertura llega a todos aunque sean más que una página", async () => {
  const t = nuevoTest();
  setPortsForTesting(puertos(null));
  const N = 450;
  await t.run(async (ctx) => {
    const campaniaId = await ctx.db.insert("campaigns", {
      slug: "jujuy",
      metaCentavos: 500_000,
      recaudadoNetoCentavos: N * 500_000,
      contribuyentes: N,
      cumplidaAt: Date.now(),
    });
    for (let i = 0; i < N; i++) {
      const email = `p${String(i).padStart(4, "0")}@x.com`;
      await ctx.db.insert("contribuciones", {
        campaniaId,
        token: `t${i}`,
        via: "mp",
        estado: "aprobada",
        aporteCentavos: 500_000,
        email,
        acreditadaAt: Date.now(),
        createdAt: Date.now(),
      });
      await ctx.db.insert("recompensas", { campaniaId, email, qrId: `q${i}`, codigo: `JUJ-${i}`, createdAt: Date.now() });
    }
  });
  mailMemoria.conDatos.length = 0;
  await t.mutation(internal.recompensas.fijarApertura, { slug: "jujuy", aperturaAt: Date.now() });
  await drenar(t);
  expect(mailMemoria.conDatos.filter((m) => m.kind === "apertura")).toHaveLength(N);
  expect(await t.action(internal.staff.resumenRecompensas, { slug: "jujuy" })).toMatchObject({
    personas: N,
    emitidos: N,
  });
}, 60_000);

test("staff: la sesión vencida y el deshacer tardío los frena el servidor", async () => {
  process.env.STAFF_PIN = "482193";
  const t = nuevoTest();
  const r = await conApertura(t);
  const token = await sesionStaff(t);
  await t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 1, token });
  const v = await t.query(api.staff.ver, { qrId: r.qrId, token });
  await t.run(async (ctx) => {
    await ctx.db.patch(v!.staff!.canjes[0].id, { at: Date.now() - 6 * 60 * 1000 });
  });
  await expect(t.mutation(api.staff.deshacer, { canjeId: v!.staff!.canjes[0].id, token })).rejects.toThrow(
    "NO_DESHACIBLE",
  );
  await t.run(async (ctx) => {
    for (const d of await ctx.db.query("dispositivos").collect()) await ctx.db.patch(d._id, { venceAt: Date.now() - 1 });
  });
  await expect(t.mutation(api.staff.canjear, { qrId: r.qrId, cantidad: 1, token })).rejects.toThrow("SIN_SESION");
});

test("recompensa: un aviso cripto posterior al pago no da cafés", async () => {
  const t = nuevoTest();
  await campania(t);
  const evm = new EvmFake();
  evm.transfers.push(txBase({ txHash: "0xajena", usdCents: 5000, blockAt: Date.now() - 60_000 }));
  setPortsForTesting(puertos(null, evm));
  await t.action(internal.contributionsInternal.escanearCrypto, {});
  await drenar(t);
  // Alguien ve la transfer on-chain y la reclama con su email: llega tarde.
  await t.action(api.contributions.contribuir, {
    slug: "jujuy",
    via: { rail: "crypto", chainId: "base", txHash: "0xajena", email: "vivo@x.com" },
  });
  await drenar(t);
  expect((await recompensaDe(t, "vivo@x.com"))?.cafes ?? 0).toBe(0);
  // El aporte igual cuenta para la meta.
  const p = await t.query(api.campaigns.progreso, { slug: "jujuy" });
  expect(p!.recaudadoNetoCentavos).toBe(6_000_000);
});

test("límites: pasado el tope global, la lista de espera frena", async () => {
  const t = nuevoTest();
  for (let i = 0; i < 20; i++) await t.mutation(api.waitlist.join, { email: `w${i}@x.com` });
  await expect(t.mutation(api.waitlist.join, { email: "w99@x.com" })).rejects.toThrow("DEMASIADO_TRAFICO");
});

test("staff: con PIN de 5, 5 fallidos en el día traban los ingresos nuevos hasta desbloquear", async () => {
  process.env.STAFF_PIN = "48219";
  const t = nuevoTest();
  setPortsForTesting(puertos(null));
  for (let i = 0; i < 5; i++) {
    await t.mutation(api.staff.ingresar, { pin: "00000", nombre: "x", clave: `rota-${i}` });
  }
  expect(await t.mutation(api.staff.ingresar, { pin: "48219", nombre: "x", clave: "nueva" })).toEqual({
    error: "PIN_BLOQUEADO",
  });
  expect(await t.mutation(internal.staff.desbloquearPin, {})).toBeGreaterThan(0);
  const r = await t.mutation(api.staff.ingresar, { pin: "48219", nombre: "x", clave: "nueva" });
  expect(r.token).toBeDefined();
  process.env.STAFF_PIN = "482193";
});
