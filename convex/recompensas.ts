import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { resolvePorts, type RecompensaMail } from "./_lib/ports";
import { fechaAR as fecha } from "../src/lib/format";
import {
  cafesPorTotal,
  codigoCorto,
  estadoRecompensa,
  vencimiento,
} from "./_lib/recompensa";
import { campaniaDoc } from "./schema";

type Lector = { db: GenericDatabaseReader<DataModel> };
type Escritor = { db: GenericDatabaseWriter<DataModel> };

const estadoRecompensaV = v.union(
  v.literal("reservado"),
  v.literal("confirmado"),
  v.literal("activo"),
  v.literal("vencido"),
  v.literal("anulado"),
);

const recompensaMail = v.object({
  codigo: v.string(),
  qrId: v.string(),
  saldo: v.number(),
  estado: estadoRecompensaV,
  aperturaAt: v.optional(v.number()),
  venceAt: v.optional(v.number()),
});

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
  // Cuenta la plata que quedó: sin reclamos (la fila de la transfer ya suma)
  // ni aportes con una devolución en curso.
  const total = aportes
    .filter(
      (c) =>
        c.estado === "aprobada" && c.reclamoDe === undefined && c.refundEstado !== "pendiente",
    )
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
    cumplida: campania.cumplidaAt !== undefined,
    aperturaAt: campania.aperturaAt,
    estado: estadoRecompensa({
      cafes,
      cumplida: campania.cumplidaAt !== undefined,
      aperturaAt: campania.aperturaAt,
      ahora,
    }),
    venceAt: campania.aperturaAt === undefined ? undefined : vencimiento(campania.aperturaAt),
  };
}


// `ahora` llega de la acción que manda el mail: una consulta no debe leer el
// reloj (Convex cachea su resultado y no la re-corre cuando pasa el tiempo).
async function paraMailDe(ctx: Lector, r: Doc<"recompensas">, ahora: number): Promise<RecompensaMail> {
  const s = await saldoDe(ctx, r, ahora);
  return {
    codigo: r.codigo,
    qrId: r.qrId,
    saldo: s.saldo,
    estado: s.estado,
    aperturaAt: s.aperturaAt,
    venceAt: s.venceAt,
  };
}

export const paraMail = internalQuery({
  args: { campaniaId: v.id("campaigns"), email: v.string(), ahora: v.number() },
  returns: v.union(v.null(), recompensaMail),
  handler: async (ctx, { campaniaId, email, ahora }) => {
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campaniaId).eq("email", email))
      .unique();
    return r ? await paraMailDe(ctx, r, ahora) : null;
  },
});

// Por página: con la meta completa son miles de personas y cada saldo lee
// aportes y canjes; una sola consulta pasaría el límite de lecturas de Convex.
export const pagina = internalQuery({
  args: { campaniaId: v.id("campaigns"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ emails: v.array(v.string()), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { campaniaId, cursor }) => {
    const p = await ctx.db
      .query("recompensas")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campaniaId))
      .paginate({ numItems: 200, cursor });
    return {
      emails: p.page.map((r) => r.email),
      isDone: p.isDone,
      continueCursor: p.continueCursor,
    };
  },
});

type Envio = { kind: "meta_cumplida" | "apertura" | "vence_pronto"; campaniaId: Id<"campaigns">; email: string };

// Un mail por acción: uno que falla no frena al resto. Apertura y vencimiento
// solo a quien tiene cafés; el vencimiento, una vez por persona
// (send-then-mark en avisosEnviados).
export const enviarMail = internalAction({
  args: {
    kind: v.union(v.literal("meta_cumplida"), v.literal("apertura"), v.literal("vence_pronto")),
    campaniaId: v.id("campaigns"),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { kind, campaniaId, email }: Envio) => {
    const ports = resolvePorts();
    if (!ports.mail) return null;
    const recompensa = await ctx.runQuery(internal.recompensas.paraMail, {
      campaniaId,
      email,
      ahora: Date.now(),
    });
    if (kind !== "meta_cumplida" && (!recompensa || recompensa.saldo === 0)) return null;
    const clave = `vence:${campaniaId}:${email}`;
    if (
      kind === "vence_pronto" &&
      (await ctx.runQuery(internal.recompensas.avisoEnviado, { clave }))
    ) {
      return null;
    }
    await ports.mail.send(kind, email, recompensa ? { recompensa } : {});
    if (kind === "vence_pronto") {
      await ctx.runMutation(internal.recompensas.registrarAviso, { clave });
    }
    return null;
  },
});

