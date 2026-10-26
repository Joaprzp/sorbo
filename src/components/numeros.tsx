import { Link } from "@tanstack/react-router";
import { Pieza } from "./pieza";
import { ars } from "../lib/format";
import {
  META_PESOS,
  RUBROS,
  SUPUESTOS,
  totalRubro,
  type Rubro,
} from "../lib/presupuesto";

const pesos = (n: number) => ars(n * 100);

const MEP = 1540;
const COBRO = RUBROS.find((r) => r.codigo === "09")!;

// Foto a sangre + banda: la imagen no lleva texto; el texto vive en la banda.
function Foto({
  src,
  alt,
  pie,
}: {
  src: string;
  alt: string;
  pie: string;
}) {
  return (
    <figure className="-mx-[9vw] my-16">
      <img
        src={src}
        alt={alt}
        width={1920}
        height={1072}
        loading="lazy"
        className="block aspect-[16/9] w-full bg-bruma object-cover"
      />
      <figcaption className="flex items-baseline justify-between gap-6 bg-azul px-[9vw] py-5 font-mono text-[11px] uppercase tracking-[0.16em] text-nieve/70 sm:text-xs">
        <span>{pie}</span>
        <span>Imagen conceptual</span>
      </figcaption>
    </figure>
  );
}

function BloqueRubro({ r }: { r: Rubro }) {
  return (
    <section className="grid gap-6 border-t border-azul/40 py-10 sm:grid-cols-[1fr_1.4fr] sm:gap-12">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/70">
          {r.codigo}
        </p>
        <h2 className="mt-3 text-2xl font-bold uppercase leading-[0.98] sm:text-3xl">
          {r.titulo}
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-azul/70">
          {r.nota}
        </p>
      </div>
      <dl className="font-mono text-[11px] uppercase tracking-[0.16em] sm:text-xs">
        {r.items.map((i) => (
          <div
            key={i.concepto}
            className="flex items-baseline justify-between gap-6 border-b border-azul/15 py-3 text-azul/70"
          >
            <dt>{i.concepto}</dt>
            <dd className="shrink-0 text-azul">{pesos(i.pesos)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-6 py-3 font-medium text-azul">
          <dt>Subtotal</dt>
          <dd className="shrink-0">{pesos(totalRubro(r))}</dd>
        </div>
      </dl>
    </section>
  );
}

const rubro = (codigo: string) => RUBROS.find((r) => r.codigo === codigo)!;

export function Numeros() {
  const neto = META_PESOS - totalRubro(COBRO);
  return (
    <Pieza
      lado={
        <Link to="/jujuy" className="hover:text-azul">
          Jujuy · AR
        </Link>
      }
      doe={false}
    >
      <section className="py-10">
        <h1 className="text-[clamp(2rem,8vw,6.5rem)] font-bold uppercase leading-[0.98]">
          Qué cuesta
          <br />
          abrir en Jujuy.
        </h1>
        <p className="mt-8 max-w-2xl text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Nueve rubros. Precios de octubre 2026.
          <br />
          Cada peso de la meta, a la vista.
        </p>
      </section>

      <Foto
        src="/jujuy/fachada.webp"
        alt="Concepto de la fachada: un volumen de tierra sobre fondo blanco, ventanal con persiana encendida y puerta de vidrio."
        pie="Sorbo · Jujuy"
      />

      <dl className="border-t border-azul/40 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt>Meta</dt>
          <dd className="text-azul">{pesos(META_PESOS)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 py-3">
          <dt>En dólares</dt>
          <dd className="text-azul">
            ~USD {Math.round(META_PESOS / MEP).toLocaleString("es-AR")}
          </dd>
        </div>
      </dl>

      <Foto
        src="/jujuy/planta.webp"
        alt="Planta conceptual sin techo: salón con mesas de madera junto al ventanal, mostrador de acero y barra de trabajo a la derecha, baño cerrado al fondo."
        pie="Planta · ~58 m²"
      />

      <div>
        {RUBROS.slice(0, 2).map((r) => (
          <BloqueRubro key={r.codigo} r={r} />
        ))}
      </div>

      <Foto
        src="/jujuy/bano.webp"
        alt="Concepto del baño: antebaño con lavatorio y espejo redondo sobre muro de tierra, puerta al inodoro."
        pie="Baño unisex · antebaño e inodoro"
      />

      <div>
        <BloqueRubro r={rubro("03")} />
      </div>

      <Foto
        src="/jujuy/salon.webp"
        alt="Concepto del salón: muro de tierra, mesas de madera con sillas tapizadas y la puerta del baño al fondo, con la luz rayada del ventanal sobre el piso."
        pie={`${rubro("03").titulo} · ${pesos(totalRubro(rubro("03")))}`}
      />

      <div>
        <BloqueRubro r={rubro("04")} />
      </div>

      <Foto
        src="/jujuy/barra.webp"
        alt="Concepto de la barra: isla de acero y, detrás, la barra de trabajo con hornito, bacha, máquina y molino contra el muro del fondo. Sin banquetas."
        pie={`${rubro("04").titulo} · ${pesos(totalRubro(rubro("04")))}`}
      />

      <div>
        {RUBROS.slice(4).map((r) => (
          <BloqueRubro key={r.codigo} r={r} />
        ))}
      </div>

      <section className="border-t border-azul/40 py-10">
        <dl className="font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
          <div className="flex items-baseline justify-between gap-6 py-3">
            <dt>Para abrir y operar</dt>
            <dd className="text-azul">{pesos(neto)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 py-3">
            <dt>Costo del cobro</dt>
            <dd className="text-azul">{pesos(totalRubro(COBRO))}</dd>
          </div>
        </dl>
        <p className="mt-6 text-[clamp(2rem,6vw,4.5rem)] font-bold uppercase leading-[0.98]">
          {pesos(META_PESOS)}
        </p>
        <p className="mt-6 max-w-2xl text-xs uppercase leading-loose tracking-[0.17em] sm:text-base">
          Si tu aporte cumple 89 días y la meta no se cumplió,
          <br />
          vuelve solo.
        </p>
        <Link
          to="/jujuy"
          className="mt-10 inline-block bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche"
        >
          Contribuir
        </Link>
      </section>

      <footer className="mt-8 border-t border-azul/40 pt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-azul/70">
          Supuestos
        </p>
        <dl className="mt-3 grid gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/70 sm:grid-cols-2 sm:text-xs">
          {SUPUESTOS.map((s) => (
            <div key={s.label} className="flex items-baseline justify-between gap-6">
              <dt>{s.label}</dt>
              <dd className="text-azul">{s.valor}</dd>
            </div>
          ))}
        </dl>
      </footer>
    </Pieza>
  );
}
