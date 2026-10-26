import { v } from "convex/values";
import { mutation } from "./_generated/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const join = mutation({
  args: { email: v.string(), website: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.website) {
      return null;
    }
    const email = args.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new Error("EMAIL_INVALID");
    }
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
