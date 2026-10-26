import { useEffect, useState } from "react";

// Sesión del staff en este dispositivo. localStorage puede no estar (modo
// privado, datos bloqueados): sin él, simplemente no hay sesión.
const TOKEN = "sorbo.staff.token";
const CLAVE = "sorbo.staff.clave";

function leer(k: string): string | undefined {
  try {
    return localStorage.getItem(k) ?? undefined;
  } catch {
    return undefined;
  }
}

function escribir(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // sin storage: la sesión dura lo que la pestaña
  }
}

export const tokenStaff = () => leer(TOKEN);
export const guardarTokenStaff = (t: string | null) => escribir(TOKEN, t);

// Identifica al dispositivo para el bloqueo por PIN; no es secreto.
export function claveDispositivo(): string {
  let c = leer(CLAVE);
  if (!c) {
    c = crypto.randomUUID();
    escribir(CLAVE, c);
  }
  return c;
}

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
