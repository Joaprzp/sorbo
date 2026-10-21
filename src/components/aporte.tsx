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

  if (s === undefined) {
    return (
      <div role="status" aria-label="Cargando el estado del aporte">
        <div aria-hidden="true">
          <div className="h-[clamp(2rem,8vw,6.5rem)] w-3/4 max-w-lg bg-azul/10" />
          <div className="mt-8 flex flex-col gap-3">
            <div className="h-3 w-1/2 max-w-md bg-azul/10" />
            <div className="h-3 w-2/5 max-w-md bg-azul/10" />
          </div>
        </div>
        <span className="sr-only">Cargando</span>
      </div>
    );
  }
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
            className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80"
          >
            Pegá tu tx hash
          </label>
          <input
            id="tx-aporte"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x…"
            className="w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
          />
          <button
            type="submit"
            className="mt-2 w-fit border border-azul px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul hover:bg-azul hover:text-nieve"
          >
            Verificar
          </button>
        </form>
      )}
      {s.estado === "pendiente" && s.via === "mp" && s.checkoutUrl && (
        <a
          href={s.checkoutUrl}
          className="mt-8 inline-block w-fit border border-azul px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-azul hover:bg-azul hover:text-nieve"
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
        <Link to="/jujuy" className="hover:text-azul">
          Jujuy · AR
        </Link>
      }
      doe={false}
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
