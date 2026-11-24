export const MAPS_URL = "https://maps.app.goo.gl/1G2C3LUB1BwF9pfP9";

const rows = [
  {
    label: "Dirección",
    value: "Dean Funes 244, Salta",
    href: MAPS_URL,
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
          <span>{row.label}</span>
          <span className="text-azul">
            <a href={row.href} target="_blank" rel="noreferrer">
              {row.value}
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
