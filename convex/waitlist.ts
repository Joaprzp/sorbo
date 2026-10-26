import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { frenar } from "./limites";
import { exigirHumano } from "./humano";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Acción y no mutación: verificar Turnstile es un fetch, y las mutaciones no
// pueden salir a la red. La escritura queda en `anotar`.
export const join = action({
  args: { email: v.string(), website: v.optional(v.string()), turnstile: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.website) {
      return null;
    }
    await exigirHumano(args.turnstile, "lista_espera");
    await frenar(ctx, "listaDeEspera");
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new Error("EMAIL_INVALID");
    }
    await ctx.runMutation(internal.waitlist.anotar, { email });
    return null;
  },
});

export const anotar = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!existing) {
      await ctx.db.insert("waitlist", { email, createdAt: Date.now() });
    }
    return null;
  },
});
