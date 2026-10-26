import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  cafesPorTotal,
  codigoCorto,
  estadoRecompensa,
  vencimiento,
} from "./_lib/recompensa";

type Lector = { db: GenericDatabaseReader<DataModel> };
type Escritor = { db: GenericDatabaseWriter<DataModel> };

function qrIdNuevo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Idempotente: la primera acreditación con email crea la fila; las demás la
// encuentran. El código corto se reintenta ante la (rarísima) colisión.
export async function asegurarRecompensa(
  ctx: Escritor,
  campaniaId: Id<"campaigns">,
  email: string,
): Promise<Id<"recompensas">> {
  const existente = await ctx.db
    .query("recompensas")
    .withIndex("by_campania_email", (q) => q.eq("campaniaId", campaniaId).eq("email", email))
    .unique();
  if (existente) return existente._id;
  let codigo = codigoCorto();
  while (
    await ctx.db
      .query("recompensas")
      .withIndex("by_codigo", (q) => q.eq("codigo", codigo))
      .first()
  ) {
    codigo = codigoCorto();
  }
  return await ctx.db.insert("recompensas", {
    campaniaId,
    email,
    qrId: qrIdNuevo(),
    codigo,
    createdAt: Date.now(),
  });
}

export async function saldoDe(ctx: Lector, r: Doc<"recompensas">, ahora: number) {
  const campania = (await ctx.db.get(r.campaniaId))!;
  const aportes = await ctx.db
    .query("contribuciones")
    .withIndex("by_campania_email", (q) =>
      q.eq("campaniaId", r.campaniaId).eq("email", r.email),
    )
    .collect();
  const total = aportes
    .filter((c) => c.estado === "aprobada")
    .reduce((s, c) => s + (c.aporteCentavos ?? 0), 0);
  const cafes = cafesPorTotal(total);
  const canjes = await ctx.db
    .query("canjes")
    .withIndex("by_recompensa", (q) => q.eq("recompensaId", r._id))
    .collect();
  const canjeados = canjes
    .filter((c) => c.deshechoAt === undefined)
    .reduce((s, c) => s + c.cantidad, 0);
  return {
    cafes,
    canjeados,
    saldo: Math.max(0, cafes - canjeados),
    estado: estadoRecompensa({
      cafes,
      cumplida: campania.cumplidaAt !== undefined,
      aperturaAt: campania.aperturaAt,
      ahora,
    }),
    venceAt: campania.aperturaAt === undefined ? undefined : vencimiento(campania.aperturaAt),
  };
}

const fecha = (ms: number) =>
  new Date(ms).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

async function campaniaPorSlug(ctx: Lector, slug: string) {
  return await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export const porEmail = internalQuery({
  args: { slug: v.string(), email: v.string() },
  handler: async (ctx, { slug, email }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) return null;
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campania._id).eq("email", email))
      .unique();
    if (!r) return null;
    return { codigo: r.codigo, qrId: r.qrId, ...(await saldoDe(ctx, r, Date.now())) };
  },
});

// Desde `bunx convex run`: la apertura habilita el canje. Solo con la meta
// cumplida — después del latch no hay devoluciones, así que nunca se canjea
// un café de un aporte que después vuelve.
export const fijarApertura = internalMutation({
  args: { slug: v.string(), aperturaAt: v.number() },
  handler: async (ctx, { slug, aperturaAt }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    if (campania.cumplidaAt === undefined) throw new Error("META_NO_CUMPLIDA");
    await ctx.db.patch(campania._id, { aperturaAt });
    await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
      kind: "apertura",
      detalle: `Canje habilitado del ${fecha(aperturaAt)} al ${fecha(vencimiento(aperturaAt))}`,
    });
  },
});

// Una sola vez al deployar: los aportes aprobados con email de antes de
// ADR-0008 también tienen recompensa (no hay fecha de corte).
export const completarRecompensas = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    const aprobadas = await ctx.db
      .query("contribuciones")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campania._id))
      .collect();
    const emails = new Set(
      aprobadas.filter((c) => c.estado === "aprobada" && c.email).map((c) => c.email!),
    );
    for (const email of emails) await asegurarRecompensa(ctx, campania._id, email);
    return emails.size;
  },
});
