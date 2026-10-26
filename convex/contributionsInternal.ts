import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { resolvePorts } from "./_lib/ports";
import { ordenAcreditada, decisionExpiracion } from "./_lib/mpChecks";
import { esTransferValida, esContratoSoportado, centavosPorUsd } from "./_lib/evmChecks";
import { CHAINS_SOPORTADAS, MIN_USD_CENTS, TECHO_AVISO_USD_CENTS } from "./_lib/dominio";
import { ars } from "../src/lib/format";
import { asegurarRecompensa } from "./recompensas";

type Lector = { db: GenericDatabaseReader<DataModel> };
type Escritor = { db: GenericDatabaseWriter<DataModel> };

async function campaniaPorSlug(ctx: Lector, slug: string) {
  return await ctx.db
    .query("campaigns")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function evento(
  ctx: Escritor,
  contribucionId: Id<"contribuciones">,
  tipo: string,
  at: number,
  detalle?: string,
) {
  await ctx.db.insert("contributionEvents", {
    contribucionId,
    tipo,
    detalle,
    at,
  });
}

function generarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const crearPendienteMp = internalMutation({
  args: {
    slug: v.string(),
    montoCentavos: v.number(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    const token = generarToken();
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token,
      via: "mp",
      estado: "pendiente",
      montoCentavos: args.montoCentavos,
      email: args.email,
      createdAt: ahora,
    });
    await evento(ctx, id, "creada", ahora);
    return { id, token };
  },
});

export const vincularOrden = internalMutation({
  args: {
    id: v.id("contribuciones"),
    mpOrderId: v.string(),
    checkoutUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      mpOrderId: args.mpOrderId,
      checkoutUrl: args.checkoutUrl,
    });
  },
});

export const porMpOrderId = internalQuery({
  args: { mpOrderId: v.string() },
  handler: async (ctx, { mpOrderId }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_mpOrderId", (q) => q.eq("mpOrderId", mpOrderId))
      .unique();
  },
});

// La única transición a `aprobada`. Dueña de contadores, latch y mail.
// Acepta desde pendiente y desde expirada: un pago tardío verificado es plata.
export const acreditar = internalMutation({
  args: {
    id: v.id("contribuciones"),
    aporteCentavos: v.number(),
    ahora: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || (c.estado !== "pendiente" && c.estado !== "expirada")) return;
    const t = args.ahora ?? Date.now();
    await ctx.db.patch(args.id, {
      estado: "aprobada",
      aporteCentavos: args.aporteCentavos,
      acreditadaAt: t,
    });
    const campania = (await ctx.db.get(c.campaniaId))!;
    const recaudado = campania.recaudadoNetoCentavos + args.aporteCentavos;
    await ctx.db.patch(campania._id, {
      recaudadoNetoCentavos: recaudado,
      contribuyentes: campania.contribuyentes + 1,
      cumplidaAt:
        campania.cumplidaAt === undefined && recaudado >= campania.metaCentavos
          ? t
          : campania.cumplidaAt,
    });
    await evento(ctx, args.id, "acreditada", t, String(args.aporteCentavos));
    if (c.email) await asegurarRecompensa(ctx, c.campaniaId, c.email);
    await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
      kind: "aporte",
      contribucionId: args.id,
    });
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: args.id,
        kind: "acreditacion",
      });
    }
    if (recaudado >= campania.metaCentavos && campania.cumplidaAt === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.contributionsInternal.anunciarMetaCumplida,
        { campaniaId: campania._id, metaCentavos: campania.metaCentavos },
      );
    }
  },
});

// Por página: una campaña puede tener miles de filas (contando pendientes y
// expiradas). El índice ordena por email, así los repetidos quedan juntos.
export const contribuyentesConEmail = internalQuery({
  args: { campaniaId: v.id("campaigns"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { campaniaId, cursor }) => {
    const pagina = await ctx.db
      .query("contribuciones")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campaniaId).gt("email", ""))
      .paginate({ numItems: 500, cursor });
    return {
      emails: pagina.page
        .filter((r) => r.estado === "aprobada" || r.estado === "devuelta")
        .map((r) => r.email!),
      isDone: pagina.isDone,
      continueCursor: pagina.continueCursor,
    };
  },
});

