/// <reference types="@cloudflare/workers-types" />
import { conMeta, metaDeRuta } from "./meta";
import { respuestaQr } from "./qr";

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
    const qr = respuestaQr(url.pathname, url.origin);
    if (qr) return qr;
    const res = await env.ASSETS.fetch(request);
    // El QR es al portador: sus URLs y el acceso del staff no se indexan.
    if (url.pathname.startsWith("/canje/") || url.pathname === "/staff") {
      const privada = new Response(res.body, res);
      privada.headers.set("X-Robots-Tag", "noindex, nofollow");
      return privada;
    }
    const meta = metaDeRuta(url.pathname);
    if (meta && res.headers.get("content-type")?.includes("text/html")) {
      return conMeta(res, meta);
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
