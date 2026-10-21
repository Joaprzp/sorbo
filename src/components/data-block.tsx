import { Link } from "@tanstack/react-router";

const rows = [
  {
    value: "El próximo Sorbo",
    href: "/jujuy",
  },
  {
    label: "Dirección",
    value: "Dean Funes 244, Salta",
    href: "https://www.google.com/maps/search/?api=1&query=Dean+Funes+244+Salta",
  },
  {
    label: "Instagram",
    value: "@sorbolabs",
    href: "https://instagram.com/sorbolabs",
  },
  {
    label: "WhatsApp",
    value: "+54 9 387 553-5225",
    href: "https://wa.me/5493875535225",
  },
];

export function DataBlock() {
  return (
    <ul className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 font-mono text-[11px] uppercase tracking-[0.16em] text-azul/80 sm:text-xs">
      {rows.map((row) => (
        <li key={row.value} className="flex items-baseline gap-3">
          {"label" in row && <span>{row.label}</span>}
          <span className="text-azul">
            {row.href.startsWith("/") ? (
              <Link to={row.href}>{row.value}</Link>
            ) : (
              <a href={row.href} target="_blank" rel="noreferrer">
                {row.value}
              </a>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
