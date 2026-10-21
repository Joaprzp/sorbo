import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  CHAINS_SOPORTADAS,
  MIN_MP_CENTAVOS,
  MIN_USD_CENTS,
  SUGERIDOS_CENTAVOS,
} from "./_lib/dominio";

export const progreso = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!c) return null;
    // El rail cripto se publica solo si la wallet Y el indexer están:
    // un QR sin scan es plata que entra y no cuenta.
    const evmOk = !!(process.env.EVM_ADDRESS && process.env.INDEXER_API_KEY);
    return {
      metaCentavos: c.metaCentavos,
      recaudadoNetoCentavos: c.recaudadoNetoCentavos,
      contribuyentes: c.contribuyentes,
      cumplida: c.cumplidaAt !== undefined,
      minMpCentavos: MIN_MP_CENTAVOS,
      sugeridosCentavos: SUGERIDOS_CENTAVOS,
      rails: {
        mp: !!process.env.MP_ACCESS_TOKEN,
        crypto: evmOk
          ? {
              address: process.env.EVM_ADDRESS!,
              chains: CHAINS_SOPORTADAS,
              minUsdCents: MIN_USD_CENTS,
            }
          : null,
      },
    };
  },
});
