/**
 * Identifier program. Alamat program Token dan Associated Token diambil dari paket resmi @solana-program/token di ata.ts
 * lewat import dinamis, agar paket besar itu tidak ikut dimuat di halaman yang tidak membutuhkannya.
 * Token-2022 berasal dari field `tokenProgram` pada Jupiter Tokens API (diambil 2026-11-04, lihat docs/DECISIONS.md).
 */
export const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type TokenProgramName = "token" | "token-2022";

/** USDC mainnet (program Token, 6 decimals), dari respons xStocks API `stablecoins[]`, 2026-11-04. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
