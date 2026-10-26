import { Link } from "@tanstack/react-router";
import { Pieza } from "./pieza";

export function NoExiste() {
  return (
    <Pieza lado="Salta · AR">
      <section className="flex flex-1 flex-col justify-center py-8">
        <h1 className="text-[clamp(2rem,9.5vw,8rem)] font-bold uppercase leading-[0.98]">
          No existe.
        </h1>
        <p className="mt-8 text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Esta página no está.
          <br />
          Si buscabas tus cafés, abrí el link del mail.
        </p>
        <div>
          <Link
            to="/"
            className="mt-10 inline-block bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
          >
            Volver a Sorbo
          </Link>
        </div>
      </section>
    </Pieza>
  );
}
