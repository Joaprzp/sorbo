import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { saldoDe } from "./recompensas";

// ADR-0008: el staff del local entra con un PIN por dispositivo y canjea cafés.

type Lector = { db: GenericDatabaseReader<DataModel> };
type Escritor = { db: GenericDatabaseWriter<DataModel> };

const MIN = 60 * 1000;
const SESION_MS = 90 * 24 * 60 * MIN;
const BLOQUEO_MS = 15 * MIN;
// La clave del dispositivo la manda el cliente: frena al que se equivoca,
// no a un atacante que la rota. Contra ese, el tope global más un PIN de 6+
// dígitos: 20 intentos cada 15 min son ~1.900 por día, un millón de PINs lleva
// más de un año. El costo: cualquiera puede trabar los ingresos nuevos por 15
// min; las sesiones abiertas (90 días) siguen andando.
const FALLIDOS_DISPOSITIVO = 5;
const FALLIDOS_GLOBAL = 20;
const PIN_MINIMO = 6;
const DESHACER_MS = 5 * MIN;

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenNuevo(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparación de largo fijo: el tiempo no revela cuántos dígitos acertaste.
function mismoPin(a: string, b: string): boolean {
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return dif === 0;
}

async function dispositivoDe(
  ctx: Lector,
  token: string | undefined,
  ahora: number,
): Promise<Doc<"dispositivos"> | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const d = await ctx.db
    .query("dispositivos")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!d || d.revocadoAt !== undefined || d.venceAt <= ahora) return null;
  return d;
}

async function intentos(ctx: Escritor, clave: string) {
  return await ctx.db
    .query("intentosPin")
    .withIndex("by_clave", (q) => q.eq("clave", clave))
    .unique();
}

// Ventana fija de 15 minutos por clave; al pasar el umbral, bloqueo.
async function registrarFallo(ctx: Escritor, clave: string, umbral: number, ahora: number) {
  const fila = await intentos(ctx, clave);
  const vigente = fila && ahora - fila.desde < BLOQUEO_MS;
  const fallidos = vigente ? fila.fallidos + 1 : 1;
  const bloqueadoHasta = fallidos >= umbral ? ahora + BLOQUEO_MS : fila?.bloqueadoHasta;
  if (fila) {
    await ctx.db.patch(fila._id, { fallidos, desde: vigente ? fila.desde : ahora, bloqueadoHasta });
  } else {
    await ctx.db.insert("intentosPin", { clave, fallidos, desde: ahora, bloqueadoHasta });
  }
  return fallidos === umbral;
}

// Un error de PIN se devuelve, no se lanza: si la mutación tirara, Convex
// revertiría el contador de fallidos y el bloqueo nunca llegaría.
export const ingresar = mutation({
  args: { pin: v.string(), nombre: v.string(), clave: v.string() },
  handler: async (ctx, { pin, nombre, clave }) => {
    const esperado = process.env.STAFF_PIN;
    if (!esperado || esperado.length < PIN_MINIMO) throw new Error("STAFF_NO_CONFIGURADO");
    const ahora = Date.now();
    const nombreLimpio = nombre.trim().slice(0, 40) || "Sin nombre";
    const claveDisp = `disp:${clave.slice(0, 64)}`;
    for (const k of [claveDisp, "global"]) {
      const f = await intentos(ctx, k);
      if (f?.bloqueadoHasta && f.bloqueadoHasta > ahora) return { error: "PIN_BLOQUEADO" as const };
    }
    if (!mismoPin(pin, esperado)) {
      const bloqueoDisp = await registrarFallo(ctx, claveDisp, FALLIDOS_DISPOSITIVO, ahora);
      const bloqueoGlobal = await registrarFallo(ctx, "global", FALLIDOS_GLOBAL, ahora);
      if (bloqueoDisp || bloqueoGlobal) {
        await ctx.scheduler.runAfter(0, internal.contributionsInternal.avisarAdmin, {
          kind: "staff_bloqueado",
          detalle: bloqueoGlobal
            ? `${FALLIDOS_GLOBAL} PIN incorrectos en 15 min · ingresos bloqueados`
            : `"${nombreLimpio}" bloqueado 15 min por PIN incorrecto`,
        });
      }
      return { error: "PIN_INCORRECTO" as const };
    }
    const f = await intentos(ctx, claveDisp);
    if (f) await ctx.db.delete(f._id);
    const token = tokenNuevo();
    await ctx.db.insert("dispositivos", {
      nombre: nombreLimpio,
      tokenHash: await sha256(token),
      creadoAt: ahora,
      venceAt: ahora + SESION_MS,
    });
    return { token };
  },
});

