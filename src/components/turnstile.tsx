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
  cargando ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("VERIFICACION_NO_DISPONIBLE")));
    s.onerror = () => reject(new Error("VERIFICACION_NO_DISPONIBLE"));
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    // Sin caché del fallo: el próximo formulario que se monte reintenta.
    cargando = null;
    throw e;
  });
  return cargando;
}

type Espera = { ok: (t: string) => void; mal: (e: Error) => void };

// Un widget por formulario, invisible salvo que Cloudflare pida interacción.
// `tokenTurnstile` espera el token; `descartarTurnstile` lo tira y reinicia el
// widget (cada token sirve una sola vez).
export function useTurnstile(accion: AccionTurnstile) {
  const turnstileRef = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const fallo = useRef(!SITEKEY);
  const esperando = useRef<Espera[]>([]);

  useEffect(() => {
    if (!SITEKEY) return;
    let vivo = true;
    fallo.current = false;
    const rechazar = (codigo: string) => {
      for (const w of esperando.current.splice(0)) w.mal(new Error(codigo));
    };
    // El script o el navegador no dan: no hay verificación posible.
    const caido = () => {
      fallo.current = true;
      rechazar("VERIFICACION_NO_DISPONIBLE");
    };
    cargar()
      .then((ts) => {
        if (!vivo || !turnstileRef.current) return;
        id.current = ts.render(turnstileRef.current, {
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
          // Desafío no superado: Cloudflare reintenta solo; quien espera, se entera.
          "error-callback": () => {
            token.current = null;
            rechazar("VERIFICACION_FALLIDA");
          },
          "timeout-callback": () => rechazar("VERIFICACION_FALLIDA"),
          "unsupported-callback": caido,
        });
      })
      .catch(caido);
    return () => {
      vivo = false;
      rechazar("VERIFICACION_NO_DISPONIBLE");
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
      token.current = null;
    };
  }, [accion]);

  const tokenTurnstile = (): Promise<string> => {
    if (token.current) return Promise.resolve(token.current);
    if (fallo.current) return Promise.reject(new Error("VERIFICACION_NO_DISPONIBLE"));
    return new Promise((ok, mal) => {
      const espera: Espera = {
        ok: (t) => {
          clearTimeout(reloj);
          ok(t);
        },
        mal: (e) => {
          clearTimeout(reloj);
          mal(e);
        },
      };
      // Red lenta o widget trabado: el botón no queda colgado para siempre.
      const reloj = setTimeout(() => {
        esperando.current = esperando.current.filter((w) => w !== espera);
        mal(new Error("VERIFICACION_NO_DISPONIBLE"));
      }, 30_000);
      esperando.current.push(espera);
    });
  };

  const descartarTurnstile = () => {
    token.current = null;
    if (id.current) window.turnstile?.reset(id.current);
  };

  return { turnstileRef, tokenTurnstile, descartarTurnstile };
}
