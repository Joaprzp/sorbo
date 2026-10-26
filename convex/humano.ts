import { resolvePorts } from "./_lib/ports";
import { tokenValido, type AccionTurnstile } from "./_lib/turnstile";

// Turnstile antes que todo lo demás: un bot sin token no llega a gastar los
// topes de tráfico (convex/limites.ts) ni a escribir. Falla cerrado: sin
// configuración o sin respuesta de Cloudflare, no pasa.
export async function exigirHumano(token: string, accion: AccionTurnstile) {
  const turnstile = resolvePorts().turnstile;
  const hostnames = new Set<string>(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h: string) => h.trim())
      .filter(Boolean),
  );
  if (!turnstile || hostnames.size === 0) throw new Error("VERIFICACION_NO_DISPONIBLE");
  if (token.length === 0 || token.length > 2048) throw new Error("VERIFICACION_FALLIDA");
  let resultado;
  try {
    resultado = await turnstile.siteverify(token);
  } catch {
    throw new Error("VERIFICACION_FALLIDA");
  }
  if (!tokenValido(resultado, accion, hostnames, process.env.TURNSTILE_PERMITIR_PRUEBA === "1")) {
    throw new Error("VERIFICACION_FALLIDA");
  }
}
