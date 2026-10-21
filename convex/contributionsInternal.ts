import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { resolvePorts } from "./_lib/ports";
import { ordenAcreditada, decisionExpiracion } from "./_lib/mpChecks";
import { esTransferValida, centavosPorUsd } from "./_lib/evmChecks";
import { CHAINS_SOPORTADAS } from "./_lib/dominio";

type Lector = { db: GenericDatabaseReader<DataModel> };
type Escritor = { db: GenericDatabaseWriter<DataModel> };

async function campaniaPorSlug(ctx: Lector, slug: string) {
  return await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function evento(
  ctx: Escritor,
  contribucionId: Id<"contribuciones">,
  tipo: string,
  at: number,
  detalle?: string,
) {
  await ctx.db.insert("contributionEvents", {
    contribucionId,
    tipo,
    detalle,
    at,
  });
}

function generarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const crearPendienteMp = internalMutation({
  args: {
    slug: v.string(),
    montoCentavos: v.number(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    const token = generarToken();
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token,
      via: "mp",
      estado: "pendiente",
      montoCentavos: args.montoCentavos,
      email: args.email,
      createdAt: ahora,
    });
    await evento(ctx, id, "creada", ahora);
    return { id, token };
  },
});

export const vincularOrden = internalMutation({
  args: {
    id: v.id("contribuciones"),
    mpOrderId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      mpOrderId: args.mpOrderId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});

export const porMpOrderId = internalQuery({
  args: { mpOrderId: v.string() },
  handler: async (ctx, { mpOrderId }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_mpOrderId", (q) => q.eq("mpOrderId", mpOrderId))
      .unique();
  },
});

// La única transición a `aprobada`. Dueña de contadores, latch y mail.
// Acepta desde pendiente y desde expirada: un pago tardío verificado es plata.
export const acreditar = internalMutation({
  args: {
    id: v.id("contribuciones"),
    aporteCentavos: v.number(),
    ahora: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || (c.estado !== "pendiente" && c.estado !== "expirada")) return;
    const t = args.ahora ?? Date.now();
    await ctx.db.patch(args.id, {
      estado: "aprobada",
      aporteCentavos: args.aporteCentavos,
      acreditadaAt: t,
    });
    const campania = (await ctx.db.get(c.campaniaId))!;
    const recaudado = campania.recaudadoNetoCentavos + args.aporteCentavos;
    await ctx.db.patch(campania._id, {
      recaudadoNetoCentavos: recaudado,
      contribuyentes: campania.contribuyentes + 1,
      cumplidaAt:
        campania.cumplidaAt === undefined && recaudado >= campania.metaCentavos
          ? t
          : campania.cumplidaAt,
    });
    await evento(ctx, args.id, "acreditada", t, String(args.aporteCentavos));
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: args.id,
        kind: "acreditacion",
      });
    }
    if (recaudado >= campania.metaCentavos && campania.cumplidaAt === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.contributionsInternal.anunciarMetaCumplida,
        { campaniaId: campania._id },
      );
    }
  },
});

export const contribuyentesConEmail = internalQuery({
  args: { campaniaId: v.id("campaigns") },
  handler: async (ctx, { campaniaId }) => {
    const rows = await ctx.db
      .query("contribuciones")
      .filter((q) => q.eq(q.field("campaniaId"), campaniaId))
      .collect();
    return [
      ...new Set(
        rows
          .filter((r) => r.estado === "aprobada" || r.estado === "devuelta")
          .map((r) => r.email)
          .filter((e): e is string => !!e),
      ),
    ];
  },
});

// Latch recién disparado: un mail a cada contribuyente que dejó email.
export const anunciarMetaCumplida = internalAction({
  args: { campaniaId: v.id("campaigns") },
  handler: async (ctx, { campaniaId }) => {
    const ports = resolvePorts();
    if (!ports.mail) return;
    const emails = await ctx.runQuery(
      internal.contributionsInternal.contribuyentesConEmail,
      { campaniaId },
    );
    for (const to of emails) {
      await ports.mail.send("meta_cumplida", to, {});
    }
  },
});

// Webhook / reconciliar / sweep convergen acá: refetch de la verdad en MP.
export const sincronizarMpPorOrden = internalAction({
  args: { mpOrderId: v.string() },
  handler: async (ctx, { mpOrderId }) => {
    const c = await ctx.runQuery(internal.contributionsInternal.porMpOrderId, {
      mpOrderId,
    });
    if (!c || (c.estado !== "pendiente" && c.estado !== "expirada")) return;
    const ports = resolvePorts();
    if (!ports.mp) return;
    const orden = await ports.mp.getOrder(mpOrderId);
    if (
      ordenAcreditada(orden, {
        externalReference: c.token,
        minCentavos: c.montoCentavos ?? 0,
      })
    ) {
      await ctx.runMutation(internal.contributionsInternal.acreditar, {
        id: c._id,
        aporteCentavos: orden.totalPaidCentavos!,
      });
    }
  },
});

