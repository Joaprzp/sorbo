// Recompensa en café (ADR-0008) — reglas puras, sin acceso a la base.
import { v, type Infer } from "convex/values";

// Exportadas para que /jujuy muestre la misma regla que se calcula.
export const PRIMER_CAFE_CENTAVOS = 500_000; // $5.000
export const CAFE_EXTRA_CENTAVOS = 1_000_000; // cada $10.000 más
export const TOPE_CAFES = 10;
export const MESES_DE_CANJE = 6;
export const DESHACER_MS = 5 * 60 * 1000; // un canje se puede deshacer 5 min
const ART_OFFSET_MS = -3 * 60 * 60 * 1000; // Argentina, sin horario de verano

// Por persona, sobre el total de sus aportes aprobados.
export function cafesPorTotal(totalCentavos: number): number {
  if (totalCentavos < PRIMER_CAFE_CENTAVOS) return 0;
  const extra = Math.floor((totalCentavos - PRIMER_CAFE_CENTAVOS) / CAFE_EXTRA_CENTAVOS);
  return Math.min(TOPE_CAFES, 1 + extra);
}

// Cripto: la transfer es pública, así que los cafés van a quien avisó antes
// de pagar y declaró la wallet de origen. Mandar desde la wallet de otro no se
// puede; el plazo corto acota a quien registre direcciones ajenas conocidas.
export const AVISO_VALIDO_MS = 48 * 60 * 60 * 1000;

export function avisoCubrePago(
  aviso: { desde?: string; createdAt: number },
  pago: { desde?: string; blockAt?: number },
): boolean {
  if (!aviso.desde || aviso.desde !== pago.desde || pago.blockAt === undefined) return false;
  const antes = pago.blockAt - aviso.createdAt;
  return antes > 0 && antes <= AVISO_VALIDO_MS;
}

export const esWallet = (s: string) => /^0x[0-9a-f]{40}$/.test(s);

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

export const estadoRecompensaV = v.union(
  v.literal("reservado"), // la meta todavía no se cumplió
  v.literal("confirmado"), // meta cumplida, falta la apertura
  v.literal("activo"), // se puede canjear
  v.literal("vencido"),
  v.literal("anulado"), // sus aportes se devolvieron
);
export type EstadoRecompensa = Infer<typeof estadoRecompensaV>;

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
