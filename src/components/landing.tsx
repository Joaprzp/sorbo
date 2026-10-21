import { Link } from "@tanstack/react-router";
import { WaitlistForm } from "./waitlist-form";
import { DataBlock } from "./data-block";
import { Pieza } from "./pieza";

export function Landing() {
  return (
    <Pieza
      lado={
        <Link
          to="/jujuy"
          className="inline-block bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
        >
          Salta → Jujuy
        </Link>
      }
      abajo={<DataBlock />}
      doe={false}
    >
      <section className="flex flex-1 flex-col justify-center py-8">
        <h1 className="text-[clamp(2rem,9.5vw,8rem)] font-bold uppercase leading-[0.98]">
          Estamos
          <br />
          armando&nbsp;algo
        </h1>
        <p className="mt-8 text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Café de especialidad.
          <br />
          Próximamente.
        </p>
      </section>

      <WaitlistForm />
    </Pieza>
  );
}
