import { META_PESOS } from "../src/lib/presupuesto";
import { ars } from "../src/lib/format";

// La SPA no corre en los bots de preview (WhatsApp, X, Slack): el worker
// reescribe el <head> de index.html para las rutas que tienen su propia pieza.
type Meta = { url: string; title: string; description: string; image: string };

const ORIGEN = "https://sorbolabs.com";
const OG_JUJUY = `${ORIGEN}/og-jujuy.jpg`;
const META = ars(META_PESOS * 100);

const POR_RUTA: Record<string, Meta> = {
  "/jujuy": {
    url: `${ORIGEN}/jujuy`,
    title: "Sorbo — El próximo Sorbo es en Jujuy",
    description: `Campaña para abrir Sorbo en Jujuy. Meta ${META}. Si tu aporte cumple 89 días y la meta no se cumplió, vuelve solo.`,
    image: OG_JUJUY,
  },
  "/jujuy/numeros": {
    url: `${ORIGEN}/jujuy/numeros`,
    title: "Sorbo — Qué cuesta abrir en Jujuy",
    description: `Nueve rubros, precios de octubre 2026. Cada peso de la meta de ${META}, a la vista.`,
    image: OG_JUJUY,
  },
};

export function metaDeRuta(pathname: string): Meta | null {
  return POR_RUTA[pathname.replace(/\/+$/, "") || "/"] ?? null;
}

export function conMeta(res: Response, meta: Meta): Response {
  const contenido = (valor: string) => ({
    element(el: Element) {
      el.setAttribute("content", valor);
    },
  });
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', contenido(meta.description))
    .on('meta[property="og:url"]', contenido(meta.url))
    .on('meta[property="og:title"]', contenido(meta.title))
    .on('meta[property="og:description"]', contenido(meta.description))
    .on('meta[property="og:image"]', contenido(meta.image))
    .transform(res);
}
