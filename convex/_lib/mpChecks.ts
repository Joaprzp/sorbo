import type { MpOrderSnapshot } from "./ports";

// §6 de la guía: plata adentro = processed + accredited, referencia propia,
// monto >= declarado (más se acepta: intereses de cuotas del comprador).
export function ordenAcreditada(
  o: MpOrderSnapshot,
  esperado: { externalReference: string; minCentavos: number },
): boolean {
  return (
    o.status === "processed" &&
    o.statusDetail === "accredited" &&
    o.externalReference === esperado.externalReference &&
    (o.totalPaidCentavos ?? 0) >= esperado.minCentavos
  );
}

// §7: qué hacer con una pendiente vieja según el estado real en MP.
// `processing`/`action_required` = ticket en camino → jamás expira por sweep.
export type DecisionExpiracion = "cancelar" | "expirar" | "reintentar" | "acreditar";

export function decisionExpiracion(o: MpOrderSnapshot): DecisionExpiracion {
  if (o.status === "created") return "cancelar";
  if (o.status === "processed" && o.statusDetail === "accredited") return "acreditar";
  if (["expired", "canceled", "cancelled", "failed", "refunded", "charged_back"].includes(o.status)) {
    return "expirar";
  }
  return "reintentar";
}

// HMAC-SHA256 del manifest `id:…;request-id:…;ts:…;` — la firma cubre esas
// tres partes, no el body. Comparación constante.
export async function firmaWebhookValida(
  secret: string,
  dataId: string,
  requestId: string,
  ts: string,
  v1: string,
): Promise<boolean> {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
