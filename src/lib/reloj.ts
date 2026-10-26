import { useEffect, useState } from "react";

// Reloj de la página: las consultas de Convex no se re-corren cuando pasa el
// tiempo, así que los vencimientos se calculan acá.
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