const VENTANA_EXPIRACION_MS = 35 * 60 * 1000;

export const pendientesMp = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_devolucion", (q) =>
        q.eq("via", "mp").eq("estado", "pendiente"),
      )
      .collect();
  },
});

// Cron ~10min: cierra pendientes viejas según la verdad en MP.
export const barrerExpiracionMp = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const ports = resolvePorts();
    if (!ports.mp) return;
    const pendientes = (await ctx.runQuery(
      internal.contributionsInternal.pendientesMp,
      {},
    )).filter((c) => ahora - c.createdAt > VENTANA_EXPIRACION_MS && c.mpOrderId);
    for (const c of pendientes) {
      try {
        const orden = await ports.mp.getOrder(c.mpOrderId!);
        const d = decisionExpiracion(orden);
        if (d === "cancelar") {
          await ports.mp.cancelOrder(c.mpOrderId!);
          await ctx.runMutation(internal.contributionsInternal.expirar, { id: c._id });
        } else if (d === "expirar") {
          await ctx.runMutation(internal.contributionsInternal.expirar, { id: c._id });
        } else if (d === "acreditar" && orden.externalReference === c.token) {
          await ctx.runMutation(internal.contributionsInternal.acreditar, {
            id: c._id,
            aporteCentavos: orden.totalPaidCentavos ?? c.montoCentavos ?? 0,
          });
        }
      } catch {
        // MP inalcanzable → se reintenta en el próximo barrido
      }
    }
  },
});

const VENTANA_DEVOLUCION_MS = 89 * 86_400_000;

export const aprobadasParaDevolucion = internalQuery({
  args: { antesDe: v.number() },
  handler: async (ctx, { antesDe }) => {
    const rows = await ctx.db
      .query("contribuciones")
      .withIndex("by_devolucion", (q) =>
        q.eq("via", "mp").eq("estado", "aprobada").lte("acreditadaAt", antesDe),
      )
      .collect();
    const out = [];
    for (const c of rows) {
      const camp = await ctx.db.get(c.campaniaId);
      if (camp && camp.cumplidaAt === undefined) out.push(c);
    }
    return out;
  },
});

export const marcarReembolsoPendiente = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.estado !== "aprobada" || c.refundEstado !== undefined) return false;
    const camp = await ctx.db.get(c.campaniaId);
    if (!camp || camp.cumplidaAt !== undefined) return false;
    await ctx.db.patch(id, { refundEstado: "pendiente", refundIntentos: 0 });
    return true;
  },
});

export const marcarDevuelta = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.estado !== "aprobada") return;
    const t = Date.now();
    await ctx.db.patch(id, {
      estado: "devuelta",
      devueltaAt: t,
      refundEstado: "done",
    });
    const camp = await ctx.db.get(c.campaniaId);
    if (camp) {
      await ctx.db.patch(camp._id, {
        recaudadoNetoCentavos: Math.max(
          0,
          camp.recaudadoNetoCentavos - (c.aporteCentavos ?? 0),
        ),
        contribuyentes: Math.max(0, camp.contribuyentes - 1),
      });
    }
    await evento(ctx, id, "devuelta", t);
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: id,
        kind: "devolucion",
      });
    }
  },
});

export const marcarReembolsoFallido = internalMutation({
  args: { id: v.id("contribuciones"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const c = await ctx.db.get(id);
    if (!c) return;
    await ctx.db.patch(id, { refundEstado: "failed", refundError: error });
  },
});

// Cron diario: contribuciones MP aprobadas ≥89d con meta incompleta.
export const devolucionesDiarias = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const elegibles = await ctx.runQuery(
      internal.contributionsInternal.aprobadasParaDevolucion,
      { antesDe: ahora - VENTANA_DEVOLUCION_MS },
    );
    for (const c of elegibles) {
      const marcada = await ctx.runMutation(
        internal.contributionsInternal.marcarReembolsoPendiente,
        { id: c._id },
      );
      if (marcada) {
        await ctx.scheduler.runAfter(
          0,
          internal.contributionsInternal.ejecutarReembolso,
          { id: c._id },
        );
      }
    }
  },
});

