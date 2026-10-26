import { test, expect } from "vitest";
import { respuestaQr } from "./qr";

test("sirve un GIF para ids válidos y nada para el resto", async () => {
  const r = respuestaQr("/qr/AbC123_-AbC123_-AbC123.gif", "https://sorbolabs.com");
  expect(r?.headers.get("Content-Type")).toBe("image/gif");
  const bytes = new Uint8Array(await r!.arrayBuffer());
  expect(String.fromCharCode(...bytes.slice(0, 3))).toBe("GIF");
  expect(respuestaQr("/qr/corto.gif", "https://sorbolabs.com")).toBeNull();
  expect(respuestaQr("/qr/../../etc.gif", "https://sorbolabs.com")).toBeNull();
  expect(respuestaQr("/jujuy", "https://sorbolabs.com")).toBeNull();
});