export const avisoEnviado = internalQuery({
  args: { clave: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { clave }) =>
    (await ctx.db
      .query("avisosEnviados")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .first()) !== null,
});

export const registrarAviso = internalMutation({
  args: { clave: v.string() },
  returns: v.null(),
  handler: async (ctx, { clave }) => {
    await ctx.db.insert("avisosEnviados", { clave, at: Date.now() });
    return null;
  },
});

async function programarATodos(
  ctx: ActionCtx,
  campaniaId: Id<"campaigns">,
  kind: Envio["kind"],
) {
  let cursor: string | null = null;
  for (;;) {
    const p: { emails: string[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(
      internal.recompensas.pagina,
      { campaniaId, cursor },
    );
    for (const email of p.emails) {
      await ctx.scheduler.runAfter(0, internal.recompensas.enviarMail, { kind, campaniaId, email });
    }
    if (p.isDone) return;
    cursor = p.continueCursor;
  }
}

export const anunciarApertura = internalAction({
  args: { campaniaId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, { campaniaId }) => {
    await programarATodos(ctx, campaniaId, "apertura");
    return null;
  },
});

const DIA = 24 * 60 * 60 * 1000;

// Cron diario: a 30 días del vencimiento, un aviso a quien todavía tenga
// cafés. La dedupe vive en enviarMail, así que correr de más no duplica.
export const avisarVencimientos = internalAction({
  args: { ahora: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const campanias = await ctx.runQuery(internal.recompensas.conApertura, {});
    for (const c of campanias) {
      const vence = vencimiento(c.aperturaAt);
      if (ahora < vence - 30 * DIA || ahora >= vence) continue;
      await programarATodos(ctx, c._id, "vence_pronto");
    }
    return null;
  },
});

export const conApertura = internalQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("campaigns"), aperturaAt: v.number() })),
  handler: async (ctx) => {
    const todas = await ctx.db.query("campaigns").collect();
    return todas
      .filter((c) => c.aperturaAt !== undefined)
      .map((c) => ({ _id: c._id, aperturaAt: c.aperturaAt! }));
  },
});

async function campaniaPorSlug(ctx: Lector, slug: string) {
  return await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

export const campania = internalQuery({
  args: { slug: v.string() },
  returns: v.union(v.null(), campaniaDoc),
  handler: async (ctx, { slug }) => await campaniaPorSlug(ctx, slug),
});

export const porEmail = internalQuery({
  args: { slug: v.string(), email: v.string(), ahora: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({
      codigo: v.string(),
      qrId: v.string(),
      cafes: v.number(),
      canjeados: v.number(),
      saldo: v.number(),
      cumplida: v.boolean(),
      aperturaAt: v.optional(v.number()),
      estado: estadoRecompensaV,
      venceAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { slug, email, ahora }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) return null;
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campania._id).eq("email", email))
      .unique();
    if (!r) return null;
    // Solo para terminal y tests: sin `ahora` el estado se calcula al momento.
    return { codigo: r.codigo, qrId: r.qrId, ...(await saldoDe(ctx, r, ahora ?? Date.now())) };
  },
});

// Desde `bunx convex run`: la apertura habilita el canje. Solo con la meta
// cumplida — después del latch no hay devoluciones, así que nunca se canjea
// un café de un aporte que después vuelve.
export const fijarApertura = internalMutation({
  // `corregir`: mueve una fecha ya fijada sin volver a mandar mails ni push.
  args: { slug: v.string(), aperturaAt: v.number(), corregir: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { slug, aperturaAt, corregir }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    if (campania.cumplidaAt === undefined) throw new Error("META_NO_CUMPLIDA");
    if (campania.aperturaAt !== undefined && !corregir) throw new Error("APERTURA_YA_FIJADA");
    await ctx.db.patch(campania._id, { aperturaAt });
    if (corregir) return null;
    await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
      kind: "apertura",
      detalle: `Canje habilitado del ${fecha(aperturaAt)} al ${fecha(vencimiento(aperturaAt))}`,
    });
    await ctx.scheduler.runAfter(0, internal.recompensas.anunciarApertura, {
      campaniaId: campania._id,
    });
    return null;
  },
});

// Una sola vez al deployar: los aportes aprobados con email de antes de
// ADR-0008 también tienen recompensa (no hay fecha de corte).
export const completarRecompensas = internalMutation({
  args: { slug: v.string() },
  returns: v.number(),
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
