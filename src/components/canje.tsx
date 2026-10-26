import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Pieza } from "./pieza";
import { tokenStaff, useAhora } from "../lib/staffSesion";
import { cafes as cafesN, fechaAR } from "../lib/format";
import { DESHACER_MS, estadoRecompensa, type EstadoRecompensa } from "../../convex/_lib/recompensa";

const cafes = (n: number) => (n === 0 ? "Sin cafés" : cafesN(n));

function bajada(estado: EstadoRecompensa, venceAt?: number): string {
  switch (estado) {
    case "reservado":
      return "Se confirman si se cumple la meta.";
    case "confirmado":
      return "Meta cumplida. Se canjean desde la apertura.";
    case "activo":
      return `Canjealos en Sorbo Jujuy hasta el ${fechaAR(venceAt!)}.`;
    case "vencido":
      return `Vencieron el ${fechaAR(venceAt!)}.`;
    default:
      return "El aporte se devolvió. No quedan cafés.";
  }
}

const fila =
  "flex items-baseline justify-between gap-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs";

function Mostrador({
  qrId,
  saldo,
  canjes,
  token,
}: {
  qrId: string;
  saldo: number;
  canjes: { id: Id<"canjes">; cantidad: number; at: number; deshecho: boolean }[];
  token: string;
}) {
  const ahora = useAhora(5_000);
  const canjear = useMutation(api.staff.canjear);
  const deshacer = useMutation(api.staff.deshacer);
  const [cantidad, setCantidad] = useState(1);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async () => {
    setError(null);
    try {
      await canjear({ qrId, cantidad, token });
      setCantidad(1);
    } catch {
      setError("No se pudo canjear. Revisá el saldo.");
    }
    setConfirmar(false);
  };

  return (
    <section className="mt-10 bg-bruma px-6 py-8">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80">Canjear</p>
      {saldo > 0 ? (
        <>
          <div role="group" aria-label="Cantidad" className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: saldo }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setCantidad(n);
                  setConfirmar(false);
                }}
                className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] ${
                  cantidad === n ? "border-azul bg-azul text-nieve" : "border-azul/40 text-azul/80 hover:border-azul"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={confirmar ? ejecutar : () => setConfirmar(true)}
            className="mt-6 bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
          >
            {confirmar ? `Confirmar ${cafes(cantidad)}` : `Canjear ${cafes(cantidad)}`}
          </button>
        </>
      ) : (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-azul/70">Sin saldo.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-alerta">
          {error}
        </p>
      )}
      {canjes.length > 0 && (
        <ul className="mt-8 border-t border-azul/40">
          {canjes.map((c) => (
            <li key={c.id} className={fila}>
              <span className={c.deshecho ? "line-through" : ""}>
                {cafes(c.cantidad)} · {new Date(c.at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
              </span>
              {!c.deshecho && ahora - c.at < DESHACER_MS && (
                <button
                  type="button"
                  onClick={() => void deshacer({ canjeId: c.id, token })}
                  className="text-azul underline-offset-4 hover:underline"
                >
                  Deshacer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Canje({ qrId }: { qrId: string }) {
  const token = tokenStaff();
  const r = useQuery(api.staff.ver, { qrId, token });
  const ahora = useAhora();
  const estado = r ? estadoRecompensa({ cafes: r.cafes, cumplida: r.cumplida, aperturaAt: r.aperturaAt, ahora }) : null;
  return (
    <Pieza
      lado={
        <Link to="/jujuy" className="hover:text-azul">
          Salta → Jujuy
        </Link>
      }
      doe={false}
    >
      <section className="py-10">
        {r === undefined ? (
          <div role="status" className="h-[clamp(2rem,8vw,6.5rem)] w-2/3 max-w-lg bg-azul/10">
            <span className="sr-only">Cargando</span>
          </div>
        ) : r === null ? (
          <p className="text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
            Ese código no existe.
          </p>
        ) : (
          <>
            <h1 className="text-[clamp(2rem,8vw,6.5rem)] font-bold uppercase leading-[0.98]">
              {cafes(r.saldo)}.
            </h1>
            <p className="mt-8 max-w-2xl text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
              {bajada(estado!, r.venceAt)}
            </p>
            <dl className="mt-10 border-t border-azul/40">
              <div className={fila}>
                <dt>Recompensa</dt>
                <dd className="text-azul">{cafes(r.cafes)}</dd>
              </div>
              {r.staff && (
                <div className={fila}>
                  <dt>Código</dt>
                  <dd className="text-azul">{r.staff.codigo}</dd>
                </div>
              )}
            </dl>
            {r.staff && token && estado === "activo" && (
              <Mostrador qrId={qrId} saldo={r.saldo} canjes={r.staff.canjes} token={token} />
            )}
          </>
        )}
      </section>
    </Pieza>
  );
}