// Latch recién disparado: un mail a cada contribuyente que dejó email.
export const anunciarMetaCumplida = internalAction({
  args: { campaniaId: v.id("campaigns"), metaCentavos: v.optional(v.number()) },
  handler: async (ctx, { campaniaId, metaCentavos }) => {
    const ports = resolvePorts();
    if (ports.mail) {
      // Un mail por acción programada: uno que falla no frena al resto.
      const vistos = new Set<string>();
      let cursor: string | null = null;
      for (;;) {
        const pagina: { emails: string[]; isDone: boolean; continueCursor: string } =
          await ctx.runQuery(internal.contributionsInternal.contribuyentesConEmail, {
            campaniaId,
            cursor,
          });
        for (const to of pagina.emails) {
          if (vistos.has(to)) continue;
          vistos.add(to);
          await ctx.scheduler.runAfter(0, internal.recompensas.enviarMail, {
            kind: "meta_cumplida",
            campaniaId,
            email: to,
          });
        }
        if (pagina.isDone) break;
        cursor = pagina.continueCursor;
      }
    }
    if (metaCentavos !== undefined) {
      try {
        await ports.push?.push({
          title: "SORBO · META CUMPLIDA",
          message: `Juntamos ${ars(metaCentavos)}. El próximo Sorbo es en Jujuy.`,
          threadId: "sorbo",
          sound: "upbeat_bells",
          openUrl: `${process.env.SITE_URL ?? "https://sorbolabs.com"}/jujuy`,
          interruptionLevel: "time-sensitive",
        });
      } catch (e) {
        // brrr caído no rompe el fanout ni dispara retries de mail.
        console.error("push meta_cumplida falló", e);
      }
    }
  },
});

// Webhook / reconciliar / sweep convergen acá: refetch de la verdad en MP.
export const sincronizarMpPorOrden = internalAction({
  args: { mpOrderId: v.string() },
  handler: async (ctx, { mpOrderId }) => {
    const c = await ctx.runQuery(internal.contributionsInternal.porMpOrderId, {
      mpOrderId,
    });
    if (!c || (c.estado !== "pendiente" && c.estado !== "expirada")) return;
    const ports = resolvePorts();
    if (!ports.mp) return;
    const orden = await ports.mp.getOrder(mpOrderId);
    if (
      ordenAcreditada(orden, {
        externalReference: c.token,
        minCentavos: c.montoCentavos ?? 0,
      })
    ) {
      await ctx.runMutation(internal.contributionsInternal.acreditar, {
        id: c._id,
        aporteCentavos: orden.totalPaidCentavos!,
      });
    }
  },
});

const VENTANA_EXPIRACION_MS = 35 * 60 * 1000;

export const pendientesMp = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_devolucion", (q) =>
        q.eq("via", "mp").eq("estado", "pendiente"),
      )
      .collect();
  },
});

// Cron ~10min: cierra pendientes viejas según la verdad en MP.
export const barrerExpiracionMp = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const ports = resolvePorts();
    if (!ports.mp) return;
    const pendientes = (await ctx.runQuery(
      internal.contributionsInternal.pendientesMp,
      {},
    )).filter((c) => ahora - c.createdAt > VENTANA_EXPIRACION_MS && c.mpOrderId);
    for (const c of pendientes) {
      try {
        const orden = await ports.mp.getOrder(c.mpOrderId!);
        const d = decisionExpiracion(orden);
        if (d === "cancelar") {
          await ports.mp.cancelOrder(c.mpOrderId!);
          await ctx.runMutation(internal.contributionsInternal.expirar, { id: c._id });
        } else if (d === "expirar") {
          await ctx.runMutation(internal.contributionsInternal.expirar, { id: c._id });
        } else if (d === "acreditar" && orden.externalReference === c.token) {
          await ctx.runMutation(internal.contributionsInternal.acreditar, {
            id: c._id,
            aporteCentavos: orden.totalPaidCentavos ?? c.montoCentavos ?? 0,
          });
        }
      } catch {
        // MP inalcanzable → se reintenta en el próximo barrido
      }
    }
  },
});

