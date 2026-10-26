import { useEffect, useRef } from "react";
import type { AccionTurnstile } from "../../convex/_lib/turnstile";

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// En dev sin sitekey, la clave de prueba de Cloudflare (siempre pasa); el
// backend de dev la acepta solo con TURNSTILE_PERMITIR_PRUEBA=1.
const SITEKEY: string | undefined =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ||
  (import.meta.env.DEV ? "1x00000000000000000000AA" : undefined);

let cargando: Promise<TurnstileApi> | null = null;

function cargar(): Promise<TurnstileApi> {
  cargando ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("VERIFICACION_NO_DISPONIBLE")));
    s.onerror = () => {
      cargando = null;
      reject(new Error("VERIFICACION_NO_DISPONIBLE"));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

// Un widget por formulario, invisible salvo que Cloudflare pida interacción.
// `obtener` espera el token; `usado` lo descarta (sirve una sola vez).
export function useTurnstile(accion: AccionTurnstile) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const fallo = useRef(!SITEKEY);
  const esperando = useRef<{ ok: (t: string) => void; mal: (e: Error) => void }[]>([]);

  useEffect(() => {
    if (!SITEKEY) return;
    let vivo = true;
    const rechazar = () => {
      fallo.current = true;
      for (const w of esperando.current.splice(0)) w.mal(new Error("VERIFICACION_NO_DISPONIBLE"));
    };
    cargar()
      .then((ts) => {
        if (!vivo || !ref.current) return;
        id.current = ts.render(ref.current, {
          sitekey: SITEKEY,
          action: accion,
          appearance: "interaction-only",
          callback: (t: string) => {
            token.current = t;
            for (const w of esperando.current.splice(0)) w.ok(t);
          },
          "expired-callback": () => {
            token.current = null;
          },
        });
      })
      .catch(rechazar);
    return () => {
      vivo = false;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [accion]);

  const obtener = (): Promise<string> => {
    if (token.current) return Promise.resolve(token.current);
    if (fallo.current) return Promise.reject(new Error("VERIFICACION_NO_DISPONIBLE"));
    return new Promise((ok, mal) => {
      esperando.current.push({ ok, mal });
      setTimeout(() => mal(new Error("VERIFICACION_FALLIDA")), 60_000);
    });
  };

  const usado = () => {
    token.current = null;
    if (id.current) window.turnstile?.reset(id.current);
  };

  return { ref, obtener, usado };
}
