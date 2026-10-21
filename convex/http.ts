import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { firmaWebhookValida } from "./_lib/mpChecks";

const http = httpRouter();

http.route({
  path: "/mp/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) return new Response("no configurado", { status: 404 });

    const url = new URL(req.url);
    const dataId = url.searchParams.get("data.id") ?? "";
    const sig = req.headers.get("x-signature") ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    const parts = Object.fromEntries(
      sig.split(",").map((p) => p.split("=", 2) as [string, string]),
    );
    const ok =
      dataId &&
      parts.ts &&
      parts.v1 &&
      (await firmaWebhookValida(secret, dataId, requestId, parts.ts, parts.v1));
    if (!ok) return new Response("firma inválida", { status: 401 });

    await ctx.scheduler.runAfter(
      0,
      internal.contributionsInternal.sincronizarMpPorOrden,
      { mpOrderId: dataId },
    );
    return new Response("ok", { status: 200 });
  }),
});

export default http;