const VENTANA_DEVOLUCION_MS = 89 * 86_400_000;

export const aprobadasParaDevolucion = internalQuery({
  args: { antesDe: v.number() },
  handler: async (ctx, { antesDe }) => {
    const rows = await ctx.db
      .query("contribuciones")
      .withIndex("by_devolucion", (q) =>
        q.eq("via", "mp").eq("estado", "aprobada").lte("acreditadaAt", antesDe),
      )
      .collect();
    const out = [];
    for (const c of rows) {
      const camp = await ctx.db.get(c.campaniaId);
      if (camp && camp.cumplidaAt === undefined) out.push(c);
    }
    return out;
  },
});

export const marcarReembolsoPendiente = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.estado !== "aprobada" || c.refundEstado !== undefined) return false;
    const camp = await ctx.db.get(c.campaniaId);
    if (!camp || camp.cumplidaAt !== undefined) return false;
    await ctx.db.patch(id, { refundEstado: "pendiente", refundIntentos: 0 });
    return true;
  },
});

export const marcarDevuelta = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.estado !== "aprobada") return;
    const t = Date.now();
    await ctx.db.patch(id, {
      estado: "devuelta",
      devueltaAt: t,
      refundEstado: "done",
    });
    const camp = await ctx.db.get(c.campaniaId);
    if (camp) {
      await ctx.db.patch(camp._id, {
        recaudadoNetoCentavos: Math.max(
          0,
          camp.recaudadoNetoCentavos - (c.aporteCentavos ?? 0),
        ),
        contribuyentes: Math.max(0, camp.contribuyentes - 1),
      });
    }
    await evento(ctx, id, "devuelta", t);
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: id,
        kind: "devolucion",
      });
    }
  },
});

export const marcarReembolsoFallido = internalMutation({
  args: { id: v.id("contribuciones"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const c = await ctx.db.get(id);
    if (!c || c.refundEstado === "done") return;
    await ctx.db.patch(id, { refundEstado: "failed", refundError: error });
    await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
      kind: "reembolso_fallido",
      contribucionId: id,
    });
  },
});

// Cron diario: contribuciones MP aprobadas ≥89d con meta incompleta.
export const devolucionesDiarias = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const elegibles = await ctx.runQuery(
      internal.contributionsInternal.aprobadasParaDevolucion,
      { antesDe: ahora - VENTANA_DEVOLUCION_MS },
    );
    for (const c of elegibles) {
      const marcada = await ctx.runMutation(
        internal.contributionsInternal.marcarReembolsoPendiente,
        { id: c._id },
      );
      if (marcada) {
        await ctx.scheduler.runAfter(
          0,
          internal.contributionsInternal.ejecutarReembolso,
          { id: c._id },
        );
      }
    }
  },
});

export const campaniaDe = internalQuery({
  args: { contribucionId: v.id("contribuciones") },
  handler: async (ctx, { contribucionId }) => {
    const c = await ctx.db.get(contribucionId);
    return c ? await ctx.db.get(c.campaniaId) : null;
  },
});

export const cancelarReembolso = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || c.refundEstado !== "pendiente") return;
    await ctx.db.patch(id, { refundEstado: undefined });
    await evento(ctx, id, "reembolso_cancelado", Date.now());
  },
});

export const ejecutarReembolso = internalAction({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const ports = resolvePorts();
    if (!ports.mp) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, { id });
    if (!c || c.estado !== "aprobada" || c.refundEstado !== "pendiente" || !c.mpOrderId) return;
    const camp = await ctx.runQuery(internal.contributionsInternal.campaniaDe, {
      contribucionId: id,
    });
    // La promesa era contra la meta no cumplida: si el latch ya cayó, no vuelve.
    if (camp?.cumplidaAt !== undefined) {
      await ctx.runMutation(internal.contributionsInternal.cancelarReembolso, { id });
      return;
    }
    const res = await ports.mp.refundOrder(c.mpOrderId, `refund-${c.token}`);
    if (res === "done") {
      await ctx.runMutation(internal.contributionsInternal.marcarDevuelta, { id });
    } else if (res === "rejected") {
      await ctx.runMutation(internal.contributionsInternal.marcarReembolsoFallido, {
        id,
        error: "rechazado",
      });
    }
    // transient → queda pendiente; el sweep la reintenta
  },
});