export const campaniaDe = internalQuery({
  args: { contribucionId: v.id("contribuciones") },
  handler: async (ctx, { contribucionId }) => {
    const c = await ctx.db.get(contribucionId);
    return c ? await ctx.db.get(c.campaniaId) : null;
  },
});

export const cancelarReembolso = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.refundEstado !== "pendiente") return;
    await ctx.db.patch(id, { refundEstado: undefined });
    await evento(ctx, id, "reembolso_cancelado", Date.now());
  },
});

export const ejecutarReembolso = internalAction({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const ports = resolvePorts();
    if (!ports.mp) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, { id });
    if (!c || c.estado !== "aprobada" || c.refundEstado !== "pendiente" || !c.mpOrderId) return;
    const camp = await ctx.runQuery(internal.contributionsInternal.campaniaDe, {
      contribucionId: id,
    });
    // La promesa era contra la meta no cumplida: si el latch ya cayó, no vuelve.
    if (camp?.cumplidaAt !== undefined) {
      await ctx.runMutation(internal.contributionsInternal.cancelarReembolso, { id });
      return;
    }
    const res = await ports.mp.refundOrder(c.mpOrderId, `refund-${c.token}`);
    if (res === "done") {
      await ctx.runMutation(internal.contributionsInternal.marcarDevuelta, { id });
    } else if (res === "rejected") {
      await ctx.runMutation(internal.contributionsInternal.marcarReembolsoFallido, {
        id,
        error: "rechazado",
      });
    }
    // transient → queda pendiente; el sweep la reintenta
  },
});

export const crearPendienteCrypto = internalMutation({
  args: {
    slug: v.string(),
    chainId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    const token = generarToken();
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token,
      via: "crypto",
      estado: "pendiente",
      chain: args.chainId,
      email: args.email,
      createdAt: ahora,
    });
    await evento(ctx, id, "creada", ahora);
    return { id, token };
  },
});

export const porTxHash = internalQuery({
  args: { txHash: v.string() },
  handler: async (ctx, { txHash }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_txHash", (q) => q.eq("txHash", txHash))
      .unique();
  },
});

// El contribuyente pega su hash: verificación on-chain, jamás confianza.
// El scan pudo haber llegado antes: su fila ya acreditada también le sirve —
// el intent se marca aprobada sin tocar contadores (la plata ya contó).
export const reclamarTx = internalAction({
  args: { id: v.id("contribuciones"), txHash: v.string() },
  handler: async (ctx, { id, txHash }) => {
    const ports = resolvePorts();
    const address = process.env.EVM_ADDRESS;
    if (!ports.evm || !ports.fx || !address) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, { id });
    if (!c || c.via !== "crypto" || c.estado !== "pendiente") return;
    const existente = await ctx.runQuery(
      internal.contributionsInternal.porTxHash,
      { txHash },
    );
    if (existente) {
      if (existente.estado === "aprobada" && existente._id !== id) {
        await ctx.runMutation(internal.contributionsInternal.vincularReclamo, {
          id,
          aporteCentavos: existente.aporteCentavos ?? 0,
        });
      }
      return;
    }
    // La red declarada es una pista, no un hecho: se busca en todas.
    let tx = null;
    for (const chain of CHAINS_SOPORTADAS) {
      tx = await ports.evm.getTx(chain, txHash);
      if (tx) break;
    }
    if (!tx || !esTransferValida(tx, address)) return;
    const mep = await ports.fx.mepCentavosPorUsd();
    await ctx.runMutation(internal.contributionsInternal.vincularTx, {
      id,
      txHash,
      chain: tx.chain,
      usdCents: tx.usdCents,
      mepCentavosPorUsd: mep,
    });
    await ctx.runMutation(internal.contributionsInternal.acreditar, {
      id,
      aporteCentavos: centavosPorUsd(tx.usdCents, mep),
    });
  },
});

export const vincularReclamo = internalMutation({
  args: { id: v.id("contribuciones"), aporteCentavos: v.number() },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      estado: "aprobada",
      aporteCentavos: args.aporteCentavos,
      acreditadaAt: Date.now(),
    });
    await evento(ctx, args.id, "reclamo_ya_acreditado", Date.now());
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: args.id,
        kind: "acreditacion",
      });
    }
  },
});

export const vincularTx = internalMutation({
  args: {
    id: v.id("contribuciones"),
    txHash: v.string(),
    chain: v.string(),
    usdCents: v.number(),
    mepCentavosPorUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      txHash: args.txHash,
      chain: args.chain,
      usdCents: args.usdCents,
      mepCentavosPorUsd: args.mepCentavosPorUsd,
    });
  },
});