export const sesion = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const d = await dispositivoDe(ctx, token, Date.now());
    return d ? { nombre: d.nombre, venceAt: d.venceAt } : null;
  },
});

// Pública: el QR lo puede abrir cualquiera. Sin email ni montos; con sesión
// de staff suma el código y los canjes recientes para poder deshacer.
export const ver = query({
  args: { qrId: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { qrId, token }) => {
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_qrId", (q) => q.eq("qrId", qrId))
      .unique();
    if (!r) return null;
    const ahora = Date.now();
    const s = await saldoDe(ctx, r, ahora);
    const publico = { saldo: s.saldo, cafes: s.cafes, estado: s.estado, venceAt: s.venceAt };
    if (!(await dispositivoDe(ctx, token, ahora))) return { ...publico, staff: null };
    const canjes = await ctx.db
      .query("canjes")
      .withIndex("by_recompensa", (q) => q.eq("recompensaId", r._id))
      .order("desc")
      .take(10);
    return {
      ...publico,
      staff: {
        codigo: r.codigo,
        canjes: canjes.map((c) => ({
          id: c._id,
          cantidad: c.cantidad,
          at: c.at,
          deshecho: c.deshechoAt !== undefined,
          deshacible: c.deshechoAt === undefined && ahora - c.at < DESHACER_MS,
        })),
      },
    };
  },
});

export const buscarCodigo = query({
  args: { codigo: v.string(), token: v.string() },
  handler: async (ctx, { codigo, token }) => {
    if (!(await dispositivoDe(ctx, token, Date.now()))) throw new Error("SIN_SESION");
    const limpio = codigo.trim().toUpperCase().replace(/^JUJ-?/, "");
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_codigo", (q) => q.eq("codigo", `JUJ-${limpio}`))
      .unique();
    return r ? r.qrId : null;
  },
});

// Transacción de Convex: dos canjes simultáneos se serializan y el segundo
// ve el saldo ya descontado.
export const canjear = mutation({
  args: { qrId: v.string(), cantidad: v.number(), token: v.string() },
  handler: async (ctx, { qrId, cantidad, token }) => {
    const ahora = Date.now();
    const d = await dispositivoDe(ctx, token, ahora);
    if (!d) throw new Error("SIN_SESION");
    const r = await ctx.db
      .query("recompensas")
      .withIndex("by_qrId", (q) => q.eq("qrId", qrId))
      .unique();
    if (!r) throw new Error("NO_EXISTE");
    const s = await saldoDe(ctx, r, ahora);
    if (s.estado !== "activo") throw new Error("NO_ACTIVO");
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > s.saldo) {
      throw new Error("CANTIDAD_INVALIDA");
    }
    await ctx.db.insert("canjes", { recompensaId: r._id, cantidad, dispositivoId: d._id, at: ahora });
    return { saldo: s.saldo - cantidad };
  },
});

export const deshacer = mutation({
  args: { canjeId: v.id("canjes"), token: v.string() },
  handler: async (ctx, { canjeId, token }) => {
    const ahora = Date.now();
    if (!(await dispositivoDe(ctx, token, ahora))) throw new Error("SIN_SESION");
    const c = await ctx.db.get(canjeId);
    if (!c || c.deshechoAt !== undefined || ahora - c.at >= DESHACER_MS) {
      throw new Error("NO_DESHACIBLE");
    }
    await ctx.db.patch(canjeId, { deshechoAt: ahora });
  },
});

// Desde `bunx convex run`: corta un dispositivo perdido sin cambiar el PIN.
export const revocarDispositivo = internalMutation({
  args: { nombre: v.string() },
  handler: async (ctx, { nombre }) => {
    const todos = await ctx.db.query("dispositivos").collect();
    const activos = todos.filter((d) => d.nombre === nombre && d.revocadoAt === undefined);
    for (const d of activos) await ctx.db.patch(d._id, { revocadoAt: Date.now() });
    return activos.length;
  },
});

export const resumenRecompensas = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const campania = await ctx.db
      .query("campaigns")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!campania) return null;
    const recompensas = await ctx.db
      .query("recompensas")
      .withIndex("by_campania_email", (q) => q.eq("campaniaId", campania._id))
      .collect();
    const ahora = Date.now();
    let emitidos = 0;
    let canjeados = 0;
    for (const r of recompensas) {
      const s = await saldoDe(ctx, r, ahora);
      emitidos += s.cafes;
      canjeados += s.canjeados;
    }
    return { personas: recompensas.length, emitidos, canjeados, pendientes: emitidos - canjeados };
  },
});
