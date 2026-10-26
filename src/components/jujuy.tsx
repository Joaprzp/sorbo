import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useNavigate } from "@tanstack/react-router";
import { encodeQR } from "qr";
import { api } from "../../convex/_generated/api";
import { Pieza } from "./pieza";
import { ars, cafes } from "../lib/format";
import {
  CAFE_EXTRA_CENTAVOS,
  MESES_DE_CANJE,
  PRIMER_CAFE_CENTAVOS,
  TOPE_CAFES,
  cafesPorTotal,
} from "../../convex/_lib/recompensa";

const errores: Record<string, string> = {
  MONTO_MINIMO: "El mínimo es $5.000.",
  EMAIL_INVALIDO: "Ese email no parece válido.",
  RED_NO_SOPORTADA: "Esa red no está soportada.",
  RAIL_NO_DISPONIBLE: "Esa vía no está disponible ahora.",
  MP_FALLO: "No pudimos hablar con Mercado Pago. Probá de nuevo.",
  MP_NO_CONFIGURADO: "Mercado Pago no está disponible ahora.",
  CAMPANIA_NO_EXISTE: "La campaña no está disponible.",
  DEMASIADO_TRAFICO: "Hay mucho tráfico. Probá en un minuto.",
};

function mensajeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  for (const [codigo, texto] of Object.entries(errores)) {
    if (msg.includes(codigo)) return texto;
  }
  return "No pudimos tomar el aporte. Probá de nuevo.";
}

type ProgresoData = NonNullable<
  FunctionReturnType<typeof api.campaigns.progreso>
>;

function Progreso({ p }: { p: ProgresoData | null }) {
  if (p === null) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80">
        La campaña todavía no está configurada.
      </p>
    );
  }
  const pct =
    p.metaCentavos > 0
      ? Math.round(
          Math.min(100, (p.recaudadoNetoCentavos / p.metaCentavos) * 100),
        )
      : 0;
  return (
    <>
      <dl className="border-t border-azul/40 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt>Meta</dt>
          <dd className="text-azul">{ars(p.metaCentavos)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt>Aportes</dt>
          <dd className="text-azul">{p.contribuyentes}</dd>
        </div>
        {p.cumplida && (
          <div className="flex items-baseline justify-between gap-6 py-3">
            <dt>Estado</dt>
            <dd className="text-azul">Meta cumplida</dd>
          </div>
        )}
      </dl>
      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-6 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
          <span id="label-recaudado">Recaudado</span>
          <span className="text-azul">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-labelledby="label-recaudado"
          aria-valuenow={Math.min(p.recaudadoNetoCentavos, p.metaCentavos)}
          aria-valuemin={0}
          aria-valuemax={p.metaCentavos}
          aria-valuetext={`${pct}% — ${ars(p.recaudadoNetoCentavos)} de ${ars(p.metaCentavos)}`}
          className="h-9 overflow-hidden border border-azul/40"
        >
          <div
            className="flex h-full items-center bg-azul"
            style={{ width: `${pct}%`, minWidth: "max-content" }}
          >
            <span className="px-3 font-mono text-[11px] tracking-[0.12em] text-nieve">
              {ars(p.recaudadoNetoCentavos)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Fantasma({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block bg-azul/10 ${className}`} />;
}

function EsqueletoProgreso() {
  return (
    <div role="status">
      <div className="border-t border-azul/40 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
        <div className="flex items-baseline justify-between gap-6 py-3">
          <span>Meta</span>
          <Fantasma className="h-3 w-24" />
        </div>
        <div className="flex items-baseline justify-between gap-6 py-3">
          <span>Aportes</span>
          <Fantasma className="h-3 w-10" />
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-6 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
          <span>Recaudado</span>
          <Fantasma className="h-3 w-8" />
        </div>
        <div className="h-9 border border-azul/40" />
      </div>
      <span className="sr-only">Cargando</span>
    </div>
  );
}

function CampoTrampa({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="hidden"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FormMp({ sugeridos, min }: { sugeridos: number[]; min: number }) {
  const contribuir = useAction(api.contributions.contribuir);
  const [monto, setMonto] = useState<number>(sugeridos[0] ?? min);
  const [libre, setLibre] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const crudo = libre.replace(/[^\d,]/g, "").replace(",", ".");
  const pesos = libre.trim() ? Number(crudo) : monto / 100;
  const centavos = Math.round(pesos * 100);
  const cafesDelMonto = Number.isFinite(pesos) ? cafesPorTotal(centavos) : 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (website) return;
    if (!Number.isFinite(pesos) || centavos < min) {
      setError(`El mínimo es ${ars(min)}.`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await contribuir({
        slug: "jujuy",
        website,
        via: {
          rail: "mp",
          montoCentavos: centavos,
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      if (r.intent.kind === "redirect") window.location.assign(r.intent.url);
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset>
        <legend className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80">
          Mercado Pago
        </legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {sugeridos.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setMonto(c);
                setLibre("");
              }}
              className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] ${
                !libre && monto === c
                  ? "border-azul bg-azul text-nieve"
                  : "border-azul/40 text-azul/80 hover:border-azul"
              }`}
            >
              {ars(c)}
            </button>
          ))}
          <input
            inputMode="decimal"
            aria-label="Otro monto"
            placeholder="Otro monto"
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
            className="w-36 border border-azul/40 bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
          />
        </div>
        {cafesDelMonto > 0 && (
          <p aria-live="polite" className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-azul">
            {email.trim()
              ? `${ars(centavos)} · ${cafes(cafesDelMonto)}`
              : `Dejá tu email para recibir ${cafes(cafesDelMonto)}`}
          </p>
        )}
      </fieldset>

      <div className="max-w-md">
        <label
          htmlFor="email-aporte"
          className="block font-mono text-xs uppercase tracking-[0.16em] text-azul/80"
        >
          Email · con email, tu aporte vuelve en café
        </label>
        <input
          id="email-aporte"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
        />
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul/70">
          Te mandamos tu código, te avisamos si vuelve y si se cumple la meta.
          Nada de spam.
        </p>
      </div>

      <CampoTrampa value={website} onChange={setWebsite} />

      <div className="flex flex-wrap items-center gap-5">
        <button
          type="submit"
          disabled={enviando}
          className="bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche disabled:opacity-70"
        >
          Contribuir
        </button>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-azul/70">
          Mínimo {ars(min)} · Efectivo suma al acreditarse
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="font-mono text-xs uppercase tracking-[0.14em] text-azul"
        >
          {error}
        </p>
      )}
    </form>
  );
}

