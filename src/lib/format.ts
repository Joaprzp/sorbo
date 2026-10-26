export const ars = (centavos: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(centavos / 100);

export const cafes = (n: number) => (n === 1 ? "1 café" : `${n} cafés`);

export const fechaAR = (ms: number) =>
  new Date(ms).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
