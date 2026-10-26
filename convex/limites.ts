import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";

// Topes globales de las funciones públicas: Convex no expone la IP, así que
// no hay clave por visitante. Cubren las cuotas que pagamos (Alchemy, MP) y la
// base; están lejos del tráfico real de una campaña chica.
const limites = new RateLimiter(components.rateLimiter, {
  // Crea una orden en MP.
  contribuirMp: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  // Cada hash dispara getTx en las 7 redes.
  verificarTx: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
  // Vuelta de MP: un GET a MP por llamada.
  reconciliar: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  listaDeEspera: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 20 },
});

export type Limite = "contribuirMp" | "verificarTx" | "reconciliar" | "listaDeEspera";

export async function frenar(ctx: ActionCtx | MutationCtx, nombre: Limite) {
  const { ok } = await limites.limit(ctx, nombre);
  if (!ok) throw new Error("DEMASIADO_TRAFICO");
}