function BloqueCrypto({
  crypto,
}: {
  crypto: { address: string; chains: string[]; minUsdCents: number };
}) {
  const contribuir = useAction(api.contributions.contribuir);
  const navigate = useNavigate();
  const [copiado, setCopiado] = useState(false);
  const [chain, setChain] = useState(crypto.chains[0] ?? "base");
  const [txHash, setTxHash] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [display, setDisplay] = useState(crypto.address);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) window.clearInterval(animRef.current);
    };
  }, []);

  // Scramble tipo decrypt: corre una vez; hasta que termina no rearma.
  const scramble = () => {
    if (animRef.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = "0123456789abcdef";
    const frames = 24;
    let frame = 0;
    animRef.current = window.setInterval(() => {
      frame++;
      const revelados = Math.floor((frame / frames) * crypto.address.length);
      setDisplay(
        crypto.address
          .split("")
          .map((ch, i) =>
            i < 2 || i < revelados ? ch : chars[Math.floor(Math.random() * chars.length)],
          )
          .join(""),
      );
      if (frame >= frames) {
        if (animRef.current !== null) window.clearInterval(animRef.current);
        animRef.current = null;
        setDisplay(crypto.address);
      }
    }, 40);
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(crypto.address);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
    scramble();
  };

  const avisar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (website) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await contribuir({
        slug: "jujuy",
        website,
        via: {
          rail: "crypto",
          chainId: chain,
          ...(txHash.trim() ? { txHash: txHash.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      await navigate({ to: "/jujuy/aporte", search: { t: r.token } });
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  };

  const qr = encodeQR(crypto.address, "svg", { ecc: "quartile", border: 2 });

  return (
    <section className="flex flex-col gap-5">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80">
        Cripto
      </p>
      <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-azul/80">
        USDC o USDT · {crypto.chains.join(" · ")} · Mínimo{" "}
        {crypto.minUsdCents / 100} USD
      </p>
      <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-alerta">
        No hay devolución en cripto.
      </p>
      <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-azul/80">
        Cafés: dejá tu email y tocá Avisar antes de mandar · Se cuenta en pesos al MEP del día.
      </p>
      <div className="flex flex-wrap items-start gap-8">
        <div
          className="w-32 shrink-0 border border-azul/40 bg-nieve p-2 [&_svg]:block [&_svg]:size-full [&_svg_path]:fill-azul"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={copiar}
            className="break-all text-left font-mono text-[11px] uppercase tracking-[0.14em] text-azul underline-offset-4 hover:underline sm:text-xs"
          >
            {display}
          </button>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-azul/70">
            {copiado ? "Copiado." : "Tocá para copiar."}
          </p>
        </div>
      </div>
      <form onSubmit={avisar} className="flex max-w-md flex-col gap-4">
        <CampoTrampa value={website} onChange={setWebsite} />
        <div
          role="group"
          aria-label="Red"
          className="flex flex-wrap items-center gap-2"
        >
          {crypto.chains.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChain(c)}
              className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${
                chain === c
                  ? "border-azul bg-azul text-nieve"
                  : "border-azul/40 text-azul/80 hover:border-azul"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <label
          htmlFor="tx-hash"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-azul/80"
        >
          ¿Ya mandaste? Tx hash (opcional)
        </label>
        <input
          id="tx-hash"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x…"
          className="w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
        />
        <p className="-mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul/60">
          Si no lo pegás, lo encontramos igual.
        </p>
        <input
          type="email"
          autoComplete="email"
          aria-label="Email (opcional)"
          placeholder="Email (opcional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
        />
        <div>
          <button
            type="submit"
            disabled={enviando}
            className="border border-azul px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul hover:bg-azul hover:text-nieve disabled:opacity-70"
          >
            Avisar
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="font-mono text-xs uppercase tracking-[0.14em] text-azul"
          >
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

// ADR-0008: lo primero que se ve antes de aportar. Segundo y último tamaño de
// titular de la pieza.
function Recompensa() {
  const fila =
    "flex items-baseline justify-between gap-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs";
  return (
    <section className="mt-16">
      <h2 className="text-[clamp(1.75rem,5vw,3.5rem)] font-bold uppercase leading-[0.98]">
        Tu aporte
        <br />
        vuelve en café.
      </h2>
      <dl className="mt-8 border-t border-azul/40">
        <div className={fila}>
          <dt>{ars(PRIMER_CAFE_CENTAVOS)}</dt>
          <dd className="text-azul">1 café</dd>
        </div>
        <div className={fila}>
          <dt>Cada {ars(CAFE_EXTRA_CENTAVOS)} más</dt>
          <dd className="text-azul">+1 café</dd>
        </div>
        <div className={fila}>
          <dt>Tope</dt>
          <dd className="text-azul">{cafes(TOPE_CAFES)}</dd>
        </div>
      </dl>
      <p className="mt-4 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-azul/70">
        Todos los cafés de la carta · {MESES_DE_CANJE} meses desde la apertura · Con email.
      </p>
    </section>
  );
}

function EsqueletoForm() {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      <Fantasma className="h-9 w-24" />
      <Fantasma className="h-9 w-24" />
      <Fantasma className="h-9 w-24" />
      <Fantasma className="h-9 w-36" />
    </div>
  );
}

export function Jujuy() {
  const p = useQuery(api.campaigns.progreso, { slug: "jujuy" });
  return (
    <Pieza lado="Salta → Jujuy" doe={false}>
      <section className="py-10">
        <h1 className="text-[clamp(2rem,8vw,6.5rem)] font-bold uppercase leading-[0.98]">
          El próximo
          <br />
          Sorbo es en Jujuy.
        </h1>
        <p className="mt-8 max-w-2xl text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Café de especialidad en Jujuy.
          <br />
          Si tu aporte cumple 89 días y la meta no se cumplió,
          <br />
          vuelve solo.
        </p>
        <Link
          to="/jujuy/numeros"
          className="mt-8 inline-block bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
        >
          En qué se usa la meta →
        </Link>
      </section>

      {p === undefined ? <EsqueletoProgreso /> : <Progreso p={p} />}

      <Recompensa />

      {/* Banda Bruma: cómo aportás, separado de qué recibís. */}
      <section className="mt-12 bg-bruma px-6 py-10 sm:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80">Contribuir</p>
        <div className="mt-6">
          {p === undefined ? (
            <EsqueletoForm />
          ) : (
            <>
              {p?.rails.mp && (
                <FormMp
                  sugeridos={p.sugeridosCentavos}
                  min={p.minMpCentavos}
                />
              )}
              {p?.rails.mp && p?.rails.crypto && (
                <hr className="my-12 border-0 border-t border-azul/40" />
              )}
              {p?.rails.crypto && <BloqueCrypto crypto={p.rails.crypto} />}
            </>
          )}
        </div>
      </section>
    </Pieza>
  );
}
