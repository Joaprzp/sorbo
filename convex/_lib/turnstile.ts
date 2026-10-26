import type { TurnstileResultado } from "./ports";

// Acciones de Turnstile: una por formulario protegido, igual que en el front.
export type AccionTurnstile = "contribuir_mp" | "aviso_cripto" | "lista_espera";

// El token vale si Cloudflare dice que sí, para esta acción y desde un dominio
// nuestro. Las claves de prueba de Cloudflare (sin acción, hostname
// example.com) solo pasan donde se habilitó explícitamente: desarrollo.
export function tokenValido(
  r: TurnstileResultado,
  accion: AccionTurnstile,
  hostnames: Set<string>,
  permitirPrueba: boolean,
): boolean {
  if (!r.success) return false;
  if (r.metadata?.result_with_testing_key) return permitirPrueba;
  return r.action === accion && r.hostname !== undefined && hostnames.has(r.hostname);
}
