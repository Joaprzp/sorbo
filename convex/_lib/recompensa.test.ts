import { test, expect } from "vitest";
import {
  cafesPorTotal,
  codigoCorto,
  estadoRecompensa,
  normalizarEmail,
  vencimiento,
} from "./recompensa";

test("cafesPorTotal: $5.000 da 1, cada $10.000 más suma 1, tope 10", () => {
  const tabla: [number, number][] = [
    [0, 0],
    [499_999, 0], // $4.999,99
    [500_000, 1], // $5.000
    [1_000_000, 1], // $10.000: todavía 1
    [1_499_999, 1],
    [1_500_000, 2], // $15.000
    [4_500_000, 5], // $45.000
    [9_500_000, 10], // $95.000: el tope
    [50_000_000, 10], // $500.000: tope
  ];
  for (const [centavos, cafes] of tabla) expect(cafesPorTotal(centavos)).toBe(cafes);
});

test("normalizarEmail recorta y pasa a minúsculas", () => {
  expect(normalizarEmail("  Ana@Mail.COM ")).toBe("ana@mail.com");
});

test("codigoCorto: JUJ- + 6 caracteres sin ambiguos", () => {
  for (let i = 0; i < 200; i++) expect(codigoCorto()).toMatch(/^JUJ-[2-9A-HJKMNP-Z]{6}$/);
});

test("vencimiento: seis meses en fecha argentina, recortando fin de mes", () => {
  const art = (iso: string) => Date.parse(`${iso}T09:00:00-03:00`);
  expect(vencimiento(art("2027-03-15"))).toBe(art("2027-09-15"));
  expect(vencimiento(art("2027-08-31"))).toBe(art("2028-02-29")); // 2028 bisiesto
  expect(vencimiento(art("2027-12-01"))).toBe(art("2028-06-01"));
});

test("estadoRecompensa recorre reservado → confirmado → activo → vencido", () => {
  const apertura = Date.parse("2027-03-15T09:00:00-03:00");
  const base = { cafes: 3, aperturaAt: apertura };
  expect(estadoRecompensa({ ...base, cumplida: false, ahora: apertura })).toBe("reservado");
  expect(estadoRecompensa({ cafes: 3, cumplida: true, ahora: apertura })).toBe("confirmado");
  expect(estadoRecompensa({ ...base, cumplida: true, ahora: apertura - 1 })).toBe("confirmado");
  expect(estadoRecompensa({ ...base, cumplida: true, ahora: apertura })).toBe("activo");
  expect(estadoRecompensa({ ...base, cumplida: true, ahora: vencimiento(apertura) })).toBe("vencido");
  expect(estadoRecompensa({ ...base, cafes: 0, cumplida: true, ahora: apertura })).toBe("anulado");
});