export const crearPendienteCrypto = internalMutation({
  args: {
    slug: v.string(),
    chainId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    const token = generarToken();
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token,
      via: "crypto",
      estado: "pendiente",
      chain: args.chainId,
      email: args.email,
      createdAt: ahora,
    });
    await evento(ctx, id, "creada", ahora);
    return { id, token };
  },
});

export const porTxHash = internalQuery({
  args: { txHash: v.string() },
  handler: async (ctx, { txHash }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_txHash", (q) => q.eq("txHash", txHash))
      .unique();
  },
});

// El contribuyente pega su hash: verificación on-chain, jamás confianza.
// El scan pudo haber llegado antes: su fila ya acreditada también le sirve —
// el intent se marca aprobada sin tocar contadores (la plata ya contó).
export const reclamarTx = internalAction({
  args: { id: v.id("contribuciones"), txHash: v.string() },
  handler: async (ctx, { id, txHash }) => {
    const ports = resolvePorts();
    const address = process.env.EVM_ADDRESS;
    if (!ports.evm || !ports.fx || !address) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, { id });
    if (!c || c.via !== "crypto" || c.estado !== "pendiente") return;
    const existente = await ctx.runQuery(
      internal.contributionsInternal.porTxHash,
      { txHash },
    );
    if (existente) {
      if (existente.estado === "aprobada" && existente._id !== id) {
        await ctx.runMutation(internal.contributionsInternal.vincularReclamo, {
          id,
          existenteId: existente._id,
          aporteCentavos: existente.aporteCentavos ?? 0,
        });
      }
      return;
    }
    // La red declarada es una pista, no un hecho: se busca en todas.
    let tx = null;
    for (const chain of CHAINS_SOPORTADAS) {
      try {
        tx = await ports.evm.getTx(chain, txHash, address);
      } catch (e) {
        console.error(`getTx ${chain} falló`, e);
        continue;
      }
      if (tx) break;
    }
    if (!tx || !esTransferValida(tx, address)) return;
    const mep = await ports.fx.mepCentavosPorUsd();
    await ctx.runMutation(internal.contributionsInternal.vincularTx, {
      id,
      txHash,
      chain: tx.chain,
      usdCents: tx.usdCents,
      mepCentavosPorUsd: mep,
    });
    await ctx.runMutation(internal.contributionsInternal.acreditar, {
      id,
      aporteCentavos: centavosPorUsd(tx.usdCents, mep),
    });
  },
});

export const vincularReclamo = internalMutation({
  args: {
    id: v.id("contribuciones"),
    existenteId: v.id("contribuciones"),
    aporteCentavos: v.number(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      estado: "aprobada",
      aporteCentavos: args.aporteCentavos,
      acreditadaAt: Date.now(),
      reclamoDe: args.existenteId,
    });
    await evento(ctx, args.id, "reclamo_ya_acreditado", Date.now());
    // Los cafés van con la plata: el primer reclamo le da su email a la fila
    // de la transfer; uno posterior de la misma transfer no suma cafés.
    const existente = await ctx.db.get(args.existenteId);
    if (c.email && existente && !existente.email) {
      await ctx.db.patch(existente._id, { email: c.email });
      await asegurarRecompensa(ctx, c.campaniaId, c.email);
    }
    if (c.email) {
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.enviarNotificacion, {
        contribucionId: args.id,
        kind: "acreditacion",
      });
    }
  },
});

export const vincularTx = internalMutation({
  args: {
    id: v.id("contribuciones"),
    txHash: v.string(),
    chain: v.string(),
    usdCents: v.number(),
    mepCentavosPorUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, {
      txHash: args.txHash,
      chain: args.chain,
      usdCents: args.usdCents,
      mepCentavosPorUsd: args.mepCentavosPorUsd,
    });
  },
});

