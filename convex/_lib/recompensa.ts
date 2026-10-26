// Recompensa en café (ADR-0008) — reglas puras, sin Convex.

// Exportadas para que /jujuy muestre la misma regla que se calcula.
export const PRIMER_CAFE_CENTAVOS = 500_000; // $5.000
export const CAFE_EXTRA_CENTAVOS = 1_000_000; // cada $10.000 más
export const TOPE_CAFES = 10;
export const MESES_DE_CANJE = 6;
const ART_OFFSET_MS = -3 * 60 * 60 * 1000; // Argentina, sin horario de verano

// Por persona, sobre el total de sus aportes aprobados.
export function cafesPorTotal(totalCentavos: number): number {
  if (totalCentavos < PRIMER_CAFE_CENTAVOS) return 0;
  const extra = Math.floor((totalCentavos - PRIMER_CAFE_CENTAVOS) / CAFE_EXTRA_CENTAVOS);
  return Math.min(TOPE_CAFES, 1 + extra);
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Sin 0/O ni 1/I/L: se dicta y se tipea en la barra sin dudas.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function codigoCorto(): string {
  const tope = 256 - (256 % ALFABETO.length);
  let s = "";
  while (s.length < 6) {
    const [b] = crypto.getRandomValues(new Uint8Array(1));
    if (b < tope) s += ALFABETO[b % ALFABETO.length];
  }
  return `JUJ-${s}`;
}

// Apertura + 6 meses, contado en fecha argentina. Si el día no existe en el
// mes de destino (31/08 → 31/02) cae en el último día de ese mes.
export function vencimiento(aperturaAt: number): number {
  const d = new Date(aperturaAt + ART_OFFSET_MS);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + MESES_DE_CANJE);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.getTime() - ART_OFFSET_MS;
}

export type EstadoRecompensa =
  | "reservado" // la meta todavía no se cumplió
  | "confirmado" // meta cumplida, falta la apertura
  | "activo" // se puede canjear
  | "vencido"
  | "anulado"; // sus aportes se devolvieron

export function estadoRecompensa(args: {
  cafes: number;
  cumplida: boolean;
  aperturaAt?: number;
  ahora: number;
}): EstadoRecompensa {
  if (args.cafes === 0) return "anulado";
  if (!args.cumplida) return "reservado";
  if (args.aperturaAt === undefined || args.ahora < args.aperturaAt) return "confirmado";
  return args.ahora < vencimiento(args.aperturaAt) ? "activo" : "vencido";
}
