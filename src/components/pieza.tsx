import type { ReactNode } from "react";
import { Doe } from "./doe";

export function Pieza({
  lado,
  children,
  abajo,
  doe = true,
}: {
  lado: ReactNode;
  children: ReactNode;
  abajo?: ReactNode;
  doe?: boolean;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-nieve px-[9vw] pb-[6vh] pt-[8vh] font-sans text-azul">
      <header>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-azul/80 sm:text-sm">
          <span>Sorbo</span>
          <span>{lado}</span>
        </div>
        <hr className="mt-4 border-0 border-t border-azul/40" />
      </header>
      {children}
      {doe || abajo ? (
        <footer className="mt-8">
          {doe ? (
            <div className="border-b border-azul/40">
              <Doe className="-mb-px h-[clamp(90px,13vh,140px)] w-auto text-azul" />
            </div>
          ) : null}
          {abajo}
        </footer>
      ) : null}
    </main>
  );
}
