import { z } from "zod";
import { KEYS, readSession, writeSession } from "./storage";

/** Riwayat sesi: disimpan di sessionStorage saja (hilang saat tab ditutup). Bukti utama adalah tautan explorer. */
export const historyEntry = z.object({
  signature: z.string(),
  /** Entri lama tanpa field ini berasal dari Solana. */
  network: z.enum(["solana", "ethereum", "robinhood"]).optional(),
  at: z.number(),
  side: z.enum(["buy", "sell"]),
  symbol: z.string(),
  inAmount: z.string(),
  inSymbol: z.string(),
  outAmount: z.string(),
  outSymbol: z.string(),
});
export type HistoryEntry = z.infer<typeof historyEntry>;

export function loadHistory(): HistoryEntry[] {
  const raw = readSession(KEYS.history);
  if (!raw) return [];
  try {
    const parsed = z.array(historyEntry).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory().filter((e) => e.signature !== entry.signature)].slice(0, 20);
  writeSession(KEYS.history, JSON.stringify(next));
  return next;
}
