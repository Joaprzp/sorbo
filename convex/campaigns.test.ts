import { test, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { setPortsForTesting, type MpPort, type EvmPort, type FxPort, type MailPort, type Ports } from "./_lib/ports";

const modules = import.meta.glob("./**/*.ts");

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
const mailMemoria: MailPort & { enviados: { kind: string; to: string }[] } = {
  enviados: [],
  async send(kind, to) {
    this.enviados.push({ kind, to });
  },
};
class EvmFake implements EvmPort {
  transfers: import("./_lib/ports").EvmTransfer[] = [];
  async inboundTransfers() {
    return { transfers: this.transfers };
  }
  async getTx(chain: string, txHash: string) {
    return (
      this.transfers.find((t) => t.txHash === txHash && t.chain === chain) ??
      null
    );
  }
}

const evmVacio: EvmPort = new EvmFake();

export function puertos(mp: MpPort | null, evm?: EvmPort): Ports {
  return { mp, evm: evm ?? evmVacio, fx: fxFija, mail: mailMemoria };
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
  const t = convexTest(schema, modules);
  await campania(t);
});

test("contribuir mp: crea contribución pendiente y devuelve redirect a MP", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
  await campania(t);
  setPortsForTesting(puertos(new MpFake()));

  await t.action(api.contributions.reconciliar, { token: "inexistente" });
});

// --- slice 4: expiración de órdenes MP + pago tardío ---

const HORA = 3_600_000;

test("sweep expira una orden que MP dio por vencida", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  ...over,
});

test("contribuir crypto devuelve el intent de depósito", async () => {
  const t = convexTest(schema, modules);
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
    chains: ["base", "polygon"],
  });
  const s = await t.query(api.contributions.seguimiento, { token: r.token });
  expect(s).toMatchObject({ estado: "pendiente", via: "crypto" });
});

test("scan acredita una transferencia USDC válida a cotización MEP", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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

test("scan es idempotente por txHash", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
  await campania(t);
  await acreditar(t, 500_000, { email: "a@b.com", diasAtras: 90 });
  mailMemoria.enviados.length = 0;

  await t.action(internal.contributionsInternal.devolucionesDiarias, { ahora: Date.now() });
  await drenar(t);

  expect(mailMemoria.enviados).toContainEqual({ kind: "devolucion", to: "a@b.com" });
});

test("la meta cumplida hace latch y avisa a contribuyentes con email", async () => {
  const t = convexTest(schema, modules);
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

// --- fixes del review ---

test("hash ya acreditado por scan deja el intent en aprobada, sin duplicar", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
