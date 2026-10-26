import { encodeQR } from "qr";

// ADR-0008: el QR del mail. Gmail no muestra SVG ni data URIs, así que va
// como GIF servido desde acá. El id es largo e imposible de adivinar.
const QR_RUTA = /^\/qr\/([A-Za-z0-9_-]{20,64})\.gif$/;

export function respuestaQr(pathname: string, origen: string): Response | null {
  const m = QR_RUTA.exec(pathname);
  if (!m) return null;
  const gif = encodeQR(`${origen}/canje/${m[1]}`, "gif", { ecc: "medium", border: 2, scale: 6 });
  return new Response(gif, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Robots-Tag": "noindex",
    },
  });
}