// El scan crea la fila ya pendiente con el hash atado; acreditar hace el resto.
export const crearObservadaCrypto = internalMutation({
  args: {
    slug: v.string(),
    chain: v.string(),
    txHash: v.string(),
    usdCents: v.number(),
    mepCentavosPorUsd: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("contribuciones")
        .withIndex("by_txHash", (q) => q.eq("txHash", args.txHash))
        .first()
    ) {
      return null;
    }
    const campania = await campaniaPorSlug(ctx, args.slug);
    if (!campania) return null;
    const ahora = Date.now();
    const id = await ctx.db.insert("contribuciones", {
      campaniaId: campania._id,
      token: generarToken(),
      via: "crypto",
      estado: "pendiente",
      chain: args.chain,
      txHash: args.txHash,
      usdCents: args.usdCents,
      mepCentavosPorUsd: args.mepCentavosPorUsd,
      createdAt: ahora,
    });
    await evento(ctx, id, "observada", ahora, args.txHash);
    return id;
  },
});

// Cron ~5min: la address en cada red soportada.
export const escanearCrypto = internalAction({
  args: {},
  handler: async (ctx) => {
    const ports = resolvePorts();
    const address = process.env.EVM_ADDRESS;
    if (!ports.evm || !ports.fx || !address) return;
    let mep: number | null = null;
    let avisosRechazo = 0;
    // Aviso best-effort de "llegó algo que no cuenta": la dedupe vive en
    // avisarAdmin (mark después de send) y se acota a 5 por corrida.
    const avisarRechazo = async (tx: import("./_lib/ports").EvmTransfer) => {
      if (avisosRechazo >= 5) return;
      if (tx.usdCents < MIN_USD_CENTS || tx.usdCents > TECHO_AVISO_USD_CENTS) return;
      const clave = `rechazo:${tx.chain}:${tx.txHash}`;
      // El budget de la corrida solo lo consumen claves frescas: un spam ya
      // dedupeado no puede tapar el aviso de una transfer nueva.
      const ya = await ctx.runQuery(
        internal.contributionsInternal.avisoEnviado,
        { clave },
      );
      if (ya) return;
      avisosRechazo++;
      await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
        kind: "cripto_rechazada",
        detalle: `${tx.chain} · ${tx.asset} · USD ${(tx.usdCents / 100).toFixed(2)} · ${tx.txHash.slice(0, 12)}…`,
        clave,
      });
    };
    for (const chain of CHAINS_SOPORTADAS) {
      // Aislamiento por red: si un indexer/endpoint falla, las demás escanean igual.
      try {
        // Feed de acreditación: solo contratos soportados — el spam de tokens
        // no entra ni puede starvear depósitos reales del presupuesto de páginas.
        let cursor: string | undefined;
        let paginas = 0;
        do {
          const res = await ports.evm.inboundTransfers(address, chain, cursor, true);
          for (const tx of res.transfers) {
            if (!esTransferValida(tx, address)) {
              await avisarRechazo(tx);
              continue;
            }
            mep ??= await ports.fx.mepCentavosPorUsd();
            const id = await ctx.runMutation(
              internal.contributionsInternal.crearObservadaCrypto,
              {
                slug: "jujuy",
                chain: tx.chain,
                txHash: tx.txHash,
                usdCents: tx.usdCents,
                mepCentavosPorUsd: mep,
              },
            );
            if (id) {
              await ctx.runMutation(internal.contributionsInternal.acreditar, {
                id,
                aporteCentavos: centavosPorUsd(tx.usdCents, mep),
              });
            }
          }
          cursor = res.cursor;
        } while (cursor && ++paginas < 20);

        // Feed de aviso: todo lo demás que llegó a la wallet (tokens no
        // soportados). Sin presupuesto garantizado — es best-effort.
        cursor = undefined;
        paginas = 0;
        do {
          const res = await ports.evm.inboundTransfers(address, chain, cursor);
          for (const tx of res.transfers) {
            // Contrato soportado → el feed de acreditación ya la procesó.
            if (esContratoSoportado(chain, tx.contract)) continue;
            await avisarRechazo(tx);
          }
          cursor = res.cursor;
        } while (cursor && ++paginas < 5);
      } catch (e) {
        console.error(`scan ${chain} falló`, e);
      }
    }
  },
});

