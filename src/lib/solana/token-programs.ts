import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS, type TokenProgramName } from "./programs";

/** Hanya untuk skrip dan uji (memuat paket Solana secara statis). Aplikasi web memakai import dinamis di ata.ts. */
export { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS };

export function tokenProgramAddress(name: TokenProgramName): string {
  return name === "token-2022" ? TOKEN_2022_PROGRAM_ADDRESS : TOKEN_PROGRAM_ADDRESS;
}
