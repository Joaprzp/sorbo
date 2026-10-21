import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { encodeQR } from "qr";
import { api } from "../../convex/_generated/api";
import { Pieza } from "./pieza";
import { ars } from "../lib/format";

const errores: Record<string, string> = {
  MONTO_MINIMO: "El mínimo es $5.000.",
  EMAIL_INVALIDO: "Ese email no parece válido.",
  RED_NO_SOPORTADA: "Esa red no está soportada.",
  RAIL_NO_DISPONIBLE: "Esa vía no está disponible ahora.",
  MP_FALLO: "No pudimos hablar con Mercado Pago. Probá de nuevo.",
  MP_NO_CONFIGURADO: "Mercado Pago no está disponible ahora.",
  CAMPANIA_NO_EXISTE: "La campaña no está disponible.",
};

function mensajeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  for (const [codigo, texto] of Object.entries(errores)) {
    if (msg.includes(codigo)) return texto;
  }
  return "No pudimos tomar el aporte. Probá de nuevo.";
}

function Progreso() {
  const p = useQuery(api.campaigns.progreso, { slug: "jujuy" });
  if (p === undefined) return null;
  if (p === null) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-nieve/70">
        La campaña todavía no está configurada.
      </p>
    );
  }
  return (
    <dl className="border-t border-nieve/40 font-mono text-[11px] uppercase tracking-[0.16em] text-nieve/70 sm:text-xs">
      <div className="flex items-baseline justify-between gap-6 py-3">
        <dt>Meta</dt>
        <dd className="text-nieve">{ars(p.metaCentavos)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-6 py-3">
        <dt>Recaudado</dt>
        <dd className="text-nieve">{ars(p.recaudadoNetoCentavos)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-6 py-3">
        <dt>Aportes</dt>
        <dd className="text-nieve">{p.contribuyentes}</dd>
      </div>
      {p.cumplida && (
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt>Estado</dt>
          <dd className="text-nieve">Meta cumplida</dd>
        </div>
      )}
    </dl>
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (website) return;
    const pesos = libre.trim() ? Number(libre.replace(/\D/g, "")) : monto / 100;
    setEnviando(true);
    setError(null);
    try {
      const r = await contribuir({
        slug: "jujuy",
        via: {
          rail: "mp",
          montoCentavos: pesos * 100,
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      if (r.intent.kind === "redirect") window.location.href = r.intent.url;
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset>
        <legend className="font-mono text-xs uppercase tracking-[0.16em] text-nieve/70">
          Aportá con Mercado Pago
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
                  ? "border-nieve bg-nieve text-azul"
                  : "border-nieve/40 text-nieve/80 hover:border-nieve"
              }`}
            >
              {ars(c)}
            </button>
          ))}
          <input
            inputMode="numeric"
            placeholder="Otro monto"
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
            className="w-36 border border-nieve/40 bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-nieve placeholder:text-nieve/40 focus:border-nieve focus:outline-none"
          />
        </div>
      </fieldset>

      <div className="max-w-md">
        <label
          htmlFor="email-aporte"
          className="block font-mono text-xs uppercase tracking-[0.16em] text-nieve/70"
        >
          Email (opcional)
        </label>
        <input
          id="email-aporte"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-0 border-b border-nieve/40 bg-transparent py-2 font-mono text-sm text-nieve placeholder:text-nieve/40 focus:border-nieve focus:outline-none"
        />
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-nieve/50">
          Te avisamos cuando acredita, si vuelve, y si se cumple la meta.
        </p>
      </div>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-5">
        <button
          type="submit"
          disabled={enviando}
          className="bg-nieve px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-azul hover:bg-bruma disabled:opacity-70"
        >
          Contribuir
        </button>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-nieve/50">
          Mínimo {ars(min)} · Efectivo suma al acreditarse
        </p>
      </div>
      {error && (
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-nieve">
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
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(crypto.address);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const avisar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await contribuir({
        slug: "jujuy",
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
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-nieve/70">
        O en cripto
      </p>
      <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-nieve/70">
        USDC o USDT · Base o Polygon · Mínimo {crypto.minUsdCents / 100}
        <br />
        No hay devolución en cripto.
      </p>
      <div className="flex flex-wrap items-start gap-8">
        <div
          className="w-32 shrink-0 bg-nieve p-2 [&_svg]:block [&_svg]:size-full [&_svg_path]:fill-azul"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={copiar}
            className="break-all text-left font-mono text-[11px] uppercase tracking-[0.14em] text-nieve underline-offset-4 hover:underline sm:text-xs"
          >
            {crypto.address}
          </button>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-nieve/50">
            {copiado ? "Copiado." : "Tocá para copiar."}
          </p>
        </div>
      </div>
      <form onSubmit={avisar} className="flex max-w-md flex-col gap-4">
        <label
          htmlFor="tx-hash"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-nieve/50"
        >
          ¿Ya mandaste? Pegá tu tx hash y lo seguimos
        </label>
        <input
          id="tx-hash"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x…"
          className="w-full border-0 border-b border-nieve/40 bg-transparent py-2 font-mono text-sm text-nieve placeholder:text-nieve/40 focus:border-nieve focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {crypto.chains.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChain(c)}
              className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${
                chain === c
                  ? "border-nieve bg-nieve text-azul"
                  : "border-nieve/40 text-nieve/80 hover:border-nieve"
              }`}
            >
              {c}
            </button>
          ))}
          <input
            type="email"
            placeholder="Email (opcional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-40 flex-1 border-0 border-b border-nieve/40 bg-transparent py-2 font-mono text-sm text-nieve placeholder:text-nieve/40 focus:border-nieve focus:outline-none"
          />
          <button
            type="submit"
            disabled={enviando}
            className="border border-nieve px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-nieve hover:bg-nieve hover:text-azul disabled:opacity-70"
          >
            Avisar
          </button>
        </div>
        {error && (
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-nieve">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

export function Jujuy() {
  const p = useQuery(api.campaigns.progreso, { slug: "jujuy" });
  return (
    <Pieza lado="Salta → Jujuy">
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
          lo devolvemos solo.
        </p>
      </section>

      <Progreso />

      <section className="mt-10 flex flex-col gap-12">
        {p?.rails.mp && (
          <FormMp
            sugeridos={p.sugeridosCentavos}
            min={p.minMpCentavos}
          />
        )}
        {p?.rails.crypto && <BloqueCrypto crypto={p.rails.crypto} />}
      </section>
    </Pieza>
  );
}
