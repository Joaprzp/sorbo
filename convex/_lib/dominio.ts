// Constantes del dominio de la campaña — una sola fuente.
export const CHAINS_SOPORTADAS = ["base", "polygon"];
export const ASSETS_SOPORTADOS = ["USDC", "USDT"];
export const MIN_USD_CENTS = 500; // 5 USD — paridad con el latte
export const MIN_CONFIRMACIONES = 1;
export const MIN_MP_CENTAVOS = 500_000; // $5.000 ARS
export const SUGERIDOS_CENTAVOS = [500_000, 1_000_000, 2_500_000];

// Contratos oficiales por red — un símbolo "USDC" trucho no cuenta.
export const TOKEN_CONTRACTS: Record<
  string,
  Record<string, { address: string; decimals: number }>
> = {
  base: {
    USDC: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
    USDT: { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6 },
  },
  polygon: {
    USDC: { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },
    USDT: { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 },
  },
};
