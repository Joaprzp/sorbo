const rows = [
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
    <dl className="border-t border-nieve/40">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-nieve/70 sm:text-xs"
        >
          <dt>{row.label}</dt>
          <dd>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="hover:text-nieve"
            >
              {row.value}
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
