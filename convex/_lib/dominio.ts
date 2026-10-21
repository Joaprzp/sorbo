// Constantes del dominio de la campaña — una sola fuente.
export const CHAINS_SOPORTADAS = [
  "base",
  "polygon",
  "ethereum",
  "optimism",
  "bsc",
  "celo",
  "monad",
];
export const MIN_USD_CENTS = 500; // 5 USD — paridad con el latte
export const MIN_CONFIRMACIONES = 1;
// La wallet pudo tener historia anterior a la campaña: un depósito viejo no
// es un aporte nuevo. Ventana ~7 días de bloques por red — las contribuciones
// reales de esta campaña siempre caen adentro; el 2024, afuera.
export const ANTIGUEDAD_MAX_BLOQUES: Record<string, number> = {
  base: 300_000,       // ~2 s/bloque
  polygon: 300_000,    // ~2 s/bloque
  ethereum: 50_000,    // ~12 s/bloque
  optimism: 300_000,   // ~2 s/bloque
  bsc: 800_000,        // ~0.75 s/bloque post-Maxwell
  celo: 600_000,       // ~1 s/bloque post-L2
  monad: 1_500_000,    // ~0.4 s/bloque
};
// Techo para avisar una transfer rechazada: por encima es casi seguro un
// scam-token con decimales inflados, no plata real.
export const TECHO_AVISO_USD_CENTS = 50_000_000;
export const MIN_MP_CENTAVOS = 500_000; // $5.000 ARS
export const SUGERIDOS_CENTAVOS = [500_000, 1_000_000, 2_500_000];

// Contratos oficiales por red — un símbolo "USDC" trucho no cuenta.
// Ojo: los BEP-20 usan 18 decimales, no 6.
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
  ethereum: {
    USDC: { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
    USDT: { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  },
  optimism: {
    USDC: { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6 },
    USDT: { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6 },
    // USDT0: Tether omnichain (LayerZero OFT) — mismo dólar, otro contrato.
    USDT0: { address: "0x01bff41798a0bcf287b996046ca68b395dbc1071", decimals: 6 },
  },
  bsc: {
    USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
    USDT: { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
  },
  celo: {
    USDC: { address: "0xceba9300f2b948710d2653dd7b07f33a8b32118c", decimals: 6 },
    USDT: { address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", decimals: 6 },
  },
  monad: {
    USDC: { address: "0x754704bc059f8c67012fed69bc8a327a5aafb603", decimals: 6 },
    // En Monad el único Tether es el USDT0 omnichain.
    USDT0: { address: "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", decimals: 6 },
  },
};
