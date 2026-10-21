import { Doe } from "./doe";
import { WaitlistForm } from "./waitlist-form";
import { DataBlock } from "./data-block";

export function Landing() {
  return (
    <main className="flex min-h-dvh flex-col bg-azul px-[9vw] pb-[6vh] pt-[8vh] font-sans text-nieve">
      <header>
        <div className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-[0.24em] text-nieve/70 sm:text-sm">
          <span>Sorbo</span>
          <span>Salta · AR</span>
        </div>
        <hr className="mt-4 border-0 border-t border-nieve/40" />
      </header>

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

      <footer className="mt-8">
        <Doe className="-mb-px h-[clamp(90px,13vh,140px)] w-auto text-nieve" />
        <DataBlock />
      </footer>
    </main>
  );
}
