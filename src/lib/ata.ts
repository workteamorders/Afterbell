import type { TokenProgramName } from "./solana/programs";
import { TOKEN_2022_PROGRAM_ADDRESS } from "./solana/programs";

/**
 * Menurunkan associated token account (ATA) untuk (pemilik, mint, program token).
 * Dipakai portofolio: semua ATA dibaca sekaligus lewat getMultipleAccounts, tanpa getTokenAccountsByOwner.
 * Paket Solana dimuat dengan import dinamis supaya tidak membebani halaman yang hanya membaca.
 */
export async function deriveAta(owner: string, mint: string, program: TokenProgramName): Promise<string> {
  const [{ findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS }, { address }] = await Promise.all([import("@solana-program/token"), import("@solana/kit")]);
  const [pda] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(program === "token-2022" ? TOKEN_2022_PROGRAM_ADDRESS : TOKEN_PROGRAM_ADDRESS),
  });
  return pda;
}
