import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { estadoContribucion } from "./schema";
import { resolvePorts } from "./_lib/ports";
import { CHAINS_SOPORTADAS, MIN_MP_CENTAVOS, MIN_USD_CENTS } from "./_lib/dominio";
import { normalizarEmail } from "./_lib/recompensa";
import { frenar } from "./limites";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = process.env.SITE_URL ?? "https://sorbolabs.com";

type Intent =
  | { kind: "redirect"; url: string }
  | { kind: "deposit"; address: string; chains: string[]; minUsdCents: number }
  | { kind: "noop" };

export const contribuir = action({
  args: {
    slug: v.string(),
    website: v.optional(v.string()),
    via: v.union(
      v.object({
        rail: v.literal("mp"),
        montoCentavos: v.number(),
        email: v.optional(v.string()),
      }),
      v.object({
        rail: v.literal("crypto"),
        chainId: v.string(),
        txHash: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    token: v.string(),
    intent: v.union(
      v.object({ kind: v.literal("redirect"), url: v.string() }),
      v.object({
        kind: v.literal("deposit"),
        address: v.string(),
        chains: v.array(v.string()),
        minUsdCents: v.number(),
      }),
      v.object({ kind: v.literal("noop") }),
    ),
  }),
  handler: async (ctx, args): Promise<{ token: string; intent: Intent }> => {
    if (args.website) {
      return { token: "ok", intent: { kind: "noop" as const } };
    }
    const ports = resolvePorts();
    if (args.via.rail === "mp") {
      if (!ports.mp) throw new Error("MP_NO_CONFIGURADO");
      await frenar(ctx, "contribuirMp");
      const { montoCentavos } = args.via;
      const email = args.via.email === undefined ? undefined : normalizarEmail(args.via.email);
      if (!Number.isInteger(montoCentavos) || montoCentavos < MIN_MP_CENTAVOS) {
        throw new Error("MONTO_MINIMO");
      }
      if (email !== undefined && !EMAIL_RE.test(email)) {
        throw new Error("EMAIL_INVALIDO");
      }
      const { id, token } = await ctx.runMutation(
        internal.contributionsInternal.crearPendienteMp,
        { slug: args.slug, montoCentavos, email },
      );
      const retorno = `${SITE_URL}/jujuy/aporte?t=${token}`;
      let order;
      try {
        order = await ports.mp.createOrder(
          {
            externalReference: token,
            totalCentavos: montoCentavos,
            successUrl: retorno,
            pendingUrl: retorno,
            failureUrl: retorno,
            expirationMinutes: 30,
          },
          `${token}-1`,
        );
      } catch (e) {
        console.error("createOrder falló", e);
        await ctx.runMutation(internal.contributionsInternal.expirar, { id });
        throw new Error("MP_FALLO", { cause: e });
      }
      try {
        await ctx.runMutation(internal.contributionsInternal.vincularOrden, {
          id,
          mpOrderId: order.id,
          checkoutUrl: order.checkoutUrl,
        });
      } catch (e) {
        console.error("vincularOrden falló", e);
        try {
          await ports.mp.cancelOrder(order.id);
        } catch (e2) {
          console.error("cancelOrder falló — orden huérfana pagable", e2);
        }
        await ctx.runMutation(internal.contributionsInternal.expirar, { id });
        throw new Error("MP_FALLO", { cause: e });
      }
      return { token, intent: { kind: "redirect" as const, url: order.checkoutUrl } };
    }
    if (args.via.rail === "crypto") {
      const evmAddress = process.env.EVM_ADDRESS;
      if (!ports.evm || !evmAddress) throw new Error("RAIL_NO_DISPONIBLE");
      const { chainId, txHash } = args.via;
      const email = args.via.email === undefined ? undefined : normalizarEmail(args.via.email);
      if (!CHAINS_SOPORTADAS.includes(chainId)) throw new Error("RED_NO_SOPORTADA");
      if (email !== undefined && !EMAIL_RE.test(email)) throw new Error("EMAIL_INVALIDO");
      const { id, token } = await ctx.runMutation(
        internal.contributionsInternal.crearPendienteCrypto,
        { slug: args.slug, chainId, email },
      );
      if (txHash) {
        await frenar(ctx, "verificarTx");
        await ctx.runAction(internal.contributionsInternal.reclamarTx, { id, txHash });
      }
      return {
        token,
        intent: {
          kind: "deposit" as const,
          address: evmAddress,
          chains: CHAINS_SOPORTADAS,
          minUsdCents: MIN_USD_CENTS,
        },
      };
    }
    throw new Error("RAIL_NO_DISPONIBLE");
  },
});

// El contribuyente vuelve de MP: la misma verdad-GET que el webhook.
export const reconciliar = action({
  args: { token: v.string(), txHash: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { token, txHash }) => {
    const c = await ctx.runQuery(
      internal.contributionsInternal.porToken,
      { token },
    );
    if (!c || (c.estado !== "pendiente" && c.estado !== "expirada")) return null;
    await frenar(ctx, txHash ? "verificarTx" : "reconciliar");
    if (c.via === "mp" && c.mpOrderId) {
      await ctx.runAction(internal.contributionsInternal.sincronizarMpPorOrden, {
        mpOrderId: c.mpOrderId,
      });
    } else if (c.via === "crypto" && txHash) {
      await ctx.runAction(internal.contributionsInternal.reclamarTx, {
        id: c._id,
        txHash,
      });
    }
    return null;
  },
});

export const seguimiento = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      estado: estadoContribucion,
      via: v.union(v.literal("mp"), v.literal("crypto")),
      montoCentavos: v.optional(v.number()),
      aporteCentavos: v.optional(v.number()),
      acreditadaAt: v.optional(v.number()),
      checkoutUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { token }) => {
    const c = await ctx.db
      .query("contribuciones")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!c) return null;
    return {
      estado: c.estado,
      via: c.via,
      montoCentavos: c.montoCentavos,
      aporteCentavos: c.aporteCentavos,
      acreditadaAt: c.acreditadaAt,
      checkoutUrl: c.estado === "pendiente" ? c.checkoutUrl : undefined,
    };
  },
});
