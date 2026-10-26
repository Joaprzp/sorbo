// Presupuesto público de la campaña de Jujuy — la fuente de /jujuy/numeros.
// Montos en pesos, a precios de octubre 2026. La suma de los rubros es la
// meta bruta: si cambia un ítem, cambia la meta (y hay que fijarla en Convex
// con `contributionsInternal:fijarMeta`).

type Item = { concepto: string; pesos: number };
export type Rubro = {
  codigo: string;
  titulo: string;
  nota: string;
  items: Item[];
};

export const META_PESOS = 75_000_000;
export const MEP_PESOS = 1_540; // dólar MEP de referencia, octubre 2026

export const SUPUESTOS = [
  { label: "Local", valor: "Café con salón · ~58 m²" },
  { label: "Alquiler", valor: "$1.500.000 / mes" },
  { label: "Equipo", valor: "Tres personas · CCT 389/04" },
  { label: "Dólar MEP", valor: `$${MEP_PESOS.toLocaleString("es-AR")} · Octubre 2026` },
];

export const RUBROS: Rubro[] = [
  {
    codigo: "01",
    titulo: "Entrada al local",
    nota: "El local se elige cuando se cumple la meta. Antes, no se firma nada.",
    items: [
      { concepto: "Depósito · un mes", pesos: 1_500_000 },
      { concepto: "Comisión inmobiliaria", pesos: 1_500_000 },
      { concepto: "Seguro de caución", pesos: 600_000 },
    ],
  },
  {
    codigo: "02",
    titulo: "Obra mínima",
    nota: "Barra de acero, muros de tierra. Agua y luz donde hacen falta.",
    items: [
      { concepto: "Barra a medida", pesos: 3_000_000 },
      { concepto: "Electricidad y agua de barra", pesos: 2_500_000 },
      { concepto: "Revoque de tierra y terminaciones", pesos: 1_500_000 },
      { concepto: "Baño", pesos: 1_200_000 },
      { concepto: "Iluminación", pesos: 800_000 },
      { concepto: "Puerta de entrada", pesos: 500_000 },
    ],
  },
  {
    codigo: "03",
    titulo: "Salón",
    nota: "Veinte lugares sentados. La barra es para trabajar, no para sentarse.",
    items: [
      { concepto: "Mesas de madera · 8", pesos: 1_500_000 },
      { concepto: "Sillas tapizadas · 20", pesos: 1_800_000 },
    ],
  },
  {
    codigo: "04",
    titulo: "Equipamiento",
    nota: "Máquina y molino nuevos, de fabricación nacional. Sobran para el volumen.",
    items: [
      { concepto: "Máquina de espresso y molino", pesos: 9_000_000 },
      { concepto: "Molino de filtrado y métodos", pesos: 1_200_000 },
      { concepto: "Filtro de agua", pesos: 500_000 },
      { concepto: "Heladera bajo mostrador", pesos: 1_600_000 },
      { concepto: "Exhibidora refrigerada", pesos: 2_000_000 },
      { concepto: "Freezer", pesos: 700_000 },
      { concepto: "Horno", pesos: 1_200_000 },
      { concepto: "Bacha y mesada", pesos: 600_000 },
      { concepto: "Vajilla y utensilios", pesos: 1_500_000 },
      { concepto: "Caja y facturación", pesos: 1_000_000 },
      { concepto: "Aire acondicionado", pesos: 1_200_000 },
    ],
  },
  {
    codigo: "05",
    titulo: "Habilitaciones",
    nota: "Municipio, bromatología y bomberos, con planos firmados.",
    items: [
      { concepto: "Habilitación y bromatología", pesos: 1_000_000 },
      { concepto: "Bomberos y planos", pesos: 700_000 },
      { concepto: "Carnets de manipulación", pesos: 300_000 },
    ],
  },
  {
    codigo: "06",
    titulo: "Apertura",
    nota: "El café viene de un tostador proveedor. No hay tostadora en Jujuy.",
    items: [
      { concepto: "Primer stock de café", pesos: 1_000_000 },
      { concepto: "Leche, pastelería y descartables", pesos: 1_000_000 },
      { concepto: "Evento de apertura", pesos: 500_000 },
    ],
  },
  {
    codigo: "07",
    titulo: "Tres meses de operación",
    nota: "El costo fijo de los primeros tres meses, como si el local no vendiera nada.",
    items: [
      { concepto: "Alquiler con ajuste", pesos: 4_600_000 },
      { concepto: "Tres sueldos con cargas y aguinaldo", pesos: 16_700_000 },
      { concepto: "Luz, agua, gas e internet", pesos: 1_500_000 },
      { concepto: "Contador, seguro y software", pesos: 1_400_000 },
    ],
  },
  {
    codigo: "08",
    titulo: "Imprevistos",
    nota: "Sin local elegido, la obra es una estimación. Esto la cubre.",
    items: [{ concepto: "Reserva de obra y precios", pesos: 6_681_250 }],
  },
  {
    codigo: "09",
    titulo: "Costo del cobro",
    nota: "Lo que se queda en el camino entre tu aporte y la cuenta.",
    items: [
      { concepto: "Mercado Pago · 2,5% + IVA", pesos: 2_268_750 },
      { concepto: "Impuesto al cheque · 0,6%", pesos: 450_000 },
    ],
  },
];

export const totalRubro = (r: Rubro) =>
  r.items.reduce((s, i) => s + i.pesos, 0);

export const totalPresupuesto = () =>
  RUBROS.reduce((s, r) => s + totalRubro(r), 0);

export const rubro = (codigo: string) => {
  const r = RUBROS.find((x) => x.codigo === codigo);
  if (!r) throw new Error(`Rubro ${codigo} no existe`);
  return r;
};
