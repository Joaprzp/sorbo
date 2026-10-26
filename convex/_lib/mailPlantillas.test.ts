import { test, expect } from "vitest";
import { mailHtml, mailText } from "./mailPlantillas";
import type { RecompensaMail } from "./ports";

const BASE = "https://sorbolabs.com";
const r: RecompensaMail = { codigo: "JUJ-4F7K9X", qrId: "abc123", saldo: 3, estado: "reservado" };

test("la acreditación con recompensa lleva código, QR y link a los cafés", () => {
  const html = mailHtml("acreditacion", { montoCentavos: 2_500_000, recompensa: r }, BASE);
  expect(html).toContain("JUJ-4F7K9X");
  expect(html).toContain(`${BASE}/qr/abc123.gif`);
  expect(html).toContain(`${BASE}/canje/abc123`);
  expect(html).toContain("3 cafés");
  expect(mailText("acreditacion", { recompensa: r }, BASE)).toContain("Código: JUJ-4F7K9X");
});

test("sin email de recompensa el mail queda como antes", () => {
  const html = mailHtml("acreditacion", { montoCentavos: 500_000 }, BASE);
  expect(html).not.toContain("/qr/");
  expect(html).toContain(`${BASE}/jujuy`);
});

test("la devolución nunca manda código ni QR, aunque quede saldo", () => {
  for (const saldo of [0, 2]) {
    const data = { recompensa: { ...r, saldo } };
    const html = mailHtml("devolucion", data, BASE);
    expect(html).not.toContain("JUJ-4F7K9X");
    expect(html).not.toContain("/qr/");
    expect(mailText("devolucion", data, BASE)).not.toContain("JUJ-4F7K9X");
  }
  expect(mailHtml("devolucion", { recompensa: { ...r, saldo: 2 } }, BASE)).toContain("Te quedan 2 cafés");
});

test("apertura y vencimiento dicen las fechas", () => {
  const aperturaAt = Date.parse("2027-03-15T09:00:00-03:00");
  const venceAt = Date.parse("2027-09-15T09:00:00-03:00");
  const activa = { ...r, estado: "activo" as const, aperturaAt, venceAt };
  expect(mailText("apertura", { recompensa: activa }, BASE)).toContain(
    "Abrimos el 15/3/2027. Tenés 3 cafés hasta el 15/9/2027.",
  );
  expect(mailText("vence_pronto", { recompensa: activa }, BASE)).toContain("vencen el 15/9/2027");
});

test("con la meta cumplida el mail ya no dice que falta cumplirla", () => {
  const texto = mailText("acreditacion", { recompensa: { ...r, estado: "confirmado" } }, BASE);
  expect(texto).toContain("La meta ya se cumplió");
  expect(texto).not.toContain("cuando se cumpla la meta");
});
