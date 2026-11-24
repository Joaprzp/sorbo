import { Link } from "@tanstack/react-router";
import { DataBlock, MAPS_URL } from "./data-block";
import { Pieza } from "./pieza";

export function Landing() {
  return (
    <Pieza
      lado="Salta · AR"
      abajo={<DataBlock />}
      doe={false}
    >
      <section className="flex flex-1 flex-col justify-center py-8">
        <h1 className="text-[clamp(2rem,9.5vw,8rem)] font-bold uppercase leading-[0.98]">
          Ya
          <br />
          abrimos
        </h1>
        <p className="mt-8 text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Café de especialidad.
          <br />
          Lunes a sábados, 07–22 h.
        </p>
      </section>

      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
        <a
          href={MAPS_URL}
          target="_blank"
          rel="noreferrer"
          className="bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
        >
          Cómo llegar
        </a>
        <Link
          to="/jujuy"
          className="text-xs font-semibold uppercase tracking-[0.17em] text-azul underline-offset-4 hover:underline"
        >
          El próximo es Jujuy →
        </Link>
      </div>
    </Pieza>
  );
}
