import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { Pieza } from "./pieza";
import { ars } from "../lib/format";

function Estado({ token }: { token: string }) {
  const s = useQuery(api.contributions.seguimiento, { token });
  const reconciliar = useAction(api.contributions.reconciliar);
  const [txHash, setTxHash] = useState("");
  const disparado = useRef(false);

  useEffect(() => {
    if (disparado.current) return;
    disparado.current = true;
    void reconciliar({ token });
  }, [reconciliar, token]);

  if (s === undefined) return null;
  if (s === null) {
    return (
      <p className="text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
        Ese aporte no existe.
      </p>
    );
  }

  const cuerpo =
    s.estado === "aprobada" ? (
      <>
        Tu aporte ya suma a la meta
        {s.aporteCentavos ? ` (${ars(s.aporteCentavos)})` : ""}.
      </>
    ) : s.estado === "pendiente" ? (
      <>
        Todavía no llegó.
        <br />
        Si pagaste en efectivo, acredita en unos días. Suma ahí.
      </>
    ) : s.estado === "expirada" ? (
      <>
        El pago no entró.
        <br />
        Podés volver a intentarlo desde la pieza.
      </>
    ) : (
      <>
        Tu aporte volvió a tu medio de pago.
      </>
    );

  const titulo =
    s.estado === "aprobada"
      ? "Acreditado."
      : s.estado === "pendiente"
        ? "Pendiente."
        : s.estado === "expirada"
          ? "No entró."
          : "Devuelto.";

  return (
    <>
      <h1 className="text-[clamp(2rem,8vw,6.5rem)] font-bold uppercase leading-[0.98]">
        {titulo}
      </h1>
      <p className="mt-8 max-w-2xl text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
        {cuerpo}
      </p>
      {s.estado === "pendiente" && s.via === "crypto" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (txHash.trim()) {
              await reconciliar({ token, txHash: txHash.trim() });
              setTxHash("");
            }
          }}
          className="mt-8 flex max-w-md flex-col gap-3"
        >
          <label
            htmlFor="tx-aporte"
            className="font-mono text-xs uppercase tracking-[0.16em] text-nieve/70"
          >
            Pegá tu tx hash
          </label>
          <input
            id="tx-aporte"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x…"
            className="w-full border-0 border-b border-nieve/40 bg-transparent py-2 font-mono text-sm text-nieve placeholder:text-nieve/40 focus:border-nieve focus:outline-none"
          />
          <button
            type="submit"
            className="mt-2 w-fit border border-nieve px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-nieve hover:bg-nieve hover:text-azul"
          >
            Verificar
          </button>
        </form>
      )}
      {s.estado === "pendiente" && s.via === "mp" && s.checkoutUrl && (
        <a
          href={s.checkoutUrl}
          className="mt-8 inline-block w-fit border border-nieve px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-nieve hover:bg-nieve hover:text-azul"
        >
          Retomar el pago
        </a>
      )}
    </>
  );
}

export function Aporte({ token }: { token: string }) {
  return (
    <Pieza
      lado={
        <Link to="/jujuy" className="hover:text-nieve">
          Jujuy · AR
        </Link>
      }
    >
      <section className="flex flex-1 flex-col justify-center py-10">
        {token ? (
          <Estado token={token} />
        ) : (
          <p className="text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
            Falta el token del aporte.
          </p>
        )}
      </section>
    </Pieza>
  );
}
