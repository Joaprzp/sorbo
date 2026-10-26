/// <reference types="@cloudflare/workers-types" />
import { conMeta, metaDeRuta } from "./meta";

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.sorbolabs.com") {
      url.hostname = "sorbolabs.com";
      return Response.redirect(url.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    const meta = metaDeRuta(url.pathname);
    if (meta && res.headers.get("content-type")?.includes("text/html")) {
      return conMeta(res, meta);
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