export const reembolsosEstancados = internalQuery({
  args: { antesDe: v.number() },
  handler: async (ctx, { antesDe }) => {
    const rows = await ctx.db
      .query("contribuciones")
      .withIndex("by_refund", (q) => q.eq("refundEstado", "pendiente").eq("via", "mp"))
      .collect();
    return rows.filter(
      (c) =>
        c.estado === "aprobada" &&
        (c.refundIntentos ?? 0) < 3 &&
        c.acreditadaAt !== undefined &&
        c.acreditadaAt < antesDe,
    );
  },
});

// Cron ~3h: un refund `pendiente` que perdió su action (crash) se reinicia;
// el que agotó reintentos se marca fallido — eso dispara el aviso al admin.
export const barrerReembolsos = internalAction({
  args: { ahora: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = args.ahora ?? Date.now();
    const estancados = await ctx.runQuery(
      internal.contributionsInternal.reembolsosEstancados,
      { antesDe: ahora - 6 * 3_600_000 },
    );
    for (const c of estancados) {
      await ctx.runMutation(internal.contributionsInternal.bumpIntentoReembolso, {
        id: c._id,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.contributionsInternal.ejecutarReembolso,
        { id: c._id },
      );
    }
    const agotados = await ctx.runQuery(
      internal.contributionsInternal.reembolsosAgotados,
      {},
    );
    for (const c of agotados) {
      await ctx.runMutation(internal.contributionsInternal.marcarReembolsoFallido, {
        id: c._id,
        error: "reintentos agotados",
      });
    }
  },
});

export const reembolsosAgotados = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("contribuciones")
      .withIndex("by_refund", (q) => q.eq("refundEstado", "pendiente").eq("via", "mp"))
      .collect();
    return rows.filter((c) => c.estado === "aprobada" && (c.refundIntentos ?? 0) >= 3);
  },
});

export const bumpIntentoReembolso = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) return;
    await ctx.db.patch(id, { refundIntentos: (c.refundIntentos ?? 0) + 1 });
  },
});

export const enviarNotificacion = internalAction({
  args: {
    contribucionId: v.id("contribuciones"),
    kind: v.union(
      v.literal("acreditacion"),
      v.literal("devolucion"),
      v.literal("meta_cumplida"),
    ),
  },
  handler: async (ctx, args) => {
    const ports = resolvePorts();
    if (!ports.mail) return;
    const c = await ctx.runQuery(internal.contributionsInternal.porId, {
      id: args.contribucionId,
    });
    if (!c?.email) return;
    const recompensa = await ctx.runQuery(internal.recompensas.paraMail, {
      campaniaId: c.campaniaId,
      email: c.email,
    });
    await ports.mail.send(args.kind, c.email, {
      montoCentavos: c.aporteCentavos ?? c.montoCentavos,
      ...(recompensa ? { recompensa } : {}),
    });
  },
});

export const porToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query("contribuciones")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
  },
});

export const avisoEnviado = internalQuery({
  args: { clave: v.string() },
  handler: async (ctx, { clave }) => {
    return !!(await ctx.db
      .query("avisosAdmin")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .first());
  },
});

// Dedupe de avisos push: devuelve true solo la primera vez para una clave.
export const registrarAviso = internalMutation({
  args: { clave: v.string() },
  handler: async (ctx, { clave }) => {
    const existe = await ctx.db
      .query("avisosAdmin")
      .withIndex("by_clave", (q) => q.eq("clave", clave))
      .first();
    if (existe) return false;
    await ctx.db.insert("avisosAdmin", { clave, at: Date.now() });
    return true;
  },
});

