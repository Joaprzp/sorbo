import type { ReactNode } from "react";
import { Doe } from "./doe";

export function Pieza({
  lado,
  children,
  abajo,
}: {
  lado: ReactNode;
  children: ReactNode;
  abajo?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-azul px-[9vw] pb-[6vh] pt-[8vh] font-sans text-nieve">
      <header>
        <div className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-[0.24em] text-nieve/70 sm:text-sm">
          <span>Sorbo</span>
          <span>{lado}</span>
        </div>
        <hr className="mt-4 border-0 border-t border-nieve/40" />
      </header>
      {children}
      <footer className="mt-8">
        <Doe className="-mb-px h-[clamp(90px,13vh,140px)] w-auto text-nieve" />
        {abajo}
      </footer>
    </main>
  );
}
