import { test, expect } from "vitest";
import { tokenValido } from "./turnstile";

const nuestros = new Set(["sorbolabs.com"]);

test("vale solo con éxito, la acción del formulario y un dominio nuestro", () => {
  const ok = { success: true, action: "contribuir_mp", hostname: "sorbolabs.com" };
  expect(tokenValido(ok, "contribuir_mp", nuestros, false)).toBe(true);
  expect(tokenValido({ ...ok, success: false }, "contribuir_mp", nuestros, false)).toBe(false);
  expect(tokenValido(ok, "lista_espera", nuestros, false)).toBe(false);
  expect(tokenValido({ ...ok, hostname: "otro.com" }, "contribuir_mp", nuestros, false)).toBe(false);
  expect(tokenValido({ success: true, action: "contribuir_mp" }, "contribuir_mp", nuestros, false)).toBe(false);
});

test("las claves de prueba de Cloudflare pasan solo donde se habilitaron", () => {
  const prueba = { success: true, hostname: "example.com", metadata: { result_with_testing_key: true } };
  expect(tokenValido(prueba, "aviso_cripto", nuestros, false)).toBe(false);
  expect(tokenValido(prueba, "aviso_cripto", nuestros, true)).toBe(true);
});
