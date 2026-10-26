import { test, expect } from "vitest";
import { metaDeRuta } from "./meta";

test("las piezas de Jujuy tienen su preview; el resto queda con el de index.html", () => {
  expect(metaDeRuta("/jujuy")?.image).toBe("https://sorbolabs.com/og-jujuy.jpg");
  expect(metaDeRuta("/jujuy/")?.url).toBe("https://sorbolabs.com/jujuy");
  expect(metaDeRuta("/jujuy/numeros")?.title).toBe("Sorbo — Qué cuesta abrir en Jujuy");
  expect(metaDeRuta("/")).toBeNull();
  expect(metaDeRuta("/jujuy/aporte")).toBeNull();
});

test("la descripción toma la meta del presupuesto", () => {
  expect(metaDeRuta("/jujuy")?.description).toMatch(/75\.000\.000/);
});
