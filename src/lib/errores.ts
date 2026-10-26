// Lo que ve el visitante cuando una función pública pasa su tope (convex/limites.ts).
const DEMASIADO_TRAFICO = "Hay mucho tráfico. Probá en un minuto.";

// Turnstile (convex/humano.ts y src/components/turnstile.tsx).
const VERIFICACION_FALLIDA = "No pudimos verificar que sos una persona. Probá de nuevo.";
const VERIFICACION_NO_DISPONIBLE = "La verificación no está disponible ahora. Probá en un rato.";

// Errores que comparten todos los formularios públicos.
const COMUNES: Record<string, string> = {
  DEMASIADO_TRAFICO,
  VERIFICACION_FALLIDA,
  VERIFICACION_NO_DISPONIBLE,
};

// Traduce el código que viene en el mensaje del error de Convex a un texto
// para el visitante; los propios del formulario pisan a los comunes.
export function mensajeDeError(e: unknown, propios: Record<string, string>, porDefecto: string): string {
  const msg = e instanceof Error ? e.message : "";
  for (const [codigo, texto] of Object.entries({ ...COMUNES, ...propios })) {
    if (msg.includes(codigo)) return texto;
  }
  return porDefecto;
}
