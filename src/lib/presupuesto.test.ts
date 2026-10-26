import { test, expect } from "vitest";
import { META_PESOS, RUBROS, totalPresupuesto } from "./presupuesto";

test("los rubros suman exactamente la meta", () => {
  expect(totalPresupuesto()).toBe(META_PESOS);
});

test("el costo del cobro es 2,5% + IVA y 0,6% sobre la meta bruta", () => {
  const cobro = RUBROS.find((r) => r.codigo === "09")!;
  expect(cobro.items[0].pesos).toBe(Math.round(META_PESOS * 0.025 * 1.21));
  expect(cobro.items[1].pesos).toBe(Math.round(META_PESOS * 0.006));
});