// Push al cel del admin (brrr). Arma el mensaje con estado fresco.
export const avisarAdmin = internalAction({
  args: {
    kind: v.union(
      v.literal("aporte"),
      v.literal("reembolso_fallido"),
      v.literal("cripto_rechazada"),
      v.literal("staff_bloqueado"),
      v.literal("apertura"),
    ),
    contribucionId: v.optional(v.id("contribuciones")),
    detalle: v.optional(v.string()),
    clave: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ports = resolvePorts();
    if (!ports.push) return;
    const base = process.env.SITE_URL ?? "https://sorbolabs.com";

    if (args.kind === "cripto_rechazada") {
      // Send-then-mark: un crash entre medio duplica un aviso, nunca lo pierde.
      if (
        args.clave &&
        (await ctx.runQuery(internal.contributionsInternal.avisoEnviado, {
          clave: args.clave,
        }))
      ) {
        return;
      }
      await ports.push.push({
        title: "SORBO · LLEGÓ ALGO QUE NO CUENTA",
        message: args.detalle ?? "transferencia inválida",
        threadId: "sorbo",
        sound: "bell_ringing",
        openUrl: `${base}/jujuy`,
      });
      if (args.clave) {
        await ctx.runMutation(internal.contributionsInternal.registrarAviso, {
          clave: args.clave,
        });
      }
      return;
    }

    if (args.kind === "staff_bloqueado" || args.kind === "apertura") {
      await ports.push.push({
        title: args.kind === "apertura" ? "SORBO · APERTURA FIJADA" : "SORBO · PIN BLOQUEADO",
        message: args.detalle ?? "",
        threadId: "sorbo",
        sound: args.kind === "apertura" ? "cha_ching" : "warm_soft_error",
        openUrl: `${base}/staff`,
        ...(args.kind === "staff_bloqueado" ? { interruptionLevel: "time-sensitive" as const } : {}),
      });
      return;
    }

    const c = args.contribucionId
      ? await ctx.runQuery(internal.contributionsInternal.porId, {
          id: args.contribucionId,
        })
      : null;
    if (!c) return;
    const campania = await ctx.runQuery(
      internal.contributionsInternal.campaniaDe,
      { contribucionId: c._id },
    );

    if (args.kind === "aporte") {
      const via = c.via === "mp" ? "Mercado Pago" : `cripto ${c.chain ?? ""}`.trim();
      await ports.push.push({
        title: "SORBO · APORTE",
        message: `${ars(c.aporteCentavos ?? 0)} por ${via} · ${ars(campania?.recaudadoNetoCentavos ?? 0)} de ${ars(campania?.metaCentavos ?? 0)}`,
        threadId: "sorbo",
        sound: "cha_ching",
        openUrl: `${base}/jujuy`,
      });
    } else {
      await ports.push.push({
        title: "SORBO · DEVOLUCIÓN FALLÓ",
        message: `${ars(c.aporteCentavos ?? 0)} no se pudo devolver — ${c.refundError ?? "acción manual"}`,
        threadId: "sorbo",
        sound: "warm_soft_error",
        openUrl: `${base}/jujuy`,
        interruptionLevel: "time-sensitive",
      });
    }
  },
});

// Una sola vez, desde el dashboard o `bunx convex run`: crea la campaña.
export const crearCampania = internalMutation({
  args: { slug: v.string(), metaCentavos: v.number() },
  handler: async (ctx, args) => {
    const existe = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existe) return;
    await ctx.db.insert("campaigns", {
      slug: args.slug,
      metaCentavos: args.metaCentavos,
      recaudadoNetoCentavos: 0,
      contribuyentes: 0,
    });
  },
});

// Desde `bunx convex run`: mueve la meta de una campaña abierta. Cumplida es
// latch — no se reabre; y una meta por debajo de lo recaudado la cumpliría
// sin pasar por el aviso, así que se rechaza.
export const fijarMeta = internalMutation({
  args: { slug: v.string(), metaCentavos: v.number() },
  handler: async (ctx, { slug, metaCentavos }) => {
    const campania = await campaniaPorSlug(ctx, slug);
    if (!campania) throw new Error("CAMPANIA_NO_EXISTE");
    if (campania.cumplidaAt !== undefined) throw new Error("CAMPANIA_CUMPLIDA");
    if (!Number.isInteger(metaCentavos) || metaCentavos <= campania.recaudadoNetoCentavos) {
      throw new Error("META_INVALIDA");
    }
    await ctx.db.patch(campania._id, { metaCentavos });
  },
});

export const porId = internalQuery({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const expirar = internalMutation({
  args: { id: v.id("contribuciones") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || c.estado !== "pendiente") return;
    await ctx.db.patch(args.id, { estado: "expirada" });
    await evento(ctx, args.id, "expirada", Date.now());
  },
});
