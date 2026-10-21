import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const estadoContribucion = v.union(
  v.literal("pendiente"),
  v.literal("aprobada"),
  v.literal("devuelta"),
  v.literal("expirada"),
);

export default defineSchema({
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  campaigns: defineTable({
    slug: v.string(),
    metaCentavos: v.number(),
    recaudadoNetoCentavos: v.number(),
    contribuyentes: v.number(),
    cumplidaAt: v.optional(v.number()),
  }).index("by_slug", ["slug"]),

  contribuciones: defineTable({
    campaniaId: v.id("campaigns"),
    token: v.string(),
    via: v.union(v.literal("mp"), v.literal("crypto")),
    estado: estadoContribucion,
    montoCentavos: v.optional(v.number()),
    aporteCentavos: v.optional(v.number()),
    email: v.optional(v.string()),
    mpOrderId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    chain: v.optional(v.string()),
    txHash: v.optional(v.string()),
    usdCents: v.optional(v.number()),
    mepCentavosPorUsd: v.optional(v.number()),
    acreditadaAt: v.optional(v.number()),
    devueltaAt: v.optional(v.number()),
    refundEstado: v.optional(
      v.union(v.literal("pendiente"), v.literal("done"), v.literal("failed")),
    ),
    refundIntentos: v.optional(v.number()),
    refundError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_mpOrderId", ["mpOrderId"])
    .index("by_txHash", ["txHash"])
    .index("by_devolucion", ["via", "estado", "acreditadaAt"]),

  contributionEvents: defineTable({
    contribucionId: v.id("contribuciones"),
    tipo: v.string(),
    detalle: v.optional(v.string()),
    at: v.number(),
  }).index("by_contribucion", ["contribucionId"]),
});
