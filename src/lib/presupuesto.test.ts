import { test, expect } from "vitest";
import { META_PESOS, RUBROS, rubro, totalPresupuesto } from "./presupuesto";

test("los rubros suman exactamente la meta", () => {
  expect(totalPresupuesto()).toBe(META_PESOS);
});

test("el costo del cobro es 2,5% + IVA y 0,6% sobre la meta bruta", () => {
  const cobro = rubro("09");
  expect(cobro.items[0].pesos).toBe(Math.round(META_PESOS * 0.025 * 1.21));
  expect(cobro.items[1].pesos).toBe(Math.round(META_PESOS * 0.006));
});

test("los códigos de rubro son los que la pieza recorre", () => {
  const enPagina = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
  expect(RUBROS.map((r) => r.codigo).sort()).toEqual(enPagina);
});