// El scan crea la fila ya pendiente con el hash atado; acreditar hace el resto.
export const crearObservadaCrypto = internalMutation({
  args: {
    slug: v.string(),
    chain: v.string(),
    txHash: v.string(),
    usdCents: v.number(),
    mepCentavosPorUsd: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("contribuciones")
        .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
        .first()
    ) {
      return null;
    }
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) return null;
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token: generarToken(),
      via: "crypto",
      estado: "pendiente",
      chain: args.chain,
      txHash: args.txHash,
      usdCents: args.usdCents,
      mepCentavosPorUsd: args.mepCentavosPorUsd,
      createdAt: ahora,
    });
    await evento(ctx, id, "observada", ahora, args.txHash);
    return id;
  },
});

// Cron ~5min: la address en cada red soportada.
export const escanearCrypto = internalAction({
  args: {},
  handler: async (ctx) => {
    const ports = resolvePorts();
    const address = process.env.EVM_ADDRESS;
    if (!ports.evm || !ports.fx || !address) return;
    let mep: number | null = null;
    for (const chain of CHAINS_SOPORTADAS) {
      // Pagina hasta agotar el indexer (tope defensivo: la dedupe por txHash
      // hace seguro re-ver páginas viejas en la próxima corrida).
      let cursor: string | undefined;
      let paginas = 0;
      do {
        const res = await ports.evm.inboundTransfers(address, chain, cursor);
        for (const tx of res.transfers) {
          if (!esTransferValida(tx, address)) continue;
          mep ??= await ports.fx.mepCentavosPorUsd();
          const id = await ctx.runMutation(
            internal.contributionsInternal.crearObservadaCrypto,
            {
              slug: "jujuy",
              chain: tx.chain,
              txHash: tx.txHash,
              usdCents: tx.usdCents,
              mepCentavosPorUsd: mep,
            },
          );
          if (id) {
            await ctx.runMutation(internal.contributionsInternal.acreditar, {
              id,
              aporteCentavos: centavosPorUsd(tx.usdCents, mep),
            });
          }
        }
        cursor = res.cursor;
      } while (cursor && ++paginas < 20);
    }
  },
});

export const reembolsosEstancados = internalQuery({
  args: { antesDe: v.number() },
  handler: async (ctx, { antesDe }) => {
    const rows = await ctx.db
      .query("contribuciones")
      .withIndex("by_devolucion", (q) =>
        q.eq("via", "mp").eq("estado", "aprobada"),
      )
      .collect();
    return rows.filter(
      (c) =>
        c.refundEstado === "pendiente" &&
        (c.refundIntentos ?? 0) < 3 &&
        c.acreditadaAt !== undefined &&
        c.acreditadaAt < antesDe,
    );
  },
});

// Cron ~3h: un refund `pendiente` que perdió su action (crash) se reinicia.
export const barrerReembolsos = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const estancados = await ctx.runQuery(
      internal.contributionsInternal.reembolsosEstancados,
      { antesDe: ahora - 6 * 3_600_000 },
    );
    for (const c of estancados) {
      await ctx.runMutation(internal.contributionsInternal.bumpIntentoReembolso, {
        id: c._id,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.contributionsInternal.ejecutarReembolso,
        { id: c._id },
      );
    }
  },
});

export const bumpIntentoReembolso = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) return;
    await ctx.db.patch(id, { refundIntentos: (c.refundIntentos ?? 0) + 1 });
  },
});

export const enviarNotificacion = internalAction({
  args: {
    contribucionId: v.id("contribuciones"),
    kind: v.union(
      v.literal("acreditacion"),
      v.literal("devolucion"),
      v.literal("meta_cumplida"),
    ),
  },
  handler: async (ctx, args) => {
    const ports = resolvePorts();
    if (!ports.mail) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, {
      id: args.contribucionId,
    });
    if (!c?.email) return;
    await ports.mail.send(args.kind, c.email, {
      montoCentavos: c.aporteCentavos ?? c.montoCentavos,
    });
  },
});

export const porToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
  },
});

// Una sola vez, desde el dashboard o `bunx convex run`: crea la campaña.
export const crearCampania = internalMutation({
  args: { slug: v.string(), metaCentavos: v.number() },
  handler: async (ctx, args) => {
    const existe = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existe) return;
    await ctx.db.insert("campaigns", {
      slug: args.slug,
      metaCentavos: args.metaCentavos,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  },
});

export const porId = internalQuery({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const expirar = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, { estado: "expirada" });
    await evento(ctx, args.id, "expirada", Date.now());
  },
});
